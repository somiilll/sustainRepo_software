"""Database-backed factor and unit options for OCR row correction."""
from __future__ import annotations

import re
from typing import Any

from .taxonomy_service import infer_scope3_activity_type


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


def matches_industry_sector(record: dict, industry_sector: str) -> bool:
    """Keep unclassified legacy fuels while preferring a facility's exact sector."""
    requested_sector = normalize_option(industry_sector)
    if not requested_sector:
        return True
    sectors = record.get("industry_sectors") or []
    if isinstance(sectors, str):
        sectors = [sectors]
    sectors = [*sectors, record.get("industry_sector")]
    configured_sectors = [sector for sector in sectors if str(sector or "").strip()]
    return not configured_sectors or any(
        normalize_option(sector) == requested_sector for sector in configured_sectors
    )


def _units(record: dict) -> list[str]:
    values = [str(unit) for unit in (record.get("allowed_units") or []) if str(unit).strip()]
    default = record.get("default_unit")
    if default and str(default) not in values:
        values.append(str(default))
    return list(dict.fromkeys(values))


def factor_database_fallback(scope: str, category: str, method: str, activity: str = "") -> str:
    scope_key = normalize_option(scope)
    method_key = normalize_method(method)
    category_key = normalize_option(category)
    activity_key = normalize_option(activity)
    if method_key == "spend":
        return "USEEIO"
    if method_key == "supplier":
        return "Supplier"
    if scope_key == "scope1":
        return "IPCC"
    if scope_key == "scope2":
        return "DEFRA" if any(token in category_key for token in ("heat", "steam", "cooling")) else "CEA"
    if scope_key == "scope3":
        if category_key.startswith("c3") and any(token in activity_key for token in ("tdloss", "gridloss", "transmission", "distributionloss")):
            return "NITI Aayog"
        if category_key.startswith("c5") or category_key.startswith("c12"):
            return "US EPA"
        return "DEFRA"
    if scope_key == "water":
        return "ESG Water"
    return "Factor database"


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
        "activity_type": infer_scope3_activity_type(record.get("category"), value) or record.get("activity_type") or "",
        "collection": collection,
        "naics_code": naics_match.group(1) if naics_match else None,
        "naics_label": naics_match.group(2).strip() if naics_match else None,
    }


async def resolve_factor_options(
    db,
    scope: str,
    category: str,
    method: str,
    industry_sector: str = "",
) -> list[dict]:
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
             "industry_sector": 1, "industry_sectors": 1, "allowed_units": 1, "default_unit": 1,
             "source": 1, "source_name": 1},
        ).to_list(10000)
        for record in records:
            if normalize_option(record.get("scope")) != scope_key:
                continue
            if scope_key == "scope1" and not matches_industry_sector(record, industry_sector):
                continue
            categories = [record.get("category"), *(record.get("categories") or [])]
            if category_key and not any(normalize_option(value) == category_key for value in categories if value):
                continue
            if record.get("fuel_name"):
                fallback = factor_database_fallback(scope, category, method, record.get("fuel_name") or "")
                options.append(_option(record, value_field="fuel_name", source_fallback=fallback, collection="fuel_database"))

    elif scope_key == "scope3":
        records = await db.scope3_ef.find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "category": 1, "activity": 1, "method": 1, "activity_type": 1, "allowed_units": 1,
             "default_unit": 1, "source": 1, "source_name": 1, "ef_database": 1},
        ).to_list(10000)
        for record in records:
            if category_key and normalize_option(record.get("category")) != category_key:
                continue
            if method_key and normalize_method(record.get("method")) != method_key:
                continue
            if record.get("activity"):
                fallback = factor_database_fallback(scope, category, method, record.get("activity") or "")
                options.append(_option(record, value_field="activity", source_fallback=fallback, collection="scope3_ef"))

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
        option_words = set(re.findall(r"[a-z0-9]+", str(option.get("value") or "").lower()))
        gaseous_terms = {"methane", "hydrogen", "biogas", "biomethane", "cng", "lng"}
        is_gaseous = ("gas" in option_words and "oil" not in option_words) or bool(option_words & gaseous_terms)
        if (
            option.get("collection") in {"fuel_database", "scope3_ef"}
            and "m3" in option["unit_aliases"]
            and is_gaseous
        ):
            option["unit_aliases"]["m3"] = list(dict.fromkeys([
                *option["unit_aliases"]["m3"], "SCM", "standard cubic meter", "standard cubic metre",
            ]))

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
    currency: str,
    industry_sector: str = "",
) -> dict:
    options = await resolve_factor_options(db, scope, category, method, industry_sector)
    selected = next((option for option in options if option["id"] == factor_id), None)
    if selected is None and lookup_value:
        selected = next((option for option in options if normalize_option(option["value"]) == normalize_option(lookup_value)), None)
    if selected is None:
        raise ValueError("Select a factor available for the chosen scope, category, and calculation method")
    allowed_units = selected.get("allowed_units") or []
    input_field = "currency" if normalize_method(method) == "spend" else "unit"
    input_value = currency if input_field == "currency" else unit
    if not allowed_units:
        raise ValueError(f"No allowed {'currencies' if input_field == 'currency' else 'quantity units'} are configured for '{selected['label']}'")
    if not input_value:
        raise ValueError(f"Select a {'currency' if input_field == 'currency' else 'quantity unit'} for the chosen factor")
    matched_value = next((value for value in allowed_units if value == input_value), None)
    if matched_value is None:
        for value in allowed_units:
            aliases = selected.get("unit_aliases", {}).get(value, [value])
            if any(normalize_option(alias) == normalize_option(input_value) for alias in aliases):
                matched_value = value
                break
    if matched_value is None:
        raise ValueError(f"{'Currency' if input_field == 'currency' else 'Unit'} '{input_value}' is not allowed for '{selected['label']}'")
    selected["selected_input_field"] = input_field
    selected["selected_input_value"] = matched_value or input_value
    return selected