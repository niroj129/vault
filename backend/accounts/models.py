from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user with a role. Accounts are created by admins only."""

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        USER = "user", "User"

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

    VIP_TIERS = [(5000, "Platinum"), (2000, "Gold"), (500, "Silver"),
                 (0, "Bronze")]

    @property
    def vip_tier(self):
        for threshold, name in self.VIP_TIERS:
            if self.loyalty_points >= threshold:
                return name
        return "Bronze"

    @property
    def is_admin_role(self):
        return self.role == self.Role.ADMIN or self.is_superuser

    def save(self, *args, **kwargs):
        # Keep Django's is_staff in sync so admins reach /django-admin too.
        if self.role == self.Role.ADMIN:
            self.is_staff = True
        if not self.referral_code:
            import secrets
            self.referral_code = secrets.token_hex(3).upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role})"


class LoginLog(models.Model):
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE,
                             related_name="logins")
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} @ {self.created_at:%Y-%m-%d %H:%M}"
