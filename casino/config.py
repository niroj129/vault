"""Configuration for Team Tiffany Gaming Casino.

All values can be overridden with environment variables so the same code runs
locally and in production without edits.
"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    # --- core ---
    SECRET_KEY = os.environ.get("SECRET_KEY", "tiffany-dev-secret-change-me")
    DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "casino.db"))

    # --- uploads ---
    UPLOAD_DIR = os.path.join(BASE_DIR, "app", "static", "uploads")
    ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024  # 8 MB per request

    # --- sessions / security ---
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    # Set to True automatically when served over HTTPS (see create_app).
    SESSION_COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "0") == "1"
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 24 * 30  # 30 days ("remember me")

    # --- bootstrap admin (created once if no users exist) ---
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

    # window (seconds) within which a user counts as "online"
    ONLINE_WINDOW = 60
