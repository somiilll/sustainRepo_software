"""Production Quantity CRUD router.

Endpoints:
  - GET    /production-quantities           (list all for user's org)
  - GET    /production-quantities/{id}      (get single record)
  - POST   /production-quantities           (create new record)
  - PUT    /production-quantities/{id}      (update existing record)
  - DELETE /production-quantities/{id}      (soft delete record)
  - GET    /production-quantities/{id}/history (get edit history)
  - GET    /production-quantities/for-report (get production qty for report period)
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user
from modules.production.contracts import (
    ProductionQuantityCreate,
    ProductionQuantityUpdate,
    ProductionQuantityResponse,
    ProductionQuantityHistoryResponse,
)
from shared.database.mongo import db

router = APIRouter()


async def _get_user_name(user_id: str) -> Optional[str]:
    """Helper to get user's full name."""
    if not user_id:
        return None
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "full_name": 1})
    return user.get("full_name") if user else None


async def _get_facility_name(facility_id: str) -> Optional[str]:
    """Helper to get facility name."""
    if not facility_id:
        return None
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0, "name": 1})
    return facility.get("name") if facility else None


async def _record_history(
    production_quantity_id: str,
    record: dict,
    change_type: str,
    changed_by: str,
    version: int
):
    """Record a history entry for production quantity changes."""
    history_entry = {
        "id": str(uuid.uuid4()),
        "production_quantity_id": production_quantity_id,
        "quantity": record.get("quantity"),
        "unit": record.get("unit"),
        "notes": record.get("notes"),
        "changed_at": datetime.now(timezone.utc),
        "changed_by": changed_by,
        "change_type": change_type,
        "version": version
    }
    await db.production_quantity_history.insert_one(history_entry)


@router.get("/production-quantities", response_model=List[ProductionQuantityResponse])
async def list_production_quantities(
    facility_id: Optional[str] = Query(None, description="Filter by facility ID"),
    current_user: dict = Depends(get_current_user)
):
    """List all production quantity records for the user's organization."""
    org_id = current_user.get("organization_id")
    if not org_id and current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Organization not found")
    
    query = {"is_deleted": {"$ne": True}}
    
    if current_user.get("role") == "super_admin":
        # SuperAdmin can see all, optionally filter by facility
        if facility_id:
            query["facility_id"] = facility_id
    else:
        query["organization_id"] = org_id
        if facility_id:
            query["facility_id"] = facility_id
    
    records = await db.production_quantities.find(query, {"_id": 0}).to_list(10000)
    
    # Populate names
    for record in records:
        record["created_by_name"] = await _get_user_name(record.get("created_by"))
        record["updated_by_name"] = await _get_user_name(record.get("updated_by"))
        record["facility_name"] = await _get_facility_name(record.get("facility_id"))
    
    # Sort by reporting_period descending, then by facility_name
    records.sort(key=lambda x: (x.get("reporting_period", ""), x.get("facility_name") or ""), reverse=True)
    
    return [ProductionQuantityResponse(**r) for r in records]


