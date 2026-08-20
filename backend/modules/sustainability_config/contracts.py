"""
Organization Configuration — Contracts / Pydantic Models

Single-collection override layer:
  Global esg_record_categories + organization_config overrides → final config
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    is_primary: bool = False
    aliases: List[str] = []
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
    section: str = "environment"  # environment | social | governance
    module_name: Optional[str] = None  # display name override for module
    display_order: int = 99
    fields: List[FieldDefinition] = []
    target_fields: List[FieldDefinition] = []  # Set Target questions for this custom category
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
    mode: Optional[str] = None  # "default" | "default_custom" | "custom" — persisted user choice


class CategoriesConfig(BaseModel):
    custom: List[CustomCategory] = []
    disabled: List[str] = []  # subcategory codes to hide


class FeaturesConfig(BaseModel):
    set_target: Optional[Dict[str, Any]] = None  # {"enabled": true, "modules": ["power","water","steam"]}


class AIQueryAlias(BaseModel):
    section: str
    category: str
    subcategory: Optional[str] = None
    field_key: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)


# =============================================================================
# GHG presentation-only organization overrides
# =============================================================================

class GhgCapabilityOverrides(BaseModel):
    """Only supports disabling the centrally supported Custom Fuel UI capability."""
    model_config = ConfigDict(extra="forbid")

    customFuel: Optional[Literal[False]] = None


class GhgOverridesConfig(BaseModel):
    """Safe GHG UI controls. Calculation-domain settings are intentionally absent."""
    model_config = ConfigDict(extra="forbid")

    disabledCategories: List[Literal[
        "process_emissions",
        "purchased_goods_and_services",
        "capital_goods",
        "fuel_and_energy_related_activities_not_included_in_scope_1_or_scope_2",
        "upstream_transportation_distribution",
        "waste_generated_in_operations",
        "business_travel",
        "employee_commuting",
        "upstream_leased_assets",
        "downstream_transportation_and_distribution",
        "processing_of_sold_products",
        "use_of_sold_products",
        "end_of_life_treatment_of_sold_products",
        "downstream_leased_assets",
        "franchises",
        "investments",
    ]] = Field(default_factory=list)
    capabilityOverrides: GhgCapabilityOverrides = Field(default_factory=GhgCapabilityOverrides)
    processTypeOptions: Optional[List[Literal[
        "venting", "n2o_overall_combustion", "ch4_overall_combustion"
    ]]] = None

    @field_validator("processTypeOptions")
    @classmethod
    def validate_process_type_options(cls, values):
        if values is None:
            return values
        if not values:
            raise ValueError("processTypeOptions must retain at least one supported Process Type")
        if len(values) != len(set(values)):
            raise ValueError("processTypeOptions must not contain duplicates")
        return values


class OrganizationConfigUpdate(BaseModel):
    """Payload for creating/updating the organization config."""
    modules: Optional[ModulesConfig] = None
    categories: Optional[CategoriesConfig] = None
    kpi_overrides: Optional[Dict[str, KPIOverride]] = None  # key = subcategory code
    target_overrides: Optional[Dict[str, KPIOverride]] = None  # key = subcategory code, separate target questions
    dashboard: Optional[DashboardConfig] = None
    features: Optional[FeaturesConfig] = None
    ai_query_aliases: Optional[List[AIQueryAlias]] = None
    ghg_overrides: Optional[GhgOverridesConfig] = None
