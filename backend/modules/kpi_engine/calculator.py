"""
KPI Engine - Main Calculator

The main calculation engine that orchestrates KPI calculations.
Fetches KPI definitions, builds queries, and returns results.

Usage:
    from modules.kpi_engine import KPICalculator
    
    calculator = KPICalculator()
    
    # Calculate a single KPI
    result = await calculator.calculate(
        kpi_id="xxx-xxx",
        org_id="yyy-yyy",
        period={"year": 2026, "month": 6}
    )
    
    # Calculate with facility scope
    result = await calculator.calculate(
        kpi_id="xxx-xxx",
        org_id="yyy-yyy",
        scope_type="facility",
        facility_ids=["fac-1", "fac-2"],
        period={"year": 2026}
    )
    
    # Calculate by metric_code instead of kpi_id
    result = await calculator.calculate_by_code(
        metric_code="ENV_WATER_CONSUMPTION",
        org_id="yyy-yyy",
        period={"year": 2026}
    )
"""

from typing import Any, Dict, List, Optional
from shared.database.mongo import db
from .utils import (
    get_collection_for_section,
    build_period_filter,
    build_scope_filter,
    format_result,
)
from .filters import FilterBuilder
from .aggregators import Aggregator
from .ghg_adapter import is_ghg_kpi, calculate_ghg_kpi
from .energy_adapter import is_energy_kpi, calculate_total_energy


