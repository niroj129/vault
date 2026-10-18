"""Websocket endpoint for the messenger: ws(s)://<site>/ws/messenger/?token=…

Server → client events: message, message_update, conversation (refetch),
typing, read, presence, report.
Client → server: {"type": "typing", "conversation": id} and {"type": "ping"}.
Sending messages stays on the REST API (it handles uploads and SMS); the
socket is for instant delivery.
"""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from tenants.context import use_tenant
from tenants.middleware import resolve_tenant
from .events import user_group


@database_sync_to_async
def authenticate(host, token):
    from rest_framework.exceptions import AuthenticationFailed
    from tenants.auth import TenantTokenAuthentication
    tenant = resolve_tenant(host)
    if not tenant or not tenant.is_active or not token:
        return None, None
    with use_tenant(tenant):
        try:
            user, _ = TenantTokenAuthentication().authenticate_credentials(
                token.encode())
        except AuthenticationFailed:
            return tenant, None
    return tenant, user


@database_sync_to_async
def typing_targets(tenant, user, conv_id):
    from .models import Participant
    with use_tenant(tenant):
        if not Participant.objects.filter(conversation_id=conv_id,
                                          user=user).exists():
            return []
        return list(Participant.objects.filter(conversation_id=conv_id)
                    .exclude(user=user).values_list("user_id", flat=True))


@database_sync_to_async
def went_online(tenant, user):
    from . import presence
    from .messenger import contact_ids
    if not presence.connect(user.id):
        return []
    with use_tenant(tenant):
        return list(contact_ids(user))


@database_sync_to_async
def went_offline(tenant, user):
    from . import presence
    from .messenger import contact_ids
    if not presence.disconnect(user.id):
        return [], None
    presence.stamp_last_seen(user)
    from django.utils import timezone
    with use_tenant(tenant):
        return list(contact_ids(user)), timezone.now()


@database_sync_to_async
def heartbeat(user):
    from . import presence
    presence.heartbeat(user.id)


class MessengerConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        headers = dict(self.scope.get("headers") or [])
        host = headers.get(b"host", b"").decode()
        token = (parse_qs(self.scope.get("query_string", b"").decode())
                 .get("token") or [""])[0]
        self.tenant, self.user = await authenticate(host, token)
        if not self.user:
            await self.close(code=4401)
            return
        self.group = user_group(self.user.id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.announce(await went_online(self.tenant, self.user), True)

    async def disconnect(self, code):
        if getattr(self, "group", None):
            await self.channel_layer.group_discard(self.group,
                                                   self.channel_name)
            ids, seen = await went_offline(self.tenant, self.user)
            await self.announce(ids, False, seen)

    async def announce(self, user_ids, online, last_seen=None):
        data = {"type": "presence", "user": self.user.id, "online": online,
                "last_seen": last_seen.isoformat() if last_seen else None}
        for uid in user_ids:
            await self.channel_layer.group_send(
                user_group(uid), {"type": "push", "data": data})

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "ping":
            await heartbeat(self.user)
            await self.send_json({"type": "pong"})
        elif kind == "typing":
            conv_id = content.get("conversation")
            if not isinstance(conv_id, int):
                return
            data = {"type": "typing", "conversation": conv_id,
                    "user": {"id": self.user.id,
                             "name": self.user.full_name or self.user.username}}
            for uid in await typing_targets(self.tenant, self.user, conv_id):
                await self.channel_layer.group_send(
                    user_group(uid), {"type": "push", "data": data})

    async def push(self, event):
        await self.send_json(event["data"])
