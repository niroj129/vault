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
            s.redeem_min, s.cashout_min_x, s.cashout_max_x = 10, 3, 10
            s.cashout_min_basis = s.cashout_max_basis = "loaded"
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
            SiteSettings.objects.update(cashout_min_basis="deposit", cashout_max_basis="deposit", cashout_min_x=2, cashout_max_x=5)
        self.load(20, loaded=30)
        rule = self.rule()
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("40"), Decimal("100")))

    def test_minimum_and_maximum_can_use_different_bases(self):
        # paid $20, staff loaded $50 (a bonus)
        with use_tenant(self.a):
            SiteSettings.objects.update(cashout_min_basis="deposit", cashout_min_x=2,
                                        cashout_max_basis="loaded", cashout_max_x=3)
        self.load(20, loaded=50)
        rule = self.rule()
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("40"), Decimal("150")))
        self.assertEqual((rule["min_basis"], rule["max_basis"]), ("deposit", "loaded"))
        self.assertEqual((Decimal(rule["min_base"]), Decimal(rule["max_base"])), (Decimal("20"), Decimal("50")))
        with use_tenant(self.a):  # and the other way round
            SiteSettings.objects.update(cashout_min_basis="loaded", cashout_min_x=1,
                                        cashout_max_basis="deposit", cashout_max_x=5)
        rule = self.rule()
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("50"), Decimal("100")))

    def free_play(self, loaded=10, **promo):
        from content.models import Promo
        with use_tenant(self.a):
            Promo.objects.create(title="Free", code="FREE", free_credits=loaded, **promo)
        r = self.ann_c.post("/api/play/freeplay/", {"game": self.game.id, "code": "FREE"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.admin_c.post(f"/api/admin/deposits/{r.data['id']}/mark-loaded/", {}, format="json")
        self.assertEqual(r.data["load_status"], "loaded", r.data)

    def test_free_play_has_its_own_cash_out_rule(self):
        self.free_play(10)
        self.assertFalse(self.rule()["ok"])  # off by default: free play never unlocks a cash out
        with use_tenant(self.a):
            SiteSettings.objects.update(freeplay_cashout_enabled=True, freeplay_cashout_min_x=1, freeplay_cashout_max_x=3)
        rule = self.rule()
        self.assertTrue(rule["ok"] and rule["free_play"], rule)
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("10"), Decimal("30")))  # not the 3×–10× rule
        self.assertEqual(self.ask(31).status_code, 400)
        r = self.ask(30)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["rule"]["free_play"])

    def test_a_free_play_code_can_override_the_free_play_rule(self):
        with use_tenant(self.a):
            SiteSettings.objects.update(freeplay_cashout_enabled=True)
        self.free_play(10, freeplay_min_x=2, freeplay_max_x=5)
        rule = self.rule()
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("20"), Decimal("50")))

    def test_last_load_wins_between_free_play_and_a_paid_load(self):
        with use_tenant(self.a):
            SiteSettings.objects.update(freeplay_cashout_enabled=True)
        self.free_play(10)
        self.load(100)  # later, paid: the normal 3×–10× rule applies
        rule = self.rule()
        self.assertFalse(rule["free_play"])
        self.assertEqual((Decimal(rule["min"]), Decimal(rule["max"])), (Decimal("300"), Decimal("1000")))

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


