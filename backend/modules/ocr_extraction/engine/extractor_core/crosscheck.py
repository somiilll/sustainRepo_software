"""Independent, row-level validation of table-layout results.

The layout reader maps columns by their (guessed) headers. This module re-reads the SAME source row with the row-by-row reader
(code only, no AI) and compares description, values, unit and facility field by field. It does not need every field to agree:
a row is rejected when its description or its values contradict the source row, or when the result is semantically wrong
(a facility name or period used as the activity, a currency amount used as a quantity, a missing description though the row has text).
Rejected rows are not trusted - the caller reads them again with the row-by-row reader.
"""
from __future__ import annotations

import math
import re

from . import facilities as fac_mod
from . import rowscan
from .layout import is_period_text
from .units import normalize_unit


def _tokens(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]{2,}", (s or "").lower()))


def _has_currency(text: str) -> bool:
    rx = rowscan._rx()
    return bool(rx["before"].search(text) or rx["after"].search(text))


def repeated_descriptions(items: list[dict], min_rows: int = 4, share: float = 0.6) -> set[str]:
    """Descriptions shared by many rows. Repeats can be legitimate (monthly diesel readings); they are only a problem when
    the row text behind them differs, which check_item verifies."""
    rows_of: dict[str, set[int]] = {}
    for it in items:
        rows_of.setdefault((it.get("description") or "").strip().lower(), set()).add(it["source"]["row"])
    total = len({it["source"]["row"] for it in items})
    return {d for d, r in rows_of.items() if d and len(r) >= max(min_rows, share * total)}


def check_item(item: dict, cells: list, ctx: "rowscan.Context", repeated: set[str], from_row_text: bool = True) -> dict:
    """{'issues': [...], 'notes': [...]} - issues make the row untrustworthy, notes only ask for a confirmation.
    `from_row_text` is False when the layout takes the description from a header or a constant instead of a cell of the row."""
    issues, notes = [], []
    scan = rowscan.read_cells(cells, ctx)
    desc = (item.get("description") or "").strip()
    row_has_text = any(isinstance(v, str) and re.search(r"[A-Za-z]{2,}", v) for v in cells)
    if not desc:
        if row_has_text and from_row_text:
            issues.append("no description was read although the row contains text")
    elif not from_row_text:
        pass
    elif fac_mod.match_name(desc, ctx.facilities, ctx.alias_of) or fac_mod._mentions_a_facility(desc):
        issues.append(f"'{desc[:40]}' is a facility name, not an activity description")
    elif is_period_text(desc):
        issues.append(f"'{desc[:40]}' is a reporting period, not an activity description")
    elif not re.search(r"[A-Za-z]{2,}", desc):
        issues.append(f"'{desc[:40]}' is a number or code, not an activity description")
    dk, sk = _tokens(desc), _tokens(scan["text"])
    if dk and sk and from_row_text:
        overlap = len(dk & sk)
        if max(overlap / len(dk), overlap / len(sk)) < 0.5:
            issues.append("repeated description does not match the text in the row" if desc.lower() in repeated else "description does not match the text in the row")
    values = [c["value"] for c in scan["cands"]]
    for field in ("quantity", "amount"):
        v = item.get(field)
        if v is not None and not any(math.isclose(v, x, rel_tol=1e-6, abs_tol=1e-9) for x in values):
            issues.append(f"{field} {v:g} is not a number found in this row")
    raw_q = (item.get("raw") or {}).get("quantity")
    if item.get("quantity") is not None and not item.get("unit") and raw_q and _has_currency(str(raw_q)):
        issues.append("a currency amount was read as a quantity")
    hint, found = item.get("facility_hint"), scan["facility"]
    if hint and found and fac_mod._key(hint) != fac_mod._key(found):
        notes.append(f"Facility {hint!r} from the layout differs from {found!r} written in the row - confirm which one")
    for c in scan["cands"]:
        u, v = item.get("unit"), item.get("quantity")
        if u and v is not None and math.isclose(c["value"], v, rel_tol=1e-6) and c["unit"]:
            a, b = normalize_unit(u), normalize_unit(c["unit"])
            if a and b and a["dimension"] != b["dimension"]:
                notes.append(f"Unit {u!r} differs from {c['unit']!r} written next to the number - confirm it")
    return {"issues": issues, "notes": notes}
