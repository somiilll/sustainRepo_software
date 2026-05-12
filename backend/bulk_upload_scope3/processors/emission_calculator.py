"""
Emission Calculator for Scope 3 Bulk Upload
Handles emission calculations using the calc-engine
"""
from typing import Dict, List, Optional, Any, Tuple
import uuid
import logging
from datetime import datetime, timezone

from ..models import CalculationMethod

# Import calc_engine components
from calc_engine.execution import CalcEngine, CalculationError
from calc_engine.formulas import get_decision_tree_for_category, resolve_formula_id, DecisionTreeError
from calc_engine.units import convert

# Set up logging
logger = logging.getLogger(__name__)


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
        """
        Convert unit using calc_engine unit conversion. Returns (converted_value, success)
        
        IMPORTANT: 
        - Currencies (INR, USD, EUR, etc.) are NOT converted here - they are handled 
          natively by the formula using ppp and inflation_rate properties
        - Compound units (tonne.km, t_km, t.km, tkm) are NOT converted - they are 
          transport-specific and used as-is
        - Only simple mass units (kg, g, lbs → t) are converted when needed
        """
        if not from_unit or not to_unit:
            return value, True
        
        from_lower = from_unit.lower().strip()
        to_lower = to_unit.lower().strip()
        
        if from_lower == to_lower:
            return value, True
        
        # Define units that should NOT be converted (bypass conversion)
        # Currencies - handled by formula's ppp and inflation_rate
        currencies = {'inr', 'usd', 'eur', 'gbp', 'jpy', 'cny', 'aud', 'cad', 'chf', 'nzd', 'sgd', 'hkd'}
        
        # Compound transport units - used as-is
        compound_units = {'tonne.km', 't.km', 't_km', 'tkm', 'tonne-km', 'ton.km', 'ton-km', 'ton_km'}
        
        # Skip conversion for currencies
        if from_lower in currencies or to_lower in currencies:
            logger.info(f"[BULK_CALC] Skipping currency conversion: {from_unit} -> {to_unit} (handled by formula)")
            return value, True
        
        # Skip conversion for compound units
        if from_lower in compound_units or to_lower in compound_units:
            logger.info(f"[BULK_CALC] Skipping compound unit conversion: {from_unit} -> {to_unit} (used as-is)")
            return value, True
        
        # Handle simple mass conversions manually for reliability
        mass_to_tonnes = {
            'kg': 0.001,
            'g': 0.000001,
            'lbs': 0.000453592,
            'lb': 0.000453592,
            'pounds': 0.000453592,
            'ton': 1.0,  # metric ton
            'tonne': 1.0,
            't': 1.0,
            'mt': 1.0,  # metric ton
        }
        
        # If converting mass to tonnes (t)
        if to_lower in {'t', 'tonne', 'ton', 'mt'} and from_lower in mass_to_tonnes:
            conversion_factor = mass_to_tonnes[from_lower]
            converted = value * conversion_factor
            logger.info(f"[BULK_CALC] Mass conversion: {value} {from_unit} -> {converted} {to_unit}")
            return converted, True
        
        # If both are mass units, convert via tonnes
        if from_lower in mass_to_tonnes and to_lower in mass_to_tonnes:
            # Convert to tonnes first, then to target unit
            tonnes = value * mass_to_tonnes[from_lower]
            if mass_to_tonnes[to_lower] != 0:
                converted = tonnes / mass_to_tonnes[to_lower]
                logger.info(f"[BULK_CALC] Mass conversion: {value} {from_unit} -> {converted} {to_unit}")
                return converted, True
        
        # For other units, try the database conversion
        try:
            converted, _ = await convert(self.db, value, from_unit, to_unit)
            return converted, True
        except (ValueError, Exception) as e:
            logger.warning(f"[BULK_CALC] Unit conversion failed: {from_unit} -> {to_unit}, error: {str(e)}")
            # Return original value with success=True to allow calculation to proceed
            # The formula may still work with the original unit
            return value, True
    
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
        logger.info(f"[BULK_CALC] category_code={category_code}, category_id={category_id}")
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
        
        # Add activity_type for C6/C7 - NORMALIZE to lowercase with underscores for decision tree matching
        if row_data.get("activity_type"):
            activity_type_raw = row_data.get("activity_type")
            # Normalize: "Taxi Travel" -> "taxi_travel", "Wfh" -> "wfh", "Work From Home" -> "work_from_home"
            activity_type_normalized = activity_type_raw.lower().replace(" ", "_")
            # Map common display names to internal values
            activity_type_map = {
                "work_from_home": "wfh",
            }
            decision_inputs["activity_type"] = activity_type_map.get(activity_type_normalized, activity_type_normalized)
        
        # Add subcategory for C8-C14
        if row_data.get("sub_category"):
            subcat = row_data.get("sub_category")
            decision_inputs["subcategory"] = subcat.lower().replace(" ", "_") if subcat else None
        
        logger.info(f"[BULK_CALC] decision_inputs={decision_inputs}")
        
        # 4. Resolve formula using decision tree
        formula_id, tree_path = await self._resolve_formula(category_id, decision_inputs)
        logger.info(f"[BULK_CALC] Resolved formula_id={formula_id}, tree_path={tree_path}")
        
        if not formula_id:
            # Fallback to simple calculation if no formula found
            logger.warning("[BULK_CALC] No formula found, using fallback")
            return await self._calculate_simple_fallback(row_data, ef_data, method)
        
        # 5. Get formula definition
        logger.info(f"[BULK_CALC] Fetching formula_doc for formula_id={formula_id}")
        formula_doc = await self.db.ce_formulas.find_one(
            {"id": formula_id, "is_active": True},
            {"_id": 0}
        )
        
        if not formula_doc:
            logger.warning(f"[BULK_CALC] Formula document not found for formula_id={formula_id}, using fallback")
            return await self._calculate_simple_fallback(row_data, ef_data, method)
        
        logger.info(f"[BULK_CALC] Found formula_doc: name={formula_doc.get('name')}, inputs={[i.get('variable') for i in formula_doc.get('definition', {}).get('inputs', [])]}")
        
        # 6. Prepare inputs for calc_engine
        # Get default_unit from scope3_ef record
        default_unit = ef_data.get("default_unit")
        ef_unit = ef_data.get("unit")  # e.g., "kgCO2e/L"
        
        logger.info(f"[BULK_CALC] Units: default_unit={default_unit}, ef_unit={ef_unit}")
        
        # Parse expected unit from EF unit if default_unit not available
        if not default_unit and ef_unit and "/" in ef_unit:
            default_unit = ef_unit.split("/")[-1].strip()
            logger.info(f"[BULK_CALC] Parsed default_unit from ef_unit: {default_unit}")
        
        # Get quantity and unit from row_data
        input_quantity, input_unit = self._get_quantity_and_unit(row_data, method)
        logger.info(f"[BULK_CALC] Input: quantity={input_quantity}, unit={input_unit}")
        
        # Convert input to default_unit if needed
        converted_quantity = input_quantity
        if default_unit and input_unit:
            if input_unit.lower() != default_unit.lower():
                logger.info(f"[BULK_CALC] Converting {input_quantity} {input_unit} to {default_unit}")
                converted_quantity, success = await self._convert_unit(input_quantity, input_unit, default_unit)
                logger.info(f"[BULK_CALC] Conversion result: converted={converted_quantity}, success={success}")
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
                        logger.error(f"[BULK_CALC] Unit conversion failed: {input_unit} to {default_unit}")
                        return {
                            "co2": 0.0, "ch4": 0.0, "n2o": 0.0, "co2e": 0.0,
                            "calculation_method": "error",
                            "error": f"Cannot convert {input_unit} to {default_unit}",
                            "notes": "Unit conversion failed"
                        }
        
        # For spend_basis, fetch currency conversion data for ppp and inflation_rate
        currency_conversion = None
        if method == CalculationMethod.SPEND_BASIS:
            spent_currency = row_data.get("spent_currency") or row_data.get("currency") or "INR"
            # Get latest active currency conversion for the source currency
            currency_conversion = await self.db.currency_conversion.find_one(
                {"source_currency": spent_currency, "is_active": True},
                {"_id": 0, "purchase_parity": 1, "inflation_factor": 1}
            )
        
        # Build calc_engine inputs based on method and formula requirements
        # Map method to correct variable names based on ce_input_field_mappings and formula definitions
        calc_inputs = self._build_calc_inputs(
            method=method,
            row_data=row_data,
            converted_quantity=converted_quantity,
            input_unit=default_unit or input_unit or "1",
            formula_doc=formula_doc,
            ef_data=ef_data,
            currency_conversion=currency_conversion
        )
        
        logger.info(f"[BULK_CALC] calc_inputs={calc_inputs}")
        
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
        
        # Build user_overrides for property values (inflation_rate, ppp)
        # These are properties in the formula, not inputs, so they go in user_overrides
        user_overrides = {}
        if "inflation_rate" in calc_inputs:
            user_overrides["inflation_rate"] = calc_inputs.pop("inflation_rate")
        if "ppp" in calc_inputs:
            user_overrides["ppp"] = calc_inputs.pop("ppp")
        
        # 7. Execute formula via calc_engine
        try:
            formula_def = dict(formula_doc.get("definition", {}))
            formula_def.setdefault("id", formula_doc["id"])
            formula_def.setdefault("version_id", formula_doc.get("version_id"))
            
            logger.info(f"[BULK_CALC] Executing formula={formula_doc.get('name')}, id={formula_doc['id']}")
            logger.info(f"[BULK_CALC] user_overrides={user_overrides}")
            
            result = await self._calc_engine.execute(
                formula=formula_def,
                inputs=calc_inputs,
                context=context,
                user_overrides=user_overrides,
                dry_run=True  # Don't persist audit trail for bulk upload
            )
            
            logger.info(f"[BULK_CALC] Calc engine result outputs={result.get('outputs', {})}")
            
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
            logger.error(f"[BULK_CALC] Calc engine error: {str(e)}", exc_info=True)
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
    
    def _build_calc_inputs(self, method: CalculationMethod, row_data: Dict,
                           converted_quantity: float, input_unit: str,
                           formula_doc: Dict, ef_data: Dict,
                           currency_conversion: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Build calc_engine inputs with correct variable names based on method and formula requirements.
        
        Template Column → Formula Variable Mapping:
        - quantity_used → activity_value or qty (fugitives)
        - spent_amount → spent_value
        - quantity_goods → qty_travelled
        - distance_travelled → km_travelled
        - passengers → qty_passenger
        - rooms → qty_room
        - nights → qty_nights
        - working_days → working_days
        - working_hours → working_hour_per_day
        - supplier_quantity → activity_value_supplier_based
        - supplier_ef → emission_factor_supplier_based
        
        For spend_basis, ppp and inflation_rate come from:
        1. Template columns (if provided as override)
        2. currency_conversion table (fetched by caller)
        """
        calc_inputs = {}
        
        # Get formula inputs to understand what variables are expected
        formula_def = formula_doc.get("definition", {}) if formula_doc else {}
        expected_inputs = formula_def.get("inputs", [])
        expected_variables = [inp.get("variable") for inp in expected_inputs]
        
        if method == CalculationMethod.SPEND_BASIS:
            # Spend basis formula expects 'spent_value'
            # Template column: spent_amount → Formula variable: spent_value
            spent_amount = float(row_data.get("spent_amount") or 0)
            spent_currency = row_data.get("spent_currency") or row_data.get("currency") or "INR"
            
            calc_inputs["spent_value"] = {
                "value": spent_amount,
                "unit": spent_currency
            }
            
            # Add ppp and inflation_rate from template (override) or currency_conversion table
            # Priority: Template override > Currency conversion table > Default 1.0
            
            # Inflation rate
            if row_data.get("inflation_rate"):
                calc_inputs["inflation_rate"] = {
                    "value": float(row_data.get("inflation_rate")),
                    "unit": "",
                    "is_override": True
                }
            elif currency_conversion and currency_conversion.get("inflation_factor"):
                calc_inputs["inflation_rate"] = {
                    "value": float(currency_conversion.get("inflation_factor")),
                    "unit": ""
                }
            else:
                # Default to 1.0 to avoid division by zero
                calc_inputs["inflation_rate"] = {
                    "value": 1.0,
                    "unit": ""
                }
            
            # PPP (Purchase Power Parity)
            if row_data.get("ppp"):
                calc_inputs["ppp"] = {
                    "value": float(row_data.get("ppp")),
                    "unit": "",
                    "is_override": True
                }
            elif currency_conversion and currency_conversion.get("purchase_parity"):
                calc_inputs["ppp"] = {
                    "value": float(currency_conversion.get("purchase_parity")),
                    "unit": ""
                }
            else:
                # Default to 1.0 to avoid division by zero
                calc_inputs["ppp"] = {
                    "value": 1.0,
                    "unit": ""
                }
        
        elif method == CalculationMethod.SUPPLIER_BASIS:
            # Supplier basis formula expects 'activity_value_supplier_based' and 'emission_factor_supplier_based'
            # Template columns: supplier_quantity, supplier_unit, supplier_ef, supplier_ef_unit
            supplier_qty = float(row_data.get("supplier_quantity") or row_data.get("quantity_used") or 0)
            supplier_qty_unit = (row_data.get("supplier_unit") or 
                                 row_data.get("unit_quantity") or "")
            
            supplier_ef = float(row_data.get("supplier_ef") or 
                               row_data.get("supplier_emission_factor") or 0)
            supplier_ef_unit = (row_data.get("supplier_ef_unit") or 
                               row_data.get("supplier_emission_factor_unit") or "kgCO2e")
            
            calc_inputs["activity_value_supplier_based"] = {
                "value": supplier_qty,
                "unit": supplier_qty_unit
            }
            calc_inputs["emission_factor_supplier_based"] = {
                "value": supplier_ef,
                "unit": supplier_ef_unit
            }
        
        elif method == CalculationMethod.ACTIVITY_BASIS:
            # Activity basis - check what variables the formula expects
            
            # C8-C14 Fugitive emissions - uses 'qty' variable
            if "qty" in expected_variables:
                quantity = float(row_data.get("quantity_used") or 0)
                unit = row_data.get("unit_quantity") or ef_data.get("default_unit") or ""
                calc_inputs["qty"] = {"value": quantity, "unit": unit}
            
            # C4/C9 Transport with km and qty goods
            elif "qty_travelled" in expected_variables and "km_travelled" in expected_variables:
                # Template columns: quantity_goods, unit_goods, distance_travelled
                qty_goods = float(row_data.get("quantity_goods") or 0)
                qty_goods_unit = row_data.get("unit_goods") or "t"
                km_travelled = float(row_data.get("distance_travelled") or 0)
                km_unit = row_data.get("distance_unit") or "km"
                
                calc_inputs["qty_travelled"] = {"value": qty_goods, "unit": qty_goods_unit}
                calc_inputs["km_travelled"] = {"value": km_travelled, "unit": km_unit}
            
            # C6/C7 Passengers and distance (air, water, taxi, bus, rail travel)
            elif "qty_passenger" in expected_variables and "km_travelled" in expected_variables:
                # Template columns: passengers, distance_travelled
                passengers = float(row_data.get("passengers") or row_data.get("qty_passenger") or 1)
                km_travelled = float(row_data.get("distance_travelled") or 0)
                km_unit = row_data.get("distance_unit") or "km"
                
                calc_inputs["qty_passenger"] = {"value": passengers, "unit": ""}
                calc_inputs["km_travelled"] = {"value": km_travelled, "unit": km_unit}
            
            # C6/C7 Car/Bike travel - km only
            elif "km_travelled" in expected_variables and "qty_passenger" not in expected_variables and "qty_travelled" not in expected_variables:
                # Template column: distance_travelled
                km_travelled = float(row_data.get("distance_travelled") or 0)
                km_unit = row_data.get("distance_unit") or "km"
                
                calc_inputs["km_travelled"] = {"value": km_travelled, "unit": km_unit}
            
            # C6/C7 Hotel stays
            elif "qty_room" in expected_variables and "qty_nights" in expected_variables:
                # Template columns: rooms, nights
                rooms = float(row_data.get("rooms") or row_data.get("qty_room") or 1)
                nights = float(row_data.get("nights") or row_data.get("qty_nights") or 0)
                
                calc_inputs["qty_room"] = {"value": rooms, "unit": ""}
                calc_inputs["qty_nights"] = {"value": nights, "unit": ""}
            
            # C6/C7 WFH (work from home)
            elif "working_days" in expected_variables and "working_hour_per_day" in expected_variables:
                # Template columns: working_days, working_hours
                working_days = float(row_data.get("working_days") or 0)
                hours_per_day = float(row_data.get("working_hours") or row_data.get("working_hour_per_day") or 8)
                
                calc_inputs["working_days"] = {"value": working_days, "unit": ""}
                calc_inputs["working_hour_per_day"] = {"value": hours_per_day, "unit": ""}
            
            # Default activity basis (C1/C2/C3/C5/C12) - uses 'activity_value'
            else:
                # Template column: quantity_used → Formula variable: activity_value
                calc_inputs["activity_value"] = {
                    "value": converted_quantity,
                    "unit": input_unit
                }
        
        else:
            # Fallback - use activity_value
            calc_inputs["activity_value"] = {
                "value": converted_quantity,
                "unit": input_unit
            }
        
        return calc_inputs
    
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
        
        # Build dynamic field values using FORMULA VARIABLE NAMES (not template column names)
        # This ensures consistency with manual entry records
        dynamic_field_values = {}
        
        if method == CalculationMethod.ACTIVITY_BASIS:
            # Check for different activity_basis input patterns
            
            # C4/C9 Transport: qty_travelled + km_travelled
            if row_data.get("quantity_goods") and row_data.get("distance_travelled"):
                dynamic_field_values["qty_travelled"] = {
                    "value": float(row_data.get("quantity_goods")),
                    "unit": row_data.get("unit_goods", "t")
                }
                dynamic_field_values["km_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": row_data.get("distance_unit", "km")
                }
            
            # C6/C7 with passengers: qty_passenger + km_travelled
            elif row_data.get("passengers") and row_data.get("distance_travelled"):
                dynamic_field_values["qty_passenger"] = {
                    "value": float(row_data.get("passengers")),
                    "unit": ""
                }
                dynamic_field_values["km_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": row_data.get("distance_unit", "km")
                }
            
            # C6/C7 Car/Bike: km_travelled only
            elif row_data.get("distance_travelled") and not row_data.get("passengers") and not row_data.get("quantity_goods"):
                dynamic_field_values["km_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": row_data.get("distance_unit", "km")
                }
            
            # C6/C7 Hotel: qty_room + qty_nights
            elif row_data.get("rooms") or row_data.get("nights"):
                dynamic_field_values["qty_room"] = {
                    "value": float(row_data.get("rooms") or 1),
                    "unit": ""
                }
                dynamic_field_values["qty_nights"] = {
                    "value": float(row_data.get("nights") or 0),
                    "unit": ""
                }
            
            # C6/C7 WFH: working_days + working_hour_per_day
            elif row_data.get("working_days") or row_data.get("working_hours"):
                dynamic_field_values["working_days"] = {
                    "value": float(row_data.get("working_days") or 0),
                    "unit": ""
                }
                dynamic_field_values["working_hour_per_day"] = {
                    "value": float(row_data.get("working_hours") or 8),
                    "unit": ""
                }
            
            # Default: activity_value (C1/C2/C3/C5/C12 etc.)
            elif row_data.get("quantity_used"):
                dynamic_field_values["activity_value"] = {
                    "value": float(row_data.get("quantity_used")),
                    "unit": row_data.get("unit_quantity", "")
                }
        
        elif method == CalculationMethod.SPEND_BASIS:
            # Formula variable: spent_value (NOT spend_amount)
            if row_data.get("spent_amount"):
                dynamic_field_values["spent_value"] = {
                    "value": float(row_data.get("spent_amount")),
                    "unit": row_data.get("spent_currency") or row_data.get("currency") or "INR"
                }
            # Include override properties if available
            if row_data.get("inflation_rate"):
                dynamic_field_values["inflation_rate"] = {
                    "value": float(row_data.get("inflation_rate")),
                    "unit": "",
                    "is_override": True
                }
            if row_data.get("ppp"):
                dynamic_field_values["ppp"] = {
                    "value": float(row_data.get("ppp")),
                    "unit": "",
                    "is_override": True
                }
        
        elif method == CalculationMethod.SUPPLIER_BASIS:
            dynamic_field_values["activity_value_supplier_based"] = {
                "value": float(row_data.get("supplier_quantity") or row_data.get("quantity_used") or 0),
                "unit": row_data.get("supplier_unit") or row_data.get("unit_quantity") or ""
            }
            dynamic_field_values["emission_factor_supplier_based"] = {
                "value": float(row_data.get("supplier_ef") or row_data.get("supplier_emission_factor") or 0),
                "unit": row_data.get("supplier_ef_unit") or row_data.get("supplier_emission_factor_unit") or "kgCO2e"
            }
        
        # Add scope3 metadata fields to dynamic_field_values for edit dialog restoration
        # This ensures consistency with manual entry records (especially for C8, C10, C11, C13, C14)
        activity_type_normalized = row_data.get("activity_type", "")
        if activity_type_normalized:
            activity_type_normalized = activity_type_normalized.lower().replace(" ", "_")
            # Map display names to internal values
            activity_type_map = {"work_from_home": "wfh"}
            activity_type_normalized = activity_type_map.get(activity_type_normalized, activity_type_normalized)
        
        # Normalize subcategory to match frontend expected values
        subcategory_raw = row_data.get("sub_category") or ""
        subcategory_normalized = subcategory_raw.lower().replace(" ", "_") if subcategory_raw else ""
        # Map display names to internal values
        subcategory_map = {
            "stationary_combustion": "stationary_combustion",
            "mobile_combustion": "mobile_combustion",
            "fugitive_emission": "fugitive_emissions",  # singular to plural
            "fugitive_emissions": "fugitive_emissions",
            "electricity": "electricity",
            "process_emissions": "process_emissions",
        }
        subcategory_normalized = subcategory_map.get(subcategory_normalized, subcategory_normalized)
        
        dynamic_field_values["calculation_method_scope3"] = {"value": method.value, "unit": ""}
        dynamic_field_values["scope3_ef_id"] = {"value": activity_match.get("activity_id") or "", "unit": ""}
        dynamic_field_values["scope3_activity"] = {"value": activity_match.get("activity_name") or row_data.get("activity") or "", "unit": ""}
        dynamic_field_values["scope3_activity_type"] = {"value": activity_type_normalized, "unit": ""}
        dynamic_field_values["scope3_subcategory"] = {"value": subcategory_normalized, "unit": ""}
        
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
            "scope3_activity_type": activity_type_normalized,  # Use normalized value
            "scope3_subcategory": subcategory_normalized,  # Use normalized value
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
        
        # Get frequency type from first row
        first_row_data = first_row.get("row_data", {})
        frequency_type = first_row_data.get("frequency_type", "monthly")
        is_yearly = frequency_type == "yearly"
        
        # Build employees array
        employees = []
        monthly_totals = {}
        total_co2e = 0.0
        
        for emp_data in employee_rows:
            row_data = emp_data.get("row_data", {})
            emissions = emp_data.get("emissions", {})
            reporting_month = row_data.get("reporting_period") or row_data.get("reporting_month", "")
            
            # Get activity type from row_data and NORMALIZE to lowercase
            activity_type = row_data.get("activity_type", "")
            if activity_type:
                # Normalize: "Wfh" -> "wfh", "Work From Home" -> "work_from_home"
                activity_type = activity_type.lower().replace(" ", "_")
                # Map display names to internal values
                activity_type_map = {
                    "work_from_home": "wfh",
                    "car_travel": "car_travel",
                    "bus_travel": "bus_travel",
                    "rail_travel": "rail_travel",
                    "air_travel": "air_travel",
                    "taxi_travel": "taxi_travel",
                    "bike_travel": "bike_travel",
                    "water_travel": "water_travel",
                    "hotel_stay": "hotel_stay",
                }
                activity_type = activity_type_map.get(activity_type, activity_type)
            
            # Build inputs with correct variable names matching manual entry
            # Map template columns to formula variables
            inputs = {}
            
            # km_travelled (from distance_travelled)
            if row_data.get("distance_travelled"):
                inputs["km_travelled"] = float(row_data.get("distance_travelled"))
            
            # qty_passenger (from passengers)
            if row_data.get("passengers"):
                inputs["qty_passenger"] = float(row_data.get("passengers"))
            
            # qty_room (from rooms)
            if row_data.get("rooms"):
                inputs["qty_room"] = float(row_data.get("rooms"))
            
            # qty_nights (from nights)
            if row_data.get("nights"):
                inputs["qty_nights"] = float(row_data.get("nights"))
            
            # working_days
            if row_data.get("working_days"):
                inputs["working_days"] = float(row_data.get("working_days"))
            
            # working_hour_per_day (from working_hours)
            if row_data.get("working_hours"):
                inputs["working_hour_per_day"] = float(row_data.get("working_hours"))
            
            # Build calculation_details if available from emissions
            calculation_details = None
            if emissions.get("audit_trail") or emissions.get("formula_id"):
                calculation_details = {
                    "formula_id": emissions.get("formula_id"),
                    "outputs": {
                        "co2e": {
                            "value": self._extract_co2e(emissions),
                            "unit": emissions.get("unit", "tCO2e")
                        }
                    },
                    "audit_log": emissions.get("audit_trail", []),
                    "applied_factors": emissions.get("inputs", {})
                }
            
            # Build emissions data
            emissions_data = {
                "co2": emissions.get("co2", 0),
                "ch4": emissions.get("ch4", 0),
                "n2o": emissions.get("n2o", 0),
                "co2e": self._extract_co2e(emissions)
            }
            
            # Build employee entry - structure differs for yearly vs monthly
            if is_yearly:
                # YEARLY MODE: Store inputs/emissions flat at employee level (matching manual entry)
                employee_entry = {
                    "id": str(uuid.uuid4()),
                    "name": row_data.get("employee_name"),
                    "employee_id": row_data.get("employee_id"),
                    "department": row_data.get("department"),
                    "activity_type": activity_type,
                    "inputs": inputs,
                    "emissions": emissions_data,
                }
                if calculation_details:
                    employee_entry["calculation_details"] = calculation_details
            else:
                # MONTHLY MODE: Store in monthly_data structure
                month_key = self._month_to_key(reporting_month)
                employee_entry = {
                    "id": str(uuid.uuid4()),
                    "name": row_data.get("employee_name"),
                    "employee_id": row_data.get("employee_id"),
                    "department": row_data.get("department"),
                    "activity_type": activity_type,
                    "monthly_data": {
                        month_key: {
                            "inputs": inputs,
                            "emissions": emissions_data
                        }
                    }
                }
                if calculation_details:
                    employee_entry["monthly_data"][month_key]["calculation_details"] = calculation_details
                
                # Aggregate monthly totals (only for monthly mode)
                co2e = self._extract_co2e(emissions)
                if month_key not in monthly_totals:
                    monthly_totals[month_key] = {"co2e": 0}
                monthly_totals[month_key]["co2e"] += co2e
            
            employees.append(employee_entry)
            total_co2e += self._extract_co2e(emissions)
        
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
        
        # Get formula_id from first employee's emissions data
        first_employee_emissions = first_row.get("emissions", {})
        formula_id = first_employee_emissions.get("formula_id")
        
        # Normalize activity type for record level too
        record_activity_type = first_row_data.get("activity_type", "")
        if record_activity_type:
            record_activity_type = record_activity_type.lower().replace(" ", "_")
            activity_type_map = {
                "work_from_home": "wfh",
                "car_travel": "car_travel",
                "bus_travel": "bus_travel",
                "rail_travel": "rail_travel",
                "air_travel": "air_travel",
                "taxi_travel": "taxi_travel",
                "bike_travel": "bike_travel",
                "water_travel": "water_travel",
                "hotel_stay": "hotel_stay",
            }
            record_activity_type = activity_type_map.get(record_activity_type, record_activity_type)
        
        record = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "facility_id": facility.get("id"),
            "facility_name": facility.get("name"),
            "scope": "scope3",
            "sub_scope": None,
            "category": category_name,
            "sub_category": first_row.get("activity_match", {}).get("activity_name"),  # Use activity name as sub_category
            "calculation_method_scope3": method.value if isinstance(method, CalculationMethod) else method,
            "scope3_ef_id": first_row.get("activity_match", {}).get("activity_id"),
            "scope3_activity": first_row.get("activity_match", {}).get("activity_name"),
            "scope3_activity_type": record_activity_type,
            "formula_id": formula_id,
            "reporting_period": reporting_period,
            "frequency_type": frequency_type,
            "employees": employees,
            "monthly_totals": monthly_totals if not is_yearly else None,  # Only for monthly mode
            "yearly_total": {"co2e": total_co2e},
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
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
        """Convert reporting period to month key.
        
        Handles both formats:
        - 'YYYY-MM' (e.g., '2026-03') → 'mar'
        - 'Mon-YYYY' (e.g., 'Jan-2025') → 'jan' (legacy)
        """
        if not reporting_month:
            return "jan"
        
        month_num_to_abbr = {
            '01': 'jan', '02': 'feb', '03': 'mar', '04': 'apr',
            '05': 'may', '06': 'jun', '07': 'jul', '08': 'aug',
            '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dec'
        }
        
        try:
            parts = reporting_month.split("-")
            if len(parts) == 2:
                # Check if first part is year (YYYY-MM format) or month (Mon-YYYY format)
                if len(parts[0]) == 4 and parts[0].isdigit():
                    # YYYY-MM format: '2026-03' → 'mar'
                    month_num = parts[1]
                    return month_num_to_abbr.get(month_num, "jan")
                else:
                    # Mon-YYYY format: 'Jan-2025' → 'jan'
                    return parts[0].lower()[:3]
            return "jan"
        except (ValueError, AttributeError, IndexError):
            return "jan"
