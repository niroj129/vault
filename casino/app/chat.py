"""Real-time-ish chat via short polling.

A full WebSocket server needs extra infrastructure; short polling keeps the app
dependency-free while still feeling live. The frontend polls /chat/poll every
few seconds for new messages and the online-user list.
"""

from datetime import datetime, timedelta

from flask import (Blueprint, current_app, jsonify, render_template, request)

from .db import get_db, now
from .security import current_user, login_required
from .helpers import save_image

bp = Blueprint("chat", __name__)


@bp.route("/")
@login_required
def room():
    return render_template("chat.html")


@bp.route("/poll")
@login_required
def poll():
    """Return messages newer than ?after= plus the current online-user list."""
    db = get_db()
    after = request.args.get("after", "0")
    try:
        after_id = int(after)
    except ValueError:
        after_id = 0

    msgs = db.execute(
        "SELECT id, username, body, image, created_at FROM chat_messages "
        "WHERE id > ? ORDER BY id ASC LIMIT 100", (after_id,)).fetchall()

    cutoff = (datetime.utcnow()
              - timedelta(seconds=current_app.config["ONLINE_WINDOW"])
              ).strftime("%Y-%m-%d %H:%M:%S")
    online = db.execute(
        "SELECT username, role FROM users WHERE last_seen >= ? "
        "ORDER BY username", (cutoff,)).fetchall()

    me = current_user()
    return jsonify(
        messages=[{"id": m["id"], "username": m["username"], "body": m["body"],
                   "image": m["image"], "created_at": m["created_at"],
                   "mine": m["username"] == me["username"]} for m in msgs],
        online=[{"username": o["username"], "role": o["role"]} for o in online],
        me=me["username"])


@bp.route("/history")
@login_required
def history():
    """Initial load / search of past conversation."""
    db = get_db()
    q = request.args.get("q", "").strip()
    if q:
        rows = db.execute(
            "SELECT id, username, body, image, created_at FROM chat_messages "
            "WHERE body LIKE ? ORDER BY id DESC LIMIT 100", (f"%{q}%",)
        ).fetchall()
        rows = list(reversed(rows))
    else:
        rows = db.execute(
            "SELECT id, username, body, image, created_at FROM chat_messages "
            "ORDER BY id DESC LIMIT 60").fetchall()
        rows = list(reversed(rows))
    me = current_user()
    return jsonify(messages=[
        {"id": m["id"], "username": m["username"], "body": m["body"],
         "image": m["image"], "created_at": m["created_at"],
         "mine": m["username"] == me["username"]} for m in rows])


@bp.route("/send", methods=["POST"])
@login_required
def send():
    me = current_user()
    body = request.form.get("body", "").strip()
    try:
        image = save_image(request.files.get("image"))
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    if not body and not image:
        return jsonify(ok=False, error="Empty message"), 400
    if len(body) > 2000:
        body = body[:2000]

    db = get_db()
    cur = db.execute(
        "INSERT INTO chat_messages (user_id, username, body, image, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (me["id"], me["username"], body, image, now()))
    db.commit()
    return jsonify(ok=True, id=cur.lastrowid)
