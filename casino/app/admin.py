"""Admin dashboard and all management CRUD."""

from datetime import date, timedelta

from flask import (Blueprint, flash, redirect, render_template, request,
                   url_for)
from werkzeug.security import generate_password_hash

import json

from .db import get_db, now, slugify
from .security import admin_required, log_activity
from .helpers import save_image, save_images

bp = Blueprint("admin", __name__)


@bp.before_request
@admin_required
def _guard():
    """Every admin route requires an admin session."""
    pass


# ============================ DASHBOARD ============================

@bp.route("/")
def dashboard():
    db = get_db()

    def scalar(sql, args=()):
        return db.execute(sql, args).fetchone()[0]

    today = date.today()
    week_ago = (today - timedelta(days=6)).isoformat()
    month_ago = (today - timedelta(days=29)).isoformat()
    online_cut = now()  # compared in python below

    stats = {
        "users": scalar("SELECT COUNT(*) FROM users"),
        "active_users": scalar("SELECT COUNT(*) FROM users WHERE is_active=1"),
        "games": scalar("SELECT COUNT(*) FROM games"),
        "categories": scalar("SELECT COUNT(*) FROM categories"),
        "daily_profit": scalar(
            "SELECT COALESCE(SUM(amount),0) FROM profits WHERE profit_date=?",
            (today.isoformat(),)),
        "monthly_profit": scalar(
            "SELECT COALESCE(SUM(amount),0) FROM profits WHERE profit_date>=?",
            (month_ago,)),
    }
    winner = db.execute(
        "SELECT * FROM winners ORDER BY win_date DESC, id DESC LIMIT 1").fetchone()
    activities = db.execute(
        "SELECT * FROM activity_log ORDER BY id DESC LIMIT 12").fetchall()

    # 14-day profit trend for the chart
    labels, values = [], []
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        labels.append(d[5:])
        values.append(scalar(
            "SELECT COALESCE(SUM(amount),0) FROM profits WHERE profit_date=?",
            (d,)))

    return render_template("admin/dashboard.html", stats=stats, winner=winner,
                           activities=activities, chart_labels=labels,
                           chart_values=values, week_ago=week_ago)


# ============================ GAMES ============================

@bp.route("/games")
def games():
    db = get_db()
    rows = db.execute(
        "SELECT g.*, c.name AS category FROM games g "
        "LEFT JOIN categories c ON c.id = g.category_id "
        "ORDER BY g.sort_order, g.name").fetchall()
    categories = db.execute(
        "SELECT * FROM categories ORDER BY sort_order, name").fetchall()
    return render_template("admin/games.html", games=rows, categories=categories)


