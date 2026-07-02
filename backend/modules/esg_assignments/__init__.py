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
"""

from .router import router
from .service import AssignmentService
from .access_control import AccessControlService

__all__ = ["router", "AssignmentService", "AccessControlService"]
