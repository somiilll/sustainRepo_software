"""
Pydantic models for ESG Assignments
"""

from typing import Optional, List, Literal
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


# ============================================
# ENUMS
# ============================================

class EntityType(str, Enum):
    QUESTION = "question"
    RECORD = "record"


class AssignmentLevel(str, Enum):
    # For Questions
    SECTION = "section"           # e.g., "environment", "social", "governance"
    TOPIC = "topic"               # e.g., "Assurance", "Resource Usage"
    PRINCIPLE = "principle"       # e.g., "P1", "P6"
    QUESTION = "question"         # e.g., "env_assurance_energy"
    
    # For Records
    CATEGORY = "category"         # e.g., "Energy", "Water"
    SUBCATEGORY = "subcategory"   # e.g., "Electricity", "Diesel"
    RECORD_TYPE = "record_type"   # Specific record type


class AssignmentRole(str, Enum):
    OWNER = "owner"
    EDITOR = "editor"
    REVIEWER = "reviewer"
    APPROVER = "approver"
    VIEWER = "viewer"


class AssignmentStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    REVIEWED = "reviewed"
    APPROVED = "approved"


class FillingFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    HALF_YEARLY = "half_yearly"
    YEARLY = "yearly"
    EVENT_BASED = "event_based"
    ONE_TIME = "one_time"


class ReminderFrequency(str, Enum):
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class HistoryAction(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    REASSIGNED = "reassigned"
    STATUS_CHANGED = "status_changed"
    ROLE_CHANGED = "role_changed"
    DELETED = "deleted"


class ResponseChangeType(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"


# ============================================
# REQUEST MODELS
# ============================================

class CreateAssignmentRequest(BaseModel):
    """Request model for creating an assignment"""
    entity_type: EntityType
    assignment_level: AssignmentLevel
    entity_id: str  # section name, topic name, principle, question_key, category_id, etc.
    facility_id: Optional[str] = None  # For record assignments
    reporting_period: str  # "FY 2025-2026"
    assigned_to_user_id: str
    role: AssignmentRole = AssignmentRole.OWNER
    status: AssignmentStatus = AssignmentStatus.PENDING
    due_date: Optional[datetime] = None
    
    # Framework context
    framework_id: Optional[str] = None  # "brsr", "gri", "csrd", etc.
    
    # Approval configuration (only works if org-level approval enabled)
    requires_approval: bool = False
    
    # Filling frequency
    filling_frequency: Optional[FillingFrequency] = None
    filling_due_day: Optional[int] = None  # Day of month/quarter when filling is due
    
    # Reminder settings (enhanced)
    reminder_enabled: bool = False
    reminder_frequency: Optional[ReminderFrequency] = None
    reminder_start_before_days: Optional[int] = None  # Start reminding X days before due
    reminder_recipients: Optional[List[str]] = None  # Additional user IDs
    reminder_config: Optional[dict] = None  # {"frequency": "daily", "days_before_due": [7,3,1], "repeat_overdue": true}
    
    # Metadata for extensibility
    metadata: Optional[dict] = None


class UpdateAssignmentRequest(BaseModel):
    """Request model for updating an assignment"""
    assigned_to_user_id: Optional[str] = None
    role: Optional[AssignmentRole] = None
    status: Optional[AssignmentStatus] = None
    due_date: Optional[datetime] = None
    framework_id: Optional[str] = None
    requires_approval: Optional[bool] = None
    filling_frequency: Optional[FillingFrequency] = None
    filling_due_day: Optional[int] = None
    reminder_enabled: Optional[bool] = None
    reminder_frequency: Optional[ReminderFrequency] = None
    reminder_start_before_days: Optional[int] = None
    reminder_recipients: Optional[List[str]] = None
    reminder_config: Optional[dict] = None
    metadata: Optional[dict] = None


class BulkAssignmentRequest(BaseModel):
    """Request model for bulk assignment (e.g., assign all P6 questions)"""
    entity_type: EntityType
    assignment_level: AssignmentLevel
    entity_id: str
    facility_id: Optional[str] = None
    reporting_period: str
    assigned_to_user_id: str
    role: AssignmentRole = AssignmentRole.OWNER
    filling_frequency: Optional[FillingFrequency] = None
    reminder_enabled: bool = False
    reminder_frequency: Optional[ReminderFrequency] = None


class ReassignRequest(BaseModel):
    """Request model for reassigning to a different user"""
    new_user_id: str
    reason: Optional[str] = None


# ============================================
# RESPONSE MODELS
# ============================================

class AssignmentResponse(BaseModel):
    """Response model for an assignment"""
    id: str
    organization_id: str
    entity_type: EntityType
    assignment_level: AssignmentLevel
    entity_id: str
    facility_id: Optional[str] = None
    reporting_period: str
    assigned_to_user_id: str
    assigned_to_user_name: Optional[str] = None  # Populated on fetch
    assigned_by_user_id: str
    assigned_by_user_name: Optional[str] = None  # Populated on fetch
    role: AssignmentRole
    status: AssignmentStatus
    due_date: Optional[datetime] = None
    
    # Framework context
    framework_id: Optional[str] = None
    
    # Approval configuration
    requires_approval: bool = False
    
    # Filling frequency
    filling_frequency: Optional[FillingFrequency] = None
    filling_due_day: Optional[int] = None
    
    # Reminder settings
    reminder_enabled: bool = False
    reminder_frequency: Optional[ReminderFrequency] = None
    reminder_start_before_days: Optional[int] = None
    reminder_recipients: Optional[List[str]] = None
    reminder_config: Optional[dict] = None
    last_reminder_sent_at: Optional[datetime] = None
    next_reminder_at: Optional[datetime] = None
    
    # Group assignment
    group_assignment_id: Optional[str] = None
    
    # Metadata
    metadata: Optional[dict] = None
    
    created_at: datetime
    updated_at: datetime


class AssignmentHistoryResponse(BaseModel):
    """Response model for assignment history entry"""
    id: str
    assignment_id: str
    action: HistoryAction
    previous_value: Optional[dict] = None
    new_value: Optional[dict] = None
    changed_by_user_id: str
    changed_by_user_name: Optional[str] = None
    reason: Optional[str] = None
    created_at: datetime


class ResponseVersionResponse(BaseModel):
    """Response model for question response version"""
    id: str
    organization_id: str
    question_key: str
    reporting_period: str
    version_number: int
    previous_value: Optional[dict] = None
    new_value: Optional[dict] = None
    changed_by_user_id: str
    changed_by_user_name: Optional[str] = None
    change_type: ResponseChangeType
    created_at: datetime


class AssignmentListResponse(BaseModel):
    """Response model for listing assignments"""
    assignments: List[AssignmentResponse]
    total: int
    page: int
    page_size: int


class MyAssignmentsResponse(BaseModel):
    """Response model for user's assignments grouped by type"""
    questions: List[AssignmentResponse]
    records: List[AssignmentResponse]
    total_questions: int
    total_records: int
    overdue_count: int
    pending_count: int
    in_progress_count: int


# ============================================
# FILTER MODELS
# ============================================

class AssignmentFilter(BaseModel):
    """Filter model for querying assignments"""
    entity_type: Optional[EntityType] = None
    assignment_level: Optional[AssignmentLevel] = None
    entity_id: Optional[str] = None
    facility_id: Optional[str] = None
    reporting_period: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    role: Optional[AssignmentRole] = None
    status: Optional[AssignmentStatus] = None
    is_overdue: Optional[bool] = None
    page: int = 1
    page_size: int = 50
