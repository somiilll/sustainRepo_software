"""
Emission record Pydantic contracts.

These are the canonical request/response schemas for the emissions
collection. Phase B4 extracts them; complex POST/PUT route handlers
(which integrate the calc-engine + audit pipeline) move in Phase B5.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


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
    sub_category: str
    fuel_type: Optional[str] = None

    # Scope 3
    calculation_method_scope3: Optional[str] = None
    scope3_ef_id: Optional[str] = None
    scope3_activity: Optional[str] = None
    scope3_activity_type: Optional[str] = None
    scope3_subcategory: Optional[str] = None
    # C11 only — picks the decision-tree branch (continuous_usage / one_time_use)
    type_of_product: Optional[str] = None
    formula_id: Optional[str] = None

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

    # Metadata
    fuel_database_id: Optional[str] = None
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    justification: Optional[str] = None
    evidence_url: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None

    # Process info
    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []


class EmissionRecordResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    reporting_period: Optional[str] = None
    frequency_type: Optional[str] = "monthly"
    scope: str
    category: str
    sub_category: Optional[str] = None
    fuel_type: Optional[str] = None

    calculation_method_scope3: Optional[str] = None
    scope3_ef_id: Optional[str] = None
    scope3_activity: Optional[str] = None
    scope3_activity_type: Optional[str] = None
    scope3_subcategory: Optional[str] = None
    type_of_product: Optional[str] = None
    formula_id: Optional[str] = None

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

    co2_emissions: Optional[float] = None
    ch4_emissions: Optional[float] = None
    n2o_emissions: Optional[float] = None
    co2e_emissions: Optional[float] = None
    total_emissions: Optional[float] = None

    fuel_database_id: Optional[str] = None
    source_of_information: Optional[str] = None
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