@override_settings(GAMING_SYNC_LOADS=True)
@mock.patch("gaming.service.adapter_for", FakeAdapter)
class PromoTargetingTests(TestCase):
    """Promotions for chosen players only / hidden from some players, and automatic ones."""
    start = DepositFlowTests.start

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        DepositFlowTests.setUp(self)
        self.bob = make_user(self.a, "bob")
        self.bob_c = client_for(A, "bob")
        self.admin_c = client_for(A, "admin")

    def promo(self, players=(), **kw):
        from content.models import Promo
        with use_tenant(self.a):
            p = Promo.objects.create(**{"title": "T", "code": "VIP", "bonus_percent": 10, **kw})
            p.players.set(players)
        return p

    def deposit(self, client, **kw):
        body = {"game": self.game.id, "method": "chime", "amount": 50, "replace": True, **kw}
        with mock.patch("gaming.bytepayout.create_deposit") as cd:
            cd.side_effect = lambda m, a, pid, ref, ret: {
                "id": "bp1", "status": "pending", "provider": m, "amount": float(a),
                "fee_amount": 0, "reference": ref, "checkout_url": "https://pay.example/c",
                "expires_at": "2026-10-04T12:00:00.000Z"}
            return client.post("/api/play/deposits/", body, format="json")

    def test_only_listed_players_can_use_a_targeted_code(self):
        self.promo(players=[self.ann], audience="only")
        self.assertEqual(self.deposit(self.ann_c, promo_code="vip").status_code, 201)
        r = self.deposit(self.bob_c, promo_code="vip")
        self.assertEqual(r.status_code, 400)
        self.assertIn("isn't valid", r.data["detail"])  # doesn't reveal that the code exists

    def test_hidden_from_listed_players_but_open_to_everyone_else(self):
        self.promo(players=[self.ann], audience="except")
        self.assertEqual(self.deposit(self.ann_c, promo_code="vip").status_code, 400)
        self.assertEqual(self.deposit(self.bob_c, promo_code="vip").status_code, 201)

    def test_targeted_promos_are_invisible_to_everyone_but_their_players(self):
        self.promo(code="ALLP", audience="all")
        self.promo(code="ONLYANN", players=[self.ann], audience="only")
        self.promo(code="NOTANN", players=[self.ann], audience="except")
        codes = lambda r: sorted(p["code"] for p in r.data)  # noqa: E731
        self.assertEqual(codes(client_for(A).get("/api/promos/")), ["ALLP"])           # public
        self.assertEqual(codes(self.ann_c.get("/api/promos/")), ["ALLP"])
        self.assertEqual(codes(self.ann_c.get("/api/promos/mine/")), ["ALLP", "ONLYANN"])
        self.assertEqual(codes(self.bob_c.get("/api/promos/mine/")), ["ALLP", "NOTANN"])
        self.assertEqual(len(self.admin_c.get("/api/promos/").data), 3)                # staff see all
        self.assertEqual(client_for(A).get("/api/promos/mine/").status_code, 401)

    def test_automatic_promo_needs_no_code(self):
        self.promo(code="", auto_apply=True, bonus_percent=20, usage="recurring")
        r = self.deposit(self.ann_c)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Decimal(str(r.data["bonus_amount"])), Decimal("10.00"))
        self.assertEqual(r.data["promo_code"], "AUTO")
        prev = self.ann_c.post("/api/play/promo/check/", {"amount": 50}, format="json")
        self.assertTrue(prev.data["auto"])
        self.assertEqual(Decimal(str(prev.data["credits"])), Decimal("60.00"))

    def test_automatic_one_time_promo_is_used_up_and_targeting_applies(self):
        self.promo(code="", auto_apply=True, players=[self.ann], audience="only")
        self.assertEqual(Decimal(str(self.deposit(self.ann_c).data["bonus_amount"])), Decimal("5.00"))
        self.assertEqual(Decimal(str(self.deposit(self.ann_c).data["bonus_amount"])), Decimal("0"))  # once per player
        self.assertEqual(Decimal(str(self.deposit(self.bob_c).data["bonus_amount"])), Decimal("0"))  # not listed
        self.assertEqual(self.bob_c.post("/api/play/promo/check/", {"amount": 50}, format="json").data, {"valid": False})

    def test_best_automatic_promo_wins_and_a_typed_code_overrides(self):
        self.promo(code="", auto_apply=True, bonus_percent=10, usage="recurring")
        self.promo(code="", title="Big", auto_apply=True, bonus_percent=30, usage="recurring")
        self.promo(code="MINE", bonus_percent=5, usage="recurring")
        self.assertEqual(Decimal(str(self.deposit(self.ann_c).data["bonus_amount"])), Decimal("15.00"))
        self.assertEqual(Decimal(str(self.deposit(self.ann_c, promo_code="MINE").data["bonus_amount"])), Decimal("2.50"))

    def test_admin_picks_players_and_validation(self):
        p = self.promo(audience="only")
        r = self.admin_c.put(f"/api/promos/{p.id}/players/", {"user_ids": [self.ann.id, self.bob.id]}, format="json")
        self.assertEqual(sorted(u["username"] for u in r.data), ["ann", "bob"])
        self.assertEqual(self.admin_c.get(f"/api/promos/{p.id}/").data["player_count"], 2)
        self.assertEqual(self.ann_c.put(f"/api/promos/{p.id}/players/", {"user_ids": []}, format="json").status_code, 403)
        bad = self.admin_c.post("/api/promos/", {"title": "A", "auto_apply": True}, format="json")
        self.assertEqual(bad.status_code, 400)  # automatic but no bonus
        ok = self.admin_c.post("/api/promos/", {"title": "A", "auto_apply": True, "bonus_percent": 5}, format="json")
        self.assertEqual(ok.status_code, 201, ok.content)  # no code needed when automatic


