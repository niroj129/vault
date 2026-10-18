"""Messenger API — anyone on a site can message anyone, 1:1 or in groups.

Conversation kinds:
  * direct  — exactly one per pair of users (find people by @username).
  * group   — owner/admins rename and add/remove; anyone can leave.
  * support — one per player with every admin (and the player's agent);
              pinned at the top of the player's Messages.
  * sms     — staff text an outside phone number via Twilio; replies arrive
              through sms_inbound into the same thread (shared team inbox).

Safety for open messaging:
  * Blocks: a blocked user can't send you direct messages or add you to groups.
  * Privacy: each user picks who can start a chat with them (everyone /
    people they already chat with / nobody). Staff can always reach players.
  * Spam limit: players who haven't loaded yet can start chats with at most
    NEW_CONTACTS_PER_DAY new people per day.
  * Reports go to the admins' queue; staff can warn, mute or ban.

Writes go through this REST API; every change is pushed to participants'
browsers over the websocket (chat.consumers) via chat.events, and to closed
browsers via Web Push (chat.push).
"""

from datetime import timedelta

from django import forms
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Max, Q
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from . import presence, push, sendblue, sms
from .events import push_to_conversation, push_to_users
from .models import (Block, ChatMessage, Conversation, Participant, Report,
                     SavedReply, PushSubscription)

MAX_BODY = 4000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
PAGE = 50
EDIT_WINDOW = timedelta(minutes=15)
NEW_CONTACTS_PER_DAY = 10
K = Conversation.Kind


class MessengerEnabled(BasePermission):
    message = "Messaging isn't included in this site's plan."

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        return bool(request.user and request.user.is_authenticated
                    and (tenant is None or tenant.feature_messenger))


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_staff_role)


class IsSiteAdmin(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_admin_role)


PERMS = [IsAuthenticated, MessengerEnabled]
STAFF_PERMS = [IsAuthenticated, MessengerEnabled, IsStaff]


def sms_allowed(request):
    tenant = getattr(request, "tenant", None)
    return tenant is None or tenant.feature_sms


class SendThrottle(UserRateThrottle):
    scope = "messenger_send"
    rate = "30/min"


# ---------------------------------------------------------------- serializing

def name(u):
    return u.full_name or u.username


def avatar_url(u):
    return u.avatar.url if u.avatar else None


def user_brief(u, online=None):
    return {"id": u.id, "username": u.username, "full_name": u.full_name,
            "role": u.role, "avatar": avatar_url(u),
            "online": (u.id in online) if online is not None else None,
            "last_seen": u.last_seen}


def message_dict(m):
    deleted = m.deleted_at is not None
    return {
        "id": m.id,
        "conversation": m.conversation_id,
        "sender": m.sender_id,
        # sender-less text messages are automatic payment/cash-out updates
        "sender_name": name(m.sender) if m.sender else (
            "Cashier" if m.kind == ChatMessage.Kind.TEXT else
            (m.conversation.title or m.conversation.phone) if m.kind == ChatMessage.Kind.SMS_IN else ""),
        # "sms" / "whatsapp" for phone messages
        "channel": m.conversation.channel if m.kind in (ChatMessage.Kind.SMS_IN, ChatMessage.Kind.SMS_OUT) else "",
        "kind": m.kind,
        "body": "" if deleted else m.body,
        "image": None if deleted or not m.image else m.image.url,
        "sms_status": m.sms_status,
        "created_at": m.created_at,
        "edited_at": m.edited_at,
        "deleted": deleted,
    }


def display_title(conv, members, me):
    if conv.kind == K.DIRECT:
        other = next((u for u in members if u.id != me.id), None)
        return name(other) if other else "Just you"
    if conv.kind == K.SUPPORT:
        if conv.subject_id == me.id:
            return "Support"
        return name(conv.subject) if conv.subject else "Support"
    if conv.kind == K.SMS:
        return conv.title or conv.phone
    if conv.title:
        return conv.title
    names = [name(u) for u in members if u.id != me.id]
    return ", ".join(names[:3]) + ("…" if len(names) > 3 else "") or "Group"


class Ctx:
    """Per-request lookups shared while serializing many conversations."""

    def __init__(self, me, user_ids=()):
        self.me = me
        self.online = presence.online_ids(user_ids)
        rows = Block.objects.filter(Q(blocker=me) | Q(blocked=me)) \
            .values_list("blocker_id", "blocked_id")
        self.i_blocked = {b for a, b in rows if a == me.id}
        self.blocked_me = {a for a, b in rows if b == me.id}


def send_state(conv, me, members, ctx):
    """(can_send, reason) for the composer."""
    if conv.kind == K.SUPPORT:
        return True, ""
    if me.chat_muted_until and me.chat_muted_until > timezone.now():
        return False, ("Staff muted your messages until "
                       f"{timezone.localtime(me.chat_muted_until):%b %-d, %-I:%M %p}.")
    if conv.kind == K.DIRECT:
        other = next((u for u in members if u.id != me.id), None)
        if other is None:
            return False, ""
        if other.id in ctx.i_blocked:
            return False, f"You blocked {name(other)}. Unblock to message them."
        if other.id in ctx.blocked_me:
            return False, f"{name(other)} isn't accepting your messages."
        if not other.is_active:
            return False, "This account is no longer active."
        if (other.dm_privacy == User.DMPrivacy.NOBODY
                and not me.is_staff_role):
            return False, f"{name(other)} only accepts messages from staff."
    return True, ""


