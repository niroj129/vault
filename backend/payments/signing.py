"""Signature helpers for the payment gateway.

Ported verbatim from the gateway's official reference implementation so signing
is byte-for-byte compatible in both directions (request signing + callback
verification). Algorithm: sort non-empty params by ASCII key order into
key=value&... , append "&key=<privateKey>", hash (MD5/SHA1/SHA256), uppercase.
Object values are serialized as compact JSON with sorted keys.
"""

import hashlib
import json
from collections.abc import Mapping


def verify_sign(params: dict, key: str) -> bool:
    """Verify signature of a params dict against the merchant key."""
    if "sign" not in params:
        raise ValueError("Missing 'sign' field in parameters.")
    if "signType" not in params:
        raise ValueError("Missing 'signType' field in parameters.")

    sign = params["sign"]
    sign_type = params["signType"]

    params_copy = params.copy()
    del params_copy["sign"]

    expected_sign = get_sign(get_sign_str(params_copy, key), sign_type)
    return str(sign).upper() == expected_sign.upper()


def sign(params: dict, key: str) -> dict:
    """Return a copy of params with a computed 'sign' field added."""
    if "signType" not in params:
        raise ValueError("Missing 'signType' field in parameters.")

    sign_type = params["signType"]
    sign_value = get_sign(get_sign_str(params, key), sign_type)

    signed_params = params.copy()
    signed_params["sign"] = sign_value
    return signed_params


def get_sign(sign_str: str, sign_type: str) -> str:
    sign_type = str(sign_type).upper()
    if sign_type == "MD5":
        return hashlib.md5(sign_str.encode("utf-8")).hexdigest().upper()
    elif sign_type == "SHA1":
        return hashlib.sha1(sign_str.encode("utf-8")).hexdigest().upper()
    elif sign_type == "SHA256":
        return hashlib.sha256(sign_str.encode("utf-8")).hexdigest().upper()
    else:
        raise ValueError(f"Unsupported signature type: {sign_type}")


def get_sign_str(params: dict, key: str) -> str:
    """Construct the string to sign (excluding the 'sign' field).

    Empty values (None / blank string) are dropped RECURSIVELY — including inside
    nested objects — matching the gateway's stated rule and worked example.
    """
    prepared = _prepare(params)
    items = []
    for k, v in prepared.items():  # already sorted; empties removed
        if k.lower() == "sign":
            continue
        if isinstance(v, (dict, list)):
            v = json.dumps(v, separators=(",", ":"), ensure_ascii=False)
        items.append(f"{k}={v}")

    items.append(f"key={key}")
    return "&".join(items)


def _prepare(obj):
    """Recursively drop empty (None/blank-string) values and sort Map keys."""
    if isinstance(obj, Mapping):
        cleaned = {}
        for k, v in obj.items():
            pv = _prepare(v)
            if pv is None or (isinstance(pv, str) and not pv.strip()):
                continue
            cleaned[str(k)] = pv
        return dict(sorted(cleaned.items()))
    if isinstance(obj, list):
        return [_prepare(i) for i in obj]
    return obj


# Backwards-compatible alias (the reference code exposed this name)
def sort_value_recursively(obj):
    return _prepare(obj)
