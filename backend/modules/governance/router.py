"""Governance Module API"""

from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from core_platform.auth import get_current_user
from shared.database import get_database

router = APIRouter(prefix="/governance", tags=["Governance"])


@router.get("/bod-kmp")
async def get_bod_kmp_data(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Get BOD & KMP data"""
    record = await db.governance_bod_kmp.find_one(
        {"org_id": current_user.get("organization_id")},
        {"_id": 0}
    )
    return {"data": record.get("data", {}) if record else {}}


@router.post("/bod-kmp")
async def save_bod_kmp_data(
    payload: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Save BOD & KMP data"""
    await db.governance_bod_kmp.update_one(
        {"org_id": current_user.get("organization_id")},
        {"$set": {
            "org_id": current_user.get("organization_id"),
            "data": payload.get("data", {}),
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    return {"success": True}
