"""
Field-level validators for Scope 3 Bulk Upload
"""
from typing import Dict, List, Any, Optional, Tuple

from ..models import (
    ValidationError, ErrorSeverity, CalculationMethod,
    CATEGORY_COLUMNS, ACTIVITY_TYPES
)
from .base_validator import BaseValidator


class FieldValidator(BaseValidator):
    """Validates individual fields in upload rows"""
    
    async def validate_facility(self, facility_name: str, row_num: int, 
                                 sheet_name: str) -> Tuple[Optional[Dict], Optional[ValidationError]]:
        """
        Validate facility name and return facility data
        
        Returns:
            Tuple of (facility_dict, error)
        """
        if not facility_name:
            return None, ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Facility Name",
                error_type="MISSING_FACILITY",
                message="Facility name is required",
                severity=ErrorSeverity.ERROR
            )
        
        facilities = await self.get_facilities()
        facility_key = str(facility_name).lower().strip()
        
        if facility_key in facilities:
            return facilities[facility_key], None
        
        # Try fuzzy matching for suggestion
        from rapidfuzz import fuzz, process
        facility_names = list(facilities.keys())
        if facility_names:
            best_match = process.extractOne(facility_key, facility_names, scorer=fuzz.ratio)
            if best_match and best_match[1] >= 70:
                suggestion = f"Did you mean '{facilities[best_match[0]]['name']}'?"
            else:
                suggestion = f"Available facilities: {', '.join([f['name'] for f in list(facilities.values())[:5]])}"
        else:
            suggestion = "No facilities found for this organization"
        
        return None, ValidationError(
            sheet=sheet_name,
            row=row_num,
            column="Facility Name",
            error_type="INVALID_FACILITY",
            message=f"Facility '{facility_name}' not found",
            suggestion=suggestion,
            severity=ErrorSeverity.ERROR
        )
    
    def validate_activity_type(self, activity_type: str, category_code: str,
                                row_num: int, sheet_name: str) -> Tuple[Optional[str], Optional[ValidationError]]:
        """
        Validate activity type for C6 and C7
        
        Returns:
            Tuple of (validated_activity_type, error)
        """
        if category_code not in ["C6", "C7"]:
            return None, None
        
        if not activity_type:
            return None, ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Activity Type",
                error_type="MISSING_ACTIVITY_TYPE",
                message="Activity Type is required for this category",
                severity=ErrorSeverity.ERROR
            )
        
        valid_types = ACTIVITY_TYPES.get(category_code, [])
        valid_keys = [t["key"] for t in valid_types]
        valid_names = [t["name"].lower() for t in valid_types]
        
        at_clean = str(activity_type).lower().strip().replace(" ", "_")
        
        # Check by key
        if at_clean in valid_keys:
            return at_clean, None
        
        # Check by name
        at_name_clean = str(activity_type).lower().strip()
        for idx, name in enumerate(valid_names):
            if at_name_clean == name:
                return valid_keys[idx], None
        
        return None, ValidationError(
            sheet=sheet_name,
            row=row_num,
            column="Activity Type",
            error_type="INVALID_ACTIVITY_TYPE",
            message=f"Invalid activity type: '{activity_type}'",
            suggestion=f"Valid types: {', '.join([t['name'] for t in valid_types])}",
            severity=ErrorSeverity.ERROR
        )
    
    def validate_sub_category(self, sub_category: str, category_code: str,
                               available_subcategories: List[str],
                               row_num: int, sheet_name: str) -> Tuple[Optional[str], Optional[ValidationError]]:
        """
        Validate sub-category for categories that require it
        
        Returns:
            Tuple of (validated_subcategory, error)
        """
        config = CATEGORY_COLUMNS.get(category_code, {})
        if not config.get("has_subcategory"):
            return None, None
        
        if not sub_category:
            return None, ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Sub Category",
                error_type="MISSING_SUB_CATEGORY",
                message="Sub Category is required for this category",
                severity=ErrorSeverity.ERROR
            )
        
        sub_clean = str(sub_category).strip().lower()
        
        # Find matching subcategory (case-insensitive)
        for avail in available_subcategories:
            if avail.lower() == sub_clean:
                return avail, None
        
        return None, ValidationError(
            sheet=sheet_name,
            row=row_num,
            column="Sub Category",
            error_type="INVALID_SUB_CATEGORY",
            message=f"Invalid sub-category: '{sub_category}'",
            suggestion=f"Valid sub-categories: {', '.join(available_subcategories[:10])}",
            severity=ErrorSeverity.ERROR
        )
    
    def validate_unit(self, unit: str, allowed_units: List[str], 
                      field_name: str, row_num: int, 
                      sheet_name: str) -> Tuple[Optional[str], Optional[ValidationError]]:
        """
        Validate unit against allowed units
        
        Returns:
            Tuple of (validated_unit, error)
        """
        if not unit:
            return None, None  # Will be caught by mandatory check if required
        
        if not allowed_units:
            return str(unit).strip(), None  # No restrictions
        
        unit_clean = str(unit).strip()
        
        # Case-insensitive match
        for allowed in allowed_units:
            if unit_clean.lower() == allowed.lower():
                return allowed, None
        
        return None, ValidationError(
            sheet=sheet_name,
            row=row_num,
            column=field_name,
            error_type="INVALID_UNIT",
            message=f"Unit '{unit}' is not allowed for selected activity",
            suggestion=f"Allowed units: {', '.join(allowed_units)}",
            severity=ErrorSeverity.ERROR
        )
    
    def validate_c7_employee(self, row_data: Dict, row_num: int, 
                              sheet_name: str) -> List[ValidationError]:
        """
        Validate C7-specific employee fields
        
        Returns:
            List of validation errors
        """
        errors = []
        
        employee_name = row_data.get("employee_name")
        if not employee_name or (isinstance(employee_name, str) and not employee_name.strip()):
            errors.append(ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Employee Name",
                error_type="MISSING_EMPLOYEE_NAME",
                message="Employee Name is required for C7 - Employee Commuting",
                severity=ErrorSeverity.ERROR
            ))
        
        return errors
    
    def validate_c15_supplier_only(self, method: CalculationMethod, row_num: int,
                                    sheet_name: str) -> Optional[ValidationError]:
        """
        Validate that C15 only uses supplier_basis
        
        Returns:
            ValidationError if invalid, None if valid
        """
        if method != CalculationMethod.SUPPLIER_BASIS:
            return ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Calculation Method",
                error_type="INVALID_METHOD_FOR_C15",
                message=f"C15 - Investments only supports supplier_basis method, got: {method.value}",
                suggestion="Change calculation method to 'supplier_basis'",
                severity=ErrorSeverity.ERROR
            )
        return None
    
    def check_duplicate_row(self, row_data: Dict, category_code: str,
                            existing_keys: set, row_num: int,
                            sheet_name: str) -> Tuple[str, Optional[ValidationError]]:
        """
        Check for duplicate rows and generate unique key
        
        Returns:
            Tuple of (row_key, error_if_duplicate)
        """
        # Build unique key based on category
        key_parts = [
            str(row_data.get("facility_name", "")).lower().strip(),
            str(row_data.get("reporting_month", "")).lower().strip(),
            str(row_data.get("activity", "")).lower().strip(),
        ]
        
        # Add employee for C7
        if category_code == "C7":
            key_parts.append(str(row_data.get("employee_name", "")).lower().strip())
        
        # Add activity type for C6/C7
        if category_code in ["C6", "C7"]:
            key_parts.append(str(row_data.get("activity_type", "")).lower().strip())
        
        # Add sub-category if applicable
        config = CATEGORY_COLUMNS.get(category_code, {})
        if config.get("has_subcategory"):
            key_parts.append(str(row_data.get("sub_category", "")).lower().strip())
        
        row_key = "|".join(key_parts)
        
        if row_key in existing_keys:
            return row_key, ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Multiple",
                error_type="DUPLICATE_ROW",
                message="Duplicate row detected (same facility, month, activity combination)",
                suggestion="Remove duplicate row or ensure unique combinations",
                severity=ErrorSeverity.ERROR
            )
        
        return row_key, None
