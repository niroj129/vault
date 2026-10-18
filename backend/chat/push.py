"""Web Push: phone/desktop notifications even when the site is closed.

VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url, as
printed by `python manage.py vapid_keys`). Without them a key pair is
generated once and kept in BASE_DIR/.vapid.json so subscriptions survive
restarts. One key pair serves every site on the platform.
"""

import base64
import json
import logging
import threading
from pathlib import Path

from django.conf import settings
from django.db import transaction

log = logging.getLogger(__name__)
_keys = None
_lock = threading.Lock()


def _b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def generate_keys():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    priv = ec.generate_private_key(ec.SECP256R1())
    pub = priv.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint)
    d = priv.private_numbers().private_value.to_bytes(32, "big")
    return {"public": _b64(pub), "private": _b64(d)}


def keys():
    global _keys
    if _keys:
        return _keys
    with _lock:
        if _keys:
            return _keys
        pub = getattr(settings, "VAPID_PUBLIC_KEY", "")
        priv = getattr(settings, "VAPID_PRIVATE_KEY", "")
        if pub and priv:
            _keys = {"public": pub, "private": priv}
            return _keys
        path = Path(settings.BASE_DIR) / ".vapid.json"
        try:
            _keys = json.loads(path.read_text())
        except (OSError, ValueError):
            _keys = generate_keys()
            try:
                path.write_text(json.dumps(_keys))
            except OSError:
                log.warning("could not save VAPID keys to %s", path)
        return _keys


def public_key():
    return keys()["public"]


def _send(subs, payload):
    from pywebpush import WebPushException, webpush
    from .models import PushSubscription
    claims = {"sub": "mailto:" + (getattr(settings, "DEFAULT_FROM_EMAIL", "")
                                  .split("<")[-1].strip("> ")
                                  or "admin@example.com")}
    gone = []
    for endpoint, p256dh, auth in subs:
        try:
            webpush({"endpoint": endpoint,
                     "keys": {"p256dh": p256dh, "auth": auth}},
                    json.dumps(payload), vapid_private_key=keys()["private"],
                    vapid_claims=dict(claims), ttl=3600, timeout=10)
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):
                gone.append(endpoint)
            else:
                log.info("push failed: %s", e)
        except Exception as e:  # network errors must never break chat
            log.info("push failed: %s", e)
    if gone:
        PushSubscription.all_tenants.filter(endpoint__in=gone).delete()


def notify(user_ids, title, body, url="/messages", tag=None):
    """Queue a notification to every browser these users subscribed."""
    from .models import PushSubscription
    subs = list(PushSubscription.objects.filter(user_id__in=list(user_ids))
                .values_list("endpoint", "p256dh", "auth"))
    if not subs:
        return
    payload = {"title": title, "body": body[:180], "url": url,
               "tag": tag or url}
    transaction.on_commit(lambda: threading.Thread(
        target=_send, args=(subs, payload), daemon=True).start())
