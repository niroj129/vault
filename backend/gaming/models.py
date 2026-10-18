"""Game platform connections, player deposits (BytePayout) and redeems.

A site (tenant) connects any number of game platforms (GameProvider). Each
catalog Game points at the provider that runs it, so one site can sell Fire
Kirin, Game Vault, Cash Machine… side by side. A player's account on a game
is a catalog.GameLogin.
"""

import uuid

from django.conf import settings
from django.db import models

from tenants.models import TenantModel


class GameProvider(TenantModel):
    class Kind(models.TextChoices):
        EXTERNAL = "external", "Agent API (/api/external) — Game Vault & similar"
        AGENTSERVER = "agentserver", "Agent server (/api/player) — Cash Machine, Mafia, Game Room"
        ASHX = "ashx", "service.ashx — Fire Kirin, Lucky Strike & similar"
        FASTAPI = "fastapi", "FastApi (/fast/user)"
        MANUAL = "manual", "Manual (no API — staff load by hand)"

    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=20, choices=Kind.choices,
                            default=Kind.EXTERNAL)
    base_url = models.CharField(
        max_length=200, blank=True,
        help_text="e.g. https://agentserver.cashmachine777.com or "
                  "https://firekirin.xyz:8034/ws/service.ashx")
    # what each field means depends on `kind` (see providers/)
    agent_name = models.CharField(max_length=120, blank=True,
                                  help_text="Agent ID / agent name / login")
    agent_password = models.CharField(max_length=200, blank=True)
    secret_key = models.CharField(max_length=200, blank=True,
                                  help_text="Secret key / app secret")
    app_id = models.CharField(max_length=120, blank=True)
    token_upper = models.BooleanField(
        default=False, help_text="External API: signature in UPPERCASE")
    ms_timestamp = models.BooleanField(
        default=False, help_text="External API: 13-digit (ms) timestamp")
    account_prefix = models.CharField(
        max_length=8, blank=True,
        help_text="Added to new player account names, e.g. rs")
    use_doh = models.BooleanField(
        default=False, help_text="Resolve the host via secure DNS (bypasses "
                                 "ISP DNS blocking)")
    force_ip = models.GenericIPAddressField(null=True, blank=True)
    proxy_url = models.CharField(
        max_length=300, blank=True,
        help_text="Send this platform's calls through a proxy, e.g. "
                  "http://user:pass@us-proxy:8080 or socks5://user:pass@host:1080 "
                  "— for vendors that only accept (whitelisted) US IPs")
    last_egress_ip = models.CharField(max_length=60, blank=True)
    is_active = models.BooleanField(default=True)
    last_agent_balance = models.CharField(max_length=40, blank=True)
    last_checked = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def is_automated(self):
        return self.kind != self.Kind.MANUAL


class PayMethod(TenantModel):
    """A way to pay the site directly, e.g. your own Chime or Cash App QR.

    The player sends the money to `handle` / the QR, uploads a screenshot
    and taps "I've paid"; staff get notified, check their app and approve.
    """

    class Proof(models.TextChoices):
        REQUIRED = "required", "Screenshot required"
        OPTIONAL = "optional", "Screenshot optional"
        OFF = "off", "No screenshot"

    REPLACEABLE = [("ecashapp", "Cash App"), ("applepay", "Apple Pay"), ("googlepay", "Google Pay"),
                   ("chime", "Chime"), ("venmo", "Venmo"), ("paypal", "PayPal")]

    name = models.CharField(max_length=60, help_text="e.g. Chime")
    replaces = models.CharField(
        max_length=20, blank=True, choices=REPLACEABLE,
        help_text="While this method is on, players pay this app to your QR instead of through BytePayout. "
                  "Empty = an extra method (e.g. Zelle) that BytePayout doesn't offer.")
    handle = models.CharField(max_length=120, blank=True,
                              help_text="$ChimeSign, phone or email players send to")
    account_name = models.CharField(max_length=80, blank=True,
                                    help_text="Name players will see on the receiving account")
    qr = models.ImageField(upload_to="pay/qr/", blank=True, null=True)
    instructions = models.TextField(blank=True)
    min_amount = models.DecimalField(max_digits=10, decimal_places=2, default=5)
    max_amount = models.DecimalField(max_digits=10, decimal_places=2, default=500)
    quick_amounts = models.CharField(max_length=80, default="10,20,50,100",
                                     help_text="Comma separated amount buttons")
    proof = models.CharField(max_length=10, choices=Proof.choices,
                             default=Proof.REQUIRED)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    @property
    def key(self):
        import re
        return re.sub(r"[^a-z0-9]", "", self.name.lower())[:20] or "direct"

    def amounts(self):
        out = []
        for part in self.quick_amounts.split(","):
            try:
                v = float(part.strip())
            except ValueError:
                continue
            if self.min_amount <= v <= self.max_amount:
                out.append(v)
        return out


