"""Configuration-aware conversion of OCR activity details into formula inputs."""
from __future__ import annotations

from typing import Any


def _number(value: Any) -> float | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _input(value: Any, unit: str = "") -> dict | None:
    numeric = _number(value)
    return {"value": numeric, "unit": unit} if numeric is not None else None


def _first(*values: Any) -> Any:
    return next((value for value in values if value not in (None, "")), None)


def _tonnes(value: Any, unit: Any) -> float | None:
    quantity = _number(value)
    if quantity is None:
        return None
    normalized = str(unit or "").strip().lower().replace(" ", "")
    if normalized in {"kg", "kilogram", "kilograms", "kgs"}:
        return quantity / 1000
    if normalized in {"g", "gram", "grams", "gms"}:
        return quantity / 1_000_000
    return quantity


def ocr_activity_input_candidates(values: dict) -> dict[str, dict]:
    """Return canonical manual-form candidates without selecting a formula.

    The calculation service later limits these candidates to the exact active
    formula inputs and their live mapping configuration. This keeps raw OCR
    semantics separate from mutable calculation configuration.
    """
    travel = values.get("travel_details") or {}
    freight = values.get("freight_details") or {}
    dynamic = values.get("dynamic_field_values") or {}
    category = str(values.get("category_key") or values.get("category_code") or values.get("category") or "").lower()
    activity_type = str(values.get("scope3_activity_type") or "").lower()
    is_freight = category.startswith("cat_4") or category.startswith("cat_9") or category.startswith("c4") or category.startswith("c9")
    is_business_travel = category.startswith("cat_6") or category.startswith("c6")
    candidates: dict[str, dict] = {}

    def set_if_missing(variable: str, value: Any, unit: str = "") -> None:
        existing = dynamic.get(variable)
        if isinstance(existing, dict) and existing.get("value") not in (None, ""):
            candidates[variable] = existing
            return
        payload = _input(value, unit)
        if payload is not None:
            candidates[variable] = payload

    distance = _first(values.get("distance_km"), travel.get("distance_km"), freight.get("distance_km"))
    goods = _first(values.get("quantity_goods"), freight.get("weight_kg"), freight.get("quantity_goods"), values.get("quantity"))
    goods_unit = _first(values.get("unit_goods"), freight.get("weight_unit"), values.get("unit"), "kg")
    rooms = _first(values.get("rooms"), travel.get("rooms"), travel.get("room_count"))
    nights = _first(values.get("nights"), travel.get("nights"), travel.get("nights_stayed"))
    if rooms in (None, "") and str(values.get("unit") or "").lower() == "room_nights" and values.get("quantity"):
        rooms = 1
    if nights in (None, "") and str(values.get("unit") or "").lower() == "room_nights":
        nights = values.get("quantity")

    if is_freight:
        set_if_missing("qty_travelled", _tonnes(goods, goods_unit), "t")
        set_if_missing("km_travelled", distance, "km")
    elif is_business_travel and activity_type == "hotel_stay":
        set_if_missing("qty_room", rooms, "")
        set_if_missing("qty_nights", nights, "")
    elif is_business_travel:
        set_if_missing("qty_passenger", _first(values.get("passengers"), travel.get("passenger_count")), "")
        days_travelled = _first(values.get("days_travelled"), travel.get("days_travelled"))
        set_if_missing("qty_days_travelled", 1 if days_travelled in (None, "") else days_travelled, "")
        set_if_missing("km_travelled", distance, "km")
    return candidates


async def hydrate_formula_activity_inputs(db, category_id: str, formula_doc: dict, values: dict) -> None:
    """Populate only the mapped inputs used by the selected live formula."""
    formula_inputs = {
        input_def.get("variable"): input_def
        for input_def in formula_doc.get("definition", {}).get("inputs", [])
        if input_def.get("variable")
    }
    if not formula_inputs:
        return
    mappings = await db.ce_input_field_mappings.find(
        {
            "is_active": {"$ne": False},
            "maps_to_variable": {"$in": list(formula_inputs)},
            "$or": [
                {"applies_to_categories": {"$size": 0}},
                {"applies_to_categories": {"$exists": False}},
                {"applies_to_categories": category_id},
            ],
        },
        {"_id": 0, "maps_to_variable": 1, "default_unit": 1},
    ).to_list(100)
    mapping_units = {
        mapping.get("maps_to_variable"): mapping.get("default_unit") or ""
        for mapping in mappings if mapping.get("maps_to_variable")
    }
    candidates = ocr_activity_input_candidates(values)
    dynamic = dict(values.get("dynamic_field_values") or {})
    for variable, declaration in formula_inputs.items():
        if variable in dynamic and isinstance(dynamic[variable], dict) and dynamic[variable].get("value") not in (None, ""):
            continue
        candidate = candidates.get(variable)
        if candidate:
            dynamic[variable] = {
                "value": candidate["value"],
                "unit": candidate.get("unit") or mapping_units.get(variable) or declaration.get("expected_unit") or "",
            }
    values["dynamic_field_values"] = dynamic