@router.get("/production-quantities/for-report")
async def get_production_for_report(
    facility_id: Optional[str] = Query(None, description="Facility ID (null for org-level)"),
    start_period: str = Query(..., description="Report start period (YYYY-MM)"),
    end_period: str = Query(..., description="Report end period (YYYY-MM)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get production quantity for a report period with proportional allocation.
    
    Logic:
    - If monthly records exist for overlapping months: sum them
    - If FY/CY records exist: proportionally allocate based on overlap
    - Returns aggregated quantity and unit
    """
    import re
    from calendar import monthrange
    
    org_id = current_user.get("organization_id")
    if not org_id and current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Organization not found")
    
    # For super_admin, get org from facility
    if current_user.get("role") == "super_admin" and facility_id:
        facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0, "organization_id": 1})
        if facility:
            org_id = facility.get("organization_id")
    
    query = {
        "organization_id": org_id,
        "is_deleted": {"$ne": True}
    }
    
    if facility_id:
        query["facility_id"] = facility_id
    else:
        query["facility_id"] = None  # Organization-level only
    
    records = await db.production_quantities.find(query, {"_id": 0}).to_list(10000)
    
    if not records:
        return {"quantity": None, "unit": None, "records_used": []}
    
    # Parse report period range
    def parse_ym(period_str):
        """Parse YYYY-MM to (year, month)"""
        match = re.match(r'(\d{4})-(\d{2})', period_str)
        if match:
            return int(match.group(1)), int(match.group(2))
        return None, None
    
    start_y, start_m = parse_ym(start_period)
    end_y, end_m = parse_ym(end_period)
    
    if not start_y or not end_y:
        raise HTTPException(status_code=400, detail="Invalid period format. Use YYYY-MM")
    
    # Generate list of months in report range
    report_months = []
    y, m = start_y, start_m
    while (y, m) <= (end_y, end_m):
        report_months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    
    # Process each production record
    aggregated_qty = 0.0
    unit = None
    records_used = []
    
    for record in records:
        period = record.get("reporting_period", "")
        qty = record.get("quantity", 0)
        rec_unit = record.get("unit", "")
        
        if unit is None:
            unit = rec_unit
        
        # Check if units match (warn if not)
        if rec_unit != unit:
            # Skip records with different units for now
            continue
        
        # Parse the production record period
        overlap_months = 0
        total_period_months = 1
        
        # Monthly format: YYYY-MM
        monthly_match = re.match(r'^(\d{4})-(\d{2})$', period)
        if monthly_match:
            rec_y, rec_m = int(monthly_match.group(1)), int(monthly_match.group(2))
            if (rec_y, rec_m) in report_months:
                overlap_months = 1
                total_period_months = 1
        
        # FY format: FY YYYY-YY or FY YYYY-YYYY
        fy_match = re.match(r'^FY\s*(\d{4})-(\d{2,4})$', period, re.IGNORECASE)
        if fy_match:
            fy_start_year = int(fy_match.group(1))
            # FY runs April to March
            fy_months = []
            for m in range(4, 13):  # Apr-Dec of start year
                fy_months.append((fy_start_year, m))
            for m in range(1, 4):  # Jan-Mar of next year
                fy_months.append((fy_start_year + 1, m))
            
            total_period_months = 12
            overlap_months = len(set(fy_months) & set(report_months))
        
        # CY format: CY YYYY or CY YYYY
        cy_match = re.match(r'^CY\s*(\d{4})$', period, re.IGNORECASE)
        if cy_match:
            cy_year = int(cy_match.group(1))
            cy_months = [(cy_year, m) for m in range(1, 13)]
            total_period_months = 12
            overlap_months = len(set(cy_months) & set(report_months))
        
        if overlap_months > 0:
            proportion = overlap_months / total_period_months
            proportioned_qty = qty * proportion
            aggregated_qty += proportioned_qty
            records_used.append({
                "id": record.get("id"),
                "period": period,
                "original_qty": qty,
                "proportioned_qty": round(proportioned_qty, 4),
                "overlap_months": overlap_months,
                "total_months": total_period_months,
                "proportion": round(proportion, 4)
            })
    
    return {
        "quantity": round(aggregated_qty, 4) if aggregated_qty > 0 else None,
        "unit": unit,
        "records_used": records_used
    }


@router.get("/production-quantities/{record_id}", response_model=ProductionQuantityResponse)
async def get_production_quantity(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single production quantity record."""
    org_id = current_user.get("organization_id")
    
    query = {"id": record_id, "is_deleted": {"$ne": True}}
    if current_user.get("role") != "super_admin":
        query["organization_id"] = org_id
    
    record = await db.production_quantities.find_one(query, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Production quantity record not found")
    
    record["created_by_name"] = await _get_user_name(record.get("created_by"))
    record["updated_by_name"] = await _get_user_name(record.get("updated_by"))
    record["facility_name"] = await _get_facility_name(record.get("facility_id"))
    
    return ProductionQuantityResponse(**record)


@router.post("/production-quantities", response_model=ProductionQuantityResponse)
async def create_production_quantity(
    data: ProductionQuantityCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new production quantity record."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    
    if not org_id and current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Organization not found")
    
    # If facility_id provided, verify it belongs to user's org
    if data.facility_id:
        facility = await db.facilities.find_one({"id": data.facility_id}, {"_id": 0, "organization_id": 1})
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        if current_user.get("role") != "super_admin" and facility.get("organization_id") != org_id:
            raise HTTPException(status_code=403, detail="Facility does not belong to your organization")
        # For super_admin, use facility's org
        if current_user.get("role") == "super_admin":
            org_id = facility.get("organization_id")
    
    # Check for duplicate (same org, facility, period)
    existing = await db.production_quantities.find_one({
        "organization_id": org_id,
        "facility_id": data.facility_id,
        "reporting_period": data.reporting_period,
        "is_deleted": {"$ne": True}
    })
    if existing:
        entity = "organization" if not data.facility_id else "facility"
        raise HTTPException(
            status_code=400, 
            detail=f"Production quantity for this {entity} and period already exists"
        )
    
    now = datetime.now(timezone.utc)
    record = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "facility_id": data.facility_id,
        "reporting_period": data.reporting_period,
        "quantity": data.quantity,
        "unit": data.unit,
        "notes": data.notes,
        "created_at": now,
        "created_by": user_id,
        "updated_at": None,
        "updated_by": None,
        "version": 0,
        "is_deleted": False
    }
    
    await db.production_quantities.insert_one(record)
    
    # Record history
    await _record_history(record["id"], record, "create", user_id, 0)
    
    record["created_by_name"] = await _get_user_name(user_id)
    record["facility_name"] = await _get_facility_name(data.facility_id)
    
    return ProductionQuantityResponse(**record)


@router.put("/production-quantities/{record_id}", response_model=ProductionQuantityResponse)
async def update_production_quantity(
    record_id: str,
    data: ProductionQuantityUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing production quantity record."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    
    query = {"id": record_id, "is_deleted": {"$ne": True}}
    if current_user.get("role") != "super_admin":
        query["organization_id"] = org_id
    
    record = await db.production_quantities.find_one(query, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Production quantity record not found")
    
    # Build update
    update_data = {}
    if data.quantity is not None:
        update_data["quantity"] = data.quantity
    if data.unit is not None:
        update_data["unit"] = data.unit
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    now = datetime.now(timezone.utc)
    new_version = record.get("version", 0) + 1
    update_data["updated_at"] = now
    update_data["updated_by"] = user_id
    update_data["version"] = new_version
    
    await db.production_quantities.update_one(
        {"id": record_id},
        {"$set": update_data}
    )
    
    # Get updated record
    updated_record = await db.production_quantities.find_one({"id": record_id}, {"_id": 0})
    
    # Record history
    await _record_history(record_id, updated_record, "update", user_id, new_version)
    
    updated_record["created_by_name"] = await _get_user_name(updated_record.get("created_by"))
    updated_record["updated_by_name"] = await _get_user_name(user_id)
    updated_record["facility_name"] = await _get_facility_name(updated_record.get("facility_id"))
    
    return ProductionQuantityResponse(**updated_record)


@router.delete("/production-quantities/{record_id}")
async def delete_production_quantity(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Soft delete a production quantity record."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    
    query = {"id": record_id, "is_deleted": {"$ne": True}}
    if current_user.get("role") != "super_admin":
        query["organization_id"] = org_id
    
    record = await db.production_quantities.find_one(query, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Production quantity record not found")
    
    now = datetime.now(timezone.utc)
    new_version = record.get("version", 0) + 1
    
    await db.production_quantities.update_one(
        {"id": record_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": now,
            "deleted_by": user_id,
            "version": new_version
        }}
    )
    
    # Record history
    await _record_history(record_id, record, "delete", user_id, new_version)
    
    return {"message": "Production quantity record deleted successfully"}


@router.get("/production-quantities/{record_id}/history", response_model=List[ProductionQuantityHistoryResponse])
async def get_production_quantity_history(
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get edit history for a production quantity record."""
    org_id = current_user.get("organization_id")
    
    # Verify user has access to the record
    query = {"id": record_id}
    if current_user.get("role") != "super_admin":
        query["organization_id"] = org_id
    
    record = await db.production_quantities.find_one(query, {"_id": 0, "id": 1})
    if not record:
        raise HTTPException(status_code=404, detail="Production quantity record not found")
    
    history = await db.production_quantity_history.find(
        {"production_quantity_id": record_id},
        {"_id": 0}
    ).sort("changed_at", -1).to_list(1000)
    
    # Populate names
    for entry in history:
        entry["changed_by_name"] = await _get_user_name(entry.get("changed_by"))
    
    return [ProductionQuantityHistoryResponse(**h) for h in history]
