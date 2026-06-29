"""
Waste Metrics Service - Fetches waste-related data from environment_records
Subcategories: Generated, Recovered, Disposal
"""
from typing import Optional, List, Dict, Any


class WasteMetricsService:
    CATEGORY = "Waste"
    SUBCATEGORIES = ["Generated", "Recovered", "Disposal"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Get aggregated waste metrics"""
        generated = await self._get_subcategory_total(org_id, facility_ids, "Generated")
        recovered = await self._get_subcategory_total(org_id, facility_ids, "Recovered")
        disposal = await self._get_subcategory_total(org_id, facility_ids, "Disposal")
        
        # Calculate recovery percentage
        recovery_pct = 0
        if generated > 0:
            recovery_pct = (recovered / generated) * 100
        
        return {
            "generated": round(generated, 2),
            "recovered": round(recovered, 2),
            "disposal": round(disposal, 2),
            "total": round(generated, 2),
            "recovery_pct": round(min(recovery_pct, 100), 2),
        }
    
    async def _get_subcategory_total(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        subcategory: str
    ) -> float:
        """Get total quantity for a waste subcategory"""
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
