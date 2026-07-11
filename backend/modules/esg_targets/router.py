"""
ESG Targets Module - Router

API endpoints for ESG target management.
Admin-only for write operations, all authenticated users can read.
"""

from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user
from .contracts import (
    ESGTargetCreate, ESGTargetUpdate, ESGTargetResponse
)
from .service import esg_targets_service
from .baseline_service import baseline_service
from .baseline_config import get_metric_mapping, get_all_mapped_metrics

router = APIRouter()


def _require_admin(current_user: dict) -> None:
    """Ensure user has admin privileges."""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required")


def _get_org_id(current_user: dict) -> str:
    """Get organization ID from current user."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


def _resolve_target_value(target: dict, period: dict) -> Optional[float]:
    """
    Resolve the effective target value for the current period.

    Static mode → top-level target_value.
    Monthly/Quarterly/Half-yearly/Yearly → lookup from tracking_values
    using a period key like "2026-07", "2026-Q2", "2026-H2", "FY 2026-2027".
    """
    tracking_mode = target.get("tracking_mode", "static")

    if tracking_mode == "static":
        tv = target.get("target_value")
        return float(tv) if tv is not None else None

    tracking_values = target.get("tracking_values") or {}
    if not tracking_values:
        return None

    year = period.get("year")
    month = period.get("month")
    quarter = period.get("quarter")

    key = None
    if tracking_mode == "monthly" and year and month:
        key = f"{year}-{month:02d}"
    elif tracking_mode == "quarterly" and year and quarter:
        key = f"{year}-Q{quarter}"
    elif tracking_mode == "half_yearly" and year and quarter:
        half = 1 if quarter <= 2 else 2
        key = f"{year}-H{half}"
    elif tracking_mode == "yearly" and year:
        # Try common yearly key formats
        for fmt in [f"FY {year}-{year+1}", f"CY {year}", str(year)]:
            if fmt in tracking_values:
                key = fmt
                break

    if key and key in tracking_values:
        try:
            return float(tracking_values[key])
        except (ValueError, TypeError):
            return None

    return None



def _calculate_progress(actual_value, target_value, goal_type, target) -> dict:
    """
    Calculate progress percentage.

    Static (exact):
        100 - ((target_value - actual) / (target_value - baseline)) × 100
    Monthly / Yearly (upper_limit / lower_limit):
        (actual / target) × 100
        over_target flag when actual > target

    Returns dict: {percentage, over_target, under_target}
    """
    result = {"percentage": None, "ratio": None, "over_target": False, "under_target": False}

    if actual_value is None or not target_value or target_value == 0:
        return result

    tracking_mode = target.get("tracking_mode", "static")

    if tracking_mode == "static":
        # Formula: 100 - ((target - actual) / (target - baseline)) × 100
        baseline = target.get("baseline") or {}
        baseline_value = baseline.get("value") if isinstance(baseline, dict) else None
        if baseline_value is not None:
            try:
                baseline_value = float(baseline_value)
            except (ValueError, TypeError):
                baseline_value = None

        if baseline_value is not None and target_value != baseline_value:
            denominator = target_value - baseline_value
            numerator = target_value - actual_value
            progress = 100 - (numerator / denominator) * 100
            result["percentage"] = max(0, min(progress, 100))
            result["ratio"] = round(progress / 100, 4)
        else:
            # No baseline fallback
            if actual_value == target_value:
                result["percentage"] = 100.0
                result["ratio"] = 1.0
            else:
                diff_pct = abs(actual_value - target_value) / target_value * 100
                result["percentage"] = max(0, 100 - diff_pct)
                result["ratio"] = round(result["percentage"] / 100, 4)
    else:
        # Monthly / Yearly: actual / target
        ratio = actual_value / target_value
        if actual_value > target_value:
            result["percentage"] = round(ratio * 100, 1)
            result["ratio"] = round(ratio, 4)
            result["over_target"] = True
        elif actual_value == target_value:
            result["percentage"] = 100.0
            result["ratio"] = 1.0
        else:
            result["percentage"] = round(ratio * 100, 1)
            result["ratio"] = round(ratio, 4)
            result["under_target"] = True

    return result


def _extract_year_from_period(period_str: str) -> Optional[int]:
    """Extract the primary year from a reporting period string like 'FY 2025-2026', 'CY 2025'."""
    if not period_str:
        return None
    import re
    match = re.search(r'(\d{4})', period_str)
    return int(match.group(1)) if match else None


def _is_target_year_passed(target: dict) -> bool:
    """Check if target's reporting year has fully passed."""
    now = datetime.now(timezone.utc)
    current_year = now.year
    current_month = now.month
    tracking_mode = target.get("tracking_mode", "static")

    if tracking_mode == "static":
        period = target.get("reporting_period") or ""
    elif tracking_mode == "yearly":
        period = target.get("end_period") or target.get("reporting_period") or ""
    else:
        # monthly — use reporting_period as the target year
        period = target.get("reporting_period") or ""

    period_lower = period.lower().strip()
    year = _extract_year_from_period(period)
    if not year:
        return False

    if period_lower.startswith("fy"):
        # FY 2025-2026 ends March 2026 — so the end year is year+1, month 3
        end_year = year + 1
        end_month = 3
    else:
        # CY 2025 ends Dec 2025
        end_year = year
        end_month = 12

    return (current_year > end_year) or (current_year == end_year and current_month > end_month)


