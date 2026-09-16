"""Scope classification and USEEIO routing aligned to the uploaded processor."""
from __future__ import annotations

import json
import re
from functools import lru_cache

from .classification_cache import BoundedCache, cache_key
from .config import MASTER_TAXONOMY_PATH, NAICS_INDEX_PATH
from .legacy_helpers import forced_scope_result
from .llm_gateway import OcrLlmGateway
from .methodology import resolve_methodology
from .normalization import convert_quantity, extract_json, normalize_confidence_score


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


def _canonical_scope(value: object) -> str:
    compact = re.sub(r"[^a-z0-9]", "", str(value or "").lower())
    return {"scope1": "scope1", "scope2": "scope2", "scope3": "scope3", "water": "water"}.get(compact, "Unknown")


def _flat_taxonomy(enabled_scopes: set[str], disabled_scope3_sheets: set[str]) -> list[str]:
    flat: list[str] = []
    for scope, categories in load_taxonomy().items():
        canonical_scope = _canonical_scope(scope)
        if canonical_scope not in enabled_scopes:
            continue
        if scope == "water":
            for sub in categories.get("subcategories", []):
                flat.append(f"Scope: {scope} | Category: Water | Subcategory: {sub} | DB: {categories.get('ef_database', 'Unknown')}")
            continue

        for cat_key, cat_data in categories.items():
            category_name = SCOPE3_CATEGORY_NAMES.get(cat_key, "")
            code_match = re.match(r"C(\d+)", category_name)
            if code_match and f"C{code_match.group(1)}" in disabled_scope3_sheets:
                continue
            db = cat_data.get("ef_database", "Unknown")
            subs = cat_data.get("subcategories", [])
            if isinstance(subs, list):
                for sub in subs:
                    flat.append(f"Scope: {scope} | Category: {cat_key} | Subcategory: {sub} | DB: {db}")
            elif isinstance(subs, dict):
                for sub_group, sub_items in subs.items():
                    for item in sub_items:
                        flat.append(f"Scope: {scope} | Category: {cat_key} | Subcategory: {item} ({sub_group}) | DB: {db}")
            if "defra_subcategories" in cat_data:
                for sub in cat_data["defra_subcategories"]:
                    flat.append(f"Scope: {scope} | Category: {cat_key} | Subcategory: {sub} | DB: DEFRA (Activity)")
    return list(set(flat))


def _context_text(item: dict, invoice: dict, org_context: dict) -> str:
    locations = ", ".join(
        location.get("city") or location.get("name")
        for location in org_context.get("locations", [])
        if location.get("city") or location.get("name")
    )
    context_lines = [
        "Reporting Organization Profile:",
        f"- Company Name: {str(org_context.get('company_name') or '').strip() or 'Not specified'}",
        f"- Industry: {str(org_context.get('industry_sector') or '').strip() or 'Not specified'}",
        f"- Core Products/Services: {str(org_context.get('products') or '').strip() or 'Not specified'}",
        f"- Facility / Plant Locations: {locations or 'Not specified'}",
        "",
        "Invoice Parties & Transaction Roles:",
        f"- Vendor / Service Provider: {invoice.get('vendor_name', 'Unknown')} (Type: {invoice.get('vendor_type', 'Unknown')})",
        f"- Billed-To Client / Consignee: {invoice.get('buyer_name', 'Unknown')} ({invoice.get('buyer_address', 'Unknown')})",
        f"- Material Nature: {item.get('material_nature', 'composite_product')}",
    ]
    if item.get("primary_material"):
        context_lines.append(f"- Dominant Raw Material: {item['primary_material']}")

    freight = item.get("freight_details") or invoice.get("freight_details") or {}
    travel = item.get("travel_details") or {}
    waste = item.get("waste_details") or {}
    if freight.get("origin") or freight.get("destination"):
        context_lines.append(f"- Shipment Route: Origin: {freight.get('origin', 'N/A')} -> Destination: {freight.get('destination', 'N/A')}")
        if freight.get("mode"):
            context_lines.append(f"- Freight Mode: {freight.get('mode')}")
        if freight.get("distance_km"):
            context_lines.append(f"- Shipment Distance: {freight.get('distance_km')} km")
    if travel.get("origin") or travel.get("destination"):
        context_lines.append(f"- Travel Route: Origin: {travel.get('origin', 'N/A')} -> Destination: {travel.get('destination', 'N/A')}")
        if travel.get("distance_km"):
            context_lines.append(f"- Travel Distance: {travel.get('distance_km')} km")
    if waste.get("disposal_method") or waste.get("waste_type"):
        context_lines.append(f"- Waste Info: Type: {waste.get('waste_type', 'N/A')}, Disposal Method: {waste.get('disposal_method', 'N/A')}")
    if item.get("additional_context"):
        context_lines.append(f"- Additional Context: {item.get('additional_context')}")
    return "\n".join(context_lines)


