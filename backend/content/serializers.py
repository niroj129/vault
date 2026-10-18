from rest_framework import serializers

from casino_backend.fields import RelativeImageField

from .models import (Announcement, BusinessInfo, Cashout, ContactMessage,
                     DailyProfit, GameTxn, Notification, PaymentMethod, Promo,
                     SEOPage, SiteFAQ, SiteSettings, Transaction, Winner)


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
        read_only_fields = ["inbound_mail_token", "sendblue_token"]  # changed only through their setup pages

    def validate(self, data):
        lo = data.get("cashout_min_x", getattr(self.instance, "cashout_min_x", 3))
        hi = data.get("cashout_max_x", getattr(self.instance, "cashout_max_x", 10))
        if lo is not None and lo <= 0:
            raise serializers.ValidationError({"cashout_min_x": "Must be more than 0."})
        if lo is not None and hi is not None and hi < lo:
            raise serializers.ValidationError({"cashout_max_x": "Must be at least the minimum."})
        return data


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
    # how many deposits have claimed the code (paid or waiting)
    used = serializers.SerializerMethodField()

    class Meta:
        model = Promo
        fields = ["id", "title", "code", "description", "image", "active",
                  "starts", "expires", "sort_order", "bonus_percent", "bonus_flat",
                  "max_bonus", "min_deposit", "usage", "max_uses", "used"]

    def get_used(self, obj):
        from gaming.service import _promo_holds
        return _promo_holds(obj).count()

    def validate_code(self, value):
        value = (value or "").strip().upper().replace(" ", "")
        if value:
            clash = Promo.objects.filter(code__iexact=value)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError("Another promotion already uses that code.")
        return value

    def validate(self, attrs):
        get = lambda k, d=0: attrs.get(k, getattr(self.instance, k, d))  # noqa: E731
        for k in ("bonus_percent", "bonus_flat", "max_bonus", "min_deposit"):
            if get(k) < 0:
                raise serializers.ValidationError({k: "Can't be negative."})
        if (get("bonus_percent") > 0 or get("bonus_flat") > 0) and not get("code", ""):
            raise serializers.ValidationError({"code": "Add a code for players to enter."})
        if get("starts", None) and get("expires", None) and get("starts") > get("expires"):
            raise serializers.ValidationError({"expires": "Ends before it starts."})
        return attrs


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
