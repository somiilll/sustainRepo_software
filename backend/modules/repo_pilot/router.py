"""
Repo Pilot — REST API endpoints.
3-Stage Upload: Upload to R2 → Start Processing → Background Worker.
"""
import os
import uuid
import tempfile
import logging
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from pydantic import BaseModel
from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from modules.entitlements.dependencies import assert_entitlement

logger = logging.getLogger(__name__)
router = APIRouter()

DOCS_COLLECTION = "repo_pilot_documents"


async def _check_repo_pilot_access(org_id: str):
    await assert_entitlement(org_id, "repo_pilot")


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

    # Get org name for R2 folder structure
    org_doc = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
    org_name_safe = (org_doc.get("name", org_id) if org_doc else org_id).replace(" ", "_")

    # Upload PDF to R2
    r2_url = ""
    r2_key = ""
    try:
        from r2_storage import get_r2_storage
        r2_storage = get_r2_storage()
        r2_result = await r2_storage.upload_file(
            file_content=content,
            filename=file.filename,
            bucket_type="repo_pilot",
            content_type="application/pdf",
            folder=f"{org_name_safe}/documents",
        )
        if r2_result and not r2_result.get("error"):
            r2_url = r2_result.get("url", "")
            r2_key = r2_result.get("key", "")
    except Exception as e:
        logger.warning(f"R2 PDF upload failed: {e}")

    # Create document record with UPLOADED status
    doc_record = {
        "id": document_id,
        "organization_id": org_id,
        "doc_id": doc_id,
        "filename": file.filename,
        "r2_url": r2_url,
        "r2_key": r2_key,
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
    background_tasks.add_task(_process_document_async, document_id, org_id, doc_id, tmp.name, split_2up)

    return {"document_id": document_id, "doc_id": doc_id, "status": "uploaded"}


# =============================================================================
# Stage 3 — Background worker (async, runs on main event loop)
# =============================================================================

async def _update_doc_status(document_id: str, stage: str, progress: int, **extra):
    update = {"stage": stage, "progress": progress, "status": stage.lower(), "updated_at": datetime.now(timezone.utc).isoformat()}
    update.update(extra)
    await db[DOCS_COLLECTION].update_one({"id": document_id}, {"$set": update})


async def _process_document_async(document_id: str, org_id: str, doc_id: str, pdf_path: str, split_2up: bool):
    """Full async processing pipeline. Runs on main event loop via BackgroundTasks."""
    try:
        await _update_doc_status(document_id, "PROCESSING", 10)

        from .ingest import process_pdf
        result = await process_pdf(pdf_path, org_id, doc_id, split_2up)

        await _update_doc_status(document_id, "PROCESSING", 70)

        # Upload page images to R2
        page_images = result.get("page_images", {})
        image_urls = {}
        image_keys = {}
        try:
            from r2_storage import get_r2_storage
            r2_storage = get_r2_storage()
            for page_num, img_bytes in page_images.items():
                r2_result = await r2_storage.upload_file(
                    file_content=img_bytes,
                    filename=f"page_{page_num}.jpg",
                    bucket_type="repo_pilot",
                    content_type="image/jpeg",
                    folder=f"{org_id}/{doc_id}/pages",
                )
                if r2_result and not r2_result.get("error"):
                    image_urls[str(page_num)] = r2_result.get("url", "")
                    image_keys[str(page_num)] = r2_result.get("key", "")
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
                "image_keys": image_keys,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        logger.info(f"Document {doc_id} processing completed: {result.get('chunks', 0)} chunks")
    except Exception as e:
        logger.error(f"Background processing failed for {doc_id}: {e}")
        await _update_doc_status(document_id, "FAILED", 0, error_message=str(e))
    finally:
        try:
            os.unlink(pdf_path)
        except Exception:
            pass


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

    # Refresh presigned URLs from stored R2 keys
    try:
        from r2_storage import get_r2_storage
        r2_storage = get_r2_storage()
        for doc in docs:
            image_keys = doc.get("image_keys", {})
            if image_keys:
                refreshed = {}
                for page_num, key in image_keys.items():
                    if key:
                        refreshed[page_num] = r2_storage.generate_presigned_url("repo_pilot", key, expiration=3600)
                doc["image_urls"] = refreshed
            r2_key = doc.get("r2_key", "")
            if r2_key:
                doc["r2_url"] = r2_storage.generate_presigned_url("repo_pilot", r2_key, expiration=3600)
    except Exception as e:
        logger.warning(f"Failed to refresh presigned URLs: {e}")

    return {"documents": docs}


@router.post("/documents/{doc_id}/regenerate-images")
async def regenerate_images(
    doc_id: str,
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user),
):
    """Re-upload page images to R2 for a document whose images are missing."""
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)
    doc = await db[DOCS_COLLECTION].find_one({"organization_id": org_id, "doc_id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.get("r2_url"):
        raise HTTPException(status_code=400, detail="Original PDF not found in R2")

    background_tasks.add_task(_regenerate_images_async, doc["id"], org_id, doc_id, doc["r2_url"])
    return {"message": "Image regeneration started"}


async def _regenerate_images_async(document_id: str, org_id: str, doc_id: str, r2_url: str):
    """Download PDF from R2, generate page images, upload to R2."""
    import asyncio
    try:
        # Download PDF from R2
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(r2_url, timeout=120)
            pdf_bytes = resp.content

        def _gen_images(pdf_bytes):
            import fitz
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            images = {}
            for pg in range(len(doc)):
                page = doc.load_page(pg)
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                images[pg + 1] = pix.tobytes("jpeg")
            doc.close()
            return images

        page_images = await asyncio.to_thread(_gen_images, pdf_bytes)

        image_urls = {}
        image_keys = {}
        from r2_storage import get_r2_storage
        r2_storage = get_r2_storage()
        # Get org name for folder structure
        org_doc = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
        org_folder = (org_doc.get("name", org_id) if org_doc else org_id).replace(" ", "_")
        for page_num, img_bytes in page_images.items():
            r2_result = await r2_storage.upload_file(
                file_content=img_bytes,
                filename=f"page_{page_num}.jpg",
                bucket_type="repo_pilot",
                content_type="image/jpeg",
                folder=f"{org_folder}/{doc_id}/pages",
            )
            if r2_result and not r2_result.get("error"):
                image_urls[str(page_num)] = r2_result.get("url", "")
                image_keys[str(page_num)] = r2_result.get("key", "")

        await db[DOCS_COLLECTION].update_one(
            {"id": document_id},
            {"$set": {"image_urls": image_urls, "image_keys": image_keys, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        logger.info(f"Regenerated {len(image_urls)} images for {doc_id}")
    except Exception as e:
        logger.error(f"Image regeneration failed for {doc_id}: {e}")




@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    org_id = _get_org(current_user)
    await _check_repo_pilot_access(org_id)

    from . import vector_store
    deleted = await vector_store.delete_document(org_id, doc_id)
    await db[DOCS_COLLECTION].delete_one({"organization_id": org_id, "doc_id": doc_id})
    return {"deleted_chunks": deleted}
