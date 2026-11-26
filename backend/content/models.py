from django.conf import settings
from django.db import models
from tenants.models import TenantModel


class Winner(TenantModel):
    name = models.CharField(max_length=120)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    game = models.CharField(max_length=120, blank=True)
    photo = models.ImageField(upload_to="winners/", blank=True, null=True)
    win_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-win_date", "-id"]

    def __str__(self):
        return f"{self.name} — {self.amount}"


class DailyProfit(TenantModel):
    date = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]
        unique_together = [("tenant", "date")]

    def __str__(self):
        return f"{self.date}: {self.amount}"


class Announcement(TenantModel):
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    pinned = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    publish_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-pinned", "-created_at"]

    def __str__(self):
        return self.title


class SingletonModel(TenantModel):
    """Base for one-row-per-tenant config models."""
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk is None:  # never create a second row for a tenant
            existing = type(self).objects.first()
            if existing:
                self.pk = existing.pk
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls()
            obj.save()
        return obj


class SiteSettings(SingletonModel):
    site_name = models.CharField(max_length=120, default="My Casino")
    tagline = models.CharField(max_length=200, default="Play Premium. Win Big.")
    logo = models.ImageField(upload_to="site/", blank=True, null=True)
    favicon = models.ImageField(upload_to="site/", blank=True, null=True)
    social_preview = models.ImageField(upload_to="site/", blank=True, null=True)
    # Generated link-preview card (frontend /og) — all optional
    preview_headline = models.CharField(
        max_length=80, blank=True, help_text="Big line on the link preview, e.g. 100% Bonus Available. Empty: the tagline")
    preview_highlights = models.CharField(
        max_length=200, blank=True, help_text="Short selling points, comma-separated, e.g. Open 24/7, All Payment Methods")
    preview_games = models.TextField(
        blank=True, help_text="Game names to list on the preview, one per line or comma-separated. Empty: game art from the catalog")
    color_primary = models.CharField(max_length=9, default="#0B0920")
    color_secondary = models.CharField(max_length=9, default="#A996FF")
    color_accent = models.CharField(max_length=9, default="#7B61FF")
    currency = models.CharField(max_length=5, default="$")
    # Where "Create Account" buttons redirect (Facebook / signup page)
    signup_url = models.URLField(
        blank=True,
        default="")
    maintenance_mode = models.BooleanField(default=False)
    analytics_id = models.CharField(max_length=40, blank=True)
    gsc_verification = models.CharField(max_length=120, blank=True)
    # Telegram load-alert setup (ported from the points tracker)
    telegram_bot_token = models.CharField(max_length=120, blank=True)
    telegram_chat_id = models.CharField(max_length=60, blank=True)
    points_threshold = models.PositiveIntegerField(default=100)
    load_amount = models.PositiveIntegerField(default=500)
    # Optional Twilio SMS (leave blank to disable SMS pings)
    twilio_sid = models.CharField(max_length=80, blank=True)
    twilio_token = models.CharField(max_length=80, blank=True)
    twilio_from = models.CharField(max_length=30, blank=True)
    # Sendblue (iMessage, falling back to RCS/SMS on Android)
    sendblue_key_id = models.CharField(max_length=80, blank=True)
    sendblue_secret = models.CharField(max_length=120, blank=True)
    sendblue_from = models.CharField(max_length=30, blank=True, help_text="Your Sendblue line (E.164)")
    sendblue_token = models.CharField(max_length=64, blank=True, help_text="Secret part of this site's Sendblue webhook address")
    twilio_whatsapp_from = models.CharField(
        max_length=30, blank=True,
        help_text="Your WhatsApp-enabled Twilio number (E.164, no whatsapp: prefix). The sandbox number works for testing")
    # External game-platform agent API (see API-Documentation.pdf)
    game_api_url = models.CharField(max_length=200, blank=True,
                                    help_text="Base URL, e.g. https://host (no trailing /api)")
    game_api_agent_id = models.CharField(max_length=40, blank=True)
    game_api_secret = models.CharField(max_length=80, blank=True)
    # Bypass ISP DNS blocking (e.g. Nepal): resolve via secure DNS or a pinned IP
    game_api_use_doh = models.BooleanField(
        default=True, help_text="Resolve the API host via secure DNS (DoH) to "
        "bypass ISP DNS blocking")
    game_api_force_ip = models.GenericIPAddressField(
        null=True, blank=True, help_text="Optional: pin the API host to this IP")
    # BytePayout (player deposits → automatic game loads)
    bp_base_url = models.CharField(
        max_length=200, default="https://mch.bytepayout.com/api/public/v1")
    bp_api_key = models.CharField(max_length=200, blank=True)
    bp_webhook_secret = models.CharField(max_length=200, blank=True)
    bp_methods = models.CharField(
        max_length=200, default="ecashapp,applepay,googlepay,chime,venmo,paypal",
        help_text="Payment methods players can choose")
    auto_load = models.BooleanField(
        default=True, help_text="Load the game automatically once paid")
    load_bonus_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text="Extra credits on every deposit, e.g. 10 = +10%")
    load_minus_fee = models.BooleanField(
        default=False, help_text="Load the amount minus the gateway fee")
    # players
    allow_signup = models.BooleanField(
        default=True, help_text="New players can create their own account")
    redeem_enabled = models.BooleanField(default=True)
    redeem_min = models.PositiveIntegerField(default=20)
    redeem_proof = models.CharField(
        max_length=10, default="optional",
        choices=[("required", "Required"), ("optional", "Optional"), ("off", "Don't ask")],
        help_text="Ask players to attach a screenshot (e.g. their game balance) with a cash-out request")
    redeem_methods = models.CharField(
        max_length=200, default="cashapp,chime,venmo,paypal,zelle")
    # forwarded emails (Gmail → Postmark/Mailgun/SendGrid/CloudMailin → /api/mail/inbound/<token>/)
    inbound_mail_token = models.CharField(max_length=64, blank=True,
                                          help_text="Secret part of this site's incoming-mail webhook address")
    mailgun_signing_key = models.CharField(max_length=200, blank=True,
                                           help_text="Optional: Mailgun webhook signing key, to check each post")
    # cash-out rule: each cash out must be between min× and max× the player's last load on that game
    cashout_rule_enabled = models.BooleanField(
        default=True, help_text="Limit each cash out to a multiple of the player's last load")
    cashout_min_x = models.DecimalField(
        max_digits=5, decimal_places=2, default=3, help_text="Minimum cash out = this × the load")
    cashout_max_x = models.DecimalField(
        max_digits=5, decimal_places=2, default=10, help_text="Maximum cash out = this × the load")
    # what each end of the range multiplies: what staff loaded, or what the player paid
    cashout_min_basis = models.CharField(
        max_length=10, default="loaded",
        choices=[("loaded", "Credits loaded"), ("deposit", "Money paid")],
        help_text="The minimum cash out multiplies this")
    cashout_max_basis = models.CharField(
        max_length=10, default="loaded",
        choices=[("loaded", "Credits loaded"), ("deposit", "Money paid")],
        help_text="The maximum cash out multiplies this")
    # free play loads (no payment) can be cashed out under their own rule
    freeplay_cashout_enabled = models.BooleanField(
        default=False, help_text="Let players cash out winnings from free play loads")
    freeplay_cashout_min_x = models.DecimalField(
        max_digits=5, decimal_places=2, default=1, help_text="Minimum cash out = this × the free play credits")
    freeplay_cashout_max_x = models.DecimalField(
        max_digits=5, decimal_places=2, default=3, help_text="Maximum cash out = this × the free play credits")

    def __str__(self):
        return "Site Settings"

    class Meta:
        verbose_name_plural = "Site Settings"


