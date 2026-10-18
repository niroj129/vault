from datetime import date, timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated as IsAuthenticatedPerm
from rest_framework.response import Response
from rest_framework.views import APIView

import urllib.parse
import urllib.request

from accounts.permissions import IsAdminOrReadOnly, IsAdminRole
from gaming import bytepayout
from catalog.models import Category, Game
from .models import (Announcement, BusinessInfo, Cashout, ContactMessage,
                     DailyProfit, Notification, PaymentMethod, Promo, SEOPage,
                     SiteFAQ, SiteSettings, Transaction, Winner)
from .serializers import (AnnouncementSerializer, BusinessInfoSerializer,
                          CashoutSerializer, ContactMessageSerializer,
                          DailyProfitSerializer, NotificationSerializer,
                          PaymentMethodSerializer, PromoSerializer,
                          SEOPageSerializer, SiteFAQSerializer,
                          SiteSettingsSerializer, TransactionSerializer,
                          WinnerSerializer)


class WinnerViewSet(viewsets.ModelViewSet):
    queryset = Winner.objects.all()
    serializer_class = WinnerSerializer
    permission_classes = [IsAdminOrReadOnly]


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [IsAdminOrReadOnly]

    def perform_create(self, serializer):
        ann = serializer.save()
        from accounts.models import User
        Notification.objects.bulk_create([
            Notification(user=u, text=f"📢 {ann.title}", link="/dashboard")
            for u in User.objects.filter(role="user", is_active=True)
        ])

    def get_queryset(self):
        qs = Announcement.objects.all()
        if not (self.request.user.is_authenticated
                and self.request.user.is_admin_role):
            qs = qs.filter(active=True).filter(
                publish_at__isnull=True) | qs.filter(
                active=True, publish_at__lte=timezone.now())
        return qs.distinct()


class DailyProfitViewSet(viewsets.ModelViewSet):
    queryset = DailyProfit.objects.all()
    serializer_class = DailyProfitSerializer
    permission_classes = [IsAdminRole]


class SEOPageViewSet(viewsets.ModelViewSet):
    queryset = SEOPage.objects.all()
    serializer_class = SEOPageSerializer
    permission_classes = [IsAdminOrReadOnly]


class ContactMessageViewSet(mixins.CreateModelMixin, mixins.ListModelMixin,
                            viewsets.GenericViewSet):
    queryset = ContactMessage.objects.all()
    serializer_class = ContactMessageSerializer

    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        return [IsAdminRole()]


class PaymentMethodViewSet(viewsets.ModelViewSet):
    queryset = PaymentMethod.objects.all()
    serializer_class = PaymentMethodSerializer
    permission_classes = [IsAdminOrReadOnly]


class CashoutViewSet(viewsets.ModelViewSet):
    queryset = Cashout.objects.all()
    serializer_class = CashoutSerializer
    permission_classes = [IsAdminRole]


def _owner_chat_unread():
    from tenants.context import get_current_tenant
    from tenants.ownerchat import site_unread
    t = get_current_tenant()
    return site_unread(t) if t and not t.is_platform else 0


def _unmatched_emails():
    """Payment emails no QR payment could be matched to (sidebar badge)."""
    from mailin.models import InboundEmail
    return InboundEmail.objects.filter(kind="payment", match="none", archived=False).count()


