"""Admin API behind Admin → Phone & WhatsApp: see the connection, check the
Twilio credentials (read-only), point a phone number at this site, and send a
test message. Nothing here sends or changes anything unless the admin clicks."""
from urllib.parse import urlparse

from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from content.models import SiteSettings
from . import sms
from .messenger import log_outbound
from .models import ChatMessage, Conversation

PATH = "/api/messenger/sms/inbound/"


def _blocked(request):
    t = getattr(request, "tenant", None)
    if t is not None and not t.feature_sms:
        return Response({"detail": "Phone and WhatsApp aren't included in this site's plan."}, status=403)
    return None


def _webhook(request):
    url = request.build_absolute_uri(PATH)
    host = (urlparse(url).hostname or "").lower()
    local = host in ("localhost", "127.0.0.1", "0.0.0.0") or host.endswith(".localhost") or host.endswith(".local")
    return url, (url.startswith("https://") and not local), local


@api_view(["GET"])
@permission_classes([IsAdminRole])
def status(request):
    if (r := _blocked(request)):
        return r
    s = SiteSettings.load()
    url, public_ok, local = _webhook(request)
    phone = ChatMessage.objects.filter(conversation__kind="sms")
    return Response({
        "account": sms.has_account(), "sms": sms.is_configured(sms.SMS), "whatsapp": sms.is_configured(sms.WHATSAPP),
        "sid": s.twilio_sid, "sms_from": s.twilio_from, "whatsapp_from": s.twilio_whatsapp_from,
        "webhook_url": url, "public_ok": public_ok, "local": local,
        "received": phone.filter(kind="sms_in").count(), "sent": phone.filter(kind="sms_out").count(),
        "threads": {"sms": Conversation.objects.filter(kind="sms", channel="sms").count(),
                    "whatsapp": Conversation.objects.filter(kind="sms", channel="whatsapp").count()},
    })


@api_view(["POST"])
@permission_classes([IsAdminRole])
def check(request):
    """Read-only: do these credentials work, and which numbers are on the account?"""
    if (r := _blocked(request)):
        return r
    s = SiteSettings.load()
    sid = (request.data.get("sid") or s.twilio_sid or "").strip()
    token = (request.data.get("token") or s.twilio_token or "").strip()
    if not (sid and token):
        return Response({"ok": False, "error": "Add your Account SID and Auth Token first."})
    res = sms.check_account(sid, token)
    if res["ok"]:
        res["numbers"] = sms.list_numbers(sid, token)
    return Response(res)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def connect_number(request):
    """Point one of the account's numbers at this site, so replies arrive here."""
    if (r := _blocked(request)):
        return r
    url, public_ok, local = _webhook(request)
    if not public_ok:
        return Response({"detail": "Twilio can only reach a site on its real https domain, not "
                                   f"{request.get_host()}. Do this step once the site is live, or paste the address into Twilio yourself."}, status=400)
    s = SiteSettings.load()
    if not (s.twilio_sid and s.twilio_token):
        return Response({"detail": "Save your Account SID and Auth Token first."}, status=400)
    number_sid = (request.data.get("number_sid") or "").strip()
    if not number_sid.startswith("PN"):
        return Response({"detail": "Pick a phone number."}, status=400)
    err = sms.point_number_at(s.twilio_sid, s.twilio_token, number_sid, url)
    if err:
        return Response({"detail": err}, status=400)
    return Response({"ok": True, "webhook_url": url})


@api_view(["POST"])
@permission_classes([IsAdminRole])
def send_test(request):
    """Send one real test message to a number the admin types. Costs a message."""
    if (r := _blocked(request)):
        return r
    channel = sms.WHATSAPP if request.data.get("channel") == sms.WHATSAPP else sms.SMS
    if not sms.is_configured(channel):
        return Response({"detail": f"Add your {'WhatsApp' if channel == sms.WHATSAPP else 'SMS'} number first."}, status=400)
    to = sms.normalize_phone(request.data.get("to"))
    if not to:
        return Response({"detail": "Enter a valid phone number, e.g. +15551234567."}, status=400)
    key = f"twilio-test:{request.user.id}"
    if cache.get_or_set(key, 0, 60) >= 5:
        return Response({"detail": "That's enough test messages for a minute."}, status=429)
    cache.incr(key)
    site = getattr(getattr(request, "tenant", None), "name", "") or "your site"
    body = f"Test message from {site}. If you can read this, {('WhatsApp' if channel == sms.WHATSAPP else 'SMS')} is connected."
    result = sms.send(to, body, channel)
    ok = not (result.startswith("error") or result.startswith("not sent"))
    conv = log_outbound(request.user, to, channel, body, result) if ok else None  # shows in the Inbox
    return Response({"ok": ok, "status": result, "conversation": conv.id if conv else None}, status=200 if ok else 400)
