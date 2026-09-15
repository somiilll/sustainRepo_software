"""
OCR Invoice Router - Complete AI-Assisted Emission Entry Workflow
Handles invoice upload, OCR extraction, review, edit, accept, and import flows.
"""
import csv
import io
import os
import json
import uuid
import logging
import tempfile
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from anthropic import Anthropic

from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from r2_storage import R2Storage
from . import invoice_processor
from bulk_upload_scope3.ghg_config_resolver import resolve_ghg_capabilities
from .config import MODES, get_mode
from .factor_options import resolve_factor_options, validate_factor_selection
from .schemas import FinalizeImportRequest as AdvancedFinalizeImportRequest, FinalizeWaterImportRequest, LineItemEdit as AdvancedLineItemEdit, UploadFacilityAssignments
from .service import build_org_context, process_queued_upload, queue_upload_batch, save_vendor_override
from .template_service import generate_ocr_template
from .taxonomy_service import SCOPE3_CATEGORY_NAMES, SCOPE_CATEGORY_NAMES, WATER_CATEGORY_NAMES

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize R2 storage
r2_storage = R2Storage()

# Module directory for data files
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
TAXONOMY_PATH = os.path.join(MODULE_DIR, "fuel_taxonomy.json")
MAPPINGS_PATH = os.path.join(MODULE_DIR, "ocr_mappings.json")
VENDOR_CACHE_PATH = os.path.join(MODULE_DIR, "vendor_cache.json")

# Model configuration from environment
OCR_MODEL_PRIMARY = os.environ.get("OCR_MODEL_PRIMARY", "claude-sonnet-5")
OCR_MODEL_DISAMBIGUATION = os.environ.get("OCR_MODEL_DISAMBIGUATION", "claude-haiku-4-5")

# MongoDB Collections
OCR_UPLOADS_COLLECTION = "ocr_uploads"
OCR_LINE_ITEMS_COLLECTION = "ocr_line_items"


# ============================================================================
# Pydantic Models
# ============================================================================

class LineItemEdit(BaseModel):
    """Model for editing a line item."""
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    scope: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    fuel_name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    cost: Optional[float] = None
    currency: Optional[str] = None
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    billing_period_text: Optional[str] = None


class AcceptedLineItem(BaseModel):
    """Model for accepted line item data to pre-fill emission form."""
    line_item_id: str
    scope: str
    category: str
    subcategory: Optional[str] = None
    fuel_name: Optional[str] = None
    quantity: float
    unit: str
    billing_period: dict
    source_of_information: str
    invoice_file_url: str
    invoice_filename: str


# ============================================================================
# Helper Functions
# ============================================================================

def _get_org(user: dict) -> str:
    """Extract organization ID from user."""
    org_id = user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


def _preview_path(upload_id: str, file_index: int) -> str:
    return f"/api/ocr-invoice/uploads/{upload_id}/files/{file_index}/preview"


async def _resolve_ocr_line_item(item: dict, outcome: str) -> dict:
    """Remove one resolved row and delete its source only after sibling rows resolve."""
    upload_id = item.get("upload_id")
    org_id = item.get("organization_id")
    file_index = item.get("file_index", 0)
    temp_key = item.get("temp_file_key")
    await db[OCR_LINE_ITEMS_COLLECTION].delete_one({
        "id": item.get("id"),
        "organization_id": org_id,
    })
    now = datetime.now(timezone.utc).isoformat()
    counter_field = "saved_count" if outcome == "saved" else "rejected_count"
    await db[OCR_UPLOADS_COLLECTION].update_one(
        {"id": upload_id, "organization_id": org_id},
        {
            "$inc": {
                "files.$[file].resolved_count": 1,
                f"files.$[file].{counter_field}": 1,
            },
            "$set": {
                "files.$[file].last_resolved_at": now,
                "updated_at": now,
            },
        },
        array_filters=[{"file.file_index": file_index}],
    )
    remaining_for_file = await db[OCR_LINE_ITEMS_COLLECTION].count_documents({
        "upload_id": upload_id,
        "organization_id": org_id,
        "file_index": file_index,
    })
    temp_deleted = False
    if remaining_for_file == 0:
        if temp_key:
            try:
                temp_deleted = await r2_storage.delete_file("ocr_temp", temp_key)
            except Exception as error:
                logger.warning("OCR temp cleanup deferred for %s: %s", temp_key, error)
        file_updates = {
            "files.$[file].resolution_status": "resolved",
            "files.$[file].resolved_at": now,
            "files.$[file].temp_cleanup_status": "deleted" if temp_deleted or not temp_key else "pending_retry",
        }
        if temp_deleted:
            file_updates["files.$[file].temp_deleted_at"] = now
        await db[OCR_UPLOADS_COLLECTION].update_one(
            {"id": upload_id, "organization_id": org_id},
            {"$set": file_updates},
            array_filters=[{"file.file_index": file_index}],
        )
    remaining_for_upload = await db[OCR_LINE_ITEMS_COLLECTION].count_documents({
        "upload_id": upload_id,
        "organization_id": org_id,
    })
    if remaining_for_upload == 0:
        await db[OCR_UPLOADS_COLLECTION].update_one(
            {"id": upload_id, "organization_id": org_id},
            {"$set": {"status": "resolved", "resolved_at": now, "updated_at": now}},
        )
    return {
        "file_completed": remaining_for_file == 0,
        "upload_completed": remaining_for_upload == 0,
        "temp_deleted": temp_deleted,
    }


def _load_mappings() -> dict:
    """Load OCR mappings configuration."""
    if os.path.exists(MAPPINGS_PATH):
        with open(MAPPINGS_PATH, "r") as f:
            return json.load(f)
    return {}


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


def _normalize_unit(ocr_unit: str, mappings: dict) -> str:
    """Normalize OCR unit to software unit using mappings."""
    if not ocr_unit:
        return ""
    
    unit_mappings = mappings.get("unit_mappings", {})
    normalized = ocr_unit.lower().strip()
    
    # Direct mapping
    if normalized in unit_mappings:
        return unit_mappings[normalized]
    
    # Try without spaces/symbols
    clean_unit = "".join(c for c in normalized if c.isalnum())
    if clean_unit in unit_mappings:
        return unit_mappings[clean_unit]
    
    # Return original if no mapping found
    return ocr_unit


