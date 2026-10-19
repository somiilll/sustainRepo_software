"""
KPI Calculation Engine

A modular, reusable engine for calculating ESG KPI values.
Used by: Targets, Dashboards, Reports, Analytics, AI Insights

This engine does NOT store results - it only calculates on demand.
Caching and storage strategies are handled by the calling modules.
"""

from .calculator import KPICalculator, kpi_calculator
from .aggregators import Aggregator, AggregationType
from .filters import FilterBuilder, FilterOperator
from .utils import get_collection_for_section, build_period_filter
from .router import router

__all__ = [
    "KPICalculator",
    "kpi_calculator",
    "Aggregator",
    "AggregationType", 
    "FilterBuilder",
    "FilterOperator",
    "get_collection_for_section",
    "build_period_filter",
    "router",
]
