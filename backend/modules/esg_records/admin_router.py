"""
ESG Records Module - Super Admin Router

Category configuration endpoints for Super Admin only.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel
import uuid

from core_platform.auth import get_current_user
from .service import esg_records_service
from .contracts import ESG_SECTION, REPORTING_TYPE, ESGRecordFieldConfig


# =============================================================================
# Request/Response Models
# =============================================================================

class CreateCategoryRequest(BaseModel):
    """Request to create a new ESG record category."""
    section: ESG_SECTION
    category: str
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    frameworks: List[str] = ["BRSR"]
    allowed_reporting_types: List[REPORTING_TYPE] = ["daily", "monthly", "quarterly", "yearly"]
    fields: List[ESGRecordFieldConfig] = []
    is_active: bool = True
    order: int = 0


class UpdateCategoryRequest(BaseModel):
    """Request to update an ESG record category."""
    category: Optional[str] = None
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    frameworks: Optional[List[str]] = None
    allowed_reporting_types: Optional[List[REPORTING_TYPE]] = None
    fields: Optional[List[ESGRecordFieldConfig]] = None
    is_active: Optional[bool] = None
    order: Optional[int] = None


# =============================================================================
# Router
# =============================================================================

admin_router = APIRouter(prefix="/super-admin/esg-config", tags=["Super Admin - ESG Config"])


def require_super_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to ensure user is super admin."""
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return current_user


# =============================================================================
# Category CRUD Endpoints
# =============================================================================

@admin_router.get("/categories")
async def list_all_categories(
    section: Optional[ESG_SECTION] = None,
    framework: Optional[str] = None,
    include_inactive: bool = False,
    current_user: dict = Depends(require_super_admin)
):
    """List all ESG record categories (Super Admin only)."""
    categories = await esg_records_service.admin_list_categories(
        section=section,
        framework=framework,
        include_inactive=include_inactive
    )
    return {
        "categories": categories,
        "total": len(categories),
        "by_section": {
            "environment": len([c for c in categories if c.get("section") == "environment"]),
            "social": len([c for c in categories if c.get("section") == "social"]),
            "governance": len([c for c in categories if c.get("section") == "governance"])
        }
    }


@admin_router.get("/categories/{category_id}")
async def get_category_detail(
    category_id: str,
    current_user: dict = Depends(require_super_admin)
):
    """Get detailed category config (Super Admin only)."""
    category = await esg_records_service.get_category(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@admin_router.post("/categories")
async def create_category(
    data: CreateCategoryRequest,
    current_user: dict = Depends(require_super_admin)
):
    """Create a new ESG record category (Super Admin only)."""
    category_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    category_doc = {
        "id": category_id,
        "section": data.section,
        "category": data.category,
        "subcategory": data.subcategory,
        "sub_subcategory": data.sub_subcategory,
        "frameworks": data.frameworks,
        "allowed_reporting_types": data.allowed_reporting_types,
        "fields": [f.model_dump() for f in data.fields],
        "is_active": data.is_active,
        "order": data.order,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id")
    }
    
    result = await esg_records_service.create_category(category_doc)
    return {"message": "Category created", "category": result}


@admin_router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    data: UpdateCategoryRequest,
    current_user: dict = Depends(require_super_admin)
):
    """Update an ESG record category (Super Admin only)."""
    existing = await esg_records_service.get_category(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = {}
    if data.category is not None:
        update_data["category"] = data.category
    if data.subcategory is not None:
        update_data["subcategory"] = data.subcategory
    if data.sub_subcategory is not None:
        update_data["sub_subcategory"] = data.sub_subcategory
    if data.frameworks is not None:
        update_data["frameworks"] = data.frameworks
    if data.allowed_reporting_types is not None:
        update_data["allowed_reporting_types"] = data.allowed_reporting_types
    if data.fields is not None:
        update_data["fields"] = [f.model_dump() for f in data.fields]
    if data.is_active is not None:
        update_data["is_active"] = data.is_active
    if data.order is not None:
        update_data["order"] = data.order
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = current_user.get("id")
    
    result = await esg_records_service.update_category(category_id, update_data)
    return {"message": "Category updated", "category": result}


@admin_router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user: dict = Depends(require_super_admin)
):
    """Delete an ESG record category (Super Admin only)."""
    existing = await esg_records_service.get_category(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if category has any records
    record_count = await esg_records_service.count_records_by_category(category_id)
    if record_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete category with {record_count} existing records. Deactivate it instead."
        )
    
    await esg_records_service.delete_category(category_id)
    return {"message": "Category deleted"}


