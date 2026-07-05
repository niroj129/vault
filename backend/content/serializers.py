from rest_framework import serializers

from casino_backend.fields import RelativeImageField

from .models import (Announcement, BusinessInfo, Cashout, ContactMessage,
                     DailyProfit, GameTxn, Notification, PaymentMethod, Promo,
                     SEOPage, SiteFAQ, SiteSettings, Transaction, Wallet, Winner)


class WinnerSerializer(serializers.ModelSerializer):
    photo = RelativeImageField(required=False, allow_null=True)

    class Meta:
        model = Winner
        fields = ["id", "name", "amount", "game", "photo", "win_date",
                  "created_at"]


class DailyProfitSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyProfit
        fields = ["id", "date", "amount", "notes", "created_at"]


class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ["id", "title", "body", "pinned", "active", "publish_at",
                  "created_at"]


class SiteSettingsSerializer(serializers.ModelSerializer):
    logo = RelativeImageField(required=False, allow_null=True)
    favicon = RelativeImageField(required=False, allow_null=True)
    social_preview = RelativeImageField(required=False, allow_null=True)

    class Meta:
        model = SiteSettings
        exclude = ["id"]


class BusinessInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessInfo
        exclude = ["id"]


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ["id", "name", "email", "phone", "message", "created_at"]
        read_only_fields = ["id", "created_at"]


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ["id", "name", "details", "icon", "active", "sort_order"]


class CashoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cashout
        fields = ["id", "player", "amount", "method", "game", "status", "date",
                  "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class SEOPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SEOPage
        fields = ["id", "page", "title", "description", "keywords", "canonical",
                  "og_image", "robots"]


class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = ["balance"]


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = ["id", "amount", "kind", "note", "created_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "text", "link", "is_read", "created_at"]


class PromoSerializer(serializers.ModelSerializer):
    image = RelativeImageField(required=False, allow_null=True)

    class Meta:
        model = Promo
        fields = ["id", "title", "code", "description", "image", "active",
                  "expires", "sort_order"]


class SiteFAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteFAQ
        fields = ["id", "question", "answer", "category", "sort_order"]


class GameTxnSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameTxn
        fields = ["id", "kind", "account_name", "platform_user_id", "amount",
                  "payment_method", "order_id", "platform_txn_id",
                  "agent_balance", "user_balance", "operator", "shift",
                  "nepal_date", "status", "note", "created_at"]
        read_only_fields = fields
