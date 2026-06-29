"""
Energy Metrics Service - Fetches energy data from environment_records + GHG
Subcategories: Electricity, Fuel, Other Sources
Field: field_values.is_renewable (for future use)
"""
from typing import Optional, List, Dict, Any


class EnergyMetricsService:
    CATEGORY = "Energy"
    SUBCATEGORIES = ["Electricity", "Fuel", "Other Sources"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated energy metrics from ESG records + GHG data"""
        # ESG energy from environment_records
        esg_electricity = await self._get_subcategory_total(org_id, facility_ids, "Electricity")
        esg_fuel = await self._get_subcategory_total(org_id, facility_ids, "Fuel")
        esg_other = await self._get_subcategory_total(org_id, facility_ids, "Other Sources")
        esg_total = esg_electricity + esg_fuel + esg_other
        
        # Renewable energy
        renewable = await self._get_renewable_total(org_id, facility_ids)
        
        # GHG energy from emission_records
        ghg_energy = await self._get_ghg_energy(org_id, facility_ids, financial_year)
        
        total = esg_total + ghg_energy
        renewable_pct = (renewable / total * 100) if total > 0 else 0
        
        return {
            "electricity": round(esg_electricity, 2),
            "fuel": round(esg_fuel, 2),
            "other_sources": round(esg_other, 2),
            "renewable": round(renewable, 2),
            "renewable_pct": round(renewable_pct, 2),
            "esg_energy": round(esg_total, 2),
            "ghg_energy": round(ghg_energy, 2),
            "total": round(total, 2),
        }
    
    async def _get_subcategory_total(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        subcategory: str
    ) -> float:
        """Get total quantity for an energy subcategory (converted to MWh)"""
        query = {
            "organization_id": org_id,
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        records = await self.db.environment_records.find(query, {"_id": 0, "field_values": 1}).to_list(10000)
        
        total_mwh = 0.0
        for rec in records:
            fv = rec.get("field_values", {})
            qty = float(fv.get("quantity") or 0)
            unit = (fv.get("unit") or "MWh").lower()
            
            # Convert to MWh
            if "kwh" in unit:
                qty = qty / 1000
            elif "gwh" in unit:
                qty = qty * 1000
            elif "tj" in unit:
                qty = qty * 277.778
            
            total_mwh += qty
        
        return total_mwh
    
    async def _get_renewable_total(self, org_id: str, facility_ids: Optional[List[str]]) -> float:
        """Get total renewable energy"""
        query = {
            "organization_id": org_id,
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "field_values.is_renewable": {"$regex": "^yes$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        records = await self.db.environment_records.find(query, {"_id": 0, "field_values": 1}).to_list(10000)
        
        total = 0.0
        for rec in records:
            fv = rec.get("field_values", {})
            qty = float(fv.get("quantity") or 0)
            unit = (fv.get("unit") or "MWh").lower()
            if "kwh" in unit:
                qty = qty / 1000
            elif "gwh" in unit:
                qty = qty * 1000
            total += qty
        
        return total
    
    async def _get_ghg_energy(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        financial_year: Optional[str]
    ) -> float:
        """Get energy from GHG emission_records via ghg_integration service"""
        from ...ghg_integration import get_ghg_integration_service
        
        ghg_service = get_ghg_integration_service(self.db)
        
        try:
            energy_records = await ghg_service.get_energy_from_ghg(
                org_id=org_id,
                facility_ids=facility_ids,
                financial_year=financial_year
            )
            
            total_mwh = 0.0
            for rec in energy_records:
                fv = rec.get("field_values", {})
                energy_val = float(fv.get("total_energy", 0))
                unit = fv.get("energy_unit", "MWh")
                
                if unit == "TJ":
                    energy_val = energy_val * 277.778
                
                total_mwh += energy_val
            
            return total_mwh
        except Exception as e:
            print(f"Error fetching GHG energy: {e}")
            return 0.0
