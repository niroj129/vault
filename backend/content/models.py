from django.conf import settings
from django.db import models


class Winner(models.Model):
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


class DailyProfit(models.Model):
    date = models.DateField(unique=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date}: {self.amount}"


class Announcement(models.Model):
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


class SingletonModel(models.Model):
    """Base for one-row config models."""
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class SiteSettings(SingletonModel):
    site_name = models.CharField(max_length=120, default="Team Tiffany Gaming Casino")
    tagline = models.CharField(max_length=200, default="Play Premium. Win Big.")
    logo = models.ImageField(upload_to="site/", blank=True, null=True)
    favicon = models.ImageField(upload_to="site/", blank=True, null=True)
    social_preview = models.ImageField(upload_to="site/", blank=True, null=True)
    color_primary = models.CharField(max_length=9, default="#0B0F1A")
    color_secondary = models.CharField(max_length=9, default="#7C3AED")
    color_accent = models.CharField(max_length=9, default="#F5C542")
    currency = models.CharField(max_length=5, default="$")
    # Where "Create Account" buttons redirect (Facebook / signup page)
    signup_url = models.URLField(
        blank=True,
        default="https://www.facebook.com/profile.php?id=61572215053137")
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
    # Payment gateway (shared merchant credentials)
    pay_api_url = models.CharField(max_length=200, blank=True,
                                   help_text="Gateway base URL, e.g. https://host")
    pay_mch_no = models.CharField(max_length=40, blank=True)
    pay_api_key = models.CharField(max_length=120, blank=True)
    pay_sign_type = models.CharField(max_length=10, default="MD5")
    pay_currency = models.CharField(max_length=8, default="usd")
    pay_enabled_waycodes = models.CharField(
        max_length=200, default="cashapp,zelle,paypal,card,chime")
    pay_transfer_waycodes = models.CharField(
        max_length=200, default="ecashapp,paypal,venmo,zelle,chime,card,ach")
    pay_min_amount = models.PositiveIntegerField(default=0, help_text="Cents, 0=none")
    pay_max_amount = models.PositiveIntegerField(default=0, help_text="Cents, 0=none")

    def __str__(self):
        return "Site Settings"

    class Meta:
        verbose_name_plural = "Site Settings"


class BusinessInfo(SingletonModel):
    business_name = models.CharField(max_length=150, default="Team Tiffany Gaming")
    email = models.EmailField(default="support@teamtiffany.gg")
    phone = models.CharField(max_length=40, default="+1 (555) 013-8888")
    whatsapp = models.CharField(max_length=40, blank=True)
    telegram = models.URLField(blank=True)
    facebook = models.URLField(blank=True)
    instagram = models.URLField(blank=True)
    address = models.CharField(max_length=255, default="Online — worldwide")
    map_embed = models.TextField(blank=True, help_text="Google Maps iframe HTML")
    about = models.TextField(default="Team Tiffany Gaming Casino brings you a "
                             "curated collection of the world's most exciting games.")
    terms = models.TextField(default="Play responsibly. 18+ only.")
    privacy = models.TextField(default="We respect your privacy.")

    def __str__(self):
        return "Business Info"

    class Meta:
        verbose_name_plural = "Business Info"


class ContactMessage(models.Model):
    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.created_at:%Y-%m-%d})"


class PaymentMethod(models.Model):
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


class Cashout(models.Model):
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


class Wallet(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL,
                                on_delete=models.CASCADE, related_name="wallet")
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.user} — {self.balance}"


class Transaction(models.Model):
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


class Notification(models.Model):
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


class Promo(models.Model):
    title = models.CharField(max_length=150)
    code = models.CharField(max_length=40, blank=True)
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


class SiteFAQ(models.Model):
    question = models.CharField(max_length=255)
    answer = models.TextField()
    category = models.CharField(max_length=60, blank=True, default="General")
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name = "Site FAQ"

    def __str__(self):
        return self.question


class GameTxn(models.Model):
    """Game-platform deposit/withdraw ledger, tracked by Nepal shift.

    Distinct from the site's own player-wallet `Transaction`; this records the
    real load/cashout operations agents perform on the game platform.
    """
    class Kind(models.TextChoices):
        LOAD = "load", "Load / Deposit"
        WITHDRAW = "withdraw", "Withdraw / Cashout"

    kind = models.CharField(max_length=10, choices=Kind.choices,
                            default=Kind.LOAD)
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


class SEOPage(models.Model):
    page = models.CharField(max_length=60, unique=True,
                            help_text="Page key, e.g. home, games, winners")
    title = models.CharField(max_length=180, blank=True)
    description = models.CharField(max_length=300, blank=True)
    keywords = models.CharField(max_length=300, blank=True)
    canonical = models.URLField(blank=True)
    og_image = models.ImageField(upload_to="seo/", blank=True, null=True)
    robots = models.CharField(max_length=60, default="index, follow")

    def __str__(self):
        return self.page
