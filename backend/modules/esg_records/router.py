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
    """Create a new ESG record. Validates user has active assignment."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id") or current_user.get("user_id")
    user_role = current_user.get("role", "")
    
    # Admin can skip assignment check
    skip_check = user_role in ["admin", "super_admin"]
    
    try:
        record = await esg_records_service.create_record(
            section=section,
            org_id=org_id,
            user_id=user_id,
            data=data,
            skip_assignment_check=skip_check,
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    
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
    assigned_categories = None
    if not is_admin:
        from shared.database.mongo import db
        assignments_cursor = db.esg_assignments.find(
            {
                "organization_id": org_id,
                "assigned_to_user_id": user_id,
                "entity_type": "record_category",
            },
            {"_id": 0, "category": 1, "subcategory": 1, "sub_subcategory": 1}
        )
        assignments = await assignments_cursor.to_list(500)
        
        if assignments:
            # Build list of (category, subcategory) tuples user is assigned to
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
        filters=filters,
        assigned_categories=assigned_categories,  # Pass filter for non-admin users
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
    """Delete a record (soft delete). Also reverts associated task to pending."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    user_id = current_user.get("id")
    
    deleted = await esg_records_service.delete_record(
        section=section,
        record_id=record_id,
        org_id=org_id,
        user_id=user_id,
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
        except (ValueError, IndexError):
            pass
    
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
    Create or update a record category assignment.
    Supports multiple assignments per category (multi-user).
    
    Admin only - regular users cannot assign tasks.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Check if user is admin
    user_role = current_user.get("role", "user")
    if user_role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can create assignments")
    
    user_id = current_user.get("id")
    
    assignment = await esg_records_service.create_assignment(
        org_id=org_id,
        assigned_by_user_id=user_id,
        data=data,
    )
    
    return {"message": "Assignment saved", "assignment": assignment}


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
    assignment_count = await db.esg_assignments.count_documents({
        "organization_id": org_id,
        "assigned_to_user_id": user_id,
        "entity_type": "record_category",
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



@router.get("/tasks/completion-by-category")
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

