"""Sendblue bridge: iMessage to iPhones, RCS/SMS to Android, from one line.

Credentials live in Admin → Phone messaging (sendblue_key_id / sendblue_secret /
sendblue_from). Inbound messages and delivery updates arrive as POSTs to
/api/messenger/sendblue/<token>/. Sendblue's docs don't say which header carries
a webhook secret, so the secret is the <token> in the address itself.
"""
import json
import re
import secrets
import urllib.error
import urllib.request

BASE = "https://api.sendblue.co"  # the live API host (api.sendblue.com answers 403 to API clients)
CHANNEL = "sendblue"
TIMEOUT = 15


def _creds():
    from content.models import SiteSettings
    s = SiteSettings.load()
    return s.sendblue_key_id, s.sendblue_secret, s.sendblue_from


def has_account():
    k, sec, _f = _creds()
    return bool(k and sec)


def is_configured():
    k, sec, frm = _creds()
    return bool(k and sec and frm)


def _call(method, path, key, secret, body=None):
    """→ (http_status, parsed_json_or_{}). Never raises for HTTP errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("User-Agent", "CasinoSite/1.0")  # a bare Python agent is blocked by their CDN
    req.add_header("sb-api-key-id", key)
    req.add_header("sb-api-secret-key", secret)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read()
            code = r.status if hasattr(r, "status") else 200
    except urllib.error.HTTPError as e:
        raw, code = e.read(), e.code
    except Exception as e:  # network down, DNS, timeout
        return 0, {"message": f"Couldn't reach Sendblue: {e}"}
    try:
        return code, json.loads(raw or b"{}")
    except ValueError:
        return code, {}


def _reason(code, body):
    if code == 0:
        return body.get("message", "Couldn't reach Sendblue.")
    if code in (401, 403):
        return "Sendblue rejected your API key ID or secret."
    for k in ("error_reason", "error_message", "message", "error"):
        v = body.get(k)
        if isinstance(v, str) and v:
            return v
    return f"Sendblue said {code}."


def label(status, service=""):
    """Short text stored on a message: 'delivered · iMessage'."""
    st = (status or "").lower()
    return f"{st} · {service}" if st and service else st or "queued"


def send(to, body, callback=""):
    """Send one message. → (status_text, message_handle). Errors read 'error: …'."""
    key, secret, frm = _creds()
    if not (key and secret and frm):
        return "not sent: iMessage not configured", ""
    payload = {"number": to, "from_number": frm, "content": body}
    if callback:
        payload["status_callback"] = callback
    code, res = _call("POST", "/api/send-message", key, secret, payload)
    if code == 0 or code >= 400 or res.get("status") == "ERROR":
        return f"error: {_reason(code, res)}"[:200], ""
    if res.get("error_code") not in (None, 0):
        return f"error: {_reason(code, res)}"[:200], res.get("message_handle", "")
    return label(res.get("status") or "QUEUED", res.get("service") or ""), res.get("message_handle", "")


def _lines_from(res):
    """/api/lines isn't documented in detail, so accept the shapes it plausibly returns."""
    items = res if isinstance(res, list) else next((res[k] for k in ("lines", "data", "numbers") if isinstance(res.get(k), list)), [])
    out = []
    for it in items:
        num = it if isinstance(it, str) else next((it.get(k) for k in ("number", "phone_number", "sendblue_number", "line", "from_number") if it.get(k)), "")
        if num:
            out.append(str(num))
    return out


def check(key, secret):
    """Read-only: do these credentials work, and which lines does the account have?"""
    code, res = _call("GET", "/api/lines", key, secret)
    if code == 0 or code >= 400:
        return {"ok": False, "error": _reason(code, res)}
    return {"ok": True, "lines": _lines_from(res)}


def register_webhook(key, secret, url):
    """Ask Sendblue to POST inbound messages to `url`. → '' on success or an error text."""
    code, res = _call("GET", "/api/account/webhooks", key, secret)
    if 0 < code < 400 and url in json.dumps(res):
        return ""  # already registered
    code, res = _call("POST", "/api/account/webhooks", key, secret, {"webhooks": [url], "type": "receive"})
    return "" if 0 < code < 400 else _reason(code, res)


def new_token():
    return secrets.token_urlsafe(24)


def sender_id(raw):
    """E.164 phone, or an Apple Account email (iMessage can come from an email), else ''."""
    from .sms import normalize_phone
    raw = (raw or "").strip()
    return normalize_phone(raw) or (raw.lower()[:120] if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", raw) else "")
