import base64
import hashlib
import hmac
import json

from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from chat.models import ChatMessage, Conversation
from content.models import SiteSettings
from .context import use_tenant
from .models import Domain, Tenant

A, B = "alpha.test", "beta.test"


def make_tenant(slug, host, **kw):
    t = Tenant.objects.create(name=slug.title(), slug=slug, **kw)
    Domain.objects.create(tenant=t, host=host)
    return t


def make_user(tenant, username, role="user", password="pass1234", **kw):
    with use_tenant(tenant):
        u = User(username=username, role=role, **kw)
        u.set_password(password)
        u.save()
    return u


def client_for(host, username=None, password="pass1234"):
    c = APIClient(HTTP_HOST=host)
    if username:
        r = c.post("/api/auth/login/", {"username": username, "password": password}, format="json")
        assert r.status_code == 200, r.content
        c.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        c.user_id = r.data["user"]["id"]
    return c


@override_settings(TENANT_FALLBACK=False)
class TenantIsolationTests(TestCase):
    def setUp(self):
        self.platform = Tenant.objects.get(slug="platform")  # from the data migration
        Domain.objects.create(tenant=self.platform, host="platform.test")
        self.a = make_tenant("alpha", A, feature_sms=True)
        self.b = make_tenant("beta", B)
        self.owner = make_user(self.platform, "owner", role="admin", is_superuser=True)
        self.a_admin = make_user(self.a, "admin", role="admin")
        self.b_admin = make_user(self.b, "admin", role="admin")  # same username, other site
        self.a_agent = make_user(self.a, "agent", role="agent")
        self.a_user = make_user(self.a, "john", full_name="John A")
        self.b_user = make_user(self.b, "john", full_name="John B")

    def test_unknown_domain_is_404(self):
        self.assertEqual(APIClient(HTTP_HOST="nope.test").get("/api/settings/").status_code, 404)

    def test_same_username_logs_into_own_site(self):
        self.assertEqual(client_for(A, "john").user_id, self.a_user.id)
        self.assertEqual(client_for(B, "john").user_id, self.b_user.id)

    def test_token_from_other_site_rejected(self):
        a = client_for(A, "admin")
        a.defaults["HTTP_HOST"] = B
        self.assertEqual(a.get("/api/auth/me/").status_code, 401)

    def test_admin_only_sees_own_site_users(self):
        names = {u["username"] for u in client_for(A, "admin").get("/api/users/").data}
        self.assertEqual(names, {"admin", "agent", "john"})

    def test_settings_are_per_site_and_hide_secrets(self):
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.site_name, s.twilio_token = "Alpha Casino", "secret-token"
            s.save()
        public = APIClient(HTTP_HOST=A).get("/api/settings/").data
        self.assertEqual(public["site_name"], "Alpha Casino")
        self.assertNotIn("twilio_token", public)
        self.assertNotEqual(APIClient(HTTP_HOST=B).get("/api/settings/").data["site_name"], "Alpha Casino")
        self.assertEqual(client_for(A, "admin").get("/api/settings/").data["twilio_token"], "secret-token")

    def test_suspended_site_is_offline(self):
        self.b.is_active = False
        self.b.save()
        self.assertEqual(APIClient(HTTP_HOST=B).get("/api/settings/").status_code, 503)

    def test_agent_creates_only_own_players(self):
        agent = client_for(A, "agent")
        r = agent.post("/api/users/", {"username": "newbie", "password": "pass1234", "role": "admin"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["role"], r.data["agent"]), ("user", self.a_agent.id))
        self.assertEqual([u["username"] for u in agent.get("/api/users/").data], ["newbie"])

    def test_plan_user_limit(self):
        self.a.max_users = 3  # already has admin, agent, john
        self.a.save()
        r = client_for(A, "admin").post("/api/users/", {"username": "x", "password": "pass1234"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_platform_owner_creates_site(self):
        owner = client_for("platform.test", "owner")
        r = owner.post("/api/platform/tenants/", {
            "name": "Gamma", "slug": "gamma", "domains": ["gamma.test"],
            "admin_username": "boss", "admin_password": "secret12", "seed_demo": False,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(client_for("gamma.test", "boss", "secret12").user_id,
                         User.all_tenants.get(username="boss").id)
        # site admins of client sites can't reach the platform API
        self.assertEqual(client_for(A, "admin").get("/api/platform/tenants/").status_code, 403)

    def test_domain_check(self):
        c = APIClient(HTTP_HOST="backend:8000")
        self.assertEqual(c.get("/api/platform/domain-check/?domain=alpha.test").status_code, 200)
        self.assertEqual(c.get("/api/platform/domain-check/?domain=evil.test").status_code, 404)


@override_settings(TENANT_FALLBACK=False)
class MessengerTests(TestCase):
    def setUp(self):
        self.a = make_tenant("alpha", A, feature_sms=True)
        self.b = make_tenant("beta", B)
        self.admin = make_user(self.a, "admin", role="admin")
        self.agent = make_user(self.a, "agent", role="agent")
        self.ann = make_user(self.a, "ann")
        self.bob = make_user(self.a, "bob")
        self.other = make_user(self.b, "eve")

    def test_direct_chat_is_unique_per_pair(self):
        ann, bob = client_for(A, "ann"), client_for(A, "bob")
        c1 = ann.post("/api/messenger/conversations/", {"kind": "direct", "user": self.bob.id}, format="json").data
        c2 = bob.post("/api/messenger/conversations/", {"kind": "direct", "user": self.ann.id}, format="json").data
        self.assertEqual(c1["id"], c2["id"])

    def test_cannot_message_user_on_other_site(self):
        r = client_for(A, "ann").post("/api/messenger/conversations/", {"kind": "direct", "user": self.other.id}, format="json")
        self.assertEqual(r.status_code, 400)
        names = [u["username"] for u in client_for(A, "ann").get("/api/messenger/users/").data]
        self.assertNotIn("eve", names)

    def test_group_unread_and_membership(self):
        ann, bob = client_for(A, "ann"), client_for(A, "bob")
        g = ann.post("/api/messenger/conversations/", {"kind": "group", "title": "Crew", "members": [self.bob.id]}, format="json").data
        self.assertEqual(len(g["members"]), 2)
        ann.post(f"/api/messenger/conversations/{g['id']}/messages/", {"body": "hi"}, format="json")
        self.assertEqual(bob.get("/api/messenger/unread/").data["unread"], 1)  # system notice not counted
        bob.get(f"/api/messenger/conversations/{g['id']}/messages/")
        self.assertEqual(bob.get("/api/messenger/unread/").data["unread"], 0)
        # bob isn't an admin of the group → can't remove ann; can leave
        self.assertEqual(bob.delete(f"/api/messenger/conversations/{g['id']}/members/{self.ann.id}/").status_code, 403)
        self.assertEqual(bob.delete(f"/api/messenger/conversations/{g['id']}/members/{self.bob.id}/").status_code, 204)
        self.assertEqual(bob.get(f"/api/messenger/conversations/{g['id']}/messages/").status_code, 404)

    def test_sms_staff_only_and_inbound_reply(self):
        self.assertEqual(client_for(A, "ann").post("/api/messenger/conversations/", {"kind": "sms", "phone": "5552013344"}, format="json").status_code, 403)
        agent = client_for(A, "agent")
        conv = agent.post("/api/messenger/conversations/", {"kind": "sms", "phone": "(555) 201-3344"}, format="json").data
        self.assertEqual(conv["phone"], "+15552013344")
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.twilio_token = "tw-secret"
            s.save()
        params = {"From": "+15552013344", "Body": "thanks"}
        url = f"http://{A}/api/messenger/sms/inbound/"
        payload = url + "".join(f"{k}{v}" for k, v in sorted(params.items()))
        sig = base64.b64encode(hmac.new(b"tw-secret", payload.encode(), hashlib.sha1).digest()).decode()
        hook = APIClient(HTTP_HOST=A)
        self.assertEqual(hook.post("/api/messenger/sms/inbound/", params).status_code, 403)  # unsigned
        r = hook.post("/api/messenger/sms/inbound/", params, HTTP_X_TWILIO_SIGNATURE=sig)
        self.assertEqual(r.status_code, 200)
        kinds = [m["kind"] for m in client_for(A, "admin").get(f"/api/messenger/conversations/{conv['id']}/messages/").data["messages"]]
        self.assertEqual(kinds, ["sms_in"])

    def test_sms_disabled_by_plan(self):
        make_user(self.b, "bossb", role="admin")
        r = client_for(B, "bossb").post("/api/messenger/conversations/", {"kind": "sms", "phone": "5552013344"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(APIClient(HTTP_HOST=B).post("/api/messenger/sms/inbound/", {"From": "+15552013344", "Body": "x"}).status_code, 403)

    def test_rows_are_stamped_with_tenant(self):
        client_for(A, "ann").post("/api/messenger/conversations/", {"kind": "group", "members": [self.bob.id]}, format="json")
        self.assertFalse(Conversation.all_tenants.filter(tenant__isnull=True).exists())
        self.assertFalse(ChatMessage.all_tenants.filter(tenant__isnull=True).exists())


@override_settings(TENANT_FALLBACK=False)
class ImportTimeQuerysetTests(TestCase):
    """Class-level querysets (built with no tenant) must still be scoped."""

    def setUp(self):
        from catalog.models import Category
        self.a = make_tenant("alpha", A)
        self.b = make_tenant("beta", B)
        with use_tenant(self.a):
            Category.objects.create(name="Alpha Fish")
        with use_tenant(self.b):
            Category.objects.create(name="Beta Slots")
        self.shared = Category.objects.all()  # no tenant active: unscoped

    def test_api_lists_only_own_categories(self):
        names = [c["name"] for c in APIClient(HTTP_HOST=A).get("/api/categories/").data]
        self.assertEqual(names, ["Alpha Fish"])
        names = [c["name"] for c in APIClient(HTTP_HOST=B).get("/api/categories/").data]
        self.assertEqual(names, ["Beta Slots"])

    def test_shared_queryset_scoped_per_use_and_never_cached(self):
        with use_tenant(self.a):
            self.assertEqual([c.name for c in self.shared], ["Alpha Fish"])
            self.assertEqual(self.shared.count(), 1)
            self.assertEqual(self.shared[0].name, "Alpha Fish")
        with use_tenant(self.b):
            self.assertEqual([c.name for c in self.shared.all()], ["Beta Slots"])
            self.assertEqual(len(self.shared), 1)
            self.assertTrue(self.shared.exists())
        self.assertEqual(self.shared.count(), 2)  # no tenant: everything


class MessengerSafetyTests(TestCase):
    """Open messaging: support threads, blocks, privacy, spam limit,
    edit/delete, reports and the game-logins vault."""

    def setUp(self):
        self.a = make_tenant("alpha", A)
        self.b = make_tenant("beta", B)
        self.admin = make_user(self.a, "admin", role="admin")
        self.ann = make_user(self.a, "ann")
        self.bob = make_user(self.a, "bob")
        self.eve = make_user(self.b, "eve")
        self.ann_c, self.bob_c = client_for(A, "ann"), client_for(A, "bob")

    def dm(self, client, user):
        return client.post("/api/messenger/conversations/",
                           {"kind": "direct", "user": user.id}, format="json")

    def test_support_thread_pinned_and_reaches_admin(self):
        rows = self.ann_c.get("/api/messenger/conversations/").data
        self.assertEqual(rows[0]["kind"], "support")
        self.assertTrue(rows[0]["pinned"])
        self.assertEqual(rows[0]["title"], "Support")
        self.ann_c.post(f"/api/messenger/conversations/{rows[0]['id']}/messages/",
                        {"body": "help"}, format="json")
        admin_rows = client_for(A, "admin").get("/api/messenger/conversations/").data
        sup = [r for r in admin_rows if r["kind"] == "support"]
        self.assertEqual(sup[0]["title"], "ann")
        self.assertEqual(sup[0]["unread"], 1)
        stats = client_for(A, "admin").get("/api/stats/admin/").data
        self.assertEqual(stats["unanswered_chats"], 1)

    def test_block_stops_messages_and_hides_from_search(self):
        conv = self.dm(self.ann_c, self.bob).data
        self.assertEqual(self.bob_c.post("/api/messenger/blocks/", {"user": self.ann.id}, format="json").status_code, 201)
        r = self.ann_c.post(f"/api/messenger/conversations/{conv['id']}/messages/", {"body": "hey"}, format="json")
        self.assertEqual(r.status_code, 403)
        names = [u["username"] for u in self.ann_c.get("/api/messenger/users/?q=@bo").data]
        self.assertNotIn("bob", names)
        # staff can't be blocked
        self.assertEqual(self.ann_c.post("/api/messenger/blocks/", {"user": self.admin.id}, format="json").status_code, 400)
        self.bob_c.delete(f"/api/messenger/blocks/{self.ann.id}/")
        r = self.ann_c.post(f"/api/messenger/conversations/{conv['id']}/messages/", {"body": "hey"}, format="json")
        self.assertEqual(r.status_code, 201)

    def test_privacy_nobody_allows_staff_only(self):
        self.bob_c.patch("/api/messenger/profile/", {"dm_privacy": "nobody"}, format="json")
        self.assertEqual(self.dm(self.ann_c, self.bob).status_code, 403)
        self.assertEqual(self.dm(client_for(A, "admin"), self.bob).status_code, 201)

    def test_new_account_spam_limit(self):
        others = [make_user(self.a, f"p{i}") for i in range(11)]
        codes = [self.dm(self.ann_c, u).status_code for u in others]
        self.assertEqual(codes[:10], [201] * 10)
        self.assertEqual(codes[10], 429)
        # after a first load the limit no longer applies
        from gaming.models import Deposit
        with use_tenant(self.a):
            Deposit.objects.create(user=self.ann, method="chime", amount=20, status="approved", load_status="loaded")
        self.assertEqual(self.dm(self.ann_c, others[10]).status_code, 201)

    def test_edit_and_delete_own_message(self):
        conv = self.dm(self.ann_c, self.bob).data
        msg = self.ann_c.post(f"/api/messenger/conversations/{conv['id']}/messages/", {"body": "helo"}, format="json").data
        self.assertEqual(self.bob_c.patch(f"/api/messenger/messages/{msg['id']}/", {"body": "x"}, format="json").status_code, 403)
        r = self.ann_c.patch(f"/api/messenger/messages/{msg['id']}/", {"body": "hello"}, format="json")
        self.assertEqual(r.data["body"], "hello")
        self.assertIsNotNone(r.data["edited_at"])
        r = self.ann_c.delete(f"/api/messenger/messages/{msg['id']}/")
        self.assertTrue(r.data["deleted"])
        got = self.bob_c.get(f"/api/messenger/conversations/{conv['id']}/messages/").data["messages"]
        self.assertEqual(got[-1]["body"], "")
        self.assertTrue(got[-1]["deleted"])

    def test_report_and_mute(self):
        conv = self.dm(self.bob_c, self.ann).data
        msg = self.bob_c.post(f"/api/messenger/conversations/{conv['id']}/messages/", {"body": "send me your password"}, format="json").data
        r = self.ann_c.post("/api/messenger/reports/", {"user": self.bob.id, "message": msg["id"], "reason": "spam", "block": True}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.ann_c.get("/api/messenger/reports/").status_code, 403)
        admin = client_for(A, "admin")
        reps = admin.get("/api/messenger/reports/").data
        self.assertEqual(reps["open"], 1)
        self.assertEqual(reps["results"][0]["excerpt"], "send me your password")
        admin.post(f"/api/messenger/reports/{reps['results'][0]['id']}/", {"action": "mute", "hours": 2}, format="json")
        self.assertEqual(admin.get("/api/messenger/reports/").data["open"], 0)
        other = make_user(self.a, "cat")
        conv2 = client_for(A, "cat").post("/api/messenger/conversations/", {"kind": "direct", "user": self.bob.id}, format="json").data
        r = self.bob_c.post(f"/api/messenger/conversations/{conv2['id']}/messages/", {"body": "hi"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_game_logins_vault_is_private(self):
        from catalog.models import Game
        with use_tenant(self.a):
            g = Game.objects.create(name="Fire Kirin")
        admin = client_for(A, "admin")
        r = admin.post("/api/game-logins/", {"user": self.ann.id, "game": g.id, "username": "ann_fk", "password": "pw1"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.ann_c.get("/api/game-logins/me/").data[0]["username"], "ann_fk")
        self.assertEqual(self.bob_c.get("/api/game-logins/me/").data, [])
        self.assertEqual(self.ann_c.get("/api/game-logins/").status_code, 403)
        self.assertEqual(client_for(B, "eve").get("/api/game-logins/me/").data, [])


class OwnerAnalyticsTests(TestCase):
    """The owner sees money, games and players across every site; site admins can't."""

    def setUp(self):
        from django.core.cache import cache
        from catalog.models import Game, GameLogin
        from gaming.models import Deposit, PayMethod, Redeem
        cache.clear()
        self.p = Tenant.objects.get(is_platform=True)  # created by migrations
        Domain.objects.create(tenant=self.p, host="owner.test")
        self.a = make_tenant("alpha", A)
        self.b = make_tenant("beta", B)
        make_user(self.p, "boss", role="admin", is_superuser=True)
        make_user(self.a, "admin", role="admin")
        now = timezone.now()
        for t, name, amt, via in [(self.a, "ann", 50, "direct"), (self.b, "bob", 20, "bytepayout")]:
            u = make_user(t, name)
            with use_tenant(t):
                g = Game.objects.create(name="Juwa")
                GameLogin.objects.create(user=u, game=g, username=f"{name}_juwa")
                pm = PayMethod.objects.create(name="Cash App QR", replaces="ecashapp") if via == "direct" else None
                Deposit.objects.create(user=u, game=g, method="ecashapp", amount=amt, gateway=via, pay_method=pm,
                                       status="approved", approved_at=now, load_status="loaded")
                if name == "ann":
                    Redeem.objects.create(user=u, game=g, amount=30, payout_method="cashapp", payout_handle="$a",
                                          status="paid", handled_at=now)

    def test_owner_sees_every_site(self):
        c = client_for("owner.test", "boss")
        r = c.get("/api/platform/analytics/?days=30").data
        self.assertEqual(Decimal(str(r["kpis"]["deposits"])), Decimal("70"))
        self.assertEqual(Decimal(str(r["kpis"]["net"])), Decimal("40"))
        juwa = r["games"][0]
        self.assertEqual((juwa["name"], juwa["sites"], juwa["players"], juwa["accounts"]), ("Juwa", 2, 2, 2))
        vias = {(m["label"], m["via"]) for m in r["methods"]}
        self.assertEqual(vias, {("Cash App QR", "Your QR"), ("Cash App", "BytePayout")})
        one = c.get(f"/api/platform/analytics/?site={self.b.id}").data
        self.assertEqual(Decimal(str(one["kpis"]["deposits"])), Decimal("20"))
        players = c.get("/api/platform/players/?q=juwa").data
        self.assertEqual(players["count"], 2)
        ann = next(p for p in players["results"] if p["username"] == "ann")
        self.assertEqual((ann["site"], ann["games"][0]["game"]), ("Alpha", "Juwa"))
        detail = c.get(f"/api/platform/players/{ann['id']}/").data
        self.assertEqual(len(detail["deposits"]), 1)
        self.assertEqual(len(detail["cashouts"]), 1)

    def test_site_admin_is_refused(self):
        c = client_for(A, "admin")
        self.assertEqual(c.get("/api/platform/analytics/").status_code, 403)
        self.assertEqual(c.get("/api/platform/players/").status_code, 403)


class OwnerBytePayoutTests(TestCase):
    """A site can pay through the owner's BytePayout account; the owner sees all activity."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.p = Tenant.objects.get(is_platform=True)
        Domain.objects.create(tenant=self.p, host="owner.test")
        self.a = make_tenant("alpha", A, feature_payments=True)
        self.b = make_tenant("beta", B, feature_payments=True)
        make_user(self.p, "boss", role="admin", is_superuser=True)
        with use_tenant(self.p):
            s = SiteSettings.load(); s.bp_api_key, s.bp_webhook_secret = "owner-key", "owner-secret"; s.save()
        with use_tenant(self.b):
            s = SiteSettings.load(); s.bp_api_key, s.bp_webhook_secret = "beta-key", "beta-secret"; s.save()

    def test_credentials_follow_the_switch(self):
        from gaming import bytepayout
        with use_tenant(self.a):
            self.assertEqual(bytepayout.credentials()[0], "")  # no key, switch off
            self.assertFalse(bytepayout.configured())
        Tenant.objects.filter(pk=self.a.pk).update(use_owner_bytepayout=True)
        self.a.refresh_from_db()
        with use_tenant(self.a):
            key, base, secret, acct = bytepayout.credentials()
            self.assertEqual((key, secret, acct), ("owner-key", "owner-secret", "owner"))
        with use_tenant(self.b):  # its own key always wins
            self.assertEqual(bytepayout.credentials()[3], "own")
            self.assertEqual(bytepayout.credentials()[0], "beta-key")

    def test_webhook_for_a_site_on_the_owner_account_uses_the_owner_secret(self):
        from gaming.models import Deposit
        from catalog.models import Game
        Tenant.objects.filter(pk=self.a.pk).update(use_owner_bytepayout=True)
        self.a.refresh_from_db()
        u = make_user(self.a, "ann")
        with use_tenant(self.a):
            g = Game.objects.create(name="Juwa")
            d = Deposit.objects.create(user=u, game=g, method="chime", amount=50, credit_amount=50, gateway="bytepayout", status="pending")
        body = json.dumps({"event": "deposit.approved", "data": {"status": "approved", "reference": d.reference}}).encode()
        def post(secret):
            sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            return client_for(A).generic("POST", "/api/pay/bytepayout/webhook/", body, content_type="application/json", HTTP_X_BYTEPAYOUT_SIGNATURE=sig)
        self.assertEqual(post("beta-secret").status_code, 401)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(post("owner-secret").status_code, 200)
        with use_tenant(self.a):
            self.assertEqual(Deposit.objects.get(pk=d.pk).status, "approved")

    def test_owner_sees_account_and_all_bytepayout_activity(self):
        from gaming import bytepayout
        from gaming.models import Deposit
        from catalog.models import Game
        Tenant.objects.filter(pk=self.a.pk).update(use_owner_bytepayout=True)
        for t, name in ((self.a, "ann"), (self.b, "bob")):
            u = make_user(t, name)
            with use_tenant(t):
                g = Game.objects.create(name="Juwa")
                Deposit.objects.create(user=u, game=g, method="chime", amount=50, fee_amount=2.5, gateway="bytepayout",
                                       status="approved", approved_at=timezone.now())
        c = client_for("owner.test", "boss")
        from unittest import mock
        with mock.patch.object(bytepayout, "balance", return_value={"balance": 31.93, "currency": "USD"}):
            r = c.get("/api/platform/bytepayout/").data
        self.assertEqual(r["account"]["balance"]["balance"], 31.93)
        self.assertEqual(r["account"]["sites_using"], 1)
        self.assertEqual((Decimal(str(r["totals"]["paid"])), Decimal(str(r["totals"]["fees"]))), (Decimal("100"), Decimal("5.0")))
        accts = {s["name"]: s["account"] for s in r["sites"]}
        self.assertEqual((accts["Alpha"], accts["Beta"]), ("owner", "own"))
        self.assertEqual(len(r["recent"]), 2)
        self.assertEqual(client_for(A).get("/api/platform/bytepayout/").status_code, 401)
        self.assertEqual(client_for(B, "bob").get("/api/platform/bytepayout/").status_code, 403)

    def test_only_the_owner_can_flip_the_switch(self):
        c = client_for("owner.test", "boss")
        r = c.patch(f"/api/platform/tenants/{self.a.id}/", {"use_owner_bytepayout": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.a.refresh_from_db(); self.assertTrue(self.a.use_owner_bytepayout)


class OwnerChatTests(TestCase):
    """Site admins and the super admin talk in one private thread per site."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.p = Tenant.objects.get(is_platform=True)
        Domain.objects.create(tenant=self.p, host="owner.test")
        self.a, self.b = make_tenant("alpha", A), make_tenant("beta", B)
        make_user(self.p, "boss", role="admin", is_superuser=True)
        make_user(self.a, "alice", role="admin")
        make_user(self.b, "bella", role="admin")
        make_user(self.a, "ann")
        self.boss = client_for("owner.test", "boss")
        self.alice, self.bella = client_for(A, "alice"), client_for(B, "bella")

    def test_conversation_both_ways_with_unread_counts(self):
        r = self.alice.post("/api/owner-chat/", {"body": "How do I add Juwa?"}, format="json")
        self.assertEqual((r.status_code, r.data["from_owner"], r.data["sender"]), (201, False, "alice"))
        threads = self.boss.get("/api/platform/chats/").data
        self.assertEqual(threads["unread"], 1)
        alpha = next(t for t in threads["results"] if t["name"] == "Alpha")
        self.assertEqual((alpha["unread"], alpha["last"]["body"]), (1, "How do I add Juwa?"))
        self.assertEqual(self.boss.get("/api/platform/chats/unread/").data["unread"], 1)
        r = self.boss.post(f"/api/platform/chats/{self.a.id}/", {"body": "Games → Add game. I'll enable it."}, format="json")
        self.assertEqual((r.status_code, r.data["from_owner"], r.data["sender"]), (201, True, "Platform owner"))
        self.boss.post(f"/api/platform/chats/{self.a.id}/read/")
        self.assertEqual(self.boss.get("/api/platform/chats/unread/").data["unread"], 0)
        site = self.alice.get("/api/owner-chat/").data
        self.assertEqual((site["unread"], [m["body"] for m in site["results"]]), (1, ["How do I add Juwa?", "Games → Add game. I'll enable it."]))
        self.assertEqual(self.alice.get("/api/stats/admin/").data["owner_chat_unread"], 1)
        self.alice.post("/api/owner-chat/read/")
        self.assertEqual(self.alice.get("/api/owner-chat/").data["unread"], 0)
        first_id = site["results"][0]["id"]
        self.assertEqual(len(self.alice.get(f"/api/owner-chat/?after={first_id}").data["results"]), 1)

    def test_sites_never_see_each_other(self):
        self.alice.post("/api/owner-chat/", {"body": "alpha secret"}, format="json")
        self.boss.post(f"/api/platform/chats/{self.b.id}/", {"body": "hi beta"}, format="json")
        self.assertEqual([m["body"] for m in self.bella.get("/api/owner-chat/").data["results"]], ["hi beta"])
        self.assertEqual([m["body"] for m in self.alice.get("/api/owner-chat/").data["results"]], ["alpha secret"])

    def test_permissions(self):
        self.assertEqual(client_for(A, "ann").get("/api/owner-chat/").status_code, 403)       # players can't
        self.assertEqual(self.alice.get("/api/platform/chats/").status_code, 403)             # site admins can't read the owner side
        self.assertEqual(self.boss.get("/api/owner-chat/").status_code, 403)                  # owner uses the console
        self.assertEqual(client_for(A).get("/api/owner-chat/").status_code, 401)

    def test_validation_and_rate_limit(self):
        self.assertEqual(self.alice.post("/api/owner-chat/", {"body": "   "}, format="json").status_code, 400)
        self.assertEqual(self.alice.post("/api/owner-chat/", {"body": "x" * 4001}, format="json").status_code, 400)
        codes = [self.alice.post("/api/owner-chat/", {"body": f"m{i}"}, format="json").status_code for i in range(22)]
        self.assertEqual(codes[:20], [201] * 20)
        self.assertEqual(codes[20], 400)


class SiteBytePayoutLedgerTests(TestCase):
    """The owner holds each site's BytePayout money and records payouts to it."""

    def setUp(self):
        from django.core.cache import cache
        from catalog.models import Game
        from gaming.models import Deposit
        cache.clear()
        self.p = Tenant.objects.get(is_platform=True)
        Domain.objects.create(tenant=self.p, host="owner.test")
        self.a, self.b = make_tenant("alpha", A, feature_payments=True, use_owner_bytepayout=True), make_tenant("beta", B, feature_payments=True)
        make_user(self.p, "boss", role="admin", is_superuser=True)
        make_user(self.a, "alice", role="admin"); make_user(self.b, "bella", role="admin")
        with use_tenant(self.p):
            s = SiteSettings.load(); s.bp_api_key = "owner-key"; s.save()
        with use_tenant(self.b):
            s = SiteSettings.load(); s.bp_api_key = "beta-key"; s.save()
        for t, name, acct in ((self.a, "ann", "owner"), (self.b, "bob", "own")):
            u = make_user(t, name)
            with use_tenant(t):
                g = Game.objects.create(name="Juwa")
                for amt, fee in ((100, 5), (50, 2.5)):
                    Deposit.objects.create(user=u, game=g, method="chime", amount=amt, fee_amount=fee, gateway="bytepayout",
                                           bp_account=acct, status="approved", approved_at=timezone.now())
        self.boss, self.alice, self.bella = client_for("owner.test", "boss"), client_for(A, "alice"), client_for(B, "bella")

    def test_site_sees_its_held_balance_and_payouts_lower_it(self):
        r = self.alice.get("/api/bytepayout/").data
        self.assertEqual(r["account"], "owner")
        self.assertEqual((Decimal(str(r["held"]["paid_in"])), Decimal(str(r["held"]["fees"])), Decimal(str(r["held"]["balance"]))),
                         (Decimal("150"), Decimal("7.5"), Decimal("142.5")))
        self.assertIsNone(r["live"])  # never the owner's real balance
        self.assertEqual(len(r["recent"]), 2)
        p = self.boss.post("/api/platform/bytepayout/payouts/", {"site": self.a.id, "amount": "100", "note": "Oct 18 Cash App"}, format="json")
        self.assertEqual((p.status_code, Decimal(str(p.data["balance"]))), (201, Decimal("42.5")))
        r = self.alice.get("/api/bytepayout/").data
        self.assertEqual((Decimal(str(r["held"]["balance"])), len(r["payouts"])), (Decimal("42.5"), 1))
        over = self.boss.post("/api/platform/bytepayout/payouts/", {"site": self.a.id, "amount": "42.51"}, format="json")
        self.assertEqual(over.status_code, 400)
        self.assertIn("only owed", over.data["detail"])
        self.assertEqual(self.boss.post("/api/platform/bytepayout/payouts/", {"site": self.a.id, "amount": "-5"}, format="json").status_code, 400)

    def test_site_with_own_key_is_not_in_the_ledger_and_owner_sees_owed(self):
        from unittest import mock
        with mock.patch.object(bytepayout_mod(), "balance", return_value={"balance": 12.5, "currency": "USD"}):
            r = self.bella.get("/api/bytepayout/").data
        self.assertEqual((r["account"], r["held"], r["live"]["balance"]), ("own", None, 12.5))
        owner = self.boss.get("/api/platform/bytepayout/").data
        rows = {s["name"]: s for s in owner["sites"]}
        self.assertEqual(Decimal(str(rows["Alpha"]["owed"])), Decimal("142.5"))
        self.assertIsNone(rows["Beta"]["owed"])
        self.assertEqual(Decimal(str(owner["account"]["owed_total"])), Decimal("142.5"))

    def test_site_on_owner_account_never_sees_the_owners_real_balance(self):
        from unittest import mock
        with mock.patch.object(bytepayout_mod(), "balance", return_value={"balance": 99999, "currency": "USD"}) as m:
            r = self.alice.get("/api/admin/gateway-balance/").data
        self.assertTrue(r["held"])
        self.assertEqual(Decimal(str(r["data"]["balance"])), Decimal("142.5"))
        m.assert_not_called()

    def test_only_the_owner_records_payouts(self):
        self.assertEqual(self.alice.post("/api/platform/bytepayout/payouts/", {"site": self.a.id, "amount": "1"}, format="json").status_code, 403)
        self.assertEqual(self.boss.get("/api/bytepayout/").status_code, 403)  # the owner has no site page

    def test_new_sites_default_to_the_owner_account(self):
        r = self.boss.post("/api/platform/tenants/", {"name": "Gamma", "slug": "gamma", "domains": ["gamma.test"],
                           "admin_username": "gadmin", "admin_password": "longenough1", "seed_demo": False}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(Tenant.objects.get(slug="gamma").use_owner_bytepayout)


def bytepayout_mod():
    from gaming import bytepayout
    return bytepayout


class WhatsAppTests(TestCase):
    """WhatsApp rides the same Twilio account as SMS, as its own thread per number."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.a = make_tenant("alpha", A, feature_sms=True)
        make_user(self.a, "admin", role="admin")
        make_user(self.a, "ann")
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.twilio_sid, s.twilio_token, s.twilio_from = "ACtest", "tw-secret", "+15550001111"
            s.save()
        self.admin = client_for(A, "admin")

    def set_whatsapp(self, number="+14155238886"):
        with use_tenant(self.a):
            SiteSettings.objects.update(twilio_whatsapp_from=number)

    def sent(self, mock_open):
        from urllib.parse import parse_qs
        return {k: v[0] for k, v in parse_qs(mock_open.call_args[0][0].data.decode()).items()}

    def test_whatsapp_needs_a_number_then_sends_with_the_prefix(self):
        from unittest import mock
        r = self.admin.post("/api/messenger/conversations/", {"kind": "sms", "phone": "+15552013344", "channel": "whatsapp"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("WhatsApp isn't set up", r.data["detail"])
        self.set_whatsapp()
        self.assertTrue(self.admin.get("/api/messenger/unread/").data["whatsapp_enabled"])
        conv = self.admin.post("/api/messenger/conversations/", {"kind": "sms", "phone": "+15552013344", "channel": "whatsapp"}, format="json").data
        self.assertEqual(conv["channel"], "whatsapp")
        with mock.patch("urllib.request.urlopen") as op:
            op.return_value.__enter__.return_value.read.return_value = b'{"status": "queued"}'
            m = self.admin.post(f"/api/messenger/conversations/{conv['id']}/messages/", {"body": "hi from whatsapp"}, format="json")
        self.assertEqual(m.status_code, 201, m.data)
        self.assertEqual(self.sent(op), {"To": "whatsapp:+15552013344", "From": "whatsapp:+14155238886", "Body": "hi from whatsapp"})
        self.assertEqual(m.data["sms_status"], "queued")
        # SMS to the same number is a different thread and uses the plain numbers
        sms_conv = self.admin.post("/api/messenger/conversations/", {"kind": "sms", "phone": "+15552013344"}, format="json").data
        self.assertNotEqual(sms_conv["id"], conv["id"])
        self.assertEqual(sms_conv["channel"], "sms")
        with mock.patch("urllib.request.urlopen") as op:
            op.return_value.__enter__.return_value.read.return_value = b'{"status": "queued"}'
            self.admin.post(f"/api/messenger/conversations/{sms_conv['id']}/messages/", {"body": "plain sms"}, format="json")
        self.assertEqual(self.sent(op), {"To": "+15552013344", "From": "+15550001111", "Body": "plain sms"})

    def test_twenty_four_hour_rule_is_explained(self):
        import io, urllib.error
        from unittest import mock
        self.set_whatsapp()
        err = urllib.error.HTTPError("u", 400, "Bad", {}, io.BytesIO(b'{"code": 63016, "message": "Failed to send freeform message"}'))
        with mock.patch("urllib.request.urlopen", side_effect=err):
            from chat import sms
            out = sms.send("+15552013344", "hello", "whatsapp")
        self.assertIn("within 24 hours", out)

    def test_inbound_whatsapp_lands_in_its_own_thread(self):
        def signed(params):
            url = f"http://{A}/api/messenger/sms/inbound/"
            payload = url + "".join(f"{k}{v}" for k, v in sorted(params.items()))
            return base64.b64encode(hmac.new(b"tw-secret", payload.encode(), hashlib.sha1).digest()).decode()
        hook = APIClient(HTTP_HOST=A)
        wa = {"From": "whatsapp:+15552013344", "To": "whatsapp:+14155238886", "Body": "hello on whatsapp"}
        plain = {"From": "+15552013344", "Body": "hello by text"}
        self.assertEqual(hook.post("/api/messenger/sms/inbound/", wa).status_code, 403)  # unsigned
        self.assertEqual(hook.post("/api/messenger/sms/inbound/", wa, HTTP_X_TWILIO_SIGNATURE=signed(wa)).status_code, 200)
        self.assertEqual(hook.post("/api/messenger/sms/inbound/", plain, HTTP_X_TWILIO_SIGNATURE=signed(plain)).status_code, 200)
        convs = {c["channel"]: c for c in self.admin.get("/api/messenger/conversations/").data["conversations"]} if isinstance(self.admin.get("/api/messenger/conversations/").data, dict) else {c["channel"]: c for c in self.admin.get("/api/messenger/conversations/").data}
        self.assertEqual(set(convs), {"sms", "whatsapp"})
        self.assertEqual(convs["whatsapp"]["phone"], "+15552013344")
        self.assertEqual(convs["whatsapp"]["last_message"]["body"], "hello on whatsapp")
        self.assertEqual((convs["whatsapp"]["last_message"]["channel"], convs["whatsapp"]["last_message"]["sender_name"]), ("whatsapp", "+15552013344"))
        self.assertEqual(convs["sms"]["last_message"]["channel"], "sms")

    def test_setup_api(self):
        from unittest import mock
        st = self.admin.get("/api/admin/twilio/").data
        self.assertEqual((st["account"], st["sms"], st["whatsapp"], st["public_ok"]), (True, True, False, False))
        self.assertTrue(st["webhook_url"].endswith("/api/messenger/sms/inbound/"))
        self.assertEqual(client_for(A, "ann").get("/api/admin/twilio/").status_code, 403)
        with mock.patch("chat.sms.check_account", return_value={"ok": True, "name": "My Twilio", "status": "active", "type": "Full"}), \
             mock.patch("chat.sms.list_numbers", return_value=[{"sid": "PN123", "number": "+15550001111", "name": "Main", "sms": True, "sms_url": ""}]):
            r = self.admin.post("/api/admin/twilio/check/", {}, format="json").data
        self.assertEqual((r["ok"], r["numbers"][0]["sid"]), (True, "PN123"))
        # not on a public https domain: refuse to touch the Twilio number
        refused = self.admin.post("/api/admin/twilio/connect-number/", {"number_sid": "PN123"}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("real https domain", refused.data["detail"])
        with mock.patch("chat.sms.point_number_at", return_value="") as pt:
            ok = self.admin.post("/api/admin/twilio/connect-number/", {"number_sid": "PN123"}, format="json", secure=True)
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(pt.call_args[0][2:], ("PN123", f"https://{A}/api/messenger/sms/inbound/"))
        # test message
        with mock.patch("chat.sms.send", return_value="queued") as snd:
            r = self.admin.post("/api/admin/twilio/test/", {"channel": "sms", "to": "5552013344"}, format="json")
        self.assertEqual((r.status_code, snd.call_args[0][0]), (200, "+15552013344"))
        # the test is saved as a normal thread so staff can see it in the Inbox
        thread = [c for c in self.admin.get("/api/messenger/conversations/").data if c["phone"] == "+15552013344" and c["channel"] == "sms"]
        self.assertEqual(len(thread), 1)
        self.assertEqual(r.data["conversation"], thread[0]["id"])
        self.assertIn("Test message from", thread[0]["last_message"]["body"])
        self.assertEqual(self.admin.post("/api/admin/twilio/test/", {"channel": "whatsapp", "to": "5552013344"}, format="json").status_code, 400)  # no WhatsApp number yet


class SendblueTests(TestCase):
    """iMessage/SMS through Sendblue: its own channel, secret-token webhook, delivery updates."""

    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.a = make_tenant("alpha", A, feature_sms=True)
        self.b = make_tenant("beta", B, feature_sms=False)
        make_user(self.a, "admin", role="admin"); make_user(self.a, "ann")
        make_user(self.b, "bossb", role="admin")
        with use_tenant(self.a):
            s = SiteSettings.load()
            s.sendblue_key_id, s.sendblue_secret, s.sendblue_from, s.sendblue_token = "kid", "sec", "+15550009999", "hook-token-123"
            s.save()
        self.admin = client_for(A, "admin")
        self.web = APIClient(HTTP_HOST=A)

    def fake(self, status=200, body=None):
        from unittest import mock
        resp = mock.MagicMock(); resp.read.return_value = json.dumps(body if body is not None else {"status": "QUEUED", "message_handle": "H-1", "service": "iMessage"}).encode(); resp.status = status
        cm = mock.MagicMock(); cm.__enter__.return_value = resp
        return mock.patch("urllib.request.urlopen", return_value=cm)

    def test_send_posts_the_documented_request_and_stores_the_handle(self):
        self.assertTrue(self.admin.get("/api/messenger/unread/").data["imessage_enabled"])
        conv = self.admin.post("/api/messenger/conversations/", {"kind": "sms", "phone": "(555) 201-3344", "channel": "sendblue"}, format="json").data
        self.assertEqual((conv["channel"], conv["phone"]), ("sendblue", "+15552013344"))
        with self.fake() as op:
            m = self.admin.post(f"/api/messenger/conversations/{conv['id']}/messages/", {"body": "hello"}, format="json")
        self.assertEqual(m.status_code, 201, m.data)
        req = op.call_args[0][0]
        self.assertEqual(req.full_url, "https://api.sendblue.co/api/send-message")
        self.assertEqual((req.get_header("Sb-api-key-id"), req.get_header("Sb-api-secret-key")), ("kid", "sec"))
        self.assertEqual(json.loads(req.data), {"number": "+15552013344", "from_number": "+15550009999", "content": "hello"})
        self.assertEqual(m.data["sms_status"], "queued · iMessage")
        self.assertEqual(m.data["channel"], "sendblue")

    def test_error_from_sendblue_is_shown_in_plain_words(self):
        conv = self.admin.post("/api/messenger/conversations/", {"kind": "sms", "phone": "+15552013344", "channel": "sendblue"}, format="json").data
        with self.fake(400, {"status": "ERROR", "error_code": 10, "message": "Recipient has not texted your number yet"}):
            m = self.admin.post(f"/api/messenger/conversations/{conv['id']}/messages/", {"body": "hi"}, format="json")
        self.assertEqual(m.data["sms_status"], "error: Recipient has not texted your number yet")

    def test_inbound_creates_thread_dedupes_retries_and_updates_delivery(self):
        hook = "/api/messenger/sendblue/hook-token-123/"
        inbound = {"is_outbound": False, "number": "+15552013344", "from_number": "+15552013344", "to_number": "+15550009999",
                   "content": "Hi, can I load my game?", "message_handle": "IN-1", "service": "iMessage", "status": "RECEIVED"}
        self.assertEqual(self.web.post("/api/messenger/sendblue/wrong/", inbound, format="json").status_code, 404)
        r = self.web.post(hook, inbound, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.web.post(hook, inbound, format="json").status_code, 200)  # Sendblue retry
        convs = [c for c in self.admin.get("/api/messenger/conversations/").data if c["channel"] == "sendblue"]
        self.assertEqual(len(convs), 1)
        msgs = self.admin.get(f"/api/messenger/conversations/{convs[0]['id']}/messages/").data["messages"]
        self.assertEqual([(m["kind"], m["body"], m["channel"]) for m in msgs], [("sms_in", "Hi, can I load my game?", "sendblue")])
        self.assertEqual(msgs[0]["sender_name"], "+15552013344")
        # we send a reply, then Sendblue reports delivery
        with self.fake():
            self.admin.post(f"/api/messenger/conversations/{convs[0]['id']}/messages/", {"body": "yes"}, format="json")
        self.web.post(hook, {"is_outbound": True, "message_handle": "H-1", "status": "DELIVERED", "service": "iMessage", "error_code": 0}, format="json")
        out = [m for m in self.admin.get(f"/api/messenger/conversations/{convs[0]['id']}/messages/").data["messages"] if m["kind"] == "sms_out"]
        self.assertEqual(out[0]["sms_status"], "delivered · iMessage")
        self.web.post(hook, {"is_outbound": True, "message_handle": "H-1", "status": "ERROR", "error_code": 5, "error_reason": "Not an iMessage number"}, format="json")
        out = [m for m in self.admin.get(f"/api/messenger/conversations/{convs[0]['id']}/messages/").data["messages"] if m["kind"] == "sms_out"]
        self.assertEqual(out[0]["sms_status"], "error: Not an iMessage number")

    def test_photo_email_sender_and_junk_payloads(self):
        hook = "/api/messenger/sendblue/hook-token-123/"
        self.web.post(hook, {"is_outbound": False, "number": "Jane.Doe@iCloud.com", "content": "", "media_url": "https://cdn.sendblue.co/p.jpg", "message_handle": "IN-2"}, format="json")
        conv = [c for c in self.admin.get("/api/messenger/conversations/").data if c["channel"] == "sendblue"][0]
        self.assertEqual(conv["phone"], "jane.doe@icloud.com")
        self.assertIn("📷 Photo: https://cdn.sendblue.co/p.jpg", conv["last_message"]["body"])
        self.assertEqual(self.web.post(hook, {"is_outbound": False, "number": "nonsense", "content": "x"}, format="json").status_code, 200)  # ignored
        self.assertEqual(self.web.post(hook, "not json", content_type="application/json").status_code, 400)

    def test_setup_api(self):
        from unittest import mock
        st = self.admin.get("/api/admin/sendblue/").data
        self.assertEqual((st["account"], st["ready"], st["public_ok"]), (True, True, False))
        self.assertTrue(st["webhook_url"].endswith("/api/messenger/sendblue/hook-token-123/"))
        self.assertEqual(client_for(A, "ann").get("/api/admin/sendblue/").status_code, 403)
        new = self.admin.post("/api/admin/sendblue/").data["webhook_url"]
        self.assertNotIn("hook-token-123", new)
        with self.fake(200, {"lines": [{"number": "+15550009999"}]}):
            r = self.admin.post("/api/admin/sendblue/check/", {}, format="json").data
        self.assertEqual((r["ok"], r["lines"]), (True, ["+15550009999"]))
        with self.fake(401, {}):
            self.assertEqual(self.admin.post("/api/admin/sendblue/check/", {}, format="json").data["error"], "Sendblue rejected your API key ID or secret.")
        refused = self.admin.post("/api/admin/sendblue/connect/", {}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("real https domain", refused.data["detail"])
        with mock.patch("chat.sendblue.register_webhook", return_value="") as rw:
            ok = self.admin.post("/api/admin/sendblue/connect/", {}, format="json", secure=True)
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(rw.call_args[0][2].startswith(f"https://{A}/api/messenger/sendblue/"))
        with mock.patch("chat.sendblue.send", return_value=("queued · iMessage", "H")) as snd:
            t = self.admin.post("/api/admin/sendblue/test/", {"to": "5552013344"}, format="json")
        self.assertEqual((t.status_code, snd.call_args[0][0]), (200, "+15552013344"))
        convs = [c for c in self.admin.get("/api/messenger/conversations/").data if c["channel"] == "sendblue"]
        self.assertEqual((len(convs), t.data["conversation"], convs[0]["last_message"]["sms_status"]), (1, convs[0]["id"], "queued · iMessage"))

    def test_plan_without_phone_messaging_is_refused(self):
        b = client_for(B, "bossb")
        self.assertEqual(b.get("/api/admin/sendblue/").status_code, 403)
        self.assertEqual(APIClient(HTTP_HOST=B).post("/api/messenger/sendblue/x/", {}, format="json").status_code, 403)
