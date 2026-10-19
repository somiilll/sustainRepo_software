"""
ESG Targets Module

Configuration-driven target management for any ESG KPI/Metric.
"""

from .router import router
from .service import esg_targets_service
from .contracts import (
    ESGTargetCreate,
    ESGTargetUpdate,
    ESGTargetResponse,
    TargetType,
    GoalType,
    TrackingMode,
    Trajectory,
    ScopeType,
    TargetStatus
)

__all__ = [
    "router",
    "esg_targets_service",
    "ESGTargetCreate",
    "ESGTargetUpdate", 
    "ESGTargetResponse",
    "TargetType",
    "GoalType",
    "TrackingMode",
    "Trajectory",
    "ScopeType",
    "TargetStatus"
]
