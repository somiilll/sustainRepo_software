"""
ESG KPI Definitions Module - Router

API endpoints for KPI definition management.
Super Admin only - manages reusable metric configurations.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user, get_super_admin_user
from .contracts import (
    KPIDefinitionCreate, KPIDefinitionUpdate, KPIDefinitionResponse
)
from .service import esg_kpi_definitions_service

router = APIRouter(prefix="/esg-kpi-definitions", tags=["ESG KPI Definitions"])


# =============================================================================
# CRUD Endpoints (Super Admin Only)
# =============================================================================

@router.get("", response_model=List[KPIDefinitionResponse])
async def list_kpi_definitions(
    section: Optional[str] = Query(None, description="ESG section filter"),
    category_name: Optional[str] = Query(None, description="Category filter"),
    status: Optional[str] = Query(None, description="Status filter"),
    source_type: Optional[str] = Query(None, description="Source type filter"),
    search: Optional[str] = Query(None, description="Search in name/code/description"),
    tags: Optional[str] = Query(None, description="Comma-separated tags filter"),
    include_archived: bool = Query(False, description="Include archived KPIs"),
    current_user: dict = Depends(get_super_admin_user)
):
    """List all KPI definitions with optional filters. Super Admin only."""
    tags_list = tags.split(",") if tags else None
    
    kpi_defs = await esg_kpi_definitions_service.list_kpi_definitions(
        section=section,
        category_name=category_name,
        status=status,
        source_type=source_type,
        search=search,
        tags=tags_list,
        include_archived=include_archived
    )
    
    return kpi_defs


@router.post("", response_model=KPIDefinitionResponse)
async def create_kpi_definition(
    data: KPIDefinitionCreate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Create a new KPI definition. Super Admin only."""
    try:
        kpi_def = await esg_kpi_definitions_service.create_kpi_definition(
            data=data,
            user_id=current_user.get("id"),
            user_name=current_user.get("name") or current_user.get("email")
        )
        return kpi_def
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/lookup/sections")
async def get_sections_summary(
    current_user: dict = Depends(get_super_admin_user)
):
    """Get summary of KPIs grouped by section. Super Admin only."""
    summary = await esg_kpi_definitions_service.get_sections_summary()
    return {"sections": summary}


@router.get("/lookup/tags")
async def get_unique_tags(
    current_user: dict = Depends(get_super_admin_user)
):
    """Get all unique tags. Super Admin only."""
    tags = await esg_kpi_definitions_service.get_unique_tags()
    return {"tags": tags}


@router.get("/lookup/for-targets")
async def get_kpis_for_targets(
    section: Optional[str] = Query(None, description="ESG section filter"),
    current_user: dict = Depends(get_current_user)
):
    """Get KPIs available for target creation. Any authenticated user."""
    kpis = await esg_kpi_definitions_service.get_kpis_for_targets(section=section)
    return {"kpis": kpis}