def new_reference():
    return uuid.uuid4().hex[:20]


class Deposit(TenantModel):
    """A player paying through BytePayout to load a game (or staff recording
    a payment taken another way)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for payment"
        APPROVED = "approved", "Paid"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        FAILED = "failed", "Could not start"

    class Load(models.TextChoices):
        WAITING = "waiting", "Waiting for payment"
        QUEUED = "queued", "Queued"
        LOADING = "loading", "Loading"
        LOADED = "loaded", "Loaded"
        FAILED = "failed", "Load failed"
        MANUAL = "manual", "To load"
        SKIPPED = "skipped", "Not loaded"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="deposits")
    game = models.ForeignKey("catalog.Game", null=True, blank=True,
                             on_delete=models.SET_NULL, related_name="deposits")
    login = models.ForeignKey("catalog.GameLogin", null=True, blank=True,
                              on_delete=models.SET_NULL, related_name="deposits")
    method = models.CharField(max_length=20)  # ecashapp, chime, … or cash
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    credit_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Credits to load into the game")
    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.PENDING, db_index=True)
    reference = models.CharField(max_length=64, unique=True,
                                 default=new_reference)
    gateway = models.CharField(max_length=20, default="bytepayout")
    bp_account = models.CharField(
        max_length=6, blank=True, help_text='BytePayout account used: "own" (the site\'s key) or "owner" (platform owner\'s)')
    gateway_id = models.CharField(max_length=80, blank=True, db_index=True)
    checkout_url = models.URLField(max_length=600, blank=True)
    tag = models.CharField(max_length=120, blank=True)
    tag_email = models.CharField(max_length=200, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    load_status = models.CharField(max_length=10, choices=Load.choices,
                                   default=Load.WAITING, db_index=True)
    load_error = models.CharField(max_length=300, blank=True)
    loaded_at = models.DateTimeField(null=True, blank=True)
    loaded_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Credits actually put on the game (staff enter it when they load)")
    game_txn = models.ForeignKey("content.GameTxn", null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True,
                                   blank=True, on_delete=models.SET_NULL,
                                   related_name="+",
                                   help_text="Staff who recorded it (manual)")
    note = models.CharField(max_length=200, blank=True)
    # paying the site directly (PayMethod): what the player sent us
    pay_method = models.ForeignKey(PayMethod, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="deposits")
    proof = models.ImageField(upload_to="pay/proof/", blank=True, null=True)
    player_note = models.CharField(max_length=200, blank=True,
                                   help_text="e.g. the name on the player's Chime")
    checked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="+")
    raw = models.TextField(blank=True)
    last_synced = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} {self.method} {self.amount} {self.status}"

    @property
    def is_direct(self):
        """Paid straight to the site's own account (staff check it)."""
        return self.gateway == "direct"

    @property
    def code(self):
        """Short code players put in the payment note."""
        return self.reference[-6:].upper()


class Redeem(TenantModel):
    """A player asking to cash out credits from a game. Staff approve it, the
    site takes the credits back through the game API, then staff pay out."""

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting for staff"
        APPROVED = "approved", "Credits taken — pay the player"
        PAID = "paid", "Paid"
        REJECTED = "rejected", "Rejected"
        FAILED = "failed", "Game API failed"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="redeems")
    game = models.ForeignKey("catalog.Game", null=True, on_delete=models.SET_NULL,
                             related_name="redeems")
    login = models.ForeignKey("catalog.GameLogin", null=True, blank=True,
                              on_delete=models.SET_NULL, related_name="redeems")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    deposit = models.ForeignKey(
        Deposit, null=True, blank=True, on_delete=models.SET_NULL, related_name="redeems",
        help_text="The load this cash out is measured against (cash-out rule)")
    payout_method = models.CharField(max_length=30)
    payout_handle = models.CharField(max_length=120)
    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.PENDING, db_index=True)
    note = models.CharField(max_length=300, blank=True)
    error = models.CharField(max_length=300, blank=True)
    proof = models.ImageField(upload_to="pay/payout/", blank=True, null=True,
                              help_text="Screenshot of the money staff sent")
    player_proof = models.ImageField(upload_to="pay/cashout/", blank=True, null=True,
                                     help_text="Screenshot the player attached to the request (e.g. game balance)")
    game_txn = models.ForeignKey("content.GameTxn", null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="+")
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True,
                                   blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
