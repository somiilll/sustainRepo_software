"""
HR & Workforce Module API
Consolidated BRSR workforce disclosures
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel

from core_platform.auth import get_current_user
from shared.database import get_database

router = APIRouter(prefix="/hr-workforce", tags=["HR & Workforce"])


class HRWorkforceData(BaseModel):
    financial_year: str
    facility_id: Optional[str] = None
    data: Dict[str, Any]


@router.get("/data")
async def get_hr_workforce_data(
    financial_year: str,
    facility_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Get HR & Workforce data for a financial year"""
    query = {
        "org_id": current_user.get("organization_id"),
        "financial_year": financial_year
    }
    if facility_id:
        query["facility_id"] = facility_id
    else:
        query["facility_id"] = None  # Org-level data
    
    record = await db.hr_workforce_data.find_one(query, {"_id": 0})
    
    return {"data": record.get("data", {}) if record else {}}


@router.post("/data")
async def save_hr_workforce_data(
    payload: HRWorkforceData,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database)
):
    """Save HR & Workforce data for a financial year"""
    query = {
        "org_id": current_user.get("organization_id"),
        "financial_year": payload.financial_year,
        "facility_id": payload.facility_id
    }
    
    update_data = {
        **query,
        "data": payload.data,
        "updated_at": datetime.now(timezone.utc),
        "updated_by": current_user.get("id")
    }
    
    result = await db.hr_workforce_data.update_one(
        query,
        {"$set": update_data, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    return {"success": True, "modified": result.modified_count, "upserted": result.upserted_id is not None}
