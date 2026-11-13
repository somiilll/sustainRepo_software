"""Strict value parsing for table cells.

A value is a number, or a number written with its currency / unit / multiplier ('12.5 KL', 'Rs. 678987', '30000 ruppe', '(500)').
Anything else - an identifier ('fac1', 'INV-2024-001'), a period ('2026-09', 'FY 26-27'), free text with a digit in it - is NOT a value,
so it can never be mistaken for a quantity or an amount. Currencies and multipliers come from mappings/parsing.json, units from unit_aliases.json.
"""
from __future__ import annotations

import math
import re

from .config import load
from .units import normalize_unit, parse_locale_number

_CELL = re.compile(r"\s*(?P<pre>[^\d\s(\-+]{0,12}?)\.?\s*(?P<open>[-(]?)\s*(?P<num>\d[\d,.'’]*\d|\d)\s*\)?\s*(?P<suf>[^\d]{0,16}?)\s*")


def _known(token: str) -> bool:
    t = token.strip(" .").lower()
    if not t or t == "-":
        return True
    p = load().parsing
    return t in p["currencies"] or t in p["multipliers"] or normalize_unit(t) is not None


def parse_value(cell, decimal_comma: bool | None = None) -> float | None:
    if cell is None or isinstance(cell, bool) or hasattr(cell, "strftime"):
        return None
    if isinstance(cell, (int, float)):
        return float(cell) if math.isfinite(cell) else None
    m = _CELL.fullmatch(str(cell))
    if not m or not _known(m["pre"]) or not all(_known(x) for x in re.split(r"[\s/]+", m["suf"]) if x):
        return None
    v = parse_locale_number(m["num"], decimal_comma)
    return None if v is None else -v if m["open"] in ("-", "(") else v


def cell_unit(cell) -> tuple[str, dict] | None:
    """The unit (or currency) a text cell carries, as (token, normalised): '500 kg' -> ('kg', {dimension: mass}), 'Rs 500' -> ('Rs', {dimension: currency})."""
    if not isinstance(cell, str):
        return None
    m = _CELL.fullmatch(cell)
    if not m:
        return None
    for tok in [m["pre"].strip(" ."), *re.split(r"[\s/]+", m["suf"])]:
        if tok and (n := normalize_unit(tok)):
            return tok, n
    return None