class SiteSettingsView(APIView):
    permission_classes = [IsAdminOrReadOnly]

    # Safe for anyone to read; everything else (API keys, tokens) is admin-only.
    PUBLIC_FIELDS = {"site_name", "tagline", "logo", "favicon",
                     "social_preview", "color_primary", "color_secondary",
                     "color_accent", "currency", "signup_url",
                     "maintenance_mode", "analytics_id", "gsc_verification",
                     "allow_signup", "redeem_enabled",
                     "bp_methods", "load_bonus_percent"}

    def get(self, request):
        data = SiteSettingsSerializer(SiteSettings.load()).data
        if not (request.user.is_authenticated and request.user.is_admin_role):
            data = {k: v for k, v in data.items() if k in self.PUBLIC_FIELDS}
        tenant = getattr(request, "tenant", None)
        if tenant:
            data["features"] = tenant.features
            data["is_platform"] = tenant.is_platform
        return Response(data)

    def put(self, request):
        obj = SiteSettings.load()
        data = {k: v for k, v in request.data.items()}
        # empty IP -> null (blank strings fail IP validation)
        if data.get("game_api_force_ip") in ("", None):
            data["game_api_force_ip"] = None
        # empty numeric fields -> skip (partial update keeps current value)
        for k in ("points_threshold", "load_amount", "load_bonus_percent", "redeem_min"):
            if k in data and str(data[k]).strip() == "":
                data.pop(k)
        ser = SiteSettingsSerializer(obj, data=data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class BusinessInfoView(APIView):
    permission_classes = [IsAdminOrReadOnly]

    def get(self, request):
        return Response(BusinessInfoSerializer(BusinessInfo.load()).data)

    def put(self, request):
        obj = BusinessInfo.load()
        ser = BusinessInfoSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


def _profit_between(start=None):
    qs = DailyProfit.objects.all()
    if start:
        qs = qs.filter(date__gte=start)
    return qs.aggregate(s=Sum("amount"))["s"] or 0


@api_view(["GET"])
@permission_classes([AllowAny])
def public_stats(request):
    """Homepage figures: profit summary + latest winner + counts."""
    today = date.today()
    latest = Winner.objects.first()
    return Response({
        "profit": {
            "today": _profit_between(today),
            "week": _profit_between(today - timedelta(days=6)),
            "month": _profit_between(today - timedelta(days=29)),
            "total": _profit_between(),
        },
        "active_games": Game.objects.filter(status="active").count(),
        "categories": Category.objects.count(),
        "latest_winner": WinnerSerializer(latest).data if latest else None,
    })


@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_stats(request):
    """Admin dashboard widgets + 14-day profit trend + today figures."""
    from accounts.models import User
    from django.db.models import F
    today = date.today()
    settings = SiteSettings.load()

    trend = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        amt = DailyProfit.objects.filter(date=d).aggregate(
            s=Sum("amount"))["s"] or 0
        trend.append({"date": d.isoformat()[5:], "amount": float(amt)})

    today_cashout = Cashout.objects.filter(date=today).aggregate(
        s=Sum("amount"))["s"] or 0
    low_points = Game.objects.filter(
        sub_points__lt=settings.points_threshold - F("vendor_points")).count()

    from .models import GameTxn
    from .shifts import current_shift, nepal_now
    ndate = nepal_now().date()
    today_loads = float(GameTxn.objects.filter(nepal_date=ndate, kind="load")
                        .aggregate(s=Sum("amount"))["s"] or 0)
    today_withdraws = float(GameTxn.objects.filter(nepal_date=ndate, kind="withdraw")
                            .aggregate(s=Sum("amount"))["s"] or 0)

    return Response({
        "current_shift": current_shift(),
        "today_loads": today_loads,
        "today_withdraws": today_withdraws,
        "total_users": User.objects.count(),
        "active_users": User.objects.filter(is_active=True).count(),
        "players": User.objects.filter(role="user").count(),
        "total_games": Game.objects.count(),
        "active_games": Game.objects.filter(status="active").count(),
        "categories": Category.objects.count(),
        "daily_profit": _profit_between(today),
        "monthly_profit": _profit_between(today - timedelta(days=29)),
        "total_profit": _profit_between(),
        "today_cashout": today_cashout,
        "low_points": low_points,
        "unread_chats": _unread_chat_count(),
        **_messenger_numbers(),
        **_payment_numbers(),
        "latest_winner": (WinnerSerializer(Winner.objects.first()).data
                          if Winner.objects.exists() else None),
        "trend": trend,
    })


def _unread_chat_count():
    from chat.models import Message
    return Message.objects.filter(recipient__role="admin", is_read=False).count()


def _messenger_numbers():
    """Online players, support chats waiting on staff, open reports."""
    from accounts.models import User
    from chat import presence
    from chat.models import ChatMessage, Conversation, Report
    from django.db.models import Max, Q
    players = list(User.objects.filter(role="user", is_active=True)
                   .values_list("id", flat=True))
    convs = list(Conversation.objects.filter(kind="support").annotate(
        last=Max("messages__id", filter=~Q(messages__kind="system")))
        .exclude(last=None).values_list("subject_id", "last"))
    senders = dict(ChatMessage.objects.filter(id__in=[l for _, l in convs])
                   .values_list("id", "sender_id"))
    return {
        "online_now": len(presence.online_ids(players)),
        "unanswered_chats": sum(1 for subj, l in convs
                                if senders.get(l) == subj),
        "open_reports": Report.objects.filter(status="open").count(),
        "messages_today": ChatMessage.objects.filter(
            created_at__date=timezone.localdate()).exclude(
            kind="system").count(),
    }


def _payment_numbers():
    from gaming.models import Deposit, Redeem
    paid = Deposit.objects.filter(status="approved")
    today = timezone.localdate()
    return {
        "deposits_needing_staff": paid.filter(load_status__in=["failed", "manual"]).count()
        + Deposit.objects.filter(status="pending", gateway="direct").count(),
        "deposits_to_check": Deposit.objects.filter(status="pending", gateway="direct").count(),
        "redeems_waiting": Redeem.objects.filter(status="pending").count(),
        "emails_unmatched": _unmatched_emails(),
        "owner_chat_unread": _owner_chat_unread(),
        "deposits_today": float(paid.filter(approved_at__date=today)
                                .aggregate(s=Sum("amount"))["s"] or 0),
    }


@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_setup(request):
    """The admin dashboard's "finish setting up" checklist."""
    from accounts.models import User
    from .models import Promo
    st = SiteSettings.load()
    steps = [
        {"key": "brand", "title": "Add your name and logo",
         "hint": "Players see it on every page.",
         "done": bool(st.logo) or st.site_name not in ("", "My Casino"),
         "href": "/admin/settings"},
        {"key": "games", "title": "Add your games",
         "hint": "With art and the player link for each.",
         "done": Game.objects.exists(), "href": "/admin/games"},
        {"key": "staff", "title": "Add a staff member",
         "hint": "Someone to answer chats when you're away.",
         "done": User.objects.filter(role__in=["admin", "agent"]).count() > 1,
         "href": "/admin/players"},
        {"key": "payments", "title": "Turn on payments",
         "hint": "Add your BytePayout key and webhook.",
         "done": bool(bytepayout.credentials(st)[0] and bytepayout.credentials(st)[2]),
         "href": "/admin/deposits"},
        {"key": "promo", "title": "Post your first promotion",
         "hint": "A welcome offer brings people back.",
         "done": Promo.objects.exists(), "href": "/admin/promotions"},
    ]
    return Response({"steps": steps,
                     "done": sum(s["done"] for s in steps),
                     "total": len(steps)})


@api_view(["GET"])
@permission_classes([IsAdminRole])
def points_report(request):
    """Vendor / sub-distributor points per game with low-balance flags."""
    threshold = SiteSettings.load().points_threshold
    rows = []
    for g in Game.objects.all().order_by("name"):
        combined = float(g.sub_points) + float(g.vendor_points)
        rows.append({
            "id": g.id, "name": g.name, "slug": g.slug,
            "sub_points": float(g.sub_points),
            "vendor_points": float(g.vendor_points),
            "combined": combined, "low": combined < threshold,
        })
    return Response({
        "threshold": threshold,
        "load_amount": SiteSettings.load().load_amount,
        "rows": rows,
        "low_count": sum(1 for r in rows if r["low"]),
        "telegram_configured": bool(SiteSettings.load().telegram_bot_token
                                    and SiteSettings.load().telegram_chat_id),
    })


@api_view(["POST"])
@permission_classes([IsAdminRole])
def telegram_alert(request):
    """Send a load reminder for a game to the configured Telegram group."""
    s = SiteSettings.load()
    if not (s.telegram_bot_token and s.telegram_chat_id):
        return Response({"detail": "Configure the Telegram bot token and chat "
                         "id in Settings first."}, status=400)
    game = Game.objects.filter(pk=request.data.get("game")).first()
    if not game:
        return Response({"detail": "Game not found."}, status=404)
    amount = request.data.get("amount") or s.load_amount
    combined = float(game.sub_points) + float(game.vendor_points)
    text = (f"🔔 [{s.site_name}] Please load {amount} — {game.name}\n"
            f"Sub-Dist: {game.sub_points} | Vendor: {game.vendor_points} "
            f"| Combined: {combined}")
    url = f"https://api.telegram.org/bot{s.telegram_bot_token}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": s.telegram_chat_id,
                                   "text": text}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data),
                                    timeout=10) as resp:
            ok = resp.status == 200
    except Exception as e:
        return Response({"detail": f"Telegram error: {e}"}, status=502)
    return Response({"ok": ok, "sent": text})