class BusinessInfo(SingletonModel):
    business_name = models.CharField(max_length=150, default="My Casino")
    email = models.EmailField(default="support@example.com")
    phone = models.CharField(max_length=40, default="+1 (555) 013-8888")
    whatsapp = models.CharField(max_length=40, blank=True)
    telegram = models.URLField(blank=True)
    facebook = models.URLField(blank=True)
    instagram = models.URLField(blank=True)
    address = models.CharField(max_length=255, default="Online — worldwide")
    map_embed = models.TextField(blank=True, help_text="Google Maps iframe HTML")
    about = models.TextField(default="A "
                             "curated collection of the world's most exciting games.")
    terms = models.TextField(default="Play responsibly. 18+ only.")
    privacy = models.TextField(default="We respect your privacy.")

    def __str__(self):
        return "Business Info"

    class Meta:
        verbose_name_plural = "Business Info"


class ContactMessage(TenantModel):
    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.created_at:%Y-%m-%d})"


class PaymentMethod(TenantModel):
    name = models.CharField(max_length=80)
    details = models.CharField(max_length=200, blank=True,
                               help_text="Account/handle/instructions")
    icon = models.CharField(max_length=40, default="card")
    active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Cashout(TenantModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        REJECTED = "rejected", "Rejected"

    player = models.CharField(max_length=120)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    method = models.CharField(max_length=80, blank=True)
    game = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.PAID)
    date = models.DateField()
    notes = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.player} — {self.amount}"


class Transaction(TenantModel):
    class Kind(models.TextChoices):
        LOAD = "load", "Load"
        CASHOUT = "cashout", "Cashout"
        BONUS = "bonus", "Bonus"
        ADJUST = "adjust", "Adjustment"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="transactions")
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    kind = models.CharField(max_length=10, choices=Kind.choices,
                            default=Kind.ADJUST)
    payment_method = models.CharField(max_length=60, blank=True)
    shift = models.CharField(max_length=20, blank=True)
    operator = models.CharField(max_length=60, blank=True,
                                help_text="Staff member who recorded it")
    order_id = models.CharField(max_length=60, blank=True)
    platform_txn_id = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.shift:
            from .shifts import current_shift
            self.shift = current_shift()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} {self.amount} ({self.kind})"


