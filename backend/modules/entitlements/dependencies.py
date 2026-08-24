"""Reusable FastAPI dependencies for canonical entitlement enforcement."""
from fastapi import Depends, HTTPException

from modules.auth.dependencies import get_current_user
from .service import entitlement_access_map, resolve_entitlements


async def assert_entitlement(org_id: str, entitlement: str) -> None:
    top_level = await resolve_entitlements(org_id, migrate=True)
    if entitlement in top_level:
        allowed = top_level[entitlement]
    else:
        from shared.database.mongo import db
        config = await db["organization_config"].find_one({"organization_id": org_id}, {"_id": 0, "entitlements": 1})
        allowed = entitlement_access_map((config or {}).get("entitlements")).get(entitlement, False)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"{entitlement.replace('_', ' ').title()} is not enabled for this organization")


def require_entitlement(entitlement: str):
    async def dependency(current_user: dict = Depends(get_current_user)) -> None:
        if current_user.get("role") == "super_admin":
            return
        org_id = current_user.get("organization_id")
        if not org_id:
            raise HTTPException(status_code=400, detail="No organization assigned")
        await assert_entitlement(org_id, entitlement)

    return dependency