"""Game accounts, loads, redeems and the deposit → auto-load pipeline.

Deposit lifecycle:
    pending ──(webhook / status check: approved)──▶ approved
      load_status: waiting ─▶ queued ─▶ loading ─▶ loaded
                                              └──▶ failed  (staff can retry)
    auto_load off, or the game has no API ─▶ manual  (staff load it)

Loading runs in a background thread after the database commit so webhooks
answer instantly; a row lock makes it impossible to load the same deposit
twice, even if the webhook and a status check arrive together.
"""

import logging
import threading
import time
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from catalog.models import GameLogin
from content.models import GameTxn, Notification, SiteSettings
from tenants.context import get_current_tenant, use_tenant

from . import bytepayout
from .models import Deposit, GameProvider, Redeem
from .providers import ApiError, NotSupported, adapter_for, make_account, make_password

log = logging.getLogger(__name__)


class GameError(Exception):
    pass


def usd(v):
    """$50, $27.50 — for messages people read."""
    v = Decimal(str(v or 0))
    return f"${v:,.0f}" if v == v.to_integral_value() else f"${v:,.2f}"


def adapter(game):
    p = game.provider
    if not p or not p.is_active or p.kind == GameProvider.Kind.MANUAL:
        raise GameError(f"{game.name} isn't connected to a game API — staff load it by hand.")
    return adapter_for(p)


def is_automated(game):
    p = game.provider
    return bool(p and p.is_active and p.kind != GameProvider.Kind.MANUAL)


def _call(fn, *a):
    try:
        return fn(*a)
    except NotSupported as e:
        raise GameError(str(e))
    except ApiError as e:
        raise GameError(str(e))


def _stamp_provider(provider, ok, error=""):
    GameProvider.objects.filter(pk=provider.pk).update(
        last_checked=timezone.now(), last_error="" if ok else error[:300])


# ------------------------------------------------------------- accounts

def ensure_login(user, game, *, create=True):
    """The player's account on `game`, created through the API if missing."""
    login = GameLogin.objects.filter(user=user, game=game).first()
    if login or not create:
        return login
    ad = adapter(game)
    last = "Could not create the account"
    for _ in range(3):  # name taken → try another random suffix
        account = make_account(user.username, game.provider.account_prefix,
                               ad.account_min, ad.account_max)
        password = make_password()
        res = _call(ad.create_account, account, password)
        if res.ok:
            login, _ = GameLogin.objects.update_or_create(
                user=user, game=game, defaults={
                    "username": res.account or account, "password": password,
                    "platform_user_id": res.platform_user_id,
                    "created_via_api": True, "note": ""})
            _stamp_provider(game.provider, True)
            return login
        last = res.message
        if "exist" not in last.lower():
            break
    _stamp_provider(game.provider, False, last)
    raise GameError(last)


def live_balance(login):
    res = _call(adapter(login.game).balance, login)
    if not res.ok:
        raise GameError(res.message)
    updates = {"last_balance": "" if res.balance is None else str(res.balance),
               "last_balance_at": timezone.now()}
    if res.platform_user_id and not login.platform_user_id:
        updates["platform_user_id"] = res.platform_user_id
    GameLogin.objects.filter(pk=login.pk).update(**updates)
    return res


# ---------------------------------------------------------- load / redeem

def _order_id(prefix):
    return f"{prefix}{int(time.time() * 1000) % 10**13}"[:20]


def move_credits(login, amount, kind, *, operator, method="", order_id=None,
                 note=""):
    """Load (kind="load") or redeem (kind="withdraw") credits on a game
    account through its API. Always writes a GameTxn (success or failure)."""
    ad = adapter(login.game)
    order_id = order_id or _order_id("L" if kind == "load" else "W")
    fn = ad.recharge if kind == "load" else ad.withdraw
    amount = ad.amount(amount)
    try:
        res = _call(fn, login, amount, order_id)
        ok, msg = res.ok, res.message
    except GameError as e:
        res, ok, msg = None, False, str(e)
    txn = GameTxn.objects.create(
        kind="load" if kind == "load" else "withdraw", user=login.user,
        game=login.game, account_name=login.username,
        platform_user_id=(res.platform_user_id if res else "") or login.platform_user_id,
        amount=amount, payment_method=method, order_id=order_id,
        platform_txn_id=(res.txn_id if res else "") or "",
        user_balance="" if not res or res.balance is None else str(res.balance),
        operator=operator, status="success" if ok else "failed",
        note=(note if ok else msg)[:200])
    if res and ok:
        upd = {"last_balance_at": timezone.now()}
        if res.balance is not None:
            upd["last_balance"] = str(res.balance)
        if res.platform_user_id and not login.platform_user_id:
            upd["platform_user_id"] = res.platform_user_id
        GameLogin.objects.filter(pk=login.pk).update(**upd)
    _stamp_provider(login.game.provider, ok, msg)
    return ok, msg, txn


