"""
Organization Configuration — API Router

Single collection: organization_config
Endpoints for admin CRUD + user-facing resolved config.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from modules.auth.dependencies import get_current_user, get_admin_user
from . import service
from .contracts import OrganizationConfigUpdate

router = APIRouter(prefix="/sustainability-config", tags=["Sustainability Config"])


def _get_org_id(user: dict, org_id_override: Optional[str] = None) -> str:
    if org_id_override and user.get("role") == "super_admin":
        return org_id_override
    org_id = user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


# =========================================================================
# ADMIN: Read / Write org config
# =========================================================================

@router.get("/org-config")
async def get_org_config(
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    """Get the organization's configuration overrides (raw document)."""
    resolved_org = _get_org_id(current_user, org_id)
    cfg = await service.get_org_config(resolved_org)
    if not cfg:
        return {
            "organization_id": resolved_org,
            "modules": {"enabled": None},
            "categories": {"custom": [], "disabled": []},
            "kpi_overrides": {},
            "dashboard": {"type": "standard"},
        }
    return cfg


@router.put("/org-config")
async def update_org_config(
    data: OrganizationConfigUpdate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    """Create or update the organization's configuration overrides."""
    resolved_org = _get_org_id(current_user, org_id)
    payload = {}
    if data.modules is not None:
        payload["modules"] = data.modules.model_dump()
    if data.categories is not None:
        payload["categories"] = data.categories.model_dump()
    if data.kpi_overrides is not None:
        payload["kpi_overrides"] = {k: v.model_dump(exclude_none=True) for k, v in data.kpi_overrides.items()}
    if data.dashboard is not None:
        payload["dashboard"] = data.dashboard.model_dump()

    result = await service.upsert_org_config(resolved_org, payload, current_user["id"])
    return result


@router.delete("/org-config")
async def delete_org_config(
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    """Delete org config (revert to global defaults)."""
    resolved_org = _get_org_id(current_user, org_id)
    deleted = await service.delete_org_config(resolved_org)
    return {"status": "deleted" if deleted else "not_found"}


# =========================================================================
# USER-FACING: Resolved config (global + overrides merged)
# =========================================================================

@router.get("/resolved")
async def get_resolved_config(
    current_user: dict = Depends(get_current_user),
):
    """Return the final merged configuration for the current user's org.
    Global defaults + organization overrides = what the user sees."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return await service.resolve_config(org_id)
