"""
KPI Engine - Energy Module Adapter

Calculates Total Energy Consumption by aggregating energy from:
1. GHG Module (emission_records): Fuel, Electricity, Steam/Heat
2. ESG Metrics (environment_records): All energy subcategories

Energy sources aggregated:
- Fuel Within Organization (Scope 1 fuel: qty × calorific value)
- Electricity Within Organization (Scope 2 electricity)
- Steam Within Organization (Scope 2 steam/heat)
- Heating Within Organization (from both sources)
- Cooling Within Organization (from environment_records)

All values converted to GJ (Gigajoules) as the standard unit.
"""

from typing import Any, Dict, List, Optional
from shared.database.mongo import db
from .utils import format_result


# =============================================================================
# Unit Conversion Functions
# =============================================================================

def tj_to_gj(value: float) -> float:
    """Convert TJ to GJ: 1 TJ = 1000 GJ"""
    return value * 1000

def mwh_to_gj(value: float) -> float:
    """Convert MWh to GJ: 1 MWh = 3.6 GJ"""
    return value * 3.6

def kwh_to_gj(value: float) -> float:
    """Convert kWh to GJ: 1 kWh = 0.0036 GJ"""
    return value * 0.0036

def j_to_gj(value: float) -> float:
    """Convert J to GJ: 1 GJ = 1e9 J"""
    return value * 1e-9

def to_gj(value: float, unit: str) -> float:
    """Convert any energy unit to GJ."""
    if not value or not unit:
        return 0
    
    unit_lower = unit.lower().strip()
    
    # TJ conversions
    if "tj" in unit_lower:
        return tj_to_gj(value)
    
    # GJ - no conversion
    if "gj" in unit_lower:
        return value
    
    # MJ conversions
    if "mj" in unit_lower:
        return value * 0.001  # 1 MJ = 0.001 GJ
    
    # kJ conversions
    if "kj" in unit_lower:
        return value * 1e-6  # 1 kJ = 1e-6 GJ
    
    # GWh conversions
    if "gwh" in unit_lower:
        return value * 3600  # 1 GWh = 3600 GJ
    
    # MWh conversions
    if "mwh" in unit_lower:
        return mwh_to_gj(value)
    
    # kWh conversions
    if "kwh" in unit_lower:
        return kwh_to_gj(value)
    
    # Joules
    if unit_lower == "j" or "joule" in unit_lower:
        return j_to_gj(value)
    
    # Default: assume MWh
    return mwh_to_gj(value)


def _cv_to_tj_per_kg(value: float, unit: str) -> float:
    """Convert a calorific value to TJ/kg regardless of source unit."""
    u = unit.lower().replace(" ", "")
    if "tj/kg" in u:
        return value
    if "gj/kg" in u:
        return value * 1e-3
    if "mj/kg" in u:
        return value * 1e-6
    if "kj/kg" in u:
        return value * 1e-9
    if "gj/tonne" in u or "gj/t" in u:
        return value * 1e-3 / 1000
    if "mj/tonne" in u or "mj/t" in u:
        return value * 1e-6 / 1000
    if "tj/tonne" in u or "tj/t" in u:
        return value / 1000
    if "kcal/kg" in u:
        return value * 4.184e-9
    if "btu/lb" in u:
        return value * 1.055e-9 * 2.20462
    return value


# =============================================================================
# Energy Adapter Functions
# =============================================================================

async def _get_org_facility_ids(org_id: str) -> List[str]:
    """Get all facility IDs for an organization."""
    facilities = await db.facilities.find(
        {"organization_id": org_id},
        {"_id": 0, "id": 1, "equity_share_percentage": 1}
    ).to_list(1000)
    return facilities


async def _get_fuel_database_cache() -> tuple:
    """Load fuel database for calorific values and density."""
    fuel_cv_cache = {}
    fuel_density_cache = {}
    
    fuels = await db.fuel_database.find({}, {"_id": 0}).to_list(10000)
    for fuel in fuels:
        fuel_name = (fuel.get("fuel_name") or "").lower()
        fuel_id = fuel.get("id", "")
        cv = fuel.get("calorific_value")
        cv_unit = (fuel.get("calorific_value_unit") or "TJ/kg").lower()
        density = fuel.get("density")
        
        if cv:
            fuel_cv_cache[fuel_name] = _cv_to_tj_per_kg(float(cv), cv_unit)
            fuel_cv_cache[fuel_id] = _cv_to_tj_per_kg(float(cv), cv_unit)
        if density:
            fuel_density_cache[fuel_name] = float(density)
            fuel_density_cache[fuel_id] = float(density)
    
    return fuel_cv_cache, fuel_density_cache


def _build_period_filter(period: Dict[str, Any]) -> List[str]:
    """Build list of period strings to match for a given year."""
    year = period.get("year")
    month = period.get("month")
    
    if not year:
        return []
    
    periods = []
    
    if month:
        # Specific month
        periods.append(f"{year}-{month:02d}")
    else:
        # Full year - include all months
        for m in range(1, 13):
            periods.append(f"{year}-{m:02d}")
        # Also include FY/CY formats
        periods.extend([
            f"FY {year}-{year+1}",
            f"FY {year}-{str(year+1)[-2:]}",
            f"FY{year}-{year+1}",
            f"CY {year}",
            f"CY{year}",
            str(year)
        ])
    
    return periods


