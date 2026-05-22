"""Emission-specific approval flow.

Collection model
----------------
* `emission_records`           — only **approved** records live here. Dashboards,
                                  reports and the public list-endpoint use this
                                  collection unchanged.
* `pending_emission_records`   — all in-flight submissions. Each doc carries an
                                  `approval_status` of one of:
                                       pending_create | pending_update | pending_delete
                                       rejected_create | rejected_update | rejected_delete
                                  For `pending_update` / `pending_delete`, the doc's
                                  `id` matches the corresponding approved record
                                  (1:1 link) and `entity_snapshot` holds the
                                  proposed new values (for updates).

Hooks consumed by `modules/emissions/router.py`:
  - `intercept_create(record_dict, snapshot, current_user)` → bool (pending?)
  - `intercept_update(existing, source_collection, record_data, current_user)`
       → (action, payload)
  - `intercept_delete(existing, source_collection, current_user)`
       → (action, payload)
  - `find_emission_anywhere(record_id)` → (record, collection_name)
  - `merge_visible_emissions(approved, pending, current_user)` → list

`finalize_emission_decision(req, current_user)` is invoked by the approvals
router after admin's decide() — it moves docs across collections and writes
canonical history rows.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple

from modules.approvals.service import (
    cancel_pending_request,
    create_approval_request,
    is_approval_enabled_for_org,
    needs_approval,
    update_request_snapshot,
)
from shared.database.mongo import db
from shared.helpers.audit_helpers import compute_field_changes


# Collection names — single source of truth.
APPROVED_COLLECTION = "emission_records"
PENDING_COLLECTION = "pending_emission_records"


# Pending-status sentinel sets.
PENDING_STATUSES = ("pending_create", "pending_update", "pending_delete")
REJECTED_STATUSES = ("rejected_create", "rejected_update", "rejected_delete")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

async def find_emission_anywhere(record_id: str) -> Tuple[Optional[dict], Optional[str]]:
    """Return (record, collection_name) — checks approved first, then pending."""
    rec = await db[APPROVED_COLLECTION].find_one({"id": record_id}, {"_id": 0})
    if rec:
        return rec, APPROVED_COLLECTION
    rec = await db[PENDING_COLLECTION].find_one({"id": record_id}, {"_id": 0})
    if rec:
        return rec, PENDING_COLLECTION
    return None, None


# ---------------------------------------------------------------------------
# CREATE hook
# ---------------------------------------------------------------------------

async def intercept_create(record_dict: dict, snapshot: dict, current_user: dict) -> bool:
    """Decide whether a CREATE should be queued for approval.

    When queued: writes the record into `pending_emission_records` (NOT into
    emission_records), creates an approval_request, and returns True.
    When not queued: marks `approval_status="approved"` and returns False so
    the caller proceeds with the normal `emission_records` insert.
    """
    org_id = record_dict.get("organization_id")
    org_enabled = await is_approval_enabled_for_org(org_id)

    if not needs_approval(current_user, org_enabled):
        record_dict["approval_status"] = "approved"
        return False

    record_dict["approval_status"] = "pending_create"
    await db[PENDING_COLLECTION].insert_one(dict(record_dict))

    await create_approval_request(
        entity_type="emission",
        entity_id=record_dict["id"],
        entity_snapshot=snapshot,
        organization_id=org_id,
        submitter=current_user,
        request_type="create",
        metadata={
            "scope": record_dict.get("scope"),
            "category": record_dict.get("category"),
            "facility_id": record_dict.get("facility_id"),
        },
    )
    return True


# ---------------------------------------------------------------------------
# UPDATE hook
# ---------------------------------------------------------------------------

async def _refresh_approval_snapshot(entity_id: str, snapshot: dict) -> None:
    """Keep the open approval_request's snapshot in sync after an admin edit."""
    req = await db.approval_requests.find_one(
        {"entity_type": "emission", "entity_id": entity_id, "status": "pending"},
        {"_id": 0, "id": 1},
    )
    if req:
        await update_request_snapshot(req["id"], snapshot)


