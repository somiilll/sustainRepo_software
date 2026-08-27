"""
Scope 1 & Scope 2 Row Processor for Bulk Upload
Processes individual rows from Scope1 and Scope2 sheets
"""
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timezone
import uuid
import logging

from ..models import (
    ValidationError, ErrorSeverity, RowResult, CATEGORY_COLUMNS
)
from ..validators import FieldValidator
from ..ghg_config_resolver import ResolvedGhgCapabilities

logger = logging.getLogger(__name__)


class Scope12RowProcessor:
    """Processes individual rows from Scope 1 and Scope 2 bulk upload sheets"""
    
    def __init__(self, db, organization_id: str, user_id: str,
                 user_email: str = "", user_name: str = "",
                 capabilities: Optional[ResolvedGhgCapabilities] = None):
        self.db = db
        self.organization_id = organization_id
        self.user_id = user_id
        self.user_email = user_email
        self.user_name = user_name
        self.field_validator = FieldValidator(db, organization_id)
        self.capabilities = capabilities or ResolvedGhgCapabilities()
        self._fuel_cache = {}  # Cache for fuel lookups
    
    async def get_fuel_by_name(self, fuel_name: str, category: str = None, sector: str = None) -> Optional[Dict]:
        """Get fuel from fuel_database by name, optionally filtered by sector"""
        fuel_lower = fuel_name.lower().strip()
        cache_key = f"{fuel_lower}_{category}_{sector}" if category or sector else fuel_lower
        
        if cache_key in self._fuel_cache:
            return self._fuel_cache[cache_key]
        
        # Build query based on category
        query = {"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}}
        
        if category:
            cat_lower = category.lower().strip()
            if cat_lower in ['purchased electricity', 'purchased_electricity']:
                query["fuel_type"] = {"$regex": "electricity", "$options": "i"}
            elif cat_lower in ['purchased heat/steam', 'purchased_heat_steam']:
                query["fuel_type"] = {"$regex": "heat|steam", "$options": "i"}
        
        # If sector provided, try to match sector first
        if sector:
            sector_query = {
                **query,
                "$or": [
                    {"industry_sector": {"$regex": f"^{sector}$", "$options": "i"}},
                    {"industry_sectors": {"$regex": sector, "$options": "i"}}
                ]
            }
            fuels = await self.db.fuel_database.find(sector_query, {"_id": 0}).to_list(10)
            if fuels:
                logger.info(f"[FUEL_LOOKUP] Found fuel '{fuel_name}' with sector '{sector}'")
                self._fuel_cache[cache_key] = fuels[0]
                return fuels[0]
            else:
                logger.debug(f"[FUEL_LOOKUP] No sector match for '{fuel_name}' in sector '{sector}', falling back to name-only")
        
        # Search by fuel_name only (fallback)
        fuels = await self.db.fuel_database.find(query, {"_id": 0}).to_list(10)
        
        if fuels:
            self._fuel_cache[cache_key] = fuels[0]
            return fuels[0]
        
        # Try without category filter
        if category:
            fuel = await self.db.fuel_database.find_one(
                {"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}},
                {"_id": 0}
            )
            if fuel:
                self._fuel_cache[cache_key] = fuel
                return fuel
        
        return None
    
    async def get_all_fuels(self, scope: str, category: str = None) -> List[Dict]:
        """Get all fuels for dropdown population"""
        query = {}
        
        if scope == "scope2":
            cat_lower = (category or "").lower().strip()
            if cat_lower in ['purchased electricity', 'purchased_electricity']:
                query["fuel_type"] = {"$regex": "electricity", "$options": "i"}
            elif cat_lower in ['purchased heat/steam', 'purchased_heat_steam']:
                query["fuel_type"] = {"$regex": "heat|steam", "$options": "i"}
        
        fuels = await self.db.fuel_database.find(query, {"_id": 0}).to_list(10000)
        return fuels
    
    def _normalize_category(self, category: str) -> str:
        """Normalize category name to internal key"""
        if not category:
            return ""
        cat_lower = category.lower().strip()
        
        # Scope 1 categories
        if cat_lower in ['stationary combustion', 'stationary_combustion', 'stationarycombustion']:
            return 'stationary_combustion'
        elif cat_lower in ['mobile combustion', 'mobile_combustion', 'mobilecombustion']:
            return 'mobile_combustion'
        elif cat_lower in ['fugitive emissions', 'fugitive_emissions', 'fugitiveemissions']:
            return 'fugitive_emissions'
        elif cat_lower in ['flaring', 'flaring (stationary combustion)', 'flaring__stationary_combustion']:
            return 'flaring'
        elif cat_lower in ['process emissions', 'process_emissions', 'processemissions']:
            return 'process_emissions'
        
        # Scope 2 categories
        elif cat_lower in ['purchased electricity', 'purchased_electricity', 'purchasedelectricity']:
            return 'purchased_electricity'
        elif cat_lower in ['purchased steam/heat', 'purchased_steam_heat', 'purchased steam heat', 'purchasedsteamheat', 'purchased heat/steam', 'purchased_heat_steam']:
            return 'purchased_steam_heat'
        
        return cat_lower.replace(' ', '_')
    
    async def process_scope1_row(self, row_data: Dict, row_num: int,
                                  existing_keys: set, bulk_job_id: str) -> tuple:
        """Process a single Scope 1 row. Returns (RowResult, emission_record or None)"""
        sheet_name = "Scope1"
        config = CATEGORY_COLUMNS.get("Scope1", {})
        
        errors: List[ValidationError] = []
        warnings: List[ValidationError] = []
        
        # 1. Check for empty row
        if not any(v for v in row_data.values() if v):
            return RowResult(
                sheet=sheet_name, row=row_num, success=False,
                errors=[ValidationError(
                    sheet=sheet_name, row=row_num, column="All",
                    error_type="EMPTY_ROW", message="Row is empty",
                    severity=ErrorSeverity.WARNING
                )],
                row_data=row_data
            ), None
        
        # 2. Validate facility
        facility, facility_error = await self.field_validator.validate_facility(
            row_data.get("facility_name"), row_num, sheet_name
        )
        if facility_error:
            errors.append(facility_error)
        
        # 3. Validate reporting period (month OR year, not both)
        errors.extend(self._validate_reporting_period(row_data, row_num, sheet_name))
        
        # 4. Validate category
        category = row_data.get("category", "").strip()
        category_key = self._normalize_category(category)
        valid_scope1_keys = [
            'stationary_combustion', 'mobile_combustion', 'fugitive_emissions',
            'flaring', 'process_emissions',
        ]
        if not category:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Category",
                error_type="MISSING_CATEGORY",
                message="Category is required",
                suggestion="Use: Stationary Combustion, Mobile Combustion, Fugitive Emissions, Flaring, or Process Emissions",
                severity=ErrorSeverity.ERROR
            ))
        elif category_key not in valid_scope1_keys:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Category",
                error_type="INVALID_CATEGORY",
                message=f"Invalid category: '{category}'",
                suggestion="Use: Stationary Combustion, Mobile Combustion, Fugitive Emissions, Flaring, or Process Emissions",
                severity=ErrorSeverity.ERROR
            ))
        elif not self.capabilities.is_scope1_category_enabled(category_key):
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Category",
                error_type="DISABLED_CATEGORY",
                message=f"Category '{category}' is disabled for your organization",
                suggestion="Contact your administrator to enable this category, or remove these rows",
                severity=ErrorSeverity.ERROR
            ))
        
        # 4b. Validate process type (applicable for Process Emissions and optionally Fugitive Emissions)
        process_type = row_data.get("process_type", "").strip() if row_data.get("process_type") else ""
        process_type_key = ""
        if process_type:
            pt_lower = process_type.lower().strip()
            pt_map = {
                "venting": "venting",
                "n2o from overall combustion": "n2o_overall_combustion",
                "n2o_overall_combustion": "n2o_overall_combustion",
                "ch4 from overall combustion": "ch4_overall_combustion",
                "ch4_overall_combustion": "ch4_overall_combustion",
            }
            process_type_key = pt_map.get(pt_lower, "")
            if not process_type_key:
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Process Type",
                    error_type="INVALID_PROCESS_TYPE",
                    message=f"Invalid process type: '{process_type}'",
                    suggestion="Use: Venting, N2O from Overall Combustion, or CH4 from Overall Combustion",
                    severity=ErrorSeverity.ERROR
                ))
            elif not self.capabilities.is_process_type_allowed(process_type_key):
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Process Type",
                    error_type="DISABLED_PROCESS_TYPE",
                    message=f"Process type '{process_type}' is disabled for your organization",
                    suggestion="Contact your administrator to enable this process type",
                    severity=ErrorSeverity.ERROR
                ))
        
        # Process type is required for Process Emissions category
        if category_key == "process_emissions" and not process_type_key:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Process Type",
                error_type="MISSING_PROCESS_TYPE",
                message="Process Type is required for Process Emissions category",
                suggestion="Use: Venting, N2O from Overall Combustion, or CH4 from Overall Combustion",
                severity=ErrorSeverity.ERROR
            ))
        
        # 5. Validate fuel/gas
        fuel_name = row_data.get("fuel_gas", "").strip()
        fuel_data = None
        is_custom_fuel = False
        facility_sector = facility.get("sector") if facility else None
        
        if not fuel_name:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Fuel/Gas Used",
                error_type="MISSING_FUEL",
                message="Fuel/Gas Used is required",
                severity=ErrorSeverity.ERROR
            ))
        else:
            fuel_data = await self.get_fuel_by_name(fuel_name, sector=facility_sector)
            if not fuel_data:
                # Fuel not in database → treat as custom fuel
                is_custom_fuel = True
                if not self.capabilities.custom_fuel_enabled:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Fuel/Gas Used",
                        error_type="CUSTOM_FUEL_DISABLED",
                        message=f"Fuel/Gas '{fuel_name}' not found in database and custom fuel is disabled for your organization",
                        suggestion="Use a fuel from the database, or contact your administrator to enable custom fuel",
                        severity=ErrorSeverity.ERROR
                    ))
                else:
                    # Build a synthetic fuel_data for custom fuel
                    fuel_data = {
                        "id": None,
                        "fuel_name": fuel_name,
                        "fuel_code": None,
                        "is_custom": True,
                    }
                    warnings.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Fuel/Gas Used",
                        error_type="CUSTOM_FUEL_DETECTED",
                        message=f"Fuel/Gas '{fuel_name}' not found in database — will be treated as custom fuel",
                        severity=ErrorSeverity.WARNING
                    ))
        
        # 5b. Validate custom fuel inputs — auto-derive methodology and check required fields
        if is_custom_fuel and fuel_data:
            has_carbon_content = bool(row_data.get("carbon_content"))
            has_oxidation_factor = bool(row_data.get("oxidation_factor"))
            has_ef = bool(row_data.get("ef_quantity"))
            has_cv = bool(row_data.get("cv"))
            
            # Auto-derive methodology
            if has_carbon_content or has_oxidation_factor:
                # Carbon Composition method
                row_data["_derived_methodology"] = "using_carbon_composition"
                if not has_carbon_content:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Carbon Content (%)",
                        error_type="MISSING_CARBON_CONTENT",
                        message="Carbon Content is required for carbon composition calculation",
                        severity=ErrorSeverity.ERROR
                    ))
                if not has_oxidation_factor:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Oxidation Factor",
                        error_type="MISSING_OXIDATION_FACTOR",
                        message="Oxidation Factor is required for carbon composition calculation",
                        severity=ErrorSeverity.ERROR
                    ))
            elif has_ef and has_cv:
                # Heat Basis (NCV)
                row_data["_derived_methodology"] = "using_heat_basis_ncv"
            elif has_ef:
                # Quantity Basis (EF)
                row_data["_derived_methodology"] = "using_qty_basis_ef"
            else:
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Emission Factor",
                    error_type="MISSING_CUSTOM_FUEL_INPUTS",
                    message="Custom fuel requires at least one of: Emission Factor, Emission Factor + Calorific Value, or Carbon Content + Oxidation Factor",
                    suggestion="Provide Emission Factor (+ optional CV) for standard methods, or Carbon Content + Oxidation Factor for carbon composition",
                    severity=ErrorSeverity.ERROR
                ))
        
        # 5c. Validate carbon_content and oxidation_factor values
        if row_data.get("carbon_content"):
            try:
                cc = float(row_data["carbon_content"])
                if cc < 0 or cc > 100:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Carbon Content (%)",
                        error_type="INVALID_CARBON_CONTENT",
                        message=f"Carbon Content must be between 0 and 100, got {cc}",
                        severity=ErrorSeverity.ERROR
                    ))
            except (ValueError, TypeError):
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Carbon Content (%)",
                    error_type="INVALID_CARBON_CONTENT",
                    message=f"Invalid Carbon Content value: '{row_data['carbon_content']}'",
                    severity=ErrorSeverity.ERROR
                ))
        
        if row_data.get("oxidation_factor"):
            try:
                of = float(row_data["oxidation_factor"])
                if of < 0 or of > 1:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Oxidation Factor",
                        error_type="INVALID_OXIDATION_FACTOR",
                        message=f"Oxidation Factor must be between 0 and 1, got {of}",
                        severity=ErrorSeverity.ERROR
                    ))
            except (ValueError, TypeError):
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Oxidation Factor",
                    error_type="INVALID_OXIDATION_FACTOR",
                    message=f"Invalid Oxidation Factor value: '{row_data['oxidation_factor']}'",
                    severity=ErrorSeverity.ERROR
                ))
        
        # 6. Validate mandatory fields
        mandatory_errors = self._validate_mandatory_fields(row_data, row_num, sheet_name, config)
        errors.extend(mandatory_errors)
        
        # 7. Validate conditional mandatory fields (cv -> cv_unit, density -> density_unit)
        conditional_errors = self._validate_conditional_mandatory(row_data, row_num, sheet_name, config)
        errors.extend(conditional_errors)
        
        # 8. Validate quantity
        qty = row_data.get("qty")
        if qty is not None:
            try:
                qty = float(qty)
                if qty < 0:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Quantity Used",
                        error_type="NEGATIVE_QUANTITY",
                        message="Quantity cannot be negative",
                        severity=ErrorSeverity.ERROR
                    ))
            except (ValueError, TypeError):
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Quantity Used",
                    error_type="INVALID_QUANTITY",
                    message=f"Invalid quantity value: '{qty}'",
                    severity=ErrorSeverity.ERROR
                ))
        
        # If there are critical errors, return early
        if errors:
            return RowResult(
                sheet=sheet_name, row=row_num, success=False,
                errors=errors, warnings=warnings, row_data=row_data
            ), None
        
        # 9. Calculate emissions using calc engine
        try:
            emission_record = await self._calculate_scope1_emission(
                row_data, facility, fuel_data, category_key, bulk_job_id
            )
            
            return RowResult(
                sheet=sheet_name, row=row_num, success=True,
                emission_id=emission_record.get("id"),
                co2e=emission_record.get("co2e_emissions", 0),
                errors=[], warnings=warnings,
                row_data=row_data
            ), emission_record
        except Exception as e:
            logger.error(f"[SCOPE1_BULK] Calculation error row {row_num}: {str(e)}")
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Calculation",
                error_type="CALCULATION_ERROR",
                message=f"Emission calculation failed: {str(e)}",
                severity=ErrorSeverity.ERROR
            ))
            return RowResult(
                sheet=sheet_name, row=row_num, success=False,
                errors=errors, warnings=warnings, row_data=row_data
            ), None
    
    async def process_scope2_row(self, row_data: Dict, row_num: int,
                                  existing_keys: set, bulk_job_id: str) -> tuple:
        """Process a single Scope 2 row. Returns (RowResult, emission_record or None)"""
        sheet_name = "Scope2"
        config = CATEGORY_COLUMNS.get("Scope2", {})
        
        errors: List[ValidationError] = []
        warnings: List[ValidationError] = []
        
        # 1. Check for empty row
        if not any(v for v in row_data.values() if v):
            return RowResult(
                sheet=sheet_name, row=row_num, success=False,
                errors=[ValidationError(
                    sheet=sheet_name, row=row_num, column="All",
                    error_type="EMPTY_ROW", message="Row is empty",
                    severity=ErrorSeverity.WARNING
                )],
                row_data=row_data
            ), None
        
        # 2. Validate facility
        facility, facility_error = await self.field_validator.validate_facility(
            row_data.get("facility_name"), row_num, sheet_name
        )
        if facility_error:
            errors.append(facility_error)
        
        # 3. Validate reporting period
        errors.extend(self._validate_reporting_period(row_data, row_num, sheet_name))
        
        # 4. Validate category (with org-level enforcement)
        category = row_data.get("category", "").strip()
        category_key = self._normalize_category(category)
        if not category:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Category",
                error_type="MISSING_CATEGORY",
                message="Category is required",
                suggestion="Use: Purchased Electricity or Purchased Heat/Steam",
                severity=ErrorSeverity.ERROR
            ))
        elif category_key not in ['purchased_electricity', 'purchased_steam_heat']:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Category",
                error_type="INVALID_CATEGORY",
                message=f"Invalid category: '{category}'",
                suggestion="Use: Purchased Electricity or Purchased Steam/Heat",
                severity=ErrorSeverity.ERROR
            ))
        elif not self.capabilities.scope2_enabled:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Category",
                error_type="DISABLED_CATEGORY",
                message="Scope 2 is disabled for your organization",
                suggestion="Contact your administrator to enable Scope 2",
                severity=ErrorSeverity.ERROR
            ))
        
        # 5. Validate energy used (with custom fuel auto-detection)
        energy_name = row_data.get("energy_used", "").strip()
        fuel_data = None
        is_custom_fuel = False
        facility_sector = facility.get("sector") if facility else None
        
        if not energy_name:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Energy Used",
                error_type="MISSING_ENERGY",
                message="Energy Used is required",
                severity=ErrorSeverity.ERROR
            ))
        else:
            fuel_data = await self.get_fuel_by_name(energy_name, category=category, sector=facility_sector)
            if not fuel_data:
                is_custom_fuel = True
                if not self.capabilities.custom_fuel_enabled:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Energy Used",
                        error_type="CUSTOM_FUEL_DISABLED",
                        message=f"Energy '{energy_name}' not found in database and custom fuel is disabled for your organization",
                        suggestion="Use an energy source from the database, or contact your administrator to enable custom fuel",
                        severity=ErrorSeverity.ERROR
                    ))
                else:
                    ef_value = row_data.get("ef_quantity_electricity_co2")
                    if not ef_value:
                        errors.append(ValidationError(
                            sheet=sheet_name, row=row_num, column="Emission Factor",
                            error_type="MISSING_CUSTOM_FUEL_EF",
                            message=f"Emission factor is required when using custom energy source '{energy_name}'",
                            suggestion="Provide an emission factor value in the Emission Factor column",
                            severity=ErrorSeverity.ERROR
                        ))
                    else:
                        fuel_data = {
                            "id": None,
                            "fuel_name": energy_name,
                            "fuel_code": None,
                            "is_custom": True,
                        }
                        warnings.append(ValidationError(
                            sheet=sheet_name, row=row_num, column="Energy Used",
                            error_type="CUSTOM_FUEL_DETECTED",
                            message=f"Energy '{energy_name}' not found in database — will be treated as custom energy source",
                            severity=ErrorSeverity.WARNING
                        ))
        
        # 6. Validate mandatory fields
        mandatory_errors = self._validate_mandatory_fields(row_data, row_num, sheet_name, config)
        errors.extend(mandatory_errors)
        
        # 7. Validate conditional mandatory (ef -> ef_unit)
        conditional_errors = self._validate_conditional_mandatory(row_data, row_num, sheet_name, config)
        errors.extend(conditional_errors)
        
        # 8. Validate quantity
        qty = row_data.get("qty_energy")
        if qty is not None:
            try:
                qty = float(qty)
                if qty < 0:
                    errors.append(ValidationError(
                        sheet=sheet_name, row=row_num, column="Quantity Used",
                        error_type="NEGATIVE_QUANTITY",
                        message="Quantity cannot be negative",
                        severity=ErrorSeverity.ERROR
                    ))
            except (ValueError, TypeError):
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Quantity Used",
                    error_type="INVALID_QUANTITY",
                    message=f"Invalid quantity value: '{qty}'",
                    severity=ErrorSeverity.ERROR
                ))
        
        # If there are critical errors, return early
        if errors:
            return RowResult(
                sheet=sheet_name, row=row_num, success=False,
                errors=errors, warnings=warnings, row_data=row_data
            ), None
        
        # 9. Calculate emissions
        try:
            emission_record = await self._calculate_scope2_emission(
                row_data, facility, fuel_data, category_key, bulk_job_id
            )
            
            return RowResult(
                sheet=sheet_name, row=row_num, success=True,
                emission_id=emission_record.get("id"),
                co2e=emission_record.get("co2e_emissions", 0),
                errors=[], warnings=warnings,
                row_data=row_data
            ), emission_record
        except Exception as e:
            logger.error(f"[SCOPE2_BULK] Calculation error row {row_num}: {str(e)}")
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Calculation",
                error_type="CALCULATION_ERROR",
                message=f"Emission calculation failed: {str(e)}",
                severity=ErrorSeverity.ERROR
            ))
            return RowResult(
                sheet=sheet_name, row=row_num, success=False,
                errors=errors, warnings=warnings, row_data=row_data
            ), None
    
    def _validate_reporting_period(self, row_data: Dict, row_num: int, sheet_name: str) -> List[ValidationError]:
        """Validate reporting period - month OR year, not both"""
        errors = []
        reporting_month = row_data.get("reporting_month")
        reporting_year = row_data.get("reporting_year")
        
        has_month = reporting_month and str(reporting_month).strip()
        has_year = reporting_year and str(reporting_year).strip()
        
        if has_month and has_year:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Reporting Month/Year",
                error_type="CONFLICTING_REPORTING_PERIOD",
                message="Both Reporting Month and Reporting Year are filled. Only one should be provided.",
                suggestion="Fill either Reporting Month OR Reporting Year",
                severity=ErrorSeverity.ERROR
            ))
        elif not has_month and not has_year:
            errors.append(ValidationError(
                sheet=sheet_name, row=row_num, column="Reporting Month/Year",
                error_type="MISSING_REPORTING_PERIOD",
                message="Neither Reporting Month nor Reporting Year is filled. One is required.",
                suggestion="Fill either Reporting Month (e.g., Jan-2025) OR Reporting Year (e.g., FY 2025-2026)",
                severity=ErrorSeverity.ERROR
            ))
        elif has_month:
            parsed_month, month_error = self.field_validator.parse_reporting_month(reporting_month)
            if month_error:
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Reporting Month",
                    error_type="INVALID_REPORTING_MONTH",
                    message=month_error,
                    severity=ErrorSeverity.ERROR
                ))
            else:
                row_data["reporting_period"] = parsed_month
                row_data["frequency_type"] = "monthly"
        else:
            parsed_year, year_type, year_error = self.field_validator.parse_reporting_year(reporting_year)
            if year_error:
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column="Reporting Year",
                    error_type="INVALID_REPORTING_YEAR",
                    message=year_error,
                    severity=ErrorSeverity.ERROR
                ))
            else:
                row_data["reporting_period"] = parsed_year
                row_data["frequency_type"] = "yearly"
                row_data["reporting_year_type"] = year_type
        
        return errors
    
    def _validate_mandatory_fields(self, row_data: Dict, row_num: int,
                                    sheet_name: str, config: Dict) -> List[ValidationError]:
        """Validate mandatory fields"""
        errors = []
        mandatory_fields = config.get("mandatory_fields", {}).get("default", [])
        columns = {c["key"]: c["name"] for c in config.get("columns", [])}
        
        for field_key in mandatory_fields:
            value = row_data.get(field_key)
            if value is None or value == "" or (isinstance(value, str) and value.strip() == ""):
                display_name = columns.get(field_key, field_key)
                errors.append(ValidationError(
                    sheet=sheet_name, row=row_num, column=display_name,
                    error_type="MISSING_MANDATORY_FIELD",
                    message=f"'{display_name}' is required",
                    severity=ErrorSeverity.ERROR
                ))
        
        return errors
    
    def _validate_conditional_mandatory(self, row_data: Dict, row_num: int,
                                         sheet_name: str, config: Dict) -> List[ValidationError]:
        """Validate conditional mandatory fields (e.g., if cv is provided, cv_unit is required)"""
        errors = []
        conditional = config.get("conditional_mandatory", {})
        columns = {c["key"]: c["name"] for c in config.get("columns", [])}
        
        for trigger_field, dependent_fields in conditional.items():
            trigger_value = row_data.get(trigger_field)
            if trigger_value is not None and str(trigger_value).strip():
                for dep_field in dependent_fields:
                    dep_value = row_data.get(dep_field)
                    if dep_value is None or dep_value == "" or (isinstance(dep_value, str) and dep_value.strip() == ""):
                        trigger_name = columns.get(trigger_field, trigger_field)
                        dep_name = columns.get(dep_field, dep_field)
                        errors.append(ValidationError(
                            sheet=sheet_name, row=row_num, column=dep_name,
                            error_type="MISSING_CONDITIONAL_FIELD",
                            message=f"'{dep_name}' is required when '{trigger_name}' is provided",
                            severity=ErrorSeverity.ERROR
                        ))
        
        return errors
    
    async def _calculate_scope1_emission(self, row_data: Dict, facility: Dict,
                                          fuel_data: Dict, category_key: str,
                                          bulk_job_id: str) -> Dict:
        """Calculate Scope 1 emission using calc engine"""
        from calc_engine.execution import CalcEngine
        from calc_engine.formulas import get_decision_tree_for_category, resolve_formula_id
        
        now = datetime.now(timezone.utc)
        record_id = str(uuid.uuid4())
        
        # Get category name from row data (original user input)
        category_name = row_data.get("category", "").strip()
        
        # Map category name to code for emission_categories lookup
        category_code_map = {
            "stationary combustion": "stationary_combustion",
            "mobile combustion": "mobile_combustion",
            "fugitive emissions": "fugitive_emissions",
            "flaring": "flaring",
            "process emissions": "process_emissions",
        }
        category_code = category_code_map.get(category_name.lower(), category_key)
        
        # Flaring is stored as a sub-type of stationary combustion in some DBs.
        # Try the canonical code first, fall back to stationary_combustion lookup.
        category_doc = await self.db.emission_categories.find_one(
            {"code": category_code, "is_active": True},
            {"_id": 0, "id": 1, "name": 1}
        )
        if not category_doc and category_code == "flaring":
            # Flaring may be registered under its compound code or name
            category_doc = await self.db.emission_categories.find_one(
                {"$or": [
                    {"code": "flaring__stationary_combustion", "is_active": True},
                    {"name": {"$regex": "flaring", "$options": "i"}, "is_active": True},
                ]},
                {"_id": 0, "id": 1, "name": 1}
            )
        if not category_doc:
            # Try with name match
            category_doc = await self.db.emission_categories.find_one(
                {"name": {"$regex": f"^{category_name}$", "$options": "i"}, "is_active": True},
                {"_id": 0, "id": 1, "name": 1}
            )
        
        category_id = category_doc.get("id") if category_doc else None
        
        logger.info(f"[SCOPE1_BULK] Processing row: category={category_key}, fuel={fuel_data.get('fuel_name')}, category_id={category_id}")
        
        # Get decision tree and resolve formula (same logic as calc_engine/router.py)
        decision_tree = await get_decision_tree_for_category(self.db, category_id) if category_id else None
        
        # Check if user provided emission factor in bulk upload
        ef_quantity_provided = bool(row_data.get("ef_quantity"))
        is_custom_fuel = fuel_data.get("is_custom", False)
        derived_methodology = row_data.get("_derived_methodology", "")
        
        # Build decision inputs for formula resolution
        decision_inputs = {
            "fuel_code": fuel_data.get("id"),
            "fuel_database_id": fuel_data.get("id"),
            "ef_quantity_provided": str(ef_quantity_provided).lower(),  # "true" or "false"
        }
        
        # For custom fuel, add methodology to decision inputs
        if is_custom_fuel and derived_methodology:
            decision_inputs["calculation_methodology"] = derived_methodology
        
        # Add process_type to decision inputs when provided (for fugitive/process emissions)
        process_type_key = ""
        raw_pt = row_data.get("process_type", "")
        if raw_pt:
            pt_map = {
                "venting": "venting",
                "n2o from overall combustion": "n2o_overall_combustion",
                "n2o_overall_combustion": "n2o_overall_combustion",
                "ch4 from overall combustion": "ch4_overall_combustion",
                "ch4_overall_combustion": "ch4_overall_combustion",
            }
            process_type_key = pt_map.get(str(raw_pt).lower().strip(), "")
        if process_type_key:
            decision_inputs["process_type"] = process_type_key
        
        logger.debug(f"[SCOPE1_BULK] Decision inputs: {decision_inputs}")
        
        formula_id = None
        if decision_tree:
            try:
                # decision_tree might have "tree" key or be the tree itself
                tree_data = decision_tree.get("tree", decision_tree) if isinstance(decision_tree, dict) else decision_tree
                result = resolve_formula_id(tree_data, decision_inputs)
                # resolve_formula_id returns (formula_id, path) tuple or just formula_id
                formula_id = result[0] if isinstance(result, tuple) else result
                logger.info(f"[SCOPE1_BULK] Formula resolved via decision tree: {formula_id}")
            except Exception as e:
                logger.warning(f"[SCOPE1_BULK] Decision tree resolution failed: {e}")
        
        # No decision tree - look up formula directly by category_id (same as calc_engine/router.py line 737)
        if not formula_id and category_id:
            formula_doc = await self.db.ce_formulas.find_one(
                {
                    "is_active": True,
                    "$or": [
                        {"category_id": category_id},
                        {"category_ids": category_id},
                    ],
                },
                {"_id": 0, "id": 1},
            )
            if formula_doc:
                formula_id = formula_doc.get("id")
        
        # Build inputs for calc engine
        qty = float(row_data.get("qty", 0))
        unit_qty = row_data.get("unit_qty", "")
        
        inputs = {
            "qty": {"value": qty, "unit": unit_qty},
        }
        
        # Build user overrides
        user_overrides = {}
        
        if is_custom_fuel and derived_methodology:
            # ── Custom Fuel: build inputs/overrides per auto-derived methodology ──
            if derived_methodology == "using_carbon_composition":
                carbon_content = float(row_data.get("carbon_content", 0))
                oxidation_factor = float(row_data.get("oxidation_factor", 0))
                inputs["carbon_content"] = {"value": carbon_content, "unit": "%"}
                inputs["oxidation_factor"] = {"value": oxidation_factor, "unit": ""}
                user_overrides["carbon_content"] = {"value": carbon_content, "unit": "%", "is_override": True}
                user_overrides["oxidation_factor"] = {"value": oxidation_factor, "unit": "", "is_override": True}
                
            elif derived_methodology == "using_heat_basis_ncv":
                ef_value = float(row_data.get("ef_quantity", 0))
                ef_unit = row_data.get("ef_quantity_unit", "kgCO2/TJ")
                cv_value = float(row_data.get("cv", 0))
                cv_unit = row_data.get("cv_unit", "TJ/kg")
                inputs["ef_co2"] = {"value": ef_value, "unit": ef_unit}
                inputs["cv"] = {"value": cv_value, "unit": cv_unit}
                user_overrides["ef_co2"] = {"value": ef_value, "unit": ef_unit, "is_override": True}
                user_overrides["emission_factor"] = {"value": ef_value, "unit": ef_unit, "is_override": True}
                user_overrides["cv"] = {"value": cv_value, "unit": cv_unit, "is_override": True}
                # Zero out ch4/n2o for custom fuel heat basis
                user_overrides["ef_ch4"] = {"value": 0, "unit": "kgCH4/TJ", "is_override": True}
                user_overrides["ef_n2o"] = {"value": 0, "unit": "kgN2O/TJ", "is_override": True}
                
            elif derived_methodology == "using_qty_basis_ef":
                ef_value = float(row_data.get("ef_quantity", 0))
                ef_unit = row_data.get("ef_quantity_unit", "kgCO2/kg")
                inputs["ef_quantity"] = {"value": ef_value, "unit": ef_unit}
                user_overrides["ef_quantity"] = {"value": ef_value, "unit": ef_unit, "is_override": True}
                user_overrides["emission_factor"] = {"value": ef_value, "unit": ef_unit, "is_override": True}
            
            # Density override (applies to all custom fuel methods)
            if row_data.get("density"):
                density_value = float(row_data.get("density"))
                density_unit = row_data.get("density_unit", "kg/L")
                user_overrides["density"] = {"value": density_value, "unit": density_unit, "is_override": True}
        else:
            # ── Standard fuel: existing override logic ──
            # If user provided ef_quantity, add it to inputs
            if ef_quantity_provided:
                ef_value = float(row_data.get("ef_quantity"))
                ef_unit = row_data.get("ef_quantity_unit", "")
                inputs["ef_quantity"] = {"value": ef_value, "unit": ef_unit}
            
            # Calorific value override
            if row_data.get("cv"):
                cv_value = float(row_data.get("cv"))
                cv_unit = row_data.get("cv_unit", "")
                user_overrides["cv"] = {"value": cv_value, "unit": cv_unit, "is_override": True}
            
            # Density override
            if row_data.get("density"):
                density_value = float(row_data.get("density"))
                density_unit = row_data.get("density_unit", "")
                user_overrides["density"] = {"value": density_value, "unit": density_unit, "is_override": True}
            
            # Emission factor override - only if user provides it in bulk upload
            if ef_quantity_provided:
                ef_value = float(row_data.get("ef_quantity"))
                user_overrides["ef_quantity"] = {"value": ef_value, "unit": "kgCO2/kg", "is_override": True}
            
            # Carbon content + oxidation factor for standard stationary combustion
            if row_data.get("carbon_content"):
                cc_value = float(row_data.get("carbon_content"))
                inputs["carbon_content"] = {"value": cc_value, "unit": "%"}
                user_overrides["carbon_content"] = {"value": cc_value, "unit": "%", "is_override": True}
            if row_data.get("oxidation_factor"):
                of_value = float(row_data.get("oxidation_factor"))
                inputs["oxidation_factor"] = {"value": of_value, "unit": ""}
                user_overrides["oxidation_factor"] = {"value": of_value, "unit": "", "is_override": True}
        
        # GWP for fugitives - user override OR from fuel_database
        if row_data.get("co2_gwp_fugitives"):
            gwp_value = float(row_data.get("co2_gwp_fugitives"))
            user_overrides["co2_gwp_fugitives"] = {"value": gwp_value, "unit": "", "is_override": True}
        elif category_key == "fugitive_emissions" and fuel_data.get("gwp_fugitives"):
            gwp_value = float(fuel_data.get("gwp_fugitives"))
            user_overrides["co2_gwp_fugitives"] = {"value": gwp_value, "unit": "kgCO2e/kg", "source_name": fuel_data.get("source", "Fuel Database")}
        
        # Execute calculation
        calc_engine = CalcEngine(self.db)
        
        # Get formula
        formula = None
        if formula_id:
            formula = await self.db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
        
        outputs = {}
        co2e = 0.0
        
        if formula:
            try:
                context = {
                    "fuel_code": fuel_data.get("id") or fuel_data.get("fuel_code"),
                    "fuel_database_id": fuel_data.get("id"),
                    "fuel_name": fuel_data.get("fuel_name"),
                    "ef_quantity_provided": ef_quantity_provided,
                }
                logger.info(f"[SCOPE1_BULK] Executing calc engine: formula={formula_id}, inputs={inputs}, context={context}")
                result = await calc_engine.execute(
                    formula.get("definition", formula),
                    inputs,
                    context=context,
                    user_overrides=user_overrides,
                    dry_run=False,
                    emission_record_id=record_id,
                    org_id=self.organization_id
                )
                outputs = result.get("outputs", {})
                co2e = outputs.get("co2e", {}).get("value", 0) or 0
                logger.info(f"[SCOPE1_BULK] Calculation result: co2e={co2e}")
            except Exception as e:
                logger.error(f"[SCOPE1_BULK] Calc engine error: {e}")
                raise
        else:
            logger.warning(f"[SCOPE1_BULK] No formula found for category_id={category_id}, formula_id={formula_id}")
        
        # Build dynamic_field_values matching manual upload structure
        dynamic_field_values = {
            "qty": {"value": qty, "unit": unit_qty},
        }
        if row_data.get("cv"):
            dynamic_field_values["cv"] = user_overrides.get("cv", {})
        if row_data.get("density"):
            dynamic_field_values["density"] = user_overrides.get("density", {})
        if row_data.get("ef_quantity"):
            ef_key = "ef_co2" if derived_methodology == "using_heat_basis_ncv" else "ef_quantity"
            dynamic_field_values[ef_key] = user_overrides.get(ef_key, user_overrides.get("ef_quantity", {}))
        if row_data.get("co2_gwp_fugitives"):
            dynamic_field_values["co2_gwp_fugitives"] = user_overrides.get("co2_gwp_fugitives", {})
        if row_data.get("carbon_content"):
            dynamic_field_values["carbon_content"] = user_overrides.get("carbon_content", {})
        if row_data.get("oxidation_factor"):
            dynamic_field_values["oxidation_factor"] = user_overrides.get("oxidation_factor", {})
        
        # Build emission record matching manual upload structure
        # Flaring records are stored with category "Flaring" (or the DB name)
        # and category_code "flaring" to match the manual form's storage pattern.
        stored_category_name = category_doc.get("name") if category_doc else category_key.replace("_", " ").title()
        
        emission_record = {
            "id": record_id,
            "facility_id": facility.get("id"),
            "organization_id": self.organization_id,
            "reporting_period": row_data.get("reporting_period"),
            "frequency_type": row_data.get("frequency_type", "monthly"),
            "scope": "scope1",
            "category": stored_category_name,
            "category_code": category_code,
            "sub_category": fuel_data.get("fuel_name"),
            "fuel_type": fuel_data.get("fuel_name"),
            "fuel_database_id": fuel_data.get("id"),
            "formula_id": formula_id,
            "process_type": process_type_key or None,
            "is_custom_fuel": is_custom_fuel,
            "calculation_methodology": derived_methodology or None,
            "dynamic_field_values": dynamic_field_values,
            "outputs": outputs,
            "co2_emissions": outputs.get("co2", {}).get("value", 0) if outputs else 0,
            "ch4_emissions": outputs.get("ch4", {}).get("value", 0) if outputs else 0,
            "n2o_emissions": outputs.get("n2o", {}).get("value", 0) if outputs else 0,
            "co2e_emissions": co2e,
            "total_emissions": co2e,
            "source_of_information": "Bulk Upload",
            "record_source": (str(row_data.get("record_source")).strip()
                              if row_data.get("record_source") not in (None, "") else ""),
            "notes": str(row_data.get("notes") or "") if row_data.get("notes") else None,
            "responsible_person": str(row_data.get("responsible_person") or "") if row_data.get("responsible_person") else None,
            "responsible_person_designation": str(row_data.get("responsible_designation") or "") if row_data.get("responsible_designation") else None,
            "responsible_person_contact": str(row_data.get("responsible_contact") or "") if row_data.get("responsible_contact") else None,
            "process_names": [str(row_data.get("process_name"))] if row_data.get("process_name") else [],
            "process_descriptions": [{"name": str(row_data.get("process_name") or ""), "description": str(row_data.get("process_description") or "")}] if row_data.get("process_name") else [],
            "created_by": self.user_id,
            "created_by_email": self.user_email,
            "created_by_name": self.user_name,
            "created_at": now.isoformat(),
            "updated_at": None,
            "bulk_upload_job_id": bulk_job_id,
        }
        
        return emission_record
    
    async def _calculate_scope2_emission(self, row_data: Dict, facility: Dict,
                                          fuel_data: Dict, category_key: str,
                                          bulk_job_id: str) -> Dict:
        """Calculate Scope 2 emission using calc engine"""
        from calc_engine.execution import CalcEngine
        from calc_engine.formulas import get_decision_tree_for_category, resolve_formula_id
        
        now = datetime.now(timezone.utc)
        record_id = str(uuid.uuid4())
        
        # Get category name from row data (original user input)
        category_name = row_data.get("category", "").strip()
        
        # Map category name to code for emission_categories lookup
        category_code_map = {
            "purchased electricity": "purchased_electricity",
            "purchased steam/heat": "purchased_steam_heat",
            "purchased heat/steam": "purchased_steam_heat",
        }
        category_code = category_code_map.get(category_name.lower(), category_key)
        
        # Get category from emission_categories (same as Scope 3)
        category_doc = await self.db.emission_categories.find_one(
            {"code": category_code, "is_active": True},
            {"_id": 0, "id": 1, "name": 1}
        )
        if not category_doc:
            # Try with name match
            category_doc = await self.db.emission_categories.find_one(
                {"name": {"$regex": f"^{category_name}$", "$options": "i"}, "is_active": True},
                {"_id": 0, "id": 1, "name": 1}
            )
        
        category_id = category_doc.get("id") if category_doc else None
        
        # Get decision tree and resolve formula (same logic as calc_engine/router.py)
        decision_tree = await get_decision_tree_for_category(self.db, category_id) if category_id else None
        
        decision_inputs = {
            "fuel_code": fuel_data.get("id"),
            "fuel_database_id": fuel_data.get("id"),
        }
        
        formula_id = None
        if decision_tree:
            try:
                # decision_tree might have "tree" key or be the tree itself
                tree_data = decision_tree.get("tree", decision_tree) if isinstance(decision_tree, dict) else decision_tree
                result = resolve_formula_id(tree_data, decision_inputs)
                # resolve_formula_id returns (formula_id, path) tuple or just formula_id
                formula_id = result[0] if isinstance(result, tuple) else result
            except Exception as e:
                logger.warning(f"[SCOPE2_BULK] Decision tree resolution failed: {e}")
        
        # No decision tree - look up formula directly by category_id (same as calc_engine/router.py line 737)
        if not formula_id and category_id:
            formula_doc = await self.db.ce_formulas.find_one(
                {
                    "is_active": True,
                    "$or": [
                        {"category_id": category_id},
                        {"category_ids": category_id},
                    ],
                },
                {"_id": 0, "id": 1},
            )
            if formula_doc:
                formula_id = formula_doc.get("id")
        
        # Build inputs
        qty = float(row_data.get("qty_energy", 0))
        unit_qty = row_data.get("unit_qty", "")
        
        # Check if user provided emission factor in bulk upload
        ef_quantity_provided = bool(row_data.get("ef_quantity_electricity_co2"))
        
        inputs = {
            "qty_energy": {"value": qty, "unit": unit_qty},
            "ef_quantity_provided": {"value": ef_quantity_provided, "unit": ""}
        }
        
        # If user provided ef_quantity, add it to inputs
        if ef_quantity_provided:
            ef_value = float(row_data.get("ef_quantity_electricity_co2"))
            ef_unit = row_data.get("ef_unit", "kgCO2/kWh")
            inputs["ef_quantity_electricity_co2"] = {"value": ef_value, "unit": ef_unit}
        
        # Build user overrides
        user_overrides = {}
        
        # Emission factor override OR from fuel_database
        if ef_quantity_provided:
            ef_value = float(row_data.get("ef_quantity_electricity_co2"))
            ef_unit = row_data.get("ef_unit", "kgCO2/kWh")
            user_overrides["ef_quantity_electricity_co2"] = {"value": ef_value, "unit": ef_unit, "is_override": True}
        elif fuel_data.get("emission_factor_basis_quantity") is not None:
            # Use emission_factor_basis_quantity from fuel_database (e.g., 0.71 tCO2/MWh, or 0 for renewables)
            ef_value = float(fuel_data.get("emission_factor_basis_quantity"))
            ef_unit = fuel_data.get("emission_factor_basis_unit", "tCO2/MWh")
            user_overrides["ef_quantity_electricity_co2"] = {"value": ef_value, "unit": ef_unit, "source_name": fuel_data.get("source", "Fuel Database")}
        
        # Execute calculation
        calc_engine = CalcEngine(self.db)
        
        formula = None
        if formula_id:
            formula = await self.db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
        
        outputs = {}
        co2e = 0.0
        
        if formula:
            try:
                context = {
                    "fuel_code": fuel_data.get("id") or fuel_data.get("fuel_code"),
                    "fuel_database_id": fuel_data.get("id"),
                    "ef_quantity_provided": ef_quantity_provided,
                }
                logger.info(f"[SCOPE2_BULK] Executing calc engine: formula={formula_id}, qty={qty}, ef_provided={ef_quantity_provided}")
                result = await calc_engine.execute(
                    formula.get("definition", formula),
                    inputs,
                    context=context,
                    user_overrides=user_overrides,
                    dry_run=False,
                    emission_record_id=record_id,
                    org_id=self.organization_id
                )
                outputs = result.get("outputs", {})
                co2e = outputs.get("co2e", {}).get("value", 0) or 0
                logger.info(f"[SCOPE2_BULK] Calculation result: co2e={co2e}")
            except Exception as e:
                logger.error(f"[SCOPE2_BULK] Calc engine error: {e}")
                raise
        else:
            logger.warning(f"[SCOPE2_BULK] No formula found for category_id={category_id}, formula_id={formula_id}")
        
        # Build dynamic_field_values
        dynamic_field_values = {
            "qty_energy": {"value": qty, "unit": unit_qty},
        }
        if row_data.get("ef_quantity_electricity_co2"):
            dynamic_field_values["ef_quantity_electricity_co2"] = user_overrides.get("ef_quantity_electricity_co2", {})
        
        # Build emission record
        emission_record = {
            "id": record_id,
            "facility_id": facility.get("id"),
            "organization_id": self.organization_id,
            "reporting_period": row_data.get("reporting_period"),
            "frequency_type": row_data.get("frequency_type", "monthly"),
            "scope": "scope2",
            "category": category_doc.get("name") if category_doc else category_key.replace("_", " ").title(),
            "sub_category": fuel_data.get("fuel_name"),
            "fuel_type": fuel_data.get("fuel_name"),
            "fuel_database_id": fuel_data.get("id"),
            "formula_id": formula_id,
            "is_custom_fuel": fuel_data.get("is_custom", False),
            "dynamic_field_values": dynamic_field_values,
            "outputs": outputs,
            "co2_emissions": outputs.get("co2", {}).get("value", 0) if outputs else 0,
            "ch4_emissions": outputs.get("ch4", {}).get("value", 0) if outputs else 0,
            "n2o_emissions": outputs.get("n2o", {}).get("value", 0) if outputs else 0,
            "co2e_emissions": co2e,
            "total_emissions": co2e,
            "source_of_information": "Bulk Upload",
            "record_source": (str(row_data.get("record_source")).strip()
                              if row_data.get("record_source") not in (None, "") else ""),
            "notes": str(row_data.get("notes") or "") if row_data.get("notes") else None,
            "responsible_person": str(row_data.get("responsible_person") or "") if row_data.get("responsible_person") else None,
            "responsible_person_designation": str(row_data.get("responsible_designation") or "") if row_data.get("responsible_designation") else None,
            "responsible_person_contact": str(row_data.get("responsible_contact") or "") if row_data.get("responsible_contact") else None,
            "process_names": [str(row_data.get("process_name"))] if row_data.get("process_name") else [],
            "process_descriptions": [{"name": str(row_data.get("process_name") or ""), "description": str(row_data.get("process_description") or "")}] if row_data.get("process_name") else [],
            "created_by": self.user_id,
            "created_by_email": self.user_email,
            "created_by_name": self.user_name,
            "created_at": now.isoformat(),
            "updated_at": None,
            "bulk_upload_job_id": bulk_job_id,
        }
        
        return emission_record
