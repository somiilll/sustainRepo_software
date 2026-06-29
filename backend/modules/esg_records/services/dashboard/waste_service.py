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
        query = {
            "organization_id": org_id,
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"},
            "subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        # Add reporting period filter
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query["$or"] = date_filter
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "total": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.quantity", 0]}}}
            }}
        ]
        
        result = await self.db.environment_records.aggregate(pipeline).to_list(1)
        return result[0]["total"] if result else 0
    
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        """Build date filter conditions for reporting_period"""
        try:
            start_year, start_month = int(start_date[:4]), int(start_date[5:7])
            end_year, end_month = int(end_date[:4]), int(end_date[5:7])
            
            months = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"]
            
            conditions = []
            for year in range(start_year, end_year + 1):
                for month_idx in range(1, 13):
                    if year == start_year and month_idx < start_month:
                        continue
                    if year == end_year and month_idx > end_month:
                        continue
                    conditions.append({
                        "reporting_period.year": year,
                        "reporting_period.month": months[month_idx - 1]
                    })
            return conditions
        except:
            return []
