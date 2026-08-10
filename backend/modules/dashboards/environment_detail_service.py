"""Environment detail service — scope breakdowns, hotspots, water sources, waste types."""
from typing import Dict, List, Optional
from modules.esg_records.services.dashboard.waste_utils import to_metric_tonnes
from modules.esg_records.services.dashboard.date_utils import build_date_filter
from modules.esg_records.services.dashboard.unit_utils import to_kilolitres


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
    org_query = {
        "org_id": org_id,
        "is_current": {"$ne": False},
        "status": {"$ne": "draft"},
        "approval_status": {"$in": ["approved", "not_required", None]},
    }
    if facility_ids:
        org_query["facility_id"] = {"$in": facility_ids}

    resource_period_filter = build_date_filter(start_date, end_date)

    def resource_query(category: str) -> dict:
        base = {**org_query, "category": category}
        return {"$and": [base, {"$or": resource_period_filter}]} if resource_period_filter else base

    water_records = await db.environment_records.find(
        resource_query("Water"),
        {"_id": 0, "subcategory": 1, "field_values": 1, "reporting_period": 1},
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
    water_monthly_sources: Dict[str, Dict[str, float]] = {}  # period -> {source_name -> value}

    from modules.dashboards.esg_analytics_service import record_month

    for wr in water_records:
        sub = (wr.get("subcategory") or "").lower()
        fv = wr.get("field_values") or {}
        period_key = record_month(wr)

        if sub == "withdrawal":
            for key, label in WITHDRAWAL_KEYS.items():
                val = to_kilolitres(fv.get(key), fv.get("unit"))
                if val > 0:
                    water_sources[label] = water_sources.get(label, 0) + val
                    if period_key:
                        water_monthly_sources.setdefault(period_key, {})
                        water_monthly_sources[period_key][label] = water_monthly_sources[period_key].get(label, 0) + val
        elif sub == "discharge":
            for key, label in DISCHARGE_KEYS.items():
                val = to_kilolitres(fv.get(key), fv.get("unit"))
                if val > 0:
                    water_discharge_sources[label] = water_discharge_sources.get(label, 0) + val
        elif sub == "consumption":
            # Consumption may use individual keys or a single quantity+source_type
            found_individual = False
            for key, label in CONSUMPTION_KEYS.items():
                val = to_kilolitres(fv.get(key), fv.get("unit"))
                if val > 0:
                    water_consumption_sources[label] = water_consumption_sources.get(label, 0) + val
                    found_individual = True
            if not found_individual:
                qty = to_kilolitres(fv.get("quantity"), fv.get("unit"))
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

    # Build sorted monthly source trend
    all_source_names = sorted(water_sources.keys())
    water_monthly_sources_list = []
    for period_k in sorted(water_monthly_sources.keys()):
        entry = {"period": period_k}
        for src_name in all_source_names:
            entry[src_name] = round(water_monthly_sources[period_k].get(src_name, 0), 2)
        water_monthly_sources_list.append(entry)

    # --- Waste type breakdown ---
    waste_records = await db.environment_records.find(
        resource_query("Waste"),
        {"_id": 0, "subcategory": 1, "field_values": 1, "reporting_period": 1},
    ).to_list(5000)

    hazardous_waste = {"generated": 0.0, "recovered": 0.0, "disposed": 0.0}
    non_hazardous_waste = {"generated": 0.0, "recovered": 0.0, "disposed": 0.0}
    waste_monthly: Dict[str, Dict[str, float]] = {}  # period -> metrics

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
        period_key = record_month(wr)
        found_mapped = False
        haz_g = haz_r = haz_d = nhaz_g = nhaz_r = nhaz_d = 0.0

        for field_key, (waste_type, metric) in WASTE_FIELD_MAP.items():
            val = to_metric_tonnes(fv.get(field_key), fv.get("unit"))
            if val > 0:
                target = hazardous_waste if waste_type == "hazardous" else non_hazardous_waste
                target[metric] += val
                found_mapped = True
                if waste_type == "hazardous":
                    if metric == "generated": haz_g += val
                    elif metric == "recovered": haz_r += val
                    elif metric == "disposed": haz_d += val
                else:
                    if metric == "generated": nhaz_g += val
                    elif metric == "recovered": nhaz_r += val
                    elif metric == "disposed": nhaz_d += val

        # Fallback: if no mapped keys found, try subcategory + quantity
        if not found_mapped:
            sub = (wr.get("subcategory") or "").lower()
            qty = to_metric_tonnes(fv.get("quantity"), fv.get("unit"))
            if qty > 0:
                waste_type = str(fv.get("waste_type") or "").lower()
                is_haz = "hazardous" in waste_type and "non" not in waste_type
                target = hazardous_waste if is_haz else non_hazardous_waste
                if "generated" in sub:
                    target["generated"] += qty
                    if is_haz: haz_g += qty
                    else: nhaz_g += qty
                elif "recovered" in sub or "diverted" in sub:
                    target["recovered"] += qty
                    if is_haz: haz_r += qty
                    else: nhaz_r += qty
                elif "disposal" in sub or "disposed" in sub:
                    target["disposed"] += qty
                    if is_haz: haz_d += qty
                    else: nhaz_d += qty

        # Accumulate monthly data
        if period_key and (haz_g + haz_r + haz_d + nhaz_g + nhaz_r + nhaz_d) > 0:
            if period_key not in waste_monthly:
                waste_monthly[period_key] = {
                    "haz_generated": 0, "haz_recovered": 0, "haz_disposed": 0,
                    "nhaz_generated": 0, "nhaz_recovered": 0, "nhaz_disposed": 0,
                }
            waste_monthly[period_key]["haz_generated"] += haz_g
            waste_monthly[period_key]["haz_recovered"] += haz_r
            waste_monthly[period_key]["haz_disposed"] += haz_d
            waste_monthly[period_key]["nhaz_generated"] += nhaz_g
            waste_monthly[period_key]["nhaz_recovered"] += nhaz_r
            waste_monthly[period_key]["nhaz_disposed"] += nhaz_d

    waste_monthly_list = []
    for pk in sorted(waste_monthly.keys()):
        m = waste_monthly[pk]
        waste_monthly_list.append({
            "period": pk,
            "haz_generated": round(m["haz_generated"], 2),
            "haz_recovered": round(m["haz_recovered"], 2),
            "haz_disposed": round(m["haz_disposed"], 2),
            "nhaz_generated": round(m["nhaz_generated"], 2),
            "nhaz_recovered": round(m["nhaz_recovered"], 2),
            "nhaz_disposed": round(m["nhaz_disposed"], 2),
        })

    # --- Energy source breakdown & facility energy from GHG integration ---
    energy_source_breakdown = []
    facility_energy = []
    try:
        from modules.esg_records.ghg_integration import get_ghg_integration_service
        ghg_svc = get_ghg_integration_service(db)
        energy_records = await ghg_svc.get_energy_from_ghg(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date,
        )

        source_map: Dict[str, float] = {}
        fac_map: Dict[str, Dict] = {}

        # Resolve facility names for labelling
        fac_name_cache: Dict[str, str] = {}

        for rec in energy_records:
            fv = rec.get("field_values") or {}
            energy_val = float(fv.get("total_energy") or 0)
            energy_unit = fv.get("energy_unit", "MWh")
            if energy_unit == "TJ":
                energy_val *= 277.778  # TJ → MWh

            subcat = rec.get("subcategory") or ""
            if "Electricity" in subcat:
                source_name = "Electricity"
            elif "Fuel" in subcat:
                source_name = "Fuel"
            elif "Heating" in subcat:
                source_name = "Heating & Steam"
            else:
                source_name = "Other"

            source_map[source_name] = source_map.get(source_name, 0) + energy_val

            fac_id = rec.get("facility_id") or ""
            fac_name = rec.get("facility_name") or fac_id
            is_renewable = rec.get("sub_subcategory", "") == "Renewable"

            if fac_id:
                fac_name_cache[fac_id] = fac_name
                if fac_id not in fac_map:
                    fac_map[fac_id] = {"name": fac_name, "total": 0.0, "renewable": 0.0}
                fac_map[fac_id]["total"] += energy_val
                if is_renewable:
                    fac_map[fac_id]["renewable"] += energy_val

        energy_source_breakdown = sorted(
            [{"name": k, "value": round(v, 2)} for k, v in source_map.items() if v > 0],
            key=lambda x: -x["value"],
        )
        facility_energy = sorted(
            [
                {
                    "name": v["name"],
                    "total": round(v["total"], 2),
                    "renewable_pct": round(v["renewable"] / v["total"] * 100, 1) if v["total"] > 0 else 0,
                }
                for v in fac_map.values()
                if v["total"] > 0
            ],
            key=lambda x: -x["total"],
        )
    except Exception:
        pass

    return {
        "scope1_breakdown": fmt_breakdown(scope1_breakdown),
        "scope2_breakdown": fmt_breakdown(scope2_breakdown),
        "scope3_upstream": fmt_scope3(scope3_upstream),
        "scope3_downstream": fmt_scope3(scope3_downstream),
        "hotspots": hotspots,
        "water_sources": water_sources_list,
        "water_discharge_sources": water_discharge_list,
        "water_consumption_sources": water_consumption_list,
        "water_monthly_sources": water_monthly_sources_list,
        "hazardous_waste": hazardous_waste,
        "non_hazardous_waste": non_hazardous_waste,
        "waste_monthly": waste_monthly_list,
        "energy_source_breakdown": energy_source_breakdown,
        "facility_energy": facility_energy,
    }
