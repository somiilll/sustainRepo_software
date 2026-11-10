"""Plausibility checks: values that parse fine but look wrong, in a file, across a batch, or against past approved months.

Every check only ADDS a warning to the row (code + message); nothing is changed silently. A row with a warning is
never "ready", so a person looks at it. All functions are pure (no AI, no network) and take `today` so tests are stable.
"""
from __future__ import annotations

import re
import statistics
from datetime import date

from .periods import parse_date
from .validate import finish

# ratio between a value and the usual value that is suspicious (units mixed up, a decimal point lost, a typo)
OUTLIER_RATIO = 5.0
# an invoice dated more than this many days after the end of its service period is odd for a bill, but normal for utilities
DATE_AFTER_PERIOD_DAYS = 75

# O for 0, or I / l for 1, inside a number. Unit letters (5 l, 5 oz) must not trigger it.
_LOOKALIKE = re.compile(r"\d[Oo]\d|\d[Oo](?![A-Za-z])|(?<![A-Za-z])[Oo]\d|\d[Il]\d")
_EURO = re.compile(r"[-+]?\d{1,3}(?:\.\d{3})+,\d{1,2}|[-+]?\d+,\d{1,2}")


def ambiguous_number(raw) -> str | None:
    """Text in a number cell that a parser could silently get wrong ('1O0' is not 100, '1.250,50' is not 1.25)."""
    if not isinstance(raw, str):
        return None
    s = raw.strip().replace(" ", "")
    if _LOOKALIKE.search(s):
        return f"'{raw.strip()}' has a letter that looks like a digit (O, I or l) - confirm the number"
    if _EURO.fullmatch(s):
        return f"'{raw.strip()}' uses a decimal comma (European style) - confirm the number"
    return None


def _add(row: dict, code: str, message: str) -> None:
    if not any(c["code"] == code and c["message"] == message for c in row["checks"]):
        row["checks"].append({"code": code, "level": "warn", "message": message})


def history_key(row: dict) -> str:
    vendor = re.sub(r"[^a-z0-9]+", " ", str(row.get("vendor") or "").lower()).strip()
    return f"{row.get('activity_id')}|{(row.get('facility') or {}).get('id') or ''}|{vendor}"


def _months(a: str, b: str) -> int:
    return (int(b[:4]) - int(a[:4])) * 12 + int(b[5:7]) - int(a[5:7])


def _next_month(p: str) -> str:
    y, m = int(p[:4]), int(p[5:7])
    return f"{y + (m == 12):04d}-{1 if m == 12 else m + 1:02d}"


def item_issues(item: dict, today: date) -> list[tuple[str, str]]:
    """Per-line checks on what was read: ambiguous numbers, impossible / future dates, a date that does not fit its period."""
    out: list[tuple[str, str]] = []
    raw = item.get("raw") or {}
    for field, label in (("quantity", "Quantity"), ("amount", "Amount")):
        msg = ambiguous_number(raw.get(field))
        if msg:
            out.append(("bad_number", f"{label}: {msg}"))
    raw_date = raw.get("date")
    if raw_date and not item.get("date"):
        out.append(("bad_date", f"Date '{raw_date}' is not a real calendar date - check it"))
    d = parse_date(item.get("date"))
    if d and d > today:
        out.append(("future_date", f"Invoice date {d.isoformat()} is in the future (today is {today.isoformat()}) - check the date"))
    e = parse_date(item.get("period_end"))
    if e and e > today:
        out.append(("future_date", f"Service period ends {e.isoformat()}, which is in the future - check the period"))
    hint = item.get("period_hint")
    if d and hint and re.fullmatch(r"\d{4}-\d{2}", hint) and not item.get("period_start"):
        gap = _months(hint, f"{d.year:04d}-{d.month:02d}")
        if gap < 0 or (gap > 0 and (d - date(int(hint[:4]), int(hint[5:7]), 28)).days > DATE_AFTER_PERIOD_DAYS):
            out.append(("date_period_conflict", f"Invoice date {d.isoformat()} does not fit the service period {hint} - check both"))
    return out


