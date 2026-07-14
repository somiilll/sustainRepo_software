"""
Repo Pilot — REST API endpoints.
3-Stage Upload: Upload to R2 → Start Processing → Background Worker.
"""
import os
import uuid
import asyncio
import tempfile
import logging
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
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


# =============================================================================
# Stage 1 — Upload to R2, create doc record, return immediately
# =============================================================================

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    split_2up: bool = Query(False),
    current_user: dict = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 100MB)")

    doc_id = file.filename.rsplit(".", 1)[0].replace(" ", "_")
    document_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Upload PDF to R2
    r2_url = ""
    try:
        from r2_storage import r2_storage
        r2_result = await r2_storage.upload_file(
            file_content=content,
            filename=file.filename,
            bucket_type="org_facility",
            content_type="application/pdf",
            folder=f"repo-pilot/{org_id}/{doc_id}",
        )
        if r2_result and not r2_result.get("error"):
            r2_url = r2_result.get("url", "")
    except Exception as e:
        logger.warning(f"R2 PDF upload failed: {e}")

    # Create document record with UPLOADED status
    doc_record = {
        "id": document_id,
        "organization_id": org_id,
        "doc_id": doc_id,
        "filename": file.filename,
        "r2_url": r2_url,
        "split_2up": split_2up,
        "status": "uploaded",
        "stage": "UPLOADED",
        "progress": 0,
        "error_message": None,
        "pages": 0,
        "chunks": 0,
        "image_urls": {},
        "uploaded_by": current_user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await db[DOCS_COLLECTION].insert_one(doc_record)

    # Save PDF to temp for background processing
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.write(content)
    tmp.close()

    # Stage 2 — Start background processing
    background_tasks.add_task(_process_document_background, document_id, org_id, doc_id, tmp.name, split_2up)

    return {"document_id": document_id, "doc_id": doc_id, "status": "uploaded"}


# =============================================================================
# Stage 3 — Background worker
# =============================================================================

async def _update_doc_status(document_id: str, stage: str, progress: int, **extra):
    update = {"stage": stage, "progress": progress, "status": stage.lower(), "updated_at": datetime.now(timezone.utc).isoformat()}
    update.update(extra)
    await db[DOCS_COLLECTION].update_one({"id": document_id}, {"$set": update})


def _process_document_background(document_id: str, org_id: str, doc_id: str, pdf_path: str, split_2up: bool):
    """Sync wrapper for async background processing."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_process_document_async(document_id, org_id, doc_id, pdf_path, split_2up))
    except Exception as e:
        logger.error(f"Background processing failed for {doc_id}: {e}")
        loop.run_until_complete(_update_doc_status(document_id, "FAILED", 0, error_message=str(e)))
    finally:
        loop.close()
        # Cleanup temp file
        try:
            os.unlink(pdf_path)
        except Exception:
            pass


async def _process_document_async(document_id: str, org_id: str, doc_id: str, pdf_path: str, split_2up: bool):
    """Full async processing pipeline."""
    await _update_doc_status(document_id, "PROCESSING", 10)

    try:
        from .ingest import process_pdf
        result = await process_pdf(pdf_path, org_id, doc_id, split_2up)
    except Exception as e:
        await _update_doc_status(document_id, "FAILED", 0, error_message=f"Processing failed: {e}")
        return

    await _update_doc_status(document_id, "PROCESSING", 70)

    # Upload page images to R2
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
        logger.warning(f"R2 image upload failed: {e}")

    await _update_doc_status(document_id, "PROCESSING", 90)

    # Update document record with results
    await db[DOCS_COLLECTION].update_one(
        {"id": document_id},
        {"$set": {
            "status": "completed",
            "stage": "COMPLETED",
            "progress": 100,
            "pages": result.get("pages", 0),
            "chunks": result.get("chunks", 0),
            "image_urls": image_urls,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    logger.info(f"Document {doc_id} processing completed: {result.get('chunks', 0)} chunks")


# =============================================================================
# Status endpoint
# =============================================================================

@router.get("/documents/{document_id}/status")
async def get_document_status(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    org_id = _get_org(current_user)
    doc = await db[DOCS_COLLECTION].find_one(
        {"id": document_id, "organization_id": org_id},
        {"_id": 0, "status": 1, "stage": 1, "progress": 1, "error_message": 1, "pages": 1, "chunks": 1}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


# =============================================================================
# Chat
# =============================================================================

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


# =============================================================================
# Document Management
# =============================================================================

@router.get("/documents")
async def list_documents(current_user: dict = Depends(get_current_user)):
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)
    docs = await db[DOCS_COLLECTION].find(
        {"organization_id": org_id}, {"_id": 0, "embedding": 0}
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
