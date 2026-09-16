"""Pure normalization helpers used by image and spreadsheet ingestion."""
from __future__ import annotations

import calendar
import json
import math
import re
from datetime import date, datetime
from typing import Any


MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
    7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
}


def extract_json(raw_text: str, default: Any = None) -> Any:
    text = str(raw_text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()
    if not text:
        return default
    match = re.search(r"[\[{]", text)
    if not match:
        return default
    candidate = text[match.start():]
    candidates = [candidate]
    if candidate.startswith("[") and (last_object := candidate.rfind("}")) >= 0:
        candidates.append(candidate[:last_object + 1].rstrip().rstrip(",") + "]")
    if candidate.startswith("{") and (last_object := candidate.rfind("}")) >= 0:
        prefix = candidate[:last_object + 1].rstrip().rstrip(",")
        candidates.extend((prefix + "]}", prefix + "}"))

    stack: list[str] = []
    in_string = False
    escaped = False
    for character in candidate:
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character in "[{":
            stack.append(character)
        elif character in "]}" and stack:
            expected = "[" if character == "]" else "{"
            if stack[-1] == expected:
                stack.pop()
    if stack and not in_string:
        repaired = candidate.rstrip().rstrip(",") + "".join("]" if opening == "[" else "}" for opening in reversed(stack))
        candidates.append(repaired)

    for value in candidates:
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            continue
    try:
        value, _ = json.JSONDecoder().raw_decode(candidate)
        return value
    except json.JSONDecodeError:
        return default


def sanitize_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: sanitize_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_json(item) for item in value]
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def normalize_confidence_score(value: Any, fallback: Any = None) -> int | None:
    candidate = value
    if candidate is None or (isinstance(candidate, str) and not candidate.strip()):
        candidate = fallback
    if candidate is None:
        return None
    if isinstance(candidate, bool):
        return normalize_confidence_score(fallback) if fallback is not None and fallback != value else None
    if isinstance(candidate, str):
        candidate = candidate.strip().removesuffix("%").strip()
    try:
        score = float(candidate)
    except (TypeError, ValueError, OverflowError):
        if fallback is None or fallback == value:
            return None
        return normalize_confidence_score(fallback)
    if math.isnan(score) or math.isinf(score):
        return normalize_confidence_score(fallback) if fallback is not None and fallback != value else None
    if 0 < score <= 1:
        score *= 100
    return max(0, min(100, round(score)))


def parse_number(value: Any, *, positive: bool = False) -> tuple[float | None, str | None]:
    if value is None or str(value).strip().lower() in {"", "none", "null", "-", "—"}:
        return None, None
    cleaned = re.sub(r"(?i)\b(rs\.?|inr|usd|eur|gbp|re)\b|[$₹€£,\s]", "", str(value))
    try:
        number = float(cleaned)
    except (TypeError, ValueError, OverflowError):
        return None, f"Non-numeric value: {value}"
    if math.isnan(number) or math.isinf(number):
        return None, f"Non-numeric value: {value}"
    if positive and number <= 0:
        return number, f"Value must be greater than zero: {value}"
    if number < 0:
        return number, f"Negative value: {value}"
    return number, None


def normalize_currency(value: Any) -> str:
    raw = str(value or "INR").strip().lower()
    groups = {
        "INR": {"rupees", "rupaiya", "rupee", "rs", "rs.", "₹", "re", "re.", "inr", "inr."},
        "USD": {"$", "usd", "dollar", "dollars", "us dollar", "us dollars"},
        "EUR": {"€", "eur", "euro", "euros"},
        "GBP": {"£", "gbp", "pound", "pounds", "british pound"},
    }
    for code, aliases in groups.items():
        if raw in aliases:
            return code
    code = re.sub(r"[^A-Za-z]", "", str(value or "")).upper()
    return code if len(code) == 3 else "INR"