@admin_router.post("/categories/{category_id}/toggle-active")
async def toggle_category_active(
    category_id: str,
    current_user: dict = Depends(require_super_admin)
):
    """Toggle category active status (Super Admin only)."""
    existing = await esg_records_service.get_category(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    new_status = not existing.get("is_active", True)
    await esg_records_service.update_category(category_id, {
        "is_active": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("id")
    })
    
    return {"message": f"Category {'activated' if new_status else 'deactivated'}", "is_active": new_status}


@admin_router.post("/categories/reorder")
async def reorder_categories(
    section: ESG_SECTION,
    category_ids: List[str],
    current_user: dict = Depends(require_super_admin)
):
    """Reorder categories within a section (Super Admin only)."""
    for idx, cat_id in enumerate(category_ids):
        await esg_records_service.update_category(cat_id, {
            "order": idx,
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
    
    return {"message": "Categories reordered", "order": category_ids}


# =============================================================================
# Field Type Reference
# =============================================================================

@admin_router.get("/field-types")
async def get_field_types(
    current_user: dict = Depends(require_super_admin)
):
    """Get available field types and their configurations."""
    return {
        "field_types": [
            {
                "type": "text",
                "label": "Single Line Text",
                "description": "Short text input",
                "supports": ["placeholder", "validation.max_length"]
            },
            {
                "type": "textarea",
                "label": "Multi-Line Text",
                "description": "Long text input with multiple lines",
                "supports": ["placeholder", "validation.max_length"]
            },
            {
                "type": "number",
                "label": "Number",
                "description": "Numeric input",
                "supports": ["placeholder", "validation.min", "validation.max", "validation.step"]
            },
            {
                "type": "dropdown",
                "label": "Dropdown Select",
                "description": "Single selection from predefined options",
                "supports": ["options", "placeholder"]
            },
            {
                "type": "radio",
                "label": "Radio Buttons",
                "description": "Single selection with visible options",
                "supports": ["options"]
            },
            {
                "type": "checkbox_group",
                "label": "Checkbox Group",
                "description": "Multiple selection from options",
                "supports": ["options"]
            },
            {
                "type": "yes_no",
                "label": "Yes/No",
                "description": "Binary choice",
                "supports": []
            },
            {
                "type": "date",
                "label": "Date",
                "description": "Date picker",
                "supports": ["validation.min_date", "validation.max_date"]
            },
            {
                "type": "file_upload",
                "label": "File Upload",
                "description": "File attachment",
                "supports": ["validation.max_size", "validation.allowed_types"]
            },
            {
                "type": "unit_selector",
                "label": "Unit Selector",
                "description": "Dropdown for measurement units",
                "supports": ["options"]
            },
            {
                "type": "table",
                "label": "Table",
                "description": "Structured data entry in rows and columns",
                "supports": ["table_columns", "table_min_rows", "table_max_rows"],
                "column_types": ["text", "number", "dropdown", "date"]
            }
        ]
    }


# =============================================================================
# Statistics
# =============================================================================

@admin_router.get("/stats")
async def get_esg_config_stats(
    current_user: dict = Depends(require_super_admin)
):
    """Get ESG configuration statistics."""
    stats = await esg_records_service.get_admin_stats()
    return stats
