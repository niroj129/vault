#!/usr/bin/env bash
set -e

echo "→ Waiting for database…"
python - <<'PY'
import os, time
import dj_database_url
cfg = dj_database_url.config(default="sqlite:///db.sqlite3")
if cfg.get("ENGINE", "").endswith("postgresql"):
    import psycopg2
    for i in range(30):
        try:
            psycopg2.connect(
                dbname=cfg["NAME"], user=cfg["USER"], password=cfg["PASSWORD"],
                host=cfg["HOST"], port=cfg.get("PORT") or 5432).close()
            print("  database ready"); break
        except Exception as e:
            print(f"  waiting ({i})… {e}"); time.sleep(2)
PY

echo "→ Applying migrations…"
python manage.py migrate --noinput

echo "→ Collecting static files…"
python manage.py collectstatic --noinput

if [ "${SEED:-1}" = "1" ]; then
  echo "→ Seeding initial data (idempotent)…"
  python manage.py seed || true
fi

echo "→ Starting: $*"
exec "$@"
