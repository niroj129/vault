from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import (AdminUserViewSet, ChangePasswordView, LoginLogView,
                            LoginView, LogoutView, MeView, PingPlayerView)
from catalog.views import (CategoryViewSet, FavoriteViewSet, GameViewSet,
                           ReviewViewSet)
from chat.views import ConversationView, InboxView, SendView
from content import game_views
from payments import views as pay_views
from content.views import (AnnouncementViewSet, BusinessInfoView,
                           CashoutViewSet, ContactMessageViewSet,
                           DailyProfitViewSet, NotificationViewSet,
                           PaymentMethodViewSet, PromoViewSet, SEOPageViewSet,
                           SiteFAQViewSet, SiteSettingsView, WalletMeView,
                           WinnerViewSet, admin_stats, cashout_request,
                           export_csv, leaderboard, points_report,
                           promo_redeem, public_stats, search_suggest,
                           settlement_report, telegram_alert, top_games,
                           wallet_adjust)

router = DefaultRouter()
router.register("games", GameViewSet, basename="game")
router.register("categories", CategoryViewSet, basename="category")
router.register("winners", WinnerViewSet, basename="winner")
router.register("announcements", AnnouncementViewSet, basename="announcement")
router.register("profit", DailyProfitViewSet, basename="profit")
router.register("seo", SEOPageViewSet, basename="seo")
router.register("contact", ContactMessageViewSet, basename="contact")
router.register("payment-methods", PaymentMethodViewSet, basename="payment")
router.register("cashouts", CashoutViewSet, basename="cashout")
router.register("reviews", ReviewViewSet, basename="review")
router.register("favorites", FavoriteViewSet, basename="favorite")
router.register("promos", PromoViewSet, basename="promo")
router.register("faqs", SiteFAQViewSet, basename="faq")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("users", AdminUserViewSet, basename="user")
router.register("merchants", pay_views.MerchantViewSet, basename="merchant")
router.register("pay-orders", pay_views.PayOrderViewSet, basename="payorder")
router.register("transfer-orders", pay_views.TransferOrderViewSet, basename="transferorder")

api = [
    # auth
    path("auth/login/", LoginView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("auth/change-password/", ChangePasswordView.as_view()),
    # singletons + stats
    path("settings/", SiteSettingsView.as_view()),
    path("business/", BusinessInfoView.as_view()),
    path("stats/public/", public_stats),
    path("stats/admin/", admin_stats),
    path("points/report/", points_report),
    path("telegram/alert/", telegram_alert),
    path("wallet/me/", WalletMeView.as_view()),
    path("wallet/adjust/", wallet_adjust),
    path("stats/top-games/", top_games),
    path("stats/settlement/", settlement_report),
    path("stats/leaderboard/", leaderboard),
    path("auth/logins/", LoginLogView.as_view()),
    path("players/ping/", PingPlayerView.as_view()),
    path("promos/redeem/", promo_redeem),
    path("cashouts/request/", cashout_request),
    path("search/suggest/", search_suggest),
    path("export/<str:resource>.csv", export_csv),
    # external game-platform API
    path("gameapi/status/", game_views.status),
    path("gameapi/add-user/", game_views.add_user),
    path("gameapi/get-user-id/", game_views.get_user_id),
    path("gameapi/recharge/", game_views.recharge),
    path("gameapi/withdraw/", game_views.withdraw),
    path("gameapi/user-balance/", game_views.user_balance),
    path("gameapi/low-deposit/", game_views.low_deposit),
    path("gameapi/reset-password/", game_views.reset_password),
    path("gameapi/player-offline/", game_views.player_offline),
    path("reports/shift/", game_views.shift_report),
    # payment gateway
    path("pay/create/", pay_views.create_pay_link),
    path("pay/query/", pay_views.query_order),
    path("pay/close/", pay_views.close_order),
    path("pay/webhook/", pay_views.pay_webhook),
    path("pay/stats/", pay_views.pay_stats),
    path("transfer/create/", pay_views.create_transfer),
    path("transfer/webhook/", pay_views.transfer_webhook),
    # chat
    path("chat/conversation/", ConversationView.as_view()),
    path("chat/send/", SendView.as_view()),
    path("chat/inbox/", InboxView.as_view()),
    # routers
    path("", include(router.urls)),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include((api, "api"))),
    path("api-auth/", include("rest_framework.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
