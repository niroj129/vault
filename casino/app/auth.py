"""Authentication: login (with remember-me), logout, change password."""

from flask import (Blueprint, flash, redirect, render_template, request,
                   session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db, now
from .security import (client_ip, current_user, log_activity, login_required)
from .helpers import get_seo

bp = Blueprint("auth", __name__)


def _log_attempt(username, user_id, success):
    db = get_db()
    db.execute(
        "INSERT INTO login_logs (user_id, username, ip, user_agent, success, "
        "created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, username, client_ip(),
         request.headers.get("User-Agent", "")[:300], 1 if success else 0, now()))
    db.commit()


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user():
        return redirect(url_for("public.home"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        remember = request.form.get("remember") == "on"

        row = get_db().execute(
            "SELECT * FROM users WHERE username = ?", (username,)).fetchone()

        if row and row["is_active"] and check_password_hash(
                row["password_hash"], password):
            session.clear()
            session["uid"] = row["id"]
            session.permanent = remember
            db = get_db()
            db.execute("UPDATE users SET last_login = ? WHERE id = ?",
                       (now(), row["id"]))
            db.commit()
            _log_attempt(username, row["id"], True)
            log_activity("login", f"{username} signed in")
            nxt = request.args.get("next", "")
            if nxt.startswith("/"):
                return redirect(nxt)
            dest = {"admin": "admin.dashboard", "agent": "agent.dashboard"}.get(
                row["role"], "public.dashboard")
            return redirect(url_for(dest))

        _log_attempt(username or "(blank)", row["id"] if row else None, False)
        flash("Incorrect username or password.", "danger")

    return render_template("login.html", seo=get_seo("home"))


@bp.route("/logout")
def logout():
    if current_user():
        log_activity("logout", "signed out")
    session.clear()
    flash("You have been signed out.", "success")
    return redirect(url_for("auth.login"))


@bp.route("/account/password", methods=["POST"])
@login_required
def change_password():
    user = current_user()
    current = request.form.get("current_password", "")
    new = request.form.get("new_password", "")
    confirm = request.form.get("confirm_password", "")

    if not check_password_hash(user["password_hash"], current):
        flash("Current password is incorrect.", "danger")
    elif len(new) < 6:
        flash("New password must be at least 6 characters.", "danger")
    elif new != confirm:
        flash("New passwords do not match.", "danger")
    else:
        db = get_db()
        db.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                   (generate_password_hash(new), user["id"]))
        db.commit()
        log_activity("password_change", "updated own password")
        flash("Password updated.", "success")
    return redirect(request.referrer or url_for("public.dashboard"))
