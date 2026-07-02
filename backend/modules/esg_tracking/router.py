"""
ESG Tracking API Router

Provides endpoints for ESG workflow tracking, assignments,
completion monitoring, and disclosure ownership management.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime

from modules.auth.dependencies import get_current_user, get_admin_user
from .service import tracking_service
from .models import (
    TrackingDomain,
    TrackingFilter,
    BulkAssignRequest,
    SendReminderRequest,
    TrackingSummaryResponse,
    SectionDetailResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tracking", tags=["ESG Tracking"])


# =============================================================================
# FRAMEWORK-LEVEL ENDPOINTS
# =============================================================================

@router.get("/{domain}/frameworks")
async def get_frameworks_summary(
    domain: TrackingDomain,
    reporting_period: str = Query(..., description="Reporting period (e.g., 'FY 2025-2026')"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Get summary of all enabled frameworks for a domain.
    
    Returns completion %, assignment status, and overdue counts per framework.
    Admin only.
    """
    summaries = await tracking_service.get_frameworks_summary(
        organization_id=current_user["organization_id"],
        domain=domain,
        reporting_period=reporting_period,
    )
    
    # Calculate totals
    total_disclosures = sum(s.total_disclosures for s in summaries)
    total_completed = sum(s.completed_disclosures for s in summaries)
    total_pending = sum(s.pending_disclosures for s in summaries)
    total_overdue = sum(s.overdue_count for s in summaries)
    total_stale = sum(s.stale_count for s in summaries)
    overall_pct = (total_completed / total_disclosures * 100) if total_disclosures > 0 else 0
    
    return TrackingSummaryResponse(
        domain=domain.value,
        reporting_period=reporting_period,
        frameworks=[s.dict() for s in summaries],
        total_disclosures=total_disclosures,
        total_completed=total_completed,
        total_pending=total_pending,
        total_overdue=total_overdue,
        total_stale=total_stale,
        overall_completion_percentage=round(overall_pct, 1),
    )


