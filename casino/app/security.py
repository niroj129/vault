"""Auth helpers, CSRF protection, role-based access control, activity logging."""

import functools
import secrets

from flask import (abort, flash, g, redirect, request, session, url_for)

from .db import get_db, now


# ---------------- current user ----------------

def current_user():
    if "user" in g:
        return g.user
    uid = session.get("uid")
    g.user = None
    if uid is not None:
        g.user = get_db().execute(
            "SELECT * FROM users WHERE id = ? AND is_active = 1", (uid,)
        ).fetchone()
    return g.user


def touch_last_seen():
    """Mark the logged-in user active (drives the 'online users' list)."""
    user = current_user()
    if user:
        db = get_db()
        db.execute("UPDATE users SET last_seen = ? WHERE id = ?",
                   (now(), user["id"]))
        db.commit()


# ---------------- access control ----------------

def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            flash("Please sign in to continue.", "warning")
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return redirect(url_for("auth.login", next=request.path))
        if user["role"] != "admin":
            abort(403)
        return view(*args, **kwargs)
    return wrapped


# ---------------- CSRF ----------------

def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


def verify_csrf():
    """Reject unsafe requests without a valid token. Called in before_request."""
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return
    sent = (request.form.get("csrf_token")
            or request.headers.get("X-CSRF-Token", ""))
    if not sent or sent != session.get("csrf"):
        abort(400, description="Invalid or missing CSRF token.")


# ---------------- activity log ----------------

def log_activity(action, detail=""):
    user = current_user()
    db = get_db()
    db.execute(
        "INSERT INTO activity_log (user_id, username, action, detail, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (user["id"] if user else None,
         user["username"] if user else "system",
         action, detail, now()))
    db.commit()


def client_ip():
    return (request.headers.get("X-Forwarded-For", request.remote_addr or "")
            .split(",")[0].strip())