async def _disambiguate_item(
    gateway: OcrLlmGateway,
    item_desc: str,
    context: str,
    flat_taxonomy: list[str],
    organization_id: str,
    raw_qty: object,
    raw_unit: object,
) -> tuple[str, str, str, object, object]:
    classification_key = cache_key(
        "uploaded-disambiguation",
        organization_id,
        gateway.mode.reasoning_model,
        item_desc.strip(),
        raw_unit,
        flat_taxonomy,
        context,
    )
    cached = _CLASSIFICATION_CACHE.get(classification_key)
    if cached:
        return tuple(cached)

    qty_unit_context = f"\nRaw Quantity: {raw_qty}\nRaw Unit: {raw_unit}" if raw_qty is not None or raw_unit else ""
    prompt = f"""You are an expert ESG emissions accountant following the GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard.

Your task is to classify the following invoice line item into the single most accurate Scope, Category, and Subcategory from the official corporate taxonomy, and normalize activity units/quantities.

--- ITEM & INVOICE CONTEXT ---
Item Description: {item_desc}{qty_unit_context}
{context}

--- GHG PROTOCOL CLASSIFICATION PRINCIPLES ---
1. TRANSPORTATION & DISTRIBUTION (Scope 3 Cat 4 vs Cat 9):
   - Category 4 (Upstream Transportation & Distribution): Inbound freight of raw materials, supplies, parts, or goods arriving at reporting company facilities. Inter-facility transport. Freight paid directly as client.
   - Category 9 (Downstream Transportation & Distribution): Outbound transportation of final products sold by the reporting company to customers/dealers.

2. PURCHASED GOODS & SERVICES vs CAPITAL GOODS (Scope 3 Cat 1 vs Cat 2):
   - Category 1 (Purchased Goods and Services): Raw materials, intermediate parts, operating consumables, packaging, office supplies, operational software/services, maintenance services.
   - Category 2 (Capital Goods): Heavy machinery, factory equipment, buildings, commercial vehicles, large long-lived depreciated assets.

3. DIRECT / INDIRECT ENERGY & FUGITIVE GASES (Scope 1 & 2):
   - Scope 1: Direct fuel combustion in owned/leased assets (petrol/diesel for vehicles, natural gas/LPG/diesel for stationary generators/boilers). Also fugitive leaks / refilling of greenhouse gas fire suppression (CO2) or HVAC refrigerants.
   - Scope 2: Purchased grid electricity, district steam/heating/cooling.

4. WASTE IN OPERATIONS vs END-OF-LIFE (Scope 3 Cat 5 vs Cat 12):
   - Category 5 (Waste in Operations): Disposal/treatment of waste generated at the reporting company's own facilities.
   - Category 12 (End of Life Treatment of Sold Products): Waste disposal of products sold to consumers.

--- UNIT & QUANTITY NORMALIZATION PRINCIPLES ---
- Standardize sub-units into standard GHG reporting metrics:
  * Volume: Convert millilitres (ml) to Liters and scale the quantity (e.g., 2500 ml -> 2.5 Liters).
  * Mass: Convert grams (g) to kg (e.g., 500 g -> 0.5 kg). Convert pounds (lbs) to kg (e.g., 100 lbs -> 45.36 kg).
  * Equipment / Discrete Goods: For equipment, devices, capital goods, or physical items counted in units, pieces, boxes, or sets (e.g. Electric Forklift, Laptop, Server), PRESERVE the exact count as "units" (or boxes/pieces). NEVER convert physical equipment or machinery counts to kWh.
  * Return "normalized_quantity" as a float or null, and "normalized_unit" as a string or null.

--- OFFICIAL CORPORATE TAXONOMY ---
{chr(10).join(flat_taxonomy)}

--- RESPONSE REQUIREMENT ---
Select EXACTLY one matching entry from the official taxonomy.
Return ONLY a raw JSON object with keys:
"mapped_scope": string,
"mapped_category": string,
"mapped_subcategory": string,
"normalized_quantity": number or null,
"normalized_unit": string or null
"""
    response = await gateway.reason(
        "",
        prompt,
        max_tokens=800 if gateway.mode.provider == "openai" else 300,
    )
    data = extract_json(response, {})
    if not isinstance(data, dict):
        data = {}
    mapped_scope = data.get("mapped_scope") or "Unknown"
    mapped_category = data.get("mapped_category") or "Unknown"
    mapped_subcategory = data.get("mapped_subcategory") or "Unknown"
    normalized_quantity = data.get("normalized_quantity")
    normalized_unit = data.get("normalized_unit")

    if raw_qty is not None and raw_unit:
        guard_qty, guard_unit = convert_quantity(raw_qty, str(raw_unit))
        if str(guard_unit).lower() != str(raw_unit).lower():
            if normalized_quantity is not None and normalized_unit and str(normalized_unit).lower() == str(guard_unit).lower():
                try:
                    ai_quantity = float(normalized_quantity)
                    normalized_quantity = ai_quantity if 0.90 <= ai_quantity / float(guard_qty) <= 1.10 else guard_qty
                except (TypeError, ValueError, ZeroDivisionError):
                    normalized_quantity = guard_qty
            else:
                normalized_quantity = guard_qty
                normalized_unit = guard_unit
        elif str(raw_unit).lower() in ("unit", "units", "piece", "pieces", "box", "boxes", "nos", "set", "sets"):
            is_electricity = "electricity" in str(mapped_category).lower() or "electricity" in str(mapped_subcategory).lower()
            normalized_quantity = raw_qty
            normalized_unit = "kWh" if is_electricity and str(raw_unit).lower() in ("unit", "units") else "units"

    result = (mapped_scope, mapped_category, mapped_subcategory, normalized_quantity, normalized_unit)
    _CLASSIFICATION_CACHE.set(classification_key, result)
    return result


