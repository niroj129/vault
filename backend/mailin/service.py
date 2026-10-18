"""Store a forwarded email, read the payment in it and match it to a QR
payment that's waiting for a staff check. Matching only ever adds evidence."""
import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from gaming.models import Deposit
from . import parse
from .models import InboundEmail

WINDOW = timedelta(hours=72)
# QR method `replaces` keys → the app names emails use
APP_OF_METHOD = {"ecashapp": "cashapp", "applepay": "applepay", "googlepay": "googlepay",
                 "chime": "chime", "venmo": "venmo", "paypal": "paypal"}


def _method_app(dep):
    pm = dep.pay_method
    if not pm:
        return ""
    if pm.replaces:
        return APP_OF_METHOD.get(pm.replaces, pm.replaces)
    key = pm.key
    for app in ("cashapp", "chime", "venmo", "paypal", "zelle"):
        if key.startswith(app):
            return app
    return ""


def _words(s):
    return {w for w in re.findall(r"[a-z]+", (s or "").lower()) if len(w) >= 3}


def candidates():
    return (Deposit.objects.filter(gateway="direct", status=Deposit.Status.PENDING,
                                   created_at__gte=timezone.now() - WINDOW)
            .select_related("pay_method", "user").order_by("-created_at"))


def find_match(em):
    """→ (deposit, match) for a payment email, or (None, NONE)."""
    blob = f"{em.subject}\n{em.note}\n{em.text[:5000]}".upper()
    cands = list(candidates())
    # 1. the deposit's code in the payment note: strongest evidence
    for d in cands:
        if re.search(rf"\b{re.escape(d.code)}\b", blob):
            return d, InboundEmail.Match.CODE
    free = [d for d in cands if not d.emails.exclude(pk=em.pk).exists()]
    same = [d for d in free if em.amount is not None and d.amount == em.amount
            and (not em.app or not _method_app(d) or _method_app(d) == em.app)]
    # 2. same amount and the name on the player's account matches the payer
    payer = _words(em.payer)
    named = [d for d in same if payer and payer & _words(d.player_note or d.user.full_name)]
    if len(named) == 1:
        return named[0], InboundEmail.Match.LIKELY
    # 3. only one open payment of that amount from that app
    if len(same) == 1:
        return same[0], InboundEmail.Match.LIKELY
    return None, InboundEmail.Match.NONE


def ingest(mail):
    """Save a normalized email (see parse.normalize). Returns (email, created)."""
    mid = (mail.get("message_id") or "").strip()[:300]
    if mid:
        old = InboundEmail.objects.filter(message_id=mid).first()
        if old:
            return old, False
    text = (mail.get("text") or "")[:parse.TEXT_LIMIT]
    em = InboundEmail(provider=mail.get("provider", ""), message_id=mid,
                      from_email=(mail.get("from_email") or "")[:254], from_name=(mail.get("from_name") or "")[:200],
                      to=(mail.get("to") or "")[:500], subject=(mail.get("subject") or "")[:500], text=text,
                      sent_at=mail.get("sent_at"))
    gmail = parse.gmail_confirmation(em.from_email, em.subject, text)
    pay = None if gmail else parse.read_payment(em.subject, text)
    if gmail:
        em.kind, (em.confirm_code, em.confirm_link) = InboundEmail.Kind.GMAIL_CONFIRM, gmail
    elif pay:
        em.kind = InboundEmail.Kind.PAYMENT
        em.amount, em.payer, em.note = pay
        em.app = parse.app_of(em.from_email, em.subject, text)
        em.verified = parse.verified_sender(em.app, em.from_email, mail.get("headers", ""))
    with transaction.atomic():
        em.save()
        if em.kind == InboundEmail.Kind.PAYMENT:
            dep, match = find_match(em)
            em.deposit, em.match = dep, match
            em.save(update_fields=["deposit", "match"])
    transaction.on_commit(lambda: _tell_staff(em))
    return em, True


def _tell_staff(em):
    from chat.events import push_to_users
    from chat.messenger import admin_ids, support_staff_ids
    from gaming.service import usd
    if em.kind == InboundEmail.Kind.GMAIL_CONFIRM:
        push_to_users(admin_ids(), {"type": "toast", "title": "Gmail forwarding code arrived",
                                    "text": f"Code {em.confirm_code}. Open Payment emails to finish setup.",
                                    "link": "/admin/mail", "tone": "info", "staff": True})
        return
    if em.kind != InboundEmail.Kind.PAYMENT:
        return
    who = f"{usd(em.amount)} from {em.payer}" + (f" ({em.app})" if em.app else "")
    if em.deposit:
        d = em.deposit
        push_to_users(support_staff_ids(d.user), {
            "type": "toast", "title": "Payment email matches a QR payment",
            "text": f"{who} looks like @{d.user.username}'s payment. Check it under To check.",
            "link": "/admin/deposits?tab=check", "tone": "ok", "staff": True})
    else:
        push_to_users(admin_ids(), {"type": "toast", "title": "Payment email with no match",
                                    "text": f"{who}. Link it to a payment in Payment emails.",
                                    "link": "/admin/mail", "tone": "info", "staff": True})


def evidence(em):
    """Short form shown on the deposit's check card."""
    return {"id": em.id, "app": em.app, "amount": em.amount, "payer": em.payer, "note": em.note,
            "subject": em.subject, "verified": em.verified, "match": em.match,
            "match_label": em.get_match_display(), "received_at": em.received_at}