# --------------------------------------------------------------- deposits

def credit_for(amount, fee, settings=None):
    s = settings or SiteSettings.load()
    credit = Decimal(str(amount))
    if s.load_minus_fee:
        credit -= Decimal(str(fee or 0))
    if s.load_bonus_percent:
        credit += credit * Decimal(str(s.load_bonus_percent)) / 100
    return max(credit.quantize(Decimal("0.01")), Decimal("0"))


class PromoError(Exception):
    """A promo code the player can't use (the text is shown to them)."""


def _promo_holds(promo):
    """Deposits that count against a code: paid ones, and ones still waiting to be
    paid (so two open checkouts can't both claim a one-time code)."""
    from django.db.models import Q
    recent = timezone.now() - timedelta(hours=3)
    return Deposit.objects.filter(promo=promo).filter(
        Q(status=Deposit.Status.APPROVED)
        | Q(status=Deposit.Status.PENDING, gateway="direct")
        | Q(status=Deposit.Status.PENDING, created_at__gte=recent))


def promo_eligible(promo, user):
    """Is this promotion offered to this player (Everyone / Only the listed / Everyone except them)?"""
    if promo.audience == "all":
        return True
    listed = promo.players.filter(pk=user.pk).exists()
    return listed if promo.audience == "only" else not listed


def _check_access(promo, user):
    """Is this player allowed to use this promo right now (audience, dates, use limits)?"""
    if not promo_eligible(promo, user):
        raise PromoError("That promo code isn't valid.")
    today = timezone.localdate()
    if promo.starts and promo.starts > today:
        raise PromoError(f"That code starts on {promo.starts:%b %d}.")
    if promo.expires and promo.expires < today:
        raise PromoError("That code has expired.")
    holds = _promo_holds(promo)
    if promo.usage == promo.Usage.ONCE and holds.filter(user=user).exists():
        raise PromoError("You've already used that code.")
    if promo.max_uses and holds.count() >= promo.max_uses:
        raise PromoError("That code has been fully claimed.")


def _check_promo(promo, user, amount):
    """Everything that must hold for this promo on this deposit. Returns the bonus
    or raises PromoError."""
    _check_access(promo, user)
    pct, flat = Decimal(promo.bonus_percent or 0), Decimal(promo.bonus_flat or 0)
    if pct <= 0 and flat <= 0:
        if promo.free_credits > 0:
            raise PromoError("That's a free play code — use “Redeem free play” instead of paying.")
        raise PromoError("That code can't be applied at checkout — ask your agent about it.")
    if promo.min_deposit and amount < promo.min_deposit:
        raise PromoError(f"That code needs a deposit of at least ${promo.min_deposit:g}.")
    bonus = amount * pct / 100 + flat
    if promo.max_bonus and bonus > promo.max_bonus:
        bonus = Decimal(promo.max_bonus)
    return bonus.quantize(Decimal("0.01"))


def promo_quote(user, code, amount, lock=False):
    """Check a promo code for this player and deposit. Returns (promo, bonus).
    Raises PromoError with a message fit to show the player. With lock=True the
    promo row is locked (call inside transaction.atomic) so concurrent deposits
    can't both use a one-time code."""
    from content.models import Promo
    code = (code or "").strip()
    if not code:
        raise PromoError("Enter a promo code.")
    qs = Promo.objects.filter(code__iexact=code, active=True)
    promo = (qs.select_for_update() if lock else qs).first()
    if not promo:
        raise PromoError("That promo code isn't valid.")
    return promo, _check_promo(promo, user, Decimal(str(amount)))


