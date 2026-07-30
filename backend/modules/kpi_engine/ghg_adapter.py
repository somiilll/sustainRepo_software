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
    mapping: Dict[str, Any],
    facility_ids: List[str],
    scope_filter: Optional[str] = None,
    use_org_id: bool = False,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a MongoDB query targeting emission_records."""
    query: Dict[str, Any] = {}
    
    # Query by facility_ids or organization_id
    if use_org_id and org_id:
        query["organization_id"] = org_id
    elif facility_ids:
        query["facility_id"] = {"$in": facility_ids}
    
    # Scope filter - handle both string and list of scopes
    target_scope = scope_filter or mapping.get("scope")
    if target_scope:
        if isinstance(target_scope, list):
            # Multiple scopes (for aggregate targets like scope1_2_total)
            query["scope"] = {"$in": target_scope}
        else:
            query["scope"] = target_scope

    # Category filter (exact prefix match to avoid C1 matching C10)
    target_category = mapping.get("category")
    if target_category:
        query["category"] = {"$regex": f"^{target_category}(\\s|$|-|:)"}

    return query


def _build_period_regex(period: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Build a reporting_period filter for emission_records.

    emission_records.reporting_period formats:
      - Monthly: "YYYY-MM"  (e.g., "2026-01")
      - Yearly:  "FY YYYY-YY" or "CY YYYY"
    """
    year = period.get("year")
    month = period.get("month")

    if not year:
        return None

    conditions = []

    if month:
        # Exact month match: "YYYY-MM"
        month_str = f"{year}-{month:02d}"
        conditions.append({"reporting_period": month_str})
    else:
        # All months in the year: "YYYY-01" through "YYYY-12"
        conditions.append({"reporting_period": {"$regex": f"^{year}-"}})
        # Also include FY/CY yearly records containing this year
        conditions.append({"reporting_period": {"$regex": f"(FY|CY).*{year}"}})

    if len(conditions) == 1:
        return conditions[0]
    return {"$or": conditions}


async def calculate_ghg_kpi(
    kpi: Dict[str, Any],
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[List[str]] = None,
    period: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Calculate a GHG KPI value from emission_records.

    Returns the same shape as kpi_engine's format_result so the caller
    doesn't need to know the data came from a different collection.
    """
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

    # Build query
    query = _build_emission_query(mapping, resolved_facility_ids or [], use_org_id=use_org_id_query, org_id=org_id)

    # Add period filter
    if period:
        period_filter = _build_period_regex(period)
        if period_filter:
            if "$or" in period_filter and "$or" not in query:
                query.update(period_filter)
            elif "$or" in period_filter:
                # Merge $or arrays
                query.setdefault("$and", [])
                query["$and"].append(period_filter)
            else:
                query.update(period_filter)

    # Execute query
    records = await db.emission_records.find(query, {"_id": 0}).to_list(100000)

    # Sum total_emissions (or co2e_emissions as fallback)
    total = 0.0
    valid_count = 0
    for rec in records:
        val = rec.get("total_emissions") or rec.get("co2e_emissions") or 0
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
            "kpi_id": kpi.get("id"),
            "kpi_name": kpi.get("metric_name"),
            "metric_code": kpi.get("metric_code"),
            "baseline_mapping_key": mapping_key,
            "ghg_scope": mapping.get("scope"),
            "ghg_category": mapping.get("category"),
            "source_collection": "emission_records",
            "valid_record_count": valid_count,
            "query": query,
        },
    )
