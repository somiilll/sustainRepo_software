"""
Organization Configuration — Contracts / Pydantic Models

Single-collection override layer:
  Global esg_record_categories + organization_config overrides → final config
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from modules.entitlements.service import normalize_entitlement_config


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
        "flaring__stationary_combustion",
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


# =============================================================================
# Supplier assessment program configuration
# =============================================================================

class SupplierAssessmentModuleConfig(BaseModel):
    """Configuration shape shared by supplier-assessment modules."""
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=80)


class SupplierAssessmentGhgModuleConfig(SupplierAssessmentModuleConfig):
    """GHG supplier-assessment controls; calculation controls stay out of config."""
    scopes: List[Literal["scope1", "scope2"]] = Field(default_factory=lambda: ["scope1", "scope2"])
    allow_custom_fuels: bool = False
    allow_process_emissions: bool = False
    allow_flaring: bool = False


class SupplierAssessmentModulesConfig(BaseModel):
    """Declarative module configuration for registered supplier-assessment workflows."""
    model_config = ConfigDict(extra="forbid")

    esg: SupplierAssessmentModuleConfig = Field(default_factory=lambda: SupplierAssessmentModuleConfig(enabled=True))
    ghg: SupplierAssessmentGhgModuleConfig = Field(default_factory=lambda: SupplierAssessmentGhgModuleConfig(enabled=True))
    documents: SupplierAssessmentModuleConfig = Field(default_factory=lambda: SupplierAssessmentModuleConfig(enabled=False))
    training: SupplierAssessmentModuleConfig = Field(default_factory=lambda: SupplierAssessmentModuleConfig(enabled=False))


class SupplierAssessmentConfig(BaseModel):
    """Organization-level supplier assessment configuration stored in organization_config."""
    model_config = ConfigDict(extra="forbid")

    modules: SupplierAssessmentModulesConfig = Field(default_factory=SupplierAssessmentModulesConfig)


class MonthlyEntryEntitlement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True
    monthly_rows_allowed: Optional[int] = Field(default=None, ge=1)


class GhgEntitlement(MonthlyEntryEntitlement):
    coverage: Literal["scope_1_2", "scope_3", "scope_1_2_3"] = "scope_1_2_3"


class EnvironmentEntitlement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ghg: GhgEntitlement = Field(default_factory=GhgEntitlement)
    energy: MonthlyEntryEntitlement = Field(default_factory=MonthlyEntryEntitlement)
    water: MonthlyEntryEntitlement = Field(default_factory=MonthlyEntryEntitlement)
    waste: MonthlyEntryEntitlement = Field(default_factory=MonthlyEntryEntitlement)
    biodiversity: MonthlyEntryEntitlement = Field(default_factory=MonthlyEntryEntitlement)
    climate_change: MonthlyEntryEntitlement = Field(default_factory=MonthlyEntryEntitlement)
    material: MonthlyEntryEntitlement = Field(default_factory=MonthlyEntryEntitlement)
    other_emissions: MonthlyEntryEntitlement = Field(default_factory=MonthlyEntryEntitlement)


class RepoPilotEntitlement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    internal_data_ai: bool = False
    data_retrieval: bool = False


class EnabledEntitlement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = True


class MaterialityEntitlement(EnabledEntitlement):
    assessment_types: List[Literal["traditional", "double"]] = Field(default_factory=lambda: ["traditional", "double"])


class ReportingEntitlement(EnabledEntitlement):
    brsr: bool = True
    gri: bool = True


class WorkflowEntitlement(EnabledEntitlement):
    workflow_type: Literal["single_level", "multi_level"] = "multi_level"


class UploadsEntitlement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bulk_upload: bool = True
    ocr: bool = True


class TargetsEntitlement(EnabledEntitlement):
    enabled: bool = False
    voluntary: bool = False
    sbti: bool = False


class ReportsEntitlement(EnabledEntitlement):
    scope_1_2: bool = True
    scope_1_2_3: bool = True
    ai_executive_summary: bool = True


class MisReportsEntitlement(EnabledEntitlement):
    configurations_allowed: Optional[int] = Field(default=None, ge=1)


class SupplierAssessmentEntitlement(EnabledEntitlement):
    suppliers_allowed: Optional[int] = Field(default=None, ge=1)


class EvidenceStorageEntitlement(EnabledEntitlement):
    storage_limit_gb: Optional[int] = Field(default=None, ge=1)


class OrganizationSettingsConfig(BaseModel):
    """Organization-wide workflow and reporting settings owned by Org Config."""
    model_config = ConfigDict(extra="forbid")
    approval_workflow_enabled: bool = False
    multi_level_approval_enabled: bool = False
    esg_frameworks_enabled: List[Literal["BRSR", "GRI"]] = Field(default_factory=list)


class EntitlementsConfig(BaseModel):
    """Detailed, canonical organization access and plan limits."""
    model_config = ConfigDict(extra="forbid")

    repo_pilot: RepoPilotEntitlement = Field(default_factory=RepoPilotEntitlement)
    environment: EnvironmentEntitlement = Field(default_factory=EnvironmentEntitlement)
    social: EnabledEntitlement = Field(default_factory=EnabledEntitlement)
    governance: EnabledEntitlement = Field(default_factory=EnabledEntitlement)
    materiality: MaterialityEntitlement = Field(default_factory=MaterialityEntitlement)
    reporting: ReportingEntitlement = Field(default_factory=ReportingEntitlement)
    workflow: WorkflowEntitlement = Field(default_factory=WorkflowEntitlement)
    uploads: UploadsEntitlement = Field(default_factory=UploadsEntitlement)
    targets: TargetsEntitlement = Field(default_factory=TargetsEntitlement)
    reports: ReportsEntitlement = Field(default_factory=ReportsEntitlement)
    mis_reports: MisReportsEntitlement = Field(default_factory=MisReportsEntitlement)
    peer_benchmarking: EnabledEntitlement = Field(default_factory=EnabledEntitlement)
    supplier_assessment: SupplierAssessmentEntitlement = Field(default_factory=SupplierAssessmentEntitlement)
    audit_trails: EnabledEntitlement = Field(default_factory=EnabledEntitlement)
    evidence_storage: EvidenceStorageEntitlement = Field(default_factory=EvidenceStorageEntitlement)

    @model_validator(mode="before")
    @classmethod
    def migrate_flat_entitlement_payload(cls, value):
        return normalize_entitlement_config(value) if isinstance(value, dict) else value


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
    supplier_assessment: Optional[SupplierAssessmentConfig] = None
    entitlements: Optional[EntitlementsConfig] = None
    ai_credits: Optional[int] = Field(default=None, ge=0)
    organization_settings: Optional[OrganizationSettingsConfig] = None
