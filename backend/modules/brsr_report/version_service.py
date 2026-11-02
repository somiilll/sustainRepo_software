"""Immutable framework report versions (BRSR, GRI): frozen answers + stored PDF and Word files per generation (append-only)."""
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from r2_storage import get_r2_storage
from shared.database.mongo import db

BUCKET = "framework_reports"
FALLBACK_BUCKET = "mis_reports"
CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
FRAMEWORKS = {
    "BRSR": {"versions": "brsr_report_versions", "counters": "brsr_report_version_counters"},
    "GRI": {"versions": "gri_report_versions", "counters": "gri_report_version_counters"},
}
logger = logging.getLogger(__name__)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical(payload: Any) -> bytes:
    return json.dumps(payload, sort_keys=True, default=str).encode()


async def _audit_pointers(org_id: str, reporting_period: str, framework: str) -> Dict[str, Any]:
    pipeline = [
        {"$match": {"organization_id": org_id, "framework": framework, "reporting_period": reporting_period}},
        {"$sort": {"timestamp": 1}},
        {"$group": {"_id": "$question_key", "last_entry_id": {"$last": "$id"}, "last_timestamp": {"$last": "$timestamp"}, "entries": {"$sum": 1}}},
    ]
    return {row["_id"]: {"last_entry_id": row["last_entry_id"], "last_timestamp": str(row["last_timestamp"]), "entries": row["entries"]}
            async for row in db.question_audit_log.aggregate(pipeline)}


async def _store(content: bytes, filename: str, fmt: str, org_id: str) -> Dict[str, Any]:
    key = f"{org_id}/{filename}"
    bucket_type = BUCKET
    try:
        upload = await get_r2_storage().upload_file(content, filename, BUCKET, CONTENT_TYPES[fmt], organization_id=org_id, object_key=key)
    except Exception as exc:
        logger.warning("framework_reports bucket unavailable (%s); storing report in %s", exc, FALLBACK_BUCKET)
        bucket_type = FALLBACK_BUCKET
        upload = await get_r2_storage().upload_file(content, filename, FALLBACK_BUCKET, CONTENT_TYPES[fmt], organization_id=org_id, object_key=key)
    if not upload.get("success"):
        raise RuntimeError(f"Could not store report {fmt.upper()}: {upload.get('error')}")
    return {"bucket_type": bucket_type, "key": key, "sha256": _sha256(content), "size": len(content)}


async def create_version(org_id: str, reporting_period: str, user: Dict[str, Any], organization: Dict[str, Any],
                         answers: Dict[str, Any], files: Dict[str, bytes], base_filename: str, framework: str = "BRSR") -> Dict[str, Any]:
    names = FRAMEWORKS[framework]
    counter = await db[names["counters"]].find_one_and_update(
        {"org_id": org_id, "reporting_period": reporting_period}, {"$inc": {"last_version": 1}}, upsert=True, return_document=True)
    version = counter["last_version"]
    filenames = {fmt: f"{base_filename}_v{version}.{fmt}" for fmt in files}
    stored = {fmt: await _store(content, filenames[fmt], fmt, org_id) for fmt, content in files.items()}
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "org_id": org_id, "reporting_period": reporting_period, "version": version, "created_at": now,
        "created_by": {"id": user.get("id"), "name": user.get("full_name") or user.get("name"), "email": user.get("email")},
        "filename": filenames.get("pdf"), "filenames": filenames, **stored,
        "answers": answers, "answers_sha256": _sha256(_canonical(answers)), "organization_snapshot": organization,
        "audit_pointers": await _audit_pointers(org_id, reporting_period, framework), "audit_cutoff": now,
    }
    await db[names["versions"]].insert_one(dict(doc))
    return {"version": version, "filenames": filenames}


async def list_versions(org_id: str, reporting_period: str, framework: str = "BRSR") -> List[Dict[str, Any]]:
    rows = await db[FRAMEWORKS[framework]["versions"]].find(
        {"org_id": org_id, "reporting_period": reporting_period},
        {"_id": 0, "id": 1, "version": 1, "created_at": 1, "created_by": 1, "filename": 1, "filenames": 1,
         "pdf.sha256": 1, "pdf.size": 1, "docx.size": 1, "answers_sha256": 1},
    ).sort("version", -1).to_list(500)
    for row in rows:
        row["formats"] = [fmt for fmt in ("pdf", "docx") if row.get(fmt)]
        row.pop("docx", None)
    return rows


async def load_version_file(org_id: str, reporting_period: str, version: int, fmt: str = "pdf", framework: str = "BRSR"):
    doc = await db[FRAMEWORKS[framework]["versions"]].find_one(
        {"org_id": org_id, "reporting_period": reporting_period, "version": version}, {"_id": 0, "pdf": 1, "docx": 1, "filename": 1, "filenames": 1})
    if not doc or not doc.get(fmt):
        return None
    content, _type = await get_r2_storage().get_file(doc[fmt]["bucket_type"], doc[fmt]["key"])
    if _sha256(content) != doc[fmt]["sha256"]:
        raise ValueError("Stored report failed its integrity check")
    return content, (doc.get("filenames") or {}).get(fmt) or doc["filename"]
