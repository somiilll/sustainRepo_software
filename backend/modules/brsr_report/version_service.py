"""Immutable BRSR report versions: frozen answers + stored PDF per download (append-only)."""
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from r2_storage import get_r2_storage
from shared.database.mongo import db

BUCKET = "mis_reports"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical(payload: Any) -> bytes:
    return json.dumps(payload, sort_keys=True, default=str).encode()


async def _audit_pointers(org_id: str, reporting_period: str) -> Dict[str, Any]:
    pipeline = [
        {"$match": {"organization_id": org_id, "framework": "BRSR", "reporting_period": reporting_period}},
        {"$sort": {"timestamp": 1}},
        {"$group": {"_id": "$question_key", "last_entry_id": {"$last": "$id"}, "last_timestamp": {"$last": "$timestamp"}, "entries": {"$sum": 1}}},
    ]
    return {row["_id"]: {"last_entry_id": row["last_entry_id"], "last_timestamp": str(row["last_timestamp"]), "entries": row["entries"]}
            async for row in db.question_audit_log.aggregate(pipeline)}


async def create_version(org_id: str, reporting_period: str, user: Dict[str, Any], organization: Dict[str, Any],
                         answers: Dict[str, Any], pdf_bytes: bytes, base_filename: str) -> Dict[str, Any]:
    counter = await db.brsr_report_version_counters.find_one_and_update(
        {"org_id": org_id, "reporting_period": reporting_period}, {"$inc": {"last_version": 1}}, upsert=True, return_document=True)
    version = counter["last_version"]
    period_safe = re.sub(r"[^A-Za-z0-9-]+", "_", reporting_period)
    key = f"brsr_report_versions/{org_id}/{period_safe}/v{version}.pdf"
    filename = f"{base_filename}_v{version}.pdf"
    upload = await get_r2_storage().upload_file(pdf_bytes, filename, BUCKET, "application/pdf", organization_id=org_id, object_key=key)
    if not upload.get("success"):
        raise RuntimeError(f"Could not store BRSR report PDF: {upload.get('error')}")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "org_id": org_id, "reporting_period": reporting_period, "version": version, "created_at": now,
        "created_by": {"id": user.get("id"), "name": user.get("full_name") or user.get("name"), "email": user.get("email")},
        "filename": filename, "pdf": {"bucket_type": BUCKET, "key": key, "sha256": _sha256(pdf_bytes), "size": len(pdf_bytes)},
        "answers": answers, "answers_sha256": _sha256(_canonical(answers)), "organization_snapshot": organization,
        "audit_pointers": await _audit_pointers(org_id, reporting_period), "audit_cutoff": now,
    }
    await db.brsr_report_versions.insert_one(dict(doc))
    return {"version": version, "filename": filename}


async def list_versions(org_id: str, reporting_period: str) -> List[Dict[str, Any]]:
    rows = await db.brsr_report_versions.find(
        {"org_id": org_id, "reporting_period": reporting_period},
        {"_id": 0, "id": 1, "version": 1, "created_at": 1, "created_by": 1, "filename": 1, "pdf.sha256": 1, "pdf.size": 1, "answers_sha256": 1},
    ).sort("version", -1).to_list(500)
    return rows


async def load_version_pdf(org_id: str, reporting_period: str, version: int):
    doc = await db.brsr_report_versions.find_one({"org_id": org_id, "reporting_period": reporting_period, "version": version}, {"_id": 0, "pdf": 1, "filename": 1})
    if not doc:
        return None
    content, _type = await get_r2_storage().get_file(doc["pdf"]["bucket_type"], doc["pdf"]["key"])
    if _sha256(content) != doc["pdf"]["sha256"]:
        raise ValueError("Stored report failed its integrity check")
    return content, doc["filename"]
