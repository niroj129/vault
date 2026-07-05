# 🎰 Tiffany Gaming — Next.js + Django REST Framework

An **SEO-first** sweepstakes / social-casino portal for **Tiffany Gaming**
*("Keep playing, keep winning — your journey to success starts with each bet.")*

- **Frontend:** Next.js 15 (App Router, SSR/SSG + ISR) → `frontend/`
- **Backend:** Django + Django REST Framework (knox token auth) → `backend/`
- **DB:** SQLite (dev) — swap `DATABASES` for Postgres/MySQL in prod
- Every game has its own SEO landing page at a clean URL (`/juwa`, `/game-vault`, …)

> A previous Flask version lives in `casino/`. This Next.js + DRF stack is the
> current build and supersedes it.

---

## 🚀 Run it (two terminals)

Node and Python deps are already installed in this workspace. From `vault-alert/`:

**1) Backend — Django API (port 8000)**
```bash
cd backend
python3 manage.py migrate          # first time only
python3 manage.py seed             # first time only — branding + 11 games + images
python3 manage.py runserver 8000
```

**2) Frontend — Next.js (port 3000)**
```bash
cd frontend
npm install                        # first time only
npm run dev                        # or: npm run build && npm start
```

Open **http://localhost:3000**

| Account | Username | Password | Lands on |
|---------|----------|----------|----------|
| Admin | `admin` | `admin123` | `/admin` |
| Player | `user` | `user123` | `/dashboard` |

Full management console (games/images/categories/SEO): **http://127.0.0.1:8000/django-admin/**

---

## 🛠 Admin console (`/admin`)

A full sidebar management console (separate from the public chrome), role-guarded:

| Section | What you can do |
|---------|-----------------|
| **Dashboard** | Widgets: players, active games, today's profit, monthly/total profit, **cashout today**, **low-point games**, **unread chats**, 14-day profit chart, **today's winner**. |
| **Games & Links** | Full CRUD with image uploads (card/logo/banner), **User Game Link + Agent Game Link**, SEO fields, and **Sub-Dist / Vendor points**. |
| **Daily Winners** | Add/edit winners (+ optional photo); newest shows on the homepage & dashboard. |
| **Points & Telegram** | Vendor / sub-distributor **points report** with low-balance flags, inline edit, per-game **"send Telegram load alert"**, and Telegram bot setup (token, chat id, threshold, load amount). Ported from the original points tracker. |
| **Payments & Cashout** | Payment-methods CRUD, **cashout log** with **today's cashout total**, and daily-profit records. |
| **Chat** | Admin inbox of players + reply pane (unread badges). |
| **Players** | Create/edit/disable accounts & roles (no public sign-up). |
| **Announcements** | Create/pin/hide. **SEO** | Per-page meta + sitemap/robots info. **Settings** | Site branding/colors/analytics + full business info. |

Contact-Agent buttons across the site open **direct chat** with support.

## ✨ Player & engagement features

| Feature | Where |
|---------|-------|
| **Game ratings & reviews** | Game page — 5-star submit + list; averages feed an `AggregateRating` schema for SEO and show as stars on every game card. |
| **Favorites / wishlist** | Heart toggle on game pages; a Favorites grid on the player dashboard. |
| **Player wallet** | Balance + transaction history on the dashboard; admins credit/debit under **Player Wallets** (logged + notifies the player). |
| **Referral system** | Each player gets a referral code + shareable link on their dashboard. |
| **Promotions / bonus codes** | Public `/promotions` page; managed under Admin → Promotions. |
| **In-app notifications** | Header 🔔 bell with unread badge; fired on new announcements and support replies. |
| **Site-wide FAQ** | Public `/faq` with `FAQPage` schema; managed under Admin → FAQ. |
| **Live winners ticker** | Animated marquee on the homepage. |
| **CSV exports** | One-click export for winners, cashouts, profit and players (token-authenticated). |
| **Top-games analytics** | Most-played leaderboard on the admin dashboard. |
| **Light / dark theme** | Header toggle, persisted per browser. |

