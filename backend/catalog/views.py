from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework import serializers
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrAgent, IsAdminOrReadOnly, IsAdminRole
from .models import Category, Favorite, Game, GameLogin, Review
from .serializers import (CategorySerializer, FavoriteSerializer,
                          GameDetailSerializer, GameListSerializer,
                          ReviewSerializer)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]
    lookup_field = "slug"


class GameViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminOrReadOnly]
    lookup_field = "slug"

    def get_queryset(self):
        qs = Game.objects.select_related("category").prefetch_related(
            "screenshots", "faqs", "reviews", "favorited_by")
        # Public users only see active games; admins see everything.
        if not (self.request.user.is_authenticated
                and self.request.user.is_admin_role):
            qs = qs.filter(status="active")

        params = self.request.query_params
        if params.get("category"):
            qs = qs.filter(category__slug=params["category"])
        if params.get("featured") == "1":
            qs = qs.filter(featured=True)
        if params.get("is_new") == "1":
            qs = qs.filter(is_new=True)
        if params.get("q"):
            q = params["q"]
            qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q)
                           | Q(category__name__icontains=q)
                           | Q(faqs__question__icontains=q)).distinct()
        ordering = params.get("ordering")
        if ordering == "popular":
            qs = qs.order_by("-clicks", "-views")
        elif ordering == "new":
            qs = qs.order_by("-created_at")
        return qs

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return GameDetailSerializer
        return GameListSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Game.objects.filter(pk=instance.pk).update(views=instance.views + 1)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[])
    def click(self, request, slug=None):
        """Register a play-click and return the resolved link."""
        game = self.get_object()
        Game.objects.filter(pk=game.pk).update(clicks=game.clicks + 1)
        return Response({"url": game.user_link or game.play_url})


class ReviewViewSet(mixins.CreateModelMixin, mixins.ListModelMixin,
                    mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = ReviewSerializer

    def get_permissions(self):
        if self.action in ("list",):
            return [IsAdminOrReadOnly()]
        if self.action == "destroy":
            return [IsAdminRole()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Review.objects.select_related("user", "game")
        slug = self.request.query_params.get("game")
        if slug:
            qs = qs.filter(game__slug=slug)
        return qs

    def create(self, request, *args, **kwargs):
        game = get_object_or_404(Game, slug=request.data.get("game")) \
            if not str(request.data.get("game", "")).isdigit() \
            else get_object_or_404(Game, pk=request.data.get("game"))
        review, _ = Review.objects.update_or_create(
            game=game, user=request.user,
            defaults={"rating": request.data.get("rating", 5),
                      "comment": request.data.get("comment", "")})
        return Response(ReviewSerializer(review).data, status=201)


class FavoriteViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user).select_related("game")

    @action(detail=False, methods=["post"])
    def toggle(self, request):
        game = get_object_or_404(Game, pk=request.data.get("game"))
        fav = Favorite.objects.filter(user=request.user, game=game).first()
        if fav:
            fav.delete()
            return Response({"favorited": False})
        Favorite.objects.create(user=request.user, game=game)
        return Response({"favorited": True})


# ------------------------------------------------------- game logins vault

class GameLoginSerializer(serializers.ModelSerializer):
    game_name = serializers.CharField(source="game.name", read_only=True)

    class Meta:
        model = GameLogin
        fields = ["id", "user", "game", "game_name", "username", "password",
                  "note", "updated_at"]

    def validate_user(self, user):
        me = self.context["request"].user
        if not me.is_admin_role and user.agent_id != me.id:
            raise serializers.ValidationError("Not one of your players.")
        return user


class GameLoginViewSet(viewsets.ModelViewSet):
    """Staff set each player's username/password per game (?user=<id>).
    Agents only see their own players."""
    serializer_class = GameLoginSerializer
    permission_classes = [IsAdminOrAgent]

    def get_queryset(self):
        qs = GameLogin.objects.select_related("game", "user")
        me = self.request.user
        if not me.is_admin_role:
            qs = qs.filter(user__agent=me)
        user = self.request.query_params.get("user")
        if user and user.isdigit():
            qs = qs.filter(user_id=int(user))
        return qs


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_game_logins(request):
    """The signed-in player's vault, with each game's art and play link."""
    rows = GameLogin.objects.filter(user=request.user).select_related("game")
    out = []
    for g in rows:
        game = g.game
        out.append({
            "id": g.id, "username": g.username, "password": g.password,
            "note": g.note, "updated_at": g.updated_at,
            "game": {"id": game.id, "name": game.name, "slug": game.slug,
                     "thumbnail": game.thumbnail.url if game.thumbnail else None,
                     "logo": game.logo.url if game.logo else None,
                     "play_url": game.user_link or game.play_url},
        })
    return Response(out)