def _map_category_scope(ocr_category: str, ocr_scope: str, mappings: dict) -> dict:
    """Map OCR category/scope to software category/scope/subcategory."""
    category_mappings = mappings.get("category_mappings", {})
    
    result = {
        "scope": ocr_scope or "scope1",
        "category": ocr_category,
        "subcategory": None
    }
    
    # Try to find mapping
    if ocr_category in category_mappings:
        mapping = category_mappings[ocr_category]
        result["scope"] = mapping.get("scope", result["scope"])
        result["category"] = mapping.get("software_category", ocr_category)
        result["subcategory"] = mapping.get("subcategory")
    
    return result


def _derive_subcategory(fuel_name: str, category: str, mappings: dict) -> Optional[str]:
    """Derive subcategory from fuel name using pattern matching."""
    if not fuel_name:
        return None
    
    fuel_lower = fuel_name.lower()
    rules = mappings.get("subcategory_rules", [])
    
    for rule in rules:
        patterns = rule.get("pattern", [])
        if any(p in fuel_lower for p in patterns):
            if "subcategory" in rule:
                return rule["subcategory"]
            if "subcategory_check" in rule:
                check = rule["subcategory_check"]
                renewable_kw = check.get("renewable_keywords", [])
                if any(kw in fuel_lower for kw in renewable_kw):
                    return "Renewable Electricity"
                return check.get("default", "Non-Renewable Electricity")
    
    return None


async def _get_software_units() -> List[str]:
    """Get list of valid software units from database."""
    units = await db.units.find({"is_active": True}, {"symbol": 1, "_id": 0}).to_list(1000)
    return [u["symbol"] for u in units if u.get("symbol")]


# ============================================================================
# API Endpoints
# ============================================================================

