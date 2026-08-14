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
        from modules.internal_data_ai.services.emissions import get_renewable_energy_components
        
        result = {
            "fuel": {"renewable": 0, "non_renewable": 0, "total": 0},
            "electricity": {"renewable": 0, "non_renewable": 0, "total": 0},
            "other_sources": {"renewable": 0, "non_renewable": 0, "total": 0},
            "total": 0,
            "renewable_total": 0,
            "non_renewable_total": 0,
        }
        
        try:
            components = await get_renewable_energy_components(org_id, facility_ids, period={"start_month": start_date, "end_month": end_date, "label": f"{start_date} to {end_date}"} if start_date and end_date else None)
            for fuel in components.get("scope1_calculations", []):
                energy_val = fuel["energy_tj"] * 277.778
                result["fuel"]["non_renewable"] += energy_val
                result["fuel"]["total"] += energy_val
                result["non_renewable_total"] += energy_val
                result["total"] += energy_val
            for electricity in components.get("scope2_electricity", []):
                energy_val = to_mwh(electricity.get("quantity") or 0, electricity.get("unit"))
                if electricity.get("renewable"):
                    result["electricity"]["renewable"] += energy_val
                    result["renewable_total"] += energy_val
                else:
                    result["electricity"]["non_renewable"] += energy_val
                    result["non_renewable_total"] += energy_val
                result["electricity"]["total"] += energy_val
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
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [base_query, {"$or": date_filter}]}
            else:
                query = base_query
        else:
            query = base_query
        
        records = await self.db.environment_records.find(
            query, {"_id": 0, "subcategory": 1, "field_values": 1}
        ).to_list(10000)
        
        for rec in records:
            fv = rec.get("field_values", {})
            subcategory = (rec.get("subcategory") or "").lower()
            
            # Heating uses different field keys than others
            if "heating" in subcategory:
                ren_raw = float(fv.get("renewable_heating_consumption") or 0)
                non_ren_raw = float(fv.get("non_renewable_heating_consumption") or 0)
            else:
                ren_raw = float(fv.get("renewable_energy_consumption") or 0)
                non_ren_raw = float(fv.get("non_renewable_energy_consumption") or 0)
            
            stored_unit = fv.get("quantity_unit") or fv.get("unit")
            ren_qty = to_mwh(ren_raw, stored_unit) if ren_raw and stored_unit else 0
            non_ren_qty = to_mwh(non_ren_raw, stored_unit) if non_ren_raw and stored_unit else 0
            
            # Fallback: use quantity field for legacy records
            if ren_qty == 0 and non_ren_qty == 0 and fv.get("quantity"):
                old_qty = float(fv.get("quantity") or 0)
                is_renewable = (fv.get("is_renewable") or "").lower()
                sub_sub = (fv.get("sub_subcategory") or fv.get("subsubcategory") or "").lower()
                if "yes" in is_renewable or "renewable" in sub_sub or "renewable" in subcategory:
                    ren_qty = to_mwh(old_qty, stored_unit)
                else:
                    non_ren_qty = to_mwh(old_qty, stored_unit)
            
            total_qty = ren_qty + non_ren_qty
            
            result["renewable_total"] += ren_qty
            result["non_renewable_total"] += non_ren_qty
            result["total"] += total_qty
            
            # Categorize by subcategory
            if "fuel" in subcategory:
                result["fuel"]["renewable"] += ren_qty
                result["fuel"]["non_renewable"] += non_ren_qty
                result["fuel"]["total"] += total_qty
            elif "electricity" in subcategory:
                result["electricity"]["renewable"] += ren_qty
                result["electricity"]["non_renewable"] += non_ren_qty
                result["electricity"]["total"] += total_qty
            elif any(x in subcategory for x in ["heating", "cooling", "steam", "outside", "other"]):
                result["other_sources"]["renewable"] += ren_qty
                result["other_sources"]["non_renewable"] += non_ren_qty
                result["other_sources"]["total"] += total_qty
            else:
                result["other_sources"]["renewable"] += ren_qty
                result["other_sources"]["non_renewable"] += non_ren_qty
                result["other_sources"]["total"] += total_qty
        
        for key in ["fuel", "electricity", "other_sources"]:
            for subkey in result[key]:
                result[key][subkey] = round(result[key][subkey], 2)
        for key in ["total", "renewable_total", "non_renewable_total"]:
            result[key] = round(result[key], 2)
        
        return result
        
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        return build_date_filter(start_date, end_date)
