from django.contrib.auth import login as django_login
from knox.models import AuthToken
from knox.views import LogoutView as KnoxLogoutView
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import LoginLog, User
from .permissions import IsAdminOrAgent, IsAdminRole
from .serializers import (AdminUserSerializer, ChangePasswordSerializer,
                          LoginSerializer, UserSerializer)


class LoginView(APIView):
    """Username/password -> knox token + user profile."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        _, token = AuthToken.objects.create(user)
        # also establish a session (handy for the browsable API / django admin)
        django_login(request, user)
        LoginLog.objects.create(
            user=user, ip=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255])
        return Response({"token": token, "user": UserSerializer(user).data})


class LogoutView(KnoxLogoutView):
    pass


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response({"detail": "Current password is incorrect."},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        return Response({"detail": "Password updated."})


class AdminUserViewSet(viewsets.ModelViewSet):
    """Account management (no public registration).

    Admins manage every account on their site and create agents; agents see,
    create and edit only their own players.
    """
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminOrAgent]

    def get_queryset(self):
        from django.db.models import Count, IntegerField, Max, OuterRef, Subquery, Sum
        from catalog.models import GameLogin
        from gaming.models import Deposit
        # subqueries (not joins) so the sums aren't multiplied by other rows
        paid = Deposit.objects.filter(user=OuterRef("pk"), status="approved").order_by().values("user")
        logins = GameLogin.objects.filter(user=OuterRef("pk")).order_by().values("user")
        qs = User.objects.select_related("agent").order_by("role", "username").annotate(
            total_loaded=Subquery(paid.annotate(s=Sum("amount")).values("s")),
            deposit_count=Subquery(paid.annotate(n=Count("id")).values("n"), output_field=IntegerField()),
            last_deposit=Subquery(paid.annotate(m=Max("created_at")).values("m")),
            login_count=Subquery(logins.annotate(n=Count("id")).values("n"), output_field=IntegerField()))
        me = self.request.user
        if not me.is_admin_role:
            qs = qs.filter(agent=me)
        role = self.request.query_params.get("role")
        return qs.filter(role=role) if role else qs

    def perform_destroy(self, instance):
        if instance == self.request.user or instance.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can't delete this account.")
        instance.delete()


class LoginLogView(APIView):
    """Admin: recent login activity (security)."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        logs = LoginLog.objects.select_related("user")[:100]
        return Response([{
            "id": l.id, "user": l.user.username, "role": l.user.role,
            "ip": l.ip, "user_agent": l.user_agent,
            "at": l.created_at.isoformat(),
        } for l in logs])


class PingPlayerView(APIView):
    """Admin: notify a player by email and/or SMS (and in-app)."""
    permission_classes = [IsAdminRole]

    def post(self, request):
        from django.core.mail import send_mail
        from content.models import Notification, SiteSettings
        user = User.objects.filter(pk=request.data.get("user")).first()
        if not user:
            return Response({"detail": "Player not found."}, status=404)
        channel = request.data.get("channel", "email")
        subject = request.data.get("subject", "A message from support")
        message = request.data.get("message", "")
        result = {"email": None, "sms": None}

        if channel in ("email", "both"):
            if user.email:
                try:
                    send_mail(subject, message, None, [user.email],
                              fail_silently=False)
                    result["email"] = "sent"
                except Exception as e:
                    result["email"] = f"error: {e}"
            else:
                result["email"] = "no email on file"

        if channel in ("sms", "both"):
            result["sms"] = _send_sms(user.phone, message)

        Notification.objects.create(user=user, text=f"📨 {subject}", link="/dashboard")
        return Response(result)


def _send_sms(phone, message):
    import urllib.parse
    import urllib.request
    from content.models import SiteSettings
    s = SiteSettings.load()
    if not (s.twilio_sid and s.twilio_token and s.twilio_from):
        return "sms not configured"
    if not phone:
        return "no phone on file"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_sid}/Messages.json"
    data = urllib.parse.urlencode({"To": phone, "From": s.twilio_from,
                                   "Body": message}).encode()
    req = urllib.request.Request(url, data=data)
    auth = f"{s.twilio_sid}:{s.twilio_token}"
    import base64
    req.add_header("Authorization", "Basic " + base64.b64encode(auth.encode()).decode())
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return "sent" if resp.status in (200, 201) else f"status {resp.status}"
    except Exception as e:
        return f"error: {e}"


class SignupThrottle(AnonRateThrottle):
    scope = "signup"
    rate = "5/hour"


class SignupView(APIView):
    """New players create their own account (when the site allows it).
    Staff accounts are still only made by admins."""
    authentication_classes = []
    permission_classes = []
    throttle_classes = [SignupThrottle]

    def post(self, request):
        import re
        from content.models import SiteSettings
        settings = SiteSettings.load()
        if not settings.allow_signup:
            return Response({"detail": "Sign-up is closed. Ask support for an account."},
                            status=status.HTTP_403_FORBIDDEN)
        tenant = getattr(request, "tenant", None)
        if tenant and tenant.max_users and User.objects.count() >= tenant.max_users:
            return Response({"detail": "This site isn't taking new players right now."},
                            status=status.HTTP_403_FORBIDDEN)
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        errors = {}
        if not re.fullmatch(r"[A-Za-z0-9_]{3,24}", username):
            errors["username"] = "3–24 letters, numbers or underscores."
        elif User.objects.filter(username__iexact=username).exists():
            errors["username"] = "That username is taken."
        if len(password) < 8 or password.isdigit() or password.isalpha():
            errors["password"] = "At least 8 characters with letters and numbers."
        email = (request.data.get("email") or "").strip()[:254]
        phone = re.sub(r"[^\d+]", "", request.data.get("phone") or "")[:20]
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        referrer = None
        ref = (request.data.get("ref") or "").strip().upper()
        if ref:
            referrer = User.objects.filter(referral_code=ref).first()
        user = User(username=username, role=User.Role.USER, email=email, phone=phone,
                    full_name=(request.data.get("full_name") or "").strip()[:150],
                    referred_by=referrer,
                    agent=referrer if referrer and referrer.is_agent_role else None)
        user.set_password(password)
        user.save()
        _, token = AuthToken.objects.create(user)
        LoginLog.objects.create(
            user=user, ip=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255])
        return Response({"token": token, "user": UserSerializer(user).data},
                        status=status.HTTP_201_CREATED)
