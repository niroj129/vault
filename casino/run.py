#!/usr/bin/env python3
"""Entry point for Team Tiffany Gaming Casino.

    python run.py            # dev server on http://127.0.0.1:8000
    gunicorn "run:app"       # production (see README)
"""

import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("DEBUG") == "1")
