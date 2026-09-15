"""Invoice reconciliation and row-quality rules aligned with the uploaded processor."""
from __future__ import annotations

import re
from typing import Any

from .normalization import convert_quantity, normalize_confidence_score, normalize_currency, normalize_unit, parse_number


IGNORE_LOW_CONFIDENCE = {
    "vendor_name", "vendor_type", "vendor_address", "unit_price",
    "buyer_name", "buyer_address", "service_address",
}


def _numeric(value: Any) -> float:
    number, error = parse_number(value)
    return float(number) if number is not None and not error else 0.0


def reconcile_invoice_items(invoice: dict) -> list[dict]:
    """Drop parent totals and distribute the invoice grand total across leaf rows."""
    financials = invoice.get("invoice_financials") or {}
    grand_total = financials.get("grand_total")
    if grand_total is None:
        grand_total = invoice.get("grand_total")
    currency = financials.get("currency") or invoice.get("currency") or "USD"
    raw_items = invoice.get("primary_activity_items") or invoice.get("line_items") or []
    items = [dict(item) for item in raw_items if isinstance(item, dict)]
    if len(items) > 1:
        cleaned: list[dict] = []
        for index, candidate in enumerate(items):
            description = str(candidate.get("item_description_english") or candidate.get("item_description") or "").lower()
            is_summary = bool(candidate.get("is_summary_header"))
            has_summary_word = bool(re.search(r"\b(total|subtotal|grand\s*total|invoice\s*total|summary|net\s*total|amount\s*due)\b", description))
            if is_summary:
                continue
            if has_summary_word:
                unit = str(candidate.get("unit") or "").lower().strip()
                has_no_unit = not unit or unit in {"none", "n/a", "nil", "-", "null"}
                cost = _numeric(candidate.get("base_cost") or candidate.get("total_cost") or candidate.get("amount"))
                other_cost = sum(_numeric(row.get("base_cost") or row.get("total_cost") or row.get("amount")) for position, row in enumerate(items) if position != index)
                quantity = _numeric(candidate.get("quantity"))
                other_quantity = sum(_numeric(row.get("quantity")) for position, row in enumerate(items) if position != index)
                if has_no_unit or (cost > 0 and abs(cost - other_cost) <= 1.0) or (quantity > 0 and abs(quantity - other_quantity) <= 0.1):
                    continue
            cleaned.append(candidate)
        if cleaned:
            items = cleaned

    total_base = sum(_numeric(item.get("base_cost") or item.get("total_cost")) for item in items)
    grand_total_number, grand_total_error = parse_number(grand_total)
    if grand_total_number is not None and not grand_total_error and items:
        remaining = float(grand_total_number)
        for index, item in enumerate(items):
            base = _numeric(item.get("base_cost") or item.get("total_cost"))
            share = (base / total_base) * float(grand_total_number) if total_base > 0 else float(grand_total_number) / len(items)
            allocated = round(remaining if index == len(items) - 1 else share, 2)
            item["total_cost"] = allocated
            remaining -= allocated
            if not item.get("currency"):
                item["currency"] = currency
    else:
        for item in items:
            if item.get("total_cost") is None:
                item["total_cost"] = item.get("base_cost")
            if not item.get("currency"):
                item["currency"] = currency
    return items


def prepare_item(item: dict, *, future_date: bool) -> dict:
    """Normalize one row and apply uploaded confidence, warning, and validation tiers."""
    prepared = dict(item)
    freight = prepared.get("freight_details") or {}
    travel = prepared.get("travel_details") or {}
    raw_distance = freight.get("distance_km") or travel.get("distance_km") or prepared.get("distance_km")
    quantity, quantity_error = parse_number(prepared.get("quantity"), positive=True)
    cost, cost_error = parse_number(prepared.get("total_cost"))
    distance, distance_error = parse_number(raw_distance)
    unit = normalize_unit(prepared.get("unit"))
    quantity, unit = convert_quantity(quantity, unit)
    has_activity = bool((quantity is not None and quantity > 0) or (distance is not None and distance > 0))
    has_cost = bool(cost is not None and cost > 0)
    missing_values = not has_activity and not has_cost

    ignored = set(IGNORE_LOW_CONFIDENCE)
    if has_activity:
        ignored.update({"cost", "total_cost", "price", "missing cost", "missing price", "missing_cost", "base_cost"})
    if has_cost and not has_activity:
        ignored.update({"quantity", "qty", "missing qty", "missing quantity", "missing_qty"})
    raw_low = list(prepared.get("low_confidence_fields") or [])
    low_fields = [value for value in raw_low if str(value).lower().strip() not in ignored]
    if future_date:
        low_fields.append("future date detected")
    for error in (quantity_error, cost_error, distance_error):
        if error:
            low_fields.append(error)

    unit_value = str(unit or "").strip().lower()
    unit_issue = has_activity and (
        any(any(token in str(field).lower() for token in ("unit", "uom")) for field in raw_low)
        or not unit_value or unit_value in {"none", "null", "unknown", "—", "-"}
    )
    confidence = normalize_confidence_score(prepared.get("confidence_score"), fallback=85)
    validation_error = bool(future_date or quantity_error or cost_error or distance_error)
    if missing_values:
        confidence = min(confidence, 40)
        if not any("missing" in str(field).lower() for field in low_fields):
            low_fields.append("missing qty & cost")
    elif validation_error:
        confidence = min(confidence, 50)
    elif unit_issue:
        confidence = min(confidence, 75)
        if not any("unit" in str(field).lower() for field in low_fields):
            low_fields.append("missing unit" if not unit_value else "inferred unit")

    warnings: list[str] = []
    if future_date:
        warnings.append("AUDIT WARNING: Future invoice/transaction date detected. Please verify issue date.")
    for error in (quantity_error, cost_error, distance_error):
        if error:
            warnings.append(f"DATA QUALITY WARNING: {error}.")
    if missing_values:
        warnings.append("DATA GAP: Both physical activity (quantity/distance) and financial cost are missing. Emissions cannot be calculated without input data.")
    elif unit_issue:
        warnings.append("ASSUMPTION: Physical quantity was extracted without an explicit unit printed on the document. Please verify.")

    prepared.update(
        quantity=quantity,
        unit=unit,
        total_cost=cost,
        distance_km=distance,
        currency=normalize_currency(prepared.get("currency")),
        confidence_score=confidence,
        low_confidence_fields=list(dict.fromkeys(str(value) for value in low_fields)),
        missing_values=missing_values,
        quality_warnings=warnings,
    )
    return prepared