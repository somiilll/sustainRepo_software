"""
Framework Details Contracts

Pydantic models for framework-specific organization details.
Uses hybrid structure:
- Static data: organization_framework_details (company identity, address, etc.)
- Yearly data: organization_framework_yearly_data (employee counts, turnover rates, etc.)

Currently implements BRSR. Future frameworks (GRI, SBTi) can be added modularly.
"""

from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# BRSR Static Table Row Models (Non-year-specific)
# =============================================================================

class BusinessActivityRow(BaseModel):
    """Row for Business Activities accounting for 90% of turnover."""
    description: str = Field(default="", description="Description of Activity")
    main_activity: str = Field(default="", description="Main Description of Business Activity")
    turnover_percentage: float = Field(default=0, ge=0, le=100, description="% of Turnover")


class ProductServiceRow(BaseModel):
    """Row for Products/Services accounting for 90% of turnover."""
    product_service: str = Field(default="", description="Product / Service")
    nic_code: str = Field(default="", description="NIC Code")
    turnover_percentage: float = Field(default=0, ge=0, le=100, description="% of Total Turnover")


class PlantOfficeRow(BaseModel):
    """Row for Plants and Offices operated."""
    location_type: Literal["National", "International"] = Field(default="National", description="Location type")
    num_plants: int = Field(default=0, ge=0, description="Number of Plants")
    num_offices: int = Field(default=0, ge=0, description="Number of Offices")


class MarketServedRow(BaseModel):
    """Row for Markets served by entity."""
    location_type: Literal["National", "International"] = Field(default="National", description="Location type")
    number: int = Field(default=0, ge=0, description="Number of States/Countries")


# =============================================================================
# BRSR Yearly Table Row Models (Year-specific data)
# =============================================================================

class EmployeeWorkerDetailsRow(BaseModel):
    """Row for Employees and Workers Details including differently abled."""
    # Permanent Employees
    permanent_male_employees: int = Field(default=0, ge=0)
    permanent_female_employees: int = Field(default=0, ge=0)
    other_than_permanent_male_employees: int = Field(default=0, ge=0)
    other_than_permanent_female_employees: int = Field(default=0, ge=0)
    # Differently Abled Employees
    diff_abled_permanent_male_employees: int = Field(default=0, ge=0)
    diff_abled_permanent_female_employees: int = Field(default=0, ge=0)
    diff_abled_other_permanent_male_employees: int = Field(default=0, ge=0)
    diff_abled_other_permanent_female_employees: int = Field(default=0, ge=0)
    # Permanent Workers
    permanent_male_workers: int = Field(default=0, ge=0)
    permanent_female_workers: int = Field(default=0, ge=0)
    other_than_permanent_male_workers: int = Field(default=0, ge=0)
    other_than_permanent_female_workers: int = Field(default=0, ge=0)
    # Differently Abled Workers
    diff_abled_permanent_male_workers: int = Field(default=0, ge=0)
    diff_abled_permanent_female_workers: int = Field(default=0, ge=0)
    diff_abled_other_permanent_male_workers: int = Field(default=0, ge=0)
    diff_abled_other_permanent_female_workers: int = Field(default=0, ge=0)


class WomenRepresentationRow(BaseModel):
    """Row for Representation of Women on Board and Key Management Personnel."""
    category: Literal["Board of Directors", "Key Management Personnel"] = Field(...)
    total: int = Field(default=0, ge=0, description="Total count")
    number_of_females: int = Field(default=0, ge=0, description="Number of females")


class HoldingSubsidiaryRow(BaseModel):
    """Row for Holding, Subsidiary, Associate Companies and Joint Ventures."""
    name_of_entity: str = Field(default="", description="Name of Entity")
    type_of_entity: Literal["Holding Company", "Subsidiary", "Associate Company", "Joint Venture"] = Field(
        default="Subsidiary", description="Type of Entity"
    )
    shares_held_percentage: float = Field(default=0, ge=0, le=100, description="% Shares Held")
    participates_in_br_initiatives: bool = Field(default=False, description="Participates in BR Initiatives")


class CSRApplicabilityData(BaseModel):
    """CSR Applicability data for a reporting year."""
    is_applicable: bool = Field(default=False, description="CSR applicable under Section 135")
    turnover_inr: float = Field(default=0, ge=0, description="Turnover in INR")
    net_worth_inr: float = Field(default=0, ge=0, description="Net Worth in INR")


class TurnoverRateData(BaseModel):
    """Turnover rate for a single reporting year (not nested)."""
    permanent_employees_male: float = Field(default=0, ge=0, le=100)
    permanent_employees_female: float = Field(default=0, ge=0, le=100)
    permanent_workers_male: float = Field(default=0, ge=0, le=100)
    permanent_workers_female: float = Field(default=0, ge=0, le=100)