@bp.route("/games/save", methods=["POST"])
def save_game():
    db = get_db()
    gid = request.form.get("id", "").strip()
    name = request.form.get("name", "").strip()
    if not name:
        flash("Game name is required.", "danger")
        return redirect(url_for("admin.games"))

    category_id = request.form.get("category_id") or None
    description = request.form.get("description", "").strip()
    features = request.form.get("features", "").strip()
    download_info = request.form.get("download_info", "").strip()
    play_url = request.form.get("play_url", "").strip()
    user_link = request.form.get("user_link", "").strip()
    agent_link = request.form.get("agent_link", "").strip()
    meta_title = request.form.get("meta_title", "").strip()
    meta_description = request.form.get("meta_description", "").strip()
    meta_keywords = request.form.get("meta_keywords", "").strip()
    status = "active" if request.form.get("status") == "active" else "inactive"
    featured = 1 if request.form.get("featured") == "on" else 0
    is_new = 1 if request.form.get("is_new") == "on" else 0
    sort_order = int(request.form.get("sort_order") or 0)

    # FAQs entered one per line as "Question | Answer"
    faqs = []
    for line in request.form.get("faqs", "").splitlines():
        if "|" in line:
            q, a = line.split("|", 1)
            if q.strip():
                faqs.append({"q": q.strip(), "a": a.strip()})
    faqs_json = json.dumps(faqs)

    try:
        image = save_image(request.files.get("image"))
        logo = save_image(request.files.get("logo"))
        banner = save_image(request.files.get("banner"))
        new_shots = save_images(request.files.getlist("screenshots"))
    except ValueError as e:
        flash(str(e), "danger")
        return redirect(url_for("admin.games"))

    slug = slugify(name)
    fields = dict(
        name=name, slug=slug, category_id=category_id, description=description,
        features=features, faqs=faqs_json, download_info=download_info,
        play_url=play_url, user_link=user_link, agent_link=agent_link,
        meta_title=meta_title, meta_description=meta_description,
        meta_keywords=meta_keywords, status=status, featured=featured,
        is_new=is_new, sort_order=sort_order)

    try:
        if gid:
            existing = db.execute("SELECT * FROM games WHERE id=?", (gid,)).fetchone()
            fields["image"] = image or existing["image"]
            fields["logo"] = logo or existing["logo"]
            fields["banner"] = banner or existing["banner"]
            old_shots = json.loads(existing["screenshots"] or "[]")
            fields["screenshots"] = json.dumps(old_shots + new_shots)
            sets = ", ".join(f"{k}=?" for k in fields)
            db.execute(f"UPDATE games SET {sets} WHERE id=?",
                       (*fields.values(), gid))
            log_activity("game_update", name)
            flash(f"Updated game: {name}", "success")
        else:
            fields["image"] = image
            fields["logo"] = logo
            fields["banner"] = banner
            fields["screenshots"] = json.dumps(new_shots)
            fields["created_at"] = now()
            cols = ", ".join(fields)
            ph = ", ".join("?" for _ in fields)
            db.execute(f"INSERT INTO games ({cols}) VALUES ({ph})",
                       tuple(fields.values()))
            log_activity("game_create", name)
            flash(f"Added game: {name}", "success")
        db.commit()
    except Exception:
        flash("Could not save — a game with that name/slug may already exist.",
              "danger")
    return redirect(url_for("admin.games"))


@bp.route("/games/<int:gid>/toggle", methods=["POST"])
def toggle_game(gid):
    db = get_db()
    row = db.execute("SELECT status FROM games WHERE id=?", (gid,)).fetchone()
    if row:
        new = "inactive" if row["status"] == "active" else "active"
        db.execute("UPDATE games SET status=? WHERE id=?", (new, gid))
        db.commit()
        flash(f"Game marked {new}.", "success")
    return redirect(url_for("admin.games"))


@bp.route("/games/<int:gid>/delete", methods=["POST"])
def delete_game(gid):
    db = get_db()
    db.execute("DELETE FROM games WHERE id=?", (gid,))
    db.commit()
    log_activity("game_delete", f"id={gid}")
    flash("Game deleted.", "success")
    return redirect(url_for("admin.games"))


# ============================ CATEGORIES ============================

@bp.route("/categories")
def categories():
    rows = get_db().execute(
        "SELECT c.*, COUNT(g.id) AS game_count FROM categories c "
        "LEFT JOIN games g ON g.category_id = c.id "
        "GROUP BY c.id ORDER BY c.sort_order, c.name").fetchall()
    return render_template("admin/categories.html", categories=rows)


@bp.route("/categories/save", methods=["POST"])
def save_category():
    db = get_db()
    cid = request.form.get("id", "").strip()
    name = request.form.get("name", "").strip()
    icon = request.form.get("icon", "").strip() or "fa-dice"
    sort_order = int(request.form.get("sort_order") or 0)
    if not name:
        flash("Category name is required.", "danger")
        return redirect(url_for("admin.categories"))
    try:
        if cid:
            db.execute("UPDATE categories SET name=?, slug=?, icon=?, sort_order=? "
                       "WHERE id=?", (name, slugify(name), icon, sort_order, cid))
        else:
            db.execute("INSERT INTO categories (name, slug, icon, sort_order, "
                       "created_at) VALUES (?, ?, ?, ?, ?)",
                       (name, slugify(name), icon, sort_order, now()))
        db.commit()
        flash("Category saved.", "success")
    except Exception:
        flash("A category with that name already exists.", "danger")
    return redirect(url_for("admin.categories"))


