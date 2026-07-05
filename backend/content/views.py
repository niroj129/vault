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
from catalog.models import Category, Game
from .models import (Announcement, BusinessInfo, Cashout, ContactMessage,
                     DailyProfit, Notification, PaymentMethod, Promo, SEOPage,
                     SiteFAQ, SiteSettings, Transaction, Wallet, Winner)
from .serializers import (AnnouncementSerializer, BusinessInfoSerializer,
                          CashoutSerializer, ContactMessageSerializer,
                          DailyProfitSerializer, NotificationSerializer,
                          PaymentMethodSerializer, PromoSerializer,
                          SEOPageSerializer, SiteFAQSerializer,
                          SiteSettingsSerializer, TransactionSerializer,
                          WalletSerializer, WinnerSerializer)


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


class SiteSettingsView(APIView):
    permission_classes = [IsAdminOrReadOnly]

    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)

    def put(self, request):
        obj = SiteSettings.load()
        ser = SiteSettingsSerializer(obj, data=request.data, partial=True)
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
        "latest_winner": (WinnerSerializer(Winner.objects.first()).data
                          if Winner.objects.exists() else None),
        "trend": trend,
    })


def _unread_chat_count():
    from chat.models import Message
    return Message.objects.filter(recipient__role="admin", is_read=False).count()


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


class WalletMeView(APIView):
    permission_classes = [IsAuthenticatedPerm]

    def get(self, request):
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        txns = Transaction.objects.filter(user=request.user)[:50]
        return Response({"balance": wallet.balance,
                         "transactions": TransactionSerializer(txns, many=True).data})


@api_view(["POST"])
@permission_classes([IsAdminRole])
def wallet_adjust(request):
    """Admin credits/debits a player's wallet and logs a transaction."""
    from accounts.models import User
    user = User.objects.filter(pk=request.data.get("user")).first()
    if not user:
        return Response({"detail": "User not found."}, status=404)
    try:
        amount = float(request.data.get("amount"))
    except (TypeError, ValueError):
        return Response({"detail": "Invalid amount."}, status=400)
    kind = request.data.get("kind", "adjust")
    wallet, _ = Wallet.objects.get_or_create(user=user)
    wallet.balance = float(wallet.balance) + amount
    wallet.save()
    Transaction.objects.create(user=user, amount=amount, kind=kind,
                               note=request.data.get("note", ""))
    # award loyalty points on positive loads / bonuses
    if amount > 0 and kind in ("load", "bonus"):
        user.loyalty_points = (user.loyalty_points or 0) + int(amount // 10)
        user.save(update_fields=["loyalty_points"])
    Notification.objects.create(
        user=user, text=f"💰 Wallet {'credited' if amount >= 0 else 'debited'} "
        f"{abs(amount):g}", link="/dashboard")
    return Response({"balance": wallet.balance, "loyalty_points": user.loyalty_points})


@api_view(["GET"])
@permission_classes([IsAdminRole])
def top_games(request):
    rows = Game.objects.order_by("-clicks", "-views")[:10]
    return Response([{"name": g.name, "slug": g.slug, "clicks": g.clicks,
                      "views": g.views} for g in rows])


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
    """All-time ledger settlement: totals by kind + net + per-player balances."""
    from accounts.models import User
    totals = {}
    for k in ["load", "cashout", "bonus", "adjust"]:
        totals[k] = float(Transaction.objects.filter(kind=k).aggregate(
            s=Sum("amount"))["s"] or 0)
    total_balance = float(Wallet.objects.aggregate(s=Sum("balance"))["s"] or 0)
    all_cashouts = float(Cashout.objects.aggregate(s=Sum("amount"))["s"] or 0)
    pending = float(Cashout.objects.filter(status="pending").aggregate(
        s=Sum("amount"))["s"] or 0)
    players = []
    for w in Wallet.objects.select_related("user"):
        players.append({"player": w.user.username, "balance": float(w.balance),
                        "loyalty": w.user.loyalty_points,
                        "tier": w.user.vip_tier})
    players.sort(key=lambda x: x["balance"], reverse=True)
    return Response({
        "totals": totals,
        "net_liability": total_balance,
        "all_time_cashouts": all_cashouts,
        "pending_cashouts": pending,
        "total_profit": float(_profit_between()),
        "players": players,
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
