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


def extract_json(raw_text: str, default: Any = None) -> Any:
    text = str(raw_text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text).strip()
    if not text:
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"[\[{]", text)
        if not match:
            return default
        try:
            value, _ = json.JSONDecoder().raw_decode(text[match.start():])
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
    if value is None or str(value).strip().lower() in {"", "none", "null", "n/a", "-", "—"}:
        return None, None
    cleaned = re.sub(r"(?i)\b(rs\.?|inr|usd|eur|gbp)\b|[$₹€£,\s]", "", str(value))
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
        "INR": {"rupees", "rupee", "rs", "rs.", "₹", "inr"},
        "USD": {"$", "usd", "dollar", "dollars"},
        "EUR": {"€", "eur", "euro", "euros"},
        "GBP": {"£", "gbp", "pound", "pounds"},
    }
    for code, aliases in groups.items():
        if raw in aliases:
            return code
    code = re.sub(r"[^A-Za-z]", "", str(value or "")).upper()
    return code if len(code) == 3 else "INR"


def normalize_unit(value: Any, category: str = "") -> str | None:
    raw = str(value or "").strip()
    if not raw or raw.lower() in {"none", "null", "n/a", "-", "—"}:
        return None
    key = raw.lower()
    if key in {"unit", "units"} and "electric" in category.lower():
        return "kWh"
    units = {
        "kg": "kg", "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
        "g": "g", "gram": "g", "grams": "g", "ton": "tonnes", "tons": "tonnes",
        "tonne": "tonnes", "tonnes": "tonnes", "mt": "tonnes", "l": "Liters",
        "ltr": "Liters", "litre": "Liters", "litres": "Liters", "liter": "Liters",
        "liters": "Liters", "kl": "kL", "kilolitre": "kL", "kiloliter": "kL",
        "m3": "m3", "m³": "m3", "cum": "m3", "gal": "Gallons", "gallon": "Gallons",
        "kwh": "kWh", "mwh": "MWh", "gj": "GJ", "mj": "MJ", "tj": "TJ",
        "km": "km", "kms": "km", "mile": "miles", "miles": "miles",
        "night": "room_nights", "nights": "room_nights", "room_night": "room_nights",
        "trip": "trips", "trips": "trips", "unit": "units", "units": "units",
    }
    return units.get(key, raw)


def convert_quantity(quantity: float | None, unit: str | None) -> tuple[float | None, str | None]:
    if quantity is None or not unit:
        return quantity, unit
    key = unit.lower()
    conversions = {
        "g": (0.001, "kg"), "grams": (0.001, "kg"), "ml": (0.001, "Liters"),
        "lbs": (0.45359237, "kg"), "lb": (0.45359237, "kg"),
        "gallons": (3.78541, "Liters"), "gallon": (3.78541, "Liters"),
    }
    if key not in conversions:
        return quantity, unit
    multiplier, target = conversions[key]
    return round(quantity * multiplier, 6), target


def normalize_date(value: Any) -> tuple[str | None, bool]:
    if value is None or str(value).strip().lower() in {"", "none", "null", "n/a"}:
        return None, False
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    else:
        raw = str(value).strip().split("T", 1)[0]
        parsed = None
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%d %B %Y"):
            try:
                parsed = datetime.strptime(raw, fmt).date()
                break
            except ValueError:
                continue
        if parsed is None:
            return raw, False
    return parsed.isoformat(), parsed > date.today()


def normalize_period(start: Any, end: Any, text: Any, invoice_date: Any) -> dict:
    start_value, _ = normalize_date(start)
    end_value, _ = normalize_date(end)
    period_text = str(text or "").strip() or None
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


def normalize_scope(value: Any) -> str:
    compact = re.sub(r"[^a-z0-9]", "", str(value or "").lower())
    return {"scope1": "scope1", "scope2": "scope2", "scope3": "scope3", "water": "water"}.get(compact, "scope3")
