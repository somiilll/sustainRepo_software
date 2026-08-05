"""
Approval Workflow Models

Defines the data structures for the Enterprise Approval Workflow Engine.
Uses Pydantic for validation and type safety.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import uuid


def generate_id() -> str:
    return str(uuid.uuid4())


# =============================================================================
# ENUMS
# =============================================================================

class ApprovalStatus(str, Enum):
    """Status of an approval request."""
    DRAFT = "draft"                    # Not yet submitted
    PENDING = "pending"                # Awaiting approval
    IN_REVIEW = "in_review"            # Currently being reviewed by an approver
    APPROVED = "approved"              # Fully approved
    REJECTED = "rejected"              # Rejected by an approver
    CHANGES_REQUESTED = "changes_requested"  # Approver requested modifications
    CANCELLED = "cancelled"            # Cancelled by submitter
    EXPIRED = "expired"                # Approval deadline passed


class WorkflowStatus(str, Enum):
    """Status of a workflow definition."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class ApprovalAction(str, Enum):
    """Actions that can be taken on an approval request."""
    SUBMIT = "submit"
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"
    RESUBMIT = "resubmit"
    CANCEL = "cancel"
    DELEGATE = "delegate"
    ESCALATE = "escalate"
    COMMENT = "comment"
    EXPIRE = "expire"


class EntityType(str, Enum):
    """Types of entities that can require approval."""
    ESG_RESPONSE = "esg_response"           # ESG questionnaire responses
    EMISSION_RECORD = "emission_record"     # GHG emission records
    ESG_RECORD = "esg_record"               # Generic ESG records
    FACILITY = "facility"                   # Facility data changes
    TARGET = "target"                       # Emission targets
    REPORT = "report"                       # Generated reports
    CUSTOM = "custom"                       # Custom entity types


class ApproverType(str, Enum):
    """Types of approvers."""
    USER = "user"                           # Specific user
    ROLE = "role"                           # Anyone with specific role
    MANAGER = "manager"                     # Submitter's manager
    FACILITY_ADMIN = "facility_admin"       # Facility administrator
    ORG_ADMIN = "org_admin"                 # Organization administrator
    DEPARTMENT_HEAD = "department_head"     # Department head


# =============================================================================
# WORKFLOW DEFINITION MODELS
# =============================================================================

class ApprovalLevel(BaseModel):
    """A single level in the approval chain."""
    level: int = Field(..., description="Order in the approval chain (1 = first)")
    name: str = Field(..., description="Display name for this level")
    approver_type: ApproverType = Field(..., description="Type of approver")
    approver_id: Optional[str] = Field(None, description="Specific user/role ID if applicable")
    required: bool = Field(True, description="Whether this level is mandatory")
    can_delegate: bool = Field(True, description="Whether approver can delegate")
    auto_approve_after_days: Optional[int] = Field(None, description="Auto-approve if no action after N days")
    escalation_after_days: Optional[int] = Field(None, description="Escalate if no action after N days")
    escalation_to: Optional[str] = Field(None, description="User/role to escalate to")


class ApprovalWorkflow(BaseModel):
    """
    Workflow definition for an entity type within an organization.
    Defines the approval chain and rules.
    """
    id: str = Field(default_factory=generate_id)
    organization_id: str
    name: str
    description: Optional[str] = None
    entity_type: EntityType
    entity_subtype: Optional[str] = Field(None, description="E.g., 'scope1', 'brsr_section_a'")
    
    # Approval chain
    levels: List[ApprovalLevel] = Field(default_factory=list)
    
    # Configuration
    status: WorkflowStatus = WorkflowStatus.ACTIVE
    require_all_levels: bool = Field(True, description="All levels must approve vs any one")
    allow_parallel_approval: bool = Field(False, description="Can levels approve in parallel")
    allow_self_approval: bool = Field(False, description="Can submitter approve their own request")
    require_comments_on_reject: bool = Field(True, description="Must provide reason when rejecting")
    require_comments_on_changes: bool = Field(True, description="Must explain requested changes")
    
    # Notifications
    notify_on_submit: bool = True
    notify_on_approve: bool = True
    notify_on_reject: bool = True
    notify_on_changes_requested: bool = True
    reminder_days: List[int] = Field(default_factory=lambda: [3, 7], description="Days before deadline to send reminders")
    
    # Deadlines
    default_deadline_days: Optional[int] = Field(None, description="Default days to complete approval")
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    created_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None
    
    class Config:
        use_enum_values = True


# =============================================================================
# APPROVAL REQUEST MODELS
# =============================================================================

class ApprovalStepRecord(BaseModel):
    """Record of an approval step taken."""
    id: str = Field(default_factory=generate_id)
    level: int
    level_name: str
    action: ApprovalAction
    actor_id: str
    actor_email: str
    actor_name: str
    actor_role: str
    comment: Optional[str] = None
    delegated_from: Optional[str] = Field(None, description="Original approver if delegated")
    timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())
    
    class Config:
        use_enum_values = True


