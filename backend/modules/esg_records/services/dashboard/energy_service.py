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
from .unit_utils import to_mwh


class EnergyMetricsService:
    CATEGORY = "Energy"
    SUBCATEGORIES = ["Electricity", "Fuel", "Other Sources"]
    
    def __init__(self, db):
        self.db = db

    @staticmethod
    def _ledger_period(start_date: Optional[str], end_date: Optional[str]) -> Optional[Dict[str, Any]]:
        """Mirror the Internal Data AI's financial-year period contract for ledger parity."""
        if not start_date or not end_date:
            return None
        start_year, start_month = start_date[:4], start_date[5:7]
        end_year, end_month = end_date[:4], end_date[5:7]
        is_financial_year = start_month == "04" and end_month == "03" and int(end_year) == int(start_year) + 1
        return {
            "type": "financial_year" if is_financial_year else "calendar_month",
            "start_month": start_date,
            "end_month": end_date,
            "label": f"FY {start_year}-{end_year}" if is_financial_year else f"{start_date} to {end_date}",
            "source": "explicit",
            "fiscal_start_month": 4,
        }
    
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
        ledger_period = self._ledger_period(start_date, end_date)
        ghg_energy = await self._get_ghg_energy_breakdown(org_id, facility_ids, ledger_period)
        
        # ESG energy from environment_records
        esg_energy = await self._get_esg_energy_breakdown(org_id, facility_ids, ledger_period)
        
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
        period: Optional[Dict[str, Any]] = None,
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
            components = await get_renewable_energy_components(org_id, facility_ids, period=period)
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
        period: Optional[Dict[str, Any]],
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
        
        from modules.internal_data_ai.services.esg_records import search_records

        ledger = await search_records(
            org_id,
            facility_ids,
            record_type="environment",
            category="Energy",
            derived_metric="renewable_energy_percentage",
            period=period,
        )
        for row in ledger.get("renewable_energy_results") or []:
            subcategory = (row.get("subcategory") or "").lower()
            ren_qty = to_mwh(row.get("renewable_value") or 0, row.get("unit"))
            total_qty = to_mwh(row.get("total_value") or 0, row.get("unit"))
            non_ren_qty = max(0, total_qty - ren_qty)
            
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
        
