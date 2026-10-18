"""What the platform owner holds for each client site from the owner's BytePayout
account: net deposits (after BytePayout's fee) minus payouts the owner recorded.
Sites using their own BytePayout key are not in this ledger: their money goes
straight to their own account."""
from decimal import Decimal
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from chat import presence, push
from chat.events import push_to_users
from gaming import bytepayout
from gaming.models import Deposit
from .models import SitePayout, Tenant
from .ownerchat import IsSiteAdmin, _site_admin_ids
from .views import IsPlatformOwner

ZERO = Decimal("0")
Q2 = Decimal("0.01")


def held(tenant_id):
    """{paid_in, fees, net, paid_out, balance} for one site's owner-account deposits."""
    d = Deposit.all_tenants.filter(tenant_id=tenant_id, gateway="bytepayout", bp_account="owner",
                                   status=Deposit.Status.APPROVED).aggregate(s=Sum("amount"), f=Sum("fee_amount"), n=Count("id"))
    out = SitePayout.objects.filter(tenant_id=tenant_id).aggregate(s=Sum("amount"))["s"] or ZERO
    paid_in, fees = d["s"] or ZERO, d["f"] or ZERO
    net = paid_in - fees
    return {"paid_in": paid_in, "fees": fees, "net": net, "paid_out": out, "balance": net - out, "payments": d["n"]}


def payout_dict(p):
    return {"id": p.id, "amount": p.amount, "note": p.note, "created_at": p.created_at}


@api_view(["GET"])
@permission_classes([IsSiteAdmin])
def site_summary(request):
    """A site admin's BytePayout page: their balance and every BytePayout payment."""
    t = request.tenant
    _key, _base, _secret, acct = bytepayout.credentials()
    live, error = None, ""
    if acct == "own":
        try:
            live = bytepayout.balance()
        except bytepayout.PayError as e:
            error = str(e)
    since = timezone.now() - timedelta(days=30)
    qs = Deposit.objects.filter(gateway="bytepayout")
    month = qs.filter(created_at__gte=since).aggregate(
        paid=Sum("amount", filter=Q(status="approved")), n=Count("id", filter=Q(status="approved")),
        fees=Sum("fee_amount", filter=Q(status="approved")), waiting=Count("id", filter=Q(status="pending")))
    recent = [{"id": d.id, "at": d.created_at, "username": d.user.username, "game": d.game.name if d.game else "",
               "method": bytepayout.METHODS.get(d.method, d.method.title()), "amount": d.amount, "fee": d.fee_amount,
               "status": d.status, "status_label": d.get_status_display(), "load_status": d.load_status,
               "load_label": d.get_load_status_display(), "account": d.bp_account}
              for d in qs.select_related("user", "game").order_by("-created_at")[:20]]
    return Response({
        "account": acct or "none", "live": live, "error": error,
        "held": held(t.id) if acct == "owner" else None,
        "month": {"paid": month["paid"] or ZERO, "count": month["n"], "fees": month["fees"] or ZERO, "waiting": month["waiting"]},
        "payouts": [payout_dict(p) for p in SitePayout.objects.filter(tenant=t)[:20]] if acct == "owner" else [],
        "recent": recent,
    })


@api_view(["POST"])
@permission_classes([IsPlatformOwner])
def record_payout(request):
    """The owner records money they paid out to a site. It lowers what's held for it."""
    site = Tenant.objects.filter(pk=request.data.get("site"), is_platform=False).first()
    if not site:
        return Response({"detail": "Pick a client site."}, status=400)
    try:
        amount = Decimal(str(request.data.get("amount"))).quantize(Q2)
        assert amount > 0
    except Exception:
        return Response({"detail": "Enter the amount you paid out."}, status=400)
    owed = held(site.id)["balance"]
    if amount > owed:
        return Response({"detail": f"{site.name} is only owed ${owed:.2f}."}, status=400)
    p = SitePayout.objects.create(tenant=site, amount=amount, note=(request.data.get("note") or "")[:200], created_by=request.user)
    ids = _site_admin_ids(site)
    text = f"${amount:.2f} was paid out to you from your BytePayout balance." + (f" {p.note}" if p.note else "")
    push_to_users(ids, {"type": "toast", "title": "BytePayout payout", "text": text, "link": "/admin/bytepayout", "tone": "ok", "staff": True})
    offline = set(ids) - presence.online_ids(set(ids))
    if offline:
        push.notify(offline, "BytePayout payout", text, "/admin/bytepayout", tag=f"payout-{p.id}")
    return Response({**payout_dict(p), "balance": held(site.id)["balance"]}, status=201)
