"""Environment detail service — scope breakdowns, hotspots, water sources, waste types."""
from typing import Dict, List, Optional


# Standard GHG Protocol category mapping
SCOPE1_CATEGORIES = {
    "stationary_combustion": ["stationary", "boiler", "furnace", "generator", "heater"],
    "mobile_combustion": ["mobile", "vehicle", "fleet", "transport", "car", "truck"],
    "fugitive_emissions": ["fugitive", "refrigerant", "leak", "hvac", "a/c"],
    "process_emissions": ["process", "industrial", "chemical", "manufacturing"],
}

SCOPE2_CATEGORIES = {
    "purchased_electricity": ["electricity", "grid", "power"],
    "purchased_heating": ["heating", "heat", "district heat"],
    "purchased_cooling": ["cooling", "chiller", "district cool"],
    "purchased_steam": ["steam"],
}

SCOPE3_UPSTREAM = [
    "C1 - Purchased Goods and Services",
    "C2 - Capital Goods",
    "C3 - Fuel and Energy Related Activities Not Included in Scope 1 or Scope 2",
    "C4 - Upstream Transportation and Distribution",
    "C5 - Waste Generated in Operations",
    "C6 - Business Travel",
    "C7 - Employee Commuting",
    "C8 - Upstream Leased Assets",
]

SCOPE3_DOWNSTREAM = [
    "C9 - Downstream Transportation and Distribution",
    "C10 - Processing of Sold Products",
    "C11 - Use of Sold Products",
    "C12 - End-of-Life Treatment of Sold Products",
    "C13 - Downstream Leased Assets",
    "C14 - Franchises",
    "C15 - Investments",
]

# Friendly labels
SCOPE3_LABELS = {
    "C1 - Purchased Goods and Services": "Purchased Goods & Services",
    "C2 - Capital Goods": "Capital Goods",
    "C3 - Fuel and Energy Related Activities Not Included in Scope 1 or Scope 2": "Fuel & Energy Activities",
    "C4 - Upstream Transportation and Distribution": "Upstream Transport & Distribution",
    "C5 - Waste Generated in Operations": "Waste in Operations",
    "C6 - Business Travel": "Business Travel",
    "C7 - Employee Commuting": "Employee Commuting",
    "C8 - Upstream Leased Assets": "Upstream Leased Assets",
    "C9 - Downstream Transportation and Distribution": "Downstream Transport & Distribution",
    "C10 - Processing of Sold Products": "Processing of Sold Products",
    "C11 - Use of Sold Products": "Use of Sold Products",
    "C12 - End-of-Life Treatment of Sold Products": "End-of-Life Treatment",
    "C13 - Downstream Leased Assets": "Downstream Leased Assets",
    "C14 - Franchises": "Franchises",
    "C15 - Investments": "Investments",
}


def _classify_scope1(category: str, sub_category: str) -> str:
    text = f"{category} {sub_category}".lower()
    for key, keywords in SCOPE1_CATEGORIES.items():
        if any(kw in text for kw in keywords):
            return key
    return "stationary_combustion"


def _classify_scope2(category: str, sub_category: str) -> str:
    text = f"{category} {sub_category}".lower()
    for key, keywords in SCOPE2_CATEGORIES.items():
        if any(kw in text for kw in keywords):
            return key
    return "purchased_electricity"


def _classify_scope3(category: str) -> tuple:
    """Returns (friendly_label, stream: 'upstream'|'downstream')."""
    for cat in SCOPE3_UPSTREAM:
        if category.startswith(cat[:4]) or cat.lower() in category.lower():
            return SCOPE3_LABELS.get(cat, category), "upstream"
    for cat in SCOPE3_DOWNSTREAM:
        if category.startswith(cat[:4]) or cat.lower() in category.lower():
            return SCOPE3_LABELS.get(cat, category), "downstream"
    # Fallback: try matching common names
    lower = category.lower()
    for cat, label in SCOPE3_LABELS.items():
        if any(w in lower for w in label.lower().split()[:2]):
            stream = "upstream" if cat in SCOPE3_UPSTREAM else "downstream"
            return label, stream
    return category, "upstream"


