#!/usr/bin/env python3
"""Vault alert: type your current points balance; if it's below the
threshold, send a Telegram message asking for a load."""

import json
import urllib.parse
import urllib.request

# ---- Settings: fill these two in ----
BOT_TOKEN = "PUT_YOUR_TOKEN_HERE"
CHAT_ID = "PUT_YOUR_CHAT_ID_HERE"
THRESHOLD = 300
# -------------------------------------


def send_telegram(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": CHAT_ID, "text": text}).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data=data)) as resp:
        return json.load(resp)


def main():
    raw = input("Enter current vault points: ").strip()
    try:
        points = float(raw)
    except ValueError:
        print("That's not a number. Try again.")
        return

    if points < THRESHOLD:
        message = (
            f"⚠️ Vault low: {points:g} points left "
            f"(below {THRESHOLD}). Please load."
        )
        result = send_telegram(message)
        if result.get("ok"):
            print(f"Sent alert to Telegram. ({points:g} < {THRESHOLD})")
        else:
            print(f"Telegram error: {result}")
    else:
        print(f"OK, {points:g} points is fine (>= {THRESHOLD}). No alert sent.")


if __name__ == "__main__":
    main()
