"""
ESG KPI Definitions Module

Configuration-driven KPI definitions for reusable ESG metrics.
Super Admin only - manages metric definitions used across targets, dashboards, analytics.
"""

from .contracts import (
    KPIDefinitionCreate,
    KPIDefinitionUpdate,
    KPIDefinitionResponse,
    KPIStatus,
    SourceType,
    AggregationType,
    OutputType,
    FilterOperator,
)
from .service import esg_kpi_definitions_service
from .router import router

__all__ = [
    "router",
    "esg_kpi_definitions_service",
    "KPIDefinitionCreate",
    "KPIDefinitionUpdate", 
    "KPIDefinitionResponse",
    "KPIStatus",
    "SourceType",
    "AggregationType",
    "OutputType",
    "FilterOperator",
]
