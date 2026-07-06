"""
ESG Records Module - Contracts/Models

Reusable architecture for Environment, Social, and Governance records.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime


# =============================================================================
# ESG Section Types
# =============================================================================

ESG_SECTION = Literal["environment", "social", "governance"]

REPORTING_TYPE = Literal["daily", "monthly", "quarterly", "yearly"]

YEAR_TYPE = Literal["financial", "calendar"]

RECORD_LEVEL = Literal["organization", "facility"]


# =============================================================================
# Category Configs
# =============================================================================

class ESGRecordFieldConfig(BaseModel):
    """Configuration for a dynamic field in a category."""
    field_key: str
    type: Literal[
        "text", "textarea", "number", "dropdown", "yes_no", "date", 
        "file_upload", "unit_selector", "table", "radio", "checkbox_group"
    ]
    label: str
    required: bool = False
    placeholder: Optional[str] = None
    options: Optional[List[str]] = None  # For dropdown/unit_selector/radio/checkbox_group
    default_value: Optional[Any] = None
    validation: Optional[Dict[str, Any]] = None  # e.g., {"min": 0, "max": 100}
    # Table-specific config
    table_columns: Optional[List[Dict[str, Any]]] = None  # For table type: [{"key": "col1", "label": "Column 1", "type": "text"}]
    table_min_rows: Optional[int] = None
    table_max_rows: Optional[int] = None


class ESGRecordCategoryConfig(BaseModel):
    """Configuration for an ESG record category."""
    id: str
    section: ESG_SECTION
    category: str
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    frameworks: List[str] = ["BRSR"]  # Framework mappings
    allowed_reporting_types: List[REPORTING_TYPE] = ["daily", "monthly", "quarterly", "yearly"]
    fields: List[ESGRecordFieldConfig] = []
    is_active: bool = True
    order: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# =============================================================================
# Record Models
# =============================================================================

class ReportingPeriod(BaseModel):
    """Flexible reporting period supporting various formats."""
    reporting_type: REPORTING_TYPE
    # Daily
    date: Optional[str] = None  # YYYY-MM-DD
    time: Optional[str] = None  # HH:MM
    # Monthly
    year: Optional[int] = None
    month: Optional[str] = None  # "January", "February", etc.
    # Quarterly
    quarter: Optional[str] = None  # "Q1", "Q2", "Q3", "Q4"
    # Yearly
    year_type: Optional[YEAR_TYPE] = None
    financial_year: Optional[str] = None  # "FY 2025-26"
    calendar_year: Optional[str] = None  # "CY 2026"


class EvidenceFile(BaseModel):
    """Evidence file metadata."""
    id: str
    filename: str
    file_type: str  # pdf, image, excel, csv, doc
    file_size: int  # bytes
    upload_url: str
    uploaded_at: str
    uploaded_by: str


class ESGRecordBase(BaseModel):
    """Base model for ESG records (Environment, Social, Governance)."""
    id: str
    org_id: str
    facility_id: Optional[str] = None  # Nullable for org-level records
    record_level: RECORD_LEVEL
    section: ESG_SECTION
    
    # Category
    category_id: str  # Reference to esg_record_categories
    category: str
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    
    # Framework mappings
    frameworks: List[str] = ["BRSR"]
    
    # Reporting period
    reporting_period: ReportingPeriod
    
    # Dynamic field values
    field_values: Dict[str, Any] = {}
    
    # Common fields
    evidence_files: List[EvidenceFile] = []
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    
    # Versioning
    version: int = 1
    is_current: bool = True
    
    # Audit
    created_by: str
    created_at: str
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


class ESGRecordVersion(BaseModel):
    """Version snapshot of a record."""
    id: str
    record_id: str
    version: int
    section: ESG_SECTION
    
    # Full snapshot of record data at this version
    snapshot: Dict[str, Any]
    
    # Change tracking
    changed_fields: List[str] = []
    change_reason: Optional[str] = None
    
    # Audit
    created_by: str
    created_at: str


# =============================================================================
# API Request/Response Models
# =============================================================================

class CreateRecordRequest(BaseModel):
    """Request to create a new ESG record."""
    facility_id: Optional[str] = None
    record_level: RECORD_LEVEL
    category_id: str
    category: str
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    frameworks: List[str] = ["BRSR"]
    reporting_period: ReportingPeriod
    field_values: Dict[str, Any] = {}
    evidence_files: List[Dict[str, Any]] = []
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # 'draft' or 'completed' (default completed)


class UpdateRecordRequest(BaseModel):
    """Request to update an ESG record (creates new version)."""
    record_level: Optional[RECORD_LEVEL] = None
    facility_id: Optional[str] = None
    reporting_period: Optional[ReportingPeriod] = None
    field_values: Optional[Dict[str, Any]] = None
    evidence_files: Optional[List[Dict[str, Any]]] = None
    source_of_information: Optional[str] = None
    notes: Optional[str] = None
    change_reason: Optional[str] = None
    status: Optional[str] = None  # For resubmitting rejected records


class RecordListFilters(BaseModel):
    """Filters for listing records."""
    category: Optional[str] = None
    subcategory: Optional[str] = None
    reporting_type: Optional[REPORTING_TYPE] = None
    facility_id: Optional[str] = None
    framework: Optional[str] = None
    year: Optional[int] = None
    month: Optional[str] = None
    search: Optional[str] = None
    page: int = 1
    limit: int = 20
