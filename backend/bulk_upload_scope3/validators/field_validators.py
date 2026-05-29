"""
Field-level validators for Scope 3 Bulk Upload
"""
from typing import Dict, List, Any, Optional, Tuple

from ..models import (
    ValidationError, ErrorSeverity, CalculationMethod,
    CATEGORY_COLUMNS
)
from .base_validator import BaseValidator

# Valid subcategories for C8, C10, C11, C13, C14 (matching frontend EmissionEntryForm.js)
VALID_SUBCATEGORIES = [
    'stationary_combustion',
    'mobile_combustion', 
    'fugitive_emissions',
    'electricity',
    'process_emissions'  # Only for supplier_basis
]


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
    
    async def validate_activity_type(self, activity_type: str, category_code: str,
                                row_num: int, sheet_name: str) -> Tuple[Optional[str], Optional[ValidationError]]:
        """
        Validate activity type for C6 and C7 by fetching from database
        (matching frontend EmissionEntryForm.js logic)
        
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
        
        # Fetch activity types from database (like frontend does)
        activities = await self.get_activities(category_code)
        valid_activity_types = set()
        for act in activities:
            if act.get("activity_type"):
                valid_activity_types.add(act.get("activity_type"))
        
        at_clean = str(activity_type).lower().strip().replace(" ", "_")
        
        # Check by key (e.g., "taxi_travel")
        if at_clean in valid_activity_types:
            return at_clean, None
        
        # Check by display name (e.g., "Taxi Travel" -> "taxi_travel")
        at_name_clean = str(activity_type).lower().strip()
        for valid_type in valid_activity_types:
            # Convert key to display name for comparison
            display_name = valid_type.replace("_", " ")
            if at_name_clean == display_name:
                return valid_type, None
        
        # Format valid types for suggestion
        valid_types_display = sorted([t.replace("_", " ").title() for t in valid_activity_types])
        
        return None, ValidationError(
            sheet=sheet_name,
            row=row_num,
            column="Activity Type",
            error_type="INVALID_ACTIVITY_TYPE",
            message=f"Invalid activity type: '{activity_type}'",
            suggestion=f"Valid types: {', '.join(valid_types_display)}",
            severity=ErrorSeverity.ERROR
        )
    
    def validate_sub_category(self, sub_category: str, category_code: str,
                               method: CalculationMethod,
                               row_num: int, sheet_name: str) -> Tuple[Optional[str], Optional[ValidationError]]:
        """
        Validate sub-category for categories that require it (C8, C10, C11, C13, C14)
        Uses hardcoded valid subcategories matching frontend EmissionEntryForm.js
        
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
        
        sub_clean = str(sub_category).strip().lower().replace(" ", "_")
        
        # Valid subcategories (matching frontend)
        valid_subcats = ['stationary_combustion', 'mobile_combustion', 'fugitive_emissions', 'electricity']
        
        # For supplier_basis, also allow process_emissions
        if method == CalculationMethod.SUPPLIER_BASIS:
            valid_subcats.append('process_emissions')
        
        # Check if subcategory is valid
        if sub_clean in valid_subcats:
            return sub_clean, None
        
        # Also check display name format (e.g., "Stationary Combustion")
        for valid_sub in valid_subcats:
            display_name = valid_sub.replace("_", " ").lower()
            if sub_clean.replace("_", " ") == display_name:
                return valid_sub, None
        
        valid_display = [s.replace("_", " ").title() for s in valid_subcats]
        return None, ValidationError(
            sheet=sheet_name,
            row=row_num,
            column="Sub Category",
            error_type="INVALID_SUB_CATEGORY",
            message=f"Invalid sub-category: '{sub_category}'",
            suggestion=f"Valid sub-categories: {', '.join(valid_display)}",
            severity=ErrorSeverity.ERROR
        )

    # ─────────────────────────────────────────────────────────────────────
    # C11 — Type Of Product (decision-tree fork)
    # Display labels accepted in the bulk template are mapped to the
    # internal codes the calculation engine's decision tree expects.
    # Keep this map in sync with the C11 decision tree under
    # `db.ce_decision_trees` (field_name: "type_of_product").
    # ─────────────────────────────────────────────────────────────────────
    TYPE_OF_PRODUCT_LABEL_TO_CODE = {
        "energy-consuming product over lifetime": "continuous_usage",
        "energy consuming product over lifetime": "continuous_usage",
        "one-time use": "one_time_use",
        "one time use": "one_time_use",
    }

    def validate_type_of_product(self, type_of_product: str, category_code: str,
                                  method: CalculationMethod,
                                  row_num: int, sheet_name: str
                                  ) -> Tuple[Optional[str], Optional[ValidationError]]:
        """
        Validate the C11 `Type Of Product` column. Accepts display labels only
        (per product spec) and returns the internal code expected by the
        decision tree (`continuous_usage` / `one_time_use`).

        Only enforced for C11; other categories return (None, None).
        """
        if category_code != "C11":
            return None, None

        # The decision tree only branches on type_of_product when
        # calculation_method is activity_basis (spend/supplier paths skip it).
        if method != CalculationMethod.ACTIVITY_BASIS:
            return None, None

        if not type_of_product or str(type_of_product).strip() == "":
            return None, ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Type Of Product",
                error_type="MISSING_TYPE_OF_PRODUCT",
                message="Type Of Product is required for C11 activity-basis rows",
                suggestion="Enter one of: 'Energy-consuming product over lifetime', 'One-time use'",
                severity=ErrorSeverity.ERROR
            )

        key = str(type_of_product).strip().lower()
        internal_code = self.TYPE_OF_PRODUCT_LABEL_TO_CODE.get(key)
        if internal_code:
            return internal_code, None

        return None, ValidationError(
            sheet=sheet_name,
            row=row_num,
            column="Type Of Product",
            error_type="INVALID_TYPE_OF_PRODUCT",
            message=f"Invalid Type Of Product: '{type_of_product}'",
            suggestion="Allowed: 'Energy-consuming product over lifetime', 'One-time use'",
            severity=ErrorSeverity.ERROR
        )

    def validate_c11_continuous_usage_fields(self, row_data: Dict, row_num: int,
                                              sheet_name: str) -> List[ValidationError]:
        """
        When `type_of_product == continuous_usage`, three extra columns become
        mandatory (matches the manual C11 form):
          - units_produced
          - products_expected_usage
          - products_expected_usage_unit
        Called only after `validate_type_of_product` has normalized the value
        into `row_data["type_of_product"]`.
        """
        errors: List[ValidationError] = []
        if row_data.get("type_of_product") != "continuous_usage":
            return errors

        required = [
            ("units_produced", "No. of products Manufactured"),
            ("products_expected_usage", "Lifetime Expected Usage of the product"),
            ("products_expected_usage_unit", "Unit of expected lifetime usage"),
        ]
        for key, display in required:
            value = row_data.get(key)
            if value is None or value == "" or (isinstance(value, str) and value.strip() == ""):
                errors.append(ValidationError(
                    sheet=sheet_name,
                    row=row_num,
                    column=display,
                    error_type="MISSING_MANDATORY_FIELD",
                    message=f"'{display}' is required when Type Of Product is 'Energy-consuming product over lifetime'",
                    suggestion=f"Please enter a value for {display}",
                    severity=ErrorSeverity.ERROR
                ))
        return errors


    
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
        # Use `or ""` pattern to handle None values from Excel cells
        key_parts = [
            (str(row_data.get("facility_name") or "")).lower().strip(),
            (str(row_data.get("reporting_month") or "")).lower().strip(),
            (str(row_data.get("activity") or "")).lower().strip(),
        ]
        
        # Add employee for C7
        if category_code == "C7":
            key_parts.append((str(row_data.get("employee_name") or "")).lower().strip())
        
        # Add activity type for C6/C7
        if category_code in ["C6", "C7"]:
            key_parts.append((str(row_data.get("activity_type") or "")).lower().strip())
        
        # Add sub-category if applicable
        config = CATEGORY_COLUMNS.get(category_code, {})
        if config.get("has_subcategory"):
            key_parts.append((str(row_data.get("sub_category") or "")).lower().strip())
        
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
