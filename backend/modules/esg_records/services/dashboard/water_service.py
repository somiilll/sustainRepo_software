"""
Water Metrics Service - Fetches water-related data from environment_records
Subcategories: Consumption, Withdrawal, Discharge
"""
from typing import Optional, List, Dict, Any


class WaterMetricsService:
    CATEGORY = "Water"
    SUBCATEGORIES = ["Consumption", "Withdrawal", "Discharge"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get aggregated water metrics"""
        consumption = await self._get_subcategory_total(org_id, facility_ids, "Consumption")
        withdrawal = await self._get_subcategory_total(org_id, facility_ids, "Withdrawal")
        discharge = await self._get_subcategory_total(org_id, facility_ids, "Discharge")
        
        # Calculate recycling percentage
        total_input = consumption + withdrawal
        recycling_pct = 0
        if total_input > 0 and discharge < total_input:
            recycling_pct = ((total_input - discharge) / total_input) * 100
        
        return {
            "consumption": round(consumption, 2),
            "withdrawal": round(withdrawal, 2),
            "discharge": round(discharge, 2),
            "total": round(consumption + withdrawal, 2),
            "recycling_pct": round(recycling_pct, 2),
        }
    
    async def _get_subcategory_total(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        subcategory: str
    ) -> float:
        """Get total quantity for a water subcategory"""
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
