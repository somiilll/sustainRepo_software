"""Facility choice made by the customer before extraction, instead of guessing from the bill or sheet.

A choice per file looks like (all parts optional):
    {"default": "F1",                         # every line of the file belongs to facility F1 (None = leave unassigned)
     "map": {"Plant A": "F1", "Plant Z": None}, # a facility name found in the sheet's facility column -> one of the customer's facilities
     "sheets": {"Chakan": "F1"}}               # a whole sheet belongs to one facility
A line is resolved in that order: its facility-column text, then its sheet, then the file default. A facility chosen this way is
certain (confidence 1.0). A line the customer left unassigned stays unassigned; it is never auto-matched behind their back.
"""
from __future__ import annotations

from collections import Counter

from . import layout, normalise
from .validate import match_facility


def suggest(name: str, facilities: list[dict], alias_of=None) -> dict | None:
    """A likely facility for a name seen in a file: a mapping the customer confirmed before, else the usual name matching."""
    if not name:
        return None
    if alias_of:
        fid = alias_of(name)
        hit = next((f for f in facilities if f["id"] == fid), None) if fid else None
        if hit:
            return {"id": hit["id"], "name": hit["name"], "method": "you chose this before"}
    m = match_facility({"facility_hint": name}, facilities)
    return {"id": m["id"], "name": m["name"], "method": m["method"]} if m["id"] else None


def peek_sheet(path, facilities: list[dict], alias_of=None) -> dict:
    """What a spreadsheet says about facilities, read from its headers with no AI: the facility column's distinct names
    (each with a suggested match) and the sheet names."""
    tables, sheets = [], {}
    for t in normalise.read_tables(path):
        names: Counter = Counter()
        col = None
        try:
            col = (layout.heuristic_spec(t).get("columns") or {}).get("facility")
        except Exception:                                    # a strange table must not block the upload
            col = None
        if col is not None and col < t.ncols:
            for r in t.rows:
                v = layout._cell_str(layout._get(r, col))
                if v:
                    names[v] += 1
        tables.append({"sheet": t.sheet, "first_row": t.first_row, "rows": len(t.rows),
                       "facility_column": t.header[col] if col is not None and col < t.ncols else None,
                       "names": [{"name": n, "count": c, "suggestion": suggest(n, facilities, alias_of)} for n, c in names.most_common(40)]})
        sheets.setdefault(t.sheet, suggest(t.sheet, facilities, alias_of))
    return {"tables": tables, "sheets": [{"sheet": s, "suggestion": g} for s, g in sheets.items()]}


def apply_choice(items: list[dict], choice: dict | None, facilities: list[dict]) -> None:
    """Stamp each item with `facility_fixed` according to the customer's choice for its file."""
    if not choice:
        return
    byid = {f["id"]: f for f in facilities}
    mp, sheets = choice.get("map") or {}, choice.get("sheets") or {}
    for it in items:
        raw = (it.get("facility_hint") or "").strip()
        sheet = (it.get("source") or {}).get("sheet")
        if raw and raw in mp:
            fid = mp[raw]
        elif sheet in sheets:
            fid = sheets[sheet]
        elif "default" in choice:
            fid = choice["default"]
        else:
            continue                                         # nothing chosen for this line: normal matching applies
        it["facility_fixed"] = {"id": fid if fid in byid else None, "name": byid[fid]["name"] if fid in byid else None}


def fixed_facility(item: dict) -> dict | None:
    ff = item.get("facility_fixed")
    if ff is None:
        return None
    if ff.get("id"):
        return {"id": ff["id"], "name": ff["name"], "method": "chosen by you", "confidence": 1.0}
    return {"id": None, "name": None, "method": "left unassigned by you", "confidence": 0.0}