def normalize_unit(value: Any, category: str = "") -> str | None:
    raw = str(value or "").strip()
    if not raw or raw.lower() in {"none", "null", "undefined", "n/a", "-", "—"}:
        return None
    key = raw.lower()
    if key in {"unit", "units"} and "electric" in category.lower():
        return "kWh"
    units = {
        "kg": "kg", "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
        "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g", "ton": "tonnes", "tons": "tonnes",
        "tonne": "tonnes", "tonnes": "tonnes", "mt": "tonnes", "l": "Liters",
        "ltr": "Liters", "ltrs": "Liters", "litre": "Liters", "litres": "Liters", "liter": "Liters",
        "liters": "Liters", "kl": "kL", "kilolitre": "kL", "kiloliter": "kL", "kiloliters": "kL",
        "m3": "m3", "m³": "m3", "cu.m": "m3", "cum": "m3", "gal": "Gallons", "gals": "Gallons", "gallon": "Gallons", "gallons": "Gallons",
        "kwh": "kWh", "kwhr": "kWh", "kw-h": "kWh", "mwh": "MWh", "mwhr": "MWh", "mw-h": "MWh",
        "gj": "GJ", "gigajoule": "GJ", "mj": "MJ", "megajoule": "MJ", "tj": "TJ",
        "therm": "Therms", "therms": "Therms", "km": "km", "kms": "km", "kilometer": "km", "kilometers": "km",
        "mile": "miles", "miles": "miles", "night": "room_nights", "nights": "room_nights",
        "room_night": "room_nights", "room_nights": "room_nights", "trip": "trips", "trips": "trips",
        "passenger": "passengers", "passengers": "passengers", "pax": "passengers", "unit": "units", "units": "units",
    }
    return units.get(key, raw)


def convert_quantity(quantity: float | None, unit: str | None) -> tuple[float | None, str | None]:
    if quantity is None or not unit:
        return quantity, unit
    try:
        numeric_quantity = float(quantity)
    except (TypeError, ValueError):
        return quantity, unit
    key = str(unit).strip().lower()
    if key in ("ml", "milliliter", "milliliters"):
        return round(numeric_quantity / 1000.0, 4), "Liters"
    if key in ("g", "gm", "gms", "gram", "grams"):
        return round(numeric_quantity / 1000.0, 4), "kg"
    if key in ("lb", "lbs", "pound", "pounds"):
        return round(numeric_quantity * 0.45359237, 2), "kg"
    if key in ("oz", "ounce", "ounces"):
        return round(numeric_quantity * 0.0283495, 3), "kg"
    if key in ("gal", "gals", "gallon", "gallons", "us gal"):
        return round(numeric_quantity * 3.78541, 2), "Liters"
    return quantity, unit


def normalize_date(value: Any) -> tuple[str | None, bool]:
    if value is None or str(value).strip().lower() in {"", "none", "null", "n/a"}:
        return None, False
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    else:
        raw = str(value).strip()
        try:
            serial = float(raw)
            if 20000 <= serial <= 90000:
                from openpyxl.utils.datetime import from_excel
                parsed = from_excel(serial).date()
                return parsed.isoformat(), parsed > date.today()
        except (TypeError, ValueError, OverflowError):
            pass
        if "T" in raw:
            raw = raw.split("T", 1)[0].strip()
        elif re.search(r"\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\s+\d{1,2}:\d{2}", raw):
            raw = re.split(r"\s+", raw)[0].strip()
        else:
            raw = re.sub(r"\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?.*$", "", raw, flags=re.IGNORECASE).strip()
        parsed = None
        for fmt in (
            "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
            "%d-%b-%Y", "%d %b %Y", "%b %d, %Y", "%b %d %Y", "%d-%B-%Y", "%d %B %Y",
            "%B %d, %Y", "%B %d %Y", "%m/%d/%Y", "%m-%d-%Y", "%d-%m-%y", "%d/%m/%y",
            "%d.%m.%y", "%y-%m-%d", "%y/%m/%d",
        ):
            try:
                parsed = datetime.strptime(raw, fmt).date()
                break
            except ValueError:
                continue
        if parsed is None:
            try:
                from dateutil import parser as date_parser
                parsed = date_parser.parse(raw, dayfirst=True).date()
            except Exception:
                return raw, False
    return parsed.isoformat(), parsed > date.today()


