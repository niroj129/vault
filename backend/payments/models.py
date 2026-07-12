from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import models


def compute_split(amount_cents, merchant):
    """Cascading fee split for an order originated by `merchant`.

    Returns (platform_amount, parent_amount, net_amount) in integer cents.
      tier-1 (no parent, fee f1): platform = amount*f1 ; net = amount - platform
      tier-2 (parent f1, own f2): platform = amount*f1 ; parent = amount*(f2-f1)
                                  ; net = amount - platform - parent
    """
    def pct(amount, percent):
        return int((Decimal(amount) * Decimal(percent) / Decimal(100))
                   .quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    f2 = merchant.fee_percent
    if merchant.parent_id is None:
        platform = pct(amount_cents, f2)
        return platform, 0, amount_cents - platform
    f1 = merchant.parent.fee_percent
    platform = pct(amount_cents, f1)
    parent = pct(amount_cents, (Decimal(f2) - Decimal(f1)))
    return platform, parent, amount_cents - platform - parent


class Merchant(models.Model):
    """A payment merchant account. Tier-1 merchants are created by admins;
    tier-1 merchants may create tier-2 sub-merchants (max depth 2)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL,
                                on_delete=models.CASCADE, related_name="merchant")
    parent = models.ForeignKey("self", null=True, blank=True,
                               on_delete=models.CASCADE,
                               related_name="submerchants")
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, unique=True)
    fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0,
                                      help_text="Total % fee on this merchant's orders")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    @property
    def is_submerchant(self):
        return self.parent_id is not None

    def save(self, *args, **kwargs):
        if not self.code:
            import secrets
            self.code = "M" + secrets.token_hex(3).upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class PayOrder(models.Model):
    """A collection (deposit) order — a payment link handed to a player."""
    class State(models.IntegerChoices):
        CREATED = 0, "Created"
        IN_PAYMENT = 1, "In payment"
        SUCCESS = 2, "Success"
        FAILED = 3, "Failed"
        REVOKED = 4, "Revoked"
        REFUNDED = 5, "Refunded"
        CLOSED = 6, "Closed"
        DISPUTED = 7, "Disputed"

    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE,
                                 related_name="pay_orders")
    mch_order_no = models.CharField(max_length=64, unique=True)
    pay_order_no = models.CharField(max_length=64, blank=True)
    amount = models.IntegerField(default=0, help_text="Cents")
    real_amount = models.IntegerField(null=True, blank=True, help_text="Cents")
    currency = models.CharField(max_length=8, default="usd")
    way_code = models.CharField(max_length=20, blank=True)
    client_id = models.CharField(max_length=64, blank=True)
    client_ip = models.CharField(max_length=64, blank=True)
    state = models.IntegerField(choices=State.choices, default=State.CREATED)
    cashier_url = models.CharField(max_length=500, blank=True)
    expire_ts = models.BigIntegerField(null=True, blank=True)
    fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    platform_amount = models.IntegerField(default=0, help_text="Cents (your cut)")
    parent_amount = models.IntegerField(default=0, help_text="Cents (tier-1 margin)")
    net_amount = models.IntegerField(default=0, help_text="Cents (originator keeps)")
    ext_param = models.CharField(max_length=512, blank=True)
    channel_order_no = models.CharField(max_length=120, blank=True)
    err_code = models.CharField(max_length=40, blank=True)
    err_msg = models.CharField(max_length=255, blank=True)
    raw = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    success_time = models.BigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def apply_split(self):
        self.platform_amount, self.parent_amount, self.net_amount = compute_split(
            self.amount, self.merchant)

    def __str__(self):
        return f"{self.mch_order_no} ({self.get_state_display()})"


class TransferOrder(models.Model):
    """A payout (transfer) order — sending money out to a player."""
    class State(models.IntegerChoices):
        CREATED = 0, "Created"
        IN_PROGRESS = 1, "In progress"
        SUCCESS = 2, "Success"
        FAILED = 3, "Failed"
        REVOKED = 4, "Revoked"
        CLOSED = 6, "Closed"

    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE,
                                 related_name="transfer_orders")
    mch_order_no = models.CharField(max_length=64, unique=True)
    transfer_order_no = models.CharField(max_length=64, blank=True)
    amount = models.IntegerField(default=0, help_text="Cents")
    currency = models.CharField(max_length=8, default="usd")
    way_code = models.CharField(max_length=20, blank=True)
    way_param = models.JSONField(null=True, blank=True)
    reason = models.CharField(max_length=120, blank=True)
    state = models.IntegerField(choices=State.choices, default=State.CREATED)
    fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    platform_amount = models.IntegerField(default=0)
    parent_amount = models.IntegerField(default=0)
    net_amount = models.IntegerField(default=0)
    err_code = models.CharField(max_length=40, blank=True)
    err_msg = models.CharField(max_length=255, blank=True)
    raw = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    success_time = models.BigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def apply_split(self):
        self.platform_amount, self.parent_amount, self.net_amount = compute_split(
            self.amount, self.merchant)

    def __str__(self):
        return f"{self.mch_order_no} ({self.get_state_display()})"
