"""
API Router for ESG Assignments

Provides endpoints for:
- Assignment CRUD (Admin only)
- User assignment queries
- Assignment history
- Response version history
- Bulk operations
- Reminder management
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime
from .models import (
    EntityType, AssignmentLevel, AssignmentRole, AssignmentStatus,
    CreateAssignmentRequest, UpdateAssignmentRequest, BulkAssignmentRequest,
    ReassignRequest, AssignmentFilter,
)
from .service import assignment_service
from .access_control import access_control_service
from .scheduler import reminder_scheduler
from modules.auth.dependencies import get_current_user, get_admin_user


router = APIRouter(prefix="/esg-assignments", tags=["ESG Assignments"])


# ============================================
# ADMIN ENDPOINTS - Assignment Management
# ============================================

@router.post("/assignments")
async def create_assignment(
    request: CreateAssignmentRequest,
    current_user: dict = Depends(get_admin_user),
):
    """
    Create a new assignment (Admin only).
    
    Assigns a question or record to a user for a specific reporting period.
    """
    assignment = await assignment_service.create_assignment(
        organization_id=current_user["organization_id"],
        request=request,
        assigned_by_user_id=current_user["id"],
    )
    
    return {"success": True, "assignment": assignment}


@router.get("/assignments")
async def list_assignments(
    entity_type: Optional[EntityType] = None,
    assignment_level: Optional[AssignmentLevel] = None,
    entity_id: Optional[str] = None,
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    assigned_to_user_id: Optional[str] = None,
    role: Optional[AssignmentRole] = None,
    status: Optional[AssignmentStatus] = None,
    is_overdue: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_admin_user),
):
    """
    List all assignments with filtering (Admin only).
    """
    filter = AssignmentFilter(
        entity_type=entity_type,
        assignment_level=assignment_level,
        entity_id=entity_id,
        facility_id=facility_id,
        reporting_period=reporting_period,
        assigned_to_user_id=assigned_to_user_id,
        role=role,
        status=status,
        is_overdue=is_overdue,
        page=page,
        page_size=page_size,
    )
    
    result = await assignment_service.list_assignments(
        organization_id=current_user["organization_id"],
        filter=filter,
    )
    
    return result


@router.get("/assignments/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_admin_user),
):
    """Get a specific assignment (Admin only)."""
    assignment = await assignment_service.get_assignment(
        assignment_id=assignment_id,
        organization_id=current_user["organization_id"],
    )
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"assignment": assignment}


@router.put("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    request: UpdateAssignmentRequest,
    current_user: dict = Depends(get_admin_user),
):
    """Update an assignment (Admin only)."""
    assignment = await assignment_service.update_assignment(
        assignment_id=assignment_id,
        organization_id=current_user["organization_id"],
        request=request,
        updated_by_user_id=current_user["id"],
    )
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"success": True, "assignment": assignment}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_admin_user),
):
    """Delete an assignment (Admin only)."""
    success = await assignment_service.delete_assignment(
        assignment_id=assignment_id,
        organization_id=current_user["organization_id"],
        deleted_by_user_id=current_user["id"],
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"success": True}


@router.post("/assignments/{assignment_id}/reassign")
async def reassign_assignment(
    assignment_id: str,
    request: ReassignRequest,
    current_user: dict = Depends(get_admin_user),
):
    """
    Reassign to a different user (Admin only).
    
    Preserves the assignment but changes the assigned user.
    """
    assignment = await assignment_service.reassign(
        assignment_id=assignment_id,
        organization_id=current_user["organization_id"],
        request=request,
        reassigned_by_user_id=current_user["id"],
    )
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"success": True, "assignment": assignment}


# ============================================
# BULK OPERATIONS (Admin only)
# ============================================

@router.post("/bulk-assign")
async def bulk_assign(
    request: BulkAssignmentRequest,
    current_user: dict = Depends(get_admin_user),
):
    """
    Bulk assign at section/topic/principle/category level (Admin only).
    
    Creates assignments that cover all entities under the specified level.
    """
    result = await assignment_service.bulk_assign(
        organization_id=current_user["organization_id"],
        request=request,
        assigned_by_user_id=current_user["id"],
    )
    
    return {"success": True, **result}


@router.delete("/bulk-assign/{group_assignment_id}")
async def delete_bulk_assignment(
    group_assignment_id: str,
    current_user: dict = Depends(get_admin_user),
):
    """Delete all assignments in a bulk assignment group (Admin only)."""
    deleted_count = await assignment_service.delete_bulk_assignment(
        group_assignment_id=group_assignment_id,
        organization_id=current_user["organization_id"],
        deleted_by_user_id=current_user["id"],
    )
    
    return {"success": True, "deleted_count": deleted_count}


# ============================================
# USER ENDPOINTS - My Assignments
# ============================================

@router.get("/my-assignments")
async def get_my_assignments(
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get current user's assignments.
    
    Returns assignments grouped by questions and records,
    with counts for overdue, pending, and in-progress items.
    """
    result = await assignment_service.get_user_assignments(
        user_id=current_user["id"],
        organization_id=current_user["organization_id"],
        reporting_period=reporting_period,
    )
    
    return result


