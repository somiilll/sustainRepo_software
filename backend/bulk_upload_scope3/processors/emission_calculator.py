"""
Emission Calculator for Scope 3 Bulk Upload
Handles emission calculations using the calc-engine
"""
from typing import Dict, List, Optional, Any, Tuple
import uuid
from datetime import datetime, timezone

from ..models import CalculationMethod

# Import calc_engine components
from calc_engine.execution import CalcEngine, CalculationError
from calc_engine.formulas import get_decision_tree_for_category, resolve_formula_id, DecisionTreeError
from calc_engine.units import convert


# Mapping from bulk upload category codes to emission_categories codes
CATEGORY_CODE_TO_CATEGORY_ID_MAP = {
    "C1": "purchased_goods_and_services",
    "C2": "capital_goods",
    "C3": "fuel_and_energy_related_activities_not_included_in_scope_1_or_scope_2",
    "C4": "upstream_transportation_distribution",
    "C5": "waste_generated_in_operations",
    "C6": "business_travel",
    "C7": "employee_commuting",
    "C8": "upstream_leased_assets",
    "C9": "downstream_transportation_and_distribution",
    "C10": "processing_of_sold_products",
    "C11": "use_of_sold_products",
    "C12": "end_of_life_treatment_of_sold_products",
    "C13": "downstream_leased_assets",
    "C14": "franchises",
    "C15": "investments",
}


