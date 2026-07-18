"""Energy detail service — aggregates energy consumption data from emission records."""
from typing import Dict, List, Optional
from datetime import datetime


# Energy categories from emission records
ELECTRICITY_CATEGORIES = ["Purchased Electricity", "electricity"]
FUEL_CATEGORIES = ["Stationary Combustion", "stationary_combustion", "Mobile Combustion", "mobile_combustion"]
HEAT_STEAM_CATEGORIES = ["Purchased Steam/Heat", "Purchased Heating", "Purchased Cooling"]

ALL_ENERGY_CATEGORIES = ELECTRICITY_CATEGORIES + FUEL_CATEGORIES + HEAT_STEAM_CATEGORIES

# Renewable fuel keywords
RENEWABLE_KEYWORDS = [
    "bio", "solar", "wind", "hydro", "geothermal", "biomass", "biogas",
    "biodiesel", "biogasoline", "biopetrol", "renewable", "green",
    "wood", "bagasse", "ethanol", "landfill gas",
]

SOURCE_MAP = {
    "Purchased Electricity": "Electricity",
    "electricity": "Electricity",
    "Stationary Combustion": "Fuel",
    "stationary_combustion": "Fuel",
    "Mobile Combustion": "Fuel",
    "mobile_combustion": "Fuel",
    "Purchased Steam/Heat": "Heating & Steam",
    "Purchased Heating": "Heating & Steam",
    "Purchased Cooling": "Cooling",
}


def _is_renewable(fuel_type: str, category: str) -> bool:
    if not fuel_type:
        return False
    text = fuel_type.lower()
    return any(kw in text for kw in RENEWABLE_KEYWORDS)


def _to_mwh(quantity: float, unit: str, calorific_value: float = None) -> float:
    """Convert quantity to MWh."""
    if not quantity:
        return 0.0
    unit_lower = (unit or "").lower().strip()
    if unit_lower in ("mwh",):
        return quantity
    if unit_lower in ("kwh",):
        return quantity / 1000.0
    if unit_lower in ("gwh",):
        return quantity * 1000.0
    if unit_lower in ("tj", "tj/kg", "tj/l"):
        return quantity * 277.778
    if unit_lower in ("gj",):
        return quantity * 0.277778
    if unit_lower in ("mj",):
        return quantity * 0.000277778
    # For mass/volume units, use calorific value if available
    if calorific_value and calorific_value > 0:
        energy_tj = quantity * calorific_value
        return energy_tj * 277.778
    # Fallback: treat as kWh
    return quantity / 1000.0


def _parse_period(period_str: str):
    """Parse reporting_period like '2026-10' into year, month."""
    try:
        parts = period_str.split("-")
        return int(parts[0]), int(parts[1]) if len(parts) > 1 else 1
    except (ValueError, IndexError, AttributeError):
        return None, None


def _month_label(year: int, month: int) -> str:
    try:
        return datetime(year, month, 1).strftime("%b %Y")
    except (ValueError, TypeError):
        return f"{year}-{month:02d}"


