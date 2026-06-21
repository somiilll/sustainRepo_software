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
        financial_year: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get GHG emissions aggregated by facility and scope per financial year.
        Returns virtual ESG records (not stored in DB).
        """
        # First get facilities for this organization
        # Note: facilities collection uses 'organization_id' not 'org_id'
        facility_query = {"organization_id": org_id}
        if facility_ids:
            facility_query["id"] = {"$in": facility_ids}
        
        facilities = await self.db.facilities.find(
            facility_query,
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(1000)
        
        if not facilities:
            return []
        
        # Build facility lookup
        facility_names = {f["id"]: f["name"] for f in facilities}
        org_facility_ids = list(facility_names.keys())
        
        # Query emission_records by facility_id (emission_records don't have org_id)
        emissions = await self.db.emission_records.find(
            {"facility_id": {"$in": org_facility_ids}},
            {"_id": 0}
        ).to_list(100000)
        
        if not emissions:
            return []
        
        # Group by (facility_id, scope, financial_year)
        grouped = {}
        for em in emissions:
            fac_id = em.get("facility_id")
            scope = em.get("scope", "").lower()
            period = em.get("reporting_period", "")
            
            # Skip if no facility or scope
            if not fac_id or not scope:
                continue
            
            # Skip biogenic - only Scope 1, 2, 3
            if scope not in ["scope1", "scope2", "scope3"]:
                continue
            
            # Parse reporting period to get FY
            month, year = parse_reporting_period(period)
            if month and year:
                fy = get_financial_year(month, year)
            elif year:
                # Yearly record - use the year as-is for FY determination
                # Assume it belongs to FY starting that year
                fy = f"FY {year}-{str(year + 1)[-2:]}"
            else:
                continue  # Skip records with unparseable periods
            
            # Filter by requested FY if specified
            if financial_year and fy != financial_year:
                continue
            
            key = (fac_id, scope, fy)
            if key not in grouped:
                grouped[key] = {
                    "emissions": [],
                    "total_co2e": 0,
                    "categories": set()
                }
            
            # Get emission value
            tco2e = float(em.get("total_emissions") or em.get("co2e_emissions") or em.get("calculated_co2e") or 0)
            grouped[key]["emissions"].append(em)
            grouped[key]["total_co2e"] += tco2e
            if em.get("category"):
                grouped[key]["categories"].add(em.get("category"))
        
        # Build virtual ESG records
        records = []
        for (fac_id, scope, fy), data in grouped.items():
            record_id = f"ghg_emission_{fac_id}_{scope}_{fy.replace(' ', '_').replace('-', '_')}"
            
            records.append({
                "id": record_id,
                "source_type": "ghg_import",
                "source_module": "ghg",
                "import_strategy": ImportStrategy.AGGREGATED,
                "is_locked": True,
                "section": "environment",
                "category": "Emissions",
                "subcategory": "GHG Emissions",
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
                    "categories_included": list(data["categories"])
                },
                "source_of_information": "GHG Module",
                "notes": f"Auto-aggregated from {len(data['emissions'])} GHG emission records",
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
        financial_year: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Calculate energy consumption from GHG module data.
        
        Scope 1 (Fuel): Energy = Σ(Quantity × Calorific Value) in TJ
        Scope 2 (Electricity): Energy = Σ(Quantity) in MWh (direct)
        
        Returns aggregated by facility and energy type per financial year.
        """
        # First get facilities for this organization
        # Note: facilities collection uses 'organization_id' not 'org_id'
        facility_query = {"organization_id": org_id}
        if facility_ids:
            facility_query["id"] = {"$in": facility_ids}
        
        facilities = await self.db.facilities.find(
            facility_query,
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(1000)
        
        if not facilities:
            return []
        
        # Build facility lookup
        facility_names = {f["id"]: f["name"] for f in facilities}
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
        
        # Group by (facility_id, energy_type, financial_year)
        # energy_type: "fuel" (scope1) or "electricity" (scope2)
        grouped = {}
        
        for em in emissions:
            fac_id = em.get("facility_id")
            scope = (em.get("scope") or "").lower()
            period = em.get("reporting_period", "")
            
            if not fac_id:
                continue
            
            # Parse reporting period
            month, year = parse_reporting_period(period)
            if month and year:
                fy = get_financial_year(month, year)
            elif year:
                fy = f"FY {year}-{str(year + 1)[-2:]}"
            else:
                continue
            
            # Filter by requested FY
            if financial_year and fy != financial_year:
                continue
            
            # Determine energy type and calculate
            if scope == "scope1":
                energy_type = "fuel"
                
                # Get quantity from dynamic_field_values.qty
                dfv = em.get("dynamic_field_values") or {}
                qty_data = dfv.get("qty") or {}
                quantity = float(qty_data.get("value") or 0)
                quantity_unit = (qty_data.get("unit") or "").lower()
                
                if quantity <= 0:
                    continue
                
                # Get fuel info
                fuel_name = (em.get("fuel_name") or em.get("fuel_type") or "").lower()
                fuel_db_id = em.get("fuel_database_id") or ""
                
                # Get calorific value - first from dynamic_field_values, then from fuel database
                cv_data = dfv.get("cv") or {}
                cv = cv_data.get("value")
                if cv:
                    cv = float(cv)
                else:
                    cv = fuel_cv_cache.get(fuel_name) or fuel_cv_cache.get(fuel_db_id)
                
                if not cv:
                    continue  # Skip if no CV available
                
                # Get density - first from dynamic_field_values, then from fuel database
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
                    quantity_kg = quantity  # Assume kg
                
                # Calculate energy: Quantity (kg) × CV (TJ/kg) = TJ
                # CV in fuel_database is already in TJ/kg format
                energy_tj = quantity_kg * cv
                
                key = (fac_id, energy_type, fy)
                if key not in grouped:
                    grouped[key] = {
                        "records": [],
                        "total_energy": 0,
                        "total_quantity": 0,
                        "fuels_used": set(),
                        "sub_subcategory": "Non-Renewable"  # Fuel is always non-renewable
                    }
                
                grouped[key]["records"].append(em)
                grouped[key]["total_energy"] += energy_tj
                grouped[key]["total_quantity"] += quantity
                if fuel_name:
                    grouped[key]["fuels_used"].add(fuel_name.title())
            
            elif scope == "scope2":
                # Check if this is Purchased Steam/Heat category
                category_name = (em.get("category") or "").lower()
                is_steam_heat = "steam" in category_name or "heat" in category_name
                
                if is_steam_heat:
                    # Handle Purchased Steam/Heat -> Energy -> Other Sources -> Non-Renewable
                    energy_type = "other_sources"
                    
                    # Get quantity from dynamic_field_values.qty_energy
                    dfv = em.get("dynamic_field_values") or {}
                    qty_data = dfv.get("qty_energy") or {}
                    quantity = float(qty_data.get("value") or 0)
                    quantity_unit = (qty_data.get("unit") or "").lower()
                    
                    if quantity <= 0:
                        continue
                    
                    # Convert to MWh (default unit)
                    if "kwh" in quantity_unit:
                        energy_mwh = quantity / 1000
                    elif "mwh" in quantity_unit:
                        energy_mwh = quantity
                    elif "gwh" in quantity_unit:
                        energy_mwh = quantity * 1000
                    else:
                        energy_mwh = quantity / 1000  # Assume kWh
                    
                    # Group under Other Sources -> Non-Renewable
                    key = (fac_id, energy_type, fy, "Non-Renewable")
                    if key not in grouped:
                        grouped[key] = {
                            "records": [],
                            "total_energy": 0,
                            "total_quantity": 0,
                            "sub_subcategory": "Non-Renewable"
                        }
                    
                    grouped[key]["records"].append(em)
                    grouped[key]["total_energy"] += energy_mwh
                    grouped[key]["total_quantity"] += quantity
                else:
                    # Handle Electricity (existing logic)
                    energy_type = "electricity"
                    
                    # Determine if renewable or non-renewable from sub_category
                    sub_cat = (em.get("sub_category") or "").lower()
                    is_renewable = "renewable" in sub_cat and "non" not in sub_cat
                    renewable_type = "Renewable" if is_renewable else "Non-Renewable"
                    
                    # Get quantity from dynamic_field_values.qty_energy (not qty)
                    dfv = em.get("dynamic_field_values") or {}
                    qty_data = dfv.get("qty_energy") or {}
                    quantity = float(qty_data.get("value") or 0)
                    quantity_unit = (qty_data.get("unit") or "").lower()
                    
                    if quantity <= 0:
                        continue
                    
                    # Convert to MWh (default unit)
                    if "kwh" in quantity_unit:
                        energy_mwh = quantity / 1000
                    elif "mwh" in quantity_unit:
                        energy_mwh = quantity
                    elif "gwh" in quantity_unit:
                        energy_mwh = quantity * 1000
                    else:
                        energy_mwh = quantity / 1000  # Assume kWh
                    
                    # Group by facility, energy_type, FY, AND renewable type
                    key = (fac_id, energy_type, fy, renewable_type)
                    if key not in grouped:
                        grouped[key] = {
                            "records": [],
                            "total_energy": 0,
                            "total_quantity": 0,
                            "sub_subcategory": renewable_type
                        }
                    
                    grouped[key]["records"].append(em)
                    grouped[key]["total_energy"] += energy_mwh
                    grouped[key]["total_quantity"] += quantity
        
        # Build virtual ESG records
        records = []
        for key, data in grouped.items():
            # Key can be 3-tuple (fuel) or 4-tuple (electricity with renewable type)
            if len(key) == 3:
                fac_id, energy_type, fy = key
                sub_subcategory = data.get("sub_subcategory", "Non-Renewable")
            else:
                fac_id, energy_type, fy, renewable_type = key
                sub_subcategory = renewable_type
            
            record_id = f"ghg_energy_{fac_id}_{energy_type}_{sub_subcategory}_{fy.replace(' ', '_').replace('-', '_')}"
            
            if energy_type == "fuel":
                subcategory = "Fuel"
                field_values = {
                    "total_energy": round(data["total_energy"], 6),
                    "energy_unit": "TJ",
                    "source_records_count": len(data["records"]),
                    "fuels_included": list(data.get("fuels_used", []))
                }
                notes = f"Calculated from {len(data['records'])} Scope 1 fuel records (Energy = Qty × CV)"
            elif energy_type == "other_sources":
                subcategory = "Other Sources"
                field_values = {
                    "total_energy": round(data["total_energy"], 2),
                    "energy_unit": "MWh",
                    "source_records_count": len(data["records"])
                }
                notes = f"Aggregated from {len(data['records'])} Scope 2 Purchased Steam/Heat records"
            else:
                subcategory = "Electricity"
                field_values = {
                    "total_energy": round(data["total_energy"], 2),
                    "energy_unit": "MWh",
                    "source_records_count": len(data["records"])
                }
                notes = f"Aggregated from {len(data['records'])} Scope 2 {sub_subcategory.lower()} electricity records"
            
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
                "reporting_period": {
                    "reporting_type": "yearly",
                    "year_type": "financial",
                    "financial_year": fy
                },
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
