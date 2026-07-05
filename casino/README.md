# 🎰 Team Tiffany Gaming Casino

A modern, responsive, **SEO-first** social-casino / sweepstakes gaming portal with
a premium dark/gold theme, secure authentication, an admin dashboard, and an agent
portal. Every supported game has its own optimized landing page at a clean URL
(e.g. `/juwa`, `/game-vault`, `/orion-stars`).

Built with **Flask (Python) + SQLite + Jinja templates**. Zero build step, no Node
required — a single `pip install` and it runs. (Chart.js and Font Awesome load from
CDN in the browser.)

> Chosen stack note: the brief allowed Node/Express or Django. This machine has no
> Node and an existing Flask/SQLite foundation, so Flask was used — it satisfies the
> same requirements (server-rendered SEO, sessions, RBAC) with no toolchain.

---

## ✨ Features

| Area | What's included |
|------|-----------------|
| **Auth** | Username/password login, **Remember Me**, logout, **3 roles (Admin / Agent / Staff)**, **no public sign-up** — admins create accounts. Passwords hashed (Werkzeug). Chat and game links require login. |
| **SEO landing pages** | Each game has a clean URL (`/juwa`, `/game-vault`, `/orion-stars`, `/milky-way`, `/panda-master`, `/cash-machine`, `/fire-kirin`, `/ultra-panda`, `/vegas-sweeps`, `/vpower`, `/river-sweeps` … + any you add). Per-game meta title/description/keywords, **breadcrumb + FAQ + VideoGame JSON-LD schema**, overview, features, screenshots, FAQs, user link, agent link, related games, Contact Agent. Seeded with real SEO content out of the box. |
| **Agent Portal** | Agents get their own dashboard: copy & share user/agent game links, view player list, read announcements, chat, edit profile & password. |
| **Homepage** | Branding, daily winner, profit stats, **Featured / New / Popular** games, categories, **Agent Directory**, latest announcements/promotions, business-contact band, live game status dots, banner, global search, chat shortcut. |
| **Games** | Add/edit/delete, enable/disable, category, **card image + logo + banner + multiple screenshots**, description, **features**, **FAQs**, download info, generic/user/agent links, per-game **SEO fields**, Featured, New, sort order, play-click + view tracking. |
| **Categories** | Unlimited categories with Font Awesome icons and sort order. |
| **Daily Winners** | Add winner (name, amount, game, optional photo, date). Latest shown on homepage; full **Winner History** page. |
| **Daily Profit** | Enter/edit per-date profit + notes (upsert), auto Today/Week/Month/Total, **Chart.js** trend graphs. |
| **Chat** | Real-time-ish (short polling) community chat: online users, message history, **emoji picker**, **image sharing**, conversation search, XSS-safe rendering. |
| **Admin Dashboard** | Stat widgets, 14-day profit chart, recent activity, and full CRUD sections. |
| **User Dashboard** | Games, winner, announcements, and self-service password change. |
| **Announcements** | Create, **pin**, **schedule** (publish-at), show/hide, delete. |
| **Search** | Global search across games, categories, FAQs and announcements (`/search`) + category filters on `/games`. |
| **Business Contact** | Dedicated `/business` (also `/contact`) page: business name, phone, email, WhatsApp, Telegram/Facebook/Instagram, address, embedded map, and a contact form (submissions logged in activity). Contact details shown site-wide. |
| **SEO** | Per-page meta title/description/keywords/canonical/robots, Open Graph + Twitter cards, JSON-LD structured data, `/robots.txt`, `/sitemap.xml`, Google Analytics ID, Search Console verification, favicon, social preview image. |
| **Content** | Edit homepage banner, About, Contact, Footer, Terms, Privacy — no code. |
| **Settings** | Site name, logo, **theme colors**, contact, socials, timezone, currency, **maintenance mode**. |
| **Reports** | Daily profit, winners, user activity, **agent activity**, chat activity, game usage — **CSV export** + print-to-PDF pages. |
| **Security** | Password hashing, RBAC, secure sessions (HttpOnly/SameSite), **CSRF tokens**, XSS protection (Jinja autoescape + escaped chat), **parameterized SQL**, login activity logs, security headers (CSP, X-Frame-Options, nosniff). |
| **Design** | Dark mode, gold accents, modern cards, animations, responsive/mobile-first, dashboard widgets, Font Awesome icons, Google Fonts. |

---

## 🚀 Quick start

```bash
cd casino
python3 -m pip install -r requirements.txt
python3 run.py
```

Open **http://127.0.0.1:8000**

