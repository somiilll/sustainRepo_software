"""Row-by-row reader for spreadsheet rows that no table layout could read (unstructured sheets, stray lines, notes).

  1. CODE   finds every number in the row with its unit, currency and distance - never the AI.
  2. AI     says what a number WITHOUT a unit or currency means (quantity? money? passengers? an invoice number?).
  3. CODE   checks the AI answer against the original row. Anything uncertain is left for manual review.
A bare number is never assumed to be money. Currencies, multipliers and units come from mappings/*.json (any country);
number formats ('1,234.56', '1.234,56', "1'234.56") are read per sheet. Every row keeps its Excel row number.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Callable

from . import facilities as fac_mod
from . import llm
from .periods import parse_date, parse_month
from . import schema
from .config import load
from .units import normalize_unit, parse_locale_number

ROLES = ["quantity", "amount", "distance", "weight", "count", "identifier", "unclear"]
BATCH, MAX_AI_ROWS = 40, 400

_NUM = r"\d[\d,.'’]*\d|\d"
DATE_NUM = re.compile(r"\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b")
DATEISH = re.compile(rf"{DATE_NUM.pattern}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-']*\d{{2,4}}\b|\bfy\s*'?\d{{2,4}}(?:\s*[-/]\s*\d{{2,4}})?", re.I)


@dataclass
class Context:
    sheet: str
    source: dict
    hidden: bool = False
    title: str = ""
    fy0: int | None = None
    facilities: list[dict] = field(default_factory=list)
    alias_of: Callable | None = None
    decimal_comma: bool | None = None


@lru_cache(maxsize=1)
def _rx() -> dict:
    """Patterns built from mappings/parsing.json, so a new currency or multiplier needs no code change."""
    p = load().parsing
    cur = "|".join(re.escape(c) for c in sorted(p["currencies"], key=len, reverse=True))
    mult = "|".join(re.escape(m) for m in sorted(p["multipliers"], key=len, reverse=True))
    return {
        "before": re.compile(rf"(?<![A-Za-z])({cur})\.?\s*({_NUM})(?:\s*({mult})\b)?", re.I),
        "after": re.compile(rf"(?<![\w.,])({_NUM})\s*(?:({mult})\s*)?({cur})(?![A-Za-z])", re.I),
        "unit": re.compile(rf"(?<![\w.,/-])({_NUM})\s*([A-Za-z][A-Za-z0-9³²./]{{0,11}})(?![A-Za-z0-9])"),
        "bare": re.compile(rf"(?<![\w.,/-])({_NUM})(?![\w]|[-/]\d)"),
    }


def _currency(token: str) -> str:
    return load().parsing["currencies"][token.lower().rstrip(".") or token.lower()]


def _mult(token: str | None) -> float:
    return float(load().parsing["multipliers"].get((token or "").lower(), 1))


def _cand(kind: str, value: float, text: str, col: int | None, unit: str | None = None, currency: str | None = None) -> dict:
    return {"kind": kind, "value": value, "unit": unit, "currency": currency, "text": text.strip(), "col": col}


def _unit_cand(value: float, unit: str, text: str, col: int | None) -> dict | None:
    n = normalize_unit(unit)
    if not n:
        return None
    if n["dimension"] == "currency":
        return _cand("amount", value, text, col, currency=load().parsing["currencies"].get(unit.lower().strip(". "), None))
    if n["dimension"] == "distance":
        return _cand("distance", value * n["factor"], text, col, unit="km")
    return _cand("quantity", value, text, col, unit=unit)


def extract_numbers(text: str, col: int | None = None, decimal_comma: bool | None = None) -> tuple[list[dict], str]:
    """Every number in a text with its currency/unit, plus the text left over once those pieces are taken out."""
    rx = _rx()
    taken: list[tuple[int, int]] = []
    cands: list[dict] = []

    def free(m) -> bool:
        return not any(m.start() < e and s < m.end() for s, e in taken)

    def take(m, cand) -> None:
        if cand["value"] is not None:
            taken.append((m.start(), m.end()))
            cands.append(cand)

    num = lambda tok: parse_locale_number(tok, decimal_comma)   # noqa: E731
    for m in rx["before"].finditer(text):
        if free(m) and (v := num(m.group(2))) is not None:
            take(m, _cand("amount", v * _mult(m.group(3)), m.group(0), col, currency=_currency(m.group(1))))
    for m in rx["after"].finditer(text):
        if free(m) and (v := num(m.group(1))) is not None:
            take(m, _cand("amount", v * _mult(m.group(2)), m.group(0), col, currency=_currency(m.group(3))))
    for m in rx["unit"].finditer(text):
        if free(m) and (v := num(m.group(1))) is not None and (c := _unit_cand(v, m.group(2), m.group(0), col)):
            take(m, c)
    for m in rx["bare"].finditer(text):
        if free(m) and (v := num(m.group(1))) is not None:
            take(m, _cand("bare", v, m.group(0), col))
    order = sorted(zip(taken, cands), key=lambda x: x[0][0])
    rest, pos = [], 0
    for (s, e), _ in order:
        rest.append(text[pos:s])
        pos = e
    rest.append(text[pos:])
    return [c for _, c in order], re.sub(r"\s+", " ", " ".join(rest)).strip(" -–,;:|()")


def _is_blank(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def _facility_cell(s: str, ctx: Context) -> tuple[str, str] | None:
    return fac_mod.detect_in_text(s, ctx.facilities, ctx.alias_of) if ctx.facilities else None


def _read_cells(cells: list, ctx: Context) -> dict:
    """The code step: pull numbers, facility, date/period and description text out of one row."""
    cands: list[dict] = []
    texts: list[str] = []
    out = {"facility": None, "date": None, "period": None}
    prev: dict | None = None
    for col, v in enumerate(cells):
        if _is_blank(v) or isinstance(v, bool):
            continue
        if hasattr(v, "strftime"):
            out["date"], prev = getattr(v, "date", lambda: v)(), None
            continue
        if isinstance(v, (int, float)):
            prev = _cand("bare", float(v), str(v), col)
            cands.append(prev)
            continue
        s = str(v).strip()
        if prev and prev["kind"] == "bare" and not any(ch.isdigit() for ch in s) and len(s) <= 12:
            merged = _unit_cand(prev["value"], s, f"{prev['text']} {s}", prev["col"])
            if merged:
                cands[cands.index(prev)] = prev = merged
                continue
        prev = None
        if (f := _facility_cell(s, ctx)) and not out["facility"]:
            out["facility"], s = f
            if not s:
                continue
        if (pm := parse_month(s, ctx.fy0)) and not pm.startswith("????"):
            out["period"] = pm
            continue
        for m in DATE_NUM.finditer(s):
            out["date"] = out["date"] or parse_date(m.group(0))
        found, rest = extract_numbers(DATEISH.sub(" ", s), col, ctx.decimal_comma)
        cands += found
        if rest:
            texts.append(rest)
    for i, c in enumerate(cands, start=1):
        c["id"] = i
    out.update(cands=cands, text=" ".join(texts))
    return out


def _put(item: dict, role: str, c: dict, unit: str | None, currency: str | None) -> bool:
    """Fill one value slot of the item. False when the slot is already taken (two values for one role)."""
    if role == "amount":
        if item["amount"] is not None:
            return False
        item["amount"], item["currency"] = c["value"], currency
    elif role == "distance":
        if item["distance_km"] is not None:
            return False
        n = normalize_unit(unit)
        item["distance_km"] = c["value"] * (n["factor"] if n and n["dimension"] == "distance" else 1)
    else:
        if item["quantity"] is not None:
            return False
        item["quantity"], item["unit"] = c["value"], unit
        if (n := normalize_unit(unit)) and n["dimension"] == "mass":
            item["weight_kg"] = c["value"] * n["factor"]
    return True


def _item(row_no: int, cells: list, ctx: Context) -> dict | None:
    r = _read_cells(cells, ctx)
    d = r["date"]
    item = schema.new_item(
        {**ctx.source, "sheet": ctx.sheet, "row": row_no, "hidden_sheet": ctx.hidden, "scan": "row"},
        description=r["text"], facility_hint=r["facility"], date=d.isoformat() if d else None,
        period_hint=r["period"] or (f"{d.year:04d}-{d.month:02d}" if d else None), context=" | ".join(x for x in [ctx.sheet, ctx.title] if x),
        line_confidence=0.85, raw={"row": " | ".join(str(v).strip() for v in cells if not _is_blank(v))},
        scan={"candidates": r["cands"], "pending": [], "ai_resolved": False})
    live = [c for c in r["cands"] if c["value"] != 0]
    if not r["cands"] and not r["facility"]:
        item.update(read_state="unreadable", read_notes=["No number found in this row"])
        item["description"] = item["description"] or item["raw"]["row"]
        return item
    if r["cands"] and not live:
        return None                                              # an all-zero row records nothing; the caller lists it as a zero row
    for kind in ("amount", "quantity", "distance"):
        same = [c for c in live if c["kind"] == kind]
        if len(same) == 1:
            _put(item, kind, same[0], same[0]["unit"], same[0]["currency"])
        else:
            item["scan"]["pending"] += [c["id"] for c in same]
    item["scan"]["pending"] += [c["id"] for c in live if c["kind"] == "bare"]
    return item


# ------------------------------------------------------------------------------- AI: what does an unlabelled number mean?
SYSTEM = (
    "You interpret numbers in rows of an unstructured Excel sheet from an Indian company, for a greenhouse-gas inventory. "
    "Code has already found every number; you never change, add or compute numbers. For each listed number id give its role: "
    "quantity (amount of a fuel, material, energy, water or waste), amount (money spent), distance, weight, count (passengers, rooms, nights, items), "
    "identifier (invoice/phone/code/year/serial) or unclear. A number with no currency is NOT money unless the row clearly says it is a cost. "
    "Give a unit only when the row prints it or it is unmistakable; put unit_printed=true only if the unit text appears in the row. "
    "Give a currency only when the row prints one. If you are not sure, answer unclear.")


def _schema() -> dict:
    S, I, B = {"type": "string"}, {"type": "integer"}, {"type": "boolean"}
    num = llm.obj({"id": I, "role": {"type": "string", "enum": ROLES}, "unit": S, "unit_printed": B, "currency": S})
    return llm.obj({"rows": {"type": "array", "items": llm.obj({"row": I, "numbers": {"type": "array", "items": num}})}})


def _prompt(items: list[dict]) -> str:
    lines = []
    for it in items:
        by_id = {c["id"]: c for c in it["scan"]["candidates"]}
        nums = "; ".join(f"#{i} = {by_id[i]['value']:g} (as written: '{by_id[i]['text']}', kind from code: {by_id[i]['kind']})" for i in it["scan"]["pending"])
        lines.append(f"row {it['source']['row']} (sheet {it['source']['sheet']}): \"{it['raw']['row']}\" -> numbers to interpret: {nums}")
    return "\n".join(lines)


def _apply_answer(item: dict, answers: list[dict]) -> None:
    """The validation step: AI roles are only accepted when they agree with what the row actually says."""
    by_id = {c["id"]: c for c in item["scan"]["candidates"]}
    row_text = item["raw"]["row"].lower()
    notes = item["read_notes"]
    answered: set[int] = set()
    for a in answers:
        c = by_id.get(a["id"])
        if c is None or a["id"] not in item["scan"]["pending"] or a["id"] in answered:
            continue
        answered.add(a["id"])
        role, unit = a["role"], (a["unit"] or c["unit"] or "").strip() or None
        if role == "identifier":
            continue
        n = normalize_unit(unit) if unit else None
        ok = (role in ("count", "unclear") or c["kind"] == "bare" or role == c["kind"]) and role != "unclear"
        ok = ok and not (role == "distance" and n and n["dimension"] != "distance") and not (role == "weight" and n and n["dimension"] != "mass")
        ok = ok and not (role in ("quantity", "count") and n and n["dimension"] in ("currency", "distance"))
        if not ok or unit and not n:
            notes.append(f"Could not confirm what {c['text']!r} means - please check")
            continue
        currency = (a["currency"] or c["currency"] or "").upper() or None
        currency = currency if currency in set(load().parsing["currencies"].values()) else None
        if role == "amount" and not currency:
            notes.append(f"Currency not stated for {c['text']!r} - confirm it")
        if role in ("quantity", "weight", "count") and (unit is None or not re.search(rf"\b{re.escape(unit.lower())}\b", row_text)):
            notes.append(f"Unit {'assumed as ' + repr(unit) if unit else 'missing'} for {c['text']!r} - confirm it")
        if role == "count" and not unit:
            unit = "nos"
        item["scan"]["ai_resolved"] = True
        if not _put(item, "distance" if role == "distance" else "amount" if role == "amount" else "quantity", c, unit, currency):
            notes.append(f"Two values for the same field in this row ({c['text']!r}) - choose which to use")
    left = [i for i in item["scan"]["pending"] if i not in answered and by_id[i]["kind"] == "bare"]
    notes += [f"Could not tell what {by_id[i]['text']!r} means - please check" for i in left]


def _finalise(item: dict) -> None:
    if item["read_state"] == "unreadable":
        return
    has_value = any(item[k] is not None for k in ("quantity", "amount", "distance_km"))
    if item["processing_error"]:
        item["read_state"] = "failed"
    elif not has_value and not item["read_notes"]:
        item.update(read_state="unreadable", read_notes=["No quantity, amount or distance could be identified"])
    elif item["read_notes"] or not has_value:
        item["read_state"] = "needs_attention"
        item["line_confidence"] = 0.6
    if not item["description"]:
        item["description"] = item["raw"]["row"]


def interpret(items: list[dict], metrics: dict, use_ai: bool = True) -> None:
    """AI step for the rows that still hold unlabelled numbers, then validate and settle every row's read state."""
    todo = [i for i in items if i["scan"]["pending"] and i["read_state"] != "unreadable"]
    if not use_ai:
        for it in todo:
            it["read_notes"].append("AI is switched off, so the meaning of the unlabelled numbers needs your confirmation")
        todo = []
    for chunk_at in range(0, min(len(todo), MAX_AI_ROWS), BATCH):
        chunk = todo[chunk_at:chunk_at + BATCH]
        try:
            if not llm.enabled():
                raise llm.AIUnavailable("No AI provider is configured", "auth")
            data, usage = llm.call_json("interpret", SYSTEM, _prompt(chunk), _schema(), max_tokens=6000)
            metrics.setdefault("llm_calls", []).append({"step": "interpret", **usage})
            metrics.setdefault("ai_failures", []).extend(usage.get("failures", []))
            answers = {r["row"]: r["numbers"] for r in data["rows"]}
            for it in chunk:
                _apply_answer(it, answers.get(it["source"]["row"], []))
        except llm.AIUnavailable as e:
            metrics.setdefault("ai_failures", []).extend(e.failures)
            for it in chunk:
                it["processing_error"] = f"AI could not interpret this row ({e.kind.replace('_', ' ')}) - the numbers found are kept for review"
    for it in todo[MAX_AI_ROWS:]:
        it["read_notes"].append("Too many unstructured rows in this upload for AI to interpret - please check the numbers")
    for it in items:
        _finalise(it)
        schema.validate_item(it)


def scan_rows(rows: list[tuple[int, list]], ctx: Context) -> tuple[list[dict], list[int]]:
    """(items, zero row numbers) for [(excel row number, cells)]. One item per row, except rows holding only zeros,
    which record nothing and are reported by number so they are never silently dropped."""
    items = [(no, _item(no, cells, ctx)) for no, cells in rows]
    return [i for _, i in items if i], [no for no, i in items if i is None]
