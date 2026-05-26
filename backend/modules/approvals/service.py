"""Approvals service — generic, entity-agnostic approval logic.

Handles request listing, pending counts, and stage-decision mechanics.
Entity-specific finalization (e.g. writing emission history on approve)
lives in `emission_flow.py` to keep this module pure.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from shared.database.mongo import db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def is_approval_enabled_for_org(organization_id: Optional[str]) -> bool:
    """True when the org has the approval workflow flag turned on."""
    if not organization_id:
        return False
    org = await db.organizations.find_one(
        {"id": organization_id},
        {"_id": 0, "approval_workflow_enabled": 1},
    )
    return bool(org and org.get("approval_workflow_enabled"))


def needs_approval(user: dict, org_enabled: bool) -> bool:
    """MVP rule: only `user` role triggers approval; admin/super-admin auto-publish."""
    return bool(org_enabled) and user.get("role") == "user"


def build_default_stages() -> list:
    """Single-stage Admin Review chain. Multi-stage support is just extra entries."""
    return [
        {
            "stage_index": 0,
            "name": "Admin Review",
            "required_role": "admin",
            "required_user_ids": [],
            "approval_type": "any",
            "decisions": [],
            "status": "pending",
        }
    ]


async def create_approval_request(
    *,
    entity_type: str,
    entity_id: str,
    entity_snapshot: dict,
    organization_id: str,
    submitter: dict,
    request_type: str = "create",
    metadata: Optional[dict] = None,
    original_snapshot: Optional[dict] = None,
) -> dict:
    """Persist and return a new approval-request document."""
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": organization_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_snapshot": entity_snapshot,
        "request_type": request_type,
        "submitted_by": submitter.get("id"),
        "submitted_by_email": submitter.get("email", ""),
        "submitted_by_name": submitter.get("full_name", ""),
        "submitted_at": _now(),
        "status": "pending",
        "current_stage": 0,
        "stages": build_default_stages(),
        "finalized_at": None,
        "finalized_by": None,
        "final_comment": None,
        "metadata": metadata or {},
        "edit_history": [],
        "original_snapshot": original_snapshot,  # Store original values for update requests
    }
    await db.approval_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_requests_for_user(current_user: dict, status: Optional[str] = None) -> list:
    """Admins see their org; users see their own submissions."""
    query: dict = {}
    role = current_user.get("role")
    if role == "super_admin":
        pass
    elif role == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return []
        query["organization_id"] = org_id
    else:
        query["submitted_by"] = current_user.get("id")

    if status:
        query["status"] = status

    cursor = db.approval_requests.find(query, {"_id": 0}).sort("submitted_at", -1)
    return await cursor.to_list(2000)


async def count_pending_for_admin(current_user: dict) -> int:
    """Quick badge count for the admin inbox."""
    role = current_user.get("role")
    if role == "super_admin":
        return await db.approval_requests.count_documents({"status": "pending"})
    if role == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return 0
        return await db.approval_requests.count_documents({
            "organization_id": org_id,
            "status": "pending",
        })
    return 0


async def get_request(request_id: str) -> Optional[dict]:
    return await db.approval_requests.find_one({"id": request_id}, {"_id": 0})


async def update_request_snapshot(request_id: str, snapshot: dict) -> None:
    """Refresh the held snapshot on a pending request (e.g. admin edits)."""
    await db.approval_requests.update_one(
        {"id": request_id},
        {"$set": {"entity_snapshot": snapshot}},
    )


async def cancel_pending_request(entity_type: str, entity_id: str) -> None:
    """Drop any open approval requests for an entity (used when admin force-deletes)."""
    await db.approval_requests.delete_many({
        "entity_type": entity_type,
        "entity_id": entity_id,
        "status": "pending",
    })


def authorize_decider(req: dict, current_user: dict) -> bool:
    """Only same-org admin (or super-admin) may decide on a request."""
    role = current_user.get("role")
    if role == "super_admin":
        return True
    if role != "admin":
        return False
    return req.get("organization_id") == current_user.get("organization_id")


def apply_stage_decision(req: dict, action: str, comment: Optional[str], current_user: dict) -> dict:
    """Mutate the request dict to record this approver's decision and advance state.

    Pure data manipulation — DB writes happen in `decide()`.
    """
    stages = req.get("stages") or []
    cur_idx = req.get("current_stage", 0)
    if cur_idx >= len(stages):
        return req

    stage = stages[cur_idx]
    decision = {
        "user_id": current_user.get("id"),
        "user_email": current_user.get("email", ""),
        "user_name": current_user.get("full_name", ""),
        "action": "approved" if action == "approve" else "rejected",
        "comment": comment,
        "decided_at": _now(),
    }
    stage.setdefault("decisions", []).append(decision)

    if action == "reject":
        stage["status"] = "rejected"
        req["status"] = "rejected"
        req["finalized_at"] = _now()
        req["finalized_by"] = current_user.get("id")
        req["final_comment"] = comment
    else:
        stage["status"] = "approved"
        if cur_idx + 1 < len(stages):
            req["current_stage"] = cur_idx + 1
        else:
            req["status"] = "approved"
            req["finalized_at"] = _now()
            req["finalized_by"] = current_user.get("id")
            req["final_comment"] = comment

    req["stages"] = stages
    return req


async def persist_decision(req: dict) -> None:
    await db.approval_requests.update_one({"id": req["id"]}, {"$set": {
        "stages": req["stages"],
        "current_stage": req["current_stage"],
        "status": req["status"],
        "finalized_at": req.get("finalized_at"),
        "finalized_by": req.get("finalized_by"),
        "final_comment": req.get("final_comment"),
    }})
