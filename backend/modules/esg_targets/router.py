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
from shared.database.mongo import db as app_db
from shared.utils.period_utils import (
    format_period, extract_year, detect_type, period_variants, normalize_period
)
from shared.utils.emission_records import eligible_ghg_record_filter

router = APIRouter()


async def _get_org_reporting_type(org_id: str) -> str:
    """Get org reporting type: 'FY' or 'CY'."""
    org = await app_db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
    if org and org.get("reporting_year_type") == "calendar_year":
        return "CY"
    return "FY"


async def _get_denominator_for_intensity(
    target: dict,
    org_id: str,
    period: dict,
) -> dict:
    """
    Fetch production or revenue denominator for intensity targets.
    Returns {"value": float|None, "unit": str, "error": str|None}
    """
    target_type = target.get("target_type", "")
    scope_type = target.get("scope_type", "organization")
    facility_ids = target.get("facility_ids") or []
    year = period.get("year")
    month = period.get("month")
    rep_type = target.get("_reporting_type", "FY")

    if target_type == "intensity_revenue":
        if not year:
            return {"value": None, "unit": "", "error": "Revenue data not found. Add in Organization Details."}
        
        keys_to_try = period_variants(year, rep_type)
        fin = None
        for fy_key in keys_to_try:
            fin = await app_db.organization_financials.find_one(
                {"org_id": org_id, "reporting_year": fy_key}, {"_id": 0}
            )
            if fin:
                break
        if not fin:
            return {"value": None, "unit": "", "error": "Revenue data not found. Add in Organization Details."}

        freq = fin.get("frequency", "yearly")
        currency = fin.get("currency", "INR")

        if freq == "monthly" and month:
            month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            m_key = month_names[month - 1] if 1 <= month <= 12 else None
            monthly_data = fin.get("monthly_data") or {}
            val = monthly_data.get(m_key)
            if val:
                return {"value": float(val), "unit": currency, "error": None}
            return {"value": None, "unit": currency, "error": f"Revenue for {m_key} not found. Add in Organization Details."}
        else:
            val = fin.get("turnover")
            if val:
                return {"value": float(val), "unit": currency, "error": None}
            return {"value": None, "unit": currency, "error": "Revenue data not found. Add in Organization Details."}

    elif target_type == "intensity_production":
        # Fetch from production_quantities
        if not year:
            return {"value": None, "unit": "", "error": "Production data not found."}
        
        # Periods to try: FY yearly formats + YYYY-MM monthly format
        periods_to_try = period_variants(year, rep_type)
        if month:
            periods_to_try.append(f"{year}-{month:02d}")
        
        if scope_type == "facility" and facility_ids:
            fac_id = facility_ids[0]
            # First try: direct YYYY-MM monthly record (facility monthly production)
            prod = None
            for period_fmt in periods_to_try:
                prod = await app_db.production_quantities.find_one(
                    {"facility_id": fac_id, "reporting_period": period_fmt, "is_deleted": {"$ne": True}},
                    {"_id": 0}
                )
                if prod:
                    break
            error_msg = "Production data not found. Add in Facility Details."
        else:
            prod = None
            for period_fmt in periods_to_try:
                prod = await app_db.production_quantities.find_one(
                    {"organization_id": org_id, "facility_id": None, "reporting_period": period_fmt, "is_deleted": {"$ne": True}},
                    {"_id": 0}
                )
                if prod:
                    break
            error_msg = "Production data not found. Add in Organization Details."

        if not prod:
            return {"value": None, "unit": "", "error": error_msg}

        unit = prod.get("unit", "MT")
        period_matched = prod.get("reporting_period", "")

        # If matched a YYYY-MM monthly record, return its quantity directly
        if month and period_matched == f"{year}-{month:02d}":
            val = prod.get("quantity")
            if val:
                return {"value": float(val), "unit": unit, "error": None}
            return {"value": None, "unit": unit, "error": f"Production for month {month} not found."}

        # Matched a yearly record — check if it has monthly_data
        freq = prod.get("frequency", "yearly")
        if freq == "monthly" and month:
            month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            m_key = month_names[month - 1] if 1 <= month <= 12 else None
            monthly_data = prod.get("monthly_data") or {}
            val = monthly_data.get(m_key)
            if val:
                return {"value": float(val), "unit": unit, "error": None}
            return {"value": None, "unit": unit, "error": f"Production for {m_key} not found. Add monthly data."}
        else:
            val = prod.get("quantity")
            if val:
                return {"value": float(val), "unit": unit, "error": None}
            return {"value": None, "unit": unit, "error": error_msg}

    return {"value": None, "unit": "", "error": None}


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



