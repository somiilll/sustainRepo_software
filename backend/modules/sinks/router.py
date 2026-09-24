"""
Sinks router — 5 routes:
    POST   /sinks
    GET    /sinks
    GET    /sinks/{sink_id}
    PUT    /sinks/{sink_id}
    DELETE /sinks/{sink_id}
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user
from modules.sinks.contracts import SinkCreate, SinkResponse
from modules.sinks.periods import canonical_sink_period_fields
from modules.base_year.sync_service import sync_changed_sink_base_years
from shared.database.mongo import db
from shared.helpers.uploaded_files import delete_uploaded_files, extract_uploaded_file_ids

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/sinks", response_model=SinkResponse)
async def create_sink(sink_data: SinkCreate, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": sink_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    org_id = facility.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")

    # Admin org check
    if user_role == "admin" and org_id != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized for this facility")

    # KPI Assignment-based access control (admins bypass)
    if user_role not in ["admin", "super_admin"]:
        from modules.esg_assignments.kpi_access_helper import kpi_access_helper
        can_access, reason = await kpi_access_helper.can_access_sinks(
            user_id=user_id,
            organization_id=org_id,
            facility_id=sink_data.facility_id,
        )
        if not can_access:
            raise HTTPException(
                status_code=403,
                detail="You don't have access to create carbon sinks for this facility. Check your KPI assignments."
            )

    organization = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if organization:
        enabled_access = organization.get("enabled_access")
        if enabled_access is None:
            enabled_access = ["scope1_2"]
        has_sink_access = any(access in enabled_access for access in ["scope1_2", "scope1_2_3"])
        if not has_sink_access:
            raise HTTPException(
                status_code=403,
                detail="Your organization does not have access to add carbon sinks. Please contact your administrator.",
            )

    try:
        period_fields = canonical_sink_period_fields(
            sink_data.reporting_period,
            sink_data.frequency_type,
            organization or {},
            sink_data.reporting_year,
            sink_data.reporting_month,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    sink_dict = {
        "id": str(uuid.uuid4()),
        "facility_id": sink_data.facility_id,
        "organization_id": org_id,
        **period_fields,
        "total_emissions_reduced": sink_data.total_emissions_reduced,
        "description": sink_data.description,
        "evidence_urls": sink_data.evidence_urls or [],
        "evidence_files": sink_data.evidence_files or [],
        "monthly_data": sink_data.monthly_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
    }
    await db.sinks.insert_one(sink_dict)
    sink_dict.pop("_id", None)
    try:
        await sync_changed_sink_base_years(None, sink_dict, current_user)
    except Exception:
        logger.exception("[BASE_YEAR_SINK_SYNC] Failed after creating sink %s", sink_dict["id"])
    
    # NOTE: Completion tracking removed - status is now computed on-the-fly by CompletionService
    
    return SinkResponse(**sink_dict)


@router.get("/sinks", response_model=List[SinkResponse])
async def get_sinks(current_user: dict = Depends(get_current_user)):
    user_role = current_user.get("role", "user")
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    
    if user_role == "super_admin":
        sinks = await db.sinks.find({}, {"_id": 0}).to_list(10000)
    elif user_role == "admin":
        sinks = await db.sinks.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)
    else:
        # Regular users - use KPI assignment-based filtering only
        # First get all sinks for org, then filter by KPI access
        sinks = await db.sinks.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)
        
        # Apply KPI access control filtering
        from modules.esg_assignments.kpi_access_helper import kpi_access_helper
        sinks = await kpi_access_helper.filter_sinks_by_access(
            user_id=user_id,
            organization_id=org_id,
            records=sinks,
        )
    
    return [SinkResponse(**s) for s in sinks]


@router.get("/sinks/{sink_id}", response_model=SinkResponse)
async def get_sink(sink_id: str, current_user: dict = Depends(get_current_user)):
    sink = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if not sink:
        raise HTTPException(status_code=404, detail="Sink record not found")
    return SinkResponse(**sink)


@router.put("/sinks/{sink_id}", response_model=SinkResponse)
async def update_sink(sink_id: str, sink_data: SinkCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sink record not found")

    # frequency_type is preserved from the original record — not editable.
    existing_frequency = existing.get("frequency_type", "monthly")
    organization = await db.organizations.find_one({"id": existing.get("organization_id")}, {"_id": 0})
    target_facility = await db.facilities.find_one({"id": sink_data.facility_id}, {"_id": 0, "organization_id": 1})
    if not target_facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    if target_facility.get("organization_id") != existing.get("organization_id"):
        raise HTTPException(status_code=403, detail="A sink can only be reassigned to a facility in the same organization")
    try:
        period_fields = canonical_sink_period_fields(
            sink_data.reporting_period,
            existing_frequency,
            organization or {},
            sink_data.reporting_year,
            sink_data.reporting_month,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    update_dict = {
        "facility_id": sink_data.facility_id,
        **period_fields,
        "total_emissions_reduced": sink_data.total_emissions_reduced,
        "description": sink_data.description,
        "evidence_urls": sink_data.evidence_urls or [],
        "evidence_files": sink_data.evidence_files or [],
        "monthly_data": sink_data.monthly_data,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    removed_file_ids = extract_uploaded_file_ids(existing) - extract_uploaded_file_ids(update_dict)
    await db.sinks.update_one({"id": sink_id}, {"$set": update_dict})
    updated = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if removed_file_ids:
        try:
            await delete_uploaded_files(db, removed_file_ids)
        except Exception:
            logger.exception(
                "Sink was updated, but removed evidence cleanup failed",
                extra={"sink_id": sink_id, "file_ids": sorted(removed_file_ids)},
            )
    try:
        await sync_changed_sink_base_years(existing, updated, current_user)
    except Exception:
        logger.exception("[BASE_YEAR_SINK_SYNC] Failed after updating sink %s", sink_id)
    return SinkResponse(**updated)


@router.delete("/sinks/{sink_id}")
async def delete_sink(sink_id: str, current_user: dict = Depends(get_current_user)):
    sink = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if not sink:
        raise HTTPException(status_code=404, detail="Sink record not found")

    try:
        await delete_uploaded_files(db, extract_uploaded_file_ids(sink))
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not remove sink evidence from storage. The sink was not deleted.") from error

    result = await db.sinks.delete_one({"id": sink_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sink record not found")
    try:
        await sync_changed_sink_base_years(sink, None, current_user)
    except Exception:
        logger.exception("[BASE_YEAR_SINK_SYNC] Failed after deleting sink %s", sink_id)
    return {"message": "Sink record and associated files deleted successfully"}
