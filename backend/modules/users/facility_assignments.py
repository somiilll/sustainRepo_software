"""Validation shared by organization admins and platform super admins."""
from typing import Iterable

from fastapi import HTTPException

from modules.sustainability_config.service import resolve_organization_settings
from shared.database.mongo import db


async def validate_direct_facility_assignments(organization_id: str, facility_ids: Iterable[str]) -> list[str]:
    unique_ids = list(dict.fromkeys(item for item in facility_ids if item))
    if not unique_ids:
        raise HTTPException(status_code=422, detail="Select at least one facility for this user")
    valid = await db.facilities.find(
        {"organization_id": organization_id, "id": {"$in": unique_ids}},
        {"_id": 0, "id": 1},
    ).to_list(len(unique_ids))
    valid_ids = {facility["id"] for facility in valid}
    invalid_ids = [facility_id for facility_id in unique_ids if facility_id not in valid_ids]
    if invalid_ids:
        raise HTTPException(status_code=422, detail="One or more selected facilities do not belong to this organization")
    return unique_ids


async def direct_assignments_for_new_user(organization_id: str, facility_ids: Iterable[str]) -> list[str]:
    settings = await resolve_organization_settings(organization_id)
    if settings.get("approval_workflow_enabled"):
        return []
    return await validate_direct_facility_assignments(organization_id, facility_ids)


async def assert_direct_assignment_mode(organization_id: str) -> None:
    settings = await resolve_organization_settings(organization_id)
    if settings.get("approval_workflow_enabled"):
        raise HTTPException(
            status_code=409,
            detail="Direct facility assignments are disabled because this organization uses workflow assignments",
        )