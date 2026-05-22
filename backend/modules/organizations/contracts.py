"""Organization Pydantic contracts."""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class OrganizationCreate(BaseModel):
    name: str
    logo: Optional[str] = None
    corporate_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = "yearly"
    reporting_year_type: Optional[str] = None
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

    @field_validator('pincode')
    @classmethod
    def validate_pincode(cls, v):
        if v is not None and v != '':
            v = v.strip()
            if not v.isdigit() or len(v) != 6:
                raise ValueError('Pincode must be exactly 6 digits')
        return v


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    logo: Optional[str] = None
    corporate_address: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    general_description: Optional[str] = None
    mission: Optional[str] = None
    vision: Optional[str] = None
    process_description: Optional[str] = None
    reporting_frequency: Optional[str] = None
    reporting_year_type: Optional[str] = None
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
