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
                "total_hours": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.training_hours", 0]}}},
                "total_participants": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.attendees_number", 0]}}}
            }}
        ]
        
        result = await self.db.social_records.aggregate(pipeline).to_list(1)
        print("result", print)
        
        if result:
            return {
                "count": result[0].get("total_trainings", 0),
                "hours": round(result[0].get("total_hours", 0), 2),
                "participants": result[0].get("total_participants", 0)
            }
        
        return {"count": 0, "hours": 0, "participants": 0}
    
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
