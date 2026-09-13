"""
Emission record Pydantic contracts.

These are the canonical request/response schemas for the emissions
collection. Phase B4 extracts them; complex POST/PUT route handlers
(which integrate the calc-engine + audit pipeline) move in Phase B5.
"""
import calendar
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from shared.utils.emission_records import normalize_reporting_period_for_storage


class DynamicFieldValue(BaseModel):
    """Single dynamic field value with unit and override status."""
    value: Optional[float] = None
    unit: Optional[str] = None
    is_override: Optional[bool] = False
    justification: Optional[str] = None


class EmissionRecordCreate(BaseModel):
    facility_id: str
    organization_id: Optional[str] = None
    reporting_period: str  # Monthly: "2025-03", Yearly: "CY2025" or "FY 2025-2026"
    frequency_type: Optional[str] = "monthly"
    scope: str
    category: str
    category_code: Optional[str] = None
    category_id: Optional[str] = None
    sub_category: str
    fuel_type: Optional[str] = None

    # Custom fuel
    is_custom_fuel: Optional[bool] = False
    custom_fuel_name: Optional[str] = None

    # Scope 1 Process Emissions decision-tree branch
    calculation_methodology: Optional[str] = None
    process_type: Optional[str] = None

    # Scope 3
    calculation_method_scope3: Optional[str] = None
    spend_currency_conversion_method: Optional[str] = None
    scope3_ef_id: Optional[str] = None
    scope3_activity: Optional[str] = None
    scope3_activity_type: Optional[str] = None
    scope3_subcategory: Optional[str] = None
    # C11 only — picks the decision-tree branch (continuous_usage / one_time_use)
    type_of_product: Optional[str] = None
    formula_id: Optional[str] = None
    formula_version_id: Optional[str] = None
    decision_tree_version_id: Optional[str] = None
    formula_snapshot: Optional[Dict[str, Any]] = None

    # Biogenic
    biogenic_scope_selection: Optional[str] = None

    # Scope 3 Supplier
    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None

    # Scope 3 C7 (single-employee legacy)
    employee_name: Optional[str] = None
    employee_id: Optional[str] = None

    # Scope 3 C8/C13/C14/C15
    asset_name: Optional[str] = None

    # Scope 3 C4/C6/C7/C9
    from_location: Optional[str] = None
    to_location: Optional[str] = None

    # Scope 3 C9 Downstream Transportation
    customer_name: Optional[str] = None
    customer_code: Optional[str] = None

    # Scope 3 C6 Business Travel
    nights_stayed: Optional[int] = None
    rooms_taken: Optional[int] = None

    # Multi-Employee (C7)
    employees: Optional[List[Dict[str, Any]]] = None
    monthly_totals: Optional[Dict[str, Dict[str, float]]] = None
    yearly_total: Optional[Dict[str, float]] = None

    # Dynamic field values + outputs
    dynamic_field_values: Optional[Dict[str, Dict[str, Any]]] = {}
    outputs: Optional[Dict[str, Dict[str, Any]]] = {}

    # Legacy request compatibility only. Write handlers discard these fields;
    # dynamic_field_values is the canonical activity-input store.
    quantity: Optional[float] = None
    quantity_unit: Optional[str] = None
    unit: Optional[str] = None

    # Metadata
    fuel_database_id: Optional[str] = None
    source_of_information: Optional[str] = None
    record_source: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    submission_batch_id: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None

    # Process info
    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []

    @field_validator("reporting_period")
    @classmethod
    def normalize_reporting_period(cls, value: str) -> str:
        normalized = normalize_reporting_period_for_storage(value)
        if not normalized:
            raise ValueError("reporting_period must be a valid YYYY-MM, CYyyyy, or FY yyyy-yyyy value")
        return normalized

    @model_validator(mode="after")
    def validate_c6_travel_counts_for_reporting_period(self):
        """Keep C6 travel counts within the actual monthly or yearly reporting period."""
        category_identity = f"{self.category_code or ''} {self.category or ''}".lower()
        is_c6 = bool(re.search(r"(^|\s)c6\b|business[_\s-]*travel", category_identity))
        if not is_c6:
            return self

        if self.frequency_type == "monthly":
            period_match = re.match(r"^(\d{4})-(\d{2})(?:-\d{2})?$", self.reporting_period or "")
            if not period_match:
                return self
            year, month = map(int, period_match.groups())
            max_days = calendar.monthrange(year, month)[1]
            period_label = "reporting month"
        elif self.frequency_type == "yearly":
            calendar_match = re.match(r"^CY\s?(\d{4})$", self.reporting_period or "", re.IGNORECASE)
            financial_match = re.match(r"^FY\s?(\d{4})-(\d{4})$", self.reporting_period or "", re.IGNORECASE)
            if calendar_match:
                max_days = 366 if calendar.isleap(int(calendar_match.group(1))) else 365
            elif financial_match:
                max_days = 366 if calendar.isleap(int(financial_match.group(2))) else 365
            else:
                return self
            period_label = "reporting year"
        else:
            return self

        values = self.dynamic_field_values or {}
        travel_fields = {
            "qty_days_travelled": "No. of Days Travelled",
            "no_of_days": "No. of Days Travelled",
            "nights_stayed": "No. of Nights Stayed",
            "number_of_nights": "No. of Nights Stayed",
            "qty_nights": "No. of Nights Stayed",
        }
        for key, label in travel_fields.items():
            raw_value = values.get(key)
            value = raw_value.get("value") if isinstance(raw_value, dict) else raw_value
            if value in (None, "") and key == "nights_stayed":
                value = self.nights_stayed
            if value in (None, ""):
                continue
            try:
                numeric_value = float(value)
            except (TypeError, ValueError) as error:
                raise ValueError(f"{label} must be a valid number") from error
            if numeric_value < 0 or numeric_value > max_days:
                raise ValueError(f"{label} must be between 0 and {max_days} days for the {period_label}")
        return self


