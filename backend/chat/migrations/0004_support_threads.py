"""Move the old player ↔ staff support chat (chat.Message) into Messenger:
each player who has support history gets a pinned "support" conversation with
the same messages."""

from django.db import migrations
from django.db.models import Q


def forwards(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Message = apps.get_model("chat", "Message")
    Conversation = apps.get_model("chat", "Conversation")
    Participant = apps.get_model("chat", "Participant")
    ChatMessage = apps.get_model("chat", "ChatMessage")

    player_ids = set()
    for s, r in Message.objects.values_list("sender_id", "recipient_id"):
        player_ids.update([s, r])
    for player in User.objects.filter(pk__in=player_ids, role="user"):
        if Conversation.objects.filter(subject=player).exists():
            continue
        conv = Conversation.objects.create(tenant_id=player.tenant_id,
                                           kind="support", subject=player)
        staff = User.objects.filter(tenant_id=player.tenant_id, is_active=True) \
            .filter(Q(role="admin") | Q(is_superuser=True))
        if player.agent_id:
            staff = staff | User.objects.filter(pk=player.agent_id)
        last = None
        for m in Message.objects.filter(Q(sender=player) | Q(recipient=player)) \
                .order_by("created_at", "id"):
            last = ChatMessage.objects.create(
                tenant_id=player.tenant_id, conversation=conv,
                sender_id=m.sender_id, body=m.body, image=m.image)
            ChatMessage.objects.filter(pk=last.pk).update(created_at=m.created_at)
        if last:
            Conversation.objects.filter(pk=conv.pk).update(
                updated_at=last.created_at)
        last_id = last.id if last else 0
        for u in {player, *staff}:
            Participant.objects.create(
                tenant_id=player.tenant_id, conversation=conv, user=u,
                role="member" if u == player else "admin",
                last_read_id=last_id)


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0003_chatmessage_deleted_at_chatmessage_edited_at_and_more"),
        ("accounts", "0006_user_avatar_user_bio_user_chat_muted_until_and_more"),
    ]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
