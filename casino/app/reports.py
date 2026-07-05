"""Reports and data export.

Exports are streamed as CSV (openable directly in Excel/Sheets) using only the
standard library, so there are no extra dependencies. The report pages are also
print-friendly (browser "Print → Save as PDF").
"""

import csv
import io

from flask import (Blueprint, Response, render_template, request)

from .db import get_db
from .security import admin_required

bp = Blueprint("reports", __name__)


@bp.before_request
@admin_required
def _guard():
    pass


REPORTS = {
    "profit": {
        "title": "Daily Profit",
        "sql": "SELECT profit_date, amount, notes, created_at FROM profits "
               "ORDER BY profit_date DESC",
        "headers": ["Date", "Amount", "Notes", "Recorded"],
    },
    "winners": {
        "title": "Winners",
        "sql": "SELECT win_date, name, amount, game, created_at FROM winners "
               "ORDER BY win_date DESC",
        "headers": ["Date", "Winner", "Amount", "Game", "Recorded"],
    },
    "users": {
        "title": "User Activity",
        "sql": "SELECT username, ip, success, user_agent, created_at "
               "FROM login_logs ORDER BY id DESC LIMIT 1000",
        "headers": ["Username", "IP", "Success", "User Agent", "Time"],
    },
    "agents": {
        "title": "Agent Activity",
        "sql": "SELECT username, action, detail, created_at FROM activity_log "
               "WHERE action LIKE 'agent%' ORDER BY id DESC LIMIT 1000",
        "headers": ["Agent", "Action", "Detail", "Time"],
    },
    "chat": {
        "title": "Chat Activity",
        "sql": "SELECT username, body, created_at FROM chat_messages "
               "ORDER BY id DESC LIMIT 1000",
        "headers": ["User", "Message", "Time"],
    },
    "games": {
        "title": "Game Usage",
        "sql": "SELECT name, clicks, status, featured FROM games "
               "ORDER BY clicks DESC",
        "headers": ["Game", "Plays", "Status", "Featured"],
    },
}


@bp.route("/")
def index():
    db = get_db()
    data = {}
    for key, cfg in REPORTS.items():
        data[key] = {"title": cfg["title"], "headers": cfg["headers"],
                     "rows": db.execute(cfg["sql"]).fetchall()[:50]}
    return render_template("admin/reports.html", data=data)


@bp.route("/<report>/export.csv")
def export_csv(report):
    cfg = REPORTS.get(report)
    if not cfg:
        return Response("Unknown report", status=404)
    rows = get_db().execute(cfg["sql"]).fetchall()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(cfg["headers"])
    for r in rows:
        writer.writerow([r[k] for k in r.keys()])

    return Response(
        buf.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition":
                 f"attachment; filename={report}_report.csv"})
