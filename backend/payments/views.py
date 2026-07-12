import time

from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets
from rest_framework.decorators import (action, api_view, authentication_classes,
                                       permission_classes)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminRole
from content.models import SiteSettings
from . import gateway, signing
from .models import Merchant, PayOrder, TransferOrder
from .permissions import IsMerchantOrAdmin, merchant_of
from .serializers import (MerchantSerializer, PayOrderSerializer,
                          TransferOrderSerializer)


def _client_ip(request):
    fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    return (fwd.split(",")[0].strip() if fwd
            else request.META.get("REMOTE_ADDR", ""))


def _resolve_merchant(request):
    """The Merchant the current request acts as (admin may pass ?merchant=id)."""
    if request.user.is_admin_role:
        mid = request.data.get("merchant") or request.query_params.get("merchant")
        return Merchant.objects.filter(pk=mid).first() if mid else None
    return merchant_of(request.user)


def _dollars_to_cents(v):
    return int(round(float(v) * 100))


# ---------- create payment link ----------
@api_view(["POST"])
@permission_classes([IsMerchantOrAdmin])
def create_pay_link(request):
    merchant = _resolve_merchant(request)
    if not merchant:
        return Response({"detail": "No merchant selected."}, status=400)
    s = SiteSettings.load()
    try:
        amount = _dollars_to_cents(request.data.get("amount"))
    except (TypeError, ValueError):
        return Response({"detail": "Invalid amount."}, status=400)
    if amount <= 0:
        return Response({"detail": "Amount must be positive."}, status=400)
    if s.pay_min_amount and amount < s.pay_min_amount:
        return Response({"detail": f"Below minimum ({s.pay_min_amount} cents)."}, status=400)
    if s.pay_max_amount and amount > s.pay_max_amount:
        return Response({"detail": f"Above maximum ({s.pay_max_amount} cents)."}, status=400)

    way_code = (request.data.get("way_code") or "").strip()
    enabled = [w.strip() for w in (s.pay_enabled_waycodes or "").split(",") if w.strip()]
    if enabled and way_code not in enabled:
        return Response({"detail": f"Payment method '{way_code}' not enabled."}, status=400)

    client_id = (request.data.get("client_id") or f"{merchant.code}-{int(time.time())}").strip()
    currency = (request.data.get("currency") or s.pay_currency or "usd").lower()
    mch_order_no = f"P{merchant.id}{gateway.now_ms()}"

    params = {
        "mchOrderNo": mch_order_no,
        "amount": amount,
        "currency": currency,
        "wayCode": way_code,
        "clientIp": _client_ip(request),
        "notifyUrl": request.build_absolute_uri("/api/pay/webhook/"),
        "returnUrl": request.build_absolute_uri("/pay/return"),
        "expiredTime": int(request.data.get("expired_time") or 7200),
        "extParam": str(request.data.get("ext_param") or ""),
        "wayParam": {"clientId": client_id},
    }

    order = PayOrder(merchant=merchant, mch_order_no=mch_order_no, amount=amount,
                     currency=currency, way_code=way_code, client_id=client_id,
                     client_ip=params["clientIp"], fee_percent=merchant.fee_percent,
                     ext_param=params["extParam"])
    try:
        resp = gateway.create_pay(params)
    except gateway.NotConfigured as e:
        return Response({"detail": str(e)}, status=400)
    except Exception as e:
        return Response({"detail": f"Gateway connection error: {e}"}, status=502)

    order.raw = resp
    if resp.get("code") == 0:
        d = resp.get("data") or {}
        order.pay_order_no = d.get("payOrderNo", "")
        order.cashier_url = d.get("cashierUrl", "")
        order.expire_ts = d.get("expireTimestamp")
        order.state = d.get("state", 0)
    else:
        order.state = PayOrder.State.FAILED
        order.err_msg = gateway.message(resp)
    order.save()

    if resp.get("code") != 0:
        return Response({"ok": False, "message": gateway.message(resp),
                         "order": PayOrderSerializer(order).data}, status=400)
    return Response({"ok": True, "cashierUrl": order.cashier_url,
                     "order": PayOrderSerializer(order).data})


