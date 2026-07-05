# Deploying Tiffany Gaming (Docker Compose on a VPS)

The whole stack — **Next.js frontend + Django API + Postgres + nginx** — runs with one
command. nginx serves the site and `/api` on the **same domain** (so there's no CORS to
worry about) and serves uploaded images from `/media`.

> ⚠️ **Juwa / game-API whitelist:** the game-platform API calls come from the **backend
> server**, so you must whitelist **this server's public IP** in your Juwa agent panel
> (not your home/office IP). Secure DNS (DoH) is already on by default to defeat ISP DNS
> blocking. See "Post-deploy" below.

---

## 1. Get a VPS (needs a static IPv4 you can whitelist)

Any VPS with a dedicated IP works. Good options (pick a region close to Nepal — **Singapore**
or **Mumbai/India** for low latency):

| Provider | Notes |
|----------|-------|
| **Vultr** | Singapore & Mumbai regions, hourly billing, easy. |
| **DigitalOcean** | Singapore (SGP1), Bangalore (BLR1); great docs. |
| **Hetzner** | Cheapest; EU/US/Singapore. |
| **Linode/Akamai** | Singapore, Mumbai. |

**Recommended size:** 2 vCPU / 4 GB RAM (the Next.js build needs ~2 GB). 2 GB works if you
build the image elsewhere. OS: **Ubuntu 24.04 LTS**.

After creating it, note its **public IP** — that's what you whitelist with Juwa.

---

## 2. Install Docker on the VPS

```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code onto the server

```bash
# via git
git clone <your-repo-url> tiffany && cd tiffany
# …or copy the folder up with rsync from your machine:
#   rsync -av --exclude node_modules --exclude .next --exclude 'backend/media' \
#     ./vault-alert/ root@YOUR_SERVER_IP:/root/tiffany/
```

## 4. Configure environment

```bash
cp .env.example .env
nano .env
```

Set at minimum:
- `PUBLIC_URL` → `http://YOUR_SERVER_IP` for now (switch to `https://yourdomain.com` after step 6)
- `SECRET_KEY` → `python3 -c "import secrets; print(secrets.token_urlsafe(50))"`
- `POSTGRES_PASSWORD` → a strong password

## 5. Launch

```bash
docker compose up -d --build
```

First boot runs migrations, collects static files and seeds demo data + accounts.
Open **http://YOUR_SERVER_IP** — you're live.
Admin: **/admin** → `admin` / `admin123` (change immediately, see below).

Handy commands:
```bash
docker compose ps            # status
docker compose logs -f backend
docker compose down          # stop
docker compose up -d --build # after a code update
```

---

## 6. Add a domain + HTTPS (do this before real use)

Point an **A record** for your domain to `YOUR_SERVER_IP`. Then pick one:

### Option A — Cloudflare (easiest)
Add the domain to Cloudflare (free), set the DNS record to **Proxied**, SSL mode
**Full**. You instantly get HTTPS and your origin IP is hidden. Then in `.env` set
`PUBLIC_URL=https://yourdomain.com` and `COOKIE_SECURE=1`, and rebuild:
```bash
docker compose up -d --build
```

### Option B — Let's Encrypt (certbot) on the box
```bash
sudo apt install certbot
docker compose stop nginx
certbot certonly --standalone -d yourdomain.com
```
Then mount the certs into the nginx service and add a `listen 443 ssl;` server block
referencing `/etc/letsencrypt/live/yourdomain.com/{fullchain,privkey}.pem`, redirect
`80 → 443`, set `PUBLIC_URL=https://yourdomain.com` + `COOKIE_SECURE=1`, and rebuild.

---

## 7. Post-deploy checklist

1. **Change the admin password** — Admin → Players → edit `admin` (or `/django-admin/`).
2. **Whitelist the server IP** with Juwa (run `curl -s https://api.ipify.org` on the VPS to
   confirm the exact IP), then in **Admin → Settings** re-enter:
   - Game API URL: `https://apiinterface.juwa2.xin`
   - Agent ID: `122972`
   - Secret Key: your key
   - "Use Secure DNS" stays **on** (bypasses ISP DNS blocking).
   Check **Admin → Game Platform** — it should show your live agent balance.
3. **Create-Account URL** (Admin → Settings) already defaults to your Facebook page.
4. Set `SEED=0` in `.env` so future deploys don't re-run the seeder (data persists in the
   Postgres volume regardless).
5. Add real games/images, winners, payment methods, etc.

## Updating later
```bash
git pull            # or rsync new files
docker compose up -d --build
```
Postgres data and uploaded media live in named volumes (`pgdata`, `media`) and survive
rebuilds. Back them up periodically:
```bash
docker compose exec db pg_dump -U tiffany tiffany > backup_$(date +%F).sql
```

---

**Security & compliance:** change all default credentials, keep `DEBUG=0`, use HTTPS, and
make sure operating a sweepstakes/gaming site is permitted in your jurisdiction — that part
is on you.
