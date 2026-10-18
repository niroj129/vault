import hashlib
import hmac
import json
from decimal import Decimal
from unittest import mock

from django.test import TestCase, override_settings

from catalog.models import Game, GameLogin
from content.models import GameTxn, SiteSettings
from tenants.context import use_tenant
from tenants.tests import A, B, client_for, make_tenant, make_user

from . import bytepayout
from .models import Deposit, GameProvider, Redeem
from .providers import Result
from .providers.base import make_account, md5
from .providers.fastapi import sign as fast_sign

SECRET_A, SECRET_B = "whsec-alpha", "whsec-beta"


class FakeAdapter:
    """Stands in for a real platform; records every call."""
    calls = []
    whole_amounts = False
    account_min, account_max = 6, 16
    fail_load = False

    def __init__(self, provider):
        self.p = provider

    def amount(self, v):
        return Decimal(str(v))

    def create_account(self, account, password):
        FakeAdapter.calls.append(("create", account))
        return Result(True, "OK", account=account, platform_user_id="9001")

    def recharge(self, login, amount, order_id):
        FakeAdapter.calls.append(("load", login.username, str(amount), order_id))
        if FakeAdapter.fail_load:
            return Result(False, "Agent balance too low")
        return Result(True, "OK", balance="50.00", txn_id="T1")

    def withdraw(self, login, amount, order_id):
        FakeAdapter.calls.append(("withdraw", login.username, str(amount)))
        return Result(True, "OK", balance="0", txn_id="T2")

    def balance(self, login):
        return Result(True, "OK", balance="12.50")


def signed(body, secret):
    raw = json.dumps(body).encode()
    return raw, hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


class SignatureTests(TestCase):
    def test_ashx_sign_matches_vendor_example(self):
        # FireKirin doc: md5(agent011595756537cb71…7649) = 1097bf94…68ab
        self.assertEqual(md5("agent01" + "1595756537" + "cb71121e4569433986bf401a347a7649"),
                         "1097bf94d4fa4a70641fc396ea1868ab")

    def test_fastapi_sign_sorts_and_appends_secret(self):
        p = {"timestamp": 2, "appid": "a", "sign": "x", "account": "bob"}
        self.assertEqual(fast_sign(p, "S"), md5("account=bob&appid=a&timestamp=2S"))

    def test_account_names_fit_platform_rules(self):
        for _ in range(50):
            n = make_account("Jay.Rivera!!", "rs", 6, 16)
            self.assertRegex(n, r"^[a-z][a-z0-9]{5,15}$")

    def test_bytepayout_amounts(self):
        self.assertTrue(bytepayout.allowed("chime", 50))
        self.assertFalse(bytepayout.allowed("chime", 19.99))
        self.assertTrue(bytepayout.allowed("ecashapp", "19.99"))


