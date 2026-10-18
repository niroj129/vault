"""Agent-server API (Cash Machine, Mafia, Game Room — agentserver.<host>).

Log in with the store username/password → Bearer token (cached until it
expires). Players are addressed by their numeric id; insertPlayer doesn't
return it, so it's looked up in playerList once and remembered on the login.
status_code 200 = success.
"""

import time

from django.core.cache import cache

from .base import Adapter, ApiError, Result, http, json_of


class AgentServerAdapter(Adapter):
    account_min, account_max = 6, 16
    needs_platform_id = True

    def _token(self, fresh=False):
        key = f"gp:agentserver:{self.p.pk}:token"
        tok = None if fresh else cache.get(key)
        if tok:
            return tok
        self.require("base_url", "agent_name", "agent_password")
        resp = http(self.p, "POST", f"{self.base}/api/agent/login",
                    data={"username": self.p.agent_name,
                          "password": self.p.agent_password})
        data = json_of(resp)
        d = data.get("data") or {}
        if data.get("status_code") != 200 or not d.get("token"):
            raise ApiError(f"Agent login failed: {data.get('message') or resp.status_code}")
        ttl = int(d.get("expires_time") or 0) - int(time.time()) - 60
        cache.set(key, d["token"], max(ttl, 60) if ttl > 0 else 3000)
        cache.set(f"gp:agentserver:{self.p.pk}:money", d.get("money"), 3000)
        return d["token"]

    def call(self, method, path, params=None, data=None):
        for attempt in (0, 1):
            token = self._token(fresh=attempt == 1)
            resp = http(self.p, method, f"{self.base}{path}", params=params,
                        data=data, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code == 401 and attempt == 0:
                continue  # token expired early → log in again once
            out = json_of(resp)
            if not isinstance(out, dict):
                raise ApiError("Unexpected reply from the platform")
            return out
        raise ApiError("Platform rejected the agent login")

    @staticmethod
    def result(data, **extra):
        ok = data.get("status_code") == 200 and not data.get("code")
        return Result(ok=ok, message="OK" if ok else (data.get("message") or "Failed"),
                      raw=data, **extra)

    def create_account(self, account, password):
        data = self.call("POST", "/api/player/insertPlayer",
                         data={"username": account, "nickname": account,
                               "password": password, "money": "0"})
        d = data.get("data") or {}
        res = self.result(data, account=d.get("account") or account)
        if res.ok:
            pid = d.get("id") or d.get("game_id") or ""
            if not pid:
                pid = self._lookup_id(res.account)
            res.platform_user_id = str(pid or "")
        return res

    def _lookup_id(self, account, pages=40):
        for page in range(1, pages + 1):
            data = self.call("GET", "/api/player/playerList",
                             params={"limit": 100, "page": page, "account": account})
            rows = data.get("data") or []
            for row in rows:
                if str(row.get("Account", "")).lower() == account.lower():
                    return str(row.get("id"))
            if len(rows) < 100:
                break
        return ""

    def search_accounts(self, query, limit=30):
        data = self.call("GET", "/api/player/playerList", params={"limit": limit, "page": 1, **({"account": query} if query else {})})
        out = []
        for r in data.get("data") or []:
            out.append({"username": str(r.get("Account") or ""), "platform_id": str(r.get("id") or ""), "balance": r.get("score"),
                        "created": r.get("AddDate") or "", "last_seen": (r.get("lasttime") if r.get("lasttime") not in (None, "-") else "") or "",
                        "banned": r.get("account_using") not in (None, 1, "1")})
        return out

    def find_platform_id(self, login):
        return login.platform_user_id or self._lookup_id(login.username)

    def _money(self, path, login, amount, order_id):
        pid = self.find_platform_id(login)
        if not pid:
            return Result(False, "Player not found on the platform")
        data = self.call("POST", path, data={"id": pid, "balance": str(self.amount(amount)),
                                             "remark": order_id})
        d = data.get("data") or {}
        return self.result(data, balance=d.get("balance"), txn_id=order_id,
                           platform_user_id=pid)

    def recharge(self, login, amount, order_id):
        return self._money("/api/player/playerRecharge", login, amount, order_id)

    def withdraw(self, login, amount, order_id):
        return self._money("/api/player/playerWithdraw", login, amount, order_id)

    def balance(self, login):
        pid = self.find_platform_id(login)
        data = self.call("GET", "/api/player/getScore", params={"id": pid})
        d = data.get("data") or {}
        res = self.result(data, balance=d.get("balance"), platform_user_id=pid)
        if d.get("is_game"):
            res.message = "Player is in a game right now"
        return res

    def agent_balance(self):
        self._token(fresh=True)
        money = cache.get(f"gp:agentserver:{self.p.pk}:money")
        return Result(ok=True, message="OK", balance=money)
