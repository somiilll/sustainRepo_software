"""
Cascading delete utility for Organizations and Facilities.

When an Organization or Facility is hard-deleted, we must wipe ALL related data:
- DB records across all collections
- Linked files in Cloudflare R2

Design principles:
- R2 deletion failures MUST NOT block DB cleanup (log and continue).
- No orphan records should remain across any collection.
- Deletion happens in a well-defined order to avoid dangling references during cleanup.
"""

import logging
import re
from typing import Iterable, List, Optional

logger = logging.getLogger(__name__)

# Matches file ids in URLs like "/api/files/<uuid>", "/api/files/<uuid>/view",
# "/api/files/<uuid>/download", and any absolute URL pointing to the same path.
_FILE_ID_URL_PATTERN = re.compile(r"/api/files/([A-Za-z0-9\-]+)")


def _extract_file_ids_from_value(value) -> List[str]:
    """Recursively walk a value (dict/list/str) and pull out any file ids."""
    found: List[str] = []

    if value is None:
        return found

    if isinstance(value, str):
        # Comma-separated URL strings (e.g., emission_records.evidence_url)
        for chunk in value.split(","):
            match = _FILE_ID_URL_PATTERN.search(chunk)
            if match:
                found.append(match.group(1))
        return found

    if isinstance(value, dict):
        # Explicit file_id key wins
        file_id = value.get("file_id") or value.get("fileId")
        if isinstance(file_id, str) and file_id:
            found.append(file_id)
        # Extract from common URL-bearing keys
        for key in ("url", "file_url", "download_url", "view_url", "logo", "logo_url"):
            v = value.get(key)
            if isinstance(v, str):
                found.extend(_extract_file_ids_from_value(v))
        # Also scan nested lists/dicts under arbitrary keys (e.g., invoice_history entries)
        for k, v in value.items():
            if k in ("file_id", "fileId", "url", "file_url", "download_url", "view_url", "logo", "logo_url"):
                continue
            if isinstance(v, (dict, list)):
                found.extend(_extract_file_ids_from_value(v))
        return found

    if isinstance(value, list):
        for item in value:
            found.extend(_extract_file_ids_from_value(item))
        return found

    return found


def collect_file_ids_from_docs(docs: Iterable[dict], fields: Iterable[str]) -> List[str]:
    """Collect unique file_ids referenced by given fields across a list of documents."""
    file_ids: List[str] = []
    seen = set()
    for doc in docs:
        if not doc:
            continue
        for field in fields:
            ids = _extract_file_ids_from_value(doc.get(field))
            for fid in ids:
                if fid and fid not in seen:
                    seen.add(fid)
                    file_ids.append(fid)
    return file_ids


async def delete_r2_files_by_ids(db, r2, file_ids: List[str]) -> dict:
    """
    Delete R2 objects + uploaded_files records for the given file ids.

    R2 failures are logged and swallowed; DB records are always removed so no
    orphan metadata is left behind. Returns counts for audit logging.
    """
    r2_deleted = 0
    r2_failed = 0
    db_deleted = 0

    if not file_ids:
        return {"r2_deleted": 0, "r2_failed": 0, "db_deleted": 0}

    # Fetch all file records in one query
    records = await db.uploaded_files.find(
        {"id": {"$in": file_ids}}, {"_id": 0}
    ).to_list(length=len(file_ids) + 1)

    for rec in records:
        bucket_type = rec.get("bucket_type")
        r2_key = rec.get("r2_key")
        if bucket_type and r2_key:
            try:
                await r2.delete_file(bucket_type=bucket_type, key=r2_key)
                r2_deleted += 1
            except Exception as e:
                r2_failed += 1
                logger.error(
                    f"R2 delete failed for bucket={bucket_type} key={r2_key}: {e}. Continuing DB cleanup."
                )

    if records:
        result = await db.uploaded_files.delete_many({"id": {"$in": file_ids}})
        db_deleted = result.deleted_count

    return {"r2_deleted": r2_deleted, "r2_failed": r2_failed, "db_deleted": db_deleted}


