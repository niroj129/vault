from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    referral_count = serializers.SerializerMethodField()
    vip_tier = serializers.CharField(read_only=True)
    vip_next = serializers.DictField(read_only=True, allow_null=True)
    avatar = serializers.ImageField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "role", "email", "phone",
                  "is_active", "last_login", "date_joined", "referral_code",
                  "referral_count", "loyalty_points", "vip_tier", "vip_next",
                  "avatar", "bio", "dm_privacy", "is_platform_owner"]
        read_only_fields = ["id", "last_login", "date_joined", "referral_code",
                            "referral_count", "loyalty_points", "vip_tier",
                            "vip_next", "avatar", "bio", "dm_privacy"]

    def get_referral_count(self, obj):
        return obj.referrals.count()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs["username"],
                            password=attrs["password"])
        if not user or not user.is_active:
            raise serializers.ValidationError("Invalid username or password.")
        attrs["user"] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)


class AdminUserSerializer(serializers.ModelSerializer):
    """Used by admins to create/update accounts (password optional on update)."""
    password = serializers.CharField(write_only=True, required=False,
                                     allow_blank=True)

    vip_tier = serializers.CharField(read_only=True)
    agent_name = serializers.CharField(source="agent.username", read_only=True,
                                       default="")
    player_count = serializers.IntegerField(source="players.count",
                                            read_only=True)
    is_platform_owner = serializers.BooleanField(read_only=True)
    avatar = serializers.ImageField(read_only=True)
    total_loaded = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=None)
    deposit_count = serializers.IntegerField(read_only=True, default=0)
    last_deposit = serializers.DateTimeField(read_only=True, default=None)
    login_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "role", "email", "phone",
                  "is_active", "password", "last_login", "loyalty_points",
                  "vip_tier", "agent", "agent_name", "player_count",
                  "is_platform_owner", "date_joined", "avatar", "total_loaded",
                  "deposit_count", "last_deposit", "login_count"]
        read_only_fields = ["id", "last_login", "vip_tier", "date_joined", "avatar"]

    def validate_username(self, value):
        qs = User.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("That username is taken.")
        return value

    def validate(self, attrs):
        me = self.context["request"].user
        if me.is_agent_role and not me.is_admin_role:
            # agents only ever manage their own players
            attrs["role"] = User.Role.USER
            attrs["agent"] = me
        agent = attrs.get("agent")
        if agent and agent.role != User.Role.AGENT:
            raise serializers.ValidationError({"agent": "Pick an agent."})
        if not self.instance:
            tenant = getattr(self.context["request"], "tenant", None)
            if tenant and tenant.max_users and \
                    User.objects.count() >= tenant.max_users:
                raise serializers.ValidationError(
                    f"Your plan allows {tenant.max_users} accounts. "
                    "Contact the platform to upgrade.")
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", "") or User.objects.make_random_password()
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", "")
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