@router.get("/{domain}/frameworks/{framework_id}/sections")
async def get_framework_sections(
    domain: TrackingDomain,
    framework_id: str,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Get all sections within a framework with their tracking status.
    
    Admin only.
    """
    sections = await tracking_service.get_framework_sections(
        organization_id=current_user["organization_id"],
        domain=domain,
        framework_id=framework_id,
        reporting_period=reporting_period,
    )
    
    return {
        "framework_id": framework_id,
        "domain": domain.value,
        "reporting_period": reporting_period,
        "sections": [s.dict() for s in sections],
        "total_sections": len(sections),
    }


# =============================================================================
# SECTION-LEVEL ENDPOINTS
# =============================================================================

@router.get("/{domain}/frameworks/{framework_id}/sections/{section_id}")
async def get_section_disclosures(
    domain: TrackingDomain,
    framework_id: str,
    section_id: str,
    reporting_period: str = Query(..., description="Reporting period"),
    assigned_to_user_id: Optional[str] = Query(None, description="Filter by assigned user"),
    status: Optional[str] = Query(None, description="Filter by status: completed, pending"),
    is_overdue: Optional[bool] = Query(None, description="Filter overdue items"),
    is_unassigned: Optional[bool] = Query(None, description="Filter unassigned items"),
    is_stale: Optional[bool] = Query(None, description="Filter stale items"),
    is_due_soon: Optional[bool] = Query(None, description="Filter items due within 7 days"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Get all disclosures within a section with full tracking details.
    
    Admin only.
    """
    filters = TrackingFilter(
        assigned_to_user_id=assigned_to_user_id,
        status=status,
        is_overdue=is_overdue,
        is_unassigned=is_unassigned,
        is_stale=is_stale,
        is_due_soon=is_due_soon,
    )
    
    section_summary, disclosures = await tracking_service.get_section_disclosures(
        organization_id=current_user["organization_id"],
        domain=domain,
        framework_id=framework_id,
        section_id=section_id,
        reporting_period=reporting_period,
        filters=filters,
    )
    
    return SectionDetailResponse(
        section=section_summary,
        disclosures=disclosures,
        filters_applied={
            "assigned_to_user_id": assigned_to_user_id,
            "status": status,
            "is_overdue": is_overdue,
            "is_unassigned": is_unassigned,
            "is_stale": is_stale,
            "is_due_soon": is_due_soon,
        },
    )


# =============================================================================
# ASSIGNMENT ENDPOINTS
# =============================================================================

@router.post("/{domain}/assign")
async def assign_disclosures(
    domain: TrackingDomain,
    request: BulkAssignRequest,
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Assign disclosures to a user.
    
    Can assign:
    - All disclosures in a framework
    - All disclosures in a section
    - Specific disclosure IDs
    
    Admin only.
    """
    result = await tracking_service.bulk_assign_disclosures(
        organization_id=current_user["organization_id"],
        request=request,
        assigned_by_user_id=current_user["id"],
        domain=domain,
        reporting_period=reporting_period,
    )
    
    return result


@router.post("/{domain}/reassign")
async def reassign_disclosure(
    domain: TrackingDomain,
    disclosure_id: str = Query(..., description="Disclosure ID to reassign"),
    new_user_id: str = Query(..., description="New user ID"),
    reason: Optional[str] = Query(None, description="Reason for reassignment"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Reassign a disclosure to a different user.
    
    Does not affect existing response data.
    Admin only.
    """
    result = await tracking_service.reassign_disclosure(
        organization_id=current_user["organization_id"],
        disclosure_id=disclosure_id,
        new_user_id=new_user_id,
        reassigned_by_user_id=current_user["id"],
        reason=reason,
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Reassignment failed"))
    
    return result


# =============================================================================
# REMINDER ENDPOINTS
# =============================================================================

@router.post("/{domain}/send-reminder")
async def send_reminder(
    domain: TrackingDomain,
    request: SendReminderRequest,
    current_user: dict = Depends(get_admin_user),
):
    """
    Send an immediate reminder for a disclosure.
    
    Sends email to assigned user and logs the reminder event.
    Admin only.
    """
    result = await tracking_service.send_reminder(
        organization_id=current_user["organization_id"],
        disclosure_id=request.disclosure_id,
        sent_by_user_id=current_user["id"],
        custom_message=request.message,
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to send reminder"))
    
    return result


# =============================================================================
# AGGREGATE QUERY ENDPOINTS
# =============================================================================

@router.get("/{domain}/overdue")
async def get_overdue_disclosures(
    domain: TrackingDomain,
    reporting_period: Optional[str] = Query(None, description="Filter by reporting period"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Get all overdue disclosures for a domain.
    
    Admin only.
    """
    items = await tracking_service.get_overdue_disclosures(
        organization_id=current_user["organization_id"],
        domain=domain,
        reporting_period=reporting_period,
    )
    
    return {
        "domain": domain.value,
        "overdue_count": len(items),
        "disclosures": [item.dict() for item in items],
    }


@router.get("/{domain}/unassigned")
async def get_unassigned_disclosures(
    domain: TrackingDomain,
    framework_id: str = Query(..., description="Framework ID"),
    reporting_period: str = Query(..., description="Reporting period"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Get all unassigned disclosures for a framework.
    
    Admin only.
    """
    items = await tracking_service.get_unassigned_disclosures(
        organization_id=current_user["organization_id"],
        domain=domain,
        framework_id=framework_id,
        reporting_period=reporting_period,
    )
    
    return {
        "domain": domain.value,
        "framework_id": framework_id,
        "unassigned_count": len(items),
        "disclosures": [item.dict() for item in items],
    }


@router.get("/{domain}/stale")
async def get_stale_disclosures(
    domain: TrackingDomain,
    threshold_days: int = Query(90, description="Days since last update to consider stale"),
    current_user: dict = Depends(get_admin_user),
):
    """
    Get all stale (old) completed disclosures for a domain.
    
    Admin only.
    """
    items = await tracking_service.get_stale_disclosures(
        organization_id=current_user["organization_id"],
        domain=domain,
        threshold_days=threshold_days,
    )
    
    return {
        "domain": domain.value,
        "threshold_days": threshold_days,
        "stale_count": len(items),
        "disclosures": [item.dict() for item in items],
    }


# =============================================================================
# USER ENDPOINTS (for regular users)
# =============================================================================

@router.get("/my-disclosures")
async def get_my_disclosures(
    reporting_period: str = Query(..., description="Reporting period"),
    domain: Optional[TrackingDomain] = Query(None, description="Filter by domain"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get disclosures assigned to the current user.
    
    Available to all users.
    """
    from modules.esg_assignments.service import assignment_service
    
    result = await assignment_service.get_user_assignments(
        user_id=current_user["id"],
        organization_id=current_user["organization_id"],
        reporting_period=reporting_period,
    )
    
    return result


# =============================================================================
# UTILITY ENDPOINTS
# =============================================================================

@router.get("/users")
async def get_organization_users(
    current_user: dict = Depends(get_admin_user),
):
    """
    Get all users in the organization for assignment dropdowns.
    
    Admin only.
    """
    from shared.database.mongo import db
    
    # Query users collection (all active organization users)
    users = await db.users.find(
        {
            "organization_id": current_user["organization_id"],
            "is_deleted": {"$ne": True},  # Exclude soft-deleted users
        },
        {"_id": 0, "id": 1, "name": 1, "full_name": 1, "email": 1, "role": 1}
    ).to_list(500)
    
    return {
        "users": [
            {
                "id": u["id"],
                "name": u.get("full_name") or u.get("name") or u.get("email", "").split("@")[0],
                "email": u.get("email"),
                "role": u.get("role"),
            }
            for u in users
        ]
    }
