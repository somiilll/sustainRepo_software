"""
Emissions service — orchestration layer (Phase B4 skeleton).

In Phase B5 this service will orchestrate the full create/update pipeline:
    validate → normalize → calculate (calc-engine) → persist → audit → emit event → respond

For Phase B4 we expose a few thin helpers used by the modular read/list
routes:
  - resolve_user_record_filter() — converts a user dict + role into the
    appropriate facility-scoped query filter for `emission_records`.
  - check_record_access() — raises HTTPException(403) when the user
    cannot view/edit the given record.

These helpers replicate the EXACT permission semantics in server.py so
the modular routes return the same 403/404 codes as legacy routes.
"""
from typing import Any, Dict

from fastapi import HTTPException

from shared.database.mongo import db


async def resolve_user_record_filter(current_user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the Mongo filter for emission_records that respects the user's role:
      - super_admin → no filter
      - admin       → filter by org's facility ids
      - user        → filter by org's facility ids (KPI access handled separately)
    """
    role = current_user.get("role")
    if role == "super_admin":
        return {}

    if role == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return {"facility_id": {"$in": []}}
        org_facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0, "id": 1}).to_list(1000)
        facility_ids = [f["id"] for f in org_facilities]
        return {"facility_id": {"$in": facility_ids}}

    # user - get all org facilities, KPI access filtering is applied separately
    org_id = current_user.get("organization_id")
    if not org_id:
        return {"facility_id": {"$in": []}}
    org_facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0, "id": 1}).to_list(1000)
    facility_ids = [f["id"] for f in org_facilities]
    return {"facility_id": {"$in": facility_ids}}


async def check_record_access(record: Dict[str, Any], current_user: Dict[str, Any]) -> None:
    """
    Raise 403 if the user lacks access to the given emission record.
    Uses KPI assignment-based access control for users.
    """
    role = current_user.get("role")
    facility_id = record.get("facility_id")

    if role == "super_admin":
        return

    if role == "user":
        # Use KPI access helper for user access check
        from modules.esg_assignments.kpi_access_helper import kpi_access_helper
        can_access, reason = await kpi_access_helper.can_access_emission(
            user_id=current_user.get("id"),
            organization_id=current_user.get("organization_id"),
            scope=record.get("scope", "").lower(),
            facility_id=facility_id,
            reporting_period=record.get("reporting_period"),
        )
        if not can_access:
            raise HTTPException(status_code=403, detail="Not authorized")
        return

    if role == "admin":
        org_id = current_user.get("organization_id")
        facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0, "organization_id": 1})
        if not facility or facility.get("organization_id") != org_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        return
