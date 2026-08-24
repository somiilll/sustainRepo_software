"""Reusable FastAPI dependencies for canonical entitlement enforcement."""
from fastapi import Depends, HTTPException

from modules.auth.dependencies import get_current_user
from .service import entitlement_access_map, resolve_entitlement_config, resolve_entitlements


async def assert_entitlement(org_id: str, entitlement: str) -> None:
    config = await resolve_entitlement_config(org_id, migrate=True)
    allowed = entitlement_access_map(config).get(entitlement, False)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"{entitlement.replace('_', ' ').title()} is not enabled for this organization")


async def get_resolved_entitlements(org_id: str) -> dict:
    """Return the detailed policy document without ever consulting legacy flags."""
    return await resolve_entitlement_config(org_id, migrate=True)


async def assert_ghg_scope_access(org_id: str, scope: str, biogenic_scope_selection: str | None = None) -> None:
    await assert_entitlement(org_id, "environment.ghg")
    normalized_scope = (scope or "").lower().replace(" ", "")
    is_scope_three = normalized_scope == "scope3" or (
        normalized_scope == "biogenic" and biogenic_scope_selection == "scope3"
    )
    if is_scope_three:
        await assert_entitlement(org_id, "environment.ghg.scope_3")
    elif normalized_scope in {"scope1", "scope2", "biogenic"}:
        await assert_entitlement(org_id, "environment.ghg.scope_1_2")


async def assert_monthly_row_limit(org_id: str, module_code: str, collection: str, query: dict) -> None:
    """Block a new monthly row once its Platform Access allowance is exhausted."""
    config = await get_resolved_entitlements(org_id)
    module = (config.get("environment") or {}).get(module_code) or {}
    if not module.get("enabled", False):
        raise HTTPException(status_code=403, detail=f"{module_code.replace('_', ' ').title()} is not enabled for this organization")
    limit = module.get("monthly_rows_allowed")
    if limit is None:
        return
    from shared.database.mongo import db
    current = await db[collection].count_documents(query)
    if current >= limit:
        raise HTTPException(status_code=403, detail=f"Monthly row limit reached for {module_code.replace('_', ' ')} ({limit}).")


async def assert_supplier_limit(org_id: str) -> None:
    config = await get_resolved_entitlements(org_id)
    settings = config["supplier_assessment"]
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="Supplier Assessment is not enabled for this organization")
    limit = settings.get("suppliers_allowed")
    if limit is None:
        return
    from shared.database.mongo import db
    current = await db.supplier_relationships.count_documents({"customer_org_id": org_id, "is_active": True})
    if current >= limit:
        raise HTTPException(status_code=403, detail=f"Supplier limit reached ({limit}).")


async def assert_mis_schedule_limit(org_id: str) -> None:
    config = await get_resolved_entitlements(org_id)
    settings = config["mis_reports"]
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="MIS Reports is not enabled for this organization")
    limit = settings.get("configurations_allowed")
    if limit is None:
        return
    from shared.database.mongo import db
    current = await db.mis_report_schedules.count_documents({"organization_id": org_id})
    if current >= limit:
        raise HTTPException(status_code=403, detail=f"MIS schedule limit reached ({limit}).")


async def assert_evidence_storage_limit(org_id: str, incoming_bytes: int) -> None:
    config = await get_resolved_entitlements(org_id)
    settings = config["evidence_storage"]
    if not settings["enabled"]:
        raise HTTPException(status_code=403, detail="Evidence Storage is not enabled for this organization")
    limit_gb = settings.get("storage_limit_gb")
    if limit_gb is None:
        return
    from shared.database.mongo import db
    totals = await db.uploaded_files.aggregate([
        {"$match": {"organization_id": org_id}},
        {"$group": {"_id": None, "bytes": {"$sum": "$file_size"}}},
    ]).to_list(1)
    used_bytes = (totals[0].get("bytes") or 0) if totals else 0
    if used_bytes + incoming_bytes > limit_gb * 1024 * 1024 * 1024:
        raise HTTPException(status_code=403, detail=f"Evidence storage limit reached ({limit_gb} GB).")


def require_entitlement(entitlement: str):
    async def dependency(current_user: dict = Depends(get_current_user)) -> None:
        if current_user.get("role") == "super_admin":
            return
        org_id = current_user.get("organization_id")
        if not org_id:
            raise HTTPException(status_code=400, detail="No organization assigned")
        await assert_entitlement(org_id, entitlement)

    return dependency