## 🚀 Advanced features & refinements

**Refinements:** richer premium color palette (deeper navy, brighter violet, gold + teal accents, light-mode variant), a proper **running-balance ledger** (kind icons, colored credits/debits, filter chips), and a small **floating chat box** (bottom-right bubble → compact popup) replacing the need to open the full chat page.

**Money / ledger**
- **All-time settlement report** (Admin → Settlement): lifetime loads, bonuses, cashouts, pending cashouts, player-balance liability, total profit, and per-player balances.
- **Player wallet ledger** with running balance on the dashboard.
- **Cashout requests** — players request a cashout; it lands as a *pending* cashout and notifies admins; admins set Paid/Pending/Rejected.

**Players & loyalty**
- **VIP tiers** (Bronze→Platinum) computed from loyalty points, shown as badges.
- **Loyalty points** auto-awarded on loads/bonuses; **loyalty leaderboard** on the dashboard.
- **Redeem bonus codes** from the dashboard (notifies an agent to apply).
- **Ping a player** (Admin → Players → 📨) by **email** and/or **SMS** — email via Django (console in dev, SMTP via env vars), SMS via optional Twilio settings.
- **Login activity log** (Admin → Login Activity) for security.

**Discovery & SEO**
- **Search autocomplete** in the header; **recently-viewed** games (localStorage); **top announcement bar**; homepage **trust badges** + LEGIT stamp.
- `WebSite` + `SearchAction` structured data (sitelinks search box), richer **sitemap** (promotions/FAQ/categories), **PWA manifest** (installable), and an **RSS feed** at `/feed.xml`.

### Email / SMS setup
Email works out of the box in dev (prints to the backend console). For real delivery set env vars before running the backend:
```bash
export EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
export EMAIL_HOST=smtp.yourhost.com EMAIL_HOST_USER=you EMAIL_HOST_PASSWORD=secret
```
SMS is off until you fill **Twilio SID / Auth Token / From** in Admin → Settings.

## 🎯 Game-platform integration & shift tracking

Integrates the external game-platform **agent API** (`API-Documentation.pdf`). Auth is
`token = MD5("agent_id:timestamp:secret_key")` on every multipart POST to
`{base}/api/external/…`. Configure the **URL, Agent ID and Secret** in Admin → Settings.

**Admin → Game Platform** exposes every documented interface:
Create player · Find player ID · **Load/Recharge** · **Withdraw/Cashout** · Player balance ·
Agent balance · Low-balance users · Reset password · Force player offline.
It shows connection status + live agent balance, and each load/withdraw is recorded to a
shift-tracked ledger.

**Admin → Transactions & Shifts** — every deposit/withdraw is stamped with:
- a **payment method** (from your Payment Methods list),
- the **operator** (staff who recorded it),
- and the **Nepal 8-hour shift** it fell in — Morning `05:00–13:00` (5–1), Evening `13:00–21:00` (1–9), Night `21:00–05:00` (9–5).

Pick any **date** → see totals per shift, a per-payment-method breakdown, the full
transaction list, and one-click **CSV export**. The admin dashboard also shows the current
shift and today's loads/withdraws.

> **To go live** you must add your **API base URL** and **`agent_id`** in Settings (the
> secret key is already stored). Until then, Game Platform actions return
> *"Game API is not configured"* and the ledger/report works with locally-recorded entries.

## 🎨 Design system (primary / secondary / accent)

Defined once in `frontend/app/globals.css`:

| Role | Color | Usage |
|------|-------|-------|
| **Primary** | `#0B0F1A` deep navy | backgrounds & surfaces — the "premium casino" base |
| **Secondary** | `#7C3AED` electric violet | structure, gradients, CTAs — modern neon identity that pairs with the black TF logo |
| **Accent** | `#F5C542` gold | reserved for *value* — prices, wins, key CTAs, focus rings |

