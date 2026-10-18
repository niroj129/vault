"""Cash-out rule: a player may cash out between min× and max× their last load
on that game (what staff loaded, or what the player paid — admin picks).
Each load backs one cash out; a declined cash out frees the load again."""
from decimal import Decimal, ROUND_DOWN, ROUND_UP

from content.models import SiteSettings
from .models import Deposit, Redeem

# cash outs that still "use" their load (declined ones don't)
ACTIVE = [Redeem.Status.PENDING, Redeem.Status.APPROVED, Redeem.Status.PAID, Redeem.Status.FAILED]
CENT = Decimal("0.01")


def base_of(dep, basis):
    if basis == "deposit":
        return dep.amount
    return dep.loaded_amount if dep.loaded_amount is not None else (dep.credit_amount or dep.amount)


def last_load(user, game):
    return (Deposit.objects.filter(user=user, game=game, status=Deposit.Status.APPROVED,
                                   load_status=Deposit.Load.LOADED)
            .order_by("-loaded_at", "-created_at").first())


def limits(dep, s):
    """(base, min, max) for a load under the current settings."""
    base = base_of(dep, s.cashout_basis)
    lo = (base * s.cashout_min_x).quantize(CENT, ROUND_UP)
    hi = (base * s.cashout_max_x).quantize(CENT, ROUND_DOWN)
    return base, max(lo, Decimal(s.redeem_min)), hi


def check(user, game, s=None):
    """What this player may cash out from this game right now.
    {enabled, ok, reason, min, max, base, basis, deposit}"""
    s = s or SiteSettings.load()
    out = {"enabled": s.cashout_rule_enabled, "ok": True, "reason": "", "basis": s.cashout_basis,
           "min_x": s.cashout_min_x, "max_x": s.cashout_max_x,
           "min": Decimal(s.redeem_min), "max": None, "base": None, "deposit": None}
    if not s.cashout_rule_enabled:
        return out
    dep = last_load(user, game)
    if not dep:
        return dict(out, ok=False, reason=f"Load {game.name} first. You can cash out after a load.")
    if dep.redeems.filter(status__in=ACTIVE).exists():
        return dict(out, ok=False, deposit=dep,
                    reason=f"You've already cashed out your last {game.name} load. Load again to cash out again.")
    base, lo, hi = limits(dep, s)
    out.update(deposit=dep, base=base, min=lo, max=hi)
    if lo > hi:
        out.update(ok=False, reason=f"Your last load is too small to cash out (minimum cash out is ${s.redeem_min}).")
    return out


def public(rule):
    """JSON-safe version for the API."""
    d = rule["deposit"]
    out = {k: rule[k] for k in ("enabled", "ok", "reason", "basis", "min_x", "max_x", "min", "max", "base")}
    out["load"] = {"reference": d.reference, "amount": d.amount, "loaded_amount": d.loaded_amount,
                   "loaded_at": d.loaded_at} if d else None
    return out
