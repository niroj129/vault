import hashlib
import hmac
import secrets
import time

from django.core.cache import cache
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from content.models import SiteSettings
from gaming.models import Deposit
from . import parse, service
from .models import InboundEmail

HOURLY_LIMIT = 300


def _mailgun_ok(key, form):
    ts, token, sig = form.get("timestamp", ""), form.get("token", ""), form.get("signature", "")
    try:
        fresh = abs(time.time() - int(ts)) < 15 * 60
    except ValueError:
        return False
    want = hmac.new(key.encode(), f"{ts}{token}".encode(), hashlib.sha256).hexdigest()
    return fresh and hmac.compare_digest(want, sig)


@csrf_exempt
@require_POST
def inbound(request, token):
    """Webhook for forwarded email. The token in the address is the secret."""
    s = SiteSettings.load()
    if not s.inbound_mail_token or not secrets.compare_digest(token, s.inbound_mail_token):
        return HttpResponse(status=404)
    tenant = getattr(request, "tenant", None)
    key = f"mailin-rate:{tenant.id if tenant else 0}:{int(time.time() // 3600)}"
    if cache.get_or_set(key, 0, 3600) >= HOURLY_LIMIT:
        return HttpResponse("Too many emails this hour", status=429)
    cache.incr(key)
    body = request.body if "json" in (request.content_type or "") else b""
    form = request.POST.dict() if not body else {}
    if s.mailgun_signing_key and "signature" in form and not _mailgun_ok(s.mailgun_signing_key, form):
        return HttpResponse(status=403)
    mail = parse.normalize(request.content_type, body, form)
    if not mail:
        return JsonResponse({"ok": False, "detail": "Unrecognised payload"}, status=400)
    em, created = service.ingest(mail)
    return JsonResponse({"ok": True, "id": em.id, "duplicate": not created})


def email_dict(em, full=False):
    out = {"id": em.id, "from_email": em.from_email, "from_name": em.from_name, "subject": em.subject,
           "received_at": em.received_at, "kind": em.kind, "kind_label": em.get_kind_display(), "app": em.app,
           "amount": em.amount, "payer": em.payer, "note": em.note, "verified": em.verified, "match": em.match,
           "match_label": em.get_match_display(), "is_read": em.is_read, "archived": em.archived,
           "confirm_code": em.confirm_code, "confirm_link": em.confirm_link,
           "deposit": None, "preview": " ".join(em.text.split())[:140]}
    d = em.deposit
    if d:
        out["deposit"] = {"id": d.id, "code": d.code, "amount": d.amount, "status": d.status,
                          "status_label": "Checking payment" if d.status == "pending" else d.get_status_display(),
                          "username": d.user.username, "player_note": d.player_note,
                          "method": d.pay_method.name if d.pay_method_id and d.pay_method else d.method,
                          "created_at": d.created_at}
    if full:
        out.update(text=em.text, to=em.to, sent_at=em.sent_at, provider=em.provider,
                   linked_by=em.linked_by.username if em.linked_by_id and em.linked_by else "")
    return out


FILTERS = {
    "unmatched": Q(kind="payment", match="none"),
    "payments": Q(kind="payment"),
    "matched": Q(kind="payment", match__in=["code", "likely", "linked"]),
    "other": ~Q(kind="payment"),
    "all": Q(),
}


@api_view(["GET"])
@permission_classes([IsAdminRole])
def admin_list(request):
    f = request.query_params.get("filter") or "payments"
    base = InboundEmail.objects.select_related("deposit", "deposit__user", "deposit__pay_method")
    qs = base.filter(FILTERS.get(f, Q()))
    if request.query_params.get("archived") != "1":
        qs = qs.filter(archived=False)
    q = (request.query_params.get("q") or "").strip()
    if q:
        qs = qs.filter(Q(subject__icontains=q) | Q(payer__icontains=q) | Q(from_email__icontains=q)
                       | Q(text__icontains=q) | Q(deposit__user__username__icontains=q))
    live = base.filter(archived=False)
    return Response({
        "counts": {k: live.filter(v).count() for k, v in FILTERS.items()},
        "results": [email_dict(e) for e in qs[:100]],
    })


@api_view(["GET", "POST"])
@permission_classes([IsAdminRole])
def admin_detail(request, pk, act=None):
    em = get_object_or_404(InboundEmail.objects.select_related("deposit", "deposit__user", "linked_by"), pk=pk)
    if request.method == "GET":
        if not em.is_read:
            InboundEmail.objects.filter(pk=em.pk).update(is_read=True)
            em.is_read = True
        return Response(email_dict(em, full=True))
    if act == "link":
        dep = get_object_or_404(Deposit.objects.select_related("user"), pk=request.data.get("deposit"), gateway="direct")
        em.deposit, em.match, em.linked_by = dep, InboundEmail.Match.LINKED, request.user
        if em.kind != InboundEmail.Kind.PAYMENT:
            em.kind = InboundEmail.Kind.PAYMENT
    elif act == "unlink":
        em.deposit, em.match, em.linked_by = None, InboundEmail.Match.NONE if em.kind == "payment" else InboundEmail.Match.NA, request.user
    elif act == "archive":
        em.archived = not em.archived
    elif act == "rematch" and em.kind == InboundEmail.Kind.PAYMENT:
        em.deposit, em.match = service.find_match(em)
    else:
        return Response({"detail": "Unknown action."}, status=400)
    em.save()
    return Response(email_dict(em, full=True))


@api_view(["GET"])
@permission_classes([IsAdminRole])
def open_payments(request):
    """QR payments still waiting for a check, to link an email to by hand."""
    return Response([{"id": d.id, "code": d.code, "amount": d.amount, "username": d.user.username,
                      "player_note": d.player_note, "created_at": d.created_at,
                      "method": d.pay_method.name if d.pay_method_id and d.pay_method else d.method}
                     for d in service.candidates()[:50]])


@api_view(["GET", "POST"])
@permission_classes([IsAdminRole])
def setup(request):
    s = SiteSettings.load()
    if request.method == "POST":
        if request.data.get("action") == "regenerate" or not s.inbound_mail_token:
            s.inbound_mail_token = secrets.token_urlsafe(24)
        if "mailgun_signing_key" in request.data:
            s.mailgun_signing_key = (request.data.get("mailgun_signing_key") or "").strip()[:200]
        s.save()
    host = request.get_host()
    scheme = "https" if request.is_secure() else "http"
    last = InboundEmail.objects.order_by("-received_at").first()
    confirm = InboundEmail.objects.filter(kind=InboundEmail.Kind.GMAIL_CONFIRM).order_by("-received_at").first()
    return Response({
        "url": f"{scheme}://{host}/api/mail/inbound/{s.inbound_mail_token}/" if s.inbound_mail_token else "",
        "mailgun_signing_key_set": bool(s.mailgun_signing_key),
        "last_received_at": last.received_at if last else None,
        "total": InboundEmail.objects.count(),
        "gmail_confirm": {"code": confirm.confirm_code, "link": confirm.confirm_link,
                          "received_at": confirm.received_at} if confirm else None,
    })
