"""
Facilities router — 6 routes:
    POST   /facilities
    GET    /facilities
    GET    /facilities/{facility_id}
    PUT    /facilities/{facility_id}
    PATCH  /facilities/{facility_id}/toggle-active
    DELETE /facilities/{facility_id}
"""
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.auth.dependencies import get_admin_user, get_current_user
from modules.facilities.contracts import FacilityCreate, FacilityResponse
from shared.database.mongo import db

router = APIRouter()


@router.post("/facilities", response_model=FacilityResponse)
async def create_facility(facility_data: FacilityCreate, current_user: dict = Depends(get_admin_user)):
    if not current_user.get("organization_id"):
        raise HTTPException(status_code=400, detail="No organization assigned")

    org_id = current_user["organization_id"]

    # Check max_facilities limit
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if org:
        max_facilities = org.get("max_facilities", 10)
        current_facility_count = await db.facilities.count_documents({"organization_id": org_id})
        if current_facility_count >= max_facilities:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum facility limit ({max_facilities}) reached for your organization. Contact your administrator.",
            )

    # Duplicate-name check within org.
    existing = await db.facilities.find_one({
        "name": facility_data.name,
        "organization_id": org_id,
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"A facility with the name '{facility_data.name}' already exists in your organization")

    facility_dict = facility_data.model_dump()
    facility_dict["id"] = str(uuid.uuid4())
    facility_dict["organization_id"] = org_id
    facility_dict["created_at"] = datetime.now(timezone.utc).isoformat()

    await db.facilities.insert_one(facility_dict)

    audit_logger = get_audit_logger()
    await audit_logger.log(
        action=AuditAction.CREATE,
        module=AuditModule.FACILITY,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "admin"),
        organization_id=org_id,
        resource_id=facility_dict["id"],
        resource_name=facility_data.name,
        description=f"Created facility '{facility_data.name}'",
        new_values=facility_dict,
    )

    return FacilityResponse(**facility_dict)


@router.get("/facilities", response_model=List[FacilityResponse])
async def get_facilities(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return []
        facilities = await db.facilities.find(
            {"organization_id": org_id},
            {"_id": 0},
        ).to_list(1000)
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        facilities = await db.facilities.find({"id": {"$in": assigned}}, {"_id": 0}).to_list(1000)
    return [FacilityResponse(**f) for f in facilities]


@router.get("/facilities/{facility_id}", response_model=FacilityResponse)
async def get_facility(facility_id: str, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    if current_user["role"] == "user" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    return FacilityResponse(**facility)


@router.put("/facilities/{facility_id}", response_model=FacilityResponse)
async def update_facility(facility_id: str, facility_data: FacilityCreate, current_user: dict = Depends(get_current_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    if current_user["role"] == "user" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    old_values = dict(facility)
    update_dict = facility_data.model_dump()
    await db.facilities.update_one({"id": facility_id}, {"$set": update_dict})

    updated = await db.facilities.find_one({"id": facility_id}, {"_id": 0})

    audit_logger = get_audit_logger()
    await audit_logger.log(
        action=AuditAction.UPDATE,
        module=AuditModule.FACILITY,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=facility.get("organization_id"),
        resource_id=facility_id,
        resource_name=facility_data.name,
        description=f"Updated facility '{facility_data.name}'",
        old_values=old_values,
        new_values=update_dict,
    )

    return FacilityResponse(**updated)


@router.patch("/facilities/{facility_id}/toggle-active")
async def toggle_facility_active(facility_id: str, current_user: dict = Depends(get_admin_user)):
    """Toggle facility active status (soft delete/restore)"""
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    new_status = not facility.get("is_active", True)
    await db.facilities.update_one(
        {"id": facility_id},
        {"$set": {"is_active": new_status}},
    )

    action = "activated" if new_status else "deactivated"
    return {"message": f"Facility {action} successfully", "is_active": new_status}


@router.delete("/facilities/{facility_id}")
async def delete_facility(facility_id: str, current_user: dict = Depends(get_admin_user)):
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    from cascade_delete import cascade_delete_facility
    from r2_storage import get_r2_storage
    r2 = get_r2_storage()
    result = await cascade_delete_facility(db, r2, facility_id)
    if not result.get("found"):
        raise HTTPException(status_code=404, detail="Facility not found")

    return {
        "message": f"Facility '{result.get('facility')}' and all related data deleted successfully",
        "deleted_counts": result["deleted_counts"],
    }
