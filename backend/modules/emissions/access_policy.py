"""Authoritative facility and workflow policy for organization GHG data."""
from dataclasses import dataclass
from typing import Any, Dict, FrozenSet, Optional

from fastapi import HTTPException

from modules.esg_assignments.kpi_access_helper import kpi_access_helper
from modules.sustainability_config.service import resolve_organization_settings
from shared.database.mongo import db


GHG_SCOPES = ("scope1", "scope2", "scope3", "biogenic")


def _and_query(base: Dict[str, Any], boundary: Dict[str, Any]) -> Dict[str, Any]:
    if not base:
        return boundary
    return {"$and": [base, boundary]}


@dataclass(frozen=True)
class GHGAccessScope:
    organization_id: Optional[str]
    mode: str
    organization_facility_ids: FrozenSet[str]
    allowed_facility_ids: Optional[FrozenSet[str]] = None
    workflow_access: Optional[Dict[str, Any]] = None

    @property
    def has_full_access(self) -> bool:
        return self.mode in {"super_admin", "admin", "supplier"} or bool(
            self.workflow_access and self.workflow_access.get("has_full_access")
        )

    def facilities_for_scope(self, scope: Optional[str] = None) -> FrozenSet[str]:
        if self.mode == "super_admin":
            return self.organization_facility_ids
        if self.mode in {"admin", "supplier"}:
            return self.organization_facility_ids
        if self.mode == "facility_assignment":
            return self.allowed_facility_ids or frozenset()

        access = self.workflow_access or {}
        if access.get("has_full_access"):
            return self.organization_facility_ids
        restrictions = access.get("facility_restrictions") or {}
        allowed_scopes = set(access.get("allowed_scopes") or [])
        scopes = [scope] if scope else list(allowed_scopes)
        allowed = set()
        for current_scope in scopes:
            if current_scope not in allowed_scopes:
                continue
            scoped_facilities = restrictions.get(current_scope)
            if scoped_facilities is None:
                return self.organization_facility_ids
            allowed.update(scoped_facilities)
        return frozenset(allowed) & self.organization_facility_ids

    def can_access_emission(self, record: Dict[str, Any]) -> bool:
        if self.mode == "super_admin":
            return True
        if record.get("organization_id") and record.get("organization_id") != self.organization_id:
            return False
        facility_id = record.get("facility_id")
        if facility_id not in self.organization_facility_ids:
            return False
        scope = str(record.get("scope") or "").lower()
        return facility_id in self.facilities_for_scope(scope)

    def assert_emission_access(self, record: Dict[str, Any]) -> None:
        if not self.can_access_emission(record):
            raise HTTPException(status_code=403, detail="You do not have access to this GHG record")

    def assert_facility_access(self, facility_id: str, scope: Optional[str] = None) -> None:
        if self.mode == "super_admin":
            return
        if facility_id not in self.facilities_for_scope(scope):
            raise HTTPException(status_code=403, detail="You do not have access to this facility")

    def can_access_sink(self, record: Dict[str, Any]) -> bool:
        if self.mode == "super_admin":
            return True
        if record.get("organization_id") != self.organization_id:
            return False
        facility_id = record.get("facility_id")
        if self.mode == "admin":
            return facility_id is None or facility_id in self.organization_facility_ids
        if self.mode in {"supplier", "facility_assignment"}:
            return bool(facility_id and facility_id in self.facilities_for_scope())
        access = self.workflow_access or {}
        if not access.get("has_sinks_access"):
            return False
        restrictions = (access.get("facility_restrictions") or {}).get("sinks")
        if restrictions is None:
            return facility_id is None or facility_id in self.organization_facility_ids
        return bool(facility_id and facility_id in restrictions and facility_id in self.organization_facility_ids)

    def assert_sink_access(self, record: Dict[str, Any]) -> None:
        if not self.can_access_sink(record):
            raise HTTPException(status_code=403, detail="You do not have access to this carbon sink record")

    def emission_query(self, base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        base = dict(base or {})
        if self.mode == "super_admin":
            return base
        if self.mode in {"admin", "supplier", "facility_assignment"} or self.has_full_access:
            boundary = {"facility_id": {"$in": list(self.facilities_for_scope())}}
            return _and_query(base, boundary)

        access = self.workflow_access or {}
        restrictions = access.get("facility_restrictions") or {}
        predicates = []
        for scope in access.get("allowed_scopes") or []:
            facility_ids = restrictions.get(scope)
            permitted = self.organization_facility_ids if facility_ids is None else (
                frozenset(facility_ids) & self.organization_facility_ids
            )
            if permitted:
                predicates.append({"scope": scope, "facility_id": {"$in": list(permitted)}})
        boundary = {"$or": predicates} if predicates else {"facility_id": {"$in": []}}
        return _and_query(base, boundary)

    def sink_query(self, base: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        base = dict(base or {})
        if self.mode == "super_admin":
            return base
        if self.mode == "admin":
            return _and_query(base, {
                "organization_id": self.organization_id,
                "$or": [
                    {"facility_id": {"$in": list(self.organization_facility_ids)}},
                    {"facility_id": None},
                ],
            })
        if self.mode in {"supplier", "facility_assignment"}:
            return _and_query(base, {"facility_id": {"$in": list(self.facilities_for_scope())}})
        access = self.workflow_access or {}
        if not access.get("has_sinks_access"):
            return _and_query(base, {"facility_id": {"$in": []}})
        restrictions = (access.get("facility_restrictions") or {}).get("sinks")
        if restrictions is None:
            return _and_query(base, {
                "organization_id": self.organization_id,
                "$or": [
                    {"facility_id": {"$in": list(self.organization_facility_ids)}},
                    {"facility_id": None},
                ],
            })
        permitted = self.organization_facility_ids if restrictions is None else (
            frozenset(restrictions) & self.organization_facility_ids
        )
        return _and_query(base, {"facility_id": {"$in": list(permitted)}})

    def filter_emissions(self, records: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
        return records if self.mode == "super_admin" else [record for record in records if self.can_access_emission(record)]

    def as_response(self) -> Dict[str, Any]:
        if self.mode == "workflow":
            return {**(self.workflow_access or {}), "access_mode": "workflow"}
        full = self.mode in {"super_admin", "admin", "supplier"}
        allowed = None if full else list(self.allowed_facility_ids or [])
        return {
            "access_mode": self.mode,
            "has_full_access": full,
            "allowed_scopes": list(GHG_SCOPES),
            "allowed_subcategories": [],
            "facility_restrictions": {scope: allowed for scope in GHG_SCOPES},
            "period_restrictions": {},
            "has_sinks_access": True,
        }


async def resolve_ghg_access_scope(
    current_user: Dict[str, Any], reporting_period: Optional[str] = None
) -> GHGAccessScope:
    role = current_user.get("role", "user")
    organization_id = current_user.get("organization_id")
    if role == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0, "id": 1}).to_list(10000)
        return GHGAccessScope(None, "super_admin", frozenset(f["id"] for f in facilities if f.get("id")))
    if not organization_id:
        return GHGAccessScope(None, "denied", frozenset(), frozenset())

    facilities = await db.facilities.find(
        {"organization_id": organization_id}, {"_id": 0, "id": 1}
    ).to_list(10000)
    organization_facility_ids = frozenset(f["id"] for f in facilities if f.get("id"))
    if role in {"admin", "org_admin"}:
        return GHGAccessScope(organization_id, "admin", organization_facility_ids)
    if current_user.get("user_type") == "supplier":
        return GHGAccessScope(organization_id, "supplier", organization_facility_ids)

    settings = await resolve_organization_settings(organization_id)
    if settings.get("approval_workflow_enabled"):
        workflow_access = await kpi_access_helper.get_allowed_ghg_scopes(
            user_id=current_user.get("id"),
            organization_id=organization_id,
            reporting_period=reporting_period,
        )
        return GHGAccessScope(
            organization_id,
            "workflow",
            organization_facility_ids,
            workflow_access=workflow_access,
        )

    assigned = frozenset(current_user.get("assigned_facilities") or []) & organization_facility_ids
    return GHGAccessScope(
        organization_id,
        "facility_assignment",
        organization_facility_ids,
        allowed_facility_ids=assigned,
    )