async def _auto_approve_admin_edit(
    existing: dict,
    source_collection: str,
    record_data,
    current_user: dict,
) -> dict:
    """Admin edit on a pending record → auto-approve into emission_records.

    Handles both:
      - pending_create: insert into emission_records, drop pending shadow.
      - pending_update: apply edited values onto the approved record, drop shadow.
    Finalizes the open approval_request, writes a history entry, and returns
    the final approved record dict. Caller (intercept_update) returns
    `("queue", final_record)` so the router does NOT double-write.
    """
    cur_status = existing.get("approval_status") or "approved"
    is_pending_create = cur_status == "pending_create"
    now = _now()

    snapshot = record_data.model_dump(exclude_unset=True)

    # Build the merged final record. Start from existing (preserves infra
    # fields like organization_id, created_by, etc.), overlay edited fields,
    # then stamp approved + admin metadata.
    base = await db[APPROVED_COLLECTION].find_one({"id": existing["id"]}, {"_id": 0}) if not is_pending_create else None
    base = base or existing
    final_record = dict(base)
    final_record.update(snapshot)
    final_record["id"] = existing["id"]
    final_record["approval_status"] = "approved"

    # Recalculate denormalized emission fields from outputs.
    outputs = final_record.get("outputs") or {}
    final_record["co2_emissions"] = (outputs.get("co2") or {}).get("value", 0) or 0
    final_record["ch4_emissions"] = (outputs.get("ch4") or {}).get("value", 0) or 0
    final_record["n2o_emissions"] = (outputs.get("n2o") or {}).get("value", 0) or 0
    final_record["co2e_emissions"] = (outputs.get("co2e") or {}).get("value", 0) or 0
    final_record["total_emissions"] = final_record["co2e_emissions"]

    # Version + admin metadata.
    if is_pending_create:
        final_record["version"] = 1
    else:
        final_record["version"] = (base.get("version", 0) or 0) + 1
    final_record["updated_at"] = now
    final_record["updated_by"] = current_user.get("id")
    final_record["updated_by_email"] = current_user.get("email", "")
    final_record["updated_by_name"] = current_user.get("full_name", "")
    final_record.pop("_id", None)

    # Persist into approved collection + cleanup pending shadow.
    if is_pending_create:
        await db[APPROVED_COLLECTION].insert_one(dict(final_record))
        await db[PENDING_COLLECTION].delete_one({"id": existing["id"]})
    else:
        update_dict = {k: v for k, v in final_record.items() if k not in ("id", "_id")}
        await db[APPROVED_COLLECTION].update_one(
            {"id": existing["id"]}, {"$set": update_dict}
        )
        await db[PENDING_COLLECTION].delete_one({"id": existing["id"]})

    # Finalize the open approval_request.
    req = await db.approval_requests.find_one(
        {"entity_type": "emission", "entity_id": existing["id"], "status": "pending"},
        {"_id": 0, "id": 1},
    )
    if req:
        await db.approval_requests.update_one(
            {"id": req["id"]},
            {"$set": {
                "status": "approved",
                "finalized_at": now,
                "finalized_by": current_user.get("id"),
                "final_comment": "Auto-approved via admin edit",
                "entity_snapshot": snapshot,
            }}
        )

    # Write history entry.
    if is_pending_create:
        history = {
            "id": str(uuid.uuid4()),
            "emission_id": existing["id"],
            "facility_id": final_record.get("facility_id"),
            "organization_id": final_record.get("organization_id"),
            "changed_by": current_user.get("id"),
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "changed_at": now,
            "changes": {
                "action": "created",
                "old_values": None,
                "new_values": final_record,
            },
        }
    else:
        field_changes = compute_field_changes(base, final_record)
        history = {
            "id": str(uuid.uuid4()),
            "emission_id": existing["id"],
            "facility_id": base.get("facility_id"),
            "organization_id": base.get("organization_id"),
            "scope": base.get("scope"),
            "category": base.get("category"),
            "changed_by": current_user.get("id"),
            "changed_by_email": current_user.get("email", ""),
            "changed_by_name": current_user.get("full_name", ""),
            "changed_at": now,
            "version": final_record["version"],
            "field_changes": field_changes,
            "changes_summary": f"{len(field_changes)} field(s) changed",
            "changes": {
                "action": "updated",
                "old_values": base,
                "new_values": final_record,
            },
        }
    await db.emission_history.insert_one(history)

    # Best-effort event-bus emission for live cockpit.
    try:
        from events.event_bus import event_bus, Events
        ev = Events.EMISSION_SAVED if is_pending_create else Events.EMISSION_UPDATED
        event_bus.emit_nowait(ev, {
            "record_id": final_record["id"],
            "scope": final_record.get("scope"),
            "category": final_record.get("category"),
            "facility_id": final_record.get("facility_id"),
            "organization_id": final_record.get("organization_id"),
            "user_id": current_user.get("id"),
        })
    except Exception:
        pass

    return final_record