class ApprovalRequest(BaseModel):
    """
    An approval request for a specific entity.
    Tracks the current state and progress through the approval chain.
    """
    id: str = Field(default_factory=generate_id)
    organization_id: str
    workflow_id: str
    workflow_name: str
    
    # Entity being approved
    entity_type: EntityType
    entity_id: str
    entity_subtype: Optional[str] = None
    entity_snapshot: Optional[Dict[str, Any]] = Field(None, description="Snapshot of entity at submission time")
    entity_changes: Optional[Dict[str, Any]] = Field(None, description="Changes from previous version")
    
    # Submission info
    submitted_by: str
    submitted_by_email: str
    submitted_by_name: str
    submitted_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    submission_comment: Optional[str] = None
    
    # Current state
    status: ApprovalStatus = ApprovalStatus.PENDING
    current_level: int = Field(1, description="Current approval level")
    current_approvers: List[str] = Field(default_factory=list, description="User IDs who can currently approve")
    
    # Progress tracking
    steps_completed: List[ApprovalStepRecord] = Field(default_factory=list)
    total_levels: int = 1
    
    # Deadlines
    deadline: Optional[datetime] = None
    reminder_sent_at: Optional[datetime] = None
    
    # Resolution
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_comment: Optional[str] = None
    
    # For resubmission tracking
    resubmission_count: int = 0
    previous_request_id: Optional[str] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None
    
    class Config:
        use_enum_values = True


# =============================================================================
# APPROVAL HISTORY MODEL
# =============================================================================

class ApprovalHistoryEntry(BaseModel):
    """
    Immutable audit trail entry for approval actions.
    Never updated, only inserted.
    """
    id: str = Field(default_factory=generate_id)
    organization_id: str
    request_id: str
    workflow_id: Optional[str] = None  # Optional for direct approvals (like questionnaire responses)
    
    # Entity info
    entity_type: EntityType
    entity_id: str
    entity_subtype: Optional[str] = None
    
    # Action details
    action: ApprovalAction
    actor_id: str
    actor_email: str
    actor_name: str
    actor_role: str
    
    # Context
    level: Optional[int] = None
    level_name: Optional[str] = None
    comment: Optional[str] = None
    
    # State transition
    previous_status: Optional[ApprovalStatus] = None
    new_status: ApprovalStatus
    
    # Metadata
    timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    
    class Config:
        use_enum_values = True


# =============================================================================
# API INPUT/OUTPUT MODELS
# =============================================================================

class CreateWorkflowInput(BaseModel):
    """Input for creating a new workflow."""
    name: str
    description: Optional[str] = None
    entity_type: EntityType
    entity_subtype: Optional[str] = None
    levels: List[ApprovalLevel]
    require_all_levels: bool = True
    allow_parallel_approval: bool = False
    allow_self_approval: bool = False
    require_comments_on_reject: bool = True
    require_comments_on_changes: bool = True
    default_deadline_days: Optional[int] = None
    
    class Config:
        use_enum_values = True


class UpdateWorkflowInput(BaseModel):
    """Input for updating a workflow."""
    name: Optional[str] = None
    description: Optional[str] = None
    levels: Optional[List[ApprovalLevel]] = None
    status: Optional[WorkflowStatus] = None
    require_all_levels: Optional[bool] = None
    allow_parallel_approval: Optional[bool] = None
    default_deadline_days: Optional[int] = None
    
    class Config:
        use_enum_values = True


class SubmitForApprovalInput(BaseModel):
    """Input for submitting an entity for approval."""
    entity_type: EntityType
    entity_id: str
    entity_subtype: Optional[str] = None
    entity_snapshot: Optional[Dict[str, Any]] = None
    entity_changes: Optional[Dict[str, Any]] = None
    comment: Optional[str] = None
    workflow_id: Optional[str] = Field(None, description="Specific workflow to use, or auto-select")
    
    class Config:
        use_enum_values = True


class ApprovalDecisionInput(BaseModel):
    """Input for making an approval decision."""
    action: ApprovalAction
    comment: Optional[str] = None
    delegate_to: Optional[str] = Field(None, description="User ID to delegate to")
    updated_data: Optional[Dict[str, Any]] = Field(None, description="Updated field values if approver made edits")
    
    class Config:
        use_enum_values = True


class ApprovalRequestSummary(BaseModel):
    """Summary of an approval request for lists."""
    id: str
    entity_type: str
    entity_id: str
    entity_subtype: Optional[str] = None
    workflow_name: str
    status: str
    current_level: int
    total_levels: int
    submitted_by_name: str
    submitted_at: datetime
    deadline: Optional[datetime] = None
    can_approve: bool = False
    
    class Config:
        use_enum_values = True


class PendingApprovalsResponse(BaseModel):
    """Response for pending approvals endpoint."""
    total: int
    items: List[ApprovalRequestSummary]
    by_entity_type: Dict[str, int] = Field(default_factory=dict)
    urgent: int = 0  # Approaching deadline
