"""Platform panel API — the owner sells and manages casino sites (tenants).

Only the platform tenant's superusers (User.is_platform_owner) can call it.
"""

import re

from django.core.cache import cache
from django.core.management import call_command
from django.db import transaction
from django.db.models import Count, Sum
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from accounts.models import User
from content.models import BusinessInfo, SiteSettings
from .context import use_tenant
from .models import Domain, Tenant

HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$")


class IsPlatformOwner(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_platform_owner)


def clean_hosts(raw):
    hosts = []
    for h in raw or []:
        h = str(h).strip().lower()
        h = re.sub(r"^https?://", "", h).split("/")[0].split(":")[0]
        if not h:
            continue
        if not HOST_RE.match(h):
            raise serializers.ValidationError({"domains": f"“{h}” isn't a valid domain."})
        hosts.append(h)
    return hosts


class TenantSerializer(serializers.ModelSerializer):
    domains = serializers.ListField(child=serializers.CharField(), required=False,
                                    write_only=True)
    user_count = serializers.IntegerField(read_only=True, default=0)
    admin_username = serializers.CharField(write_only=True, required=False)
    admin_password = serializers.CharField(write_only=True, required=False,
                                           min_length=6)
    seed_demo = serializers.BooleanField(write_only=True, required=False,
                                         default=True)
    color_accent = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Tenant
        fields = ["id", "name", "slug", "is_platform", "is_active", "plan",
                  "use_owner_bytepayout", "feature_games", "feature_messenger", "feature_sms",
                  "feature_payments", "max_users", "monthly_price",
                  "paid_until", "owner_email", "notes", "created_at",
                  "domains", "user_count", "admin_username", "admin_password",
                  "seed_demo", "color_accent"]
        read_only_fields = ["id", "is_platform", "created_at"]

    def to_representation(self, obj):
        data = super().to_representation(obj)
        data["domains"] = [d.host for d in obj.domains.all()]
        return data

    def validate_domains(self, value):
        hosts = clean_hosts(value)
        taken = Domain.objects.filter(host__in=hosts)
        if self.instance:
            taken = taken.exclude(tenant=self.instance)
        if taken.exists():
            raise serializers.ValidationError(
                f"{taken.first().host} is already used by another site.")
        return hosts

    def validate(self, attrs):
        if not self.instance:
            if not attrs.get("domains"):
                raise serializers.ValidationError(
                    {"domains": "Add at least one domain for the new site."})
            if not attrs.get("admin_username") or not attrs.get("admin_password"):
                raise serializers.ValidationError(
                    {"admin_username": "Set the operator's admin username and password."})
        return attrs

    @transaction.atomic
    def create(self, data):
        hosts = data.pop("domains")
        username = data.pop("admin_username")
        password = data.pop("admin_password")
        seed_demo = data.pop("seed_demo", True)
        accent = data.pop("color_accent", "")
        # a new site gets its BytePayout account under the owner's by default
        data.setdefault("use_owner_bytepayout", True)
        tenant = Tenant.objects.create(**data)
        for i, h in enumerate(hosts):
            Domain.objects.create(tenant=tenant, host=h, is_primary=(i == 0))
            cache.delete(f"tenant-host:{h}")
        with use_tenant(tenant):
            admin = User(username=username, role=User.Role.ADMIN,
                         full_name=f"{tenant.name} Admin",
                         email=tenant.owner_email)
            admin.set_password(password)
            admin.save()
            s = SiteSettings.load()
            s.site_name = tenant.name
            if accent:
                s.color_accent = accent
            s.save()
            b = BusinessInfo.load()
            b.business_name = tenant.name
            if tenant.owner_email:
                b.email = tenant.owner_email
            b.save()
        if seed_demo:
            transaction.on_commit(lambda: call_command(
                "seed", tenant=tenant.slug, no_users=True, verbosity=0))
        return tenant

    @transaction.atomic
    def update(self, tenant, data):
        hosts = data.pop("domains", None)
        for k in ("admin_username", "admin_password", "seed_demo", "color_accent"):
            data.pop(k, None)
        if tenant.is_platform:
            data["is_active"] = True  # never lock yourself out
        for k, v in data.items():
            setattr(tenant, k, v)
        tenant.save()
        if hosts is not None:
            old = set(tenant.domains.values_list("host", flat=True))
            tenant.domains.exclude(host__in=hosts).delete()
            for i, h in enumerate(hosts):
                Domain.objects.update_or_create(
                    host=h, defaults={"tenant": tenant, "is_primary": i == 0})
            for h in old | set(hosts):
                cache.delete(f"tenant-host:{h}")
        return tenant


class TenantViewSet(viewsets.ModelViewSet):
    serializer_class = TenantSerializer
    permission_classes = [IsPlatformOwner]

    def get_queryset(self):
        return (Tenant.objects.prefetch_related("domains")
                .annotate(user_count=Count("users")))

    def destroy(self, request, *args, **kwargs):
        tenant = self.get_object()
        if tenant.is_platform:
            return Response({"detail": "The platform site can't be deleted."},
                            status=status.HTTP_400_BAD_REQUEST)
        if request.query_params.get("confirm") != tenant.slug:
            return Response({"detail": "Type the site's slug to confirm."},
                            status=status.HTTP_400_BAD_REQUEST)
        for h in tenant.domains.values_list("host", flat=True):
            cache.delete(f"tenant-host:{h}")
        tenant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def platform_stats(request):
    clients = Tenant.objects.filter(is_platform=False)
    active = clients.filter(is_active=True)
    return Response({
        "tenants": clients.count(),
        "active": active.count(),
        "suspended": clients.filter(is_active=False).count(),
        "mrr": active.aggregate(m=Sum("monthly_price"))["m"] or 0,
        "users": User.all_tenants.filter(tenant__is_platform=False).count(),
    })


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def platform_usage(request):
    """Per-site activity over the last 30 days."""
    from datetime import timedelta
    from django.db.models import Count, Max
    from django.utils import timezone
    from chat.models import ChatMessage
    from content.models import GameTxn, Transaction
    since = timezone.now() - timedelta(days=30)

    def per_tenant(qs):
        return dict(qs.values_list("tenant").annotate(n=Count("id")))

    players = per_tenant(User.all_tenants.filter(role="user"))
    active = per_tenant(User.all_tenants.filter(role="user",
                                                last_login__gte=since))
    msgs = per_tenant(ChatMessage.all_tenants.filter(created_at__gte=since)
                      .exclude(kind="system"))
    loads = per_tenant(Transaction.all_tenants.filter(
        created_at__gte=since, kind="load"))
    game_ops = per_tenant(GameTxn.all_tenants.filter(created_at__gte=since))
    seen = dict(User.all_tenants.values_list("tenant")
                .annotate(m=Max("last_login")))
    rows = []
    for t in Tenant.objects.order_by("-is_platform", "name"):
        rows.append({
            "id": t.id, "name": t.name, "slug": t.slug,
            "is_platform": t.is_platform, "is_active": t.is_active,
            "players": players.get(t.id, 0),
            "active_players": active.get(t.id, 0),
            "messages": msgs.get(t.id, 0),
            "loads": loads.get(t.id, 0) + game_ops.get(t.id, 0),
            "last_activity": seen.get(t.id),
        })
    return Response(rows)
