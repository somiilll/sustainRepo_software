"""
Unified ESG Metrics Service

Centralized service for fetching and calculating ESG metrics used across:
- Dashboard
- Targets
- Internal Data AI
- Peer Benchmarking

Uses reporting_period for date filtering and reuses existing calculation logic.
"""

import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from shared.database.mongo import db

logger = logging.getLogger(__name__)


def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse date string to datetime object."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d")
        except:
            return None


def build_date_filter(start_date: Optional[str], end_date: Optional[str]) -> Dict:
    """
    Build MongoDB date filter based on reporting_period.
    Supports various reporting_period formats:
    - Dict: {"year": 2025, "month": 7} or {"financial_year": "FY 2025-26"}
    - String: "2025-07" or "FY 2025-26"
    """
    if not start_date and not end_date:
        return {}
    
    conditions = []
    
    # For string-based reporting periods (e.g., "2025-07")
    if start_date:
        conditions.append({
            "$or": [
                {"reporting_period": {"$gte": start_date}},
                {"reporting_period.year": {"$gte": int(start_date[:4]) if len(start_date) >= 4 else 2020}}
            ]
        })
    
    if end_date:
        conditions.append({
            "$or": [
                {"reporting_period": {"$lte": end_date}},
                {"reporting_period.year": {"$lte": int(end_date[:4]) if len(end_date) >= 4 else 2030}}
            ]
        })
    
    if len(conditions) == 1:
        return conditions[0]
    elif len(conditions) > 1:
        return {"$and": conditions}
    return {}


