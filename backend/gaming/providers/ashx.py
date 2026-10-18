"""service.ashx API (Fire Kirin, Lucky Strike and the same vendor's games).

agentLogin(agentName, md5(password), time) → agentKey, which changes on every
login. Every other call is signed: sign = md5(lower(agentName + time +
agentKey)); `time` is a ms timestamp that can only be used once. Players are
addressed by account name; passwords travel as md5. Amounts are whole
dollars. code 200 = success, 201 = failure (msg says why).
"""

import threading

from django.core.cache import cache

from .base import Adapter, ApiError, Result, http, json_of, md5, now_ms

_lock = threading.Lock()


def _norm(data):
    """Vendors on this API differ in small ways: Fire Kirin documents {"code": 200, "agentKey": …}
    while Orion Stars sends {"code": "200", "agentkey": …}. Lower-case every key and read the
    code as a number, so one adapter serves them all."""
    if not isinstance(data, dict):
        return data
    out = {str(k).lower(): v for k, v in data.items()}
    try:
        out["code"] = int(str(out.get("code")).strip())
    except (TypeError, ValueError):
        pass
    return out


class AshxAdapter(Adapter):
    whole_amounts = True
    account_min, account_max = 6, 16

    @property
    def endpoint(self):
        base = self.base
        return base if base.lower().endswith(".ashx") else f"{base}/ws/service.ashx"

    def _time(self):
        """Unique, increasing ms timestamp (each value is single-use)."""
        key = f"gp:ashx:{self.p.pk}:t"
        with _lock:
            t = max(now_ms(), (cache.get(key) or 0) + 1)
            cache.set(key, t, 3600)
        return t

    def _key(self, fresh=False):
        ck = f"gp:ashx:{self.p.pk}:key"
        key = None if fresh else cache.get(ck)
        if key:
            return key
        self.require("base_url", "agent_name", "agent_password")
        resp = http(self.p, "POST", self.endpoint, params={
            "action": "agentLogin", "agentName": self.p.agent_name,
            "agentPasswd": md5(self.p.agent_password), "time": self._time()})
        data = _norm(json_of(resp))
        if not isinstance(data, dict) or data.get("code") != 200 or not data.get("agentkey"):
            raise ApiError(f"Agent login failed: {(data.get('msg') if isinstance(data, dict) else '') or 'no key'}")
        cache.set(ck, data["agentkey"], 6 * 3600)
        cache.set(f"gp:ashx:{self.p.pk}:bal", data.get("balance"), 6 * 3600)
        return data["agentkey"]

    def call(self, action, params=None, retry=True):
        key = self._key()
        t = self._time()
        sign = md5(f"{self.p.agent_name}{t}{key}".lower())
        q = {"action": action, "agentName": self.p.agent_name, "time": t,
             "sign": sign}
        q.update(params or {})
        data = _norm(json_of(http(self.p, "POST", self.endpoint, params=q)))
        if not isinstance(data, dict):
            raise ApiError("Unexpected reply from the platform")
        msg = str(data.get("msg") or "").lower()
        if (data.get("code") != 200 and retry
                and any(w in msg for w in ("sign", "key", "login", "time", "expire"))):
            self._key(fresh=True)  # key rotated elsewhere → log in again once
            return self.call(action, params, retry=False)
        return data

    @staticmethod
    def result(data, **extra):
        ok = data.get("code") == 200
        return Result(ok=ok, message="OK" if ok else (data.get("msg") or "Failed"),
                      raw=data, **extra)

    def create_account(self, account, password):
        data = self.call("registerUser", {"account": account,
                                          "passwd": md5(password)})
        return self.result(data, account=account)

    def recharge(self, login, amount, order_id):
        data = self.call("recharge", {"account": login.username,
                                      "amount": self.amount(amount),
                                      "transactionId": order_id[:20]})
        res = self.result(data, txn_id=order_id[:20])
        if res.ok:
            res.balance = self._balance_quiet(login)
        return res

    def withdraw(self, login, amount, order_id):
        data = self.call("redeem", {"account": login.username,
                                    "amount": self.amount(amount),
                                    "transactionId": order_id[:20]})
        res = self.result(data, txn_id=order_id[:20])
        if res.ok:
            res.balance = self._balance_quiet(login)
        return res

    def _balance_quiet(self, login):
        try:
            return self.balance(login).balance
        except Exception:
            return None

    def balance(self, login):
        data = self.call("queryInfo", {"account": login.username})
        return self.result(data, balance=data.get("userbalance"),
                           platform_user_id=str(data.get("gameid") or ""),
                           play_url=data.get("webloginurl") or "")

    def trade_history(self, login, days=30):
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        data = self.call("getTradeRecord", {"account": login.username, "fromDate": (now - timedelta(days=min(days, 30))).strftime("%Y-%m-%d 00:00:00"),
                                            "toDate": (now + timedelta(days=1)).strftime("%Y-%m-%d 00:00:00")})
        if data.get("code") != 200:
            raise ApiError(str(data.get("msg") or "The platform wouldn't give its records."))
        rows = []
        for r in data.get("data") or []:
            r = {str(k).lower(): v for k, v in r.items()}
            amount = float(r.get("score") or 0)
            before = r.get("balancebefore")
            rows.append({"time": str(r.get("inserttime") or ""), "amount": amount, "balance_before": before,
                         "balance_after": round(float(before) + amount, 2) if before not in (None, "") else None})
        return sorted(rows, key=lambda x: x["time"], reverse=True)

    def agent_balance(self):
        self._key(fresh=True)
        return Result(ok=True, message="OK",
                      balance=cache.get(f"gp:ashx:{self.p.pk}:bal"))

    def reset_password(self, login, new_password):
        return self.result(self.call("changePasswd", {
            "account": login.username, "passwdNew": md5(new_password)}))

    def kick(self, login):
        return self.result(self.call("kickPlayerOut", {"account": login.username}))
