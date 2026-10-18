"""Who is online right now.

Each open messenger websocket counts as one connection in the cache (Redis
in production, so every worker sees the same counts). The key expires 90 s
after the last ping, so a crashed worker can't leave someone "online" forever.
`User.last_seen` is stamped when the last connection closes.
"""

from django.core.cache import cache
from django.utils import timezone

TTL = 90


def _key(user_id):
    return f"presence:{user_id}"


def connect(user_id):
    """Returns True when this is the user's first open connection."""
    key = _key(user_id)
    cache.add(key, 0, TTL)
    try:
        n = cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, TTL)
        n = 1
    cache.touch(key, TTL)
    return n == 1


def disconnect(user_id):
    """Returns True when the user has no connections left."""
    key = _key(user_id)
    try:
        n = cache.decr(key)
    except ValueError:
        return True
    if n <= 0:
        cache.delete(key)
        return True
    return False


def heartbeat(user_id):
    if not cache.touch(_key(user_id), TTL):
        cache.set(_key(user_id), 1, TTL)


def online_ids(user_ids):
    ids = list({i for i in user_ids if i})
    if not ids:
        return set()
    found = cache.get_many([_key(i) for i in ids])
    return {i for i in ids if (found.get(_key(i)) or 0) > 0}


def stamp_last_seen(user):
    from accounts.models import User
    User.all_tenants.filter(pk=user.pk).update(last_seen=timezone.now())
