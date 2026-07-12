from django.db.models import Count, Sum
from rest_framework import serializers

from accounts.models import User
from .models import Merchant, PayOrder, TransferOrder


class MerchantSerializer(serializers.ModelSerializer):
    username = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False,
                                     allow_blank=True)
    login = serializers.CharField(source="user.username", read_only=True)
    parent_name = serializers.CharField(source="parent.name", default="",
                                        read_only=True)
    is_sub = serializers.BooleanField(source="is_submerchant", read_only=True)
    stats = serializers.SerializerMethodField()

    class Meta:
        model = Merchant
        fields = ["id", "name", "code", "fee_percent", "active", "login",
                  "username", "password", "parent", "parent_name", "is_sub",
                  "stats", "created_at"]
        read_only_fields = ["id", "code", "login", "parent", "parent_name",
                            "is_sub", "stats", "created_at"]

    def get_stats(self, obj):
        agg = obj.pay_orders.filter(state=2).aggregate(
            gross=Sum("amount"), platform=Sum("platform_amount"),
            parent=Sum("parent_amount"), net=Sum("net_amount"), n=Count("id"))
        return {
            "orders": obj.pay_orders.count(),
            "paid": agg["n"] or 0,
            "gross": agg["gross"] or 0,
            "platform": agg["platform"] or 0,
            "parent": agg["parent"] or 0,
            "net": agg["net"] or 0,
            "submerchants": obj.submerchants.count(),
        }

    def create(self, validated):
        request = self.context["request"]
        creator = request.user
        # Parent: admin -> tier-1 (None); tier-1 merchant -> themselves
        parent = None
        if not creator.is_admin_role:
            parent = getattr(creator, "merchant", None)
            if parent is None or parent.is_submerchant:
                raise serializers.ValidationError(
                    "Only admins or tier-1 merchants can create merchants.")
            if validated["fee_percent"] < parent.fee_percent:
                raise serializers.ValidationError(
                    f"Fee % must be at least the parent's ({parent.fee_percent}).")

        username = validated.pop("username", None)
        password = validated.pop("password", "") or User.objects.make_random_password()
        if not username:
            raise serializers.ValidationError("username is required.")
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("Username already exists.")

        user = User(username=username, role="merchant",
                    full_name=validated.get("name", ""))
        user.set_password(password)
        user.save()
        return Merchant.objects.create(user=user, parent=parent, **validated)

    def update(self, instance, validated):
        password = validated.pop("password", "")
        validated.pop("username", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        if password:
            instance.user.set_password(password)
            instance.user.save()
        instance.save()
        return instance


class PayOrderSerializer(serializers.ModelSerializer):
    merchant_name = serializers.CharField(source="merchant.name", read_only=True)
    state_label = serializers.CharField(source="get_state_display", read_only=True)

    class Meta:
        model = PayOrder
        fields = ["id", "merchant", "merchant_name", "mch_order_no",
                  "pay_order_no", "amount", "real_amount", "currency", "way_code",
                  "client_id", "state", "state_label", "cashier_url",
                  "fee_percent", "platform_amount", "parent_amount", "net_amount",
                  "ext_param", "channel_order_no", "err_code", "err_msg",
                  "created_at", "success_time"]
        read_only_fields = fields


class TransferOrderSerializer(serializers.ModelSerializer):
    merchant_name = serializers.CharField(source="merchant.name", read_only=True)
    state_label = serializers.CharField(source="get_state_display", read_only=True)

    class Meta:
        model = TransferOrder
        fields = ["id", "merchant", "merchant_name", "mch_order_no",
                  "transfer_order_no", "amount", "currency", "way_code",
                  "way_param", "reason", "state", "state_label", "fee_percent",
                  "platform_amount", "parent_amount", "net_amount", "err_code",
                  "err_msg", "created_at", "success_time"]
        read_only_fields = fields
