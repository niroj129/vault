#!/usr/bin/env python3
"""Game points tracker — multi-brand.

Each login is a brand (e.g. Tiffany, Stardust, Spincity) with its own Telegram
group. A brand sees only its own games. Each game has Sub-Distributor points
and Vendor points; the combined total is shown. When a game's combined total
drops below the threshold (300) a "Load 500" alert is sent to that brand's
Telegram group. Each row also has a manual "Load" button to send the reminder.
"""

import os
import sqlite3
import urllib.parse
import urllib.request

from flask import (
    Flask, g, redirect, render_template, request, session, url_for, flash
)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "vault.db")
THRESHOLD = 100       # auto-alert when a game's combined points drop below this
LOAD_AMOUNT = 500     # default load amount for the auto-alert

# One bot, shared by all brands. From @BotFather.
BOT_TOKEN = os.environ.get("BOT_TOKEN", "8934666053:AAH2cyv_DVZXBgWf2EPEcBoyaFPbot-gvbc")

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-key")


# ---------- database ----------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            brand TEXT NOT NULL DEFAULT '',
            group_chat_id TEXT NOT NULL DEFAULT ''
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sub_points REAL NOT NULL DEFAULT 0,
            vendor_points REAL NOT NULL DEFAULT 0
        )
        """
    )
    db.commit()
    db.close()


# ---------- telegram ----------

def send_telegram(chat_id, text):
    if not chat_id or BOT_TOKEN == "PUT_YOUR_TOKEN_HERE":
        return False
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, data=data), timeout=10
        ) as resp:
            return resp.status == 200
    except Exception:
        return False


def load_message(brand, game, amount):
    combined = game["sub_points"] + game["vendor_points"]
    return (
        f"🔔 [{brand}] Please load {amount:g} — {game['name']}\n"
        f"Sub-Dist: {game['sub_points']:g} | Vendor: {game['vendor_points']:g} "
        f"| Combined: {combined:g}"
    )


# ---------- auth ----------

def current_user():
    uid = session.get("uid")
    if uid is None:
        return None
    return get_db().execute(
        "SELECT * FROM users WHERE id = ?", (uid,)
    ).fetchone()


def login_required(view):
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    wrapped.__name__ = view.__name__
    return wrapped


def owned_game(game_id, user):
    """Return the game only if it belongs to this user, else None."""
    return get_db().execute(
        "SELECT * FROM games WHERE id = ? AND owner_id = ?",
        (game_id, user["id"]),
    ).fetchone()


# ---------- routes ----------

@app.route("/")
def index():
    return redirect(url_for("dashboard") if current_user() else url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        row = get_db().execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row and check_password_hash(row["password_hash"], password):
            session.clear()
            session["uid"] = row["id"]
            return redirect(url_for("dashboard"))
        flash("Wrong username or password.")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    user = current_user()
    games = get_db().execute(
        "SELECT * FROM games WHERE owner_id = ? ORDER BY name", (user["id"],)
    ).fetchall()
    total = sum(g["sub_points"] + g["vendor_points"] for g in games)
    return render_template(
        "dashboard.html",
        user=user,
        games=games,
        total=total,
        threshold=THRESHOLD,
        load_amount=LOAD_AMOUNT,
    )


@app.route("/games/add", methods=["POST"])
@login_required
def add_game():
    user = current_user()
    name = request.form.get("name", "").strip()
    if not name:
        flash("Enter a game name.")
        return redirect(url_for("dashboard"))
    try:
        sub = float(request.form.get("sub_points") or 0)
        vendor = float(request.form.get("vendor_points") or 0)
    except ValueError:
        flash("Points must be numbers.")
        return redirect(url_for("dashboard"))

    db = get_db()
    db.execute(
        "INSERT INTO games (owner_id, name, sub_points, vendor_points) "
        "VALUES (?, ?, ?, ?)",
        (user["id"], name, sub, vendor),
    )
    db.commit()
    _maybe_alert(user, name, sub, vendor)
    flash(f"Added game: {name}")
    return redirect(url_for("dashboard"))


@app.route("/games/<int:game_id>/update", methods=["POST"])
@login_required
def update_game(game_id):
    user = current_user()
    game = owned_game(game_id, user)
    if not game:
        flash("Game not found.")
        return redirect(url_for("dashboard"))
    try:
        sub = float(request.form.get("sub_points") or 0)
        vendor = float(request.form.get("vendor_points") or 0)
    except ValueError:
        flash("Points must be numbers.")
        return redirect(url_for("dashboard"))

    db = get_db()
    db.execute(
        "UPDATE games SET sub_points = ?, vendor_points = ? WHERE id = ?",
        (sub, vendor, game_id),
    )
    db.commit()
    _maybe_alert(user, game["name"], sub, vendor)
    flash("Points updated.")
    return redirect(url_for("dashboard"))


@app.route("/games/<int:game_id>/remind", methods=["POST"])
@login_required
def remind(game_id):
    user = current_user()
    game = owned_game(game_id, user)
    try:
        amount = float(request.form.get("load_points") or LOAD_AMOUNT)
    except ValueError:
        amount = LOAD_AMOUNT
    if not game:
        flash("Game not found.")
    elif not user["group_chat_id"]:
        flash("Set your Telegram group ID on the Settings page first.")
    elif send_telegram(
        user["group_chat_id"],
        load_message(user["brand"] or user["username"], game, amount),
    ):
        flash(f"Reminder sent: load {amount:g} for {game['name']}.")
    else:
        flash("Could not send — check the bot token and group ID.")
    return redirect(url_for("dashboard"))


@app.route("/games/<int:game_id>/delete", methods=["POST"])
@login_required
def delete_game(game_id):
    user = current_user()
    if owned_game(game_id, user):
        db = get_db()
        db.execute("DELETE FROM games WHERE id = ?", (game_id,))
        db.commit()
        flash("Game removed.")
    return redirect(url_for("dashboard"))


@app.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    user = current_user()
    if request.method == "POST":
        chat_id = request.form.get("group_chat_id", "").strip()
        db = get_db()
        db.execute(
            "UPDATE users SET group_chat_id = ? WHERE id = ?",
            (chat_id, user["id"]),
        )
        db.commit()
        flash("Group ID saved.")
        return redirect(url_for("settings"))
    return render_template("settings.html", user=user)


def _maybe_alert(user, name, sub, vendor):
    """Auto-send a load reminder to the brand's group when combined < threshold."""
    combined = sub + vendor
    if combined < THRESHOLD and user["group_chat_id"]:
        brand = user["brand"] or user["username"]
        send_telegram(
            user["group_chat_id"],
            f"⚠️ [{brand}] Low: {name} combined {combined:g} "
            f"(below {THRESHOLD}).\n🔔 Please load {LOAD_AMOUNT:g}.",
        )


# Ensure tables exist whenever the app is imported (e.g. by a WSGI server).
init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
