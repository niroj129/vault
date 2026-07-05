#!/usr/bin/env python3
"""Create brand logins and manage them from the command line.

Usage:
    python3 manage.py init
    python3 manage.py add <username> <password> <brand>   # create a brand login
    python3 manage.py set-group <username> <group_chat_id> # set Telegram group
    python3 manage.py set-pw <username> <password>
    python3 manage.py list

Example:
    python3 manage.py add tiffany  Pass123 Tiffany
    python3 manage.py add stardust Pass123 Stardust
    python3 manage.py add spincity Pass123 Spincity
"""

import sqlite3
import sys

from werkzeug.security import generate_password_hash

from app import DB_PATH, init_db


def _connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def add(username, password, brand):
    db = _connect()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, brand) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), brand),
        )
        db.commit()
        print(f"Created login: {username}  (brand: {brand})")
    except sqlite3.IntegrityError:
        print(f"User '{username}' already exists.")
    finally:
        db.close()


def set_group(username, chat_id):
    db = _connect()
    cur = db.execute(
        "UPDATE users SET group_chat_id = ? WHERE username = ?",
        (chat_id, username),
    )
    db.commit()
    db.close()
    print("Group ID set." if cur.rowcount else f"No user '{username}'.")


def set_pw(username, password):
    db = _connect()
    cur = db.execute(
        "UPDATE users SET password_hash = ? WHERE username = ?",
        (generate_password_hash(password), username),
    )
    db.commit()
    db.close()
    print("Password updated." if cur.rowcount else f"No user '{username}'.")


def list_users():
    db = _connect()
    for r in db.execute("SELECT username, brand, group_chat_id FROM users"):
        grp = r["group_chat_id"] or "(no group set)"
        print(f"- {r['username']}  brand={r['brand']}  group={grp}")
    db.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == "init":
        init_db()
        print(f"Database ready at {DB_PATH}")
    elif cmd == "add" and len(sys.argv) >= 5:
        init_db()
        add(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "set-group" and len(sys.argv) >= 4:
        set_group(sys.argv[2], sys.argv[3])
    elif cmd == "set-pw" and len(sys.argv) >= 4:
        set_pw(sys.argv[2], sys.argv[3])
    elif cmd == "list":
        list_users()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
