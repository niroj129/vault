"""Public-facing site: homepage, game landing pages, search, business, sitemap."""

import json
from datetime import date, timedelta

from flask import (Blueprint, Response, abort, flash, redirect,
                   render_template, request, url_for)

from .db import get_db, now
from .security import current_user, log_activity, login_required
from .helpers import get_seo

bp = Blueprint("public", __name__)

# Single-segment paths that must never be treated as a game slug.
RESERVED = {
    "games", "game", "winners", "about", "contact", "business", "terms",
    "privacy", "dashboard", "login", "logout", "chat", "admin", "agent",
    "play", "robots.txt", "sitemap.xml", "static", "search", "account",
}


def _active_announcements(limit=8):
    return get_db().execute(
        "SELECT * FROM announcements WHERE active = 1 "
        "AND (publish_at IS NULL OR publish_at = '' OR publish_at <= ?) "
        "ORDER BY pinned DESC, created_at DESC LIMIT ?", (now(), limit)).fetchall()


def _profit_summary():
    db = get_db()
    today = date.today()

    def total(where="", args=()):
        return db.execute(
            f"SELECT COALESCE(SUM(amount),0) AS s FROM profits {where}", args
        ).fetchone()["s"]

    return {
        "today": total("WHERE profit_date = ?", (today.isoformat(),)),
        "week": total("WHERE profit_date >= ?",
                      ((today - timedelta(days=6)).isoformat(),)),
        "month": total("WHERE profit_date >= ?",
                       ((today - timedelta(days=29)).isoformat(),)),
        "total": total(),
    }


def _game_list(order, limit=8, where="g.status='active'", args=()):
    return get_db().execute(
        f"SELECT g.*, c.name AS category FROM games g "
        f"LEFT JOIN categories c ON c.id = g.category_id "
        f"WHERE {where} ORDER BY {order} LIMIT ?", (*args, limit)).fetchall()


@bp.route("/")
def home():
    db = get_db()
    categories = db.execute(
        "SELECT c.*, COUNT(g.id) AS game_count FROM categories c "
        "LEFT JOIN games g ON g.category_id = c.id AND g.status = 'active' "
        "GROUP BY c.id ORDER BY c.sort_order, c.name").fetchall()
    winner = db.execute(
        "SELECT * FROM winners ORDER BY win_date DESC, id DESC LIMIT 1").fetchone()
    agents = db.execute(
        "SELECT username, full_name FROM users WHERE role='agent' AND is_active=1 "
        "ORDER BY username LIMIT 8").fetchall()
    active_games = db.execute(
        "SELECT COUNT(*) AS c FROM games WHERE status='active'").fetchone()["c"]

    return render_template(
        "home.html",
        featured=_game_list("g.sort_order, g.name", 8, "g.status='active' AND g.featured=1"),
        new_games=_game_list("g.created_at DESC, g.id DESC", 8, "g.status='active' AND g.is_new=1"),
        popular=_game_list("g.clicks DESC, g.views DESC", 8),
        games=_game_list("g.sort_order, g.name", 12),
        categories=categories, winner=winner, agents=agents,
        profit=_profit_summary(), announcements=_active_announcements(),
        stats={"active": active_games}, seo=get_seo("home"))


@bp.route("/games")
def games():
    db = get_db()
    q = request.args.get("q", "").strip()
    cat = request.args.get("category", "").strip()

    sql = ("SELECT g.*, c.name AS category, c.slug AS cat_slug FROM games g "
           "LEFT JOIN categories c ON c.id = g.category_id "
           "WHERE g.status = 'active'")
    args = []
    if q:
        sql += " AND (g.name LIKE ? OR g.description LIKE ? OR c.name LIKE ?)"
        args += [f"%{q}%", f"%{q}%", f"%{q}%"]
    if cat:
        sql += " AND c.slug = ?"
        args.append(cat)
    sql += " ORDER BY g.featured DESC, g.sort_order, g.name"

    game_rows = db.execute(sql, args).fetchall()
    categories = db.execute(
        "SELECT * FROM categories ORDER BY sort_order, name").fetchall()
    return render_template("games.html", games=game_rows, categories=categories,
                           q=q, active_cat=cat, seo=get_seo("games"))


@bp.route("/search")
def search():
    """Global search across games, categories, FAQs and announcements."""
    db = get_db()
    q = request.args.get("q", "").strip()
    like = f"%{q}%"
    games_found = cats_found = anns = faqs = []
    if q:
        games_found = db.execute(
            "SELECT g.*, c.name AS category FROM games g "
            "LEFT JOIN categories c ON c.id=g.category_id "
            "WHERE g.status='active' AND (g.name LIKE ? OR g.description LIKE ?) "
            "ORDER BY g.name", (like, like)).fetchall()
        cats_found = db.execute(
            "SELECT * FROM categories WHERE name LIKE ?", (like,)).fetchall()
        anns = db.execute(
            "SELECT * FROM announcements WHERE active=1 AND (title LIKE ? OR body LIKE ?)",
            (like, like)).fetchall()
        faqs = db.execute(
            "SELECT name, slug, faqs FROM games WHERE status='active' AND faqs LIKE ?",
            (like,)).fetchall()
    return render_template("search.html", q=q, games=games_found,
                           categories=cats_found, announcements=anns, faqs=faqs)