def conversation_dict(conv, me, unread=0, my_role="member", last=None,
                      ctx=None):
    parts = list(conv.participants.all())
    members = [p.user for p in parts]
    if ctx is None:
        ctx = Ctx(me, [u.id for u in members])
    can_send, reason = send_state(conv, me, members, ctx)
    other = (next((u for u in members if u.id != me.id), None)
             if conv.kind == K.DIRECT else None)
    return {
        "id": conv.id,
        "kind": conv.kind,
        "title": display_title(conv, members, me),
        "raw_title": conv.title,
        "phone": conv.phone, "channel": conv.channel,
        "avatar": avatar_url(other) if other else None,
        "subject": (user_brief(conv.subject, ctx.online)
                    if conv.subject_id else None),
        "pinned": conv.kind == K.SUPPORT and conv.subject_id == me.id,
        "members": [dict(user_brief(p.user, ctx.online), member_role=p.role,
                         last_read_id=p.last_read_id) for p in parts],
        "my_role": my_role,
        "unread": unread,
        "last_message": message_dict(last) if last else None,
        "updated_at": conv.updated_at,
        "can_send": can_send,
        "send_block_reason": reason,
        "blocked": (other.id in ctx.i_blocked) if other else False,
    }


# ------------------------------------------------------------------- helpers

def membership(conv_id, user):
    return get_object_or_404(
        Participant.objects.select_related("conversation",
                                           "conversation__subject"),
        conversation_id=conv_id, user=user)


def touch(conv):
    Conversation.objects.filter(pk=conv.pk).update(updated_at=timezone.now())


def system_message(conv, text):
    msg = ChatMessage.objects.create(conversation=conv,
                                     kind=ChatMessage.Kind.SYSTEM, body=text)
    touch(conv)
    push_to_conversation(conv, {"type": "message", "message": message_dict(msg)})
    return msg


def conversation_changed(conv, extra_user_ids=()):
    """Tell members (and anyone just removed) to refetch this conversation."""
    push_to_conversation(conv, {"type": "conversation",
                                "conversation": conv.id}, extra_user_ids)


def clean_image(f):
    if not f:
        return None
    if f.size > MAX_IMAGE_BYTES:
        raise ValidationError("Image must be 5 MB or smaller.")
    return forms.ImageField().clean(f)


def bad(detail, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": detail}, status=code)


def admin_ids():
    return list(User.objects.filter(is_active=True)
                .filter(Q(role=User.Role.ADMIN) | Q(is_superuser=True))
                .values_list("id", flat=True))


def has_played(user):
    """True once any of the player's deposits has been loaded onto a game."""
    from gaming.models import Deposit
    return Deposit.objects.filter(user=user, status=Deposit.Status.APPROVED,
                                  load_status=Deposit.Load.LOADED).exists()


def new_contacts_today(me):
    since = timezone.now() - timedelta(days=1)
    return (Participant.objects
            .filter(conversation__created_by=me, joined_at__gte=since,
                    conversation__kind__in=[K.DIRECT, K.GROUP])
            .exclude(user=me).values("user").distinct().count())


def spam_check(me, how_many):
    """Error text when a new player would pass today's new-contacts limit."""
    if me.is_staff_role or how_many <= 0 or has_played(me):
        return None
    left = NEW_CONTACTS_PER_DAY - new_contacts_today(me)
    if how_many > left:
        return (f"New accounts can start chats with {NEW_CONTACTS_PER_DAY} "
                "new people a day until their first load. "
                + (f"You have {max(left, 0)} left today." if left > 0
                   else "Try again tomorrow."))
    return None


def sendblue_callback(request):
    """Where Sendblue should report delivery for a message: our webhook, but only if it's reachable."""
    from content.models import SiteSettings
    token = SiteSettings.load().sendblue_token
    url = request.build_absolute_uri(f"/api/messenger/sendblue/{token}/") if token else ""
    host = request.get_host().split(":")[0]
    local = host in ("localhost", "127.0.0.1") or host.endswith(".localhost")
    return url if url.startswith("https://") and not local else ""


def get_or_create_sms_thread(phone, created_by=None, channel=sms.SMS):
    """One thread per phone number and channel (SMS or WhatsApp)."""
    conv = Conversation.objects.filter(kind=K.SMS, phone=phone, channel=channel).first()
    if conv:
        return conv, False
    conv = Conversation.objects.create(kind=K.SMS, phone=phone, channel=channel,
                                       created_by=created_by)
    ids = set(admin_ids()) | ({created_by.id} if created_by else set())
    Participant.objects.bulk_create([
        Participant(conversation=conv, user_id=uid, role=Participant.Role.ADMIN)
        for uid in ids])
    return conv, True


def support_staff_ids(player):
    ids = set(admin_ids())
    if player.agent_id:
        ids.add(player.agent_id)
    return ids


def ensure_support(player):
    """The player's pinned support conversation, created on first use."""
    conv = Conversation.objects.filter(kind=K.SUPPORT, subject=player).first()
    if conv:
        return conv
    try:
        with transaction.atomic():
            conv = Conversation.objects.create(kind=K.SUPPORT, subject=player)
    except IntegrityError:
        return Conversation.objects.get(kind=K.SUPPORT, subject=player)
    Participant.objects.bulk_create(
        [Participant(conversation=conv, user=player)]
        + [Participant(conversation=conv, user_id=uid,
                       role=Participant.Role.ADMIN)
           for uid in support_staff_ids(player) - {player.id}])
    return conv


def sync_staff_support(staff):
    """Join staff to support threads they should see (new admins, agents'
    players), starting caught up so old history isn't unread."""
    qs = Conversation.objects.filter(kind=K.SUPPORT) \
        .exclude(participants__user=staff)
    if not staff.is_admin_role:
        qs = qs.filter(subject__agent=staff)
    missing = list(qs.annotate(last=Max("messages__id")))
    Participant.objects.bulk_create([
        Participant(conversation=c, user=staff, role=Participant.Role.ADMIN,
                    last_read_id=c.last or 0) for c in missing])


def notify_offline(conv, sender, text):
    """Web Push to members with no open tab."""
    ids = set(conv.participants.exclude(user=sender)
              .values_list("user_id", flat=True))
    offline = ids - presence.online_ids(ids)
    if not offline:
        return
    if conv.kind == K.DIRECT or (conv.kind == K.SUPPORT
                                 and sender and sender.id == conv.subject_id):
        title = name(sender) if sender else "New message"
    elif conv.kind == K.SUPPORT:
        title = "Support"
    else:
        title = conv.title or "Group"
        text = f"{name(sender)}: {text}" if sender else text
    push.notify(offline, title, text, f"/messages?c={conv.id}",
                tag=f"conv-{conv.id}")


def contact_ids(user):
    """People who share a direct or support chat with `user`."""
    convs = Participant.objects.filter(
        user=user, conversation__kind__in=[K.DIRECT, K.SUPPORT]
    ).values("conversation")
    return set(Participant.objects.filter(conversation__in=convs)
               .exclude(user=user).values_list("user_id", flat=True))


# --------------------------------------------------------------------- views

class UserSearchView(APIView):
    """Find people to message by @username or name."""
    permission_classes = PERMS

    def get(self, request):
        me = request.user
        q = (request.query_params.get("q") or "").strip().lstrip("@")
        qs = User.objects.filter(is_active=True).exclude(pk=me.pk) \
            .exclude(pk__in=Block.objects.filter(blocked=me)
                     .values("blocker"))
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(full_name__icontains=q))
        users = list(qs.order_by("username")[:20])
        online = presence.online_ids([u.id for u in users])
        out = []
        for u in users:
            row = user_brief(u, online)
            row["can_message"] = (me.is_staff_role
                                  or u.dm_privacy == User.DMPrivacy.EVERYONE
                                  or u.is_staff_role)
            out.append(row)
        return Response(out)


