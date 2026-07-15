"""
Waste Metrics Service - Fetches waste-related data from environment_records
Subcategories: Generated, Recovered, Disposal
"""
from typing import Optional, List, Dict, Any
from .date_utils import build_date_filter


class WasteMetricsService:
    CATEGORY = "Waste"
    SUBCATEGORIES = ["Generated", "Recovered", "Disposal"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated waste metrics"""
        generated = await self._get_subcategory_total(org_id, facility_ids, "Generated", start_date, end_date)
        recovered = await self._get_subcategory_total(org_id, facility_ids, "Recovered", start_date, end_date)
        disposal = await self._get_subcategory_total(org_id, facility_ids, "Disposal", start_date, end_date)
        
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
        subcategory: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> float:
        """Get total quantity for a waste subcategory"""
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}
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
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "total": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.quantity", 0]}}}
            }}
        ]
        
        result = await self.db.environment_records.aggregate(pipeline).to_list(1)
        print("result", result)
        return result[0]["total"] if result else 0
    
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        return build_date_filter(start_date, end_date)
