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
import re
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from anthropic import Anthropic

from app.logging import get_logger, log_event
from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from r2_storage import R2Storage
from . import invoice_processor
from bulk_upload_scope3.ghg_config_resolver import resolve_ghg_capabilities
from .config import MAX_FILES_PER_BATCH, MODES, OCR_SAVE_SCOPE_RULES, get_mode
from .factor_options import is_structured_scope3_activity, normalize_method, normalize_option, resolve_factor_options, validate_factor_selection
from .ghg_save_service import execute_ocr_calculation, resolve_ghg_category
from .normalization import canonicalize_calculation_units, canonicalize_calc_engine_unit
from .schemas import FinalizeImportRequest as AdvancedFinalizeImportRequest, FinalizeWaterImportRequest, LineItemEdit as AdvancedLineItemEdit, UploadFacilityAssignments
from .service import build_org_context, process_queued_upload, queue_upload_batch, save_vendor_override
from .template_service import generate_ocr_template
from .taxonomy_service import SCOPE3_CATEGORY_NAMES, SCOPE_CATEGORY_NAMES, WATER_CATEGORY_NAMES
from modules.emissions.contracts import EmissionRecordCreate

logger = get_logger(__name__)
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
SPREADSHEET_EXTENSIONS = {".csv", ".xls", ".xlsx"}
GENERATED_SPREADSHEET_ROW_PATTERN = re.compile(r"^row[-_\s]?\d+$", re.IGNORECASE)


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


def _client_safe_upload(upload: dict) -> dict:
    """Keep internal OCR provider diagnostics out of customer API responses."""
    return {
        **upload,
        "files": [
            {key: value for key, value in file.items() if key != "provider_diagnostic"}
            for file in upload.get("files", [])
        ],
    }


def _history_line_item(item: dict, outcome: str) -> dict:
    values = item.get("current_values") or {}
    row_status = {"saved": "Saved", "rejected": "Rejected"}.get(outcome, "Pending Review")
    return {
        "id": item.get("id"),
        "item_description": values.get("item_description") or values.get("fuel_name") or item.get("filename") or "Untitled item",
        "scope": values.get("scope") or "",
        "category": values.get("category") or "",
        "subcategory": values.get("subcategory") or "",
        "reporting_period": values.get("reporting_period") or values.get("billing_period_start") or values.get("billing_period_end") or "",
        "status": row_status,
    }


def _is_spreadsheet_ocr_item(item: dict) -> bool:
    return os.path.splitext(str(item.get("filename") or ""))[1].lower() in SPREADSHEET_EXTENSIONS


def _is_generated_spreadsheet_row_identifier(value: object) -> bool:
    return bool(GENERATED_SPREADSHEET_ROW_PATTERN.fullmatch(str(value or "").strip()))


def _without_generated_spreadsheet_row_identifier(item: dict, values: dict) -> dict:
    sanitized = dict(values)
    if _is_spreadsheet_ocr_item(item) and _is_generated_spreadsheet_row_identifier(sanitized.get("invoice_number")):
        sanitized["invoice_number"] = ""
    return sanitized


def _ocr_record_metadata(item: dict, values: dict) -> dict:
    """Build OCR provenance and Scope 1-only extracted context notes."""
    original_values = item.get("original_values") or {}

    def field(name: str) -> str:
        if name == "invoice_number" and _is_spreadsheet_ocr_item(item):
            candidate = values.get(name)
            if not candidate or _is_generated_spreadsheet_row_identifier(candidate):
                return ""
        return str(values.get(name) or original_values.get(name) or "").strip()

    note_parts = []
    if values.get("scope") == "scope1":
        if vendor_name := field("vendor_name"):
            note_parts.append(f"Vendor: {vendor_name}")
        if item_description := field("item_description"):
            note_parts.append(f"Item description: {item_description}")
        if extracted_notes := field("notes") or field("additional_context"):
            note_parts.append(f"OCR notes: {extracted_notes}")
    return {
        "is_spreadsheet": _is_spreadsheet_ocr_item(item),
        "source_of_information": "OCR Excel Upload" if _is_spreadsheet_ocr_item(item) else "OCR Invoice Upload",
        "record_source": field("invoice_number"),
        "vendor_name": field("vendor_name") or None,
        "notes": "\n".join(note_parts),
    }


def _reporting_period_from_ocr_values(values: dict, upload: dict | None = None) -> str:
    for value in (
        values.get("reporting_period"),
        values.get("billing_period_start"),
        values.get("billing_period_end"),
        values.get("date"),
        values.get("billing_period_text"),
        (upload or {}).get("created_at"),
    ):
        match = re.search(r"(\d{4})[-/](0[1-9]|1[0-2])", str(value or ""))
        if match:
            return f"{match.group(1)}-{match.group(2)}"
    return ""


