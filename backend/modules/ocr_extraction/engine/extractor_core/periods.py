"""Dates, months and Indian financial years."""
from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta

MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_abbr) if m}
MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_name) if m})
MONTHS.update({"sept": 9})

_FY = re.compile(r"\bFY\s*'?(\d{2,4})\s*[-/–]\s*'?(\d{2,4})\b|\bFY\s*'?(\d{2,4})\b", re.I)


def parse_date(val) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    if isinstance(val, (int, float)) and 20000 < float(val) < 60000:      # Excel serial
        return date(1899, 12, 30) + timedelta(days=int(val))
    s = str(val).strip()
    if not s or not any(ch.isdigit() for ch in s):
        return None
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    try:
        from dateutil import parser
        return parser.parse(s, dayfirst=True, fuzzy=True).date()          # Indian dd/mm/yyyy
    except (ValueError, OverflowError, ImportError):
        return None


def fy_start_year(text: str | None) -> int | None:
    """'FY 2025-26' / 'FY25-26' / 'FY 26' -> 2025."""
    if not text:
        return None
    m = _FY.search(str(text))
    if not m:
        return None
    if m.group(1):
        y = int(m.group(1))
        return y + 2000 if y < 100 else y
    y = int(m.group(3))
    y = y + 2000 if y < 100 else y
    return y - 1          # 'FY26' = Apr 2025 - Mar 2026


def parse_month(val, fy_start: int | None = None, fy_start_month: int = 4) -> str | None:
    """Month-like header/cell -> 'YYYY-MM'. 'Apr-25', 'April 2025', '2025-04', 'Apr'25', datetime, '04/2025'.
    'Apr' with no year uses fy_start (Apr-Dec in fy_start, Jan-Mar in fy_start+1)."""
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return f"{val.year:04d}-{val.month:02d}"
    s = str(val).strip().lower().replace("’", "'")
    if not s or len(s) > 30:
        return None
    m = re.match(r"^(\d{4})[-/.](\d{1,2})$", s) or None
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        return f"{y:04d}-{mo:02d}" if 1 <= mo <= 12 else None
    m = re.match(r"^(\d{1,2})[-/.](\d{4})$", s)
    if m:
        mo, y = int(m.group(1)), int(m.group(2))
        return f"{y:04d}-{mo:02d}" if 1 <= mo <= 12 else None
    m = re.match(r"^([a-z]{3,9})\.?[\s\-/']*(\d{2,4})?$", s)
    if m and m.group(1) in MONTHS:
        mo = MONTHS[m.group(1)]
        if m.group(2):
            y = int(m.group(2))
            y = y + 2000 if y < 100 else y
        elif fy_start:
            y = fy_start if mo >= fy_start_month else fy_start + 1
        else:
            return f"????-{mo:02d}"
        return f"{y:04d}-{mo:02d}"
    d = parse_date(val) if re.search(r"\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}", s) else None
    return f"{d.year:04d}-{d.month:02d}" if d else None


def month_of(d: date | None) -> str | None:
    return f"{d.year:04d}-{d.month:02d}" if d else None


def allocate(start: date, end: date) -> list[dict]:
    """Split a billing period into calendar months by days: [{'period': 'YYYY-MM', 'share': 0.52}, ...]."""
    if end < start:
        start, end = end, start
    total = (end - start).days + 1
    out, cur = [], start
    while cur <= end:
        last = date(cur.year, cur.month, calendar.monthrange(cur.year, cur.month)[1])
        seg_end = min(last, end)
        out.append({"period": f"{cur.year:04d}-{cur.month:02d}", "share": round(((seg_end - cur).days + 1) / total, 4)})
        cur = seg_end + timedelta(days=1)
    return out