@override_settings(GAMING_SYNC_LOADS=True)
@mock.patch("gaming.service.adapter_for", FakeAdapter)
class DepositFlowTests(TestCase):
    def setUp(self):
        FakeAdapter.calls, FakeAdapter.fail_load = [], False
        self.a = make_tenant("alpha", A, feature_payments=True)
        self.b = make_tenant("beta", B, feature_payments=True)
        self.admin = make_user(self.a, "admin", role="admin")
        self.ann = make_user(self.a, "ann")
        for t, secret in ((self.a, SECRET_A), (self.b, SECRET_B)):
            with use_tenant(t):
                s = SiteSettings.load()
                s.bp_api_key, s.bp_webhook_secret = "bp_test", secret
                s.save()
        with use_tenant(self.a):
            self.prov = GameProvider.objects.create(name="FK", kind="ashx",
                                                    base_url="https://x", agent_name="a")
            self.game = Game.objects.create(name="Fire Kirin", provider=self.prov)
        self.ann_c = client_for(A, "ann")

    def start(self, **kw):
        body = {"game": self.game.id, "method": "chime", "amount": 50, **kw}
        with mock.patch("gaming.bytepayout.create_deposit") as cd:
            cd.side_effect = lambda m, a, pid, ref, ret: {
                "id": "bp1", "status": "pending", "provider": m, "amount": float(a),
                "fee_amount": 2.5, "reference": ref, "checkout_url": "https://pay.example/c",
                "expires_at": "2026-10-04T12:00:00.000Z"}
            return self.ann_c.post("/api/play/deposits/", body, format="json")

    def webhook(self, ref, status="approved", secret=SECRET_A, host=A):
        raw, sig = signed({"event": f"deposit.{status}", "data": {
            "id": "bp1", "status": status, "amount": 50, "fee_amount": 2.5,
            "reference": ref}}, secret)
        c = client_for(host)
        return c.generic("POST", "/api/pay/bytepayout/webhook/", raw,
                         content_type="application/json",
                         HTTP_X_BYTEPAYOUT_SIGNATURE=sig)

    def test_pay_then_auto_create_account_and_load_once(self):
        r = self.start()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["checkout_url"], "https://pay.example/c")
        ref = r.data["reference"]
        self.assertTrue(ref.startswith("alpha-"))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.webhook(ref).status_code, 200)
        with use_tenant(self.a):
            d = Deposit.objects.get(reference=ref)
            self.assertEqual((d.status, d.load_status), ("approved", "loaded"))
            login = GameLogin.objects.get(user=self.ann, game=self.game)
            self.assertTrue(login.created_via_api)
            self.assertEqual(GameTxn.objects.filter(kind="load", status="success").count(), 1)
        # the same webhook again (retries happen) must not load twice
        with self.captureOnCommitCallbacks(execute=True):
            self.webhook(ref)
        self.assertEqual(len([c for c in FakeAdapter.calls if c[0] == "load"]), 1)
        self.assertEqual([c[0] for c in FakeAdapter.calls], ["create", "load"])

    def test_bonus_percent_is_added(self):
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.load_bonus_percent = 10
            s.save()
        ref = self.start().data["reference"]
        with self.captureOnCommitCallbacks(execute=True):
            self.webhook(ref)
        load = [c for c in FakeAdapter.calls if c[0] == "load"][0]
        self.assertEqual(Decimal(load[2]), Decimal("55.00"))

    def test_webhook_signed_by_other_site_is_rejected(self):
        ref = self.start().data["reference"]
        self.assertEqual(self.webhook(ref, secret=SECRET_B).status_code, 401)
        with use_tenant(self.a):
            self.assertEqual(Deposit.objects.get(reference=ref).status, "pending")

    def test_wrong_amount_and_method_rejected(self):
        self.assertEqual(self.start(amount=19.99).status_code, 400)
        self.assertEqual(self.start(method="bitcoin").status_code, 400)

    def test_failed_load_goes_to_staff_and_retry_works(self):
        FakeAdapter.fail_load = True
        ref = self.start().data["reference"]
        with self.captureOnCommitCallbacks(execute=True):
            self.webhook(ref)
        with use_tenant(self.a):
            d = Deposit.objects.get(reference=ref)
        self.assertEqual(d.load_status, "failed")
        self.assertIn("Agent balance", d.load_error)
        FakeAdapter.fail_load = False
        admin = client_for(A, "admin")
        r = admin.post(f"/api/admin/deposits/{d.id}/retry/")
        self.assertEqual(r.data["load_status"], "loaded")
        self.assertEqual(self.ann_c.get(f"/api/play/deposits/{ref}/").data["load_status"], "loaded")
        self.assertEqual(self.ann_c.get("/api/admin/deposits/").status_code, 403)

    def test_staff_records_cash_payment_and_loads(self):
        admin = client_for(A, "admin")
        r = admin.post("/api/admin/deposits/", {"user": self.ann.id, "game": self.game.id,
                                                "amount": 25, "method": "cash"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data["status"], r.data["load_status"]), ("approved", "loaded"))

    def test_redeem_takes_credits_back_on_approval(self):
        with use_tenant(self.a):
            SiteSettings.objects.update(cashout_rule_enabled=False)  # rule covered by CashoutRuleTests
            GameLogin.objects.create(user=self.ann, game=self.game, username="annfk01")
        r = self.ann_c.post("/api/play/redeems/", {"game": self.game.id, "amount": 40,
                                                   "payout_method": "cashapp",
                                                   "payout_handle": "$ann"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        admin = client_for(A, "admin")
        r = admin.post(f"/api/admin/redeems/{r.data['id']}/approve/")
        self.assertEqual(r.data["status"], "approved")
        self.assertIn(("withdraw", "annfk01", "40.00"), FakeAdapter.calls)
        self.assertEqual(admin.post(f"/api/admin/redeems/{r.data['id']}/paid/").data["status"], "paid")

    def test_player_creates_own_game_account(self):
        r = self.ann_c.post("/api/play/accounts/", {"game": self.game.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        opts = self.ann_c.get("/api/play/options/").data
        self.assertTrue(opts["payments_on"])
        self.assertEqual(opts["games"][0]["login"]["username"], r.data["login"]["username"])

    def test_signup(self):
        c = client_for(A)
        r = c.post("/api/auth/signup/", {"username": "newbie", "password": "abc12345"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["user"]["role"], "user")
        self.assertEqual(c.post("/api/auth/signup/", {"username": "newbie", "password": "abc12345"},
                                format="json").status_code, 400)
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.allow_signup = False
            s.save()
        self.assertEqual(c.post("/api/auth/signup/", {"username": "other1", "password": "abc12345"},
                                format="json").status_code, 403)


@override_settings(GAMING_SYNC_LOADS=True)
class ManualFlowTests(DepositFlowTests.__bases__[0]):
    """No game API: staff load by hand; every step is posted in the
    player's support chat."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # rate limits must not carry over between tests
        self.a = make_tenant("alpha", A, feature_payments=True)
        self.admin = make_user(self.a, "admin", role="admin")
        self.ann = make_user(self.a, "ann")
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.bp_api_key, s.bp_webhook_secret = "bp_test", SECRET_A
            s.save()
            self.game = Game.objects.create(name="Juwa")
        self.ann_c = client_for(A, "ann")

    def chat(self):
        from chat.models import ChatMessage
        with use_tenant(self.a):
            return list(ChatMessage.objects.filter(conversation__subject=self.ann)
                        .values_list("body", flat=True))

    def test_pay_then_staff_load_with_chat_messages(self):
        opts = self.ann_c.get("/api/play/options/").data
        self.assertEqual([g["name"] for g in opts["games"]], ["Juwa"])  # manual games listed
        with mock.patch("gaming.bytepayout.create_deposit") as cd:
            cd.side_effect = lambda m, a, pid, ref, ret: {"id": "x", "status": "pending",
                                                          "reference": ref, "checkout_url": "https://p/c"}
            r = self.ann_c.post("/api/play/deposits/", {"game": self.game.id, "method": "chime",
                                                        "amount": 50, "game_username": "ann_juwa7"},
                                format="json")
        ref = r.data["reference"]
        raw, sig = signed({"event": "deposit.approved", "data": {"status": "approved", "reference": ref}}, SECRET_A)
        with self.captureOnCommitCallbacks(execute=True):
            client_for(A).generic("POST", "/api/pay/bytepayout/webhook/", raw,
                                  content_type="application/json", HTTP_X_BYTEPAYOUT_SIGNATURE=sig)
        with use_tenant(self.a):
            d = Deposit.objects.get(reference=ref)
        self.assertEqual((d.status, d.load_status), ("approved", "manual"))
        self.assertTrue(any("Payment received" in b or "ann_juwa7" in b for b in self.chat()))
        admin = client_for(A, "admin")
        with self.captureOnCommitCallbacks(execute=True):
            r = admin.post(f"/api/admin/deposits/{d.id}/mark-loaded/")
        self.assertEqual(r.data["load_status"], "loaded")
        with use_tenant(self.a):
            self.assertEqual(GameTxn.objects.filter(kind="load", account_name="ann_juwa7").count(), 1)
        self.assertTrue(any("in credits is on Juwa" in b for b in self.chat()))
        # player sees the Cashier messages as unread
        self.assertGreaterEqual(self.ann_c.get("/api/messenger/unread/").data["unread"], 2)


def tiny_png(name="proof.png"):
    import io
    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (120, 90, 255)).save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class DirectPayTests(ManualFlowTests):
    """Paying the site's own Chime QR: player taps "I've paid" with a
    screenshot, staff check and approve (or decline)."""

    def setUp(self):
        super().setUp()
        from .models import PayMethod
        with use_tenant(self.a):
            self.chime = PayMethod.objects.create(name="Chime", handle="$LuckyChime", replaces="chime",
                                                  min_amount=5, max_amount=300)

    def pay(self, **extra):
        data = {"pay_method": self.chime.id, "game": self.game.id, "amount": "40",
                "game_username": "ann_juwa7", "proof": tiny_png()}
        data.update(extra)
        with self.captureOnCommitCallbacks(execute=True):
            return self.ann_c.post("/api/play/deposits/", data, format="multipart")

    def test_options_list_direct_and_hide_gateway_chime(self):
        opts = self.ann_c.get("/api/play/options/").data
        self.assertTrue(opts["payments_on"])
        self.assertEqual(opts["direct_methods"][0]["handle"], "$LuckyChime")
        self.assertNotIn("chime", [m["key"] for m in opts["methods"]])

    def test_pay_then_staff_load_with_chat_messages(self):
        self.skipTest("Chime is this site's own QR here; the BytePayout flow is covered in ManualFlowTests")

    def test_qr_replaces_only_the_app_it_names(self):
        from .models import PayMethod
        keys = lambda: [m["key"] for m in self.ann_c.get("/api/play/options/").data["methods"]]
        with use_tenant(self.a):
            s = SiteSettings.load(); s.bp_methods = "ecashapp,chime,venmo"; s.save()
            cash = PayMethod.objects.create(name="Cash App QR", handle="$Lucky", replaces="ecashapp")
            PayMethod.objects.create(name="Zelle", handle="pay@lucky.test")  # extra, replaces nothing
        self.assertEqual(keys(), ["venmo"])  # Chime and Cash App go to your QRs
        r = self.ann_c.post("/api/play/deposits/", {"game": self.game.id, "method": "ecashapp", "amount": "19.99"}, format="json")
        self.assertEqual(r.status_code, 400)
        with use_tenant(self.a):
            cash.is_active = False; cash.save()
        self.assertEqual(keys(), ["ecashapp", "venmo"])  # QR off: BytePayout takes Cash App again

    def test_screenshot_required(self):
        r = self.pay(proof="")
        self.assertEqual(r.status_code, 400)
        self.assertIn("screenshot", r.data["detail"])

    def test_amount_limits(self):
        self.assertEqual(self.pay(amount="900").status_code, 400)

    def test_paid_check_approve_and_load(self):
        r = self.pay()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["status"], r.data["status_label"]), ("pending", "Checking payment"))
        self.assertTrue(r.data["proof"])
        self.assertTrue(any("checking it now" in b for b in self.chat()))
        admin = client_for(A, "admin")
        listing = admin.get("/api/admin/deposits/?gateway=direct&status=pending").data
        self.assertEqual(listing["summary"]["to_check"], 1)
        dep_id = listing["results"][0]["id"]
        with self.captureOnCommitCallbacks(execute=True):
            r = admin.post(f"/api/admin/deposits/{dep_id}/approve/", {"loaded": True}, format="json")
        self.assertEqual((r.data["status"], r.data["load_status"]), ("approved", "loaded"))
        self.assertEqual(r.data["checked_by"], "admin")
        self.assertTrue(any("in credits is on Juwa" in b for b in self.chat()))

    def test_decline_tells_player(self):
        r = self.pay()
        admin = client_for(A, "admin")
        with self.captureOnCommitCallbacks(execute=True):
            r = admin.post(f"/api/admin/deposits/{r.data['id']}/reject/",
                           {"note": "No $40 from Ann in Chime."}, format="json")
        self.assertEqual((r.data["status"], r.data["load_status"]), ("rejected", "skipped"))
        self.assertTrue(any("couldn't confirm" in b and "No $40" in b for b in self.chat()))

    def test_admin_manages_methods(self):
        admin = client_for(A, "admin")
        r = admin.post("/api/pay-methods/", {"name": "Cash App", "handle": "$lucky",
                                             "qr": tiny_png("qr.png"), "min_amount": 5,
                                             "max_amount": 200}, format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["qr"])
        self.assertEqual(self.ann_c.post("/api/pay-methods/", {"name": "x"}).status_code, 403)


class PayoutReceiptTests(ManualFlowTests):
    def test_paid_with_receipt_posts_image_in_chat(self):
        from catalog.models import GameLogin
        from chat.models import ChatMessage
        with use_tenant(self.a):
            s = SiteSettings.load(); s.redeem_enabled = True; s.redeem_min = 10; s.cashout_rule_enabled = False; s.save()
            GameLogin.objects.create(user=self.ann, game=self.game, username="ann_juwa7")
        r = self.ann_c.post("/api/play/redeems/", {"game": self.game.id, "amount": 30,
                                                   "payout_method": "Chime", "payout_handle": "$ann"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        admin = client_for(A, "admin")
        admin.post(f"/api/admin/redeems/{r.data['id']}/approve/")
        r = admin.post(f"/api/admin/redeems/{r.data['id']}/paid/", {"proof": tiny_png("sent.png")}, format="multipart")
        self.assertEqual(r.data["status"], "paid")
        self.assertTrue(r.data["proof"])
        with use_tenant(self.a):
            m = ChatMessage.objects.filter(conversation__subject=self.ann, body__contains="receipt").first()
        self.assertTrue(m and m.image)


class CashoutRuleTests(ManualFlowTests):
    """Cash out must be min×–max× the player's last load on that game; one cash out per load."""

    def setUp(self):
        super().setUp()
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.redeem_min, s.cashout_min_x, s.cashout_max_x, s.cashout_basis = 10, 3, 10, "loaded"
            s.save()
            GameLogin.objects.create(user=self.ann, game=self.game, username="ann_juwa7")
        self.admin_c = client_for(A, "admin")

    def load(self, paid, loaded=None):
        """Staff record a $paid cash payment, then mark it loaded with `loaded` credits."""
        r = self.admin_c.post("/api/admin/deposits/", {"user": self.ann.id, "game": self.game.id,
                                                      "amount": paid, "method": "cash"}, format="multipart")
        self.assertEqual(r.status_code, 201, r.data)
        body = {"loaded_amount": loaded} if loaded is not None else {}
        with self.captureOnCommitCallbacks(execute=True):
            r = self.admin_c.post(f"/api/admin/deposits/{r.data['id']}/mark-loaded/", body, format="json")
        self.assertEqual(r.data["load_status"], "loaded", r.data)
        return r.data

    def ask(self, amount):
        return self.ann_c.post("/api/play/redeems/", {"game": self.game.id, "amount": amount,
                                                      "payout_method": "cashapp", "payout_handle": "$ann"},
                               format="json")

    def rule(self):
        return self.ann_c.get("/api/play/options/").data["games"][0]["cashout"]

    def test_no_load_no_cash_out(self):
        self.assertFalse(self.rule()["ok"])
        r = self.ask(50)
        self.assertEqual(r.status_code, 400)
        self.assertIn("Load Juwa first", r.data["detail"])

    def test_staff_enter_loaded_amount_and_range_uses_it(self):
        d = self.load(20, loaded=25)
        self.assertEqual(Decimal(d["loaded_amount"]), Decimal("25"))
        with use_tenant(self.a):
            self.assertEqual(GameTxn.objects.get(kind="load").amount, Decimal("25"))
        rule = self.rule()
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("75"), Decimal("250")))
        self.assertEqual(self.ask(74).status_code, 400)
        self.assertEqual(self.ask(251).status_code, 400)
        r = self.ask(250)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["rule"]["within"])
        # the load is used: a second cash out needs a new load
        r = self.ask(100)
        self.assertEqual(r.status_code, 400)
        self.assertIn("Load again", r.data["detail"])

    def test_basis_money_paid_and_admin_multipliers(self):
        with use_tenant(self.a):
            SiteSettings.objects.update(cashout_basis="deposit", cashout_min_x=2, cashout_max_x=5)
        self.load(20, loaded=30)
        rule = self.rule()
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("40"), Decimal("100")))

    def test_declined_cash_out_frees_the_load(self):
        self.load(10)
        r = self.ask(50)
        self.assertEqual(r.status_code, 201, r.data)
        self.admin_c.post(f"/api/admin/redeems/{r.data['id']}/reject/", {"note": "try a smaller amount"}, format="json")
        self.assertEqual(self.ask(40).status_code, 201)

    def test_loads_earn_vip_points_and_count_as_played(self):
        from chat.messenger import has_played
        self.assertFalse(has_played(self.ann))
        self.load(100, loaded=125)  # 1 point per $10 of credits loaded
        with use_tenant(self.a):
            self.ann.refresh_from_db()
            self.assertEqual(self.ann.loyalty_points, 12)
        self.assertTrue(has_played(self.ann))

    def test_cash_out_screenshot_modes(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.load(100)
        data = {"game": self.game.id, "amount": "300", "payout_method": "cashapp", "payout_handle": "$ann"}
        def ask(**extra):
            return self.ann_c.post("/api/play/redeems/", dict(data, **extra), format="multipart")
        with use_tenant(self.a):
            SiteSettings.objects.update(redeem_proof="required")
        self.assertEqual(self.ann_c.get("/api/play/options/").data["redeem"]["proof"], "required")
        r = ask()
        self.assertEqual((r.status_code, r.data["detail"]), (400, "Attach a screenshot of your game balance."))
        bad = ask(proof=SimpleUploadedFile("x.png", b"not an image", content_type="image/png"))
        self.assertEqual(bad.status_code, 400)
        r = ask(proof=tiny_png("balance.png"))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["player_proof"])
        staff = self.admin_c.get("/api/admin/redeems/").data[0]
        self.assertTrue(staff["player_proof"])
        self.assertIsNone(staff["proof"])  # the staff receipt is a separate field
        # optional: works without; off: a file is ignored
        self.admin_c.post(f"/api/admin/redeems/{r.data['id']}/reject/", {"note": "again"}, format="json")
        with use_tenant(self.a):
            SiteSettings.objects.update(redeem_proof="optional")
        r = ask()
        self.assertEqual((r.status_code, r.data["player_proof"]), (201, None))
        self.admin_c.post(f"/api/admin/redeems/{r.data['id']}/reject/", {"note": "again"}, format="json")
        with use_tenant(self.a):
            SiteSettings.objects.update(redeem_proof="off")
        r = ask(proof=tiny_png("ignored.png"))
        self.assertEqual((r.status_code, r.data["player_proof"]), (201, None))

    def test_staff_can_upload_a_cash_out_screenshot_at_any_stage(self):
        from chat.models import ChatMessage
        self.load(100)
        r = self.ask(300)
        rid = r.data["id"]
        # before it's paid: saved on the cash out, player not messaged yet
        up = self.admin_c.post(f"/api/admin/redeems/{rid}/proof/", {"proof": tiny_png("redeemed.png")}, format="multipart")
        self.assertEqual(up.status_code, 200, up.data)
        self.assertTrue(up.data["proof"])
        with use_tenant(self.a):
            self.assertFalse(ChatMessage.objects.filter(conversation__subject=self.ann, image__gt="").exists())
        self.admin_c.post(f"/api/admin/redeems/{rid}/approve/")
        paid = self.admin_c.post(f"/api/admin/redeems/{rid}/paid/", {}, format="multipart")  # no new file: keeps the saved one
        self.assertEqual((paid.data["status"], bool(paid.data["proof"])), ("paid", True))
        with use_tenant(self.a):
            self.assertEqual(ChatMessage.objects.filter(conversation__subject=self.ann, image__gt="").count(), 1)
        # after it's paid: replacing it tells the player again
        again = self.admin_c.post(f"/api/admin/redeems/{rid}/proof/", {"proof": tiny_png("receipt2.png")}, format="multipart")
        self.assertEqual(again.status_code, 200)
        with use_tenant(self.a):
            self.assertEqual(ChatMessage.objects.filter(conversation__subject=self.ann, image__gt="").count(), 2)
            self.assertTrue(ChatMessage.objects.filter(conversation__subject=self.ann, body__contains="receipt for your").exists())
        # needs a real image; players can't use it
        self.assertEqual(self.admin_c.post(f"/api/admin/redeems/{rid}/proof/", {}, format="multipart").status_code, 400)
        from django.core.files.uploadedfile import SimpleUploadedFile
        junk = self.admin_c.post(f"/api/admin/redeems/{rid}/proof/", {"proof": SimpleUploadedFile("x.png", b"nope", content_type="image/png")}, format="multipart")
        self.assertEqual(junk.status_code, 400)
        self.assertEqual(self.ann_c.post(f"/api/admin/redeems/{rid}/proof/", {"proof": tiny_png()}, format="multipart").status_code, 403)

    def test_site_minimum_still_applies(self):
        with use_tenant(self.a):
            SiteSettings.objects.update(redeem_min=50)
        self.load(5)  # 3× = $15, but the site minimum is $50
        rule = self.rule()
        self.assertEqual(Decimal(rule["min"]), Decimal("50"))
        self.assertEqual(self.ask(30).status_code, 400)

    def test_rule_off_allows_any_amount(self):
        with use_tenant(self.a):
            SiteSettings.objects.update(cashout_rule_enabled=False)
        self.assertEqual(self.ask(500).status_code, 201)

    def test_admin_cannot_set_max_below_min(self):
        r = self.admin_c.put("/api/settings/", {"cashout_min_x": "5", "cashout_max_x": "4"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("cashout_max_x", r.data)


@override_settings(GAMING_SYNC_LOADS=True)
@mock.patch("gaming.service.adapter_for", FakeAdapter)
class PromoCodeTests(TestCase):
    """Promo codes entered while loading: bonus maths, one-time vs recurring, limits."""
    start = DepositFlowTests.start
    webhook = DepositFlowTests.webhook

    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # the payment throttle counts per minute across tests
        DepositFlowTests.setUp(self)

    def promo(self, tenant=None, **kw):
        from content.models import Promo
        with use_tenant(tenant or self.a):
            return Promo.objects.create(**{"title": "Boost", "code": "BOOST", "bonus_percent": 20, **kw})

    def test_bonus_is_percent_plus_flat_and_loads_with_the_payment(self):
        self.promo(bonus_flat=5)
        r = self.start(promo_code="boost")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["promo_code"], "BOOST")
        self.assertEqual(Decimal(str(r.data["bonus_amount"])), Decimal("15.00"))  # 20% of 50 + 5
        self.assertEqual(Decimal(str(r.data["credit_amount"])), Decimal("65.00"))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.webhook(r.data["reference"]).status_code, 200)
        dep = Deposit.all_tenants.get(reference=r.data["reference"])
        self.assertEqual(dep.credit_amount, Decimal("65.00"))
        loads = [c for c in FakeAdapter.calls if c[0] == "load"]
        self.assertEqual(loads[0][2], "65.00")

    def test_max_bonus_caps_it(self):
        self.promo(bonus_percent=100, max_bonus=10)
        r = self.start(promo_code="BOOST")
        self.assertEqual(Decimal(str(r.data["bonus_amount"])), Decimal("10.00"))

    def test_one_time_code_cannot_be_used_twice(self):
        self.promo()
        self.assertEqual(self.start(promo_code="BOOST").status_code, 201)
        again = self.start(promo_code="BOOST", replace=True)
        self.assertEqual(again.status_code, 400)
        self.assertIn("already used", again.data["detail"])

    def test_recurring_code_works_every_time(self):
        self.promo(usage="recurring")
        self.assertEqual(self.start(promo_code="BOOST").status_code, 201)
        self.assertEqual(self.start(promo_code="BOOST", replace=True).status_code, 201)

    def test_unpaid_deposit_that_expires_frees_a_one_time_code(self):
        self.promo()
        r = self.start(promo_code="BOOST")
        self.webhook(r.data["reference"], status="expired")
        self.assertEqual(self.start(promo_code="BOOST", replace=True).status_code, 201)

    def test_bad_codes_are_refused_and_create_nothing(self):
        from datetime import date, timedelta
        self.promo(code="OLD", expires=date.today() - timedelta(days=1))
        self.promo(code="SOON", starts=date.today() + timedelta(days=2))
        self.promo(code="BIG", min_deposit=100)
        self.promo(code="OFF", active=False)
        self.promo(code="SHOW", bonus_percent=0)  # display-only offer
        self.promo(tenant=self.b, code="THEIRS")
        for code in ("OLD", "SOON", "BIG", "OFF", "SHOW", "THEIRS", "NOPE"):
            r = self.start(promo_code=code)
            self.assertEqual(r.status_code, 400, (code, r.content))
        self.assertEqual(Deposit.all_tenants.count(), 0)

    def test_total_use_limit(self):
        self.promo(code="TEN", usage="recurring", max_uses=1)
        self.assertEqual(self.start(promo_code="TEN").status_code, 201)
        r = self.start(promo_code="TEN", replace=True)
        self.assertEqual(r.status_code, 400)
        self.assertIn("fully claimed", r.data["detail"])

    def test_check_previews_without_saving(self):
        self.promo(bonus_flat=5)
        r = self.ann_c.post("/api/play/promo/check/", {"code": "boost", "amount": 50}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Decimal(str(r.data["bonus"])), Decimal("15.00"))
        self.assertEqual(Decimal(str(r.data["credits"])), Decimal("65.00"))
        self.assertEqual(Deposit.all_tenants.count(), 0)
        bad = self.ann_c.post("/api/play/promo/check/", {"code": "zzz", "amount": 50}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_staff_can_add_a_code_when_recording_a_payment(self):
        self.promo(code="CASH", bonus_percent=10)
        c = client_for(A, "admin")
        r = c.post("/api/admin/deposits/", {"user": self.ann.id, "game": self.game.id, "amount": 100,
                                            "promo_code": "cash"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Decimal(str(r.data["credit_amount"])), Decimal("110.00"))

    def test_admin_code_must_be_unique_and_have_a_code_if_it_gives_a_bonus(self):
        self.promo()
        c = client_for(A, "admin")
        dup = c.post("/api/promos/", {"title": "Dup", "code": "boost", "bonus_percent": 5}, format="json")
        self.assertEqual(dup.status_code, 400)
        nocode = c.post("/api/promos/", {"title": "X", "bonus_percent": 5}, format="json")
        self.assertEqual(nocode.status_code, 400)
        ok = c.post("/api/promos/", {"title": "New", "code": "new 10", "bonus_percent": 10}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(ok.data["code"], "NEW10")
