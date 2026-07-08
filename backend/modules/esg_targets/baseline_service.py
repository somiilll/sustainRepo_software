"""
ESG Targets - Baseline Service

Fetches baseline/base year values from GHG module based on metric configuration.
Modular and reusable across the application.
"""

from typing import Any, Dict, List, Optional
from shared.database.mongo import db
from .baseline_config import get_metric_mapping


class BaselineService:
    """Service for fetching baseline values from GHG module."""
    
    COLLECTION = "base_year_emissions"
    
    async def get_baseline_for_metric(
        self,
        org_id: str,
        metric_key: str,
        facility_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch baseline year and value for a metric from GHG module.
        
        Args:
            org_id: Organization ID
            metric_key: The ESG metric key (e.g., 'total_emissions', 'stationary_combustion')
            facility_id: Optional facility ID for facility-level baseline
            
        Returns:
            {
                "found": bool,
                "base_year": str or None,
                "base_value": float or None,
                "scope": str or None,
                "category": str or None,
                "breakdown": list or None,  # Detailed breakdown if multiple categories
                "message": str
            }
        """
        # Get mapping config for this metric
        mapping = get_metric_mapping(metric_key)
        
        if not mapping:
            return {
                "found": False,
                "base_year": None,
                "base_value": None,
                "scope": None,
                "category": None,
                "breakdown": None,
                "message": f"No GHG mapping found for metric: {metric_key}"
            }
        
        # Build query
        query = {"organization_id": org_id}
        
        if facility_id:
            query["facility_id"] = facility_id
        else:
            # For org-level, look for records without facility_id or with null
            query["$or"] = [
                {"facility_id": None},
                {"facility_id": {"$exists": False}},
                {"facility_id": ""}
            ]
        
        # Determine scope group to query
        scope = mapping.get("scope", "scope1")
        if scope in ["scope1", "scope2"]:
            query["scope_group"] = "scope12"
        elif scope == "scope3":
            query["scope_group"] = "scope3"
        # biogenic can be in either, query both
        
        # Fetch base year records
        records = await db[self.COLLECTION].find(query, {"_id": 0}).to_list(100)
        
        if not records:
            # Try without scope_group filter for biogenic or fallback
            del query["scope_group"]
            records = await db[self.COLLECTION].find(query, {"_id": 0}).to_list(100)
        
        if not records:
            return {
                "found": False,
                "base_year": None,
                "base_value": None,
                "scope": scope,
                "category": mapping.get("category"),
                "breakdown": None,
                "message": "No base year data found for this organization/facility"
            }
        
        # Aggregate emissions data based on mapping
        result = self._aggregate_emissions(records, mapping)
        
        return result
    
    def _aggregate_emissions(
        self,
        records: List[Dict[str, Any]],
        mapping: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Aggregate emissions data from base year records based on mapping config.
        """
        target_scope = mapping.get("scope")
        target_category = mapping.get("category")
        aggregation = mapping.get("aggregation", "sum")
        
        total_value = 0.0
        breakdown = []
        base_year = None
        
        for record in records:
            if not base_year:
                base_year = record.get("base_year")
            
            emissions_data = record.get("emissions_data") or []
            
            for emission in emissions_data:
                em_scope = emission.get("scope", "")
                em_category = emission.get("category", "")
                em_value = emission.get("tco2e") or emission.get("value") or 0
                
                # Check scope match
                if target_scope and em_scope != target_scope:
                    continue
                
                # Check category match (partial match supported)
                if target_category:
                    if target_category not in em_category and em_category not in target_category:
                        # Try matching just the category code (e.g., "C6" in "C6 - Business Travel")
                        if not em_category.startswith(target_category):
                            continue
                
                # Match found - aggregate
                total_value += float(em_value)
                breakdown.append({
                    "scope": em_scope,
                    "category": em_category,
                    "subcategory": emission.get("subcategory", ""),
                    "value": float(em_value)
                })
        
        if not breakdown:
            return {
                "found": False,
                "base_year": base_year,
                "base_value": None,
                "scope": target_scope,
                "category": target_category,
                "breakdown": None,
                "message": f"No emissions data found for scope={target_scope}, category={target_category}"
            }
        
        # Apply aggregation
        if aggregation == "average" and breakdown:
            final_value = total_value / len(breakdown)
        else:
            final_value = total_value
        
        return {
            "found": True,
            "base_year": base_year,
            "base_value": round(final_value, 4),
            "scope": target_scope,
            "category": target_category,
            "breakdown": breakdown if len(breakdown) > 1 else None,
            "message": f"Found {len(breakdown)} emission record(s)"
        }
    
    async def get_available_base_years(
        self,
        org_id: str,
        facility_id: Optional[str] = None
    ) -> List[str]:
        """
        Get list of available base years for an organization/facility.
        """
        query = {"organization_id": org_id}
        
        if facility_id:
            query["facility_id"] = facility_id
        
        records = await db[self.COLLECTION].find(
            query,
            {"_id": 0, "base_year": 1}
        ).to_list(100)
        
        years = list(set(r.get("base_year") for r in records if r.get("base_year")))
        years.sort(reverse=True)
        
        return years
    
    async def check_ghg_module_access(self, org_id: str) -> Dict[str, Any]:
        """
        Check if organization has GHG module access and what scope data is available.
        """
        # Check for any base year emissions
        has_scope12 = await db[self.COLLECTION].find_one({
            "organization_id": org_id,
            "scope_group": "scope12"
        }) is not None
        
        has_scope3 = await db[self.COLLECTION].find_one({
            "organization_id": org_id,
            "scope_group": "scope3"
        }) is not None
        
        # Also check emissions collection for recent data
        has_emissions = await db.emissions.find_one({
            "organization_id": org_id
        }) is not None
        
        return {
            "has_ghg_access": has_scope12 or has_scope3 or has_emissions,
            "has_scope12": has_scope12,
            "has_scope3": has_scope3,
            "has_emissions_data": has_emissions
        }


# Singleton instance
baseline_service = BaselineService()
