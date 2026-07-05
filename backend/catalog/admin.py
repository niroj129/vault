from django.contrib import admin

from .models import Category, FAQ, Game, Screenshot


class ScreenshotInline(admin.TabularInline):
    model = Screenshot
    extra = 2


class FAQInline(admin.TabularInline):
    model = FAQ
    extra = 2


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "icon", "sort_order")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "status", "featured", "is_new",
                    "clicks", "views")
    list_filter = ("status", "featured", "is_new", "category")
    list_editable = ("status", "featured", "is_new")
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ScreenshotInline, FAQInline]
    fieldsets = (
        ("Basics", {"fields": ("name", "slug", "category", "status",
                               "featured", "is_new", "sort_order")}),
        ("Content", {"fields": ("short_description", "description", "features",
                                "download_info")}),
        ("Images", {"fields": ("thumbnail", "logo", "banner")}),
        ("Links", {"fields": ("play_url", "user_link", "agent_link")}),
        ("SEO", {"fields": ("meta_title", "meta_description", "meta_keywords")}),
    )