async def _map_naics(
    gateway: OcrLlmGateway,
    item_description: str,
    context: str,
    organization_id: str,
) -> tuple[str, str]:
    mapping_key = cache_key("useeio", organization_id, gateway.mode.reasoning_model, item_description.strip())
    cached = _USEEIO_CACHE.get(mapping_key)
    if cached:
        return tuple(cached)
    index = load_naics_index()
    subsectors = "\n".join(f"{code}: {value['name']}" for code, value in sorted(index.items()))
    stage_one = await gateway.reason(
        "",
        f"""You are an economic taxonomy specialist classifying an invoice expenditure into the 2017 NAICS for USEEIO spend-based emissions modeling.

Core Classification Principles:
- Classify each expenditure according to the fundamental commodity, asset, or service deliverable being procured.
- Use vendor context to understand the technical domain and specification of the purchase only.

Item to Classify: {item_description}
{context}

Available 3-digit NAICS Subsectors:
{subsectors}

Select the TOP 4 most probable 3-digit NAICS subsector codes for this item or service.
Return ONLY a raw JSON array of 3 or 4 string codes, e.g. ["331", "332", "339"]. Do not include markdown or backticks.
""",
        max_tokens=600 if gateway.mode.provider == "openai" else 150,
    )
    selected = extract_json(stage_one, [])
    codes = [str(code).strip() for code in selected if str(code).strip() in index] if isinstance(selected, list) else []
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
        "",
        f"""You are an economic commodity classifier for USEEIO spend-based emissions modeling.

Core Classification Principles:
- Classify each expenditure according to the fundamental commodity, asset, or service deliverable being procured.
- Use vendor context to understand the technical domain and specification of the purchase only.

Select the single most accurate 6-digit NAICS Commodity for this invoice expenditure from the candidate list below.

Item to Classify: {item_description}
{context}

Candidate USEEIO Commodities:
{chr(10).join(candidates)}

Return ONLY a raw JSON object with key "selected_commodity" containing the exact string from the list above. Do not include markdown or backticks.
""",
        max_tokens=600 if gateway.mode.provider == "openai" else 200,
    )
    parsed = extract_json(stage_two, {})
    commodity = parsed.get("selected_commodity", candidates[0] if candidates else "Unknown USEEIO Sector") if isinstance(parsed, dict) else None
    if commodity not in candidates:
        commodity = candidates[0] if candidates else "Unknown USEEIO Sector"
    code, _, label = commodity.partition(" - ")
    result = (code.strip(), label.strip() or commodity)
    _USEEIO_CACHE.set(mapping_key, result)
    return result


