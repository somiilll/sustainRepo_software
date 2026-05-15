"""
Row Processor for Scope 3 Bulk Upload
Processes individual rows from uploaded Excel
"""
from typing import Dict, List, Optional, Tuple, Any

from ..models import (
    ValidationError, ErrorSeverity, RowResult, CalculationMethod,
    CATEGORY_COLUMNS
)
from ..validators import FieldValidator, ActivityMatcher, FormulaValidator
from ..validators.activity_matcher import create_activity_match_error
from .emission_calculator import EmissionCalculator


class RowProcessor:
    """Processes individual rows from bulk upload"""
    
    def __init__(self, db, organization_id: str, user_id: str):
        self.db = db
        self.organization_id = organization_id
        self.user_id = user_id
        self.field_validator = FieldValidator(db, organization_id)
        self.formula_validator = FormulaValidator(db)
        self.emission_calculator = EmissionCalculator(db)
        self._activity_matchers = {}
    
    async def get_activity_matcher(self, category_code: str, sub_category: str = None) -> ActivityMatcher:
        """
        Get or create activity matcher for a category.
        For fugitive_emissions subcategory, returns a matcher with fuel_database data.
        """
        cache_key = f"{category_code}_{sub_category}" if sub_category == "fugitive_emissions" else category_code
        
        if cache_key not in self._activity_matchers:
            if sub_category == "fugitive_emissions":
                # For fugitive emissions, use fuel_database data
                activities = await self.field_validator.get_fugitive_emissions()
            else:
                activities = await self.field_validator.get_activities(category_code)
            self._activity_matchers[cache_key] = ActivityMatcher(activities)
        return self._activity_matchers[cache_key]
    
    async def process_row(self, row_data: Dict, category_code: str,
                          row_num: int, existing_keys: set,
                          bulk_job_id: str) -> RowResult:
        """
        Process a single row from the upload
        
        Args:
            row_data: Dict of column key -> value
            category_code: Category code (C1-C15)
            row_num: Row number in Excel (1-indexed, excluding header)
            existing_keys: Set of already processed row keys (for duplicate detection)
            bulk_job_id: Bulk upload job ID
            
        Returns:
            RowResult with success status, errors, warnings, and emission_id
        """
        config = CATEGORY_COLUMNS.get(category_code, {})
        sheet_name = config.get("sheet_name", category_code)
        
        errors: List[ValidationError] = []
        warnings: List[ValidationError] = []
        
        # 1. Check for empty row
        if not any(v for v in row_data.values() if v):
            return RowResult(
                sheet=sheet_name,
                row=row_num,
                success=False,
                errors=[ValidationError(
                    sheet=sheet_name,
                    row=row_num,
                    column="All",
                    error_type="EMPTY_ROW",
                    message="Row is empty",
                    severity=ErrorSeverity.WARNING
                )],
                row_data={
                    "facility_name": row_data.get("facility_name"),
                    "reporting_period": row_data.get("reporting_period") or row_data.get("reporting_month") or row_data.get("reporting_year"),
                    "calculation_method": row_data.get("calculation_method"),
                    "activity": row_data.get("activity"),
                }
            )
        
        # 2. Validate facility
        facility, facility_error = await self.field_validator.validate_facility(
            row_data.get("facility_name"), row_num, sheet_name
        )
        if facility_error:
            errors.append(facility_error)
        
        # 3. Validate reporting period (month OR year, not both)
        reporting_month = row_data.get("reporting_month")
        reporting_year = row_data.get("reporting_year")
        
        # Check for conflicting inputs
        has_month = reporting_month and str(reporting_month).strip()
        has_year = reporting_year and str(reporting_year).strip()
        
        if has_month and has_year:
            # Both filled - error
            errors.append(ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Reporting Month/Year",
                error_type="CONFLICTING_REPORTING_PERIOD",
                message="Both Reporting Month and Reporting Year are filled. Only one should be provided.",
                suggestion="Fill either Reporting Month (for monthly data) OR Reporting Year (for yearly data)",
                severity=ErrorSeverity.ERROR
            ))
        elif not has_month and not has_year:
            # Neither filled - error
            errors.append(ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Reporting Month/Year",
                error_type="MISSING_REPORTING_PERIOD",
                message="Neither Reporting Month nor Reporting Year is filled. One is required.",
                suggestion="Fill either Reporting Month (e.g., Jan-2025) OR Reporting Year (e.g., FY 2025-2026)",
                severity=ErrorSeverity.ERROR
            ))
        elif has_month:
            # Monthly reporting
            parsed_month, month_error = self.field_validator.parse_reporting_month(reporting_month)
            if month_error:
                errors.append(ValidationError(
                    sheet=sheet_name,
                    row=row_num,
                    column="Reporting Month",
                    error_type="INVALID_REPORTING_MONTH",
                    message=month_error,
                    severity=ErrorSeverity.ERROR
                ))
            else:
                row_data["reporting_period"] = parsed_month
                row_data["frequency_type"] = "monthly"
        else:
            # Yearly reporting
            parsed_year, year_type, year_error = self.field_validator.parse_reporting_year(reporting_year)
            if year_error:
                errors.append(ValidationError(
                    sheet=sheet_name,
                    row=row_num,
                    column="Reporting Year",
                    error_type="INVALID_REPORTING_YEAR",
                    message=year_error,
                    severity=ErrorSeverity.ERROR
                ))
            else:
                row_data["reporting_period"] = parsed_year
                row_data["frequency_type"] = "yearly"
                row_data["reporting_year_type"] = year_type
        
        # 4. Validate calculation method
        method, method_error = self.field_validator.validate_calculation_method(
            row_data.get("calculation_method"), category_code
        )
        if method_error:
            errors.append(ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Calculation Method",
                error_type="INVALID_METHOD",
                message=method_error,
                severity=ErrorSeverity.ERROR
            ))
            # Can't proceed without valid method
            return RowResult(
                sheet=sheet_name,
                row=row_num,
                success=False,
                errors=errors,
                warnings=warnings,
                row_data={
                    "facility_name": row_data.get("facility_name"),
                    "reporting_period": row_data.get("reporting_period") or row_data.get("reporting_month") or row_data.get("reporting_year"),
                    "calculation_method": row_data.get("calculation_method"),
                    "activity": row_data.get("activity"),
                }
            )
        
        # 5. C15 special validation (supplier_basis only)
        if category_code == "C15":
            c15_error = self.field_validator.validate_c15_supplier_only(method, row_num, sheet_name)
            if c15_error:
                errors.append(c15_error)
        
        # 6. Validate activity type (for C6, C7) - now async to fetch from DB
        activity_type = None
        if config.get("has_activity_type"):
            activity_type, at_error = await self.field_validator.validate_activity_type(
                row_data.get("activity_type"), category_code, row_num, sheet_name
            )
            if at_error:
                errors.append(at_error)
        
        # 7. Validate sub-category (for C8-C14) - uses hardcoded valid subcategories like frontend
        sub_category = None
        if config.get("has_subcategory"):
            sub_category, subcat_error = self.field_validator.validate_sub_category(
                row_data.get("sub_category"), category_code, method, row_num, sheet_name
            )
            if subcat_error:
                errors.append(subcat_error)
        
        # 8. Validate mandatory fields for method
        mandatory_errors = self.field_validator.validate_mandatory_fields(
            row_data, category_code, method, row_num
        )
        errors.extend(mandatory_errors)
        
        # 9. Check for supplier fields warning
        supplier_warnings = self.field_validator.check_supplier_fields_warning(
            row_data, method, category_code, row_num
        )
        warnings.extend(supplier_warnings)
        
        # 10. C7 employee validation
        if category_code == "C7":
            c7_errors = self.field_validator.validate_c7_employee(row_data, row_num, sheet_name)
            errors.extend(c7_errors)
        
        # 11. Check for duplicates
        row_key, dup_error = self.field_validator.check_duplicate_row(
            row_data, category_code, existing_keys, row_num, sheet_name
        )
        if dup_error:
            errors.append(dup_error)
        else:
            existing_keys.add(row_key)
        
        # 12. Validate numeric fields
        numeric_fields = [
            ("quantity_used", "Quantity Used"),
            ("spent_amount", "Spent Amount"),
            ("distance_travelled", "Distance Travelled"),
            ("quantity_goods", "Quantity of Goods"),
            ("supplier_quantity", "Supplier Quantity"),
            ("supplier_ef", "Supplier Emission Factor"),
            ("passengers", "Passengers"),
            ("rooms", "Rooms"),
            ("nights", "Nights"),
            ("working_days", "Working Days"),
            ("working_hours", "Working Hours"),
        ]
        
        for field_key, field_name in numeric_fields:
            if row_data.get(field_key):
                parsed_value, num_error = self.field_validator.parse_numeric(
                    row_data.get(field_key), field_name
                )
                if num_error:
                    errors.append(ValidationError(
                        sheet=sheet_name,
                        row=row_num,
                        column=field_name,
                        error_type="INVALID_NUMBER",
                        message=num_error,
                        severity=ErrorSeverity.ERROR
                    ))
                else:
                    row_data[field_key] = parsed_value
        
        # If there are errors at this point, don't proceed with activity/formula validation
        if errors:
            return RowResult(
                sheet=sheet_name,
                row=row_num,
                success=False,
                errors=errors,
                warnings=warnings,
                row_data={
                    "facility_name": row_data.get("facility_name"),
                    "reporting_period": row_data.get("reporting_period") or row_data.get("reporting_month") or row_data.get("reporting_year"),
                    "calculation_method": method,
                    "activity": row_data.get("activity"),
                }
            )
        
        # 13. Match activity
        # For fugitive_emissions subcategory, use fuel_database data
        activity_matcher = await self.get_activity_matcher(category_code, sub_category)
        activity_match = activity_matcher.match_activity(
            row_data.get("activity"),
            method,
            activity_type,
            sub_category
        )
        
        if not activity_match.matched and method != CalculationMethod.SUPPLIER_BASIS:
            errors.append(create_activity_match_error(
                activity_match, row_data.get("activity"), row_num, sheet_name
            ))
            return RowResult(
                sheet=sheet_name,
                row=row_num,
                success=False,
                errors=errors,
                warnings=warnings,
                row_data={
                    "facility_name": row_data.get("facility_name"),
                    "reporting_period": row_data.get("reporting_period") or row_data.get("reporting_month") or row_data.get("reporting_year"),
                    "calculation_method": method,
                    "activity": row_data.get("activity"),
                }
            )
        
        # 14. Validate units
        if activity_match.activity_id:
            allowed_units = activity_matcher.get_allowed_units(activity_match.activity_id)
            unit_field = "unit_quantity" if "unit_quantity" in row_data else "unit_goods"
            if row_data.get(unit_field) and allowed_units:
                _, unit_error = self.field_validator.validate_unit(
                    row_data.get(unit_field), allowed_units, 
                    "Unit of Quantity", row_num, sheet_name
                )
                if unit_error:
                    errors.append(unit_error)
        
        # 15. Get category and validate formula inputs
        category = await self.formula_validator.get_category_by_code(category_code)
        formula = None
        
        # Get category name from config (guaranteed to exist) with database fallback
        category_config = CATEGORY_COLUMNS.get(category_code, {})
        category_name = f"{category_code} - {category_config.get('name', 'Unknown')}"
        
        if category:
            form_config = await self.formula_validator.get_form_config(category.get("id"))
            if form_config:
                formula = self.formula_validator.match_formula(form_config, method, activity_type)
                
                if formula:
                    formula_validation = self.formula_validator.validate_formula_inputs(
                        row_data, formula, method, row_num, sheet_name
                    )
                    
                    if not formula_validation.valid:
                        errors.append(self.formula_validator.create_missing_inputs_error(
                            formula_validation, row_num, sheet_name
                        ))
        
        # If errors, return
        if errors:
            return RowResult(
                sheet=sheet_name,
                row=row_num,
                success=False,
                errors=errors,
                warnings=warnings,
                row_data={
                    "facility_name": row_data.get("facility_name"),
                    "reporting_period": row_data.get("reporting_period") or row_data.get("reporting_month") or row_data.get("reporting_year"),
                    "calculation_method": method,
                    "activity": row_data.get("activity") or (activity_match.activity_name if activity_match else None),
                }
            )
        
        # 16. Calculate emissions
        calculated_emissions = await self.emission_calculator.calculate_emissions(
            row_data, category_code, method,
            activity_match.activity_id if activity_match.matched else None,
            formula.get("id") if formula else None,
            activity_match.source if activity_match.matched else None  # Pass source (scope3_ef or fuel_database)
        )
        
        # 17. Build emission record
        # category_name already set above from CATEGORY_COLUMNS
        
        # Get formula_id from calc_engine result (preferred) or fallback to matched formula
        resolved_formula_id = calculated_emissions.get("formula_id") or (formula.get("id") if formula else None)
        
        emission_record = self.emission_calculator.build_emission_record(
            row_data=row_data,
            category_code=category_code,
            category_name=category_name,
            facility=facility,
            organization_id=self.organization_id,
            user_id=self.user_id,
            method=method,
            activity_match={
                "activity_id": activity_match.activity_id,
                "activity_name": activity_match.activity_name,
                "is_fuzzy_match": activity_match.is_fuzzy_match,
                "confidence": activity_match.confidence
            },
            calculated_emissions=calculated_emissions,
            formula_id=resolved_formula_id,
            bulk_job_id=bulk_job_id
        )
        
        # Add fuzzy match warning if applicable
        if activity_match.is_fuzzy_match and activity_match.confidence < 100:
            warnings.append(ValidationError(
                sheet=sheet_name,
                row=row_num,
                column="Activity",
                error_type="FUZZY_MATCH",
                message=f"Activity matched with {activity_match.confidence:.0f}% confidence to '{activity_match.activity_name}'",
                suggestion="Verify the matched activity is correct",
                severity=ErrorSeverity.WARNING
            ))
        
        # Extract co2e value (may be dict from calc_engine or float)
        co2e_value = calculated_emissions.get("co2e", 0)
        if isinstance(co2e_value, dict):
            co2e_value = float(co2e_value.get("value", 0))
        else:
            co2e_value = float(co2e_value) if co2e_value else 0.0
        
        return RowResult(
            sheet=sheet_name,
            row=row_num,
            success=True,
            emission_id=emission_record.get("id"),
            co2e=co2e_value,
            errors=[],
            warnings=warnings,
            row_data={
                "facility_name": row_data.get("facility_name"),
                "reporting_period": row_data.get("reporting_period") or row_data.get("reporting_month") or row_data.get("reporting_year"),
                "calculation_method": method,
                "activity": row_data.get("activity") or activity_match.activity_name,
            }
        ), emission_record
    
    async def process_c7_rows(self, rows: List[Tuple[int, Dict]], 
                               category_code: str, bulk_job_id: str) -> Tuple[List[RowResult], List[Dict]]:
        """
        Process C7 rows with employee aggregation
        
        Groups rows by (facility, activity, activity_type, month) and creates
        aggregated emission records.
        
        Returns:
            Tuple of (row_results, emission_records)
        """
        row_results = []
        emission_records = []
        
        # Group rows
        grouped = {}
        existing_keys = set()
        
        for row_num, row_data in rows:
            # Process individual row for validation
            result = await self.process_row(row_data, category_code, row_num, existing_keys, bulk_job_id)
            
            if isinstance(result, tuple):
                row_result, emission_record = result
                row_results.append(row_result)
                
                if row_result.success:
                    # Group by (facility, activity, activity_type, month)
                    # Use `or ""` to handle None values from Excel cells
                    group_key = (
                        (row_data.get("facility_name") or "").lower().strip(),
                        (row_data.get("activity") or "").lower().strip(),
                        (row_data.get("activity_type") or "").lower().strip(),
                        (row_data.get("reporting_month") or "").lower().strip()
                    )
                    
                    if group_key not in grouped:
                        grouped[group_key] = {
                            "facility": None,
                            "employees": []
                        }
                    
                    # Get facility from the emission record
                    facilities = await self.field_validator.get_facilities()
                    facility_key = (row_data.get("facility_name") or "").lower().strip()
                    grouped[group_key]["facility"] = facilities.get(facility_key, {})
                    
                    grouped[group_key]["employees"].append({
                        "row_data": row_data,
                        "emissions": emission_record.get("outputs", {}),
                        "method": emission_record.get("calculation_method_scope3"),  # Use validated method from emission_record
                        "activity_match": {
                            "activity_id": emission_record.get("scope3_ef_id"),
                            "activity_name": emission_record.get("scope3_activity")
                        }
                    })
            else:
                row_results.append(result)
        
        # Create aggregated records
        category = await self.formula_validator.get_category_by_code(category_code)
        category_name = category.get("name") if category else "C7 - Employee Commuting"
        
        for group_key, group_data in grouped.items():
            if group_data["employees"]:
                aggregated_record = self.emission_calculator.build_c7_aggregated_record(
                    employee_rows=group_data["employees"],
                    category_name=category_name,
                    facility=group_data["facility"],
                    organization_id=self.organization_id,
                    user_id=self.user_id,
                    bulk_job_id=bulk_job_id
                )
                if aggregated_record:
                    emission_records.append(aggregated_record)
        
        return row_results, emission_records