async def _legacy_upload_invoices(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload and process one or more invoice files for OCR extraction.
    Supports PDF, PNG, JPG, JPEG formats. Max 20MB per file.
    
    Returns:
        - upload_id: ID for this upload batch
        - line_items: List of extracted line items across all files
    """
    org_id = _get_org(current_user)
    user_id = current_user.get("id")
    
    # Validate files
    allowed_extensions = ('.pdf', '.png', '.jpg', '.jpeg', '.avif')
    valid_files = []
    
    for file in files:
        filename = file.filename.lower()
        if not filename.endswith(allowed_extensions):
            continue
        
        content = await file.read()
        await file.seek(0)  # Reset for later use
        
        if len(content) > 20 * 1024 * 1024:
            continue
        
        valid_files.append((file, content))
    
    if not valid_files:
        return JSONResponse(
            status_code=400,
            content={"error": f"No valid files. Allowed: {', '.join(allowed_extensions)}, max 20MB each"}
        )
    
    # Create upload batch record
    upload_id = str(uuid.uuid4())
    upload_record = {
        "id": upload_id,
        "organization_id": org_id,
        "uploaded_by": user_id,
        "uploaded_by_name": current_user.get("name", "Unknown"),
        "file_count": len(valid_files),
        "files": [],
        "status": "processing",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Initialize Anthropic Client
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return JSONResponse(
            status_code=500,
            content={"error": "ANTHROPIC_API_KEY not configured"}
        )
    
    client = Anthropic(api_key=api_key)
    
    # Load taxonomy and mappings
    fuel_records = invoice_processor.load_fuel_categories(TAXONOMY_PATH)
    mappings = _load_mappings()
    vendor_cache = _load_vendor_cache()
    software_units = await _get_software_units()
    
    all_line_items = []
    
    for file, content in valid_files:
        # Upload to temp R2 storage
        try:
            upload_result = await r2_storage.upload_file(
                file_content=content,
                filename=file.filename,
                bucket_type='ocr_temp',
                content_type=file.content_type or 'application/octet-stream',
                folder=f"ocr/{org_id}/{upload_id}",
                org_name=org_id
            )
            
            if "error" in upload_result:
                logger.error(f"R2 upload failed: {upload_result['error']}")
                continue
            
            temp_file_url = upload_result.get("url") or upload_result.get("key")
            temp_file_key = upload_result.get("key")
            
        except Exception as e:
            logger.error(f"R2 upload error: {e}")
            continue
        
        # Save to temp file for processing
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1])
        try:
            temp_file.write(content)
            temp_file.close()
            
            # Process with OCR
            results = invoice_processor.process_file(
                file_path=temp_file.name,
                client=client,
                model_id=OCR_MODEL_PRIMARY,
                fuel_records=fuel_records,
                vendor_cache=vendor_cache
            )
            
            if results is None:
                results = []
            
            # Store file info
            file_info = {
                "filename": file.filename,
                "temp_url": temp_file_url,
                "temp_key": temp_file_key,
                "line_item_count": len(results)
            }
            upload_record["files"].append(file_info)
            
            # Process each line item
            for idx, row in enumerate(results):
                # Map category/scope using mappings
                mapped = _map_category_scope(
                    row.get("category", ""),
                    row.get("scope", ""),
                    mappings
                )
                
                # Normalize unit
                ocr_unit = row.get("unit", "")
                normalized_unit = _normalize_unit(ocr_unit, mappings)
                unit_matched = normalized_unit in software_units
                
                # Derive subcategory if not already mapped
                subcategory = mapped.get("subcategory")
                if not subcategory:
                    subcategory = _derive_subcategory(
                        row.get("fuel_name", ""),
                        mapped.get("category", ""),
                        mappings
                    )
                
                # Build billing period
                billing_period = row.get("billing_period", {})
                if not isinstance(billing_period, dict):
                    billing_period = {}
                
                # Create line item record
                line_item_id = str(uuid.uuid4())
                line_item = {
                    "id": line_item_id,
                    "upload_id": upload_id,
                    "organization_id": org_id,
                    "file_index": len(upload_record["files"]) - 1,
                    "filename": file.filename,
                    "temp_file_url": temp_file_url,
                    "temp_file_key": temp_file_key,
                    
                    # Original OCR values (preserved for audit)
                    "original_values": {
                        "invoice_number": row.get("invoice_number"),
                        "vendor_name": row.get("vendor_name"),
                        "date": row.get("date"),
                        "fuel_name": row.get("fuel_name"),
                        "translated_fuel_name": row.get("translated_fuel_name"),
                        "category": row.get("category"),
                        "scope": row.get("scope"),
                        "quantity": row.get("quantity"),
                        "unit": ocr_unit,
                        "cost": row.get("money_spent"),
                        "currency": row.get("currency"),
                        "billing_period": billing_period,
                        "combustion_context": row.get("combustion_context"),
                        "confidence_score": row.get("confidence_score"),
                        "low_confidence_fields": row.get("low_confidence_fields", []),
                        "mapped_fuel": row.get("mapped_fuel"),
                        "needs_review": row.get("needs_review", True)
                    },
                    
                    # Current/edited values (user can modify these)
                    "current_values": {
                        "invoice_number": row.get("invoice_number"),
                        "vendor_name": row.get("vendor_name"),
                        "scope": mapped.get("scope"),
                        "category": mapped.get("category"),
                        "subcategory": subcategory,
                        "fuel_name": row.get("mapped_fuel") or row.get("fuel_name"),
                        "quantity": row.get("quantity"),
                        "unit": normalized_unit,
                        "unit_matched": unit_matched,
                        "cost": row.get("money_spent"),
                        "currency": row.get("currency"),
                        "billing_period_start": billing_period.get("start_date"),
                        "billing_period_end": billing_period.get("end_date"),
                        "billing_period_text": billing_period.get("period_text")
                    },
                    
                    # Metadata
                    "confidence_score": row.get("confidence_score"),
                    "needs_review": row.get("needs_review", True),
                    "status": "pending_review",  # pending_review, edited, accepted, imported
                    "edit_history": [],
                    "accepted_values": None,
                    "accepted_by": None,
                    "accepted_at": None,
                    "imported_at": None,
                    "emission_record_ids": [],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                all_line_items.append(line_item)
                
        except Exception as e:
            logger.error(f"OCR processing error for {file.filename}: {e}")
        finally:
            try:
                os.unlink(temp_file.name)
            except Exception:
                pass
    
    # Save vendor cache
    _save_vendor_cache(vendor_cache)
    
    # Update upload status
    upload_record["status"] = "completed"
    upload_record["total_line_items"] = len(all_line_items)
    upload_record["needs_review_count"] = sum(1 for item in all_line_items if item.get("needs_review"))
    
    # Insert records to MongoDB
    await db[OCR_UPLOADS_COLLECTION].insert_one(upload_record)
    
    if all_line_items:
        await db[OCR_LINE_ITEMS_COLLECTION].insert_many(all_line_items)
    
    # Return response (exclude _id fields)
    return {
        "upload_id": upload_id,
        "file_count": len(upload_record["files"]),
        "total_line_items": len(all_line_items),
        "needs_review_count": upload_record["needs_review_count"],
        "line_items": [
            {k: v for k, v in item.items() if k != "_id"}
            for item in all_line_items
        ]
    }


@router.post("/upload")
async def upload_invoices(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    mode: str = Form(default="fast"),
    current_user: dict = Depends(get_current_user),
):
    """Stage sources immediately and process Scope 1, 2, and 3 extraction in the background."""
    org_id = _get_org(current_user)
    if not files:
        raise HTTPException(status_code=400, detail="Select at least one invoice or spreadsheet.")
    try:
        extraction_mode = get_mode(mode)
        result = await queue_upload_batch(files, org_id, current_user, extraction_mode)
        if result["file_count"]:
            background_tasks.add_task(process_queued_upload, result["upload_id"], org_id, current_user)
        return JSONResponse(status_code=202, content=result)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        logger.error("OCR configuration error", extra={"organization_id": org_id, "mode": mode})
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Advanced OCR upload failed", extra={"organization_id": org_id, "mode": mode})
        raise HTTPException(status_code=500, detail="Invoice extraction failed. Please verify the file and try again.") from error


@router.get("/template/download")
async def download_ocr_template(current_user: dict = Depends(get_current_user)):
    """Download a spreadsheet that the OCR ledger importer can read directly."""
    org_id = _get_org(current_user)
    try:
        template = await generate_ocr_template(db, org_id)
    except Exception as error:
        logger.exception("OCR template generation failed", extra={"organization_id": org_id})
        raise HTTPException(status_code=500, detail="The OCR spreadsheet template could not be generated.") from error
    return StreamingResponse(
        template,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=ocr_activity_template.xlsx"},
    )


@router.get("/uploads")
async def list_uploads(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List OCR uploads for the organization."""
    org_id = _get_org(current_user)
    
    uploads = await db[OCR_UPLOADS_COLLECTION].find(
        {"organization_id": org_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"uploads": uploads}


@router.get("/uploads/{upload_id}")
async def get_upload(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific upload with its line items."""
    org_id = _get_org(current_user)
    
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0}
    )
    
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    # Get line items
    line_items = await db[OCR_LINE_ITEMS_COLLECTION].find(
        {"upload_id": upload_id},
        {"_id": 0}
    ).to_list(1000)
    
    return {
        "upload": upload,
        "line_items": line_items
    }


@router.get("/uploads/{upload_id}/files/{file_index}/preview")
async def preview_upload_file(
    upload_id: str,
    file_index: int,
    current_user: dict = Depends(get_current_user),
):
    """Stream an OCR source file after organization-level authorization."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "files": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    file_info = next((item for item in upload.get("files", []) if item.get("file_index") == file_index), None)
    if not file_info or not file_info.get("temp_key"):
        raise HTTPException(status_code=404, detail="Source file not found")
    try:
        content, content_type = await r2_storage.get_file("ocr_temp", file_info["temp_key"])
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Source file is no longer available") from error
    safe_name = str(file_info.get("filename") or "invoice").replace('"', "")
    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.get("/uploads/{upload_id}/export")
async def export_upload_csv(
    upload_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Export reviewed OCR rows in an audit-friendly flat CSV."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "id": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    items = await db[OCR_LINE_ITEMS_COLLECTION].find(
        {"upload_id": upload_id, "organization_id": org_id},
        {"_id": 0, "current_values": 1, "confidence_score": 1, "needs_review": 1, "status": 1, "filename": 1},
    ).to_list(5000)
    fieldnames = [
        "filename", "invoice_number", "vendor_name", "item_description", "scope", "category",
        "subcategory", "quantity", "unit", "distance_km", "cost", "currency", "ef_method",
        "ef_database", "naics_code", "naics_label", "accounting_rationale", "confidence_score",
        "needs_review", "status",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for item in items:
        values = item.get("current_values", {})
        writer.writerow({
            **{field: values.get(field) for field in fieldnames},
            "filename": item.get("filename"),
            "confidence_score": item.get("confidence_score"),
            "needs_review": item.get("needs_review"),
            "status": item.get("status"),
        })
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="ocr-extraction-{upload_id}.csv"'},
    )


@router.get("/configuration")
async def get_ocr_configuration(current_user: dict = Depends(get_current_user)):
    """Return enabled scopes, available modes, and editable category options."""
    org_id = _get_org(current_user)
    _, scopes, disabled_scope3_sheets = await build_org_context(org_id)
    facilities = await db.facilities.find(
        {
            "organization_id": org_id,
            "is_deleted": {"$ne": True},
            "is_active": {"$ne": False},
        },
        {"_id": 0, "id": 1, "name": 1},
    ).sort("name", 1).to_list(1000)
    scopes = [scope for scope in ("scope1", "scope2", "scope3") if scope in scopes] + ["water"]
    scope_categories = list(SCOPE_CATEGORY_NAMES.items())
    categories = [
        *({"scope": "scope1", "value": value, "label": value, "key": key, "code": key} for key, value in scope_categories[:3]),
        *({"scope": "scope2", "value": value, "label": value, "key": key, "code": key} for key, value in scope_categories[3:]),
        *(
            {"scope": "scope3", "value": value, "label": value, "key": key, "code": value.split(" - ", 1)[0].lower()}
            for key, value in SCOPE3_CATEGORY_NAMES.items()
            if value.split(" - ", 1)[0] not in disabled_scope3_sheets
        ),
        *({"scope": "water", "value": value, "label": value, "key": key, "code": key} for key, value in WATER_CATEGORY_NAMES.items()),
    ]
    return {
        "enabled_scopes": scopes,
        "modes": [
            {
                "key": mode.key,
                "label": mode.label,
                "vision_model": mode.vision_model,
                "reasoning_model": mode.reasoning_model,
            }
            for mode in MODES.values()
        ],
        "categories": categories,
        "facilities": facilities,
    }


@router.get("/factor-options")
async def get_ocr_factor_options(
    scope: str = Query(..., min_length=1),
    category: str = Query(..., min_length=1),
    method: str = Query(..., min_length=1),
    current_user: dict = Depends(get_current_user),
):
    """Return canonical factor and unit choices for one OCR edit combination."""
    _get_org(current_user)
    options = await resolve_factor_options(db, scope, category, method)
    return {
        "scope": scope,
        "category": category,
        "method": method,
        "factors": options,
        "count": len(options),
    }


@router.put("/uploads/{upload_id}/facility-assignments")
async def assign_upload_facilities(
    upload_id: str,
    request: UploadFacilityAssignments,
    current_user: dict = Depends(get_current_user),
):
    """Assign each non-spreadsheet source document to an active organization facility."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "files": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    assignments_by_file = {assignment.file_index: assignment.facility_id for assignment in request.assignments}
    if len(assignments_by_file) != len(request.assignments):
        raise HTTPException(status_code=422, detail="Each invoice can be assigned to one facility only.")
    upload_file_indexes = {file.get("file_index") for file in upload.get("files", [])}
    if not set(assignments_by_file).issubset(upload_file_indexes):
        raise HTTPException(status_code=422, detail="One or more selected invoices do not belong to this upload.")

    facility_ids = set(assignments_by_file.values())
    facilities = await db.facilities.find(
        {
            "id": {"$in": list(facility_ids)},
            "organization_id": org_id,
            "is_deleted": {"$ne": True},
            "is_active": {"$ne": False},
        },
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(len(facility_ids))
    facilities_by_id = {facility["id"]: facility for facility in facilities if facility.get("id")}
    if facility_ids != set(facilities_by_id):
        raise HTTPException(status_code=422, detail="Choose an active facility from your organization.")

    assigned_at = datetime.now(timezone.utc).isoformat()
    for file_index, facility_id in assignments_by_file.items():
        facility = facilities_by_id[facility_id]
        await db[OCR_LINE_ITEMS_COLLECTION].update_many(
            {"upload_id": upload_id, "organization_id": org_id, "file_index": file_index},
            {"$set": {
                "current_values.facility_id": facility_id,
                "current_values.location": facility.get("name", ""),
                "updated_at": assigned_at,
            }},
        )
        await db[OCR_UPLOADS_COLLECTION].update_one(
            {"id": upload_id, "organization_id": org_id},
            {"$set": {
                "files.$[file].facility_id": facility_id,
                "files.$[file].facility_name": facility.get("name", ""),
                "files.$[file].facility_assigned_at": assigned_at,
            }},
            array_filters=[{"file.file_index": file_index}],
        )

    return {
        "message": "Invoice facilities assigned",
        "assignments": [
            {
                "file_index": file_index,
                "facility_id": facility_id,
                "facility_name": facilities_by_id[facility_id].get("name", ""),
            }
            for file_index, facility_id in assignments_by_file.items()
        ],
    }


@router.get("/line-items")
async def list_line_items(
    upload_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    """List OCR line items for the organization with optional filters."""
    org_id = _get_org(current_user)
    
    query = {"organization_id": org_id}
    if upload_id:
        query["upload_id"] = upload_id
    if status:
        query["status"] = status
    
    line_items = await db[OCR_LINE_ITEMS_COLLECTION].find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"line_items": line_items}


@router.put("/line-items/{item_id}")
async def edit_line_item(
    item_id: str,
    edit_data: AdvancedLineItemEdit,
    current_user: dict = Depends(get_current_user)
):
    """
    Edit a line item. Updates current_values and adds to edit_history.
    Original OCR values are preserved for audit.
    """
    org_id = _get_org(current_user)
    
    # Find item
    item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": item_id, "organization_id": org_id}
    )
    
    if not item:
        raise HTTPException(status_code=404, detail="Line item not found")
    
    if item.get("status") == "imported":
        raise HTTPException(status_code=400, detail="Cannot edit imported line items")
    
    # Build update
    current_values = item.get("current_values", {})
    edit_changes = {}
    
    submitted = edit_data.model_dump(exclude_unset=True)
    remember_override = submitted.pop("remember_override", False)
    if submitted.get("facility_id"):
        facility = await db.facilities.find_one(
            {
                "id": submitted["facility_id"],
                "organization_id": org_id,
                "is_deleted": {"$ne": True},
                "is_active": {"$ne": False},
            },
            {"_id": 0, "id": 1, "name": 1},
        )
        if not facility:
            raise HTTPException(status_code=422, detail="Choose an active facility from your organization.")
        submitted["location"] = facility.get("name", "")
    if submitted.get("factor_id"):
        candidate = {**current_values, **{key: value for key, value in submitted.items() if value is not None}}
        try:
            selected_factor = await validate_factor_selection(
                db,
                scope=candidate.get("scope") or "",
                category=candidate.get("category") or "",
                method=candidate.get("ef_method") or "",
                factor_id=candidate.get("factor_id") or "",
                lookup_value=candidate.get("ef_lookup_key") or candidate.get("subcategory") or "",
                unit=candidate.get("unit") or "",
                currency=candidate.get("currency") or "",
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        submitted.update({
            "factor_id": selected_factor["id"],
            "subcategory": selected_factor["value"],
            "fuel_name": selected_factor["value"],
            "ef_lookup_key": selected_factor["value"],
            "ef_database": selected_factor["database"],
            "fuel_id": selected_factor["id"] if selected_factor["collection"] == "fuel_database" else "",
            "scope3_ef_id": selected_factor["id"] if selected_factor["collection"] == "scope3_ef" else "",
            "naics_code": selected_factor.get("naics_code") or (candidate.get("naics_code") if selected_factor.get("method") == "spend" else ""),
            "naics_label": selected_factor.get("naics_label") or (candidate.get("naics_label") if selected_factor.get("method") == "spend" else ""),
        })
        submitted[selected_factor["selected_input_field"]] = selected_factor["selected_input_value"]
    for field, value in submitted.items():
        if value is not None:
            old_value = current_values.get(field)
            if old_value != value:
                edit_changes[field] = {"old": old_value, "new": value}
                current_values[field] = value
    
    if not edit_changes:
        if remember_override:
            await save_vendor_override(org_id, current_user, current_values)
        return {"message": "No changes detected", "line_item": {k: v for k, v in item.items() if k != "_id"}}
    
    # Add to edit history
    edit_history = item.get("edit_history", [])
    edit_history.append({
        "edited_by": current_user.get("id"),
        "edited_by_name": current_user.get("name", "Unknown"),
        "edited_at": datetime.now(timezone.utc).isoformat(),
        "changes": edit_changes
    })
    
    # Update
    await db[OCR_LINE_ITEMS_COLLECTION].update_one(
        {"id": item_id},
        {
            "$set": {
                "current_values": current_values,
                "edit_history": edit_history,
                "status": "edited" if item.get("status") != "accepted" else "accepted",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Fetch updated item
    updated_item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": item_id},
        {"_id": 0}
    )

    if remember_override:
        await save_vendor_override(org_id, current_user, current_values)
    
    return {"message": "Line item updated", "line_item": updated_item}


@router.post("/line-items/{item_id}/accept")
async def accept_line_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Accept a line item for import. Returns data formatted for emission form pre-fill.
    Does NOT create emission record - user must complete and save the emission form.
    """
    org_id = _get_org(current_user)
    
    # Find item
    item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": item_id, "organization_id": org_id}
    )
    
    if not item:
        raise HTTPException(status_code=404, detail="Line item not found")
    
    if item.get("status") == "imported":
        raise HTTPException(status_code=400, detail="Line item already imported")
    
    current_values = item.get("current_values", {})
    
    # Build accepted values (snapshot at time of acceptance)
    accepted_values = {
        **current_values,
        "accepted_at": datetime.now(timezone.utc).isoformat(),
        "accepted_by": current_user.get("id"),
        "accepted_by_name": current_user.get("name", "Unknown")
    }
    
    # Update item status
    await db[OCR_LINE_ITEMS_COLLECTION].update_one(
        {"id": item_id},
        {
            "$set": {
                "status": "accepted",
                "accepted_values": accepted_values,
                "accepted_by": current_user.get("id"),
                "accepted_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # OCR invoices are the authoritative source for the resulting GHG entry.
    # Factor provenance remains represented by the resolved formula/version,
    # rather than copying OCR-only classification metadata into emissions.
    invoice_num = current_values.get("invoice_number", "N/A")
    vendor = current_values.get("vendor_name", "Unknown Vendor")
    source_info = f"Invoice No. {invoice_num}"
    facility = None
    if current_values.get("facility_id"):
        facility = await db.facilities.find_one(
            {
                "id": current_values["facility_id"],
                "organization_id": org_id,
                "is_deleted": {"$ne": True},
                "is_active": {"$ne": False},
            },
            {"_id": 0, "id": 1},
        )
    if not facility and current_values.get("location"):
        facility = await db.facilities.find_one(
            {
                "organization_id": org_id,
                "name": current_values["location"],
                "is_deleted": {"$ne": True},
                "is_active": {"$ne": False},
            },
            {"_id": 0, "id": 1},
        )

    ocr_method = str(current_values.get("ef_method") or "").strip().lower()
    scope3_method = {
        "activity": "activity_basis",
        "activity_basis": "activity_basis",
        "spend": "spend_basis",
        "spend_basis": "spend_basis",
        "supplier": "supplier_basis",
        "supplier_basis": "supplier_basis",
    }.get(ocr_method)
    
    # Build response for emission form pre-fill
    prefill_data = {
        "line_item_id": item_id,
        "upload_id": item.get("upload_id"),
        
        # Emission form fields
        "scope": current_values.get("scope", "scope1"),
        "category": current_values.get("category"),
        "subcategory": current_values.get("subcategory"),
        "fuel_name": current_values.get("fuel_name"),
        "quantity": current_values.get("quantity"),
        "unit": current_values.get("unit"),
        "reporting_period": current_values.get("reporting_period"),
        
        # Billing period
        "billing_period": {
            "start_date": current_values.get("billing_period_start"),
            "end_date": current_values.get("billing_period_end"),
            "period_text": current_values.get("billing_period_text")
        },
        
        # Source info & evidence
        "source_of_information": source_info,
        "responsible_person": current_user.get("name", ""),
        
        # Invoice file for evidence
        "invoice_file_url": _preview_path(item.get("upload_id"), item.get("file_index", 0)),
        "invoice_file_key": item.get("temp_file_key"),
        "invoice_filename": item.get("filename"),
        
        # Additional context
        "invoice_number": invoice_num,
        "facility_id": facility.get("id") if facility else None,
        "cost": current_values.get("cost"),
        "currency": current_values.get("currency"),
        "category_code": current_values.get("category_code"),
        "distance_km": current_values.get("distance_km"),
        "calculation_method_scope3": scope3_method if current_values.get("scope") == "scope3" else None,
        "scope3_activity": current_values.get("ef_lookup_key") or current_values.get("subcategory"),
        "scope3_activity_type": current_values.get("scope3_activity_type"),
        "scope3_subcategory": current_values.get("scope3_subcategory"),
        "supplier_name": vendor if current_values.get("scope") == "scope3" else None,
        "fuel_id": current_values.get("fuel_id") or (current_values.get("factor_id") if current_values.get("scope") in {"scope1", "scope2"} else None),
        "scope3_ef_id": current_values.get("scope3_ef_id") or (current_values.get("factor_id") if current_values.get("scope") == "scope3" and scope3_method != "supplier_basis" else None),
    }
    
    return {
        "message": "Line item accepted",
        "prefill_data": prefill_data
    }


@router.post("/finalize-water-import")
async def finalize_water_import(
    request: FinalizeWaterImportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Attach OCR evidence to a saved Environment > Water record, then resolve its row."""
    org_id = _get_org(current_user)
    item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": request.line_item_id, "organization_id": org_id},
        {"_id": 0},
    )
    if not item:
        raise HTTPException(status_code=404, detail="OCR line item not found")
    if item.get("current_values", {}).get("scope") != "water":
        raise HTTPException(status_code=400, detail="This OCR row is not a Water activity")
    record = await db.esg_records.find_one(
        {"id": request.esg_record_id, "organization_id": org_id, "section": "environment", "category": "Water"},
        {"_id": 0, "id": 1},
    )
    if not record:
        raise HTTPException(status_code=404, detail="Saved Water record not found")

    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": item.get("upload_id"), "organization_id": org_id},
        {"_id": 0, "files": 1},
    ) or {}
    source_file = next(
        (file for file in upload.get("files", []) if file.get("file_index") == item.get("file_index", 0)),
        {},
    )
    evidence_url = source_file.get("water_evidence_url")
    filename = item.get("filename", "water-source")
    if not evidence_url:
        try:
            file_content, source_content_type = await r2_storage.get_file("ocr_temp", item.get("temp_file_key"))
            org_doc = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1}) or {}
            evidence_result = await r2_storage.upload_file(
                file_content=file_content,
                filename=filename,
                bucket_type="esg_records_evidence",
                content_type=source_content_type or "application/octet-stream",
                org_name=org_doc.get("name") or org_id,
            )
            if not evidence_result or not evidence_result.get("key"):
                raise RuntimeError("Evidence upload did not return a storage key")
            file_record_id = str(uuid.uuid4())
            evidence_url = f"/api/files/{file_record_id}"
            file_record = {
                "id": file_record_id,
                "original_filename": filename,
                "stored_filename": evidence_result["key"],
                "bucket_name": evidence_result.get("bucket"),
                "bucket_type": "esg_records_evidence",
                "r2_key": evidence_result["key"],
                "file_size": len(file_content),
                "content_type": source_content_type or "application/octet-stream",
                "organization_id": org_id,
                "uploaded_by": current_user.get("id"),
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "source": "ocr_water",
            }
            await db.uploaded_files.insert_one(file_record)
            await db[OCR_UPLOADS_COLLECTION].update_one(
                {"id": item.get("upload_id"), "organization_id": org_id},
                {"$set": {
                    "files.$[file].water_evidence_url": evidence_url,
                    "files.$[file].water_evidence_file_id": file_record_id,
                }},
                array_filters=[{"file.file_index": item.get("file_index", 0)}],
            )
        except Exception as error:
            logger.exception("OCR Water evidence finalization failed", extra={"organization_id": org_id, "line_item_id": request.line_item_id})
            raise HTTPException(status_code=502, detail="The Water record was saved, but its source document could not be secured as evidence.") from error

    evidence_file = {
        "id": source_file.get("water_evidence_file_id") or evidence_url.rsplit("/", 1)[-1],
        "filename": filename,
        "file_type": filename.rsplit(".", 1)[-1].lower() if "." in filename else "unknown",
        "file_size": source_file.get("file_size", 0),
        "upload_url": evidence_url,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get("id", ""),
    }
    await db.esg_records.update_one(
        {"id": request.esg_record_id, "organization_id": org_id},
        {"$addToSet": {"evidence_files": evidence_file}},
    )
    resolution = await _resolve_ocr_line_item(item, "saved")
    return {"message": "Water OCR import finalized", "evidence_url": evidence_url, **resolution}


@router.post("/finalize-import")
async def finalize_import(
    request: AdvancedFinalizeImportRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Finalize OCR import after emission record(s) are saved.
    - Copies invoice from temp bucket to evidence bucket
    - Updates emission records with evidence URL (finds by invoice number if IDs not provided)
    - Marks OCR line item as imported
    - Cleans up temp file
    """
    org_id = _get_org(current_user)
    logger.info(f"[OCR Finalize] Starting finalize-import for line_item_id: {request.line_item_id}")
    
    # Find the line item
    item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": request.line_item_id, "organization_id": org_id}
    )
    
    if not item:
        logger.error(f"[OCR Finalize] Line item not found: {request.line_item_id}")
        raise HTTPException(status_code=404, detail="Line item not found")
    
    logger.info(f"[OCR Finalize] Found line item, status: {item.get('status')}")
    
    if item.get("status") == "imported":
        logger.info(f"[OCR Finalize] Already imported, returning existing evidence_url")
        return {"message": "Already imported", "evidence_url": item.get("evidence_url")}
    
    temp_file_key = item.get("temp_file_key")
    filename = item.get("filename", "invoice.pdf")
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": item.get("upload_id"), "organization_id": org_id},
        {"_id": 0, "files": 1},
    ) or {}
    source_file = next(
        (file for file in upload.get("files", []) if file.get("file_index") == item.get("file_index", 0)),
        {},
    )
    evidence_url = source_file.get("evidence_url")
    evidence_file_id = source_file.get("evidence_file_id")
    
    logger.info(f"[OCR Finalize] temp_file_key: {temp_file_key}, filename: {filename}")
    
    # Get invoice number for finding emission records
    current_values = item.get("current_values", {})
    invoice_number = current_values.get("invoice_number")
    vendor_name = current_values.get("vendor_name")
    
    logger.info(f"[OCR Finalize] invoice_number: {invoice_number}, vendor_name: {vendor_name}")
    
    # Find emission records by invoice number if no IDs provided
    emission_record_ids = request.emission_record_ids
    if emission_record_ids:
        linked_records = await db.emission_records.find(
            {"id": {"$in": emission_record_ids}, "organization_id": org_id},
            {"_id": 0, "id": 1},
        ).to_list(len(emission_record_ids))
        if {record.get("id") for record in linked_records} != set(emission_record_ids):
            raise HTTPException(status_code=422, detail="Each GHG record must belong to your organization before evidence can be attached.")
    if not emission_record_ids and invoice_number:
        # Search for recently created emissions with this invoice in source_of_information
        logger.info(f"[OCR Finalize] Searching for emissions with invoice number: {invoice_number}")
        recent_emissions = await db.emission_records.find(
            {
                "organization_id": org_id,
                "source_of_information": {"$regex": invoice_number, "$options": "i"}
            },
            {"id": 1, "_id": 0}
        ).sort("created_at", -1).limit(10).to_list(10)
        
        emission_record_ids = [e["id"] for e in recent_emissions if e.get("id")]
        logger.info(f"[OCR Finalize] Found {len(emission_record_ids)} emission records: {emission_record_ids}")
    
    # Copy file from temp bucket to evidence bucket
    if temp_file_key and not evidence_url:
        try:
            logger.info(f"[OCR Finalize] Downloading from temp bucket: {temp_file_key}")
            # Download from temp bucket
            temp_file_content, source_content_type = await r2_storage.get_file('ocr_temp', temp_file_key)
            
            if temp_file_content:
                # Determine content type
                ext = filename.lower().split('.')[-1] if '.' in filename else 'pdf'
                content_types = {
                    'pdf': 'application/pdf',
                    'png': 'image/png',
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg'
                }
                content_type = source_content_type or content_types.get(ext, 'application/octet-stream')
                
                # Get org name for path (use org name instead of org_id)
                org_doc = await db.organizations.find_one({"id": org_id}, {"name": 1, "_id": 0})
                org_name = org_doc.get("name", org_id) if org_doc else org_id
                
                # Upload to evidence bucket with path: {org_name}/{date}/{file}
                evidence_result = await r2_storage.upload_file(
                    file_content=temp_file_content,
                    filename=filename,
                    bucket_type='emission_evidence',
                    content_type=content_type,
                    org_name=org_name  # No folder param - uses org_name/date/file structure
                )
                
                if evidence_result and evidence_result.get("key"):
                    # Create uploaded_files record for proper file tracking
                    file_record_id = str(uuid.uuid4())
                    evidence_file_id = file_record_id
                    file_record = {
                        "id": file_record_id,
                        "original_filename": filename,
                        "stored_filename": evidence_result['key'],
                        "bucket_name": evidence_result.get('bucket', 'ghg-emissions-evidence'),
                        "bucket_type": 'emission_evidence',
                        "r2_key": evidence_result['key'],
                        "file_size": len(temp_file_content),
                        "content_type": content_type,
                        "organization_id": org_id,
                        "uploaded_by": current_user.get("id"),
                        "uploaded_at": datetime.now(timezone.utc).isoformat(),
                        "source": "ocr_invoice"
                    }
                    await db.uploaded_files.insert_one(file_record)
                    
                    # Use /api/files/{id} format for permanent URL (not presigned)
                    evidence_url = f"/api/files/{file_record_id}"
                    await db[OCR_UPLOADS_COLLECTION].update_one(
                        {"id": item.get("upload_id"), "organization_id": org_id},
                        {"$set": {
                            "files.$[file].evidence_url": evidence_url,
                            "files.$[file].evidence_file_id": file_record_id,
                            "files.$[file].evidence_key": evidence_result["key"],
                            "files.$[file].evidence_bucket": evidence_result.get("bucket"),
                        }},
                        array_filters=[{"file.file_index": item.get("file_index", 0)}],
                    )
                    logger.info(f"[OCR Finalize] Created uploaded_files record: {file_record_id}, evidence_url: {evidence_url}")
                
                logger.info(f"[OCR Finalize] Copied invoice to evidence bucket: {evidence_url}")
                
            else:
                logger.warning(f"[OCR Finalize] Could not download temp file (content is None): {temp_file_key}")
                
        except Exception as e:
            logger.error(f"[OCR Finalize] Error copying invoice to evidence bucket: {e}")
    else:
        if evidence_url:
            logger.info("[OCR Finalize] Reusing existing evidence file for source document")
        else:
            logger.warning(f"[OCR Finalize] No temp_file_key found in line item")

    if not evidence_url:
        raise HTTPException(
            status_code=502,
            detail="The emission was saved, but its source document could not be secured as evidence. Please retry the OCR finalization.",
        )
    
    # Update emission records with evidence URL
    logger.info(f"[OCR Finalize] Updating emissions. evidence_url: {evidence_url}, emission_record_ids: {emission_record_ids}")
    if evidence_url and emission_record_ids:
        for emission_id in emission_record_ids:
            try:
                # Get current evidence - use evidence_url field (comma-separated string)
                emission = await db.emission_records.find_one(
                    {"id": emission_id, "organization_id": org_id},
                    {"_id": 0, "id": 1, "evidence_url": 1},
                )
                logger.info(f"[OCR Finalize] Found emission record: {emission_id}, current evidence_url: {emission.get('evidence_url') if emission else 'NOT FOUND'}")
                if emission:
                    # Parse existing evidence_url (comma-separated string) into list
                    current_evidence_str = emission.get("evidence_url", "") or ""
                    current_evidence = [u.strip() for u in current_evidence_str.split(',') if u.strip()]
                    
                    # Add new evidence if not already present
                    if evidence_url not in current_evidence:
                        current_evidence.append(evidence_url)
                    
                    # Convert back to comma-separated string
                    new_evidence_str = ','.join(current_evidence)
                    
                    # Update emission record
                    await db.emission_records.update_one(
                        {"id": emission_id, "organization_id": org_id},
                        {"$set": {
                            "evidence_url": new_evidence_str,
                            "evidence_file_name": filename,
                            "evidence_file_id": evidence_file_id,
                        }}
                    )
                    logger.info(f"[OCR Finalize] Updated emission record {emission_id} with evidence_url: {new_evidence_str}")
            except Exception as e:
                logger.error(f"[OCR Finalize] Error updating emission record {emission_id}: {e}")
    else:
        logger.warning(f"[OCR Finalize] Skipping emission update - evidence_url: {evidence_url}, emission_record_ids count: {len(emission_record_ids) if emission_record_ids else 0}")
    
    resolution = await _resolve_ocr_line_item(item, "saved")
    
    return {
        "message": "Import finalized successfully",
        "evidence_url": evidence_url,
        "emission_record_ids": emission_record_ids,
        "line_item_removed": True,
        **resolution,
    }


@router.post("/line-items/{item_id}/reject")
async def reject_line_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Reject and remove one extracted row, retaining shared source until all rows resolve."""
    org_id = _get_org(current_user)
    item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": item_id, "organization_id": org_id},
        {"_id": 0},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Line item not found")
    resolution = await _resolve_ocr_line_item(item, "rejected")
    return {
        "message": "Line item rejected and removed",
        "line_item_id": item_id,
        **resolution,
    }


@router.post("/line-items/{item_id}/import")
async def mark_as_imported(
    item_id: str,
    emission_record_ids: List[str],
    evidence_url: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark a line item as imported after emission record(s) are saved.
    Called by the emission form save handler.
    """
    org_id = _get_org(current_user)
    
    # Find item
    item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": item_id, "organization_id": org_id}
    )
    
    if not item:
        raise HTTPException(status_code=404, detail="Line item not found")
    
    resolution = await _resolve_ocr_line_item(item, "saved")
    return {
        "message": "Line item imported and removed from the OCR queue",
        "evidence_url": evidence_url,
        "emission_record_ids": emission_record_ids,
        **resolution,
    }


@router.delete("/uploads/{upload_id}")
async def delete_upload(
    upload_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete an upload and all its line items.
    Also cleans up temporary files from R2.
    """
    org_id = _get_org(current_user)
    
    # Find upload
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id}
    )
    
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    # Get all line items to clean up temp files
    line_items = await db[OCR_LINE_ITEMS_COLLECTION].find(
        {"upload_id": upload_id}
    ).to_list(1000)
    
    # Delete temp files from R2
    deleted_keys = set()
    cleanup_failed = False
    source_keys = {
        file.get("temp_key")
        for file in upload.get("files", [])
        if file.get("temp_key")
    }
    source_keys.update(item.get("temp_file_key") for item in line_items if item.get("temp_file_key"))
    for temp_key in source_keys:
        if temp_key and temp_key not in deleted_keys:
            try:
                deleted = await r2_storage.delete_file('ocr_temp', temp_key)
                if not deleted:
                    raise RuntimeError("R2 did not confirm file deletion")
                deleted_keys.add(temp_key)
            except Exception as e:
                logger.warning(f"Failed to delete temp file {temp_key}: {e}")
                cleanup_failed = True

    if cleanup_failed:
        raise HTTPException(status_code=502, detail="Could not remove all temporary files from storage. The upload remains available for retry.")
    
    # Delete line items
    await db[OCR_LINE_ITEMS_COLLECTION].delete_many({"upload_id": upload_id})
    
    # Delete upload record
    await db[OCR_UPLOADS_COLLECTION].delete_one({"id": upload_id})
    
    return {
        "message": "Upload deleted",
        "deleted_line_items": len(line_items),
        "deleted_temp_files": len(deleted_keys)
    }


@router.post("/check-duplicate")
async def check_duplicate(
    invoice_number: str,
    vendor_name: str,
    scope: str,
    category: str,
    quantity: float,
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Check for potential duplicate emission records before import.
    Returns any existing records that match the criteria.
    """
    org_id = _get_org(current_user)
    
    query = {
        "organization_id": org_id,
        "scope": scope
    }
    
    # Add optional filters
    if facility_id:
        query["facility_id"] = facility_id
    if reporting_period:
        query["reporting_period"] = reporting_period
    
    # Search for potential duplicates
    # Match on source_of_information containing invoice number or vendor
    potential_duplicates = await db.emission_records.find(
        {
            **query,
            "$or": [
                {"source_of_information": {"$regex": invoice_number, "$options": "i"}},
                {"source_of_information": {"$regex": vendor_name, "$options": "i"}}
            ]
        },
        {"_id": 0, "id": 1, "scope": 1, "category": 1, "quantity": 1, "quantity_unit": 1, 
         "reporting_period": 1, "facility_id": 1, "source_of_information": 1}
    ).limit(10).to_list(10)
    
    return {
        "has_potential_duplicates": len(potential_duplicates) > 0,
        "potential_duplicates": potential_duplicates
    }


@router.get("/taxonomy/stats")
async def get_taxonomy_stats(current_user: dict = Depends(get_current_user)):
    """Get fuel taxonomy and mapping statistics."""
    mappings = _load_mappings()
    fuel_taxonomy = mappings.get("fuel_taxonomy", [])
    
    # Group by category and scope
    categories = {}
    scopes = {}
    
    for record in fuel_taxonomy:
        cat = record.get("category", "Unknown")
        scope = record.get("scope", "Unknown")
        
        categories[cat] = categories.get(cat, 0) + 1
        scopes[scope] = scopes.get(scope, 0) + 1
    
    return {
        "total_fuels": len(fuel_taxonomy),
        "categories": categories,
        "scopes": scopes,
        "category_mappings": len(mappings.get("category_mappings", {})),
        "unit_mappings": len(mappings.get("unit_mappings", {}))
    }