def _match_ocr_factor_option(options: list[dict], item: dict, values: dict) -> dict | None:
    def taxonomy_match_value(value: object) -> str:
        return re.sub(
            r"\s*\((?:non_renewable|renewable|landfill|recycling|composting|combustion)\)\s*$",
            "",
            str(value or ""),
            flags=re.IGNORECASE,
        )

    def factor_words(value: object) -> set[str]:
        normalized = re.sub(r"^\s*\d{2,6}\s*[-–—:]\s*", "", taxonomy_match_value(value).lower())
        raw_words = re.findall(r"[a-z0-9]+", normalized)
        stop_words = {"and", "the", "of", "for", "to", "in", "a", "an"}
        tokens = {word for word in raw_words if len(word) > 1 and word not in stop_words}
        compound_terms = {"wastewater": ("waste", "water")}
        for compound, terms in compound_terms.items():
            if compound in tokens:
                tokens.update(terms)
            if any("".join(raw_words[index:index + len(terms)]) == compound for index in range(len(raw_words) - len(terms) + 1)):
                tokens.add(compound)
        return tokens

    def similarity(left: object, right: object) -> float:
        left_words, right_words = factor_words(left), factor_words(right)
        if not left_words or not right_words:
            return 0.0
        common = len(left_words & right_words)
        containment = common / min(len(left_words), len(right_words))
        dice = (2 * common) / (len(left_words) + len(right_words))
        return (containment * 0.65) + (dice * 0.35)

    original_values = item.get("original_values") or {}
    candidates = [
        values.get("ef_lookup_key"), values.get("subcategory"), values.get("fuel_name"), values.get("item_description"),
        original_values.get("ef_lookup_key"), original_values.get("subcategory"), original_values.get("fuel_name"), original_values.get("item_description"),
    ]
    candidates = [candidate for candidate in candidates if str(candidate or "").strip()]
    exact_matches = [
        option for option in options
        if any(normalize_option(taxonomy_match_value(candidate)) == normalize_option(option.get("value")) for candidate in candidates)
    ]
    if len(exact_matches) == 1:
        return exact_matches[0]
    contains_matches = [
        option for option in options
        if any(
            len(normalize_option(taxonomy_match_value(candidate))) >= 4
            and (normalize_option(taxonomy_match_value(candidate)) in normalize_option(option.get("value"))
                 or normalize_option(option.get("value")) in normalize_option(taxonomy_match_value(candidate)))
            for candidate in candidates
        )
    ]
    if len(contains_matches) == 1:
        return contains_matches[0]

    ranked = sorted(
        (
            (option, max((similarity(candidate, option.get("value")) for candidate in candidates), default=0.0))
            for option in options
        ),
        key=lambda match: match[1],
        reverse=True,
    )
    best_option, best_score = ranked[0] if ranked else (None, 0.0)
    next_score = ranked[1][1] if len(ranked) > 1 else 0.0
    if best_option and best_score >= 0.75 and best_score - next_score >= 0.1:
        return best_option
    return None


def _preferred_factor_option(scope: str, options: list[dict], item: dict, values: dict) -> dict | None:
    scope_rules = OCR_SAVE_SCOPE_RULES.get(scope, {})
    if not scope_rules.get("enabled"):
        return None
    preferences = scope_rules.get("generic_activity_preferences", {})
    raw_values = [
        values.get("subcategory"), values.get("fuel_name"), values.get("ef_lookup_key"),
        *(item.get("original_values") or {}).values(),
    ]
    normalized_values = {normalize_option(value) for value in raw_values if isinstance(value, str) and value.strip()}
    for generic_name, preferred_name in preferences.items():
        if normalize_option(generic_name) not in normalized_values:
            continue
        preferred = next((option for option in options if normalize_option(option.get("value")) == normalize_option(preferred_name)), None)
        if preferred:
            return preferred
    candidate_tokens = {
        token
        for value in raw_values
        if isinstance(value, str)
        for token in re.findall(r"[a-z0-9]+", value.lower())
    }
    category_key = normalize_option(values.get("category"))
    for preference in scope_rules.get("fuzzy_activity_preferences", ()):
        token_groups = preference.get("token_groups", ())
        if not category_key.startswith(preference.get("category_prefix", "")):
            continue
        if not all(any(token in candidate_tokens for token in group) for group in token_groups):
            continue
        preferred = next((option for option in options if normalize_option(option.get("value")) == normalize_option(preference["activity"])), None)
        if preferred:
            return preferred
    return None


def _canonical_option_input(option: dict, raw_value: str, input_field: str) -> str:
    allowed_values = option.get("allowed_units") or []
    for allowed_value in allowed_values:
        aliases = option.get("unit_aliases", {}).get(allowed_value, [allowed_value])
        if any(normalize_option(alias) == normalize_option(raw_value) for alias in aliases):
            return allowed_value
    return ""


def _extracted_factor_input(values: dict, input_field: str) -> str:
    if input_field == "currency":
        return str(values.get("currency") or "").strip()
    activity_value = (values.get("dynamic_field_values") or {}).get("activity_value")
    if isinstance(activity_value, dict) and str(activity_value.get("unit") or "").strip():
        return str(activity_value["unit"]).strip()
    return str(values.get("unit") or "").strip()