class EmissionCalculator:
    """Calculates emissions for bulk upload rows using calc_engine"""
    
    def __init__(self, db):
        self.db = db
        self._calc_engine = CalcEngine(db)
        self._category_id_cache = {}
        self._decision_tree_cache = {}
    
    def _extract_co2e(self, emissions: Dict) -> float:
        """Extract co2e value from emissions dict that may have nested structure"""
        co2e = emissions.get("co2e", 0)
        if isinstance(co2e, dict):
            return float(co2e.get("value", 0))
        return float(co2e) if co2e else 0.0
    
    async def _get_category_id(self, category_code: str) -> Optional[str]:
        """Get the emission_categories.id for a category code (e.g., C1 -> UUID)"""
        if category_code in self._category_id_cache:
            return self._category_id_cache[category_code]
        
        # Map category code to category name/code in emission_categories
        cat_code = CATEGORY_CODE_TO_CATEGORY_ID_MAP.get(category_code)
        if not cat_code:
            return None
        
        # Find the category
        category = await self.db.emission_categories.find_one(
            {"code": cat_code, "is_active": True},
            {"_id": 0, "id": 1}
        )
        
        if category:
            self._category_id_cache[category_code] = category["id"]
            return category["id"]
        
        return None
    
    async def _get_decision_tree(self, category_id: str) -> Optional[Dict]:
        """Get decision tree for a category (with caching)"""
        if category_id in self._decision_tree_cache:
            return self._decision_tree_cache[category_id]
        
        tree = await get_decision_tree_for_category(self.db, category_id)
        self._decision_tree_cache[category_id] = tree
        return tree
    
    async def _resolve_formula(self, category_id: str, decision_inputs: Dict) -> Tuple[Optional[str], List[dict]]:
        """Resolve formula ID using decision tree or fallback to category formula"""
        tree = await self._get_decision_tree(category_id)
        
        if tree:
            try:
                formula_id, tree_path = resolve_formula_id(tree["tree"], decision_inputs)
                return formula_id, tree_path
            except DecisionTreeError:
                # Decision tree couldn't resolve - try fallback
                pass
        
        # No decision tree or couldn't resolve - look up formula directly by category_id
        formula_doc = await self.db.ce_formulas.find_one(
            {"category_id": category_id, "is_active": True},
            {"_id": 0, "id": 1}
        )
        
        if formula_doc:
            return formula_doc["id"], []
        
        return None, []
    
    async def _convert_unit(self, value: float, from_unit: str, to_unit: str) -> Tuple[float, bool]:
        """Convert unit using calc_engine unit conversion. Returns (converted_value, success)"""
        if not from_unit or not to_unit:
            return value, True
        
        if from_unit.lower() == to_unit.lower():
            return value, True
        
        try:
            converted, _ = await convert(self.db, value, from_unit, to_unit)
            return converted, True
        except (ValueError, Exception):
            return value, False
    
    async def calculate_emissions(self, row_data: Dict, category_code: str,
                                   method: CalculationMethod,
                                   activity_id: Optional[str] = None,
                                   formula_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculate emissions for a row using calc_engine
        
        Args:
            row_data: Row data from upload
            category_code: Category code (C1-C15)
            method: Calculation method
            activity_id: Matched activity ID (optional)
            formula_id: Matched formula ID (optional)
            
        Returns:
            Dict with calculated emissions or error info
        """
        # For supplier_basis, calculate directly (no formula needed)
        if method == CalculationMethod.SUPPLIER_BASIS:
            return await self._calculate_supplier_basis_with_conversion(row_data)
        
        # For activity_basis and spend_basis, use calc_engine
        if activity_id:
            return await self._calculate_with_calc_engine(
                row_data, category_code, method, activity_id
            )
        
        # No activity matched - return error
        return {
            "co2": 0.0,
            "ch4": 0.0,
            "n2o": 0.0,
            "co2e": 0.0,
            "calculation_method": "error",
            "error": "Activity not matched - cannot calculate emissions",
            "notes": "Activity not matched - manual calculation required"
        }
    
    async def _calculate_supplier_basis_with_conversion(self, row_data: Dict) -> Dict[str, Any]:
        """Calculate emissions using supplier-provided emission factor with unit conversion"""
        quantity = float(row_data.get("supplier_quantity") or 0)
        ef = float(row_data.get("supplier_ef") or 0)
        input_unit = row_data.get("supplier_unit")
        ef_unit = row_data.get("supplier_ef_unit")
        
        # Parse EF unit to get expected input unit (e.g., kgCO2e/L -> L)
        expected_unit = None
        if ef_unit and "/" in ef_unit:
            expected_unit = ef_unit.split("/")[-1].strip()
        
        # Convert input quantity to expected unit if needed
        converted_quantity = quantity
        if input_unit and expected_unit and input_unit.lower() != expected_unit.lower():
            converted_quantity, success = await self._convert_unit(quantity, input_unit, expected_unit)
            if not success:
                return {
                    "co2": 0.0,
                    "ch4": 0.0,
                    "n2o": 0.0,
                    "co2e": 0.0,
                    "calculation_method": "error",
                    "error": f"Cannot convert {input_unit} to {expected_unit}",
                    "notes": f"Unit conversion failed: {input_unit} -> {expected_unit}"
                }
        
        # Simple calculation: Emissions = Quantity × Emission Factor
        co2e = converted_quantity * ef
        
        return {
            "co2": 0.0,
            "ch4": 0.0,
            "n2o": 0.0,
            "co2e": co2e,
            "calculation_method": "supplier_basis",
            "unit": "kgCO2e",  # Assuming supplier EF produces kgCO2e
            "inputs": {
                "supplier_quantity": quantity,
                "supplier_quantity_converted": converted_quantity,
                "supplier_ef": ef,
                "input_unit": input_unit,
                "ef_unit": ef_unit,
                "expected_unit": expected_unit
            }
        }
    
    async def _calculate_with_calc_engine(self, row_data: Dict, category_code: str,
                                           method: CalculationMethod,
                                           activity_id: str) -> Dict[str, Any]:
        """Calculate emissions using calc_engine with proper unit conversion"""
        
        # 1. Fetch emission factor data
        ef_data = await self.db.scope3_ef.find_one(
            {"id": activity_id},
            {"_id": 0}
        )
        
        if not ef_data:
            return {
                "co2": 0.0, "ch4": 0.0, "n2o": 0.0, "co2e": 0.0,
                "calculation_method": "error",
                "error": f"Emission factor not found for activity_id: {activity_id}"
            }
        
        # 2. Get category_id for decision tree lookup
        category_id = await self._get_category_id(category_code)
        if not category_id:
            return {
                "co2": 0.0, "ch4": 0.0, "n2o": 0.0, "co2e": 0.0,
                "calculation_method": "error",
                "error": f"Category not found: {category_code}"
            }
        
        # 3. Build decision inputs for formula selection
        decision_inputs = {
            "calculation_method_scope3": method.value,
        }
        
        # Add activity_type for C6/C7
        if row_data.get("activity_type"):
            decision_inputs["activity_type"] = row_data.get("activity_type")
        
        # Add subcategory for C8-C14
        if row_data.get("sub_category"):
            subcat = row_data.get("sub_category")
            decision_inputs["subcategory"] = subcat.lower().replace(" ", "_") if subcat else None
        
        # 4. Resolve formula using decision tree
        formula_id, tree_path = await self._resolve_formula(category_id, decision_inputs)
        
        if not formula_id:
            # Fallback to simple calculation if no formula found
            return await self._calculate_simple_fallback(row_data, ef_data, method)
        
        # 5. Get formula definition
        formula_doc = await self.db.ce_formulas.find_one(
            {"id": formula_id, "is_active": True},
            {"_id": 0}
        )
        
        if not formula_doc:
            return await self._calculate_simple_fallback(row_data, ef_data, method)
        
        # 6. Prepare inputs for calc_engine
        # Get default_unit from scope3_ef record
        default_unit = ef_data.get("default_unit")
        ef_unit = ef_data.get("unit")  # e.g., "kgCO2e/L"
        
        # Parse expected unit from EF unit if default_unit not available
        if not default_unit and ef_unit and "/" in ef_unit:
            default_unit = ef_unit.split("/")[-1].strip()
        
        # Get quantity and unit from row_data
        input_quantity, input_unit = self._get_quantity_and_unit(row_data, method)
        
        # Convert input to default_unit if needed
        converted_quantity = input_quantity
        if default_unit and input_unit:
            if input_unit.lower() != default_unit.lower():
                converted_quantity, success = await self._convert_unit(input_quantity, input_unit, default_unit)
                if not success:
                    # Try to get expected unit from formula inputs
                    formula_def = formula_doc.get("definition", {})
                    for inp in formula_def.get("inputs", []):
                        if inp.get("variable") == "activity_value":
                            formula_expected_unit = inp.get("expected_unit")
                            if formula_expected_unit:
                                converted_quantity, success = await self._convert_unit(
                                    input_quantity, input_unit, formula_expected_unit
                                )
                                if success:
                                    default_unit = formula_expected_unit
                                    break
                    
                    if not success:
                        return {
                            "co2": 0.0, "ch4": 0.0, "n2o": 0.0, "co2e": 0.0,
                            "calculation_method": "error",
                            "error": f"Cannot convert {input_unit} to {default_unit}",
                            "notes": "Unit conversion failed"
                        }
        
        # Build calc_engine inputs
        calc_inputs = {
            "activity_value": {
                "value": converted_quantity,
                "unit": default_unit or input_unit or "1"
            }
        }
        
        # Build context for property resolution
        context = {
            "fuel_name": ef_data.get("activity"),
            "activity": ef_data.get("activity"),
            "activity_type": ef_data.get("activity_type"),
            "scope3_ef_id": activity_id,
            "scope3_ef_default_unit": default_unit,
            "category": ef_data.get("category"),
            "method": method.value,
        }
        
        # 7. Execute formula via calc_engine
        try:
            formula_def = dict(formula_doc.get("definition", {}))
            formula_def.setdefault("id", formula_doc["id"])
            formula_def.setdefault("version_id", formula_doc.get("version_id"))
            
            result = await self._calc_engine.execute(
                formula=formula_def,
                inputs=calc_inputs,
                context=context,
                dry_run=True  # Don't persist audit trail for bulk upload
            )
            
            # Extract outputs
            outputs = result.get("outputs", {})
            output_unit = "kgCO2e"  # Default
            
            # Check output unit from formula
            for out in formula_def.get("outputs", []):
                if out.get("variable") == "co2e":
                    output_unit = out.get("unit", "kgCO2e")
                    break
            
            return {
                "co2": outputs.get("co2", 0.0),
                "ch4": outputs.get("ch4", 0.0),
                "n2o": outputs.get("n2o", 0.0),
                "co2e": outputs.get("co2e", 0.0),
                "unit": output_unit,
                "calculation_method": method.value,
                "formula_id": formula_id,
                "decision_path": tree_path,
                "inputs": {
                    "original_quantity": input_quantity,
                    "original_unit": input_unit,
                    "converted_quantity": converted_quantity,
                    "converted_unit": default_unit,
                    "activity_id": activity_id,
                    "emission_factor": ef_data.get("emission_factor")
                },
                "audit_trail": result.get("audit_trail", [])
            }
            
        except (CalculationError, Exception) as e:
            # Calc engine failed - return error
            return {
                "co2": 0.0, "ch4": 0.0, "n2o": 0.0, "co2e": 0.0,
                "calculation_method": "error",
                "error": str(e),
                "notes": f"Calc engine error: {str(e)}"
            }
    
    async def _calculate_simple_fallback(self, row_data: Dict, ef_data: Dict,
                                          method: CalculationMethod) -> Dict[str, Any]:
        """Fallback calculation when no formula is available - with unit conversion"""
        ef_value = float(ef_data.get("emission_factor") or 0)
        default_unit = ef_data.get("default_unit")
        ef_unit = ef_data.get("unit")
        
        # Parse expected unit from EF unit
        expected_unit = default_unit
        if not expected_unit and ef_unit and "/" in ef_unit:
            expected_unit = ef_unit.split("/")[-1].strip()
        
        # Get quantity and unit
        input_quantity, input_unit = self._get_quantity_and_unit(row_data, method)
        
        # Convert to expected unit
        converted_quantity = input_quantity
        if expected_unit and input_unit and input_unit.lower() != expected_unit.lower():
            converted_quantity, success = await self._convert_unit(input_quantity, input_unit, expected_unit)
            if not success:
                return {
                    "co2": 0.0, "ch4": 0.0, "n2o": 0.0, "co2e": 0.0,
                    "calculation_method": "error",
                    "error": f"Cannot convert {input_unit} to {expected_unit}"
                }
        
        # Simple calculation
        co2e = converted_quantity * ef_value
        
        # Determine output unit (typically kgCO2e from EF unit prefix)
        output_unit = "kgCO2e"
        if ef_unit:
            if ef_unit.startswith("tCO2e"):
                output_unit = "tCO2e"
            elif ef_unit.startswith("kgCO2e"):
                output_unit = "kgCO2e"
        
        return {
            "co2": 0.0,
            "ch4": 0.0,
            "n2o": 0.0,
            "co2e": co2e,
            "unit": output_unit,
            "calculation_method": f"{method.value}_fallback",
            "inputs": {
                "original_quantity": input_quantity,
                "original_unit": input_unit,
                "converted_quantity": converted_quantity,
                "expected_unit": expected_unit,
                "emission_factor": ef_value,
                "ef_unit": ef_unit
            },
            "notes": "Calculated using fallback method (no formula found)"
        }
    
    def _get_quantity_and_unit(self, row_data: Dict, method: CalculationMethod) -> Tuple[float, Optional[str]]:
        """Extract quantity and unit from row_data based on method"""
        if method == CalculationMethod.ACTIVITY_BASIS:
            quantity = float(row_data.get("quantity_used") or 0)
            # Check all possible unit key names from template
            unit = (row_data.get("unit_used") or 
                    row_data.get("quantity_unit") or 
                    row_data.get("unit_quantity"))  # Template uses "unit_quantity"
            
            # For transportation, might need distance × quantity (tonne.km)
            if row_data.get("distance_travelled") and row_data.get("quantity_goods"):
                distance = float(row_data.get("distance_travelled") or 0)
                goods_qty = float(row_data.get("quantity_goods") or 0)
                quantity = distance * goods_qty
                unit = "tonne.km"
            
            return quantity, unit
        
        elif method == CalculationMethod.SPEND_BASIS:
            quantity = float(row_data.get("spent_amount") or 0)
            unit = row_data.get("spent_currency") or row_data.get("spent_unit") or "INR"
            return quantity, unit
        
        return 0.0, None
    
    def build_emission_record(self, row_data: Dict, category_code: str,
                               category_name: str, facility: Dict,
                               organization_id: str, user_id: str,
                               method: CalculationMethod,
                               activity_match: Dict,
                               calculated_emissions: Dict,
                               formula_id: Optional[str] = None,
                               bulk_job_id: Optional[str] = None) -> Dict:
        """
        Build emission record in the format expected by the database
        
        This matches the format used by UI-created emissions
        """
        now = datetime.now(timezone.utc)
        
        # Get reporting period and frequency from row_data (already parsed)
        reporting_period = row_data.get("reporting_period", "")
        frequency_type = row_data.get("frequency_type", "monthly")
        reporting_year_type = row_data.get("reporting_year_type")  # financial_year or calendar_year
        
        # If reporting_period not set, try to parse from reporting_month (legacy)
        if not reporting_period and row_data.get("reporting_month"):
            reporting_month = row_data.get("reporting_month", "")
            # Convert "Jan-2025" to "2025-01" format
            month_map = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
                'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
                'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
            }
            try:
                parts = reporting_month.split("-")
                if len(parts) == 2:
                    month_abbr = parts[0].lower()[:3]
                    year = parts[1]
                    month_num = month_map.get(month_abbr, "01")
                    reporting_period = f"{year}-{month_num}"
                else:
                    reporting_period = reporting_month
            except (ValueError, AttributeError, IndexError):
                reporting_period = reporting_month
        
        # Build dynamic field values
        dynamic_field_values = {}
        
        if method == CalculationMethod.ACTIVITY_BASIS:
            if row_data.get("quantity_used"):
                dynamic_field_values["activity_value"] = {
                    "value": float(row_data.get("quantity_used")),
                    "unit": row_data.get("unit_quantity", "")
                }
            if row_data.get("distance_travelled"):
                dynamic_field_values["distance_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": "km"
                }
            if row_data.get("quantity_goods"):
                dynamic_field_values["quantity_of_goods"] = {
                    "value": float(row_data.get("quantity_goods")),
                    "unit": row_data.get("unit_goods", "t")
                }
            if row_data.get("passengers"):
                dynamic_field_values["passengers"] = {
                    "value": float(row_data.get("passengers")),
                    "unit": ""
                }
        
        elif method == CalculationMethod.SPEND_BASIS:
            if row_data.get("spent_amount"):
                dynamic_field_values["spend_amount"] = {
                    "value": float(row_data.get("spent_amount")),
                    "unit": "INR"
                }
        
        elif method == CalculationMethod.SUPPLIER_BASIS:
            dynamic_field_values["activity_value_supplier_based"] = {
                "value": float(row_data.get("supplier_quantity", 0)),
                "unit": row_data.get("supplier_unit", "")
            }
            dynamic_field_values["emission_factor_supplier_based"] = {
                "value": float(row_data.get("supplier_ef", 0)),
                "unit": row_data.get("supplier_ef_unit", "kgCO2e")
            }
        
        # Build outputs - handle both dict and float formats from calc_engine
        def extract_value(val):
            if isinstance(val, dict):
                return float(val.get("value", 0))
            return float(val) if val else 0.0
        
        co2_val = extract_value(calculated_emissions.get("co2", 0))
        ch4_val = extract_value(calculated_emissions.get("ch4", 0))
        n2o_val = extract_value(calculated_emissions.get("n2o", 0))
        co2e_val = extract_value(calculated_emissions.get("co2e", 0))
        
        # Get output unit from calc_engine result
        output_unit = calculated_emissions.get("unit", "kgCO2e")
        
        outputs = {
            "co2": {
                "value": co2_val,
                "unit": output_unit.replace("CO2e", "CO2") if "CO2e" in output_unit else "tCO2"
            },
            "ch4": {
                "value": ch4_val,
                "unit": output_unit.replace("CO2e", "CH4") if "CO2e" in output_unit else "tCH4"
            },
            "n2o": {
                "value": n2o_val,
                "unit": output_unit.replace("CO2e", "N2O") if "CO2e" in output_unit else "tN2O"
            },
            "co2e": {
                "value": co2e_val,
                "unit": output_unit
            }
        }
        
        # Sync sub_category with scope3_activity for consistency (as done in manual entry)
        sub_category = row_data.get("sub_category") or activity_match.get("activity_name") or row_data.get("activity")
        
        record = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "facility_id": facility.get("id"),
            "facility_name": facility.get("name"),
            "scope": "scope3",
            "sub_scope": None,
            "category": category_name,
            "sub_category": sub_category,
            "calculation_method_scope3": method.value,
            "scope3_ef_id": activity_match.get("activity_id"),
            "scope3_activity": activity_match.get("activity_name") or row_data.get("activity"),
            "scope3_activity_type": row_data.get("activity_type"),
            "scope3_subcategory": row_data.get("sub_category"),
            "scope3_custom_activity": row_data.get("activity") if method == CalculationMethod.SUPPLIER_BASIS and not activity_match.get("activity_id") else None,
            "use_custom_activity": method == CalculationMethod.SUPPLIER_BASIS and not activity_match.get("activity_id"),
            "reporting_period": reporting_period,
            "frequency_type": frequency_type,
            "reporting_year_type": reporting_year_type,
            "dynamic_field_values": dynamic_field_values,
            "outputs": outputs,
            "co2_emissions": co2_val,
            "ch4_emissions": ch4_val,
            "n2o_emissions": n2o_val,
            "co2e_emissions": co2e_val,
            "formula_id": formula_id,
            "supplier_name": str(row_data.get("supplier_name") or "") if row_data.get("supplier_name") else None,
            "supplier_code": str(row_data.get("supplier_code") or "") if row_data.get("supplier_code") else None,
            "source_of_information": "Bulk Upload",
            "responsible_person": str(row_data.get("responsible_person") or "") if row_data.get("responsible_person") else None,
            "responsible_person_designation": str(row_data.get("responsible_designation") or "") if row_data.get("responsible_designation") else None,
            "responsible_person_contact": str(row_data.get("responsible_contact") or "") if row_data.get("responsible_contact") else None,
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "upload_source": "bulk_upload",
            "bulk_upload_job_id": bulk_job_id
        }
        
        return record
    
    def build_c7_aggregated_record(self, employee_rows: List[Dict], 
                                    category_name: str, facility: Dict,
                                    organization_id: str, user_id: str,
                                    bulk_job_id: Optional[str] = None) -> Dict:
        """
        Build aggregated C7 emission record with multiple employees
        
        Args:
            employee_rows: List of processed employee row data with calculations
            category_name: Full category name
            facility: Facility dict
            organization_id: Organization ID
            user_id: User ID
            bulk_job_id: Bulk upload job ID
            
        Returns:
            Aggregated emission record
        """
        if not employee_rows:
            return None
        
        now = datetime.now(timezone.utc)
        
        # Use first row for common fields
        first_row = employee_rows[0]
        method = first_row.get("method", CalculationMethod.ACTIVITY_BASIS)
        if isinstance(method, str):
            # Handle both enum values (activity_basis) and Excel format (Average_data_based)
            method_clean = method.strip().lower().replace(" ", "_").replace("-", "_")
            method_map = {
                "activity_basis": CalculationMethod.ACTIVITY_BASIS,
                "spend_basis": CalculationMethod.SPEND_BASIS,
                "supplier_basis": CalculationMethod.SUPPLIER_BASIS,
                "average_data_based": CalculationMethod.ACTIVITY_BASIS,
            }
            method = method_map.get(method_clean, CalculationMethod.ACTIVITY_BASIS)
        
        # Build employees array
        employees = []
        monthly_totals = {}
        total_co2e = 0.0
        
        for emp_data in employee_rows:
            row_data = emp_data.get("row_data", {})
            emissions = emp_data.get("emissions", {})
            reporting_month = row_data.get("reporting_month", "")
            
            # Convert month format
            month_key = self._month_to_key(reporting_month)
            
            employee = {
                "id": str(uuid.uuid4()),
                "name": row_data.get("employee_name"),
                "employee_id": row_data.get("employee_id"),
                "department": row_data.get("department"),
                "monthly_data": {
                    month_key: {
                        "inputs": {
                            "distance_travelled": row_data.get("distance_travelled"),
                            "passengers": row_data.get("passengers"),
                            "working_days": row_data.get("working_days"),
                            "working_hours": row_data.get("working_hours")
                        },
                        "emissions": {
                            "co2e": self._extract_co2e(emissions)
                        }
                    }
                }
            }
            employees.append(employee)
            
            # Aggregate monthly totals
            co2e = self._extract_co2e(emissions)
            if month_key not in monthly_totals:
                monthly_totals[month_key] = {"co2e": 0}
            monthly_totals[month_key]["co2e"] += co2e
            total_co2e += co2e
        
        # Get reporting period from first row - it should already be parsed by row_processor
        # If 'reporting_period' exists, use it directly; otherwise fallback to parsing 'reporting_month'
        first_row_data = first_row.get("row_data", {})
        reporting_period = first_row_data.get("reporting_period", "")
        frequency_type = first_row_data.get("frequency_type", "monthly")
        
        if not reporting_period and first_row_data.get("reporting_month"):
            # Fallback: parse reporting_month manually (shouldn't happen if row_processor ran)
            reporting_month = first_row_data.get("reporting_month", "")
            month_map = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
                'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
                'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
            }
            try:
                parts = reporting_month.split("-")
                if len(parts) == 2:
                    month_abbr = parts[0].lower()[:3]
                    year = parts[1]
                    month_num = month_map.get(month_abbr, "01")
                    reporting_period = f"{year}-{month_num}"
                else:
                    reporting_period = reporting_month
            except (ValueError, AttributeError, IndexError):
                reporting_period = reporting_month
        
        record = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "facility_id": facility.get("id"),
            "facility_name": facility.get("name"),
            "scope": "scope3",
            "sub_scope": None,
            "category": category_name,
            "calculation_method_scope3": method.value if isinstance(method, CalculationMethod) else method,
            "scope3_ef_id": first_row.get("activity_match", {}).get("activity_id"),
            "scope3_activity": first_row.get("activity_match", {}).get("activity_name"),
            "scope3_activity_type": first_row.get("row_data", {}).get("activity_type"),
            "reporting_period": reporting_period,
            "frequency_type": frequency_type,
            "employees": employees,
            "monthly_totals": monthly_totals,
            "yearly_total": {"co2e": total_co2e},
            "co2e_emissions": total_co2e,
            "co2_emissions": 0,
            "ch4_emissions": 0,
            "n2o_emissions": 0,
            "outputs": {
                "co2e": {"value": total_co2e, "unit": "tCO2e"}
            },
            "source_of_information": "Bulk Upload",
            "responsible_person": first_row.get("row_data", {}).get("responsible_person"),
            "responsible_person_designation": first_row.get("row_data", {}).get("responsible_designation"),
            "responsible_person_contact": str(first_row.get("row_data", {}).get("responsible_contact") or "") if first_row.get("row_data", {}).get("responsible_contact") else None,
            "created_by": user_id,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "upload_source": "bulk_upload",
            "bulk_upload_job_id": bulk_job_id
        }
        
        return record
    
    def _month_to_key(self, reporting_month: str) -> str:
        """Convert 'Jan-2025' to 'jan' key"""
        try:
            return reporting_month.split("-")[0].lower()[:3]
        except (ValueError, AttributeError, IndexError):
            return "jan"
