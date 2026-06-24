"""
Facilities router — 8 routes:
    POST   /facilities
    GET    /facilities
    GET    /facilities/{facility_id}
    PUT    /facilities/{facility_id}
    PATCH  /facilities/{facility_id}/toggle-active
    DELETE /facilities/{facility_id}
    GET    /facilities/{facility_id}/production/{reporting_year}
    POST   /facilities/{facility_id}/production/{reporting_year}
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.auth.dependencies import get_admin_user, get_current_user
from modules.facilities.contracts import FacilityCreate, FacilityResponse
from shared.database.mongo import db

router = APIRouter()


class FacilityProductionCreate(BaseModel):
    """Model for facility production data - supports monthly or yearly input"""
    input_type: str = "yearly"  # "monthly" or "yearly"
    quantity: Optional[float] = None  # For yearly input
    unit: Optional[str] = "MT"
    monthly_data: Optional[dict] = None  # {"Apr": 100, "May": 120, ...} for monthly input


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


# Month order for financial year (Apr-Mar)
MONTH_ORDER = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]


@router.get("/facilities/{facility_id}/production/{reporting_year}")
async def get_facility_production(
    facility_id: str,
    reporting_year: str,
    current_user: dict = Depends(get_current_user)
):
    """Get facility production quantities for a reporting year (monthly or yearly data)."""
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    # Authorization check
    if current_user["role"] == "user" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    org_id = facility["organization_id"]
    
    # Check for yearly production record
    yearly_record = await db.production_quantities.find_one(
        {
            "organization_id": org_id,
            "facility_id": facility_id,
            "reporting_period": f"FY {reporting_year}",
            "is_deleted": {"$ne": True}
        },
        {"_id": 0}
    )
    
    # Check for monthly production records
    monthly_records = await db.production_quantities.find(
        {
            "organization_id": org_id,
            "facility_id": facility_id,
            "reporting_period": {"$regex": f"^{reporting_year}-"},
            "is_deleted": {"$ne": True}
        },
        {"_id": 0}
    ).to_list(12)
    
    # Build monthly data dict
    monthly_data = {}
    for record in monthly_records:
        # Extract month from reporting_period like "2024-25-Apr"
        parts = record.get("reporting_period", "").split("-")
        if len(parts) >= 3:
            month = parts[2]
            monthly_data[month] = {
                "quantity": record.get("quantity", 0),
                "unit": record.get("unit", "MT")
            }
    
    # Determine input type based on what data exists
    if monthly_data:
        input_type = "monthly"
        total_quantity = sum(m.get("quantity", 0) for m in monthly_data.values())
    elif yearly_record:
        input_type = "yearly"
        total_quantity = yearly_record.get("quantity", 0)
    else:
        input_type = "yearly"
        total_quantity = 0
    
    return {
        "input_type": input_type,
        "quantity": yearly_record.get("quantity", 0) if yearly_record else 0,
        "unit": yearly_record.get("unit", "MT") if yearly_record else "MT",
        "monthly_data": monthly_data,
        "total_quantity": total_quantity
    }


@router.post("/facilities/{facility_id}/production/{reporting_year}")
async def save_facility_production(
    facility_id: str,
    reporting_year: str,
    data: FacilityProductionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Save facility production quantities - supports monthly or yearly input."""
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    # Authorization check
    if current_user["role"] == "user" and facility_id not in current_user.get("assigned_facilities", []):
        raise HTTPException(status_code=403, detail="Not authorized")
    if current_user["role"] == "admin" and facility["organization_id"] != current_user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not authorized")

    org_id = facility["organization_id"]
    now = datetime.now(timezone.utc)
    user_id = current_user.get("id")
    
    if data.input_type == "monthly" and data.monthly_data:
        # Clear any existing yearly record for this FY
        await db.production_quantities.update_many(
            {
                "organization_id": org_id,
                "facility_id": facility_id,
                "reporting_period": f"FY {reporting_year}",
                "is_deleted": {"$ne": True}
            },
            {"$set": {"is_deleted": True, "deleted_at": now}}
        )
        
        # Save/update monthly records
        for month, month_data in data.monthly_data.items():
            if month not in MONTH_ORDER:
                continue
                
            quantity = month_data.get("quantity", 0) if isinstance(month_data, dict) else month_data
            unit = month_data.get("unit", data.unit or "MT") if isinstance(month_data, dict) else (data.unit or "MT")
            
            reporting_period = f"{reporting_year}-{month}"
            
            existing = await db.production_quantities.find_one({
                "organization_id": org_id,
                "facility_id": facility_id,
                "reporting_period": reporting_period,
                "is_deleted": {"$ne": True}
            })
            
            if existing:
                await db.production_quantities.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "quantity": float(quantity) if quantity else 0,
                        "unit": unit,
                        "updated_at": now,
                        "updated_by": user_id
                    }}
                )
            else:
                new_record = {
                    "id": str(uuid.uuid4()),
                    "organization_id": org_id,
                    "facility_id": facility_id,
                    "reporting_period": reporting_period,
                    "quantity": float(quantity) if quantity else 0,
                    "unit": unit,
                    "notes": f"Monthly production for {month}",
                    "created_at": now,
                    "created_by": user_id,
                    "updated_at": now,
                    "updated_by": user_id,
                    "is_deleted": False
                }
                await db.production_quantities.insert_one(new_record)
        
        # Calculate total for response
        total = sum(
            (m.get("quantity", 0) if isinstance(m, dict) else m) or 0 
            for m in data.monthly_data.values()
        )
        
        return {
            "success": True,
            "message": f"Saved monthly production data for FY {reporting_year}",
            "total_quantity": total
        }
    
    else:
        # Yearly input - clear monthly records and save yearly
        # Soft delete monthly records
        await db.production_quantities.update_many(
            {
                "organization_id": org_id,
                "facility_id": facility_id,
                "reporting_period": {"$regex": f"^{reporting_year}-"},
                "is_deleted": {"$ne": True}
            },
            {"$set": {"is_deleted": True, "deleted_at": now}}
        )
        
        # Save/update yearly record
        reporting_period = f"FY {reporting_year}"
        existing = await db.production_quantities.find_one({
            "organization_id": org_id,
            "facility_id": facility_id,
            "reporting_period": reporting_period,
            "is_deleted": {"$ne": True}
        })
        
        if existing:
            await db.production_quantities.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "quantity": float(data.quantity) if data.quantity else 0,
                    "unit": data.unit or "MT",
                    "updated_at": now,
                    "updated_by": user_id
                }}
            )
        else:
            new_record = {
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "facility_id": facility_id,
                "reporting_period": reporting_period,
                "quantity": float(data.quantity) if data.quantity else 0,
                "unit": data.unit or "MT",
                "notes": "Yearly production quantity",
                "created_at": now,
                "created_by": user_id,
                "updated_at": now,
                "updated_by": user_id,
                "is_deleted": False
            }
            await db.production_quantities.insert_one(new_record)
        
        return {
            "success": True,
            "message": f"Saved yearly production data for FY {reporting_year}",
            "total_quantity": data.quantity or 0
        }
