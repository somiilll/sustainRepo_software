"""Facility matching for spreadsheets and documents.

A facility name seen in a file is matched at three levels - only the first two ever assign a facility by themselves:
  exact      same name once case, spaces and punctuation are ignored      "FAC 1", "fac-1"  -> Fac1     auto
  alias      an alias recorded on the facility, or one the customer         "Facility 1"     -> Fac1     auto, but only
             confirmed earlier in an upload                                                              once recorded
  approximate similar spelling                                            "fac11"          -> Fac1     the customer must confirm
Similarity never assigns a facility; it only produces a suggestion.

The customer's choice for a file (all parts optional):
    {"default": "F1",                          # used ONLY for rows that name no facility
     "map": {"Plant A": "F1", "Plant Z": None}, # a facility name found in the sheet -> a facility (None = leave unassigned)
     "sheets": {"Chakan": "F1"}}                # a sheet whose rows name no facility belongs to one facility
A row is resolved in this order: a confirmed name mapping, the facility named in the row itself, the sheet/file default,
then the usual document hints (meter number, GSTIN, only facility). Nothing the row names is ever overridden by a default.
"""
from __future__ import annotations

import re
from collections import Counter
from difflib import SequenceMatcher

from . import layout, normalise
from .config import load
from .validate import match_facility

APPROX_CUTOFF = 0.75
METHOD = {"exact": "exact name", "alias": "known alias", "approximate": "similar name - please confirm"}


def _key(s: str | None) -> str:
    return re.sub(r"[^0-9a-z]", "", (s or "").lower())


def match_name(name: str | None, facilities: list[dict], alias_of=None) -> dict | None:
    """{'id','name','level'} for a facility name seen in a file, or None. level is exact | alias | approximate.
    Words such as Plant / Site / Unit / Facility are NOT treated as interchangeable: only an alias someone recorded counts."""
    k = _key(name)
    if not k:
        return None
    for f in facilities:                                                      # (a facility's own name is unique per org)
        if k == _key(f["name"]):
            return {"id": f["id"], "name": f["name"], "level": "exact"}
    listed = [f for f in facilities if k in {_key(a) for a in f.get("aliases", [])}]
    if len(listed) == 1:
        return {"id": listed[0]["id"], "name": listed[0]["name"], "level": "alias"}
    fid = alias_of(name) if alias_of else None
    saved = next((f for f in facilities if f["id"] == fid), None) if fid else None
    if saved:
        return {"id": saved["id"], "name": saved["name"], "level": "alias", "saved": True}
    scored = sorted(((SequenceMatcher(None, k, _key(n)).ratio(), f) for f in facilities for n in [f["name"], *f.get("aliases", [])]), key=lambda x: -x[0])
    if scored and scored[0][0] >= APPROX_CUTOFF and (len(scored) == 1 or scored[1][1]["id"] == scored[0][1]["id"] or scored[1][0] < scored[0][0]):
        return {"id": scored[0][1]["id"], "name": scored[0][1]["name"], "level": "approximate"}
    return None


def suggest(name: str, facilities: list[dict], alias_of=None) -> dict | None:
    """What the upload dialog shows for a name in a file. `confirm` is True when the customer must pick it themselves."""
    m = match_name(name, facilities, alias_of)
    if not m:
        return None
    return {"id": m["id"], "name": m["name"], "method": "you chose this before" if m.get("saved") else METHOD[m["level"]],
            "level": m["level"], "confirm": m["level"] == "approximate"}


def _names_in_rows(grid: list[list], facilities: list[dict], alias_of=None, limit: int = 2000) -> Counter:
    """Facility names written inside the rows of a sheet that has no facility column (one per row)."""
    names: Counter = Counter()
    for _, cells in normalise.non_empty_rows(grid)[:limit]:
        for v in cells:
            hit = detect_in_text(v.strip(), facilities, alias_of) if isinstance(v, str) and v.strip() else None
            if hit:
                names[hit[0]] += 1
                break
    return names


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
    if not any(t["names"] for t in tables):
        for sheet, grid, _ in normalise.read_grids(path):
            found = _names_in_rows(grid, facilities, alias_of)
            if found:
                tables.append({"sheet": sheet, "first_row": None, "rows": sum(found.values()), "facility_column": None,
                               "names": [{"name": n, "count": c, "suggestion": suggest(n, facilities, alias_of)} for n, c in found.most_common(40)]})
    return {"tables": tables, "sheets": [{"sheet": s, "suggestion": g} for s, g in sheets.items()]}