class Notification(TenantModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="notifications")
    text = models.CharField(max_length=255)
    link = models.CharField(max_length=200, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.text


class Promo(TenantModel):
    class Usage(models.TextChoices):
        ONCE = "once", "One-time (each player can use it once)"
        RECURRING = "recurring", "Recurring (players can use it on every load)"

    title = models.CharField(max_length=150)
    code = models.CharField(max_length=40, blank=True)
    # what the code gives when a player enters it while loading (all optional;
    # a code with no bonus is just a display offer that staff handle by hand)
    bonus_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text="Extra credits as a % of the deposit, e.g. 50 = +50%")
    bonus_flat = models.DecimalField(
        max_digits=8, decimal_places=2, default=0,
        help_text="Extra credits as a fixed amount, e.g. 5 = +$5")
    max_bonus = models.DecimalField(
        max_digits=8, decimal_places=2, default=0,
        help_text="Most bonus credits one deposit can earn (0 = no limit)")
    min_deposit = models.DecimalField(
        max_digits=8, decimal_places=2, default=0,
        help_text="Smallest deposit that qualifies (0 = any)")
    usage = models.CharField(max_length=10, choices=Usage.choices,
                             default=Usage.ONCE)
    max_uses = models.PositiveIntegerField(
        default=0, help_text="Total uses across all players (0 = unlimited)")
    starts = models.DateField(null=True, blank=True)
    # who it's for, and whether it applies without a code
    audience = models.CharField(max_length=8, choices=[
        ("all", "Everyone"), ("only", "Only the players I pick"),
        ("except", "Everyone except the players I pick")], default="all")
    players = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True,
                                     related_name="targeted_promos")
    freeplay_min_x = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Free play only: minimum cash out multiple for this code (empty = use the site's free play rule)")
    freeplay_max_x = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Free play only: maximum cash out multiple for this code (empty = use the site's free play rule)")
    free_credits = models.DecimalField(
        max_digits=8, decimal_places=2, default=0,
        help_text="Free play: credits loaded onto the game with no payment when a player redeems the code")
    auto_apply = models.BooleanField(
        default=False, help_text="Added to an eligible player's load automatically — no code to enter")
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="promos/", blank=True, null=True)
    active = models.BooleanField(default=True)
    expires = models.DateField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "-created_at"]

    def __str__(self):
        return self.title


class SiteFAQ(TenantModel):
    question = models.CharField(max_length=255)
    answer = models.TextField()
    category = models.CharField(max_length=60, blank=True, default="General")
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name = "Site FAQ"

    def __str__(self):
        return self.question


class GameTxn(TenantModel):
    """Game-platform deposit/withdraw ledger, tracked by Nepal shift.

    Distinct from the site's own player-wallet `Transaction`; this records the
    real load/cashout operations agents perform on the game platform.
    """
    class Kind(models.TextChoices):
        LOAD = "load", "Load / Deposit"
        WITHDRAW = "withdraw", "Withdraw / Cashout"

    kind = models.CharField(max_length=10, choices=Kind.choices,
                            default=Kind.LOAD)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                             on_delete=models.SET_NULL, related_name="game_txns")
    game = models.ForeignKey("catalog.Game", null=True, blank=True,
                             on_delete=models.SET_NULL, related_name="txns")
    account_name = models.CharField(max_length=120, blank=True)
    platform_user_id = models.CharField(max_length=60, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=60, blank=True)
    order_id = models.CharField(max_length=60, blank=True)
    platform_txn_id = models.CharField(max_length=80, blank=True)
    agent_balance = models.CharField(max_length=40, blank=True)
    user_balance = models.CharField(max_length=40, blank=True)
    operator = models.CharField(max_length=60, blank=True)
    shift = models.CharField(max_length=20, blank=True)
    nepal_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, default="success")
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.shift or not self.nepal_date:
            from .shifts import shift_for
            label, d = shift_for()
            self.shift = self.shift or label
            self.nepal_date = self.nepal_date or d
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.kind} {self.amount} {self.account_name}"


class SEOPage(TenantModel):
    page = models.CharField(max_length=60,
                            help_text="Page key, e.g. home, games, winners")
    title = models.CharField(max_length=180, blank=True)
    description = models.CharField(max_length=300, blank=True)
    keywords = models.CharField(max_length=300, blank=True)
    canonical = models.URLField(blank=True)
    og_image = models.ImageField(upload_to="seo/", blank=True, null=True)
    robots = models.CharField(max_length=60, default="index, follow")

    class Meta:
        unique_together = [("tenant", "page")]

    def __str__(self):
        return self.page