class ComplaintGrievanceRow(BaseModel):
    """Row for Complaints/Grievances by category."""
    category: Literal[
        "Communities",
        "Investors (other than shareholders)",
        "Shareholders",
        "Employees and workers",
        "Customers",
        "Value Chain Partners",
        "Other"
    ] = Field(...)
    has_grievance_mechanism: bool = Field(default=False, description="Grievance Redressal Mechanism in Place")
    policy_weblink: str = Field(default="", description="Web-link for Policy (required if mechanism exists)")
    current_fy_filed: int = Field(default=0, ge=0, description="Current FY Complaints Filed")
    current_fy_pending: int = Field(default=0, ge=0, description="Current FY Pending")
    current_fy_remarks: str = Field(default="", description="Current FY Remarks")
    previous_fy_filed: int = Field(default=0, ge=0, description="Previous FY Complaints Filed")
    previous_fy_pending: int = Field(default=0, ge=0, description="Previous FY Pending")
    previous_fy_remarks: str = Field(default="", description="Previous FY Remarks")


class MaterialIssueRow(BaseModel):
    """Row for Material Responsible Business Conduct Issues."""
    issue_identified: str = Field(default="", description="Material Issue Identified")
    risk_or_opportunity: Literal["Risk", "Opportunity"] = Field(default="Risk")
    rationale: str = Field(default="", description="Rationale for Identification")
    mitigation_approach: str = Field(default="", description="Mitigation Approach (if Risk)")
    financial_implication: Literal["Positive", "Negative", "Neutral"] = Field(default="Neutral")
    financial_details: str = Field(default="", description="Financial Implications Details")


# =============================================================================
# BRSR Static Details Model (organization_framework_details)
# =============================================================================

class BRSRStaticDetailsBase(BaseModel):
    """Static BRSR organization details - non-year-specific data."""
    
    # Basic Information Fields
    cin: str = Field(default="", description="Corporate Identity Number")
    listed_entity_name: str = Field(default="", description="Name of the Listed Entity")
    year_of_incorporation: int = Field(default=2024, ge=1800, le=2100, description="Year of Incorporation")
    
    # Address fields
    corporate_address: str = Field(default="", description="Corporate Address")
    city: str = Field(default="", description="City")
    state: str = Field(default="", description="State")
    country: str = Field(default="India", description="Country")
    pincode: str = Field(default="", description="6-digit PIN code")
    
    email: Optional[str] = Field(default="", description="E-mail")
    telephone: str = Field(default="", description="Telephone")
    website: str = Field(default="", description="Website URL")
    
    # Static financial/assurance info
    assurance_provider: str = Field(default="", description="Name of Assurance Provider")
    assurance_type: str = Field(default="", description="Type of Assurance Obtained")
    
    # Radio Button Fields
    stock_exchange: Literal["BSE", "NSE", "Both NSE & BSE"] = Field(default="BSE")
    reporting_boundary: Literal["Standalone", "Consolidated"] = Field(default="Standalone")

    @field_validator('pincode')
    @classmethod
    def validate_pincode(cls, v):
        if v and not v.isdigit():
            raise ValueError('Pincode must contain only digits')
        if v and len(v) != 6 and len(v) != 0:
            raise ValueError('Pincode must be exactly 6 digits')
        return v

    @field_validator('website')
    @classmethod
    def validate_website(cls, v):
        if v and not (v.startswith('http://') or v.startswith('https://')):
            return f'https://{v}'
        return v
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        if not v or v == "":
            return v
        import re
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', v):
            raise ValueError('Invalid email format')
        return v


# =============================================================================
# BRSR Yearly Details Model (organization_framework_yearly_data)
# =============================================================================

class BRSRYearlyDetailsBase(BaseModel):
    """Year-specific BRSR reporting data."""
    
    # Financial data (year-specific)
    paid_up_capital: float = Field(default=0, ge=0, description="Paid-up Capital (INR)")
    export_contribution_percentage: float = Field(default=0, ge=0, le=100)
    customer_types_brief: str = Field(default="", description="Brief on types of customers")
    
    # Dynamic Tables (year-specific)
    business_activities: List[BusinessActivityRow] = Field(default_factory=list)
    products_services: List[ProductServiceRow] = Field(default_factory=list)
    plants_offices: List[PlantOfficeRow] = Field(default_factory=list)
    markets_served: List[MarketServedRow] = Field(default_factory=list)
    
    # NEW SECTIONS - Batch 1
    employee_worker_details: EmployeeWorkerDetailsRow = Field(
        default_factory=EmployeeWorkerDetailsRow,
        description="Details of Employees and Workers"
    )
    women_representation: List[WomenRepresentationRow] = Field(
        default_factory=list,
        description="Representation of Women on Board and KMP"
    )
    holding_subsidiary_entities: List[HoldingSubsidiaryRow] = Field(
        default_factory=list,
        description="Holding, Subsidiary, Associate Companies and JVs"
    )
    csr_applicability: CSRApplicabilityData = Field(
        default_factory=CSRApplicabilityData,
        description="CSR Applicability under Section 135"
    )
    turnover_rate: TurnoverRateData = Field(
        default_factory=TurnoverRateData,
        description="Turnover Rate (%) for Permanent Employees and Workers"
    )
    complaints_grievances: List[ComplaintGrievanceRow] = Field(
        default_factory=list,
        description="Complaints and Grievances Related to Responsible Business Conduct"
    )
    material_issues: List[MaterialIssueRow] = Field(
        default_factory=list,
        description="Material Responsible Business Conduct and Sustainability Issues"
    )


