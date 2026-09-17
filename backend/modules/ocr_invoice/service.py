"""Application service for secure OCR upload processing and persistence."""
from __future__ import annotations

import os
import re
import tempfile
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

from bulk_upload_scope3.ghg_config_resolver import resolve_ghg_capabilities
from r2_storage import get_r2_storage
from shared.database.mongo import db

from .config import ALLOWED_EXTENSIONS, MAX_FILE_BYTES, SPREADSHEET_EXTENSIONS, ExtractionMode, get_mode
from .document_processor import process_document
from .llm_gateway import OcrLlmGateway
from .normalization import sanitize_json


logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _reporting_period_from_date(value: object) -> str:
    """Normalize an extracted ISO date to the monthly GHG period key."""
    match = re.match(r"^(\d{4})-(0[1-9]|1[0-2])", str(value or "").strip())
    return f"{match.group(1)}-{match.group(2)}" if match else ""


def _reporting_period_from_row(row: dict, billing_period: dict) -> str:
    for value in (
        billing_period.get("start_date"),
        billing_period.get("end_date"),
        row.get("date"),
    ):
        reporting_period = _reporting_period_from_date(value)
        if reporting_period:
            return reporting_period
    return ""


def _normalize_cache_key(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().split())


async def build_org_context(organization_id: str) -> tuple[dict, set[str], set[str]]:
    organization = await db.organizations.find_one(
        {"id": organization_id},
        {"_id": 0, "name": 1, "general_description": 1, "process_description": 1, "industry_sector": 1, "industry": 1, "sector": 1},
    ) or {}
    facilities = await db.facilities.find(
        {"organization_id": organization_id, "is_deleted": {"$ne": True}, "is_active": {"$ne": False}},
        {"_id": 0, "name": 1, "city": 1, "sector": 1, "sub_sector": 1, "products_services": 1, "process_description": 1},
    ).to_list(1000)
    capabilities = await resolve_ghg_capabilities(db, organization_id)
    enabled_scopes = {
        scope for scope, enabled in (
            ("scope1", capabilities.scope1_enabled),
            ("scope2", capabilities.scope2_enabled),
            ("scope3", capabilities.scope3_enabled),
        ) if enabled
    }
    enabled_scopes.add("water")
    context = {
        "organization_id": organization_id,
        "company_name": organization.get("name"),
        "industry_sector": organization.get("industry_sector") or organization.get("industry") or organization.get("sector"),
        "organization_profile": organization.get("general_description"),
        "products": organization.get("process_description"),
        "locations": facilities,
    }
    return context, enabled_scopes, capabilities.disabled_scope3_sheets


