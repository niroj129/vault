from django.contrib.auth import login as django_login
from knox.models import AuthToken
from knox.views import LogoutView as KnoxLogoutView
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import LoginLog, User
from .permissions import IsAdminRole
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
    """Admin-only CRUD for accounts (no public registration)."""
    queryset = User.objects.all().order_by("role", "username")
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminRole]


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
        subject = request.data.get("subject", "A message from Tiffany Gaming")
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
