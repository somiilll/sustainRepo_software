"""
ESG Records Module - API Router

Reusable router for Environment, Social, and Governance records.
Includes integration with GHG module for auto-imported records.

IDEMPOTENCY: POST endpoints support X-Idempotency-Key header.
If a request with the same key was already processed within 24 hours,
the original response is returned instead of processing again.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Header
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import hashlib

from modules.auth.dependencies import get_current_user
from modules.entitlements.dependencies import assert_entitlement, assert_monthly_row_limit
from .service import esg_records_service
from .ghg_integration import get_ghg_integration_service
from .category_config_service import category_config_service
from .detailed_progress_service import detailed_progress_service
from .contracts import (
    ESG_SECTION, REPORTING_TYPE, 
    CreateRecordRequest, UpdateRecordRequest, RecordListFilters
)
from shared.database import get_database
from shared.database.mongo import db

router = APIRouter(prefix="/esg-records", tags=["ESG Records"])


def _environment_entitlement_for_category(category: str) -> Optional[str]:
    normalized = _to_code(category)
    mapping = {
        "energy": "environment.energy",
        "water": "environment.water",
        "waste": "environment.waste",
        "biodiversity": "environment.biodiversity",
        "climate_change": "environment.climate_change",
        "material": "environment.material",
        "other_emissions": "environment.other_emissions",
        "ghg_emissions": "environment.ghg",
    }
    return mapping.get(normalized)


async def _assert_record_category_access(org_id: str, section: ESG_SECTION, category: str) -> Optional[str]:
    if section != "environment":
        return None
    entitlement = _environment_entitlement_for_category(category)
    if entitlement:
        await assert_entitlement(org_id, entitlement)
    return entitlement


def _dashboard_facility_scope(current_user: dict, requested_facilities: Optional[List[str]]) -> Optional[List[str]]:
    """Keep dashboard metrics fail-closed for non-admin users and ignore unauthorized query filters."""
    if current_user.get("role") in {"admin", "super_admin"}:
        return requested_facilities
    allowed = current_user.get("assigned_facilities")
    if allowed is None:
        return []
    allowed_ids = set(allowed)
    return [facility_id for facility_id in requested_facilities if facility_id in allowed_ids] if requested_facilities is not None else list(allowed_ids)


# =============================================================================
# Idempotency Helper
# =============================================================================

async def check_idempotency(
    idempotency_key: Optional[str],
    org_id: str,
    operation: str,
) -> Optional[dict]:
    """
    Check if this request was already processed.
    
    Returns cached response if found, None otherwise.
    """
    if not idempotency_key:
        return None
    
    # Create composite key
    composite_key = f"{org_id}:{operation}:{idempotency_key}"
    key_hash = hashlib.sha256(composite_key.encode()).hexdigest()
    
    cached = await db.idempotency_cache.find_one(
        {"key_hash": key_hash},
        {"_id": 0, "response": 1, "created_at": 1}
    )
    
    if cached:
        return cached.get("response")
    
    return None


async def store_idempotency(
    idempotency_key: str,
    org_id: str,
    operation: str,
    response: dict,
) -> None:
    """
    Store the response for this idempotency key.
    
    Entries expire after 24 hours (handled by TTL index).
    """
    composite_key = f"{org_id}:{operation}:{idempotency_key}"
    key_hash = hashlib.sha256(composite_key.encode()).hexdigest()
    
    await db.idempotency_cache.update_one(
        {"key_hash": key_hash},
        {"$set": {
            "key_hash": key_hash,
            "org_id": org_id,
            "operation": operation,
            "response": response,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True
    )


# =============================================================================
# Category Configuration Endpoints
# =============================================================================

@router.get("/category-config/frequency")
async def get_category_frequency_config(
    category: str = Query(..., description="Category name (e.g., 'Water', 'GHG Emissions')"),
    subcategory: Optional[str] = Query(None, description="Subcategory name (e.g., 'Discharge')"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get allowed reporting frequencies for a category/subcategory.
    
    Returns the list of allowed frequencies and the default frequency.
    Uses category-specific defaults, falls back to all frequencies if not configured.
    """
    org_id = current_user.get("organization_id")
    
    config = await category_config_service.get_frequency_config(
        category=category,
        subcategory=subcategory,
        org_id=org_id
    )
    
    return config


@router.get("/category-config/frequency/all")
async def list_all_frequency_configs(
    org_only: bool = Query(False, description="If true, only return org-specific configs"),
    current_user: dict = Depends(get_current_user)
):
    """
    List all frequency configurations.
    Admin endpoint to view all configured frequency settings.
    """
    org_id = current_user.get("organization_id") if org_only else None
    configs = await category_config_service.list_configs(org_id=org_id)
    return {"configs": configs, "total": len(configs)}


@router.post("/category-config/frequency")
async def set_category_frequency_config(
    category: str = Query(..., description="Category name"),
    allowed_frequencies: List[str] = Query(..., description="List of allowed frequencies"),
    default_frequency: str = Query(..., description="Default frequency"),
    subcategory: Optional[str] = Query(None, description="Subcategory name (optional)"),
    org_specific: bool = Query(False, description="If true, config is org-specific"),
    current_user: dict = Depends(get_current_user)
):
    """
    Set frequency configuration for a category/subcategory.
    
    Admin endpoint to configure allowed frequencies.
    - Set org_specific=true for org-level overrides
    - Set subcategory for subcategory-specific configs
    
    Valid frequencies: daily, weekly, monthly, quarterly, half_yearly, yearly
    """
    # Check admin role
    user_role = current_user.get("role", "").lower()
    if user_role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("organization_id") if org_specific else None
    
    try:
        config = await category_config_service.set_frequency_config(
            category=category,
            allowed_frequencies=allowed_frequencies,
            default_frequency=default_frequency,
            subcategory=subcategory,
            org_id=org_id
        )
        return {"message": "Configuration saved", "config": config}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/category-config/frequency")