async def intercept_update(
    existing: dict,
    source_collection: str,
    record_data,
    current_user: dict,
) -> Tuple[str, Optional[dict]]:
    """Decide what an UPDATE should do.

    Returns `(action, payload)`:
      - "apply"          → router proceeds with the normal emission_records
                            update + history write.
      - "queue"          → router must NOT touch emission_records. Hook has
                            written a `pending_update` doc; payload is the
                            response record (the original approved one).
      - "skip_history"   → router applies the update, but to the *pending*
                            doc (no history, version untouched).
                            Payload = {"target_collection": PENDING_COLLECTION}.
      - "block"          → router must raise HTTP 403 with `payload['detail']`.
    """
    org_id = existing.get("organization_id")
    org_enabled = await is_approval_enabled_for_org(org_id)
    if not org_enabled:
        return ("apply", None)

    role = current_user.get("role")
    cur_status = existing.get("approval_status") or "approved"
    snapshot = record_data.model_dump()

    # --------------------- USER role --------------------- #
    if role == "user":
        if cur_status == "pending_create":
            # Editing own pending submission before admin reviews.
            if existing.get("created_by") != current_user.get("id"):
                return ("block", {"detail": "Not authorized"})
            await _refresh_approval_snapshot(existing["id"], snapshot)
            return ("skip_history", {"target_collection": PENDING_COLLECTION})

        if cur_status in PENDING_STATUSES or cur_status in REJECTED_STATUSES:
            return ("block", {"detail": "Record is not editable in its current state"})

        # cur_status == "approved" → queue a new pending_update doc.
        pending_doc = dict(existing)
        pending_doc.update(snapshot)
        pending_doc["id"] = existing["id"]  # 1:1 link to approved record
        pending_doc["approval_status"] = "pending_update"
        pending_doc["proposed_by"] = current_user.get("id")
        pending_doc["proposed_by_email"] = current_user.get("email", "")
        pending_doc["proposed_by_name"] = current_user.get("full_name", "")
        pending_doc["proposed_at"] = _now()

        # Upsert by id (allows re-submission once a previous proposal is cleared).
        await db[PENDING_COLLECTION].replace_one(
            {"id": existing["id"]}, pending_doc, upsert=True
        )

        await create_approval_request(
            entity_type="emission",
            entity_id=existing["id"],
            entity_snapshot=snapshot,
            organization_id=org_id,
            submitter=current_user,
            request_type="update",
            metadata={
                "scope": existing.get("scope"),
                "category": existing.get("category"),
                "facility_id": existing.get("facility_id"),
            },
        )
        return ("queue", existing)

    # --------------------- ADMIN / SUPER_ADMIN --------------------- #
    if role in ("admin", "super_admin"):
        # Admin edit on a pending record auto-approves it.
        if cur_status == "pending_create" or cur_status == "pending_update":
            final_record = await _auto_approve_admin_edit(
                existing, source_collection, record_data, current_user
            )
            return ("queue", final_record)

        if cur_status == "pending_delete":
            return ("block", {"detail": "Cannot edit a record awaiting deletion approval"})

        if cur_status in REJECTED_STATUSES:
            return ("block", {"detail": "Cannot edit a rejected record"})

        # Approved record → normal path.
        return ("apply", None)

    return ("apply", None)


# ---------------------------------------------------------------------------
# DELETE hook
# ---------------------------------------------------------------------------

