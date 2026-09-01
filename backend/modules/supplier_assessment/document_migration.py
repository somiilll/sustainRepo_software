"""Idempotent migration from legacy document response collections."""
import uuid
from datetime import datetime, timezone


async def migrate_legacy_document_responses(database) -> dict[str, int]:
    """Copy legacy acceptances/status responses into canonical submissions once."""
    migrated = {"acceptances": 0, "responses": 0}
    for source_name, response_mode in (("supplier_document_acceptances", "ACCEPTANCE"), ("supplier_document_responses", "STATUS")):
        legacy_rows = await database[source_name].find({}, {"_id": 0}).to_list(100000)
        for row in legacy_rows:
            legacy_id = row.get("id")
            if not legacy_id:
                continue
            existing = await database.supplier_document_submissions.find_one(
                {"legacy_source": source_name, "legacy_record_id": legacy_id}, {"_id": 0, "id": 1}
            )
            if existing:
                continue
            canonical = await database.supplier_document_submissions.find_one(
                {"supplier_relationship_id": row.get("supplier_relationship_id"), "document_requirement_id": row.get("document_requirement_id"), "document_version_id": row.get("document_version_id"), "is_current": True},
                {"_id": 0, "id": 1},
            )
            timestamp = row.get("submitted_at") or row.get("responded_at") or row.get("accepted_at") or datetime.now(timezone.utc).isoformat()
            submission = {
                "id": str(uuid.uuid4()), "supplier_relationship_id": row.get("supplier_relationship_id"),
                "supplier_org_id": row.get("supplier_org_id"), "customer_org_id": row.get("customer_org_id"),
                "document_requirement_id": row.get("document_requirement_id"), "document_version_id": row.get("document_version_id"),
                "response_mode": response_mode, "response_value": row.get("response_value") or ("Accepted" if response_mode == "ACCEPTANCE" else None),
                "accepted_by": row.get("accepted_by"), "accepted_at": row.get("accepted_at"), "responded_by": row.get("responded_by"), "responded_at": row.get("responded_at"),
                "submitted_at": timestamp, "status": "submitted", "revision": 1, "is_current": not bool(canonical),
                "parent_visible": not bool(canonical), "legacy_source": source_name, "legacy_record_id": legacy_id,
            }
            await database.supplier_document_submissions.insert_one(submission)
            migrated["acceptances" if response_mode == "ACCEPTANCE" else "responses"] += 1
    return migrated