async def _get_ghg_energy(
    org_id: str,
    facility_ids: List[str],
    period: Optional[Dict[str, Any]] = None
) -> Dict[str, float]:
    """
    Get energy from GHG emission_records.
    
    Returns energy in GJ for each subcategory:
    - fuel: Scope 1 fuel (qty × calorific value)
    - electricity: Scope 2 electricity
    - steam_heating: Scope 2 steam/heat
    """
    result = {
        "fuel": 0.0,
        "electricity": 0.0,
        "steam_heating": 0.0,
        "total": 0.0,
        "record_count": 0
    }
    
    if not facility_ids:
        return result
    
    # Load fuel database
    fuel_cv_cache, fuel_density_cache = await _get_fuel_database_cache()
    
    # Get facility equity shares
    facilities = await db.facilities.find(
        {"id": {"$in": facility_ids}},
        {"_id": 0, "id": 1, "equity_share_percentage": 1}
    ).to_list(1000)
    facility_equity = {f["id"]: (f.get("equity_share_percentage") or 100) / 100 for f in facilities}
    
    # Build query
    query = {"facility_id": {"$in": facility_ids}}
    
    # Add period filter
    if period:
        period_strings = _build_period_filter(period)
        if period_strings:
            query["reporting_period"] = {"$in": period_strings}
    
    # Fetch emission records
    records = await db.emission_records.find(query, {"_id": 0}).to_list(100000)
    
    for rec in records:
        fac_id = rec.get("facility_id")
        scope = (rec.get("scope") or "").lower()
        equity_factor = facility_equity.get(fac_id, 1.0)
        
        if scope == "scope1":
            # Fuel energy: qty × calorific value
            dfv = rec.get("dynamic_field_values") or {}
            qty_data = dfv.get("qty") or {}
            quantity = float(qty_data.get("value") or 0)
            quantity_unit = (qty_data.get("unit") or "").lower()
            
            if quantity <= 0:
                continue
            
            # Get fuel info
            fuel_name = (rec.get("fuel_name") or rec.get("fuel_type") or "").lower()
            fuel_db_id = rec.get("fuel_database_id") or ""
            
            # Get calorific value - override preferred
            cv_data = dfv.get("cv") or {}
            cv = cv_data.get("value")
            if cv:
                cv_unit = (cv_data.get("unit") or "TJ/kg").lower()
                cv = _cv_to_tj_per_kg(float(cv), cv_unit)
            else:
                cv = fuel_cv_cache.get(fuel_name) or fuel_cv_cache.get(fuel_db_id)
            
            if not cv:
                continue
            
            # Get density for volume-to-mass conversion
            density_data = dfv.get("density") or {}
            density = density_data.get("value")
            if density:
                density = float(density)
            else:
                density = fuel_density_cache.get(fuel_name) or fuel_density_cache.get(fuel_db_id) or 0.85
            
            # Normalize quantity to kg
            if "tonne" in quantity_unit or quantity_unit == "t":
                quantity_kg = quantity * 1000
            elif "litre" in quantity_unit or quantity_unit == "l":
                quantity_kg = quantity * density
            elif quantity_unit == "kg":
                quantity_kg = quantity
            else:
                quantity_kg = quantity
            
            # Calculate energy: Quantity (kg) × CV (TJ/kg) = TJ, then convert to GJ
            energy_tj = quantity_kg * cv
            energy_gj = tj_to_gj(energy_tj) * equity_factor
            
            result["fuel"] += energy_gj
            result["record_count"] += 1
        
        elif scope == "scope2":
            category_name = (rec.get("category") or "").lower()
            is_steam_heat = "steam" in category_name or "heat" in category_name
            
            dfv = rec.get("dynamic_field_values") or {}
            qty_data = dfv.get("qty_energy") or {}
            quantity = float(qty_data.get("value") or 0)
            quantity_unit = (qty_data.get("unit") or "kwh").lower()
            
            if quantity <= 0:
                continue
            
            # Convert to GJ
            energy_gj = to_gj(quantity, quantity_unit) * equity_factor
            
            if is_steam_heat:
                result["steam_heating"] += energy_gj
            else:
                result["electricity"] += energy_gj
            
            result["record_count"] += 1
    
    result["total"] = result["fuel"] + result["electricity"] + result["steam_heating"]
    
    # Round all values
    for key in result:
        if isinstance(result[key], float):
            result[key] = round(result[key], 4)
    
    return result


