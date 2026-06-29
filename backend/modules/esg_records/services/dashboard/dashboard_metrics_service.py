"""
Dashboard Metrics Service - Aggregates ESG data for dashboard KPIs
"""
from typing import Optional, List, Dict, Any
from .water_service import WaterMetricsService
from .waste_service import WasteMetricsService
from .energy_service import EnergyMetricsService
from .emissions_service import EmissionsMetricsService


class DashboardMetricsService:
    """Main service to aggregate all dashboard metrics"""
    
    def __init__(self, db):
        self.db = db
        self.water_service = WaterMetricsService(db)
        self.waste_service = WasteMetricsService(db)
        self.energy_service = EnergyMetricsService(db)
        self.emissions_service = EmissionsMetricsService(db)
    
    async def get_dashboard_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Aggregate all dashboard metrics from environment_records and GHG data.
        """
        # Get metrics from each service
        water = await self.water_service.get_metrics(org_id, facility_ids)
        waste = await self.waste_service.get_metrics(org_id, facility_ids)
        energy = await self.energy_service.get_metrics(org_id, facility_ids, financial_year)
        emissions = await self.emissions_service.get_metrics(org_id, facility_ids, financial_year)
        
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
            
            # Totals for KPI cards (for backward compatibility)
            "total_emissions": emissions["total"],
            "ghg_emissions": emissions["ghg_emissions"],
            "esg_emissions": emissions["esg_emissions"],
            "total_energy": energy["total"],
            "ghg_energy": energy["ghg_energy"],
            "esg_energy": energy["esg_energy"],
            "water_consumption": water["consumption"],
            "water_withdrawn": water["withdrawal"],
            "water_discharged": water["discharge"],
            "waste_generated": waste["generated"],
            "waste_recovered": waste["recovered"],
            "waste_disposed": waste["disposal"],
            
            # Placeholders for other metrics
            "safety_incidents": 0,
            "training_hours": 0,
            "complaints": 0,
            "data_breaches": 0,
            "renewable_pct": energy.get("renewable_pct", 0),
            "waste_recovery_pct": waste.get("recovery_pct", 0),
            "water_recycling_pct": water.get("recycling_pct", 0),
            "audit_readiness_score": min(100, (counts["total"] / 50) * 100),
        }
    
    async def _get_record_counts(self, org_id: str, facility_ids: Optional[List[str]]) -> Dict[str, int]:
        """Get record counts by section"""
        query = {"organization_id": org_id}
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        env_count = await self.db.environment_records.count_documents(query)
        social_count = await self.db.environment_records.count_documents({**query, "section": "social"})
        gov_count = await self.db.environment_records.count_documents({**query, "section": "governance"})
        
        return {
            "environment": env_count,
            "social": social_count,
            "governance": gov_count,
            "total": env_count + social_count + gov_count
        }


def get_dashboard_metrics_service(db) -> DashboardMetricsService:
    return DashboardMetricsService(db)
