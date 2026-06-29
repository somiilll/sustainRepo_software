"""
Emissions Metrics Service - Fetches emissions data from environment_records + GHG
Subcategories: GHG Emissions, Air Emissions
"""
from typing import Optional, List, Dict, Any


class EmissionsMetricsService:
    CATEGORY = "Emissions"
    SUBCATEGORIES = ["GHG Emissions", "Air Emissions"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated emissions from ESG records + GHG data"""
        # ESG emissions from environment_records
        ghg_esg = await self._get_subcategory_total(org_id, facility_ids, "GHG Emissions")
        air_esg = await self._get_subcategory_total(org_id, facility_ids, "Air Emissions")
        esg_total = ghg_esg + air_esg
        
        # GHG emissions from emission_records
        ghg_emissions = await self._get_ghg_emissions(org_id, facility_ids, financial_year)
        
        return {
            "ghg": round(ghg_esg, 2),
            "air": round(air_esg, 2),
            "esg_emissions": round(esg_total, 2),
            "ghg_emissions": round(ghg_emissions, 2),
            "total": round(ghg_emissions + ghg_esg, 2),  # Use GHG subcategory for total, not air
        }
    
    async def _get_subcategory_total(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        subcategory: str
    ) -> float:
        """Get total quantity for an emissions subcategory"""
        query = {
            "organization_id": org_id,
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "total": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.quantity", 0]}}}
            }}
        ]
        
        result = await self.db.environment_records.aggregate(pipeline).to_list(1)
        return result[0]["total"] if result else 0
    
    async def _get_ghg_emissions(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        financial_year: Optional[str]
    ) -> float:
        """Get emissions from GHG emission_records via ghg_integration service"""
        from ...ghg_integration import get_ghg_integration_service
        
        ghg_service = get_ghg_integration_service(self.db)
        
        try:
            emission_records = await ghg_service.get_ghg_emissions_as_records(
                org_id=org_id,
                facility_ids=facility_ids,
                financial_year=financial_year
            )
            
            total = 0.0
            for rec in emission_records:
                fv = rec.get("field_values", {})
                total += float(fv.get("total_emission", 0))
            
            return total
        except Exception as e:
            print(f"Error fetching GHG emissions: {e}")
            return 0.0