# =============================================================================
# Combined BRSR Details for backward compatibility
# =============================================================================

class BRSRDetailsBase(BRSRStaticDetailsBase):
    """Combined BRSR details (static + yearly) for backward compatibility."""
    
    # Include yearly fields for backward compatibility
    paid_up_capital: float = Field(default=0, ge=0, description="Paid-up Capital (INR)")
    export_contribution_percentage: float = Field(default=0, ge=0, le=100)
    customer_types_brief: str = Field(default="", description="Brief on types of customers")
    
    # Dynamic Table Fields
    business_activities: List[BusinessActivityRow] = Field(default_factory=list)
    products_services: List[ProductServiceRow] = Field(default_factory=list)
    plants_offices: List[PlantOfficeRow] = Field(default_factory=list)
    markets_served: List[MarketServedRow] = Field(default_factory=list)


class BRSRDetailsCreate(BRSRDetailsBase):
    """Create request for BRSR details."""
    pass


class BRSRDetailsUpdate(BaseModel):
    """Update request for BRSR details - all fields optional."""
    cin: Optional[str] = None
    listed_entity_name: Optional[str] = None
    year_of_incorporation: Optional[int] = None
    corporate_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    website: Optional[str] = None
    paid_up_capital: Optional[float] = None
    assurance_provider: Optional[str] = None
    assurance_type: Optional[str] = None
    export_contribution_percentage: Optional[float] = None
    customer_types_brief: Optional[str] = None
    stock_exchange: Optional[Literal["BSE", "NSE", "Both NSE & BSE"]] = None
    reporting_boundary: Optional[Literal["Standalone", "Consolidated"]] = None
    business_activities: Optional[List[BusinessActivityRow]] = None
    products_services: Optional[List[ProductServiceRow]] = None
    plants_offices: Optional[List[PlantOfficeRow]] = None
    markets_served: Optional[List[MarketServedRow]] = None


class BRSRDetails(BRSRDetailsBase):
    """Full BRSR details document."""
    id: str
    org_id: str
    framework: str = "BRSR"
    created_at: str
    updated_at: Optional[str] = None


# =============================================================================
# Yearly Data Request/Response Models
# =============================================================================

class BRSRYearlyDataCreate(BRSRYearlyDetailsBase):
    """Create request for BRSR yearly data."""
    pass


class BRSRYearlyDataUpdate(BaseModel):
    """Partial update for BRSR yearly data."""
    paid_up_capital: Optional[float] = None
    export_contribution_percentage: Optional[float] = None
    customer_types_brief: Optional[str] = None
    business_activities: Optional[List[BusinessActivityRow]] = None
    products_services: Optional[List[ProductServiceRow]] = None
    plants_offices: Optional[List[PlantOfficeRow]] = None
    markets_served: Optional[List[MarketServedRow]] = None
    employee_worker_details: Optional[EmployeeWorkerDetailsRow] = None
    women_representation: Optional[List[WomenRepresentationRow]] = None
    holding_subsidiary_entities: Optional[List[HoldingSubsidiaryRow]] = None
    csr_applicability: Optional[CSRApplicabilityData] = None
    turnover_rate: Optional[TurnoverRateData] = None
    complaints_grievances: Optional[List[ComplaintGrievanceRow]] = None
    material_issues: Optional[List[MaterialIssueRow]] = None


class BRSRYearlyDataResponse(BRSRYearlyDetailsBase):
    """Full BRSR yearly data document."""
    id: str
    org_id: str
    framework: str = "BRSR"
    reporting_year: str
    created_at: str
    updated_at: Optional[str] = None


# =============================================================================
# Generic Framework Details Response
# =============================================================================

class FrameworkDetailsResponse(BaseModel):
    """Generic response for framework details."""
    id: str
    org_id: str
    framework: str
    details: dict
    created_at: str
    updated_at: Optional[str] = None


# Valid frameworks
VALID_FRAMEWORKS = ["BRSR", "GRI", "SBTi"]
