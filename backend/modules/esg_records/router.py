"""
ESG Records Module - API Router

Reusable router for Environment, Social, and Governance records.
Includes integration with GHG module for auto-imported records.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from core_platform.auth import get_current_user
from .service import esg_records_service
from .ghg_integration import get_ghg_integration_service
from .contracts import (
    ESG_SECTION, REPORTING_TYPE, 
    CreateRecordRequest, UpdateRecordRequest, RecordListFilters
)
from shared.database import get_database

router = APIRouter(prefix="/esg-records", tags=["ESG Records"])


# =============================================================================
# Category Endpoints
# =============================================================================

@router.get("/categories/{section}")
async def list_categories(
    section: ESG_SECTION,
    framework: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List categories for a section (environment/social/governance)."""
    categories = await esg_records_service.list_categories(
        section=section,
        framework=framework
    )
    return {"categories": categories, "total": len(categories)}


@router.get("/categories/{section}/{category_id}")
async def get_category(
    section: ESG_SECTION,
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific category config."""
    category = await esg_records_service.get_category(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


# =============================================================================
# Record CRUD Endpoints
# =============================================================================

@router.post("/records/{section}")
async def create_record(
    section: ESG_SECTION,
    data: CreateRecordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a new ESG record."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id") or current_user.get("user_id")
    
    record = await esg_records_service.create_record(
        section=section,
        org_id=org_id,
        user_id=user_id,
        data=data
    )
    
    return {"message": "Record created", "record": record}


@router.get("/records/{section}")
async def list_records(
    section: ESG_SECTION,
    category: Optional[str] = None,
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
    """List ESG records with filtering and pagination. Includes GHG-imported records."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    filters = RecordListFilters(
        category=category,
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
        filters=filters
    )
    
    # Get GHG-imported records if enabled and section is environment
    if include_imported and section == "environment":
        db = get_database()
        ghg_service = get_ghg_integration_service(db)
        
        imported_records = await ghg_service.get_all_imported_records(
            org_id=org_id,
            section=section,
            category=category,
            facility_id=facility_id
        )
        
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
        
        # Merge with native records
        # For now, append imported at the end; in future could interleave by date
        native_records = result.get("records", [])
        all_records = native_records + imported_records
        
        # Update pagination info
        total_with_imported = result.get("total", 0) + len(imported_records)
        
        # Apply pagination to combined list
        # For simplicity, if we're on page 1 and have imported records, show them
        # More sophisticated pagination could be added later
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_records = all_records[start_idx:end_idx]
        
        result = {
            "records": paginated_records,
            "total": total_with_imported,
            "page": page,
            "limit": limit,
            "total_pages": (total_with_imported + limit - 1) // limit,
            "has_imported": len(imported_records) > 0,
            "imported_count": len(imported_records)
        }
    
    return result


@router.get("/records/{section}/{record_id}")
async def get_record(
    section: ESG_SECTION,
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a single record."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
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
    current_user: dict = Depends(get_current_user)
):
    """Update a record (creates new version)."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id") or current_user.get("user_id")
    
    # Verify record exists and belongs to org
    existing = await esg_records_service.get_record(section, record_id, org_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    
    updated = await esg_records_service.update_record(
        section=section,
        record_id=record_id,
        user_id=user_id,
        data=data
    )
    
    return {"message": "Record updated", "record": updated}


@router.delete("/records/{section}/{record_id}")
async def delete_record(
    section: ESG_SECTION,
    record_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a record (soft delete)."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    deleted = await esg_records_service.delete_record(
        section=section,
        record_id=record_id,
        org_id=org_id
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
    current_user: dict = Depends(get_current_user)
):
    """Get record statistics for the organization."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    stats = await esg_records_service.get_record_stats(
        section=section,
        org_id=org_id
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
            financial_year = f"FY {fy_start}-{str(fy_start + 1)[-2:]}"
        except:
            pass
    
    # Get metrics from service
    service = get_dashboard_metrics_service(db)
    metrics = await service.get_dashboard_metrics(org_id, fac_list, financial_year)
    
    return metrics
