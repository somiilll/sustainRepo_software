"""Facility Pydantic contracts."""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class FacilityCreate(BaseModel):
    name: str
    address: Optional[str] = None  # Optional for suppliers, required for regular users (validated in router)
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    products_services: Optional[str] = None
    machinery_equipment: Optional[str] = None
    process_description: Optional[str] = None
    sector: Optional[str] = None
    sub_sector: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    monitoring_frequency: str = "monthly"
    reporting_frequency: str = "monthly"
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None
    is_active: bool = True
    equity_share_percentage: Optional[float] = 100.0

    @field_validator('pincode')
    @classmethod
    def validate_pincode(cls, v):
        if v is not None and v != '':
            v = v.strip()
            if not v.isdigit() or len(v) != 6:
                raise ValueError('Pincode must be exactly 6 digits')
        return v

    @field_validator('equity_share_percentage')
    @classmethod
    def validate_equity_percentage(cls, v):
        if v is not None:
            if v <= 0 or v > 100:
                raise ValueError('Equity share percentage must be between 0 and 100')
        return v


class FacilityResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: Optional[str] = None  # Optional for suppliers
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    products_services: Optional[str] = None
    products_manufactured: Optional[str] = None
    machinery_equipment: Optional[str] = None
    machinery_used: Optional[str] = None
    process_description: Optional[str] = None
    sector: Optional[str] = None
    sub_sector: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    monitoring_frequency: Optional[str] = "monthly"
    reporting_frequency: Optional[str] = "monthly"
    organization_id: Optional[str] = None
    attachments: Optional[List[dict]] = None
    other_information: Optional[str] = None
    remarks: Optional[str] = None
    is_active: bool = True
    equity_share_percentage: Optional[float] = 100.0
    created_at: Optional[str] = None  # Also make optional for older records
