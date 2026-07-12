"""Client for the third-party payment gateway (create/query/close/transfer).

Config comes from the SiteSettings singleton (pay_* fields). Every request is
signed with the shared merchant key; requests are JSON POSTs.
"""

import time

import requests

from content.models import SiteSettings
from . import signing


class NotConfigured(Exception):
    pass


RESPONSE_CODES = {
    0: "Success", 10: "System exception", 11: "Parameter error",
    12: "Signature error", 13: "Timestamp error", 14: "Duplicate request",
}


def message(data):
    """Human-friendly message for a gateway response dict."""
    if not isinstance(data, dict):
        return "Unexpected response"
    code = data.get("code")
    if code == 0:
        return data.get("msg") or "Success"
    return data.get("msg") or RESPONSE_CODES.get(code, f"Error code {code}")


def config():
    s = SiteSettings.load()
    if not (s.pay_api_url and s.pay_mch_no and s.pay_api_key):
        raise NotConfigured(
            "Payment gateway is not configured. Set the API URL, Merchant No "
            "and API Key under Admin → Settings.")
    return (s.pay_api_url.rstrip("/"), s.pay_mch_no, s.pay_api_key,
            (s.pay_sign_type or "MD5"))


def now_ms():
    return int(time.time() * 1000)


def _call(path, params):
    """Sign `params` and POST as JSON to `{base}{path}`. Returns parsed JSON."""
    base, mch_no, key, sign_type = config()
    body = {**params, "mchNo": mch_no, "signType": sign_type}
    body.setdefault("timestamp", now_ms())
    body = signing.sign(body, key)
    resp = requests.post(f"{base}{path}", json=body, timeout=25,
                         headers={"Content-Type": "application/json"})
    try:
        return resp.json()
    except ValueError:
        return {"code": resp.status_code, "msg": resp.text[:300], "data": None}


# ---- Collection (pay) ----
def create_pay(params):
    return _call("/api/pay/create", params)


def query_pay(mch_order_no=None, pay_order_no=None):
    p = {}
    if pay_order_no:
        p["payOrderNo"] = pay_order_no
    if mch_order_no:
        p["mchOrderNo"] = mch_order_no
    return _call("/api/pay/query", p)


def close_pay(mch_order_no=None, pay_order_no=None):
    p = {}
    if pay_order_no:
        p["payOrderNo"] = pay_order_no
    if mch_order_no:
        p["mchOrderNo"] = mch_order_no
    return _call("/api/pay/close", p)


# ---- Payout (transfer) ----
def create_transfer(params):
    return _call("/api/transfer/create", params)
