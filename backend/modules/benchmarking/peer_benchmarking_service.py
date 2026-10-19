"""
Peer Benchmarking Service

Reuses existing dashboard services for all ESG metric calculations.
This ensures consistency between Dashboard and Peer Benchmarking.

Services Used:
- EmissionsMetricsService: Scope 1, 2, 3 emissions
- EnergyMetricsService: Renewable energy percentage
- WaterMetricsService: Water metrics + treated water discharge
- WasteMetricsService: Waste recycled, hazardous waste
- social_detail_service: LTIFR (Lost Time Injury Frequency Rate)
- governance_detail_service: AP Days, corruption/disciplinary actions
"""

import logging
from typing import Optional, List, Dict, Any

from shared.database.mongo import db
from modules.esg_records.services.dashboard.emissions_service import EmissionsMetricsService
from modules.esg_records.services.dashboard.energy_service import EnergyMetricsService
from modules.esg_records.services.dashboard.water_service import WaterMetricsService
from modules.esg_records.services.dashboard.waste_service import WasteMetricsService
from modules.dashboards.social_detail_service import get_social_detail
from modules.dashboards.governance_detail_service import get_governance_detail

logger = logging.getLogger(__name__)


def create_metric(value, unit: str, reasoning: str = "From internal ESG records"):
    """Create a standardized metric object for peer benchmarking."""
    return {
        "rawTextFound": str(value) if value is not None else None,
        "reasoning": reasoning,
        "extractedValue": value,
        "reportedUnit": unit,
        "normalizedValue": value,
        "normalizedUnit": unit,
        "page": None
    }


