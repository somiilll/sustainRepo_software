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
from shared.database.mongo import db
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
    """
    Delete an assignment (Admin only).
    
    TASK LIFECYCLE: ACTIVE -> CANCELLED -> ARCHIVED
    
    Instead of hard-deleting tasks, this endpoint transitions them through a lifecycle:
    - Tasks with no data are marked as CANCELLED
    - Tasks with data are marked as ORPHANED (remain visible for audit)
    
    Returns details about tasks affected for transparency.
    """
    result = await assignment_service.delete_assignment(
        assignment_id=assignment_id,
        organization_id=current_user["organization_id"],
        deleted_by_user_id=current_user["id"],
    )
    
    if not result.get("deleted"):
        raise HTTPException(status_code=404, detail=result.get("error", "Assignment not found"))
    
    return {
        "success": True,
        "tasks_cancelled": result.get("tasks_cancelled", 0),
        "tasks_with_data_orphaned": result.get("tasks_with_data_orphaned", 0),
        "approval_requests_cancelled": result.get("approval_requests_cancelled", 0),
        "message": result.get("message"),
    }


@router.post("/assignments/{assignment_id}/retry-tasks")
async def retry_task_generation(
    assignment_id: str,
    current_user: dict = Depends(get_admin_user),
):
    """
    Retry task generation for an assignment that previously failed.
    
    Useful when task generation fails during assignment creation and 
    assignment is marked with task_generation_pending=True.
    """
    from modules.esg_assignments.assignment_service_v2 import assignment_service_v2
    
    assignment = await assignment_service_v2.get_assignment(assignment_id)
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    if assignment.get("organization_id") != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        from modules.esg_records.task_engine import generate_tasks_for_assignment
        from shared.database.mongo import db
        
        result = await generate_tasks_for_assignment(db, assignment)
        
        # Clear the pending flag
        await db.esg_assignments.update_one(
            {"id": assignment_id},
            {"$unset": {"task_generation_pending": "", "task_generation_error": ""}}
        )
        
        return {
            "success": True,
            "message": "Tasks generated successfully",
            "tasks_created": result.get("created", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Task generation failed: {str(e)}")



@router.get("/audit/cancelled-tasks")
async def get_cancelled_tasks(
    lifecycle_status: str = Query("cancelled", description="Filter by lifecycle status: cancelled, orphaned, archived", pattern="^(cancelled|orphaned|archived)$"),
    category: Optional[str] = Query(None, description="Filter by category"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_admin_user),
):
    """
    Get cancelled/orphaned/archived tasks for audit purposes (Admin only).
    
    TASK LIFECYCLE:
    - CANCELLED: Assignment was deleted, task had no data
    - ORPHANED: Assignment was deleted, but task had data (preserved for audit)
    - ARCHIVED: Old cancelled tasks that have been archived after retention period
    
    Use this endpoint to see audit trail of tasks that were removed when
    assignments were deleted.
    """
    # Validate lifecycle_status (extra safeguard beyond regex pattern)
    valid_statuses = {"cancelled", "orphaned", "archived"}
    if lifecycle_status not in valid_statuses:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid lifecycle_status. Must be one of: {', '.join(valid_statuses)}"
        )
    
    org_id = current_user["organization_id"]
    
    query = {
        "organization_id": org_id,
        "lifecycle_status": lifecycle_status,
    }
    
    if category:
        query["category"] = category
    
    # Get total count
    total = await db.esg_reporting_tasks.count_documents(query)
    
    # Get paginated results
    skip = (page - 1) * page_size
    tasks = await db.esg_reporting_tasks.find(
        query,
        {"_id": 0}
    ).sort("cancelled_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    return {
        "tasks": tasks,
        "total": total,
        "page": page,
        "page_size": page_size,
        "lifecycle_status": lifecycle_status,
    }




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
async def get_assignment_progress_detailed(
    assignment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed progress information for an assignment.
    Uses CompletionService as single source of truth.
    """
    from .completion_service import completion_service
    from shared.database.mongo import db
    
    assignment = await db.esg_assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    progress = await completion_service.get_assignment_progress(assignment, include_period_details=True)
    return progress.to_dict()


@router.post("/assignments/check-completion")
async def check_and_update_completion(
    category: str,
    subcategory: Optional[str] = None,
    facility_id: Optional[str] = None,
    reporting_period: Optional[str] = None,
    current_user: dict = Depends(get_admin_user),
):
    """
    DEPRECATED: Completion is now computed on-the-fly by CompletionService.
    This endpoint is kept for backward compatibility but does nothing.
    """
    return {"message": "Completion is now computed on-the-fly. No manual check needed."}



# ============================================
# PROGRESS CALCULATION ENDPOINTS
# ============================================

@router.get("/progress/{assignment_id}")
async def get_assignment_progress_summary(
    assignment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get progress summary for a single assignment.
    Uses CompletionService as single source of truth.
    
    Returns:
        {
            "percentage": float,
            "completed": int,
            "total": int,
            "pending": int,
            "overdue": int,
            "last_updated": str (ISO datetime)
        }
    """
    from .completion_service import completion_service
    from shared.database.mongo import db
    
    assignment = await db.esg_assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    progress = await completion_service.get_assignment_progress(assignment)
    return progress.to_dict()


@router.get("/progress/category/{category}")
async def get_category_progress_endpoint(
    category: str,
    subcategory: Optional[str] = None,
    sub_subcategory: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get aggregated progress for a category.
    Uses CompletionService as single source of truth.
    """
    from .completion_service import completion_service
    from shared.database.mongo import db
    
    # Find all assignments for this category
    query = {
        "organization_id": current_user["organization_id"],
        "category": category,
    }
    if subcategory:
        query["subcategory"] = subcategory
    if sub_subcategory:
        query["sub_subcategory"] = sub_subcategory
    
    assignments = await db.esg_assignments.find(query, {"_id": 0}).to_list(500)
    
    if not assignments:
        return {"total": 0, "completed": 0, "pending": 0, "overdue": 0, "percentage": 0.0}
    
    # Aggregate progress from all assignments
    total = 0
    completed = 0
    pending = 0
    overdue = 0
    last_updated = None
    
    for assignment in assignments:
        progress = await completion_service.get_assignment_progress(assignment)
        total += progress.total
        completed += progress.completed
        pending += progress.pending
        overdue += progress.overdue
        if progress.last_updated and (not last_updated or progress.last_updated > last_updated):
            last_updated = progress.last_updated
    
    percentage = round((completed / total) * 100, 1) if total > 0 else 0.0
    
    return {
        "total": total,
        "total_tasks": total,
        "completed": completed,
        "completed_tasks": completed,
        "filled": completed,
        "pending": pending,
        "pending_tasks": pending,
        "overdue": overdue,
        "overdue_tasks": overdue,
        "percentage": percentage,
        "progress_percentage": percentage,
        "last_updated": last_updated.isoformat() if isinstance(last_updated, datetime) else str(last_updated) if last_updated else None,
    }


@router.post("/progress/bulk")
async def get_bulk_progress_endpoint(
    categories: List[dict],
    current_user: dict = Depends(get_current_user),
):
    """
    Get progress for multiple categories in bulk.
    Uses CompletionService as single source of truth.
    
    Request body:
        [
            {"category": "Energy", "subcategory": "Consumption"},
            {"category": "Water"},
            ...
        ]
    
    Returns dict keyed by "category|subcategory|sub_subcategory"
    """
    from .completion_service import completion_service
    from shared.database.mongo import db
    
    org_id = current_user["organization_id"]
    result = {}
    
    for cat_info in categories:
        category = cat_info.get("category", "")
        subcategory = cat_info.get("subcategory")
        sub_subcategory = cat_info.get("sub_subcategory")
        
        key = "|".join(filter(None, [category, subcategory, sub_subcategory]))
        
        # Find assignments for this category
        query = {"organization_id": org_id, "category": category}
        if subcategory:
            query["subcategory"] = subcategory
        if sub_subcategory:
            query["sub_subcategory"] = sub_subcategory
        
        assignments = await db.esg_assignments.find(query, {"_id": 0}).to_list(500)
        
        if not assignments:
            result[key] = {"total": 0, "completed": 0, "filled": 0, "pending": 0, "overdue": 0, "percentage": 0.0}
            continue
        
        # Aggregate
        total = completed = pending = overdue = 0
        last_updated = None
        
        for assignment in assignments:
            progress = await completion_service.get_assignment_progress(assignment)
            total += progress.total
            completed += progress.completed
            pending += progress.pending
            overdue += progress.overdue
            if progress.last_updated and (not last_updated or progress.last_updated > last_updated):
                last_updated = progress.last_updated
        
        result[key] = {
            "total": total,
            "total_tasks": total,
            "completed": completed,
            "completed_tasks": completed,
            "filled": completed,
            "pending": pending,
            "pending_tasks": pending,
            "overdue": overdue,
            "overdue_tasks": overdue,
            "percentage": round((completed / total) * 100, 1) if total > 0 else 0.0,
            "progress_percentage": round((completed / total) * 100, 1) if total > 0 else 0.0,
            "last_updated": last_updated.isoformat() if isinstance(last_updated, datetime) else str(last_updated) if last_updated else None,
        }
    
    return result



# ============================================
# ADMIN UTILITY ENDPOINTS
# ============================================

@router.post("/admin/sync-task-assignees")
async def sync_task_assignees(
    current_user: dict = Depends(get_admin_user),
):
    """
    Sync task assignees with assignment assignees (Admin only).
    
    This fixes data consistency issues where:
    1. Users were removed from assignments but their task assignees weren't deactivated
    2. Users were added to assignments but their task assignees weren't created
    
    Useful for fixing existing data after the assignee sync feature was added.
    """
    from .assignees_service import assignment_assignees_service
    
    result = await assignment_assignees_service.sync_task_assignees_with_assignment_assignees(
        organization_id=current_user["organization_id"]
    )
    
    return {
        "success": True,
        "message": "Task assignees synced with assignment assignees",
        **result
    }
