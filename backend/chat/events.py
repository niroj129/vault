"""Push messenger events to connected browsers over websockets.

Every logged-in browser tab joins the channel group "u<user id>"; events are
sent after the DB transaction commits so clients never fetch stale data.
"""

import json

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction


def user_group(user_id):
    return f"u{user_id}"


def push_to_users(user_ids, data):
    layer = get_channel_layer()
    if layer is None:
        return
    # plain JSON types only (datetimes → ISO strings) so any channel layer,
    # including Redis/msgpack, can carry it
    data = json.loads(json.dumps(data, cls=DjangoJSONEncoder))

    def send():
        for uid in set(user_ids):
            async_to_sync(layer.group_send)(user_group(uid),
                                            {"type": "push", "data": data})

    transaction.on_commit(send)


def push_to_conversation(conv, data, extra_user_ids=()):
    ids = list(conv.participants.values_list("user_id", flat=True))
    push_to_users(ids + list(extra_user_ids), data)
