"""Single source of truth for reporting-period keys and matching.

Keys: "2026" (year), "2026-H1", "2026-Q2", "2026-06" (month), "2026-06-15" (day).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


def month_number(value: Any) -> Optional[int]:
    """Month as 1-12 from 6, "6", "06" or "June"; None when invalid."""
    if isinstance(value, int) and not isinstance(value, bool):
        number = value
    elif isinstance(value, str) and value.strip().isdigit():
        number = int(value.strip())
    elif isinstance(value, str) and value.strip().title() in MONTH_NAMES:
        number = MONTH_NAMES.index(value.strip().title()) + 1
    else:
        return None
    return number if 1 <= number <= 12 else None


def month_filter_values(month: int) -> list:
    """Every way a month is stored in records: 6, "6", "06", "June"."""
    return [month, str(month), f"{month:02d}", MONTH_NAMES[month - 1]]


def period_key_from_reporting_period(rp: Dict[str, Any], default_to_year: bool = False) -> Optional[str]:
    """Task period key for a record's reporting_period dict; None when it can't be built."""
    rp_type = rp.get("reporting_type") or rp.get("type")
    year = rp.get("year")
    if rp_type == "monthly":
        month = month_number(rp.get("month"))
        return f"{year}-{month:02d}" if month and year else None
    if rp_type == "quarterly":
        quarter = str(rp.get("quarter") or "1").replace("Q", "")
        return f"{year}-Q{quarter}" if year else None
    if rp_type in ("daily", "weekly"):
        return rp.get("date")
    if rp_type == "yearly" or default_to_year:
        return str(year) if year else None
    return None


def period_key_for_frequency(start: datetime, frequency: str) -> str:
    """Task period key of the period beginning at `start`."""
    if frequency in ("daily", "weekly"):
        return start.strftime("%Y-%m-%d")
    if frequency == "quarterly":
        return f"{start.year}-Q{(start.month - 1) // 3 + 1}"
    if frequency == "half_yearly":
        return f"{start.year}-H{1 if start.month <= 6 else 2}"
    if frequency == "yearly":
        return str(start.year)
    return f"{start.year}-{start.month:02d}"


def period_key_candidates(period_key: str) -> List[str]:
    """A monthly key also matches its enclosing quarterly task ("2026-06" -> "2026-Q2")."""
    parts = str(period_key).split("-")
    if len(parts) == 2 and len(parts[0]) == 4 and parts[1].isdigit() and 1 <= int(parts[1]) <= 12:
        return [period_key, f"{parts[0]}-Q{(int(parts[1]) - 1) // 3 + 1}"]
    return [period_key]


def key_months(period_key: str) -> Tuple[Optional[int], List[Tuple[int, int]]]:
    """(year, [(year, month), ...]) covered by a period key; (None, []) if unparseable."""
    try:
        parts = str(period_key).split("-")
        year = int(parts[0])
        if len(parts) == 1:
            return year, [(year, m) for m in range(1, 13)]
        tag = parts[1]
        if tag.startswith("Q"):
            first = (int(tag[1:]) - 1) * 3 + 1
            return year, [(year, m) for m in range(first, first + 3)]
        if tag.startswith("H"):
            first = 1 if int(tag[1:]) == 1 else 7
            return year, [(year, m) for m in range(first, first + 6)]
        return year, [(year, int(tag))]
    except (ValueError, IndexError):
        return None, []


def period_query_clause(period_key: str) -> Optional[Dict[str, Any]]:
    """Mongo condition restricting records (reporting_period dict) to a period key."""
    year, months = key_months(period_key)
    if year is None:
        return None
    tag = str(period_key).split("-")[1] if "-" in str(period_key) else None
    if tag is None:
        return {"reporting_period.year": year}
    month_values = [value for _, month in months for value in month_filter_values(month)]
    month_clause = {"reporting_period.year": year, "reporting_period.month": {"$in": month_values}}
    if tag.startswith("Q"):
        quarter = int(tag[1:])
        return {"$or": [month_clause, {"reporting_period.year": year, "reporting_period.quarter": {"$in": [f"Q{quarter}", str(quarter), quarter]}}]}
    return month_clause


def reporting_period_in_key(reporting_period: Any, period_key: str) -> bool:
    """True when a record's reporting_period (dict or "YYYY-MM" string) falls inside the period key."""
    year, months = key_months(period_key)
    if year is None:
        return False
    covered = set(months)
    tag = str(period_key).split("-")[1] if "-" in str(period_key) else None
    if isinstance(reporting_period, str):
        try:
            rp_year, rp_month = (int(part) for part in reporting_period[:7].split("-"))
        except ValueError:
            return False
        return (rp_year, rp_month) in covered
    if not isinstance(reporting_period, dict):
        return False
    try:
        rp_year = int(reporting_period.get("year"))
    except (TypeError, ValueError):
        return False
    month = month_number(reporting_period.get("month"))
    if month:
        return (rp_year, month) in covered
    quarter = reporting_period.get("quarter")
    if quarter and tag and tag.startswith("Q"):
        return rp_year == year and int(str(quarter).replace("Q", "")) == int(tag[1:])
    return tag is None and rp_year == year
