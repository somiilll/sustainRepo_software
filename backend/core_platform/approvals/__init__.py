"""
Platform Approvals Module

Re-exports from modules/approvals for backward compatibility.
The approval workflow engine is a cross-cutting platform service.
"""

from modules.approvals.router_v2 import router

# Note: The approval module uses functions, not a class called EmissionApprovalFlow
# Re-export the key status constants and utility functions
from modules.approvals.emission_flow_v2 import (
    STATUS_PENDING_CREATE,
    STATUS_PENDING_UPDATE,
    STATUS_PENDING_DELETE,
    STATUS_APPROVED,
    PENDING_STATUSES,
    REJECTED_STATUSES,
)

__all__ = [
    "router",
    "STATUS_PENDING_CREATE",
    "STATUS_PENDING_UPDATE",
    "STATUS_PENDING_DELETE",
    "STATUS_APPROVED",
    "PENDING_STATUSES",
    "REJECTED_STATUSES",
]
