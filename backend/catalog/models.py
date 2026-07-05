from django.conf import settings
from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=90, unique=True, blank=True)
    icon = models.CharField(max_length=40, default="dice",
                            help_text="Icon key used by the frontend")
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "Categories"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Game(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
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
    user_link = models.URLField(blank=True)
    agent_link = models.URLField(blank=True)

    # SEO (per game)
    meta_title = models.CharField(max_length=180, blank=True)
    meta_description = models.CharField(max_length=300, blank=True)
    meta_keywords = models.CharField(max_length=300, blank=True)

    # vendor / sub-distributor load points (ported from the points tracker)
    sub_points = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    vendor_points = models.DecimalField(max_digits=12, decimal_places=2, default=0)

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

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Screenshot(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE,
                             related_name="screenshots")
    image = models.ImageField(upload_to="games/shots/")
    alt = models.CharField(max_length=160, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"Screenshot for {self.game.name}"


class FAQ(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="faqs")
    question = models.CharField(max_length=255)
    answer = models.TextField()
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.question


class Review(models.Model):
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


class Favorite(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="favorited_by")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="favorites")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("game", "user")