def _allowed_category_keys(enabled_scopes: set[str], disabled_scope3_sheets: set[str]) -> set[str]:
    allowed: set[str] = set()
    for scope_key, categories in load_taxonomy().items():
        if _canonical_scope(scope_key) not in enabled_scopes:
            continue
        if scope_key == "water":
            allowed.add("Water")
            continue
        for category_key in categories:
            category_name = SCOPE3_CATEGORY_NAMES.get(category_key, "")
            code_match = re.match(r"C(\d+)", category_name)
            if not code_match or f"C{code_match.group(1)}" not in disabled_scope3_sheets:
                allowed.add(category_key)
    return allowed


async def classify_item(
    gateway: OcrLlmGateway,
    item: dict,
    invoice: dict,
    org_context: dict,
    enabled_scopes: set[str],
    disabled_scope3_sheets: set[str],
    cached_override: dict | None = None,
) -> dict:
    forced = forced_scope_result(item)
    if forced:
        scope = _canonical_scope(forced["ghg_scope"])
        category_key = forced["ghg_category"]
        return {
            **forced,
            "ghg_scope": scope,
            "category_key": category_key,
            "category_code": category_key,
            "naics_code": None,
            "naics_label": None,
            "confidence_score": normalize_confidence_score(item.get("confidence_score"), fallback=80) or 80,
            "classification_source": "forced",
        }
    if cached_override:
        return {**cached_override, "needs_review": False, "classification_source": "verified_override"}

    description = item.get("item_description_english") or item.get("item_description") or "Unknown item"
    context = _context_text(item, invoice, org_context)
    taxonomy_rows = _flat_taxonomy(enabled_scopes, disabled_scope3_sheets)
    raw_scope, category_key, subcategory, normalized_quantity, normalized_unit = await _disambiguate_item(
        gateway,
        description,
        context,
        taxonomy_rows,
        str(org_context.get("organization_id") or ""),
        item.get("quantity"),
        item.get("unit"),
    )
    if normalized_quantity is not None and normalized_unit:
        item["quantity"] = normalized_quantity
        item["unit"] = normalized_unit

    scope = _canonical_scope(raw_scope)
    category_key = str(category_key or "Unknown")
    subcategory = str(subcategory or "Unknown")
    allowed_categories = _allowed_category_keys(enabled_scopes, disabled_scope3_sheets)
    invalid = scope == "Unknown" or scope not in enabled_scopes or category_key == "Unknown" or category_key not in allowed_categories
    category_name = WATER_CATEGORY_NAMES.get(category_key, SCOPE3_CATEGORY_NAMES.get(category_key, SCOPE_CATEGORY_NAMES.get(category_key, category_key)))
    methodology = resolve_methodology(scope, category_key, subcategory, item, load_taxonomy())
    naics_code = naics_label = None
    if methodology["requires_useeio"]:
        naics_code, naics_label = await _map_naics(
            gateway,
            description,
            context,
            str(org_context.get("organization_id") or ""),
        )
        subcategory = f"{naics_code} - {naics_label}"
        methodology["subcategory"] = subcategory
        methodology["ef_lookup_key"] = subcategory

    score = normalize_confidence_score(item.get("confidence_score"), fallback=80) or 80
    return {
        "ghg_scope": scope,
        "ghg_category": category_name,
        "category_key": category_key,
        "category_code": category_name.split(" - ", 1)[0].lower() if category_name.startswith("C") else category_key,
        "ghg_subcategory": methodology["subcategory"],
        "ef_method": methodology["ef_method"],
        "ef_database": methodology["ef_database"],
        "ef_lookup_key": methodology["ef_lookup_key"],
        "naics_code": naics_code,
        "naics_label": naics_label,
        "accounting_rationale": methodology["accounting_rationale"],
        "confidence_score": score,
        "needs_review": invalid,
        "auto_generate_cat3": methodology["auto_generate_cat3"],
        "classification_source": "ai",
        "normalized_quantity": normalized_quantity,
        "normalized_unit": normalized_unit,
    }