"""Platform console API (admin): work with any connected game platform by its login names.

The player tools in views.py start from a site player. These start from the platform:
list the connections, look up any account by its game username (even one that was never
created from this site), create accounts, and link an existing account to a site player so
loads and cash outs are recorded against someone.
"""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsAdminRole
from casino_backend.search import token_filter
from catalog.models import Game, GameLogin

from . import service
from .models import GameProvider
from .providers import make_account, make_password


def bad(msg, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": msg}, status=code)


def _providers():
    return GameProvider.objects.exclude(kind=GameProvider.Kind.MANUAL)


def platform_dict(p):
    games = list(Game.objects.filter(provider=p).values("id", "name"))
    return {
        "id": p.id, "name": p.name, "kind": p.kind, "kind_label": p.get_kind_display(),
        "is_active": p.is_active, "agent_balance": p.last_agent_balance or None,
        "last_checked": p.last_checked, "last_error": p.last_error, "games": games,
        "accounts": GameLogin.objects.filter(game__provider=p).count(),
    }


def login_payload(lg):
    return {"id": lg.id, "user": lg.user_id, "game": lg.game_id, "game_name": lg.game.name,
            "username": lg.username, "password": lg.password, "note": lg.note,
            "updated_at": lg.updated_at,
            "player": {"id": lg.user_id, "username": lg.user.username, "full_name": lg.user.full_name}}


def _login_for(provider, username):
    return (GameLogin.objects.filter(game__provider=provider, username__iexact=username)
            .select_related("user", "game").first())


def _lookup(provider, username):
    """Ask the platform about an account by its game username. Returns
    (found, balance, platform_id, play_url, message). Raises GameError on transport trouble."""
    ad = service.adapter_for(provider)
    tmp = GameLogin(username=username)  # transient: never saved
    if getattr(ad, "needs_platform_id", False):
        pid = service._call(ad.find_platform_id, tmp)
        if not pid:
            return False, None, "", "", "No account with that name on this platform."
        tmp.platform_user_id = str(pid)
    res = service._call(ad.balance, tmp)
    if not res.ok:
        return False, None, "", "", res.message or "That account wasn't found."
    return True, res.balance, res.platform_user_id or tmp.platform_user_id, res.play_url or "", ""


def _game_for(provider, game_id=None):
    games = Game.objects.filter(provider=provider)
    return games.filter(pk=game_id).first() if game_id else games.order_by("id").first()


@api_view(["GET"])
@permission_classes([IsAdminRole])
def platform_list(request):
    return Response([platform_dict(p) for p in _providers().order_by("name")])


@api_view(["POST"])
@permission_classes([IsAdminRole])
def platform_lookup(request, pk):
    provider = get_object_or_404(_providers(), pk=pk)
    username = (request.data.get("username") or "").strip()
    if not username:
        return bad("Enter the game login name.")
    try:
        found, balance, pid, play_url, msg = _lookup(provider, username)
    except service.GameError as e:
        return bad(str(e))
    lg = _login_for(provider, username)
    return Response({
        "found": found, "message": msg, "username": username, "balance": balance,
        "platform_user_id": pid, "play_url": play_url,
        "login": login_payload(lg) if lg else None,
    })


def _new_player(username, full_name=""):
    base = "".join(c for c in username.lower() if c.isalnum() or c in "_.-")[:26] or "player"
    name, n = base, 0
    while User.objects.filter(username__iexact=name).exists():
        n += 1
        name = f"{base}{n}"
    pw = make_password()
    user = User(username=name, full_name=full_name[:150], role="user")
    user.set_password(pw)
    user.save()
    return user, pw


def _target_player(request, username):
    """(player, site_password_or_None, error_response). `user` links to an existing player;
    `new_player` makes one named after the game account."""
    if request.data.get("new_player") in (True, "true", "1", 1):
        player, pw = _new_player(username, (request.data.get("full_name") or "").strip())
        return player, pw, None
    uid = request.data.get("user")
    if not uid:
        return None, None, None
    return get_object_or_404(User, pk=uid, role="user"), None, None


@api_view(["POST"])
@permission_classes([IsAdminRole])
def platform_create(request, pk):
    """Create an account on the platform, and optionally tie it to a site player."""
    provider = get_object_or_404(_providers(), pk=pk)
    ad = service.adapter_for(provider)
    username = (request.data.get("username") or "").strip()
    if not username:
        return bad("Enter a login name for the new account.")
    lo, hi = getattr(ad, "account_min", 3), getattr(ad, "account_max", 32)
    if not lo <= len(username) <= hi:
        return bad(f"{provider.name} login names are {lo}–{hi} characters.")
    password = (request.data.get("password") or "").strip() or make_password()
    game = _game_for(provider, request.data.get("game"))
    try:
        with transaction.atomic():
            player, site_pw, err = _target_player(request, username)
            if err:
                return err
            if player and not game:
                return bad("Link a game to this connection first (Games & images → Loading), then create accounts for players.")
            if player and GameLogin.objects.filter(user=player, game=game).exists():
                return bad(f"@{player.username} already has a {game.name} account.")
            res = service._call(ad.create_account, username, password)
            if not res.ok:
                transaction.set_rollback(True)
                return bad(res.message or "The platform refused to create it.")
            lg = None
            if player:
                lg = GameLogin.objects.create(user=player, game=game, username=res.account or username, password=password,
                                              platform_user_id=res.platform_user_id or "", created_via_api=True)
    except service.GameError as e:
        return bad(str(e))
    return Response({"ok": True, "username": res.account or username, "password": password,
                     "login": login_payload(GameLogin.objects.select_related("user", "game").get(pk=lg.pk)) if lg else None,
                     "site_password": site_pw}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def platform_link(request, pk):
    """Tie an account that already exists on the platform to a site player (or a new one)."""
    provider = get_object_or_404(_providers(), pk=pk)
    username = (request.data.get("username") or "").strip()
    if not username:
        return bad("Enter the game login name.")
    game = _game_for(provider, request.data.get("game"))
    if not game:
        return bad("Link a game to this connection first (Games & images → Loading).")
    if _login_for(provider, username):
        return bad("That account is already linked to a player.")
    try:
        found, balance, pid, _play, msg = _lookup(provider, username)
    except service.GameError as e:
        return bad(str(e))
    if not found:
        return bad(msg or "That account wasn't found on the platform.")
    with transaction.atomic():
        player, site_pw, err = _target_player(request, username)
        if err:
            return err
        if not player:
            return bad("Choose a player, or create one.")
        if GameLogin.objects.filter(user=player, game=game).exists():
            return bad(f"@{player.username} already has a {game.name} account.")
        lg = GameLogin.objects.create(user=player, game=game, username=username, platform_user_id=pid or "",
                                      last_balance="" if balance is None else str(balance))
    return Response({"ok": True, "login": login_payload(GameLogin.objects.select_related("user", "game").get(pk=lg.pk)),
                     "site_password": site_pw}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAdminRole])
def platform_accounts(request, pk):
    """Every account on this platform that's tied to a site player (last known balances)."""
    provider = get_object_or_404(_providers(), pk=pk)
    qs = GameLogin.objects.filter(game__provider=provider).select_related("user", "game").order_by("username")
    qs = token_filter(qs, request.query_params.get("q"), ["username", "user__username", "user__full_name"])
    return Response([dict(login_payload(lg), last_balance=lg.last_balance or None, last_balance_at=lg.last_balance_at)
                     for lg in qs[:300]])


@api_view(["GET"])
@permission_classes([IsAdminRole])
def platform_history(request, pk):
    """Everything we recorded for one account: the game ledger (loads and redeems sent to the
    platform), plus the payments and cash outs behind them. Only accounts tied to a player have any."""
    from django.db.models import Q, Sum

    from content.models import GameTxn
    from .models import Deposit, Redeem
    provider = get_object_or_404(_providers(), pk=pk)
    username = (request.query_params.get("username") or "").strip()
    lg = _login_for(provider, username) if username else None
    if not lg:
        return Response({"linked": False, "transactions": [], "activity": [], "totals": {"loaded": 0, "redeemed": 0, "paid": 0, "cashed_out": 0}})
    txns = GameTxn.objects.filter(user=lg.user, game=lg.game, account_name__iexact=lg.username)
    ok = txns.filter(status="success")
    rows = [{"id": t.id, "kind": t.kind, "amount": t.amount, "status": t.status, "method": t.payment_method,
             "operator": t.operator, "balance_after": t.user_balance or None, "order_id": t.order_id,
             "note": t.note, "created_at": t.created_at} for t in txns[:150]]
    deposits = Deposit.objects.filter(user=lg.user, game=lg.game).order_by("-created_at")[:60]
    redeems = Redeem.objects.filter(user=lg.user, game=lg.game).order_by("-created_at")[:60]
    activity = [{
        "key": f"d{d.id}", "type": "freeplay" if d.gateway == "freeplay" else "load", "at": d.created_at,
        "amount": d.credit_amount if d.gateway == "freeplay" else d.amount, "credits": d.credit_amount,
        "method": "Free play" if d.gateway == "freeplay" else d.method, "status": d.status, "load_status": d.load_status,
        "promo": d.promo_code, "bonus": d.bonus_amount} for d in deposits
    ] + [{
        "key": f"r{r.id}", "type": "cashout", "at": r.created_at, "amount": r.amount, "credits": r.amount,
        "method": r.payout_method, "status": r.status, "load_status": "", "promo": "", "bonus": 0} for r in redeems]
    # what staff did straight on the account (no payment behind it): redeems and free credits
    activity += [{
        "key": f"t{t.id}", "type": "redeem" if t.kind == "withdraw" else "freeload", "at": t.created_at, "amount": t.amount,
        "credits": t.amount, "method": t.payment_method or "staff", "status": "paid", "load_status": "", "promo": "", "bonus": 0,
    } for t in ok.filter(Q(kind="withdraw") | Q(payment_method="staff"))[:60]]
    activity.sort(key=lambda a: a["at"], reverse=True)
    paid = Deposit.objects.filter(user=lg.user, game=lg.game, status="approved").exclude(gateway="freeplay").aggregate(s=Sum("amount"))["s"] or 0
    cashed = Redeem.objects.filter(user=lg.user, game=lg.game, status__in=["approved", "paid"]).aggregate(s=Sum("amount"))["s"] or 0
    return Response({
        "linked": True, "transactions": rows, "activity": activity,
        "totals": {"loaded": ok.filter(kind="load").aggregate(s=Sum("amount"))["s"] or 0,
                   "redeemed": ok.filter(kind="withdraw").aggregate(s=Sum("amount"))["s"] or 0,
                   "paid": paid, "cashed_out": cashed}})
