"""Chat between each client site's admins and the platform owner (super admin).

One thread per site. Messages never touch the players' messenger. Both sides
get live events over the existing websocket, plus Web Push when offline."""
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from accounts.models import User
from chat import presence, push
from chat.events import push_to_users
from .models import OwnerMessage, OwnerThread, Tenant
from .views import IsPlatformOwner

MAX_LEN = 4000
PER_MINUTE = 20


class IsSiteAdmin(BasePermission):
    """An admin of a client site (not the platform owner's own site)."""
    def has_permission(self, request, view):
        u = request.user
        t = getattr(request, "tenant", None)
        return bool(u and u.is_authenticated and u.role == "admin" and t and not t.is_platform)


def _owner_ids():
    return list(User.all_tenants.filter(is_superuser=True, is_active=True, tenant__is_platform=True)
                .values_list("id", flat=True))


def _site_admin_ids(tenant):
    return list(User.all_tenants.filter(tenant=tenant, role="admin", is_active=True).values_list("id", flat=True))


def message_dict(m):
    return {"id": m.id, "from_owner": m.from_owner, "body": m.body, "created_at": m.created_at, "read": m.read,
            "sender": "Platform owner" if m.from_owner else (m.sender.full_name or m.sender.username if m.sender_id and m.sender else "Site admin")}


def _limited(user):
    key = f"ownerchat:{user.id}"
    n = cache.get_or_set(key, 0, 60)
    if n >= PER_MINUTE:
        return True
    cache.incr(key)
    return False


def _send(thread, user, body, from_owner):
    body = (body or "").strip()
    if not body:
        return None, "Write a message first."
    if len(body) > MAX_LEN:
        return None, f"Messages can be up to {MAX_LEN} characters."
    if _limited(user):
        return None, "You're sending too fast. Wait a moment."
    with transaction.atomic():
        m = OwnerMessage.objects.create(thread=thread, sender=user, from_owner=from_owner, body=body)
        OwnerThread.objects.filter(pk=thread.pk).update(updated_at=m.created_at)
    to = _site_admin_ids(thread.tenant) if from_owner else _owner_ids()
    link = "/admin/support" if from_owner else f"/platform/messages?site={thread.tenant_id}"
    title = "Platform owner" if from_owner else f"{thread.tenant.name}"
    payload = {"type": "owner_chat", "thread": thread.tenant_id, "message": message_dict(m)}
    push_to_users(to, payload)
    push_to_users(to, {"type": "toast", "title": title, "text": body[:140], "link": link, "tone": "info", "staff": True})
    offline = set(to) - presence.online_ids(set(to))
    if offline:
        push.notify(offline, title, body[:140], link, tag=f"ownerchat-{thread.tenant_id}")
    return m, ""


def _messages(thread, request):
    qs = thread.messages.select_related("sender")
    after = request.query_params.get("after")
    if after and after.isdigit():
        qs = qs.filter(id__gt=int(after))
        return list(qs[:200])
    return list(qs.order_by("-id")[:100])[::-1]


# ------------------------------------------------------------- site side

@api_view(["GET", "POST"])
@permission_classes([IsSiteAdmin])
def site_thread(request):
    thread, _ = OwnerThread.objects.get_or_create(tenant=request.tenant)
    if request.method == "POST":
        m, err = _send(thread, request.user, request.data.get("body"), from_owner=False)
        if err:
            return Response({"detail": err}, status=400)
        return Response(message_dict(m), status=201)
    msgs = _messages(thread, request)
    return Response({"results": [message_dict(m) for m in msgs],
                     "unread": thread.messages.filter(from_owner=True, read=False).count()})


@api_view(["POST"])
@permission_classes([IsSiteAdmin])
def site_read(request):
    thread = OwnerThread.objects.filter(tenant=request.tenant).first()
    if thread:
        thread.messages.filter(from_owner=True, read=False).update(read=True)
    return Response({"ok": True})


def site_unread(tenant):
    return OwnerMessage.objects.filter(thread__tenant=tenant, from_owner=True, read=False).count()


# ------------------------------------------------------------ owner side

@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def owner_threads(request):
    """Every client site, with its last message and how many are unread by the owner."""
    q = (request.query_params.get("q") or "").strip()
    sites = Tenant.objects.filter(is_platform=False)
    if q:
        sites = sites.filter(Q(name__icontains=q) | Q(slug__icontains=q))
    unread = dict(OwnerMessage.objects.filter(from_owner=False, read=False).values_list("thread__tenant_id").annotate(n=Count("id")))
    last = {m.thread.tenant_id: m for m in OwnerMessage.objects.filter(
        id__in=[x for x in OwnerMessage.objects.values("thread").annotate(i=Max("id")).values_list("i", flat=True)]).select_related("thread", "sender")}
    rows = []
    for t in sites:
        m = last.get(t.id)
        rows.append({"id": t.id, "name": t.name, "slug": t.slug, "is_active": t.is_active, "unread": unread.get(t.id, 0),
                     "last": message_dict(m) if m else None, "last_at": m.created_at if m else None})
    rows.sort(key=lambda r: (r["last_at"] is None, -(r["last_at"].timestamp() if r["last_at"] else 0), r["name"].lower()))
    return Response({"results": rows, "unread": sum(unread.values())})


@api_view(["GET", "POST"])
@permission_classes([IsPlatformOwner])
def owner_thread(request, tenant_id):
    tenant = get_object_or_404(Tenant, pk=tenant_id, is_platform=False)
    thread, _ = OwnerThread.objects.get_or_create(tenant=tenant)
    if request.method == "POST":
        m, err = _send(thread, request.user, request.data.get("body"), from_owner=True)
        if err:
            return Response({"detail": err}, status=400)
        return Response(message_dict(m), status=201)
    msgs = _messages(thread, request)
    return Response({"site": {"id": tenant.id, "name": tenant.name, "is_active": tenant.is_active,
                              "admins": list(User.all_tenants.filter(tenant=tenant, role="admin", is_active=True).values_list("username", flat=True))},
                     "results": [message_dict(m) for m in msgs]})


@api_view(["POST"])
@permission_classes([IsPlatformOwner])
def owner_read(request, tenant_id):
    OwnerMessage.objects.filter(thread__tenant_id=tenant_id, from_owner=False, read=False).update(read=True)
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def owner_unread(request):
    return Response({"unread": OwnerMessage.objects.filter(from_owner=False, read=False).count()})
