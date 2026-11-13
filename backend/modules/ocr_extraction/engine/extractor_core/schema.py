"""The one item shape every reader produces (table layouts, the row-by-row reader, documents) and the checks they share.

Readers differ in HOW they find values; after that every item looks the same and goes through validate_item, so the same
signals decide how much a reading is trusted - no reader is judged only by its own (or an AI's) confidence.
"""
from __future__ import annotations

import math

from .units import normalize_unit

DEFAULTS = {
    "description": "", "quantity": None, "unit": None, "amount": None, "currency": None, "distance_km": None, "weight_kg": None,
    "facility_hint": None, "vendor": None, "invoice_number": None, "hsn": None, "origin": None, "destination": None, "notes": None,
    "date": None, "period_hint": None, "context": "", "line_confidence": 0.97, "raw": {},
    "read_state": "extracted", "read_notes": [], "processing_error": None,
}


def new_item(source: dict, **fields) -> dict:
    """An item with every common field present. `source` carries file/sheet/row; extra fields are kept as given."""
    item = {k: (type(v)(v) if isinstance(v, (dict, list)) else v) for k, v in DEFAULTS.items()}
    item.update(fields)
    item["source"] = source
    return item


def validate_item(item: dict) -> dict:
    """Independent signals about a reading (none of them is an AI's self-reported confidence). Stored on the item as
    `read_signals`; line_confidence drops when the numbers are not backed by a recognised unit or are not finite."""
    q, a, d = item.get("quantity"), item.get("amount"), item.get("distance_km")
    values = [v for v in (q, a, d) if v is not None]
    unit = normalize_unit(item.get("unit")) if item.get("unit") else None
    signals = {
        "values_finite": all(isinstance(v, (int, float)) and math.isfinite(v) for v in values),
        "has_value": bool(values),
        "unit_recognised": q is None or unit is not None,
        "unit_fits_value": unit is None or unit["dimension"] not in ("currency",) or q is None,
        "code_read": not (item.get("scan") or {}).get("ai_resolved"),
        "no_open_notes": not item.get("read_notes"),
    }
    item["read_signals"] = signals
    failed = [k for k, ok in signals.items() if not ok]
    if not signals["values_finite"]:
        item["quantity"] = item["amount"] = item["distance_km"] = None
        item["read_notes"].append("A value in this row is not a finite number")
    if failed and item.get("read_state") == "extracted":
        item["line_confidence"] = min(item.get("line_confidence", 0.97), 0.9 - 0.1 * (len(failed) - 1))
    return signals
