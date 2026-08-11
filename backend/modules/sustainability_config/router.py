"""
Sustainability Module Configuration — API Router

All endpoints enforce organization_id from the authenticated user's token.
SuperAdmin can operate on any org via the /admin/{org_id}/... prefix.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from modules.auth.dependencies import get_current_user, get_admin_user
from shared.database.mongo import db
from . import service
from .contracts import (
    ModuleCreate, ModuleUpdate,
    CategoryCreate, CategoryUpdate,
    KPICreate, KPIUpdate,
    FieldConfigCreate, FieldConfigUpdate,
    CalculationCreate, CalculationUpdate,
)

router = APIRouter(prefix="/sustainability-config", tags=["Sustainability Config"])


def _get_org_id(user: dict, org_id_override: Optional[str] = None) -> str:
    """Resolve org_id: super_admin can override, others use their own."""
    if org_id_override and user.get("role") == "super_admin":
        return org_id_override
    org_id = user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


# =========================================================================
# MODULES
# =========================================================================

@router.get("/modules")
async def list_modules(
    org_id: Optional[str] = Query(None, description="SuperAdmin: target org"),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    return await service.list_modules(resolved_org)


@router.post("/modules", status_code=201)
async def create_module(
    data: ModuleCreate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.create_module(resolved_org, data, current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/modules/{module_id}")
async def update_module(
    module_id: str,
    data: ModuleUpdate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.update_module(resolved_org, module_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/modules/{module_id}")
async def delete_module(
    module_id: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        await service.delete_module(resolved_org, module_id)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =========================================================================
# CATEGORIES
# =========================================================================

@router.get("/modules/{module_code}/categories")
async def list_categories(
    module_code: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    return await service.list_categories(resolved_org, module_code)


@router.post("/modules/{module_code}/categories", status_code=201)
async def create_category(
    module_code: str,
    data: CategoryCreate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.create_category(resolved_org, module_code, data, current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.update_category(resolved_org, category_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        await service.delete_category(resolved_org, category_id)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =========================================================================
# KPIs
# =========================================================================

@router.get("/modules/{module_code}/categories/{category_code}/kpis")
async def list_kpis(
    module_code: str,
    category_code: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    return await service.list_kpis(resolved_org, module_code, category_code)


@router.post("/modules/{module_code}/categories/{category_code}/kpis", status_code=201)
async def create_kpi(
    module_code: str,
    category_code: str,
    data: KPICreate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.create_kpi(resolved_org, module_code, category_code, data, current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/kpis/{kpi_id}")
async def update_kpi(
    kpi_id: str,
    data: KPIUpdate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.update_kpi(resolved_org, kpi_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/kpis/{kpi_id}")
async def delete_kpi(
    kpi_id: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        await service.delete_kpi(resolved_org, kpi_id)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =========================================================================
# FIELD CONFIGS (Questions)
# =========================================================================

@router.get("/modules/{module_code}/categories/{category_code}/kpis/{kpi_code}/fields")
async def get_active_fields(
    module_code: str,
    category_code: str,
    kpi_code: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    cfg = await service.get_active_field_config(resolved_org, module_code, category_code, kpi_code)
    if not cfg:
        return {"fields": [], "config_version": None}
    return cfg


@router.get("/modules/{module_code}/categories/{category_code}/kpis/{kpi_code}/fields/versions")
async def list_field_versions(
    module_code: str,
    category_code: str,
    kpi_code: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    return await service.list_field_versions(resolved_org, module_code, category_code, kpi_code)


@router.post("/modules/{module_code}/categories/{category_code}/kpis/{kpi_code}/fields", status_code=201)
async def create_field_config(
    module_code: str,
    category_code: str,
    kpi_code: str,
    data: FieldConfigCreate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.create_field_config(
            resolved_org, module_code, category_code, kpi_code, data, current_user["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/fields/{field_config_id}")
async def update_field_config(
    field_config_id: str,
    data: FieldConfigUpdate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.update_field_config(resolved_org, field_config_id, data, current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =========================================================================
# CALCULATIONS
# =========================================================================

@router.get("/modules/{module_code}/categories/{category_code}/kpis/{kpi_code}/calculations")
async def list_calculations(
    module_code: str,
    category_code: str,
    kpi_code: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    return await service.list_calculations(resolved_org, module_code, category_code, kpi_code)


@router.post("/modules/{module_code}/categories/{category_code}/kpis/{kpi_code}/calculations", status_code=201)
async def create_calculation(
    module_code: str,
    category_code: str,
    kpi_code: str,
    data: CalculationCreate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.create_calculation(
            resolved_org, module_code, category_code, kpi_code, data, current_user["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.put("/calculations/{calc_id}")
async def update_calculation(
    calc_id: str,
    data: CalculationUpdate,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        return await service.update_calculation(resolved_org, calc_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/calculations/{calc_id}")
async def delete_calculation(
    calc_id: str,
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    resolved_org = _get_org_id(current_user, org_id)
    try:
        await service.delete_calculation(resolved_org, calc_id)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =========================================================================
# FULL CONFIG TREE (read-only)
# =========================================================================

@router.get("/tree")
async def get_config_tree(
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    """Return the full configuration tree for the organization."""
    resolved_org = _get_org_id(current_user, org_id)
    return await service.get_full_config_tree(resolved_org)


# =========================================================================
# MIGRATION / SEED
# =========================================================================

@router.post("/migrate-existing")
async def migrate_existing_config(
    org_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_admin_user),
):
    """Seed organization module config from existing esg_record_categories.
    Additive only — does not delete or modify existing records."""
    resolved_org = _get_org_id(current_user, org_id)
    from .seed import seed_from_existing_categories
    result = await seed_from_existing_categories(resolved_org, current_user["id"])
    return result
