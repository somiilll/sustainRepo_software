"""
Energy Metrics Service - Fetches energy data from environment_records + GHG
Structure:
  emission_records: { fuel: {renewable, non_renewable}, electricity: {...}, other_sources: {...} }
  esg_records: { fuel: {renewable, non_renewable}, electricity: {...}, other_sources: {...} }
  
Note: 
- Scope 1 fuel and Other Sources (Scope 2 except electricity) are non-renewable
- Electricity has sub-subcategory: Renewable/Non-renewable
"""
from typing import Optional, List, Dict, Any
from .date_utils import build_date_filter
from .unit_utils import to_mwh


class EnergyMetricsService:
    CATEGORY = "Energy"
    SUBCATEGORIES = ["Electricity", "Fuel", "Other Sources"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated energy metrics with renewable/non-renewable breakdown"""
        
        # GHG energy from emission_records
        ghg_energy = await self._get_ghg_energy_breakdown(org_id, facility_ids, start_date, end_date)
        
        # ESG energy from environment_records
        esg_energy = await self._get_esg_energy_breakdown(org_id, facility_ids, start_date, end_date)
        
        # Calculate totals
        emission_total = ghg_energy["total"]
        esg_total = esg_energy["total"]
        
        emission_renewable = ghg_energy["renewable_total"]
        emission_non_renewable = ghg_energy["non_renewable_total"]
        esg_renewable = esg_energy["renewable_total"]
        esg_non_renewable = esg_energy["non_renewable_total"]
        
        total = emission_total + esg_total
        renewable_total = emission_renewable + esg_renewable
        non_renewable_total = emission_non_renewable + esg_non_renewable
        
        renewable_pct = (renewable_total / total * 100) if total > 0 else 0
        
        return {
            "emission_records": ghg_energy,
            "esg_records": esg_energy,
            "total": round(total, 2),
            "renewable_total": round(renewable_total, 2),
            "non_renewable_total": round(non_renewable_total, 2),
            "renewable_pct": round(renewable_pct, 2),
        }
    
    async def _get_ghg_energy_breakdown(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get energy from GHG emission_records with renewable breakdown"""
        from ...ghg_integration import get_ghg_integration_service
        
        ghg_service = get_ghg_integration_service(self.db)
        
        result = {
            "fuel": {"renewable": 0, "non_renewable": 0, "total": 0},
            "electricity": {"renewable": 0, "non_renewable": 0, "total": 0},
            "other_sources": {"renewable": 0, "non_renewable": 0, "total": 0},
            "total": 0,
            "renewable_total": 0,
            "non_renewable_total": 0,
        }
        
        try:
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
                # category = (fv.get("category") or "").lower()
                category = (rec.get("subcategory") or "").lower()
                
                # Convert TJ to MWh
                if unit == "TJ":
                    energy_val = energy_val * 277.778
                
                # Categorize by type - GHG fuel/scope1 is non-renewable
                if "fuel" in category or "scope 1" in category or "stationary" in category or "mobile" in category:
                    result["fuel"]["non_renewable"] += energy_val
                    result["fuel"]["total"] += energy_val
                    result["non_renewable_total"] += energy_val
                # elif "electricity" in category or "purchased" in category:
                #     # For GHG records, assume non-renewable unless specified
                #     result["electricity"]["non_renewable"] += energy_val
                #     result["electricity"]["total"] += energy_val
                #     result["non_renewable_total"] += energy_val
                elif "electricity" in category or "purchased" in category:
                    # Check if it specifies renewable
                    if "renewable" in sub_category:
                        result["electricity"]["renewable"] += energy_val
                        result["electricity"]["total"] += energy_val
                        result["renewable_total"] += energy_val
                    else:
                        result["electricity"]["non_renewable"] += energy_val
                        result["electricity"]["total"] += energy_val
                        result["non_renewable_total"] += energy_val
                else:
                    result["other_sources"]["non_renewable"] += energy_val
                    result["other_sources"]["total"] += energy_val
                    result["non_renewable_total"] += energy_val
                
                result["total"] += energy_val
            
            # Round all values
            for key in ["fuel", "electricity", "other_sources"]:
                for subkey in result[key]:
                    result[key][subkey] = round(result[key][subkey], 2)
            for key in ["total", "renewable_total", "non_renewable_total"]:
                result[key] = round(result[key], 2)
            
            return result
        except Exception as e:
            print(f"Error fetching GHG energy: {e}")
            return result
    
    async def _get_esg_energy_breakdown(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, Any]:
        """Get energy from ESG records with renewable breakdown"""
        result = {
            "fuel": {"renewable": 0, "non_renewable": 0, "total": 0},
            "electricity": {"renewable": 0, "non_renewable": 0, "total": 0},
            "other_sources": {"renewable": 0, "non_renewable": 0, "total": 0},
            "total": 0,
            "renewable_total": 0,
            "non_renewable_total": 0,
        }
        
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "category": {"$regex": "^Energy$", "$options": "i"}
        }
        if facility_ids:
            base_query["facility_id"] = {"$in": facility_ids}
        
        # Build final query with optional date filter
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [base_query, {"$or": date_filter}]}
            else:
                query = base_query
        else:
            query = base_query
        
        records = await self.db.environment_records.find(query, {"_id": 0, "subcategory": 1, "field_values": 1}).to_list(10000)
        
        for rec in records:
            fv = rec.get("field_values", {})
            subcategory = (rec.get("subcategory") or "").lower()
            qty = float(fv.get("quantity") or 0)
            qty = to_mwh(qty, fv.get("unit"))
            is_renewable = (fv.get("is_renewable") or "").lower()
            sub_subcategory = (fv.get("sub_subcategory") or fv.get("subsubcategory") or "").lower()
            
            # Determine renewable status
            renewable = False
            if "yes" in is_renewable or "renewable" in sub_subcategory:
                renewable = True
            
            # Categorize
            if "fuel" in subcategory:
                # Fuel is always non-renewable per user requirement
                result["fuel"]["non_renewable"] += qty
                result["fuel"]["total"] += qty
                result["non_renewable_total"] += qty
            elif "electricity" in subcategory:
                # Electricity renewable status from sub-subcategory
                if renewable or "renewable" in sub_subcategory:
                    result["electricity"]["renewable"] += qty
                    result["renewable_total"] += qty
                else:
                    result["electricity"]["non_renewable"] += qty
                    result["non_renewable_total"] += qty
                result["electricity"]["total"] += qty
            elif "other" in subcategory:
                # Other sources are non-renewable per user requirement
                result["other_sources"]["non_renewable"] += qty
                result["other_sources"]["total"] += qty
                result["non_renewable_total"] += qty
            
            result["total"] += qty
        
        # Round all values
        for key in ["fuel", "electricity", "other_sources"]:
            for subkey in result[key]:
                result[key][subkey] = round(result[key][subkey], 2)
        for key in ["total", "renewable_total", "non_renewable_total"]:
            result[key] = round(result[key], 2)
        
        return result
    
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        return build_date_filter(start_date, end_date)