def _is_target_in_future(target: dict) -> bool:
    """Check if target's reporting year hasn't started yet."""
    now = datetime.now(timezone.utc)
    current_year = now.year
    current_month = now.month

    period = target.get("reporting_period") or ""
    period_lower = period.lower().strip()
    year = _extract_year_from_period(period)
    if not year:
        return False

    if period_lower.startswith("fy"):
        # FY 2025-2026 starts April 2025
        start_year = year
        start_month = 4
    else:
        # CY 2025 starts Jan 2025
        start_year = year
        start_month = 1

    return (current_year < start_year) or (current_year == start_year and current_month < start_month)


def _get_period_for_target(target: dict) -> dict:
    """
    Get the period filter from the TARGET's own reporting_period (not system clock).
    For static → the target's year.
    For monthly → current month but within the target's year.
    For yearly → the target's year.
    """
    tracking_mode = target.get("tracking_mode", "static")
    period_str = target.get("reporting_period") or ""
    target_year = _extract_year_from_period(period_str)

    now = datetime.now(timezone.utc)
    current_year = now.year
    current_month = now.month

    if not target_year:
        target_year = current_year

    if tracking_mode == "static":
        return {"year": now.year}
    elif tracking_mode == "monthly":
        # Use current month but clamp to target's year
        # If target year is past, use December (last month)
        # If target year is current, use current month
        # If target year is future, use January (first month)
        if target_year < current_year:
            return {"year": target_year, "month": 12}
        elif target_year == current_year:
            return {"year": target_year, "month": current_month}
        else:
            return {"year": target_year, "month": 1}
    elif tracking_mode == "yearly":
        return {"year": target_year}
    else:
        return {"year": target_year}


# =============================================================================
# Target CRUD Endpoints
# =============================================================================

@router.get("", response_model=List[ESGTargetResponse])
async def list_targets(
    section: Optional[str] = Query(None, description="ESG section filter"),
    category: Optional[str] = Query(None, description="Category filter"),
    subcategory: Optional[str] = Query(None, description="Subcategory filter"),
    facility_id: Optional[str] = Query(None, description="Facility ID filter"),
    reporting_period: Optional[str] = Query(None, description="Reporting period filter"),
    status: Optional[str] = Query(None, description="Status filter"),
    search: Optional[str] = Query(None, description="Search in name/description"),
    current_user: dict = Depends(get_current_user)
):
    """List all ESG targets for the organization."""
    org_id = _get_org_id(current_user)
    
    targets = await esg_targets_service.list_targets(
        org_id=org_id,
        section=section,
        category=category,
        subcategory=subcategory,
        facility_id=facility_id,
        reporting_period=reporting_period,
        status=status,
        search=search
    )
    
    return targets


