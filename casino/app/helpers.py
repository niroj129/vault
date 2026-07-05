"""Shared helpers: image uploads and per-page SEO lookup."""

import os
import secrets

from flask import current_app
from werkzeug.utils import secure_filename

from .db import get_db


def save_image(file_storage):
    """Validate and store an uploaded image, returning its static-relative path.

    Returns "" when no file was provided. Raises ValueError on a bad type.
    """
    if not file_storage or not file_storage.filename:
        return ""
    name = secure_filename(file_storage.filename)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in current_app.config["ALLOWED_IMAGE_EXT"]:
        raise ValueError("Unsupported image type.")
    unique = f"{secrets.token_hex(8)}.{ext}"
    file_storage.save(os.path.join(current_app.config["UPLOAD_DIR"], unique))
    return f"uploads/{unique}"


def save_images(file_list):
    """Save multiple uploaded images (e.g. screenshots); return list of paths."""
    paths = []
    for fs in file_list or []:
        p = save_image(fs)
        if p:
            paths.append(p)
    return paths


def get_seo(page):
    """Return the SEO row for a page, or None (template falls back to defaults)."""
    return get_db().execute("SELECT * FROM seo WHERE page = ?", (page,)).fetchone()
