"""C7 Employee Commuting Pydantic contracts (monthly + yearly variants)."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class C7MonthlyEntryCreate(BaseModel):
    """Create/Update a single month's C7 entry"""
    entry_id: Optional[str] = None  # If provided, UPDATE existing record; if None, CREATE new record
    facility_id: str
    reporting_year: int
    reporting_month: str  # jan, feb, mar, etc.
    calculation_method: str  # activity_basis, supplier_basis
    activity_type: str  # car_travel, bus_travel, etc.
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    formula_id: Optional[str] = None
    formula_name: Optional[str] = None
    employees: List[Dict[str, Any]]
    notes: Optional[str] = None
    record_source: Optional[str] = None
    submission_batch_id: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []


class C7MonthlyEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    facility_name: Optional[str] = None
    organization_id: str
    scope: str = "scope3"
    category: str = "C7 - Employee Commuting"
    reporting_year: int
    reporting_month: str
    reporting_period: str
    calculation_method: str
    activity_type: str
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    employees: List[Dict[str, Any]]
    monthly_total: Dict[str, Any]
    notes: Optional[str] = None
    record_source: Optional[str] = None
    responsible_person: Optional[str] = None
    version: int = 1
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class C7YearlyEntryCreate(BaseModel):
    """Create/Update a yearly C7 entry (one annual value per employee)"""
    entry_id: Optional[str] = None
    facility_id: str
    reporting_year: str  # "CY2025" or "FY 2025-2026"
    calculation_method: str
    activity_type: str
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    formula_id: Optional[str] = None
    formula_name: Optional[str] = None
    employees: List[Dict[str, Any]]
    notes: Optional[str] = None
    record_source: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_person_designation: Optional[str] = None
    responsible_person_contact: Optional[str] = None
    process_names: Optional[List[str]] = []
    process_descriptions: Optional[List[Dict[str, str]]] = []


class C7YearlyEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    facility_name: Optional[str] = None
    organization_id: str
    scope: str = "scope3"
    category: str = "C7 - Employee Commuting"
    frequency_type: str = "yearly"
    reporting_period: str
    reporting_year: str
    calculation_method: str
    activity_type: str
    activity_id: Optional[str] = None
    activity_name: Optional[str] = None
    employees: List[Dict[str, Any]]
    yearly_total: Dict[str, Any]
    notes: Optional[str] = None
    record_source: Optional[str] = None
    responsible_person: Optional[str] = None
    version: int = 1
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
