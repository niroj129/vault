"""Application factory for Team Tiffany Gaming Casino."""

import os
from datetime import timedelta

from flask import Flask, g, render_template, request

from config import Config
from . import db as database
from .security import (csrf_token, current_user, verify_csrf, touch_last_seen)


def _load_kv(table):
    rows = database.get_db().execute(f"SELECT key, value FROM {table}").fetchall()
    return {r["key"]: r["value"] for r in rows}


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)
    app.permanent_session_lifetime = timedelta(
        seconds=app.config["PERMANENT_SESSION_LIFETIME"])

    database.init_db(app)
    app.teardown_appcontext(database.close_db)

    # ---- blueprints ----
    from .auth import bp as auth_bp
    from .public import bp as public_bp
    from .admin import bp as admin_bp
    from .agent import bp as agent_bp
    from .chat import bp as chat_bp
    from .reports import bp as reports_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp, url_prefix="/admin")
    app.register_blueprint(agent_bp, url_prefix="/agent")
    app.register_blueprint(chat_bp, url_prefix="/chat")
    app.register_blueprint(reports_bp, url_prefix="/admin/reports")
    app.register_blueprint(public_bp)  # last: owns catch-all /<slug>

    # ---- request lifecycle ----
    @app.before_request
    def _before():
        verify_csrf()
        touch_last_seen()
        # Maintenance mode: block everyone except admins & auth/static routes.
        settings = _load_kv("settings")
        if settings.get("maintenance_mode") == "1":
            user = current_user()
            open_paths = ("/login", "/logout", "/static", "/admin")
            if (not (user and user["role"] == "admin")
                    and not request.path.startswith(open_paths)):
                return render_template("maintenance.html", s=settings), 503

    @app.after_request
    def _security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com "
            "https://cdnjs.cloudflare.com; "
            "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net "
            "https://www.googletagmanager.com; "
            "connect-src 'self' https://www.google-analytics.com; "
            "frame-ancestors 'self'")
        return resp

    # ---- template globals ----
    @app.context_processor
    def _inject():
        settings = _load_kv("settings")
        content = _load_kv("content")
        return dict(
            settings=settings,
            content=content,
            csrf_token=csrf_token,
            current_user=current_user(),
            currency=settings.get("currency", "$"),
        )

    @app.template_filter("money")
    def _money(value):
        try:
            return f"{float(value):,.2f}"
        except (TypeError, ValueError):
            return "0.00"

    # ---- error handlers ----
    @app.errorhandler(400)
    def _400(e):
        return render_template("error.html", code=400,
                               msg=getattr(e, "description", "Bad request")), 400

    @app.errorhandler(403)
    def _403(e):
        return render_template("error.html", code=403,
                               msg="You don't have access to that page."), 403

    @app.errorhandler(404)
    def _404(e):
        return render_template("error.html", code=404,
                               msg="Page not found."), 404

    @app.errorhandler(413)
    def _413(e):
        return render_template("error.html", code=413,
                               msg="Upload too large (max 8 MB)."), 413

    return app