def _resolve_effective_target_value(target: dict, period: dict) -> Optional[float]:
    """Resolve percentage targets from their explicit reduction fields."""
    if target.get("target_type") != "percentage":
        return _resolve_target_value(target, period)

    baseline = target.get("baseline") or {}
    try:
        baseline_value = float(baseline.get("value"))
        percentage_amount = float(target.get("percentage_amount"))
    except (TypeError, ValueError):
        return _resolve_target_value(target, period)

    direction = target.get("percentage_direction", "decrease")
    multiplier = 1 + percentage_amount / 100 if direction == "increase" else 1 - percentage_amount / 100
    return baseline_value * multiplier


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
    """Alias for shared extract_year."""
    return extract_year(period_str)


def _is_target_year_passed(target: dict) -> bool:
    """Check if target's reporting year has fully passed."""
    now = datetime.now(timezone.utc)
    tracking_mode = target.get("tracking_mode", "static")

    if tracking_mode == "yearly":
        period = target.get("end_period") or target.get("reporting_period") or ""
    else:
        period = target.get("reporting_period") or ""

    year = extract_year(period)
    if not year:
        return False

    rep_type = detect_type(period)
    if rep_type == "FY":
        # FY 2025-2026 ends March 2026
        end_year, end_month = year + 1, 3
    else:
        # CY 2025 ends Dec 2025
        end_year, end_month = year, 12

    return (now.year > end_year) or (now.year == end_year and now.month > end_month)


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


def _get_period_for_target(target: dict, reporting_year_type: str) -> dict:
    """
    Get the period filter from the TARGET's own reporting_period.
    Static → the current organization FY/CY reporting year.
    Monthly → current month of current year.
    Yearly → target's year.
    """
    tracking_mode = target.get("tracking_mode", "static")
    period_str = target.get("reporting_period") or ""
    target_year = extract_year(period_str)

    now = datetime.now(timezone.utc)
    if not target_year:
        target_year = now.year

    if tracking_mode == "static":
        current_year = now.year - 1 if reporting_year_type == "FY" and now.month < 4 else now.year
        return {"year": current_year, "reporting_year_type": reporting_year_type}
    elif tracking_mode == "monthly":
        if target_year < now.year:
            return {"year": target_year, "month": 12, "reporting_year_type": reporting_year_type}
        elif target_year == now.year:
            return {"year": target_year, "month": now.month, "reporting_year_type": reporting_year_type}
        else:
            return {"year": target_year, "month": 1, "reporting_year_type": reporting_year_type}
    else:
        return {"year": target_year, "reporting_year_type": reporting_year_type}


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
    org_rep_type = await _get_org_reporting_type(org_id)
    results = []
    for target in targets:
        target_with_progress = dict(target)
        target["_reporting_type"] = org_rep_type
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
            period = _get_period_for_target(target, org_rep_type)
            
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
                target_value = _resolve_effective_target_value(target, period)
                goal_type = target.get("goal_type", "upper_limit")
                
                # For intensity targets: compute actual_intensity = emissions / denominator
                intensity_error = None
                if target.get("target_type") in ("intensity_revenue", "intensity_production"):
                    denom = await _get_denominator_for_intensity(target, org_id, period)
                    if denom.get("error") or not denom.get("value"):
                        intensity_error = denom.get("error", "Denominator data not found")
                        actual_value = None
                    elif actual_value is not None:
                        actual_value = round(actual_value / denom["value"], 6)
                    target_with_progress["intensity_denominator"] = denom.get("value")
                    target_with_progress["intensity_unit"] = f"{target.get('unit', '')}/{denom.get('unit', '')}"

                progress_result = _calculate_progress(actual_value, target_value, goal_type, target)
                progress_percentage = progress_result["percentage"]
                
                target_with_progress["actual_value"] = actual_value
                target_with_progress["progress_percentage"] = round(progress_percentage, 1) if progress_percentage is not None else None
                target_with_progress["progress_ratio"] = progress_result.get("ratio")
                target_with_progress["over_target"] = progress_result["over_target"]
                target_with_progress["under_target"] = progress_result["under_target"]
                target_with_progress["record_count"] = calculation.get("record_count", 0)
                target_with_progress["calculation_period"] = period
                if intensity_error:
                    target_with_progress["intensity_error"] = intensity_error
                
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
    period = _get_period_for_target(target, await _get_org_reporting_type(org_id))
    
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
    target_value = _resolve_effective_target_value(target, period)
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



