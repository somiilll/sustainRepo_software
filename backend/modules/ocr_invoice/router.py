"""
OCR Invoice Router - Complete AI-Assisted Emission Entry Workflow
Handles invoice upload, OCR extraction, review, edit, accept, and import flows.
"""
import os
import json
import uuid
import logging
import tempfile
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from anthropic import Anthropic

from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from r2_storage import R2Storage
from . import invoice_processor

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

@router.post("/upload")
async def upload_invoices(
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
    edit_data: LineItemEdit,
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
    
    for field, value in edit_data.dict(exclude_unset=True).items():
        if value is not None:
            old_value = current_values.get(field)
            if old_value != value:
                edit_changes[field] = {"old": old_value, "new": value}
                current_values[field] = value
    
    if not edit_changes:
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
    
    # Build source_of_information string
    invoice_num = current_values.get("invoice_number", "N/A")
    vendor = current_values.get("vendor_name", "Unknown Vendor")
    source_info = f"Invoice No. {invoice_num} | Vendor: {vendor}"
    
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
        "invoice_file_url": item.get("temp_file_url"),
        "invoice_file_key": item.get("temp_file_key"),
        "invoice_filename": item.get("filename"),
        
        # Additional context
        "vendor_name": vendor,
        "invoice_number": invoice_num,
        "cost": current_values.get("cost"),
        "currency": current_values.get("currency")
    }
    
    return {
        "message": "Line item accepted",
        "prefill_data": prefill_data
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
    
    # Update item
    await db[OCR_LINE_ITEMS_COLLECTION].update_one(
        {"id": item_id},
        {
            "$set": {
                "status": "imported",
                "imported_at": datetime.now(timezone.utc).isoformat(),
                "emission_record_ids": emission_record_ids,
                "evidence_url": evidence_url
            }
        }
    )
    
    # Clean up temp file from R2 (invoice is now stored as evidence)
    temp_file_key = item.get("temp_file_key")
    if temp_file_key:
        try:
            await r2_storage.delete_file('ocr_temp', temp_file_key)
        except Exception as e:
            logger.warning(f"Failed to delete temp file {temp_file_key}: {e}")
    
    return {"message": "Line item marked as imported"}


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
    for item in line_items:
        temp_key = item.get("temp_file_key")
        if temp_key and temp_key not in deleted_keys:
            try:
                await r2_storage.delete_file(temp_key, 'ocr_temp')
                deleted_keys.add(temp_key)
            except Exception as e:
                logger.warning(f"Failed to delete temp file {temp_key}: {e}")
    
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