@router.get("/with-progress")
async def list_targets_with_progress(
    section: Optional[str] = Query(None, description="ESG section filter"),
    category: Optional[str] = Query(None, description="Category filter"),
    subcategory: Optional[str] = Query(None, description="Subcategory filter"),
    facility_id: Optional[str] = Query(None, description="Facility ID filter"),
    reporting_period: Optional[str] = Query(None, description="Reporting period filter"),
    status: Optional[str] = Query(None, description="Status filter"),
    search: Optional[str] = Query(None, description="Search in name/description"),
    current_user: dict = Depends(get_current_user)
):
    """
    List all ESG targets with calculated progress.
    
    Progress is calculated on-the-fly using the kpi_engine.
    Period is determined by tracking_mode:
    - static/yearly → current year
    - monthly → current month
    - quarterly → current quarter
    
    Returns targets with additional fields:
    - actual_value: Current calculated value from kpi_engine
    - progress_percentage: (actual_value / target_value) * 100
    - calculation_metadata: Debug info from kpi_engine
    """
    from modules.kpi_engine import kpi_calculator
    
    org_id = _get_org_id(current_user)
    
    targets = await esg_targets_service.list_targets(
        org_id=org_id,
        section=section,
        category=category,
        subcategory=subcategory,
        facility_id=facility_id,
        reporting_period=reporting_period,
        status=status,
        search=search
    )
    
    # Calculate progress for each target with a kpi_id
    results = []
    for target in targets:
        target_with_progress = dict(target)
        kpi_id = target.get("kpi_id")
        
        # Check if target year has passed → mark expired
        if _is_target_year_passed(target) and target.get("status") == "active":
            target_with_progress["status"] = "expired"
            try:
                await esg_targets_service.update_target(
                    target_id=target.get("id"), org_id=org_id,
                    data=ESGTargetUpdate(status="expired"),
                    user_id="system", user_name="system"
                )
            except Exception:
                pass

        # Expired targets — no progress
        if target_with_progress.get("status") == "expired":
            target_with_progress["actual_value"] = None
            target_with_progress["progress_percentage"] = None
            target_with_progress["progress_note"] = "Target expired"
            results.append(target_with_progress)
            continue

        if kpi_id:
            # Determine period from target's own reporting_period
            tracking_mode = target.get("tracking_mode", "static")
            period = _get_period_for_target(target)
            
            # Get facility_ids if scope is facility
            facility_ids = None
            if target.get("scope_type") == "facility" and target.get("facility_ids"):
                facility_ids = target.get("facility_ids")
            
            # Calculate actual value using kpi_engine
            try:
                calculation = await kpi_calculator.calculate(
                    kpi_id=kpi_id,
                    org_id=org_id,
                    scope_type=target.get("scope_type", "organization"),
                    facility_ids=facility_ids,
                    period=period,
                )
                
                actual_value = calculation.get("value")
                target_value = _resolve_target_value(target, period)
                goal_type = target.get("goal_type", "upper_limit")
                
                progress_result = _calculate_progress(actual_value, target_value, goal_type, target)
                progress_percentage = progress_result["percentage"]
                
                target_with_progress["actual_value"] = actual_value
                target_with_progress["progress_percentage"] = round(progress_percentage, 1) if progress_percentage is not None else None
                target_with_progress["progress_ratio"] = progress_result.get("ratio")
                target_with_progress["over_target"] = progress_result["over_target"]
                target_with_progress["under_target"] = progress_result["under_target"]
                target_with_progress["record_count"] = calculation.get("record_count", 0)
                target_with_progress["calculation_period"] = period
                
            except Exception as e:
                target_with_progress["actual_value"] = None
                target_with_progress["progress_percentage"] = None
                target_with_progress["calculation_error"] = str(e)
        else:
            # No kpi_id - legacy target without progress calculation
            target_with_progress["actual_value"] = None
            target_with_progress["progress_percentage"] = None
        
        results.append(target_with_progress)
    
    return results


