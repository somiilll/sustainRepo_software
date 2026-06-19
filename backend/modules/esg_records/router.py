"""
ESG Records Module - API Router

Reusable router for Environment, Social, and Governance records.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from core_platform.auth import get_current_user
from .service import esg_records_service
from .contracts import (
    ESG_SECTION, REPORTING_TYPE, 
    CreateRecordRequest, UpdateRecordRequest, RecordListFilters
)

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
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List ESG records with filtering and pagination."""
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
    
    result = await esg_records_service.list_records(
        section=section,
        org_id=org_id,
        filters=filters
    )
    
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