async def delete_category_frequency_config(
    category: str = Query(..., description="Category name"),
    subcategory: Optional[str] = Query(None, description="Subcategory name (optional)"),
    org_specific: bool = Query(False, description="If true, delete org-specific config"),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a frequency configuration.
    
    Admin endpoint to remove a custom frequency config.
    After deletion, the category will fall back to default or hardcoded values.
    """
    # Check admin role
    user_role = current_user.get("role", "").lower()
    if user_role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("organization_id") if org_specific else None
    
    deleted = await category_config_service.delete_frequency_config(
        category=category,
        subcategory=subcategory,
        org_id=org_id
    )
    
    if deleted:
        return {"message": "Configuration deleted"}
    else:
        raise HTTPException(status_code=404, detail="Configuration not found")


# =============================================================================
# Category Endpoints
# =============================================================================

@router.get("/categories/{section}")
async def list_categories(
    section: ESG_SECTION,
    framework: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List categories for a section (environment/social/governance).
    
    If the user's organization has an organization_config, overrides are applied:
    - disabled subcategories are removed
    - kpi_overrides replace fields for matching subcategories
    - custom categories are injected as virtual entries
    - modules.enabled filters top-level categories
    """
    categories = await esg_records_service.list_categories(
        section=section,
        framework=framework
    )

    # Apply organization_config overrides for all ESG sections
    org_id = current_user.get("organization_id")
    if org_id:
        from modules.sustainability_config.service import get_org_config
        org_cfg = await get_org_config(org_id)
        if org_cfg:
            categories = _apply_org_overrides(categories, org_cfg, section)
        if section == "environment":
            from modules.entitlements.service import entitlement_access_map, resolve_entitlement_config
            permissions = entitlement_access_map(await resolve_entitlement_config(org_id, migrate=True))
            categories = [
                category for category in categories
                if not (access := _environment_entitlement_for_category(category.get("category", "")))
                or permissions.get(access, False)
            ]

    return {"categories": categories, "total": len(categories)}


def _to_code(name: str) -> str:
    import re
    return re.sub(r'[^a-z0-9]+', '_', name.lower().strip()).strip('_') or "unknown"


def _map_custom_field(f: dict) -> dict:
    """Map organization_config field format to esg_record_categories field format.
    
    Org config uses: field_code, response_type
    Global categories use: field_key, type
    """
    response_type = f.get("response_type", "text")
    # Map response_type to the type values DynamicFieldRenderer expects
    type_map = {
        "text": "text", "number": "number", "integer": "number", "decimal": "number",
        "percentage": "number", "currency": "number", "yes_no": "yes_no",
        "dropdown": "dropdown", "multi_select": "dropdown", "date": "date",
        "month": "dropdown", "facility": "dropdown", "file": "file_upload",
    }
    return {
        "field_key": f.get("field_code", f.get("field_key", "")),
        "type": type_map.get(response_type, "text"),
        "label": f.get("label", ""),
        "required": f.get("required", False),
        "placeholder": f.get("help_text", ""),
        "options": f.get("options"),
        "validation": f.get("validation"),
        "unit": f.get("unit"),
        "display_order": f.get("display_order", 0),
        "enabled": f.get("enabled", True),
        "evidence_required": f.get("evidence_required", False),
        # Preserve original format for reference
        "response_type": response_type,
        "field_type": f.get("field_type", "input"),
    }


def _apply_org_overrides(categories: list, org_cfg: dict, section: str = "environment") -> list:
    """Apply organization_config overrides to the global categories list."""
    modules_cfg = org_cfg.get("modules") or {}
    cats_cfg = org_cfg.get("categories") or {}
    kpi_overrides = org_cfg.get("kpi_overrides") or {}
    mode = modules_cfg.get("mode")  # "default" | "default_custom" | "custom"

    # Section-specific enabled modules: check modules.enabled (env) or modules.social_enabled, etc.
    section_key = f"{section}_enabled" if section != "environment" else "enabled"
    enabled_modules = modules_cfg.get(section_key, modules_cfg.get("enabled") if section == "environment" else None)
    disabled_subcats = set(cats_cfg.get("disabled") or [])
    custom_cats = cats_cfg.get("custom") or []

    result = []

    # Include global categories unless mode is explicitly "custom"
    if mode != "custom":
        for cat in categories:
            mod_code = _to_code(cat.get("category", ""))
            subcat_code = _to_code(cat.get("subcategory") or cat.get("category", ""))

            # Filter by enabled modules (only if explicitly configured for this section)
            if enabled_modules is not None and mod_code not in enabled_modules:
                continue

            # Filter by disabled subcategories
            if subcat_code in disabled_subcats:
                continue

            # Apply KPI field override
            override = kpi_overrides.get(subcat_code)
            if override:
                if override.get("visible") is False:
                    continue
                if override.get("fields"):
                    cat = {**cat, "fields": [_map_custom_field(f) for f in override["fields"]]}
                if override.get("kpi_name"):
                    cat = {**cat, "subcategory": override["kpi_name"]}

            # Attach derived category_code so frontend can use it directly
            cat = {**cat, "category_code": cat.get("category_code") or subcat_code}

            result.append(cat)

    # Add custom categories unless mode is explicitly "default"
    if mode != "default":
        for custom in custom_cats:
            cat_section = custom.get("section", "environment")
            if cat_section != section:
                continue
            raw_fields = custom.get("fields") or []
            mapped_fields = [_map_custom_field(f) for f in raw_fields]
            result.append({
                "id": f"custom_{custom.get('category_code', 'unknown')}",
                "section": section,
                "category": (custom.get("module_name") or custom.get("module_code", "")).replace("_", " ").title(),
                "subcategory": custom.get("category_name"),
                "is_active": True,
                "fields": mapped_fields,
                "order": custom.get("display_order", 99),
                "is_custom": True,
                "module_code": custom.get("module_code"),
                "category_code": custom.get("category_code"),
            })

    result.sort(key=lambda c: c.get("order", 0))
    return result


@router.get("/categories/{section}/{category_id}")
async def get_category(
    section: ESG_SECTION,
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific category config."""
    # Handle custom category IDs from organization_config
    if category_id.startswith("custom_"):
        org_id = current_user.get("organization_id")
        if org_id:
            from modules.sustainability_config.service import get_org_config
            org_cfg = await get_org_config(org_id)
            if org_cfg:
                cat_code = category_id.replace("custom_", "", 1)
                for custom in (org_cfg.get("categories", {}).get("custom") or []):
                    if custom.get("category_code") == cat_code:
                        raw_fields = custom.get("fields", [])
                        mapped_fields = [_map_custom_field(f) for f in raw_fields]
                        return {
                            "id": category_id,
                            "section": custom.get("section", "environment"),
                            "category": (custom.get("module_name") or custom.get("module_code", "")).replace("_", " ").title(),
                            "subcategory": custom.get("category_name"),
                            "is_active": True,
                            "fields": mapped_fields,
                            "order": custom.get("display_order", 99),
                            "is_custom": True,
                        }
        raise HTTPException(status_code=404, detail="Custom category not found")

    category = await esg_records_service.get_category(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Apply field overrides if org has them (all sections)
    org_id = current_user.get("organization_id")
    if org_id:
        from modules.sustainability_config.service import get_org_config
        org_cfg = await get_org_config(org_id)
        if org_cfg:
            subcat_code = _to_code(category.get("subcategory") or category.get("category", ""))
            override = (org_cfg.get("kpi_overrides") or {}).get(subcat_code)
            if override and override.get("fields"):
                category = {**category, "fields": [_map_custom_field(f) for f in override["fields"]]}
    return category


# =============================================================================
# Record CRUD Endpoints
# =============================================================================

@router.post("/records/{section}")
async def create_record(
    section: ESG_SECTION,
    data: CreateRecordRequest,
    current_user: dict = Depends(get_current_user),
    x_idempotency_key: Optional[str] = Header(None, alias="X-Idempotency-Key"),
):
    """
    Create a new ESG record. Validates user has active assignment.
    
    IDEMPOTENCY: Pass X-Idempotency-Key header to prevent duplicate submissions.
    If the same key is used within 24 hours, the original response is returned.
    
    DUPLICATE WARNING: If a record already exists for the same period/facility,
    a warning is included in the response (not an error).
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")

    entitlement = await _assert_record_category_access(org_id, section, data.category)
    if entitlement and data.reporting_period.reporting_type == "monthly":
        module_code = entitlement.rsplit(".", 1)[-1]
        await assert_monthly_row_limit(
            org_id, module_code, f"{section}_records",
            {"org_id": org_id, "section": section, "category": data.category, "reporting_period.reporting_type": "monthly", "is_current": True},
        )
    
    user_id = current_user.get("id") or current_user.get("user_id")
    user_role = current_user.get("role", "")
    
    # Check idempotency first
    if x_idempotency_key:
        cached_response = await check_idempotency(
            x_idempotency_key, org_id, f"create_record:{section}"
        )
        if cached_response:
            cached_response["_idempotent"] = True
            return cached_response
    
    # Admin can create records without assignment, but we still look up assignment
    # to get requires_approval setting
    is_admin = user_role in ["admin", "super_admin"]
    
    try:
        record = await esg_records_service.create_record(
            section=section,
            org_id=org_id,
            user_id=user_id,
            data=data,
            skip_assignment_check=False,  # Always check to get requires_approval
            allow_without_assignment=is_admin,  # Admins can proceed without assignment
            is_admin=is_admin,  # Admins bypass approval workflow
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    
    response = {"message": "Record created", "record": record}
    
    # Extract warning from record if present
    if record.get("_warning"):
        response["warning"] = record.pop("_warning")
    
    # Store for idempotency
    if x_idempotency_key:
        await store_idempotency(
            x_idempotency_key, org_id, f"create_record:{section}", response
        )
    
    return response


@router.get("/records/{section}")
async def list_records(
    section: ESG_SECTION,
    category: Optional[str] = None,
    categories: Optional[str] = Query(None, description="Comma-separated list of categories (e.g., 'Climate Change,Material,Other Emissions')"),
    subcategory: Optional[str] = None,
    reporting_type: Optional[REPORTING_TYPE] = None,
    facility_id: Optional[str] = None,
    framework: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[str] = None,
    search: Optional[str] = None,
    include_imported: bool = Query(True, description="Include GHG module imported records"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """
    List ESG records with filtering and pagination. Includes GHG-imported records.
    
    Role-based behavior:
    - Admin/Super Admin: See ALL records in the organization
    - Regular User: See ONLY records for categories/subcategories they are assigned to
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    
    # For non-admin users, get their assigned categories
    # V2 Architecture: Query esg_assignment_assignees (many-to-many) instead of
    # the legacy assigned_to_user_id field on esg_assignments
    assigned_categories = None
    if not is_admin:
        from shared.database.mongo import db
        
        # Step 1: Get assignment IDs where user is an active assignee (V2 architecture)
        assignee_records = await db.esg_assignment_assignees.find(
            {
                "user_id": user_id,
                "organization_id": org_id,
                "$or": [
                    {"removed_at": None},
                    {"removed_at": {"$exists": False}},
                ],
            },
            {"_id": 0, "assignment_id": 1}
        ).to_list(500)
        
        assignment_ids = [a["assignment_id"] for a in assignee_records]
        
        # Step 2: Get assignments for those IDs
        assignments = []
        if assignment_ids:
            assignments = await db.esg_assignments.find(
                {
                    "id": {"$in": assignment_ids},
                    "organization_id": org_id,
                    "entity_type": "record_category",
                },
                {"_id": 0, "category": 1, "subcategory": 1, "sub_subcategory": 1}
            ).to_list(500)
        
        if assignments:
            # Build list of (category, subcategory, sub_subcategory) tuples user is assigned to
            assigned_categories = [
                (a.get("category"), a.get("subcategory"), a.get("sub_subcategory"))
                for a in assignments
            ]
        else:
            # User has no assignments - return empty
            return {
                "records": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "total_pages": 0,
                "message": "No categories assigned to you"
            }
    
    # Parse comma-separated categories if provided
    categories_list = None
    if categories:
        categories_list = [c.strip() for c in categories.split(",") if c.strip()]
    if category:
        await _assert_record_category_access(org_id, section, category)
    for selected_category in categories_list or []:
        await _assert_record_category_access(org_id, section, selected_category)
    
    filters = RecordListFilters(
        category=category,
        categories=categories_list,
        subcategory=subcategory,
        reporting_type=reporting_type,
        facility_id=facility_id,
        framework=framework,
        year=year,
        month=month,
        search=search,
        page=page,
        limit=limit
    )
    
    # Get native ESG records
    result = await esg_records_service.list_records(
        section=section,
        org_id=org_id,
        filters=filters,
        assigned_categories=assigned_categories,
        user_id=user_id,  # Pass user_id to enrich records with pending proposals
    )
    
    # Get GHG-imported records if enabled and section is environment
    if include_imported and section == "environment":
        try:
            await assert_entitlement(org_id, "environment.ghg")
        except HTTPException:
            include_imported = False
    if include_imported and section == "environment":
        db = get_database()
        ghg_service = get_ghg_integration_service(db)
        
        imported_records = await ghg_service.get_all_imported_records(
            org_id=org_id,
            section=section,
            category=category,
            facility_id=facility_id
        )
        
        # Filter by categories list if provided (for "Others" page)
        if categories_list and imported_records:
            imported_records = [
                r for r in imported_records
                if r.get("category", "") in categories_list
            ]
        
        # Filter imported records based on search if provided
        if search and imported_records:
            search_lower = search.lower()
            imported_records = [
                r for r in imported_records
                if search_lower in r.get("category", "").lower() or
                   search_lower in r.get("subcategory", "").lower() or
                   search_lower in r.get("facility_name", "").lower()
            ]
        
        # Filter by subcategory if provided
        if subcategory and imported_records:
            imported_records = [
                r for r in imported_records
                if r.get("subcategory", "").lower() == subcategory.lower()
            ]
        
        # For non-admin users, filter GHG records by assigned categories too
        if assigned_categories and imported_records:
            filtered_imported = []
            for rec in imported_records:
                rec_cat = rec.get("category", "")
                rec_subcat = rec.get("subcategory", "")
                rec_sub_subcat = rec.get("sub_subcategory", "")
                
                # Check if record matches any assigned category
                for assigned_cat, assigned_subcat, assigned_sub_subcat in assigned_categories:
                    # Match category
                    if rec_cat != assigned_cat:
                        continue
                    # If assignment has subcategory, must match
                    if assigned_subcat and rec_subcat != assigned_subcat:
                        continue
                    # If assignment has sub_subcategory, must match
                    if assigned_sub_subcat and rec_sub_subcat != assigned_sub_subcat:
                        continue
                    # Passed all filters, include this record
                    filtered_imported.append(rec)
                    break
            
            imported_records = filtered_imported
        
        # Only enter merge path if imported records actually exist
        if imported_records:
            # Re-fetch native records WITHOUT pagination for correct merge
            unpaginated_filters = RecordListFilters(
                category=category,
                subcategory=subcategory,
                reporting_type=reporting_type,
                facility_id=facility_id,
                framework=framework,
                year=year,
                month=month,
                search=search,
                page=1,
                limit=999999
            )
            unpaginated_result = await esg_records_service.list_records(
                section=section,
                org_id=org_id,
                filters=unpaginated_filters,
                assigned_categories=assigned_categories,
            )
            native_records = unpaginated_result.get("records", [])
            
            # Merge native + imported, apply pagination once
            all_records = native_records + imported_records
            total_with_imported = len(all_records)
            
            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            paginated_records = all_records[start_idx:end_idx]
            
            result = {
                "records": paginated_records,
                "total": total_with_imported,
                "page": page,
                "limit": limit,
                "total_pages": (total_with_imported + limit - 1) // limit,
                "has_imported": True,
                "imported_count": len(imported_records)
            }
        # No imported records — return DB-paginated result directly
    
    return result


@router.get("/records/{section}/{record_id}")
async def get_record(
    section: ESG_SECTION,
    record_id: str,
    include_proposals: bool = Query(False, description="Include pending proposals"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get a single record.
    
    If include_proposals=true:
    - Normal users: Returns record + their pending proposal (if any)
    - Admins/Approvers: Returns record + all pending proposals
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    
    if include_proposals:
        record = await esg_records_service.get_record_with_user_proposal(
            section=section,
            record_id=record_id,
            org_id=org_id,
            user_id=user_id,
            is_approver=is_admin,
        )
    else:
        record = await esg_records_service.get_record(
            section=section,
            record_id=record_id,
            org_id=org_id
        )
    
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    return record


@router.put("/records/{section}/{record_id}")
async def update_record(
    section: ESG_SECTION,
    record_id: str,
    data: UpdateRecordRequest,
    admin_override: bool = Query(False, description="Deprecated - admins always bypass approval now"),
    current_user: dict = Depends(get_current_user)
):
    """
    Update a record (creates new version).
    
    CONCURRENCY SAFEGUARDS (for non-admin users):
    - Cannot edit records with pending approval (prevents race conditions)
    - Cannot edit records that were rejected (user must create new submission)
    - Only one edit request can be pending at a time
    
    ADMIN BEHAVIOR:
    - Admins automatically bypass approval workflow
    - If user has pending approval, admin edit deletes the pending request and saves directly
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id") or current_user.get("user_id")
    user_role = current_user.get("role", "user")
    
    # Admins always bypass approval workflow
    is_admin_override = user_role in ["admin", "super_admin"]
    
    # Verify record exists and belongs to org
    existing = await esg_records_service.get_record(section, record_id, org_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    await _assert_record_category_access(org_id, section, existing.get("category", ""))
    
    updated = await esg_records_service.update_record(
        section=section,
        record_id=record_id,
        user_id=user_id,
        data=data,
        is_admin_override=is_admin_override,
    )
    
    return {"message": "Record updated", "record": updated}


@router.delete("/records/{section}/{record_id}")
async def delete_record(
    section: ESG_SECTION,
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a record (soft delete). Also reverts associated task to pending."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    existing = await esg_records_service.get_record(section, record_id, org_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    await _assert_record_category_access(org_id, section, existing.get("category", ""))
    
    deleted = await esg_records_service.delete_record(
        section=section,
        record_id=record_id,
        org_id=org_id,
        user_id=user_id,
        user_role=user_role,
    )
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    
    return {"message": "Record deleted"}


# =============================================================================
# Version History Endpoints
# =============================================================================

@router.get("/records/{section}/{record_id}/versions")
async def get_record_versions(
    section: ESG_SECTION,
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get version history for a record."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Verify record belongs to org
    record = await esg_records_service.get_record(section, record_id, org_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    versions = await esg_records_service.get_record_versions(
        section=section,
        record_id=record_id
    )
    
    return {"versions": versions, "total": len(versions)}


@router.get("/records/{section}/{record_id}/versions/{version}")
async def get_record_version(
    section: ESG_SECTION,
    record_id: str,
    version: int,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific version of a record."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    version_data = await esg_records_service.get_version(
        section=section,
        record_id=record_id,
        version=version
    )
    
    if not version_data:
        raise HTTPException(status_code=404, detail="Version not found")
    
    return version_data


# =============================================================================
# Statistics Endpoint
# =============================================================================

@router.get("/stats/{section}")
async def get_record_stats(
    section: ESG_SECTION,
    category: str = None,
    subcategory: str = None,
    categories: str = None,  # Comma-separated list of categories (for "Others" virtual category)
    current_user: dict = Depends(get_current_user)
):
    """Get record statistics for the organization."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Handle multiple categories (for "Others" virtual category)
    category_list = None
    if categories:
        category_list = [c.strip() for c in categories.split(',') if c.strip()]
    
    stats = await esg_records_service.get_record_stats(
        section=section,
        org_id=org_id,
        category=category,
        subcategory=subcategory,
        category_list=category_list,
    )
    
    return stats



@router.get("/summary")
async def get_esg_summary(
    current_user: dict = Depends(get_current_user)
):
    """Get overall ESG summary counts for dashboard."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    db = await get_database()
    
    # Count records per section
    environment_count = await db.esg_records.count_documents({
        "organization_id": org_id,
        "section": "environment"
    })
    social_count = await db.esg_records.count_documents({
        "organization_id": org_id,
        "section": "social"
    })
    governance_count = await db.esg_records.count_documents({
        "organization_id": org_id,
        "section": "governance"
    })
    
    return {
        "environment_records": environment_count,
        "social_records": social_count,
        "governance_records": governance_count,
        "total_records": environment_count + social_count + governance_count
    }




@router.get("/dashboard-metrics")
async def get_dashboard_metrics(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM"),
    facility_ids: Optional[str] = Query(None, description="Comma-separated facility IDs"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get aggregated ESG metrics for the executive dashboard.
    
    Emissions = GHG emission_records + ESG environment_records (category=Emissions)
    Energy = GHG emission_records + ESG environment_records (category=Energy)
    Water = ESG environment_records (category=Water)
    Waste = ESG environment_records (category=Waste)
    """
    from .services.dashboard import get_dashboard_metrics_service
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    db = get_database()
    
    # Parse facility IDs
    fac_list = None
    if facility_ids:
        fac_list = [f.strip() for f in facility_ids.split(",") if f.strip()]
    
    # Determine financial year from date range
    financial_year = None
    if start_date:
        try:
            start_year = int(start_date[:4])
            start_month = int(start_date[5:7])
            fy_start = start_year if start_month >= 4 else start_year - 1
            financial_year = f"FY {fy_start}-{fy_start + 1}"
        except (ValueError, IndexError):
            pass
    
    fac_list = _dashboard_facility_scope(current_user, fac_list)

    # Get metrics from service
    service = get_dashboard_metrics_service(db)
    metrics = await service.get_dashboard_metrics(org_id, fac_list, financial_year, start_date, end_date)
    
    return metrics


# =============================================================================
# Tracker Endpoints (Records Assignment & Workflow)
# =============================================================================

@router.get("/tracker/{section}")
async def get_tracker_assignments(
    section: ESG_SECTION,
    reporting_period: Optional[str] = None,
    framework: Optional[str] = None,
    category: Optional[str] = None,
    facility_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    staleness: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get tracker data for record assignments.
    
    Role-based behavior:
    - Admin/Super Admin: See ALL assignments in the organization
    - Regular User: See ONLY assignments where they are the assignee
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id")
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "super_admin"]
    
    # For non-admin users, force filter to their own assignments only
    if not is_admin:
        assigned_to = user_id
    
    assignments = await esg_records_service.get_tracker_assignments(
        org_id=org_id,
        section=section,
        reporting_period=reporting_period,
        framework=framework,
        category=category,
        facility_id=facility_id,
        assigned_to=assigned_to,
        status=status,
        staleness=staleness,
    )
    
    return {
        "assignments": assignments, 
        "total": len(assignments),
        "is_admin_view": is_admin,
    }


@router.get("/tracker/{section}/stats")
async def get_tracker_stats(
    section: ESG_SECTION,
    reporting_period: Optional[str] = None,
    framework: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get tracker statistics for a section."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    stats = await esg_records_service.get_tracker_stats(
        org_id=org_id,
        section=section,
        reporting_period=reporting_period,
        framework=framework,
    )
    
    return stats


@router.post("/assignments")
async def create_record_assignment(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Create or update a record category assignment (V2 - New Data Model).
    
    This endpoint uses the new assignment model where:
    - One assignment per work item (category/facility/period)
    - Assignees tracked separately in esg_assignment_assignees
    
    Supports:
    - Organization-level assignments (all facilities)
    - Facility-level assignments (specific facilities)
    - Multiple users per assignment
    - Switching between org and facility level
    
    Admin only - regular users cannot assign tasks.
    """
    from modules.esg_assignments.assignment_service_v2 import assignment_service_v2
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Check if user is admin
    user_role = current_user.get("role", "user")
    if user_role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can create assignments")
    
    user_id = current_user.get("id")
    assignment_level = data.get("assignment_level", "organization")
    
    try:
        if assignment_level == "facility":
            # Facility-level: expects facility_assignments dict
            # { facility_id: [user_ids], ... }
            facility_assignments = data.get("facility_assignments", {})
            
            if not facility_assignments:
                # Single facility assignment (legacy format)
                facility_id = data.get("facility_id")
                user_ids = data.get("user_ids", [])
                if data.get("assigned_to_user_id"):
                    user_ids = [data.get("assigned_to_user_id")]
                
                if facility_id and user_ids:
                    facility_assignments = {facility_id: user_ids}
            
            if not facility_assignments:
                raise HTTPException(status_code=400, detail="No facility assignments provided")
            
            # Extract common assignment properties
            assignment_data = {
                "start_date": data.get("start_date"),
                "end_date": data.get("end_date"),
                "timezone": data.get("timezone", "Asia/Kolkata"),
                "filling_frequency": data.get("filling_frequency"),
                "due_config": data.get("due_config"),
                "reminder_enabled": data.get("reminder_enabled", False),
                "reminder_config": data.get("reminder_config"),
                "requires_approval": data.get("requires_approval", False),
                "approver_id": data.get("approver_id"),  # Single-level approval
                "approval_chain": data.get("approval_chain", []),
            }
            
            result = await assignment_service_v2.replace_org_with_facility_assignments(
                organization_id=org_id,
                category=data.get("category"),
                subcategory=data.get("subcategory"),
                sub_subcategory=data.get("sub_subcategory"),
                reporting_period=data.get("reporting_period"),
                facility_assignments=facility_assignments,
                assignment_data=assignment_data,
                created_by_user_id=user_id,
            )
            
            return {
                "message": f"Created {result['created_facility_level']} facility-level assignments",
                "deleted_org_level": result["deleted_org_level"],
                "assignments": result["assignments"],
            }
        
        else:
            # Organization-level assignment
            user_ids = data.get("user_ids", data.get("assigned_user_ids", []))
            if data.get("assigned_to_user_id"):
                user_ids = [data.get("assigned_to_user_id")]
            
            if not user_ids:
                raise HTTPException(status_code=400, detail="No users provided for assignment")
            
            # Check if switching from facility to org level
            existing_facility_assignments = await assignment_service_v2._assignments.find({
                "organization_id": org_id,
                "category": data.get("category"),
                "subcategory": data.get("subcategory"),
                "sub_subcategory": data.get("sub_subcategory"),
                "reporting_period": data.get("reporting_period"),
                "facility_id": {"$ne": None},
            }).to_list(10)
            
            if existing_facility_assignments:
                # Switching from facility to org level
                assignment_data = {
                    "start_date": data.get("start_date"),
                    "end_date": data.get("end_date"),
                    "timezone": data.get("timezone", "Asia/Kolkata"),
                    "filling_frequency": data.get("filling_frequency"),
                    "due_config": data.get("due_config"),
                    "reminder_enabled": data.get("reminder_enabled", False),
                    "reminder_config": data.get("reminder_config"),
                    "requires_approval": data.get("requires_approval", False),
                    "approver_id": data.get("approver_id"),  # Single-level approval
                    "approval_chain": data.get("approval_chain", []),
                }
                
                result = await assignment_service_v2.replace_facility_with_org_assignment(
                    organization_id=org_id,
                    category=data.get("category"),
                    subcategory=data.get("subcategory"),
                    sub_subcategory=data.get("sub_subcategory"),
                    reporting_period=data.get("reporting_period"),
                    user_ids=user_ids,
                    assignment_data=assignment_data,
                    created_by_user_id=user_id,
                )
                
                return {
                    "message": "Switched to organization-level assignment",
                    "deleted_facility_level": result["deleted_facility_level"],
                    "assignment": result["assignment"],
                }
            
            # Normal org-level assignment (create or update)
            assignment_data = {
                "organization_id": org_id,
                "category": data.get("category"),
                "subcategory": data.get("subcategory"),
                "sub_subcategory": data.get("sub_subcategory"),
                "facility_id": None,
                "reporting_period": data.get("reporting_period"),
                "assignment_level": "organization",
                "start_date": data.get("start_date"),
                "end_date": data.get("end_date"),
                "timezone": data.get("timezone", "Asia/Kolkata"),
                "filling_frequency": data.get("filling_frequency"),
                "due_config": data.get("due_config"),
                "reminder_enabled": data.get("reminder_enabled", False),
                "reminder_config": data.get("reminder_config"),
                "requires_approval": data.get("requires_approval", False),
                "approver_id": data.get("approver_id"),  # Single-level approval
                "approval_chain": data.get("approval_chain", []),
            }
            
            assignment, is_new = await assignment_service_v2.create_or_update_assignment(
                data=assignment_data,
                user_ids=user_ids,
                created_by_user_id=user_id,
            )
            
            return {
                "message": "Assignment created" if is_new else "Assignment updated",
                "assignment": assignment,
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/assignments/{assignment_id}/remind")
async def send_assignment_reminder(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Send a reminder for an assignment."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # TODO: Implement reminder sending (email/notification)
    return {"message": "Reminder sent", "assignment_id": assignment_id}


# =============================================================================
# Draft Endpoints
# =============================================================================

@router.get("/drafts/{section}")
async def get_user_drafts(
    section: ESG_SECTION,
    current_user: dict = Depends(get_current_user)
):
    """Get current user's drafts for a section."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    drafts = await esg_records_service.get_user_drafts(
        org_id=org_id,
        section=section,
        user_id=user_id,
    )
    
    return {"drafts": drafts, "total": len(drafts)}


@router.post("/records/{section}/{record_id}/draft")
async def save_record_as_draft(
    section: ESG_SECTION,
    record_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save a record as draft for the current user."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    draft = await esg_records_service.save_as_draft(
        org_id=org_id,
        section=section,
        record_id=record_id,
        user_id=user_id,
        data=data,
    )
    
    return {"message": "Saved as draft", "draft": draft}


@router.delete("/drafts/{section}/{record_id}")
async def discard_record_draft(
    section: ESG_SECTION,
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Discard the current user's draft for a record."""
    org_id = current_user.get("organization_id")
    user_id = current_user.get("id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    await esg_records_service.discard_draft(
        org_id=org_id,
        section=section,
        record_id=record_id,
        user_id=user_id,
    )
    
    return {"message": "Draft discarded"}



# =============================================================================
# Data Coverage Endpoint
# =============================================================================

@router.get("/coverage")
async def get_data_coverage(
    category: str,
    filling_frequency: str,
    reporting_year: str,
    subcategory: Optional[str] = None,
    sub_subcategory: Optional[str] = None,
    facility_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Get data coverage for a category based on filling frequency.
    
    Shows which periods have data submitted vs missing.
    
    Args:
        category: Category name (e.g., "Water")
        filling_frequency: monthly, quarterly, yearly, etc.
        reporting_year: e.g., "FY 2025-2026", "CY 2026"
        subcategory: Optional subcategory filter
        sub_subcategory: Optional sub-subcategory filter
        facility_id: Optional facility filter
        start_date: Optional custom start date (ISO format)
        end_date: Optional custom end date (ISO format)
    
    Returns:
        List of periods with status (complete, missing, overdue, upcoming)
    """
    from .coverage import get_data_coverage as get_coverage
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Get org's year type
    org = await db["organizations"].find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1})
    year_type = org.get("reporting_year_type", "financial_year") if org else "financial_year"
    
    coverage = await get_coverage(
        db=db,
        organization_id=org_id,
        category=category,
        subcategory=subcategory,
        sub_subcategory=sub_subcategory,
        filling_frequency=filling_frequency,
        reporting_year=reporting_year,
        year_type=year_type,
        facility_id=facility_id,
        assignment_start_date=start_date,
        assignment_end_date=end_date,
    )
    
    return coverage



# =============================================================================
# Task Engine Endpoints
# =============================================================================

@router.post("/assignments/{assignment_id}/generate-tasks")
async def generate_tasks_for_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Generate reporting tasks for an assignment.
    
    Creates individual trackable tasks based on the assignment's
    frequency, start_date, end_date, and due_config.
    """
    from .task_engine import generate_tasks_for_assignment as gen_tasks
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Get the assignment
    assignment = await db["esg_assignments"].find_one({
        "id": assignment_id,
        "organization_id": org_id,
    }, {"_id": 0})
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Generate tasks
    result = await gen_tasks(db, assignment)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.get("/assignments/{assignment_id}/tasks")
async def get_assignment_tasks(
    assignment_id: str,
    status: Optional[str] = None,
    task_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """Get all tasks for an assignment."""
    from .task_engine import get_tasks_for_assignment
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    tasks = await get_tasks_for_assignment(
        db=db,
        assignment_id=assignment_id,
        status_filter=status,
        task_type_filter=task_type,
    )
    
    return {"tasks": tasks, "total": len(tasks)}


@router.get("/tasks/my-tasks")
async def get_my_tasks(
    domain: Optional[str] = None,
    status: Optional[str] = None,
    include_backfill: bool = False,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """Get current user's assigned tasks."""
    from .task_engine import get_tasks_for_user
    
    user_id = current_user.get("id")
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    status_filter = [status] if status else None
    
    tasks = await get_tasks_for_user(
        db=db,
        user_id=user_id,
        organization_id=org_id,
        status_filter=status_filter,
        include_backfill=include_backfill,
        domain=domain,
    )
    
    # Get assignment count for this user (to show if they have assignments even without tasks)
    # V2 Architecture: Count via esg_assignment_assignees junction table
    assignment_count = await db.esg_assignment_assignees.count_documents({
        "organization_id": org_id,
        "user_id": user_id,
        "$or": [
            {"removed_at": None},
            {"removed_at": {"$exists": False}},
        ],
    })
    
    return {"tasks": tasks, "total": len(tasks), "assignment_count": assignment_count}


@router.get("/tasks/summary")
async def get_tasks_summary(
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """Get task summary statistics."""
    from .task_engine import get_task_summary
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # If no user_id specified and not admin, use current user
    if not user_id and current_user.get("role") != "admin":
        user_id = current_user.get("id")
    
    summary = await get_task_summary(
        db=db,
        organization_id=org_id,
        user_id=user_id,
    )
    
    return summary


@router.patch("/tasks/{task_id}/status")
async def update_task_status(
    task_id: str,
    status: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """Update a task's status."""
    from .task_engine import update_task_status as update_status, TaskStatus
    
    # Validate status
    valid_statuses = [s.value for s in TaskStatus]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )
    
    result = await update_status(
        db=db,
        task_id=task_id,
        new_status=status,
        user_id=current_user.get("id"),
        reason=reason,
    )
    
    return result


@router.post("/tasks/refresh-overdue")
async def refresh_overdue_tasks(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Mark pending tasks as overdue if past due date.
    This is typically called by a cron job.
    """
    from .task_engine import refresh_overdue_tasks as refresh_tasks
    
    # Only admins can trigger this
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("organization_id")
    
    result = await refresh_tasks(db=db, organization_id=org_id)
    
    return result


@router.post("/tasks/sync-with-data")
async def sync_task_statuses_with_data_endpoint(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database),
):
    """
    Sync task statuses with actual data records.
    
    For tasks that are not completed but have data in the corresponding
    records collection, update the task status to completed.
    
    This fixes discrepancies where data was submitted but the task
    wasn't updated (e.g., via bulk upload or before the task existed).
    
    Admin only.
    """
    from .task_engine import sync_task_statuses_with_data
    
    # Only admins can trigger this
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    result = await sync_task_statuses_with_data(db=db, organization_id=org_id)
    
    return result



async def get_completion_by_category(
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database)
):
    """
    Get task completion statistics grouped by category/subcategory.
    Used for Enhanced Tracker Table to show completion % per row.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Aggregation pipeline to group tasks by category
    match_query = {"organization_id": org_id}
    if reporting_period:
        match_query["reporting_period"] = reporting_period
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": {
                "category": "$category",
                "subcategory": "$subcategory",
                "sub_subcategory": "$sub_subcategory",
                "facility_id": "$facility_id",
            },
            "total": {"$sum": 1},
            "backfill_pending": {"$sum": {"$cond": [{"$eq": ["$status", "backfill_pending"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
            "in_progress": {"$sum": {"$cond": [{"$eq": ["$status", "in_progress"]}, 1, 0]}},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "reopened": {"$sum": {"$cond": [{"$eq": ["$status", "reopened"]}, 1, 0]}},
            "overdue": {"$sum": {"$cond": [{"$eq": ["$status", "overdue"]}, 1, 0]}},
            "skipped": {"$sum": {"$cond": [{"$eq": ["$status", "skipped"]}, 1, 0]}},
            # Approval status breakdown
            "pending_approval": {"$sum": {"$cond": [{"$eq": ["$approval_status", "pending_approval"]}, 1, 0]}},
            "approved": {"$sum": {"$cond": [{"$eq": ["$approval_status", "approved"]}, 1, 0]}},
        }},
        {"$project": {
            "_id": 0,
            "category": "$_id.category",
            "subcategory": "$_id.subcategory",
            "sub_subcategory": "$_id.sub_subcategory",
            "facility_id": "$_id.facility_id",
            "total": 1,
            "backfill_pending": 1,
            "pending": 1,
            "in_progress": 1,
            "completed": 1,
            "reopened": 1,
            "overdue": 1,
            "skipped": 1,
            "pending_approval": 1,
            "approved": 1,
            # Operational completion = completed + skipped (user finished their work)
            "operational_complete": {"$add": ["$completed", "$skipped"]},
            "completion_pct": {
                "$cond": [
                    {"$eq": ["$total", 0]},
                    0,
                    {"$multiply": [
                        {"$divide": [{"$add": ["$completed", "$skipped"]}, "$total"]},
                        100
                    ]}
                ]
            }
        }},
        {"$sort": {"category": 1, "subcategory": 1, "sub_subcategory": 1}}
    ]
    
    results = await db["esg_reporting_tasks"].aggregate(pipeline).to_list(500)
    
    return {"completion_stats": results}



@router.get("/tasks/period-status/{assignment_id}")
async def get_period_fill_status(
    assignment_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_database),
):
    """
    Get per-period fill status for an assignment.
    Returns each period with its status (filled, overdue, pending, future).
    Used for the expandable period breakdown in the tracker.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")

    assignment = await db["esg_assignments"].find_one(
        {"id": assignment_id, "organization_id": org_id}, {"_id": 0}
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    tasks = await db["esg_reporting_tasks"].find(
        {
            "organization_id": org_id,
            "facility_id": assignment.get("facility_id"),
            "category": assignment.get("category"),
            "subcategory": assignment.get("subcategory"),
            "sub_subcategory": assignment.get("sub_subcategory"),
        },
        {"_id": 0, "period_key": 1, "period_label": 1, "status": 1, "due_at": 1, "is_backfill": 1}
    ).sort("period_key", 1).to_list(1000)

    now = datetime.now()
    periods = []
    for t in tasks:
        status = t.get("status", "pending")
        due_at = t.get("due_at")
        is_overdue = status not in ("completed", "skipped") and due_at and due_at < now

        periods.append({
            "period_key": t["period_key"],
            "period_label": t.get("period_label", t["period_key"]),
            "status": status,
            "is_overdue": is_overdue,
            "due_at": due_at.isoformat() if due_at else None,
        })

    filled = sum(1 for p in periods if p["status"] in ("completed", "skipped"))
    overdue = sum(1 for p in periods if p["is_overdue"])

    return {
        "assignment_id": assignment_id,
        "total_periods": len(periods),
        "filled": filled,
        "overdue": overdue,
        "pending": len(periods) - filled,
        "periods": periods,
    }



# =============================================================================
# Detailed Progress Endpoint (Period × Facility Matrix)
# =============================================================================

@router.get("/detailed-progress/{category}/{subcategory}")
async def get_detailed_subcategory_progress(
    category: str,
    subcategory: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed period-by-period progress for a subcategory.
    
    Returns a matrix showing:
    - Each reporting period with its status (filled, pending, overdue)
    - For facility-level assignments: per-facility breakdown for each period
    - Summary counts: total, completed, partial, overdue, pending
    
    This enables admins to see exactly which month/quarter data is missing
    and which facilities are lagging behind.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    result = await detailed_progress_service.get_subcategory_detail(
        org_id=org_id,
        category=category,
        subcategory=subcategory,
    )
    
    return result


@router.get("/detailed-progress/{category}")
async def get_detailed_category_progress(
    category: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed period-by-period progress for a category (all subcategories combined).
    
    Returns a matrix showing:
    - Each reporting period with its status (filled, pending, overdue)
    - For facility-level assignments: per-facility breakdown for each period
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # For category-level, we pass empty string for subcategory
    result = await detailed_progress_service.get_subcategory_detail(
        org_id=org_id,
        category=category,
        subcategory="",  # Category level - no specific subcategory
    )
    
    return result
