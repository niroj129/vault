"""Common pieces for every game-platform adapter.

Every adapter exposes the same operations so the rest of the site never cares
which platform runs a game:

    create_account(account, password) -> Result(account=…, platform_user_id=…)
    recharge(login, amount, order_id)  -> Result(balance=…, txn_id=…)
    withdraw(login, amount, order_id)  -> Result(balance=…, txn_id=…)
    balance(login)                     -> Result(balance=…)
    agent_balance()                    -> Result(balance=…)
    reset_password(login, new_pw)      -> Result
    kick(login)                        -> Result

`login` is a catalog.GameLogin (username, password, platform_user_id).
Business failures come back as Result(ok=False, message=…); only transport
problems raise ApiError.
"""

import hashlib
import re
import secrets
import socket
import string
import threading
import time
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import urlparse

import requests

TIMEOUT = 20


class ApiError(Exception):
    """Could not reach the platform, or it answered with garbage."""


class NotSupported(Exception):
    pass


@dataclass
class Result:
    ok: bool
    message: str = ""
    balance: object = None
    txn_id: str = ""
    account: str = ""
    platform_user_id: str = ""
    play_url: str = ""
    raw: dict = field(default_factory=dict)


def md5(text):
    return hashlib.md5(text.encode()).hexdigest()


def now_ms():
    return int(time.time() * 1000)


def money(amount, whole=False):
    d = Decimal(str(amount))
    if whole:
        return int(d.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ------------------------------------------------------------------ HTTP

_dns_lock = threading.Lock()
_doh_cache = {}


def _doh_resolve(host):
    hit = _doh_cache.get(host)
    if hit and hit[1] > time.time():
        return hit[0]
    for url, headers in (("https://cloudflare-dns.com/dns-query",
                          {"accept": "application/dns-json"}),
                         ("https://dns.google/resolve", {})):
        try:
            r = requests.get(url, params={"name": host, "type": "A"},
                             headers=headers, timeout=8)
            for ans in r.json().get("Answer", []):
                if ans.get("type") == 1:
                    _doh_cache[host] = (ans["data"], time.time() + 300)
                    return ans["data"]
        except Exception:
            continue
    return None


def proxies_for(provider):
    url = (getattr(provider, "proxy_url", "") or "").strip()
    if not url:
        return None
    if url.startswith("socks5://"):
        url = "socks5h://" + url[len("socks5://"):]  # resolve DNS at the proxy too
    return {"http": url, "https": url}


def egress_ip(provider):
    """The public IP the platform will see for this provider's calls."""
    try:
        r = requests.get("https://api.ipify.org", proxies=proxies_for(provider), timeout=12)
        return r.text.strip()[:60]
    except requests.RequestException as e:
        raise ApiError(f"Proxy not reachable: {e.__class__.__name__}") from e


def http(provider, method, url, **kw):
    """requests.request with the provider's proxy / DNS bypass applied."""
    kw.setdefault("timeout", TIMEOUT)
    proxies = proxies_for(provider)
    if proxies:  # the proxy resolves and connects; no local DNS tricks
        try:
            return requests.request(method, url, proxies=proxies, **kw)
        except requests.RequestException as e:
            raise ApiError(f"Can't reach the platform through the proxy: "
                           f"{e.__class__.__name__}") from e
    host = urlparse(url).hostname
    ip = provider.force_ip or (_doh_resolve(host) if provider.use_doh else None)
    try:
        if not ip:
            return requests.request(method, url, **kw)
        # keep the hostname (SNI + certificate) but connect to `ip`
        with _dns_lock:
            orig = socket.getaddrinfo

            def patched(h, *a, **k):
                return orig(ip if h == host else h, *a, **k)

            socket.getaddrinfo = patched
            try:
                return requests.request(method, url, **kw)
            finally:
                socket.getaddrinfo = orig
    except requests.RequestException as e:
        raise ApiError(f"Can't reach {host}: {e.__class__.__name__}") from e


def json_of(resp):
    try:
        return resp.json()
    except ValueError as e:
        raise ApiError(f"Unexpected reply ({resp.status_code}): "
                       f"{resp.text[:160]}") from e


# ------------------------------------------------------ account naming

def make_password(length=10):
    """Letters + digits, starts with a letter (meets every platform's rules)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = secrets.choice(string.ascii_letters) + "".join(
            secrets.choice(alphabet) for _ in range(length - 1))
        if any(c.isdigit() for c in pw) and any(c.isalpha() for c in pw):
            return pw


def make_account(username, prefix="", min_len=6, max_len=16):
    """e.g. prefix "rs" + "jayr" + 4 random digits → rsjayr4821."""
    base = re.sub(r"[^a-z0-9]", "", (username or "").lower()) or "player"
    prefix = re.sub(r"[^a-z0-9]", "", (prefix or "").lower())
    digits = "".join(secrets.choice(string.digits) for _ in range(4))
    room = max_len - len(prefix) - len(digits)
    name = prefix + base[:max(room, 1)] + digits
    while len(name) < min_len:
        name += secrets.choice(string.digits)
    if name[0].isdigit():
        name = ("p" + name)[:max_len]
    return name


class Adapter:
    """Base class; subclasses implement the operations they support."""
    whole_amounts = False          # platform only accepts whole dollars
    account_min, account_max = 6, 16
    needs_platform_id = False      # API calls use an id, not the account name

    def __init__(self, provider):
        self.p = provider

    @property
    def base(self):
        return (self.p.base_url or "").rstrip("/")

    def require(self, *fields):
        missing = [f for f in fields if not getattr(self.p, f)]
        if missing:
            raise ApiError(f"{self.p.name}: fill in {', '.join(missing)} "
                           "in Game APIs.")

    def amount(self, value):
        return money(value, whole=self.whole_amounts)

    # defaults
    def create_account(self, account, password):
        raise NotSupported("This platform can't create accounts by API.")

    def recharge(self, login, amount, order_id):
        raise NotSupported("This platform can't load by API.")

    def withdraw(self, login, amount, order_id):
        raise NotSupported("This platform can't redeem by API.")

    def balance(self, login):
        raise NotSupported("This platform can't report balances by API.")

    def agent_balance(self):
        raise NotSupported("This platform can't report the agent balance.")

    def reset_password(self, login, new_password):
        raise NotSupported("This platform can't reset passwords by API.")

    def kick(self, login):
        raise NotSupported("This platform can't force players offline.")

    def find_platform_id(self, login):
        return login.platform_user_id

    def search_accounts(self, query, limit=30):
        """Players on the platform whose login contains `query` (everyone, newest first, when empty).
        -> list of {username, platform_id, balance, created, last_seen, banned}. Most platforms
        only look an account up by its exact name and have no player list."""
        raise NotSupported("This platform can only look up an account by its exact login name.")

    def trade_history(self, login, days=30):
        """The platform's own record of loads and redeems for one account, newest first:
        -> list of {time, amount (+load / −redeem), balance_before, balance_after}."""
        raise NotSupported("This platform doesn't give out its own transaction history.")
