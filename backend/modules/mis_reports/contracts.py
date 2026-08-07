"""Pydantic response contracts for the MIS Reports catalog foundation."""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


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
    categories: List[str]


class MISReportHistoryItemResponse(BaseModel):
    id: str
    template_id: str
    template_name: str
    status: str
    generated_at: str
    generated_by_email: Optional[str] = None


class MISReportHistoryResponse(BaseModel):
    items: List[MISReportHistoryItemResponse]


class EmissionsSummaryRequest(BaseModel):
    reporting_period_start: str
    reporting_period_end: str
    facility_ids: List[str] = Field(default_factory=list)
    scopes: List[str] = Field(default_factory=lambda: ["scope1", "scope2", "scope3", "biogenic"])
    categories: List[str] = Field(default_factory=list)


class EmissionsSummaryResponse(BaseModel):
    run_id: str
    generated_at: str
    filters: Dict[str, Any]
    total_emissions: float
    unit: str
    record_count: int
    scope_breakdown: List[Dict[str, Any]]
    category_breakdown: List[Dict[str, Any]]
    facility_breakdown: List[Dict[str, Any]]
    period_breakdown: List[Dict[str, Any]]


class MISScheduleCreate(BaseModel):
    name: str
    frequency: Literal["weekly", "monthly", "quarterly"]
    recipient_emails: List[EmailStr]
    filters: EmissionsSummaryRequest
    is_enabled: bool = True


class MISScheduleUpdate(BaseModel):
    name: Optional[str] = None
    frequency: Optional[Literal["weekly", "monthly", "quarterly"]] = None
    recipient_emails: Optional[List[EmailStr]] = None
    filters: Optional[EmissionsSummaryRequest] = None
    is_enabled: Optional[bool] = None


class MISScheduleResponse(BaseModel):
    id: str
    name: str
    frequency: str
    recipient_emails: List[str]
    filters: Dict[str, Any]
    is_enabled: bool
    next_run_at: Optional[str] = None
    last_run_at: Optional[str] = None
    created_at: str


class MISDeliveryResponse(BaseModel):
    id: str
    schedule_id: str
    recipient_email: str
    status: str
    sent_at: str
    error: Optional[str] = None