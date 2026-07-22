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
from r2_storage import get_r2_storage
from shared.database.mongo import db

router = APIRouter()


@router.post("/sinks", response_model=SinkResponse)
async def create_sink(sink_data: SinkCreate, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": sink_data.facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    org_id = facility.get("organization_id")
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")

    # Legacy access check
    if user_role == "user":
        if sink_data.facility_id not in current_user.get("assigned_facilities", []):
            raise HTTPException(status_code=403, detail="Not authorized for this facility")
    elif user_role == "admin":
        if org_id != current_user.get("organization_id"):
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

    sink_dict = {
        "id": str(uuid.uuid4()),
        "facility_id": sink_data.facility_id,
        "organization_id": org_id,
        "reporting_year": sink_data.reporting_year,
        "reporting_month": sink_data.reporting_month,
        "total_emissions_reduced": sink_data.total_emissions_reduced,
        "description": sink_data.description,
        "evidence_urls": sink_data.evidence_urls or [],
        "evidence_files": sink_data.evidence_files or [],
        "frequency_type": sink_data.frequency_type or "monthly",
        "start_date": sink_data.start_date,
        "end_date": sink_data.end_date,
        "monthly_data": sink_data.monthly_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
    }
    await db.sinks.insert_one(sink_dict)
    
    # Update assignment completion status (best-effort)
    try:
        from modules.esg_assignments.completion_tracking import completion_tracking_service
        await completion_tracking_service.on_record_submitted(
            organization_id=org_id,
            category="GHG Emissions",
            facility_id=sink_data.facility_id,
            subcategory="GHG Emissions - Removal/Sinks",
        )
    except Exception:
        pass  # Don't fail the request if completion tracking fails
    
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
        # Regular users - apply KPI assignment-based filtering
        facility_ids = current_user.get("assigned_facilities", [])
        sinks = await db.sinks.find({"facility_id": {"$in": facility_ids}}, {"_id": 0}).to_list(10000)
        
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

    update_dict = {
        "facility_id": sink_data.facility_id,
        "reporting_year": sink_data.reporting_year,
        "reporting_month": sink_data.reporting_month,
        "total_emissions_reduced": sink_data.total_emissions_reduced,
        "description": sink_data.description,
        "evidence_urls": sink_data.evidence_urls or [],
        "evidence_files": sink_data.evidence_files or [],
        "frequency_type": existing_frequency,
        "start_date": sink_data.start_date,
        "end_date": sink_data.end_date,
        "monthly_data": sink_data.monthly_data,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sinks.update_one({"id": sink_id}, {"$set": update_dict})
    updated = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    return SinkResponse(**updated)


@router.delete("/sinks/{sink_id}")
async def delete_sink(sink_id: str, current_user: dict = Depends(get_current_user)):
    sink = await db.sinks.find_one({"id": sink_id}, {"_id": 0})
    if not sink:
        raise HTTPException(status_code=404, detail="Sink record not found")

    # Cleanup R2-hosted evidence files before deleting the record.
    evidence_files = sink.get("evidence_files", [])
    if evidence_files:
        try:
            r2 = get_r2_storage()
            for file_info in evidence_files:
                file_id = file_info.get("file_id")
                if file_id:
                    file_record = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
                    if file_record and file_record.get("r2_key"):
                        try:
                            await r2.delete_file(
                                bucket_type=file_record.get("bucket_type", "evidence"),
                                key=file_record["r2_key"],
                            )
                        except Exception as e:
                            logging.warning(f"Failed to delete R2 file {file_record['r2_key']}: {e}")
                        await db.uploaded_files.delete_one({"id": file_id})
        except Exception as e:
            logging.error(f"Error cleaning up sink files: {e}")

    result = await db.sinks.delete_one({"id": sink_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sink record not found")
    return {"message": "Sink record and associated files deleted successfully"}
