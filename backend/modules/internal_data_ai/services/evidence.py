"""Evidence service for Internal Data AI — retrieves uploaded files with R2 URLs."""
import os
from shared.database.mongo import db


async def find_files(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    entity_name = kwargs.get("entity_name") or kwargs.get("fuel_type") or ""
    period = kwargs.get("period") or ""
    category = kwargs.get("category") or ""

    query = {"organization_id": org_id} if await db.uploaded_files.find_one({"organization_id": org_id}) else {}

    # Search by filename or entity reference
    search_terms = [t for t in [entity_name, period, category] if t]
    if search_terms:
        or_conditions = []
        for term in search_terms:
            or_conditions.extend([
                {"original_filename": {"$regex": term, "$options": "i"}},
                {"entity_type": {"$regex": term, "$options": "i"}},
                {"tags": {"$regex": term, "$options": "i"}},
            ])
        query["$or"] = or_conditions

    files = await db.uploaded_files.find(query, {"_id": 0}).sort("uploaded_at", -1).to_list(20)

    results = []
    for f in files:
        r2_key = f.get("r2_key")
        preview_url = None
        if r2_key:
            try:
                from r2_storage import get_r2_storage
                storage = get_r2_storage()
                preview_url = storage.generate_presigned_url(r2_key, expires_in=3600)
            except Exception:
                pass

        results.append({
            "id": f.get("id"),
            "filename": f.get("original_filename"),
            "content_type": f.get("content_type"),
            "file_size": f.get("file_size"),
            "uploaded_by": f.get("uploaded_by"),
            "uploaded_at": f.get("uploaded_at"),
            "entity_type": f.get("entity_type"),
            "entity_id": f.get("entity_id"),
            "preview_url": preview_url,
            "verification_status": f.get("verification_status"),
        })

    return {"total_files": len(results), "files": results}
