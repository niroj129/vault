"""Admin API behind the Sendblue card in Admin → Phone messaging."""
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from content.models import SiteSettings
from . import sendblue, sms
from .messenger import log_outbound
from .models import ChatMessage, Conversation
from .twilio_setup import _blocked, _webhook


def _url(request, s):
    return request.build_absolute_uri(f"/api/messenger/sendblue/{s.sendblue_token}/") if s.sendblue_token else ""


@api_view(["GET", "POST"])
@permission_classes([IsAdminRole])
def status(request):
    """GET: where things stand. POST: make (or replace) the secret webhook address."""
    if (r := _blocked(request)):
        return r
    s = SiteSettings.load()
    if request.method == "POST":
        s.sendblue_token = sendblue.new_token()
        s.save(update_fields=["sendblue_token"])
    _u, public_ok, local = _webhook(request)
    phone = ChatMessage.objects.filter(conversation__channel=sendblue.CHANNEL)
    return Response({
        "account": sendblue.has_account(), "ready": sendblue.is_configured(),
        "key_id": s.sendblue_key_id, "from": s.sendblue_from,
        "webhook_url": _url(request, s), "public_ok": public_ok, "local": local,
        "received": phone.filter(kind="sms_in").count(), "sent": phone.filter(kind="sms_out").count(),
        "threads": Conversation.objects.filter(kind="sms", channel=sendblue.CHANNEL).count(),
    })


@api_view(["POST"])
@permission_classes([IsAdminRole])
def check(request):
    """Read-only: do these keys work, and which lines are on the account?"""
    if (r := _blocked(request)):
        return r
    s = SiteSettings.load()
    key = (request.data.get("key_id") or s.sendblue_key_id or "").strip()
    secret = (request.data.get("secret") or s.sendblue_secret or "").strip()
    if not (key and secret):
        return Response({"ok": False, "error": "Add your API key ID and secret first."})
    return Response(sendblue.check(key, secret))


@api_view(["POST"])
@permission_classes([IsAdminRole])
def connect(request):
    """Register this site's address with Sendblue so incoming messages arrive here."""
    if (r := _blocked(request)):
        return r
    s = SiteSettings.load()
    _u, public_ok, _local = _webhook(request)
    if not public_ok:
        return Response({"detail": "Sendblue can only reach a site on its real https domain, not "
                                   f"{request.get_host()}. Do this once the site is live, or add the address in Sendblue's dashboard yourself."}, status=400)
    if not sendblue.has_account():
        return Response({"detail": "Save your API key ID and secret first."}, status=400)
    if not s.sendblue_token:
        return Response({"detail": "Make your webhook address first."}, status=400)
    err = sendblue.register_webhook(s.sendblue_key_id, s.sendblue_secret, _url(request, s))
    if err:
        return Response({"detail": err}, status=400)
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAdminRole])
def send_test(request):
    """Send one real test message. On Sendblue's free plan the person must have texted your line first."""
    if (r := _blocked(request)):
        return r
    if not sendblue.is_configured():
        return Response({"detail": "Save your API key ID, secret and line first."}, status=400)
    to = sms.normalize_phone(request.data.get("to"))
    if not to:
        return Response({"detail": "Enter a valid phone number, e.g. +15551234567."}, status=400)
    key = f"sendblue-test:{request.user.id}"
    if cache.get_or_set(key, 0, 60) >= 5:
        return Response({"detail": "That's enough test messages for a minute."}, status=429)
    cache.incr(key)
    site = getattr(getattr(request, "tenant", None), "name", "") or "your site"
    body = f"Test message from {site}. If you can read this, iMessage is connected."
    text, handle = sendblue.send(to, body)
    ok = not (text.startswith("error") or text.startswith("not sent"))
    # a sent test is saved as a normal chat, so it shows in the Inbox and replies land in it
    conv = log_outbound(request.user, to, sendblue.CHANNEL, body, text, handle) if ok else None
    return Response({"ok": ok, "status": text, "conversation": conv.id if conv else None}, status=200 if ok else 400)
