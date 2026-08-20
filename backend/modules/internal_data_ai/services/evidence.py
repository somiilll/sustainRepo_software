"""Evidence service for Internal Data AI — retrieves uploaded files linked to ESG records.

The `uploaded_files` collection stores only generic upload metadata (filename, r2_key, etc.)
with NO link back to the record it belongs to. The actual linkage lives on the record side:
- emission_records.evidence_url -> "/api/files/{file_id}"
- environment/social/governance_records.evidence_files -> [{"id": file_id, ...}, ...]
So evidence lookup must start from the matching records, not from a blind filename search.
"""
import re
import logging
from shared.database.mongo import db
from modules.internal_data_ai.query_scope import and_filters, organization_scope, resolve_authorized_facilities
from modules.internal_data_ai.reporting_periods import emission_period_filter, esg_period_filter, period_from_payload

logger = logging.getLogger(__name__)


def _extract_file_id(evidence_url: str) -> str:
    """Extract file_id from a '/api/files/{file_id}' style reference."""
    if not evidence_url:
        return None
    match = re.search(r"/files/([a-f0-9\-]{8,})", evidence_url)
    return match.group(1) if match else None


async def _build_preview(file_id: str, entity_type: str = None, entity_id: str = None) -> dict:
    """Fetch an uploaded_files doc by id and build a preview payload with a presigned R2 URL."""
    f = await db.uploaded_files.find_one({"id": file_id}, {"_id": 0})
    if not f:
        return None
    preview_url = None
    r2_key = f.get("r2_key")
    bucket_type = f.get("bucket_type")
    if r2_key and bucket_type:
        try:
            from r2_storage import get_r2_storage
            preview_url = get_r2_storage().generate_presigned_url(bucket_type, r2_key, expiration=3600)
        except Exception as e:
            logger.warning(f"Presigned URL generation failed: {e}")

    return {
        "id": f.get("id"),
        "filename": f.get("original_filename"),
        "content_type": f.get("content_type"),
        "file_size": f.get("file_size"),
        "uploaded_by": f.get("uploaded_by"),
        "uploaded_at": f.get("uploaded_at"),
        "entity_type": entity_type,
        "entity_id": entity_id,
        "preview_url": preview_url,
        "verification_status": f.get("verification_status"),
    }


async def find_files(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    entity_name = kwargs.get("entity_name") or ""
    fuel_type = kwargs.get("fuel_type") or ""
    period = kwargs.get("period") or ""
    category = kwargs.get("category") or ""
    metric = kwargs.get("metric") or ""
    facility_name = kwargs.get("facility") or ""

    facility_id_filter = await resolve_authorized_facilities(db, org_id, facility_ids, facility_name)

    search_terms = [t for t in [fuel_type, category, entity_name, metric] if t]
    resolved_period = period_from_payload(period)
    results = []
    seen_ids = set()

    # 1. Evidence linked to emission records (via evidence_url)
    em_query = and_filters(organization_scope(org_id, facility_id_filter), {"evidence_url": {"$nin": [None, ""]}})
    if search_terms:
        em_query = and_filters(em_query, {"$or": [
            cond
            for term in search_terms
            for cond in [
                {"fuel_type": {"$regex": term, "$options": "i"}},
                {"sub_category": {"$regex": term, "$options": "i"}},
                {"category": {"$regex": term, "$options": "i"}},
                {"reporting_period": {"$regex": term, "$options": "i"}},
            ]
        ]})
    if resolved_period:
        em_query = and_filters(em_query, emission_period_filter(resolved_period))
    emission_recs = await db.emission_records.find(em_query, {"_id": 0, "evidence_url": 1, "id": 1}).to_list(20)
    for rec in emission_recs:
        file_id = _extract_file_id(rec.get("evidence_url"))
        if file_id and file_id not in seen_ids:
            preview = await _build_preview(file_id, "emission_record", rec.get("id"))
            if preview:
                results.append(preview)
                seen_ids.add(file_id)

    # 2. Evidence linked to environment/social/governance records (embedded evidence_files array)
    for coll_name in ["environment_records", "social_records", "governance_records"]:
        env_query = and_filters(
            {"$or": [{"organization_id": org_id}, {"org_id": org_id}]},
            organization_scope(org_id, facility_id_filter, organization_field="org_id"),
            {"evidence_files": {"$exists": True, "$ne": []}},
        )
        if search_terms:
            env_query = and_filters(env_query, {"$or": [
                cond
                for term in search_terms
                for cond in [
                    {"category": {"$regex": term, "$options": "i"}},
                    {"subcategory": {"$regex": term, "$options": "i"}},
                    {"reporting_period": {"$regex": term, "$options": "i"}},
                ]
            ]})
        if resolved_period:
            env_query = and_filters(env_query, esg_period_filter(resolved_period))
        recs = await db[coll_name].find(env_query, {"_id": 0, "evidence_files": 1, "id": 1}).to_list(20)
        for rec in recs:
            for ef in rec.get("evidence_files", []):
                file_id = ef.get("id")
                if file_id and file_id not in seen_ids:
                    preview = await _build_preview(file_id, coll_name.replace("_records", ""), rec.get("id"))
                    if preview:
                        results.append(preview)
                        seen_ids.add(file_id)

    return {"total_files": len(results), "files": results, "period": resolved_period.label if resolved_period else None, "period_resolved": resolved_period is not None}
