"""/api/external agent API (Game Vault and the original API-Documentation).

POST multipart/form-data to {base}/api/external/<endpoint> with
agent_id, timestamp and token = MD5("agent_id:timestamp:secret_key").
Game Vault's variant wants the token UPPERCASE and a 13-digit (ms) timestamp
— both are switches on the provider. code 0 = success.
"""

import time

from .base import Adapter, ApiError, Result, http, json_of, md5

CODES = {
    1: "Invalid agent ID", 2: "Invalid request parameters", 3: "Invalid token",
    4: "Token expired", 5: "Server IP is not whitelisted on the platform",
    6: "Agent balance too low", 7: "Player balance too low",
    8: "Invalid player ID", 9: "Player account frozen",
    10: "Player is in a game — ask them to return to the lobby",
    11: "Invalid amount", 12: "Recharge failed, try again later",
    13: "Recharge permission denied", 14: "Withdrawal failed, try again later",
    15: "Withdrawal exceeds the daily limit", 16: "Withdrawal under review",
    17: "Withdrawal permission denied",
    18: "Account name may only use letters, numbers and underscores",
    19: "Agent can't register players", 20: "Account name already exists",
    21: "Platform system error", 22: "Too many registrations from this IP",
    23: "Password must be 6–32 characters", 400: "Parameter error",
}


class ExternalAdapter(Adapter):
    account_min, account_max = 6, 16
    needs_platform_id = True

    def call(self, endpoint, params=None):
        self.require("base_url", "agent_name", "secret_key")
        ts = int(time.time() * 1000) if self.p.ms_timestamp else int(time.time())
        token = md5(f"{self.p.agent_name}:{ts}:{self.p.secret_key}")
        fields = {"agent_id": str(self.p.agent_name), "timestamp": str(ts),
                  "token": token.upper() if self.p.token_upper else token}
        fields.update({k: str(v) for k, v in (params or {}).items()})
        base = self.base
        if base.endswith("/api/external"):
            base = base[: -len("/api/external")]
        resp = http(self.p, "POST", f"{base}/api/external/{endpoint}",
                    files={k: (None, v) for k, v in fields.items()})
        data = json_of(resp)
        if not isinstance(data, dict):
            raise ApiError("Unexpected reply from the platform")
        return data

    def result(self, data, **extra):
        ok = data.get("code") == 0
        msg = "OK" if ok else CODES.get(data.get("code"), data.get("msg")
                                        or f"Error {data.get('code')}")
        return Result(ok=ok, message=msg, raw=data, **extra)

    def create_account(self, account, password):
        data = self.call("addUser", {"account": account, "login_pwd": password})
        d = data.get("data") or {}
        return self.result(data, account=d.get("account_name") or account,
                           platform_user_id=str(d.get("user_id") or ""))

    def find_platform_id(self, login):
        if login.platform_user_id:
            return login.platform_user_id
        data = self.call("getUserID", {"account_name": login.username})
        return str((data.get("data") or {}).get("user_id") or "")

    def _money(self, endpoint, login, amount, order_id):
        uid = self.find_platform_id(login)
        if not uid:
            return Result(False, "Player not found on the platform")
        data = self.call(endpoint, {"user_id": uid, "amount": self.amount(amount),
                                    "order_id": order_id})
        d = data.get("data") or {}
        return self.result(data, balance=d.get("user_balance"),
                           txn_id=str(d.get("transaction_id") or ""),
                           platform_user_id=uid)

    def recharge(self, login, amount, order_id):
        return self._money("recharge", login, amount, order_id)

    def withdraw(self, login, amount, order_id):
        return self._money("withdraw", login, amount, order_id)

    def balance(self, login):
        uid = self.find_platform_id(login)
        data = self.call("userBalance", {"user_id": uid})
        return self.result(data, balance=(data.get("data") or {}).get("user_balance"),
                           platform_user_id=uid)

    def agent_balance(self):
        data = self.call("agentBalance")
        return self.result(data, balance=(data.get("data") or {}).get("agent_balance"))

    def reset_password(self, login, new_password):
        uid = self.find_platform_id(login)
        return self.result(self.call("resetPassword", {"user_id": uid,
                                                       "login_pwd": new_password}))

    def kick(self, login):
        uid = self.find_platform_id(login)
        return self.result(self.call("playerOffline", {"user_id": uid}))