def normalize_period(start: Any, end: Any, text: Any, invoice_date: Any) -> dict:
    start_value, _ = normalize_date(start)
    end_value, _ = normalize_date(end)
    period_text = normalize_reporting_period(text) or None
    if not start_value and period_text:
        match = re.match(r"^([A-Za-z]+)[\s,-]+(\d{4})$", period_text)
        if match and match.group(1).lower() in MONTHS:
            month, year = MONTHS[match.group(1).lower()], int(match.group(2))
            start_value = date(year, month, 1).isoformat()
            end_value = date(year, month, calendar.monthrange(year, month)[1]).isoformat()
    if not start_value:
        invoice_value, _ = normalize_date(invoice_date)
        if invoice_value and re.match(r"^\d{4}-\d{2}-\d{2}$", invoice_value):
            parsed = date.fromisoformat(invoice_value)
            start_value = parsed.replace(day=1).isoformat()
            end_value = parsed.replace(day=calendar.monthrange(parsed.year, parsed.month)[1]).isoformat()
            period_text = period_text or parsed.strftime("%b %Y")
    return {"start_date": start_value, "end_date": end_value, "period_text": period_text}


def normalize_reporting_period(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw or raw.lower() in {"none", "null", "n/a", "undefined", "—", "-"}:
        return ""
    single_fy = re.match(r"^(?:FY\s*)(\d{2}|\d{4})$", raw, re.IGNORECASE)
    if single_fy:
        end_year_raw = int(single_fy.group(1))
        end_year = 2000 + end_year_raw if end_year_raw < 100 else end_year_raw
        return f"FY {end_year - 1}-{str(end_year)[-2:]}"
    month_year = re.match(r"^(\d{1,2})\s*[-/]\s*(\d{4})$", raw)
    if month_year and 1 <= int(month_year.group(1)) <= 12:
        return f"{MONTH_NAMES[int(month_year.group(1))]} {int(month_year.group(2))}"
    year_month = re.match(r"^(\d{4})\s*[-/]\s*(\d{1,2})$", raw)
    if year_month and 1 <= int(year_month.group(2)) <= 12:
        return f"{MONTH_NAMES[int(year_month.group(2))]} {int(year_month.group(1))}"
    short_month_year = re.match(r"^(\d{1,2})\s*[-/]\s*(\d{2})$", raw)
    if short_month_year and not raw.upper().startswith("FY"):
        month, short_year = int(short_month_year.group(1)), int(short_month_year.group(2))
        if 1 <= month <= 12 and short_year != month + 1:
            return f"{MONTH_NAMES[month]} {2000 + short_year}"
    fiscal_range = re.match(r"^(?:FY\s*)?(\d{2}|\d{4})\s*[-/]\s*(\d{2}|\d{4})$", raw, re.IGNORECASE)
    if fiscal_range:
        first, second = int(fiscal_range.group(1)), int(fiscal_range.group(2))
        start_year = 2000 + first if first < 100 else first
        end_year = 2000 + second if second < 100 else second
        if end_year == start_year + 1 or second == (first + 1) % 100 or raw.upper().startswith("FY"):
            return f"FY {start_year}-{str(start_year + 1)[-2:]}"
        if 1 <= first <= 12:
            return f"{MONTH_NAMES[first]} {end_year}"
    named_month = re.match(r"^([A-Za-z]+)[,\s-]+(\d{4})$", raw)
    if named_month and named_month.group(1).lower() in MONTHS:
        return f"{MONTH_NAMES[MONTHS[named_month.group(1).lower()]]} {int(named_month.group(2))}"
    reversed_named_month = re.match(r"^(\d{4})[,\s-]+([A-Za-z]+)$", raw)
    if reversed_named_month and reversed_named_month.group(2).lower() in MONTHS:
        return f"{MONTH_NAMES[MONTHS[reversed_named_month.group(2).lower()]]} {int(reversed_named_month.group(1))}"
    return raw


def normalize_scope(value: Any) -> str:
    compact = re.sub(r"[^a-z0-9]", "", str(value or "").lower())
    return {"scope1": "scope1", "scope2": "scope2", "scope3": "scope3", "water": "water"}.get(compact, "scope3")