async def intercept_delete(
    existing: dict,
    source_collection: str,
    current_user: dict,
) -> Tuple[str, Optional[dict]]:
    """Decide what a DELETE should do.

    Returns `(action, payload)`:
      - "apply"          → router performs the actual delete on
                            `payload['target_collection']` and (if approved)
                            cancels any open approval_request.
      - "queue"          → router must NOT delete. Hook has written a
                            `pending_delete` doc.
      - "block"          → router must raise HTTP 403.
    """
    org_id = existing.get("organization_id")
    org_enabled = await is_approval_enabled_for_org(org_id)
    if not org_enabled:
        return ("apply", {"target_collection": source_collection})

    role = current_user.get("role")
    cur_status = existing.get("approval_status") or "approved"

    if role == "user":
        if cur_status == "pending_create":
            # User cancels their own pending submission.
            if existing.get("created_by") != current_user.get("id"):
                return ("block", {"detail": "Not authorized"})
            await cancel_pending_request("emission", existing["id"])
            return ("apply", {"target_collection": PENDING_COLLECTION})

        if cur_status in PENDING_STATUSES or cur_status in REJECTED_STATUSES:
            return ("block", {"detail": "Record is not deletable in its current state"})

        # Approved → queue a delete request.
        pending_doc = dict(existing)
        pending_doc["id"] = existing["id"]
        pending_doc["approval_status"] = "pending_delete"
        pending_doc["proposed_by"] = current_user.get("id")
        pending_doc["proposed_by_email"] = current_user.get("email", "")
        pending_doc["proposed_by_name"] = current_user.get("full_name", "")
        pending_doc["proposed_at"] = _now()

        await db[PENDING_COLLECTION].replace_one(
            {"id": existing["id"]}, pending_doc, upsert=True
        )

        await create_approval_request(
            entity_type="emission",
            entity_id=existing["id"],
            entity_snapshot=existing,
            organization_id=org_id,
            submitter=current_user,
            request_type="delete",
            metadata={
                "scope": existing.get("scope"),
                "category": existing.get("category"),
                "facility_id": existing.get("facility_id"),
            },
        )
        return ("queue", None)

    # Admin / super-admin force-delete: drop pending request, then delete from
    # whichever collection holds the record.
    if role in ("admin", "super_admin"):
        await cancel_pending_request("emission", existing["id"])
        # Also wipe any pending shadow doc.
        await db[PENDING_COLLECTION].delete_one({"id": existing["id"]})
        return ("apply", {"target_collection": source_collection})

    return ("apply", {"target_collection": source_collection})


# ---------------------------------------------------------------------------
# Listing — merge approved + pending so the FE inbox/list stays one feed.
# ---------------------------------------------------------------------------

async def fetch_pending_for_user(current_user: dict, base_query: dict) -> list:
    """Return pending_emission_records visible in the GHG ledger.

    GHG ledger semantics (different from the Approvals inbox):
      - super_admin / admin: should NOT see any pending / rejected records here.
        Those live in the dedicated Approvals section. Returning [] keeps the
        ledger showing only approved records.
      - regular user: see only their own non-rejected pending submissions
        (so the FE can stamp the "Pending for approval" badge).
    """
    role = current_user.get("role")
    if role in ("super_admin", "admin"):
        return []

    query = dict(base_query)
    query["created_by"] = current_user.get("id")
    query["approval_status"] = {"$nin": list(REJECTED_STATUSES)}

    return await db[PENDING_COLLECTION].find(query, {"_id": 0}).to_list(10000)


def merge_visible_emissions(approved: list, pending: list) -> list:
    """Merge approved + pending feeds into one list for the UI.

    * pending_create / rejected_create are appended (no twin in approved).
    * pending_update / pending_delete carry the approved twin's id — we leave
      the approved record in place and just stamp `approval_status` on it so
      the FE can badge it.
    """
    pending_by_id = {p["id"]: p for p in pending}
    out = []
    for rec in approved:
        twin = pending_by_id.get(rec["id"])
        if twin and twin.get("approval_status") in ("pending_update", "pending_delete"):
            rec["approval_status"] = twin["approval_status"]
        else:
            rec.setdefault("approval_status", "approved")
        out.append(rec)

    seen = {r["id"] for r in out}
    for p in pending:
        if p["id"] in seen:
            continue
        # Only standalone create-style proposals end up here.
        if p.get("approval_status") in ("pending_create", "rejected_create"):
            out.append(p)
    return out


# ---------------------------------------------------------------------------
# Finalization (called by approvals router after a decide())
# ---------------------------------------------------------------------------

async def finalize_emission_decision(req: dict, current_user: dict) -> None:
    """Apply side-effects of an approve/reject on an emission entity."""
    if req.get("entity_type") != "emission":
        return

    entity_id = req["entity_id"]
    request_type = req.get("request_type", "create")
    final_status = req.get("status")

    if final_status == "approved":
        if request_type == "create":
            await _approve_create(entity_id, req)
        elif request_type == "update":
            await _approve_update(entity_id, req)
        elif request_type == "delete":
            await _approve_delete(entity_id)
    elif final_status == "rejected":
        new_status = {
            "create": "rejected_create",
            "update": "rejected_update",
            "delete": "rejected_delete",
        }.get(request_type)
        if new_status:
            await db[PENDING_COLLECTION].update_one(
                {"id": entity_id},
                {"$set": {"approval_status": new_status}},
            )