def redeem_freeplay(user, code, game, login):
    """A free play code: credits on the game with no payment. Loads by API when the game
    has one (and auto-load is on), otherwise goes to staff as a load to do by hand.
    Call inside transaction.atomic(). Returns the Deposit."""
    from content.models import Promo
    promo = Promo.objects.select_for_update().filter(code__iexact=(code or "").strip(), active=True).first()
    if not promo or promo.free_credits <= 0:
        raise PromoError("That isn't a free play code.")
    _check_access(promo, user)
    auto = is_automated(game) and SiteSettings.load().auto_load
    dep = Deposit.objects.create(
        user=user, game=game, login=login, method="freeplay", gateway="freeplay", amount=0,
        credit_amount=promo.free_credits, promo=promo, promo_code=promo.code.upper(),
        bonus_amount=promo.free_credits, status=Deposit.Status.APPROVED, approved_at=timezone.now(),
        load_status=Deposit.Load.QUEUED if auto else Deposit.Load.MANUAL, note="Free play")
    if auto:
        queue_load(dep.pk)
    on_commit_here(_notify_status, dep.pk)
    return dep


def apply_agent_balance(provider, balance):
    """Games on an API-connected platform show that platform's live agent points."""
    from catalog.models import Game
    Game.objects.filter(provider=provider).update(
        vendor_points=balance, sub_points=0, points_synced_at=timezone.now())


def sync_points():
    """Pull the agent points from every connected game platform (current site).
    Returns how many platforms updated."""
    n = 0
    for p in GameProvider.objects.filter(is_active=True).exclude(kind=GameProvider.Kind.MANUAL):
        try:
            res = adapter_for(p).agent_balance()
            bal = Decimal(str(res.balance).replace(",", "").replace("$", "")) if res.ok and res.balance not in (None, "") else None
        except Exception as e:  # one platform being down must not stop the rest
            GameProvider.objects.filter(pk=p.pk).update(last_checked=timezone.now(), last_error=str(e)[:300])
            continue
        if bal is None:
            continue
        GameProvider.objects.filter(pk=p.pk).update(
            last_checked=timezone.now(), last_error="", last_agent_balance=str(bal))
        apply_agent_balance(p, bal)
        n += 1
    return n


def auto_promo(user, amount, lock=False):
    """The best automatic promotion this player qualifies for on this deposit, as
    (promo, bonus) — or (None, 0). One promotion per deposit: the biggest bonus wins."""
    from content.models import Promo
    amount = Decimal(str(amount))
    best = None
    for p in Promo.objects.filter(active=True, auto_apply=True).order_by("sort_order", "id"):
        try:
            bonus = _check_promo(p, user, amount)
        except PromoError:
            continue
        if best is None or bonus > best[1]:
            best = (p, bonus)
    if best and lock:  # re-check under a row lock so a one-time offer can't be claimed twice at once
        locked = Promo.objects.select_for_update().get(pk=best[0].pk)
        try:
            return locked, _check_promo(locked, user, amount)
        except PromoError:
            return None, Decimal("0")
    return best or (None, Decimal("0"))


def apply_gateway(dep, data):
    """Copy gateway fields onto the deposit (no status change)."""
    if not isinstance(data, dict):
        return
    dep.gateway_id = str(data.get("id") or dep.gateway_id or "")
    dep.checkout_url = data.get("checkout_url") or dep.checkout_url or ""
    dep.tag = data.get("tag") or dep.tag or ""
    dep.tag_email = data.get("tag_email") or dep.tag_email or ""
    if data.get("fee_amount") is not None:
        dep.fee_amount = Decimal(str(data["fee_amount"]))
    if data.get("expires_at"):
        from django.utils.dateparse import parse_datetime
        dep.expires_at = parse_datetime(data["expires_at"]) or dep.expires_at


def set_status(dep_id, status, data=None):
    """Move a deposit to the gateway's status; queue the load when paid.
    Safe to call repeatedly with the same status."""
    with transaction.atomic():
        dep = Deposit.objects.select_for_update(of=("self",)).select_related("game", "game__provider").get(pk=dep_id)
        apply_gateway(dep, data or {})
        if data:
            import json
            dep.raw = json.dumps(data, default=str)[:4000]
        dep.last_synced = timezone.now()
        changed = status in Deposit.Status.values and status != dep.status
        if changed and dep.status == Deposit.Status.APPROVED:
            changed = False  # never walk back from paid
        if changed:
            dep.status = status
            if status == Deposit.Status.APPROVED:
                dep.approved_at = timezone.now()
                dep.credit_amount = credit_for(dep.amount, dep.fee_amount) + (dep.bonus_amount or 0)
                s = SiteSettings.load()
                if dep.game and is_automated(dep.game) and s.auto_load:
                    dep.load_status = Deposit.Load.QUEUED
                else:
                    dep.load_status = Deposit.Load.MANUAL
            elif dep.load_status == Deposit.Load.WAITING:
                dep.load_status = Deposit.Load.SKIPPED
        dep.save()
        if changed and dep.load_status == Deposit.Load.QUEUED:
            queue_load(dep.pk)
        if changed:
            on_commit_here(_notify_status, dep.pk)
    return dep