class PromoViewSet(viewsets.ModelViewSet):
    serializer_class = PromoSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = Promo.objects.all()
        if not (self.request.user.is_authenticated and self.request.user.is_admin_role):
            qs = qs.filter(active=True)
        return qs


class SiteFAQViewSet(viewsets.ModelViewSet):
    queryset = SiteFAQ.objects.all()
    serializer_class = SiteFAQSerializer
    permission_classes = [IsAdminOrReadOnly]


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticatedPerm]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)[:50]

    @action(detail=False, methods=["post"])
    def read_all(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAdminRole])
def top_games(request):
    rows = Game.objects.select_related("category").order_by("-clicks", "-views")[:10]
    return Response([{"name": g.name, "slug": g.slug, "clicks": g.clicks,
                      "views": g.views, "status": g.status,
                      "thumbnail": g.thumbnail.url if g.thumbnail else None,
                      "category": g.category.name if g.category_id else ""}
                     for g in rows])


@api_view(["GET"])
@permission_classes([IsAdminRole])
def export_csv(request, resource):
    """CSV export for winners, cashouts, profit, players."""
    import csv
    from django.http import HttpResponse
    from accounts.models import User
    from .models import GameTxn
    cfg = {
        "winners": (Winner.objects.all(), ["name", "amount", "game", "win_date"],
                    lambda o: [o.name, o.amount, o.game, o.win_date]),
        "cashouts": (Cashout.objects.all(), ["player", "amount", "method", "game", "status", "date"],
                     lambda o: [o.player, o.amount, o.method, o.game, o.status, o.date]),
        "profit": (DailyProfit.objects.all(), ["date", "amount", "notes"],
                   lambda o: [o.date, o.amount, o.notes]),
        "players": (User.objects.filter(role="user"),
                    ["username", "full_name", "email", "phone", "loyalty_points", "referral_code", "last_login"],
                    lambda o: [o.username, o.full_name, o.email, o.phone, o.loyalty_points, o.referral_code, o.last_login]),
        "transactions": (Transaction.objects.select_related("user"),
                         ["user", "amount", "kind", "note", "created_at"],
                         lambda o: [o.user.username, o.amount, o.kind, o.note, o.created_at]),
        "gametxns": (GameTxn.objects.all(),
                     ["kind", "account_name", "amount", "payment_method", "shift", "nepal_date", "operator", "status", "order_id"],
                     lambda o: [o.kind, o.account_name, o.amount, o.payment_method, o.shift, o.nepal_date, o.operator, o.status, o.order_id]),
    }
    if resource not in cfg:
        return Response({"detail": "Unknown report."}, status=404)
    qs, headers, row = cfg[resource]
    resp = HttpResponse(content_type="text/csv")
    resp["Content-Disposition"] = f"attachment; filename={resource}.csv"
    w = csv.writer(resp)
    w.writerow(headers)
    for o in qs:
        w.writerow(row(o))
    return resp


