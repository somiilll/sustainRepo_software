"""
ESG Assignments Module

Provides assignment and access control for ESG Questions and Records.
Supports granular assignment at section/topic/principle/question level for questions,
and category/subcategory/item level for records.

Features:
- Unified assignment table for questions and records
- Assignment history/audit trail
- Response version history
- Filling frequency (daily, weekly, monthly, quarterly, yearly)
- Reminder frequency with scheduling
- Inheritance logic (most specific wins)
- Access control filtering

V2 Data Model (2026-07):
- One assignment per work item (not per user)
- Separate esg_assignment_assignees table for assignees
- Clean replacement logic for org/facility level switching
- Completion computed on-the-fly by CompletionService (not stored)
"""

from .router import router
from .service import AssignmentService
from .access_control import AccessControlService
from .kpi_access_helper import KPIAccessHelper, kpi_access_helper
from .completion_service import CompletionService, completion_service
from .assignees_service import AssignmentAssigneesService, assignment_assignees_service
from .assignment_service_v2 import AssignmentServiceV2, assignment_service_v2

__all__ = [
    "router",
    "AssignmentService",
    "AccessControlService",
    "KPIAccessHelper",
    "kpi_access_helper",
    "CompletionService",
    "completion_service",
    "AssignmentAssigneesService",
    "assignment_assignees_service",
    "AssignmentServiceV2",
    "assignment_service_v2",
]
