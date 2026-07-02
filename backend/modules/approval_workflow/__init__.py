"""
Enterprise Approval Workflow Engine

A generic, multi-level approval system for ESG data submissions.
Supports configurable approval chains, delegation, and comprehensive audit trails.

Architecture:
- approval_workflows: Workflow definitions (per org, per entity type)
- approval_requests: Active approval requests with current state
- approval_history: Immutable audit trail of all approval actions

Flow:
1. User submits data → Creates approval_request (status: pending)
2. Approvers notified based on workflow configuration
3. Each approver in chain reviews → approve/reject/request_changes
4. All levels approved → Data locked, request marked completed
5. Any rejection → Request marked rejected, user notified
"""

from .models import (
    ApprovalWorkflow,
    ApprovalRequest,
    ApprovalStepRecord,
    ApprovalAction,
    ApprovalStatus,
    WorkflowStatus,
)
from .service import ApprovalWorkflowService
from .router import router

__all__ = [
    "ApprovalWorkflow",
    "ApprovalRequest", 
    "ApprovalStepRecord",
    "ApprovalAction",
    "ApprovalStatus",
    "WorkflowStatus",
    "ApprovalWorkflowService",
    "router",
]