async def process_upload_batch(files, organization_id: str, user: dict, mode: ExtractionMode) -> dict:
    gateway = OcrLlmGateway(mode)
    org_context, enabled_scopes, disabled_scope3_sheets = await build_org_context(organization_id)
    upload_id = str(uuid.uuid4())
    storage = get_r2_storage()
    upload_record = {
        "id": upload_id,
        "organization_id": organization_id,
        "uploaded_by": user.get("id"),
        "uploaded_by_name": user.get("name", "Unknown"),
        "mode": mode.key,
        "vision_model": mode.vision_model,
        "reasoning_model": mode.reasoning_model,
        "status": "processing",
        "files": [],
        "created_at": _now(),
        "updated_at": _now(),
    }

    async def find_override(vendor_name: str | None, description: str | None):
        record = await db.ocr_vendor_overrides.find_one(
            {
                "organization_id": organization_id,
                "vendor_key": _normalize_cache_key(vendor_name),
                "item_key": _normalize_cache_key(description),
            },
            {"_id": 0, "classification": 1},
        )
        return record.get("classification") if record else None

    all_items: list[dict] = []
    errors: list[dict] = []
    for file_index, upload_file in enumerate(files):
        filename = Path(upload_file.filename or "invoice").name
        extension = Path(filename).suffix.lower()
        content = await upload_file.read()
        if extension not in ALLOWED_EXTENSIONS:
            errors.append({"filename": filename, "error": "Unsupported file type"})
            continue
        if len(content) > MAX_FILE_BYTES:
            errors.append({"filename": filename, "error": "File exceeds the 20MB limit"})
            continue
        try:
            upload_result = await storage.upload_file(
                file_content=content,
                filename=filename,
                bucket_type="ocr_temp",
                content_type=upload_file.content_type or "application/octet-stream",
                folder=f"ocr/{organization_id}/{upload_id}",
                org_name=organization_id,
            )
        except Exception:
            logger.exception("OCR source upload failed", extra={"organization_id": organization_id, "filename": filename})
            errors.append({"filename": filename, "error": "Secure storage upload failed"})
            continue
        if upload_result.get("error"):
            errors.append({"filename": filename, "error": upload_result["error"]})
            continue
        file_info = {
            "filename": filename,
            "content_type": upload_file.content_type,
            "temp_key": upload_result["key"],
            "file_index": file_index,
            "preview_supported": extension not in SPREADSHEET_EXTENSIONS,
            "line_item_count": 0,
            "resolved_count": 0,
            "saved_count": 0,
            "rejected_count": 0,
            "resolution_status": "pending",
            "status": "processing",
        }
        upload_record["files"].append(file_info)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name
            rows = await process_document(
                temp_path,
                gateway,
                org_context,
                enabled_scopes,
                set(disabled_scope3_sheets),
                find_override,
            )
            file_info["line_item_count"] = len(rows)
            file_info["status"] = "completed"
            for row in rows:
                item_id = str(uuid.uuid4())
                billing_period = row.pop("billing_period", {})
                current_values = {
                    **row,
                    "billing_period_start": billing_period.get("start_date"),
                    "billing_period_end": billing_period.get("end_date"),
                    "billing_period_text": billing_period.get("period_text"),
                    "reporting_period": _reporting_period_from_row(row, billing_period),
                    "unit_matched": bool(row.get("unit")),
                    "mode": mode.key,
                    "vision_model": mode.vision_model if extension not in SPREADSHEET_EXTENSIONS else "Spreadsheet direct ingestion",
                    "reasoning_model": mode.reasoning_model,
                }
                line_item = {
                    "id": item_id,
                    "upload_id": upload_id,
                    "organization_id": organization_id,
                    "file_index": file_index,
                    "filename": filename,
                    "temp_file_key": upload_result["key"],
                    "original_values": current_values.copy(),
                    "current_values": current_values,
                    "confidence_score": row.get("confidence_score"),
                    "needs_review": row.get("needs_review", True),
                    "status": "pending_review",
                    "edit_history": [],
                    "accepted_values": None,
                    "emission_record_ids": [],
                    "created_at": _now(),
                    "updated_at": _now(),
                }
                all_items.append(sanitize_json(line_item))
        except Exception:
            logger.exception(
                "OCR file processing failed",
                extra={"organization_id": organization_id, "filename": filename, "mode": mode.key},
            )
            file_info["status"] = "failed"
            file_info["error"] = "Processing failed for this file"
            errors.append({"filename": filename, "error": "Processing failed for this file"})
        finally:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)

    upload_record.update({
        "file_count": len(upload_record["files"]),
        "total_line_items": len(all_items),
        "needs_review_count": sum(1 for item in all_items if item["needs_review"]),
        "status": "completed" if all_items else "failed",
        "errors": errors,
        "updated_at": _now(),
    })
    await db.ocr_uploads.insert_one(upload_record.copy())
    if all_items:
        await db.ocr_line_items.insert_many([item.copy() for item in all_items])
    return sanitize_json({
        "upload_id": upload_id,
        "file_count": upload_record["file_count"],
        "total_line_items": len(all_items),
        "needs_review_count": upload_record["needs_review_count"],
        "mode": mode.key,
        "models": {"vision": mode.vision_model, "reasoning": mode.reasoning_model},
        "enabled_scopes": sorted(enabled_scopes),
        "files": upload_record["files"],
        "errors": errors,
        "line_items": all_items,
    })


