from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrReadOnly, IsAdminRole
from .models import Category, Favorite, Game, Review
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
