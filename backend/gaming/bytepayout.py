"""BytePayout deposits: create → send player to checkout_url (or show tag) →
webhook / status check.

A site uses its own API key and webhook signing key from Settings. A site with
none of its own can be switched (by the platform owner) to the owner's
BytePayout account, so the money goes to the owner's merchant account and the
owner sees all of its activity. See credentials().
"""

import hashlib
import hmac
import json
from decimal import Decimal

import requests

from content.models import SiteSettings

METHODS = {
    "ecashapp": "Cash App", "applepay": "Apple Pay", "googlepay": "Google Pay",
    "chime": "Chime", "venmo": "Venmo", "paypal": "PayPal",
}
_WHOLE = ["10", "15", "18", "20", "25", "30", "35", "40", "50", "60", "70",
          "80", "90", "100", "125", "150", "175", "200", "225", "250", "275", "300"]
_CENTS = ["9.99", "14.99", "17.99", "19.99", "24.99", "29.99", "30.99", "39.99",
          "49.99", "59.99", "99.99", "124.99", "129.99", "149.99", "199.99"]
AMOUNTS = {
    "chime": _WHOLE, "venmo": _WHOLE, "paypal": _WHOLE,
    "ecashapp": _CENTS, "applepay": _CENTS, "googlepay": _CENTS,
}
ERRORS = {
    "unauthorized": "Payments aren't set up correctly (API key). Tell staff.",
    "invalid_amount": "That amount isn't available for this payment method.",
    "invalid_provider": "That payment method isn't available.",
    "provider_error": "The payment provider refused. Try again or pick another method.",
    "rate_limited": "Too many payment requests right now — try again in a minute.",
}
TIMEOUT = 20


class PayError(Exception):
    def __init__(self, message, code=""):
        super().__init__(message)
        self.code = code


def allowed(method, amount):
    try:
        a = Decimal(str(amount))
    except Exception:
        return False
    return any(Decimal(x) == a for x in AMOUNTS.get(method, []))


def enabled_methods(settings=None):
    s = settings or SiteSettings.load()
    on = [m.strip() for m in (s.bp_methods or "").split(",") if m.strip()]
    return [m for m in on if m in METHODS]


DEFAULT_BASE = "https://mch.bytepayout.com/api/public/v1"


def credentials(settings=None):
    """(api_key, base_url, webhook_secret, account) for the current site.
    account is "own", "owner" (the platform owner's account) or "" (none)."""
    from tenants.context import get_current_tenant, use_tenant
    from tenants.models import Tenant
    s = settings or SiteSettings.load()
    if s.bp_api_key:
        return s.bp_api_key, s.bp_base_url or DEFAULT_BASE, s.bp_webhook_secret, "own"
    tenant = get_current_tenant()
    if tenant and tenant.use_owner_bytepayout and not tenant.is_platform:
        owner = Tenant.objects.filter(is_platform=True).first()
        if owner:
            with use_tenant(owner):
                o = SiteSettings.load()
            if o.bp_api_key:
                return o.bp_api_key, o.bp_base_url or DEFAULT_BASE, o.bp_webhook_secret, "owner"
    return "", s.bp_base_url or DEFAULT_BASE, s.bp_webhook_secret, ""


def configured(settings=None):
    return bool(credentials(settings)[0])


def _request(method, path, settings=None, **kw):
    key, base, _secret, _acct = credentials(settings)
    if not key:
        raise PayError("Online payments aren't set up yet.", "not_configured")
    url = base.rstrip("/") + path
    headers = {"Authorization": f"Bearer {key}"}
    if "json" in kw:
        headers["Content-Type"] = "application/json"
    try:
        r = requests.request(method, url, headers=headers, timeout=TIMEOUT, **kw)
    except requests.RequestException as e:
        raise PayError("Couldn't reach the payment provider. Try again.",
                       "network") from e
    try:
        body = r.json()
    except ValueError:
        raise PayError(f"Payment provider error ({r.status_code}).", "bad_reply")
    if r.status_code >= 400 or (isinstance(body, dict) and body.get("error")):
        err = (body or {}).get("error") or {}
        code = err.get("code", str(r.status_code))
        raise PayError(ERRORS.get(code, err.get("message") or "Payment failed."), code)
    return body.get("data", body) if isinstance(body, dict) else body


def create_deposit(method, amount, player_id, reference, return_url=""):
    payload = {"provider": method, "amount": float(Decimal(str(amount))),
               "player_id": str(player_id), "reference": reference}
    if return_url:
        payload["return_url"] = return_url
    return _request("POST", "/deposits", json=payload)


def get_deposit(reference, settings=None):
    return _request("GET", f"/deposits/{reference}", settings=settings,
                    params={"by": "reference"})


def list_deposits(**filters):
    return _request("GET", "/deposits", params={k: v for k, v in filters.items() if v})


def balance():
    return _request("GET", "/balance")


def valid_signature(raw_body, signature, secret):
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


def parse(raw_body):
    try:
        return json.loads(raw_body or b"{}")
    except ValueError:
        return None
