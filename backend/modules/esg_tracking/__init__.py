"""
ESG Tracking Module

Provides aggregation and tracking capabilities for ESG workflows,
assignments, completion monitoring, and disclosure ownership management.

This module aggregates data from:
- esg_assignments (ownership)
- organization_esg_responses (completion data)
- esg_question_configs (framework structure)
- approval_requests (approval status)
"""

from .service import TrackingService, tracking_service
from .router import router

__all__ = [
    "TrackingService",
    "tracking_service",
    "router",
]
