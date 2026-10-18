"""FastApi (/fast/...).

POST application/x-www-form-urlencoded with requestid, appid, timestamp (ms)
and sign = md5("k1=v1&k2=v2…" sorted by key, without sign + appsecret).
Use the appid/appsecret the platform gave you. Alternatively fill in the
agent login + password: /fast/agent/login returns the appsecret AES-256-CBC
encrypted (key = md5(md5(lower(password))), IV = first 16 bytes).

Player accounts are created *without* the platform prefix; the platform
returns the full account name the player types into the game. API calls use
the short name (kept in GameLogin.platform_user_id). code 200 = success.
"""

import base64
import uuid

from django.core.cache import cache

from .base import Adapter, ApiError, Result, http, json_of, md5, now_ms

CODES = {
    1: "New user created", 2: "User does not exist", 3: "Parameter error",
    4: "Invalid signature", 5: "Agent banned", 6: "Account length error",
    7: "Account format error", 8: "Password length error",
    9: "Password format error", 10: "Request id already used",
    11: "Platform database error", 12: "User already exists", 13: "Top-up failed",
    14: "Agent credit too low", 15: "Withdrawal failed", 16: "Balance unavailable",
    17: "Player is in a game — ask them to return to the lobby",
    18: "Platform under maintenance", 19: "Address does not exist",
    20: "Password error", 21: "Agent name or password error",
    22: "Platform not configured",
}


def sign(params, secret):
    parts = []
    for k in sorted(params):
        if k == "sign":
            continue
        v = params[k]
        if isinstance(v, bool):
            v = "true" if v else "false"
        parts.append(f"{k}={v}")
    return md5("&".join(parts) + secret)


def decrypt_appsecret(encrypted, password):
    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    raw = base64.b64decode(encrypted)
    iv, data = raw[:16], raw[16:]
    key = md5(md5(password.lower())).encode()
    dec = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    padded = dec.update(data) + dec.finalize()
    unpad = padding.PKCS7(128).unpadder()
    return (unpad.update(padded) + unpad.finalize()).decode()


class FastApiAdapter(Adapter):
    account_min, account_max = 3, 16
    needs_platform_id = True

    def _creds(self):
        if self.p.app_id and self.p.secret_key:
            return self.p.app_id, self.p.secret_key
        ck = f"gp:fastapi:{self.p.pk}:creds"
        hit = cache.get(ck)
        if hit:
            return hit
        self.require("base_url", "agent_name", "agent_password")
        # the document signs the agent login WITHOUT an appsecret on the end; older platforms
        # appended the agent password instead, so fall back to that only on "invalid signature"
        for secret in ("", self.p.agent_password):
            params = {"requestid": uuid.uuid4().hex, "timestamp": now_ms(),
                      "account": self.p.agent_name, "passwd": self.p.agent_password}
            params["sign"] = sign(params, secret)
            data = json_of(http(self.p, "POST", f"{self.base}/fast/agent/login", data=params))
            if data.get("code") != 4:
                break
        d = data.get("data") or {}
        if data.get("code") != 200 or not d.get("appsecret_encrypted"):
            raise ApiError("Agent login failed: " + CODES.get(
                data.get("code"), str(data.get("message") or data.get("msg") or "")))
        creds = (d["appid"], decrypt_appsecret(d["appsecret_encrypted"],
                                               self.p.agent_password))
        cache.set(ck, creds, 3600)
        cache.set(f"gp:fastapi:{self.p.pk}:bal", d.get("balance"), 3600)
        return creds

    def call(self, path, params=None):
        self.require("base_url")
        appid, secret = self._creds()
        q = {"requestid": uuid.uuid4().hex, "appid": appid, "timestamp": now_ms()}
        q.update({k: str(v) for k, v in (params or {}).items()})
        q["sign"] = sign(q, secret)
        data = json_of(http(self.p, "POST", f"{self.base}{path}", data=q))
        if not isinstance(data, dict):
            raise ApiError("Unexpected reply from the platform")
        return data

    @staticmethod
    def result(data, ok_codes=(200,), **extra):
        ok = data.get("code") in ok_codes
        msg = "OK" if ok else CODES.get(data.get("code"), data.get("message")
                                        or data.get("msg") or "Failed")
        return Result(ok=ok, message=msg, raw=data, **extra)

    @staticmethod
    def short(login):
        return login.platform_user_id or login.username

    def create_account(self, account, password):
        data = self.call("/fast/user/create", {"account": account, "passwd": password})
        d = data.get("data") or {}
        return self.result(data, ok_codes=(200, 1),
                           account=d.get("full_account") or account,
                           platform_user_id=account)

    def recharge(self, login, amount, order_id):
        data = self.call("/fast/user/deposit", {"account": self.short(login),
                                                "amount": self.amount(amount)})
        d = data.get("data") or {}
        return self.result(data, balance=d.get("balance"),
                           txn_id=str(d.get("order_num") or ""))

    def withdraw(self, login, amount, order_id):
        data = self.call("/fast/user/withdrawal", {"account": self.short(login),
                                                   "amount": self.amount(amount)})
        d = data.get("data") or {}
        return self.result(data, balance=d.get("balance"),
                           txn_id=str(d.get("order_num") or ""))

    def balance(self, login):
        data = self.call("/fast/user/balance", {"account": self.short(login)})
        return self.result(data, balance=(data.get("data") or {}).get("balance"))

    def agent_balance(self):
        if self.p.app_id and self.p.secret_key:
            raise ApiError("FastApi reports the agent balance only at agent "
                           "login — add the agent login to see it.")
        cache.delete(f"gp:fastapi:{self.p.pk}:creds")
        self._creds()
        return Result(ok=True, message="OK", balance=cache.get(f"gp:fastapi:{self.p.pk}:bal"))

    def reset_password(self, login, new_password):
        # the agent-side reset: no need to know the player's old password
        return self.result(self.call("/fast/user/resetPasswd", {
            "account": self.short(login), "new_passwd": new_password}))