@bp.route("/categories/<int:cid>/delete", methods=["POST"])
def delete_category(cid):
    db = get_db()
    db.execute("DELETE FROM categories WHERE id=?", (cid,))
    db.commit()
    flash("Category deleted.", "success")
    return redirect(url_for("admin.categories"))


# ============================ WINNERS ============================

@bp.route("/winners")
def winners():
    rows = get_db().execute(
        "SELECT * FROM winners ORDER BY win_date DESC, id DESC").fetchall()
    return render_template("admin/winners.html", winners=rows,
                           today=date.today().isoformat())


@bp.route("/winners/save", methods=["POST"])
def save_winner():
    db = get_db()
    wid = request.form.get("id", "").strip()
    name = request.form.get("name", "").strip()
    if not name:
        flash("Winner name is required.", "danger")
        return redirect(url_for("admin.winners"))
    amount = float(request.form.get("amount") or 0)
    game = request.form.get("game", "").strip()
    win_date = request.form.get("win_date") or date.today().isoformat()
    try:
        photo = save_image(request.files.get("photo"))
    except ValueError as e:
        flash(str(e), "danger")
        return redirect(url_for("admin.winners"))

    if wid:
        existing = db.execute("SELECT photo FROM winners WHERE id=?", (wid,)).fetchone()
        photo = photo or (existing["photo"] if existing else "")
        db.execute("UPDATE winners SET name=?, amount=?, game=?, photo=?, "
                   "win_date=? WHERE id=?",
                   (name, amount, game, photo, win_date, wid))
    else:
        db.execute("INSERT INTO winners (name, amount, game, photo, win_date, "
                   "created_at) VALUES (?, ?, ?, ?, ?, ?)",
                   (name, amount, game, photo, win_date, now()))
    db.commit()
    log_activity("winner_save", f"{name} ({amount})")
    flash("Winner saved.", "success")
    return redirect(url_for("admin.winners"))


@bp.route("/winners/<int:wid>/delete", methods=["POST"])
def delete_winner(wid):
    db = get_db()
    db.execute("DELETE FROM winners WHERE id=?", (wid,))
    db.commit()
    flash("Winner deleted.", "success")
    return redirect(url_for("admin.winners"))


# ============================ PROFIT ============================

