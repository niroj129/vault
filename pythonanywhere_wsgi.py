# PythonAnywhere WSGI config for the Game Points app.
#
# HOW TO USE:
# 1. On the PythonAnywhere "Web" tab, click the link to your WSGI file
#    (named like /var/www/YOURNAME_pythonanywhere_com_wsgi.py).
# 2. DELETE everything in that file and paste this in.
# 3. Change YOURNAME below to your PythonAnywhere username.
# 4. Save, then click the green "Reload" button on the Web tab.

import os
import sys

# --- change YOURNAME to your PythonAnywhere username ---
project_path = "/home/YOURNAME/vault-alert"
# -------------------------------------------------------

if project_path not in sys.path:
    sys.path.insert(0, project_path)

# The bot token is already baked into app.py, but setting it here as an
# environment variable keeps it out of the code if you prefer. Optional.
os.environ.setdefault("BOT_TOKEN", "8934666053:AAH2cyv_DVZXBgWf2EPEcBoyaFPbot-gvbc")
# A long random string that signs login cookies. Change it to anything.
os.environ.setdefault("SECRET_KEY", "please-change-me-to-a-long-random-string")

from app import app as application  # noqa: E402
