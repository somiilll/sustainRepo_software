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
    if data.target_overrides is not None:
        payload["target_overrides"] = {k: v.model_dump(exclude_none=True) for k, v in data.target_overrides.items()}
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

    # Tag which orgs have a config
    configured_ids = set()
    configs = await db["organization_config"].find({}, {"_id": 0, "organization_id": 1}).to_list(None)
    for c in configs:
        configured_ids.add(c["organization_id"])

    return [
        {"id": o.get("id"), "name": o.get("organization_name") or o.get("name", "Unknown"), "has_config": o.get("id") in configured_ids}
        for o in orgs
    ]


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
        subcat_name = cat.get("subcategory") or mod_name
        modules[mod_code]["subcategories"].append({
            "subcategory_code": _code(subcat_name),
            "subcategory_name": subcat_name,
            "field_count": len(cat.get("fields", [])),
            "fields": cat.get("fields", []),
            "category_id": cat.get("id"),
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



# =========================================================================
# CONFIGURED METRIC RECORDS — generic collection for Set Target + future features
# =========================================================================

from pydantic import BaseModel
from typing import Dict, Any, List as TList
from datetime import datetime as dt, timezone as tz
import uuid as _uuid


class ConfiguredRecordCreate(BaseModel):
    feature_type: str  # "set_target" | future types
    section: str = "environment"
    category: str
    subcategory: Optional[str] = None
    category_code: Optional[str] = None
    facility_id: Optional[str] = None
    record_level: str = "organization"
    reporting_period: dict
    field_values: Dict[str, Any]
    status: str = "completed"


class ConfiguredRecordUpdate(BaseModel):
    field_values: Optional[Dict[str, Any]] = None
    status: Optional[str] = None


@router.post("/configured-records", status_code=201)
async def create_configured_record(
    data: ConfiguredRecordCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a record in configured_metric_records (Set Target, future features)."""
    from shared.database.mongo import db
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")

    now = dt.now(tz.utc).isoformat()
    record = {
        "id": str(_uuid.uuid4()),
        "organization_id": org_id,
        "feature_type": data.feature_type,
        "section": data.section,
        "category": data.category,
        "subcategory": data.subcategory,
        "category_code": data.category_code,
        "facility_id": data.facility_id if data.facility_id and data.facility_id != "org_level" else None,
        "record_level": data.record_level,
        "reporting_period": data.reporting_period,
        "field_values": data.field_values,
        "status": data.status,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("full_name", ""),
        "created_at": now,
        "updated_at": now,
    }
    await db["configured_metric_records"].insert_one(record)
    record.pop("_id", None)
    return record


@router.get("/configured-records")
async def list_configured_records(
    feature_type: str = Query(...),
    section: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """List configured metric records filtered by feature_type and optionally by category."""
    from shared.database.mongo import db
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")

    query = {"organization_id": org_id, "feature_type": feature_type}
    if section:
        query["section"] = section
    if category:
        query["category"] = category
    if subcategory:
        query["subcategory"] = subcategory

    total = await db["configured_metric_records"].count_documents(query)
    skip = (page - 1) * page_size
    records = await db["configured_metric_records"].find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)

    return {"records": records, "total": total, "page": page, "page_size": page_size}


@router.delete("/configured-records/{record_id}")
async def delete_configured_record(
    record_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a configured metric record."""
    from shared.database.mongo import db
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    result = await db["configured_metric_records"].delete_one(
        {"id": record_id, "organization_id": org_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"status": "deleted"}


# =========================================================================
# TARGET QUESTIONS: get resolved target fields for a subcategory
# =========================================================================

@router.get("/target-fields/{subcategory_code}")
async def get_target_fields(
    subcategory_code: str,
    current_user: dict = Depends(get_current_user),
):
    """Return the target-specific fields for a subcategory.
    Priority: custom category target_fields → org target_overrides → defaults."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")

    org_cfg = await service.get_org_config(org_id) or {}

    # 1. Check custom categories for inline target_fields
    custom_cats = (org_cfg.get("categories") or {}).get("custom") or []
    for cat in custom_cats:
        if cat.get("category_code") == subcategory_code:
            t_fields = cat.get("target_fields") or []
            if t_fields:
                return {"subcategory_code": subcategory_code, "fields": t_fields, "source": "custom_category"}

    # 2. Check target_overrides for global subcategories
    target_overrides = org_cfg.get("target_overrides") or {}
    override = target_overrides.get(subcategory_code)
    if override and override.get("fields"):
        return {"subcategory_code": subcategory_code, "fields": override["fields"], "source": "org_override"}

    # 3. Default target fields
    return {
        "subcategory_code": subcategory_code,
        "fields": [
            {"field_code": "target_value", "label": "Target Value", "response_type": "number", "required": True, "display_order": 1},
            {"field_code": "target_unit", "label": "Target Unit", "response_type": "text", "required": True, "display_order": 2},
            {"field_code": "baseline_value", "label": "Baseline Value", "response_type": "number", "display_order": 3},
            {"field_code": "target_reduction_pct", "label": "Target Reduction %", "response_type": "percentage", "display_order": 4},
            {"field_code": "target_year", "label": "Target Year", "response_type": "integer", "display_order": 5},
            {"field_code": "remarks", "label": "Remarks", "response_type": "text", "display_order": 6},
        ],
        "source": "default",
    }
