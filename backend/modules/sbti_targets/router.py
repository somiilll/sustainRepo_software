"""SBTi Targets — REST API router."""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from shared.utils.period_utils import extract_year
from .contracts import SBTiTargetCreate, SBTiTargetUpdate
from . import service

router = APIRouter()


def _require_sbti_enabled(current_user: dict):
    """Block access if SBTi not enabled for org."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


async def _check_sbti_access(org_id: str):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "sbti_targets_enabled": 1})
    if not org or not org.get("sbti_targets_enabled"):
        raise HTTPException(status_code=403, detail="SBTi Targets not enabled for this organization")


@router.get("")
async def list_sbti_targets(
    term_type: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    org_id = _require_sbti_enabled(current_user)
    await _check_sbti_access(org_id)
    targets = await service.list_targets(org_id, term_type)
    return {"targets": targets, "total": len(targets)}


@router.post("")
async def create_sbti_target(
    data: SBTiTargetCreate,
    current_user: dict = Depends(get_current_user),
):
    org_id = _require_sbti_enabled(current_user)
    await _check_sbti_access(org_id)
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    target_data = data.dict()

    # Compute target_value for percentage targets
    if data.target_type == "percentage" and data.base_year_value and data.growth_rate is not None and data.reduction_percentage is not None:
        base_yr = extract_year(data.base_year) or 0
        target_yr = extract_year(data.target_year) or 0
        years = target_yr - base_yr
        if years > 0:
            result = service.compute_percentage_target(data.base_year_value, data.growth_rate, data.reduction_percentage, years)
            target_data["target_value"] = result["target_value"]

    target = await service.create_target(org_id, target_data, current_user["id"])
    return target


@router.put("/{target_id}")
async def update_sbti_target(
    target_id: str,
    data: SBTiTargetUpdate,
    current_user: dict = Depends(get_current_user),
):
    org_id = _require_sbti_enabled(current_user)
    await _check_sbti_access(org_id)
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    update_data = data.dict(exclude_unset=True)

    # Recompute target_value if percentage fields changed
    if data.target_type == "percentage" or "reduction_percentage" in update_data or "growth_rate" in update_data:
        existing = await service.get_target(target_id, org_id)
        if existing:
            merged = {**existing, **update_data}
            bv = merged.get("base_year_value")
            gr = merged.get("growth_rate")
            rp = merged.get("reduction_percentage")
            base_yr = extract_year(merged.get("base_year", "")) or 0
            target_yr = extract_year(merged.get("target_year", "")) or 0
            years = target_yr - base_yr
            if bv and gr is not None and rp is not None and years > 0:
                result = service.compute_percentage_target(bv, gr, rp, years)
                update_data["target_value"] = result["target_value"]

    target = await service.update_target(target_id, org_id, update_data, current_user["id"])
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    return target


@router.delete("/{target_id}")
async def delete_sbti_target(
    target_id: str,
    current_user: dict = Depends(get_current_user),
):
    org_id = _require_sbti_enabled(current_user)
    await _check_sbti_access(org_id)
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    deleted = await service.delete_target(target_id, org_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"message": "Target deleted"}


@router.get("/progress/{target_id}")
async def get_sbti_progress(
    target_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get progress + trajectory data for a single SBTi target."""
    from modules.kpi_engine import kpi_calculator

    org_id = _require_sbti_enabled(current_user)
    await _check_sbti_access(org_id)

    target = await service.get_target(target_id, org_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    now = datetime.now(timezone.utc)
    target_type = target.get("target_type", "percentage")
    base_yr = extract_year(target.get("base_year", "")) or 0
    target_yr = extract_year(target.get("target_year", "")) or 0
    years = max(target_yr - base_yr, 1)

    # Fetch current year value from KPI engine
    current_value = None
    kpi_id = target.get("kpi_id")
    if kpi_id:
        try:
            calc = await kpi_calculator.calculate(
                kpi_id=kpi_id, org_id=org_id,
                scope_type="organization",
                period={"year": now.year},
            )
            current_value = calc.get("value")
        except Exception:
            pass

    result = {
        "target": target,
        "current_year": now.year,
        "current_value": round(current_value, 2) if current_value is not None else None,
    }

    if target_type == "percentage":
        bv = target.get("base_year_value")
        tv = target.get("target_value")
        gr = target.get("growth_rate", 0)

        # Yearly projections
        if bv and gr is not None:
            projections = service.compute_percentage_target(bv, gr, target.get("reduction_percentage", 0), years)
            result["yearly_projections"] = projections["yearly_projections"]

        result["achievement_percentage"] = service.compute_achievement(
            "percentage", target_value=tv, current_value=current_value, base_value=bv
        )
    else:
        # Intensity
        bi = target.get("base_year_intensity")
        ti = target.get("target_intensity")

        # Current intensity = emissions / denominator
        current_intensity = None
        if current_value is not None:
            from modules.esg_targets.router import _get_denominator_for_intensity, _get_org_reporting_type
            rep_type = await _get_org_reporting_type(org_id)
            denom_target = {"target_type": target_type, "scope_type": "organization", "facility_ids": [], "_reporting_type": rep_type}
            denom = await _get_denominator_for_intensity(denom_target, org_id, {"year": now.year})
            if denom.get("value"):
                current_intensity = round(current_value / denom["value"], 6)

        result["current_intensity"] = current_intensity

        # Linear trajectory
        if bi is not None and ti is not None:
            trajectory = service.compute_intensity_trajectory(bi, ti, years)
            # Map year offsets to actual years
            result["trajectory"] = [
                {"year": base_yr + t["year_offset"], "intensity": t["intensity"]}
                for t in trajectory
            ]

        result["achievement_percentage"] = service.compute_achievement(
            "intensity", target_intensity=ti, current_intensity=current_intensity, base_intensity=bi
        )

    return result
