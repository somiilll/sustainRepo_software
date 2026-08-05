"""
OCR Invoice Router - REST API endpoints for invoice OCR processing.
Wraps the invoice_processor module for platform integration.
"""
import os
import json
import logging
import tempfile
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from anthropic import Anthropic

from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from . import invoice_processor

logger = logging.getLogger(__name__)
router = APIRouter()

# Module directory for data files
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_PATH = os.path.join(MODULE_DIR, "Fuel_categorization_with_aliases.xlsx")
VENDOR_CACHE_PATH = os.path.join(MODULE_DIR, "vendor_cache.json")

# Model configuration from environment
OCR_MODEL_PRIMARY = os.environ.get("OCR_MODEL_PRIMARY", "claude-sonnet-5")
OCR_MODEL_DISAMBIGUATION = os.environ.get("OCR_MODEL_DISAMBIGUATION", "claude-haiku-4-5")

# Collection for OCR history
OCR_HISTORY_COLLECTION = "ocr_invoice_history"


def _get_org(user: dict) -> str:
    """Extract organization ID from user."""
    org_id = user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


def _load_vendor_cache() -> dict:
    """Load vendor cache from file."""
    if os.path.exists(VENDOR_CACHE_PATH):
        try:
            with open(VENDOR_CACHE_PATH, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass
    return {}


def _save_vendor_cache(vendor_cache: dict):
    """Save vendor cache to file."""
    with open(VENDOR_CACHE_PATH, "w") as f:
        json.dump(vendor_cache, f, indent=4)


@router.post("/upload")
async def upload_invoice(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload and process an invoice file for OCR extraction.
    Supports PDF, PNG, JPG, JPEG formats.
    """
    org_id = _get_org(current_user)
    
    # Validate file type
    filename = file.filename.lower()
    allowed_extensions = ('.pdf', '.png', '.jpg', '.jpeg', '.avif')
    if not filename.endswith(allowed_extensions):
        return JSONResponse(
            status_code=400, 
            content={"error": f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"}
        )
    
    # Check file size (max 20MB)
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        return JSONResponse(
            status_code=400,
            content={"error": "File too large. Maximum size is 20MB."}
        )
    
    # Save to temp file
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1])
    try:
        temp_file.write(content)
        temp_file.close()
        
        # Initialize Anthropic Client
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return JSONResponse(
                status_code=500,
                content={"error": "ANTHROPIC_API_KEY environment variable is not set on the server."}
            )
        
        client = Anthropic(api_key=api_key)
        
        # Check taxonomy file exists
        if not os.path.exists(EXCEL_PATH):
            return JSONResponse(
                status_code=500,
                content={"error": f"Taxonomy file not found on server."}
            )
        
        # Load fuel records
        fuel_records = invoice_processor.load_fuel_categories(EXCEL_PATH)
        
        # Load vendor cache
        vendor_cache = _load_vendor_cache()
        
        # Process the file using exact original code
        results = invoice_processor.process_file(
            file_path=temp_file.name,
            client=client,
            model_id=OCR_MODEL_PRIMARY,
            fuel_records=fuel_records,
            vendor_cache=vendor_cache
        )
        
        # Save updated vendor cache
        _save_vendor_cache(vendor_cache)
        
        if results is None:
            return JSONResponse(
                status_code=500,
                content={"error": "Failed to parse invoice. Please ensure the file is a valid invoice image or PDF."}
            )
        
        # Save to history
        history_record = {
            "organization_id": org_id,
            "user_id": current_user.get("id"),
            "filename": file.filename,
            "extracted_rows": len(results),
            "needs_review_count": sum(1 for r in results if r.get("needs_review")),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db[OCR_HISTORY_COLLECTION].insert_one(history_record)
        
        return {"data": results}
        
    except Exception as e:
        logger.error(f"OCR processing error: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
    finally:
        # Cleanup temp file
        try:
            os.unlink(temp_file.name)
        except Exception:
            pass


@router.get("/history")
async def get_ocr_history(current_user: dict = Depends(get_current_user)):
    """Get OCR upload history for the organization."""
    org_id = _get_org(current_user)
    
    history = await db[OCR_HISTORY_COLLECTION].find(
        {"organization_id": org_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    return {"history": history}


@router.get("/taxonomy/stats")
async def get_taxonomy_stats(current_user: dict = Depends(get_current_user)):
    """Get fuel taxonomy statistics."""
    if not os.path.exists(EXCEL_PATH):
        raise HTTPException(status_code=500, detail="Taxonomy file not found")
    
    fuel_records = invoice_processor.load_fuel_categories(EXCEL_PATH)
    
    # Group by category and scope
    categories = {}
    scopes = {}
    
    for record in fuel_records:
        cat = record.get("category", "Unknown")
        scope = record.get("scope", "Unknown")
        
        categories[cat] = categories.get(cat, 0) + 1
        scopes[scope] = scopes.get(scope, 0) + 1
    
    return {
        "total_fuels": len(fuel_records),
        "categories": categories,
        "scopes": scopes
    }
