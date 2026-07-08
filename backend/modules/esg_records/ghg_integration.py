"""
GHG Module Integration Service

Provides a lightweight integration layer to import GHG emissions and energy data
into the ESG Records module without duplicating storage.

Architecture:
    GHG Module (emission_records, fuel_database)
           ↓
    GHG Integration Service (this file)
           ↓
    ESG Records View Layer

Import Strategies:
    - DIRECT: 1:1 mapping (not used currently)
    - AGGREGATED: Multiple source records → 1 ESG record (used for Energy, Emissions)
    - COMPUTED: Calculated values from source data (Energy = Qty × CV)
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import re


# =============================================================================
# Constants
# =============================================================================

class ImportStrategy:
    DIRECT = "direct"
    AGGREGATED = "aggregated"
    COMPUTED = "computed"


# Month name to number mapping
MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12
}


# =============================================================================
# Utility Functions
# =============================================================================

def parse_reporting_period(period: str) -> tuple:
    """
    Parse reporting period string and return (month_num, year).
    Handles formats: "January 2024", "2024-01", "FY 2024-25", "CY 2025"
    Returns (None, None) if cannot parse.
    """
    if not period:
        return (None, None)
    
    period_lower = period.lower()
    
    # Try FY format
    fy_match = re.match(r'fy\s*(\d{4})-(\d{2,4})', period_lower)
    if fy_match:
        return (None, int(fy_match.group(1)))  # Return start year for FY
    
    # Try CY format
    cy_match = re.match(r'cy\s*(\d{4})', period_lower)
    if cy_match:
        return (None, int(cy_match.group(1)))
    
    # Try "Month Year" format
    for month_name, month_num in MONTH_MAP.items():
        if month_name in period_lower:
            year_match = re.search(r'20\d{2}', period)
            if year_match:
                return (month_num, int(year_match.group()))
    
    # Try "YYYY-MM" format
    match = re.match(r'(\d{4})-(\d{1,2})', period)
    if match:
        return (int(match.group(2)), int(match.group(1)))
    
    return (None, None)


def get_financial_year(month: int, year: int) -> str:
    """
    Get financial year string for a given month and year.
    FY runs April-March (Indian FY).
    April 2024 → FY 2024-25
    January 2025 → FY 2024-25
    """
    if month >= 4:  # April onwards
        start_year = year
        end_year = year + 1
    else:  # Jan-March belongs to previous FY
        start_year = year - 1
        end_year = year
    
    return f"FY {start_year}-{str(end_year)[-2:]}"


def get_emission_subcategory(scope: str) -> str:
    """Convert scope to emission subcategory."""
    mapping = {
        "scope1": "GHG Emissions - Scope 1",
        "scope2": "GHG Emissions - Scope 2", 
        "scope3": "GHG Emissions - Scope 3",
        "biogenic_direct": "GHG Emissions - Biogenic (Direct)",
        "biogenic_indirect": "GHG Emissions - Biogenic (Indirect)",
        "biogenic": "GHG Emissions - Biogenic (Direct)"  # Default biogenic to direct
    }
    return mapping.get(scope.lower(), f"GHG Emissions - {scope}")


def get_scope_display_name(scope: str) -> str:
    """Convert scope code to display name."""
    mapping = {
        "scope1": "Scope 1",
        "scope2": "Scope 2", 
        "scope3": "Scope 3",
        "biogenic": "Biogenic"
    }
    return mapping.get(scope.lower(), scope)


# =============================================================================
# GHG Integration Service
# =============================================================================

class GHGIntegrationService:
    """
    Service to transform GHG module data into ESG record format.
    All records are virtual (computed on-the-fly, not stored).
    """
    
    def __init__(self, db):
        self.db = db
    
    async def get_ghg_emissions_as_records(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get GHG emissions aggregated by facility and scope per financial year.
        Returns virtual ESG records (not stored in DB).
        Applies equity share proportionation for facilities with < 100% equity.
        
        Filtering priority:
        1. If start_date/end_date provided, filter by date range
        2. Else if financial_year provided, filter by FY
        3. Else return all records
        """
        # Parse start/end dates for range filtering
        start_year_filter, start_month_filter = None, None
        end_year_filter, end_month_filter = None, None
        if start_date:
            try:
                start_year_filter = int(start_date[:4])
                start_month_filter = int(start_date[5:7])
            except:
                pass
        if end_date:
            try:
                end_year_filter = int(end_date[:4])
                end_month_filter = int(end_date[5:7])
            except:
                pass
        
        use_date_range = start_year_filter and start_month_filter and end_year_filter and end_month_filter
        # First get facilities for this organization
        # Note: facilities collection uses 'organization_id' not 'org_id'
        facility_query = {"organization_id": org_id}
        if facility_ids:
            facility_query["id"] = {"$in": facility_ids}
        
        facilities = await self.db.facilities.find(
            facility_query,
            {"_id": 0, "id": 1, "name": 1, "equity_share_percentage": 1}
        ).to_list(1000)
        
        if not facilities:
            return []
        
        # Build facility lookups (name and equity share)
        facility_names = {f["id"]: f["name"] for f in facilities}
        # Equity share as decimal (e.g., 60% -> 0.6), default to 1.0 (100%)
        facility_equity = {f["id"]: (f.get("equity_share_percentage") or 100) / 100 for f in facilities}
        org_facility_ids = list(facility_names.keys())
        
        # Query emission_records by facility_id (emission_records don't have org_id)
        emissions = await self.db.emission_records.find(
            {"facility_id": {"$in": org_facility_ids}},
            {"_id": 0}
        ).to_list(100000)
        
        if not emissions:
            return []
        
        # Separate monthly vs yearly records
        # Monthly format: "2024-01", "January 2024"
        # Yearly format: "FY 2024-25", "CY 2025"
        monthly_records = []
        yearly_records = []
        
        for em in emissions:
            period = em.get("reporting_period", "")
            if not period:
                continue
            
            # Check if it's a yearly format (FY or CY)
            period_lower = period.lower().strip()
            is_yearly = period_lower.startswith("fy") or period_lower.startswith("cy")
            
            if is_yearly:
                yearly_records.append(em)
            else:
                monthly_records.append(em)
        
        records = []
        
        # =====================================================
        # Process YEARLY records - aggregate by (facility, scope, FY)
        # =====================================================
        yearly_grouped = {}
        for em in yearly_records:
            fac_id = em.get("facility_id")
            scope = em.get("scope", "").lower()
            period = em.get("reporting_period", "")
            
            if not fac_id or not scope:
                continue
            
            # Skip biogenic - only Scope 1, 2, 3
            if scope not in ["scope1", "scope2", "scope3"]:
                continue
            
            # Parse FY from period
            month, year = parse_reporting_period(period)
            if year:
                fy = f"FY {year}-{str(year + 1)[-2:]}"
            else:
                continue
            
            # Filter by date range or FY
            if use_date_range:
                # For yearly records, check if the FY overlaps with the date range
                # FY starts in April, so FY 2024-25 = April 2024 to March 2025
                fy_start_month, fy_start_year = 4, year
                fy_end_month, fy_end_year = 3, year + 1
                
                # Check if FY overlaps with filter range
                fy_start_val = fy_start_year * 12 + fy_start_month
                fy_end_val = fy_end_year * 12 + fy_end_month
                filter_start_val = start_year_filter * 12 + start_month_filter
                filter_end_val = end_year_filter * 12 + end_month_filter
                
                if fy_end_val < filter_start_val or fy_start_val > filter_end_val:
                    continue  # No overlap
            elif financial_year and fy != financial_year:
                continue
            
            key = (fac_id, scope, fy)
            if key not in yearly_grouped:
                yearly_grouped[key] = {
                    "emissions": [],
                    "total_co2e": 0,
                    "categories": set(),
                    "category_emissions": {}  # Track emissions per category
                }
            
            tco2e = float(em.get("total_emissions") or em.get("co2e_emissions") or em.get("calculated_co2e") or 0)
            # Apply equity share proportionation
            equity_factor = facility_equity.get(fac_id, 1.0)
            tco2e_proportioned = tco2e * equity_factor
            yearly_grouped[key]["emissions"].append(em)
            yearly_grouped[key]["total_co2e"] += tco2e_proportioned
            yearly_grouped[key]["equity_share"] = equity_factor * 100  # Store for notes
            if em.get("category"):
                cat_name = em.get("category")
                yearly_grouped[key]["categories"].add(cat_name)
                # Accumulate emissions per category
                yearly_grouped[key]["category_emissions"][cat_name] = yearly_grouped[key]["category_emissions"].get(cat_name, 0) + tco2e_proportioned
        
        # Build yearly aggregated records
        for (fac_id, scope, fy), data in yearly_grouped.items():
            record_id = f"ghg_emission_{fac_id}_{scope}_{fy.replace(' ', '_').replace('-', '_')}"
            equity_pct = data.get("equity_share", 100)
            equity_note = f" (Proportionated by {equity_pct:.0f}% equity share)" if equity_pct < 100 else ""
            
            # Build category breakdown with emissions
            category_breakdown = {cat: round(val, 4) for cat, val in data.get("category_emissions", {}).items()}
            
            records.append({
                "id": record_id,
                "source_type": "ghg_import",
                "source_module": "ghg",
                "import_strategy": ImportStrategy.AGGREGATED,
                "is_locked": True,
                "section": "environment",
                "category": "Emissions",
                "subcategory": get_emission_subcategory(scope),
                "sub_subcategory": get_scope_display_name(scope),
                "record_level": "facility",
                "facility_id": fac_id,
                "facility_name": facility_names.get(fac_id, fac_id),
                "org_id": org_id,
                "reporting_period": {
                    "reporting_type": "yearly",
                    "year_type": "financial",
                    "financial_year": fy
                },
                "field_values": {
                    "total_emission": round(data["total_co2e"], 4),
                    "emission_unit": "tCO2e",
                    "source_records_count": len(data["emissions"]),
                    "categories_included": list(data["categories"]),
                    "category_emissions": category_breakdown
                },
                "source_of_information": "GHG Module",
                "notes": f"Auto-aggregated from {len(data['emissions'])} yearly GHG emission records{equity_note}",
                "evidence_files": [],
                "version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        # =====================================================
        # Process MONTHLY records - aggregate by (facility, scope, month)
        # Keep monthly granularity, don't roll up into yearly
        # =====================================================
        monthly_grouped = {}
        for em in monthly_records:
            fac_id = em.get("facility_id")
            scope = em.get("scope", "").lower()
            period = em.get("reporting_period", "")
            
            if not fac_id or not scope:
                continue
            
            # Skip biogenic - only Scope 1, 2, 3
            if scope not in ["scope1", "scope2", "scope3"]:
                continue
            
            # Parse month/year from period
            month, year = parse_reporting_period(period)
            if not month or not year:
                continue
            
            # Filter by date range or FY
            if use_date_range:
                # Check if this month/year falls within the date range
                record_val = year * 12 + month
                filter_start_val = start_year_filter * 12 + start_month_filter
                filter_end_val = end_year_filter * 12 + end_month_filter
                
                if record_val < filter_start_val or record_val > filter_end_val:
                    continue  # Outside date range
            elif financial_year:
                record_fy = get_financial_year(month, year)
                if record_fy != financial_year:
                    continue
            
            # Create month period string (YYYY-MM format)
            month_period = f"{year}-{month:02d}"
            
            key = (fac_id, scope, month_period)
            if key not in monthly_grouped:
                monthly_grouped[key] = {
                    "emissions": [],
                    "total_co2e": 0,
                    "categories": set(),
                    "category_emissions": {},  # Track emissions per category
                    "month": month,
                    "year": year
                }
            
            tco2e = float(em.get("total_emissions") or em.get("co2e_emissions") or em.get("calculated_co2e") or 0)
            # Apply equity share proportionation
            equity_factor = facility_equity.get(fac_id, 1.0)
            tco2e_proportioned = tco2e * equity_factor
            monthly_grouped[key]["emissions"].append(em)
            monthly_grouped[key]["total_co2e"] += tco2e_proportioned
            monthly_grouped[key]["equity_share"] = equity_factor * 100  # Store for notes
            if em.get("category"):
                cat_name = em.get("category")
                monthly_grouped[key]["categories"].add(cat_name)
                # Accumulate emissions per category
                monthly_grouped[key]["category_emissions"][cat_name] = monthly_grouped[key]["category_emissions"].get(cat_name, 0) + tco2e_proportioned
        
        # Build monthly aggregated records (grouped by month, not rolled into yearly)
        for (fac_id, scope, month_period), data in monthly_grouped.items():
            record_id = f"ghg_emission_{fac_id}_{scope}_{month_period.replace('-', '_')}"
            equity_pct = data.get("equity_share", 100)
            equity_note = f" (Proportionated by {equity_pct:.0f}% equity share)" if equity_pct < 100 else ""
            
            # Build category breakdown with emissions
            category_breakdown = {cat: round(val, 4) for cat, val in data.get("category_emissions", {}).items()}
            
            records.append({
                "id": record_id,
                "source_type": "ghg_import",
                "source_module": "ghg",
                "import_strategy": ImportStrategy.AGGREGATED,
                "is_locked": True,
                "section": "environment",
                "category": "Emissions",
                "subcategory": get_emission_subcategory(scope),
                "sub_subcategory": get_scope_display_name(scope),
                "record_level": "facility",
                "facility_id": fac_id,
                "facility_name": facility_names.get(fac_id, fac_id),
                "org_id": org_id,
                "reporting_period": {
                    "reporting_type": "monthly",
                    "year": data["year"],
                    "month": data["month"]
                },
                "field_values": {
                    "total_emission": round(data["total_co2e"], 4),
                    "emission_unit": "tCO2e",
                    "source_records_count": len(data["emissions"]),
                    "categories_included": list(data["categories"]),
                    "category_emissions": category_breakdown
                },
                "source_of_information": "GHG Module",
                "notes": f"Auto-aggregated from {len(data['emissions'])} monthly GHG emission records for {month_period}{equity_note}",
                "evidence_files": [],
                "version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        return records
    
    async def get_energy_from_ghg(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Calculate energy consumption from GHG module data.
        
        Scope 1 (Fuel): Energy = Σ(Quantity × Calorific Value) in TJ
        Scope 2 (Electricity): Energy = Σ(Quantity) in MWh (direct)
        
        Returns aggregated by facility and energy type per financial year.
        Applies equity share proportionation for facilities with < 100% equity.
        
        Filtering priority:
        1. If start_date/end_date provided, filter by date range
        2. Else if financial_year provided, filter by FY
        3. Else return all records
        """
        # Parse start/end dates for range filtering
        start_year_filter, start_month_filter = None, None
        end_year_filter, end_month_filter = None, None
        if start_date:
            try:
                start_year_filter = int(start_date[:4])
                start_month_filter = int(start_date[5:7])
            except:
                pass
        if end_date:
            try:
                end_year_filter = int(end_date[:4])
                end_month_filter = int(end_date[5:7])
            except:
                pass
        
        use_date_range = start_year_filter and start_month_filter and end_year_filter and end_month_filter
        # First get facilities for this organization
        # Note: facilities collection uses 'organization_id' not 'org_id'
        facility_query = {"organization_id": org_id}
        if facility_ids:
            facility_query["id"] = {"$in": facility_ids}
        
        facilities = await self.db.facilities.find(
            facility_query,
            {"_id": 0, "id": 1, "name": 1, "equity_share_percentage": 1}
        ).to_list(1000)
        
        if not facilities:
            return []
        
        # Build facility lookups (name and equity share)
        facility_names = {f["id"]: f["name"] for f in facilities}
        # Equity share as decimal (e.g., 60% -> 0.6), default to 1.0 (100%)
        facility_equity = {f["id"]: (f.get("equity_share_percentage") or 100) / 100 for f in facilities}
        org_facility_ids = list(facility_names.keys())
        
        # Query emission_records by facility_id
        emissions = await self.db.emission_records.find(
            {"facility_id": {"$in": org_facility_ids}},
            {"_id": 0}
        ).to_list(100000)
        
        if not emissions:
            return []
        
        # Load fuel database for calorific values and density
        fuel_cv_cache = {}
        fuel_density_cache = {}
        fuels = await self.db.fuel_database.find({}, {"_id": 0}).to_list(10000)
        for fuel in fuels:
            fuel_name = (fuel.get("fuel_name") or "").lower()
            fuel_id = fuel.get("id", "")
            # CV stored as 'calorific_value' in TJ/kg format
            cv = fuel.get("calorific_value")
            density = fuel.get("density")
            if cv:
                fuel_cv_cache[fuel_name] = float(cv)
                fuel_cv_cache[fuel_id] = float(cv)
            if density:
                fuel_density_cache[fuel_name] = float(density)
                fuel_density_cache[fuel_id] = float(density)
        
        # Separate monthly vs yearly records
        monthly_records = []
        yearly_records = []
        
        for em in emissions:
            period = em.get("reporting_period", "")
            if not period:
                continue
            
            period_lower = period.lower().strip()
            is_yearly = period_lower.startswith("fy") or period_lower.startswith("cy")
            
            if is_yearly:
                yearly_records.append(em)
            else:
                monthly_records.append(em)
        
        def process_energy_record(em, grouped, period_key, period_info):
            """Helper to process a single energy record into the grouped dict."""
            fac_id = em.get("facility_id")
            scope = (em.get("scope") or "").lower()
            
            if not fac_id:
                return
            
            # Get equity factor for this facility
            equity_factor = facility_equity.get(fac_id, 1.0)
            
            # Determine energy type and calculate
            if scope == "scope1":
                energy_type = "fuel"
                
                # Get quantity from dynamic_field_values.qty
                dfv = em.get("dynamic_field_values") or {}
                qty_data = dfv.get("qty") or {}
                quantity = float(qty_data.get("value") or 0)
                quantity_unit = (qty_data.get("unit") or "").lower()
                
                if quantity <= 0:
                    return
                
                # Get fuel info
                fuel_name = (em.get("fuel_name") or em.get("fuel_type") or "").lower()
                fuel_db_id = em.get("fuel_database_id") or ""
                
                # Get calorific value
                cv_data = dfv.get("cv") or {}
                cv = cv_data.get("value")
                if cv:
                    cv = float(cv)
                else:
                    cv = fuel_cv_cache.get(fuel_name) or fuel_cv_cache.get(fuel_db_id)
                
                if not cv:
                    return
                
                # Get density
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
                
                # Calculate energy: Quantity (kg) × CV (TJ/kg) = TJ
                energy_tj = quantity_kg * cv
                # Apply equity share proportionation
                energy_tj_proportioned = energy_tj * equity_factor
                
                key = (fac_id, energy_type, period_key)
                if key not in grouped:
                    grouped[key] = {
                        "records": [],
                        "total_energy": 0,
                        "total_quantity": 0,
                        "fuels_used": set(),
                        "sub_subcategory": "Non-Renewable",
                        "period_info": period_info,
                        "equity_share": equity_factor * 100
                    }
                
                grouped[key]["records"].append(em)
                grouped[key]["total_energy"] += energy_tj_proportioned
                grouped[key]["total_quantity"] += quantity
                if fuel_name:
                    grouped[key]["fuels_used"].add(fuel_name.title())
            
            elif scope == "scope2":
                category_name = (em.get("category") or "").lower()
                is_steam_heat = "steam" in category_name or "heat" in category_name
                
                if is_steam_heat:
                    energy_type = "other_sources"
                    
                    dfv = em.get("dynamic_field_values") or {}
                    qty_data = dfv.get("qty_energy") or {}
                    quantity = float(qty_data.get("value") or 0)
                    quantity_unit = (qty_data.get("unit") or "").lower()
                    
                    if quantity <= 0:
                        return
                    
                    if "kwh" in quantity_unit:
                        energy_mwh = quantity / 1000
                    elif "mwh" in quantity_unit:
                        energy_mwh = quantity
                    elif "gwh" in quantity_unit:
                        energy_mwh = quantity * 1000
                    else:
                        energy_mwh = quantity / 1000
                    
                    # Apply equity share proportionation
                    energy_mwh_proportioned = energy_mwh * equity_factor
                    
                    key = (fac_id, energy_type, period_key, "Non-Renewable")
                    if key not in grouped:
                        grouped[key] = {
                            "records": [],
                            "total_energy": 0,
                            "total_quantity": 0,
                            "sub_subcategory": "Non-Renewable",
                            "period_info": period_info,
                            "equity_share": equity_factor * 100
                        }
                    
                    grouped[key]["records"].append(em)
                    grouped[key]["total_energy"] += energy_mwh_proportioned
                    grouped[key]["total_quantity"] += quantity
                else:
                    energy_type = "electricity"
                    
                    sub_cat = (em.get("sub_category") or "").lower()
                    is_renewable = "renewable" in sub_cat and "non" not in sub_cat
                    renewable_type = "Renewable" if is_renewable else "Non-Renewable"
                    
                    dfv = em.get("dynamic_field_values") or {}
                    qty_data = dfv.get("qty_energy") or {}
                    quantity = float(qty_data.get("value") or 0)
                    quantity_unit = (qty_data.get("unit") or "").lower()
                    
                    if quantity <= 0:
                        return
                    
                    if "kwh" in quantity_unit:
                        energy_mwh = quantity / 1000
                    elif "mwh" in quantity_unit:
                        energy_mwh = quantity
                    elif "gwh" in quantity_unit:
                        energy_mwh = quantity * 1000
                    else:
                        energy_mwh = quantity / 1000
                    
                    # Apply equity share proportionation
                    energy_mwh_proportioned = energy_mwh * equity_factor
                    
                    key = (fac_id, energy_type, period_key, renewable_type)
                    if key not in grouped:
                        grouped[key] = {
                            "records": [],
                            "total_energy": 0,
                            "total_quantity": 0,
                            "sub_subcategory": renewable_type,
                            "period_info": period_info,
                            "equity_share": equity_factor * 100
                        }
                    
                    grouped[key]["records"].append(em)
                    grouped[key]["total_energy"] += energy_mwh_proportioned
                    grouped[key]["total_quantity"] += quantity
        
        # =====================================================
        # Process YEARLY records - aggregate by FY
        # =====================================================
        yearly_grouped = {}
        for em in yearly_records:
            period = em.get("reporting_period", "")
            month, year = parse_reporting_period(period)
            if year:
                fy = f"FY {year}-{str(year + 1)[-2:]}"
            else:
                continue
            
            # Filter by date range or FY
            if use_date_range:
                # For yearly records, check if the FY overlaps with the date range
                fy_start_month, fy_start_year = 4, year
                fy_end_month, fy_end_year = 3, year + 1
                
                fy_start_val = fy_start_year * 12 + fy_start_month
                fy_end_val = fy_end_year * 12 + fy_end_month
                filter_start_val = start_year_filter * 12 + start_month_filter
                filter_end_val = end_year_filter * 12 + end_month_filter
                
                if fy_end_val < filter_start_val or fy_start_val > filter_end_val:
                    continue  # No overlap
            elif financial_year and fy != financial_year:
                continue
            
            period_info = {"reporting_type": "yearly", "year_type": "financial", "financial_year": fy}
            process_energy_record(em, yearly_grouped, fy, period_info)
        
        # =====================================================
        # Process MONTHLY records - aggregate by month
        # =====================================================
        monthly_grouped = {}
        for em in monthly_records:
            period = em.get("reporting_period", "")
            month, year = parse_reporting_period(period)
            if not month or not year:
                continue
            
            # Filter by date range or FY
            if use_date_range:
                record_val = year * 12 + month
                filter_start_val = start_year_filter * 12 + start_month_filter
                filter_end_val = end_year_filter * 12 + end_month_filter
                
                if record_val < filter_start_val or record_val > filter_end_val:
                    continue  # Outside date range
            elif financial_year:
                record_fy = get_financial_year(month, year)
                if record_fy != financial_year:
                    continue
            
            month_period = f"{year}-{month:02d}"
            period_info = {"reporting_type": "monthly", "year": year, "month": month}
            process_energy_record(em, monthly_grouped, month_period, period_info)
        
        # Combine yearly and monthly grouped data
        all_grouped = {**yearly_grouped, **monthly_grouped}
        
        # Build virtual ESG records
        records = []
        for key, data in all_grouped.items():
            # Key can be 3-tuple (fuel) or 4-tuple (electricity with renewable type)
            if len(key) == 3:
                fac_id, energy_type, period_key = key
                sub_subcategory = data.get("sub_subcategory", "Non-Renewable")
            else:
                fac_id, energy_type, period_key, renewable_type = key
                sub_subcategory = renewable_type
            
            period_info = data.get("period_info", {})
            record_id = f"ghg_energy_{fac_id}_{energy_type}_{sub_subcategory}_{period_key.replace(' ', '_').replace('-', '_')}"
            
            # Build equity note if proportionated
            equity_pct = data.get("equity_share", 100)
            equity_note = f" (Proportionated by {equity_pct:.0f}% equity share)" if equity_pct < 100 else ""
            
            if energy_type == "fuel":
                subcategory = "Fuel Within Organization"
                field_values = {
                    "total_energy": round(data["total_energy"], 6),
                    "energy_unit": "TJ",
                    "source_records_count": len(data["records"]),
                    "fuels_included": list(data.get("fuels_used", []))
                }
                notes = f"Calculated from {len(data['records'])} Scope 1 fuel records (Energy = Qty × CV){equity_note}"
            elif energy_type == "other_sources":
                subcategory = "Heating Within Organization"
                field_values = {
                    "total_energy": round(data["total_energy"], 2),
                    "energy_unit": "MWh",
                    "source_records_count": len(data["records"])
                }
                notes = f"Aggregated from {len(data['records'])} Scope 2 Purchased Steam/Heat records{equity_note}"
            else:
                subcategory = "Electricity Within Organization"
                field_values = {
                    "total_energy": round(data["total_energy"], 2),
                    "energy_unit": "MWh",
                    "source_records_count": len(data["records"])
                }
                notes = f"Aggregated from {len(data['records'])} Scope 2 {sub_subcategory.lower()} electricity records{equity_note}"
            
            records.append({
                "id": record_id,
                "source_type": "ghg_import",
                "source_module": "ghg",
                "import_strategy": ImportStrategy.COMPUTED if energy_type == "fuel" else ImportStrategy.AGGREGATED,
                "is_locked": True,
                "section": "environment",
                "category": "Energy",
                "subcategory": subcategory,
                "sub_subcategory": sub_subcategory,
                "record_level": "facility",
                "facility_id": fac_id,
                "facility_name": facility_names.get(fac_id, fac_id),
                "org_id": org_id,
                "reporting_period": period_info,
                "field_values": field_values,
                "source_of_information": "GHG Module",
                "notes": notes,
                "evidence_files": [],
                "version": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        
        return records
    
    async def get_all_imported_records(
        self,
        org_id: str,
        section: str = "environment",
        category: Optional[str] = None,
        facility_id: Optional[str] = None,
        financial_year: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all imported records from GHG module for ESG Records display.
        Combines emissions and energy records.
        """
        if section != "environment":
            return []  # Only environment has GHG imports currently
        
        facility_ids = [facility_id] if facility_id else None
        
        records = []
        
        # Get GHG Emissions if category matches or no filter
        if not category or category.lower() == "emissions":
            emissions = await self.get_ghg_emissions_as_records(
                org_id=org_id,
                facility_ids=facility_ids,
                financial_year=financial_year
            )
            records.extend(emissions)
        
        # Get Energy if category matches or no filter
        if not category or category.lower() == "energy":
            energy = await self.get_energy_from_ghg(
                org_id=org_id,
                facility_ids=facility_ids,
                financial_year=financial_year
            )
            records.extend(energy)
        
        return records


# Factory function - creates new instance each time to ensure fresh db connection
def get_ghg_integration_service(db) -> GHGIntegrationService:
    return GHGIntegrationService(db)
