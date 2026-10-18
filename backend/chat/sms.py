"""Twilio bridge for phone threads: SMS and WhatsApp.

Credentials come from Admin → Phone & WhatsApp (twilio_sid / twilio_token, plus
twilio_from for SMS and twilio_whatsapp_from for WhatsApp). Without them,
outbound messages are stored but not sent, and the inbound webhook accepts
unsigned requests only when DEBUG is on (for local testing with curl).

WhatsApp goes through the same Twilio account: numbers are prefixed with
"whatsapp:". WhatsApp only lets a business start a conversation with an
approved template; free-form replies work for 24 hours after the customer's
last message. Twilio reports that as error 63016, which we explain in plain words.
"""

import base64
import hashlib
import hmac
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

SMS, WHATSAPP = "sms", "whatsapp"
API = "https://api.twilio.com/2010-04-01"

FRIENDLY = {
    63016: "WhatsApp only allows a free-form message within 24 hours of the person's last message. Ask them to message you first, or use an approved template.",
    63015: "That number hasn't joined the WhatsApp sandbox yet. They need to send the join code to the sandbox number first.",
    63007: "Twilio can't find that WhatsApp sender. Check the WhatsApp number in Phone & WhatsApp.",
    21211: "That doesn't look like a valid phone number.",
    21608: "Your Twilio trial account can only text numbers you've verified in the Twilio console.",
    21610: "That person replied STOP, so Twilio won't text them.",
    20003: "Twilio rejected your Account SID or Auth Token.",
}


def _creds():
    from content.models import SiteSettings
    s = SiteSettings.load()
    return s.twilio_sid, s.twilio_token, s.twilio_from, s.twilio_whatsapp_from


def has_account():
    sid, token, _sms, _wa = _creds()
    return bool(sid and token)


def is_configured(channel=SMS):
    sid, token, sms_from, wa_from = _creds()
    return bool(sid and token and (wa_from if channel == WHATSAPP else sms_from))


def normalize_phone(raw):
    """Return an E.164 number (+15551234567) or "" if it can't be parsed.

    Bare 10-digit numbers are assumed to be US/Canada (+1). A "whatsapp:"
    prefix (as Twilio sends it) is ignored.
    """
    raw = re.sub(r"^whatsapp:", "", (raw or "").strip(), flags=re.I)
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        return f"+{digits}" if 8 <= len(digits) <= 15 else ""
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return ""


def _auth(sid, token):
    return "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode()


def _error_text(e):
    try:
        body = json.loads(e.read())
    except Exception:
        body = {}
    code = body.get("code")
    return FRIENDLY.get(code) or body.get("message") or f"Twilio said {e.code}", code


def send(to, body, channel=SMS):
    """Send one message. Returns a short status string stored on the message."""
    sid, token, sms_from, wa_from = _creds()
    from_ = wa_from if channel == WHATSAPP else sms_from
    if not (sid and token and from_):
        return f"not sent: {'WhatsApp' if channel == WHATSAPP else 'SMS'} not configured"
    prefix = "whatsapp:" if channel == WHATSAPP else ""
    data = urllib.parse.urlencode({"To": prefix + to, "From": prefix + from_, "Body": body}).encode()
    req = urllib.request.Request(f"{API}/Accounts/{sid}/Messages.json", data=data)
    req.add_header("Authorization", _auth(sid, token))
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read()).get("status", "queued")
    except urllib.error.HTTPError as e:
        msg, _code = _error_text(e)
        return f"error {e.code}: {msg}"[:200]
    except Exception as e:
        return f"error: {e}"[:200]


send_sms = send  # older name


def _get(path, sid, token, params=None):
    url = f"{API}/Accounts/{sid}{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
    req = urllib.request.Request(url)
    req.add_header("Authorization", _auth(sid, token))
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def check_account(sid, token):
    """Read-only: confirm the credentials work. Returns {ok, name, status, type, error}."""
    try:
        a = _get(".json", sid, token)
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": _error_text(e)[0]}
    except Exception as e:
        return {"ok": False, "error": f"Couldn't reach Twilio: {e}"}
    return {"ok": True, "name": a.get("friendly_name", ""), "status": a.get("status", ""), "type": a.get("type", "")}


def list_numbers(sid, token):
    """Read-only: the phone numbers on the Twilio account."""
    try:
        data = _get("/IncomingPhoneNumbers.json", sid, token, {"PageSize": 50})
    except Exception:
        return []
    return [{"sid": n["sid"], "number": n["phone_number"], "name": n.get("friendly_name", ""),
             "sms": bool(n.get("capabilities", {}).get("sms")), "sms_url": n.get("sms_url") or ""}
            for n in data.get("incoming_phone_numbers", [])]


def point_number_at(sid, token, number_sid, url):
    """Set a number's incoming-SMS webhook. Returns "" on success or an error text."""
    data = urllib.parse.urlencode({"SmsUrl": url, "SmsMethod": "POST"}).encode()
    req = urllib.request.Request(f"{API}/Accounts/{sid}/IncomingPhoneNumbers/{number_sid}.json", data=data)
    req.add_header("Authorization", _auth(sid, token))
    try:
        urllib.request.urlopen(req, timeout=10).read()
        return ""
    except urllib.error.HTTPError as e:
        return _error_text(e)[0]
    except Exception as e:
        return f"Couldn't reach Twilio: {e}"


def valid_signature(request):
    """Verify Twilio's X-Twilio-Signature header on an inbound webhook."""
    token = _creds()[1]
    if not token:
        return settings.DEBUG
    signature = request.META.get("HTTP_X_TWILIO_SIGNATURE", "")
    url = request.build_absolute_uri()
    payload = url + "".join(f"{k}{v}" for k, v in sorted(request.POST.items()))
    digest = hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)
