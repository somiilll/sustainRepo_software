"""
Organization Configuration — Contracts / Pydantic Models

Single-collection override layer:
  Global esg_record_categories + organization_config overrides → final config
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# =============================================================================
# Field definition (used in kpi_overrides and custom categories)
# =============================================================================

class FieldDefinition(BaseModel):
    field_code: str
    label: str
    field_type: str = "input"  # input | calculated
    response_type: str = "text"  # text|number|integer|decimal|percentage|currency|yes_no|dropdown|multi_select|date|month|facility|file
    unit: Optional[str] = None
    required: bool = False
    help_text: Optional[str] = None
    validation: Optional[Dict[str, Any]] = None
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None
    display_order: int = 0
    enabled: bool = True
    evidence_required: bool = False


# =============================================================================
# Custom category (org adds a category that doesn't exist globally)
# =============================================================================

class CustomCategory(BaseModel):
    module_code: str  # parent module, e.g. "energy"
    category_code: str
    category_name: str
    display_order: int = 99
    fields: List[FieldDefinition] = []
    calculation: Optional[Dict[str, Any]] = None  # controlled calc config
    target_config: Optional[Dict[str, Any]] = None


# =============================================================================
# KPI Override (org customizes fields/calc for a global subcategory)
# =============================================================================

class KPIOverride(BaseModel):
    """Override for a specific subcategory (keyed by esg_record_categories subcategory code)."""
    fields: Optional[List[FieldDefinition]] = None  # replaces global fields
    kpi_name: Optional[str] = None  # optional display name override
    unit: Optional[str] = None
    visible: Optional[bool] = None  # hide a global KPI
    calculation: Optional[Dict[str, Any]] = None


# =============================================================================
# Dashboard config
# =============================================================================

class DashboardConfig(BaseModel):
    type: str = "standard"  # standard | custom
    configuration: Optional[Dict[str, Any]] = None


# =============================================================================
# Top-level organization config
# =============================================================================

class ModulesConfig(BaseModel):
    enabled: Optional[List[str]] = None  # None = all, [] = none, ["energy","water"] = those


class CategoriesConfig(BaseModel):
    custom: List[CustomCategory] = []
    disabled: List[str] = []  # subcategory codes to hide


class OrganizationConfigUpdate(BaseModel):
    """Payload for creating/updating the organization config."""
    modules: Optional[ModulesConfig] = None
    categories: Optional[CategoriesConfig] = None
    kpi_overrides: Optional[Dict[str, KPIOverride]] = None  # key = subcategory code
    dashboard: Optional[DashboardConfig] = None