async def _resolve_direct_ocr_values(item: dict, values: dict, org_id: str) -> tuple[dict, dict]:
    """Resolve unambiguous OCR values so direct Save GHG does not require an edit round-trip."""
    facility = None
    facility_id = values.get("facility_id")
    if facility_id:
        facility = await db.facilities.find_one(
            {"id": facility_id, "organization_id": org_id, "is_deleted": {"$ne": True}, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "sector": 1},
        )
    if not facility and values.get("location"):
        facilities = await db.facilities.find(
            {"organization_id": org_id, "name": values["location"], "is_deleted": {"$ne": True}, "is_active": {"$ne": False}},
            {"_id": 0, "id": 1, "name": 1, "sector": 1},
        ).to_list(2)
        facility = facilities[0] if len(facilities) == 1 else None
    if not facility:
        raise ValueError("Select an active facility before saving this OCR row to GHG")
    values["facility_id"] = facility["id"]
    values["location"] = facility.get("name", values.get("location", ""))

    if not values.get("reporting_period"):
        upload = await db[OCR_UPLOADS_COLLECTION].find_one(
            {"id": item.get("upload_id"), "organization_id": org_id},
            {"_id": 0, "created_at": 1},
        )
        values["reporting_period"] = _reporting_period_from_ocr_values(values, upload)
    if not values.get("reporting_period"):
        raise ValueError("A reporting period could not be resolved from the OCR date, billing period, or upload month")

    scope = values.get("scope") or ""
    if scope in {"scope1", "scope2"} and not values.get("ef_method"):
        values["ef_method"] = "activity"
    factor_id = values.get("factor_id") or values.get("fuel_id") or values.get("scope3_ef_id")
    if not factor_id:
        options = await resolve_factor_options(
            db,
            scope,
            values.get("category") or "",
            values.get("ef_method") or "",
            facility.get("sector", ""),
        )
        matched_factor = _match_ocr_factor_option(options, item, values)
        matched_factor = matched_factor or _preferred_factor_option(scope, options, item, values)
        if not matched_factor:
            raise ValueError("A unique factor could not be resolved from the extracted OCR values. Review this row before saving.")
        input_field = "currency" if normalize_method(values.get("ef_method")) == "spend" else "unit"
        structured_scope3_activity = is_structured_scope3_activity(
            scope,
            values.get("category") or "",
            values.get("ef_method") or "",
            matched_factor.get("activity_type") or "",
        )
        extracted_input = _extracted_factor_input(values, input_field)
        canonical_input = (
            extracted_input
            if structured_scope3_activity
            else _canonical_option_input(
                matched_factor,
                extracted_input,
                input_field,
            )
        )
        if not canonical_input and not structured_scope3_activity:
            allowed_inputs = ", ".join(matched_factor.get("allowed_units") or []) or "none configured"
            label = "currencies" if input_field == "currency" else "units"
            raise ValueError(
                f"Extracted {input_field} '{extracted_input or 'not provided'}' is not allowed for "
                f"'{matched_factor['label']}'. Allowed {label} are: {allowed_inputs}. "
                "Choose a matching factor or correct the source data."
            )
        values.update({
            "factor_id": matched_factor["id"],
            "fuel_id": matched_factor["id"] if matched_factor["collection"] == "fuel_database" else None,
            "scope3_ef_id": matched_factor["id"] if matched_factor["collection"] == "scope3_ef" else None,
            "subcategory": matched_factor["value"],
            "fuel_name": matched_factor["value"],
            "ef_lookup_key": matched_factor["value"],
            "ef_database": matched_factor["database"],
            input_field: canonical_input,
        })
        if matched_factor.get("activity_type"):
            values["scope3_activity_type"] = matched_factor["activity_type"]
    return values, facility


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
    history_row = _history_line_item(item, outcome)
    await db[OCR_UPLOADS_COLLECTION].update_one(
        {"id": upload_id, "organization_id": org_id},
        {
            "$inc": {
                "files.$[file].resolved_count": 1,
                f"files.$[file].{counter_field}": 1,
            },
            "$push": {"files.$[file].history_rows": history_row},
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
        "uploaded_by_name": current_user.get("full_name") or current_user.get("name") or current_user.get("email") or "Unknown",
        "pipeline": "legacy_fuel_taxonomy",
        "file_count": len(valid_files),
        "files": [],
        "status": "processing",
        "errors": [],
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
                "content_type": file.content_type,
                "file_index": len(upload_record["files"]),
                "temp_url": temp_file_url,
                "temp_key": temp_file_key,
                "line_item_count": len(results),
                "resolved_count": 0,
                "saved_count": 0,
                "rejected_count": 0,
                "resolution_status": "pending",
                "preview_supported": True,
                "status": "completed",
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
    mode: str = Form(default="think"),
    current_user: dict = Depends(get_current_user),
):
    """Stage sources immediately and process Scope 1, 2, and 3 extraction in the background."""
    org_id = _get_org(current_user)
    log_event(logger, logging.INFO, "ocr.upload.request.started", action="ocr.upload.request", outcome="started", context={"organization_id": org_id, "file_count": len(files), "mode": mode})
    if not files:
        log_event(logger, logging.WARNING, "ocr.upload.request.rejected", action="ocr.upload.request", outcome="rejected", error_code="NO_FILES_SELECTED", context={"organization_id": org_id, "mode": mode})
        raise HTTPException(status_code=400, detail="Select at least one invoice or spreadsheet.")
    if len(files) > MAX_FILES_PER_BATCH:
        log_event(logger, logging.WARNING, "ocr.upload.request.rejected", action="ocr.upload.request", outcome="rejected", error_code="BATCH_LIMIT_EXCEEDED", context={"organization_id": org_id, "file_count": len(files), "mode": mode})
        raise HTTPException(status_code=400, detail=f"Select up to {MAX_FILES_PER_BATCH} files per batch.")
    try:
        _, enabled_scopes, _ = await build_org_context(org_id)
        if "scope3" not in enabled_scopes:
            return await _legacy_upload_invoices(files=files, current_user=current_user)
        extraction_mode = get_mode(mode)
        result = await queue_upload_batch(files, org_id, current_user, extraction_mode)
        if result["file_count"] and result.get("status") == "queued":
            background_tasks.add_task(process_queued_upload, result["upload_id"], org_id, current_user)
        return JSONResponse(status_code=202, content=result)
    except ValueError as error:
        log_event(logger, logging.WARNING, "ocr.upload.request.rejected", action="ocr.upload.request", outcome="rejected", error_code="INVALID_UPLOAD_REQUEST", context={"organization_id": org_id, "mode": mode})
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        logger.error("OCR configuration error", extra={"organization_id": org_id, "mode": mode})
        log_event(logger, logging.ERROR, "ocr.upload.request.failed", action="ocr.upload.request", outcome="failed", error_code="OCR_CONFIGURATION_ERROR", context={"organization_id": org_id, "mode": mode}, exc_info=True)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Advanced OCR upload failed", extra={"organization_id": org_id, "mode": mode})
        log_event(logger, logging.ERROR, "ocr.upload.request.failed", action="ocr.upload.request", outcome="failed", error_code="OCR_UPLOAD_FAILED", context={"organization_id": org_id, "mode": mode}, exc_info=True)
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
    
    return {"uploads": [_client_safe_upload(upload) for upload in uploads]}


@router.get("/history")
async def list_upload_history(
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    """Return a file-level audit history without exposing OCR source documents."""
    org_id = _get_org(current_user)
    uploads = await db[OCR_UPLOADS_COLLECTION].find(
        {"organization_id": org_id},
        {"_id": 0, "id": 1, "uploaded_by": 1, "uploaded_by_name": 1, "created_at": 1, "status": 1, "mode": 1, "files": 1},
    ).sort("created_at", -1).limit(limit).to_list(limit)
    uploader_ids = list({str(upload.get("uploaded_by")) for upload in uploads if upload.get("uploaded_by")})
    users = await db.users.find(
        {"id": {"$in": uploader_ids}},
        {"_id": 0, "id": 1, "full_name": 1, "email": 1},
    ).to_list(len(uploader_ids)) if uploader_ids else []
    uploader_names = {
        user["id"]: user.get("full_name") or user.get("email") or "Unknown"
        for user in users if user.get("id")
    }
    upload_ids = [upload.get("id") for upload in uploads if upload.get("id")]
    active_items = await db[OCR_LINE_ITEMS_COLLECTION].find(
        {"organization_id": org_id, "upload_id": {"$in": upload_ids}},
        {"_id": 0, "id": 1, "upload_id": 1, "file_index": 1, "filename": 1, "current_values": 1},
    ).sort("created_at", 1).to_list(5000) if upload_ids else []
    active_rows_by_file = {}
    for item in active_items:
        file_key = f"{item.get('upload_id')}-{item.get('file_index', 0)}"
        active_rows_by_file.setdefault(file_key, []).append(_history_line_item(item, "pending"))
    history = []
    for upload in uploads:
        for file in upload.get("files", []):
            saved_count = int(file.get("saved_count") or 0)
            rejected_count = int(file.get("rejected_count") or 0)
            total_resolved = saved_count + rejected_count
            line_item_count = int(file.get("line_item_count") or 0)
            raw_status = file.get("status") or upload.get("status") or "unknown"
            is_final = file.get("resolution_status") == "resolved" or (line_item_count > 0 and total_resolved >= line_item_count)
            if raw_status == "failed" or upload.get("status") == "failed":
                file_status = "Error"
            elif raw_status in {"cancelled", "cancel_requested"} or upload.get("status") == "cleared":
                file_status = "Event Cancelled"
            elif saved_count and rejected_count:
                file_status = "Partially Saved"
            elif is_final and saved_count:
                file_status = "Saved"
            elif is_final and rejected_count:
                file_status = "Rejected All"
            elif saved_count or rejected_count:
                file_status = "Partially Saved"
            elif raw_status in {"queued", "processing", "awaiting_facility_assignment"}:
                file_status = "Processing"
            else:
                file_status = "Pending Review"
            history.append({
                "id": f"{upload.get('id')}-{file.get('file_index', 0)}",
                "filename": file.get("filename") or "Untitled source",
                "uploaded_by_name": upload.get("uploaded_by_name") if upload.get("uploaded_by_name") not in {None, "", "Unknown"} else uploader_names.get(str(upload.get("uploaded_by")), "Unknown"),
                "uploaded_at": upload.get("created_at"),
                "status": file_status,
                "mode": upload.get("mode"),
                "rows": [
                    *[row for row in file.get("history_rows", []) if isinstance(row, dict)],
                    *active_rows_by_file.get(f"{upload.get('id')}-{file.get('file_index', 0)}", []),
                ],
            })
    return {"history": history}


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
        "upload": _client_safe_upload(upload),
        "line_items": line_items
    }


@router.post("/uploads/{upload_id}/cancel")
async def cancel_upload_processing(
    upload_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Stop a queued or processing advanced OCR batch before further files are persisted."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "id": 1, "status": 1, "files": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    if upload.get("status") not in {"queued", "processing"}:
        raise HTTPException(status_code=409, detail="Only queued or processing uploads can be cancelled")
    files = [
        {**file, "status": "cancelled" if file.get("status") in {"queued", "processing"} else file.get("status")}
        for file in upload.get("files", [])
    ]
    result = await db[OCR_UPLOADS_COLLECTION].update_one(
        {"id": upload_id, "organization_id": org_id, "status": {"$in": ["queued", "processing"]}},
        {"$set": {"status": "cancelled", "files": files, "cancelled_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=409, detail="This upload finished before it could be cancelled")
    return {"upload_id": upload_id, "status": "cancelled"}


@router.post("/uploads/{upload_id}/resume")
async def resume_queued_upload(
    upload_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Safely restart a queued OCR batch that was interrupted before its worker began."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "id": 1, "status": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    if upload.get("status") != "queued":
        raise HTTPException(status_code=409, detail="Only queued OCR uploads can be resumed")
    background_tasks.add_task(process_queued_upload, upload_id, org_id, current_user)
    return {"upload_id": upload_id, "status": "queued", "resume_requested": True}


@router.post("/uploads/{upload_id}/files/{file_index}/cancel")
async def cancel_upload_file_processing(
    upload_id: str,
    file_index: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Cancel one queued or in-flight invoice while allowing sibling invoices to continue."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "id": 1, "status": 1, "files": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    target_file = next((file for file in upload.get("files", []) if file.get("file_index") == file_index), None)
    if not target_file:
        raise HTTPException(status_code=404, detail="Invoice file not found")
    if target_file.get("status") not in {"queued", "processing"}:
        raise HTTPException(status_code=409, detail="Only queued or processing invoices can be cancelled")
    status = "cancel_requested" if target_file.get("status") == "processing" else "cancelled"
    result = await db[OCR_UPLOADS_COLLECTION].update_one(
        {
            "id": upload_id,
            "organization_id": org_id,
            "files": {"$elemMatch": {"file_index": file_index, "status": {"$in": ["queued", "processing"]}}},
        },
        {"$set": {"files.$[file].status": status, "files.$[file].cancel_requested_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}},
        array_filters=[{"file.file_index": file_index}],
    )
    if not result.modified_count:
        raise HTTPException(status_code=409, detail="This invoice finished before it could be cancelled")
    files_after_cancel = [
        {**file, "status": status} if file.get("file_index") == file_index else file
        for file in upload.get("files", [])
    ]
    waiting_for_assignment = any(
        file.get("preview_supported") and file.get("status") not in {"cancelled", "cancel_requested"}
        for file in files_after_cancel
    )
    processing_started = False
    upload_status = upload.get("status")
    if upload_status == "awaiting_facility_assignment" and not waiting_for_assignment:
        queued = await db[OCR_UPLOADS_COLLECTION].update_one(
            {"id": upload_id, "organization_id": org_id, "status": "awaiting_facility_assignment"},
            {"$set": {"status": "queued", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        if queued.modified_count:
            processing_started = True
            upload_status = "queued"
            background_tasks.add_task(process_queued_upload, upload_id, org_id, current_user)
    return {"upload_id": upload_id, "file_index": file_index, "status": status, "upload_status": upload_status, "processing_started": processing_started}


@router.post("/uploads/{upload_id}/files/{file_index}/resume")
async def resume_cancelled_upload_file(
    upload_id: str,
    file_index: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Requeue one cancelled invoice after the rest of its batch has settled."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "id": 1, "status": 1, "files": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    if upload.get("status") == "processing":
        raise HTTPException(status_code=409, detail="Wait for the current OCR processing to finish before restarting this invoice")
    target_file = next((file for file in upload.get("files", []) if file.get("file_index") == file_index), None)
    if not target_file:
        raise HTTPException(status_code=404, detail="Invoice file not found")
    if target_file.get("status") != "cancelled":
        raise HTTPException(status_code=409, detail="Only cancelled invoices can be processed again")
    resumed_at = datetime.now(timezone.utc).isoformat()
    needs_facility_assignment = bool(target_file.get("preview_supported") and not target_file.get("facility_id"))
    next_upload_status = "awaiting_facility_assignment" if needs_facility_assignment else "queued"
    updated = await db[OCR_UPLOADS_COLLECTION].update_one(
        {"id": upload_id, "organization_id": org_id, "files": {"$elemMatch": {"file_index": file_index, "status": "cancelled"}}},
        {"$set": {"status": next_upload_status, "files.$[file].status": "queued", "files.$[file].resumed_at": resumed_at, "updated_at": resumed_at}},
        array_filters=[{"file.file_index": file_index}],
    )
    if not updated.modified_count:
        raise HTTPException(status_code=409, detail="This invoice could not be restarted")
    if not needs_facility_assignment:
        background_tasks.add_task(process_queued_upload, upload_id, org_id, current_user)
    return {"upload_id": upload_id, "file_index": file_index, "status": "queued", "awaiting_facility_assignment": needs_facility_assignment}


@router.delete("/uploads/{upload_id}/files/{file_index}")
async def delete_cancelled_upload_file(
    upload_id: str,
    file_index: int,
    current_user: dict = Depends(get_current_user),
):
    """Remove an unprocessed cancelled invoice from the OCR workspace."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "files": 1},
    )
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    target_file = next((file for file in upload.get("files", []) if file.get("file_index") == file_index), None)
    if not target_file:
        raise HTTPException(status_code=404, detail="Invoice file not found")
    if target_file.get("status") != "cancelled":
        raise HTTPException(status_code=409, detail="Only cancelled invoices can be deleted")
    await db[OCR_UPLOADS_COLLECTION].update_one(
        {"id": upload_id, "organization_id": org_id},
        {"$pull": {"files": {"file_index": file_index}}, "$inc": {"file_count": -1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db[OCR_LINE_ITEMS_COLLECTION].delete_many(
        {"upload_id": upload_id, "organization_id": org_id, "file_index": file_index},
    )
    remaining = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "files": 1},
    )
    if remaining and not remaining.get("files"):
        await db[OCR_UPLOADS_COLLECTION].delete_one({"id": upload_id, "organization_id": org_id})
        return {"upload_id": upload_id, "file_index": file_index, "upload_deleted": True}
    return {"upload_id": upload_id, "file_index": file_index, "upload_deleted": False}


@router.post("/uploads/{upload_id}/retry")
async def retry_upload_processing(
    upload_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Retry a failed OCR batch from its securely staged source files."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id, "status": "failed"},
        {"_id": 0, "id": 1, "files": 1},
    )
    if not upload:
        raise HTTPException(status_code=409, detail="Only failed OCR uploads can be retried")
    retry_files = []
    for file in upload.get("files", []):
        retry_file = {
            **file,
            "status": "queued",
            "error": None,
            "line_item_count": 0,
        }
        retry_file.pop("provider_diagnostic", None)
        retry_files.append(retry_file)
    if not retry_files:
        raise HTTPException(status_code=409, detail="This OCR upload has no staged source files to retry")
    now = datetime.now(timezone.utc).isoformat()
    result = await db[OCR_UPLOADS_COLLECTION].update_one(
        {"id": upload_id, "organization_id": org_id, "status": "failed"},
        {"$set": {
            "status": "queued",
            "files": retry_files,
            "errors": [],
            "retry_requested_at": now,
            "updated_at": now,
        }, "$inc": {"retry_count": 1}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=409, detail="This OCR upload could not be queued for retry")
    background_tasks.add_task(process_queued_upload, upload_id, org_id, current_user)
    return {"upload_id": upload_id, "status": "queued"}


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
        {"_id": 0, "status": 1, "files": 1},
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
        {"_id": 0, "id": 1, "name": 1, "sector": 1},
    ).sort("name", 1).to_list(1000)
    scopes = [scope for scope in ("scope1", "scope2", "scope3") if scope in scopes] + ["water"]
    scope_categories = list(SCOPE_CATEGORY_NAMES.items())
    category_documents = await db.emission_categories.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "category": 1, "display_name": 1},
    ).to_list(200)
    category_ids = {
        str(document.get(key)): document.get("id")
        for document in category_documents
        for key in ("name", "category", "display_name")
        if document.get(key) and document.get("id")
    }
    categories = [
        *({"scope": "scope1", "value": value, "label": value, "key": key, "code": key, "id": category_ids.get(value)} for key, value in scope_categories[:3]),
        *({"scope": "scope2", "value": value, "label": value, "key": key, "code": key, "id": category_ids.get(value)} for key, value in scope_categories[3:]),
        *(
            {"scope": "scope3", "value": value, "label": value, "key": key, "code": value.split(" - ", 1)[0].lower(), "id": category_ids.get(value)}
            for key, value in SCOPE3_CATEGORY_NAMES.items()
            if value.split(" - ", 1)[0] not in disabled_scope3_sheets
        ),
        *({"scope": "water", "value": value, "label": value, "key": key, "code": key, "id": category_ids.get(value)} for key, value in WATER_CATEGORY_NAMES.items()),
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
        "save_rules": OCR_SAVE_SCOPE_RULES,
    }


@router.get("/factor-options")
async def get_ocr_factor_options(
    scope: str = Query(..., min_length=1),
    category: str = Query(..., min_length=1),
    method: str = Query(..., min_length=1),
    facility_id: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Return canonical factor and unit choices for one OCR edit combination."""
    org_id = _get_org(current_user)
    facility = None
    if facility_id:
        facility = await db.facilities.find_one(
            {
                "id": facility_id,
                "organization_id": org_id,
                "is_deleted": {"$ne": True},
                "is_active": {"$ne": False},
            },
            {"_id": 0, "id": 1, "sector": 1},
        )
        if not facility:
            raise HTTPException(status_code=422, detail="Choose an active facility from your organization.")
    options = await resolve_factor_options(
        db,
        scope,
        category,
        method,
        facility.get("sector", "") if facility else "",
    )
    return {
        "scope": scope,
        "category": category,
        "method": method,
        "factors": options,
        "count": len(options),
        "industry_sector": facility.get("sector", "") if facility else "",
    }


@router.put("/uploads/{upload_id}/facility-assignments")
async def assign_upload_facilities(
    upload_id: str,
    request: UploadFacilityAssignments,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Assign each non-spreadsheet source document to an active organization facility."""
    org_id = _get_org(current_user)
    upload = await db[OCR_UPLOADS_COLLECTION].find_one(
        {"id": upload_id, "organization_id": org_id},
        {"_id": 0, "status": 1, "files": 1},
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

    assignments_cover_invoices = all(
        file.get("facility_id") or assignments_by_file.get(file.get("file_index"))
        for file in upload.get("files", [])
        if file.get("preview_supported") and file.get("status") not in {"cancelled", "cancel_requested"}
    )
    processing_started = False
    if upload.get("status") == "awaiting_facility_assignment" and assignments_cover_invoices:
        queued = await db[OCR_UPLOADS_COLLECTION].update_one(
            {"id": upload_id, "organization_id": org_id, "status": "awaiting_facility_assignment"},
            {"$set": {"status": "queued", "facility_assignment_completed_at": assigned_at, "updated_at": assigned_at}},
        )
        if queued.modified_count:
            processing_started = True
            background_tasks.add_task(process_queued_upload, upload_id, org_id, current_user)
    log_event(logger, logging.INFO, "ocr.upload.facilities.assigned", action="ocr.upload.assign_facilities", outcome="succeeded", context={"organization_id": org_id, "upload_id": upload_id, "assignment_count": len(assignments_by_file), "processing_started": processing_started})

    return {
        "message": "Invoice facilities assigned",
        "status": "queued" if processing_started else upload.get("status"),
        "processing_started": processing_started,
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
    submitted = canonicalize_calculation_units(submitted)
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
        previous_review_reasons = list(current_values.get("low_confidence_fields") or [])
        remaining_review_reasons = [
            reason for reason in previous_review_reasons
            if str(reason).strip().lower() != "missing facility"
        ]
        if remaining_review_reasons != previous_review_reasons:
            edit_changes["low_confidence_fields"] = {
                "old": previous_review_reasons,
                "new": remaining_review_reasons,
            }
            current_values["low_confidence_fields"] = remaining_review_reasons
    if submitted.get("factor_id"):
        candidate = {**current_values, **{key: value for key, value in submitted.items() if value is not None}}
        candidate_facility = None
        if candidate.get("facility_id"):
            candidate_facility = await db.facilities.find_one(
                {
                    "id": candidate["facility_id"],
                    "organization_id": org_id,
                    "is_deleted": {"$ne": True},
                    "is_active": {"$ne": False},
                },
                {"_id": 0, "sector": 1},
            )
            if not candidate_facility:
                raise HTTPException(status_code=422, detail="Choose an active facility from your organization.")
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
                industry_sector=candidate_facility.get("sector", "") if candidate_facility else "",
                dynamic_field_values=candidate.get("dynamic_field_values") or {},
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
        if selected_factor.get("activity_type"):
            submitted["scope3_activity_type"] = selected_factor["activity_type"]
        submitted[selected_factor["selected_input_field"]] = canonicalize_calc_engine_unit(selected_factor["selected_input_value"])
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
    
    current_values = canonicalize_calculation_units(item.get("current_values", {}))
    
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
    ocr_metadata = _ocr_record_metadata(item, current_values)
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
    prefill_scope3_method = {
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
        "source_of_information": ocr_metadata["source_of_information"],
        "record_source": ocr_metadata["record_source"],
        "notes": ocr_metadata["notes"],
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
        "calculation_method_scope3": prefill_scope3_method if current_values.get("scope") == "scope3" else None,
        "scope3_activity": current_values.get("ef_lookup_key") or current_values.get("subcategory"),
        "scope3_activity_type": current_values.get("scope3_activity_type"),
        "scope3_subcategory": current_values.get("scope3_subcategory"),
        "supplier_name": vendor if current_values.get("scope") == "scope3" else None,
        "fuel_id": current_values.get("fuel_id") or (current_values.get("factor_id") if current_values.get("scope") in {"scope1", "scope2"} else None),
        "scope3_ef_id": current_values.get("scope3_ef_id") or (current_values.get("factor_id") if current_values.get("scope") == "scope3" and prefill_scope3_method != "supplier_basis" else None),
    }
    
    return {
        "message": "Line item accepted",
        "prefill_data": prefill_data
    }


@router.post("/line-items/{item_id}/save-ghg")
async def save_line_item_to_ghg(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Calculate a reviewed OCR row and persist it through the canonical emissions writer."""
    org_id = _get_org(current_user)
    item = await db[OCR_LINE_ITEMS_COLLECTION].find_one(
        {"id": item_id, "organization_id": org_id},
        {"_id": 0},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Line item not found")
    if item.get("status") == "imported":
        raise HTTPException(status_code=409, detail="This OCR row has already been saved to GHG records")
    values = _without_generated_spreadsheet_row_identifier(
        item,
        canonicalize_calculation_units(item.get("current_values") or {})
    )
    if values.get("scope") not in {"scope1", "scope2", "scope3"}:
        raise HTTPException(status_code=400, detail="Only Scope 1, Scope 2, and Scope 3 OCR rows can be saved directly to GHG records")
    if not OCR_SAVE_SCOPE_RULES.get(values["scope"], {}).get("enabled"):
        raise HTTPException(status_code=400, detail="Saving OCR rows for this scope is disabled by the global OCR save rules")
    try:
        values, facility = await _resolve_direct_ocr_values(item, values, org_id)
        factor_id = values.get("factor_id") or values.get("fuel_id") or values.get("scope3_ef_id")
        selected_factor = await validate_factor_selection(
            db,
            scope=values.get("scope") or "",
            category=values.get("category") or "",
            method=values.get("ef_method") or "",
            factor_id=factor_id,
            lookup_value=values.get("ef_lookup_key") or values.get("subcategory") or "",
            unit=values.get("unit") or "",
            currency=values.get("currency") or "",
            industry_sector=facility.get("sector", ""),
            dynamic_field_values=values.get("dynamic_field_values") or {},
        )
        values["factor_id"] = selected_factor["id"]
        values["fuel_id"] = selected_factor["id"] if selected_factor["collection"] == "fuel_database" else None
        values["scope3_ef_id"] = selected_factor["id"] if selected_factor["collection"] == "scope3_ef" else None
        values["subcategory"] = selected_factor["value"]
        values["fuel_name"] = selected_factor["value"]
        values["ef_lookup_key"] = selected_factor["value"]
        values["ef_database"] = selected_factor["database"]
        if selected_factor.get("activity_type"):
            values["scope3_activity_type"] = selected_factor["activity_type"]
        values["naics_code"] = selected_factor.get("naics_code") or (values.get("naics_code") if selected_factor.get("method") == "spend" else "")
        values["naics_label"] = selected_factor.get("naics_label") or (values.get("naics_label") if selected_factor.get("method") == "spend" else "")
        values["unit"] = selected_factor["selected_input_value"] if selected_factor["selected_input_field"] == "unit" else values.get("unit")
        values["currency"] = selected_factor["selected_input_value"] if selected_factor["selected_input_field"] == "currency" else values.get("currency")
        category = await resolve_ghg_category(db, values)
        calculation = await execute_ocr_calculation(db, values, category, org_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    resolved_decisions = calculation["decision_inputs"]
    resolved_scope3_method = resolved_decisions.get("calculation_method_scope3") if values.get("scope") == "scope3" else None
    calculation_inputs = dict(calculation["inputs"])
    if values.get("scope") == "scope1" and resolved_decisions.get("calculation_methodology"):
        calculation_inputs["calculation_methodology"] = {
            "value": resolved_decisions["calculation_methodology"],
            "unit": "",
        }
    if resolved_scope3_method:
        calculation_inputs["calculation_method_scope3"] = {
            "value": resolved_scope3_method,
            "unit": "",
        }
    if resolved_decisions.get("spend_currency_conversion_method"):
        calculation_inputs["spend_currency_conversion_method"] = {
            "value": resolved_decisions["spend_currency_conversion_method"],
            "unit": "",
        }
    if values.get("scope3_activity_type"):
        calculation_inputs["scope3_activity_type"] = {
            "value": values["scope3_activity_type"],
            "unit": "",
        }
    await db[OCR_LINE_ITEMS_COLLECTION].update_one(
        {"id": item_id, "organization_id": org_id},
        {"$set": {
            "current_values.facility_id": values.get("facility_id"),
            "current_values.location": values.get("location"),
            "current_values.reporting_period": values.get("reporting_period"),
            "current_values.ef_method": values.get("ef_method"),
            "current_values.factor_id": values.get("factor_id"),
            "current_values.fuel_id": values.get("fuel_id"),
            "current_values.scope3_ef_id": values.get("scope3_ef_id"),
            "current_values.subcategory": values.get("subcategory"),
            "current_values.fuel_name": values.get("fuel_name"),
            "current_values.ef_lookup_key": values.get("ef_lookup_key"),
            "current_values.ef_database": values.get("ef_database"),
            "current_values.naics_code": values.get("naics_code"),
            "current_values.naics_label": values.get("naics_label"),
            "current_values.unit": values.get("unit"),
            "current_values.currency": values.get("currency"),
            "current_values.invoice_number": values.get("invoice_number"),
            "current_values.spend_currency_conversion_method": resolved_decisions.get("spend_currency_conversion_method"),
            "current_values.calculation_methodology": resolved_decisions.get("calculation_methodology"),
            "current_values.calculation_method_scope3": resolved_scope3_method,
            "current_values.ef_quantity_basis": resolved_decisions.get("ef_quantity_basis"),
            "current_values.cv_quantity_basis": resolved_decisions.get("cv_quantity_basis"),
            "current_values.scope3_activity_type": values.get("scope3_activity_type"),
            "current_values.dynamic_field_values": values.get("dynamic_field_values") or {},
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    ocr_metadata = _ocr_record_metadata(item, values)
    emission_payload = EmissionRecordCreate(
        facility_id=values["facility_id"],
        organization_id=org_id,
        reporting_period=values["reporting_period"],
        frequency_type="monthly",
        scope=values["scope"],
        category=category.get("name") or category.get("category") or values["category"],
        category_code=category.get("code") or values.get("category_code"),
        category_id=category["id"],
        sub_category=values.get("subcategory") or values.get("fuel_name") or values["category"],
        fuel_type=values.get("fuel_name") or values.get("subcategory"),
        calculation_methodology=calculation["decision_inputs"].get("calculation_methodology"),
        calculation_method_scope3=resolved_scope3_method,
        spend_currency_conversion_method=calculation["decision_inputs"].get("spend_currency_conversion_method"),
        scope3_ef_id=values.get("scope3_ef_id"),
        scope3_activity=values.get("ef_lookup_key") or values.get("subcategory"),
        scope3_activity_type=values.get("scope3_activity_type"),
        scope3_subcategory=values.get("scope3_subcategory"),
        supplier_name=ocr_metadata["vendor_name"] if values.get("scope") == "scope3" else None,
        from_location=values.get("origin") or values.get("from_location") or None,
        to_location=values.get("destination") or values.get("to_location") or None,
        formula_id=calculation["formula_id"],
        formula_version_id=calculation["formula_version_id"],
        decision_tree_version_id=calculation["decision_tree_version_id"],
        formula_snapshot=calculation["formula_snapshot"],
        dynamic_field_values=calculation_inputs,
        outputs=calculation["outputs"],
        source_of_information=ocr_metadata["source_of_information"],
        record_source=ocr_metadata["record_source"],
        notes=ocr_metadata["notes"],
        upload_source="ocr_upload",
        ocr_upload_id=item["upload_id"],
        ocr_line_item_id=item_id,
        ocr_file_index=item.get("file_index"),
    )
    from modules.emissions.router import create_emission_record
    emission = await create_emission_record(emission_payload, current_user)
    emission_data = emission.model_dump() if hasattr(emission, "model_dump") else emission
    if calculation.get("audit_log_id") and emission_data.get("id"):
        await db.ce_calculation_audit_logs.update_one(
            {"id": calculation["audit_log_id"]},
            {"$set": {"emission_record_id": emission_data["id"]}},
        )
    if ocr_metadata["is_spreadsheet"]:
        resolution = await _resolve_ocr_line_item(item, "saved")
        return {
            "message": "GHG entry calculated and saved",
            "emission_record": emission_data,
            "evidence_attached": False,
            "evidence_not_required": True,
            **resolution,
        }
    try:
        finalization = await finalize_import(
            AdvancedFinalizeImportRequest(line_item_id=item_id, emission_record_ids=[emission_data["id"]]),
            current_user,
        )
    except Exception:
        logger.exception("OCR GHG evidence transfer failed", extra={"organization_id": org_id, "line_item_id": item_id, "emission_record_id": emission_data.get("id")})
        await db[OCR_LINE_ITEMS_COLLECTION].update_one(
            {"id": item_id, "organization_id": org_id},
            {"$set": {"status": "ghg_saved_evidence_pending", "emission_record_ids": [emission_data["id"]], "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"message": "GHG entry saved; evidence transfer is pending retry", "emission_record": emission_data, "evidence_attached": False}
    return {"message": "GHG entry calculated and saved", "emission_record": emission_data, "evidence_attached": True, **finalization}


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

    if _is_spreadsheet_ocr_item(item):
        resolution = await _resolve_ocr_line_item(item, "saved")
        return {
            "message": "Spreadsheet OCR import finalized without evidence attachment",
            "evidence_url": "",
            "emission_record_ids": request.emission_record_ids,
            "line_item_removed": True,
            **resolution,
        }
    
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
        # Search for recently created emissions with this invoice in record_source.
        logger.info(f"[OCR Finalize] Searching for emissions with invoice number: {invoice_number}")
        recent_emissions = await db.emission_records.find(
            {
                "organization_id": org_id,
                "record_source": {"$regex": invoice_number, "$options": "i"}
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
    
    # Retain safe file-audit metadata for OCR History after workspace cleanup.
    now = datetime.now(timezone.utc).isoformat()
    await db[OCR_UPLOADS_COLLECTION].update_one(
        {"id": upload_id, "organization_id": org_id},
        {"$set": {"status": "cleared", "cleared_at": now, "updated_at": now}, "$unset": {"files.$[].temp_key": "", "files.$[].temp_url": ""}},
    )
    
    return {
        "message": "Workspace cleared",
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
    # Match on the canonical invoice reference or OCR notes.
    potential_duplicates = await db.emission_records.find(
        {
            **query,
            "$or": [
                {"record_source": {"$regex": invoice_number, "$options": "i"}},
                {"notes": {"$regex": vendor_name, "$options": "i"}}
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
