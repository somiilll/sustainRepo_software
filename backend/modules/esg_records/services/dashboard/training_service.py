"""
Training Metrics Service - Fetches training-related data from social records
Categories: Training
"""
from typing import Optional, List, Dict, Any


class TrainingMetricsService:
    CATEGORY = "Training"
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated training metrics"""
        query = {
            "org_id": org_id,
            "section": "social",
            "category": {"$regex": f"^{self.CATEGORY}$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "total_trainings": {"$sum": 1},
                "total_hours": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.hours", "$field_values.training_hours", 0]}}},
                "total_participants": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.participants", "$field_values.attendees", 0]}}}
            }}
        ]
        
        result = await self.db.environment_records.aggregate(pipeline).to_list(1)
        
        if result:
            return {
                "count": result[0].get("total_trainings", 0),
                "hours": round(result[0].get("total_hours", 0), 2),
                "participants": result[0].get("total_participants", 0)
            }
        
        return {"count": 0, "hours": 0, "participants": 0}
    
    def _build_date_filter(self, start_date: str, end_date: str) -> List[Dict]:
        """Build date filter conditions for reporting_period"""
        filters = []
        try:
            from datetime import datetime
            start_dt = datetime.strptime(start_date, "%Y-%m")
            end_dt = datetime.strptime(end_date, "%Y-%m")
            
            current = start_dt
            while current <= end_dt:
                month_str = current.strftime("%Y-%m")
                filters.append({"reporting_period": {"$regex": f"^{month_str}", "$options": "i"}})
                if current.month == 12:
                    current = current.replace(year=current.year + 1, month=1)
                else:
                    current = current.replace(month=current.month + 1)
        except Exception:
            pass
        return filters
