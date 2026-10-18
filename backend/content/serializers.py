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
        for pre, d_lo, d_hi in (("cashout", 3, 10), ("freeplay_cashout", 1, 3)):
            lo = data.get(f"{pre}_min_x", getattr(self.instance, f"{pre}_min_x", d_lo))
            hi = data.get(f"{pre}_max_x", getattr(self.instance, f"{pre}_max_x", d_hi))
            if lo is not None and lo <= 0:
                raise serializers.ValidationError({f"{pre}_min_x": "Must be more than 0."})
            if lo is not None and hi is not None and hi < lo:
                raise serializers.ValidationError({f"{pre}_max_x": "Must be at least the minimum."})
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
    player_count = serializers.SerializerMethodField()

    class Meta:
        model = Promo
        fields = ["id", "title", "code", "description", "image", "active",
                  "starts", "expires", "sort_order", "bonus_percent", "bonus_flat",
                  "max_bonus", "min_deposit", "usage", "max_uses", "used",
                  "audience", "auto_apply", "player_count", "free_credits", "freeplay_min_x", "freeplay_max_x"]

    def get_player_count(self, obj):
        return obj.players.count() if obj.audience != "all" else 0

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
        for k in ("bonus_percent", "bonus_flat", "max_bonus", "min_deposit", "free_credits"):
            if get(k) < 0:
                raise serializers.ValidationError({k: "Can't be negative."})
        lo, hi = attrs.get("freeplay_min_x", getattr(self.instance, "freeplay_min_x", None)), attrs.get("freeplay_max_x", getattr(self.instance, "freeplay_max_x", None))
        if lo is not None and lo <= 0:
            raise serializers.ValidationError({"freeplay_min_x": "Must be more than 0."})
        if lo is not None and hi is not None and hi < lo:
            raise serializers.ValidationError({"freeplay_max_x": "Must be at least the minimum."})
        free = get("free_credits") > 0
        if free and not get("code", ""):
            raise serializers.ValidationError({"code": "Free play needs a code for players to redeem."})
        if free and get("auto_apply", False):
            raise serializers.ValidationError({"auto_apply": "A free play code is redeemed by the player; it can't apply automatically."})
        gives = get("bonus_percent") > 0 or get("bonus_flat") > 0
        if gives and not get("code", "") and not get("auto_apply", False):
            raise serializers.ValidationError({"code": "Add a code for players to enter, or turn on “Apply automatically”."})
        if get("auto_apply", False) and not gives:
            raise serializers.ValidationError({"auto_apply": "Set a bonus % or $ amount first."})
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
