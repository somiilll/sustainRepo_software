"""
Repo Pilot — REST API endpoints.
Chat, document upload/management.
"""
import os
import uuid
import tempfile
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from modules.auth.dependencies import get_current_user
from shared.database.mongo import db

logger = logging.getLogger(__name__)
router = APIRouter()

DOCS_COLLECTION = "repo_pilot_documents"


async def _check_repo_pilot_access(org_id: str):
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "repo_pilot_enabled": 1})
    if not org or not org.get("repo_pilot_enabled"):
        raise HTTPException(status_code=403, detail="Repo Pilot not enabled for this organization")


def _get_org(user: dict) -> str:
    org_id = user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


# --- Chat ---
class ChatRequest(BaseModel):
    message: str
    doc_filters: Optional[List[str]] = None
    length: str = "Medium"


@router.post("/chat")
async def chat(data: ChatRequest, current_user: dict = Depends(get_current_user)):
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)

    from .rag_engine import query_esg
    result = await query_esg(org_id, data.message, length=data.length, doc_filters=data.doc_filters)
    return result


# --- Document Upload ---
@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    split_2up: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    doc_id = file.filename.rsplit(".", 1)[0].replace(" ", "_")
    content = await file.read()

    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 100MB)")

    # Save to temp
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.write(content)
    tmp.close()

    try:
        from .ingest import process_pdf
        result = await process_pdf(tmp.name, org_id, doc_id, split_2up)

        # Store page images in R2
        page_images = result.get("page_images", {})
        image_urls = {}
        try:
            from r2_storage import r2_storage
            for page_num, img_bytes in page_images.items():
                r2_result = await r2_storage.upload_file(
                    file_content=img_bytes,
                    filename=f"page_{page_num}.jpg",
                    bucket_type="org_facility",
                    content_type="image/jpeg",
                    folder=f"repo-pilot/{org_id}/{doc_id}",
                )
                if r2_result and not r2_result.get("error"):
                    image_urls[str(page_num)] = r2_result.get("url", "")
        except Exception as e:
            logger.warning(f"R2 upload failed, images not stored: {e}")

        # Save document metadata
        from datetime import datetime, timezone
        await db[DOCS_COLLECTION].insert_one({
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "doc_id": doc_id,
            "filename": file.filename,
            "pages": result.get("pages", 0),
            "chunks": result.get("chunks", 0),
            "image_urls": image_urls,
            "uploaded_by": current_user.get("id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return {"doc_id": doc_id, "pages": result["pages"], "chunks": result["chunks"]}
    finally:
        os.unlink(tmp.name)


# --- Document Management ---
@router.get("/documents")
async def list_documents(current_user: dict = Depends(get_current_user)):
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)
    docs = await db[DOCS_COLLECTION].find(
        {"organization_id": org_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"documents": docs}


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)

    from . import vector_store
    deleted = await vector_store.delete_document(org_id, doc_id)
    await db[DOCS_COLLECTION].delete_one({"organization_id": org_id, "doc_id": doc_id})
    return {"deleted_chunks": deleted}
