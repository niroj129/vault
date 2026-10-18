from django.contrib.auth.models import AbstractUser
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import models
from tenants.context import get_current_tenant
from tenants.models import TenantModel, TenantUserManager


class User(AbstractUser):
    """Custom user with a role, belonging to one tenant (casino site).

    Hierarchy inside a tenant: admin → agent → user. Admins create agents;
    agents create and manage their own players (User.agent). Usernames are
    unique per tenant, so two casinos can each have a "john".
    """

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        AGENT = "agent", "Agent"
        USER = "user", "User"

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE,
                               null=True, blank=True, related_name="users")
    username = models.CharField(
        max_length=150, validators=[UnicodeUsernameValidator()],
        help_text="Unique within this site.")
    # the agent who created / manages this player
    agent = models.ForeignKey("self", null=True, blank=True,
                              on_delete=models.SET_NULL,
                              related_name="players",
                              limit_choices_to={"role": "agent"})

    role = models.CharField(max_length=10, choices=Role.choices,
                            default=Role.USER)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    loyalty_points = models.PositiveIntegerField(default=0)
    referral_code = models.CharField(max_length=12, unique=True, blank=True,
                                     null=True)
    referred_by = models.ForeignKey("self", null=True, blank=True,
                                    on_delete=models.SET_NULL,
                                    related_name="referrals")

    # messenger profile
    class DMPrivacy(models.TextChoices):
        EVERYONE = "everyone", "Everyone"
        CONTACTS = "contacts", "People I already chat with"
        NOBODY = "nobody", "Nobody (staff only)"

    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    bio = models.CharField(max_length=160, blank=True)
    dm_privacy = models.CharField(max_length=10, choices=DMPrivacy.choices,
                                  default=DMPrivacy.EVERYONE)
    last_seen = models.DateTimeField(null=True, blank=True)
    # set by staff from the reports queue; blocks sending until then
    chat_muted_until = models.DateTimeField(null=True, blank=True)
    # private notes staff keep about a player (shown beside their chats)
    staff_notes = models.TextField(blank=True)

    objects = TenantUserManager()
    all_tenants = models.Manager()

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["tenant", "username"], name="unique_username_per_tenant")]
        base_manager_name = "all_tenants"

    VIP_TIERS = [(5000, "Platinum"), (2000, "Gold"), (500, "Silver"),
                 (0, "Bronze")]

    @property
    def vip_tier(self):
        for threshold, name in self.VIP_TIERS:
            if self.loyalty_points >= threshold:
                return name
        return "Bronze"

    @property
    def vip_next(self):
        """Next tier and progress toward it (None at the top tier)."""
        tiers = sorted(self.VIP_TIERS)
        for i, (threshold, name) in enumerate(tiers):
            if self.loyalty_points < threshold:
                floor = tiers[i - 1][0]
                return {"name": name, "points": threshold,
                        "progress": round((self.loyalty_points - floor)
                                          / (threshold - floor), 3)}
        return None

    @property
    def is_staff_role(self):
        return self.is_admin_role or self.is_agent_role

    @property
    def is_admin_role(self):
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def is_agent_role(self):
        return self.role == self.Role.AGENT

    @property
    def is_platform_owner(self):
        """Superuser of the platform tenant: manages every casino."""
        return bool(self.is_superuser and self.tenant_id
                    and self.tenant.is_platform)

    def save(self, *args, **kwargs):
        if self.tenant_id is None:
            self.tenant = get_current_tenant()
        # Keep Django's is_staff in sync so admins reach /django-admin too.
        if self.role == self.Role.ADMIN:
            self.is_staff = True
        if not self.referral_code:
            import secrets
            self.referral_code = secrets.token_hex(3).upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role})"


class LoginLog(TenantModel):
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE,
                             related_name="logins")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} @ {self.created_at:%Y-%m-%d %H:%M}"