class UserProfileView(APIView):
    """Someone's profile card."""
    permission_classes = PERMS

    def get(self, request, user_id):
        u = get_object_or_404(User.objects.filter(is_active=True), pk=user_id)
        me = request.user
        data = user_brief(u, presence.online_ids([u.id]))
        data.update(bio=u.bio, date_joined=u.date_joined,
                    vip_tier=u.vip_tier if u.role == "user" else None,
                    blocked=Block.objects.filter(blocker=me, blocked=u).exists(),
                    is_staff=u.is_staff_role)
        return Response(data)


class MyProfileView(APIView):
    """Your own messenger profile: photo, bio, name and privacy."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response({"avatar": avatar_url(u), "bio": u.bio,
                         "full_name": u.full_name, "dm_privacy": u.dm_privacy,
                         "privacy_choices": User.DMPrivacy.choices})

    def patch(self, request):
        u = request.user
        fields = []
        if "bio" in request.data:
            u.bio = (request.data.get("bio") or "").strip()[:160]
            fields.append("bio")
        if "full_name" in request.data:
            u.full_name = (request.data.get("full_name") or "").strip()[:150]
            fields.append("full_name")
        if "dm_privacy" in request.data:
            if request.data["dm_privacy"] not in User.DMPrivacy.values:
                return bad("Pick everyone, contacts or nobody.")
            u.dm_privacy = request.data["dm_privacy"]
            fields.append("dm_privacy")
        if request.FILES.get("avatar"):
            try:
                img = clean_image(request.FILES["avatar"])
            except ValidationError as e:
                return bad(e.messages[0])
            if u.avatar:
                u.avatar.delete(save=False)
            u.avatar = img
            fields.append("avatar")
        elif str(request.data.get("remove_avatar")).lower() in ("1", "true"):
            if u.avatar:
                u.avatar.delete(save=False)
            u.avatar = None
            fields.append("avatar")
        if fields:
            u.save(update_fields=fields)
        return self.get(request)


class ConversationListView(APIView):
    permission_classes = PERMS

    def get(self, request):
        me = request.user
        if me.role == User.Role.USER:
            ensure_support(me)
        elif me.is_staff_role:
            sync_staff_support(me)
        parts = list(
            Participant.objects.filter(user=me)
            .select_related("conversation", "conversation__subject")
            .prefetch_related("conversation__participants__user")
            .annotate(
                unread=Count("conversation__messages", filter=Q(
                    conversation__messages__id__gt=F("last_read_id"))
                    & ~Q(conversation__messages__sender=me)
                    & ~Q(conversation__messages__kind=ChatMessage.Kind.SYSTEM)),
                last_id=Max("conversation__messages__id"),
            )
            .order_by("-conversation__updated_at"))
        # an empty support thread stays visible only for its player
        parts = [p for p in parts if p.last_id
                 or p.conversation.kind != K.SUPPORT
                 or p.conversation.subject_id == me.id]
        lasts = ChatMessage.objects.select_related("sender").in_bulk(
            [p.last_id for p in parts if p.last_id])
        ids = {pp.user_id for p in parts
               for pp in p.conversation.participants.all()}
        ctx = Ctx(me, ids)
        rows = [conversation_dict(p.conversation, me, p.unread, p.role,
                                  lasts.get(p.last_id), ctx) for p in parts]
        rows.sort(key=lambda r: not r["pinned"])  # stable: pinned first
        return Response(rows)

    @transaction.atomic
    def post(self, request):
        me = request.user
        kind = request.data.get("kind")

        if kind == K.DIRECT:
            other = User.objects.filter(pk=request.data.get("user"),
                                        is_active=True).first()
            if not other or other == me:
                return bad("Pick someone to message.")
            lo, hi = sorted([me.id, other.id])
            key = f"{lo}:{hi}"
            conv = Conversation.objects.filter(direct_key=key).first()
            if not conv:
                if Block.objects.filter(blocker=other, blocked=me).exists():
                    return bad(f"{name(other)} isn't accepting your messages.",
                               status.HTTP_403_FORBIDDEN)
                if not me.is_staff_role and not other.is_staff_role \
                        and other.dm_privacy != User.DMPrivacy.EVERYONE:
                    return bad(f"{name(other)} doesn't accept new chats.",
                               status.HTTP_403_FORBIDDEN)
                err = spam_check(me, 1)
                if err:
                    return bad(err, status.HTTP_429_TOO_MANY_REQUESTS)
                try:
                    with transaction.atomic():
                        conv = Conversation.objects.create(
                            kind=kind, direct_key=key, created_by=me)
                except IntegrityError:  # created concurrently
                    conv = Conversation.objects.get(direct_key=key)
                for u in (me, other):
                    Participant.objects.get_or_create(conversation=conv, user=u)

        elif kind == K.GROUP:
            title = (request.data.get("title") or "").strip()[:120]
            ids = {int(i) for i in request.data.get("members") or []
                   if str(i).isdigit()}
            members = list(User.objects.filter(pk__in=ids, is_active=True)
                           .exclude(pk=me.pk)
                           .exclude(pk__in=Block.objects.filter(blocked=me)
                                    .values("blocker")))
            if not members:
                return bad("Add at least one other person to the group.")
            err = spam_check(me, len(members))
            if err:
                return bad(err, status.HTTP_429_TOO_MANY_REQUESTS)
            conv = Conversation.objects.create(kind=kind, title=title,
                                               created_by=me)
            Participant.objects.create(conversation=conv, user=me,
                                       role=Participant.Role.OWNER)
            Participant.objects.bulk_create([
                Participant(conversation=conv, user=u) for u in members])
            system_message(conv, f"{name(me)} created the group")

        elif kind == K.SUPPORT:
            if me.role == User.Role.USER:
                conv = ensure_support(me)
            elif me.is_staff_role and request.data.get("user"):
                # staff opening a player's support chat (e.g. from Players)
                qs = User.objects.filter(role=User.Role.USER)
                if not me.is_admin_role:
                    qs = qs.filter(agent=me)
                player = qs.filter(pk=request.data.get("user")).first()
                if not player:
                    return bad("Player not found.", status.HTTP_404_NOT_FOUND)
                conv = ensure_support(player)
                Participant.objects.get_or_create(
                    conversation=conv, user=me,
                    defaults={"role": Participant.Role.ADMIN})
            else:
                return bad("Support chats are for players.")

        elif kind == K.SMS:
            if not sms_allowed(request):
                return bad("SMS isn't included in this site's plan.",
                           status.HTTP_403_FORBIDDEN)
            if not me.is_staff_role:
                return bad("Only staff can text phone numbers.",
                           status.HTTP_403_FORBIDDEN)
            phone = sms.normalize_phone(request.data.get("phone"))
            if not phone:
                return bad("Enter a valid phone number, e.g. +15551234567.")
            ch = request.data.get("channel")
            channel = ch if ch in (sms.WHATSAPP, sendblue.CHANNEL) else sms.SMS
            if channel == sms.WHATSAPP and not sms.is_configured(sms.WHATSAPP):
                return bad("WhatsApp isn't set up yet. Add your WhatsApp number under Phone messaging.")
            if channel == sendblue.CHANNEL and not sendblue.is_configured():
                return bad("iMessage isn't set up yet. Add your Sendblue details under Phone messaging.")
            conv, _ = get_or_create_sms_thread(phone, me, channel)
            Participant.objects.get_or_create(
                conversation=conv, user=me,
                defaults={"role": Participant.Role.ADMIN})
            title = (request.data.get("title") or "").strip()[:120]
            if title and not conv.title:
                conv.title = title
                conv.save(update_fields=["title"])
        else:
            return bad("kind must be direct, group, support or sms.")

        part = Participant.objects.get(conversation=conv, user=me)
        conversation_changed(conv)
        return Response(conversation_dict(conv, me, 0, part.role),
                        status=status.HTTP_201_CREATED)


class ConversationDetailView(APIView):
    permission_classes = PERMS

    def get(self, request, pk):
        part = membership(pk, request.user)
        return Response(conversation_dict(part.conversation, request.user,
                                          0, part.role))

    def patch(self, request, pk):
        part = membership(pk, request.user)
        conv = part.conversation
        if conv.kind in (K.DIRECT, K.SUPPORT):
            return bad("This chat can't be renamed.")
        if conv.kind == K.GROUP and not part.can_manage:
            return bad("Only group admins can rename.", status.HTTP_403_FORBIDDEN)
        conv.title = (request.data.get("title") or "").strip()[:120]
        conv.save(update_fields=["title"])
        if conv.kind == K.GROUP:
            system_message(conv, f"{name(request.user)} renamed the group to "
                                 f"“{conv.title or 'untitled'}”")
        conversation_changed(conv)
        return Response(conversation_dict(conv, request.user, 0, part.role))


class MembersView(APIView):
    permission_classes = PERMS

    @transaction.atomic
    def post(self, request, pk):
        """Add members to a group (owner/admin only)."""
        part = membership(pk, request.user)
        conv = part.conversation
        if conv.kind != K.GROUP:
            return bad("Members can only be added to groups.")
        if not part.can_manage:
            return bad("Only group admins can add people.",
                       status.HTTP_403_FORBIDDEN)
        ids = {int(i) for i in request.data.get("user_ids") or []
               if str(i).isdigit()}
        existing = set(conv.participants.values_list("user_id", flat=True))
        new = list(User.objects.filter(pk__in=ids - existing, is_active=True)
                   .exclude(pk__in=Block.objects.filter(blocked=request.user)
                            .values("blocker")))
        err = spam_check(request.user, len(new))
        if err:
            return bad(err, status.HTTP_429_TOO_MANY_REQUESTS)
        # new members start "caught up" so they don't see old history as unread
        last = conv.messages.aggregate(m=Max("id"))["m"] or 0
        Participant.objects.bulk_create([
            Participant(conversation=conv, user=u, last_read_id=last)
            for u in new])
        if new:
            system_message(conv, f"{name(request.user)} added "
                                 + ", ".join(name(u) for u in new))
            conversation_changed(conv)
        return Response(conversation_dict(conv, request.user, 0, part.role))

    @transaction.atomic
    def delete(self, request, pk, user_id):
        """Remove a member (group admins) or leave (yourself)."""
        part = membership(pk, request.user)
        conv = part.conversation
        if conv.kind != K.GROUP:
            return bad("You can only leave groups.")
        target = get_object_or_404(Participant.objects.select_related("user"),
                                   conversation=conv, user_id=user_id)
        leaving = target.user_id == request.user.id
        if not leaving:
            if not part.can_manage or target.role == Participant.Role.OWNER:
                return bad("You can't remove this member.",
                           status.HTTP_403_FORBIDDEN)
        target.delete()
        rest = conv.participants.order_by("joined_at")
        if not rest.exists():
            push_to_users([target.user_id], {"type": "conversation",
                                             "conversation": conv.id})
            conv.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        if target.role == Participant.Role.OWNER:
            heir = (rest.filter(role=Participant.Role.ADMIN).first()
                    or rest.first())
            heir.role = Participant.Role.OWNER
            heir.save(update_fields=["role"])
        system_message(conv, f"{name(target.user)} left the group" if leaving
                       else f"{name(request.user)} removed {name(target.user)}")
        conversation_changed(conv, [target.user_id])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessagesView(APIView):
    permission_classes = PERMS

    def get_throttles(self):
        return [SendThrottle()] if self.request.method == "POST" else []

    def get(self, request, pk):
        """Newest page by default; ?after=<id> for polling, ?before=<id> for
        loading older history."""
        part = membership(pk, request.user)
        qs = part.conversation.messages.select_related("sender")
        after = request.query_params.get("after")
        before = request.query_params.get("before")
        if after and after.isdigit():
            msgs = list(qs.filter(id__gt=int(after))[:200])
        else:
            if before and before.isdigit():
                qs = qs.filter(id__lt=int(before))
            msgs = list(qs.order_by("-id")[:PAGE])[::-1]
        if msgs and msgs[-1].id > part.last_read_id:
            Participant.objects.filter(pk=part.pk).update(
                last_read_id=msgs[-1].id)
            push_to_conversation(part.conversation, {
                "type": "read", "conversation": part.conversation_id,
                "user": request.user.id, "last_read_id": msgs[-1].id})
        return Response({"messages": [message_dict(m) for m in msgs],
                         "has_more": (not after and len(msgs) == PAGE)})

    def post(self, request, pk):
        me = request.user
        part = membership(pk, me)
        conv = part.conversation
        members = [p.user for p in
                   conv.participants.select_related("user")]
        can_send, reason = send_state(conv, me, members,
                                      Ctx(me, []))
        if not can_send:
            return bad(reason or "You can't send messages here.",
                       status.HTTP_403_FORBIDDEN)
        body = (request.data.get("body") or "").strip()
        if len(body) > MAX_BODY:
            return bad(f"Messages are limited to {MAX_BODY} characters.")
        try:
            image = clean_image(request.FILES.get("image"))
        except ValidationError as e:
            return bad(e.messages[0])
        if not body and not image:
            return bad("Empty message.")

        if conv.kind == K.SMS:
            if not sms_allowed(request):
                return bad("SMS isn't included in this site's plan.",
                           status.HTTP_403_FORBIDDEN)
            if image:
                return bad("Images can't be sent by text or WhatsApp here.")
            if conv.channel == sendblue.CHANNEL:
                status_text, handle = sendblue.send(conv.phone, body, callback=sendblue_callback(request))
            else:
                status_text, handle = sms.send(conv.phone, body, conv.channel), ""
            msg = ChatMessage.objects.create(
                conversation=conv, sender=me,
                kind=ChatMessage.Kind.SMS_OUT, body=body,
                sms_status=status_text, external_id=handle)
        else:
            if conv.kind == K.SUPPORT:
                # admins hired after the thread began still see it
                for uid in support_staff_ids(conv.subject) - {
                        u.id for u in members}:
                    Participant.objects.get_or_create(
                        conversation=conv, user_id=uid,
                        defaults={"role": Participant.Role.ADMIN})
            msg = ChatMessage.objects.create(conversation=conv, sender=me,
                                             body=body, image=image)
        touch(conv)
        Participant.objects.filter(pk=part.pk).update(last_read_id=msg.id)
        data = message_dict(msg)
        push_to_conversation(conv, {"type": "message", "message": data})
        notify_offline(conv, me, body or "📷 Photo")
        return Response(data, status=status.HTTP_201_CREATED)


class MessageDetailView(APIView):
    """Edit (sender, within 15 minutes) or delete for everyone (sender, or
    staff in a support chat)."""
    permission_classes = PERMS

    def _get(self, request, msg_id):
        msg = get_object_or_404(
            ChatMessage.objects.select_related("conversation", "sender"),
            pk=msg_id, conversation__participants__user=request.user)
        return msg

    def patch(self, request, msg_id):
        msg = self._get(request, msg_id)
        if msg.sender_id != request.user.id or msg.kind != ChatMessage.Kind.TEXT:
            return bad("You can only edit your own messages.",
                       status.HTTP_403_FORBIDDEN)
        if msg.deleted_at:
            return bad("This message was deleted.")
        if timezone.now() - msg.created_at > EDIT_WINDOW:
            return bad("Messages can be edited for 15 minutes after sending.")
        body = (request.data.get("body") or "").strip()
        if not body and not msg.image:
            return bad("Message can't be empty.")
        if len(body) > MAX_BODY:
            return bad(f"Messages are limited to {MAX_BODY} characters.")
        msg.body = body
        msg.edited_at = timezone.now()
        msg.save(update_fields=["body", "edited_at"])
        data = message_dict(msg)
        push_to_conversation(msg.conversation, {"type": "message_update",
                                                "message": data})
        return Response(data)

    def delete(self, request, msg_id):
        msg = self._get(request, msg_id)
        me = request.user
        staff_in_support = (msg.conversation.kind == K.SUPPORT
                            and me.is_staff_role)
        if msg.sender_id != me.id and not staff_in_support:
            return bad("You can only delete your own messages.",
                       status.HTTP_403_FORBIDDEN)
        if msg.kind not in (ChatMessage.Kind.TEXT,):
            return bad("This message can't be deleted.")
        if not msg.deleted_at:
            if msg.image:
                msg.image.delete(save=False)
            msg.body, msg.image, msg.deleted_at = "", None, timezone.now()
            msg.save(update_fields=["body", "image", "deleted_at"])
            push_to_conversation(msg.conversation, {
                "type": "message_update", "message": message_dict(msg)})
        return Response(message_dict(msg))


class UnreadView(APIView):
    """Total unread messages across all conversations (for the nav badge)."""
    permission_classes = PERMS

    def get(self, request):
        me = request.user
        n = ChatMessage.objects.filter(
            conversation__participants__user=me,
            id__gt=F("conversation__participants__last_read_id"),
        ).exclude(sender=me).exclude(kind=ChatMessage.Kind.SYSTEM).count()
        allowed = sms_allowed(request)
        return Response({"unread": n,
                         "sms_enabled": allowed and sms.is_configured(sms.SMS),
                         "whatsapp_enabled": allowed and sms.is_configured(sms.WHATSAPP),
                         "imessage_enabled": allowed and sendblue.is_configured()})


# --------------------------------------------------------- blocks & reports

class BlocksView(APIView):
    permission_classes = PERMS

    def get(self, request):
        rows = Block.objects.filter(blocker=request.user) \
            .select_related("blocked").order_by("-created_at")
        return Response([dict(user_brief(b.blocked), blocked_at=b.created_at)
                         for b in rows])

    def post(self, request):
        me = request.user
        other = User.objects.filter(pk=request.data.get("user")).first()
        if not other or other == me:
            return bad("Pick someone to block.")
        if other.is_staff_role:
            return bad("Staff can't be blocked. Report them instead.")
        Block.objects.get_or_create(blocker=me, blocked=other)
        self._changed(me, other)
        return Response({"blocked": True}, status=status.HTTP_201_CREATED)

    def delete(self, request, user_id):
        me = request.user
        Block.objects.filter(blocker=me, blocked_id=user_id).delete()
        other = User.objects.filter(pk=user_id).first()
        if other:
            self._changed(me, other)
        return Response({"blocked": False})

    @staticmethod
    def _changed(me, other):
        lo, hi = sorted([me.id, other.id])
        conv = Conversation.objects.filter(direct_key=f"{lo}:{hi}").first()
        if conv:
            conversation_changed(conv)


class ReportsView(APIView):
    """Players file reports; site admins list them."""
    permission_classes = PERMS

    def post(self, request):
        me = request.user
        reported = User.objects.filter(pk=request.data.get("user")).first()
        if not reported or reported == me:
            return bad("Pick who you're reporting.")
        msg = None
        if request.data.get("message"):
            msg = ChatMessage.objects.filter(
                pk=request.data["message"], sender=reported,
                conversation__participants__user=me).first()
        reason = request.data.get("reason") or Report.Reason.OTHER
        if reason not in Report.Reason.values:
            reason = Report.Reason.OTHER
        if Report.objects.filter(reporter=me, reported=reported,
                                 status=Report.Status.OPEN).count() >= 3:
            return bad("You already reported this person. Staff will review it.")
        r = Report.objects.create(
            reporter=me, reported=reported, message=msg,
            excerpt=(msg.body[:1000] if msg else ""), reason=reason,
            details=(request.data.get("details") or "").strip()[:500])
        if str(request.data.get("block")).lower() in ("1", "true") \
                and not reported.is_staff_role:
            Block.objects.get_or_create(blocker=me, blocked=reported)
            BlocksView._changed(me, reported)
        push_to_users(admin_ids(), {"type": "report", "report": r.id})
        return Response({"id": r.id, "detail": "Thanks — staff will review it."},
                        status=status.HTTP_201_CREATED)

    def get(self, request):
        if not request.user.is_admin_role:
            return bad("Admins only.", status.HTTP_403_FORBIDDEN)
        st = request.query_params.get("status") or "open"
        qs = Report.objects.select_related("reporter", "reported", "handled_by")
        if st != "all":
            qs = qs.filter(status=st)
        rows = list(qs[:200])
        counts = dict(Report.objects.filter(
            reported__in=[r.reported_id for r in rows])
            .values_list("reported").annotate(n=Count("id")))
        return Response({
            "open": Report.objects.filter(status=Report.Status.OPEN).count(),
            "results": [{
                "id": r.id,
                "reporter": user_brief(r.reporter) if r.reporter else None,
                "reported": dict(user_brief(r.reported),
                                 is_active=r.reported.is_active,
                                 muted_until=r.reported.chat_muted_until),
                "reports_against": counts.get(r.reported_id, 1),
                "reason": r.reason, "reason_label": r.get_reason_display(),
                "details": r.details, "excerpt": r.excerpt,
                "message": r.message_id, "status": r.status,
                "action": r.action,
                "handled_by": name(r.handled_by) if r.handled_by else "",
                "handled_at": r.handled_at, "created_at": r.created_at,
            } for r in rows]})


class ReportActionView(APIView):
    """warn / mute / ban / dismiss a report (site admins)."""
    permission_classes = [IsAuthenticated, MessengerEnabled, IsSiteAdmin]

    @transaction.atomic
    def post(self, request, pk):
        r = get_object_or_404(Report.objects.select_related("reported"), pk=pk)
        action = request.data.get("action")
        target = r.reported
        note = (request.data.get("note") or "").strip()[:300]
        if action == "warn":
            if target.role == User.Role.USER:
                conv = ensure_support(target)
                msg = ChatMessage.objects.create(
                    conversation=conv, sender=request.user,
                    body="⚠️ Warning from staff: " + (
                        note or "please keep chats respectful and follow "
                                "the site rules, or your messaging may be "
                                "limited."))
                touch(conv)
                push_to_conversation(conv, {"type": "message",
                                            "message": message_dict(msg)})
                notify_offline(conv, request.user, msg.body)
        elif action == "mute":
            hours = request.data.get("hours")
            hours = int(hours) if str(hours).isdigit() else 24
            target.chat_muted_until = timezone.now() + timedelta(
                hours=min(max(hours, 1), 24 * 30))
            target.save(update_fields=["chat_muted_until"])
        elif action == "unmute":
            target.chat_muted_until = None
            target.save(update_fields=["chat_muted_until"])
        elif action == "ban":
            if target.is_staff_role:
                return bad("Staff accounts can't be banned here.")
            target.is_active = False
            target.save(update_fields=["is_active"])
            from knox.models import AuthToken
            AuthToken.objects.filter(user=target).delete()
        elif action != "dismiss":
            return bad("action must be warn, mute, unmute, ban or dismiss.")
        # one decision settles every open report about this person
        Report.objects.filter(reported=target, status=Report.Status.OPEN) \
            .update(status=(Report.Status.DISMISSED if action == "dismiss"
                            else Report.Status.RESOLVED),
                    action=action, handled_by=request.user,
                    handled_at=timezone.now())
        push_to_users(admin_ids(), {"type": "report", "report": r.id})
        return Response({"ok": True})


# ------------------------------------------------------------- staff tools

class SavedRepliesView(APIView):
    permission_classes = STAFF_PERMS

    def get(self, request):
        return Response(list(SavedReply.objects.values("id", "title", "body")))

    def post(self, request):
        title = (request.data.get("title") or "").strip()[:60]
        body = (request.data.get("body") or "").strip()[:2000]
        if not title or not body:
            return bad("Give the reply a title and text.")
        r = SavedReply.objects.create(title=title, body=body,
                                      created_by=request.user)
        return Response({"id": r.id, "title": r.title, "body": r.body},
                        status=status.HTTP_201_CREATED)


class SavedReplyDetailView(APIView):
    permission_classes = STAFF_PERMS

    def patch(self, request, pk):
        r = get_object_or_404(SavedReply, pk=pk)
        if "title" in request.data:
            r.title = (request.data["title"] or "").strip()[:60] or r.title
        if "body" in request.data:
            r.body = (request.data["body"] or "").strip()[:2000] or r.body
        r.save()
        return Response({"id": r.id, "title": r.title, "body": r.body})

    def delete(self, request, pk):
        get_object_or_404(SavedReply, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlayerPanelView(APIView):
    """Everything staff need beside a player's chat."""
    permission_classes = STAFF_PERMS

    def _player(self, request, user_id):
        qs = User.objects.all()
        if not request.user.is_admin_role:
            qs = qs.filter(agent=request.user)
        return get_object_or_404(qs, pk=user_id)

    def get(self, request, user_id):
        from catalog.models import GameLogin
        from content.models import Transaction
        u = self._player(request, user_id)
        txns = Transaction.objects.filter(user=u)[:6]
        loads = Transaction.objects.filter(user=u, kind=Transaction.Kind.LOAD)
        from django.db.models import Sum
        from gaming.models import Deposit, Redeem
        from gaming.views import deposit_dict, redeem_dict
        deps = Deposit.objects.filter(user=u).select_related("game", "pay_method", "login")
        paid = deps.filter(status=Deposit.Status.APPROVED)
        return Response({
            "total_loaded": paid.aggregate(s=Sum("amount"))["s"] or 0,
            "deposit_count": paid.count(),
            "deposits": [deposit_dict(d) for d in deps[:6]],
            "redeems": [redeem_dict(r) for r in Redeem.objects.filter(user=u).select_related("game")[:4]],
            "user": dict(user_brief(u, presence.online_ids([u.id])),
                         bio=u.bio, email=u.email, phone=u.phone,
                         is_active=u.is_active, date_joined=u.date_joined,
                         last_login=u.last_login,
                         agent=name(u.agent) if u.agent_id else None,
                         muted_until=u.chat_muted_until),
            "vip_tier": u.vip_tier, "loyalty_points": u.loyalty_points,
            "vip_next": u.vip_next,
            "loads": loads.count(),
            "transactions": [{"id": t.id, "kind": t.kind,
                              "amount": t.amount, "note": t.note,
                              "created_at": t.created_at} for t in txns],
            "game_logins": [{"id": g.id, "game": g.game_id,
                             "game_name": g.game.name,
                             "username": g.username, "password": g.password,
                             "note": g.note} for g in
                            GameLogin.objects.filter(user=u)
                            .select_related("game")],
            "open_reports": Report.objects.filter(
                reported=u, status=Report.Status.OPEN).count(),
            "notes": u.staff_notes,
        })

    def patch(self, request, user_id):
        u = self._player(request, user_id)
        u.staff_notes = (request.data.get("notes") or "")[:5000]
        u.save(update_fields=["staff_notes"])
        return Response({"notes": u.staff_notes})


