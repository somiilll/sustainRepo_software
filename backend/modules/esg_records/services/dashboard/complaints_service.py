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
        # Query for General Complaints subcategory
        general = await self._get_subcategory_count(
            org_id, facility_ids, start_date, end_date,
            subcategory="General Complaints"
        )
        
        # Query for Complaints on Principles subcategory
        principles = await self._get_subcategory_count(
            org_id, facility_ids, start_date, end_date,
            subcategory="Complaints on Principles"
        )
        
        # Query for Consumer Complaints subcategory
        consumer = await self._get_subcategory_count(
            org_id, facility_ids, start_date, end_date,
            subcategory="Consumer Complaints"
        )
        
        # Query for POSH cases (field: was_the_complaint_reported_under_the_posh_act_2013)
        posh = await self._get_posh_count(org_id, facility_ids, start_date, end_date)
        
        # Get by_type breakdown for stacked bars
        by_type = {
            "General": general,
            "Principal": principles,
            "Consumer": consumer
        }
        
        # Get by_topic breakdown for treemap
        by_topic = await self._get_complaints_by_topic(org_id, facility_ids, start_date, end_date)
        
        # Get compliance stats
        compliance = await self._get_compliance_stats(org_id, facility_ids, start_date, end_date)
        
        return {
            "general": general + principles,
            "posh": posh,
            "consumer": consumer,
            "total": general + principles + consumer,
            "by_type": by_type,
            "by_topic": by_topic,
            "compliance": compliance
        }
    
    async def _get_complaints_by_topic(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, int]:
        """Get complaints grouped by topic/type"""
        query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "subcategory": {"$in": ["General Complaints", "Complaints on Principles", "Consumer Complaints"]}
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
                "_id": "$field_values.complaints_type",
                "count": {"$sum": 1}
            }}
        ]
        
        results = await self.db.social_records.aggregate(pipeline).to_list(100)
        return {r["_id"]: r["count"] for r in results if r["_id"]}
    
    async def _get_compliance_stats(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, Any]:
        """Get compliance and escalation stats"""
        query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "subcategory": {"$in": ["General Complaints", "Complaints on Principles", "Consumer Complaints"]}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        # Law enforcement involved
        law_query = {**query, "field_values.law_enforcement_agency_involved": {"$in": [True, "Yes", "yes", "true"]}}
        law_enforcement = await self.db.social_records.count_documents(law_query)
        
        # POSH cases
        posh_query = {"org_id": org_id, "is_current": {"$ne": False}, "status": {"$ne": "draft"}, "field_values.was_the_complaint_reported_under_the_posh_act_2013": {"$in": [True, "Yes", "yes", "true"]}}
        if facility_ids:
            posh_query["facility_id"] = {"$in": facility_ids}
        posh_cases = await self.db.social_records.count_documents(posh_query)
        
        # Open vs Closed (check for resolution_status field: Done/Pending)
        closed_query = {**query, "field_values.resolution_status": {"$in": ["Done", "done", "DONE"]}}
        open_query = {**query, "field_values.resolution_status": {"$in": ["Pending", "pending", "PENDING"]}}
        closed_count = await self.db.social_records.count_documents(closed_query)
        open_count = await self.db.social_records.count_documents(open_query)
        
        # Total complaints for calculating untracked
        total = await self.db.social_records.count_documents(query)
        untracked = total - open_count - closed_count
        
        return {
            "law_enforcement": law_enforcement,
            "posh_cases": posh_cases,
            "repeat_complaints": 0,  # Would need complaint_raised_by grouping
            "open": open_count,
            "closed": closed_count,
            "untracked": untracked,
            "total": total
        }
    
    async def _get_subcategory_count(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str],
        subcategory: str
    ) -> int:
        """Get count of records matching subcategory"""
        query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        return await self.db.social_records.count_documents(query)
    
    async def _get_posh_count(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> int:
        """Get count of POSH complaints"""
        query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "field_values.was_the_complaint_reported_under_the_posh_act_2013": {"$in": [True, "Yes", "yes", "true"]}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        return await self.db.social_records.count_documents(query)
    
    


    

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
                        "reporting_period.month": {"$in": [months[month_idx - 1], str(month_idx)]}
                    })
            return conditions
        except:
            return []
