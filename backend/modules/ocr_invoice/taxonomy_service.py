"""Scope classification, methodology routing, and USEEIO/NAICS mapping."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from .classification_cache import BoundedCache, cache_key
from .config import MASTER_TAXONOMY_PATH, NAICS_INDEX_PATH
from .llm_gateway import OcrLlmGateway
from .methodology import resolve_methodology
from .normalization import extract_json, normalize_confidence_score, normalize_scope


SCOPE3_CATEGORY_NAMES = {
    "cat_1_purchased_goods_services": "C1 - Purchased Goods and Services",
    "cat_2_capital_goods": "C2 - Capital Goods",
    "cat_3_fuel_energy_upstream": "C3 - Fuel and energy-related activities",
    "cat_4_upstream_transport": "C4 - Upstream Transportation and Distribution",
    "cat_5_waste_in_operations": "C5 - Waste Generated in Operations",
    "cat_6_business_travel": "C6 - Business Travel",
    "cat_7_employee_commuting": "C7 - Employee Commuting",
    "cat_8_upstream_leased_assets": "C8 - Upstream Leased Assets",
    "cat_9_downstream_transport": "C9 - Downstream Transportation and Distribution",
    "cat_10_processing_of_sold_products": "C10 - Processing of Sold Products",
    "cat_11_use_of_sold_products": "C11 - Use of Sold Products",
    "cat_12_end_of_life_treatment": "C12 - End-of-Life Treatment of Sold Products",
    "cat_13_downstream_leased_assets": "C13 - Downstream Leased Assets",
    "cat_14_franchises": "C14 - Franchises",
    "cat_15_investments": "C15 - Investments",
}

SCOPE_CATEGORY_NAMES = {
    "stationary_combustion": "Stationary Combustion",
    "mobile_combustion": "Mobile Combustion",
    "fugitive_emissions": "Fugitive Emissions",
    "purchased_electricity": "Purchased Electricity",
    "purchased_heat_steam_cooling": "Purchased Steam/Heat",
}

WATER_CATEGORY_NAMES = {"water": "Water"}

_CLASSIFICATION_CACHE = BoundedCache()
_USEEIO_CACHE = BoundedCache()


@lru_cache(maxsize=1)
def load_taxonomy() -> dict:
    with MASTER_TAXONOMY_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def load_naics_index() -> dict:
    with NAICS_INDEX_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _flat_taxonomy(enabled_scopes: set[str], disabled_scope3_sheets: set[str]) -> list[str]:
    rows: list[str] = []
    taxonomy = load_taxonomy()
    for scope_key, categories in taxonomy.items():
        normalized_scope = normalize_scope(scope_key)
        if normalized_scope not in enabled_scopes:
            continue
        if scope_key == "water":
            rows.extend(
                f"water | water | Water | {subcategory}"
                for subcategory in categories.get("subcategories", [])
            )
            continue
        for category_key, category_data in categories.items():
            category_name = SCOPE3_CATEGORY_NAMES.get(category_key, SCOPE_CATEGORY_NAMES.get(category_key, category_key))
            code_match = re.match(r"C(\d+)", category_name)
            if code_match and f"C{code_match.group(1)}" in disabled_scope3_sheets:
                continue
            subcategories = category_data.get("subcategories", [])
            if isinstance(subcategories, dict):
                subcategories = [item for values in subcategories.values() for item in values]
            subcategories = [*subcategories, *category_data.get("defra_subcategories", [])]
            if not subcategories:
                rows.append(f"{normalized_scope} | {category_key} | {category_name}")
            else:
                rows.extend(f"{normalized_scope} | {category_key} | {category_name} | {sub}" for sub in subcategories)
    return sorted(set(rows))


def _context_text(item: dict, invoice: dict, org_context: dict) -> str:
    facilities = "; ".join(
        " — ".join(filter(None, [
            location.get("name"),
            location.get("sector"),
            location.get("sub_sector"),
        ]))
        for location in org_context.get("locations", [])
    )
    freight = item.get("freight_details") or {}
    travel = item.get("travel_details") or {}
    waste = item.get("waste_details") or {}
    context_lines = [
        f"Organization: {org_context.get('company_name') or 'Not specified'}",
        f"Organization profile: {org_context.get('organization_profile') or 'Not specified'}",
        f"Facility sectors (facility — sector — sub-sector): {facilities or 'Not specified'}",
        f"Products/processes: {org_context.get('products') or 'Not specified'}",
        f"Vendor: {invoice.get('vendor_name') or 'Unknown'} ({invoice.get('vendor_type') or 'Unknown'})",
        f"Buyer: {invoice.get('buyer_name') or 'Unknown'} ({invoice.get('buyer_address') or 'Unknown'})",
        f"Item: {item.get('item_description_english') or item.get('item_description') or 'Unknown'}",
        f"Item category hint: {item.get('item_category_hint') or 'Other'}",
        f"Material nature: {item.get('material_nature') or 'composite_product'}",
        f"Primary material: {item.get('primary_material') or 'Not specified'}",
        f"HSN/SAC: {item.get('hsn_sac_code') or 'Not specified'}",
        f"Quantity/unit: {item.get('quantity')} {item.get('unit') or ''}",
        f"Spend: {item.get('total_cost')} {item.get('currency') or ''}",
        f"Additional context: {item.get('additional_context') or ''}",
    ]
    if freight:
        context_lines.append(f"Freight: mode={freight.get('mode')}, route={freight.get('origin')} to {freight.get('destination')}, distance={freight.get('distance_km')} km, weight={freight.get('weight_kg')} kg")
    if travel:
        context_lines.append(f"Travel: mode={travel.get('mode')}, class={travel.get('class')}, vehicle={travel.get('vehicle_type')}, passengers={travel.get('passenger_count')}, route={travel.get('origin')} to {travel.get('destination')}, distance={travel.get('distance_km')} km")
    if waste:
        context_lines.append(f"Waste: type={waste.get('waste_type')}, disposal={waste.get('disposal_method')}")
    return "\n".join(context_lines)


async def _map_naics(gateway: OcrLlmGateway, item_description: str, context: str, organization_id: str) -> tuple[str, str]:
    mapping_key = cache_key("useeio", organization_id, gateway.mode.reasoning_model, item_description.strip().lower(), context)
    cached_mapping = _USEEIO_CACHE.get(mapping_key)
    if cached_mapping:
        return tuple(cached_mapping)
    index = load_naics_index()
    subsectors = "\n".join(f"{code}: {value['name']}" for code, value in index.items())
    stage_one = await gateway.reason(
        "You are an economic taxonomy specialist classifying invoice expenditure into 2017 NAICS for USEEIO spend-based emissions modeling.",
        f"Classify the fundamental commodity, asset, or service being procured. Use vendor context only to understand its technical domain.\n\n"
        f"Item to classify: {item_description}\n{context}\n\nAvailable 3-digit NAICS subsectors:\n{subsectors}\n\n"
        "Select the top four probable codes. Return only a JSON array, for example [\"331\", \"332\", \"339\"].",
        max_tokens=500,
    )
    selected = extract_json(stage_one, [])
    selected_codes = selected.get("codes", []) if isinstance(selected, dict) else selected if isinstance(selected, list) else []
    codes = [str(code) for code in selected_codes if str(code) in index][:4]
    if not codes:
        codes = [code for code in ("331", "332", "541") if code in index]
    candidates = [commodity for code in codes for commodity in index[code].get("commodities", [])]
    if not candidates:
        candidates = [
            commodity
            for code in ("331", "332", "334", "541", "484", "811")
            if code in index
            for commodity in index[code].get("commodities", [])
        ]
    stage_two = await gateway.reason(
        "You are an economic commodity classifier for USEEIO spend-based emissions modeling.",
        f"Select the single closest exact commodity for the fundamental item or service being procured.\n\nItem and context:\n{item_description}\n{context}\n\nCandidate commodities:\n"
        + "\n".join(candidates)
        + "\n\nReturn JSON only: {\"selected_commodity\": \"exact candidate string\"}.",
        max_tokens=700,
    )
    result = extract_json(stage_two, {})
    commodity = (result.get("selected_commodity") or result.get("commodity")) if isinstance(result, dict) else None
    if commodity not in candidates:
        commodity = candidates[0] if candidates else "541990 - All Other Professional, Scientific, and Technical Services"
    code, _, label = commodity.partition(" - ")
    mapping = (code.strip(), label.strip() or commodity)
    _USEEIO_CACHE.set(mapping_key, mapping)
    return mapping

async def classify_item(
    gateway: OcrLlmGateway,
    item: dict,
    invoice: dict,
    org_context: dict,
    enabled_scopes: set[str],
    disabled_scope3_sheets: set[str],
    cached_override: dict | None = None,
) -> dict:
    if cached_override:
        return {**cached_override, "needs_review": False, "classification_source": "verified_override"}
    description = item.get("item_description_english") or item.get("item_description") or "Unknown item"
    context = _context_text(item, invoice, org_context)
    taxonomy_rows = _flat_taxonomy(enabled_scopes, disabled_scope3_sheets)
    organization_id = str(org_context.get("organization_id") or "")
    classification_key = cache_key("classification", organization_id, gateway.mode.reasoning_model, context, taxonomy_rows)
    parsed = _CLASSIFICATION_CACHE.get(classification_key)
    if parsed is None:
        response = await gateway.reason(
            "You are an expert GHG Protocol accountant. Classify one invoice activity into the supplied organization-enabled taxonomy.",
            f"{context}\n\nAllowed taxonomy:\n" + "\n".join(taxonomy_rows) + "\n\n"
            "Apply GHG Protocol ownership and value-chain boundaries. Inbound freight is Scope 3 C4; outbound freight is C9. "
            "Routine goods/services are C1; long-lived capital equipment is C2; operational waste is C5; business travel is C6. "
            "Purchased electricity is Scope 2. Fuel burned in owned assets is Scope 1. Water supply, treatment, tanker, borewell, municipal, or rainwater activity is Water.\n"
            "Return JSON only with keys scope (scope1/scope2/scope3/water), category_key, subcategory, rationale, confidence_score. "
            "confidence_score must be an integer percentage from 0 to 100.",
            max_tokens=1200,
        )
        parsed = extract_json(response, {})
        if not isinstance(parsed, dict):
            parsed = {}
        _CLASSIFICATION_CACHE.set(classification_key, parsed)
    raw_scope = re.sub(r"[^a-z0-9]", "", str(parsed.get("scope") or "").lower())
    scope = {"scope1": "scope1", "scope2": "scope2", "scope3": "scope3", "water": "water"}.get(raw_scope, "Unknown")
    category_key = str(parsed.get("category_key") or "").strip()
    subcategory = str(parsed.get("subcategory") or description).strip()
    invalid_scope = scope == "Unknown" or scope not in enabled_scopes
    if invalid_scope:
        scope = "Unknown"
    valid_keys = {
        parts[1]
        for row in taxonomy_rows
        if len(parts := row.split(" | ")) > 1 and parts[0] == scope
    }
    if category_key not in valid_keys:
        category_key = ""
    category_name = WATER_CATEGORY_NAMES.get(category_key, SCOPE3_CATEGORY_NAMES.get(category_key, SCOPE_CATEGORY_NAMES.get(category_key, category_key or "Unknown")))
    methodology = resolve_methodology(scope, category_key, subcategory, item, load_taxonomy())
    naics_code = naics_label = None
    if methodology["requires_useeio"]:
        naics_code, naics_label = await _map_naics(gateway, description, context, organization_id)
        subcategory = f"{naics_code} - {naics_label}"
        methodology["subcategory"] = subcategory
        methodology["ef_lookup_key"] = subcategory
    else:
        subcategory = methodology["subcategory"]
    score = normalize_confidence_score(parsed.get("confidence_score"), fallback=item.get("confidence_score", 80))
    if score is None:
        score = 80
    return {
        "ghg_scope": scope,
        "ghg_category": category_name,
        "category_key": category_key,
        "category_code": category_name.split(" - ", 1)[0].lower() if category_name.startswith("C") else category_key,
        "ghg_subcategory": subcategory,
        "ef_method": methodology["ef_method"],
        "ef_database": methodology["ef_database"],
        "ef_lookup_key": methodology["ef_lookup_key"],
        "naics_code": naics_code,
        "naics_label": naics_label,
        "accounting_rationale": methodology["accounting_rationale"],
        "confidence_score": score,
        "needs_review": invalid_scope or not category_key,
        "auto_generate_cat3": methodology["auto_generate_cat3"],
        "classification_source": "ai",
    }