@router.get("/{target_id}/chart-data")
async def get_target_chart_data(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get monthly chart data for a target's progress visualization.
    Returns actual values per month + target values for chart rendering.
    """
    from modules.kpi_engine import kpi_calculator

    org_id = _get_org_id(current_user)
    target = await esg_targets_service.get_target(target_id, org_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    kpi_id = target.get("kpi_id")
    if not kpi_id:
        return {"target_id": target_id, "chart_type": "none", "data": [], "message": "No KPI linked"}

    tracking_mode = target.get("tracking_mode", "static")
    reporting_period = target.get("reporting_period", "")
    reporting_type = target.get("reporting_type", "FY")
    tracking_values = target.get("tracking_values") or {}
    target_value = target.get("target_value")
    baseline = target.get("baseline") or {}
    goal_type = target.get("goal_type", "upper_limit")
    unit = target.get("unit", "")

    # Determine year from reporting_period
    target_year = _extract_year_from_period(reporting_period)
    now = datetime.now(timezone.utc)
    if not target_year:
        target_year = now.year

    # Determine month order based on org reporting type
    if reporting_type == "FY":
        month_order = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
        month_labels = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]
    else:
        month_order = list(range(1, 13))
        month_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    # Resolve facility_ids
    facility_ids = None
    if target.get("scope_type") == "facility" and target.get("facility_ids"):
        facility_ids = target.get("facility_ids")

    if tracking_mode == "monthly":
        # Fetch actual for each month
        data_points = []
        for i, m in enumerate(month_order):
            # For FY: Apr-Dec = target_year, Jan-Mar = target_year+1
            if reporting_type == "FY":
                yr = target_year if m >= 4 else target_year + 1
            else:
                yr = target_year

            actual = None
            try:
                calc = await kpi_calculator.calculate(
                    kpi_id=kpi_id, org_id=org_id,
                    scope_type=target.get("scope_type", "organization"),
                    facility_ids=facility_ids,
                    period={"year": yr, "month": m},
                )
                actual = calc.get("value")
            except Exception:
                pass

            # Apply intensity division
            if target.get("target_type") in ("intensity_revenue", "intensity_production") and actual is not None:
                denom = await _get_denominator_for_intensity(target, org_id, {"year": yr, "month": m})
                if denom.get("value"):
                    actual = actual / denom["value"]
                else:
                    actual = None

            key = f"{yr}-{m:02d}"
            tv = tracking_values.get(key)
            tv = float(tv) if tv is not None else None

            # Determine status
            status = "no_data"
            if actual is not None and tv is not None:
                ratio = actual / tv if tv else 0
                if goal_type == "upper_limit":
                    status = "on_track" if ratio < 0.9 else ("at_risk" if ratio <= 1.0 else "breached")
                else:
                    status = "on_track" if ratio > 1.1 else ("at_risk" if ratio >= 1.0 else "breached")

            is_future = (yr > now.year) or (yr == now.year and m > now.month)

            data_points.append({
                "month": month_labels[i],
                "month_num": m,
                "year": yr,
                "actual": round(actual, 2) if actual is not None else None,
                "target": tv,
                "status": status,
                "is_current": yr == now.year and m == now.month,
                "is_future": is_future,
            })

        # Resolve display unit for intensity
        display_unit = unit
        if target.get("target_type") in ("intensity_revenue", "intensity_production"):
            sample_denom = await _get_denominator_for_intensity(target, org_id, {"year": target_year})
            if sample_denom.get("unit"):
                display_unit = f"{unit}/{sample_denom['unit']}"

        return {
            "target_id": target_id,
            "chart_type": "monthly",
            "goal_type": goal_type,
            "unit": display_unit,
            "data": data_points,
        }

    elif tracking_mode == "yearly":
        # Yearly chart — X-axis is years, target is per-year value, actual is cumulative per year
        data_points = []
        tracking_values = target.get("tracking_values") or {}

        # Get all years from tracking_values, sorted
        year_keys = sorted(tracking_values.keys())
        if not year_keys:
            return {"target_id": target_id, "chart_type": "yearly", "goal_type": goal_type, "unit": unit, "data": []}

        for yr_key in year_keys:
            tv = float(tracking_values[yr_key]) if tracking_values.get(yr_key) else None
            yr_num = _extract_year_from_period(yr_key)
            if not yr_num:
                continue

            # Fetch cumulative actual for this year (sum all months)
            actual_total = 0
            has_data = False

            if reporting_type == "FY":
                months_in_year = [(yr_num, m) for m in range(4, 13)] + [(yr_num + 1, m) for m in range(1, 4)]
            else:
                months_in_year = [(yr_num, m) for m in range(1, 13)]

            for m_yr, m_num in months_in_year:
                try:
                    calc = await kpi_calculator.calculate(
                        kpi_id=kpi_id, org_id=org_id,
                        scope_type=target.get("scope_type", "organization"),
                        facility_ids=facility_ids,
                        period={"year": m_yr, "month": m_num},
                    )
                    val = calc.get("value")
                    if val is not None:
                        # Apply intensity division
                        if target.get("target_type") in ("intensity_revenue", "intensity_production"):
                            denom = await _get_denominator_for_intensity(target, org_id, {"year": m_yr, "month": m_num})
                            if denom.get("value"):
                                val = val / denom["value"]
                            else:
                                val = None
                        if val is not None:
                            actual_total += val
                            has_data = True
                except Exception:
                    pass

            is_future = yr_num > now.year or (yr_num == now.year and now.month < 4 and reporting_type == "FY")

            status = "no_data"
            if has_data and tv and tv > 0:
                ratio = actual_total / tv
                if goal_type == "upper_limit":
                    status = "on_track" if ratio < 0.9 else ("at_risk" if ratio <= 1.0 else "breached")
                else:
                    status = "on_track" if ratio > 1.1 else ("at_risk" if ratio >= 1.0 else "breached")

            data_points.append({
                "year_label": yr_key,
                "year": yr_num,
                "actual": round(actual_total, 2) if has_data else None,
                "target": tv,
                "status": status,
                "is_current": yr_num == now.year,
                "is_future": is_future,
            })

        # Resolve display unit for intensity
        display_unit = unit
        if target.get("target_type") in ("intensity_revenue", "intensity_production"):
            sample_yr = _extract_year_from_period(year_keys[0]) or now.year
            sample_denom = await _get_denominator_for_intensity(target, org_id, {"year": sample_yr})
            if sample_denom.get("unit"):
                display_unit = f"{unit}/{sample_denom['unit']}"

        return {
            "target_id": target_id,
            "chart_type": "yearly",
            "goal_type": goal_type,
            "unit": display_unit,
            "data": data_points,
        }

    elif tracking_mode == "static":
        # Progress bar data: base → current → target
        baseline_value = float(baseline.get("value", 0)) if baseline else 0
        baseline_period = baseline.get("period", "")

        actual = None
        static_period = _get_period_for_target(target, await _get_org_reporting_type(org_id))
        try:
            calc = await kpi_calculator.calculate(
                kpi_id=kpi_id, org_id=org_id,
                scope_type=target.get("scope_type", "organization"),
                facility_ids=facility_ids,
                period=static_period,
            )
            actual = calc.get("value")
        except Exception:
            pass

        # Apply intensity division
        intensity_unit = unit
        if target.get("target_type") in ("intensity_revenue", "intensity_production") and actual is not None:
            denom = await _get_denominator_for_intensity(target, org_id, {"year": now.year})
            if denom.get("value"):
                actual = actual / denom["value"]
                intensity_unit = f"{unit}/{denom.get('unit', '')}"

        tv = float(target_value) if target_value else 0
        progress_pct = None
        if baseline_value and tv != baseline_value and actual is not None:
            progress_pct = round(100 - ((tv - actual) / (tv - baseline_value)) * 100, 1)

        return {
            "target_id": target_id,
            "chart_type": "static",
            "goal_type": goal_type,
            "unit": intensity_unit,
            "baseline_value": baseline_value,
            "baseline_period": baseline_period,
            "current_value": round(actual, 2) if actual is not None else None,
            "current_period": format_period(static_period["year"], static_period["reporting_year_type"]),
            "target_value": tv,
            "target_period": reporting_period,
            "progress_percentage": progress_pct,
        }

    return {"target_id": target_id, "chart_type": "unknown", "data": []}



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
    
    Special handling for GHG Emissions category in environment section:
    - Returns predefined subcategories (Scope 1, Scope 2, Scope 3, Total, Scope 1+2)
    - Baseline values fetched from actual emission records
    """
    from shared.database.mongo import db
    
    org_id = _get_org_id(current_user)  # Validate user has org
    from modules.entitlements.service import entitlement_access_map, resolve_entitlement_config
    permissions = entitlement_access_map(await resolve_entitlement_config(org_id, migrate=True))
    
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
    
    # Special handling for GHG Emissions in environment section
    if section == "environment":
        if permissions.get("environment.ghg"):
            ghg_subcategories = _get_ghg_subcategories()
            if not permissions.get("environment.ghg.scope_3"):
                ghg_subcategories = {
                    name: values for name, values in ghg_subcategories.items()
                    if "Scope 3" not in name and "Scope 1, 2 & 3" not in name
                }
            hierarchy["GHG Emissions"] = ghg_subcategories
        # Add Total Energy Consumption to Energy category
        if permissions.get("environment.energy"):
            if "Energy" not in hierarchy:
                hierarchy["Energy"] = {}
            hierarchy["Energy"]["Total Energy Consumption"] = _get_energy_total_kpi()
            hierarchy["Energy"]["Renewable Energy"] = _get_renewable_energy_kpi()
            hierarchy["Energy"]["Non-Renewable Energy"] = _get_non_renewable_energy_kpi()
        else:
            hierarchy.pop("Energy", None)
    
    return {
        "section": section,
        "hierarchy": hierarchy
    }


def _get_ghg_subcategories() -> dict:
    """
    Returns predefined GHG subcategories for target setting.
    These map directly to emission record aggregations.
    """
    return {
        "Scope 1 Emissions": [{
            "kpi_id": "ghg_scope1_total",
            "metric_name": "Total Scope 1 GHG Emissions",
            "metric_code": "GHG_S1",
            "baseline_mapping_key": "scope1_total",
            "short_name": "Scope 1",
            "unit": "tCO2e",
            "output_type": "number",
            "aggregation_type": "sum",
            "description": "Total greenhouse gas emissions from direct sources (Scope 1)",
            "source": "emission_records"
        }],
        "Scope 2 Emissions": [{
            "kpi_id": "ghg_scope2_total",
            "metric_name": "Total Scope 2 GHG Emissions",
            "metric_code": "GHG_S2",
            "baseline_mapping_key": "scope2_total",
            "short_name": "Scope 2",
            "unit": "tCO2e",
            "output_type": "number",
            "aggregation_type": "sum",
            "description": "Total greenhouse gas emissions from purchased energy (Scope 2)",
            "source": "emission_records"
        }],
        "Scope 3 Emissions": [{
            "kpi_id": "ghg_scope3_total",
            "metric_name": "Total Scope 3 GHG Emissions",
            "metric_code": "GHG_S3",
            "baseline_mapping_key": "scope3_total",
            "short_name": "Scope 3",
            "unit": "tCO2e",
            "output_type": "number",
            "aggregation_type": "sum",
            "description": "Total greenhouse gas emissions from value chain (Scope 3)",
            "source": "emission_records"
        }],
        "Total Emissions": [{
            "kpi_id": "ghg_total_all",
            "metric_name": "Total GHG Emissions (All Scopes)",
            "metric_code": "GHG_TOTAL",
            "baseline_mapping_key": "total_all_scopes",
            "short_name": "Total",
            "unit": "tCO2e",
            "output_type": "number",
            "aggregation_type": "sum",
            "description": "Total greenhouse gas emissions across all scopes",
            "source": "emission_records"
        }],
        "Scope 1 + Scope 2 Emissions": [{
            "kpi_id": "ghg_scope1_2_total",
            "metric_name": "Total Scope 1 + Scope 2 GHG Emissions",
            "metric_code": "GHG_S1_S2",
            "baseline_mapping_key": "scope1_2_total",
            "short_name": "Scope 1+2",
            "unit": "tCO2e",
            "output_type": "number",
            "aggregation_type": "sum",
            "description": "Combined Scope 1 and Scope 2 greenhouse gas emissions",
            "source": "emission_records"
        }]
    }


def _get_energy_total_kpi() -> list:
    """
    Returns the Total Energy Consumption KPI for target setting.
    Aggregates energy from all sources (GHG + ESG Metrics).
    """
    return [{
        "kpi_id": "energy_total_consumption",
        "metric_name": "Total Energy Consumption",
        "metric_code": "ENERGY_TOTAL",
        "baseline_mapping_key": "energy_total",
        "short_name": "Total Energy",
        "unit": "GJ",
        "output_type": "number",
        "aggregation_type": "sum",
        "description": "Total energy consumption aggregating Fuel, Electricity, Steam, Heating, and Cooling from all sources",
        "source": "emission_records + environment_records"
    }]



def _get_renewable_energy_kpi() -> list:
    """Aggregate Renewable Energy KPI across all source types (Fuel, Electricity, Heating, Cooling, Steam)."""
    return [{
        "kpi_id": "energy_renewable_total",
        "metric_name": "Total Renewable Energy Consumption",
        "metric_code": "ENERGY_RENEWABLE",
        "baseline_mapping_key": "energy_renewable_total",
        "short_name": "Renewable Energy",
        "unit": "GJ",
        "output_type": "number",
        "aggregation_type": "sum",
        "description": "Total renewable energy consumption across Fuel, Electricity, Heating, Cooling, and Steam",
        "source": "environment_records"
    }]


def _get_non_renewable_energy_kpi() -> list:
    """Aggregate Non-Renewable Energy KPI across all source types (Fuel, Electricity, Heating, Cooling, Steam)."""
    return [{
        "kpi_id": "energy_non_renewable_total",
        "metric_name": "Total Non-Renewable Energy Consumption",
        "metric_code": "ENERGY_NON_RENEWABLE",
        "baseline_mapping_key": "energy_non_renewable_total",
        "short_name": "Non-Renewable Energy",
        "unit": "GJ",
        "output_type": "number",
        "aggregation_type": "sum",
        "description": "Total non-renewable energy consumption across Fuel, Electricity, Heating, Cooling, and Steam",
        "source": "environment_records"
    }]



# =============================================================================
# Baseline Lookup Endpoints (GHG Module Integration)
# =============================================================================

@router.get("/baseline/ghg-emissions")
async def get_ghg_baseline_from_records(
    scope: str = Query(..., description="GHG scope: scope1, scope2, scope3, total, scope1_2"),
    base_year: str = Query(..., description="Base year period (e.g., 'FY 2026-2027')"),
    facility_id: Optional[str] = Query(None, description="Optional facility filter"),
    target_type: Optional[str] = Query(None, description="Target type: absolute, intensity_revenue, intensity_production"),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetch GHG baseline value directly from emission records.
    Aggregates both monthly records within the FY range and yearly records.
    For intensity targets, divides emissions by revenue or production.
    """
    from shared.database.mongo import db
    
    org_id = _get_org_id(current_user)
    
    # Map scope parameter to actual scope values in database (handles mixed formats)
    scope_filters = {
        "scope1": ["Scope 1", "scope1", "Scope1"],
        "scope2": ["Scope 2", "scope2", "Scope2"],
        "scope3": ["Scope 3", "scope3", "Scope3"],
        "total": ["Scope 1", "scope1", "Scope1", "Scope 2", "scope2", "Scope2", "Scope 3", "scope3", "Scope3"],
        "scope1_2": ["Scope 1", "scope1", "Scope1", "Scope 2", "scope2", "Scope2"]
    }
    
    scope_values = scope_filters.get(scope)
    if not scope_values:
        return {"error": f"Invalid scope: {scope}", "value": None, "unit": "tCO2e"}
    
    # Parse base_year to get date range for monthly aggregation
    monthly_periods = _get_monthly_periods_for_fy(base_year)
    yearly_variants = _get_yearly_period_variants(base_year)
    
    # Build query - match either monthly periods OR yearly periods
    query = {
        "organization_id": org_id,
        "scope": {"$in": scope_values},
        "$or": [
            {"reporting_period": {"$in": monthly_periods}},
            {"reporting_period": {"$in": yearly_variants}}
        ]
    }
    query.update(eligible_ghg_record_filter())
    
    if facility_id:
        query["facility_id"] = facility_id
    
    # Aggregate emissions
    records = await db.emission_records.find(query, {"_id": 0, "co2e_emissions": 1, "reporting_period": 1}).to_list(10000)
    
    total_emissions = 0.0
    records_found = 0
    
    for rec in records:
        val = rec.get("co2e_emissions") or 0
        if isinstance(val, (int, float)):
            total_emissions += val
            records_found += 1
    
    # For intensity targets, divide by revenue or production
    final_value = round(total_emissions, 4) if records_found > 0 else None
    final_unit = "tCO2e"
    intensity_denominator = None
    intensity_error = None
    
    if target_type in ("intensity_revenue", "intensity_production") and final_value is not None:
        # Extract year from base_year for denominator lookup
        base_year_int = extract_year(base_year)
        if base_year_int:
            # Build a mock target dict to reuse _get_denominator_for_intensity
            mock_target = {
                "target_type": target_type,
                "scope_type": "facility" if facility_id else "organization",
                "facility_ids": [facility_id] if facility_id else [],
                "_reporting_type": "FY" if "FY" in base_year.upper() else "CY"
            }
            denom_result = await _get_denominator_for_intensity(mock_target, org_id, {"year": base_year_int})
            
            if denom_result.get("error"):
                intensity_error = denom_result.get("error")
            elif denom_result.get("value"):
                intensity_denominator = denom_result.get("value")
                denom_unit = denom_result.get("unit", "")
                # Calculate intensity = emissions / denominator
                final_value = round(total_emissions / intensity_denominator, 6)
                final_unit = f"tCO2e/{denom_unit}" if denom_unit else "tCO2e/unit"
    
    response = {
        "scope": scope,
        "base_year": base_year,
        "value": final_value,
        "unit": final_unit,
        "records_count": records_found,
        "facility_id": facility_id,
        "periods_searched": {
            "monthly": monthly_periods[:3] + ["..."] if len(monthly_periods) > 3 else monthly_periods,
            "yearly": yearly_variants
        }
    }
    
    # Include intensity details if applicable
    if target_type in ("intensity_revenue", "intensity_production"):
        response["target_type"] = target_type
        response["raw_emissions"] = round(total_emissions, 4) if records_found > 0 else None
        response["raw_emissions_unit"] = "tCO2e"
        if intensity_denominator:
            response["intensity_denominator"] = intensity_denominator
        if intensity_error:
            response["intensity_error"] = intensity_error
    
    return response


def _get_monthly_periods_for_fy(fy_str: str) -> list:
    """
    Convert FY string to list of monthly periods (YYYY-MM format).
    FY 2026-2027 -> ['2026-04', '2026-05', ..., '2027-03']
    CY 2026 -> ['2026-01', '2026-02', ..., '2026-12']
    """
    import re
    
    # Handle FY format: "FY 2026-2027" or "FY 2026-27"
    fy_match = re.match(r'FY\s*(\d{4})-(\d{2,4})', fy_str, re.IGNORECASE)
    if fy_match:
        start_year = int(fy_match.group(1))
        end_year_str = fy_match.group(2)
        end_year = int(end_year_str) if len(end_year_str) == 4 else int(f"{str(start_year)[:2]}{end_year_str}")
        
        # FY typically runs Apr-Mar (adjust if your org uses different)
        periods = []
        # Apr to Dec of start year
        for month in range(4, 13):
            periods.append(f"{start_year}-{month:02d}")
        # Jan to Mar of end year
        for month in range(1, 4):
            periods.append(f"{end_year}-{month:02d}")
        return periods
    
    # Handle CY format: "CY 2026" or "CY2026"
    cy_match = re.match(r'CY\s*(\d{4})', fy_str, re.IGNORECASE)
    if cy_match:
        year = int(cy_match.group(1))
        return [f"{year}-{month:02d}" for month in range(1, 13)]
    
    # If just a year number
    if fy_str.isdigit() and len(fy_str) == 4:
        year = int(fy_str)
        return [f"{year}-{month:02d}" for month in range(1, 13)]
    
    return []


def _get_yearly_period_variants(fy_str: str) -> list:
    """
    Get all possible yearly period string variants for matching.
    "FY 2026-2027" -> ["FY 2026-2027", "FY 2026-27", "FY2026-2027", "FY2026-27"]
    """
    import re
    
    variants = [fy_str]  # Always include original
    
    # Handle FY format
    fy_match = re.match(r'FY\s*(\d{4})-(\d{2,4})', fy_str, re.IGNORECASE)
    if fy_match:
        start_year = fy_match.group(1)
        end_year_str = fy_match.group(2)
        
        # Normalize end year
        if len(end_year_str) == 2:
            end_year_full = f"{start_year[:2]}{end_year_str}"
            end_year_short = end_year_str
        else:
            end_year_full = end_year_str
            end_year_short = end_year_str[-2:]
        
        # Generate variants
        variants.extend([
            f"FY {start_year}-{end_year_full}",
            f"FY {start_year}-{end_year_short}",
            f"FY{start_year}-{end_year_full}",
            f"FY{start_year}-{end_year_short}",
            f"FY {start_year}-{end_year_full}".replace(" ", ""),
        ])
    
    # Handle CY format
    cy_match = re.match(r'CY\s*(\d{4})', fy_str, re.IGNORECASE)
    if cy_match:
        year = cy_match.group(1)
        variants.extend([f"CY {year}", f"CY{year}"])
    
    # Remove duplicates while preserving order
    seen = set()
    unique = []
    for v in variants:
        if v not in seen:
            seen.add(v)
            unique.append(v)
    
    return unique


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
