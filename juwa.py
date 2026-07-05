#!/usr/bin/env python3
"""Juwa external API client.

Auth: every request sends agent_id, timestamp (10-digit), and
token = MD5("agent_id:timestamp:secret_key") as lowercase hex.
Requests are multipart/form-data POSTs.

Docs: agentBalance, userBalance, getUserID, recharge, withdraw,
getLowDepositUsers, addUser, resetPassword, playerOffline.
"""

import hashlib
import time

import requests

DEFAULT_BASE = "https://apiinterface.juwa2.xin"

# Status code -> human message (from the API doc appendix).
STATUS = {
    0: "Success",
    1: "Invalid agent ID",
    2: "Invalid request parameters",
    3: "Invalid token",
    4: "Token expired",
    5: "Your server IP is not whitelisted in Juwa",
    6: "Insufficient agent balance",
    7: "Insufficient user balance",
    8: "Invalid user ID",
    9: "User account frozen",
    10: "User is in game",
    11: "Invalid amount",
    12: "Recharge failed, please try again later",
    13: "Recharge permission denied",
    14: "Withdrawal failed, please try again later",
    15: "Withdrawal amount exceeds daily limit",
    16: "Withdrawal under review",
    17: "Withdrawal permission denied",
    18: "Account name must be letters, numbers, and underscores",
    19: "Agent has no permission to register users",
    20: "Account name already exists",
    21: "System failed",
    22: "Number of registration IPs exceeds the limit",
    23: "Password must be 6 to 32 characters",
    400: "Parameter error",
}


class JuwaError(Exception):
    """Raised when the API returns a non-zero code."""

    def __init__(self, code, msg):
        self.code = code
        self.msg = msg
        super().__init__(f"[{code}] {msg}")


class JuwaClient:
    def __init__(self, agent_id, secret_key, base_url=DEFAULT_BASE, timeout=20):
        self.agent_id = str(agent_id)
        self.secret_key = secret_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ---- low-level ----

    def _auth_fields(self):
        ts = str(int(time.time()))
        token = hashlib.md5(
            f"{self.agent_id}:{ts}:{self.secret_key}".encode()
        ).hexdigest()
        return {"agent_id": self.agent_id, "timestamp": ts, "token": token}

    def _post(self, endpoint, params=None):
        fields = self._auth_fields()
        if params:
            fields.update({k: str(v) for k, v in params.items()})
        # multipart/form-data — requests does this when using `files`
        files = {k: (None, v) for k, v in fields.items()}
        resp = requests.post(
            f"{self.base_url}/api/external/{endpoint}",
            files=files,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        body = resp.json()
        code = body.get("code")
        if code != 0:
            raise JuwaError(code, STATUS.get(code, body.get("msg", "Unknown error")))
        return body.get("data")

    # ---- endpoints ----

    def agent_balance(self):
        """Return the agent's total balance as a float."""
        data = self._post("agentBalance")
        return float(data["agent_balance"])

    def get_user_id(self, account_name):
        """Return the player id (user_id) for a login name."""
        data = self._post("getUserID", {"account_name": account_name})
        return data["user_id"]

    def user_balance(self, user_id):
        """Return a player's balance as a float."""
        data = self._post("userBalance", {"user_id": user_id})
        return float(data["user_balance"])

    def recharge(self, user_id, amount, order_id):
        """Load (recharge) a player. Returns the data dict (balances, order ids)."""
        return self._post(
            "recharge",
            {"user_id": user_id, "amount": amount, "order_id": order_id},
        )

    def withdraw(self, user_id, amount, order_id):
        """Redeem (withdraw) from a player. Returns the data dict."""
        return self._post(
            "withdraw",
            {"user_id": user_id, "amount": amount, "order_id": order_id},
        )

    def low_deposit_users(self, query_date, page=1, page_size=20):
        """List low-balance users for a date."""
        return self._post(
            "getLowDepositUsers",
            {"query_date": query_date, "page": page, "page_size": page_size},
        )

    # convenience: search by login name -> id + balance
    def search_account(self, account_name):
        user_id = self.get_user_id(account_name)
        balance = self.user_balance(user_id)
        return {"account_name": account_name, "user_id": user_id, "balance": balance}


if __name__ == "__main__":
    # Quick live test with agent 122972.
    client = JuwaClient("122972", "e8ae5e5790484885f9bb06eb496faa57")
    try:
        print("Agent balance:", client.agent_balance())
    except JuwaError as e:
        print("API error:", e)
    except Exception as e:
        print("Request failed:", repr(e))
