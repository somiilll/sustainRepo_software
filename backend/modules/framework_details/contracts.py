"""
Framework Details Contracts

Pydantic models for framework-specific organization details.
Currently implements BRSR. Future frameworks (GRI, SBTi) can be added modularly.
"""

from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# BRSR Dynamic Table Row Models
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
# BRSR Details Models
# =============================================================================

class BRSRDetailsBase(BaseModel):
    """Base BRSR organization details fields."""
    
    # Basic Information Fields (all optional for partial saves)
    cin: str = Field(default="", description="Corporate Identity Number")
    listed_entity_name: str = Field(default="", description="Name of the Listed Entity")
    year_of_incorporation: int = Field(default=2024, ge=1800, le=2100, description="Year of Incorporation")
    
    # Address fields (reusing org structure)
    corporate_address: str = Field(default="", description="Corporate Address")
    city: str = Field(default="", description="City")
    state: str = Field(default="", description="State")
    country: str = Field(default="India", description="Country")
    pincode: str = Field(default="", description="6-digit PIN code")
    
    email: Optional[str] = Field(default="", description="E-mail")
    telephone: str = Field(default="", description="Telephone")
    website: str = Field(default="", description="Website URL")
    
    paid_up_capital: float = Field(default=0, ge=0, description="Paid-up Capital (INR)")
    assurance_provider: str = Field(default="", description="Name of Assurance Provider")
    assurance_type: str = Field(default="", description="Type of Assurance Obtained")
    export_contribution_percentage: float = Field(default=0, ge=0, le=100, description="Contribution of exports as % of total turnover")
    customer_types_brief: str = Field(default="", description="Brief on types of customers")
    
    # Radio Button Fields
    stock_exchange: Literal["BSE", "NSE", "Both NSE & BSE"] = Field(default="BSE", description="Stock Exchange where shares are listed")
    reporting_boundary: Literal["Standalone", "Consolidated"] = Field(default="Standalone", description="Reporting Boundary")
    
    # Dynamic Table Fields
    business_activities: List[BusinessActivityRow] = Field(
        default_factory=list,
        description="Business Activities accounting for 90% of turnover"
    )
    products_services: List[ProductServiceRow] = Field(
        default_factory=list,
        description="Products/Services accounting for 90% of turnover"
    )
    plants_offices: List[PlantOfficeRow] = Field(
        default_factory=list,
        description="Plants and Offices operated"
    )
    markets_served: List[MarketServedRow] = Field(
        default_factory=list,
        description="Markets served by entity"
    )

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
            # Auto-add https if missing
            return f'https://{v}'
        return v
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        # Allow empty string
        if not v or v == "":
            return v
        # Basic email validation
        import re
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', v):
            raise ValueError('Invalid email format')
        return v


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
