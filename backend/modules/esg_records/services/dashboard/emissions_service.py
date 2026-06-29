"""
Emissions Metrics Service - Fetches emissions data from environment_records + GHG
Structure:
  ghg_emissions: { emission_records: {scope1,2,3}, esg_records: {scope1,2,3}, totals }
  air_emissions: { NOx, SOx, PM, VOC, HAP, Other, total }
"""
from typing import Optional, List, Dict, Any


class EmissionsMetricsService:
    CATEGORY = "Emissions"
    AIR_POLLUTANTS = ["NOx", "SOx", "PM", "VOC", "HAP", "Other"]
    
    def __init__(self, db):
        self.db = db
    
    async def get_metrics(
        self,
        org_id: str,
        facility_ids: Optional[List[str]] = None,
        financial_year: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get aggregated emissions with scope breakdown"""
        
        # GHG Emissions
        ghg_emission_records = await self._get_ghg_emission_records_by_scope(org_id, facility_ids, financial_year)
        ghg_esg_records = await self._get_esg_ghg_by_scope(org_id, facility_ids, start_date, end_date)
        
        ghg_total_scope1 = ghg_emission_records["scope1"] + ghg_esg_records["scope1"]
        ghg_total_scope2 = ghg_emission_records["scope2"] + ghg_esg_records["scope2"]
        ghg_total_scope3 = ghg_emission_records["scope3"] + ghg_esg_records["scope3"]
        ghg_total = ghg_total_scope1 + ghg_total_scope2 + ghg_total_scope3
        
        # Air Emissions (ESG only)
        air_emissions = await self._get_air_emissions(org_id, facility_ids, start_date, end_date)
        
        return {
            "ghg_emissions": {
                "emission_records": {
                    "scope1": round(ghg_emission_records["scope1"], 2),
                    "scope2": round(ghg_emission_records["scope2"], 2),
                    "scope3": round(ghg_emission_records["scope3"], 2),
                    "total": round(ghg_emission_records["total"], 2),
                },
                "esg_records": {
                    "scope1": round(ghg_esg_records["scope1"], 2),
                    "scope2": round(ghg_esg_records["scope2"], 2),
                    "scope3": round(ghg_esg_records["scope3"], 2),
                    "total": round(ghg_esg_records["total"], 2),
                },
                "total_scope1": round(ghg_total_scope1, 2),
                "total_scope2": round(ghg_total_scope2, 2),
                "total_scope3": round(ghg_total_scope3, 2),
                "total": round(ghg_total, 2),
            },
            "air_emissions": air_emissions,
            "total": round(ghg_total + air_emissions["total"], 2),
        }
    
    async def _get_ghg_emission_records_by_scope(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        financial_year: Optional[str]
    ) -> Dict[str, float]:
        """Get GHG emissions from emission_records with scope breakdown"""
        from ...ghg_integration import get_ghg_integration_service
        
        ghg_service = get_ghg_integration_service(self.db)
        
        try:
            records = await ghg_service.get_ghg_emissions_as_records(
                org_id=org_id,
                facility_ids=facility_ids,
                financial_year=financial_year
            )
            
            scope1, scope2, scope3 = 0.0, 0.0, 0.0
            for rec in records:
                fv = rec.get("field_values", {})
                emission = float(fv.get("total_emission", 0))
                scope = fv.get("scope", "").lower()
                
                if "scope 1" in scope or "scope1" in scope:
                    scope1 += emission
                elif "scope 2" in scope or "scope2" in scope:
                    scope2 += emission
                elif "scope 3" in scope or "scope3" in scope:
                    scope3 += emission
            
            return {"scope1": scope1, "scope2": scope2, "scope3": scope3, "total": scope1 + scope2 + scope3}
        except Exception as e:
            print(f"Error fetching GHG emissions: {e}")
            return {"scope1": 0, "scope2": 0, "scope3": 0, "total": 0}
    
    async def _get_esg_ghg_by_scope(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, float]:
        """Get GHG emissions from ESG records with scope breakdown"""
        query = {
            "organization_id": org_id,
            "category": {"$regex": "^Emissions$", "$options": "i"},
            "subcategory": {"$regex": "^GHG Emissions$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query["$or"] = date_filter
        
        records = await self.db.environment_records.find(query, {"_id": 0, "field_values": 1}).to_list(10000)
        
        scope1, scope2, scope3 = 0.0, 0.0, 0.0
        for rec in records:
            fv = rec.get("field_values", {})
            qty = float(fv.get("quantity") or 0)
            scope = (fv.get("scope") or "").lower()
            
            if "scope 1" in scope or "scope1" in scope or "1" == scope:
                scope1 += qty
            elif "scope 2" in scope or "scope2" in scope or "2" == scope:
                scope2 += qty
            elif "scope 3" in scope or "scope3" in scope or "3" == scope:
                scope3 += qty
        
        return {"scope1": scope1, "scope2": scope2, "scope3": scope3, "total": scope1 + scope2 + scope3}
    
    async def _get_air_emissions(
        self,
        org_id: str,
        facility_ids: Optional[List[str]],
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> Dict[str, float]:
        """Get air emissions from ESG records by pollutant type"""
        query = {
            "organization_id": org_id,
            "category": {"$regex": "^Emissions$", "$options": "i"},
            "subcategory": {"$regex": "^Air Emissions$", "$options": "i"}
        }
        if facility_ids:
            query["facility_id"] = {"$in": facility_ids}
        if start_date and end_date:
            date_filter = self._build_date_filter(start_date, end_date)
            if date_filter:
                query["$or"] = date_filter
        
        records = await self.db.environment_records.find(query, {"_id": 0, "field_values": 1}).to_list(10000)
        
        result = {p: 0.0 for p in self.AIR_POLLUTANTS}
        result["total"] = 0.0
        
        for rec in records:
            fv = rec.get("field_values", {})
            qty = float(fv.get("quantity") or 0)
            pollutant = (fv.get("pollutant_type") or fv.get("type") or "Other").strip()
            
            # Match to known pollutants
            matched = False
            for p in self.AIR_POLLUTANTS:
                if p.lower() in pollutant.lower():
                    result[p] += qty
                    matched = True
                    break
            if not matched:
                result["Other"] += qty
            
            result["total"] += qty
        
        # Round all values
        return {k: round(v, 2) for k, v in result.items()}
    
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