async def get_energy_detail(
    db,
    org_id: str,
    start_date: str,
    end_date: str,
    selected_facilities: Optional[List[str]] = None,
) -> Dict:
    """Aggregate energy data from emission_records."""

    # Parse date range into reporting period range
    try:
        start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        start_dt = datetime(2020, 1, 1)
        end_dt = datetime(2030, 12, 31)

    # Build period list for matching
    periods = []
    dt = start_dt.replace(day=1)
    while dt <= end_dt:
        periods.append(f"{dt.year}-{dt.month:02d}")
        if dt.month == 12:
            dt = dt.replace(year=dt.year + 1, month=1)
        else:
            dt = dt.replace(month=dt.month + 1)

    # Query emission records for energy categories
    match_filter = {
        "organization_id": org_id,
        "category": {"$in": ALL_ENERGY_CATEGORIES},
    }
    if periods:
        match_filter["reporting_period"] = {"$in": periods}
    if selected_facilities:
        match_filter["facility_id"] = {"$in": selected_facilities}

    records = await db.emission_records.find(match_filter).to_list(10000)

    # Pre-load fuel CVs for unit conversion
    fuel_ids = list(set(r.get("fuel_database_id", "") for r in records if r.get("fuel_database_id")))
    fuel_cv_map = {}
    if fuel_ids:
        fuel_docs = await db.fuel_database.find(
            {"id": {"$in": fuel_ids}},
            {"_id": 0, "id": 1, "calorific_value": 1, "calorific_unit": 1}
        ).to_list(1000)
        fuel_cv_map = {f["id"]: f for f in fuel_docs}

    # Aggregate
    total_energy = 0.0
    renewable_energy = 0.0
    monthly_data = {}  # period -> {total, renewable, non_renewable}
    source_breakdown = {}  # source_type -> MWh
    facility_data = {}  # facility_id -> {total, renewable, name}

    # Get facility names
    fac_ids = list(set(r.get("facility_id", "") for r in records if r.get("facility_id")))
    fac_map = {}
    if fac_ids:
        fac_docs = await db.facilities.find({"id": {"$in": fac_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        fac_map = {f["id"]: f.get("name", f["id"]) for f in fac_docs}

    for rec in records:
        # Extract quantity: try direct field first, then dynamic_field_values
        qty = rec.get("quantity")
        unit = rec.get("quantity_unit") or rec.get("unit") or "kWh"
        dyn = rec.get("dynamic_field_values") or {}
        if qty is None and dyn.get("qty"):
            qty = dyn["qty"].get("value")
            unit = dyn["qty"].get("unit") or unit

        qty = qty or 0

        # Get calorific value: try record, then fuel_database
        cv = rec.get("calorific_value")
        if cv is None and dyn.get("cv"):
            cv = dyn["cv"].get("value")
        if cv is None:
            fuel_db_id = rec.get("fuel_database_id")
            if fuel_db_id and fuel_db_id in fuel_cv_map:
                cv = fuel_cv_map[fuel_db_id].get("calorific_value")

        cat = rec.get("category", "")
        fuel = rec.get("fuel_type") or rec.get("sub_category") or ""
        fac_id = rec.get("facility_id", "")
        period = rec.get("reporting_period", "")

        energy_mwh = _to_mwh(qty, unit, cv)
        is_renew = _is_renewable(fuel, cat)

        total_energy += energy_mwh
        if is_renew:
            renewable_energy += energy_mwh

        # Monthly
        year, month = _parse_period(period)
        if year and month:
            key = f"{year}-{month:02d}"
            if key not in monthly_data:
                monthly_data[key] = {"total": 0, "renewable": 0, "non_renewable": 0, "label": _month_label(year, month)}
            monthly_data[key]["total"] += energy_mwh
            if is_renew:
                monthly_data[key]["renewable"] += energy_mwh
            else:
                monthly_data[key]["non_renewable"] += energy_mwh

        # Source breakdown
        source = SOURCE_MAP.get(cat, "Other")
        source_breakdown[source] = source_breakdown.get(source, 0) + energy_mwh

        # Facility
        if fac_id:
            if fac_id not in facility_data:
                facility_data[fac_id] = {"total": 0, "renewable": 0, "name": fac_map.get(fac_id, fac_id)}
            facility_data[fac_id]["total"] += energy_mwh
            if is_renew:
                facility_data[fac_id]["renewable"] += energy_mwh

    # Get production/revenue from org for intensity calculations
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "revenue": 1, "production": 1, "production_unit": 1, "currency": 1})
    revenue = org.get("revenue") if org else None
    production = org.get("production") if org else None
    production_unit = org.get("production_unit", "MT") if org else "MT"
    currency = org.get("currency", "INR") if org else "INR"

    non_renewable = total_energy - renewable_energy
    renewable_pct = round((renewable_energy / total_energy * 100), 1) if total_energy > 0 else 0.0

    # Build sorted monthly trend
    sorted_months = sorted(monthly_data.keys())
    monthly_trend = [
        {
            "period": k,
            "label": monthly_data[k]["label"],
            "total": round(monthly_data[k]["total"], 2),
            "renewable": round(monthly_data[k]["renewable"], 2),
            "non_renewable": round(monthly_data[k]["non_renewable"], 2),
        }
        for k in sorted_months
    ]

    # Source donut
    source_donut = [
        {"name": name, "value": round(val, 2)}
        for name, val in sorted(source_breakdown.items(), key=lambda x: -x[1])
        if val > 0
    ]

    # Facility ranking
    facility_bars = sorted(
        [
            {
                "name": v["name"],
                "total": round(v["total"], 2),
                "renewable_pct": round(v["renewable"] / v["total"] * 100, 1) if v["total"] > 0 else 0,
            }
            for v in facility_data.values()
        ],
        key=lambda x: -x["total"],
    )

    # Intensity trend (per month)
    intensity_trend = []
    if revenue and revenue > 0:
        months_count = len(sorted_months) or 1
        monthly_revenue = revenue / 12  # assume annual revenue
        for k in sorted_months:
            m = monthly_data[k]
            intensity_trend.append({
                "label": m["label"],
                "intensity_revenue": round(m["total"] / monthly_revenue, 4) if monthly_revenue > 0 else 0,
                "intensity_production": round(m["total"] / (production / 12), 4) if production and production > 0 else None,
            })
    elif production and production > 0:
        for k in sorted_months:
            m = monthly_data[k]
            intensity_trend.append({
                "label": m["label"],
                "intensity_revenue": None,
                "intensity_production": round(m["total"] / (production / 12), 4) if production > 0 else 0,
            })

    return {
        "kpi": {
            "total_energy": round(total_energy, 2),
            "renewable_energy": round(renewable_energy, 2),
            "non_renewable_energy": round(non_renewable, 2),
            "renewable_pct": renewable_pct,
            "intensity_revenue": round(total_energy / revenue, 4) if revenue and revenue > 0 else None,
            "intensity_production": round(total_energy / production, 4) if production and production > 0 else None,
            "production_unit": production_unit,
            "currency": currency,
        },
        "monthly_trend": monthly_trend,
        "source_breakdown": source_donut,
        "renewable_vs_non": monthly_trend,  # same data, frontend picks renewable/non_renewable fields
        "facility_consumption": facility_bars,
        "intensity_trend": intensity_trend,
    }