**Default admin login** (created automatically on first run):

```
username: admin
password: admin123
```

> ⚠️ Change this immediately in **Admin → Users**, or set `ADMIN_USERNAME` /
> `ADMIN_PASSWORD` env vars *before* the first run.

The database (`casino.db`), tables, default settings/content/SEO, starter
categories, the admin user, **and the 11 supported game landing pages** are all
created automatically on first run.

### Roles

| Role | Lands on | Can do |
|------|----------|--------|
| **Admin** | `/admin` | Everything: users, agents, games, categories, winners, profit, announcements, SEO, content, settings, reports, chat. |
| **Agent** | `/agent` | Share user/agent game links, view players, announcements, chat, edit own profile. |
| **Staff / User** | `/dashboard` | Browse games, use game links, view winner/announcements, chat, change password. |

Create Agents and Staff in **Admin → Users** (pick the role in the form).

---

## ⚙️ Configuration (environment variables)

| Var | Default | Purpose |
|-----|---------|---------|
| `SECRET_KEY` | dev value | **Set a strong random value in production.** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | Bootstrap admin (first run only). |
| `DB_PATH` | `casino/casino.db` | SQLite file location. |
| `COOKIE_SECURE` | `0` | Set `1` when serving over HTTPS. |
| `PORT` | `8000` | Dev server port. |
| `DEBUG` | `0` | Set `1` for Flask debug mode (dev only). |

---

## 🌐 Production deployment

Install a WSGI server and run the app factory via `run:app`:

```bash
pip install gunicorn
SECRET_KEY="$(python3 -c 'import secrets;print(secrets.token_hex(32))')" \
COOKIE_SECURE=1 \
gunicorn -w 4 -b 0.0.0.0:8000 "run:app"
```

Then put **nginx** in front for TLS + static caching:

```nginx
server {
    listen 443 ssl;
    server_name teamtiffany.example;
    # ssl_certificate ...; ssl_certificate_key ...;

    location /static/ { alias /path/to/casino/app/static/; expires 30d; }
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**PostgreSQL / MySQL:** the app uses a thin SQLite layer (`app/db.py`) with fully
parameterized queries. To move to Postgres/MySQL, swap the connection in
`get_db()`/`init_db()` for `psycopg2`/`mysqlclient` and adjust the few
SQLite-specific bits (`AUTOINCREMENT`, `ON CONFLICT` upsert in profit save). The
schema and all queries otherwise port directly.

**Performance:** server-rendered pages (fast first paint), lazy-loaded game images
(`loading="lazy"`), CDN assets, static caching via nginx, and indexed primary keys.

---

## 📁 Project structure

```
casino/
├── run.py                 # entry point (exposes `app` for gunicorn)
├── config.py              # env-driven configuration
├── requirements.txt
└── app/
    ├── __init__.py        # app factory: lifecycle, security headers, context, errors
    ├── db.py              # SQLite schema, seed, connection
    ├── security.py        # CSRF, RBAC decorators, activity log, current_user
    ├── helpers.py         # image upload + SEO lookup
    ├── auth.py            # login / logout / change password
    ├── public.py          # homepage, games, /<slug> SEO landing, search, business, sitemap
    ├── admin.py           # dashboard + all management CRUD
    ├── agent.py           # agent portal (dashboard, links, players, profile)
    ├── chat.py            # polling chat API
    ├── reports.py         # report views + CSV export
    ├── templates/         # Jinja templates (public + admin/)
    └── static/            # css/, js/, uploads/
```

---

## 🔒 Security notes

- All state-changing requests require a CSRF token (form field or `X-CSRF-Token`).
- Passwords are hashed with `werkzeug.security` (PBKDF2). Plain passwords are never stored.
- Every SQL query is parameterized — no string interpolation of user input.
- Chat messages are HTML-escaped on render; Jinja autoescapes everywhere else.
- Sessions are HttpOnly + SameSite=Lax; set `COOKIE_SECURE=1` behind HTTPS.
- Login attempts (success & failure, IP, user-agent) are logged in **Admin → Activity Logs**.

---

## 🧪 What to try after logging in

1. **Admin → Games** → add a game with an image and mark it Featured.
2. **Admin → Daily Winners** → add today's winner; see it on the homepage.
3. **Admin → Daily Profit** → record a few days; watch the chart update.
4. **Admin → Announcements** → pin one; it appears on the homepage.
5. **Admin → Settings** → change theme colors / toggle maintenance mode.
6. **Chat** → open in two browsers to see live messages + online users.
7. **Admin → Reports** → export any report as CSV.
```
