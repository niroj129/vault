"""Owner analytics across every casino site: who plays what, how much money
came in, through which payment method, and what went back out.

Owner-only (IsPlatformOwner). Reads every tenant through `all_tenants`.
"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Max, Q, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import User
from catalog.models import GameLogin
from gaming import bytepayout
from gaming.models import Deposit, Redeem
from .models import Tenant
from . import bpledger
from .views import IsPlatformOwner

PERIODS = {"7": 7, "30": 30, "90": 90, "365": 365}
ZERO = Decimal("0")


def _period(request):
    days = PERIODS.get(request.query_params.get("days") or "30", 30)
    since = timezone.now() - timedelta(days=days)
    return days, since


def _site_filter(request):
    """Optional ?site=<tenant id> narrows everything to one site."""
    sid = request.query_params.get("site")
    return {"tenant_id": int(sid)} if sid and sid.isdigit() else {}


def method_label(gateway, method, pay_method_name):
    if pay_method_name:
        return pay_method_name
    if gateway == "manual":
        return f"Recorded by staff ({method or 'cash'})"
    return bytepayout.METHODS.get(method, (method or "Other").title())


def status_label(d):
    """Same wording staff see in Deposits: a QR payment waiting for a check is "Checking payment"."""
    if d.gateway == "direct" and d.status == Deposit.Status.PENDING:
        return "Checking payment"
    if d.gateway == "direct" and d.status == Deposit.Status.REJECTED:
        return "Not found"
    return d.get_status_display()


def _paid_deposits(**f):
    return Deposit.all_tenants.filter(status=Deposit.Status.APPROVED, **f)


def _paid_redeems(**f):
    return Redeem.all_tenants.filter(status=Redeem.Status.PAID, **f)


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def overview(request):
    days, since = _period(request)
    site = _site_filter(request)
    today = timezone.localdate()

    tenants = Tenant.objects.all()
    clients = tenants.filter(is_platform=False)
    deps = _paid_deposits(approved_at__gte=since, **site)
    reds = _paid_redeems(handled_at__gte=since, **site)
    players = User.all_tenants.filter(role="user", **site)

    dep_tot = deps.aggregate(s=Sum("amount"), n=Count("id"))
    red_tot = reds.aggregate(s=Sum("amount"), n=Count("id"))
    dep_sum, red_sum = dep_tot["s"] or ZERO, red_tot["s"] or ZERO

    # daily money in / out
    din = dict(deps.annotate(d=TruncDate("approved_at")).values_list("d").annotate(s=Sum("amount")))
    dout = dict(reds.annotate(d=TruncDate("handled_at")).values_list("d").annotate(s=Sum("amount")))
    daily = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        daily.append({"date": d, "deposits": din.get(d, ZERO), "cashouts": dout.get(d, ZERO)})

    # per site
    def by_tenant(qs, agg):
        return {r["tenant_id"]: r for r in qs.values("tenant_id").annotate(**agg)}
    s_dep = by_tenant(_paid_deposits(approved_at__gte=since), {"s": Sum("amount"), "n": Count("id")})
    s_red = by_tenant(_paid_redeems(handled_at__gte=since), {"s": Sum("amount")})
    s_pl = by_tenant(User.all_tenants.filter(role="user"), {
        "n": Count("id"), "new": Count("id", filter=Q(date_joined__gte=since)),
        "seen": Max("last_login")})
    sites = []
    for t in tenants.order_by("-is_platform", "name"):
        di, ro, pl = s_dep.get(t.id, {}), s_red.get(t.id, {}), s_pl.get(t.id, {})
        din_, dout_ = di.get("s") or ZERO, ro.get("s") or ZERO
        sites.append({
            "id": t.id, "name": t.name, "slug": t.slug, "is_platform": t.is_platform,
            "is_active": t.is_active, "plan": t.plan, "paid_until": t.paid_until,
            "overdue": bool(t.paid_until and t.paid_until < today and not t.is_platform),
            "players": pl.get("n", 0), "new_players": pl.get("new", 0), "last_seen": pl.get("seen"),
            "deposits": din_, "deposit_count": di.get("n", 0), "cashouts": dout_, "net": din_ - dout_,
        })

    # per game (games are per site; group by name across sites)
    games = []
    for r in (deps.exclude(game=None).values("game__name")
              .annotate(s=Sum("amount"), n=Count("id"), players=Count("user", distinct=True),
                        sites=Count("tenant", distinct=True)).order_by("-s")[:20]):
        games.append({"name": r["game__name"], "deposits": r["s"], "deposit_count": r["n"],
                      "players": r["players"], "sites": r["sites"]})
    accounts = dict(GameLogin.all_tenants.filter(**site).values_list("game__name").annotate(n=Count("id")))
    for g in games:
        g["accounts"] = accounts.get(g["name"], 0)

    # per payment method
    methods = {}
    for r in deps.values("gateway", "method", "pay_method__name").annotate(s=Sum("amount"), n=Count("id")):
        label = method_label(r["gateway"], r["method"], r["pay_method__name"])
        kind = {"direct": "Your QR", "bytepayout": "BytePayout", "manual": "Staff"}.get(r["gateway"], r["gateway"])
        m = methods.setdefault((label, kind), {"label": label, "via": kind, "amount": ZERO, "count": 0})
        m["amount"] += r["s"] or ZERO
        m["count"] += r["n"]

    recent = []
    for d in (Deposit.all_tenants.filter(**site).select_related("tenant", "user", "game", "pay_method")
              .order_by("-created_at")[:15]):
        recent.append({
            "id": d.id, "site": d.tenant.name if d.tenant_id else "", "username": d.user.username,
            "game": d.game.name if d.game else "", "amount": d.amount, "status": d.status,
            "status_label": status_label(d), "load_status": d.load_status, "load_label": d.get_load_status_display(),
            "method": method_label(d.gateway, d.method, d.pay_method.name if d.pay_method_id else ""),
            "created_at": d.created_at,
        })

    waiting = Deposit.all_tenants.filter(**site)
    return Response({
        "days": days,
        "kpis": {
            "sites": clients.count(), "sites_active": clients.filter(is_active=True).count(),
            "sites_overdue": clients.filter(paid_until__lt=today, is_active=True).count(),
            "mrr": clients.filter(is_active=True).aggregate(m=Sum("monthly_price"))["m"] or ZERO,
            "players": players.count(), "new_players": players.filter(date_joined__gte=since).count(),
            "active_players": players.filter(last_login__gte=since).count(),
            "deposits": dep_sum, "deposit_count": dep_tot["n"],
            "cashouts": red_sum, "cashout_count": red_tot["n"], "net": dep_sum - red_sum,
            "to_check": waiting.filter(status=Deposit.Status.PENDING, gateway="direct").count(),
            "to_load": waiting.filter(status=Deposit.Status.APPROVED,
                                      load_status__in=[Deposit.Load.MANUAL, Deposit.Load.FAILED]).count(),
            "cashouts_waiting": Redeem.all_tenants.filter(status=Redeem.Status.PENDING, **site).count(),
        },
        "daily": daily,
        "sites": sites,
        "games": games,
        "methods": sorted(methods.values(), key=lambda m: -m["amount"]),
        "recent": recent,
    })


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def players(request):
    """Every player on every site with their games and money totals."""
    site = _site_filter(request)
    q = (request.query_params.get("q") or "").strip()
    qs = User.all_tenants.filter(role="user", **site).select_related("tenant")
    if q:
        qs = qs.filter(Q(username__icontains=q) | Q(full_name__icontains=q)
                       | Q(email__icontains=q) | Q(phone__icontains=q)
                       | Q(game_logins__username__icontains=q)).distinct()
    sort = request.query_params.get("sort") or "deposits"
    qs = qs.annotate(
        dep_n=Count("deposits", filter=Q(deposits__status=Deposit.Status.APPROVED), distinct=True),
        last_dep=Max("deposits__approved_at"),
    )
    order = {"deposits": "-dep_n", "new": "-date_joined", "seen": "-last_login", "name": "username"}.get(sort, "-dep_n")
    rows = list(qs.order_by(order, "-date_joined")[:300])
    ids = [u.id for u in rows]
    # sums done separately so joins on deposits and redeems can't multiply each other
    dep = dict(_paid_deposits(user_id__in=ids).values_list("user_id").annotate(s=Sum("amount")))
    red = dict(_paid_redeems(user_id__in=ids).values_list("user_id").annotate(s=Sum("amount")))
    logins = {}
    for lg in GameLogin.all_tenants.filter(user_id__in=ids).select_related("game").order_by("game__name"):
        logins.setdefault(lg.user_id, []).append({"game": lg.game.name, "username": lg.username})
    out = [{
        "id": u.id, "username": u.username, "full_name": u.full_name, "site": u.tenant.name if u.tenant_id else "",
        "site_id": u.tenant_id, "is_active": u.is_active, "date_joined": u.date_joined, "last_login": u.last_login,
        "deposits": dep.get(u.id, ZERO), "deposit_count": u.dep_n, "cashouts": red.get(u.id, ZERO),
        "last_deposit": u.last_dep, "games": logins.get(u.id, []),
    } for u in rows]
    if sort == "deposits":
        out.sort(key=lambda r: (-r["deposits"], -r["deposit_count"]))
    return Response({"count": qs.count(), "results": out})


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def player_detail(request, pk):
    u = get_object_or_404(User.all_tenants.select_related("tenant"), pk=pk, role="user")
    deps = (Deposit.all_tenants.filter(user=u).select_related("game", "pay_method").order_by("-created_at")[:30])
    reds = Redeem.all_tenants.filter(user=u).select_related("game").order_by("-created_at")[:30]
    return Response({
        "id": u.id, "username": u.username, "full_name": u.full_name, "email": u.email, "phone": u.phone,
        "site": u.tenant.name if u.tenant_id else "", "is_active": u.is_active,
        "date_joined": u.date_joined, "last_login": u.last_login,
        "agent": u.agent.username if u.agent_id else "",
        "games": [{"game": lg.game.name, "username": lg.username}
                  for lg in GameLogin.all_tenants.filter(user=u).select_related("game")],
        "deposits": [{"id": d.id, "amount": d.amount, "game": d.game.name if d.game else "",
                      "method": method_label(d.gateway, d.method, d.pay_method.name if d.pay_method_id else ""),
                      "status": d.status, "status_label": status_label(d), "load_status": d.load_status, "load_label": d.get_load_status_display(),
                      "loaded_amount": d.loaded_amount, "created_at": d.created_at} for d in deps],
        "cashouts": [{"id": r.id, "amount": r.amount, "game": r.game.name if r.game else "",
                      "method": r.payout_method, "status": r.status, "status_label": r.get_status_display(),
                      "created_at": r.created_at} for r in reds],
    })


def _page(request, default=100):
    try:
        return max(1, min(int(request.query_params.get("limit") or default), 300))
    except ValueError:
        return default


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def transactions(request):
    """Every deposit and cash out on every site, newest first.
    ?site= ?kind=deposit|cashout ?status= ?q= ?days="""
    site = _site_filter(request)
    kind = request.query_params.get("kind") or "all"
    status = request.query_params.get("status") or ""
    q = (request.query_params.get("q") or "").strip()
    days = request.query_params.get("days")
    since = timezone.now() - timedelta(days=int(days)) if days and days.isdigit() else None
    limit = _page(request)
    rows = []

    if kind in ("all", "deposit"):
        qs = Deposit.all_tenants.filter(**site).select_related("tenant", "user", "game", "pay_method")
        if since:
            qs = qs.filter(created_at__gte=since)
        if status:
            qs = qs.filter(status=status) if status in {c for c, _ in Deposit.Status.choices} else qs.none()
        if q:
            qs = qs.filter(Q(user__username__icontains=q) | Q(reference__icontains=q) | Q(game__name__icontains=q))
        for d in qs.order_by("-created_at")[:limit]:
            rows.append({
                "key": f"d{d.id}", "kind": "deposit", "at": d.created_at, "site": d.tenant.name if d.tenant_id else "",
                "username": d.user.username, "game": d.game.name if d.game else "", "amount": d.amount,
                "loaded_amount": d.loaded_amount, "status": d.status, "status_label": status_label(d),
                "load_status": d.load_status, "load_label": d.get_load_status_display(),
                "method": method_label(d.gateway, d.method, d.pay_method.name if d.pay_method_id else ""),
                "via": {"direct": "Your QR", "bytepayout": "BytePayout", "manual": "Staff"}.get(d.gateway, d.gateway),
            })

    if kind in ("all", "cashout"):
        qs = Redeem.all_tenants.filter(**site).select_related("tenant", "user", "game")
        if since:
            qs = qs.filter(created_at__gte=since)
        if status:
            qs = qs.filter(status=status) if status in {c for c, _ in Redeem.Status.choices} else qs.none()
        if q:
            qs = qs.filter(Q(user__username__icontains=q) | Q(game__name__icontains=q) | Q(payout_handle__icontains=q))
        for r in qs.order_by("-created_at")[:limit]:
            rows.append({
                "key": f"r{r.id}", "kind": "cashout", "at": r.created_at, "site": r.tenant.name if r.tenant_id else "",
                "username": r.user.username, "game": r.game.name if r.game else "", "amount": r.amount,
                "loaded_amount": None, "status": r.status, "status_label": r.get_status_display(),
                "load_status": "", "load_label": "", "method": r.payout_method, "via": "Cash out",
            })

    rows.sort(key=lambda x: x["at"], reverse=True)
    rows = rows[:limit]
    dep_sum = sum((x["amount"] for x in rows if x["kind"] == "deposit" and x["status"] == "approved"), ZERO)
    out_sum = sum((x["amount"] for x in rows if x["kind"] == "cashout" and x["status"] == "paid"), ZERO)
    return Response({"results": rows, "totals": {"paid_in": dep_sum, "paid_out": out_sum, "shown": len(rows)}})


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def games(request):
    """Each site's games with how they're doing: accounts, plays, money."""
    from catalog.models import Game
    site = _site_filter(request)
    since = timezone.now() - timedelta(days=PERIODS.get(request.query_params.get("days") or "30", 30))
    gs = Game.all_tenants.filter(**site).select_related("tenant", "provider")
    acc = dict(GameLogin.all_tenants.filter(**site).values_list("game_id").annotate(n=Count("id")))
    paid = {r["game_id"]: r for r in _paid_deposits(approved_at__gte=since, **site).exclude(game=None)
            .values("game_id").annotate(s=Sum("amount"), n=Count("id"), p=Count("user", distinct=True))}
    out = {r["game_id"]: r["s"] for r in _paid_redeems(handled_at__gte=since, **site).exclude(game=None)
           .values("game_id").annotate(s=Sum("amount"))}
    rows = []
    for g in gs.order_by("tenant__name", "sort_order", "name"):
        p = paid.get(g.id, {})
        rows.append({
            "id": g.id, "name": g.name, "site": g.tenant.name if g.tenant_id else "", "site_id": g.tenant_id,
            "status": g.status, "category": g.category.name if g.category_id else "",
            "platform": g.provider.name if g.provider_id else "", "accounts": acc.get(g.id, 0),
            "clicks": g.clicks, "views": g.views, "deposits": p.get("s") or ZERO, "deposit_count": p.get("n", 0),
            "payers": p.get("p", 0), "cashouts": out.get(g.id, ZERO),
            "net": (p.get("s") or ZERO) - (out.get(g.id) or ZERO),
        })
    rows.sort(key=lambda r: (-float(r["deposits"]), r["site"], r["name"]))
    return Response({"results": rows, "count": len(rows)})


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def bytepayout_account(request):
    """The owner's BytePayout merchant account and every BytePayout payment on every site.
    Read-only: the balance call is a GET and nothing here moves money."""
    from content.models import SiteSettings
    from .context import use_tenant
    days, since = _period(request)
    owner = Tenant.objects.filter(is_platform=True).first()
    with use_tenant(owner):
        o = SiteSettings.load()
        balance, error = None, ""
        if o.bp_api_key:
            try:
                balance = bytepayout.balance()
            except bytepayout.PayError as e:
                error = str(e)
    host = request.get_host()
    scheme = "https" if request.is_secure() else "http"
    own_keys = dict(SiteSettings.all_tenants.exclude(bp_api_key="").values_list("tenant_id").annotate(n=Count("id")))
    bp = Deposit.all_tenants.filter(gateway="bytepayout")
    per = {r["tenant_id"]: r for r in bp.filter(created_at__gte=since).values("tenant_id").annotate(
        paid=Sum("amount", filter=Q(status="approved")), paid_n=Count("id", filter=Q(status="approved")),
        fees=Sum("fee_amount", filter=Q(status="approved")), waiting=Count("id", filter=Q(status="pending")),
        failed=Count("id", filter=Q(status__in=["expired", "rejected", "failed"])))}
    sites = []
    for t in Tenant.objects.order_by("-is_platform", "name"):
        if t.id in own_keys:
            acct = "own"
        elif t.use_owner_bytepayout and not t.is_platform and o.bp_api_key:
            acct = "owner"
        else:
            acct = "none"
        r = per.get(t.id, {})
        h = bpledger.held(t.id) if acct == "owner" or t.use_owner_bytepayout else None
        sites.append({"id": t.id, "name": t.name, "is_platform": t.is_platform, "is_active": t.is_active, "account": acct,
                      "owed": h["balance"] if h else None, "paid_out": h["paid_out"] if h else None,
                      "use_owner": t.use_owner_bytepayout, "paid": r.get("paid") or ZERO, "paid_count": r.get("paid_n", 0),
                      "fees": r.get("fees") or ZERO, "waiting": r.get("waiting", 0), "failed": r.get("failed", 0)})
    in_period = bp.filter(created_at__gte=since)
    by_method = {}
    for r in in_period.filter(status="approved").values("method").annotate(s=Sum("amount"), n=Count("id")):
        by_method[r["method"]] = {"label": bytepayout.METHODS.get(r["method"], r["method"].title()), "amount": r["s"], "count": r["n"]}
    status_counts = dict(in_period.values_list("status").annotate(n=Count("id")))
    recent = [{"id": d.id, "at": d.created_at, "site": d.tenant.name if d.tenant_id else "", "username": d.user.username,
               "game": d.game.name if d.game else "", "amount": d.amount, "fee": d.fee_amount,
               "method": bytepayout.METHODS.get(d.method, d.method.title()), "status": d.status,
               "status_label": d.get_status_display(), "load_status": d.load_status, "load_label": d.get_load_status_display(),
               "account": next((s["account"] for s in sites if s["id"] == d.tenant_id), "none")}
              for d in bp.select_related("tenant", "user", "game").order_by("-created_at")[:25]]
    paid = in_period.filter(status="approved").aggregate(s=Sum("amount"), f=Sum("fee_amount"), n=Count("id"))
    return Response({
        "days": days,
        "account": {"configured": bool(o.bp_api_key), "webhook_secret_set": bool(o.bp_webhook_secret), "base_url": o.bp_base_url,
                    "balance": balance, "error": error, "webhook_url": f"{scheme}://{host}/api/pay/bytepayout/webhook/",
                    "sites_using": sum(1 for s in sites if s["account"] == "owner"),
                    "owed_total": sum((s["owed"] or ZERO for s in sites), ZERO)},
        "totals": {"paid": paid["s"] or ZERO, "fees": paid["f"] or ZERO, "paid_count": paid["n"],
                   "waiting": status_counts.get("pending", 0),
                   "failed": sum(status_counts.get(k, 0) for k in ("expired", "rejected", "failed"))},
        "sites": sites,
        "methods": sorted(by_method.values(), key=lambda m: -(m["amount"] or 0)),
        "recent": recent,
    })