class KPICalculator:
    """
    Main KPI calculation engine.
    
    This engine:
    1. Fetches KPI definition from esg_kpi_definitions
    2. Determines the appropriate collection based on section
    3. Builds MongoDB query with category, filters, scope, and period
    4. Executes aggregation and returns formatted result
    """
    
    def __init__(self):
        """Initialize the KPI calculator."""
        self._kpi_cache: Dict[str, Dict[str, Any]] = {}
    
    async def get_kpi_definition(self, kpi_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch KPI definition by ID, with caching.
        
        Args:
            kpi_id: The KPI definition ID
            
        Returns:
            KPI definition document or None
        """
        if kpi_id in self._kpi_cache:
            return self._kpi_cache[kpi_id]
        
        kpi = await db.esg_kpi_definitions.find_one(
            {"id": kpi_id},
            {"_id": 0}
        )
        
        if kpi:
            self._kpi_cache[kpi_id] = kpi
        
        return kpi
    
    async def get_kpi_by_code(self, metric_code: str) -> Optional[Dict[str, Any]]:
        """
        Fetch KPI definition by metric_code.
        
        Args:
            metric_code: The unique metric code
            
        Returns:
            KPI definition document or None
        """
        kpi = await db.esg_kpi_definitions.find_one(
            {"metric_code": metric_code},
            {"_id": 0}
        )
        
        if kpi:
            self._kpi_cache[kpi["id"]] = kpi
        
        return kpi
    
    def clear_cache(self):
        """Clear the KPI definition cache."""
        self._kpi_cache.clear()
    
    async def calculate(
        self,
        kpi_id: str,
        org_id: str,
        scope_type: str = "organization",
        facility_ids: Optional[List[str]] = None,
        period: Optional[Dict[str, Any]] = None,
        additional_filters: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Calculate a KPI value.
        
        Args:
            kpi_id: The KPI definition ID
            org_id: Organization ID
            scope_type: "organization" or "facility"
            facility_ids: List of facility IDs (for facility scope)
            period: Period filter dict with year, month, quarter, etc.
            additional_filters: Extra filters to apply (runtime filters)
            
        Returns:
            Calculation result with value, unit, record_count, metadata
        """
        # Check if this is a synthetic GHG target KPI (ghg_scope1_total, ghg_scope1_2_total, etc.)
        ghg_target_mapping = {
            "ghg_scope1_total": "scope1_total",
            "ghg_scope2_total": "scope2_total",
            "ghg_scope3_total": "scope3_total",
            "ghg_total_all": "total_all_scopes",
            "ghg_scope1_2_total": "scope1_2_total",
        }
        
        if kpi_id in ghg_target_mapping:
            mapping_key = ghg_target_mapping[kpi_id]
            return await calculate_ghg_kpi(
                mapping_key=mapping_key,
                org_id=org_id,
                scope_type=scope_type,
                facility_ids=facility_ids,
                period=period,
            )
        
        # Check if this is a synthetic Energy target KPI
        if is_energy_kpi(kpi_id):
            return await calculate_total_energy(
                org_id=org_id,
                scope_type=scope_type,
                facility_ids=facility_ids,
                period=period,
            )
        
        # Fetch KPI definition
        kpi = await self.get_kpi_definition(kpi_id)
        
        if not kpi:
            return format_result(
                value=None,
                record_count=0,
                metadata={"error": f"KPI definition not found: {kpi_id}"}
            )
        
        return await self._execute_calculation(
            kpi=kpi,
            org_id=org_id,
            scope_type=scope_type,
            facility_ids=facility_ids,
            period=period,
            additional_filters=additional_filters,
        )
    
    async def calculate_by_code(
        self,
        metric_code: str,
        org_id: str,
        scope_type: str = "organization",
        facility_ids: Optional[List[str]] = None,
        period: Optional[Dict[str, Any]] = None,
        additional_filters: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Calculate a KPI value by metric_code.
        
        Args:
            metric_code: The unique metric code (e.g., ENV_WATER_CONSUMPTION)
            org_id: Organization ID
            scope_type: "organization" or "facility"
            facility_ids: List of facility IDs (for facility scope)
            period: Period filter dict
            additional_filters: Extra filters to apply
            
        Returns:
            Calculation result
        """
        kpi = await self.get_kpi_by_code(metric_code)
        
        if not kpi:
            return format_result(
                value=None,
                record_count=0,
                metadata={"error": f"KPI not found for code: {metric_code}"}
            )
        
        return await self._execute_calculation(
            kpi=kpi,
            org_id=org_id,
            scope_type=scope_type,
            facility_ids=facility_ids,
            period=period,
            additional_filters=additional_filters,
        )
    
    async def calculate_batch(
        self,
        kpi_ids: List[str],
        org_id: str,
        scope_type: str = "organization",
        facility_ids: Optional[List[str]] = None,
        period: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Calculate multiple KPIs in batch.
        
        Args:
            kpi_ids: List of KPI definition IDs
            org_id: Organization ID
            scope_type: Scope type
            facility_ids: Facility IDs
            period: Period filter
            
        Returns:
            Dict mapping kpi_id to calculation result
        """
        results = {}
        
        for kpi_id in kpi_ids:
            results[kpi_id] = await self.calculate(
                kpi_id=kpi_id,
                org_id=org_id,
                scope_type=scope_type,
                facility_ids=facility_ids,
                period=period,
            )
        
        return results
    
    async def _execute_calculation(
        self,
        kpi: Dict[str, Any],
        org_id: str,
        scope_type: str,
        facility_ids: Optional[List[str]],
        period: Optional[Dict[str, Any]],
        additional_filters: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """
        Execute the actual calculation for a KPI.
        
        Routes GHG-linked KPIs to the ghg_adapter (queries emission_records)
        and all others to the standard ESG records path.
        """
        # Route GHG KPIs to the dedicated adapter
        if is_ghg_kpi(kpi):
            return await calculate_ghg_kpi(
                kpi=kpi,
                org_id=org_id,
                scope_type=scope_type,
                facility_ids=facility_ids,
                period=period,
            )
        
        # Standard ESG records path
        section = kpi.get("section", "environment")
        try:
            collection_name = get_collection_for_section(section)
        except ValueError as e:
            return format_result(
                value=None,
                record_count=0,
                metadata={"error": str(e)}
            )
        
        collection = db[collection_name]
        
        # Build the query
        query = self._build_query(
            kpi=kpi,
            org_id=org_id,
            scope_type=scope_type,
            facility_ids=facility_ids,
            period=period,
            additional_filters=additional_filters,
        )
        
        # Fetch matching records
        records = await collection.find(query, {"_id": 0}).to_list(10000)
        
        # Get aggregation settings from KPI
        aggregation_type = kpi.get("aggregation_type", "sum")
        value_field = kpi.get("value_field", "")
        
        # If value_field is empty, use COUNT
        if not value_field:
            aggregation_type = "count"
        
        # Perform aggregation
        agg_result = Aggregator.aggregate(
            records=records,
            aggregation_type=aggregation_type,
            value_field=value_field if value_field else None,
        )
        
        # Get unit from KPI definition
        unit = None
        unit_config = kpi.get("unit_config")
        if unit_config:
            unit = unit_config.get("default_unit")
        
        # Format and return result
        return format_result(
            value=agg_result.get("value"),
            unit=unit,
            record_count=agg_result.get("record_count", 0),
            aggregation_type=aggregation_type,
            metadata={
                "kpi_id": kpi.get("id"),
                "kpi_name": kpi.get("metric_name"),
                "metric_code": kpi.get("metric_code"),
                "section": section,
                "category": kpi.get("category_name"),
                "subcategory": kpi.get("subcategory"),
                "value_field": value_field,
                "valid_record_count": agg_result.get("valid_record_count"),
                "query": query,  # Include query for debugging
            }
        )
    
    def _build_query(
        self,
        kpi: Dict[str, Any],
        org_id: str,
        scope_type: str,
        facility_ids: Optional[List[str]],
        period: Optional[Dict[str, Any]],
        additional_filters: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """
        Build the MongoDB query for fetching records.
        
        Args:
            kpi: KPI definition
            org_id: Organization ID
            scope_type: Scope type
            facility_ids: Facility IDs
            period: Period filter
            additional_filters: Additional filters
            
        Returns:
            MongoDB query dict
        """
        # Start with scope filter (org_id, facility_id, is_current)
        query = build_scope_filter(
            org_id=org_id,
            scope_type=scope_type,
            facility_ids=facility_ids,
        )
        
        # Add category filter
        category_filter = FilterBuilder.build_category_filter(
            category=kpi.get("category_name"),
            subcategory=kpi.get("subcategory"),
            sub_subcategory=kpi.get("sub_subcategory"),
        )
        query.update(category_filter)
        
        # Add KPI filters (from filter definitions)
        kpi_filters = kpi.get("filters", [])
        if kpi_filters:
            filter_query = FilterBuilder.build_filters(kpi_filters)
            query.update(filter_query)
        
        # Add period filter
        if period:
            period_filter = build_period_filter(**period)
            query.update(period_filter)
        
        # Add additional runtime filters
        if additional_filters:
            additional_query = FilterBuilder.build_filters(additional_filters)
            query.update(additional_query)
        
        return query
    
    async def calculate_with_dimensions(
        self,
        kpi_id: str,
        org_id: str,
        dimension: str,
        scope_type: str = "organization",
        facility_ids: Optional[List[str]] = None,
        period: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Calculate KPI grouped by a dimension.
        Useful for dashboard charts.
        
        Args:
            kpi_id: KPI definition ID
            org_id: Organization ID
            dimension: Field to group by (e.g., "facility", "month")
            scope_type: Scope type
            facility_ids: Facility IDs
            period: Period filter
            
        Returns:
            Dict mapping dimension values to calculation results
        """
        kpi = await self.get_kpi_definition(kpi_id)
        
        if not kpi:
            return {"_error": {"error": f"KPI not found: {kpi_id}"}}
        
        # Get collection
        section = kpi.get("section", "environment")
        try:
            collection_name = get_collection_for_section(section)
        except ValueError as e:
            return {"_error": {"error": str(e)}}
        
        collection = db[collection_name]
        
        # Build query (without dimension grouping)
        query = self._build_query(
            kpi=kpi,
            org_id=org_id,
            scope_type=scope_type,
            facility_ids=facility_ids,
            period=period,
            additional_filters=None,
        )
        
        # Fetch records
        records = await collection.find(query, {"_id": 0}).to_list(10000)
        
        # Get aggregation settings
        aggregation_type = kpi.get("aggregation_type", "sum")
        value_field = kpi.get("value_field", "")
        
        if not value_field:
            aggregation_type = "count"
        
        # Group and aggregate
        grouped_results = Aggregator.group_by(
            records=records,
            group_field=dimension,
            aggregation_type=aggregation_type,
            value_field=value_field if value_field else None,
        )
        
        return grouped_results


# Singleton instance for easy import
kpi_calculator = KPICalculator()
