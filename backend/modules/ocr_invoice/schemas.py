"""Pydantic contracts for the OCR module."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class LineItemEdit(BaseModel):
    invoice_number: Optional[str] = None
    vendor_name: Optional[str] = None
    item_description: Optional[str] = None
    scope: Optional[str] = None
    category: Optional[str] = None
    category_key: Optional[str] = None
    category_code: Optional[str] = None
    facility_id: Optional[str] = None
    subcategory: Optional[str] = None
    fuel_name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    distance_km: Optional[float] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    cost: Optional[float] = None
    currency: Optional[str] = None
    billing_period_start: Optional[str] = None
    billing_period_end: Optional[str] = None
    billing_period_text: Optional[str] = None
    reporting_period: Optional[str] = None
    ef_method: Optional[str] = None
    ef_database: Optional[str] = None
    ef_lookup_key: Optional[str] = None
    factor_id: Optional[str] = None
    fuel_id: Optional[str] = None
    scope3_ef_id: Optional[str] = None
    naics_code: Optional[str] = None
    naics_label: Optional[str] = None
    accounting_rationale: Optional[str] = None
    scope3_activity_type: Optional[str] = None
    dynamic_field_values: Optional[Dict[str, Dict[str, Any]]] = None
    remember_override: bool = Field(default=False)


class FileFacilityAssignment(BaseModel):
    file_index: int = Field(ge=0)
    facility_id: str = Field(min_length=1)


class UploadFacilityAssignments(BaseModel):
    assignments: List[FileFacilityAssignment] = Field(min_length=1)


class FinalizeImportRequest(BaseModel):
    line_item_id: str
    emission_record_ids: List[str] = Field(default_factory=list)


class FinalizeWaterImportRequest(BaseModel):
    line_item_id: str
    esg_record_id: str
