from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    referral_count = serializers.SerializerMethodField()
    vip_tier = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "role", "email", "phone",
                  "is_active", "last_login", "date_joined", "referral_code",
                  "referral_count", "loyalty_points", "vip_tier"]
        read_only_fields = ["id", "last_login", "date_joined", "referral_code",
                            "referral_count", "loyalty_points", "vip_tier"]

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

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "role", "email", "phone",
                  "is_active", "password", "last_login", "loyalty_points",
                  "vip_tier"]
        read_only_fields = ["id", "last_login", "vip_tier"]

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