class EmissionBatchRollbackRequest(BaseModel):
    submission_batch_id: str


class EmissionRecordResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    reporting_period: Optional[str] = None
    frequency_type: Optional[str] = "monthly"
    scope: str
    category: str
    category_code: Optional[str] = None
    sub_category: Optional[str] = None
    fuel_type: Optional[str] = None

    # Custom fuel
    is_custom_fuel: Optional[bool] = False
    custom_fuel_name: Optional[str] = None

    # Scope 1 Process Emissions decision-tree branch
    calculation_methodology: Optional[str] = None
    process_type: Optional[str] = None

    calculation_method_scope3: Optional[str] = None
    spend_currency_conversion_method: Optional[str] = None
    scope3_ef_id: Optional[str] = None
    scope3_activity: Optional[str] = None
    scope3_activity_type: Optional[str] = None
    scope3_subcategory: Optional[str] = None
    type_of_product: Optional[str] = None
    formula_id: Optional[str] = None
    formula_version_id: Optional[str] = None
    decision_tree_version_id: Optional[str] = None
    formula_snapshot: Optional[Dict[str, Any]] = None

    biogenic_scope_selection: Optional[str] = None

    supplier_name: Optional[str] = None
    supplier_code: Optional[str] = None

    employee_name: Optional[str] = None
    employee_id: Optional[str] = None

    asset_name: Optional[str] = None

    from_location: Optional[str] = None
    to_location: Optional[str] = None

    customer_name: Optional[str] = None
    customer_code: Optional[str] = None

    nights_stayed: Optional[int] = None
    rooms_taken: Optional[int] = None

    employees: Optional[List[Dict[str, Any]]] = None
    monthly_totals: Optional[Dict[str, Dict[str, float]]] = None
    yearly_total: Optional[Dict[str, float]] = None

    dynamic_field_values: Optional[Dict[str, Dict[str, Any]]] = {}
    outputs: Optional[Dict[str, Dict[str, Any]]] = {}
    quantity: Optional[float] = None
    quantity_unit: Optional[str] = None
    unit: Optional[str] = None

    co2_emissions: Optional[float] = None
    ch4_emissions: Optional[float] = None
    n2o_emissions: Optional[float] = None
    co2e_emissions: Optional[float] = None
    total_emissions: Optional[float] = None

    fuel_database_id: Optional[str] = None
    source_of_information: Optional[str] = None
    record_source: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None

    source: Optional[str] = None
    bulk_upload_id: Optional[str] = None

    emission_factor_used: Optional[float] = None
    emission_factor_unit: Optional[str] = None
    unit_conversion_applied: Optional[bool] = None

    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []

    created_by: Optional[str] = None
    created_by_email: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None
    updated_by_name: Optional[str] = None
    updated_at: Optional[str] = None

    # Approval workflow fields (visible to FE for status badges).
    approval_status: Optional[str] = None
    proposed_by: Optional[str] = None
    proposed_by_email: Optional[str] = None
    proposed_by_name: Optional[str] = None
    proposed_at: Optional[str] = None

    # V2 Approval workflow fields
    original_record_id: Optional[str] = None
    submitted_by: Optional[str] = None
    submitted_by_email: Optional[str] = None
    submitted_by_name: Optional[str] = None
    submitted_at: Optional[str] = None
    edit_history: Optional[List[Dict[str, Any]]] = None
    version_history: Optional[List[Dict[str, Any]]] = None
    version: Optional[int] = None
    
    # Pending proposal indicators (for UI badges)
    is_my_pending_proposal: Optional[bool] = None
    has_pending_proposal: Optional[bool] = None
    pending_proposal_by: Optional[str] = None
    pending_proposal_status: Optional[str] = None


class EmissionHistoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    emission_id: str
    changed_by: str
    changed_by_email: Optional[str] = None
    changed_by_name: Optional[str] = None
    changed_at: str
    version: Optional[int] = None
    scope: Optional[str] = None
    category: Optional[str] = None
    field_changes: Optional[List[Dict[str, Any]]] = None
    changes_summary: Optional[str] = None
    changes: Dict[str, Any]
    # Approval info
    approved_by: Optional[str] = None
    approved_by_email: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[str] = None
    # Deletion-request info (only on action="deleted" entries)
    requested_by: Optional[str] = None
    requested_by_email: Optional[str] = None
    requested_by_name: Optional[str] = None
    requested_at: Optional[str] = None
    rejected_proposed_values: Optional[Dict[str, Any]] = None