@router.get("/lookup/categories")
async def get_categories_by_section(
    section: str = Query(..., description="ESG section (environment, social, governance)"),
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Get categories and subcategories for a given ESG section.
    Returns hierarchical structure with field definitions for dropdown population.
    """
    from shared.database.mongo import db
    
    # Get all categories for this section
    categories = await db.esg_record_categories.find(
        {"section": section},
        {"_id": 0, "id": 1, "category": 1, "subcategory": 1, "sub_subcategory": 1, "fields": 1, "unit": 1}
    ).to_list(1000)
    
    # Build hierarchical structure: category -> subcategory -> fields
    hierarchy = {}
    category_list = []
    
    for cat in categories:
        cat_name = cat.get("category", "")
        subcat_name = cat.get("subcategory", "")
        
        # Build unique category list
        if cat_name and cat_name not in [c["name"] for c in category_list]:
            category_list.append({"name": cat_name, "subcategories": []})
        
        # Find or create category entry in hierarchy
        if cat_name not in hierarchy:
            hierarchy[cat_name] = {}
        
        # Add subcategory with its fields
        if subcat_name not in hierarchy[cat_name]:
            hierarchy[cat_name][subcat_name] = {
                "category_id": cat.get("id"),
                "fields": []
            }
        
        # Extract fields from "fields" array (note: field uses field_key not key)
        for field in cat.get("fields", []):
            field_entry = {
                "key": field.get("field_key"),
                "label": field.get("label"),
                "type": field.get("type", "number"),
                "unit": field.get("unit") or cat.get("unit")
            }
            # Avoid duplicates
            existing_keys = [f["key"] for f in hierarchy[cat_name][subcat_name]["fields"]]
            if field_entry["key"] and field_entry["key"] not in existing_keys:
                hierarchy[cat_name][subcat_name]["fields"].append(field_entry)
    
    # Build category list with subcategories
    for cat_entry in category_list:
        cat_name = cat_entry["name"]
        if cat_name in hierarchy:
            cat_entry["subcategories"] = list(hierarchy[cat_name].keys())
    
    return {
        "section": section,
        "categories": category_list,
        "hierarchy": hierarchy
    }


@router.get("/lookup/fields")
async def get_fields_for_subcategory(
    section: str = Query(..., description="ESG section"),
    category: str = Query(..., description="Category name"),
    subcategory: str = Query(..., description="Subcategory name"),
    current_user: dict = Depends(get_super_admin_user)
):
    """
    Get field definitions for a specific subcategory.
    Used for populating value_field and filter field dropdowns.
    """
    from shared.database.mongo import db
    
    # Find the category document
    cat_doc = await db.esg_record_categories.find_one(
        {"section": section, "category": category, "subcategory": subcategory},
        {"_id": 0, "id": 1, "fields": 1, "unit": 1}
    )
    
    if not cat_doc:
        return {"fields": [], "category_id": None}
    
    fields = []
    for field in cat_doc.get("fields", []):
        fields.append({
            "key": field.get("field_key"),
            "label": field.get("label"),
            "type": field.get("type", "number"),
            "unit": field.get("unit") or cat_doc.get("unit")
        })
    
    return {
        "category_id": cat_doc.get("id"),
        "fields": fields
    }


@router.get("/{kpi_id}", response_model=KPIDefinitionResponse)
async def get_kpi_definition(
    kpi_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """Get a single KPI definition by ID. Super Admin only."""
    kpi_def = await esg_kpi_definitions_service.get_kpi_definition(kpi_id)
    if not kpi_def:
        raise HTTPException(status_code=404, detail="KPI definition not found")
    return kpi_def


@router.put("/{kpi_id}", response_model=KPIDefinitionResponse)
async def update_kpi_definition(
    kpi_id: str,
    data: KPIDefinitionUpdate,
    current_user: dict = Depends(get_super_admin_user)
):
    """Update a KPI definition. Super Admin only."""
    kpi_def = await esg_kpi_definitions_service.update_kpi_definition(
        kpi_id=kpi_id,
        data=data,
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email")
    )
    
    if not kpi_def:
        raise HTTPException(status_code=404, detail="KPI definition not found")
    
    return kpi_def


@router.post("/{kpi_id}/archive", response_model=KPIDefinitionResponse)
async def archive_kpi_definition(
    kpi_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """Archive a KPI definition. Validates no active references. Super Admin only."""
    try:
        kpi_def = await esg_kpi_definitions_service.archive_kpi_definition(
            kpi_id=kpi_id,
            user_id=current_user.get("id"),
            user_name=current_user.get("name") or current_user.get("email")
        )
        
        if not kpi_def:
            raise HTTPException(status_code=404, detail="KPI definition not found")
        
        return kpi_def
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{kpi_id}")
async def delete_kpi_definition(
    kpi_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """Hard delete a KPI definition. Use archive instead when possible. Super Admin only."""
    try:
        deleted = await esg_kpi_definitions_service.delete_kpi_definition(kpi_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="KPI definition not found")
        return {"message": "KPI definition deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{kpi_id}/duplicate", response_model=KPIDefinitionResponse)
async def duplicate_kpi_definition(
    kpi_id: str,
    current_user: dict = Depends(get_super_admin_user)
):
    """Duplicate a KPI definition. Returns new KPI in Draft status. Super Admin only."""
    kpi_def = await esg_kpi_definitions_service.duplicate_kpi_definition(
        kpi_id=kpi_id,
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email")
    )
    
    if not kpi_def:
        raise HTTPException(status_code=404, detail="KPI definition not found")
    
    return kpi_def
