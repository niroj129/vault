from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import (AdminUserViewSet, ChangePasswordView, LoginLogView,
                            LoginView, LogoutView, MeView, PingPlayerView,
                            SignupView)
from catalog.views import (CategoryViewSet, FavoriteViewSet,
                           GameLoginViewSet, GameViewSet, ReviewViewSet,
                           my_game_logins)
from chat import messenger, sendblue_setup, twilio_setup
from gaming import views as gaming
from tenants import analytics, bpledger, ownerchat
from mailin import views as mail_views
from tenants.views import TenantViewSet, platform_stats, platform_usage
from chat.views import ConversationView, InboxView, SendView
from content import game_views
from content.views import (AnnouncementViewSet, BusinessInfoView,
                           CashoutViewSet, ContactMessageViewSet,
                           DailyProfitViewSet, NotificationViewSet,
                           PaymentMethodViewSet, PromoViewSet, SEOPageViewSet,
                           SiteFAQViewSet, SiteSettingsView,
                           WinnerViewSet, admin_setup, admin_stats, cashout_request,
                           export_csv, leaderboard, points_report,
                           promo_redeem, public_stats, search_suggest,
                           settlement_report, telegram_alert, top_games)

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
router.register("platform/tenants", TenantViewSet, basename="tenant")
router.register("game-logins", GameLoginViewSet, basename="gamelogin")
router.register("game-providers", gaming.ProviderViewSet, basename="gameprovider")
router.register("pay-methods", gaming.PayMethodViewSet, basename="paymethod")

api = [
    # auth
    path("auth/login/", LoginView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("auth/signup/", SignupView.as_view()),
    path("auth/change-password/", ChangePasswordView.as_view()),
    # singletons + stats
    path("settings/", SiteSettingsView.as_view()),
    path("business/", BusinessInfoView.as_view()),
    path("stats/public/", public_stats),
    path("stats/admin/", admin_stats),
    path("points/report/", points_report),
    path("telegram/alert/", telegram_alert),
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
    # chat
    path("chat/conversation/", ConversationView.as_view()),
    path("chat/send/", SendView.as_view()),
    path("chat/inbox/", InboxView.as_view()),
    # messenger (direct, groups, SMS threads)
    path("messenger/users/", messenger.UserSearchView.as_view()),
    path("messenger/unread/", messenger.UnreadView.as_view()),
    path("messenger/conversations/", messenger.ConversationListView.as_view()),
    path("messenger/conversations/<int:pk>/",
         messenger.ConversationDetailView.as_view()),
    path("messenger/conversations/<int:pk>/members/",
         messenger.MembersView.as_view()),
    path("messenger/conversations/<int:pk>/members/<int:user_id>/",
         messenger.MembersView.as_view()),
    path("messenger/conversations/<int:pk>/messages/",
         messenger.MessagesView.as_view()),
    path("messenger/messages/<int:msg_id>/",
         messenger.MessageDetailView.as_view()),
    path("messenger/people/<int:user_id>/", messenger.UserProfileView.as_view()),
    path("messenger/profile/", messenger.MyProfileView.as_view()),
    path("messenger/blocks/", messenger.BlocksView.as_view()),
    path("messenger/blocks/<int:user_id>/", messenger.BlocksView.as_view()),
    path("messenger/reports/", messenger.ReportsView.as_view()),
    path("messenger/reports/<int:pk>/", messenger.ReportActionView.as_view()),
    path("messenger/saved-replies/", messenger.SavedRepliesView.as_view()),
    path("messenger/saved-replies/<int:pk>/",
         messenger.SavedReplyDetailView.as_view()),
    path("messenger/players/<int:user_id>/panel/",
         messenger.PlayerPanelView.as_view()),
    path("messenger/push/key/", messenger.PushKeyView.as_view()),
    path("messenger/push/subscribe/", messenger.PushSubscribeView.as_view()),
    path("messenger/sms/inbound/", messenger.sms_inbound),
    path("messenger/sendblue/<str:token>/", messenger.sendblue_inbound),
    path("admin/sendblue/", sendblue_setup.status),
    path("admin/sendblue/check/", sendblue_setup.check),
    path("admin/sendblue/connect/", sendblue_setup.connect),
    path("admin/sendblue/test/", sendblue_setup.send_test),
    path("admin/twilio/", twilio_setup.status),
    path("admin/twilio/check/", twilio_setup.check),
    path("admin/twilio/connect-number/", twilio_setup.connect_number),
    path("admin/twilio/test/", twilio_setup.send_test),
    path("game-logins/me/", my_game_logins),
    # self-service play: accounts, deposits (BytePayout), redeems
    path("play/options/", gaming.play_options),
    path("play/accounts/", gaming.create_my_account),
    path("play/accounts/<int:login_id>/balance/", gaming.my_balance),
    path("play/deposits/", gaming.my_deposits),
    path("play/deposits/<str:ref>/", gaming.my_deposit),
    path("play/redeems/", gaming.my_redeems),
    path("pay/bytepayout/webhook/", gaming.bytepayout_webhook),
    # staff
    path("admin/deposits/", gaming.admin_deposits),
    path("admin/deposits/<int:pk>/<str:act>/", gaming.admin_deposit_action),
    path("admin/redeems/", gaming.admin_redeems),
    path("admin/redeems/<int:pk>/<str:act>/", gaming.admin_redeem_action),
    path("admin/game-accounts/", gaming.staff_login_action),
    path("admin/gateway-balance/", gaming.gateway_balance),
    path("admin/setup/", admin_setup),
    # platform (owner sells/manages casino sites)
    path("platform/stats/", platform_stats),
    path("platform/usage/", platform_usage),
    path("platform/analytics/", analytics.overview),
    # forwarded email (Gmail → inbound provider → here)
    path("mail/inbound/<str:token>/", mail_views.inbound),
    path("admin/mail/", mail_views.admin_list),
    path("admin/mail/setup/", mail_views.setup),
    path("admin/mail/open-payments/", mail_views.open_payments),
    path("admin/mail/<int:pk>/", mail_views.admin_detail),
    path("admin/mail/<int:pk>/<str:act>/", mail_views.admin_detail),
    path("owner-chat/", ownerchat.site_thread),
    path("owner-chat/read/", ownerchat.site_read),
    path("platform/chats/", ownerchat.owner_threads),
    path("platform/chats/unread/", ownerchat.owner_unread),
    path("platform/chats/<int:tenant_id>/", ownerchat.owner_thread),
    path("platform/chats/<int:tenant_id>/read/", ownerchat.owner_read),
    path("platform/bytepayout/", analytics.bytepayout_account),
    path("platform/bytepayout/payouts/", bpledger.record_payout),
    path("bytepayout/", bpledger.site_summary),
    path("platform/transactions/", analytics.transactions),
    path("platform/games/", analytics.games),
    path("platform/players/", analytics.players),
    path("platform/players/<int:pk>/", analytics.player_detail),
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
