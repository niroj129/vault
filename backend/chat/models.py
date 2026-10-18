from django.conf import settings
from django.db import models
from tenants.models import TenantModel


class Message(TenantModel):
    """A direct message. Conversations are ALWAYS between a user and an admin.

    Enforcement lives in the API layer (chat.views): a non-admin user may only
    send to an admin, and only ever sees their own conversation with support.
    """
    sender = models.ForeignKey(settings.AUTH_USER_MODEL,
                               on_delete=models.CASCADE, related_name="sent")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL,
                                  on_delete=models.CASCADE, related_name="received")
    body = models.TextField(blank=True)
    image = models.ImageField(upload_to="chat/", blank=True, null=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender} -> {self.recipient}"


# ---------------------------------------------------------------------------
# Messenger: any user can message any user, in 1:1 chats or groups. Admins can
# also open SMS threads with an outside phone number (bridged via Twilio).
# ---------------------------------------------------------------------------

class Conversation(TenantModel):
    class Kind(models.TextChoices):
        DIRECT = "direct", "Direct"
        GROUP = "group", "Group"
        SMS = "sms", "SMS"
        # one per player: the player plus every admin (and their agent),
        # pinned at the top of the player's Messages
        SUPPORT = "support", "Support"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    # the player a support conversation belongs to
    subject = models.OneToOneField(settings.AUTH_USER_MODEL, null=True,
                                   blank=True, on_delete=models.CASCADE,
                                   related_name="support_conversation")
    title = models.CharField(max_length=120, blank=True)
    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        WHATSAPP = "whatsapp", "WhatsApp"
        SENDBLUE = "sendblue", "iMessage"

    # how a phone thread reaches the outside party (kind == sms)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    # E.164 phone number of the outside party (SMS threads only)
    phone = models.CharField(max_length=120, blank=True, db_index=True)
    # "lo:hi" user-id pair, unique, so each pair has exactly one direct chat
    direct_key = models.CharField(max_length=40, unique=True, null=True,
                                  blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True,
                                   on_delete=models.SET_NULL,
                                   related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.kind}:{self.title or self.phone or self.pk}"


class Participant(TenantModel):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name="participants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="chat_participations")
    role = models.CharField(max_length=10, choices=Role.choices,
                            default=Role.MEMBER)
    last_read_id = models.PositiveIntegerField(default=0)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("conversation", "user")]

    @property
    def can_manage(self):
        return self.role in (self.Role.OWNER, self.Role.ADMIN)


class ChatMessage(TenantModel):
    class Kind(models.TextChoices):
        TEXT = "text", "Text"
        SYSTEM = "system", "System"
        SMS_IN = "sms_in", "SMS received"
        SMS_OUT = "sms_out", "SMS sent"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name="messages")
    # null for system notices and inbound SMS (sender is the phone number)
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                               on_delete=models.SET_NULL,
                               related_name="chat_messages")
    kind = models.CharField(max_length=10, choices=Kind.choices,
                            default=Kind.TEXT)
    body = models.TextField(blank=True)
    image = models.ImageField(upload_to="messenger/", blank=True, null=True)
    sms_status = models.CharField(max_length=200, blank=True)
    # the provider's id for a phone message (Sendblue message_handle): dedupes retries, finds it again for status updates
    external_id = models.CharField(max_length=80, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]


class Block(TenantModel):
    """`blocker` no longer receives direct messages from `blocked`."""
    blocker = models.ForeignKey(settings.AUTH_USER_MODEL,
                                on_delete=models.CASCADE, related_name="blocks")
    blocked = models.ForeignKey(settings.AUTH_USER_MODEL,
                                on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("blocker", "blocked")]


class Report(TenantModel):
    """A player reporting another player (optionally a specific message)."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"
        DISMISSED = "dismissed", "Dismissed"

    class Reason(models.TextChoices):
        SPAM = "spam", "Spam or scam"
        ABUSE = "abuse", "Harassment or abuse"
        CHEATING = "cheating", "Cheating or fraud"
        OTHER = "other", "Something else"

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True,
                                 on_delete=models.SET_NULL, related_name="+")
    reported = models.ForeignKey(settings.AUTH_USER_MODEL,
                                 on_delete=models.CASCADE,
                                 related_name="reports_against")
    message = models.ForeignKey(ChatMessage, null=True, blank=True,
                                on_delete=models.SET_NULL, related_name="+")
    # copy of the message text, kept even if it's later deleted
    excerpt = models.TextField(blank=True)
    reason = models.CharField(max_length=10, choices=Reason.choices,
                              default=Reason.OTHER)
    details = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.OPEN, db_index=True)
    action = models.CharField(max_length=20, blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True,
                                   blank=True, on_delete=models.SET_NULL,
                                   related_name="+")
    handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class SavedReply(TenantModel):
    """One-tap answers staff insert into a chat."""
    title = models.CharField(max_length=60)
    body = models.TextField(max_length=2000)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True,
                                   on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]


class PushSubscription(TenantModel):
    """A browser's Web Push endpoint for one user."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="push_subscriptions")
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
