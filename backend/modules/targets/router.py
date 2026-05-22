"""Targets CRUD router.

Permissions:
  - GET     /api/targets         — any authenticated user (read-only for users)
  - POST    /api/targets         — admin / super_admin only
  - GET     /api/targets/{id}    — any authenticated user
  - PUT     /api/targets/{id}    — admin / super_admin only
  - DELETE  /api/targets/{id}    — admin / super_admin only

Targets are scoped to the user's organization (super_admin sees all).
"""
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user
from modules.targets.contracts import TargetCreate, TargetResponse, TargetUpdate
from shared.database.mongo import db

router = APIRouter()

VALID_MODES = {"total", "scope", "category"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_org_id(current_user: dict) -> str:
    org_id = current_user.get("organization_id")
    if not org_id and current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="No organization assigned")
    return org_id or ""


def _require_admin(current_user: dict) -> None:
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required")


def _validate_mode(mode: str) -> None:
    if mode not in VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"target_mode must be one of {sorted(VALID_MODES)}",
        )


@router.get("/targets", response_model=List[TargetResponse])
async def list_targets(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    query: dict = {}
    if role == "super_admin":
        pass
    else:
        org_id = _resolve_org_id(current_user)
        query["organization_id"] = org_id

    docs = await db.emission_targets.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [TargetResponse(**d) for d in docs]


@router.post("/targets", response_model=TargetResponse)
async def create_target(payload: TargetCreate, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    _validate_mode(payload.target_mode)

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Target name is required")

    org_id = _resolve_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Super-admin must specify organization")

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "name": payload.name.strip(),
        "target_mode": payload.target_mode,
        "target_configuration": payload.target_configuration or {},
        "created_by": current_user.get("id"),
        "created_by_email": current_user.get("email", ""),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": now,
        "updated_at": None,
        "updated_by": None,
        "updated_by_email": None,
        "updated_by_name": None,
    }
    await db.emission_targets.insert_one(dict(doc))
    return TargetResponse(**doc)


@router.get("/targets/{target_id}", response_model=TargetResponse)
async def get_target(target_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.emission_targets.find_one({"id": target_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Target not found")

    if current_user.get("role") != "super_admin":
        if doc.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized")

    return TargetResponse(**doc)


@router.put("/targets/{target_id}", response_model=TargetResponse)
async def update_target(
    target_id: str,
    payload: TargetUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)

    existing = await db.emission_targets.find_one({"id": target_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Target not found")

    if current_user.get("role") != "super_admin":
        if existing.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized")

    update_set: dict = {
        "updated_at": _now(),
        "updated_by": current_user.get("id"),
        "updated_by_email": current_user.get("email", ""),
        "updated_by_name": current_user.get("full_name", ""),
    }

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Target name is required")
        update_set["name"] = name

    if payload.target_mode is not None:
        _validate_mode(payload.target_mode)
        update_set["target_mode"] = payload.target_mode

    # `target_configuration` is replaced wholesale when provided so that
    # cleared sub-fields actually disappear from the document (supports the
    # value→empty transition explicitly required by the spec).
    if payload.target_configuration is not None:
        update_set["target_configuration"] = payload.target_configuration

    await db.emission_targets.update_one({"id": target_id}, {"$set": update_set})
    updated = await db.emission_targets.find_one({"id": target_id}, {"_id": 0})
    return TargetResponse(**updated)


@router.delete("/targets/{target_id}")
async def delete_target(target_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)

    existing = await db.emission_targets.find_one({"id": target_id}, {"_id": 0, "organization_id": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Target not found")

    if current_user.get("role") != "super_admin":
        if existing.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized")

    await db.emission_targets.delete_one({"id": target_id})
    return {"message": "Target deleted successfully"}