async def get_environment_detail(
    db, org_id: str, start_date: str, end_date: str,
    facility_ids: Optional[List[str]] = None,
) -> dict:
    """Aggregate emission_records and environment_records for detailed env dashboard."""

    # Build facility filter
    if facility_ids:
        fac_filter = facility_ids
    else:
        facilities = await db.facilities.find(
            {"organization_id": org_id}, {"_id": 0, "id": 1}
        ).to_list(1000)
        fac_filter = [f["id"] for f in facilities]

    # --- Emission records aggregation ---
    min_year = int(start_date[:4])
    max_year = int(end_date[:4])
    emissions_query = {
        "facility_id": {"$in": fac_filter},
        "$or": [
            {"reporting_period": {"$gte": start_date, "$lte": end_date}},
            {"reporting_period": {"$in": [str(y) for y in range(min_year, max_year + 1)]}},
            {"reporting_period": {"$regex": f"^FY ({min_year - 1}|{'|'.join(str(y) for y in range(min_year, max_year + 1))})-"}},
            {"reporting_period": {"$regex": f"^CY ({min_year}|{'|'.join(str(y) for y in range(min_year + 1, max_year + 1))})$"}},
            {"reporting_period": {"$regex": f"^({'|'.join(str(y) for y in range(min_year, max_year + 1))})-?Q[1-4]"}},
        ],
    }
    records = await db.emission_records.find(
        emissions_query,
        {"_id": 0, "scope": 1, "category": 1, "sub_category": 1, "total_emissions": 1, "co2e_emissions": 1},
    ).to_list(10000)

    # Scope breakdowns
    scope1_breakdown: Dict[str, float] = {
        "stationary_combustion": 0, "mobile_combustion": 0,
        "fugitive_emissions": 0, "process_emissions": 0,
    }
    scope2_breakdown: Dict[str, float] = {
        "purchased_electricity": 0, "purchased_heating": 0,
        "purchased_cooling": 0, "purchased_steam": 0,
    }
    scope3_upstream: Dict[str, float] = {}
    scope3_downstream: Dict[str, float] = {}
    hotspot_map: Dict[str, float] = {}

    for rec in records:
        scope = (rec.get("scope") or "").lower()
        cat = rec.get("category") or ""
        sub = rec.get("sub_category") or ""
        val = float(rec.get("total_emissions") or rec.get("co2e_emissions") or 0)
        if val <= 0:
            continue

        if scope == "scope1":
            key = _classify_scope1(cat, sub)
            scope1_breakdown[key] = scope1_breakdown.get(key, 0) + val
            hotspot_label = key.replace("_", " ").title()
        elif scope == "scope2":
            key = _classify_scope2(cat, sub)
            scope2_breakdown[key] = scope2_breakdown.get(key, 0) + val
            hotspot_label = key.replace("_", " ").title()
        elif scope == "scope3":
            label, stream = _classify_scope3(cat)
            if stream == "upstream":
                scope3_upstream[label] = scope3_upstream.get(label, 0) + val
            else:
                scope3_downstream[label] = scope3_downstream.get(label, 0) + val
            hotspot_label = label
        else:
            continue

        hotspot_map[hotspot_label] = hotspot_map.get(hotspot_label, 0) + val

    # Sort hotspots by value desc
    hotspots = sorted(
        [{"name": k, "value": round(v, 2)} for k, v in hotspot_map.items()],
        key=lambda x: x["value"], reverse=True,
    )

    # Format scope breakdowns
    def fmt_breakdown(d):
        return [{"name": k.replace("_", " ").title(), "key": k, "value": round(v, 2)} for k, v in d.items()]

    def fmt_scope3(d):
        return sorted(
            [{"name": k, "value": round(v, 2)} for k, v in d.items()],
            key=lambda x: x["value"], reverse=True,
        )

    # --- Water source breakdown from environment_records ---
    org_query = {"org_id": org_id}
    if facility_ids:
        org_query["facility_id"] = {"$in": facility_ids}

    water_records = await db.environment_records.find(
        {**org_query, "category": "Water"},
        {"_id": 0, "subcategory": 1, "field_values": 1},
    ).to_list(5000)

    # Source key mappings
    WITHDRAWAL_KEYS = {
        "water_withdrawal_through_ground_water": "Ground Water",
        "water_withdrawal_through_surface_water": "Surface Water",
        "water_withdrawal_through_third_party_water": "Third-Party Water",
        "water_withdrawal_through_seawater_desalinated_water": "Seawater / Desalinated",
    }
    DISCHARGE_KEYS = {
        "water_discharged_to_ground_water": "Ground Water",
        "water_discharged_to_surface_water": "Surface Water",
        "water_discharged_to_third_party_water": "Third-Party Water",
        "water_discharged_to_seawater_desalinated_water": "Seawater / Desalinated",
        "water_sent_for_use_to_other_organization": "Sent to Other Org",
    }
    CONSUMPTION_KEYS = {
        "water_consumption_through_ground_water": "Ground Water",
        "water_consumption_through_surface_water": "Surface Water",
        "water_consumption_through_third_party_water": "Third-Party Water",
        "water_consumption_through_seawater_desalinated_water": "Seawater / Desalinated",
    }

    water_sources: Dict[str, float] = {}
    water_discharge_sources: Dict[str, float] = {}
    water_consumption_sources: Dict[str, float] = {}

    for wr in water_records:
        sub = (wr.get("subcategory") or "").lower()
        fv = wr.get("field_values") or {}

        if sub == "withdrawal":
            for key, label in WITHDRAWAL_KEYS.items():
                val = float(fv.get(key) or 0)
                if val > 0:
                    water_sources[label] = water_sources.get(label, 0) + val
        elif sub == "discharge":
            for key, label in DISCHARGE_KEYS.items():
                val = float(fv.get(key) or 0)
                if val > 0:
                    water_discharge_sources[label] = water_discharge_sources.get(label, 0) + val
        elif sub == "consumption":
            # Consumption may use individual keys or a single quantity+source_type
            found_individual = False
            for key, label in CONSUMPTION_KEYS.items():
                val = float(fv.get(key) or 0)
                if val > 0:
                    water_consumption_sources[label] = water_consumption_sources.get(label, 0) + val
                    found_individual = True
            if not found_individual:
                qty = float(fv.get("quantity") or 0)
                src = fv.get("source_type") or "Other"
                if qty > 0:
                    water_consumption_sources[src] = water_consumption_sources.get(src, 0) + qty

    def _sorted_sources(d):
        return sorted(
            [{"name": k, "value": round(v, 2)} for k, v in d.items()],
            key=lambda x: x["value"], reverse=True,
        )

    water_sources_list = _sorted_sources(water_sources)
    water_discharge_list = _sorted_sources(water_discharge_sources)
    water_consumption_list = _sorted_sources(water_consumption_sources)

    # --- Waste type breakdown ---
    waste_records = await db.environment_records.find(
        {**org_query, "category": "Waste"},
        {"_id": 0, "subcategory": 1, "field_values": 1},
    ).to_list(5000)

    hazardous_waste = {"generated": 0.0, "recovered": 0.0, "disposed": 0.0}
    non_hazardous_waste = {"generated": 0.0, "recovered": 0.0, "disposed": 0.0}

    # Waste field_values use keys like:
    #   hazardous_waste_generated, non_hazardous_waste_generated
    #   hazardous_waste_disposed, non_hazardous_waste_disposed
    #   hazardous_waste_recovered, non_hazardous_waste_recovered
    WASTE_FIELD_MAP = {
        "hazardous_waste_generated": ("hazardous", "generated"),
        "non_hazardous_waste_generated": ("non_hazardous", "generated"),
        "hazardous_waste_disposed": ("hazardous", "disposed"),
        "non_hazardous_waste_disposed": ("non_hazardous", "disposed"),
        "hazardous_waste_recovered": ("hazardous", "recovered"),
        "non_hazardous_waste_recovered": ("non_hazardous", "recovered"),
    }

    for wr in waste_records:
        fv = wr.get("field_values") or {}
        found_mapped = False
        for field_key, (waste_type, metric) in WASTE_FIELD_MAP.items():
            val = float(fv.get(field_key) or 0)
            if val > 0:
                target = hazardous_waste if waste_type == "hazardous" else non_hazardous_waste
                target[metric] += val
                found_mapped = True

        # Fallback: if no mapped keys found, try subcategory + quantity
        if not found_mapped:
            sub = (wr.get("subcategory") or "").lower()
            qty = float(fv.get("quantity") or 0)
            if qty > 0:
                is_haz = "hazardous" in str(fv.get("waste_type") or "").lower()
                target = hazardous_waste if is_haz else non_hazardous_waste
                if "generated" in sub:
                    target["generated"] += qty
                elif "recovered" in sub or "diverted" in sub:
                    target["recovered"] += qty
                elif "disposal" in sub or "disposed" in sub:
                    target["disposed"] += qty

    return {
        "scope1_breakdown": fmt_breakdown(scope1_breakdown),
        "scope2_breakdown": fmt_breakdown(scope2_breakdown),
        "scope3_upstream": fmt_scope3(scope3_upstream),
        "scope3_downstream": fmt_scope3(scope3_downstream),
        "hotspots": hotspots,
        "water_sources": water_sources_list,
        "water_discharge_sources": water_discharge_list,
        "water_consumption_sources": water_consumption_list,
        "hazardous_waste": hazardous_waste,
        "non_hazardous_waste": non_hazardous_waste,
    }