@override_settings(GAMING_SYNC_LOADS=True)
@mock.patch("gaming.service.adapter_for", FakeAdapter)
class FreePlayAndPointsTests(TestCase):
    """Free play codes load a game with no payment; API-connected games get live points."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        DepositFlowTests.setUp(self)
        self.bob = make_user(self.a, "bob")
        self.bob_c = client_for(A, "bob")

    def code(self, **kw):
        from content.models import Promo
        with use_tenant(self.a):
            p = Promo.objects.create(**{"title": "Free", "code": "FREE10", "free_credits": 10, **kw})
        return p

    def redeem(self, client=None, code="free10", **kw):
        return (client or self.ann_c).post("/api/play/freeplay/", {"game": self.game.id, "code": code, **kw}, format="json")

    def test_free_play_loads_the_game_by_api_without_payment(self):
        self.code()
        with self.captureOnCommitCallbacks(execute=True):
            r = self.redeem()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.data["free_play"])
        self.assertEqual(Decimal(str(r.data["credit_amount"])), Decimal("10.00"))
        with use_tenant(self.a):
            d = Deposit.objects.get(reference=r.data["reference"])
            self.assertEqual((d.status, d.load_status, d.amount), ("approved", "loaded", Decimal("0")))
        loads = [c for c in FakeAdapter.calls if c[0] == "load"]
        self.assertEqual(len(loads), 1)
        self.assertEqual(loads[0][2], "10.00")
        with use_tenant(self.a):
            self.assertEqual(type(self.ann).objects.get(pk=self.ann.pk).loyalty_points, 0)  # no VIP points for free play

    def test_one_time_and_targeting_and_limits_apply(self):
        self.code(audience="only")
        self.assertEqual(self.redeem(self.bob_c).status_code, 400)  # not on the list
        with use_tenant(self.a):
            from content.models import Promo
            Promo.objects.get(code="FREE10").players.set([self.ann])
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.redeem().status_code, 201)
        again = self.redeem()
        self.assertEqual(again.status_code, 400)
        self.assertIn("already used", again.data["detail"])

    def test_non_free_codes_and_unknown_codes_are_refused(self):
        self.code(code="BONUS", free_credits=0, bonus_percent=10)
        self.assertEqual(self.redeem(code="BONUS").status_code, 400)
        self.assertEqual(self.redeem(code="nope").status_code, 400)
        # and a free play code can't be typed into a paid deposit
        r = self.ann_c.post("/api/play/promo/check/", {"code": "FREE10", "amount": 50}, format="json")
        self.code()
        r = self.ann_c.post("/api/play/promo/check/", {"code": "FREE10", "amount": 50}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("free play", r.data["detail"].lower())

    def test_game_without_an_api_goes_to_staff_to_load(self):
        self.code()
        with use_tenant(self.a):
            manual = Game.objects.create(name="Hand Game")
        r = self.ann_c.post("/api/play/freeplay/", {"game": manual.id, "code": "FREE10"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["load_status"], "manual")

    def test_free_play_alone_never_unlocks_a_cash_out(self):
        from . import cashout
        self.code()
        with self.captureOnCommitCallbacks(execute=True):
            self.redeem()
        with use_tenant(self.a):
            self.assertIsNone(cashout.last_load(self.ann, self.game))

    def test_points_are_pulled_from_the_connected_platform(self):
        class Bal(FakeAdapter):
            def agent_balance(self):
                return Result(True, "OK", balance="1,234.50")
        from . import service
        with use_tenant(self.a), mock.patch("gaming.service.adapter_for", Bal):
            self.assertEqual(service.sync_points(), 1)
            g = Game.objects.get(pk=self.game.pk)
            self.assertEqual(g.vendor_points, Decimal("1234.50"))
            self.assertIsNotNone(g.points_synced_at)
        c = client_for(A, "admin")
        with mock.patch("gaming.service.adapter_for", Bal):
            self.assertEqual(c.post("/api/admin/points/sync/").data, {"synced": 1})
        self.assertEqual(self.ann_c.post("/api/admin/points/sync/").status_code, 403)


class ProviderLinkTests(TestCase):
    """A new game-API connection links the game of the same name by itself."""

    def test_new_connection_links_the_matching_game_only(self):
        a = make_tenant("alpha", A, feature_payments=True)
        make_user(a, "admin", role="admin")
        with use_tenant(a):
            fk = Game.objects.create(name="Fire Kirin")
            other = Game.objects.create(name="Juwa")
            taken = GameProvider.objects.create(name="Old", kind="ashx", base_url="https://x", agent_name="a")
            tied = Game.objects.create(name="Game Vault", provider=taken)
        c = client_for(A, "admin")
        r = c.post("/api/game-providers/", {"name": "fire  KIRIN", "kind": "ashx", "base_url": "https://x", "agent_name": "a"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        c.post("/api/game-providers/", {"name": "Game Vault", "kind": "ashx", "base_url": "https://x", "agent_name": "a"}, format="json")
        with use_tenant(a):
            self.assertEqual(Game.objects.get(pk=fk.pk).provider.name, "fire  KIRIN")
            self.assertIsNone(Game.objects.get(pk=other.pk).provider)        # different name: untouched
            self.assertEqual(Game.objects.get(pk=tied.pk).provider_id, taken.id)  # already tied: untouched


class AshxReplyStyleTests(TestCase):
    """Fire Kirin documents {"code": 200, "agentKey"}; Orion Stars sends {"code": "200", "agentkey"}."""

    class Resp:
        status_code, text = 200, ""

        def __init__(self, body):
            self.body = body

        def json(self):
            return self.body

    def run_with(self, login_reply, call_reply):
        from django.core.cache import cache
        from .providers.ashx import AshxAdapter
        cache.clear()
        p = GameProvider.objects.create(name="X", kind="ashx", base_url="https://x.test:8033",
                                        agent_name="agent01", agent_password="pw")
        replies = iter([login_reply, call_reply])
        with mock.patch("gaming.providers.ashx.http", lambda *a, **k: self.Resp(next(replies))):
            ad = AshxAdapter(p)
            return ad.agent_balance(), ad.create_account("player01", "secret1")

    def test_documented_reply_style(self):
        bal, made = self.run_with({"code": 200, "agentKey": "k" * 32, "Balance": "376"}, {"code": 200})
        self.assertTrue(bal.ok and made.ok)
        self.assertEqual(str(bal.balance), "376")

    def test_orion_reply_style_string_code_and_lowercase_keys(self):
        bal, made = self.run_with({"code": "200", "agentkey": "k" * 32, "balance": "376"}, {"code": "200"})
        self.assertTrue(bal.ok and made.ok)
        self.assertEqual(str(bal.balance), "376")

    def test_a_refusal_shows_the_vendors_message(self):
        from .providers import ApiError
        with self.assertRaises(ApiError) as cm:
            self.run_with({"code": "201", "msg": "Login failed. Please check and try again."}, {})
        self.assertIn("Login failed", str(cm.exception))


class FastApiDocumentTests(TestCase):
    """FastApi (Ultra Thunder): agent login is signed without a secret; passwords reset by the agent."""

    class Resp:
        status_code, text = 200, ""

        def __init__(self, body):
            self.body = body

        def json(self):
            return self.body

    def provider(self):
        from django.core.cache import cache
        cache.clear()
        return GameProvider.objects.create(name="Ultra Thunder", kind="fastapi", base_url="https://api.test",
                                           agent_name="agent9", agent_password="Pass1234")

    def test_agent_login_is_signed_without_a_secret_and_balance_is_read(self):
        from .providers.fastapi import FastApiAdapter, sign as fsign, md5 as _m
        from cryptography.hazmat.primitives import padding
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        import base64
        key = md5(md5("pass1234")).encode()
        padder = padding.PKCS7(128).padder()
        enc = Cipher(algorithms.AES(key), modes.CBC(b"I" * 16)).encryptor()
        blob = base64.b64encode(b"I" * 16 + enc.update(padder.update(b"thesecret") + padder.finalize()) + enc.finalize()).decode()
        seen = []

        def fake(provider, method, url, data=None, **kw):
            seen.append((url, dict(data)))
            return self.Resp({"code": 200, "data": {"balance": 250.5, "appid": "app1", "appsecret_encrypted": blob}})
        with mock.patch("gaming.providers.fastapi.http", fake):
            res = FastApiAdapter(self.provider()).agent_balance()
        self.assertTrue(res.ok)
        self.assertEqual(str(res.balance), "250.5")
        url, sent = seen[0]
        self.assertTrue(url.endswith("/fast/agent/login"))
        self.assertEqual(sent["sign"], fsign({k: v for k, v in sent.items() if k != "sign"}, ""))  # no secret appended

    def test_login_falls_back_to_the_old_signature_only_when_rejected(self):
        from .providers.fastapi import FastApiAdapter
        calls = []

        def fake(provider, method, url, data=None, **kw):
            calls.append(dict(data))
            return self.Resp({"code": 4, "message": "bad sign"})
        with mock.patch("gaming.providers.fastapi.http", fake):
            with self.assertRaises(Exception):
                FastApiAdapter(self.provider()).agent_balance()
        self.assertEqual(len(calls), 2)  # one without the secret, one with the agent password

    def test_reset_password_uses_the_agent_reset_call(self):
        from .providers.fastapi import FastApiAdapter
        p = self.provider()
        p.app_id, p.secret_key = "app1", "s3cret"
        p.save()
        seen = []

        def fake(provider, method, url, data=None, **kw):
            seen.append((url, dict(data)))
            return self.Resp({"code": 200})
        with use_tenant(None) if False else mock.patch("gaming.providers.fastapi.http", fake):
            class L:  # a player login
                platform_user_id, username, password = "bob1", "bob1", "old"
            res = FastApiAdapter(p).reset_password(L, "NewPass1")
        self.assertTrue(res.ok)
        self.assertTrue(seen[0][0].endswith("/fast/user/resetPasswd"))
        self.assertEqual((seen[0][1]["account"], seen[0][1]["new_passwd"]), ("bob1", "NewPass1"))
        self.assertNotIn("passwd", seen[0][1])


class AgentConsoleApiTests(TestCase):
    """The agent console only ever sees and counts the agent's own players."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.a = make_tenant("alpha", A, feature_payments=True)
        self.agent = make_user(self.a, "agent1", role="agent")
        self.other = make_user(self.a, "agent2", role="agent")
        self.mine = make_user(self.a, "mine", agent=self.agent)
        self.theirs = make_user(self.a, "theirs", agent=self.other)
        self.admin = make_user(self.a, "admin", role="admin")
        with use_tenant(self.a):
            self.game = Game.objects.create(name="Juwa")
            for u in (self.mine, self.theirs):
                Redeem.objects.create(user=u, game=self.game, amount=50, payout_method="cashapp", payout_handle="$x")
                Deposit.objects.create(user=u, game=self.game, method="cash", gateway="manual", amount=20,
                                       credit_amount=20, status="approved", load_status="manual")
        self.c = client_for(A, "agent1")

    def test_summary_counts_only_my_players_and_work(self):
        r = self.c.get("/api/agent/summary/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data["players"], r.data["to_load"], r.data["cashouts_waiting"]), (1, 1, 1))
        full = client_for(A, "admin").get("/api/agent/summary/").data
        self.assertEqual((full["players"], full["to_load"], full["cashouts_waiting"]), (2, 2, 2))  # admin: the whole site

    def test_deposit_summary_cash_out_count_is_scoped_to_the_agent(self):
        r = self.c.get("/api/admin/deposits/")
        self.assertEqual(r.data["summary"]["redeems_waiting"], 1)

    def test_per_player_filters_and_no_peeking_at_other_agents_players(self):
        d = self.c.get(f"/api/admin/deposits/?user={self.mine.id}").data["results"]
        self.assertEqual([x["user"]["username"] for x in d], ["mine"])
        self.assertEqual(self.c.get(f"/api/admin/deposits/?user={self.theirs.id}").data["results"], [])
        self.assertEqual(self.c.get(f"/api/admin/redeems/?user={self.theirs.id}").data, [])
        self.assertEqual(len(self.c.get(f"/api/admin/redeems/?user={self.mine.id}").data), 1)

    def test_agent_creates_a_player_that_is_theirs(self):
        r = self.c.post("/api/users/", {"username": "newbie", "password": "pass12345", "role": "admin"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data["role"], r.data["agent"]), ("user", self.agent.id))


@override_settings(GAMING_SYNC_LOADS=True)
class PlatformConsoleTests(TestCase):
    """Admin platform console: look up any account on a platform, create, link, list."""

    class Ad(FakeAdapter):
        needs_platform_id = False

        def balance(self, login):
            if login.username == "ghost":
                return Result(False, "Account does not exist")
            return Result(True, "OK", balance="42.50", platform_user_id="77", play_url="https://play.test")

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        FakeAdapter.calls = []
        self.a = make_tenant("alpha", A, feature_payments=True)
        self.admin = make_user(self.a, "admin", role="admin")
        self.ann = make_user(self.a, "ann")
        self.agent = make_user(self.a, "agent1", role="agent")
        with use_tenant(self.a):
            self.p = GameProvider.objects.create(name="Orion Stars", kind="ashx", base_url="https://x", agent_name="a")
            self.manual = GameProvider.objects.create(name="Hand", kind="manual")
            self.game = Game.objects.create(name="Orion Stars", provider=self.p)
        self.c = client_for(A, "admin")
        patcher = mock.patch("gaming.service.adapter_for", self.Ad)
        patcher.start()
        self.addCleanup(patcher.stop)

    def url(self, tail):
        return f"/api/admin/platforms/{self.p.id}/{tail}/"

    def test_list_shows_connected_platforms_with_their_games(self):
        r = self.c.get("/api/admin/platforms/")
        self.assertEqual([x["name"] for x in r.data], ["Orion Stars"])  # manual ones aren't platforms
        self.assertEqual(r.data[0]["games"][0]["name"], "Orion Stars")

    def test_only_admins_can_use_it(self):
        self.assertEqual(client_for(A, "agent1").get("/api/admin/platforms/").status_code, 403)
        self.assertEqual(client_for(A, "ann").post(self.url("lookup"), {"username": "x"}, format="json").status_code, 403)

    def test_lookup_finds_an_unlinked_account_and_a_missing_one(self):
        r = self.c.post(self.url("lookup"), {"username": "someone"}, format="json")
        self.assertTrue(r.data["found"])
        self.assertEqual((str(r.data["balance"]), r.data["login"]), ("42.50", None))
        r = self.c.post(self.url("lookup"), {"username": "ghost"}, format="json")
        self.assertFalse(r.data["found"])
        self.assertEqual(self.c.post(self.url("lookup"), {"username": " "}, format="json").status_code, 400)

    def test_link_to_an_existing_player_then_lookup_shows_who_owns_it(self):
        r = self.c.post(self.url("link"), {"username": "someone", "user": self.ann.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["login"]["player"]["username"], "ann")
        again = self.c.post(self.url("lookup"), {"username": "SOMEONE"}, format="json")
        self.assertEqual(again.data["login"]["player"]["username"], "ann")
        self.assertEqual(self.c.post(self.url("link"), {"username": "someone", "user": self.ann.id}, format="json").status_code, 400)

    def test_link_can_make_a_new_site_player_and_refuses_unknown_accounts(self):
        r = self.c.post(self.url("link"), {"username": "newguy", "new_player": True}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["login"]["player"]["username"], "newguy")
        self.assertTrue(r.data["site_password"])
        self.assertEqual(self.c.post(self.url("link"), {"username": "ghost", "new_player": True}, format="json").status_code, 400)

    def test_create_account_on_the_platform_with_and_without_a_player(self):
        r = self.c.post(self.url("create"), {"username": "fresh01", "user": self.ann.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data["login"]["username"], bool(r.data["password"])), ("fresh01", True))
        self.assertIn(("create", "fresh01"), FakeAdapter.calls)
        r = self.c.post(self.url("create"), {"username": "loose01"}, format="json")
        self.assertEqual((r.status_code, r.data["login"]), (201, None))
        self.assertEqual(self.c.post(self.url("create"), {"username": "ab"}, format="json").status_code, 400)  # too short for the platform
        self.assertEqual(self.c.post(self.url("create"), {"username": "fresh02", "user": self.ann.id}, format="json").status_code, 400)  # ann already has one

    def test_accounts_list_and_search(self):
        self.c.post(self.url("link"), {"username": "someone", "user": self.ann.id}, format="json")
        rows = self.c.get(self.url("accounts")).data
        self.assertEqual([r["username"] for r in rows], ["someone"])
        self.assertEqual(self.c.get(self.url("accounts") + "?q=zzz").data, [])
        self.assertEqual(len(self.c.get(self.url("accounts") + "?q=ann").data), 1)


class SearchTests(TestCase):
    """Partial words match everything similar; several words all have to match."""

    def setUp(self):
        a = make_tenant("alpha", A, feature_payments=True)
        make_user(a, "admin", role="admin")
        self.ann = make_user(a, "maya_lopez", full_name="Maya Lopez")
        self.bob = make_user(a, "stan99", full_name="Stan Brown")
        make_user(a, "zed")
        with use_tenant(a):
            self.p = GameProvider.objects.create(name="Orion Stars", kind="ashx", base_url="https://x", agent_name="a")
            g = Game.objects.create(name="Orion Stars", provider=self.p)
            GameLogin.objects.create(user=self.ann, game=g, username="maya_lopez_o")
            GameLogin.objects.create(user=self.bob, game=g, username="stanley")
            Deposit.objects.create(user=self.ann, game=g, method="cash", gateway="manual", amount=5, credit_amount=5, status="approved")
        self.c = client_for(A, "admin")

    def names(self, q):
        return sorted(r["username"] for r in self.c.get(f"/api/admin/platforms/{self.p.id}/accounts/", {"q": q}).data)

    def test_a_single_letter_shows_everything_similar(self):
        self.assertEqual(self.names("l"), ["maya_lopez_o", "stanley"])  # both contain an "l"
        self.assertEqual(self.names("s"), ["stanley"])                  # only one has an "s"

    def test_partial_words_in_any_case_and_order(self):
        self.assertEqual(self.names("MAYA"), ["maya_lopez_o"])
        self.assertEqual(self.names("lop maya"), ["maya_lopez_o"])      # both words, any order
        self.assertEqual(self.names("maya_lo"), ["maya_lopez_o"])
        self.assertEqual(self.names("stan brown"), ["stanley"])         # matched on the player's name
        self.assertEqual(self.names("nothing"), [])
        self.assertEqual(len(self.names("")), 2)

    def test_deposit_search_is_forgiving_too(self):
        n = lambda q: len(self.c.get("/api/admin/deposits/", {"q": q}).data["results"])  # noqa: E731
        self.assertEqual((n("may"), n("lopez"), n("orion"), n("zzz")), (1, 1, 1, 0))


@override_settings(GAMING_SYNC_LOADS=True)
class PlatformHistoryTests(PlatformConsoleTests):
    """The per-account history: ledger, activity and totals."""

    def test_history_for_a_linked_account_shows_ledger_activity_and_totals(self):
        self.c.post(self.url("link"), {"username": "someone", "user": self.ann.id}, format="json")
        with use_tenant(self.a):
            login = GameLogin.objects.get(username="someone")
            from content.models import GameTxn
            GameTxn.objects.create(kind="load", user=self.ann, game=self.game, account_name="someone", amount=20, status="success", user_balance="20", operator="admin")
            GameTxn.objects.create(kind="withdraw", user=self.ann, game=self.game, account_name="someone", amount=5, status="success", user_balance="15", operator="admin")
            GameTxn.objects.create(kind="load", user=self.ann, game=self.game, account_name="someone", amount=9, status="failed")
            Deposit.objects.create(user=self.ann, game=self.game, method="cash", gateway="manual", amount=20, credit_amount=20, status="approved", load_status="loaded")
            Redeem.objects.create(user=self.ann, game=self.game, amount=5, payout_method="cashapp", payout_handle="$a", status="paid")
        r = self.c.get(self.url("history") + "?username=someone")
        self.assertTrue(r.data["linked"])
        self.assertEqual(len(r.data["transactions"]), 3)
        t = r.data["totals"]
        self.assertEqual((float(t["loaded"]), float(t["redeemed"]), float(t["paid"]), float(t["cashed_out"])), (20, 5, 20, 5))  # the failed load isn't counted
        self.assertEqual(sorted(a["type"] for a in r.data["activity"]), ["cashout", "load", "redeem"])  # the staff redeem shows up too

    def test_history_for_an_unlinked_account_is_empty_not_an_error(self):
        r = self.c.get(self.url("history") + "?username=nobody")
        self.assertEqual((r.status_code, r.data["linked"], r.data["transactions"]), (200, False, []))
        self.assertEqual(client_for(A, "agent1").get(self.url("history") + "?username=x").status_code, 403)