async def _get_esg_energy(
    org_id: str,
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None
) -> Dict[str, float]:
    """
    Get energy from ESG environment_records.
    
    Returns energy in GJ for each subcategory.
    """
    result = {
        "fuel": 0.0,
        "electricity": 0.0,
        "heating": 0.0,
        "cooling": 0.0,
        "steam": 0.0,
        "total": 0.0,
        "record_count": 0
    }
    
    # Build query
    query = {
        "org_id": org_id,
        "is_current": {"$ne": False},
        "status": {"$ne": "draft"},
        "category": {"$regex": "^Energy$", "$options": "i"}
    }
    
    if facility_ids:
        query["facility_id"] = {"$in": facility_ids}
    
    # Add period filter
    if period:
        year = period.get("year")
        if year:
            # Match reporting_year or reporting_period containing the year
            query["$or"] = [
                {"reporting_year": {"$regex": str(year)}},
                {"reporting_period": {"$regex": str(year)}}
            ]
    
    records = await db.environment_records.find(query, {"_id": 0}).to_list(10000)
    
    for rec in records:
        fv = rec.get("field_values", {})
        subcategory = (rec.get("subcategory") or "").lower()
        
        # Get energy values - different fields for different subcategories
        if "heating" in subcategory:
            ren_raw = float(fv.get("renewable_heating_consumption") or 0)
            non_ren_raw = float(fv.get("non_renewable_heating_consumption") or 0)
        else:
            ren_raw = float(fv.get("renewable_energy_consumption") or 0)
            non_ren_raw = float(fv.get("non_renewable_energy_consumption") or 0)
        
        # These fields are stored in Joules, convert to GJ
        ren_gj = j_to_gj(ren_raw) if ren_raw else 0
        non_ren_gj = j_to_gj(non_ren_raw) if non_ren_raw else 0
        
        # Fallback: use quantity field for legacy records
        if ren_gj == 0 and non_ren_gj == 0 and fv.get("quantity"):
            old_qty = float(fv.get("quantity") or 0)
            old_unit = fv.get("unit") or "MWh"
            total_gj = to_gj(old_qty, old_unit)
            
            is_renewable = (fv.get("is_renewable") or "").lower()
            sub_sub = (fv.get("sub_subcategory") or fv.get("subsubcategory") or "").lower()
            if "yes" in is_renewable or "renewable" in sub_sub:
                ren_gj = total_gj
            else:
                non_ren_gj = total_gj
        
        total_gj = ren_gj + non_ren_gj
        
        if total_gj > 0:
            result["record_count"] += 1
        
        # Categorize by subcategory
        if "fuel" in subcategory:
            result["fuel"] += total_gj
        elif "electricity" in subcategory:
            result["electricity"] += total_gj
        elif "heating" in subcategory:
            result["heating"] += total_gj
        elif "cooling" in subcategory:
            result["cooling"] += total_gj
        elif "steam" in subcategory:
            result["steam"] += total_gj
        else:
            # Other energy sources
            result["total"] += total_gj
    
    result["total"] += (result["fuel"] + result["electricity"] + 
                        result["heating"] + result["cooling"] + result["steam"])
    
    # Round all values
    for key in result:
        if isinstance(result[key], float):
            result[key] = round(result[key], 4)
    
    return result


async def calculate_total_energy(
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Calculate total energy consumption by aggregating all sources.
    
    Returns energy in GJ (Gigajoules).
    """
    # Get facility IDs if not provided
    if scope_type == "organization" or not facility_ids:
        facilities = await _get_org_facility_ids(org_id)
        resolved_facility_ids = [f["id"] for f in facilities]
    else:
        resolved_facility_ids = facility_ids
    
    # Get energy from both sources
    ghg_energy = await _get_ghg_energy(org_id, resolved_facility_ids, period)
    esg_energy = await _get_esg_energy(org_id, resolved_facility_ids if scope_type == "facility" else None, period)
    
    # Aggregate totals (sum both sources)
    total_fuel = ghg_energy["fuel"] + esg_energy["fuel"]
    total_electricity = ghg_energy["electricity"] + esg_energy["electricity"]
    total_steam = ghg_energy["steam_heating"] + esg_energy["steam"]
    total_heating = esg_energy["heating"]
    total_cooling = esg_energy["cooling"]
    
    grand_total = total_fuel + total_electricity + total_steam + total_heating + total_cooling
    total_records = ghg_energy["record_count"] + esg_energy["record_count"]
    
    return format_result(
        value=round(grand_total, 4) if total_records > 0 else None,
        unit="GJ",
        record_count=total_records,
        aggregation_type="sum",
        metadata={
            "kpi_id": "energy_total_consumption",
            "kpi_name": "Total Energy Consumption",
            "metric_code": "ENERGY_TOTAL",
            "source_collection": "emission_records + environment_records",
            "breakdown": {
                "fuel": round(total_fuel, 4),
                "electricity": round(total_electricity, 4),
                "steam": round(total_steam, 4),
                "heating": round(total_heating, 4),
                "cooling": round(total_cooling, 4)
            },
            "ghg_source": ghg_energy,
            "esg_source": esg_energy,
            "query_period": period,
        },
    )


def is_energy_kpi(kpi_id: str) -> bool:
    """Check if a KPI ID is an energy total KPI."""
    return kpi_id in ("energy_total_consumption", "energy_total")
