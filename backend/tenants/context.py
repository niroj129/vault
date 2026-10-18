"""The tenant the current request (or websocket, or command) is acting for.

Set by tenants.middleware for HTTP, by tenants.ws for websockets, and by
`use_tenant()` in commands/tests. When no tenant is set (shell, migrations)
tenant-scoped managers are unfiltered.
"""

import contextvars
from contextlib import contextmanager

_current = contextvars.ContextVar("current_tenant", default=None)


def get_current_tenant():
    return _current.get()


def set_current_tenant(tenant):
    return _current.set(tenant)


def reset_current_tenant(token):
    _current.reset(token)


@contextmanager
def use_tenant(tenant):
    token = _current.set(tenant)
    try:
        yield tenant
    finally:
        _current.reset(token)
