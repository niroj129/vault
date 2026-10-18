import hashlib
import hmac
import json
import time
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase

from catalog.models import Game
from content.models import SiteSettings
from gaming.models import Deposit, PayMethod
from tenants.context import use_tenant
from tenants.tests import A, client_for, make_tenant, make_user

from . import parse
from .models import InboundEmail

GMAIL_ARC = ("ARC-Authentication-Results: i=1; mx.google.com;\n       dkim=pass header.i=@square.com header.s=s1;"
             "\n       spf=pass smtp.mailfrom=cash@square.com")


class ParseTests(TestCase):
    def test_reads_common_payment_emails(self):
        cases = [
            ("John Smith sent you $50", "", (Decimal("50"), "John Smith")),
            ("You received $40.00 from Ann Lee", "", (Decimal("40.00"), "Ann Lee")),
            ("Bob Ray paid you $25.00", "", (Decimal("25.00"), "Bob Ray")),
            ("You've got money", "Mary Jones sent you $1,250.00 USD", (Decimal("1250.00"), "Mary Jones")),
            ("Your account statement", "Nothing to see", None),
        ]
        for subject, text, want in cases:
            got = parse.read_payment(subject, text)
            self.assertEqual(got[:2] if got else None, want, subject)

    def test_note_and_app_and_sender_check(self):
        amt, name, note = parse.read_payment("John Smith sent you $50", 'For "K7Q2ZP juwa"')
        self.assertEqual(note, "K7Q2ZP juwa")
        self.assertEqual(parse.app_of("cash@square.com", "", ""), "cashapp")
        self.assertEqual(parse.app_of("alerts@chase.com", "You received money with Zelle", ""), "zelle")
        self.assertTrue(parse.verified_sender("cashapp", "cash@square.com", GMAIL_ARC))
        # a lookalike From with no DKIM pass for Square is not verified
        self.assertFalse(parse.verified_sender("cashapp", "cash@square.com.evil.io", GMAIL_ARC))
        self.assertFalse(parse.verified_sender("cashapp", "cash@square.com", "Authentication-Results: dkim=fail"))

    def test_gmail_confirmation(self):
        code, link = parse.gmail_confirmation(
            "forwarding-noreply@google.com", "(#183920471) Gmail Forwarding Confirmation - Receive Mail from me@gmail.com",
            "To allow forwarding, click https://mail-settings.google.com/mail/vf-abc123 Confirmation code: 183920471")
        self.assertEqual((code, link), ("183920471", "https://mail-settings.google.com/mail/vf-abc123"))


class InboundFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.t = make_tenant("alpha", A, feature_payments=True)
        make_user(self.t, "admin", role="admin")
        self.ann = make_user(self.t, "ann", full_name="Ann Lee")
        with use_tenant(self.t):
            s = SiteSettings.load(); s.inbound_mail_token = "tok-secret-123"; s.save()
            self.cash = PayMethod.objects.create(name="Cash App", handle="$Lucky", replaces="ecashapp")
            self.chime = PayMethod.objects.create(name="Chime", handle="$LuckyChime", replaces="chime")
            g = Game.objects.create(name="Juwa")
            self.d_cash = Deposit.objects.create(user=self.ann, game=g, method="cashapp", amount=50, gateway="direct",
                                                 pay_method=self.cash, status="pending")
            self.d_chime = Deposit.objects.create(user=self.ann, game=g, method="chime", amount=40, gateway="direct",
                                                  pay_method=self.chime, status="pending", player_note="Ann Lee")
        self.web = client_for(A)
        self.admin = client_for(A, "admin")

    def post_json(self, payload, token="tok-secret-123"):
        with self.captureOnCommitCallbacks(execute=True):
            return self.web.generic("POST", f"/api/mail/inbound/{token}/", json.dumps(payload), content_type="application/json")

    def test_postmark_cash_app_matched_by_code_and_shown_on_deposit(self):
        r = self.post_json({"FromFull": {"Email": "cash@square.com", "Name": "Cash App"}, "To": "x@inbound.postmarkapp.com",
                            "Subject": "John Smith sent you $50", "TextBody": f'For "{self.d_cash.code}"',
                            "MessageID": "pm-1", "Headers": [{"Name": "ARC-Authentication-Results", "Value": GMAIL_ARC.split(": ", 1)[1]}]})
        self.assertEqual(r.status_code, 200, r.content)
        with use_tenant(self.t):
            em = InboundEmail.objects.get()
        self.assertEqual((em.kind, em.app, em.amount, em.match, em.deposit_id, em.verified),
                         ("payment", "cashapp", Decimal("50"), "code", self.d_cash.id, True))
        # duplicate delivery is ignored
        self.assertTrue(self.post_json({"FromFull": {"Email": "cash@square.com"}, "Subject": "x", "TextBody": "", "MessageID": "pm-1"}).json()["duplicate"])
        deps = self.admin.get("/api/admin/deposits/?status=pending&gateway=direct").data["results"]
        cash = next(d for d in deps if d["id"] == self.d_cash.id)
        self.assertEqual(cash["emails"][0]["payer"], "John Smith")
        # still waiting for staff: an email never approves anything
        with use_tenant(self.t):
            self.d_cash.refresh_from_db()
        self.assertEqual(self.d_cash.status, "pending")

    def test_mailgun_chime_likely_match_by_amount_and_name(self):
        with self.captureOnCommitCallbacks(execute=True):
            r = self.web.post("/api/mail/inbound/tok-secret-123/", {
                "from": "Chime <alerts@chime.com>", "subject": "You received $40.00 from Ann Lee",
                "body-plain": "Ann Lee sent you money.", "Message-Id": "<mg-1@chime.com>"})
        self.assertEqual(r.status_code, 200, r.content)
        with use_tenant(self.t):
            em = InboundEmail.objects.get()
        self.assertEqual((em.app, em.match, em.deposit_id), ("chime", "likely", self.d_chime.id))

    def test_unmatched_then_linked_by_staff(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.web.post("/api/mail/inbound/tok-secret-123/", {"from": "Venmo <venmo@venmo.com>", "subject": "Bob Ray paid you $25.00",
                                                                "text": "", "headers": "Message-ID: <sg-1>", "envelope": "{}"})
        lst = self.admin.get("/api/admin/mail/?filter=unmatched").data
        self.assertEqual(lst["counts"]["unmatched"], 1)
        em = lst["results"][0]
        r = self.admin.post(f"/api/admin/mail/{em['id']}/link/", {"deposit": self.d_chime.id}, format="json")
        self.assertEqual((r.data["match"], r.data["deposit"]["username"]), ("linked", "ann"))
        self.assertEqual(self.admin.get("/api/admin/mail/?filter=unmatched").data["counts"]["unmatched"], 0)

    def test_gmail_confirmation_via_cloudmailin(self):
        self.post_json({"envelope": {"to": "x@cloudmailin.net"}, "headers": {
            "From": "Gmail Team <forwarding-noreply@google.com>",
            "Subject": "(#183920471) Gmail Forwarding Confirmation - Receive Mail from me@gmail.com"},
            "plain": "Confirmation code: 183920471 https://mail-settings.google.com/mail/vf-abc"})
        setup = self.admin.get("/api/admin/mail/setup/").data
        self.assertEqual(setup["gmail_confirm"]["code"], "183920471")
        self.assertIn("/api/mail/inbound/tok-secret-123/", setup["url"])

    def test_security(self):
        self.assertEqual(self.post_json({"TextBody": "x", "FromFull": {}}, token="wrong").status_code, 404)
        with use_tenant(self.t):
            SiteSettings.objects.update(mailgun_signing_key="mgkey")
        ts = str(int(time.time()))
        bad = {"timestamp": ts, "token": "t", "signature": "nope", "body-plain": "x", "from": "a@b.c"}
        self.assertEqual(self.web.post("/api/mail/inbound/tok-secret-123/", bad).status_code, 403)
        good = dict(bad, signature=hmac.new(b"mgkey", f"{ts}t".encode(), hashlib.sha256).hexdigest())
        self.assertEqual(self.web.post("/api/mail/inbound/tok-secret-123/", good).status_code, 200)
        player = client_for(A, "ann")
        self.assertEqual(player.get("/api/admin/mail/").status_code, 403)
        # the token can't be set through the settings form
        self.admin.put("/api/settings/", {"inbound_mail_token": "mine"}, format="json")
        with use_tenant(self.t):
            self.assertEqual(SiteSettings.load().inbound_mail_token, "tok-secret-123")