# ---------- create payout ----------
@api_view(["POST"])
@permission_classes([IsMerchantOrAdmin])
def create_transfer(request):
    merchant = _resolve_merchant(request)
    if not merchant:
        return Response({"detail": "No merchant selected."}, status=400)
    s = SiteSettings.load()
    try:
        amount = _dollars_to_cents(request.data.get("amount"))
    except (TypeError, ValueError):
        return Response({"detail": "Invalid amount."}, status=400)
    if amount <= 0:
        return Response({"detail": "Amount must be positive."}, status=400)

    way_code = (request.data.get("way_code") or "").strip()
    way_param = request.data.get("way_param") or {}
    if not isinstance(way_param, dict):
        return Response({"detail": "way_param must be an object."}, status=400)
    currency = (request.data.get("currency") or s.pay_currency or "usd").lower()
    mch_order_no = f"T{merchant.id}{gateway.now_ms()}"

    params = {
        "mchOrderNo": mch_order_no, "amount": amount, "currency": currency,
        "wayCode": way_code, "clientIp": _client_ip(request),
        "notifyUrl": request.build_absolute_uri("/api/transfer/webhook/"),
        "expiredTime": int(request.data.get("expired_time") or 7200),
        "reason": str(request.data.get("reason") or ""),
        "extParam": str(request.data.get("ext_param") or ""),
        "wayParam": way_param,
    }
    order = TransferOrder(merchant=merchant, mch_order_no=mch_order_no,
                          amount=amount, currency=currency, way_code=way_code,
                          way_param=way_param, reason=params["reason"],
                          fee_percent=merchant.fee_percent)
    try:
        resp = gateway.create_transfer(params)
    except gateway.NotConfigured as e:
        return Response({"detail": str(e)}, status=400)
    except Exception as e:
        return Response({"detail": f"Gateway connection error: {e}"}, status=502)

    order.raw = resp
    if resp.get("code") == 0:
        d = resp.get("data") or {}
        order.transfer_order_no = d.get("transferOrderNo", "")
        order.state = d.get("state", 0)
    else:
        order.state = TransferOrder.State.FAILED
        order.err_msg = gateway.message(resp)
    order.save()
    ok = resp.get("code") == 0
    return Response({"ok": ok, "message": gateway.message(resp),
                     "order": TransferOrderSerializer(order).data},
                    status=200 if ok else 400)


# ---------- query / close ----------
def _apply_pay_result(order, d):
    """Update a PayOrder from a query/webhook data dict."""
    if "state" in d and d["state"] is not None:
        order.state = int(d["state"])
    order.real_amount = d.get("realAmount", order.real_amount)
    order.channel_order_no = d.get("channelOrderNo") or order.channel_order_no
    order.err_code = d.get("errCode") or order.err_code
    order.err_msg = d.get("errMsg") or order.err_msg
    if d.get("successTime"):
        order.success_time = d["successTime"]
    if order.state == PayOrder.State.SUCCESS:
        order.apply_split()
    order.save()


@api_view(["POST"])
@permission_classes([IsMerchantOrAdmin])
def query_order(request):
    order = _find_order(request, PayOrder)
    if not order:
        return Response({"detail": "Order not found."}, status=404)
    try:
        resp = gateway.query_pay(mch_order_no=order.mch_order_no,
                                 pay_order_no=order.pay_order_no or None)
    except gateway.NotConfigured as e:
        return Response({"detail": str(e)}, status=400)
    except Exception as e:
        return Response({"detail": f"Gateway connection error: {e}"}, status=502)
    if resp.get("code") == 0:
        order.raw = resp
        _apply_pay_result(order, resp.get("data") or {})
    return Response({"ok": resp.get("code") == 0, "message": gateway.message(resp),
                     "order": PayOrderSerializer(order).data})


@api_view(["POST"])
@permission_classes([IsAdminRole])
def close_order(request):
    order = _find_order(request, PayOrder)
    if not order:
        return Response({"detail": "Order not found."}, status=404)
    try:
        resp = gateway.close_pay(mch_order_no=order.mch_order_no,
                                 pay_order_no=order.pay_order_no or None)
    except gateway.NotConfigured as e:
        return Response({"detail": str(e)}, status=400)
    except Exception as e:
        return Response({"detail": f"Gateway connection error: {e}"}, status=502)
    if resp.get("code") == 0:
        order.state = PayOrder.State.CLOSED
        order.save()
    return Response({"ok": resp.get("code") == 0, "message": gateway.message(resp)})


def _find_order(request, model):
    ref = request.data.get("mch_order_no") or request.data.get("id")
    qs = model.objects.all()
    if not request.user.is_admin_role:
        m = merchant_of(request.user)
        qs = qs.filter(merchant__in=[m.id, *m.submerchants.values_list("id", flat=True)]) if m else qs.none()
    return qs.filter(mch_order_no=ref).first() or qs.filter(pk=ref).first()