async def _approve_create(entity_id: str, req: dict) -> None:
    """Move pending_create doc into emission_records and write history."""
    pending = await db[PENDING_COLLECTION].find_one({"id": entity_id}, {"_id": 0})
    if not pending:
        return

    record = dict(pending)
    record["approval_status"] = "approved"
    await db[APPROVED_COLLECTION].insert_one(record)
    await db[PENDING_COLLECTION].delete_one({"id": entity_id})

    history = {
        "id": str(uuid.uuid4()),
        "emission_id": entity_id,
        "facility_id": record.get("facility_id"),
        "organization_id": record.get("organization_id"),
        "changed_by": req.get("submitted_by"),
        "changed_by_email": req.get("submitted_by_email", ""),
        "changed_by_name": req.get("submitted_by_name", ""),
        "changed_at": _now(),
        "changes": {
            "action": "created",
            "old_values": None,
            "new_values": req.get("entity_snapshot") or record,
        },
    }
    await db.emission_history.insert_one(history)


async def _approve_update(entity_id: str, req: dict) -> None:
    """Apply the held snapshot to the approved record and write update history."""
    existing = await db[APPROVED_COLLECTION].find_one({"id": entity_id}, {"_id": 0})
    if not existing:
        # Stale request — drop the pending doc and stop.
        await db[PENDING_COLLECTION].delete_one({"id": entity_id})
        return

    new_values = dict(req.get("entity_snapshot") or {})
    outputs = new_values.get("outputs") or {}
    update_dict = dict(new_values)
    update_dict["co2_emissions"] = (outputs.get("co2") or {}).get("value", 0) or 0
    update_dict["ch4_emissions"] = (outputs.get("ch4") or {}).get("value", 0) or 0
    update_dict["n2o_emissions"] = (outputs.get("n2o") or {}).get("value", 0) or 0
    update_dict["co2e_emissions"] = (outputs.get("co2e") or {}).get("value", 0) or 0
    update_dict["total_emissions"] = update_dict["co2e_emissions"]
    update_dict["updated_at"] = _now()
    update_dict["updated_by"] = req.get("submitted_by")
    update_dict["updated_by_email"] = req.get("submitted_by_email", "")
    update_dict["updated_by_name"] = req.get("submitted_by_name", "")
    update_dict["version"] = (existing.get("version", 0) or 0) + 1
    update_dict["approval_status"] = "approved"

    field_changes = compute_field_changes(existing, update_dict)
    history = {
        "id": str(uuid.uuid4()),
        "emission_id": entity_id,
        "facility_id": existing.get("facility_id"),
        "organization_id": existing.get("organization_id"),
        "scope": existing.get("scope"),
        "category": existing.get("category"),
        "changed_by": req.get("submitted_by"),
        "changed_by_email": req.get("submitted_by_email", ""),
        "changed_by_name": req.get("submitted_by_name", ""),
        "changed_at": _now(),
        "version": update_dict["version"],
        "field_changes": field_changes,
        "changes_summary": f"{len(field_changes)} field(s) changed",
        "changes": {
            "action": "updated",
            "old_values": existing,
            "new_values": update_dict,
        },
    }
    await db.emission_history.insert_one(history)
    await db[APPROVED_COLLECTION].update_one({"id": entity_id}, {"$set": update_dict})
    await db[PENDING_COLLECTION].delete_one({"id": entity_id})


async def _approve_delete(entity_id: str) -> None:
    """Actually delete the approved record after admin approval."""
    await db[APPROVED_COLLECTION].delete_one({"id": entity_id})
    await db[PENDING_COLLECTION].delete_one({"id": entity_id})


__all__ = [
    "APPROVED_COLLECTION",
    "PENDING_COLLECTION",
    "PENDING_STATUSES",
    "REJECTED_STATUSES",
    "find_emission_anywhere",
    "intercept_create",
    "intercept_update",
    "intercept_delete",
    "finalize_emission_decision",
    "fetch_pending_for_user",
    "merge_visible_emissions",
]