@bp.route("/profit")
def profit():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM profits ORDER BY profit_date DESC LIMIT 60").fetchall()
    today = date.today()
    week_ago = (today - timedelta(days=6)).isoformat()
    month_ago = (today - timedelta(days=29)).isoformat()

    def s(where="", args=()):
        return db.execute(
            f"SELECT COALESCE(SUM(amount),0) AS x FROM profits {where}", args
        ).fetchone()["x"]

    summary = {
        "today": s("WHERE profit_date=?", (today.isoformat(),)),
        "week": s("WHERE profit_date>=?", (week_ago,)),
        "month": s("WHERE profit_date>=?", (month_ago,)),
        "total": s(),
    }
    labels, values = [], []
    for i in range(29, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        labels.append(d[5:])
        values.append(s("WHERE profit_date=?", (d,)))

    return render_template("admin/profit.html", rows=rows, summary=summary,
                           chart_labels=labels, chart_values=values,
                           today=today.isoformat())


@bp.route("/profit/save", methods=["POST"])
def save_profit():
    db = get_db()
    amount = float(request.form.get("amount") or 0)
    profit_date = request.form.get("profit_date") or date.today().isoformat()
    notes = request.form.get("notes", "").strip()
    # upsert on date
    db.execute(
        "INSERT INTO profits (amount, profit_date, notes, created_at) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT(profit_date) DO UPDATE SET amount=excluded.amount, "
        "notes=excluded.notes",
        (amount, profit_date, notes, now()))
    db.commit()
    log_activity("profit_save", f"{profit_date}: {amount}")
    flash(f"Profit saved for {profit_date}.", "success")
    return redirect(url_for("admin.profit"))


@bp.route("/profit/<int:pid>/delete", methods=["POST"])
def delete_profit(pid):
    db = get_db()
    db.execute("DELETE FROM profits WHERE id=?", (pid,))
    db.commit()
    flash("Profit record deleted.", "success")
    return redirect(url_for("admin.profit"))


# ============================ ANNOUNCEMENTS ============================

@bp.route("/announcements")
def announcements():
    rows = get_db().execute(
        "SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC"
    ).fetchall()
    return render_template("admin/announcements.html", announcements=rows)


@bp.route("/announcements/save", methods=["POST"])
def save_announcement():
    db = get_db()
    aid = request.form.get("id", "").strip()
    title = request.form.get("title", "").strip()
    body = request.form.get("body", "").strip()
    pinned = 1 if request.form.get("pinned") == "on" else 0
    active = 1 if request.form.get("active") == "on" else 0
    publish_at = request.form.get("publish_at", "").strip().replace("T", " ")
    if not title:
        flash("Title is required.", "danger")
        return redirect(url_for("admin.announcements"))
    if aid:
        db.execute("UPDATE announcements SET title=?, body=?, pinned=?, active=?, "
                   "publish_at=? WHERE id=?",
                   (title, body, pinned, active, publish_at, aid))
    else:
        db.execute("INSERT INTO announcements (title, body, pinned, active, "
                   "publish_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                   (title, body, pinned, active, publish_at, now()))
    db.commit()
    log_activity("announcement_save", title)
    flash("Announcement saved.", "success")
    return redirect(url_for("admin.announcements"))


@bp.route("/announcements/<int:aid>/delete", methods=["POST"])
def delete_announcement(aid):
    db = get_db()
    db.execute("DELETE FROM announcements WHERE id=?", (aid,))
    db.commit()
    flash("Announcement deleted.", "success")
    return redirect(url_for("admin.announcements"))


# ============================ USERS ============================

@bp.route("/users")
def users():
    rows = get_db().execute(
        "SELECT * FROM users ORDER BY role, username").fetchall()
    return render_template("admin/users.html", users=rows)


@bp.route("/users/save", methods=["POST"])
def save_user():
    db = get_db()
    uid = request.form.get("id", "").strip()
    username = request.form.get("username", "").strip()
    full_name = request.form.get("full_name", "").strip()
    role = request.form.get("role", "staff")
    if role not in ("admin", "agent", "staff"):
        role = "staff"
    is_active = 1 if request.form.get("is_active") == "on" else 0
    password = request.form.get("password", "")

    if not username:
        flash("Username is required.", "danger")
        return redirect(url_for("admin.users"))

    try:
        if uid:
            if password:
                db.execute(
                    "UPDATE users SET username=?, full_name=?, role=?, "
                    "is_active=?, password_hash=? WHERE id=?",
                    (username, full_name, role, is_active,
                     generate_password_hash(password), uid))
            else:
                db.execute(
                    "UPDATE users SET username=?, full_name=?, role=?, "
                    "is_active=? WHERE id=?",
                    (username, full_name, role, is_active, uid))
            log_activity("user_update", username)
        else:
            if len(password) < 6:
                flash("New users need a password of at least 6 characters.",
                      "danger")
                return redirect(url_for("admin.users"))
            db.execute(
                "INSERT INTO users (username, password_hash, full_name, role, "
                "is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (username, generate_password_hash(password), full_name, role,
                 is_active, now()))
            log_activity("user_create", username)
        db.commit()
        flash("User saved.", "success")
    except Exception:
        flash("That username is already taken.", "danger")
    return redirect(url_for("admin.users"))


@bp.route("/users/<int:uid>/delete", methods=["POST"])
def delete_user(uid):
    from .security import current_user
    if current_user()["id"] == uid:
        flash("You cannot delete your own account.", "danger")
        return redirect(url_for("admin.users"))
    db = get_db()
    db.execute("DELETE FROM users WHERE id=?", (uid,))
    db.commit()
    log_activity("user_delete", f"id={uid}")
    flash("User deleted.", "success")
    return redirect(url_for("admin.users"))


# ============================ SETTINGS ============================

@bp.route("/settings", methods=["GET", "POST"])
def settings():
    db = get_db()
    if request.method == "POST":
        try:
            logo = save_image(request.files.get("logo_file"))
            favicon = save_image(request.files.get("favicon_file"))
            social = save_image(request.files.get("social_file"))
        except ValueError as e:
            flash(str(e), "danger")
            return redirect(url_for("admin.settings"))

        for key in ("site_name", "tagline", "color_primary", "color_accent",
                    "color_accent2", "contact_email", "contact_phone",
                    "business_name", "contact_whatsapp", "contact_address",
                    "map_embed", "social_facebook", "social_instagram",
                    "social_telegram", "social_twitter", "timezone", "currency",
                    "analytics_id", "gsc_verification"):
            db.execute("UPDATE settings SET value=? WHERE key=?",
                       (request.form.get(key, "").strip(), key))
        db.execute("UPDATE settings SET value=? WHERE key='maintenance_mode'",
                   ("1" if request.form.get("maintenance_mode") == "on" else "0",))
        if logo:
            db.execute("UPDATE settings SET value=? WHERE key='logo'", (logo,))
        if favicon:
            db.execute("UPDATE settings SET value=? WHERE key='favicon'", (favicon,))
        if social:
            db.execute("UPDATE settings SET value=? WHERE key='social_preview'",
                       (social,))
        db.commit()
        log_activity("settings_update", "site settings")
        flash("Settings saved.", "success")
        return redirect(url_for("admin.settings"))

    s = {r["key"]: r["value"] for r in
         db.execute("SELECT key, value FROM settings").fetchall()}
    return render_template("admin/settings.html", s=s)


# ============================ CONTENT ============================

@bp.route("/content", methods=["GET", "POST"])
def content():
    db = get_db()
    if request.method == "POST":
        for key in ("banner_title", "banner_subtitle", "banner_cta", "about",
                    "contact", "footer", "terms", "privacy"):
            db.execute("UPDATE content SET value=? WHERE key=?",
                       (request.form.get(key, ""), key))
        db.commit()
        log_activity("content_update", "site content")
        flash("Content saved.", "success")
        return redirect(url_for("admin.content"))

    c = {r["key"]: r["value"] for r in
         db.execute("SELECT key, value FROM content").fetchall()}
    return render_template("admin/content.html", c=c)


# ============================ SEO ============================

@bp.route("/seo", methods=["GET"])
def seo():
    rows = get_db().execute("SELECT * FROM seo ORDER BY page").fetchall()
    return render_template("admin/seo.html", pages=rows)


@bp.route("/seo/save", methods=["POST"])
def save_seo():
    db = get_db()
    page = request.form.get("page", "").strip() or "home"
    fields = (request.form.get("title", "").strip(),
              request.form.get("description", "").strip(),
              request.form.get("keywords", "").strip(),
              request.form.get("canonical", "").strip(),
              request.form.get("robots", "").strip() or "index, follow",
              page)
    try:
        og_image = save_image(request.files.get("og_image_file"))
    except ValueError as e:
        flash(str(e), "danger")
        return redirect(url_for("admin.seo"))

    exists = db.execute("SELECT 1 FROM seo WHERE page=?", (page,)).fetchone()
    if exists:
        db.execute("UPDATE seo SET title=?, description=?, keywords=?, "
                   "canonical=?, robots=? WHERE page=?", fields)
    else:
        db.execute("INSERT INTO seo (title, description, keywords, canonical, "
                   "robots, page) VALUES (?, ?, ?, ?, ?, ?)", fields)
    if og_image:
        db.execute("UPDATE seo SET og_image=? WHERE page=?", (og_image, page))
    db.commit()
    log_activity("seo_update", page)
    flash(f"SEO for '{page}' saved.", "success")
    return redirect(url_for("admin.seo"))


# ============================ LOGIN LOGS ============================

@bp.route("/logs")
def logs():
    rows = get_db().execute(
        "SELECT * FROM login_logs ORDER BY id DESC LIMIT 200").fetchall()
    activity = get_db().execute(
        "SELECT * FROM activity_log ORDER BY id DESC LIMIT 200").fetchall()
    return render_template("admin/logs.html", logs=rows, activity=activity)