# ---------- webhooks (public, signed) ----------
def _verify_webhook(request):
    s = SiteSettings.load()
    data = {k: v for k, v in request.data.items()}
    if not s.pay_api_key:
        return None, "not configured"
    try:
        ok = signing.verify_sign(data, s.pay_api_key)
    except ValueError as e:
        return None, str(e)
    return (data if ok else None), (None if ok else "bad signature")


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def pay_webhook(request):
    data, err = _verify_webhook(request)
    if err or data is None:
        return HttpResponse("fail", content_type="text/plain")
    order = PayOrder.objects.filter(
        mch_order_no=data.get("mchOrderNo")).first()
    if not order:
        return HttpResponse("success", content_type="text/plain")  # ack unknown
    order.raw = data
    _apply_pay_result(order, data)
    _notify_order(order, "payment")
    return HttpResponse("success", content_type="text/plain")


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def transfer_webhook(request):
    data, err = _verify_webhook(request)
    if err or data is None:
        return HttpResponse("fail", content_type="text/plain")
    order = TransferOrder.objects.filter(
        mch_order_no=data.get("mchOrderNo")).first()
    if not order:
        return HttpResponse("success", content_type="text/plain")
    order.raw = data
    if data.get("state") is not None:
        order.state = int(data["state"])
    order.err_code = data.get("errCode") or order.err_code
    order.err_msg = data.get("errMsg") or order.err_msg
    if data.get("successTime"):
        order.success_time = data["successTime"]
    if order.state == TransferOrder.State.SUCCESS:
        order.apply_split()
    order.save()
    _notify_order(order, "payout")
    return HttpResponse("success", content_type="text/plain")


def _notify_order(order, kind):
    from content.models import Notification
    from accounts.models import User
    verb = "successful" if order.state == 2 else order.get_state_display().lower()
    txt = f"💳 {kind.title()} {order.mch_order_no}: {verb} (${order.amount/100:.2f})"
    Notification.objects.create(user=order.merchant.user, text=txt,
                                link="/merchant")
    for admin in User.objects.filter(role="admin"):
        Notification.objects.create(user=admin, text=txt, link="/admin/payorders")


# ---------- stats ----------
@api_view(["GET"])
@permission_classes([IsMerchantOrAdmin])
def pay_stats(request):
    from django.db.models import Count, Sum
    if request.user.is_admin_role:
        paid = PayOrder.objects.filter(state=2)
        agg = paid.aggregate(gross=Sum("amount"), platform=Sum("platform_amount"),
                             n=Count("id"))
        return Response({
            "role": "admin",
            "orders": PayOrder.objects.count(),
            "paid": agg["n"] or 0,
            "gross": agg["gross"] or 0,
            "platform_revenue": agg["platform"] or 0,
            "merchants": Merchant.objects.count(),
        })
    m = merchant_of(request.user)
    if not m:
        return Response({"detail": "No merchant profile."}, status=400)
    own = PayOrder.objects.filter(merchant=m, state=2).aggregate(
        gross=Sum("amount"), net=Sum("net_amount"), n=Count("id"))
    sub = PayOrder.objects.filter(merchant__parent=m, state=2).aggregate(
        parent=Sum("parent_amount"), n=Count("id"))
    return Response({
        "role": "merchant",
        "is_sub": m.is_submerchant,
        "fee_percent": str(m.fee_percent),
        "orders": PayOrder.objects.filter(merchant=m).count(),
        "paid": own["n"] or 0,
        "collected": own["gross"] or 0,
        "my_net": own["net"] or 0,
        "sub_earnings": sub["parent"] or 0,
        "sub_paid": sub["n"] or 0,
        "submerchants": m.submerchants.count(),
    })


# ---------- viewsets ----------
class MerchantViewSet(viewsets.ModelViewSet):
    serializer_class = MerchantSerializer
    permission_classes = [IsMerchantOrAdmin]

    def get_queryset(self):
        u = self.request.user
        if u.is_admin_role:
            return Merchant.objects.select_related("user", "parent").all()
        m = merchant_of(u)
        if not m:
            return Merchant.objects.none()
        # a tier-1 merchant manages its own sub-merchants
        return Merchant.objects.filter(parent=m).select_related("user", "parent")

    @action(detail=False, methods=["get"])
    def me(self, request):
        m = merchant_of(request.user)
        if not m:
            return Response({"detail": "Not a merchant."}, status=404)
        return Response(MerchantSerializer(m, context={"request": request}).data)


class PayOrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PayOrderSerializer
    permission_classes = [IsMerchantOrAdmin]

    def get_queryset(self):
        u = self.request.user
        qs = PayOrder.objects.select_related("merchant")
        if u.is_admin_role:
            return qs
        m = merchant_of(u)
        if not m:
            return qs.none()
        ids = [m.id, *m.submerchants.values_list("id", flat=True)]
        return qs.filter(merchant_id__in=ids)


class TransferOrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TransferOrderSerializer
    permission_classes = [IsMerchantOrAdmin]

    def get_queryset(self):
        u = self.request.user
        qs = TransferOrder.objects.select_related("merchant")
        if u.is_admin_role:
            return qs
        m = merchant_of(u)
        if not m:
            return qs.none()
        ids = [m.id, *m.submerchants.values_list("id", flat=True)]
        return qs.filter(merchant_id__in=ids)
