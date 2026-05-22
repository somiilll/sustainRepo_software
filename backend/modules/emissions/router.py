"""
Emissions read/list router — Phase B4 extraction.

Routes (3):
    GET    /emissions
    GET    /emissions/{record_id}/history
    DELETE /emissions/{record_id}

NOT included in Phase B4 (deferred to B5 because they integrate the
calc-engine and audit pipelines):
    POST /emissions
    PUT  /emissions/{record_id}

Behaviour byte-identical to the legacy server.py implementation.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from audit_logger import AuditAction, AuditModule, get_audit_logger
from modules.auth.dependencies import get_current_user
from modules.emissions.contracts import EmissionHistoryResponse, EmissionRecordResponse
from shared.database.mongo import db

router = APIRouter()


@router.get("/emissions", response_model=List[EmissionRecordResponse])
async def get_emission_records(
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    scope: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if current_user["role"] == "super_admin":
        pass  # Can see all
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return []  # Admin without org has no emissions
        facilities = await db.facilities.find(
            {"organization_id": org_id},
            {"_id": 0},
        ).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        query["facility_id"] = {"$in": facility_ids}
    else:  # user
        assigned = current_user.get("assigned_facilities", [])
        query["facility_id"] = {"$in": assigned}

    if facility_id:
        query["facility_id"] = facility_id
    if reporting_period:
        query["reporting_period"] = reporting_period
    if scope:
        query["scope"] = scope

    records = await db.emission_records.find(query, {"_id": 0}).to_list(10000)

    # Batch-resolve display names for created_by / updated_by ids.
    user_ids = set()
    for r in records:
        if r.get("created_by"):
            user_ids.add(r["created_by"])
        if r.get("updated_by"):
            user_ids.add(r["updated_by"])

    user_map = {}
    if user_ids:
        users = await db.users.find(
            {"id": {"$in": list(user_ids)}},
            {"_id": 0, "id": 1, "full_name": 1, "email": 1},
        ).to_list(1000)
        user_map = {u["id"]: u for u in users}

    for r in records:
        if r.get("created_by") and not r.get("created_by_name"):
            user = user_map.get(r["created_by"])
            if user:
                r["created_by_name"] = user.get("full_name", "")
                if not r.get("created_by_email"):
                    r["created_by_email"] = user.get("email", "")
        if r.get("updated_by") and not r.get("updated_by_name"):
            user = user_map.get(r["updated_by"])
            if user:
                r["updated_by_name"] = user.get("full_name", "")
                if not r.get("updated_by_email"):
                    r["updated_by_email"] = user.get("email", "")

    return [EmissionRecordResponse(**r) for r in records]


@router.get("/emissions/{record_id}/history", response_model=List[EmissionHistoryResponse])
async def get_emission_history(record_id: str, current_user: dict = Depends(get_current_user)):
    # Sort by changed_at descending so newest entry appears first.
    history = await db.emission_history.find(
        {"emission_id": record_id},
        {"_id": 0},
    ).sort("changed_at", -1).to_list(1000)

    # Populate changed_by_email and changed_by_name for each history entry.
    for entry in history:
        if entry.get("changed_by"):
            user = await db.users.find_one(
                {"id": entry["changed_by"]},
                {"_id": 0, "email": 1, "full_name": 1},
            )
            if user:
                entry["changed_by_email"] = user.get("email", "Unknown User")
                entry["changed_by_name"] = user.get("full_name", "")
            else:
                entry["changed_by_email"] = "Unknown User"
                entry["changed_by_name"] = ""
        else:
            entry["changed_by_email"] = "Unknown User"
            entry["changed_by_name"] = ""

    return [EmissionHistoryResponse(**h) for h in history]


@router.delete("/emissions/{record_id}")
async def delete_emission_record(record_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.emission_records.find_one({"id": record_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Emission record not found")

    result = await db.emission_records.delete_one({"id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emission record not found")

    audit_logger = get_audit_logger()
    await audit_logger.log(
        action=AuditAction.DELETE,
        module=AuditModule.EMISSION,
        user_id=current_user["id"],
        user_email=current_user["email"],
        user_role=current_user.get("role", "user"),
        organization_id=existing.get("organization_id"),
        resource_id=record_id,
        resource_name=f"{existing.get('scope', '')} - {existing.get('category', '')} ({existing.get('reporting_period', '')})",
        description=f"Deleted emission record for {existing.get('category', 'Unknown')}",
        old_values=existing,
        metadata={
            "scope": existing.get("scope"),
            "category": existing.get("category"),
            "total_emissions": existing.get("total_emissions"),
        },
    )

    return {"message": "Emission record deleted successfully"}
