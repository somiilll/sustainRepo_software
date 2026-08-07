"""
KPI Engine - Energy Module Adapter

Calculates Total Energy Consumption by aggregating energy from:
1. GHG Module (emission_records): Fuel, Electricity, Steam/Heat
2. ESG Metrics (environment_records): All energy subcategories

Reuses the existing GHGIntegrationService.get_energy_from_ghg() for GHG data
to ensure consistency with the dashboard.

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


# =============================================================================
# Energy Adapter Functions
# =============================================================================

def _get_date_range_for_period(period: Dict[str, Any]) -> tuple:
    """Convert period dict to start_date and end_date strings for GHG service."""
    year = period.get("year")
    month = period.get("month")
    
    if not year:
        return None, None
    
    if month:
        # Specific month
        start_date = f"{year}-{month:02d}-01"
        # End of month
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"
    else:
        # Full year - use FY (Apr to Mar) or CY (Jan to Dec)
        # Default to calendar year for simplicity
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
    
    return start_date, end_date


async def _get_ghg_energy(
    org_id: str,
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None
) -> Dict[str, float]:
    """
    Get energy from GHG emission_records using the existing GHGIntegrationService.
    
    Returns energy in GJ for each subcategory.
    """
    from modules.esg_records.ghg_integration import get_ghg_integration_service
    
    result = {
        "fuel": 0.0,
        "electricity": 0.0,
        "steam_heating": 0.0,
        "total": 0.0,
        "record_count": 0
    }
    
    try:
        ghg_service = get_ghg_integration_service(db)
        
        # Convert period to date range
        start_date, end_date = None, None
        if period:
            start_date, end_date = _get_date_range_for_period(period)
        
        # Use the same function as the dashboard
        records = await ghg_service.get_energy_from_ghg(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date
        )
        
        for rec in records:
            fv = rec.get("field_values", {})
            energy_val = float(fv.get("total_energy", 0))
            unit = fv.get("energy_unit", "MWh")
            subcategory = (rec.get("subcategory") or "").lower()
            
            # Convert to GJ based on source unit
            energy_gj = to_gj(energy_val, unit)
            
            if "fuel" in subcategory:
                result["fuel"] += energy_gj
            elif "electricity" in subcategory:
                result["electricity"] += energy_gj
            elif "heating" in subcategory or "steam" in subcategory:
                result["steam_heating"] += energy_gj
            else:
                # Other energy sources
                result["total"] += energy_gj
            
            result["record_count"] += 1
        
        result["total"] += result["fuel"] + result["electricity"] + result["steam_heating"]
        
        # Round all values
        for key in result:
            if isinstance(result[key], float):
                result[key] = round(result[key], 4)
        
        return result
    except Exception as e:
        print(f"Error fetching GHG energy: {e}")
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
    
    Uses the same GHGIntegrationService as the dashboard for consistency.
    Returns energy in GJ (Gigajoules).
    """
    # Get facility IDs if scope is facility
    resolved_facility_ids = facility_ids if scope_type == "facility" and facility_ids else None
    
    # Get energy from both sources
    ghg_energy = await _get_ghg_energy(org_id, resolved_facility_ids, period)
    esg_energy = await _get_esg_energy(org_id, resolved_facility_ids, period)
    
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



async def calculate_renewable_energy(
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Calculate total renewable energy consumption across all source types."""
    resolved_facility_ids = facility_ids if scope_type == "facility" and facility_ids else None

    query: Dict[str, Any] = {
        "org_id": org_id,
        "is_current": {"$ne": False},
        "status": {"$ne": "draft"},
        "category": {"$regex": "^Energy$", "$options": "i"},
    }
    if resolved_facility_ids:
        query["facility_id"] = {"$in": resolved_facility_ids}
    if period and period.get("year"):
        yr = str(period["year"])
        query["$or"] = [{"reporting_year": {"$regex": yr}}, {"reporting_period": {"$regex": yr}}]

    records = await db.environment_records.find(query, {"_id": 0}).to_list(10000)
    total_gj = 0.0
    count = 0
    for rec in records:
        fv = rec.get("field_values", {})
        subcategory = (rec.get("subcategory") or "").lower()
        field = "renewable_heating_consumption" if "heating" in subcategory else "renewable_energy_consumption"
        raw = float(fv.get(field) or 0)
        gj = j_to_gj(raw) if raw else 0
        if gj == 0 and fv.get("quantity"):
            is_ren = (fv.get("is_renewable") or "").lower()
            sub_sub = (fv.get("sub_subcategory") or fv.get("subsubcategory") or "").lower()
            if "yes" in is_ren or "renewable" in sub_sub:
                gj = to_gj(float(fv.get("quantity") or 0), fv.get("unit") or "MWh")
        if gj > 0:
            total_gj += gj
            count += 1

    return format_result(
        value=round(total_gj, 4) if count > 0 else None,
        unit="GJ",
        record_count=count,
        aggregation_type="sum",
        metadata={"kpi_id": "energy_renewable_total", "kpi_name": "Total Renewable Energy Consumption"},
    )


async def calculate_non_renewable_energy(
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Calculate total non-renewable energy consumption across all source types."""
    resolved_facility_ids = facility_ids if scope_type == "facility" and facility_ids else None

    query: Dict[str, Any] = {
        "org_id": org_id,
        "is_current": {"$ne": False},
        "status": {"$ne": "draft"},
        "category": {"$regex": "^Energy$", "$options": "i"},
    }
    if resolved_facility_ids:
        query["facility_id"] = {"$in": resolved_facility_ids}
    if period and period.get("year"):
        yr = str(period["year"])
        query["$or"] = [{"reporting_year": {"$regex": yr}}, {"reporting_period": {"$regex": yr}}]

    records = await db.environment_records.find(query, {"_id": 0}).to_list(10000)
    total_gj = 0.0
    count = 0
    for rec in records:
        fv = rec.get("field_values", {})
        subcategory = (rec.get("subcategory") or "").lower()
        field = "non_renewable_heating_consumption" if "heating" in subcategory else "non_renewable_energy_consumption"
        raw = float(fv.get(field) or 0)
        gj = j_to_gj(raw) if raw else 0
        if gj == 0 and fv.get("quantity"):
            is_ren = (fv.get("is_renewable") or "").lower()
            sub_sub = (fv.get("sub_subcategory") or fv.get("subsubcategory") or "").lower()
            if "yes" not in is_ren and "renewable" not in sub_sub:
                gj = to_gj(float(fv.get("quantity") or 0), fv.get("unit") or "MWh")
        if gj > 0:
            total_gj += gj
            count += 1

    return format_result(
        value=round(total_gj, 4) if count > 0 else None,
        unit="GJ",
        record_count=count,
        aggregation_type="sum",
        metadata={"kpi_id": "energy_non_renewable_total", "kpi_name": "Total Non-Renewable Energy Consumption"},
    )



def is_energy_kpi(kpi_id: str) -> bool:
    """Check if a KPI ID is an energy KPI."""
    return kpi_id in ("energy_total_consumption", "energy_total",
                      "energy_renewable_total", "energy_non_renewable_total")