def _render_game(game):
    db = get_db()
    db.execute("UPDATE games SET views = views + 1 WHERE id = ?", (game["id"],))
    db.commit()
    try:
        faqs = json.loads(game["faqs"]) if game["faqs"] else []
    except (ValueError, TypeError):
        faqs = []
    try:
        shots = json.loads(game["screenshots"]) if game["screenshots"] else []
    except (ValueError, TypeError):
        shots = []
    features = [f for f in (game["features"] or "").splitlines() if f.strip()]
    related = db.execute(
        "SELECT * FROM games WHERE category_id = ? AND id != ? AND status='active' "
        "ORDER BY RANDOM() LIMIT 4", (game["category_id"], game["id"])).fetchall()
    agents = db.execute(
        "SELECT username, full_name FROM users WHERE role='agent' AND is_active=1 "
        "LIMIT 6").fetchall()
    seo = {
        "title": game["meta_title"] or f"{game['name']} — Play Online",
        "description": game["meta_description"] or game["description"][:155],
        "keywords": game["meta_keywords"],
        "canonical": url_for("public.game_landing", slug=game["slug"], _external=True),
        "og_image": game["banner"] or game["image"] or game["logo"],
        "robots": "index, follow",
    }
    return render_template("game_detail.html", game=game, faqs=faqs,
                           screenshots=shots, features=features, related=related,
                           agents=agents, seo=seo)


@bp.route("/game/<slug>")
def game_detail(slug):
    return redirect(url_for("public.game_landing", slug=slug), code=301)


@bp.route("/play/<int:game_id>")
@login_required
def play(game_id):
    """Redirect to a game's user link (login required)."""
    db = get_db()
    game = db.execute(
        "SELECT * FROM games WHERE id = ? AND status = 'active'", (game_id,)
    ).fetchone()
    target = game and (game["user_link"] or game["play_url"])
    if not target:
        abort(404)
    db.execute("UPDATE games SET clicks = clicks + 1 WHERE id = ?", (game_id,))
    db.commit()
    return redirect(target)


@bp.route("/winners")
def winners():
    rows = get_db().execute(
        "SELECT * FROM winners ORDER BY win_date DESC, id DESC LIMIT 100"
    ).fetchall()
    return render_template("winners.html", winners=rows, seo=get_seo("winners"))


@bp.route("/dashboard")
@login_required
def dashboard():
    user = current_user()
    if user["role"] == "agent":
        return redirect(url_for("agent.dashboard"))
    db = get_db()
    games = db.execute(
        "SELECT g.*, c.name AS category FROM games g "
        "LEFT JOIN categories c ON c.id = g.category_id "
        "WHERE g.status='active' ORDER BY g.featured DESC, g.name").fetchall()
    winner = db.execute(
        "SELECT * FROM winners ORDER BY win_date DESC, id DESC LIMIT 1").fetchone()
    return render_template("user_dashboard.html", games=games, winner=winner,
                           announcements=_active_announcements())


# -------- content-managed info pages --------

@bp.route("/about")
def about():
    return render_template("page.html", title="About Us", body_key="about")


@bp.route("/terms")
def terms():
    return render_template("page.html", title="Terms & Conditions",
                           body_key="terms")


@bp.route("/privacy")
def privacy():
    return render_template("page.html", title="Privacy Policy",
                           body_key="privacy")


@bp.route("/contact", methods=["GET", "POST"])
@bp.route("/business", methods=["GET", "POST"])
def business():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        msg = request.form.get("message", "").strip()
        if name and msg:
            log_activity("contact_form",
                         f"{name} <{request.form.get('email','')}>: {msg[:200]}")
            flash("Thanks! Your message has been received — we'll be in touch.",
                  "success")
        else:
            flash("Please provide your name and a message.", "danger")
        return redirect(url_for("public.business"))
    return render_template("business.html", seo=get_seo("business"))


# -------- SEO endpoints --------

@bp.route("/robots.txt")
def robots():
    lines = ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /agent",
             f"Sitemap: {url_for('public.sitemap', _external=True)}"]
    return Response("\n".join(lines), mimetype="text/plain")


@bp.route("/sitemap.xml")
def sitemap():
    db = get_db()
    urls = [url_for("public.home", _external=True),
            url_for("public.games", _external=True),
            url_for("public.winners", _external=True),
            url_for("public.about", _external=True),
            url_for("public.business", _external=True),
            url_for("public.terms", _external=True),
            url_for("public.privacy", _external=True)]
    for g in db.execute("SELECT slug FROM games WHERE status='active'").fetchall():
        urls.append(url_for("public.game_landing", slug=g["slug"], _external=True))

    body = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        body.append(f"  <url><loc>{u}</loc></url>")
    body.append("</urlset>")
    return Response("\n".join(body), mimetype="application/xml")


# -------- clean SEO game URLs: /<slug> (registered last) --------

@bp.route("/<slug>")
def game_landing(slug):
    if slug in RESERVED:
        abort(404)
    game = get_db().execute(
        "SELECT g.*, c.name AS category, c.slug AS cat_slug FROM games g "
        "LEFT JOIN categories c ON c.id = g.category_id "
        "WHERE g.slug = ? AND g.status = 'active'", (slug,)).fetchone()
    if not game:
        abort(404)
    return _render_game(game)