class ESGMetricsService:
    """Unified service for fetching and calculating ESG metrics."""
    
    def __init__(self, org_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, facility_ids: Optional[List[str]] = None):
        self.org_id = org_id
        self.start_date = start_date
        self.end_date = end_date
        self.facility_ids = facility_ids
        self.date_filter = build_date_filter(start_date, end_date)
    
    def _build_query(self, collection_type: str = "emission") -> Dict:
        """Build base query with org_id, date filter, and optional facility filter."""
        if collection_type == "emission":
            query = {"organization_id": self.org_id}
        else:
            query = {"org_id": self.org_id}
        
        if self.date_filter:
            query.update(self.date_filter)
        
        if self.facility_ids:
            query["facility_id"] = {"$in": self.facility_ids}
        
        return query

    # ==================== EMISSIONS ====================
    
    async def get_emissions_summary(self) -> Dict[str, Any]:
        """
        Get Scope 1, Scope 2, Scope 3 emissions totals.
        Returns: {scope1, scope2, scope3, total_emissions}
        """
        query = self._build_query("emission")
        
        records = await db.emission_records.find(
            query,
            {"_id": 0, "scope": 1, "co2e_emissions": 1, "total_emissions": 1}
        ).to_list(5000)
        
        scope1_total = 0
        scope2_total = 0
        scope3_total = 0
        
        for record in records:
            scope = str(record.get("scope", "")).lower()
            emissions_val = record.get("co2e_emissions") or record.get("total_emissions") or 0
            
            if scope in ["scope1", "scope 1"] or (scope.startswith("scope") and "1" in scope):
                scope1_total += emissions_val
            elif scope in ["scope2", "scope 2"] or (scope.startswith("scope") and "2" in scope):
                scope2_total += emissions_val
            elif scope in ["scope3", "scope 3"] or (scope.startswith("scope") and "3" in scope):
                scope3_total += emissions_val
        
        return {
            "scope1": round(scope1_total, 2),
            "scope2": round(scope2_total, 2),
            "scope3": round(scope3_total, 2),
            "total_emissions": round(scope1_total + scope2_total + scope3_total, 2)
        }

    async def get_emission_intensity(self) -> Dict[str, Any]:
        """
        Calculate emission intensity = total emissions / turnover.
        Fetches turnover from governance_records (financial data).
        """
        emissions = await self.get_emissions_summary()
        total_emissions = emissions.get("scope1", 0) + emissions.get("scope2", 0)
        
        # Get turnover from governance records
        turnover = await self._get_turnover()
        
        if turnover and turnover > 0:
            intensity = total_emissions / turnover
            return {
                "value": round(intensity, 6),
                "unit": "tCO2e/₹ Cr",
                "total_emissions": total_emissions,
                "turnover": turnover
            }
        
        return {
            "value": None,
            "unit": "tCO2e/₹ Cr",
            "total_emissions": total_emissions,
            "turnover": None
        }

    async def _get_turnover(self) -> Optional[float]:
        """
        Get turnover/revenue from organization_financials collection.
        This is where org yearly data (turnover) is stored.
        """
        # First try organization_financials (primary source)
        try:
            # Build query for financials
            query = {"org_id": self.org_id}
            
            # If date range specified, try to match reporting_year
            if self.start_date or self.end_date:
                # Try to extract year from date range for matching
                year = None
                if self.start_date:
                    try:
                        year = int(self.start_date[:4])
                    except:
                        pass
                elif self.end_date:
                    try:
                        year = int(self.end_date[:4])
                    except:
                        pass
                
                if year:
                    # Try various reporting year formats
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
                try:
                    return float(financials["turnover"])
                except:
                    pass
            
            # If no date filter, get the most recent one
            if not self.start_date and not self.end_date:
                financials = await db.organization_financials.find_one(
                    {"org_id": self.org_id},
                    {"_id": 0, "turnover": 1},
                    sort=[("reporting_year", -1)]
                )
                if financials and financials.get("turnover"):
                    try:
                        return float(financials["turnover"])
                    except:
                        pass
        except Exception as e:
            logger.warning(f"Error fetching turnover from organization_financials: {e}")
        
        # Fallback: try governance_records (legacy)
        try:
            query = self._build_query("governance")
            query["$or"] = [
                {"subcategory": {"$regex": "turnover|revenue|financial", "$options": "i"}},
                {"category": {"$regex": "financial", "$options": "i"}}
            ]
            
            records = await db.governance_records.find(query, {"_id": 0, "field_values": 1}).to_list(100)
            
            for rec in records:
                fv = rec.get("field_values") or {}
                for key in ["turnover", "revenue", "total_turnover", "total_revenue", "net_turnover"]:
                    if key in fv and fv[key]:
                        try:
                            return float(fv[key])
                        except:
                            pass
        except Exception as e:
            logger.warning(f"Error fetching turnover from governance_records: {e}")
        
        return None

    # ==================== WATER ====================
    
    async def get_water_metrics(self) -> Dict[str, Any]:
        """
        Get water metrics including treated water discharged percentage.
        Uses: quantity_discharged_with_treatment_done from Water Discharge records.
        Or calculates from sum of primary + secondary + tertiary treatment levels.
        """
        query = self._build_query("environment")
        query["category"] = "Water"
        
        records = await db.environment_records.find(query, {"_id": 0, "subcategory": 1, "field_values": 1}).to_list(500)
        
        total_consumption = 0
        total_withdrawal = 0
        total_discharge = 0
        treated_discharge = 0
        total_recycled = 0
        
        for rec in records:
            sub = (rec.get("subcategory") or "").lower()
            fv = rec.get("field_values") or {}
            
            if "consumption" in sub:
                total_consumption += float(fv.get("quantity") or 0)
            
            elif "withdrawal" in sub:
                total_withdrawal += float(fv.get("quantity") or fv.get("total_water_withdrawal") or 0)
            
            elif "discharge" in sub:
                qty = float(fv.get("quantity") or 0)
                total_discharge += qty
                
                # Try specific field first
                treated = fv.get("quantity_discharged_with_treatment_done")
                if treated:
                    try:
                        treated_discharge += float(treated)
                    except:
                        pass
                else:
                    # Calculate from treatment levels (primary + secondary + tertiary)
                    primary = float(fv.get("water_discharged_with_primary_level_treatment_done") or 0)
                    secondary = float(fv.get("water_discharged_with_secondary_level_treatment_done") or 0)
                    tertiary = float(fv.get("water_discharged_with_tertiary_level_treatment_done") or 0)
                    treatment_sum = primary + secondary + tertiary
                    
                    if treatment_sum > 0:
                        treated_discharge += treatment_sum
                    else:
                        # If no treatment breakdown, check if no_treatment field exists
                        # If no_treatment is less than total, difference is treated
                        no_treatment = fv.get("water_discharged_with_no_treatment_done")
                        if no_treatment is not None and no_treatment != "":
                            try:
                                untreated = float(no_treatment)
                                if qty > untreated:
                                    treated_discharge += (qty - untreated)
                            except:
                                pass
            
            elif "recycle" in sub:
                total_recycled += float(fv.get("total_quantity_of_water_recycled") or fv.get("quantity") or 0)
        
        # Calculate treated water discharged percentage
        treated_discharge_pct = None
        if total_discharge > 0:
            treated_discharge_pct = round((treated_discharge / total_discharge) * 100, 2)
        elif treated_discharge > 0:
            treated_discharge_pct = 100.0  # All discharge is treated
        
        return {
            "total_consumption": round(total_consumption, 2),
            "total_withdrawal": round(total_withdrawal, 2),
            "total_discharge": round(total_discharge, 2),
            "treated_discharge": round(treated_discharge, 2),
            "treated_discharge_pct": treated_discharge_pct,
            "total_recycled": round(total_recycled, 2)
        }

    # ==================== WASTE ====================
    
    async def get_waste_metrics(self) -> Dict[str, Any]:
        """
        Get waste metrics including waste recycled and hazardous waste.
        Uses: quantity from "Recovered / Diverted from disposal" records.
        """
        query = self._build_query("environment")
        query["category"] = "Waste"
        
        records = await db.environment_records.find(query, {"_id": 0, "subcategory": 1, "field_values": 1}).to_list(500)
        
        total_generated = 0
        hazardous_generated = 0
        non_hazardous_generated = 0
        total_recovered = 0
        total_disposed = 0
        
        for rec in records:
            sub = rec.get("subcategory") or ""
            fv = rec.get("field_values") or {}
            
            if sub == "Generated":
                qty = float(fv.get("quantity") or 0)
                total_generated += qty
                hazardous_generated += float(fv.get("hazardous_waste_generated") or 0)
                non_hazardous_generated += float(fv.get("non_hazardous_waste_generated") or 0)
            
            elif sub == "Recovered / Diverted from disposal":
                # Use 'quantity' field as specified
                total_recovered += float(fv.get("quantity") or 0)
            
            elif sub == "Disposal":
                total_disposed += float(fv.get("quantity") or 0)
        
        # Calculate waste recycled percentage
        waste_recycled_pct = None
        if total_generated > 0:
            waste_recycled_pct = round((total_recovered / total_generated) * 100, 2)
        
        return {
            "total_generated": round(total_generated, 2),
            "hazardous_waste": round(hazardous_generated, 2),
            "non_hazardous_waste": round(non_hazardous_generated, 2),
            "total_recovered": round(total_recovered, 2),
            "total_disposed": round(total_disposed, 2),
            "waste_recycled_pct": waste_recycled_pct
        }

    async def get_waste_intensity(self) -> Dict[str, Any]:
        """Calculate waste intensity = total waste generated / turnover."""
        waste = await self.get_waste_metrics()
        total_waste = waste.get("total_generated", 0)
        
        turnover = await self._get_turnover()
        
        if turnover and turnover > 0 and total_waste > 0:
            intensity = total_waste / turnover
            return {
                "value": round(intensity, 6),
                "unit": "tonnes/₹ Cr",
                "total_waste": total_waste,
                "turnover": turnover
            }
        
        return {
            "value": None,
            "unit": "tonnes/₹ Cr",
            "total_waste": total_waste,
            "turnover": turnover
        }

    # ==================== SOCIAL ====================
    
    async def get_safety_metrics(self) -> Dict[str, Any]:
        """
        Get LTIR (Lost Time Injury Frequency Rate) for employees and workers.
        Formula: (no_of_loss_time_injuries / total_hours_worked) * 1,000,000
        """
        query = self._build_query("social")
        query["category"] = "Health & Safety"
        
        records = await db.social_records.find(query, {"_id": 0, "subcategory": 1, "field_values": 1}).to_list(500)
        
        employee_injuries = 0
        employee_hours = 0
        worker_injuries = 0
        worker_hours = 0
        total_incidents = 0
        
        for rec in records:
            sub = (rec.get("subcategory") or "").lower()
            fv = rec.get("field_values") or {}
            
            if "incident" in sub or "safety" in sub:
                who = str(fv.get("who_was_effected") or "").lower()
                injuries = float(fv.get("no_of_loss_time_injuries") or 0)
                hours = float(fv.get("total_hours_worked") or 0)
                incidents = int(fv.get("total_no_of_incidents") or 0)
                
                total_incidents += incidents
                
                if "employee" in who:
                    employee_injuries += injuries
                    employee_hours += hours
                elif "worker" in who or "contract" in who:
                    worker_injuries += injuries
                    worker_hours += hours
                else:
                    # Default split if not specified
                    employee_injuries += injuries
                    employee_hours += hours
        
        # Calculate LTIFR
        ltir_employee = None
        ltir_worker = None
        
        if employee_hours > 0:
            ltir_employee = round((employee_injuries / employee_hours) * 1_000_000, 2)
        
        if worker_hours > 0:
            ltir_worker = round((worker_injuries / worker_hours) * 1_000_000, 2)
        
        return {
            "ltir_employee": ltir_employee,
            "ltir_worker": ltir_worker,
            "employee_injuries": employee_injuries,
            "employee_hours_worked": employee_hours,
            "worker_injuries": worker_injuries,
            "worker_hours_worked": worker_hours,
            "total_incidents": total_incidents
        }

    # ==================== GOVERNANCE ====================
    
    async def get_governance_metrics(self) -> Dict[str, Any]:
        """
        Get governance metrics including:
        - Days Accounts Payable: (accounts_payable * 365) / cost_of_goods_services_procured
        - Data Privacy Policy: boolean
        - Disciplinary Actions: count
        """
        query = self._build_query("governance")
        
        records = await db.governance_records.find(query, {"_id": 0, "subcategory": 1, "field_values": 1}).to_list(500)
        
        accounts_payable = 0
        cogs = 0
        has_privacy_policy = None
        disciplinary_actions = 0
        
        for rec in records:
            sub = (rec.get("subcategory") or "").lower()
            fv = rec.get("field_values") or {}
            
            # Accounts Payable
            if "payable" in sub or "accounts" in sub or "financial" in sub:
                ap = fv.get("accounts_payable")
                if ap:
                    try:
                        accounts_payable = float(ap)
                    except:
                        pass
                
                cogs_val = fv.get("cost_of_goods_services_procured") or fv.get("cogs")
                if cogs_val:
                    try:
                        cogs = float(cogs_val)
                    except:
                        pass
            
            # Data Privacy Policy
            if "privacy" in sub or "data protection" in sub:
                policy = fv.get("data_privacy_policy") or fv.get("has_privacy_policy")
                if policy is not None:
                    if isinstance(policy, bool):
                        has_privacy_policy = policy
                    elif isinstance(policy, str):
                        has_privacy_policy = policy.lower() in ["yes", "true", "1", "compliant"]
            
            # Disciplinary Actions
            if "disciplinary" in sub or "bribery" in sub or "corruption" in sub:
                actions = fv.get("disciplinary_actions") or fv.get("no_of_disciplinary_actions") or fv.get("no_of_confirmed_corruption_incidents")
                if actions:
                    try:
                        disciplinary_actions += int(actions)
                    except:
                        pass
        
        # Calculate Days Accounts Payable
        days_accounts_payable = None
        if accounts_payable > 0 and cogs > 0:
            days_accounts_payable = round((accounts_payable * 365) / cogs, 1)
        
        return {
            "days_accounts_payable": days_accounts_payable,
            "accounts_payable": accounts_payable,
            "cogs": cogs,
            "has_privacy_policy": has_privacy_policy,
            "disciplinary_actions": disciplinary_actions
        }

    # ==================== RENEWABLE ENERGY ====================
    
    async def get_energy_metrics(self) -> Dict[str, Any]:
        """Get energy metrics including renewable energy percentage."""
        query = self._build_query("environment")
        query["category"] = "Energy"
        
        records = await db.environment_records.find(query, {"_id": 0, "subcategory": 1, "field_values": 1}).to_list(500)
        
        total_energy = 0
        renewable_energy = 0
        
        for rec in records:
            sub = (rec.get("subcategory") or "").lower()
            fv = rec.get("field_values") or {}
            
            qty = float(fv.get("quantity") or fv.get("energy_consumed") or 0)
            
            if "renewable" in sub:
                renewable_energy += qty
                total_energy += qty
            elif "non-renewable" in sub or "nonrenewable" in sub:
                total_energy += qty
            else:
                # General energy consumption
                total_energy += qty
        
        renewable_pct = None
        if total_energy > 0:
            renewable_pct = round((renewable_energy / total_energy) * 100, 2)
        
        return {
            "total_energy": round(total_energy, 2),
            "renewable_energy": round(renewable_energy, 2),
            "renewable_pct": renewable_pct
        }

    # ==================== ALL METRICS (FOR PEER BENCHMARKING) ====================
    
    async def get_all_benchmarking_metrics(self) -> Dict[str, Any]:
        """
        Get all metrics needed for peer benchmarking in a single call.
        Returns normalized format matching the benchmarking schema.
        """
        # Fetch all metrics in parallel would be ideal, but for clarity doing sequentially
        emissions = await self.get_emissions_summary()
        emission_intensity = await self.get_emission_intensity()
        water = await self.get_water_metrics()
        waste = await self.get_waste_metrics()
        waste_intensity = await self.get_waste_intensity()
        safety = await self.get_safety_metrics()
        governance = await self.get_governance_metrics()
        energy = await self.get_energy_metrics()
        
        def create_metric(value, unit, reasoning="From internal ESG records"):
            return {
                "rawTextFound": str(value) if value is not None else None,
                "reasoning": reasoning,
                "extractedValue": value,
                "reportedUnit": unit,
                "normalizedValue": value,
                "normalizedUnit": unit,
                "page": None
            }
        
        return {
            "scope1": create_metric(emissions.get("scope1"), "tCO2e", "Sum of Scope 1 emission records"),
            "scope2": create_metric(emissions.get("scope2"), "tCO2e", "Sum of Scope 2 emission records"),
            "emissionIntensityPerTurnover": create_metric(
                emission_intensity.get("value"), 
                "tCO2e/₹ Cr",
                f"Total emissions ({emission_intensity.get('total_emissions')}) / Turnover ({emission_intensity.get('turnover')})"
            ),
            "treatedWaterDischarged": create_metric(
                water.get("treated_discharge_pct"),
                "%",
                f"Treated discharge ({water.get('treated_discharge')}) / Total discharge ({water.get('total_discharge')}) * 100"
            ),
            "renewableEnergy": create_metric(
                energy.get("renewable_pct"),
                "%",
                f"Renewable ({energy.get('renewable_energy')}) / Total energy ({energy.get('total_energy')}) * 100"
            ),
            "wasteRecycled": create_metric(
                waste.get("waste_recycled_pct"),
                "%",
                f"Recovered ({waste.get('total_recovered')}) / Generated ({waste.get('total_generated')}) * 100"
            ),
            "hazardousWaste": create_metric(
                waste.get("hazardous_waste"),
                "tonnes",
                "From Waste Generated records"
            ),
            "wasteIntensity": create_metric(
                waste_intensity.get("value"),
                "tonnes/₹ Cr",
                f"Total waste ({waste_intensity.get('total_waste')}) / Turnover ({waste_intensity.get('turnover')})"
            ),
            "ltirEmployee": create_metric(
                safety.get("ltir_employee"),
                "per million hrs",
                f"(Injuries: {safety.get('employee_injuries')} / Hours: {safety.get('employee_hours_worked')}) * 1,000,000"
            ),
            "ltirWorker": create_metric(
                safety.get("ltir_worker"),
                "per million hrs",
                f"(Injuries: {safety.get('worker_injuries')} / Hours: {safety.get('worker_hours_worked')}) * 1,000,000"
            ),
            "dataPrivacyPolicy": create_metric(
                governance.get("has_privacy_policy"),
                None,
                "From governance privacy policy records"
            ),
            "disciplinaryAction": create_metric(
                governance.get("disciplinary_actions"),
                "count",
                "From governance disciplinary/corruption records"
            ),
            "daysAccountsPayable": create_metric(
                governance.get("days_accounts_payable"),
                "days",
                f"(AP: {governance.get('accounts_payable')} * 365) / COGS: {governance.get('cogs')}"
            )
        }


async def get_benchmarking_metrics(
    org_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    facility_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Convenience function to get all benchmarking metrics.
    """
    service = ESGMetricsService(org_id, start_date, end_date, facility_ids)
    return await service.get_all_benchmarking_metrics()
