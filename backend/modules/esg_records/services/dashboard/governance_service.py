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
        
        # Safety Incidents (category = "Safety Incidents")
        safety_query = await self._build_category_query(org_id, facility_ids, start_date, end_date, "Safety Incidents")
        safety_incidents = await self.db.governance_records.count_documents(safety_query)
        
        # Data Breaches (category = "Data Breach")
        breach_query = await self._build_category_query(org_id, facility_ids, start_date, end_date, "Data Breach")
        data_breaches = await self.db.governance_records.count_documents(breach_query)
        
        # Fatalities (derived from Safety Incidents where type matches fatality/fatal/death)
        fatality_query = {**safety_query, "field_values.type": {"$regex": "fatality|fatal|death", "$options": "i"}}
        fatalities = await self.db.governance_records.count_documents(fatality_query)
        
        # Regulatory Escalations (derived from Safety Incidents where type matches regulatory/compliance/legal/violation)
        regulatory_query = {**safety_query, "field_values.type": {"$regex": "regulatory|compliance|legal|violation", "$options": "i"}}
        regulatory = await self.db.governance_records.count_documents(regulatory_query)
        
        return {
            "safety_incidents": safety_incidents,
            "data_breaches": data_breaches,
            "fatalities": fatalities,
            "regulatory_escalations": regulatory,
            "incident_analytics": await self._get_incident_analytics(org_id, facility_ids, start_date, end_date),
            "breach_analytics": await self._get_breach_analytics(org_id, facility_ids, start_date, end_date)
        }
    
    async def _build_category_query(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str],
        category: str
    ) -> Dict:
        """Build query for a specific category with date filter"""
        query = {
            "org_id": org_id,
            "category": category
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [query, {"$or": date_filter}]}
        
        return query
    
    async def _get_breach_analytics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, Any]:
        """Get data breach analytics"""
        # Query by category = "Data Breach"
        query = await self._build_category_query(org_id, facility_ids, start_date, end_date, "Data Breach")
        
        # Breach type distribution
        type_pipeline = [
            {"$match": query},
            {"$group": {"_id": "$field_values.type", "count": {"$sum": 1}}}
        ]
        type_results = await self.db.governance_records.aggregate(type_pipeline).to_list(100)
        by_type = {r["_id"]: r["count"] for r in type_results if r["_id"]}
        
        # Risk metrics
        total_breaches = await self.db.governance_records.count_documents(query)
        
        personal_query = {**query, "field_values.personal_data_of_costumers_involved": {"$in": ["yes", "Yes", "YES", True]}}
        personal_affected = await self.db.governance_records.count_documents(personal_query)
        
        sensitive_query = {**query, "field_values.sensitive_data_involved": {"$in": ["yes", "Yes", "YES", True]}}
        sensitive_affected = await self.db.governance_records.count_documents(sensitive_query)
        
        # Resolution metrics
        open_query = {**query, "field_values.resolution_status": {"$in": ["Pending", "pending", "Open", "open"]}}
        closed_query = {**query, "field_values.resolution_status": {"$in": ["Done", "done", "Resolved", "resolved", "Closed"]}}
        open_breaches = await self.db.governance_records.count_documents(open_query)
        closed_breaches = await self.db.governance_records.count_documents(closed_query)
        
        escalated_query = {**query, "field_values.escalated": {"$in": ["yes", "Yes", "YES", True]}}
        escalated = await self.db.governance_records.count_documents(escalated_query)
        
        regulatory_query = {**query, "field_values.regulatory_reporting_done": {"$in": ["yes", "Yes", "YES", True]}}
        regulatory_reported = await self.db.governance_records.count_documents(regulatory_query)
        
        return {
            "by_type": by_type,
            "total": total_breaches,
            "risk": {
                "personal_affected": personal_affected,
                "sensitive_affected": sensitive_affected,
                "records_impacted": 0  # Would need specific field
            },
            "resolution": {
                "open": open_breaches,
                "closed": closed_breaches,
                "escalated": escalated,
                "regulatory_reported": regulatory_reported
            }
        }
    
    async def _get_incident_analytics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, Any]:
        """Get detailed incident analytics for dashboard"""
        # Query by category = "Safety Incidents"
        query = await self._build_category_query(org_id, facility_ids, start_date, end_date, "Safety Incidents")
        
        # Incident type distribution (dynamic, no hardcoding)
        type_pipeline = [
            {"$match": query},
            {"$group": {"_id": "$field_values.type", "count": {"$sum": 1}}}
        ]
        type_results = await self.db.governance_records.aggregate(type_pipeline).to_list(100)
        by_type = {(r["_id"] or "Others"): r["count"] for r in type_results}
        
        # Who was affected distribution
        affected_pipeline = [
            {"$match": query},
            {"$group": {"_id": "$field_values.who_was_affected", "count": {"$sum": 1}}}
        ]
        affected_results = await self.db.governance_records.aggregate(affected_pipeline).to_list(100)
        by_affected = {r["_id"]: r["count"] for r in affected_results if r["_id"]}
        
        # Rehabilitation stats
        total_incidents = await self.db.governance_records.count_documents(query)
        
        rehab_yes_query = {**query, "field_values.rehabilitation_done": {"$in": ["yes", "Yes", "YES", True]}}
        rehab_no_query = {**query, "field_values.rehabilitation_done": {"$in": ["no", "No", "NO", False]}}
        
        rehab_done = await self.db.governance_records.count_documents(rehab_yes_query)
        rehab_pending = await self.db.governance_records.count_documents(rehab_no_query)
        
        rehab_pct = (rehab_done / total_incidents * 100) if total_incidents > 0 else 0
        
        return {
            "by_type": by_type,
            "by_affected": by_affected,
            "rehabilitation": {
                "done": rehab_done,
                "pending": rehab_pending,
                "total": total_incidents,
                "done_pct": round(rehab_pct, 1)
            }
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
        """Build date filter conditions for reporting_period (supports monthly and yearly/FY formats)"""
        try:
            start_year, start_month = int(start_date[:4]), int(start_date[5:7])
            end_year, end_month = int(end_date[:4]), int(end_date[5:7])
            
            months = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"]
            
            conditions = []
            
            # Monthly conditions
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
            
            # Financial year conditions (e.g., "FY 2025-26")
            # If date range is Apr 2025 - Mar 2026, it's FY 2025-26
            for year in range(start_year - 1, end_year + 1):
                fy_str = f"FY {year}-{str(year + 1)[-2:]}"
                conditions.append({"reporting_period.financial_year": fy_str})
            
            return conditions
        except:
            return []
