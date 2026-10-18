"""Tell the player (and staff) what's happening with their money.

Every step posts an automatic "Cashier" message in the player's pinned
Support chat (so the whole history sits in one place and staff see it in
their inbox), adds a bell notification, and pops a toast on any open tab —
plus a phone push for anyone who turned notifications on.
"""

from chat.events import push_to_users
from chat.messenger import ensure_support, message_dict, notify_offline, support_staff_ids, touch
from chat.models import ChatMessage
from content.models import Notification


def _post_support(user, text, image=None):
    conv = ensure_support(user)
    msg = ChatMessage.objects.create(conversation=conv, sender=None, body=text,
                                     **({"image": image} if image else {}))
    touch(conv)
    from chat.events import push_to_conversation
    push_to_conversation(conv, {"type": "message", "message": message_dict(msg)})
    notify_offline(conv, None, text)
    return conv


def event(user, title, text, *, link="/load", tone="info", staff_text=None,
          staff_link="/admin/deposits", chat=True, image=None):
    """One money event → chat message + bell + toast (+ push) for the
    player, and a toast for staff."""
    conv = None
    if chat and user.role == "user":
        conv = _post_support(user, text, image)
    Notification.objects.create(user=user, text=f"{title} — {text}"[:255], link=link)
    push_to_users([user.id], {"type": "toast", "title": title, "text": text,
                              "link": link, "tone": tone})
    if staff_text:
        staff = support_staff_ids(user) - {user.id}
        push_to_users(staff, {"type": "toast", "title": title, "text": staff_text,
                              "link": staff_link, "tone": tone, "staff": True})
    return conv
