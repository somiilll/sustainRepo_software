"""
Organization Configuration — API Router

Single collection: organization_config
Endpoints for admin CRUD + user-facing resolved config.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from modules.auth.dependencies import get_current_user, get_super_admin_user
from . import service
from .contracts import OrganizationConfigUpdate

router = APIRouter(prefix="/sustainability-config", tags=["Sustainability Config"])


# =========================================================================
# ADMIN: Read / Write org config (SuperAdmin only, org_id required)
# =========================================================================

@router.get("/org-config")
async def get_org_config(
    org_id: str = Query(..., description="Target organization ID"),
    current_user: dict = Depends(get_super_admin_user),
):
    """Get the organization's configuration overrides (raw document). SuperAdmin only."""
    cfg = await service.get_org_config(org_id)
    if not cfg:
        return {
            "organization_id": org_id,
            "modules": {"enabled": None},
            "categories": {"custom": [], "disabled": []},
            "kpi_overrides": {},
            "dashboard": {"type": "standard"},
            "features": {},
        }
    return cfg


@router.put("/org-config")
async def update_org_config(
    data: OrganizationConfigUpdate,
    org_id: str = Query(..., description="Target organization ID"),
    current_user: dict = Depends(get_super_admin_user),
):
    """Create or update the organization's configuration overrides. SuperAdmin only."""
    payload = {}
    if data.modules is not None:
        payload["modules"] = data.modules.model_dump()
    if data.categories is not None:
        payload["categories"] = data.categories.model_dump()
    if data.kpi_overrides is not None:
        payload["kpi_overrides"] = {k: v.model_dump(exclude_none=True) for k, v in data.kpi_overrides.items()}
    if data.dashboard is not None:
        payload["dashboard"] = data.dashboard.model_dump()
    if data.features is not None:
        payload["features"] = data.features.model_dump(exclude_none=True)

    result = await service.upsert_org_config(org_id, payload, current_user["id"])
    return result


@router.delete("/org-config")
async def delete_org_config(
    org_id: str = Query(..., description="Target organization ID"),
    current_user: dict = Depends(get_super_admin_user),
):
    """Delete org config (revert to global defaults). SuperAdmin only."""
    deleted = await service.delete_org_config(org_id)
    return {"status": "deleted" if deleted else "not_found"}


# =========================================================================
# SUPERADMIN: List all organizations for the selector
# =========================================================================

@router.get("/organizations")
async def list_organizations(
    current_user: dict = Depends(get_super_admin_user),
):
    """List all organizations for the org selector. SuperAdmin only."""
    from shared.database.mongo import db
    orgs = await db["organizations"].find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "organization_name": 1},
    ).sort("name", 1).to_list(None)
    return [{"id": o.get("id"), "name": o.get("organization_name") or o.get("name", "Unknown")} for o in orgs]


# =========================================================================
# SUPERADMIN: Get default (global) modules for a section
# =========================================================================

@router.get("/default-modules/{section}")
async def get_default_modules(
    section: str,
    current_user: dict = Depends(get_super_admin_user),
):
    """Return default/global categories grouped by module for a section.
    Used by the admin UI to show what 'default modules' an org would get."""
    from shared.database.mongo import db
    cats = await db["esg_record_categories"].find(
        {"section": section, "is_active": True}, {"_id": 0}
    ).sort("order", 1).to_list(None)

    import re
    def _code(n): return re.sub(r'[^a-z0-9]+', '_', n.lower().strip()).strip('_') or "unknown"

    modules = {}
    for cat in cats:
        mod_name = cat.get("category", "Other")
        mod_code = _code(mod_name)
        if mod_code not in modules:
            modules[mod_code] = {"module_code": mod_code, "module_name": mod_name, "subcategories": []}
        modules[mod_code]["subcategories"].append({
            "subcategory_code": _code(cat.get("subcategory") or mod_name),
            "subcategory_name": cat.get("subcategory") or mod_name,
            "field_count": len(cat.get("fields", [])),
        })
    return list(modules.values())


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
