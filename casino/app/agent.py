"""Agent Portal — dashboard for users with the 'agent' role.

Agents share game links, view their player list, read announcements, chat, and
manage their own profile. They do not have admin privileges.
"""

import functools

from flask import (Blueprint, abort, flash, redirect, render_template, request,
                   url_for)
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db, now
from .security import current_user, log_activity

bp = Blueprint("agent", __name__)


def agent_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return redirect(url_for("auth.login", next=request.path))
        if user["role"] not in ("agent", "admin"):
            abort(403)
        return view(*args, **kwargs)
    return wrapped


@bp.route("/")
@agent_required
def dashboard():
    db = get_db()
    games = db.execute(
        "SELECT g.*, c.name AS category FROM games g "
        "LEFT JOIN categories c ON c.id = g.category_id "
        "WHERE g.status='active' ORDER BY g.name").fetchall()
    announcements = db.execute(
        "SELECT * FROM announcements WHERE active=1 "
        "ORDER BY pinned DESC, created_at DESC LIMIT 6").fetchall()
    players = db.execute(
        "SELECT username, full_name, is_active, last_login FROM users "
        "WHERE role='staff' ORDER BY username").fetchall()
    return render_template("agent/dashboard.html", games=games,
                           announcements=announcements, players=players)


@bp.route("/profile", methods=["POST"])
@agent_required
def profile():
    user = current_user()
    full_name = request.form.get("full_name", "").strip()
    db = get_db()
    db.execute("UPDATE users SET full_name=? WHERE id=?", (full_name, user["id"]))

    new = request.form.get("new_password", "")
    if new:
        current = request.form.get("current_password", "")
        if not check_password_hash(user["password_hash"], current):
            flash("Current password is incorrect.", "danger")
            return redirect(url_for("agent.dashboard"))
        if len(new) < 6:
            flash("New password must be at least 6 characters.", "danger")
            return redirect(url_for("agent.dashboard"))
        db.execute("UPDATE users SET password_hash=? WHERE id=?",
                   (generate_password_hash(new), user["id"]))
    db.commit()
    log_activity("agent_profile", "updated profile")
    flash("Profile updated.", "success")
    return redirect(url_for("agent.dashboard"))