The **TF monogram** logo is reproduced as a crisp inline SVG
(`frontend/components/Logo.jsx`) and also generated as a PNG on the backend
during seeding. To use the official artwork, upload it in Django admin →
**Site Settings → logo**, or drop it at `frontend/public/logo.png`.

---

## 🔍 SEO (the priority)

- **Per-page metadata** via `generateMetadata` — the `/[slug]` game pages pull
  meta title/description/keywords straight from the backend.
- **Structured data (JSON-LD):** Organization (site-wide), plus **BreadcrumbList
  + FAQPage + VideoGame** on every game page.
- **Server-rendered** content (SSR/ISR) so crawlers see full HTML, not JS shells.
- **`/sitemap.xml`** (auto-includes every active game) and **`/robots.txt`**.
- **OpenGraph + Twitter cards**, canonical URLs, `metadataBase`.
- Clean, keyword-friendly URLs: `/juwa`, `/game-vault`, `/orion-stars`,
  `/milky-way`, `/panda-master`, `/cash-machine`, `/fire-kirin`, `/ultra-panda`,
  `/vegas-sweeps`, `/vpower`, `/river-sweeps` (+ any you add).
- Images use descriptive `alt` text; backend generates branded logo/banner/
  screenshot images per game.

---

## 💬 Chat — strictly Admin ↔ User

Enforced in `backend/chat/views.py`:

- A **user can only message an admin** (support). They never choose a recipient
  and only ever see their own conversation.
- An **admin** sees an **inbox** of players and can reply to any of them.
- **User-to-user messaging is impossible.**
- Chat requires login (guarded on both API and UI).

Delivery is via short polling (3s) — no extra infrastructure. Swap in Django
Channels/WebSockets later without changing the data model.

---

## 🗂 Structure

```
backend/
  casino_backend/       # settings, urls, wsgi/asgi
  accounts/             # custom User (roles: admin/user), knox auth, admin user CRUD
  catalog/              # Category, Game, Screenshot, FAQ + API
  content/              # Winner, DailyProfit, Announcement, SiteSettings,
                        #   BusinessInfo, SEOPage, ContactMessage, stats + seed cmd
  chat/                 # Message model + admin↔user API
  media/                # uploaded & generated images
frontend/
  app/                  # App Router pages (home, games, [slug], winners,
                        #   business, search, login, dashboard, chat, admin,
                        #   sitemap.js, robots.js)
  components/           # Header, Footer, Logo, GameCard, PlayButtons, ContactForm, …
  lib/                  # api.js (fetch helpers), auth.js (token context)
```

## 🔐 API quick reference

```
POST /api/auth/login/            {username,password} -> {token,user}
POST /api/auth/logout/           (knox)
GET  /api/auth/me/
POST /api/auth/change-password/
GET  /api/games/  /api/games/<slug>/   POST /api/games/<slug>/click/
GET  /api/categories/  /api/winners/  /api/announcements/
GET  /api/settings/  /api/business/  GET /api/stats/public/  /api/stats/admin/
GET  /api/chat/conversation/[?user=ID]   POST /api/chat/send/   GET /api/chat/inbox/
GET/PUT admin: /api/profit/ /api/seo/ /api/users/ /api/contact/
```

## 🛡 Security
Token auth (knox), role-based permissions (admin vs user), no public
registration, Django ORM (SQL-injection safe), CORS locked to the frontend
origin, password hashing (PBKDF2), admin-only write endpoints.

## 📦 Production notes
- Set `SECRET_KEY`, `DEBUG=0`, `ALLOWED_HOSTS`, `CORS_ORIGINS`, and
  `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SITE_URL`.
- Serve Django with gunicorn + WhiteNoise/nginx for `/media` & `/static`.
- `npm run build && npm start` for the frontend (or deploy to Vercel).
- Point `DATABASES` at Postgres/MySQL.
