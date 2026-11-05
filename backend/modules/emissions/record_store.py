"""GHG record lookup and the per-user ledger view. Approval state lives on the record and its approval request."""
from typing import Any, Dict, List, Optional, Tuple

from modules.emissions.access_policy import resolve_ghg_access_scope
from shared.database.mongo import db

APPROVED_COLLECTION = "emission_records"
STATUS_PENDING_DELETE = "pending_delete"
REJECTED_STATUSES = ("rejected_create", "rejected_update", "rejected_delete")
_OPEN_REQUEST = {"$in": ["pending", "in_review"]}


async def is_approval_enabled_for_org(organization_id: Optional[str]) -> bool:
    if not organization_id:
        return False
    org = await db.organizations.find_one({"id": organization_id}, {"_id": 0, "approval_workflow_enabled": 1})
    return bool(org and org.get("approval_workflow_enabled"))


async def find_record(record_id: str) -> Tuple[Optional[dict], Optional[str]]:
    """(record, collection) or (None, None)."""
    record = await db[APPROVED_COLLECTION].find_one({"id": record_id}, {"_id": 0})
    return (record, APPROVED_COLLECTION) if record else (None, None)


def _overlay_proposal(record: Dict[str, Any], proposed: Dict[str, Any]) -> None:
    """Show the submitter their own pending values on top of the approved record."""
    if proposed.get("inputs"):
        record["dynamic_field_values"] = proposed["inputs"]
    outputs = proposed.get("outputs")
    if outputs:
        record["outputs"] = outputs
        record["co2_emissions"] = (outputs.get("co2") or {}).get("value", 0) or 0
        record["ch4_emissions"] = (outputs.get("ch4") or {}).get("value", 0) or 0
        record["n2o_emissions"] = (outputs.get("n2o") or {}).get("value", 0) or 0
        record["co2e_emissions"] = (outputs.get("co2e") or {}).get("value", 0) or 0
        record["total_emissions"] = record["co2e_emissions"]


async def fetch_emissions_for_user(current_user: dict, query: Optional[dict] = None) -> List[dict]:
    """Records the user may see, flagged with pending update proposals (their own are overlaid on the record)."""
    query = query or {}
    period = query.get("reporting_period") if isinstance(query.get("reporting_period"), str) else None
    base_query = (await resolve_ghg_access_scope(current_user, period)).emission_query(query)
    records = await db[APPROVED_COLLECTION].find(base_query, {"_id": 0}).to_list(10000)

    is_admin = current_user.get("role", "user") in ("admin", "super_admin")
    user_id = current_user.get("id")
    requests = await db.approval_requests.find(
        {"entity_type": "emission_record", "request_type": {"$ne": "delete"}, "status": _OPEN_REQUEST},
        {"_id": 0, "entity_id": 1, "submitted_by": 1, "submitted_by_name": 1, "entity_snapshot": 1},
    ).to_list(10000)
    mine = {r["entity_id"]: (r.get("entity_snapshot") or {}).get("proposed_changes") or {}
            for r in requests if r.get("submitted_by") == user_id and not is_admin}
    others = {r["entity_id"]: r for r in requests if is_admin or r.get("submitted_by") != user_id}

    for record in records:
        if record["id"] in mine and mine[record["id"]]:
            _overlay_proposal(record, mine[record["id"]])
            record["is_my_pending_proposal"] = True
            record["approval_status"] = "pending_approval"
        elif record["id"] in others:
            record["has_pending_proposal"] = True
            record["pending_proposal_by"] = others[record["id"]].get("submitted_by_name")
            record["pending_proposal_status"] = "pending_approval"
    return records
