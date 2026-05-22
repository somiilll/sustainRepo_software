"""Approvals Pydantic contracts.

Designed for forward compatibility: even though MVP only uses a single
Admin-review stage with role-based assignment, the payload shape supports
multi-stage chains, named approver lists, and approval-type policies
(`any` / `all` / `majority`) so future hierarchies can be enabled without
a schema migration.
"""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ApprovalDecision(BaseModel):
    """One approver's verdict inside a stage."""
    model_config = ConfigDict(extra="ignore")
    user_id: str
    user_email: str
    user_name: Optional[str] = None
    action: str  # "approved" | "rejected"
    comment: Optional[str] = None
    decided_at: str


class ApprovalStage(BaseModel):
    """A single review step in an approval chain.

    MVP uses one stage with `required_role="admin"`. Future versions
    can chain multiple stages and target specific users.
    """
    model_config = ConfigDict(extra="ignore")
    stage_index: int = 0
    name: str = "Admin Review"
    required_role: Optional[str] = "admin"
    required_user_ids: List[str] = Field(default_factory=list)
    approval_type: str = "any"  # any | all | majority
    decisions: List[ApprovalDecision] = Field(default_factory=list)
    status: str = "pending"  # pending | approved | rejected


class ApprovalRequest(BaseModel):
    """The persisted approval-request document."""
    model_config = ConfigDict(extra="ignore")
    id: str
    organization_id: str
    entity_type: str = "emission"
    entity_id: str
    entity_snapshot: dict = Field(default_factory=dict)
    request_type: str = "create"  # create | update | delete
    submitted_by: str
    submitted_by_email: str
    submitted_by_name: Optional[str] = None
    submitted_at: str
    status: str = "pending"  # pending | approved | rejected
    current_stage: int = 0
    stages: List[ApprovalStage] = Field(default_factory=list)
    finalized_at: Optional[str] = None
    finalized_by: Optional[str] = None
    final_comment: Optional[str] = None
    metadata: dict = Field(default_factory=dict)

    # Last-edit metadata (set when a user revises a still-pending submission).
    last_edited_at: Optional[str] = None
    last_edited_by: Optional[str] = None
    last_edited_by_email: Optional[str] = None
    last_edited_by_name: Optional[str] = None


class ApprovalDecisionInput(BaseModel):
    """Body for POST /approvals/{id}/decide."""
    action: str  # "approve" | "reject"
    comment: Optional[str] = None


class ApprovalRequestResponse(ApprovalRequest):
    """Response wrapper — same shape as request for now."""
    pass


class ApprovalCountResponse(BaseModel):
    pending: int
