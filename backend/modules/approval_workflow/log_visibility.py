"""Who may see a newly created record in the data logs (GHG log table, KPI record list).

Each record created through an approval chain carries:
  log_creator_level  0 = created by an assignee, N = created by the approver at level N
  log_acted_max      highest level that has acted on the creation request (all levels once final)
  log_request_id     the creation request, so later edits/deletes never change visibility
An approver at level v sees an assignee's record once level v has acted; an approver-created record is
visible only to that approver and the levels above, once they have acted. Admins and the creator see everything.
Records without these fields (older data, direct saves by assignees) stay visible to everyone with access.
"""
from typing import Any, Dict, List, Optional

from shared.database.mongo import db

from .approver_chain import normalize_chain

LOG_COLLECTIONS = ("emission_records", "environment_records", "social_records", "governance_records")


def creator_level(assignment: Optional[Dict[str, Any]], user_id: str) -> int:
    chain = normalize_chain(assignment)
    return chain.index(user_id) + 1 if user_id in chain else 0


async def stamp_on_create(collection: str, record_id: str, level: int, request_id: Optional[str], chain_len: int) -> None:
    """Mark a new record. Without a request (final approver saved directly) it is already fully acted on."""
    await db[collection].update_one({"id": record_id}, {"$set": {
        "log_creator_level": level, "log_request_id": request_id,
        "log_acted_max": level if request_id else chain_len}})


def _acted_max(request: Dict[str, Any], creator: int) -> int:
    steps = request.get("steps_completed") or []
    if request.get("status") == "approved":
        return request.get("total_levels") or 1
    if request.get("status") == "rejected":
        rejected = [s.get("level") or 1 for s in steps if s.get("action") == "reject"]
        return max(rejected) if rejected else (request.get("current_level") or 1)
    approved = [s.get("level") or 1 for s in steps if s.get("action") == "approve"]
    return max(approved + [creator])


async def refresh_for_request(request_id: str) -> None:
    """Re-derive log_acted_max after a creation request is approved at a level, finalized or rejected."""
    request = await db.approval_requests.find_one({"id": request_id}, {"_id": 0})
    if not request or request.get("request_type") == "delete":
        return
    for collection in LOG_COLLECTIONS:
        record = await db[collection].find_one({"id": request.get("entity_id"), "log_request_id": request_id}, {"_id": 0, "log_creator_level": 1})
        if record:
            acted = _acted_max(request, record.get("log_creator_level") or 0)
            await db[collection].update_one({"id": request["entity_id"]}, {"$set": {"log_acted_max": acted}})
            return


async def viewer_levels(org_id: str, user_id: str) -> List[int]:
    """Distinct chain positions (1-based) the user holds across the organization's assignments."""
    docs = await db.esg_assignments.find(
        {"organization_id": org_id, "entity_type": "record_category", "$or": [{"approver_id": user_id}, {"approval_chain": user_id}]},
        {"_id": 0, "approval_chain": 1, "approver_id": 1}).to_list(500)
    return sorted({normalize_chain(d).index(user_id) + 1 for d in docs if user_id in normalize_chain(d)})


async def log_visibility_clause(current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Mongo clause limiting a log/list query to the records this user may see ({} for admins)."""
    if current_user.get("role") in ("admin", "super_admin", "org_admin"):
        return {}
    me = current_user["id"]
    levels = await viewer_levels(current_user.get("organization_id"), me)
    options: List[Dict[str, Any]] = [{"log_creator_level": {"$exists": False}}, {"created_by": me}]
    if not levels:
        options.append({"log_creator_level": 0})
    for level in levels:
        options += [
            {"log_creator_level": 0, "log_acted_max": {"$gte": level}},
            {"log_creator_level": level},
            {"log_creator_level": {"$gte": 1, "$lt": level}, "log_acted_max": {"$gte": level}},
        ]
    return {"$or": options}
