"""Admin endpoints that proxy the external game-platform API and record
shift-tracked deposit/withdraw ledger entries."""

import time

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from . import gameapi
from .models import GameTxn
from .serializers import GameTxnSerializer
from .shifts import shift_for


def _safe(fn, *a, **k):
    try:
        return fn(*a, **k), None
    except gameapi.NotConfigured as e:
        return None, str(e)
    except Exception as e:  # transport / timeout
        return None, f"Connection error: {e}"


@api_view(["GET"])
@permission_classes([IsAdminRole])
def status(request):
    from .models import SiteSettings
    s = SiteSettings.load()
    configured = bool(s.game_api_url and s.game_api_agent_id and s.game_api_secret)
    resp = {"configured": configured, "agent_balance": None, "error": None}
    if configured:
        data, err = _safe(gameapi.agent_balance)
        if err:
            resp["error"] = err
        elif data and data.get("code") == 0:
            resp["agent_balance"] = (data.get("data") or {}).get("agent_balance")
        else:
            resp["error"] = gameapi.message(data)
    return Response(resp)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def add_user(request):
    data, err = _safe(gameapi.add_user, request.data.get("account"),
                      request.data.get("login_pwd"))
    if err:
        return Response({"detail": err}, status=400)
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def get_user_id(request):
    data, err = _safe(gameapi.get_user_id, request.data.get("account_name"))
    if err:
        return Response({"detail": err}, status=400)
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def recharge(request):
    return _load_or_withdraw(request, "load")


@api_view(["POST"])
@permission_classes([IsAdminRole])
def withdraw(request):
    return _load_or_withdraw(request, "withdraw")


def _load_or_withdraw(request, kind):
    user_id = request.data.get("user_id")
    amount = request.data.get("amount")
    payment_method = request.data.get("payment_method", "")
    account = request.data.get("account_name", "")
    order_id = request.data.get("order_id") or f"{kind[:3]}{int(time.time())}"
    fn = gameapi.recharge if kind == "load" else gameapi.withdraw
    data, err = _safe(fn, user_id, amount, order_id)
    label, ndate = shift_for()

    if err:
        return Response({"detail": err}, status=400)
    ok = data and data.get("code") == 0
    d = (data or {}).get("data") or {}
    txn = GameTxn.objects.create(
        kind=kind, account_name=account, platform_user_id=str(user_id or ""),
        amount=amount or 0, payment_method=payment_method, order_id=order_id,
        platform_txn_id=d.get("transaction_id", ""),
        agent_balance=str(d.get("agent_balance", "")),
        user_balance=str(d.get("user_balance", "")),
        operator=request.user.username, shift=label, nepal_date=ndate,
        status="success" if ok else "failed",
        note="" if ok else gameapi.message(data))
    return Response({"ok": ok, "platform": data, "message": gameapi.message(data),
                     "txn": GameTxnSerializer(txn).data},
                    status=200 if ok else 400)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def user_balance(request):
    data, err = _safe(gameapi.user_balance, request.data.get("user_id"))
    if err:
        return Response({"detail": err}, status=400)
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def low_deposit(request):
    data, err = _safe(gameapi.low_deposit_users,
                      request.data.get("query_date"),
                      request.data.get("page", 1),
                      request.data.get("page_size", 20))
    if err:
        return Response({"detail": err}, status=400)
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def reset_password(request):
    data, err = _safe(gameapi.reset_password, request.data.get("user_id"),
                      request.data.get("login_pwd"))
    if err:
        return Response({"detail": err}, status=400)
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAdminRole])
def player_offline(request):
    data, err = _safe(gameapi.player_offline, request.data.get("user_id"))
    if err:
        return Response({"detail": err}, status=400)
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminRole])
def shift_report(request):
    """All game-platform load/withdraw activity for one Nepal day, grouped by
    shift and payment method. ?date=YYYY-MM-DD (defaults to today Nepal)."""
    from datetime import date as date_cls
    from .shifts import nepal_now
    qdate = request.query_params.get("date") or nepal_now().date().isoformat()
    txns = GameTxn.objects.filter(nepal_date=qdate)
    shifts = {}
    for label in ["Morning (5-1)", "Evening (1-9)", "Night (9-5)"]:
        rows = [t for t in txns if t.shift == label]
        loads = sum(float(t.amount) for t in rows if t.kind == "load")
        wds = sum(float(t.amount) for t in rows if t.kind == "withdraw")
        by_method = {}
        for t in rows:
            m = t.payment_method or "—"
            by_method.setdefault(m, {"load": 0.0, "withdraw": 0.0})
            by_method[m][t.kind] += float(t.amount)
        shifts[label] = {
            "loads": loads, "withdraws": wds, "net": loads - wds,
            "count": len(rows), "by_method": by_method,
            "txns": GameTxnSerializer(rows, many=True).data,
        }
    total_loads = sum(s["loads"] for s in shifts.values())
    total_wd = sum(s["withdraws"] for s in shifts.values())
    return Response({
        "date": qdate, "shifts": shifts,
        "total_loads": total_loads, "total_withdraws": total_wd,
        "net": total_loads - total_wd, "count": txns.count(),
    })
