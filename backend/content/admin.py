from django.contrib import admin

from .models import (Announcement, BusinessInfo, Cashout, ContactMessage,
                     DailyProfit, GameTxn, Notification, PaymentMethod, Promo,
                     SEOPage, SiteFAQ, SiteSettings, Transaction, Wallet, Winner)


@admin.register(Winner)
class WinnerAdmin(admin.ModelAdmin):
    list_display = ("name", "amount", "game", "win_date")
    list_filter = ("win_date",)
    search_fields = ("name", "game")


@admin.register(DailyProfit)
class DailyProfitAdmin(admin.ModelAdmin):
    list_display = ("date", "amount", "notes")
    list_editable = ("amount",)


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "pinned", "active", "publish_at", "created_at")
    list_editable = ("pinned", "active")
    list_filter = ("pinned", "active")


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone", "created_at")
    readonly_fields = ("name", "email", "phone", "message", "created_at")


@admin.register(SEOPage)
class SEOPageAdmin(admin.ModelAdmin):
    list_display = ("page", "title", "robots")


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ("name", "details", "active", "sort_order")
    list_editable = ("active", "sort_order")


@admin.register(Cashout)
class CashoutAdmin(admin.ModelAdmin):
    list_display = ("player", "amount", "method", "game", "date")
    list_filter = ("date", "method")
    search_fields = ("player",)


@admin.register(Promo)
class PromoAdmin(admin.ModelAdmin):
    list_display = ("title", "code", "active", "expires")
    list_editable = ("active",)


@admin.register(SiteFAQ)
class SiteFAQAdmin(admin.ModelAdmin):
    list_display = ("question", "category", "sort_order")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("user", "amount", "kind", "created_at")
    list_filter = ("kind",)


@admin.register(GameTxn)
class GameTxnAdmin(admin.ModelAdmin):
    list_display = ("kind", "account_name", "amount", "payment_method",
                    "shift", "nepal_date", "operator", "status")
    list_filter = ("kind", "shift", "nepal_date", "payment_method", "status")
    search_fields = ("account_name", "platform_user_id", "order_id")


admin.site.register(Wallet)
admin.site.register(Notification)
admin.site.register(SiteSettings)
admin.site.register(BusinessInfo)

admin.site.site_header = "Tiffany Gaming — Admin"
admin.site.site_title = "Tiffany Gaming Admin"
admin.site.index_title = "Management Dashboard"
