"""
Governance Metrics Service - Safety incidents, data breaches, fatalities, regulatory escalations
"""
from typing import Optional, List, Dict, Any


class GovernanceMetricsService:
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated governance metrics"""
        
        # Safety Incidents (from governance_records where type includes safety-related)
        safety_incidents = await self._count_by_type(
            org_id, facility_ids, start_date, end_date,
            type_pattern="injury|safety|accident"
        )
        
        # Data Breaches (Malware & Cyber Attacks or data breach type)
        data_breaches = await self._count_by_subcategory(
            org_id, facility_ids, start_date, end_date,
            subcategory_pattern="malware|cyber|data breach|security"
        )
        
        # Fatalities
        fatalities = await self._count_by_type(
            org_id, facility_ids, start_date, end_date,
            type_pattern="fatality|death|fatal"
        )
        
        # Regulatory Escalations
        regulatory = await self._count_by_type(
            org_id, facility_ids, start_date, end_date,
            type_pattern="regulatory|compliance|legal|violation"
        )
        
        return {
            "safety_incidents": safety_incidents,
            "data_breaches": data_breaches,
            "fatalities": fatalities,
            "regulatory_escalations": regulatory
        }
    
    async def _count_by_type(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str],
        type_pattern: str
    ) -> int:
        """Count records by field_values.type pattern"""
        query = {
            "org_id": org_id,
            "field_values.type": {"$regex": type_pattern, "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        return await self.db.governance_records.count_documents(query)
    
    async def _count_by_subcategory(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str],
        subcategory_pattern: str
    ) -> int:
        """Count records by subcategory pattern"""
        query = {
            "org_id": org_id,
            "subcategory": {"$regex": subcategory_pattern, "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        return await self.db.governance_records.count_documents(query)
    
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
