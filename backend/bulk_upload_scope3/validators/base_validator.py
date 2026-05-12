"""
Base validator class for Scope 3 Bulk Upload
"""
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import re

from ..models import (
    ValidationError, ErrorSeverity, CalculationMethod,
    CATEGORY_COLUMNS, ACTIVITY_TYPES
)


class BaseValidator:
    """Base class for all validators"""
    
    def __init__(self, db, organization_id: str):
        self.db = db
        self.organization_id = organization_id
        self._facilities_cache = None
        self._activities_cache = {}
        self._categories_cache = None
    
    async def get_facilities(self) -> Dict[str, Dict]:
        """Get facilities mapped by name (case-insensitive)"""
        if self._facilities_cache is None:
            facilities = await self.db.facilities.find(
                {"organization_id": self.organization_id, "is_active": {"$ne": False}},
                {"_id": 0}
            ).to_list(1000)
            self._facilities_cache = {f["name"].lower().strip(): f for f in facilities}
        return self._facilities_cache
    
    async def get_activities(self, category_code: str) -> List[Dict]:
        """Get activities for a category"""
        if category_code not in self._activities_cache:
            # Map category code to full category name pattern
            category_pattern = f"^{category_code}\\s*-"
            
            activities = await self.db.scope3_ef.find(
                {"category": {"$regex": category_pattern, "$options": "i"}},
                {"_id": 0}
            ).to_list(10000)
            self._activities_cache[category_code] = activities
        return self._activities_cache[category_code]
    
    async def get_categories(self) -> Dict[str, Dict]:
        """Get ce_categories mapped by code"""
        if self._categories_cache is None:
            categories = await self.db.ce_categories.find(
                {"scope_code": "scope3"},
                {"_id": 0}
            ).to_list(100)
            self._categories_cache = {}
            for cat in categories:
                # Extract code from name
                name = cat.get("name", "")
                code = name.split(" - ")[0].strip() if " - " in name else name[:3]
                self._categories_cache[code] = cat
        return self._categories_cache
    
    def parse_reporting_month(self, value: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Parse reporting month string to standardized format
        
        Args:
            value: Month string like "Jan-2025", "January 2025", "2025-01", etc.
            
        Returns:
            Tuple of (standardized_format, error_message)
        """
        if not value:
            return None, "Reporting month is required"
        
        value = str(value).strip()
        
        # Common patterns
        patterns = [
            (r'^([A-Za-z]{3})-(\d{4})$', lambda m: f"{m.group(1).capitalize()}-{m.group(2)}"),  # Jan-2025
            (r'^([A-Za-z]+)\s+(\d{4})$', lambda m: f"{m.group(1)[:3].capitalize()}-{m.group(2)}"),  # January 2025
            (r'^(\d{4})-(\d{2})$', lambda m: f"{self._month_num_to_name(m.group(2))}-{m.group(1)}"),  # 2025-01
            (r'^(\d{2})/(\d{4})$', lambda m: f"{self._month_num_to_name(m.group(1))}-{m.group(2)}"),  # 01/2025
        ]
        
        for pattern, formatter in patterns:
            match = re.match(pattern, value, re.IGNORECASE)
            if match:
                try:
                    result = formatter(match)
                    # Validate the result
                    month_abbr = result.split("-")[0]
                    if month_abbr.lower() in ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                                               'jul', 'aug', 'sep', 'oct', 'nov', 'dec']:
                        return result, None
                except (ValueError, AttributeError, IndexError):
                    pass
        
        return None, f"Invalid reporting month format: '{value}'. Use format like 'Jan-2025'"
    
    def parse_reporting_year(self, value: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Parse reporting year string to standardized format.
        Handles FY and CY formats with various spacing variations.
        
        Args:
            value: Year string like "FY 2025-2026", "FY2025 - 2026", "CY 2025", "CY2025", etc.
            
        Returns:
            Tuple of (standardized_format, year_type, error_message)
            year_type is 'financial_year' or 'calendar_year'
        """
        if not value:
            return None, None, "Reporting year is required"
        
        value = str(value).strip()
        
        # Normalize spacing around dashes
        normalized = re.sub(r'\s*-\s*', '-', value)
        # Normalize spacing between FY/CY and year
        normalized = re.sub(r'^(FY|CY)\s*', r'\1 ', normalized, flags=re.IGNORECASE)
        
        # FY patterns: "FY 2025-2026", "FY 2025-26", "FY2025-2026"
        fy_pattern = r'^FY\s*(\d{4})\s*-\s*(\d{2,4})$'
        fy_match = re.match(fy_pattern, normalized, re.IGNORECASE)
        
        if fy_match:
            start_year = fy_match.group(1)
            end_year = fy_match.group(2)
            
            # Normalize end year to 4 digits if needed
            if len(end_year) == 2:
                end_year = start_year[:2] + end_year
            
            # Validate year sequence
            if int(end_year) != int(start_year) + 1:
                return None, None, f"Invalid FY year range: end year should be {int(start_year) + 1}"
            
            standardized = f"FY {start_year}-{end_year}"
            return standardized, "financial_year", None
        
        # CY patterns: "CY 2025", "CY2025"
        cy_pattern = r'^CY\s*(\d{4})$'
        cy_match = re.match(cy_pattern, normalized, re.IGNORECASE)
        
        if cy_match:
            year = cy_match.group(1)
            standardized = f"CY {year}"
            return standardized, "calendar_year", None
        
        return None, None, f"Invalid reporting year format: '{value}'. Use 'FY 2025-2026' or 'CY 2025'"
    
    def _month_num_to_name(self, num_str: str) -> str:
        """Convert month number to 3-letter abbreviation"""
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        try:
            idx = int(num_str) - 1
            if 0 <= idx < 12:
                return months[idx]
        except (ValueError, IndexError):
            pass
        return num_str
    
    def parse_numeric(self, value: Any, field_name: str) -> Tuple[Optional[float], Optional[str]]:
        """
        Parse a value to float
        
        Returns:
            Tuple of (parsed_value, error_message)
        """
        if value is None or value == "" or (isinstance(value, str) and value.strip() == ""):
            return None, None  # Empty is allowed, will be caught by mandatory check
        
        try:
            parsed = float(value)
            if parsed < 0:
                return None, f"{field_name} must be a positive number"
            return parsed, None
        except (ValueError, TypeError):
            return None, f"{field_name} must be a valid number, got: '{value}'"
    
    def validate_calculation_method(self, method: str, category_code: str) -> Tuple[Optional[CalculationMethod], Optional[str]]:
        """
        Validate calculation method for a category
        
        Returns:
            Tuple of (CalculationMethod enum, error_message)
        """
        if not method:
            return None, "Calculation method is required"
        
        method_clean = str(method).strip().lower().replace(" ", "_").replace("-", "_")
        
        # Map display names to enum values
        # Includes Excel format mappings: Average_data_based, Spend_based, Supplier_based
        method_map = {
            # Standard names
            "activity_basis": CalculationMethod.ACTIVITY_BASIS,
            "activity_based": CalculationMethod.ACTIVITY_BASIS,
            "activitybasis": CalculationMethod.ACTIVITY_BASIS,
            "spend_basis": CalculationMethod.SPEND_BASIS,
            "spend_based": CalculationMethod.SPEND_BASIS,
            "spendbasis": CalculationMethod.SPEND_BASIS,
            "supplier_basis": CalculationMethod.SUPPLIER_BASIS,
            "supplier_based": CalculationMethod.SUPPLIER_BASIS,
            "supplierbasis": CalculationMethod.SUPPLIER_BASIS,
            # Excel format mappings
            "average_data_based": CalculationMethod.ACTIVITY_BASIS,
            "averagedatabased": CalculationMethod.ACTIVITY_BASIS,
            "average_data": CalculationMethod.ACTIVITY_BASIS,
        }
        
        calc_method = method_map.get(method_clean)
        if not calc_method:
            return None, f"Invalid calculation method: '{method}'. Use: Average_data_based (or activity_basis), Spend_based (or spend_basis), or Supplier_based (or supplier_basis)"
        
        # Check if method is supported for this category
        config = CATEGORY_COLUMNS.get(category_code)
        if config:
            supported = config.get("supported_methods", [])
            if calc_method not in supported:
                supported_names = [m.value for m in supported]
                return None, f"Calculation method '{calc_method.value}' is not supported for {category_code}. Supported: {', '.join(supported_names)}"
        
        return calc_method, None
    
    def get_mandatory_fields(self, category_code: str, method: CalculationMethod) -> List[str]:
        """Get list of mandatory field keys for a category and method"""
        config = CATEGORY_COLUMNS.get(category_code, {})
        mandatory_map = config.get("mandatory_fields", {})
        return mandatory_map.get(method.value, [])
    
    def validate_mandatory_fields(self, row_data: Dict, category_code: str, 
                                   method: CalculationMethod, row_num: int) -> List[ValidationError]:
        """Validate that all mandatory fields are present"""
        errors = []
        mandatory_fields = self.get_mandatory_fields(category_code, method)
        
        # Get column config for display names
        config = CATEGORY_COLUMNS.get(category_code, {})
        columns = {col["key"]: col["name"] for col in config.get("columns", [])}
        
        for field_key in mandatory_fields:
            value = row_data.get(field_key)
            if value is None or value == "" or (isinstance(value, str) and value.strip() == ""):
                display_name = columns.get(field_key, field_key)
                errors.append(ValidationError(
                    sheet=config.get("sheet_name", category_code),
                    row=row_num,
                    column=display_name,
                    error_type="MISSING_MANDATORY_FIELD",
                    message=f"'{display_name}' is required for {method.value}",
                    suggestion=f"Please enter a value for {display_name}",
                    severity=ErrorSeverity.ERROR
                ))
        
        return errors
    
    def check_supplier_fields_warning(self, row_data: Dict, method: CalculationMethod, 
                                       category_code: str, row_num: int) -> List[ValidationError]:
        """Check if supplier fields are filled for non-supplier methods (warning)"""
        warnings = []
        
        if method == CalculationMethod.SUPPLIER_BASIS:
            return warnings
        
        # Check if any supplier field has data
        supplier_fields = ["supplier_quantity", "supplier_unit", "supplier_ef", "supplier_ef_unit"]
        has_supplier_data = any(row_data.get(f) for f in supplier_fields)
        
        if has_supplier_data:
            config = CATEGORY_COLUMNS.get(category_code, {})
            warnings.append(ValidationError(
                sheet=config.get("sheet_name", category_code),
                row=row_num,
                column="Supplier Fields",
                error_type="SUPPLIER_FIELDS_IGNORED",
                message=f"Supplier emission factor fields will not be used with {method.value} method",
                suggestion="Choose 'supplier_basis' method if you want to use supplier-provided emission factors",
                severity=ErrorSeverity.WARNING
            ))
        
        return warnings
