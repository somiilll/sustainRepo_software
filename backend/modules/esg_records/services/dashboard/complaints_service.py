"""
Complaints Metrics Service - Fetches complaint-related data from social/governance records
Categories: Complaints, POSH, Consumer Complaints
"""
from typing import Optional, List, Dict, Any


class ComplaintsMetricsService:
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated complaints metrics"""
        # Query for general complaints in social records
        general = await self._get_category_count(
            org_id, facility_ids, start_date, end_date,
            collection="social_records",
            category_pattern="complaint"
        )
        
        # Query for POSH cases
        posh = await self._get_category_count(
            org_id, facility_ids, start_date, end_date,
            collection="social_records",
            category_pattern="posh|sexual harassment"
        )
        
        # Query for consumer complaints in governance
        consumer = await self._get_category_count(
            org_id, facility_ids, start_date, end_date,
            collection="governance_records",
            category_pattern="consumer|customer complaint"
        )
        
        return {
            "general": general,
            "posh": posh,
            "consumer": consumer,
            "total": general + posh + consumer
        }
    
    async def _get_category_count(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str],
        collection: str,
        category_pattern: str
    ) -> int:
        """Get count of records matching category pattern"""
        query = {
            "org_id": org_id,
            "category": {"$regex": category_pattern, "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        coll = self.db[collection]
        return await coll.count_documents(query)
    
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
