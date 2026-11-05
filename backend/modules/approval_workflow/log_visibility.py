"""Who may see a newly created record in the data logs (GHG log table, KPI record list).

Each record created through an approval chain carries:
  log_creator_level  0 = created by an assignee, N = created by the approver at level N
  log_acted_max      highest level that has acted on the creation request (all levels once final)
  log_request_id     the creation request, so later edits/deletes never change visibility
An approver at level v sees an assignee's record once level v has acted; an approver-created record is
visible only to that approver and the levels above, once they have acted. Admins and the creator see everything.
Records without these fields (older data, direct saves by assignees) stay visible to everyone with access.
"""
from typing import Any, Dict, List, Optional, Tuple

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


def _scope_clause(assignment: Dict[str, Any]) -> Dict[str, Any]:
    """Records an assignment covers: its category tree (or GHG scope) and, for facility assignments, its facility."""
    clause: Dict[str, Any] = {}
    if assignment.get("category") == "GHG Emissions":
        sub = (assignment.get("subcategory") or "").lower()
        scope = next((name for name in ("scope1", "scope2", "scope3", "biogenic")
                      if name in sub.replace(" ", "") or (name == "biogenic" and "biogenic" in sub)), None)
        if scope:
            clause["scope"] = scope
    else:
        for field in ("category", "subcategory", "sub_subcategory"):
            if assignment.get(field):
                clause[field] = assignment[field]
    if assignment.get("facility_id") and assignment.get("assignment_level") != "organization":
        clause["facility_id"] = assignment["facility_id"]
    return clause


async def viewer_scopes(org_id: str, user_id: str) -> List[Tuple[int, Dict[str, Any]]]:
    """(chain level 1-based, records covered) for each assignment where the user is an approver."""
    docs = await db.esg_assignments.find(
        {"organization_id": org_id, "entity_type": "record_category", "$or": [{"approver_id": user_id}, {"approval_chain": user_id}]},
        {"_id": 0, "approval_chain": 1, "approver_id": 1, "category": 1, "subcategory": 1, "sub_subcategory": 1,
         "facility_id": 1, "assignment_level": 1}).to_list(500)
    return [(normalize_chain(d).index(user_id) + 1, _scope_clause(d)) for d in docs if user_id in normalize_chain(d)]


async def log_visibility_clause(current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Mongo clause limiting a log/list query to the records this user may see ({} for admins).

    A user's level only applies to records of the assignments where they approve; elsewhere they are an assignee.
    """
    if current_user.get("role") in ("admin", "super_admin", "org_admin"):
        return {}
    me = current_user["id"]
    scopes = await viewer_scopes(current_user.get("organization_id"), me)
    options: List[Dict[str, Any]] = [{"log_creator_level": {"$exists": False}}, {"created_by": me}]
    outside_approver_scopes: Dict[str, Any] = {"log_creator_level": 0}
    if scopes:
        outside_approver_scopes["$nor"] = [scope for _, scope in scopes]
    options.append(outside_approver_scopes)
    for level, scope in scopes:
        options += [
            {**scope, "log_creator_level": 0, "log_acted_max": {"$gte": level}},
            {**scope, "log_creator_level": level},
            {**scope, "log_creator_level": {"$gte": 1, "$lt": level}, "log_acted_max": {"$gte": level}},
        ]
    return {"$or": options}