def on_commit_here(fn, *args):
    """transaction.on_commit that keeps the current site (tenant) context —
    the callback may run after we've left use_tenant()."""
    tenant = get_current_tenant()

    def run():
        with use_tenant(tenant):
            fn(*args)
    transaction.on_commit(run)


def queue_load(dep_id):
    tenant = get_current_tenant()
    from django.conf import settings
    if getattr(settings, "GAMING_SYNC_LOADS", False):  # tests
        on_commit_here(run_load, dep_id)
        return

    def start():
        threading.Thread(target=_load_thread, args=(dep_id, tenant), daemon=True).start()
    transaction.on_commit(start)


def _load_thread(dep_id, tenant):
    try:
        with use_tenant(tenant):
            run_load(dep_id)
    except Exception:
        log.exception("deposit %s load crashed", dep_id)
    finally:
        from django.db import connection
        connection.close()


POINTS_PER = 10  # dollars of credits per VIP point


def award_points(user, credits):
    """VIP points for credits that just landed on a game (once per load)."""
    from django.db.models import F
    pts = int(Decimal(str(credits or 0)) // POINTS_PER)
    if pts > 0:
        type(user).objects.filter(pk=user.pk).update(loyalty_points=F("loyalty_points") + pts)


def run_load(dep_id, operator="auto", force=False):
    """Load a paid deposit into its game. Returns the deposit."""
    allowed = {Deposit.Load.QUEUED}
    if force:
        allowed |= {Deposit.Load.FAILED, Deposit.Load.MANUAL}
    with transaction.atomic():
        dep = Deposit.objects.select_for_update(of=("self",)).select_related(
            "user", "game", "game__provider").get(pk=dep_id)
        if dep.status != Deposit.Status.APPROVED or dep.load_status not in allowed:
            return dep
        dep.load_status = Deposit.Load.LOADING
        dep.save(update_fields=["load_status", "updated_at"])
    error = ""
    txn = None
    try:
        login = ensure_login(dep.user, dep.game)
        ok, msg, txn = move_credits(
            login, dep.credit_amount or dep.amount, "load", operator=operator,
            method=dep.method, order_id=f"D{dep.reference}"[:20],
            note=f"Deposit {dep.reference}")
        if not ok:
            error = msg
    except GameError as e:
        error = str(e)
        login = GameLogin.objects.filter(user=dep.user, game=dep.game).first()
    extra = {"credit_amount": txn.amount, "loaded_amount": txn.amount} if txn and not error else {}
    Deposit.objects.filter(pk=dep.pk).update(
        **extra,
        load_status=Deposit.Load.FAILED if error else Deposit.Load.LOADED,
        load_error=error[:300], loaded_at=None if error else timezone.now(),
        game_txn=txn, login=login, updated_at=timezone.now())
    dep.refresh_from_db()
    if dep.load_status == Deposit.Load.LOADED and dep.gateway != "freeplay":
        award_points(dep.user, dep.loaded_amount or dep.credit_amount or dep.amount)
    _notify_load(dep)
    return dep


def sync(dep):
    """Ask BytePayout for the latest status of a pending deposit."""
    if dep.gateway != "bytepayout" or dep.status != Deposit.Status.PENDING:
        return dep
    data = bytepayout.get_deposit(dep.reference)
    return set_status(dep.pk, (data or {}).get("status", dep.status), data)


# ---------------------------------------------------------- notifications

def _push(user, title, body, url):
    try:
        from chat.push import notify
        notify([user.id], title, body, url)
    except Exception:
        pass


def _label(dep):
    if dep.pay_method_id and dep.pay_method:
        return dep.pay_method.name
    from .bytepayout import METHODS
    return METHODS.get(dep.method, dep.method.title())


def _who(dep):
    login = dep.login or (GameLogin.objects.filter(user=dep.user, game=dep.game).first()
                          if dep.game else None)
    return login.username if login else ""


def _notify_status(dep_id):
    from . import notify
    dep = Deposit.objects.select_related("user", "game", "login", "pay_method").filter(pk=dep_id).first()
    if not dep or dep.status == Deposit.Status.PENDING:
        return
    game = dep.game.name if dep.game else "your game"
    if dep.status == Deposit.Status.APPROVED:
        if dep.load_status == Deposit.Load.MANUAL and dep.gateway == "freeplay":
            uname = _who(dep)
            notify.event(
                dep.user, "Free play accepted",
                f"{usd(dep.credit_amount)} of free play for {game}. We're loading it now — "
                "you'll get a message when it's done.", tone="ok",
                staff_text=f"@{dep.user.username} redeemed free play {dep.promo_code} — load "
                           f"{usd(dep.credit_amount)} on {game}: {uname or 'NO USERNAME YET — create one'}")
            _alert_staff(f"🎁 {dep.user.username} redeemed free play {dep.promo_code} — "
                         f"load {usd(dep.credit_amount)} on {game} for {uname or '(needs username)'}")
        elif dep.load_status == Deposit.Load.MANUAL:
            uname = _who(dep)
            notify.event(
                dep.user, "Payment received",
                f"{usd(dep.amount)} by {_label(dep)} for {game}"
                + (f" (username {uname})" if uname else "")
                + ". We're loading it now — you'll get a message when it's done.",
                tone="ok",
                staff_text=f"@{dep.user.username} paid {usd(dep.amount)} ({_label(dep)}) — load "
                           f"{usd(dep.credit_amount or dep.amount)} on {game}: "
                           f"{uname or 'NO USERNAME YET — create one'}")
            _alert_staff(f"💵 {dep.user.username} paid {usd(dep.amount)} ({dep.method}) — "
                         f"load {game} for {uname or '(needs username)'} · ref {dep.reference}")
        return
    if dep.is_direct:
        notify.event(dep.user, "Payment not found",
                     f"We couldn't confirm your {usd(dep.amount)} {_label(dep)} payment for {game}."
                     + (f" {dep.note}" if dep.note else "")
                     + " Reply here if you think this is a mistake.", tone="bad")
        return
    notify.event(dep.user, f"Payment {dep.get_status_display().lower()}",
                 f"Your {usd(dep.amount)} {_label(dep)} payment wasn't completed. You weren't charged.",
                 tone="bad", chat=False)


def direct_submitted(dep):
    """The player says they paid us directly — tell them and the staff."""
    from . import notify
    game = dep.game.name if dep.game else "your game"
    uname = _who(dep)
    notify.event(
        dep.user, "Payment sent for checking",
        f"Thanks! We got your {usd(dep.amount)} {_label(dep)} payment for {game}"
        + (f" (username {uname})" if uname else "")
        + f" · code {dep.code}. We're checking it now — you'll get a message here.",
        staff_text=f"Check {_label(dep)}: @{dep.user.username} says they sent {usd(dep.amount)} "
                   f"for {game} ({uname or 'no username yet'}) · code {dep.code}",
        staff_link="/admin/deposits?tab=check")
    _alert_staff(f"🔎 Check {_label(dep)}: {dep.user.username} says they sent {usd(dep.amount)} "
                 f"for {game} ({uname or 'no username'}) · code {dep.code}")


def _notify_load(dep):
    from . import notify
    game = dep.game.name if dep.game else "your game"
    if dep.load_status == Deposit.Load.LOADED:
        notify.event(dep.user, "Credits loaded",
                     f"{usd(dep.loaded_amount or dep.credit_amount or dep.amount)} in credits is on {game}"
                     + (f" (username {_who(dep)})" if _who(dep) else "") + ". Have fun!",
                     link="/profile#logins", tone="ok")
    else:
        notify.event(dep.user, "Payment received",
                     f"{usd(dep.amount)} for {game} — we're finishing your load now.",
                     tone="ok", staff_text=f"Load failed for @{dep.user.username} on {game}: "
                                           f"{dep.load_error}")
        _alert_staff(f"⚠️ Load failed — {dep.user.username} paid {usd(dep.amount)} "
                     f"for {game} (ref {dep.reference}): {dep.load_error}")


def mark_loaded(dep, staff, note="", amount=None):
    """Staff loaded the credits in the game's own panel. `amount` is what they
    actually put on (defaults to the expected credits); the cash-out rule uses it."""
    with transaction.atomic():
        dep = Deposit.objects.select_for_update(of=("self",)).select_related("user", "game", "login").get(pk=dep.pk)
        if dep.status != Deposit.Status.APPROVED or dep.load_status == Deposit.Load.LOADED:
            return dep
        login = dep.login or (GameLogin.objects.filter(user=dep.user, game=dep.game).first()
                              if dep.game else None)
        loaded = amount if amount is not None else (dep.credit_amount or dep.amount)
        txn = GameTxn.objects.create(
            kind="load", user=dep.user, game=dep.game,
            account_name=login.username if login else "", amount=loaded,
            payment_method=dep.method, order_id=f"D{dep.reference}"[:60],
            operator=staff.username, status="success",
            note=(note or f"Deposit {dep.reference} — loaded by hand")[:200])
        dep.load_status, dep.loaded_at, dep.load_error = Deposit.Load.LOADED, timezone.now(), ""
        dep.loaded_amount = loaded
        dep.game_txn, dep.login = txn, login
        dep.note = f"Loaded by {staff.username}"[:200]
        dep.save()
    if dep.gateway != "freeplay":
        award_points(dep.user, dep.loaded_amount)
    on_commit_here(_notify_load, dep)
    return dep


PAYOUT_LABELS = {"cashapp": "Cash App", "chime": "Chime", "venmo": "Venmo", "paypal": "PayPal",
                 "zelle": "Zelle", "applepay": "Apple Pay", "btc": "Bitcoin", "bitcoin": "Bitcoin"}


def payout_label(method):
    """cashapp → Cash App (settings store short keys)."""
    import re
    return PAYOUT_LABELS.get(re.sub(r"[^a-z]", "", (method or "").lower()), method)


def _alert_staff(text):
    s = SiteSettings.load()
    if not (s.telegram_bot_token and s.telegram_chat_id):
        return
    try:
        import requests
        requests.post(f"https://api.telegram.org/bot{s.telegram_bot_token}/sendMessage",
                      data={"chat_id": s.telegram_chat_id, "text": text}, timeout=8)
    except Exception:
        pass


# ---------------------------------------------------------------- redeems

def approve_redeem(redeem, staff):
    """Take the credits back through the API; staff then pay the player."""
    with transaction.atomic():
        r = Redeem.objects.select_for_update(of=("self",)).select_related(
            "game", "game__provider", "user", "login").get(pk=redeem.pk)
        if r.status != Redeem.Status.PENDING:
            return r
        r.status = Redeem.Status.APPROVED  # claim it before calling out
        r.save(update_fields=["status"])
    login = r.login or GameLogin.objects.filter(user=r.user, game=r.game).first()
    if r.game and is_automated(r.game):
        if not login:
            err = "The player has no account on this game."
            ok, txn = False, None
        else:
            ok, err, txn = move_credits(login, r.amount, "withdraw",
                                        operator=staff.username,
                                        method=r.payout_method,
                                        order_id=f"R{r.pk}T{int(time.time())}"[:20],
                                        note=f"Redeem #{r.pk}")
        r.game_txn = txn
        if not ok:
            r.status, r.error = Redeem.Status.FAILED, err[:300]
    elif r.game:
        # no API: staff redeem in the game panel themselves — keep the ledger
        r.game_txn = GameTxn.objects.create(
            kind="withdraw", user=r.user, game=r.game,
            account_name=login.username if login else "", amount=r.amount,
            payment_method=r.payout_method, order_id=f"R{r.pk}",
            operator=staff.username, status="success",
            note=f"Cash out #{r.pk} — redeemed by hand")
    r.handled_by, r.handled_at = staff, timezone.now()
    r.save()
    from . import notify
    if r.status == Redeem.Status.APPROVED:
        notify.event(r.user, "Cash out approved",
                     f"{usd(r.amount)} from {r.game.name if r.game else 'your game'} is approved — "
                     f"we're sending it to your {payout_label(r.payout_method)} ({r.payout_handle}).",
                     tone="ok")
    return r
