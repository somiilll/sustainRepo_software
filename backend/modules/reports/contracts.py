"""Pydantic response contracts for the MIS Reports catalog foundation."""
from typing import List, Optional

from pydantic import BaseModel, Field


class MISReportTemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    status: str
    available: bool
    action_label: Optional[str] = None
    required_modules: List[str] = Field(default_factory=list)


class MISReportCatalogResponse(BaseModel):
    can_generate_reports: bool
    organization_name: Optional[str] = None
    templates: List[MISReportTemplateResponse]


class MISFacilityFilterOption(BaseModel):
    id: str
    name: str


class MISReportFilterSchemaResponse(BaseModel):
    reporting_period_format: str
    supports_financial_year: bool
    supports_calendar_year: bool
    facilities: List[MISFacilityFilterOption]
    available_scopes: List[str]


class MISReportHistoryItemResponse(BaseModel):
    id: str
    template_id: str
    template_name: str
    status: str
    generated_at: str
    generated_by_email: Optional[str] = None


class MISReportHistoryResponse(BaseModel):
    items: List[MISReportHistoryItemResponse]