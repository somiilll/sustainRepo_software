"""
ESG Tracking Models

Pydantic models for tracking responses and requests.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class TrackingDomain(str, Enum):
    """ESG domains for tracking"""
    ENVIRONMENT = "environment"
    SOCIAL = "social"
    GOVERNANCE = "governance"


class CompletionStatus(str, Enum):
    """Disclosure completion status"""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    STALE = "stale"  # Completed but data is old


class FrameworkSummary(BaseModel):
    """Summary of a framework's tracking status"""
    framework_id: str
    framework_name: str
    domain: str
    total_disclosures: int
    completed_disclosures: int
    pending_disclosures: int
    assigned_disclosures: int
    unassigned_disclosures: int
    overdue_count: int
    stale_count: int
    completion_percentage: float
    last_updated: Optional[datetime] = None
    enabled: bool = True


class SectionSummary(BaseModel):
    """Summary of a section within a framework"""
    section_id: str
    section_name: str
    framework_id: str
    total_disclosures: int
    completed_disclosures: int
    pending_disclosures: int
    assigned_count: int
    unassigned_count: int
    overdue_count: int
    due_soon_count: int  # Due within 7 days
    stale_count: int
    completion_percentage: float
    assigned_users: List[Dict[str, Any]] = Field(default_factory=list)
    last_updated: Optional[datetime] = None


class DisclosureTrackingItem(BaseModel):
    """Individual disclosure/KPI tracking item"""
    disclosure_id: str  # question_key or record category
    disclosure_name: str
    disclosure_type: str  # question, kpi, record
    section_id: str
    section_name: str
    framework_id: str
    
    # Completion status
    is_completed: bool = False
    completion_status: CompletionStatus = CompletionStatus.NOT_STARTED
    response_data: Optional[Dict[str, Any]] = None
    last_response_updated_at: Optional[datetime] = None
    
    # Assignment info
    is_assigned: bool = False
    assigned_to_user_id: Optional[str] = None
    assigned_to_user_name: Optional[str] = None
    assigned_to_user_email: Optional[str] = None
    assigned_by_user_id: Optional[str] = None
    assigned_by_user_name: Optional[str] = None
    assignment_id: Optional[str] = None
    assignment_role: Optional[str] = None
    
    # Due date & reminders
    due_date: Optional[datetime] = None
    is_overdue: bool = False
    is_due_soon: bool = False  # Within 7 days
    days_until_due: Optional[int] = None
    last_reminder_sent_at: Optional[datetime] = None
    
    # Stale detection
    is_stale: bool = False
    days_since_update: Optional[int] = None
    
    # Approval status (if applicable)
    requires_approval: bool = False
    approval_status: Optional[str] = None
    
    # Filling frequency
    filling_frequency: Optional[str] = None


class TrackingFilter(BaseModel):
    """Filters for tracking queries"""
    framework_id: Optional[str] = None
    section_id: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    status: Optional[str] = None  # completed, pending, in_progress
    is_overdue: Optional[bool] = None
    is_unassigned: Optional[bool] = None
    is_stale: Optional[bool] = None
    is_due_soon: Optional[bool] = None  # Due within 7 days


class BulkAssignRequest(BaseModel):
    """Request for bulk assigning disclosures"""
    framework_id: str
    section_id: Optional[str] = None  # If None, assign all in framework
    disclosure_ids: Optional[List[str]] = None  # If None, assign all unassigned
    assigned_to_user_id: str
    role: str = "owner"
    due_date: Optional[datetime] = None
    filling_frequency: Optional[str] = None
    reminder_enabled: bool = False
    reminder_frequency: Optional[str] = None  # daily, weekly, monthly, etc.
    reminder_config: Optional[Dict[str, Any]] = None
    requires_approval: bool = False
    # Multi-level approval chain (list of user IDs in order)
    # e.g., ["manager_id", "director_id", "vp_id"] for 3-level approval
    approval_chain: Optional[List[str]] = None  # Ordered list of approver user IDs
    skip_already_assigned: bool = True  # Don't overwrite existing assignments


class SendReminderRequest(BaseModel):
    """Request to send reminder for a disclosure"""
    disclosure_id: str
    message: Optional[str] = None  # Custom message


class TrackingSummaryResponse(BaseModel):
    """Response for tracking summary endpoint"""
    domain: str
    reporting_period: str
    frameworks: List[FrameworkSummary]
    total_disclosures: int
    total_completed: int
    total_pending: int
    total_overdue: int
    total_stale: int
    overall_completion_percentage: float


class SectionDetailResponse(BaseModel):
    """Response for section detail endpoint"""
    section: SectionSummary
    disclosures: List[DisclosureTrackingItem]
    filters_applied: Dict[str, Any] = Field(default_factory=dict)
