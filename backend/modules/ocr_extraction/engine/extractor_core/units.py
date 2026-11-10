"""Number and unit parsing for Indian bills and registers (lakh separators, Ltrs, KL, MT, SCM, kVAh...)."""
from __future__ import annotations

import re

from .config import load

_NUM = re.compile(r"[-+]?\d[\d,]*\.?\d*(?:[eE][-+]?\d+)?")


def parse_number(val) -> float | None:
    """'1,50,000.50' -> 150000.5 ; '₹ 436' -> 436 ; '(120)' -> -120 ; '12.5 KL' -> 12.5 ; '' / '-' / 'NA' -> None."""
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s.lower() in {"-", "--", "na", "n/a", "nil", "none", "null", "#n/a", "#value!"}:
        return None
    neg = s.startswith("(") and s.endswith(")")
    m = _NUM.search(s.replace(" ", ""))
    if not m:
        return None
    try:
        v = float(m.group(0).replace(",", ""))
    except ValueError:
        return None
    return -v if neg else v


def _clean(u: str) -> str:
    u = str(u).strip().lower().replace("³", "3").replace("²", "2")
    u = re.sub(r"^(in|per)\s+", "", u)
    u = u.strip(" .()[]")
    return re.sub(r"\s+", " ", u)


def normalize_unit(raw) -> dict | None:
    """Raw unit -> {'unit': canonical, 'factor': x, 'dimension': d, 'warning': str|None} or None if unknown."""
    if raw is None:
        return None
    cfg = load().units
    u = _clean(raw)
    if not u:
        return None
    warn = None
    for k, msg in cfg["warn_units"].items():
        if k in u:
            warn = msg
    aliases = cfg["aliases"]
    cand = [u, u.replace(".", ""), u.rstrip("s"), u.replace(" ", ""), u.replace(".", "").rstrip("s")]
    for c in cand:
        if c in aliases:
            canon, factor = aliases[c]
            return {"unit": canon, "factor": factor, "dimension": cfg["canonical"][canon]["dimension"], "warning": warn}
    if warn:
        return {"unit": "nos", "factor": 1, "dimension": "count", "warning": warn}
    return None


def to_canonical(qty: float | None, raw_unit) -> tuple[float | None, str | None, str | None, str | None]:
    """(quantity in canonical unit, canonical unit, dimension, warning)."""
    n = normalize_unit(raw_unit)
    if qty is None or n is None:
        return qty, (n or {}).get("unit"), (n or {}).get("dimension"), (n or {}).get("warning")
    return qty * n["factor"], n["unit"], n["dimension"], n["warning"]


def emergent_unit(canonical: str | None) -> str | None:
    if not canonical:
        return None
    return load().units["canonical"].get(canonical, {}).get("emergent_unit", canonical)


UNIT_IN_HEADER = re.compile(r"[\(\[]\s*([A-Za-z₹.$/ 0-9³]{1,12})\s*[\)\]]|\bin\s+([A-Za-z.]{1,8})\b", re.I)


def unit_from_header(header: str) -> str | None:
    """'Diesel (Ltrs)' -> 'Ltrs' ; 'Qty in KL' -> 'KL' ; 'Amount (Rs.)' -> 'Rs.'"""
    if not header:
        return None
    for m in UNIT_IN_HEADER.finditer(str(header)):
        u = (m.group(1) or m.group(2) or "").strip()
        if normalize_unit(u):
            return u
    return None