class PeerBenchmarkingService:
    """
    Service that aggregates ESG metrics for Peer Benchmarking.
    Reuses existing dashboard services to ensure data consistency.
    """
    
    def __init__(self):
        self.emissions_service = EmissionsMetricsService(db)
        self.energy_service = EnergyMetricsService(db)
        self.water_service = WaterMetricsService(db)
        self.waste_service = WasteMetricsService(db)
    
    async def get_all_benchmarking_metrics(
        self,
        org_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        facility_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Get all metrics needed for peer benchmarking.
        Reuses existing dashboard service methods to ensure consistency.
        """
        
        # Get emissions from EmissionsMetricsService (same as dashboard)
        emissions = await self.emissions_service.get_metrics(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date
        )
        
        # Get energy metrics (same as dashboard)
        energy = await self.energy_service.get_metrics(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date
        )
        
        # Get water metrics (same as dashboard)
        water = await self.water_service.get_metrics(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date
        )
        
        # Get waste metrics (same as dashboard)
        waste = await self.waste_service.get_metrics(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date
        )
        
        # Get social metrics using social_detail_service (same as Social Dashboard)
        social = await get_social_detail(
            db=db,
            org_id=org_id,
            start_date=start_date or "2020-01-01",
            end_date=end_date or "2030-12-31",
            facility_ids=facility_ids
        )
        
        # Get governance metrics using governance_detail_service (same as Governance Dashboard)
        governance = await get_governance_detail(
            db=db,
            org_id=org_id,
            start_date=start_date or "2020-01-01",
            end_date=end_date or "2030-12-31",
            facility_ids=facility_ids
        )
        
        # Get turnover for intensity calculations
        turnover = await self._get_turnover(org_id, start_date, end_date)
        
        # Get treated water discharge percentage
        treated_water_pct = await self._get_treated_water_discharge_pct(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date
        )
        
        # Get hazardous waste
        hazardous_waste = await self._get_hazardous_waste(
            org_id=org_id,
            facility_ids=facility_ids,
            start_date=start_date,
            end_date=end_date
        )
        
        # Get data privacy policy status
        has_privacy_policy = await self._get_privacy_policy_status(
            org_id=org_id,
            facility_ids=facility_ids
        )
        
        # Extract values from existing services
        ghg = emissions.get("ghg_emissions", {})
        scope1 = ghg.get("total_scope1", 0)
        scope2 = ghg.get("total_scope2", 0)
        total_emissions = scope1 + scope2
        
        # Calculate emission intensity (emissions / turnover)
        emission_intensity = None
        if turnover and turnover > 0 and total_emissions > 0:
            emission_intensity = round(total_emissions / turnover, 6)
        
        # Calculate waste intensity (waste generated / turnover)
        waste_generated = waste.get("generated", 0)
        waste_intensity = None
        if turnover and turnover > 0 and waste_generated > 0:
            waste_intensity = round(waste_generated / turnover, 6)
        
        # Extract LTIFR from social metrics (same as Social Dashboard)
        social_kpis = social.get("kpis", {})
        ltifr = social_kpis.get("ltifr", None)
        
        # Extract governance metrics
        gov_kpis = governance.get("kpis", {})
        ap_days = gov_kpis.get("ap_days", None)
        corruption_cases = gov_kpis.get("corruption_cases", 0)
        
        # Build the response in the expected format
        return {
            "scope1": create_metric(
                scope1,
                "tCO2e",
                f"Sum of Scope 1 emissions from emission_records and environment_records"
            ),
            "scope2": create_metric(
                scope2,
                "tCO2e",
                f"Sum of Scope 2 emissions from emission_records and environment_records"
            ),
            "emissionIntensityPerTurnover": create_metric(
                emission_intensity,
                "tCO2e/₹ Cr",
                f"Total Scope 1+2 emissions ({total_emissions}) / Turnover ({turnover})"
            ),
            "treatedWaterDischarged": create_metric(
                treated_water_pct,
                "%",
                "Percentage of water discharged with treatment (from Water Discharge records)"
            ),
            "renewableEnergy": create_metric(
                energy.get("renewable_pct", None),
                "%",
                f"Renewable ({energy.get('renewable_total', 0)}) / Total energy ({energy.get('total', 0)}) * 100"
            ),
            "wasteRecycled": create_metric(
                waste.get("recovery_pct", None),
                "%",
                f"Recovered ({waste.get('recovered', 0)}) / Generated ({waste.get('generated', 0)}) * 100"
            ),
            "hazardousWaste": create_metric(
                hazardous_waste,
                "tonnes",
                "Total hazardous waste generated from Waste records"
            ),
            "wasteIntensity": create_metric(
                waste_intensity,
                "tonnes/₹ Cr",
                f"Total waste generated ({waste_generated}) / Turnover ({turnover})"
            ),
            "ltirEmployee": create_metric(
                ltifr,
                "per million hrs",
                f"(Lost time injuries: {social_kpis.get('loss_time_injuries', 0)}) / Total hours worked * 1,000,000"
            ),
            "ltirWorker": create_metric(
                None,  # Worker-specific LTIR not tracked separately in current social_detail_service
                "per million hrs",
                "Worker-specific LTIR not separately tracked"
            ),
            "dataPrivacyPolicy": create_metric(
                has_privacy_policy,
                None,
                "From governance privacy policy records"
            ),
            "disciplinaryAction": create_metric(
                corruption_cases,
                "count",
                "Confirmed corruption/disciplinary incidents from governance records"
            ),
            "daysAccountsPayable": create_metric(
                ap_days,
                "days",
                "Accounts Payable Days from governance records"
            )
        }
    
    async def _get_turnover(
        self,
        org_id: str,
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Optional[float]:
        """Get turnover from organization_financials collection."""
        try:
            query = {"org_id": org_id}
            
            # If date range specified, try to match reporting_year
            if start_date or end_date:
                year = None
                if start_date:
                    try:
                        year = int(start_date[:4])
                    except (ValueError, IndexError):
                        pass
                elif end_date:
                    try:
                        year = int(end_date[:4])
                    except (ValueError, IndexError):
                        pass
                
                if year:
                    query["$or"] = [
                        {"reporting_year": f"FY {year}-{str(year+1)[-2:]}"},
                        {"reporting_year": f"FY{year}-{str(year+1)[-2:]}"},
                        {"reporting_year": f"FY {year-1}-{str(year)[-2:]}"},
                        {"reporting_year": str(year)},
                        {"reporting_year": {"$regex": str(year), "$options": "i"}}
                    ]
            
            financials = await db.organization_financials.find_one(
                query,
                {"_id": 0, "turnover": 1}
            )
            
            if financials and financials.get("turnover"):
                return float(financials["turnover"])
            
            # Fallback: get most recent
            financials = await db.organization_financials.find_one(
                {"org_id": org_id},
                {"_id": 0, "turnover": 1},
                sort=[("reporting_year", -1)]
            )
            if financials and financials.get("turnover"):
                return float(financials["turnover"])
                
        except Exception as e:
            logger.warning(f"Error fetching turnover: {e}")
        
        return None
    
    async def _get_treated_water_discharge_pct(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Optional[float]:
        """
        Calculate treated water discharge percentage from Water Discharge records.
        Uses the same query filters as other dashboard services.
        """
        from modules.esg_records.services.dashboard.date_utils import build_date_filter
        
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "category": {"$regex": "^Water$", "$options": "i"},
            "subcategory": {"$regex": "^Discharge$", "$options": "i"}
        }
        if facility_ids:
            base_query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [base_query, {"$or": date_filter}]}
            else:
                query = base_query
        else:
            query = base_query
        
        records = await db.environment_records.find(
            query,
            {"_id": 0, "field_values": 1}
        ).to_list(10000)
        
        total_discharge = 0.0
        treated_discharge = 0.0
        
        for rec in records:
            fv = rec.get("field_values") or {}
            
            # Get total discharge quantity
            qty = float(fv.get("quantity") or 0)
            total_discharge += qty
            
            # Method 1: Direct treated quantity field
            treated = fv.get("quantity_discharged_with_treatment_done")
            if treated:
                try:
                    treated_discharge += float(treated)
                    continue
                except (ValueError, TypeError):
                    pass
            
            # Method 2: Sum of treatment levels (primary + secondary + tertiary)
            primary = float(fv.get("water_discharged_with_primary_level_treatment_done") or 0)
            secondary = float(fv.get("water_discharged_with_secondary_level_treatment_done") or 0)
            tertiary = float(fv.get("water_discharged_with_tertiary_level_treatment_done") or 0)
            treatment_sum = primary + secondary + tertiary
            
            if treatment_sum > 0:
                treated_discharge += treatment_sum
            else:
                # Method 3: Total minus no-treatment
                no_treatment = fv.get("water_discharged_with_no_treatment_done")
                if no_treatment is not None and no_treatment != "":
                    try:
                        untreated = float(no_treatment)
                        if qty > untreated:
                            treated_discharge += (qty - untreated)
                    except (ValueError, TypeError):
                        pass
        
        if total_discharge > 0:
            return round((treated_discharge / total_discharge) * 100, 2)
        elif treated_discharge > 0:
            return 100.0
        
        return None
    
    async def _get_hazardous_waste(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Optional[float]:
        """
        Get total hazardous waste generated.
        Uses the same query filters as WasteMetricsService.
        """
        from modules.esg_records.services.dashboard.date_utils import build_date_filter
        
        base_query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "category": {"$regex": "^Waste$", "$options": "i"},
            "subcategory": {"$regex": "^Generated$", "$options": "i"}
        }
        if facility_ids:
            base_query["facility_id"] = {"$in": facility_ids}
        
        if start_date and end_date:
            date_filter = build_date_filter(start_date, end_date)
            if date_filter:
                query = {"$and": [base_query, {"$or": date_filter}]}
            else:
                query = base_query
        else:
            query = base_query
        
        records = await db.environment_records.find(
            query,
            {"_id": 0, "field_values": 1}
        ).to_list(10000)
        
        hazardous_total = 0.0
        
        for rec in records:
            fv = rec.get("field_values") or {}
            
            # Check for specific hazardous waste field
            haz = fv.get("hazardous_waste_generated")
            if haz:
                try:
                    hazardous_total += float(haz)
                except (ValueError, TypeError):
                    pass
            else:
                # Check waste_type field
                waste_type = (fv.get("waste_type") or "").lower()
                if "hazardous" in waste_type:
                    qty = float(fv.get("quantity") or 0)
                    hazardous_total += qty
        
        return round(hazardous_total, 2) if hazardous_total > 0 else None
    
    async def _get_privacy_policy_status(
        self,
        org_id: str,
        facility_ids: Optional[List[str]]
    ) -> Optional[bool]:
        """Check if organization has a data privacy policy recorded."""
        query = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "$or": [
                {"subcategory": {"$regex": "privacy", "$options": "i"}},
                {"subcategory": {"$regex": "data protection", "$options": "i"}}
            ]
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        
        records = await db.governance_records.find(
            query,
            {"_id": 0, "field_values": 1}
        ).to_list(100)
        
        for rec in records:
            fv = rec.get("field_values") or {}
            policy = fv.get("data_privacy_policy") or fv.get("has_privacy_policy") or fv.get("policy_status")
            if policy is not None:
                if isinstance(policy, bool):
                    return policy
                elif isinstance(policy, str):
                    return policy.lower() in ["yes", "true", "1", "compliant", "implemented"]
        
        return None


# Singleton instance
_service = None

def get_peer_benchmarking_service() -> PeerBenchmarkingService:
    global _service
    if _service is None:
        _service = PeerBenchmarkingService()
    return _service


async def get_benchmarking_metrics(
    org_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    facility_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Convenience function to get all benchmarking metrics.
    """
    service = get_peer_benchmarking_service()
    return await service.get_all_benchmarking_metrics(
        org_id=org_id,
        start_date=start_date,
        end_date=end_date,
        facility_ids=facility_ids
    )
