"""
Pydantic models for Scope 3 Bulk Upload System
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class CalculationMethod(str, Enum):
    ACTIVITY_BASIS = "activity_basis"
    SPEND_BASIS = "spend_basis"
    SUPPLIER_BASIS = "supplier_basis"


class ErrorSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


class UploadStatus(str, Enum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL_SUCCESS = "partial_success"


class CategoryConfig(BaseModel):
    """Configuration for each Scope 3 category"""
    code: str  # C1, C2, etc.
    name: str
    sheet_name: str
    supported_methods: List[CalculationMethod]
    has_activity_type: bool = False
    has_subcategory: bool = False
    columns: List[Dict[str, Any]]
    mandatory_fields: Dict[str, List[str]]  # method -> required fields


class ValidationError(BaseModel):
    """Single validation error"""
    sheet: str
    row: int
    column: Optional[str] = None
    error_type: str
    message: str
    suggestion: Optional[str] = None
    severity: ErrorSeverity = ErrorSeverity.ERROR


class RowResult(BaseModel):
    """Result of processing a single row"""
    sheet: str
    row: int
    success: bool
    emission_id: Optional[str] = None
    co2e: Optional[float] = None
    errors: List[ValidationError] = []
    warnings: List[ValidationError] = []


class UploadSummary(BaseModel):
    """Summary of bulk upload job"""
    job_id: str
    status: UploadStatus
    total_rows: int = 0
    success_count: int = 0
    error_count: int = 0
    warning_count: int = 0
    categories_processed: List[str] = []
    total_emissions_tco2e: float = 0.0
    errors: List[ValidationError] = []
    warnings: List[ValidationError] = []
    results: List[RowResult] = []
    created_emission_ids: List[str] = []


class BulkUploadJob(BaseModel):
    """Database model for bulk upload job"""
    id: str
    organization_id: str
    facility_id: Optional[str] = None
    uploaded_by: str
    uploaded_at: datetime
    filename: str
    status: UploadStatus
    total_rows: int = 0
    success_count: int = 0
    error_count: int = 0
    warning_count: int = 0
    categories_processed: List[str] = []
    total_emissions_tco2e: float = 0.0
    allow_partial_success: bool = True
    created_emission_ids: List[str] = []


class ActivityMatch(BaseModel):
    """Result of activity matching"""
    matched: bool
    activity_name: Optional[str] = None
    activity_id: Optional[str] = None
    confidence: float = 0.0
    is_fuzzy_match: bool = False
    suggestions: List[str] = []
    recommend_supplier_basis: bool = False


class FormulaValidation(BaseModel):
    """Result of formula validation"""
    valid: bool
    formula_id: Optional[str] = None
    formula_name: Optional[str] = None
    missing_inputs: List[str] = []
    invalid_units: List[Dict[str, str]] = []
    allowed_units: List[str] = []


# Category column definitions
CATEGORY_COLUMNS = {
    "C1": {
        "code": "C1",
        "name": "Purchased Goods and Services",
        "sheet_name": "C1",
        "sheet_name_aliases": ["C1-PurchasedGoods", "C1 - Purchased Goods", "C1-Purchased Goods and Services"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SPEND_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Spent Amount (INR)", "key": "spent_amount", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity Used", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text", "skip_validation": True},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Inflation Rate", "key": "inflation_rate", "mandatory": False, "type": "number"},
            {"name": "Purchase Power Value", "key": "purchase_power_value", "mandatory": False, "type": "number"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity", "quantity_used", "unit_quantity"],
            "spend_basis": ["facility_name", "calculation_method", "activity", "spent_amount"],
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef"],
        }
    },
    "C2": {
        "code": "C2",
        "name": "Capital Goods",
        "sheet_name": "C2", "sheet_name_aliases": ["C2-CapitalGoods", "C2 - Capital Goods"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SPEND_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Spent Amount (INR)", "key": "spent_amount", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity Used", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Inflation Rate", "key": "inflation_rate", "mandatory": False, "type": "number"},
            {"name": "Purchase Power Value", "key": "purchase_power_value", "mandatory": False, "type": "number"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity", "quantity_used", "unit_quantity"],
            "spend_basis": ["facility_name", "calculation_method", "activity", "spent_amount"],
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C3": {
        "code": "C3",
        "name": "Fuel and Energy Related Activities Not Included in Scope 1 or Scope 2",
        "sheet_name": "C3", "sheet_name_aliases": ["C3-FuelEnergy", "C3 - Fuel and Energy", "C3 - Fuel and Energy Related Activities"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity Used", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C4": {
        "code": "C4",
        "name": "Upstream Transportation and Distribution",
        "sheet_name": "C4", "sheet_name_aliases": ["C4-UpstreamTransport", "C4 - Upstream Transport"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SPEND_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Distance Travelled (km)", "key": "distance_travelled", "mandatory": False, "type": "number"},
            {"name": "Spent Amount (INR)", "key": "spent_amount", "mandatory": False, "type": "number"},
            {"name": "Quantity of Goods Travelled", "key": "quantity_goods", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity of Goods", "key": "unit_goods", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Inflation Rate", "key": "inflation_rate", "mandatory": False, "type": "number"},
            {"name": "Purchase Power Value", "key": "purchase_power_value", "mandatory": False, "type": "number"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity", "distance_travelled", "quantity_goods", "unit_goods"],
            "spend_basis": ["facility_name", "calculation_method", "activity", "spent_amount"],
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C5": {
        "code": "C5",
        "name": "Waste Generated in Operations",
        "sheet_name": "C5", "sheet_name_aliases": ["C5-Waste", "C5 - Waste"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C6": {
        "code": "C6",
        "name": "Business Travel",
        "sheet_name": "C6", "sheet_name_aliases": ["C6-BusinessTravel", "C6 - Business Travel"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": True,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity Type", "key": "activity_type", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Distance Travelled (km)", "key": "distance_travelled", "mandatory": False, "type": "number"},
            {"name": "Passengers Travelled", "key": "passengers", "mandatory": False, "type": "number"},
            {"name": "No. of Rooms Taken", "key": "rooms", "mandatory": False, "type": "number"},
            {"name": "No. of Nights Stayed", "key": "nights", "mandatory": False, "type": "number"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Employee Name", "key": "employee_name", "mandatory": False, "type": "text"},
            {"name": "Employee Id", "key": "employee_id", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity_type", "activity"],
            "supplier_basis": ["facility_name", "calculation_method", "activity_type", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C7": {
        "code": "C7",
        "name": "Employee Commuting",
        "sheet_name": "C7", "sheet_name_aliases": ["C7-EmployeeCommuting", "C7 - Employee Commuting"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": True,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity Type", "key": "activity_type", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Distance Travelled (km)", "key": "distance_travelled", "mandatory": False, "type": "number"},
            {"name": "Passengers Travelled", "key": "passengers", "mandatory": False, "type": "number"},
            {"name": "No. of Working Days", "key": "working_days", "mandatory": False, "type": "number"},
            {"name": "Working Hours per Day", "key": "working_hours", "mandatory": False, "type": "number"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Inflation Rate", "key": "inflation_rate", "mandatory": False, "type": "number"},
            {"name": "Purchase Power Value", "key": "purchase_power_value", "mandatory": False, "type": "number"},
            {"name": "Employee Name", "key": "employee_name", "mandatory": True, "type": "text"},
            {"name": "Employee Id", "key": "employee_id", "mandatory": False, "type": "text"},
            {"name": "Department", "key": "department", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity_type", "activity", "employee_name"],
            "supplier_basis": ["facility_name", "calculation_method", "activity_type", "activity", "employee_name", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C8": {
        "code": "C8",
        "name": "Upstream Leased Assets",
        "sheet_name": "C8", "sheet_name_aliases": ["C8-UpstreamLeased", "C8 - Upstream Leased Assets"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": True,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Sub Category", "key": "sub_category", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "sub_category", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "sub_category", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C9": {
        "code": "C9",
        "name": "Downstream Transportation and Distribution",
        "sheet_name": "C9", "sheet_name_aliases": ["C9-DownstreamTransport", "C9 - Downstream Transport"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SPEND_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Distance Travelled (km)", "key": "distance_travelled", "mandatory": False, "type": "number"},
            {"name": "Spent Amount (INR)", "key": "spent_amount", "mandatory": False, "type": "number"},
            {"name": "Quantity of Goods Travelled", "key": "quantity_goods", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity of Goods", "key": "unit_goods", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Inflation Rate", "key": "inflation_rate", "mandatory": False, "type": "number"},
            {"name": "Purchase Power Value", "key": "purchase_power_value", "mandatory": False, "type": "number"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity", "distance_travelled", "quantity_goods", "unit_goods"],
            "spend_basis": ["facility_name", "calculation_method", "activity", "spent_amount"],
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C10": {
        "code": "C10",
        "name": "Processing of Sold Products",
        "sheet_name": "C10", "sheet_name_aliases": ["C10-ProcessingSold", "C10 - Processing of Sold Products"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": True,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Sub Category", "key": "sub_category", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "sub_category", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "sub_category", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C11": {
        "code": "C11",
        "name": "Use of Sold Products",
        "sheet_name": "C11", "sheet_name_aliases": ["C11-UseSoldProducts", "C11 - Use of Sold Products"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": True,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Sub Category", "key": "sub_category", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "sub_category", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "sub_category", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C12": {
        "code": "C12",
        "name": "End-of-Life Treatment of Sold Products",
        "sheet_name": "C12", "sheet_name_aliases": ["C12-EndOfLife", "C12 - End-of-Life"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C13": {
        "code": "C13",
        "name": "Downstream Leased Assets",
        "sheet_name": "C13", "sheet_name_aliases": ["C13-DownstreamLeased", "C13 - Downstream Leased Assets"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": True,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Sub Category", "key": "sub_category", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "sub_category", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "sub_category", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C14": {
        "code": "C14",
        "name": "Franchises",
        "sheet_name": "C14", "sheet_name_aliases": ["C14-Franchises", "C14 - Franchises"],
        "supported_methods": [CalculationMethod.ACTIVITY_BASIS, CalculationMethod.SUPPLIER_BASIS],
        "has_activity_type": False,
        "has_subcategory": True,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Sub Category", "key": "sub_category", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "dropdown"},
            {"name": "Quantity Used", "key": "quantity_used", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity", "key": "unit_quantity", "mandatory": False, "type": "dropdown"},
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": False, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": False, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": False, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": False, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "activity_basis": ["facility_name", "calculation_method", "sub_category", "activity", "quantity_used", "unit_quantity"],
            "supplier_basis": ["facility_name", "calculation_method", "sub_category", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
    "C15": {
        "code": "C15",
        "name": "Investments",
        "sheet_name": "C15", "sheet_name_aliases": ["C15-Investments", "C15 - Investments"],
        "supported_methods": [CalculationMethod.SUPPLIER_BASIS],  # Only supplier_basis
        "has_activity_type": False,
        "has_subcategory": False,
        "columns": [
            {"name": "Facility Name", "key": "facility_name", "mandatory": True, "type": "dropdown"},
            {"name": "Reporting Month", "key": "reporting_month", "mandatory": False, "type": "text", "format": "MMM-YYYY", "aliases": ["Reporting Month (YYYY-MM)", "Reporting Month (MMM-YYYY)"]},
            {"name": "Reporting Year", "key": "reporting_year", "mandatory": False, "type": "text", "format": "FY YYYY-YYYY or CY YYYY", "aliases": ["Reporting Year (FY YYYY-YYYY or CY YYYY)", "Reporting Year\n(FY YYYY- YYYY or CY YYYY)", "Reporting Year (FY YYYY- YYYY or CY YYYY)"]},
            {"name": "Calculation Method", "key": "calculation_method", "mandatory": True, "type": "dropdown"},
            {"name": "Activity", "key": "activity", "mandatory": True, "type": "text"},  # Custom activity only
            {"name": "Quantity (Supplier Based)", "key": "supplier_quantity", "mandatory": True, "type": "number"},
            {"name": "Unit of Quantity (Supplier Based)", "key": "supplier_unit", "mandatory": True, "type": "text"},
            {"name": "Emission Factor (Supplier Based)", "key": "supplier_ef", "mandatory": True, "type": "number"},
            {"name": "Emission Factor Unit (Supplier Based)", "key": "supplier_ef_unit", "mandatory": True, "type": "text"},
            {"name": "Supplier Name", "key": "supplier_name", "mandatory": False, "type": "text"},
            {"name": "Supplier Code", "key": "supplier_code", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Name", "key": "responsible_person", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Designation", "key": "responsible_designation", "mandatory": False, "type": "text"},
            {"name": "Person Responsible Contact", "key": "responsible_contact", "mandatory": False, "type": "text"},
            {"name": "Notes", "key": "notes", "mandatory": False, "type": "text"},
        ],
        "mandatory_fields": {
            "supplier_basis": ["facility_name", "calculation_method", "activity", "supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"],
        }
    },
}


# Activity type mappings for C6 and C7
ACTIVITY_TYPES = {
    "C6": [
        {"key": "air_travel", "name": "Air Travel"},
        {"key": "rail_travel", "name": "Rail Travel"},
        {"key": "taxi_travel", "name": "Taxi Travel"},
        {"key": "bus_travel", "name": "Bus Travel"},
        {"key": "car_travel", "name": "Car Travel"},
        {"key": "hotel_stay", "name": "Hotel Stay"},
    ],
    "C7": [
        {"key": "car_travel", "name": "Car Travel"},
        {"key": "bike_travel", "name": "Bike Travel"},
        {"key": "bus_travel", "name": "Bus Travel"},
        {"key": "rail_travel", "name": "Rail Travel"},
        {"key": "wfh", "name": "Work From Home"},
    ]
}


# Common units for different categories
COMMON_UNITS = {
    "mass": ["t", "kg", "g"],
    "volume": ["L", "ml", "kl", "m3", "cm3"],
    "energy": ["kWh", "MWh", "GWh"],
    "distance": ["km"],
    "transport": ["tonne.km", "kg.km"],
    "currency": ["INR", "USD", "EUR"],
}
