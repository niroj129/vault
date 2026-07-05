from rest_framework import serializers

from casino_backend.fields import RelativeImageField
from .models import Category, FAQ, Favorite, Game, Review, Screenshot


class RatingMixin:
    def get_rating_avg(self, obj):
        revs = list(obj.reviews.all())
        return round(sum(r.rating for r in revs) / len(revs), 1) if revs else 0

    def get_rating_count(self, obj):
        return obj.reviews.count()

    def get_is_favorited(self, obj):
        req = self.context.get("request")
        if not req or not req.user.is_authenticated:
            return False
        return obj.favorited_by.filter(user=req.user).exists()


class CategorySerializer(serializers.ModelSerializer):
    game_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "icon", "sort_order", "game_count"]

    def get_game_count(self, obj):
        return obj.games.filter(status="active").count()


class ScreenshotSerializer(serializers.ModelSerializer):
    image = RelativeImageField(required=False, allow_null=True)

    class Meta:
        model = Screenshot
        fields = ["id", "image", "alt", "sort_order"]


class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = ["id", "question", "answer", "sort_order"]


class GameListSerializer(RatingMixin, serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", default="", read_only=True)
    category_slug = serializers.CharField(source="category.slug", default="", read_only=True)
    thumbnail = RelativeImageField(required=False, allow_null=True)
    logo = RelativeImageField(required=False, allow_null=True)
    features_list = serializers.SerializerMethodField()
    rating_avg = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = ["id", "name", "slug", "category_name", "category_slug",
                  "short_description", "thumbnail", "logo", "status", "featured",
                  "is_new", "clicks", "views", "features_list",
                  "sub_points", "vendor_points", "user_link", "agent_link",
                  "rating_avg", "rating_count", "is_favorited"]

    def get_features_list(self, obj):
        return [f for f in obj.features.splitlines() if f.strip()]


class GameDetailSerializer(RatingMixin, serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", default="", read_only=True)
    category_slug = serializers.CharField(source="category.slug", default="", read_only=True)
    thumbnail = RelativeImageField(required=False, allow_null=True)
    logo = RelativeImageField(required=False, allow_null=True)
    banner = RelativeImageField(required=False, allow_null=True)
    screenshots = ScreenshotSerializer(many=True, read_only=True)
    faqs = FAQSerializer(many=True, read_only=True)
    features_list = serializers.SerializerMethodField()
    rating_avg = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = ["id", "name", "slug", "category", "category_name",
                  "category_slug", "short_description", "description", "features",
                  "features_list", "download_info", "thumbnail", "logo", "banner",
                  "play_url", "user_link", "agent_link", "meta_title",
                  "meta_description", "meta_keywords", "status", "featured",
                  "is_new", "clicks", "views", "sub_points", "vendor_points",
                  "combined_points", "rating_avg", "rating_count",
                  "is_favorited", "screenshots", "faqs", "created_at"]

    combined_points = serializers.SerializerMethodField()

    def get_features_list(self, obj):
        return [f for f in obj.features.splitlines() if f.strip()]

    def get_combined_points(self, obj):
        return float(obj.sub_points) + float(obj.vendor_points)


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True)
    game_slug = serializers.CharField(source="game.slug", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "game", "game_slug", "user", "user_name", "rating",
                  "comment", "created_at"]
        read_only_fields = ["id", "user", "user_name", "game_slug", "created_at"]


class FavoriteSerializer(serializers.ModelSerializer):
    game_detail = GameListSerializer(source="game", read_only=True)

    class Meta:
        model = Favorite
        fields = ["id", "game", "game_detail", "created_at"]
        read_only_fields = ["id", "created_at"]