# ------------------------------------------------------------------- push

class PushKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"key": push.public_key()})


class PushSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = request.data.get("endpoint") or ""
        keys = request.data.get("keys") or {}
        if not endpoint.startswith("https://") or not keys.get("p256dh") \
                or not keys.get("auth"):
            return bad("Invalid subscription.")
        PushSubscription.all_tenants.filter(endpoint=endpoint).delete()
        PushSubscription.objects.create(user=request.user, endpoint=endpoint,
                                        p256dh=keys["p256dh"][:200],
                                        auth=keys["auth"][:100])
        return Response({"subscribed": True}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        PushSubscription.objects.filter(
            user=request.user, endpoint=request.data.get("endpoint") or "") \
            .delete()
        return Response({"subscribed": False})


@csrf_exempt
@require_POST
def sms_inbound(request):
    """Twilio "A message comes in" webhook → append to the phone's thread."""
    if not getattr(request, "tenant", None) or not request.tenant.feature_sms:
        return HttpResponseForbidden("sms disabled")
    if not sms.valid_signature(request):
        return HttpResponseForbidden("bad signature")
    raw_from = request.POST.get("From") or ""
    channel = sms.WHATSAPP if raw_from.lower().startswith("whatsapp:") else sms.SMS
    phone = sms.normalize_phone(raw_from)
    body = (request.POST.get("Body") or "").strip()[:MAX_BODY]
    if not body and (request.POST.get("NumMedia") or "0") not in ("", "0"):
        body = "📷 Sent a photo or file (open it in the Twilio console)"
    if phone and body:
        conv, created = get_or_create_sms_thread(phone, channel=channel)
        msg = ChatMessage.objects.create(conversation=conv,
                                         kind=ChatMessage.Kind.SMS_IN, body=body)
        touch(conv)
        if created:
            conversation_changed(conv)
        push_to_conversation(conv, {"type": "message",
                                    "message": message_dict(msg)})
        notify_offline(conv, None, f"{conv.title or phone}{' (WhatsApp)' if channel == sms.WHATSAPP else ''}: {body}")
    return HttpResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>',
                        content_type="text/xml")