async def queue_upload_batch(files, organization_id: str, user: dict, mode: ExtractionMode) -> dict:
    """Stage sources and create a durable OCR job without waiting for AI extraction."""
    upload_id = str(uuid.uuid4())
    storage = get_r2_storage()
    upload_record = {
        "id": upload_id,
        "organization_id": organization_id,
        "uploaded_by": user.get("id"),
        "uploaded_by_name": user.get("name", "Unknown"),
        "mode": mode.key,
        "vision_model": mode.vision_model,
        "reasoning_model": mode.reasoning_model,
        "status": "queued",
        "files": [],
        "file_count": 0,
        "total_line_items": 0,
        "needs_review_count": 0,
        "errors": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    for file_index, upload_file in enumerate(files):
        filename = Path(upload_file.filename or "invoice").name
        extension = Path(filename).suffix.lower()
        content = await upload_file.read()
        if extension not in ALLOWED_EXTENSIONS:
            upload_record["errors"].append({"filename": filename, "error": "Unsupported file type"})
            continue
        if len(content) > MAX_FILE_BYTES:
            upload_record["errors"].append({"filename": filename, "error": "File exceeds the 20MB limit"})
            continue
        try:
            upload_result = await storage.upload_file(
                file_content=content,
                filename=filename,
                bucket_type="ocr_temp",
                content_type=upload_file.content_type or "application/octet-stream",
                folder=f"ocr/{organization_id}/{upload_id}",
                org_name=organization_id,
            )
        except Exception:
            logger.exception("OCR source staging failed", extra={"organization_id": organization_id, "filename": filename})
            upload_record["errors"].append({"filename": filename, "error": "Secure storage upload failed"})
            continue
        if upload_result.get("error"):
            upload_record["errors"].append({"filename": filename, "error": upload_result["error"]})
            continue
        upload_record["files"].append({
            "filename": filename,
            "content_type": upload_file.content_type,
            "temp_key": upload_result["key"],
            "file_index": file_index,
            "preview_supported": extension not in SPREADSHEET_EXTENSIONS,
            "line_item_count": 0,
            "resolved_count": 0,
            "saved_count": 0,
            "rejected_count": 0,
            "resolution_status": "pending",
            "status": "queued",
        })
    upload_record["file_count"] = len(upload_record["files"])
    if not upload_record["files"]:
        upload_record["status"] = "failed"
    await db.ocr_uploads.insert_one(upload_record.copy())
    return sanitize_json({
        "upload_id": upload_id,
        "file_count": upload_record["file_count"],
        "total_line_items": 0,
        "needs_review_count": 0,
        "status": upload_record["status"],
        "mode": mode.key,
        "models": {"vision": mode.vision_model, "reasoning": mode.reasoning_model},
        "enabled_scopes": [],
        "files": upload_record["files"],
        "errors": upload_record["errors"],
        "line_items": [],
    })


async def process_queued_upload(upload_id: str, organization_id: str, user: dict) -> None:
    """Process a staged OCR job in the background using its stored R2 files."""
    claimed = await db.ocr_uploads.update_one(
        {"id": upload_id, "organization_id": organization_id, "status": "queued"},
        {"$set": {"status": "processing", "started_at": _now(), "updated_at": _now()}},
    )
    if not claimed.modified_count:
        return
    upload_record = await db.ocr_uploads.find_one(
        {"id": upload_id, "organization_id": organization_id},
        {"_id": 0},
    )
    if not upload_record:
        return
    try:
        mode = get_mode(upload_record["mode"])
        gateway = OcrLlmGateway(mode)
        org_context, enabled_scopes, disabled_scope3_sheets = await build_org_context(organization_id)
    except Exception:
        logger.exception("Queued OCR job setup failed", extra={"organization_id": organization_id, "upload_id": upload_id})
        await db.ocr_uploads.update_one(
            {"id": upload_id, "organization_id": organization_id},
            {"$set": {
                "status": "failed",
                "errors": [{"filename": "Batch", "error": "OCR job could not be initialized"}],
                "completed_at": _now(),
                "updated_at": _now(),
            }},
        )
        return
    storage = get_r2_storage()
    all_items: list[dict] = []
    errors = list(upload_record.get("errors", []))
    cancelled = False

    async def is_cancelled() -> bool:
        record = await db.ocr_uploads.find_one(
            {"id": upload_id, "organization_id": organization_id},
            {"_id": 0, "status": 1},
        )
        return bool(record and record.get("status") == "cancelled")

    async def find_override(vendor_name: str | None, description: str | None):
        record = await db.ocr_vendor_overrides.find_one(
            {
                "organization_id": organization_id,
                "vendor_key": _normalize_cache_key(vendor_name),
                "item_key": _normalize_cache_key(description),
            },
            {"_id": 0, "classification": 1},
        )
        return record.get("classification") if record else None

    for file_position, file_info in enumerate(upload_record.get("files", [])):
        if await is_cancelled():
            cancelled = True
            for pending_file in upload_record["files"][file_position:]:
                if pending_file.get("status") in {"queued", "processing"}:
                    pending_file["status"] = "cancelled"
            break
        filename = file_info["filename"]
        extension = Path(filename).suffix.lower()
        file_index = file_info["file_index"]
        await db.ocr_uploads.update_one(
            {"id": upload_id, "organization_id": organization_id},
            {"$set": {"files.$[file].status": "processing", "updated_at": _now()}},
            array_filters=[{"file.file_index": file_index}],
        )
        temp_path = None
        try:
            content, _ = await storage.get_file("ocr_temp", file_info["temp_key"])
            if not content:
                raise RuntimeError("The staged invoice file is unavailable")
            with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name
            rows = await process_document(
                temp_path,
                gateway,
                org_context,
                enabled_scopes,
                set(disabled_scope3_sheets),
                find_override,
            )
            if await is_cancelled():
                cancelled = True
                file_info["status"] = "cancelled"
                for pending_file in upload_record["files"][file_position + 1:]:
                    if pending_file.get("status") in {"queued", "processing"}:
                        pending_file["status"] = "cancelled"
                break
            file_items = []
            for row in rows:
                item_id = str(uuid.uuid4())
                billing_period = row.pop("billing_period", {})
                current_values = {
                    **row,
                    "billing_period_start": billing_period.get("start_date"),
                    "billing_period_end": billing_period.get("end_date"),
                    "billing_period_text": billing_period.get("period_text"),
                    "reporting_period": _reporting_period_from_row(row, billing_period),
                    "unit_matched": bool(row.get("unit")),
                    "mode": mode.key,
                    "vision_model": mode.vision_model if extension not in SPREADSHEET_EXTENSIONS else "Spreadsheet direct ingestion",
                    "reasoning_model": mode.reasoning_model,
                }
                file_items.append(sanitize_json({
                    "id": item_id,
                    "upload_id": upload_id,
                    "organization_id": organization_id,
                    "file_index": file_index,
                    "filename": filename,
                    "temp_file_key": file_info["temp_key"],
                    "original_values": current_values.copy(),
                    "current_values": current_values,
                    "confidence_score": row.get("confidence_score"),
                    "needs_review": row.get("needs_review", True),
                    "status": "pending_review",
                    "edit_history": [],
                    "accepted_values": None,
                    "emission_record_ids": [],
                    "created_at": _now(),
                    "updated_at": _now(),
                }))
            if await is_cancelled():
                cancelled = True
                file_info["status"] = "cancelled"
                for pending_file in upload_record["files"][file_position + 1:]:
                    if pending_file.get("status") in {"queued", "processing"}:
                        pending_file["status"] = "cancelled"
                break
            if file_items:
                await db.ocr_line_items.insert_many([item.copy() for item in file_items])
            all_items.extend(file_items)
            file_info["line_item_count"] = len(file_items)
            file_info["status"] = "completed"
        except Exception:
            logger.exception("Queued OCR file processing failed", extra={"organization_id": organization_id, "filename": filename, "mode": mode.key})
            file_info["status"] = "failed"
            file_info["error"] = "Processing failed for this file"
            errors.append({"filename": filename, "error": "Processing failed for this file"})
        finally:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)

    if cancelled:
        await db.ocr_uploads.update_one(
            {"id": upload_id, "organization_id": organization_id, "status": "cancelled"},
            {"$set": {"files": upload_record["files"], "updated_at": _now()}},
        )
        return
    total_line_items = sum(file.get("line_item_count", 0) for file in upload_record["files"])
    await db.ocr_uploads.update_one(
        {"id": upload_id, "organization_id": organization_id, "status": {"$ne": "cancelled"}},
        {"$set": {
            "files": upload_record["files"],
            "total_line_items": total_line_items,
            "needs_review_count": sum(1 for item in all_items if item.get("needs_review")),
            "errors": errors,
            "status": "completed" if total_line_items else "failed",
            "completed_at": _now(),
            "updated_at": _now(),
        }},
    )


async def save_vendor_override(organization_id: str, user: dict, current_values: dict) -> None:
    classification = {
        "ghg_scope": current_values.get("scope"),
        "ghg_category": current_values.get("category"),
        "category_key": current_values.get("category_key"),
        "category_code": current_values.get("category_code"),
        "ghg_subcategory": current_values.get("subcategory"),
        "ef_method": current_values.get("ef_method"),
        "ef_database": current_values.get("ef_database"),
        "ef_lookup_key": current_values.get("ef_lookup_key") or current_values.get("subcategory"),
        "naics_code": current_values.get("naics_code"),
        "naics_label": current_values.get("naics_label"),
        "accounting_rationale": current_values.get("accounting_rationale") or "User-verified classification.",
        "confidence_score": 100,
        "needs_review": False,
        "auto_generate_cat3": False,
    }
    await db.ocr_vendor_overrides.update_one(
        {
            "organization_id": organization_id,
            "vendor_key": _normalize_cache_key(current_values.get("vendor_name")),
            "item_key": _normalize_cache_key(current_values.get("item_description")),
        },
        {"$set": {
            "classification": classification,
            "updated_by": user.get("id"),
            "updated_at": _now(),
        }, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
