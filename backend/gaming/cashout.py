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


def last_load(user, game, s=None):
    """The player's most recent finished load on this game. Free play counts only when the
    site lets players cash out free play."""
    s = s or SiteSettings.load()
    qs = Deposit.objects.filter(user=user, game=game, status=Deposit.Status.APPROVED,
                                load_status=Deposit.Load.LOADED)
    if not s.freeplay_cashout_enabled:
        qs = qs.exclude(gateway="freeplay")
    return qs.order_by("-loaded_at", "-created_at").first()


def limits(dep, s):
    """The range one load allows, under the current settings:
    {min_x, max_x, min_basis, max_basis, min_base, max_base, min, max, free_play}.
    A normal load multiplies what staff loaded or what the player paid — the minimum and
    the maximum can each use either. Free play multiplies the free credits, by the
    site's free play rule or the code's own."""
    if dep.gateway == "freeplay":
        promo = dep.promo
        lo_x = promo.freeplay_min_x if promo and promo.freeplay_min_x is not None else s.freeplay_cashout_min_x
        hi_x = promo.freeplay_max_x if promo and promo.freeplay_max_x is not None else s.freeplay_cashout_max_x
        lo_basis = hi_basis = "loaded"
    else:
        lo_x, hi_x, lo_basis, hi_basis = s.cashout_min_x, s.cashout_max_x, s.cashout_min_basis, s.cashout_max_basis
    lo_base, hi_base = base_of(dep, lo_basis), base_of(dep, hi_basis)
    lo = (lo_base * lo_x).quantize(CENT, ROUND_UP)
    hi = (hi_base * hi_x).quantize(CENT, ROUND_DOWN)
    return {"min_x": lo_x, "max_x": hi_x, "min_basis": lo_basis, "max_basis": hi_basis,
            "min_base": lo_base, "max_base": hi_base, "min": max(lo, Decimal(s.redeem_min)),
            "max": hi, "free_play": dep.gateway == "freeplay"}


def check(user, game, s=None):
    """What this player may cash out from this game right now.
    {enabled, ok, reason, min, max, min_x, max_x, min_basis, max_basis, min_base, max_base,
     free_play, deposit}"""
    s = s or SiteSettings.load()
    out = {"enabled": s.cashout_rule_enabled, "ok": True, "reason": "", "free_play": False,
           "min_x": s.cashout_min_x, "max_x": s.cashout_max_x,
           "min_basis": s.cashout_min_basis, "max_basis": s.cashout_max_basis,
           "min_base": None, "max_base": None,
           "min": Decimal(s.redeem_min), "max": None, "deposit": None}
    if not s.cashout_rule_enabled:
        return out
    dep = last_load(user, game, s)
    if not dep:
        return dict(out, ok=False, reason=f"Load {game.name} first. You can cash out after a load.")
    if dep.redeems.filter(status__in=ACTIVE).exists():
        return dict(out, ok=False, deposit=dep, free_play=dep.gateway == "freeplay",
                    reason=f"You've already cashed out your last {game.name} load. Load again to cash out again.")
    lim = limits(dep, s)
    out.update(lim, deposit=dep)
    if lim["min"] > lim["max"]:
        out.update(ok=False, reason=f"Your last load is too small to cash out (minimum cash out is ${s.redeem_min}).")
    return out


KEYS = ("enabled", "ok", "reason", "min_x", "max_x", "min_basis", "max_basis", "min_base", "max_base",
        "min", "max", "free_play")


def public(rule):
    """JSON-safe version for the API."""
    d = rule["deposit"]
    out = {k: rule[k] for k in KEYS}
    out["load"] = {"reference": d.reference, "amount": d.amount, "loaded_amount": d.loaded_amount,
                   "loaded_at": d.loaded_at} if d else None
    return out
