"""Emails forwarded to the site (e.g. Gmail → Postmark → webhook).

Mostly payment notifications ("John sent you $50") that staff use as
evidence when checking a QR payment. An email never approves anything
by itself: payment emails are easy to fake.
"""
from django.conf import settings
from django.db import models

from tenants.models import TenantModel


class InboundEmail(TenantModel):
    class Kind(models.TextChoices):
        PAYMENT = "payment", "Payment"
        GMAIL_CONFIRM = "gmail_confirm", "Gmail forwarding check"
        OTHER = "other", "Other"

    class Match(models.TextChoices):
        CODE = "code", "Matched by code"
        LIKELY = "likely", "Likely match"
        LINKED = "linked", "Linked by staff"
        NONE = "none", "No match"
        NA = "na", "Not a payment"

    provider = models.CharField(max_length=20, blank=True)
    message_id = models.CharField(max_length=300, blank=True, db_index=True)
    from_email = models.CharField(max_length=254, blank=True)
    from_name = models.CharField(max_length=200, blank=True)
    to = models.CharField(max_length=500, blank=True)
    subject = models.CharField(max_length=500, blank=True)
    text = models.TextField(blank=True, help_text="Plain text only; HTML is reduced to text")
    sent_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)

    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.OTHER, db_index=True)
    app = models.CharField(max_length=20, blank=True, help_text="cashapp, chime, venmo, paypal, zelle")
    amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payer = models.CharField(max_length=120, blank=True)
    note = models.CharField(max_length=200, blank=True, help_text="Payment note found in the email")
    verified = models.BooleanField(default=False, help_text="Gmail/receiver reported DKIM pass for the app's domain")
    confirm_code = models.CharField(max_length=20, blank=True)
    confirm_link = models.URLField(max_length=600, blank=True)

    match = models.CharField(max_length=10, choices=Match.choices, default=Match.NA, db_index=True)
    deposit = models.ForeignKey("gaming.Deposit", null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="emails")
    linked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                  on_delete=models.SET_NULL, related_name="+")
    is_read = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["-received_at"]

    def __str__(self):
        return f"{self.from_email}: {self.subject}"
