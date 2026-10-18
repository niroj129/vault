"""Player self-service (accounts, deposits, redeems), staff tools and the
BytePayout webhook."""

import logging
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from accounts.models import User
from accounts.permissions import IsAdminOrAgent, IsAdminRole
from catalog.models import Game, GameLogin
from content.models import SiteSettings
from tenants.context import use_tenant

from mailin.service import evidence as mail_evidence

from . import bytepayout, cashout, service
from .service import usd
from .models import Deposit, GameProvider, PayMethod, Redeem
from .providers import FIELDS, ApiError, NotSupported, adapter_for, egress_ip

log = logging.getLogger(__name__)


def bad(detail, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": detail}, status=code)


def payments_on(request):
    t = getattr(request, "tenant", None)
    return t is None or t.feature_payments


class PayThrottle(UserRateThrottle):
    scope = "pay"
    rate = "12/min"


class AccountThrottle(UserRateThrottle):
    scope = "game_account"
    rate = "6/min"


def media(f):
    return f.url if f else None


# ------------------------------------------------------------ serializers

def login_dict(lg, reveal=True):
    return {"id": lg.id, "username": lg.username,
            "password": lg.password if reveal else None,
            "note": lg.note, "platform_user_id": lg.platform_user_id,
            "created_via_api": lg.created_via_api,
            "last_balance": lg.last_balance, "last_balance_at": lg.last_balance_at}


def game_brief(g):
    return {"id": g.id, "name": g.name, "slug": g.slug,
            "thumbnail": media(g.thumbnail), "logo": media(g.logo),
            "play_url": g.user_link or g.play_url}


def replaced_methods(direct):
    """BytePayout method keys that an active QR method has taken over."""
    return {m.replaces for m in direct if m.replaces}


def pay_method_dict(m, staff=False):
    out = {"id": m.id, "key": m.key, "name": m.name, "handle": m.handle,
           "account_name": m.account_name, "qr": media(m.qr),
           "instructions": m.instructions, "min": m.min_amount, "max": m.max_amount,
           "amounts": m.amounts(), "proof": m.proof}
    if staff:
        out.update(is_active=m.is_active, sort_order=m.sort_order,
                   quick_amounts=m.quick_amounts,
                   deposit_count=m.deposits.count())
    return out


def deposit_dict(d, staff=False):
    direct = d.is_direct
    label = d.get_status_display()
    if direct and d.status == Deposit.Status.PENDING:
        label = "Checking payment"
    elif direct and d.status == Deposit.Status.REJECTED:
        label = "Not found"
    out = {
        "id": d.id, "reference": d.reference, "code": d.code, "method": d.method,
        "method_label": ("Free play" if d.gateway == "freeplay" else d.pay_method.name if d.pay_method_id and d.pay_method
                         else bytepayout.METHODS.get(d.method, d.method.title())),
        "free_play": d.gateway == "freeplay",
        "direct": direct, "proof": media(d.proof), "player_note": d.player_note,
        "reason": d.note if direct and d.status == Deposit.Status.REJECTED else "",
        "pay_to": ({"handle": d.pay_method.handle, "account_name": d.pay_method.account_name,
                    "qr": media(d.pay_method.qr)} if direct and d.pay_method_id and d.pay_method else None),
        "amount": d.amount, "fee_amount": d.fee_amount,
        "credit_amount": d.credit_amount, "promo_code": d.promo_code,
        "bonus_amount": d.bonus_amount, "status": d.status,
        "status_label": label, "load_status": d.load_status,
        "load_label": d.get_load_status_display(),
        "checkout_url": d.checkout_url, "tag": d.tag, "tag_email": d.tag_email,
        "expires_at": d.expires_at, "created_at": d.created_at,
        "approved_at": d.approved_at, "loaded_at": d.loaded_at, "loaded_amount": d.loaded_amount,
        "game": game_brief(d.game) if d.game else None,
    }
    if staff and d.game:
        out["game"]["automated"] = service.is_automated(d.game)
    if staff:
        out.update(user={"id": d.user_id, "username": d.user.username,
                         "full_name": d.user.full_name},
                   load_error=d.load_error, gateway=d.gateway,
                   gateway_id=d.gateway_id, note=d.note,
                   created_by=d.created_by.username if d.created_by else "",
                   login=d.login.username if d.login else _saved_login(d),
                   checked_by=d.checked_by.username if d.checked_by_id and d.checked_by else "",
                   last_synced=d.last_synced,
                   emails=[mail_evidence(e) for e in d.emails.all()][:3] if d.is_direct else [])
    return out


def _saved_login(d):
    """A username staff (or the player) saved after this deposit was made."""
    if not d.game_id:
        return ""
    lg = GameLogin.objects.filter(user_id=d.user_id, game_id=d.game_id).only("username").first()
    return lg.username if lg else ""


def _redeem_rule(r, s=None):
    """The load a cash out was measured against, and the range it allowed."""
    if not r.deposit_id or not r.deposit:
        return None
    s = s or SiteSettings.load()
    lim = cashout.limits(r.deposit, s)
    return {**lim, "within": lim["min"] <= r.amount <= lim["max"],
            "load": {"reference": r.deposit.reference, "amount": r.deposit.amount,
                     "loaded_amount": r.deposit.loaded_amount, "loaded_at": r.deposit.loaded_at}}


def redeem_dict(r, staff=False, s=None):
    out = {"id": r.id, "amount": r.amount, "payout_method": r.payout_method,
           "payout_label": service.payout_label(r.payout_method),
           "payout_handle": r.payout_handle, "status": r.status,
           "status_label": r.get_status_display(), "note": r.note,
           "created_at": r.created_at, "handled_at": r.handled_at,
           "proof": media(r.proof), "player_proof": media(r.player_proof),
           "game": game_brief(r.game) if r.game else None,
           "rule": _redeem_rule(r, s)}
    if staff:
        out.update(user={"id": r.user_id, "username": r.user.username,
                         "full_name": r.user.full_name},
                   error=r.error, login=r.login.username if r.login else "",
                   handled_by=r.handled_by.username if r.handled_by else "")
    return out


# ------------------------------------------------------------- player side

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def play_options(request):
    """Everything the Load / Redeem screens need in one call."""
    s = SiteSettings.load()
    on = payments_on(request)
    pay = on and bytepayout.configured(s)
    direct = list(PayMethod.objects.filter(is_active=True)) if on else []
    # an active QR method takes over the gateway's method it replaces (e.g. your Cash App QR)
    taken = replaced_methods(direct)
    logins = {lg.game_id: lg for lg in GameLogin.objects.filter(user=request.user)}
    games = []
    for g in Game.objects.filter(status="active").select_related("provider").order_by("sort_order", "name"):
        auto = service.is_automated(g)
        lg = logins.get(g.id)
        games.append(dict(game_brief(g), automated=auto, self_serve=g.self_serve,
                          login=login_dict(lg) if lg else None,
                          cashout=cashout.public(cashout.check(request.user, g, s)) if lg else None))
    return Response({
        "payments_on": pay or bool(direct),
        "methods": [{"key": m, "label": bytepayout.METHODS[m],
                     "amounts": bytepayout.AMOUNTS[m]}
                    for m in bytepayout.enabled_methods(s)
                    if m not in taken]
                   if pay else [],
        "direct_methods": [pay_method_dict(m) for m in direct],
        "bonus_percent": s.load_bonus_percent,
        "auto_load": s.auto_load,
        "redeem": {"enabled": s.redeem_enabled, "min": s.redeem_min, "proof": s.redeem_proof,
                   "rule": {"enabled": s.cashout_rule_enabled, "min_x": s.cashout_min_x,
                            "max_x": s.cashout_max_x, "min_basis": s.cashout_min_basis,
                            "max_basis": s.cashout_max_basis,
                            "freeplay": {"enabled": s.freeplay_cashout_enabled,
                                         "min_x": s.freeplay_cashout_min_x,
                                         "max_x": s.freeplay_cashout_max_x}},
                   "methods": [m.strip() for m in s.redeem_methods.split(",") if m.strip()]},
        "games": games,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AccountThrottle])
def create_my_account(request):
    """Player creates their own account on a game (API games only)."""
    game = get_object_or_404(Game.objects.select_related("provider"),
                             pk=request.data.get("game"), status="active")
    uname = (request.data.get("username") or "").strip()[:120]
    if uname and not service.is_automated(game):
        # player already has an account on this game — remember it
        if GameLogin.objects.filter(user=request.user, game=game).exists():
            return bad("You already saved a username for this game.")
        login = GameLogin.objects.create(user=request.user, game=game, username=uname,
                                         note="Added by the player")
        return Response({"game": game_brief(game), "login": login_dict(login)},
                        status=status.HTTP_201_CREATED)
    if not (game.self_serve and service.is_automated(game)):
        return bad("Ask support to set up this game for you.")
    try:
        login = service.ensure_login(request.user, game)
    except service.GameError as e:
        return bad(f"Couldn't create your {game.name} account: {e}")
    return Response({"game": game_brief(game), "login": login_dict(login)},
                    status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_balance(request, login_id):
    login = get_object_or_404(GameLogin.objects.select_related("game", "game__provider"),
                              pk=login_id, user=request.user)
    if not service.is_automated(login.game):
        return Response({"balance": login.last_balance or None, "live": False})
    try:
        res = service.live_balance(login)
    except service.GameError as e:
        return bad(str(e))
    return Response({"balance": res.balance, "live": True, "play_url": res.play_url})


def _promo_for(request, user, amount, lock=False):
    """The (promo, bonus) a deposit asked for with promo_code, or (None, 0).
    A code that doesn't work is an error the player sees, never silently dropped."""
    code = (request.data.get("promo_code") or "").strip()
    if not code:  # no code typed: an automatic promotion may still apply
        promo, bonus = service.auto_promo(user, amount, lock=lock)
        return promo, bonus, None
    try:
        promo, bonus = service.promo_quote(user, code, amount, lock=lock)
    except service.PromoError as e:
        return None, Decimal("0"), bad(str(e))
    return promo, bonus, None


def _promo_label(promo):
    return (promo.code.upper() or "AUTO") if promo else ""


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def promo_check(request):
    """Preview a promo code against a deposit amount (nothing is saved). With no
    code it previews the automatic promotion this player would get, if any."""
    if not PayThrottle().allow_request(request, None):
        return bad("Too many tries — wait a minute.", 429)
    code = (request.data.get("code") or "").strip()
    try:
        amount = Decimal(str(request.data.get("amount")))
        assert amount > 0
    except Exception:
        if not code:
            return Response({"valid": False})
        return bad("Pick an amount first, then apply the code.")
    if code:
        try:
            promo, bonus = service.promo_quote(request.user, code, amount)
        except service.PromoError as e:
            return bad(str(e))
    else:
        promo, bonus = service.auto_promo(request.user, amount)
        if not promo:
            return Response({"valid": False})
    credits = service.credit_for(amount, 0) + bonus
    return Response({"valid": True, "auto": not code, "code": _promo_label(promo), "title": promo.title,
                     "bonus": bonus, "credits": credits, "usage": promo.usage})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def redeem_freeplay(request):
    """Redeem a free play code: credits go on the chosen game with no payment."""
    if not PayThrottle().allow_request(request, None):
        return bad("Too many tries — wait a minute.", 429)
    game = get_object_or_404(Game.objects.select_related("provider"),
                             pk=request.data.get("game"), status="active")
    login = _player_login(request, game)
    try:
        with transaction.atomic():
            dep = service.redeem_freeplay(request.user, request.data.get("code"), game, login)
    except service.PromoError as e:
        return bad(str(e))
    dep.reference = f"{getattr(request, 'tenant', None) and request.tenant.slug or 'site'}-{dep.reference}"[:64]
    dep.save(update_fields=["reference"])
    return Response(deposit_dict(dep), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def admin_sync_points(request):
    """Pull the agent points from every connected game platform now."""
    return Response({"synced": service.sync_points()})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def my_deposits(request):
    if request.method == "GET":
        rows = Deposit.objects.filter(user=request.user).select_related("game", "pay_method")[:50]
        return Response([deposit_dict(d) for d in rows])
    return start_deposit(request)


def start_deposit(request):
    if not PayThrottle().allow_request(request, None):
        return bad("Too many payment attempts — wait a minute.", 429)
    if not payments_on(request):
        return bad("Online payments aren't available on this site.", 403)
    if request.data.get("pay_method"):
        return start_direct_deposit(request)
    s = SiteSettings.load()
    method = request.data.get("method")
    if method not in bytepayout.enabled_methods(s):
        return bad("Pick a payment method.")
    if method in replaced_methods(PayMethod.objects.filter(is_active=True)):
        return bad("This site takes that app through its own QR. Pick it again from the list.")
    try:
        amount = Decimal(str(request.data.get("amount")))
    except (InvalidOperation, TypeError):
        return bad("Pick an amount.")
    if not bytepayout.allowed(method, amount):
        return bad(bytepayout.ERRORS["invalid_amount"])
    game = get_object_or_404(Game.objects.select_related("provider"),
                             pk=request.data.get("game"), status="active")
    # one open checkout at a time per game keeps players from stacking payments
    open_dep = Deposit.objects.filter(user=request.user, game=game,
                                      status=Deposit.Status.PENDING,
                                      created_at__gte=timezone.now() - timedelta(minutes=30)).first()
    if open_dep and open_dep.checkout_url and request.data.get("replace") not in (True, "true", "1"):
        return Response(dict(deposit_dict(open_dep), reused=True))
    login = _player_login(request, game)
    with transaction.atomic():
        promo, bonus, err = _promo_for(request, request.user, amount, lock=True)
        if err:
            return err
        dep = Deposit.objects.create(user=request.user, game=game, method=method,
                                     amount=amount, credit_amount=service.credit_for(amount, 0, s) + bonus,
                                     login=login, bp_account=bytepayout.credentials(s)[3],
                                     promo=promo, promo_code=_promo_label(promo),
                                     bonus_amount=bonus)
    dep.reference = f"{getattr(request, 'tenant', None) and request.tenant.slug or 'site'}-{dep.reference}"[:64]
    dep.save(update_fields=["reference"])
    return_url = request.data.get("return_url") or ""
    if not return_url.startswith(("http://", "https://")):
        return_url = request.build_absolute_uri("/load")
    return_url += ("&" if "?" in return_url else "?") + f"ref={dep.reference}"
    try:
        data = bytepayout.create_deposit(method, amount, f"u{request.user.id}",
                                         dep.reference, return_url)
    except bytepayout.PayError as e:
        Deposit.objects.filter(pk=dep.pk).update(status=Deposit.Status.FAILED,
                                                 load_status=Deposit.Load.SKIPPED,
                                                 note=str(e)[:200])
        return bad(str(e), status.HTTP_502_BAD_GATEWAY)
    dep = service.set_status(dep.pk, data.get("status") or "pending", data)
    return Response(deposit_dict(dep), status=status.HTTP_201_CREATED)


def _player_login(request, game):
    login = GameLogin.objects.filter(user=request.user, game=game).first()
    uname = (request.data.get("game_username") or "").strip()[:120]
    if not login and uname:
        # player tells us their existing username on this game
        login = GameLogin.objects.create(user=request.user, game=game, username=uname,
                                         note="Added by the player")
    return login


def _proof(request):
    from chat.messenger import clean_image
    from django.core.exceptions import ValidationError
    try:
        return clean_image(request.FILES.get("proof")), None
    except ValidationError as e:
        return None, bad(e.messages[0] if e.messages else "That file isn't an image.")


def start_direct_deposit(request):
    """Player paid the site's own Chime/Cash App… and taps "I've paid"."""
    m = get_object_or_404(PayMethod, pk=request.data.get("pay_method"), is_active=True)
    try:
        amount = Decimal(str(request.data.get("amount"))).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        return bad("Enter the amount you sent.")
    if not (m.min_amount <= amount <= m.max_amount):
        return bad(f"{m.name} payments are ${m.min_amount:g}–${m.max_amount:g}.")
    game = get_object_or_404(Game.objects.select_related("provider"),
                             pk=request.data.get("game"), status="active")
    proof, err = _proof(request)
    if err:
        return err
    if m.proof == PayMethod.Proof.REQUIRED and not proof:
        return bad("Add a screenshot of your payment so we can find it fast.")
    waiting = Deposit.objects.filter(user=request.user, gateway="direct",
                                     status=Deposit.Status.PENDING).count()
    if waiting >= 3:
        return bad("You already have payments we're checking — give us a minute.")
    login = _player_login(request, game)
    with transaction.atomic():
        promo, bonus, err = _promo_for(request, request.user, amount, lock=True)
        if err:
            return err
        dep = Deposit.objects.create(
            user=request.user, game=game, method=m.key, pay_method=m, amount=amount,
            credit_amount=service.credit_for(amount, 0) + bonus, login=login, gateway="direct",
            proof=proof, player_note=(request.data.get("player_note") or "").strip()[:200],
            promo=promo, promo_code=_promo_label(promo), bonus_amount=bonus)
    dep.reference = f"{getattr(request, 'tenant', None) and request.tenant.slug or 'site'}-{dep.reference}"[:64]
    dep.save(update_fields=["reference"])
    service.on_commit_here(service.direct_submitted, Deposit.objects.select_related(
        "user", "game", "login", "pay_method").get(pk=dep.pk))
    return Response(deposit_dict(dep), status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def my_deposit(request, ref):
    dep = get_object_or_404(Deposit.objects.select_related("game", "pay_method"),
                            reference=ref, user=request.user)
    if request.method == "POST":  # add / replace the payment screenshot
        if not (dep.is_direct and dep.status == Deposit.Status.PENDING):
            return bad("This payment can't be changed now.")
        proof, err = _proof(request)
        if err:
            return err
        if not proof:
            return bad("Pick a screenshot.")
        dep.proof = proof
        dep.save(update_fields=["proof", "updated_at"])
        return Response(deposit_dict(dep))
    stale = not dep.last_synced or timezone.now() - dep.last_synced > timedelta(seconds=15)
    if dep.status == Deposit.Status.PENDING and stale:
        try:
            dep = service.sync(dep)
        except bytepayout.PayError:
            pass
    return Response(deposit_dict(dep))


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def my_redeems(request):
    if request.method == "GET":
        rows = Redeem.objects.filter(user=request.user).select_related("game", "deposit")[:50]
        s = SiteSettings.load()
        return Response([redeem_dict(r, s=s) for r in rows])
    s = SiteSettings.load()
    if not s.redeem_enabled:
        return bad("Redeems are handled by support on this site.")
    try:
        amount = Decimal(str(request.data.get("amount")))
    except (InvalidOperation, TypeError):
        return bad("Enter an amount.")
    if amount < s.redeem_min:
        return bad(f"The minimum redeem is ${s.redeem_min}.")
    method = (request.data.get("payout_method") or "").strip()[:30]
    handle = (request.data.get("payout_handle") or "").strip()[:120]
    if not method or not handle:
        return bad("Tell us where to send the money.")
    game = get_object_or_404(Game, pk=request.data.get("game"))
    login = GameLogin.objects.filter(user=request.user, game=game).first()
    if not login:
        return bad("You don't have an account on this game yet.")
    if Redeem.objects.filter(user=request.user, status=Redeem.Status.PENDING).count() >= 3:
        return bad("You already have redeems waiting for staff.")
    shot, err = _proof(request) if s.redeem_proof != "off" else (None, None)
    if err:
        return err
    if s.redeem_proof == "required" and not shot:
        return bad("Attach a screenshot of your game balance.")
    with transaction.atomic():
        # lock the player's loads on this game so two requests can't use the same one
        list(Deposit.objects.select_for_update().filter(user=request.user, game=game).values_list("pk", flat=True))
        rule = cashout.check(request.user, game, s)
        if rule["enabled"]:
            if not rule["ok"]:
                return bad(rule["reason"])
            if not rule["min"] <= amount <= rule["max"]:
                return bad(f"For your last {game.name} load you can cash out between "
                           f"{usd(rule['min'])} and {usd(rule['max'])}.")
        r = Redeem.objects.create(user=request.user, game=game, login=login, amount=amount,
                                  deposit=rule["deposit"] if rule["enabled"] else None, player_proof=shot,
                                  payout_method=method, payout_handle=handle,
                                  note=(request.data.get("note") or "")[:300])
    service._alert_staff(f"💸 Redeem request: {request.user.username} wants {usd(amount)} "
                         f"from {game.name} to {method} {handle}")
    from . import notify
    notify.event(request.user, "Cash out requested",
                 f"{usd(amount)} from {game.name} (username {login.username}) to your {service.payout_label(method)} "
                 f"{handle}. We'll confirm here shortly.",
                 staff_text=f"@{request.user.username} wants {usd(amount)} from {game.name} "
                            f"({login.username}) → {service.payout_label(method)} {handle}",
                 staff_link="/admin/redeems")
    return Response(redeem_dict(r), status=status.HTTP_201_CREATED)


# --------------------------------------------------------------- webhook

@csrf_exempt
@require_POST
def bytepayout_webhook(request):
    """deposit.* events. The deposit is found by our reference (which also
    names the site), so one webhook URL can serve every site."""
    raw = request.body
    data = bytepayout.parse(raw)
    if not isinstance(data, dict):
        return HttpResponse("bad json", status=400)
    d = data.get("data") or {}
    dep = None
    if d.get("reference"):
        dep = Deposit.all_tenants.filter(reference=d["reference"]).select_related("tenant").first()
    if not dep and d.get("id"):
        dep = Deposit.all_tenants.filter(gateway_id=str(d["id"])).select_related("tenant").first()
    if not dep:
        return HttpResponse("unknown deposit", status=200)  # ack; nothing to do
    with use_tenant(dep.tenant):
        secret = bytepayout.credentials()[2]
        if not bytepayout.valid_signature(raw, request.headers.get("X-Bytepayout-Signature", ""), secret):
            log.warning("bytepayout webhook: bad signature for %s", dep.reference)
            return HttpResponse("bad signature", status=401)
        status_ = d.get("status") or (data.get("event") or "").replace("deposit.", "")
        service.set_status(dep.pk, status_, d)
    return HttpResponse("ok")


# ------------------------------------------------------------- staff side

class ProviderSerializer(serializers.ModelSerializer):
    game_count = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    agent_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    secret_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField()
    has_secret = serializers.SerializerMethodField()

    class Meta:
        model = GameProvider
        fields = ["id", "name", "kind", "kind_label", "base_url", "agent_name",
                  "agent_password", "secret_key", "app_id", "token_upper",
                  "ms_timestamp", "account_prefix", "use_doh", "force_ip",
                  "proxy_url", "last_egress_ip",
                  "is_active", "last_agent_balance", "last_checked", "last_error",
                  "game_count", "has_password", "has_secret"]
        read_only_fields = ["last_agent_balance", "last_checked", "last_error",
                            "last_egress_ip"]

    def get_game_count(self, o):
        return o.games.count()

    def get_has_password(self, o):
        return bool(o.agent_password)

    def get_has_secret(self, o):
        return bool(o.secret_key)

    def update(self, instance, validated):
        # blank secret fields on edit mean "keep the saved one"
        for f in ("agent_password", "secret_key"):
            if not validated.get(f):
                validated.pop(f, None)
        return super().update(instance, validated)


class ProviderViewSet(viewsets.ModelViewSet):
    serializer_class = ProviderSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        return GameProvider.objects.all()

    def perform_create(self, ser):
        provider = ser.save()
        service.link_games(provider)

    @action(detail=False, methods=["get"])
    def kinds(self, request):
        return Response([{"value": k, "label": l, "fields": FIELDS[k]}
                         for k, l in GameProvider.Kind.choices])

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        p = self.get_object()
        try:
            ip = egress_ip(p)
        except ApiError as e:
            GameProvider.objects.filter(pk=p.pk).update(last_checked=timezone.now(),
                                                        last_error=str(e)[:300])
            return Response({"ok": False, "message": str(e), "egress_ip": None}, status=400)
        GameProvider.objects.filter(pk=p.pk).update(last_egress_ip=ip)
        try:
            res = adapter_for(p).agent_balance()
            ok, msg, bal = res.ok, res.message, res.balance
        except (ApiError, NotSupported) as e:
            ok, msg, bal = False, str(e), None
        GameProvider.objects.filter(pk=p.pk).update(
            last_checked=timezone.now(), last_error="" if ok else msg[:300],
            **({"last_agent_balance": str(bal)} if ok and bal is not None else {}))
        if ok and bal is not None:
            try:
                service.apply_agent_balance(p, Decimal(str(bal).replace(",", "").replace("$", "")))
            except (InvalidOperation, ValueError):
                pass
        if not ok and "whitelist" in msg.lower():
            msg = f"{msg} — the platform sees IP {ip}. Whitelist it, or add a US proxy."
        return Response({"ok": ok, "message": msg, "agent_balance": bal, "egress_ip": ip},
                        status=200 if ok else 400)


class PayMethodSerializer(serializers.ModelSerializer):
    deposit_count = serializers.SerializerMethodField()
    key = serializers.CharField(read_only=True)

    class Meta:
        model = PayMethod
        fields = ["id", "key", "name", "replaces", "handle", "account_name", "qr", "instructions",
                  "min_amount", "max_amount", "quick_amounts", "proof", "is_active",
                  "sort_order", "deposit_count"]

    def get_deposit_count(self, o):
        return o.deposits.count()

    def validate_qr(self, f):
        from chat.messenger import clean_image
        from django.core.exceptions import ValidationError
        try:
            return clean_image(f)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages[0])

    def validate(self, data):
        lo = data.get("min_amount", getattr(self.instance, "min_amount", 1))
        hi = data.get("max_amount", getattr(self.instance, "max_amount", 500))
        if lo <= 0 or hi < lo:
            raise serializers.ValidationError("The maximum must be at least the minimum.")
        return data


class PayMethodViewSet(viewsets.ModelViewSet):
    """The site's own payment accounts (Chime QR, Cash App…)."""
    serializer_class = PayMethodSerializer
    permission_classes = [IsAdminRole]

    def get_queryset(self):
        return PayMethod.objects.all()

    def perform_update(self, ser):
        if self.request.data.get("clear_qr") in ("1", "true", True):
            ser.save(qr=None)
        else:
            ser.save()


def staff_redeems(user):
    qs = Redeem.objects.select_related("user", "game", "login", "handled_by", "deposit")
    if not user.is_admin_role:
        qs = qs.filter(user__agent=user)
    return qs


def staff_deposits(user):
    qs = Deposit.objects.select_related("user", "game", "login", "created_by",
                                        "pay_method", "checked_by").prefetch_related("emails")
    if not user.is_admin_role:
        qs = qs.filter(user__agent=user)
    return qs


@api_view(["GET", "POST"])
@permission_classes([IsAdminOrAgent])
def admin_deposits(request):
    if request.method == "POST":
        return record_payment(request)
    qs = staff_deposits(request.user)
    p = request.query_params
    if p.get("status"):
        qs = qs.filter(status=p["status"])
    if p.get("load_status"):
        qs = qs.filter(load_status__in=p["load_status"].split(","))
    if p.get("gateway"):
        qs = qs.filter(gateway=p["gateway"])
    if (p.get("user") or "").isdigit():
        qs = qs.filter(user_id=int(p["user"]))
    if p.get("q"):
        q = p["q"].strip()
        qs = qs.filter(Q(reference__icontains=q) | Q(user__username__icontains=q)
                       | Q(game__name__icontains=q))
    try:
        limit = max(1, min(int(p.get("limit") or 200), 200))
    except ValueError:
        limit = 200
    today = timezone.localdate()
    base = staff_deposits(request.user)
    paid = base.filter(status=Deposit.Status.APPROVED)
    return Response({
        "summary": {
            "paid_today": paid.filter(approved_at__date=today).aggregate(s=Sum("amount"))["s"] or 0,
            "paid_count_today": paid.filter(approved_at__date=today).count(),
            "pending": base.filter(status=Deposit.Status.PENDING, gateway="bytepayout").count(),
            "to_check": base.filter(status=Deposit.Status.PENDING, gateway="direct").count(),
            "needs_staff": base.filter(status=Deposit.Status.APPROVED,
                                       load_status__in=[Deposit.Load.FAILED, Deposit.Load.MANUAL]).count(),
            "redeems_waiting": staff_redeems(request.user).filter(status=Redeem.Status.PENDING).count(),
        },
        "results": [deposit_dict(d, staff=True) for d in qs[:limit]],
    })


def record_payment(request):
    """Staff record money taken another way (cash, agent) and load it."""
    user = get_object_or_404(User, pk=request.data.get("user"))
    if not request.user.is_admin_role and user.agent_id != request.user.id:
        return bad("Not one of your players.", 403)
    game = get_object_or_404(Game.objects.select_related("provider"), pk=request.data.get("game"))
    try:
        amount = Decimal(str(request.data.get("amount")))
        assert amount > 0
    except Exception:
        return bad("Enter an amount.")
    proof, err = _proof(request)
    if err:
        return err
    with transaction.atomic():
        promo, bonus, err = _promo_for(request, user, amount, lock=True)
        if err:
            return err
        dep = Deposit.objects.create(
        user=user, game=game, method=(request.data.get("method") or "cash")[:20],
        amount=amount, credit_amount=amount + bonus, gateway="manual", proof=proof,
        promo=promo, promo_code=_promo_label(promo), bonus_amount=bonus,
        status=Deposit.Status.APPROVED, approved_at=timezone.now(),
        load_status=Deposit.Load.QUEUED if service.is_automated(game) else Deposit.Load.MANUAL,
        created_by=request.user, note=(request.data.get("note") or "")[:200])
    if dep.load_status == Deposit.Load.QUEUED:
        dep = service.run_load(dep.pk, operator=request.user.username)
    return Response(deposit_dict(dep, staff=True), status=status.HTTP_201_CREATED)


def _loaded_amount(request):
    """Credits staff say they put on the game; None = the expected credits."""
    v = request.data.get("loaded_amount")
    if v in (None, ""):
        return None, None
    try:
        v = Decimal(str(v)).quantize(Decimal("0.01"))
        assert v > 0
    except Exception:
        return None, bad("Enter the credits you loaded.")
    return v, None


@api_view(["POST"])
@permission_classes([IsAdminOrAgent])
def admin_deposit_action(request, pk, act):
    dep = get_object_or_404(staff_deposits(request.user), pk=pk)
    if act == "sync":
        try:
            dep = service.sync(dep)
        except bytepayout.PayError as e:
            return bad(str(e))
    elif act == "retry":
        if dep.status != Deposit.Status.APPROVED:
            return bad("Only paid deposits can be loaded.")
        if dep.load_status == Deposit.Load.LOADED:
            return bad("Already loaded.")
        dep = service.run_load(dep.pk, operator=request.user.username, force=True)
    elif act == "mark-loaded":
        if dep.status != Deposit.Status.APPROVED:
            return bad("Only paid deposits can be marked loaded.")
        loaded, err = _loaded_amount(request)
        if err:
            return err
        dep = service.mark_loaded(dep, request.user, request.data.get("note") or "", amount=loaded)
    elif act == "approve":
        # payment confirmed outside the gateway (e.g. staff checked their app)
        if not (request.user.is_admin_role or dep.is_direct):
            return bad("Admins only.", 403)
        if dep.status not in (Deposit.Status.PENDING, Deposit.Status.APPROVED):
            return bad("This payment was already closed.")
        amount = request.data.get("amount")
        if amount and dep.status == Deposit.Status.PENDING:
            # the player sent a different amount than they said
            try:
                amount = Decimal(str(amount)).quantize(Decimal("0.01"))
                assert amount > 0
            except Exception:
                return bad("Enter the amount you received.")
            Deposit.objects.filter(pk=dep.pk).update(amount=amount)
        dep = service.set_status(dep.pk, Deposit.Status.APPROVED)
        Deposit.objects.filter(pk=dep.pk).update(
            note=f"Approved by {request.user.username}"[:200], checked_by=request.user)
        dep.refresh_from_db()
        if request.data.get("loaded") in (True, "true", "1") and dep.load_status != Deposit.Load.QUEUED:
            loaded, err = _loaded_amount(request)
            if err:
                return err
            dep = service.mark_loaded(dep, request.user, amount=loaded)
    elif act == "reject":
        if dep.status != Deposit.Status.PENDING or not dep.is_direct:
            return bad("Only payments waiting for a check can be declined.")
        Deposit.objects.filter(pk=dep.pk).update(
            note=(request.data.get("note") or "")[:200], checked_by=request.user)
        dep = service.set_status(dep.pk, Deposit.Status.REJECTED)
    else:
        return bad("Unknown action.")
    if dep.load_status == Deposit.Load.QUEUED:
        dep = service.run_load(dep.pk, operator=request.user.username)
    return Response(deposit_dict(dep, staff=True))


@api_view(["GET"])
@permission_classes([IsAdminRole])
def gateway_balance(request):
    if bytepayout.credentials()[3] == "owner":
        # the site is on the owner's account: show what's held for this site, never the owner's whole balance
        from tenants.bpledger import held
        return Response({"ok": True, "held": True, "data": {"balance": held(request.tenant.id)["balance"], "currency": "USD"}})
    try:
        return Response({"ok": True, "data": bytepayout.balance()})
    except bytepayout.PayError as e:
        return Response({"ok": False, "detail": str(e)})


@api_view(["GET"])
@permission_classes([IsAdminOrAgent])
def admin_redeems(request):
    qs = staff_redeems(request.user)
    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    if (request.query_params.get("user") or "").isdigit():
        qs = qs.filter(user_id=int(request.query_params["user"]))
    s = SiteSettings.load()
    return Response([redeem_dict(r, staff=True, s=s) for r in qs[:200]])


@api_view(["GET"])
@permission_classes([IsAdminOrAgent])
def agent_summary(request):
    """The numbers at the top of the agent console (an agent's own players; an admin sees the whole site)."""
    me = request.user
    players = User.objects.filter(role="user")
    if not me.is_admin_role:
        players = players.filter(agent=me)
    deps = staff_deposits(me)
    today = timezone.localdate()
    return Response({
        "players": players.count(),
        "active_players": players.filter(is_active=True).count(),
        "to_load": deps.filter(status=Deposit.Status.APPROVED,
                               load_status__in=[Deposit.Load.FAILED, Deposit.Load.MANUAL]).count(),
        "to_check": deps.filter(status=Deposit.Status.PENDING, gateway="direct").count(),
        "cashouts_waiting": staff_redeems(me).filter(status=Redeem.Status.PENDING).count(),
        "loaded_today": deps.filter(status=Deposit.Status.APPROVED, approved_at__date=today)
                            .exclude(gateway="freeplay").aggregate(s=Sum("amount"))["s"] or 0,
    })


@api_view(["POST"])
@permission_classes([IsAdminOrAgent])
def admin_redeem_action(request, pk, act):
    qs = Redeem.objects.select_related("user", "game", "game__provider", "login", "deposit")
    if not request.user.is_admin_role:
        qs = qs.filter(user__agent=request.user)
    r = get_object_or_404(qs, pk=pk)
    if act == "approve":
        r = service.approve_redeem(r, request.user)
    elif act == "reject" and r.status in (Redeem.Status.PENDING, Redeem.Status.FAILED):
        r.status, r.handled_by, r.handled_at = Redeem.Status.REJECTED, request.user, timezone.now()
        r.note = (request.data.get("note") or r.note)[:300]
        r.save()
        from . import notify
        notify.event(r.user, "Cash out declined",
                     f"Your {usd(r.amount)} cash out from {r.game.name if r.game else 'your game'} "
                     f"was declined. {r.note}".strip(), tone="bad")
    elif act == "paid" and r.status == Redeem.Status.APPROVED:
        proof, err = _proof(request)
        if err:
            return err
        r.status, r.handled_by, r.handled_at = Redeem.Status.PAID, request.user, timezone.now()
        if proof:
            r.proof = proof
        r.save()
        from . import notify
        notify.event(r.user, "Cash out sent",
                     f"{usd(r.amount)} was sent to your {service.payout_label(r.payout_method)} ({r.payout_handle}). ✓"
                     + (" Here's the receipt." if r.proof else ""),
                     tone="ok", image=r.proof.name if r.proof else None)
    elif act == "proof":
        # staff add or replace a screenshot at any stage; once it's paid the player gets it as a receipt
        proof, err = _proof(request)
        if err:
            return err
        if not proof:
            return bad("Choose a screenshot to upload.")
        r.proof = proof
        r.save(update_fields=["proof"])
        if r.status == Redeem.Status.PAID:
            from . import notify
            notify.event(r.user, "Cash out receipt",
                         f"Here's the receipt for your {usd(r.amount)} cash out to {service.payout_label(r.payout_method)} ({r.payout_handle}).",
                         tone="ok", image=r.proof.name)
    elif act == "retry" and r.status == Redeem.Status.FAILED:
        r.status, r.error = Redeem.Status.PENDING, ""
        r.save()
        r = service.approve_redeem(r, request.user)
    else:
        return bad("That action isn't available now.")
    return Response(redeem_dict(r, staff=True))


@api_view(["POST"])
@permission_classes([IsAdminOrAgent])
def staff_login_action(request):
    """Game-account tools for staff: create (by API), balance, load,
    withdraw, reset password, kick."""
    act = request.data.get("action")
    if act == "create":
        user = get_object_or_404(User, pk=request.data.get("user"))
        if not request.user.is_admin_role and user.agent_id != request.user.id:
            return bad("Not one of your players.", 403)
        game = get_object_or_404(Game.objects.select_related("provider"), pk=request.data.get("game"))
        try:
            login = service.ensure_login(user, game)
        except service.GameError as e:
            return bad(str(e))
        return Response({"ok": True, "login": login_dict(login)})
    qs = GameLogin.objects.select_related("game", "game__provider", "user")
    if not request.user.is_admin_role:
        qs = qs.filter(user__agent=request.user)
    login = get_object_or_404(qs, pk=request.data.get("login"))
    try:
        if act == "balance":
            res = service.live_balance(login)
            return Response({"ok": True, "balance": res.balance, "play_url": res.play_url})
        if act in ("load", "withdraw"):
            amount = Decimal(str(request.data.get("amount") or 0))
            if amount <= 0:
                return bad("Enter an amount.")
            ok, msg, txn = service.move_credits(login, amount, act, operator=request.user.username,
                                                method=request.data.get("method") or "staff")
            return Response({"ok": ok, "message": msg}, status=200 if ok else 400)
        ad = service.adapter(login.game)
        if act == "reset":
            from .providers import make_password
            pw = request.data.get("password") or make_password()
            res = service._call(ad.reset_password, login, pw)
            if res.ok:
                GameLogin.objects.filter(pk=login.pk).update(password=pw)
            return Response({"ok": res.ok, "message": res.message,
                             "password": pw if res.ok else None}, status=200 if res.ok else 400)
        if act == "kick":
            res = service._call(ad.kick, login)
            return Response({"ok": res.ok, "message": res.message}, status=200 if res.ok else 400)
    except (service.GameError, InvalidOperation) as e:
        return bad(str(e))
    return bad("Unknown action.")


@api_view(["GET"])
@permission_classes([IsAdminRole])
def payments_overview(request):
    """Counts for the dashboard."""
    base = Deposit.objects.all()
    return Response({
        "needs_staff": base.filter(status=Deposit.Status.APPROVED,
                                   load_status__in=[Deposit.Load.FAILED, Deposit.Load.MANUAL]).count(),
        "redeems_waiting": Redeem.objects.filter(status=Redeem.Status.PENDING).count(),
        "by_method": list(base.filter(status=Deposit.Status.APPROVED)
                          .values("method").annotate(n=Count("id"), total=Sum("amount"))),
    })
