from django.conf import settings
from django.db import models


class Message(models.Model):
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
