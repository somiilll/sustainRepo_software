"""
KPI Engine - GHG Module Adapter

Bridges the KPI Engine to the GHG Module's emission_records collection.
Reuses baseline_config mappings for scope/category resolution.

This adapter is invoked when a KPI has a `baseline_mapping_key`, indicating
its data source is the GHG module (emission_records) rather than ESG
questionnaire records (environment_records).
"""

from typing import Any, Dict, List, Optional
from shared.database.mongo import db
from modules.esg_targets.baseline_config import get_metric_mapping
from shared.utils.emission_records import (
    canonicalize_emission_record,
    eligible_ghg_record_filter,
    reporting_period_variants,
)
from .utils import format_result


def is_ghg_kpi(kpi: Dict[str, Any]) -> bool:
    """Check if a KPI should be calculated from GHG emission_records."""
    return bool(kpi.get("baseline_mapping_key"))


async def _get_org_facility_ids(org_id: str) -> List[str]:
    """Get all facility IDs for an organization."""
    facilities = await db.facilities.find(
        {"organization_id": org_id},
        {"_id": 0, "id": 1}
    ).to_list(1000)
    return [f["id"] for f in facilities]


def _build_emission_query(
    facility_ids: List[str],
    use_org_id: bool = False,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build the canonical lifecycle and organizational query for GHG records."""
    query: Dict[str, Any] = eligible_ghg_record_filter()
    
    # Query by facility_ids or organization_id
    if use_org_id and org_id:
        query["organization_id"] = org_id
    elif facility_ids:
        query["facility_id"] = {"$in": facility_ids}
    
    return query


def _reporting_period_values(period: Dict[str, Any]) -> Optional[List[str]]:
    """Return exact monthly and annual period values for a target calculation."""
    year = period.get("year")
    month = period.get("month")

    if not year:
        return None

    if month:
        return [f"{year}-{month:02d}"]

    reporting_year_type = period.get("reporting_year_type", "CY")
    if reporting_year_type == "FY":
        monthly_periods = [f"{year}-{month:02d}" for month in range(4, 13)]
        monthly_periods += [f"{year + 1}-{month:02d}" for month in range(1, 4)]
        annual_period = f"FY {year}-{year + 1}"
    else:
        monthly_periods = [f"{year}-{month:02d}" for month in range(1, 13)]
        annual_period = f"CY {year}"

    return monthly_periods + reporting_period_variants(annual_period)


def _matches_mapping(record: Dict[str, Any], mapping: Dict[str, Any]) -> bool:
    """Match canonical scope plus an exact category code boundary in memory."""
    target_scope = mapping.get("scope")
    allowed_scopes = set(target_scope if isinstance(target_scope, list) else [target_scope])
    if target_scope and record.get("scope") not in allowed_scopes:
        return False

    target_category = mapping.get("category")
    if not target_category:
        return True
    category = record.get("category")
    if not isinstance(category, str):
        return False
    return category == target_category or category.startswith(f"{target_category} ") or category.startswith(f"{target_category}-") or category.startswith(f"{target_category}:")


async def calculate_ghg_kpi(
    kpi: Optional[Dict[str, Any]] = None,
    org_id: str = "",
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
    mapping_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calculate a GHG KPI value from emission_records.

    Returns the same shape as kpi_engine's format_result so the caller
    doesn't need to know the data came from a different collection.
    
    Can be called two ways:
    1. With a kpi dict containing baseline_mapping_key (standard KPI path)
    2. With a direct mapping_key string (synthetic GHG target KPIs)
    """
    # Resolve mapping_key from either direct param or kpi dict
    if mapping_key is None and kpi:
        mapping_key = kpi.get("baseline_mapping_key")
    
    mapping = get_metric_mapping(mapping_key)

    if not mapping:
        return format_result(
            value=None,
            unit="tCO2e",
            record_count=0,
            metadata={"error": f"No GHG mapping for key: {mapping_key}"},
        )

    # Resolve facility IDs: GHG data is stored per-facility,
    # so for org-scope we fetch ALL org facilities and sum across them.
    # If no facilities found, fallback to querying by organization_id directly.
    resolved_facility_ids = None
    use_org_id_query = False
    
    if scope_type == "facility" and facility_ids:
        resolved_facility_ids = facility_ids
    else:
        resolved_facility_ids = await _get_org_facility_ids(org_id)
        if not resolved_facility_ids:
            # Fallback: query by organization_id instead of facility_id
            use_org_id_query = True

    # Query with the same lifecycle rules as the GHG dashboard. Scope and
    # category are matched after canonical normalization so legacy labels are
    # treated consistently instead of being lost through exact raw matching.
    query = _build_emission_query(resolved_facility_ids or [], use_org_id=use_org_id_query, org_id=org_id)

    # Add period filter
    if period:
        period_values = _reporting_period_values(period)
        if period_values:
            query["reporting_period"] = {"$in": period_values}

    # Execute query
    raw_records = await db.emission_records.find(query, {"_id": 0}).to_list(100000)
    records = [
        normalized
        for raw_record in raw_records
        if (normalized := canonicalize_emission_record(raw_record)) is not None
        and _matches_mapping(normalized, mapping)
    ]

    # Sum total_emissions (or co2e_emissions as fallback)
    total = 0.0
    valid_count = 0
    for rec in records:
        val = rec.get("total_emissions")
        if val is None:
            val = rec.get("co2e_emissions") or 0
        try:
            total += float(val)
            valid_count += 1
        except (ValueError, TypeError):
            pass

    return format_result(
        value=round(total, 4) if valid_count > 0 else None,
        unit="tCO2e",
        record_count=len(records),
        aggregation_type="sum",
        metadata={
            "kpi_id": kpi.get("id") if kpi else f"synthetic_{mapping_key}",
            "kpi_name": kpi.get("metric_name") if kpi else mapping.get("description", mapping_key),
            "metric_code": kpi.get("metric_code") if kpi else mapping_key,
            "baseline_mapping_key": mapping_key,
            "ghg_scope": mapping.get("scope"),
            "ghg_category": mapping.get("category"),
            "source_collection": "emission_records",
            "valid_record_count": valid_count,
            "query": query,
        },
    )
