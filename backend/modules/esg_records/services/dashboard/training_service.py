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
        
        # Get training by type breakdown
        by_type = await self._get_training_by_type(org_id, facility_ids, start_date, end_date)
        
        # Get training coverage metrics
        coverage = await self._get_training_coverage(org_id, facility_ids, start_date, end_date)
        
        if result:
            return {
                "count": result[0].get("total_trainings", 0),
                "hours": round(result[0].get("total_hours", 0), 2),
                "participants": result[0].get("total_participants", 0),
                "by_type": by_type,
                "coverage": coverage
            }
        
        return {"count": 0, "hours": 0, "participants": 0, "by_type": by_type, "coverage": coverage}
    
    async def _get_training_by_type(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, int]:
        """Get training count by type"""
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
                "_id": "$field_values.training_type",
                "count": {"$sum": 1}
            }}
        ]
        
        results = await self.db.social_records.aggregate(pipeline).to_list(100)
        return {r["_id"]: r["count"] for r in results if r["_id"]}
    
    async def _get_training_coverage(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, Any]:
        """Get training coverage metrics"""
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
                "_id": "$field_values.training_attendes_type",
                "total_attendees": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.attendees_number", 0]}}},
                "female_attendees": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.female_attendees", 0]}}},
                "male_attendees": {"$sum": {"$toDouble": {"$ifNull": ["$field_values.male_attendees", 0]}}}
            }}
        ]
        
        results = await self.db.social_records.aggregate(pipeline).to_list(100)
        
        employees = 0
        workers = 0
        total_attendees = 0
        female_total = 0
        male_total = 0
        
        for r in results:
            attendee_type = (r.get("_id") or "").lower()
            total_attendees += r.get("total_attendees", 0)
            female_total += r.get("female_attendees", 0)
            male_total += r.get("male_attendees", 0)
            if "employee" in attendee_type:
                employees += r.get("total_attendees", 0)
            elif "worker" in attendee_type:
                workers += r.get("total_attendees", 0)
        
        # Calculate female as total - male if female_attendees not provided
        if female_total == 0 and male_total > 0 and total_attendees > male_total:
            female_total = total_attendees - male_total
        
        female_pct = (female_total / total_attendees * 100) if total_attendees > 0 else 0
        
        return {
            "employees_trained": int(employees),
            "workers_trained": int(workers),
            "female_pct": round(female_pct, 1),
            "total_attendees": int(total_attendees)
        }
    
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
