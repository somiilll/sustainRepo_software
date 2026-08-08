"""Organization Pydantic contracts."""
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# Valid ESG frameworks
VALID_ESG_FRAMEWORKS = ["BRSR", "GRI"]


class OrganizationCreate(BaseModel):
    name: str
    org_type: Optional[str] = "customer"  # customer, supplier, customer_supplier
    logo: Optional[str] = None
    corporate_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None  # IANA timezone (e.g., 'Asia/Kolkata', 'America/New_York')
    pincode: Optional[str] = None
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = "yearly"
    reporting_year_type: Optional[str] = None
    financial_year_start_month: Optional[int] = None
    org_boundaries_approach: Optional[str] = None
    org_boundaries_equity_percentage: Optional[float] = None
    org_boundaries: Optional[str] = None
    equity_share_reported_data_type: Optional[str] = None
    base_year: Optional[int] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None
    person_responsible: Optional[str] = None
    person_responsible_designation: Optional[str] = None
    person_responsible_contact: Optional[str] = None
    report_purpose: Optional[str] = None
    ghg_reduction_initiatives: Optional[str] = None
    internal_performance_tracking: Optional[str] = None
    max_facilities: Optional[int] = 10
    max_admins: Optional[int] = 5
    max_users: Optional[int] = 20
    subscription_expires_at: Optional[str] = None
    control_financial: Optional[bool] = False
    control_operational: Optional[bool] = False
    uncertainty_assessment: Optional[List[str]] = None
    enabled_access: Optional[List[str]] = None
    date_of_joining: Optional[str] = None
    selected_plan: Optional[str] = None
    trial_period_end_date: Optional[str] = None
    organization_size: Optional[str] = None
    payment_status: Optional[str] = None
    internal_notes: Optional[str] = None
    lead_source: Optional[str] = None
    poc_name: Optional[str] = None
    poc_designation: Optional[str] = None
    poc_phone: Optional[str] = None
    poc_email: Optional[str] = None
    secondary_contact_name: Optional[str] = None
    secondary_contact_phone: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    payment_ledger: Optional[List[dict]] = None
    invoice_history: Optional[List[dict]] = None

    # Approval workflow (per-org opt-in extension).
    approval_workflow_enabled: Optional[bool] = False
    
    # Multi-level approval chain (Manager → Director → VP style approval)
    multi_level_approval_enabled: Optional[bool] = False

    # ESG Frameworks enabled for this organization (BRSR, GRI, SBTi)
    esg_frameworks_enabled: Optional[List[str]] = None
    
    # Module enablement flags
    has_ghg: Optional[bool] = True  # Enable GHG module
    has_esg: Optional[bool] = True  # Enable ESG module (Environment, Social, Governance records)
    sbti_targets_enabled: Optional[bool] = False  # Enable SBTi Targets module
    repo_pilot_enabled: Optional[bool] = False  # Enable Repo Pilot module
    module_access: Optional[Dict[str, bool]] = None  # Per-module access flags

    @field_validator('pincode')
    @classmethod
    def validate_pincode(cls, v):
        if v is not None and v != '':
            v = v.strip()
            if not v.isdigit() or len(v) != 6:
                raise ValueError('Pincode must be exactly 6 digits')
        return v

    @field_validator('financial_year_start_month')
    @classmethod
    def validate_financial_year_start_month(cls, v):
        if v is not None and not 1 <= v <= 12:
            raise ValueError('Financial year start month must be between 1 and 12')
        return v

    @field_validator('esg_frameworks_enabled')
    @classmethod
    def validate_esg_frameworks(cls, v):
        if v is not None:
            invalid = [f for f in v if f not in VALID_ESG_FRAMEWORKS]
            if invalid:
                raise ValueError(f'Invalid ESG frameworks: {invalid}. Valid values: {VALID_ESG_FRAMEWORKS}')
        return v


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    org_type: Optional[str] = "customer"  # customer, supplier, customer_supplier
    logo: Optional[str] = None
    corporate_address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = "Asia/Kolkata"  # IANA timezone - defaults to IST
    pincode: Optional[str] = None
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = None
    reporting_year_type: Optional[str] = None
    financial_year_start_month: Optional[int] = None
    org_boundaries_approach: Optional[str] = None
    org_boundaries_equity_percentage: Optional[float] = None
    org_boundaries: Optional[str] = None
    equity_share_reported_data_type: Optional[str] = None
    base_year: Optional[int] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None
    remarks: Optional[str] = None
    person_responsible: Optional[str] = None
    person_responsible_designation: Optional[str] = None
    person_responsible_contact: Optional[str] = None
    report_purpose: Optional[str] = None
    ghg_reduction_initiatives: Optional[str] = None
    internal_performance_tracking: Optional[str] = None
    is_deleted: bool = False
    is_active: bool = True
    subscription_expires_at: Optional[str] = None
    created_at: str
    max_facilities: Optional[int] = 10
    max_admins: Optional[int] = 5
    max_users: Optional[int] = 20
    control_financial: Optional[bool] = False
    control_operational: Optional[bool] = False
    uncertainty_assessment: Optional[List[str]] = None
    enabled_access: Optional[List[str]] = None
    date_of_joining: Optional[str] = None
    selected_plan: Optional[str] = None
    trial_period_end_date: Optional[str] = None
    organization_size: Optional[str] = None
    payment_status: Optional[str] = None
    internal_notes: Optional[str] = None
    lead_source: Optional[str] = None
    poc_name: Optional[str] = None
    poc_designation: Optional[str] = None
    poc_phone: Optional[str] = None
    poc_email: Optional[str] = None
    secondary_contact_name: Optional[str] = None
    secondary_contact_phone: Optional[str] = None
    secondary_contact_email: Optional[str] = None
    payment_ledger: Optional[List[dict]] = None
    invoice_history: Optional[List[dict]] = None

    # Approval workflow (per-org opt-in extension; super-admin controlled).
    approval_workflow_enabled: Optional[bool] = False
    
    # Multi-level approval chain (Manager → Director → VP style approval)
    multi_level_approval_enabled: Optional[bool] = False

    # ESG Frameworks enabled for this organization (BRSR, GRI, SBTi)
    esg_frameworks_enabled: Optional[List[str]] = None
    
    # Module enablement flags
    has_ghg: Optional[bool] = True  # Enable GHG module
    has_esg: Optional[bool] = True  # Enable ESG module (Environment, Social, Governance records)
    sbti_targets_enabled: Optional[bool] = False  # Enable SBTi Targets module
    repo_pilot_enabled: Optional[bool] = False  # Enable Repo Pilot module
    module_access: Optional[Dict[str, bool]] = None  # Per-module access flags

