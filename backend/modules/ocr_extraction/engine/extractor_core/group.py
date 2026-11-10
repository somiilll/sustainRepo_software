"""Step 3 - collapse repeated items so classification runs once per distinct item, not once per row.

A 10,000-row purchase register usually has a few hundred distinct items; each group gets ONE decision that is
copied back to all its rows.
"""
from __future__ import annotations

import re

from .units import normalize_unit

_NUMERIC_TOKEN = re.compile(r"^\d+([.,]\d+)?(kg|kgs|l|ltr|ltrs|nos|pcs|mt|kl|m3|kwh|g|gm|ml|%)?$")
_DATE = re.compile(r"\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b")


def norm_text(s: str | None) -> str:
    s = (s or "").lower()
    s = _DATE.sub(" ", s)
    s = re.sub(r"[^\w\-/%. ]", " ", s)
    toks = [t.strip(".-/") for t in s.split()]
    toks = [t for t in toks if len(t) > 1 and not _NUMERIC_TOKEN.match(t)]
    return " ".join(toks)[:160]


def norm_vendor(v: str | None) -> str:
    v = re.sub(r"\b(pvt|private|ltd|limited|llp|inc|co|company|m/s|the|india)\b", " ", (v or "").lower())
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", v).split()[:3])


def dimension(item: dict) -> str:
    n = normalize_unit(item.get("unit"))
    if n:
        return n["dimension"]
    return "currency" if item.get("quantity") is None and item.get("amount") is not None else "unknown"


def group_key(item: dict) -> str:
    desc = norm_text(item.get("description_en") or item.get("description"))
    if not desc:
        desc = norm_text(item.get("context"))
    return "|".join([desc, dimension(item), norm_vendor(item.get("vendor")), (item.get("hsn") or "")[:4],
                     norm_text(item.get("notes"))[:40] if not item.get("vendor") else ""])


def memory_keys(item: dict) -> tuple[str, str]:
    """(exact key incl. vendor, description-only key) used for org memory lookups."""
    desc = norm_text(item.get("description_en") or item.get("description"))
    return f"x:{desc}|{dimension(item)}|{norm_vendor(item.get('vendor'))}", f"d:{desc}|{dimension(item)}"


def group_items(items: list[dict]) -> list[dict]:
    groups: dict[str, dict] = {}
    for it in items:
        k = group_key(it)
        it["group_key"] = k
        g = groups.get(k)
        if g is None:
            groups[k] = {"key": k, "rep": it, "item_ids": [it["item_id"]]}
        else:
            g["item_ids"].append(it["item_id"])
    return list(groups.values())