@api_view(["POST"])
@permission_classes([IsAuthenticatedPerm])
def promo_redeem(request):
    """Player submits a promo code; agent applies it. Logs + notifies."""
    code = (request.data.get("code") or "").strip()
    promo = Promo.objects.filter(code__iexact=code, active=True).first()
    if not promo:
        return Response({"detail": "Invalid or expired code."}, status=400)
    Notification.objects.create(
        user=request.user, text=f"🎁 Code {promo.code} accepted — an agent will "
        f"apply your bonus.", link="/dashboard")
    from accounts.models import User
    for admin in User.objects.filter(role="admin"):
        Notification.objects.create(
            user=admin, text=f"🎁 {request.user.username} redeemed {promo.code}",
            link="/admin/chat")
    return Response({"ok": True, "title": promo.title})


@api_view(["POST"])
@permission_classes([IsAuthenticatedPerm])
def cashout_request(request):
    """Player requests a cashout -> pending Cashout + admin notification."""
    try:
        amount = float(request.data.get("amount"))
    except (TypeError, ValueError):
        return Response({"detail": "Invalid amount."}, status=400)
    if amount <= 0:
        return Response({"detail": "Amount must be positive."}, status=400)
    Cashout.objects.create(
        player=request.user.username, amount=amount,
        method=request.data.get("method", ""), status="pending",
        date=date.today(), notes="Player request")
    from accounts.models import User
    for admin in User.objects.filter(role="admin"):
        Notification.objects.create(
            user=admin, text=f"💸 {request.user.username} requested a "
            f"${amount:g} cashout", link="/admin/payments")
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAdminRole])
def settlement_report(request):
    """All-time ledger settlement: totals by kind, cash outs and profit."""
    from accounts.models import User
    totals = {}
    for k in ["load", "cashout", "bonus", "adjust"]:
        totals[k] = float(Transaction.objects.filter(kind=k).aggregate(
            s=Sum("amount"))["s"] or 0)
    all_cashouts = float(Cashout.objects.aggregate(s=Sum("amount"))["s"] or 0)
    pending = float(Cashout.objects.filter(status="pending").aggregate(
        s=Sum("amount"))["s"] or 0)
    return Response({
        "totals": totals,
        "all_time_cashouts": all_cashouts,
        "pending_cashouts": pending,
        "total_profit": float(_profit_between()),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticatedPerm])
def leaderboard(request):
    from accounts.models import User
    top = User.objects.filter(role="user").order_by("-loyalty_points")[:10]
    return Response([{"username": u.username, "full_name": u.full_name,
                      "loyalty_points": u.loyalty_points, "tier": u.vip_tier}
                     for u in top])


@api_view(["GET"])
@permission_classes([AllowAny])
def search_suggest(request):
    q = (request.query_params.get("q") or "").strip()
    if not q:
        return Response([])
    games = Game.objects.filter(status="active").filter(name__icontains=q)[:6]
    return Response([{"name": g.name, "slug": g.slug} for g in games])
