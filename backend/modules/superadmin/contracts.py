"""Phase B9: Super-admin / Platform Config Pydantic models.

Lifted verbatim from server.py. Behaviour byte-identical.
Re-imported back into server.py for legacy callers.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EmissionFactorCreate(BaseModel):
    name: str
    scope: str
    category: str
    sub_category: str
    factor: float
    unit: str
    source: Optional[str] = None
    references: Optional[str] = None
    is_custom: bool = True
    region: Optional[str] = None  # Country/Region for factors
    justification: Optional[str] = None  # Required for custom factors

class EmissionFactorResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    scope: str
    category: str
    sub_category: str
    factor: float
    unit: str
    source: Optional[str] = None
    references: Optional[str] = None
    region: Optional[str] = None
    is_custom: Optional[bool] = True
    justification: Optional[str] = None
    organization_id: Optional[str] = None  # For custom factors by Admin/User
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class UnitCreate(BaseModel):
    name: str  # Display name (e.g., "Kilogram")
    symbol: str  # Standard symbol (e.g., "kg")
    unit_type: str  # "mass" or "volume"
    aliases: List[str] = []  # Alternative names (e.g., ["kilogram", "kilograms", "KG"])
    is_base_unit: bool = False  # Is this the base unit for its type?
    description: Optional[str] = None
    is_active: bool = True

class UnitResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    symbol: str
    unit_type: str
    aliases: List[str] = []
    is_base_unit: bool = False
    description: Optional[str] = None
    is_active: bool = True
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class FuelDatabaseCreate(BaseModel):
    fuel_name: str
    categories: List[str] = []  # Multiple categories (e.g., ["stationary_combustion", "mobile_combustion"])
    category: Optional[str] = None  # Legacy single category (deprecated, use categories)
    industry_sectors: List[str] = []  # Multiple industries (e.g., ["Manufacturing", "Transportation"])
    industry_sector: Optional[str] = None  # Legacy single industry (deprecated, use industry_sectors)
    scope: str = "scope1"  # scope1, scope2, biogenic
    calorific_value: Optional[float] = None  # Net Calorific Value (NCV) - optional
    calorific_value_unit: Optional[str] = "MJ/kg"  # MJ/kg, MJ/L, MJ/m3, etc.
    emission_factor_co2: Optional[float] = None  # kg CO2/TJ (basis heating value) - optional
    emission_factor_ch4: Optional[float] = None  # kg CH4/TJ (optional)
    emission_factor_n2o: Optional[float] = None  # kg N2O/TJ (optional)
    emission_factor_basis_quantity: Optional[float] = None  # Basis quantity for emission factor (e.g., per kWh)
    emission_factor_basis_unit: Optional[str] = None  # Unit for basis quantity (kWh, MWh, GWh)
    gwp_fugitives: Optional[float] = None  # GWP value for fugitive emissions
    density: Optional[float] = None  # kg/L (optional, for liquid fuels)
    density_unit: Optional[str] = "kg/L"
    conversion_factor: float = 1.0  # For unit conversions
    conversion_unit: Optional[str] = None  # Description of conversion
    source: Optional[str] = None  # Data source (e.g., IPCC, EPA)
    references: Optional[str] = None
    region: Optional[str] = "Global"  # Country/Region specificity
    notes: Optional[str] = None
    allowed_units: Optional[List[str]] = None  # Units allowed for this fuel (e.g., ["kg", "g", "tonne", "L", "kWh"])
    year_applicable: Optional[int] = None  # Year when this data is applicable (optional)

class FuelDatabaseResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    fuel_name: str
    categories: Optional[List[str]] = []  # Multiple categories
    category: Optional[str] = None  # Legacy single category (for backwards compatibility)
    industry_sectors: Optional[List[str]] = []  # Multiple industries
    industry_sector: Optional[str] = None  # Legacy single industry (for backwards compatibility)
    scope: str
    calorific_value: Optional[float] = None  # Now optional
    calorific_value_unit: Optional[str] = None
    emission_factor_co2: Optional[float] = None
    emission_factor_ch4: Optional[float] = None
    emission_factor_n2o: Optional[float] = None
    emission_factor_basis_quantity: Optional[float] = None
    emission_factor_basis_unit: Optional[str] = None
    gwp_fugitives: Optional[float] = None  # GWP value for fugitive emissions
    density: Optional[float] = None
    density_unit: Optional[str] = None
    conversion_factor: float = 1.0
    conversion_unit: Optional[str] = None
    source: Optional[str] = None
    references: Optional[str] = None
    region: Optional[str] = None
    notes: Optional[str] = None
    allowed_units: Optional[List[str]] = None
    year_applicable: Optional[int] = None  # Year when this data is applicable
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class Scope3EFCreate(BaseModel):
    scope: str  # Scope 3 category (e.g., "Scope 3.1", "Scope 3.2", etc.)
    category: str  # Category within scope
    activity: str  # Activity description (mandatory)
    method: str  # "spend" or "activity"
    industry_sectors: Optional[List[str]] = []  # Multiple industries
    region: Optional[str] = "Global"
    year_applicable: Optional[int] = None
    emission_factor: float  # Numeric value >= 0 (mandatory)
    unit: str  # Unit for the emission factor
    allowed_units: Optional[List[str]] = []  # Units allowed for activity value (e.g., ["kg", "tonne", "INR"])
    default_unit: Optional[str] = None  # Default unit for activity value - input will be auto-converted to this unit
    source: Optional[str] = None
    notes: Optional[str] = None
    references: Optional[str] = None
    activity_type: Optional[str] = None  # Activity type for C6/C7 (e.g., "hotel_stay", "air_travel")
    subcategory: Optional[str] = None  # Subcategory for C8/C10/C11/C13/C14 (e.g., "stationary_combustion", "mobile_combustion", "electricity")
    sub_scope: Optional[str] = None  # Sub-scope for fuel type (e.g., "biogenic", "fossil")

class Scope3EFResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    scope: str
    category: str
    activity: str
    method: str
    industry_sectors: Optional[List[str]] = []
    region: Optional[str] = "Global"
    year_applicable: Optional[int] = None
    emission_factor: Optional[float] = None  # Can be None for supplier_basis entries
    unit: Optional[str] = None  # Can be None for supplier_basis entries
    allowed_units: Optional[List[str]] = []  # Units allowed for activity value
    default_unit: Optional[str] = None  # Default unit for activity value - input will be auto-converted to this unit
    source: Optional[str] = None
    notes: Optional[str] = None
    references: Optional[str] = None
    activity_type: Optional[str] = None  # Activity type for C6/C7 (e.g., "hotel_stay", "air_travel")
    subcategory: Optional[str] = None  # Subcategory for C8/C10/C11/C13/C14
    sub_scope: Optional[str] = None  # Sub-scope for fuel type (e.g., "biogenic", "fossil")
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class UnitConfig(BaseModel):
    unit_name: str
    unit_symbol: str
    unit_type: str  # "mass", "volume_liquid", "volume_cubic", "ncv", "emission_factor", "density"
    conversion_to_standard: float  # Multiplier to convert to standard unit
    requires_density: bool = False
    density_unit_type: Optional[str] = None  # "kg_per_L" or "kg_per_m3"
    is_standard: bool = False

class UnitConfigResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    unit_name: str
    unit_symbol: str
    unit_type: str
    conversion_to_standard: float
    requires_density: bool
    density_unit_type: Optional[str] = None
    is_standard: bool
    created_at: Optional[str] = None

class FormulaParameterCreate(BaseModel):
    parameter_name: str  # e.g., "Quantity", "NCV", "Emission Factor CO2"
    parameter_key: str   # e.g., "quantity", "ncv", "ef_co2"
    description: Optional[str] = None
    unit_conversions: List[dict] = []  # Conversion rules: [{from_unit, to_unit, multiplier}]
    requires_user_input: bool = True  # True = user input, False = predefined
    predefined_source: Optional[str] = None  # e.g., "fuel_database.calorific_value", "gwp.ch4"
    is_optional: bool = False
    display_order: int = 0
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    default_value: Optional[float] = None  # For predefined values like GWP (e.g., 28 for CH4, 273 for N2O)

class FormulaParameterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    parameter_name: str
    parameter_key: str
    description: Optional[str] = None
    unit_conversions: List[dict] = []
    requires_user_input: bool = True
    predefined_source: Optional[str] = None
    is_optional: bool = False
    display_order: int = 0
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    default_value: Optional[float] = None  # For predefined values like GWP
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class FormulaDefinitionCreate(BaseModel):
    formula_name: str  # e.g., "CO2 Emission Calculation"
    formula_key: str   # e.g., "co2_emission"
    description: Optional[str] = None
    output_name: str   # e.g., "CO₂ Emissions"
    output_unit: str   # e.g., "kg CO₂"
    components: List[dict] = []  # [{parameter_key, parameter_name, operation, condition}]
    # condition format: { "apply_when": "volume_units" } or { "apply_when": "mass_units" } or { "apply_when": "always" }
    formula_expression: str = ""  # Human readable: "Quantity × Calorific Value × CO₂ EF"
    applies_gwp: bool = False
    gwp_gas: Optional[str] = None  # "CO2", "CH4", "N2O"
    applicable_scopes: Optional[List[str]] = None  # ["Scope 1", "Scope 2", "Biogenic"]
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    is_active: bool = True
    display_order: int = 0
    # Unit type definitions for conditional logic
    mass_units: Optional[List[str]] = None  # Units classified as mass (e.g., ["kg", "g", "tonne"])
    volume_units: Optional[List[str]] = None  # Units classified as volume (e.g., ["L", "kL", "m3"])
    # Input field mappings - defines where each parameter value comes from (per-formula)
    # Each mapping: {parameter_key, source_type, source_field, label, required, default_value}
    # source_type: "user_input" | "fuel_database" | "formula_parameter" | "constant"
    input_mappings: Optional[List[dict]] = None

class FormulaDefinitionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    formula_name: str
    formula_key: str
    description: Optional[str] = None
    output_name: str
    output_unit: str
    components: List[dict] = []
    formula_expression: str = ""
    applies_gwp: bool = False
    gwp_gas: Optional[str] = None
    applicable_scopes: Optional[List[str]] = None  # ["Scope 1", "Scope 2", "Biogenic"]
    applicable_categories: Optional[List[str]] = None
    applicable_industries: Optional[List[str]] = None
    is_active: bool = True
    display_order: int = 0
    mass_units: Optional[List[str]] = None
    volume_units: Optional[List[str]] = None
    input_mappings: Optional[List[dict]] = None  # Per-formula input field mappings
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class EmissionConfigurationCreate(BaseModel):
    name: str  # e.g., "Scope 1 Standard Calculation", "Scope 2 Electricity"
    description: Optional[str] = None
    scope: str  # "scope1", "scope2", "scope3", "biogenic"
    category: Optional[str] = None  # Legacy: single category (kept for backward compatibility)
    categories: Optional[List[str]] = None  # New: multiple categories
    formula_id: str  # Reference to formula_definitions
    is_active: bool = True
    priority: int = 0  # For ordering when multiple configs match (higher priority wins)

class EmissionConfigurationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    scope: str
    category: Optional[str] = None  # Legacy: kept for backward compatibility
    categories: Optional[List[str]] = None  # New: multiple categories
    formula_id: str
    formula_name: Optional[str] = None  # Populated from formula_definitions
    is_active: bool = True
    priority: int = 0
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None

class CalculationFormulaCreate(BaseModel):
    name: str
    scope: str  # scope1, scope2, biogenic
    description: Optional[str] = None
    formula_expression: str  # e.g., "quantity * emission_factor"
    input_fields: List[Dict[str, Any]]  # [{name, label, type, unit, required}]
    output_unit: str = "kg CO2e"
    is_active: bool = True
    conversion_rules: Optional[List[Dict[str, Any]]] = None  # [{unit, multiplier, formula}]

class CalculationFormulaResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    scope: str
    description: Optional[str] = None
    formula_expression: str
    input_fields: List[Dict[str, Any]]
    output_unit: str
    is_active: bool
    conversion_rules: Optional[List[Dict[str, Any]]] = None
    created_at: str
    updated_at: Optional[str] = None

class SectorCreate(BaseModel):
    name: str
    description: Optional[str] = None

class SectorResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    created_at: str

class ProcessTemplateInputField(BaseModel):
    key: str  # unique key for the field
    label: str
    unit: str
    data_type: str = "number"  # number, text, percentage
    is_optional: bool = False
    default_value: Optional[str] = None  # default if user doesn't provide

class ProcessTemplatePredefinedInput(BaseModel):
    key: str  # unique key
    label: str
    unit: str
    data_type: str = "number"
    value: str  # the predefined value
    can_override: bool = True  # whether user can override

class ProcessTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sub_industry: Optional[str] = None
    formula: str  # formula expression using input keys
    input_fields: List[Dict[str, Any]] = []  # required input fields
    predefined_inputs: List[Dict[str, Any]] = []  # predefined inputs with values
    is_active: bool = True

class ProcessTemplateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    sub_industry: Optional[str] = None
    formula: str
    input_fields: List[Dict[str, Any]] = []
    predefined_inputs: List[Dict[str, Any]] = []
    is_active: bool = True
    created_at: str
    updated_at: Optional[str] = None

class GWPConfigCreate(BaseModel):
    source_name: str  # e.g., "IPCC AR6", "IPCC AR5", "Custom"
    source_year: Optional[int] = None  # e.g., 2021 for AR6
    time_horizon: str = "100-year"  # "20-year", "100-year", "500-year"
    co2_gwp: float = 1
    ch4_fossil_gwp: float  # CH4 from fossil sources
    ch4_non_fossil_gwp: float  # CH4 from non-fossil/biogenic sources
    n2o_gwp: float
    notes: Optional[str] = None
    is_active: bool = True

class GWPConfigUpdate(BaseModel):
    source_name: Optional[str] = None
    source_year: Optional[int] = None
    time_horizon: Optional[str] = None
    co2_gwp: Optional[float] = None
    ch4_fossil_gwp: Optional[float] = None  # CH4 from fossil sources
    ch4_non_fossil_gwp: Optional[float] = None  # CH4 from non-fossil/biogenic sources
    n2o_gwp: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class CurrencyConversionCreate(BaseModel):
    source_currency: str  # e.g., "USD", "EUR", "INR"
    target_currency: str = "USD"  # Default target is USD
    year_applicable: int  # Year for which this conversion is applicable
    purchase_parity: float  # PPP (Purchasing Power Parity) factor
    inflation_factor: Optional[float] = None  # Inflation adjustment factor
    exchange_rate: Optional[float] = None  # Optional: market exchange rate
    source: str  # e.g., "World Bank", "IMF", "OECD"
    notes: Optional[str] = None
    is_active: bool = True

class CurrencyConversionUpdate(BaseModel):
    source_currency: Optional[str] = None
    target_currency: Optional[str] = None
    year_applicable: Optional[int] = None
    purchase_parity: Optional[float] = None
    inflation_factor: Optional[float] = None
    exchange_rate: Optional[float] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

