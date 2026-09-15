"""Database-backed factor and unit options for OCR row correction."""
from __future__ import annotations

import re
from typing import Any


def normalize_option(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def normalize_method(value: Any) -> str:
    normalized = normalize_option(value)
    return {
        "activitybasis": "activity",
        "activitybased": "activity",
        "spendbasis": "spend",
        "spendbased": "spend",
        "supplierbasis": "supplier",
        "supplierbased": "supplier",
    }.get(normalized, normalized)


def _units(record: dict) -> list[str]:
    values = [str(unit) for unit in (record.get("allowed_units") or []) if str(unit).strip()]
    default = record.get("default_unit")
    if default and str(default) not in values:
        values.append(str(default))
    return list(dict.fromkeys(values))


def _option(record: dict, *, value_field: str, source_fallback: str, collection: str) -> dict:
    value = str(record.get(value_field) or "").strip()
    naics_match = re.match(r"^(\d{2,6})\s*-\s*(.+)$", value)
    return {
        "id": str(record.get("id") or f"{collection}:{normalize_option(value)}"),
        "value": value,
        "label": value,
        "database": record.get("source") or record.get("source_name") or record.get("ef_database") or source_fallback,
        "allowed_units": _units(record),
        "default_unit": record.get("default_unit"),
        "method": normalize_method(record.get("method") or "activity"),
        "collection": collection,
        "naics_code": naics_match.group(1) if naics_match else None,
        "naics_label": naics_match.group(2).strip() if naics_match else None,
    }


async def resolve_factor_options(db, scope: str, category: str, method: str) -> list[dict]:
    scope_key = normalize_option(scope)
    category_key = normalize_option(category)
    method_key = normalize_method(method)
    options: list[dict] = []

    if scope_key in {"scope1", "scope2"}:
        if method_key != "activity":
            return []
        records = await db.fuel_database.find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "fuel_name": 1, "scope": 1, "category": 1, "categories": 1,
             "allowed_units": 1, "default_unit": 1, "source": 1, "source_name": 1},
        ).to_list(10000)
        for record in records:
            if normalize_option(record.get("scope")) != scope_key:
                continue
            categories = [record.get("category"), *(record.get("categories") or [])]
            if category_key and not any(normalize_option(value) == category_key for value in categories if value):
                continue
            if record.get("fuel_name"):
                options.append(_option(record, value_field="fuel_name", source_fallback="fuel_database", collection="fuel_database"))

    elif scope_key == "scope3":
        records = await db.scope3_ef.find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "category": 1, "activity": 1, "method": 1, "allowed_units": 1,
             "default_unit": 1, "source": 1, "source_name": 1, "ef_database": 1},
        ).to_list(10000)
        for record in records:
            if category_key and normalize_option(record.get("category")) != category_key:
                continue
            if method_key and normalize_method(record.get("method")) != method_key:
                continue
            if record.get("activity"):
                options.append(_option(record, value_field="activity", source_fallback="scope3_ef", collection="scope3_ef"))

    elif scope_key == "water" and method_key == "activity":
        records = await db.esg_record_categories.find(
            {"section": "environment", "category": "Water", "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "subcategory": 1, "fields": 1},
        ).sort("order", 1).to_list(100)
        for record in records:
            units = []
            for field in record.get("fields") or []:
                if field.get("field_key") == "unit":
                    units.extend(field.get("options") or field.get("allowed_units") or [])
            water_record = {
                **record,
                "allowed_units": list(dict.fromkeys(str(unit) for unit in units)),
                "default_unit": units[0] if units else None,
                "source": "ESG Water",
                "method": "activity",
            }
            if record.get("subcategory"):
                options.append(_option(water_record, value_field="subcategory", source_fallback="ESG Water", collection="esg_record_categories"))

    unit_keys = sorted({unit for option in options for unit in option.get("allowed_units", [])})
    unit_records = await db.units.find(
        {"symbol": {"$in": unit_keys}, "is_active": {"$ne": False}},
        {"_id": 0, "symbol": 1, "aliases": 1, "name": 1},
    ).to_list(len(unit_keys) or 1)
    aliases_by_symbol = {
        str(record.get("symbol")): list(dict.fromkeys([
            str(record.get("symbol")), str(record.get("name") or ""),
            *(str(alias) for alias in (record.get("aliases") or [])),
        ]))
        for record in unit_records
        if record.get("symbol")
    }
    for option in options:
        option["unit_aliases"] = {
            unit: aliases_by_symbol.get(unit, [unit])
            for unit in option.get("allowed_units", [])
        }

    unique: dict[str, dict] = {}
    for option in options:
        key = f"{option['id']}:{normalize_option(option['value'])}"
        unique[key] = option
    return sorted(unique.values(), key=lambda option: (option["label"].lower(), option["database"].lower()))


async def validate_factor_selection(
    db,
    *,
    scope: str,
    category: str,
    method: str,
    factor_id: str,
    lookup_value: str,
    unit: str,
) -> dict:
    options = await resolve_factor_options(db, scope, category, method)
    selected = next((option for option in options if option["id"] == factor_id), None)
    if selected is None and lookup_value:
        selected = next((option for option in options if normalize_option(option["value"]) == normalize_option(lookup_value)), None)
    if selected is None:
        raise ValueError("Select a factor available for the chosen scope, category, and calculation method")
    allowed_units = selected.get("allowed_units") or []
    if not unit:
        raise ValueError("Select a quantity unit for the chosen factor")
    if allowed_units and unit not in allowed_units:
        raise ValueError(f"Unit '{unit}' is not allowed for '{selected['label']}'")
    return selected