async def cascade_delete_organization(db, r2, org_id: str) -> dict:
    """
    Hard delete an organization and every piece of related data across the system.

    Returns a dict of deleted counts suitable for audit logging / API response.
    """
    # 1. Fetch parent + children BEFORE deletion so we can harvest file references
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        return {"found": False}

    facilities = await db.facilities.find(
        {"organization_id": org_id}, {"_id": 0}
    ).to_list(10000)
    facility_ids = [f["id"] for f in facilities]

    or_clauses = [{"organization_id": org_id}]
    if facility_ids:
        or_clauses.append({"facility_id": {"$in": facility_ids}})
    child_query = {"$or": or_clauses} if len(or_clauses) > 1 else or_clauses[0]

    emission_records = await db.emission_records.find(child_query, {"_id": 0}).to_list(100000)
    emission_record_ids = [e["id"] for e in emission_records if e.get("id")]

    sinks = await db.sinks.find(child_query, {"_id": 0}).to_list(100000)

    users = await db.users.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)
    user_ids = [u["id"] for u in users if u.get("id")]

    # 2. Harvest all file ids referenced by documents being deleted
    all_file_ids: List[str] = []
    all_file_ids += collect_file_ids_from_docs([org], ["logo", "attachments", "invoice_history"])
    all_file_ids += collect_file_ids_from_docs(facilities, ["attachments", "logo"])
    all_file_ids += collect_file_ids_from_docs(
        emission_records, ["attachments", "evidence_url", "evidence_files"]
    )
    all_file_ids += collect_file_ids_from_docs(sinks, ["evidence_files", "evidence_urls", "evidence_url"])

    # Also delete any uploaded_files records directly belonging to org users
    # (covers files uploaded but not yet linked to a record).
    orphan_files = []
    if user_ids:
        orphan_files = await db.uploaded_files.find(
            {"uploaded_by": {"$in": user_ids}}, {"_id": 0, "id": 1}
        ).to_list(100000)
        all_file_ids += [f["id"] for f in orphan_files if f.get("id")]

    # Deduplicate
    all_file_ids = list(dict.fromkeys(all_file_ids))

    # 3. Delete R2 files + uploaded_files records (failures logged, don't block)
    file_cleanup = await delete_r2_files_by_ids(db, r2, all_file_ids)

    # 4. Delete DB records across all related collections (children first)
    emission_history_deleted = 0
    if emission_record_ids:
        r = await db.emission_history.delete_many({"record_id": {"$in": emission_record_ids}})
        emission_history_deleted = r.deleted_count

    base_year_query = child_query
    bye_deleted = (await db.base_year_emissions.delete_many(base_year_query)).deleted_count
    bye_deletions_deleted = (
        await db.base_year_emissions_deletions.delete_many(base_year_query)
    ).deleted_count

    emissions_deleted = (await db.emission_records.delete_many(child_query)).deleted_count
    sinks_deleted = (await db.sinks.delete_many(child_query)).deleted_count

    facilities_deleted = (
        await db.facilities.delete_many({"organization_id": org_id})
    ).deleted_count

    password_resets_deleted = 0
    if user_ids:
        password_resets_deleted = (
            await db.password_resets.delete_many({"user_id": {"$in": user_ids}})
        ).deleted_count

    users_deleted = (
        await db.users.delete_many({"organization_id": org_id})
    ).deleted_count

    # 5. Finally delete the organization itself
    await db.organizations.delete_one({"id": org_id})

    return {
        "found": True,
        "organization": org.get("name"),
        "deleted_counts": {
            "facilities": facilities_deleted,
            "emission_records": emissions_deleted,
            "emission_history": emission_history_deleted,
            "sinks": sinks_deleted,
            "base_year_emissions": bye_deleted,
            "base_year_emissions_deletions": bye_deletions_deleted,
            "users": users_deleted,
            "password_resets": password_resets_deleted,
            "uploaded_files_db": file_cleanup["db_deleted"],
            "r2_files_deleted": file_cleanup["r2_deleted"],
            "r2_files_failed": file_cleanup["r2_failed"],
        },
    }


async def cascade_delete_facility(db, r2, facility_id: str) -> dict:
    """Hard delete a facility and every piece of related data across the system."""
    facility = await db.facilities.find_one({"id": facility_id}, {"_id": 0})
    if not facility:
        return {"found": False}

    emission_records = await db.emission_records.find(
        {"facility_id": facility_id}, {"_id": 0}
    ).to_list(100000)
    emission_record_ids = [e["id"] for e in emission_records if e.get("id")]

    sinks = await db.sinks.find({"facility_id": facility_id}, {"_id": 0}).to_list(100000)

    # Harvest all file ids referenced by documents being deleted
    all_file_ids: List[str] = []
    all_file_ids += collect_file_ids_from_docs([facility], ["attachments", "logo"])
    all_file_ids += collect_file_ids_from_docs(
        emission_records, ["attachments", "evidence_url", "evidence_files"]
    )
    all_file_ids += collect_file_ids_from_docs(sinks, ["evidence_files", "evidence_urls", "evidence_url"])
    all_file_ids = list(dict.fromkeys(all_file_ids))

    file_cleanup = await delete_r2_files_by_ids(db, r2, all_file_ids)

    emission_history_deleted = 0
    if emission_record_ids:
        r = await db.emission_history.delete_many({"record_id": {"$in": emission_record_ids}})
        emission_history_deleted = r.deleted_count

    bye_deleted = (
        await db.base_year_emissions.delete_many({"facility_id": facility_id})
    ).deleted_count
    bye_deletions_deleted = (
        await db.base_year_emissions_deletions.delete_many({"facility_id": facility_id})
    ).deleted_count

    emissions_deleted = (
        await db.emission_records.delete_many({"facility_id": facility_id})
    ).deleted_count
    sinks_deleted = (
        await db.sinks.delete_many({"facility_id": facility_id})
    ).deleted_count

    await db.facilities.delete_one({"id": facility_id})

    return {
        "found": True,
        "facility": facility.get("name"),
        "deleted_counts": {
            "emission_records": emissions_deleted,
            "emission_history": emission_history_deleted,
            "sinks": sinks_deleted,
            "base_year_emissions": bye_deleted,
            "base_year_emissions_deletions": bye_deletions_deleted,
            "uploaded_files_db": file_cleanup["db_deleted"],
            "r2_files_deleted": file_cleanup["r2_deleted"],
            "r2_files_failed": file_cleanup["r2_failed"],
        },
    }