def record_inbound(phone, channel, body, external_id=""):
    """Store one message that arrived from outside (any phone channel) and tell the staff."""
    conv, created = get_or_create_sms_thread(phone, channel=channel)
    msg = ChatMessage.objects.create(conversation=conv, kind=ChatMessage.Kind.SMS_IN, body=body, external_id=external_id)
    touch(conv)
    if created:
        conversation_changed(conv)
    push_to_conversation(conv, {"type": "message", "message": message_dict(msg)})
    tag = {sms.WHATSAPP: " (WhatsApp)", sendblue.CHANNEL: " (iMessage)"}.get(channel, "")
    notify_offline(conv, None, f"{conv.title or phone}{tag}: {body}")
    return msg


@csrf_exempt
@require_POST
def sendblue_inbound(request, token):
    """Sendblue "receive" and "outbound" webhooks. The secret token in the address is the check."""
    import json as _json
    import secrets as _secrets
    from content.models import SiteSettings
    t = getattr(request, "tenant", None)
    if not t or not t.feature_sms:
        return HttpResponseForbidden("phone messaging disabled")
    saved = SiteSettings.load().sendblue_token
    if not saved or not _secrets.compare_digest(token, saved):
        return HttpResponse(status=404)
    try:
        data = _json.loads(request.body or b"{}")
    except ValueError:
        return HttpResponse("bad json", status=400)
    if not isinstance(data, dict):
        return HttpResponse("bad json", status=400)
    handle = str(data.get("message_handle") or "")[:80]
    if data.get("is_outbound"):
        # delivery update for something we sent
        if handle:
            text = sendblue.label(data.get("status"), data.get("service") or "")
            if data.get("error_code") not in (None, 0, "0") or str(data.get("status")).upper() in ("ERROR", "DECLINED"):
                text = f"error: {data.get('error_reason') or data.get('error_message') or data.get('status')}"[:200]
            ChatMessage.objects.filter(external_id=handle, kind=ChatMessage.Kind.SMS_OUT).update(sms_status=text)
        return HttpResponse("ok")
    phone = sendblue.sender_id(data.get("number") or data.get("from_number"))
    body = (data.get("content") or "").strip()[:MAX_BODY]
    if data.get("media_url"):
        body = (body + "\n" if body else "") + f"📷 Photo: {data['media_url']}"
    if not (phone and body):
        return HttpResponse("ok")  # nothing to store (reaction, typing, unknown sender)
    if handle and ChatMessage.objects.filter(external_id=handle).exists():
        return HttpResponse("ok")  # retry of one we already stored
    record_inbound(phone, sendblue.CHANNEL, body, handle)
    return HttpResponse("ok")


def log_outbound(user, phone, channel, body, status_text, handle=""):
    """Save a message staff sent outside the chat screen (a setup test) as a normal thread message."""
    conv, _ = get_or_create_sms_thread(phone, user, channel)
    Participant.objects.get_or_create(conversation=conv, user=user, defaults={"role": Participant.Role.ADMIN})
    msg = ChatMessage.objects.create(conversation=conv, sender=user, kind=ChatMessage.Kind.SMS_OUT, body=body,
                                     sms_status=status_text, external_id=handle)
    touch(conv)
    Participant.objects.filter(conversation=conv, user=user).update(last_read_id=msg.id)
    push_to_conversation(conv, {"type": "message", "message": message_dict(msg)})
    return conv
