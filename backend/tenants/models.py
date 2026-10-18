from django.contrib.auth.models import UserManager
from django.core.cache import cache
from django.db import models

from .context import get_current_tenant


class Tenant(models.Model):
    """One white-label casino sold to an operator.

    The platform tenant (is_platform=True) is the owner's own site; its
    superusers manage every other tenant from the Platform panel.
    """

    class Plan(models.TextChoices):
        STARTER = "starter", "Starter"
        PRO = "pro", "Pro"
        ENTERPRISE = "enterprise", "Enterprise"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=60, unique=True)
    is_platform = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True,
                                    help_text="Suspended tenants' sites go offline")
    plan = models.CharField(max_length=20, choices=Plan.choices,
                            default=Plan.STARTER)
    # what the operator bought
    feature_games = models.BooleanField(default=True)
    feature_messenger = models.BooleanField(default=True)
    feature_sms = models.BooleanField(default=False)
    feature_payments = models.BooleanField(default=False)
    use_owner_bytepayout = models.BooleanField(
        default=False, help_text="This site takes BytePayout payments through the owner's BytePayout "
                                 "account (when the site has no BytePayout key of its own)")
    max_users = models.PositiveIntegerField(default=0, help_text="0 = unlimited")
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2,
                                        default=0)
    paid_until = models.DateField(null=True, blank=True)
    owner_email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_platform", "name"]

    def __str__(self):
        return self.name

    @property
    def features(self):
        return {"games": self.feature_games, "messenger": self.feature_messenger,
                "sms": self.feature_sms, "payments": self.feature_payments}


class Domain(models.Model):
    """A hostname (no port) that serves a tenant, e.g. luckyspin.com."""
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE,
                               related_name="domains")
    host = models.CharField(max_length=253, unique=True)
    is_primary = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        self.host = self.host.strip().lower().split(":")[0]
        super().save(*args, **kwargs)
        cache.delete(f"tenant-host:{self.host}")

    def delete(self, *args, **kwargs):
        cache.delete(f"tenant-host:{self.host}")
        return super().delete(*args, **kwargs)

    def __str__(self):
        return self.host


# --------------------------------------------------------------------------
# Scoping for every other model
# --------------------------------------------------------------------------

class TenantQuerySet(models.QuerySet):
    """QuerySet that is always limited to the current tenant.

    A queryset built while a tenant is active is filtered immediately. One
    built with no tenant (e.g. a class-level ``queryset = Game.objects.all()``
    evaluated at import time) is marked unscoped; the moment it is cloned or
    executed during a request, the copy gets the current tenant's filter. The
    shared original is never mutated, so it can't leak one tenant's filter (or
    rows) into another request.
    """

    _needs_scope = False

    def _clone(self):
        c = super()._clone()
        c._needs_scope = self._needs_scope
        return c

    def _chain(self):
        c = super()._chain()
        if c._needs_scope:
            tenant = get_current_tenant()
            if tenant is not None:
                c.query.add_q(models.Q(tenant=tenant))
                c._needs_scope = False
        return c

    def _scoped(self):
        """A tenant-filtered copy if this queryset still needs one, else None."""
        if self._needs_scope and get_current_tenant() is not None:
            return self._chain()
        return None

    # entry points that run SQL without going through _chain(); results are
    # read from the scoped copy so nothing is cached on the shared original
    def __iter__(self):
        scoped = self._scoped()
        return iter(scoped) if scoped is not None else super().__iter__()

    def __len__(self):
        scoped = self._scoped()
        return len(scoped) if scoped is not None else super().__len__()

    def __bool__(self):
        scoped = self._scoped()
        return bool(scoped) if scoped is not None else super().__bool__()

    def __getitem__(self, k):
        scoped = self._scoped()
        return scoped[k] if scoped is not None else super().__getitem__(k)

    def count(self):
        scoped = self._scoped()
        return scoped.count() if scoped is not None else super().count()

    def exists(self):
        scoped = self._scoped()
        return scoped.exists() if scoped is not None else super().exists()

    def aggregate(self, *args, **kwargs):
        scoped = self._scoped()
        return scoped.aggregate(*args, **kwargs) if scoped is not None else super().aggregate(*args, **kwargs)

    def update(self, **kwargs):
        scoped = self._scoped()
        return scoped.update(**kwargs) if scoped is not None else super().update(**kwargs)

    def delete(self):
        scoped = self._scoped()
        return scoped.delete() if scoped is not None else super().delete()

    def iterator(self, *args, **kwargs):
        scoped = self._scoped()
        return scoped.iterator(*args, **kwargs) if scoped is not None else super().iterator(*args, **kwargs)


def _scope_new(qs):
    tenant = get_current_tenant()
    if tenant is not None:
        return qs.filter(tenant=tenant)
    qs._needs_scope = True
    return qs


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """Default manager that only sees the current tenant's rows."""

    def get_queryset(self):
        return _scope_new(super().get_queryset())

    def bulk_create(self, objs, *args, **kwargs):
        # bulk_create skips save(), so stamp the tenant here too
        tenant = get_current_tenant()
        for obj in objs:
            if obj.tenant_id is None:
                obj.tenant = tenant
        return super().bulk_create(objs, *args, **kwargs)


class TenantUserManager(UserManager.from_queryset(TenantQuerySet)):
    def get_queryset(self):
        return _scope_new(super().get_queryset())


class TenantModel(models.Model):
    """Abstract base: rows belong to a tenant, stamped automatically on save."""
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, null=True,
                               blank=True, editable=False, related_name="+")

    objects = TenantManager()
    all_tenants = models.Manager()

    class Meta:
        abstract = True
        base_manager_name = "all_tenants"

    def save(self, *args, **kwargs):
        if self.tenant_id is None:
            self.tenant = get_current_tenant()
        super().save(*args, **kwargs)


class OwnerThread(models.Model):
    """The private chat between one client site's admins and the platform owner."""
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name="owner_thread")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    def __str__(self):
        return f"Owner chat · {self.tenant.name}"


class OwnerMessage(models.Model):
    thread = models.ForeignKey(OwnerThread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    from_owner = models.BooleanField(default=False)
    body = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read = models.BooleanField(default=False, help_text="Read by the side that received it")

    class Meta:
        ordering = ["id"]


class SitePayout(models.Model):
    """Money the platform owner paid out to a client site from the BytePayout
    balance they hold for it (recorded by the owner, never moved by the app)."""
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="payouts")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
