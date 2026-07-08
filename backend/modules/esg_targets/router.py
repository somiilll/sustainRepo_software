"""
ESG Targets Module - Router

API endpoints for ESG target management.
Admin-only for write operations, all authenticated users can read.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user
from .contracts import (
    ESGTargetCreate, ESGTargetUpdate, ESGTargetResponse
)
from .service import esg_targets_service
from .baseline_service import baseline_service
from .baseline_config import get_metric_mapping, get_all_mapped_metrics

router = APIRouter()


def _require_admin(current_user: dict) -> None:
    """Ensure user has admin privileges."""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin permission required")


def _get_org_id(current_user: dict) -> str:
    """Get organization ID from current user."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


# =============================================================================
# Target CRUD Endpoints
# =============================================================================

@router.get("", response_model=List[ESGTargetResponse])
async def list_targets(
    section: Optional[str] = Query(None, description="ESG section filter"),
    category: Optional[str] = Query(None, description="Category filter"),
    subcategory: Optional[str] = Query(None, description="Subcategory filter"),
    facility_id: Optional[str] = Query(None, description="Facility ID filter"),
    reporting_period: Optional[str] = Query(None, description="Reporting period filter"),
    status: Optional[str] = Query(None, description="Status filter"),
    search: Optional[str] = Query(None, description="Search in name/description"),
    current_user: dict = Depends(get_current_user)
):
    """List all ESG targets for the organization."""
    org_id = _get_org_id(current_user)
    
    targets = await esg_targets_service.list_targets(
        org_id=org_id,
        section=section,
        category=category,
        subcategory=subcategory,
        facility_id=facility_id,
        reporting_period=reporting_period,
        status=status,
        search=search
    )
    
    return targets


@router.post("", response_model=ESGTargetResponse)
async def create_target(
    data: ESGTargetCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new ESG target. Admin only."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    try:
        target = await esg_targets_service.create_target(
            org_id=org_id,
            data=data,
            user_id=current_user.get("id"),
            user_name=current_user.get("name") or current_user.get("email")
        )
        return target
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{target_id}", response_model=ESGTargetResponse)
async def get_target(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single ESG target by ID."""
    org_id = _get_org_id(current_user)
    
    target = await esg_targets_service.get_target(target_id, org_id)
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return target


@router.put("/{target_id}", response_model=ESGTargetResponse)
async def update_target(
    target_id: str,
    data: ESGTargetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an ESG target. Admin only."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    target = await esg_targets_service.update_target(
        target_id=target_id,
        org_id=org_id,
        data=data,
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email")
    )
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return target


@router.delete("/{target_id}")
async def delete_target(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an ESG target. Admin only."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    deleted = await esg_targets_service.delete_target(target_id, org_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return {"message": "Target deleted successfully"}


@router.post("/{target_id}/duplicate", response_model=ESGTargetResponse)
async def duplicate_target(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Duplicate an ESG target. Admin only. Returns new target in Draft status."""
    _require_admin(current_user)
    org_id = _get_org_id(current_user)
    
    target = await esg_targets_service.duplicate_target(
        target_id=target_id,
        org_id=org_id,
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email")
    )
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    
    return target


# =============================================================================
# Version History Endpoint
# =============================================================================

@router.get("/{target_id}/versions")
async def get_target_versions(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get version history for an ESG target."""
    org_id = _get_org_id(current_user)
    
    versions = await esg_targets_service.get_target_versions(target_id, org_id)
    
    return {
        "target_id": target_id,
        "versions": versions,
        "total": len(versions)
    }


# =============================================================================
# KPI/Metric Lookup Endpoint (for hierarchical selection)
# =============================================================================

@router.get("/lookup/categories")
async def get_categories_for_targets(
    section: str = Query(..., description="ESG section (environment, social, governance)"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get categories with their field_definitions for target KPI selection.
    Returns hierarchical structure for the form selector.
    """
    from shared.database.mongo import db
    
    _get_org_id(current_user)  # Validate user has org
    
    # Get all categories for this section
    categories = await db.esg_record_categories.find(
        {"section": section},
        {"_id": 0, "id": 1, "category": 1, "subcategory": 1, "sub_subcategory": 1, "field_definitions": 1, "unit": 1}
    ).to_list(1000)
    
    # Build hierarchical structure
    hierarchy = {}
    for cat in categories:
        cat_name = cat.get("category", "")
        subcat_name = cat.get("subcategory", "")
        sub_subcat_name = cat.get("sub_subcategory")
        
        if cat_name not in hierarchy:
            hierarchy[cat_name] = {}
        
        if subcat_name not in hierarchy[cat_name]:
            hierarchy[cat_name][subcat_name] = {}
        
        key = sub_subcat_name or "_root"
        if key not in hierarchy[cat_name][subcat_name]:
            hierarchy[cat_name][subcat_name][key] = []
        
        # Extract metrics from field_definitions
        for field in cat.get("field_definitions", []):
            hierarchy[cat_name][subcat_name][key].append({
                "metric_key": field.get("key"),
                "metric_label": field.get("label"),
                "unit": field.get("unit") or cat.get("unit"),
                "category_id": cat.get("id")
            })
    
    return {
        "section": section,
        "hierarchy": hierarchy
    }



# =============================================================================
# Baseline Lookup Endpoints (GHG Module Integration)
# =============================================================================

@router.get("/baseline/lookup")
async def lookup_baseline_value(
    metric_key: str = Query(..., description="ESG metric key to lookup baseline for"),
    facility_id: Optional[str] = Query(None, description="Optional facility ID for facility-level baseline"),
    current_user: dict = Depends(get_current_user)
):
    """
    Lookup baseline year and value for a metric from GHG module.
    
    Automatically maps ESG metrics to GHG scope/category and fetches the baseline.
    """
    org_id = _get_org_id(current_user)
    
    result = await baseline_service.get_baseline_for_metric(
        org_id=org_id,
        metric_key=metric_key,
        facility_id=facility_id
    )
    
    return result


@router.get("/baseline/available-years")
async def get_available_base_years(
    facility_id: Optional[str] = Query(None, description="Optional facility ID"),
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of available base years for the organization/facility.
    """
    org_id = _get_org_id(current_user)
    
    years = await baseline_service.get_available_base_years(
        org_id=org_id,
        facility_id=facility_id
    )
    
    return {"years": years}


@router.get("/baseline/ghg-access")
async def check_ghg_module_access(
    current_user: dict = Depends(get_current_user)
):
    """
    Check if organization has GHG module access and what data is available.
    """
    org_id = _get_org_id(current_user)
    
    access = await baseline_service.check_ghg_module_access(org_id)
    
    return access


@router.get("/baseline/mapped-metrics")
async def get_mapped_metrics(
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of all ESG metrics that have GHG baseline mappings.
    """
    return {
        "metrics": get_all_mapped_metrics()
    }


@router.get("/baseline/metric-mapping/{metric_key}")
async def get_metric_ghg_mapping(
    metric_key: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the GHG mapping configuration for a specific metric.
    """
    mapping = get_metric_mapping(metric_key)
    
    if not mapping:
        return {
            "found": False,
            "metric_key": metric_key,
            "mapping": None
        }
    
    return {
        "found": True,
        "metric_key": metric_key,
        "mapping": mapping
    }
