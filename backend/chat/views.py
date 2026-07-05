"""Chat API — conversations are strictly between a USER and an ADMIN.

Rules enforced here:
  * A non-admin user can only message an admin (support). They never choose a
    recipient and only ever see their own conversation with support.
  * An admin can message any non-admin user and browse an inbox of users.
  * User-to-user messaging is impossible.
"""

from django.db.models import Max, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from .models import Message
from .serializers import MessageSerializer


def support_admin():
    return (User.objects.filter(role="admin", is_active=True).order_by("id").first()
            or User.objects.filter(is_superuser=True).order_by("id").first())


def conversation_qs(participant):
    """All messages for a (non-admin) participant — always with an admin."""
    return Message.objects.filter(
        Q(sender=participant) | Q(recipient=participant)
    ).select_related("sender", "recipient")


class ConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        me = request.user
        if me.is_admin_role:
            user_id = request.query_params.get("user")
            if not user_id:
                return Response({"detail": "user query param required."},
                                status=status.HTTP_400_BAD_REQUEST)
            target = User.objects.filter(pk=user_id).first()
            if not target or target.is_admin_role:
                return Response({"detail": "Invalid user."},
                                status=status.HTTP_400_BAD_REQUEST)
            qs = conversation_qs(target)
            # mark the user's messages to admin as read
            qs.filter(sender=target, is_read=False).update(is_read=True)
        else:
            target = me
            qs = conversation_qs(me)
            qs.filter(recipient=me, is_read=False).update(is_read=True)
        return Response({
            "user": {"id": target.id, "username": target.username,
                     "full_name": target.full_name},
            "messages": MessageSerializer(qs, many=True).data,
        })


class SendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        me = request.user
        body = (request.data.get("body") or "").strip()
        image = request.FILES.get("image")
        if not body and not image:
            return Response({"detail": "Empty message."},
                            status=status.HTTP_400_BAD_REQUEST)

        if me.is_admin_role:
            recipient = User.objects.filter(
                pk=request.data.get("recipient")).first()
            if not recipient or recipient.is_admin_role:
                return Response({"detail": "Admins must message a valid user."},
                                status=status.HTTP_400_BAD_REQUEST)
        else:
            recipient = support_admin()
            if not recipient:
                return Response({"detail": "Support is unavailable."},
                                status=status.HTTP_503_SERVICE_UNAVAILABLE)

        msg = Message.objects.create(sender=me, recipient=recipient,
                                     body=body, image=image)
        # Notify the player when support replies.
        if me.is_admin_role:
            from content.models import Notification
            Notification.objects.create(
                user=recipient, text="💬 New reply from support", link="/chat")
        return Response(MessageSerializer(msg).data,
                        status=status.HTTP_201_CREATED)


class InboxView(APIView):
    """Admin-only: list of user conversations with unread counts."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_admin_role:
            return Response({"detail": "Admins only."},
                            status=status.HTTP_403_FORBIDDEN)
        # every non-admin user that has exchanged a message
        user_ids = set(
            Message.objects.values_list("sender_id", flat=True)
        ) | set(Message.objects.values_list("recipient_id", flat=True))
        users = User.objects.filter(pk__in=user_ids).exclude(role="admin")
        inbox = []
        for u in users:
            qs = conversation_qs(u)
            last = qs.aggregate(m=Max("created_at"))["m"]
            unread = qs.filter(sender=u, is_read=False).count()
            last_msg = qs.last()
            inbox.append({
                "id": u.id, "username": u.username, "full_name": u.full_name,
                "last_at": last, "unread": unread,
                "preview": (last_msg.body[:60] if last_msg else ""),
            })
        inbox.sort(key=lambda x: x["last_at"] or "", reverse=True)
        return Response(inbox)
