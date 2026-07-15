"""
Dashboard Metrics Service - Aggregates ESG data for dashboard KPIs
"""
from typing import Optional, List, Dict, Any
from .water_service import WaterMetricsService
from .waste_service import WasteMetricsService
from .energy_service import EnergyMetricsService
from .emissions_service import EmissionsMetricsService
from .training_service import TrainingMetricsService
from .complaints_service import ComplaintsMetricsService
from .governance_service import GovernanceMetricsService


class DashboardMetricsService:
    """Main service to aggregate all dashboard metrics"""
    
    def __init__(self, db):
        self.db = db
        self.water_service = WaterMetricsService(db)
        self.waste_service = WasteMetricsService(db)
        self.energy_service = EnergyMetricsService(db)
        self.emissions_service = EmissionsMetricsService(db)
        self.training_service = TrainingMetricsService(db)
        self.complaints_service = ComplaintsMetricsService(db)
        self.governance_service = GovernanceMetricsService(db)
    
    async def get_dashboard_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Aggregate all dashboard metrics from environment_records and GHG data.
        """
        # Get metrics from each service
        water = await self.water_service.get_metrics(org_id, facility_ids, start_date, end_date)
        waste = await self.waste_service.get_metrics(org_id, facility_ids, start_date, end_date)
        energy = await self.energy_service.get_metrics(org_id, facility_ids, financial_year, start_date, end_date)
        emissions = await self.emissions_service.get_metrics(org_id, facility_ids, financial_year, start_date, end_date)
        training = await self.training_service.get_metrics(org_id, facility_ids, start_date, end_date)
        complaints = await self.complaints_service.get_metrics(org_id, facility_ids, start_date, end_date)
        
        # Get record counts
        counts = await self._get_record_counts(org_id, facility_ids)
        
        return {
            # Record counts
            "environment_records": counts["environment"],
            "social_records": counts["social"],
            "governance_records": counts["governance"],
            "total_records": counts["total"],
            
            # Nested metrics
            "water": water,
            "waste": waste,
            "energy": energy,
            "emissions": emissions,
            
            # Social metrics
            "training": training,
            "complaints": complaints,
            
            # Governance metrics (flattened)
            **await self.governance_service.get_metrics(org_id, facility_ids, start_date, end_date),
            
            # Legacy fields (kept for backward compatibility)
            "training_hours": training.get("hours", 0),
            "audit_readiness_score": min(100, (counts["total"] / 50) * 100),
        }
    
    async def _get_record_counts(self, org_id: str, facility_ids: Optional[List[str]]) -> Dict[str, int]:
        """Get record counts by section"""
        query = {"org_id": org_id, "is_current": {"$ne": False}, "status": {"$ne": "draft"}}
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        env_count = await self.db.environment_records.count_documents(query)
        social_count = await self.db.social_records.count_documents(query)
        gov_count = await self.db.governance_records.count_documents({"org_id": org_id, "is_current": {"$ne": False}, "status": {"$ne": "draft"}})
        
        return {
            "environment": env_count,
            "social": social_count,
            "governance": gov_count,
            "total": env_count + social_count + gov_count
        }
    
    async def _get_safety_incidents(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, int]:
        """Get safety incidents count by type from governance_records"""
        query = {"org_id": org_id, "is_current": {"$ne": False}, "status": {"$ne": "draft"}, "category": {"$regex": "^Safety Incidents$", "$options": "i"}}
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        records = await self.db.governance_records.find(query, {"_id": 0, "field_values.type": 1}).to_list(10000)
        
        result = {"injury": 0, "fatality": 0, "ill_health": 0, "others": 0, "total": 0}
        for r in records:
            incident_type = (r.get("field_values", {}).get("type") or "").lower().replace("-", "_")
            if "injury" in incident_type:
                result["injury"] += 1
            elif "fatality" in incident_type:
                result["fatality"] += 1
            elif "ill" in incident_type:
                result["ill_health"] += 1
            else:
                result["others"] += 1
            result["total"] += 1
        
        return result


def get_dashboard_metrics_service(db) -> DashboardMetricsService:
    return DashboardMetricsService(db)
