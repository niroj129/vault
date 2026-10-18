from django.conf import settings
from django.db import models
from django.utils.text import slugify
from tenants.models import TenantModel


class Category(TenantModel):
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=90, blank=True)
    icon = models.CharField(max_length=40, default="dice",
                            help_text="Icon key used by the frontend")
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "Categories"
        unique_together = [("tenant", "name"), ("tenant", "slug")]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Game(TenantModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, blank=True)
    category = models.ForeignKey(Category, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="games")
    short_description = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    features = models.TextField(blank=True, help_text="One feature per line")
    download_info = models.CharField(max_length=255, blank=True)

    # images
    thumbnail = models.ImageField(upload_to="games/thumbs/", blank=True, null=True)
    logo = models.ImageField(upload_to="games/logos/", blank=True, null=True)
    banner = models.ImageField(upload_to="games/banners/", blank=True, null=True)

    # links
    play_url = models.URLField(blank=True)
    # game platform API that runs this game (None = staff load by hand)
    provider = models.ForeignKey("gaming.GameProvider", null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="games")
    provider_game_code = models.CharField(
        max_length=40, blank=True, help_text="Game code on the platform "
        "(e.g. kindId), optional")
    self_serve = models.BooleanField(
        default=True, help_text="Players can create an account and load this "
        "game themselves")
    user_link = models.URLField(blank=True)
    agent_link = models.URLField(blank=True)

    # SEO (per game)
    meta_title = models.CharField(max_length=180, blank=True)
    meta_description = models.CharField(max_length=300, blank=True)
    meta_keywords = models.CharField(max_length=300, blank=True)

    # vendor / sub-distributor load points (ported from the points tracker)
    sub_points = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    vendor_points = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    points_synced_at = models.DateTimeField(
        null=True, blank=True, help_text="Set when the points came from the game API (kept up to date automatically)")

    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.ACTIVE)
    featured = models.BooleanField(default=False)
    is_new = models.BooleanField(default=False)
    clicks = models.PositiveIntegerField(default=0)
    views = models.PositiveIntegerField(default=0)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = [("tenant", "slug")]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Screenshot(TenantModel):
    game = models.ForeignKey(Game, on_delete=models.CASCADE,
                             related_name="screenshots")
    image = models.ImageField(upload_to="games/shots/")
    alt = models.CharField(max_length=160, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"Screenshot for {self.game.name}"


class FAQ(TenantModel):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="faqs")
    question = models.CharField(max_length=255)
    answer = models.TextField()
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.question


class Review(TenantModel):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    rating = models.PositiveSmallIntegerField(default=5)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("game", "user")

    def __str__(self):
        return f"{self.user} → {self.game} ({self.rating})"


class Favorite(TenantModel):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="favorited_by")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="favorites")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("game", "user")


class GameLogin(TenantModel):
    """A player's username/password for one game platform, set by staff and
    shown in the player's Game logins vault."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="game_logins")
    game = models.ForeignKey(Game, on_delete=models.CASCADE,
                             related_name="logins")
    username = models.CharField(max_length=120)
    password = models.CharField(max_length=120, blank=True)
    note = models.CharField(max_length=200, blank=True)
    # the platform's own id for this account (needed by some APIs)
    platform_user_id = models.CharField(max_length=64, blank=True)
    created_via_api = models.BooleanField(default=False)
    last_balance = models.CharField(max_length=40, blank=True)
    last_balance_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("user", "game")]
        ordering = ["game__name"]

    def __str__(self):
        return f"{self.user} @ {self.game}: {self.username}"