def _stamp(fid: str | None, byid: dict) -> dict:
    return {"id": fid if fid in byid else None, "name": byid[fid]["name"] if fid in byid else None}


def apply_choice(items: list[dict], choice: dict | None, facilities: list[dict]) -> None:
    """Attach the customer's choice to each item: `facility_fixed` (a name they mapped) or `facility_default` (a fallback)."""
    if not choice:
        return
    byid = {f["id"]: f for f in facilities}
    mp, sheets, default = choice.get("map") or {}, choice.get("sheets") or {}, choice.get("default")
    for it in items:
        raw = (it.get("facility_hint") or "").strip()
        if raw and raw in mp:
            it["facility_fixed"] = _stamp(mp[raw], byid)
            continue
        fid = sheets.get((it.get("source") or {}).get("sheet")) or default
        if fid in byid:
            it["facility_default"] = _stamp(fid, byid)


def fixed_facility(item: dict) -> dict | None:
    ff = item.get("facility_fixed")
    if ff is None:
        return None
    if ff.get("id"):
        return {"id": ff["id"], "name": ff["name"], "method": "chosen by you", "confidence": 1.0}
    return {"id": None, "name": None, "method": "left unassigned by you", "confidence": 0.0}


def resolve(item: dict, facilities: list[dict], alias_of=None) -> dict:
    """{'id','name','method','confidence'[, 'suggestion']} - id None when no facility could be assigned."""
    if fixed := fixed_facility(item):
        return fixed
    hint = (item.get("facility_hint") or "").strip()
    is_sheet = (item.get("source") or {}).get("kind") == "sheet"
    if hint:
        m = match_name(hint, facilities, alias_of)
        if m and m["level"] != "approximate":
            return {"id": m["id"], "name": m["name"], "method": METHOD[m["level"]], "confidence": 0.97 if m["level"] == "exact" else 0.95}
        if is_sheet:                                          # the row names a facility we do not know: never guess, never default
            return {"id": None, "name": None, "method": "not recognised", "confidence": 0.0,
                    "suggestion": {"id": m["id"], "name": m["name"]} if m else None}
        doc_match = match_facility(item, facilities)         # a document's address text, meter number or GSTIN
        if doc_match["id"]:
            return doc_match
    if item.get("facility_default"):
        d = item["facility_default"]
        return {"id": d["id"], "name": d["name"], "method": "default for rows without a facility", "confidence": 1.0}
    return match_facility({**item, "facility_hint": None} if hint else item, facilities)


def _mentions_a_facility(text: str) -> bool:
    """'Facility 1', 'Plant B', 'Site-3': a facility label followed by a short code. Used only to NOTICE that a cell names a
    facility we do not know yet (so the customer is asked), never to decide which one it is."""
    labels = "|".join(re.escape(x) for x in load().parsing["facility_labels"])
    return bool(re.fullmatch(rf"(?:{labels})[\s\-_.:#]*(?:\d[A-Za-z0-9]{{0,5}}|[A-Za-z])", text.strip(), re.I))


def names_a_facility(text: str, facilities: list[dict], alias_of=None) -> bool:
    """True when a cell is a known (or similar) facility name, or reads like a facility mention - so it is not an activity or a title."""
    return bool(match_name(text, facilities, alias_of)) or _mentions_a_facility(text)


def detect_in_text(text: str, facilities: list[dict], alias_of=None) -> tuple[str, str] | None:
    """A facility named inside a free-text cell ('Fac1 - Steel wire'): (facility text, the rest of the cell).
    Exact/alias names are taken anywhere; a similar-looking short token only counts when it looks like a facility code."""
    parts = [p.strip() for p in re.split(r"\s+[-–:|]\s+|[|;]", text) if p.strip()]
    for cand in dict.fromkeys([text.strip(), parts[0], parts[-1]] if parts else [text.strip()]):
        m = match_name(cand, facilities, alias_of)
        looks_like_code = len(cand) <= 20 and len(cand.split()) <= 2 and any(ch.isdigit() for ch in cand)
        if m and (m["level"] != "approximate" or looks_like_code):
            rest = text.replace(cand, " ", 1).strip(" -–:|;,")
            return cand, rest
        if _mentions_a_facility(cand):
            return cand, text.replace(cand, " ", 1).strip(" -–:|;,")
    return None
