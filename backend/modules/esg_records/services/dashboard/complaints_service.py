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
            collection="environment_records",
            section="social",
            category_pattern="complaint"
        )
        
        # Query for POSH cases
        posh = await self._get_category_count(
            org_id, facility_ids, start_date, end_date,
            collection="environment_records",
            section="social", 
            category_pattern="posh|sexual harassment"
        )
        
        # Query for consumer complaints in governance
        consumer = await self._get_category_count(
            org_id, facility_ids, start_date, end_date,
            collection="governance_records",
            section=None,
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
        section: Optional[str],
        category_pattern: str
    ) -> int:
        """Get count of records matching category pattern"""
        query = {
            "org_id": org_id,
            "category": {"$regex": category_pattern, "$options": "i"}
        }
        if section:
            query["section"] = section
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
