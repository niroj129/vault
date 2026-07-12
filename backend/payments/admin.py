from django.contrib import admin

from .models import Merchant, PayOrder, TransferOrder


@admin.register(Merchant)
class MerchantAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "parent", "fee_percent", "active", "created_at")
    list_filter = ("active", "parent")
    search_fields = ("name", "code", "user__username")


@admin.register(PayOrder)
class PayOrderAdmin(admin.ModelAdmin):
    list_display = ("mch_order_no", "merchant", "amount", "way_code", "state",
                    "platform_amount", "net_amount", "created_at")
    list_filter = ("state", "way_code", "merchant")
    search_fields = ("mch_order_no", "pay_order_no", "client_id")


@admin.register(TransferOrder)
class TransferOrderAdmin(admin.ModelAdmin):
    list_display = ("mch_order_no", "merchant", "amount", "way_code", "state",
                    "created_at")
    list_filter = ("state", "way_code", "merchant")
    search_fields = ("mch_order_no", "transfer_order_no")
