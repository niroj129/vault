"""SQLite access layer: connection handling, schema, and first-run seed data.

Every query in the app is parameterised (no string interpolation of user input)
which is our SQL-injection protection.
"""

import json
import os
import sqlite3
from datetime import datetime

from flask import current_app, g
from werkzeug.security import generate_password_hash

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'staff',   -- 'admin' | 'staff'
    is_active     INTEGER NOT NULL DEFAULT 1,
    last_login    TEXT,
    last_seen     TEXT,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    username   TEXT NOT NULL,
    ip         TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    success    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    username   TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE NOT NULL,
    slug       TEXT UNIQUE NOT NULL,
    icon       TEXT NOT NULL DEFAULT 'fa-dice',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    category_id INTEGER,
    description TEXT NOT NULL DEFAULT '',
    image       TEXT NOT NULL DEFAULT '',      -- card thumbnail
    logo        TEXT NOT NULL DEFAULT '',
    banner      TEXT NOT NULL DEFAULT '',
    screenshots TEXT NOT NULL DEFAULT '',      -- JSON list of static paths
    features    TEXT NOT NULL DEFAULT '',      -- newline separated
    faqs        TEXT NOT NULL DEFAULT '',      -- JSON list of {q,a}
    download_info TEXT NOT NULL DEFAULT '',
    play_url    TEXT NOT NULL DEFAULT '',      -- generic external link
    user_link   TEXT NOT NULL DEFAULT '',      -- player access link
    agent_link  TEXT NOT NULL DEFAULT '',      -- agent access link
    meta_title       TEXT NOT NULL DEFAULT '',
    meta_description TEXT NOT NULL DEFAULT '',
    meta_keywords    TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'inactive'
    featured    INTEGER NOT NULL DEFAULT 0,
    is_new      INTEGER NOT NULL DEFAULT 0,
    clicks      INTEGER NOT NULL DEFAULT 0,
    views       INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS winners (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    amount     REAL NOT NULL DEFAULT 0,
    game       TEXT NOT NULL DEFAULT '',
    photo      TEXT NOT NULL DEFAULT '',
    win_date   TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    amount      REAL NOT NULL DEFAULT 0,
    profit_date TEXT UNIQUE NOT NULL,
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    pinned     INTEGER NOT NULL DEFAULT 0,
    active     INTEGER NOT NULL DEFAULT 1,
    publish_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    username   TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    image      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS content (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS seo (
    page        TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    keywords    TEXT NOT NULL DEFAULT '',
    canonical   TEXT NOT NULL DEFAULT '',
    og_image    TEXT NOT NULL DEFAULT '',
    robots      TEXT NOT NULL DEFAULT 'index, follow'
);
"""

DEFAULT_SETTINGS = {
    "site_name": "Team Tiffany Gaming Casino",
    "tagline": "Play Premium. Win Big.",
    "logo": "",
    "favicon": "",
    "color_primary": "#0d0d12",
    "color_accent": "#e9c46a",
    "color_accent2": "#f4a261",
    "contact_email": "support@teamtiffany.gg",
    "contact_phone": "+1 (555) 013-8888",
    "business_name": "Team Tiffany Gaming",
    "contact_whatsapp": "",
    "contact_address": "Online — available worldwide",
    "map_embed": "",
    "social_facebook": "",
    "social_instagram": "",
    "social_telegram": "",
    "social_twitter": "",
    "timezone": "UTC",
    "currency": "$",
    "maintenance_mode": "0",
    "analytics_id": "",
    "gsc_verification": "",
    "social_preview": "",
}

DEFAULT_CONTENT = {
    "banner_title": "Welcome to Team Tiffany Gaming Casino",
    "banner_subtitle": "The premium destination for slots, live casino, and crash games.",
    "banner_cta": "Explore Games",
    "about": "Team Tiffany Gaming Casino brings you a curated collection of the "
             "world's most exciting games. Fast, secure, and always rewarding.",
    "contact": "Reach our 24/7 support team anytime through live chat or email.",
    "footer": "Team Tiffany Gaming Casino — Play responsibly. 18+ only.",
    "terms": "By using this platform you agree to play responsibly and abide by "
             "all applicable local laws. All games are for entertainment.",
    "privacy": "We respect your privacy. Account data is stored securely and never "
               "sold to third parties.",
}

DEFAULT_SEO = {
    "home": ("Team Tiffany Gaming Casino — Premium Online Games",
             "Play top slots, live casino, baccarat, poker and crash games at "
             "Team Tiffany Gaming Casino. Daily winners and daily profit tracking.",
             "casino, online games, slots, live casino, baccarat, crash games"),
    "games": ("All Games — Team Tiffany Gaming Casino",
              "Browse every game available at Team Tiffany Gaming Casino.",
              "games, slots, casino games"),
    "winners": ("Daily Winners — Team Tiffany Gaming Casino",
                "See the latest big winners at Team Tiffany Gaming Casino.",
                "winners, jackpot, daily winner"),
}


# SEO landing content for the supported social-casino / sweepstakes games.
# (name, category_slug, description, [features], [(q, a) faqs])
NAMED_GAMES = [
    ("Juwa", "fishing-games",
     "Juwa is a popular social-casino and fish-shooting arcade app packed with "
     "slots, fish tables, and keno. Get the Juwa download link, learn how to play, "
     "and contact a verified agent to load your account.",
     ["100+ slot and fish games", "Daily bonuses and jackpots",
      "Available on Android and iOS", "24/7 agent support"],
     [("How do I download Juwa?",
       "Use the official user link on this page to download the Juwa app for "
       "Android or iOS, then contact an agent to create your account."),
      ("How do I add credits to Juwa?",
       "Message a verified agent using the Contact Agent button and they will "
       "load your balance instantly.")]),
    ("Game Vault", "slots",
     "Game Vault (Game Vault 999) is a leading online sweepstakes platform with "
     "slots, fish games, and arcade titles. Find the Game Vault login link and "
     "connect with an agent.",
     ["Huge slots library", "Fish and arcade games", "Instant play in browser",
      "Frequent promotions"],
     [("What is Game Vault?",
       "Game Vault is a social sweepstakes app offering slots and fish games you "
       "can play for entertainment."),
      ("How do I recharge Game Vault?",
       "Tap Contact Agent to reach an authorized agent for a top-up.")]),
    ("Orion Stars", "fishing-games",
     "Orion Stars brings arcade fish shooting and reel slots to your phone. "
     "Download Orion Stars and find a trusted agent here.",
     ["Fish shooting arcade", "Classic and video slots", "Multiplayer tables"],
     [("Is Orion Stars free to download?",
       "Yes, the app is free to download; contact an agent to start playing.")]),
    ("Milky Way", "slots",
     "Milky Way is a sweepstakes gaming app featuring slots, keno, and fish "
     "games with a sleek space theme.",
     ["Space-themed slots", "Keno and fish games", "Daily rewards"],
     [("How do I play Milky Way?",
       "Download via the user link, then contact an agent to fund your account.")]),
    ("Panda Master", "slots",
     "Panda Master is a fun sweepstakes casino app with vibrant slots and fish "
     "tables. Get the Panda Master login and agent details.",
     ["Colorful slot machines", "Fish tables", "Mobile friendly"],
     [("How do I get Panda Master credits?",
       "Use the Contact Agent button to reach a verified agent.")]),
    ("Cash Machine", "slots",
     "Cash Machine 777 delivers classic Vegas-style slot action in a social "
     "sweepstakes format.",
     ["Classic 777 slots", "Big jackpots", "Simple gameplay"],
     [("What is Cash Machine 777?",
       "A social casino slots app you can enjoy for entertainment.")]),
    ("Fire Kirin", "fishing-games",
     "Fire Kirin is one of the most popular fish-shooting arcade and slots apps. "
     "Find the Fire Kirin download and agent links.",
     ["Fish shooting games", "Slots and arcade", "Online play available"],
     [("How do I download Fire Kirin?",
       "Use the official user link above, then contact an agent.")]),
    ("Ultra Panda", "slots",
     "Ultra Panda (Ultra Panda 777) offers a rich mix of slots and fish games in "
     "a social sweepstakes app.",
     ["Slots and fish games", "Frequent bonuses", "Cross-platform"],
     [("How do I recharge Ultra Panda?",
       "Contact an authorized agent using the button on this page.")]),
    ("Vegas Sweeps", "slots",
     "Vegas Sweeps brings the Las Vegas casino floor online with premium slots "
     "and sweepstakes games.",
     ["Premium Vegas slots", "Sweepstakes format", "Play in browser"],
     [("What is Vegas Sweeps?",
       "An online sweepstakes casino with Vegas-style games.")]),
    ("VPower", "fishing-games",
     "VPower (VPower 777) is a feature-rich fish game and slots platform popular "
     "with social casino players.",
     ["Fish games", "Slots collection", "Agent supported"],
     [("How do I join VPower?",
       "Download via the user link and contact an agent to begin.")]),
    ("River Sweeps", "slots",
     "River Sweeps (River Monster) is a well-known sweepstakes gaming platform "
     "featuring slots, fish, and arcade games.",
     ["Slots, fish and arcade", "Sweepstakes gameplay", "Mobile and desktop"],
     [("How do I play River Sweeps?",
       "Use the user link to access the platform, then contact an agent.")]),
]

# Columns added after the initial release — applied to existing databases.
GAME_MIGRATION_COLUMNS = {
    "logo": "TEXT NOT NULL DEFAULT ''",
    "banner": "TEXT NOT NULL DEFAULT ''",
    "screenshots": "TEXT NOT NULL DEFAULT ''",
    "features": "TEXT NOT NULL DEFAULT ''",
    "faqs": "TEXT NOT NULL DEFAULT ''",
    "download_info": "TEXT NOT NULL DEFAULT ''",
    "user_link": "TEXT NOT NULL DEFAULT ''",
    "agent_link": "TEXT NOT NULL DEFAULT ''",
    "meta_title": "TEXT NOT NULL DEFAULT ''",
    "meta_description": "TEXT NOT NULL DEFAULT ''",
    "meta_keywords": "TEXT NOT NULL DEFAULT ''",
    "is_new": "INTEGER NOT NULL DEFAULT 0",
    "views": "INTEGER NOT NULL DEFAULT 0",
}


def _migrate_games(db):
    cols = {r["name"] for r in db.execute("PRAGMA table_info(games)").fetchall()}
    for col, decl in GAME_MIGRATION_COLUMNS.items():
        if col not in cols:
            db.execute(f"ALTER TABLE games ADD COLUMN {col} {decl}")


def _seed_named_games(db, ts):
    cat = {r["slug"]: r["id"] for r in
           db.execute("SELECT id, slug FROM categories").fetchall()}
    for i, (name, cat_slug, desc, features, faqs) in enumerate(NAMED_GAMES):
        slug = slugify(name)
        if db.execute("SELECT 1 FROM games WHERE slug=?", (slug,)).fetchone():
            continue
        db.execute(
            "INSERT INTO games (name, slug, category_id, description, features, "
            "faqs, status, featured, is_new, sort_order, meta_title, "
            "meta_description, meta_keywords, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)",
            (name, slug, cat.get(cat_slug), desc, "\n".join(features),
             json.dumps([{"q": q, "a": a} for q, a in faqs]),
             1 if i < 4 else 0, 1 if i >= 7 else 0, i,
             f"{name} Download & Login — Play {name} Online",
             desc[:155],
             f"{name}, {name} download, {name} login, {name} agent, sweepstakes, "
             f"fish games, slots",
             ts))


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DB_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now():
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def slugify(text):
    keep = "".join(c if c.isalnum() or c in " -" else "" for c in text.lower())
    return "-".join(keep.split()) or "item"


def init_db(app):
    """Create tables (if missing) and seed defaults / bootstrap admin."""
    os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)
    db = sqlite3.connect(app.config["DB_PATH"])
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    _migrate_games(db)

    ts = now()

    # settings / content / seo defaults
    for key, value in DEFAULT_SETTINGS.items():
        db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                   (key, value))
    for key, value in DEFAULT_CONTENT.items():
        db.execute("INSERT OR IGNORE INTO content (key, value) VALUES (?, ?)",
                   (key, value))
    for page, (title, desc, kw) in DEFAULT_SEO.items():
        db.execute(
            "INSERT OR IGNORE INTO seo (page, title, description, keywords) "
            "VALUES (?, ?, ?, ?)", (page, title, desc, kw))

    # bootstrap admin
    if not db.execute("SELECT 1 FROM users LIMIT 1").fetchone():
        db.execute(
            "INSERT INTO users (username, password_hash, full_name, role, "
            "is_active, created_at) VALUES (?, ?, ?, 'admin', 1, ?)",
            (app.config["ADMIN_USERNAME"],
             generate_password_hash(app.config["ADMIN_PASSWORD"]),
             "Site Administrator", ts))

    # starter categories
    if not db.execute("SELECT 1 FROM categories LIMIT 1").fetchone():
        starters = [
            ("Slots", "fa-coins"), ("Live Casino", "fa-video"),
            ("Baccarat", "fa-clover"), ("Poker", "fa-diamond"),
            ("Roulette", "fa-circle-notch"), ("Fishing Games", "fa-fish"),
            ("Sports Betting", "fa-futbol"), ("Crash Games", "fa-rocket"),
        ]
        for i, (name, icon) in enumerate(starters):
            db.execute(
                "INSERT INTO categories (name, slug, icon, sort_order, created_at) "
                "VALUES (?, ?, ?, ?, ?)", (name, slugify(name), icon, i, ts))
        db.commit()

    # seed the supported named games (once)
    _seed_named_games(db, ts)

    db.commit()
    db.close()