def apply(items: list[dict], rows: list[dict], docs: list[dict] | None = None, history=None, today: date | None = None) -> None:
    """Add plausibility warnings to `rows` (and refresh their status). `history(key) -> [(period, quantity, unit)]` is optional."""
    today = today or date.today()
    by_item = {it["item_id"]: it for it in items}
    parents = [r for r in rows if not r.get("derived")]
    touched: set[str] = set()

    def flag(row, code, msg):
        _add(row, code, msg)
        touched.add(row["row_id"])

    # 1. what was read from each line
    for r in parents:
        for code, msg in item_issues(by_item.get(r["item_id"], {}), today):
            flag(r, code, msg)

    # 2. a document-level problem (meter readings vs bill, totals that do not add up) must reach the rows it affects
    for r in parents:
        it = by_item.get(r["item_id"], {})
        for c in it.get("doc_checks") or []:
            if c.get("level") in ("warn", "error"):
                flag(r, "document_check", f"Document check: {c['message']}")

    # 3. the same line twice in one upload (also across a PDF and a spreadsheet)
    seen: dict[tuple, dict] = {}
    for r in parents:
        q, a = r.get("quantity"), r.get("amount")
        fac = (r.get("facility") or {}).get("id")
        if not q or not (a or fac) or any(c["code"] == "duplicate" for c in r["checks"]):
            continue                          # without an amount, only a matched facility makes "same quantity" meaningful
        key = (r.get("activity_id"), round(q, 4), r.get("unit"), round(a, 2) if a else None, r.get("reporting_period"), fac if not a else None)
        first = seen.setdefault(key, r)
        if first is not r:
            s = first.get("source") or {}
            where = f"{first.get('file')}{' ' + s['sheet'] if s.get('sheet') else ''}{' row ' + str(s['row']) if s.get('row') else ''}"
            flag(r, "possible_duplicate", f"Same activity, quantity, amount and month as {where} - possible duplicate, do not count twice")

    # 4. a monthly series: missing months and values far from the others
    series: dict[tuple, list[dict]] = {}
    for r in parents:
        s = r.get("source") or {}
        if s.get("column") and r.get("reporting_period") and r.get("quantity") is not None:
            series.setdefault((r.get("file"), s.get("sheet"), s.get("row")), []).append(r)
    for members in series.values():
        members.sort(key=lambda r: r["reporting_period"])
        have = [r["reporting_period"] for r in members]
        gaps, p = [], have[0]
        while p < have[-1]:
            p = _next_month(p)
            if p not in have:
                gaps.append(p)
        for g in gaps:
            for r in members:
                flag(r, "series_gap", f"No value for {g} in this row (blank or '-' on the sheet). Treated as missing, not zero - confirm")
        if len(members) >= 3:
            for r in members:
                others = [m["quantity"] for m in members if m is not r and m["quantity"]]
                med = statistics.median(others) if others else 0
                q = r["quantity"]
                if med and q and (q / med > OUTLIER_RATIO or q / med < 1 / OUTLIER_RATIO):
                    flag(r, "series_outlier", f"{q:,.4g} {r.get('unit') or ''} is {q / med:.2g}x the other months here (typically {med:,.4g}) - check the unit or a missing digit")

    # 5. an explicit upstream-fuel line next to an automatically added one
    auto = [r for r in rows if r.get("derived") and (r.get("ghg") or {}).get("category") == "cat_3"]
    for r in parents:
        if r.get("activity_id") == "fuel.upstream_wtt" and any(a.get("reporting_period") == r.get("reporting_period") for a in auto):
            flag(r, "double_count_upstream", "Upstream fuel is also added automatically for a fuel line in the same month - this may count it twice")

    # 6. against earlier approved months of the same activity / facility / vendor
    if history:
        for r in parents:
            q = r.get("quantity")
            if not q or q <= 0 or not r.get("reporting_period"):
                continue
            past = [(p, v) for p, v, u in history(history_key(r)) if p != r["reporting_period"] and v and u == r.get("unit")]
            if len(past) >= 2:
                med = statistics.median(v for _, v in past)
                if med and (q / med > OUTLIER_RATIO or q / med < 1 / OUTLIER_RATIO):
                    flag(r, "history_outlier", f"{q:,.4g} {r.get('unit')} is {q / med:.2g}x your usual {med:,.4g} (median of {len(past)} approved months) - check the quantity or unit")

    by_row = {r["row_id"]: r for r in rows}
    for rid in touched:
        row = by_row[rid]
        finish(row, by_item.get(row["item_id"], {}))
