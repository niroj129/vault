"""Client for the external game-platform agent API (API-Documentation.pdf).

Auth: every request carries agent_id, timestamp and
token = MD5("agent_id:timestamp:secret_key") as lowercase hex.
Requests are multipart/form-data POSTs to  {base}/api/external/<endpoint>.
"""

import hashlib
import socket
import threading
import time
from urllib.parse import urlparse

import requests

from .models import SiteSettings

_dns_lock = threading.Lock()
_doh_cache = {}  # host -> (ip, expires_ts)


def _doh_resolve(host):
    """Resolve an A record via DNS-over-HTTPS (Cloudflare, then Google).

    Bypasses ISP DNS blocking because the block is per-domain, not against the
    DoH providers themselves.
    """
    cached = _doh_cache.get(host)
    if cached and cached[1] > time.time():
        return cached[0]
    providers = [
        ("https://cloudflare-dns.com/dns-query", {"accept": "application/dns-json"}),
        ("https://dns.google/resolve", {}),
    ]
    for url, headers in providers:
        try:
            r = requests.get(url, params={"name": host, "type": "A"},
                             headers=headers, timeout=8)
            for ans in r.json().get("Answer", []):
                if ans.get("type") == 1:  # A record
                    ip = ans["data"]
                    _doh_cache[host] = (ip, time.time() + 300)
                    return ip
        except Exception:
            continue
    return None


class NotConfigured(Exception):
    pass


# Status code dictionary from API-Documentation.pdf (Appendix 3.1)
STATUS_CODES = {
    0: "Success", 1: "Invalid agent ID", 2: "Invalid request parameters",
    3: "Invalid token", 4: "Token expired", 5: "Access IP is not whitelisted",
    6: "Insufficient agent balance", 7: "Insufficient user balance",
    8: "Invalid user ID", 9: "User account frozen", 10: "User is in game",
    11: "Invalid amount", 12: "Recharge failed, please try again later",
    13: "Recharge permission denied", 14: "Withdrawal failed, please try again later",
    15: "Withdrawal amount exceeds daily limit", 16: "Withdrawal under review",
    17: "Withdrawal permission denied",
    18: "Account name format error (letters, numbers, underscores only)",
    19: "Agent has no register-user permission", 20: "Account name already exists",
    21: "System failed", 22: "Number of register IPs exceeds the upper limit",
    23: "Password must be 6 to 32 characters", 400: "Parameter error",
}


def message(data):
    """Human-friendly message for a platform response dict."""
    if not isinstance(data, dict):
        return "Unexpected response"
    code = data.get("code")
    return STATUS_CODES.get(code, data.get("msg") or f"Error code {code}")


def _config():
    s = SiteSettings.load()
    if not (s.game_api_url and s.game_api_agent_id and s.game_api_secret):
        raise NotConfigured(
            "Game API is not configured. Set the URL, agent id and secret "
            "under Admin → Settings.")
    return s.game_api_url.rstrip("/"), s.game_api_agent_id, s.game_api_secret


def _token(agent_id, secret, ts):
    return hashlib.md5(f"{agent_id}:{ts}:{secret}".encode()).hexdigest()


def call(endpoint, params=None):
    """POST to an external endpoint. Returns the parsed JSON dict.

    Raises NotConfigured if credentials are missing, or Exception on transport
    errors. Business errors come back as {code: !=0, msg: ...}.
    """
    base, agent_id, secret = _config()
    s = SiteSettings.load()
    ts = int(time.time())
    fields = {"agent_id": str(agent_id), "timestamp": str(ts),
              "token": _token(agent_id, secret, ts)}
    fields.update({k: str(v) for k, v in (params or {}).items()})
    # multipart/form-data with no real files
    files = {k: (None, v) for k, v in fields.items()}
    url = f"{base}/api/external/{endpoint}"

    # Resolve the host ourselves (pinned IP or DoH) to defeat ISP DNS blocking.
    host = urlparse(base).hostname
    override_ip = None
    if s.game_api_force_ip:
        override_ip = s.game_api_force_ip
    elif s.game_api_use_doh:
        override_ip = _doh_resolve(host)

    if override_ip:
        # Keep the hostname in the URL (correct SNI + cert verification) but make
        # the OS resolve it to our IP for the duration of this request only.
        with _dns_lock:
            orig = socket.getaddrinfo

            def patched(h, *a, **k):
                return orig(override_ip if h == host else h, *a, **k)

            socket.getaddrinfo = patched
            try:
                resp = requests.post(url, files=files, timeout=20)
            finally:
                socket.getaddrinfo = orig
    else:
        resp = requests.post(url, files=files, timeout=20)

    try:
        return resp.json()
    except ValueError:
        return {"code": resp.status_code, "msg": resp.text[:300], "data": None}


# ---- typed wrappers ----
def add_user(account, login_pwd):
    return call("addUser", {"account": account, "login_pwd": login_pwd})


def recharge(user_id, amount, order_id):
    return call("recharge", {"user_id": user_id, "amount": amount,
                             "order_id": order_id})


def withdraw(user_id, amount, order_id):
    return call("withdraw", {"user_id": user_id, "amount": amount,
                             "order_id": order_id})


def user_balance(user_id):
    return call("userBalance", {"user_id": user_id})


def agent_balance():
    return call("agentBalance")


def get_user_id(account_name):
    return call("getUserID", {"account_name": account_name})


def low_deposit_users(query_date, page=1, page_size=20):
    return call("external/getLowDepositUsers", {
        "query_date": query_date, "page": page, "page_size": page_size})


def reset_password(user_id, login_pwd):
    return call("resetPassword", {"user_id": user_id, "login_pwd": login_pwd})


def player_offline(user_id):
    return call("playerOffline", {"user_id": user_id})