@router.get("/my-accessible-questions")
async def get_my_accessible_questions(
    reporting_period: str,
    section: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get list of question_keys the current user can access.
    
    Returns empty list for admins (signaling full access).
    Returns specific question_keys for regular users.
    """
    accessible = await access_control_service.get_accessible_questions(
        user_id=current_user["id"],
        organization_id=current_user["organization_id"],
        reporting_period=reporting_period,
        section=section,
    )
    
    is_admin = await access_control_service.is_admin(
        current_user["id"],
        current_user["organization_id"]
    )
    
    return {
        "is_admin": is_admin,
        "accessible_questions": accessible,
        "has_full_access": is_admin or len(accessible) == 0,
    }


@router.get("/my-accessible-records")
async def get_my_accessible_records(
    reporting_period: str,
    facility_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get list of record categories the current user can access.
    
    Returns empty list for admins (signaling full access).
    """
    accessible = await access_control_service.get_accessible_record_categories(
        user_id=current_user["id"],
        organization_id=current_user["organization_id"],
        reporting_period=reporting_period,
        facility_id=facility_id,
    )
    
    is_admin = await access_control_service.is_admin(
        current_user["id"],
        current_user["organization_id"]
    )
    
    return {
        "is_admin": is_admin,
        "accessible_categories": accessible,
        "has_full_access": is_admin or len(accessible) == 0,
    }


# ============================================
# HISTORY ENDPOINTS
# ============================================

@router.get("/assignments/{assignment_id}/history")
async def get_assignment_history(
    assignment_id: str,
    current_user: dict = Depends(get_admin_user),
):
    """Get assignment history (Admin only)."""
    history = await assignment_service.get_assignment_history(
        assignment_id=assignment_id,
        organization_id=current_user["organization_id"],
    )
    
    return {"history": history}


@router.get("/response-versions/{question_key}")
async def get_response_versions(
    question_key: str,
    reporting_period: str,
    current_user: dict = Depends(get_current_user),
):
    """
    DEPRECATED: Use /api/esg-questionnaire/history/{question_key} instead.
    This endpoint is kept for backwards compatibility but returns empty.
    """
    return {"versions": [], "deprecated": True, "use": "/api/esg-questionnaire/history/{question_key}"}


# ============================================
# REMINDER ENDPOINTS (Admin only)
# ============================================

@router.post("/assignments/{assignment_id}/remind")
async def send_assignment_reminder(
    assignment_id: str,
    current_user: dict = Depends(get_admin_user),
):
    """
    Send a reminder email for a specific assignment (Admin only).
    
    Sends an email to the assigned user reminding them about the pending task.
    """
    result = await assignment_service.send_reminder_for_assignment(
        assignment_id=assignment_id,
        organization_id=current_user["organization_id"],
        sent_by_user_id=current_user["id"],
    )
    return result


@router.post("/reminders/process")
async def process_reminders(
    current_user: dict = Depends(get_admin_user),
):
    """
    Manually trigger reminder processing (Admin only).
    
    Normally run as a background job, but can be triggered manually.
    """
    result = await reminder_scheduler.process_due_reminders()
    return result


@router.get("/overdue")
async def get_overdue_assignments(
    current_user: dict = Depends(get_admin_user),
):
    """Get all overdue assignments (Admin only)."""
    overdue = await reminder_scheduler.get_overdue_assignments(
        organization_id=current_user["organization_id"],
    )
    
    return {"overdue": overdue, "count": len(overdue)}


@router.get("/upcoming-deadlines")
async def get_upcoming_deadlines(
    days_ahead: int = Query(7, ge=1, le=30),
    current_user: dict = Depends(get_admin_user),
):
    """Get assignments with upcoming deadlines (Admin only)."""
    upcoming = await reminder_scheduler.get_upcoming_deadlines(
        organization_id=current_user["organization_id"],
        days_ahead=days_ahead,
    )
    
    return {"upcoming": upcoming, "count": len(upcoming)}


@router.post("/reminders/send-overdue-notifications")
async def send_overdue_notifications(
    current_user: dict = Depends(get_admin_user),
):
    """
    Send overdue summary emails to all users with overdue assignments (Admin only).
    
    Groups overdue assignments by user and sends one summary email per user.
    """
    result = await reminder_scheduler.process_overdue_notifications()
    return result


# ============================================
# ENTITY LOOKUP ENDPOINT
# ============================================

@router.get("/entity-assignment")
async def get_entity_assignment(
    entity_type: EntityType,
    entity_id: str,
    reporting_period: str,
    facility_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get the assignment for a specific entity.
    
    Useful for showing assignment info on question/record cards.
    """
    assignment = await assignment_service.get_assignment_for_entity(
        organization_id=current_user["organization_id"],
        entity_type=entity_type,
        entity_id=entity_id,
        reporting_period=reporting_period,
        facility_id=facility_id,
    )
    
    return {"assignment": assignment}



# ============================================
# KPI ACCESS ENDPOINTS
# ============================================

@router.get("/kpi-access/ghg")
async def get_ghg_access(
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get user's GHG emissions access based on their KPI assignments.
    
    Returns allowed scopes, facility restrictions, and sinks access.
    Used by frontend to filter UI elements.
    """
    from .kpi_access_helper import kpi_access_helper
    
    access_info = await kpi_access_helper.get_allowed_ghg_scopes(
        user_id=current_user["id"],
        organization_id=current_user["organization_id"],
        reporting_period=reporting_period,
    )
    
    return access_info


@router.get("/kpi-access/facilities")
async def get_facility_access(
    category: str,
    subcategory: Optional[str] = None,
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get user's facility access for a specific KPI category.
    
    Returns allowed facility IDs or indicates full access.
    """
    from .kpi_access_helper import kpi_access_helper
    
    access_info = await kpi_access_helper.get_allowed_facilities(
        user_id=current_user["id"],
        organization_id=current_user["organization_id"],
        category=category,
        subcategory=subcategory,
        reporting_period=reporting_period,
    )
    
    return access_info


@router.get("/kpi-access/facilities/list")
async def get_accessible_facilities(
    category: str,
    subcategory: Optional[str] = None,
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get the actual facility documents user can access for a category.
    
    Returns list of facility objects with id, name, etc.
    """
    from .kpi_access_helper import kpi_access_helper
    
    facilities = await kpi_access_helper.get_accessible_facilities_list(
        user_id=current_user["id"],
        organization_id=current_user["organization_id"],
        category=category,
        subcategory=subcategory,
        reporting_period=reporting_period,
    )
    
    return {"facilities": facilities, "total": len(facilities)}


# ============================================
# COMPLETION TRACKING ENDPOINTS
# ============================================

@router.get("/assignments/{assignment_id}/progress")
async def get_assignment_progress(
    assignment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed progress information for an assignment.
    
    For organization-level assignments, shows per-facility completion status.
    """
    from .completion_tracking import completion_tracking_service
    
    progress = await completion_tracking_service.get_assignment_progress(
        assignment_id=assignment_id,
    )
    
    return progress


@router.post("/assignments/check-completion")
async def check_and_update_completion(
    category: str,
    subcategory: Optional[str] = None,
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_admin_user),
):
    """
    Manually trigger completion check for assignments (Admin only).
    
    Normally this is called automatically when records are submitted.
    """
    from .completion_tracking import completion_tracking_service
    
    result = await completion_tracking_service.check_and_update_completion(
        organization_id=current_user["organization_id"],
        category=category,
        subcategory=subcategory,
        facility_id=facility_id,
        reporting_period=reporting_period,
    )
    
    return result
