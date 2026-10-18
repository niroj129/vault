from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

from .context import reset_current_tenant, set_current_tenant
from .models import Domain, Tenant


def resolve_tenant(host, slug_override=None):
    """Find the tenant for a hostname. Unknown hosts fall back to the platform
    tenant when TENANT_FALLBACK is on (local dev, bare server IP)."""
    if slug_override and settings.DEBUG:
        t = Tenant.objects.filter(slug=slug_override).first()
        if t:
            return t
    host = (host or "").lower().split(":")[0]
    key = f"tenant-host:{host}"
    tenant_id = cache.get(key)
    if tenant_id is None:
        d = Domain.objects.filter(host=host).only("tenant_id").first()
        tenant_id = d.tenant_id if d else 0
        cache.set(key, tenant_id, 60)
    if tenant_id:
        return Tenant.objects.filter(pk=tenant_id).first()
    if settings.TENANT_FALLBACK:
        return Tenant.objects.filter(is_platform=True).first()
    return None


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/api/platform/domain-check/":
            return domain_check(request)
        if request.path == "/api/pay/bytepayout/webhook/":
            # payment webhooks find their site from the deposit reference,
            # so they work on any domain (gaming.views.bytepayout_webhook)
            request.tenant = None
            return self.get_response(request)
        tenant = resolve_tenant(request.get_host(),
                                request.headers.get("X-Tenant"))
        if tenant is None:
            return JsonResponse({"detail": "Unknown site."}, status=404)
        if not tenant.is_active and not request.path.startswith("/django-admin/"):
            return JsonResponse({"detail": "This site is suspended.",
                                 "suspended": True}, status=503)
        request.tenant = tenant
        token = set_current_tenant(tenant)
        try:
            return self.get_response(request)
        finally:
            reset_current_tenant(token)


def domain_check(request):
    """Caddy on-demand TLS "ask" hook: 200 only for domains of active tenants,
    so certificates are issued for client sites and nothing else."""
    host = (request.GET.get("domain") or "").lower().split(":")[0]
    ok = Domain.objects.filter(host=host, tenant__is_active=True).exists()
    return JsonResponse({"ok": ok}, status=200 if ok else 404)