@router.post("", response_model=ESGTargetResponse)
async def create_target(
    data: ESGTargetCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new ESG target. Admin only."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    try:
        target = await esg_targets_service.create_target(
            org_id=org_id,
            data=data,
            user_id=current_user.get("id"),
            user_name=current_user.get("name") or current_user.get("email")
        )
        return target
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{target_id}", response_model=ESGTargetResponse)
async def get_target(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single ESG target by ID."""
    org_id = _get_org_id(current_user)
    
    target = await esg_targets_service.get_target(target_id, org_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return target


@router.get("/{target_id}/progress")
async def get_target_progress(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get calculated progress for a single target.
    
    Returns:
    - target: The target details
    - actual_value: Current calculated value from kpi_engine
    - target_value: The goal value
    - progress_percentage: (actual_value / target_value) * 100
    - calculation_period: The period used for calculation
    - record_count: Number of records used in calculation
    """
    from modules.kpi_engine import kpi_calculator
    
    org_id = _get_org_id(current_user)
    
    target = await esg_targets_service.get_target(target_id, org_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    kpi_id = target.get("kpi_id")
    
    if not kpi_id:
        return {
            "target": target,
            "actual_value": None,
            "progress_percentage": None,
            "message": "No KPI linked to this target"
        }
    
    # Determine period from target's own reporting_period
    tracking_mode = target.get("tracking_mode", "static")
    period = _get_period_for_target(target)
    
    # Get facility_ids if scope is facility
    facility_ids = None
    if target.get("scope_type") == "facility" and target.get("facility_ids"):
        facility_ids = target.get("facility_ids")
    
    # Calculate actual value using kpi_engine
    calculation = await kpi_calculator.calculate(
        kpi_id=kpi_id,
        org_id=org_id,
        scope_type=target.get("scope_type", "organization"),
        facility_ids=facility_ids,
        period=period,
    )
    
    actual_value = calculation.get("value")
    target_value = _resolve_target_value(target, period)
    goal_type = target.get("goal_type", "upper_limit")
    
    progress_result = _calculate_progress(actual_value, target_value, goal_type, target)
    progress_percentage = progress_result["percentage"]
    
    return {
        "target": target,
        "actual_value": actual_value,
        "target_value": target_value,
        "progress_percentage": round(progress_percentage, 1) if progress_percentage is not None else None,
        "progress_ratio": progress_result.get("ratio"),
        "over_target": progress_result["over_target"],
        "under_target": progress_result["under_target"],
        "goal_type": goal_type,
        "calculation_period": period,
        "record_count": calculation.get("record_count", 0),
        "unit": target.get("unit"),
        "kpi_name": target.get("kpi_name"),
        "calculation_metadata": calculation.get("metadata", {})
    }


@router.put("/{target_id}", response_model=ESGTargetResponse)
async def update_target(
    target_id: str,
    data: ESGTargetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an ESG target. Admin only."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    target = await esg_targets_service.update_target(
        target_id=target_id,
        org_id=org_id,
        data=data,
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email")
    )
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return target


@router.delete("/{target_id}")
async def delete_target(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an ESG target. Admin only."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    deleted = await esg_targets_service.delete_target(target_id, org_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return {"message": "Target deleted successfully"}


@router.post("/{target_id}/duplicate", response_model=ESGTargetResponse)
async def duplicate_target(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Duplicate an ESG target. Admin only. Returns new target in Draft status."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    target = await esg_targets_service.duplicate_target(
        target_id=target_id,
        org_id=org_id,
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email")
    )
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return target


# =============================================================================
# Version History Endpoint
# =============================================================================

@router.get("/{target_id}/versions")
async def get_target_versions(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get version history for an ESG target."""
    org_id = _get_org_id(current_user)
    
    versions = await esg_targets_service.get_target_versions(target_id, org_id)
    
    return {
        "target_id": target_id,
        "versions": versions,
        "total": len(versions)
    }


# =============================================================================
# KPI/Metric Lookup Endpoint (for hierarchical selection)
# =============================================================================

@router.get("/lookup/categories")
async def get_categories_for_targets(
    section: str = Query(..., description="ESG section (environment, social, governance)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get categories and subcategories with their KPI definitions for target selection.
    Fetches from esg_kpi_definitions where target_enabled=true and status=active.
    Returns hierarchical structure: Category → Subcategory → KPIs
    """
    from shared.database.mongo import db
    
    _get_org_id(current_user)  # Validate user has org
    
    # Get all active, target-enabled KPIs for this section
    kpis = await db.esg_kpi_definitions.find(
        {
            "section": section,
            "status": "active",
            "visibility.target_enabled": True
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Build hierarchical structure: category → subcategory → kpis
    hierarchy = {}
    
    for kpi in kpis:
        cat_name = kpi.get("category_name", "")
        subcat_name = kpi.get("subcategory", "")
        
        if not cat_name:
            continue
            
        if cat_name not in hierarchy:
            hierarchy[cat_name] = {}
        
        if subcat_name not in hierarchy[cat_name]:
            hierarchy[cat_name][subcat_name] = []
        
        # Add KPI to the list
        hierarchy[cat_name][subcat_name].append({
            "kpi_id": kpi.get("id"),
            "metric_name": kpi.get("metric_name"),
            "metric_code": kpi.get("metric_code"),
            "baseline_mapping_key": kpi.get("baseline_mapping_key"),
            "short_name": kpi.get("short_name"),
            "unit": kpi.get("unit_config", {}).get("default_unit") if kpi.get("unit_config") else None,
            "output_type": kpi.get("output_type"),
            "aggregation_type": kpi.get("aggregation_type"),
            "description": kpi.get("description")
        })
    
    return {
        "section": section,
        "hierarchy": hierarchy
    }



# =============================================================================
# Baseline Lookup Endpoints (GHG Module Integration)
# =============================================================================

@router.get("/baseline/lookup")
async def lookup_baseline_value(
    metric_key: str = Query(..., description="ESG metric key to lookup baseline for"),
    facility_id: Optional[str] = Query(None, description="Optional facility ID for facility-level baseline"),
    current_user: dict = Depends(get_current_user)
):
    """
    Lookup baseline year and value for a metric from GHG module.
    
    Automatically maps ESG metrics to GHG scope/category and fetches the baseline.
    """
    org_id = _get_org_id(current_user)
    
    result = await baseline_service.get_baseline_for_metric(
        org_id=org_id,
        metric_key=metric_key,
        facility_id=facility_id
    )
    
    return result


@router.get("/baseline/available-years")
async def get_available_base_years(
    facility_id: Optional[str] = Query(None, description="Optional facility ID"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of available base years for the organization/facility.
    """
    org_id = _get_org_id(current_user)
    
    years = await baseline_service.get_available_base_years(
        org_id=org_id,
        facility_id=facility_id
    )
    
    return {"years": years}


@router.get("/baseline/ghg-access")
async def check_ghg_module_access(
    current_user: dict = Depends(get_current_user)
):
    """
    Check if organization has GHG module access and what data is available.
    """
    org_id = _get_org_id(current_user)
    
    access = await baseline_service.check_ghg_module_access(org_id)
    
    return access


@router.get("/baseline/mapped-metrics")
async def get_mapped_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of all ESG metrics that have GHG baseline mappings.
    """
    return {
        "metrics": get_all_mapped_metrics()
    }


@router.get("/baseline/metric-mapping/{metric_key}")
async def get_metric_ghg_mapping(
    metric_key: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the GHG mapping configuration for a specific metric.
    """
    mapping = get_metric_mapping(metric_key)
    
    if not mapping:
        return {
            "found": False,
            "metric_key": metric_key,
            "mapping": None
        }
    
    return {
        "found": True,
        "metric_key": metric_key,
        "mapping": mapping
    }
