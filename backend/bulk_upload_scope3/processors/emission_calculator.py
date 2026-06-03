"""
Emission Calculator for Scope 3 Bulk Upload
Handles emission calculations using the calc-engine
"""
from typing import Dict, List, Optional, Any, Tuple
import uuid
import logging
import re
from datetime import datetime, timezone

from ..models import CalculationMethod

# Import calc_engine components
from calc_engine.execution import CalcEngine, CalculationError
from calc_engine.formulas import get_decision_tree_for_category, resolve_formula_id, DecisionTreeError
from calc_engine.units import convert

# Set up logging
logger = logging.getLogger(__name__)


def extract_year_from_reporting_period(reporting_period: str) -> Optional[int]:
    """
    Extract the applicable year from a reporting period string.
    
    Formats supported:
    - "FY 2025-2026" or "FY 2025-26" → 2026 (END year of financial year)
    - "CY 2025" → 2025
    - "2025-04" (monthly) → 2025
    - "2025" → 2025
    
    Returns None if unable to parse.
    """
    if not reporting_period:
        return None
    
    reporting_period = str(reporting_period).strip()
    
    # FY format: "FY 2025-2026" or "FY 2025-26" → use END year
    fy_match = re.match(r'FY\s*(\d{4})\s*-\s*(\d{2,4})', reporting_period, re.IGNORECASE)
    if fy_match:
        start_year = int(fy_match.group(1))
        end_part = fy_match.group(2)
        if len(end_part) == 2:
            # Convert "26" to "2026" based on start year
            end_year = int(str(start_year)[:2] + end_part)
        else:
            end_year = int(end_part)
        return end_year  # Use END year for FY
    
    # CY format: "CY 2025"
    cy_match = re.match(r'CY\s*(\d{4})', reporting_period, re.IGNORECASE)
    if cy_match:
        return int(cy_match.group(1))
    
    # Monthly format: "2025-04" or "2025-4"
    monthly_match = re.match(r'(\d{4})-\d{1,2}', reporting_period)
    if monthly_match:
        return int(monthly_match.group(1))
    
    # Just a year: "2025"
    year_match = re.match(r'^(\d{4})$', reporting_period)
    if year_match:
        return int(year_match.group(1))
    
    return None


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
        # First check outputs.co2e (full emission record structure)
        outputs = emissions.get("outputs", {})
        if outputs:
            co2e = outputs.get("co2e", 0)
            if isinstance(co2e, dict):
                return float(co2e.get("value", 0))
            if co2e:
                return float(co2e)
        
        # Fallback to direct co2e (older structure)
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
                                   formula_id: Optional[str] = None,
                                   activity_source: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculate emissions for a row using calc_engine
        
        Args:
            row_data: Row data from upload
            category_code: Category code (C1-C15)
            method: Calculation method
            activity_id: Matched activity ID (optional)
            formula_id: Matched formula ID (optional)
            activity_source: Source of activity data ('scope3_ef' or 'fuel_database')
            
        Returns:
            Dict with calculated emissions or error info
        """
        # For supplier_basis, use direct calculation but resolve formula from decision tree
        if method == CalculationMethod.SUPPLIER_BASIS:
            result = await self._calculate_supplier_basis_with_conversion(row_data)
            # Resolve formula_id from decision tree
            if category_code:
                cat_id = await self._get_category_id(category_code)
                if cat_id:
                    decision_inputs = {"calculation_method_scope3": "supplier_basis"}
                    resolved_formula_id, tree_path = await self._resolve_formula(cat_id, decision_inputs)
                    if resolved_formula_id:
                        result["formula_id"] = resolved_formula_id
                        result["decision_path"] = tree_path
                        # Get formula name
                        formula_doc = await self.db.ce_formulas.find_one(
                            {"id": resolved_formula_id}, {"_id": 0, "name": 1}
                        )
                        if formula_doc:
                            result["formula_name"] = formula_doc.get("name")
            return result
        
        # For activity_basis and spend_basis, use calc_engine
        if activity_id:
            return await self._calculate_with_calc_engine(
                row_data, category_code, method, activity_id, activity_source
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
        
        # Build outputs in the same format as calc engine
        outputs = {
            "co2e": {
                "value": co2e,
                "unit": "kgCO2e"  # Supplier basis typically produces kgCO2e
            }
        }
        
        # Build audit log for supplier basis calculation
        audit_log = [
            {
                "step": "input",
                "variable": "supplier_quantity",
                "variable_label": "Supplier Quantity",
                "value": quantity,
                "unit": input_unit or "",
            },
            {
                "step": "input",
                "variable": "supplier_ef",
                "variable_label": "Supplier Emission Factor",
                "value": ef,
                "unit": ef_unit or "",
            },
        ]
        
        # Add conversion step if unit conversion happened
        if input_unit and expected_unit and input_unit.lower() != expected_unit.lower():
            audit_log.append({
                "step": "convert",
                "input": {"value": quantity, "unit": input_unit},
                "output": {"value": converted_quantity, "unit": expected_unit},
                "note": f"Converted {input_unit} to {expected_unit}"
            })
        
        audit_log.append({
            "step": "formula_step",
            "name": "co2e",
            "expression": "supplier_quantity * supplier_ef",
            "expression_readable": "Supplier Quantity × Supplier Emission Factor",
            "output": co2e
        })
        
        audit_log.append({
            "step": "outputs",
            "outputs": outputs
        })
        
        return {
            "co2": 0.0,
            "ch4": 0.0,
            "n2o": 0.0,
            "co2e": co2e,
            "calculation_method": "supplier_basis",
            "unit": "kgCO2e",  # Assuming supplier EF produces kgCO2e
            "outputs": outputs,
            "audit_log": audit_log,
            "applied_factors": {
                "supplier_ef": {
                    "value": ef,
                    "unit": ef_unit or "",
                    "label": "Supplier Emission Factor",
                    "source": "user_provided"
                }
            },
            "formula_name": "Supplier Method",
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
                                           activity_id: str,
                                           activity_source: Optional[str] = None) -> Dict[str, Any]:
        """Calculate emissions using calc_engine with proper unit conversion"""
        
        # 1. Fetch emission factor data based on source
        # For fugitive_emissions, data comes from fuel_database; otherwise from scope3_ef
        ef_data = None
        is_fugitive = activity_source == "fuel_database"
        
        if is_fugitive:
            # Fetch from fuel_database for fugitive emissions
            fuel_data = await self.db.fuel_database.find_one(
                {"id": activity_id},
                {"_id": 0}
            )
            if fuel_data:
                # Transform fuel_database structure to match scope3_ef format
                # Get the actual source name (e.g., "IPCC", "DEFRA") from the record
                source_name = fuel_data.get("source") or fuel_data.get("source_of_information") or "Fuel Database"
                ef_data = {
                    "id": fuel_data.get("id"),
                    "activity": fuel_data.get("fuel_name"),
                    "emission_factor": fuel_data.get("gwp_fugitives"),
                    "ef_unit": "kgCO2e/kg",  # GWP is typically kgCO2e per kg of gas
                    "default_unit": "kg",
                    "allowed_units": ["kg", "g", "t"],
                    "subcategory": "fugitive_emissions",
                    "source": "fuel_database",
                    "source_name": source_name  # Actual source (e.g., "IPCC") for display
                }
                logger.info(f"[BULK_CALC] Fetched fugitive emission data from fuel_database: activity={ef_data.get('activity')}, ef={ef_data.get('emission_factor')}, source_name={source_name}")
        else:
            # Fetch from scope3_ef (default)
            ef_data = await self.db.scope3_ef.find_one(
                {"id": activity_id},
                {"_id": 0}
            )
            # Add source_name for non-fugitive emissions (from scope3_ef.source field)
            if ef_data:
                source_name = ef_data.get("source") or "Scope3 EF Database"
                ef_data["source_name"] = source_name
                logger.info(f"[BULK_CALC] Fetched scope3_ef data: activity={ef_data.get('activity')}, ef={ef_data.get('emission_factor')}, source_name={source_name}")
        
        if not ef_data:
            return {
                "co2": 0.0, "ch4": 0.0, "n2o": 0.0, "co2e": 0.0,
                "calculation_method": "error",
                "error": f"Emission factor not found for activity_id: {activity_id} (source: {activity_source or 'scope3_ef'})"
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
        # Decision trees for C8/C10/C11/C13/C14 use 'subcategory_selection' as the field name
        if row_data.get("sub_category"):
            subcat = row_data.get("sub_category")
            subcat_normalized = subcat.lower().replace(" ", "_") if subcat else None
            # Map display names to internal values
            subcat_map = {
                "fugitive_emission": "fugitive_emissions",
            }
            subcat_normalized = subcat_map.get(subcat_normalized, subcat_normalized)
            # Use 'subcategory_selection' to match the decision tree field name for C8/C10/C11/C13/C14
            decision_inputs["subcategory_selection"] = subcat_normalized

        # C11 decision tree forks on `type_of_product` (continuous_usage /
        # one_time_use) after subcategory_selection on activity_basis. The
        # value is already normalized to the internal code by
        # FieldValidator.validate_type_of_product before reaching here.
        if row_data.get("type_of_product"):
            decision_inputs["type_of_product"] = row_data.get("type_of_product")
        
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
            
            # Extract year from reporting period for year-specific currency conversion
            reporting_period = row_data.get("reporting_period") or row_data.get("reporting_year") or row_data.get("reporting_month")
            target_year = extract_year_from_reporting_period(reporting_period)
            
            # First try to find exact year match
            if target_year:
                currency_conversion = await self.db.currency_conversion.find_one(
                    {"source_currency": spent_currency, "year_applicable": target_year, "is_active": True},
                    {"_id": 0, "purchase_parity": 1, "inflation_factor": 1, "year_applicable": 1, "source": 1}
                )
                logger.info(f"[BULK_CALC] Currency lookup for {spent_currency}, year={target_year}: {currency_conversion is not None}")
            
            # Fallback: find latest available year if no exact match
            if not currency_conversion:
                fallback_cursor = self.db.currency_conversion.find(
                    {"source_currency": spent_currency, "is_active": True},
                    {"_id": 0, "purchase_parity": 1, "inflation_factor": 1, "year_applicable": 1, "source": 1}
                ).sort("year_applicable", -1).limit(1)
                fallback_list = await fallback_cursor.to_list(length=1)
                if fallback_list:
                    currency_conversion = fallback_list[0]
                    logger.info(f"[BULK_CALC] Fallback to year {currency_conversion.get('year_applicable')} for {spent_currency}")
            
            if currency_conversion:
                logger.info(f"[BULK_CALC] Currency conversion: ppp={currency_conversion.get('purchase_parity')}, inflation={currency_conversion.get('inflation_factor')}, year={currency_conversion.get('year_applicable')}")
        
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
        # Include reporting_period for currency conversion year lookup in calc_engine
        reporting_period = row_data.get("reporting_period") or row_data.get("reporting_year") or row_data.get("reporting_month")
        context = {
            "fuel_name": ef_data.get("activity"),
            "activity": ef_data.get("activity"),
            "activity_type": ef_data.get("activity_type"),
            "scope3_ef_id": activity_id,
            "scope3_ef_default_unit": default_unit,
            "category": ef_data.get("category"),
            "method": method.value,
            "reporting_period": reporting_period,  # For currency conversion year lookup
        }
        
        # Build user_overrides for property values (inflation_rate, ppp)
        # These are properties in the formula, not inputs, so they go in user_overrides
        user_overrides = {}
        if "inflation_rate" in calc_inputs:
            user_overrides["inflation_rate"] = calc_inputs.pop("inflation_rate")
        if "ppp" in calc_inputs:
            user_overrides["ppp"] = calc_inputs.pop("ppp")
        
        # For fugitive emissions, add co2_gwp_fugitives to user_overrides
        # The formula expects 'co2_gwp_fugitives' property which comes from fuel_database.gwp_fugitives
        if is_fugitive and ef_data.get("emission_factor"):
            gwp_value = ef_data.get("emission_factor")
            source_name = ef_data.get("source_name") or "Fuel Database"
            user_overrides["co2_gwp_fugitives"] = {
                "value": float(gwp_value),
                "unit": "kgCO2e/kg",
                "source_name": source_name
            }
            logger.info(f"[BULK_CALC] Added co2_gwp_fugitives override: {gwp_value} (source: {source_name})")
        
        # For non-fugitive Scope 3 emissions, add scope3_ef (emission factor) to user_overrides
        # This ensures the source_name (e.g., "DEFRA", "IPCC") is propagated in calculation details
        if not is_fugitive and ef_data.get("emission_factor"):
            ef_value = ef_data.get("emission_factor")
            ef_unit = ef_data.get("unit") or "kgCO2e"
            source_name = ef_data.get("source_name") or "Scope3 EF Database"
            user_overrides["scope3_ef"] = {
                "value": float(ef_value),
                "unit": ef_unit,
                "source_name": source_name
            }
            logger.info(f"[BULK_CALC] Added scope3_ef override: {ef_value} {ef_unit} (source: {source_name})")
        
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
                "formula_name": formula_doc.get("name"),
                "decision_path": tree_path,
                "inputs": {
                    "original_quantity": input_quantity,
                    "original_unit": input_unit,
                    "converted_quantity": converted_quantity,
                    "converted_unit": default_unit,
                    "activity_id": activity_id,
                    "emission_factor": ef_data.get("emission_factor")
                },
                "audit_log": result.get("audit_log", []),
                "applied_factors": result.get("applied_factors", {}),
                "outputs": result.get("outputs", {})
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
            # Don't use default values - let calc-engine fail if required inputs are missing
            supplier_qty_raw = row_data.get("supplier_quantity") or row_data.get("quantity_used")
            supplier_ef_raw = row_data.get("supplier_ef") or row_data.get("supplier_emission_factor")
            
            if supplier_qty_raw is not None and supplier_qty_raw != "":
                supplier_qty_unit = (row_data.get("supplier_unit") or 
                                     row_data.get("unit_quantity") or "")
                calc_inputs["activity_value_supplier_based"] = {
                    "value": float(supplier_qty_raw),
                    "unit": supplier_qty_unit
                }
            
            if supplier_ef_raw is not None and supplier_ef_raw != "":
                supplier_ef_unit = (row_data.get("supplier_ef_unit") or 
                                   row_data.get("supplier_emission_factor_unit") or "kgCO2e")
                calc_inputs["emission_factor_supplier_based"] = {
                    "value": float(supplier_ef_raw),
                    "unit": supplier_ef_unit
                }
        
        elif method == CalculationMethod.ACTIVITY_BASIS:
            # Activity basis - check what variables the formula expects
            # Don't use default values - let calc-engine fail if required inputs are missing
            
            # C11 continuous_usage - formulas expect `units_produced`,
            # `products_expected_usage`, and `fuel_consumed_per_usage` (normal
            # subcategories) OR `gas_consumed_per_usage` (fugitive_emissions).
            # The per-usage variable carries a compound unit
            # `<unit_quantity>/<products_expected_usage_unit>` (e.g. "kl/year")
            # that mirrors the manual entry shape exactly. Compound-unit
            # normalization against the EF default unit is handled inside the
            # calc engine, identical to the manual path.
            if "units_produced" in expected_variables and "products_expected_usage" in expected_variables:
                units_produced_raw = row_data.get("units_produced")
                pe_usage_raw = row_data.get("products_expected_usage")
                pe_usage_unit = row_data.get("products_expected_usage_unit") or ""

                if units_produced_raw is not None and units_produced_raw != "":
                    calc_inputs["units_produced"] = {
                        "value": float(units_produced_raw),
                        "unit": ""
                    }

                if pe_usage_raw is not None and pe_usage_raw != "":
                    calc_inputs["products_expected_usage"] = {
                        "value": float(pe_usage_raw),
                        "unit": pe_usage_unit
                    }

                # `quantity_used` is reinterpreted as the per-usage fuel/gas
                # consumption when continuous_usage is selected. The variable
                # name is decided by the formula (`fuel_consumed_per_usage` vs
                # `gas_consumed_per_usage`).
                per_usage_variable = None
                if "fuel_consumed_per_usage" in expected_variables:
                    per_usage_variable = "fuel_consumed_per_usage"
                elif "gas_consumed_per_usage" in expected_variables:
                    per_usage_variable = "gas_consumed_per_usage"

                if per_usage_variable:
                    quantity_raw = row_data.get("quantity_used")
                    if quantity_raw is not None and quantity_raw != "":
                        base_unit = row_data.get("unit_quantity") or ""
                        # Compose compound unit `<base>/<lifetime>` to match
                        # manual entry (e.g. "L/year", "kl/years", "kg/hour").
                        compound_unit = (
                            f"{base_unit}/{pe_usage_unit}".strip("/")
                            if (base_unit or pe_usage_unit)
                            else ""
                        )
                        calc_inputs[per_usage_variable] = {
                            "value": float(quantity_raw),
                            "unit": compound_unit
                        }

            # C8-C14 Fugitive emissions - uses 'qty' variable
            elif "qty" in expected_variables:
                quantity_raw = row_data.get("quantity_used")
                if quantity_raw is not None and quantity_raw != "":
                    quantity = float(quantity_raw)
                    unit = row_data.get("unit_quantity") or ef_data.get("default_unit") or ""
                    calc_inputs["qty"] = {"value": quantity, "unit": unit}
                # If quantity_used is missing, don't add to calc_inputs - calc-engine will fail
            
            # C4/C9 Transport with km and qty goods
            elif "qty_travelled" in expected_variables and "km_travelled" in expected_variables:
                # Template columns: quantity_goods, unit_goods, distance_travelled
                qty_goods_raw = row_data.get("quantity_goods")
                distance_raw = row_data.get("distance_travelled")
                
                if qty_goods_raw is not None and qty_goods_raw != "":
                    qty_goods_unit = row_data.get("unit_goods") or "t"
                    calc_inputs["qty_travelled"] = {"value": float(qty_goods_raw), "unit": qty_goods_unit}
                
                if distance_raw is not None and distance_raw != "":
                    km_unit = row_data.get("distance_unit") or "km"
                    calc_inputs["km_travelled"] = {"value": float(distance_raw), "unit": km_unit}
            
            # C6/C7 Passengers and distance (air, water, taxi, bus, rail travel)
            elif "qty_passenger" in expected_variables and "km_travelled" in expected_variables:
                # Template columns: passengers, distance_travelled, days_travelled
                passengers_raw = row_data.get("passengers") or row_data.get("qty_passenger")
                distance_raw = row_data.get("distance_travelled")
                days_raw = row_data.get("days_travelled") or row_data.get("qty_days_travelled")
                
                if passengers_raw is not None and passengers_raw != "":
                    calc_inputs["qty_passenger"] = {"value": float(passengers_raw), "unit": ""}
                
                if distance_raw is not None and distance_raw != "":
                    km_unit = row_data.get("distance_unit") or "km"
                    calc_inputs["km_travelled"] = {"value": float(distance_raw), "unit": km_unit}
                
                # C6 Business Travel formulas require qty_days_travelled
                if "qty_days_travelled" in expected_variables:
                    if days_raw is not None and days_raw != "":
                        calc_inputs["qty_days_travelled"] = {"value": float(days_raw), "unit": ""}
            
            # C6/C7 Car/Bike travel - km only (+ days for C6)
            elif "km_travelled" in expected_variables and "qty_passenger" not in expected_variables and "qty_travelled" not in expected_variables:
                # Template columns: distance_travelled, days_travelled
                distance_raw = row_data.get("distance_travelled")
                days_raw = row_data.get("days_travelled") or row_data.get("qty_days_travelled")
                
                if distance_raw is not None and distance_raw != "":
                    km_unit = row_data.get("distance_unit") or "km"
                    calc_inputs["km_travelled"] = {"value": float(distance_raw), "unit": km_unit}
                
                # C6 Business Travel formulas require qty_days_travelled
                if "qty_days_travelled" in expected_variables:
                    if days_raw is not None and days_raw != "":
                        calc_inputs["qty_days_travelled"] = {"value": float(days_raw), "unit": ""}
            
            # C6/C7 Hotel stays
            elif "qty_room" in expected_variables and "qty_nights" in expected_variables:
                # Template columns: rooms, nights
                rooms_raw = row_data.get("rooms") or row_data.get("qty_room")
                nights_raw = row_data.get("nights") or row_data.get("qty_nights")
                
                if rooms_raw is not None and rooms_raw != "":
                    calc_inputs["qty_room"] = {"value": float(rooms_raw), "unit": ""}
                
                if nights_raw is not None and nights_raw != "":
                    calc_inputs["qty_nights"] = {"value": float(nights_raw), "unit": ""}
            
            # C6/C7 WFH (work from home)
            elif "working_days" in expected_variables and "working_hour_per_day" in expected_variables:
                # Template columns: working_days, working_hours
                working_days_raw = row_data.get("working_days")
                hours_raw = row_data.get("working_hours") or row_data.get("working_hour_per_day")
                
                if working_days_raw is not None and working_days_raw != "":
                    calc_inputs["working_days"] = {"value": float(working_days_raw), "unit": ""}
                
                if hours_raw is not None and hours_raw != "":
                    calc_inputs["working_hour_per_day"] = {"value": float(hours_raw), "unit": ""}
            
            # Default activity basis (C1/C2/C3/C5/C12) - uses 'activity_value'
            else:
                # Template column: quantity_used → Formula variable: activity_value
                # Only add if converted_quantity is valid
                if converted_quantity is not None and converted_quantity != 0:
                    calc_inputs["activity_value"] = {
                        "value": converted_quantity,
                        "unit": input_unit
                    }
        
        else:
            # Fallback - use activity_value only if valid
            if converted_quantity is not None and converted_quantity != 0:
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
                               bulk_job_id: Optional[str] = None,
                               user_email: str = "",
                               user_name: str = "") -> Dict:
        """
        Build emission record in the format expected by the database
        
        This matches the format used by UI-created emissions
        """
        now = datetime.now(timezone.utc)
        
        # Get reporting period and frequency from row_data (already parsed)
        reporting_period = row_data.get("reporting_period", "")
        frequency_type = row_data.get("frequency_type", "monthly")
        
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
        
        # Pre-calculate subcategory_normalized for fugitive emissions check
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
        
        if method == CalculationMethod.ACTIVITY_BASIS:
            # Check for different activity_basis input patterns

            # C11 continuous_usage (decision-tree branch `type_of_product = continuous_usage`).
            # Stored in dynamic_field_values exactly like the manual entry path:
            #   - units_produced:           {value, unit: ""}
            #   - products_expected_usage:  {value, unit: <lifetime unit>}
            #   - fuel_consumed_per_usage   OR   gas_consumed_per_usage (for
            #     fugitive_emissions subcategory) — compound unit
            #     "<unit_quantity>/<products_expected_usage_unit>" (e.g. "kl/year").
            if row_data.get("type_of_product") == "continuous_usage":
                pe_usage_unit = row_data.get("products_expected_usage_unit") or ""
                base_unit = row_data.get("unit_quantity") or ""
                compound_unit = (
                    f"{base_unit}/{pe_usage_unit}".strip("/")
                    if (base_unit or pe_usage_unit)
                    else ""
                )

                if row_data.get("units_produced") is not None and row_data.get("units_produced") != "":
                    dynamic_field_values["units_produced"] = {
                        "value": float(row_data.get("units_produced")),
                        "unit": ""
                    }
                if row_data.get("products_expected_usage") is not None and row_data.get("products_expected_usage") != "":
                    dynamic_field_values["products_expected_usage"] = {
                        "value": float(row_data.get("products_expected_usage")),
                        "unit": pe_usage_unit
                    }

                # Per-usage variable name depends on the subcategory — matches
                # the C11 decision tree formulas (fugitive_emissions branch
                # uses `gas_consumed_per_usage`; all others use
                # `fuel_consumed_per_usage`).
                per_usage_key = (
                    "gas_consumed_per_usage"
                    if subcategory_normalized == "fugitive_emissions"
                    else "fuel_consumed_per_usage"
                )
                if row_data.get("quantity_used") is not None and row_data.get("quantity_used") != "":
                    dynamic_field_values[per_usage_key] = {
                        "value": float(row_data.get("quantity_used")),
                        "unit": compound_unit
                    }

            # C4/C9 Transport: qty_travelled + km_travelled
            elif row_data.get("quantity_goods") and row_data.get("distance_travelled"):
                dynamic_field_values["qty_travelled"] = {
                    "value": float(row_data.get("quantity_goods")),
                    "unit": row_data.get("unit_goods", "t")
                }
                dynamic_field_values["km_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": row_data.get("distance_unit", "km")
                }
            
            # C6/C7 with passengers: qty_passenger + km_travelled + qty_days_travelled (C6)
            elif row_data.get("passengers") and row_data.get("distance_travelled"):
                dynamic_field_values["qty_passenger"] = {
                    "value": float(row_data.get("passengers")),
                    "unit": ""
                }
                dynamic_field_values["km_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": row_data.get("distance_unit", "km")
                }
                # C6 Business Travel requires qty_days_travelled
                if row_data.get("days_travelled"):
                    dynamic_field_values["qty_days_travelled"] = {
                        "value": float(row_data.get("days_travelled")),
                        "unit": ""
                    }
            
            # C6/C7 Car/Bike: km_travelled + qty_days_travelled (C6)
            elif row_data.get("distance_travelled") and not row_data.get("passengers") and not row_data.get("quantity_goods"):
                dynamic_field_values["km_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": row_data.get("distance_unit", "km")
                }
                # C6 Business Travel requires qty_days_travelled
                if row_data.get("days_travelled"):
                    dynamic_field_values["qty_days_travelled"] = {
                        "value": float(row_data.get("days_travelled")),
                        "unit": ""
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
            
            # C8/C10/C11/C13/C14 Fugitive emissions: use 'qty' variable
            elif row_data.get("quantity_used") and subcategory_normalized == "fugitive_emissions":
                dynamic_field_values["qty"] = {
                    "value": float(row_data.get("quantity_used")),
                    "unit": row_data.get("unit_quantity", "kg")
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
        
        # subcategory_normalized is already calculated above
        
        dynamic_field_values["calculation_method_scope3"] = {"value": method.value, "unit": ""}
        dynamic_field_values["scope3_ef_id"] = {"value": activity_match.get("activity_id") or "", "unit": ""}
        dynamic_field_values["scope3_activity"] = {"value": activity_match.get("activity_name") or row_data.get("activity") or "", "unit": ""}
        dynamic_field_values["scope3_activity_type"] = {"value": activity_type_normalized, "unit": ""}

        # C11 only — record the decision-tree fork so the edit dialog can
        # restore it. Mirrors manual entry which writes both
        # `dynamic_field_values.type_of_product` and the top-level field.
        if row_data.get("type_of_product"):
            dynamic_field_values["type_of_product"] = {
                "value": row_data.get("type_of_product"),
                "unit": ""
            }

        # Mirror manual entry: `use_custom_activity` is True for supplier_basis
        # rows where the user typed a free-text activity (no matched EF id).
        # Manual entry writes this key into `dynamic_field_values` regardless
        # of the method, so bulk does the same for shape parity.
        is_custom = (
            method == CalculationMethod.SUPPLIER_BASIS
            and not activity_match.get("activity_id")
        )
        dynamic_field_values["use_custom_activity"] = {
            "value": bool(is_custom),
            "unit": ""
        }
        
        # For C8, C10, C11, C13, C14: store original sub_category in dynamic_field_values.scope3_subcategory
        # and use activity_name as sub_category for fuel type analysis
        categories_with_activity_as_subcategory = ["C8", "C10", "C11", "C13", "C14"]
        category_prefix = category_name.split(" ")[0] if category_name else ""
        
        if category_prefix in categories_with_activity_as_subcategory:
            # Store normalized sub_category (e.g., "stationary_combustion") in dynamic_field_values
            dynamic_field_values["scope3_subcategory"] = {"value": subcategory_normalized, "unit": ""}
            # Use activity_name (e.g., "LNG") as sub_category for display/analysis
            sub_category = activity_match.get("activity_name") or row_data.get("activity") or subcategory_normalized
        else:
            dynamic_field_values["scope3_subcategory"] = {"value": subcategory_normalized, "unit": ""}
            # Default behavior for other categories
            sub_category = row_data.get("sub_category") or activity_match.get("activity_name") or row_data.get("activity")
        
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
        
        # sub_category is already set above based on category type
        
        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "organization_id": organization_id,
            "facility_id": facility.get("id"),
            "scope": "scope3",
            "category": category_name,
            "sub_category": sub_category,
            # `fuel_type` matches manual entry (Scope3FlatCreate sets it to the
            # activity name for scope3 records).
            "fuel_type": activity_match.get("activity_name") or row_data.get("activity"),
            # Scope 3 records have no fuel_database row; manual sends None.
            "fuel_database_id": None,
            "calculation_method_scope3": method.value,
            "scope3_ef_id": activity_match.get("activity_id"),
            "scope3_activity": activity_match.get("activity_name") or row_data.get("activity"),
            "scope3_activity_type": activity_type_normalized,
            "scope3_subcategory": dynamic_field_values["scope3_subcategory"]["value"],
            # C11 only — picks the decision-tree branch (continuous_usage / one_time_use)
            "type_of_product": row_data.get("type_of_product") or None,
            "reporting_period": reporting_period,
            "frequency_type": frequency_type,
            "dynamic_field_values": dynamic_field_values,
            "outputs": outputs,
            "co2_emissions": co2_val,
            "ch4_emissions": ch4_val,
            "n2o_emissions": n2o_val,
            "co2e_emissions": co2e_val,
            "total_emissions": co2e_val,  # Ensure total_emissions is always set
            "formula_id": formula_id,
            "supplier_name": str(row_data.get("supplier_name") or "") if row_data.get("supplier_name") else None,
            "supplier_code": str(row_data.get("supplier_code") or "") if row_data.get("supplier_code") else None,
            "asset_name": str(row_data.get("asset_name") or "") if row_data.get("asset_name") else None,
            "from_location": str(row_data.get("from_location") or "") if row_data.get("from_location") else None,
            "to_location": str(row_data.get("to_location") or "") if row_data.get("to_location") else None,
            "customer_name": str(row_data.get("customer_name") or "") if row_data.get("customer_name") else None,
            "customer_code": str(row_data.get("customer_code") or "") if row_data.get("customer_code") else None,
            # `source_of_information` is provenance — kept distinct from manual,
            # which sets it from `selectedFuel.source`. Bulk uploads stamp
            # "Bulk Upload" so the origin is always traceable.
            "source_of_information": "Bulk Upload",
            # Free-text Record Source (Step 2 equivalent on manual flow).
            # Mirrors the manual payload exactly — trimmed string or "".
            "record_source": (str(row_data.get("record_source")).strip()
                              if row_data.get("record_source") not in (None, "") else ""),
            # Optional fields from manual schema — populated to None / '' so the
            # document shape matches what `EmissionRecordCreate.model_dump()`
            # produces on the manual path.
            "evidence_url": "",
            "justification": None,
            "notes": str(row_data.get("notes") or "") if row_data.get("notes") else None,
            "responsible_person": str(row_data.get("responsible_person") or "") if row_data.get("responsible_person") else None,
            "responsible_person_designation": str(row_data.get("responsible_designation") or "") if row_data.get("responsible_designation") else None,
            "responsible_person_contact": str(row_data.get("responsible_contact") or "") if row_data.get("responsible_contact") else None,
            # Process Name and Description - stored in same format as manual upload
            "process_names": [str(row_data.get("process_name"))] if row_data.get("process_name") else [],
            "process_descriptions": [{"name": str(row_data.get("process_name") or ""), "description": str(row_data.get("process_description") or "")}] if row_data.get("process_name") else [],
            # User audit fields — match manual entry shape exactly.
            "created_by": user_id,
            "created_by_email": user_email,
            "created_by_name": user_name,
            "created_at": now.isoformat(),
            "updated_at": None,
            "updated_by": None,
            "updated_by_email": None,
            "updated_by_name": None,
            # Provenance — retained per spec so bulk-uploaded records remain
            # traceable to the originating job.
            "upload_source": "bulk_upload",
            "bulk_upload_job_id": bulk_job_id,
            # Calc engine details for edit dialog display
            "audit_log": calculated_emissions.get("audit_log", []),
            "applied_factors": calculated_emissions.get("applied_factors", {}),
            "outputs": calculated_emissions.get("outputs", {}),
            "formula_name": calculated_emissions.get("formula_name"),
            # Version tracking - embedded in record like manual upload
            "version": 1,
            "version_history": [{
                "version": 1,
                "changed_at": now.isoformat(),
                "changed_by": user_id,
                "changed_by_email": user_email,
                "changed_by_name": user_name,
                "action": "created",
                "changes_summary": "Initial creation via bulk upload",
            }],
        }
        
        # Ensure version_history uses the same user info as created_by fields
        if record.get("created_by_name") and not record["version_history"][0]["changed_by_name"]:
            record["version_history"][0]["changed_by_name"] = record["created_by_name"]
        if record.get("created_by_email") and not record["version_history"][0]["changed_by_email"]:
            record["version_history"][0]["changed_by_email"] = record["created_by_email"]
        
        return record
    
    def build_c7_aggregated_record(self, employee_rows: List[Dict], 
                                    category_name: str, facility: Dict,
                                    organization_id: str, user_id: str,
                                    bulk_job_id: Optional[str] = None,
                                    user_email: str = "",
                                    user_name: str = "") -> Dict:
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
            
            # qty_days_travelled (from days_travelled) - No. of Days Travelled
            if row_data.get("days_travelled"):
                inputs["qty_days_travelled"] = float(row_data.get("days_travelled"))
            
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
            
            # Supplier basis inputs - these are needed for supplier method
            calc_method = (row_data.get("calculation_method") or "").lower().replace(" ", "_")
            if calc_method in ["supplier_basis", "supplier_based", "supplier"]:
                # Add supplier inputs with correct variable names matching frontend expectations
                # Frontend expects: activity_value_supplier_based, activity_value_supplier_based_unit,
                #                   emission_factor_supplier_based, emission_factor_supplier_based_unit
                if row_data.get("supplier_quantity"):
                    inputs["supplier_quantity"] = float(row_data.get("supplier_quantity"))
                    inputs["activity_value_supplier_based"] = float(row_data.get("supplier_quantity"))
                if row_data.get("supplier_unit"):
                    inputs["supplier_unit"] = str(row_data.get("supplier_unit"))
                    inputs["activity_value_supplier_based_unit"] = str(row_data.get("supplier_unit"))
                if row_data.get("supplier_ef"):
                    inputs["supplier_ef"] = float(row_data.get("supplier_ef"))
                    inputs["emission_factor_supplier_based"] = float(row_data.get("supplier_ef"))
                if row_data.get("supplier_ef_unit"):
                    inputs["supplier_ef_unit"] = str(row_data.get("supplier_ef_unit"))
                    inputs["emission_factor_supplier_based_unit"] = str(row_data.get("supplier_ef_unit"))
                
                # Also merge any inputs from the calculation result (unit conversion details, etc.)
                calc_result_inputs = emissions.get("inputs", {})
                if calc_result_inputs:
                    for k, v in calc_result_inputs.items():
                        if k not in inputs:  # Don't override user-provided values
                            inputs[k] = v
            
            # Build calculation_details if available from emissions
            # Structure must match what frontend expects (MultiEmployeeInput.jsx):
            # - applied_factors: {key: {label, value, unit}} - emission factors
            # - audit_log: [{step, expression, expression_readable, output}] - formula steps
            calculation_details = None
            calc_method = (row_data.get("calculation_method") or "").lower().replace(" ", "_")
            is_supplier_basis = calc_method in ["supplier_basis", "supplier_based", "supplier"]
            
            if emissions.get("audit_log") or emissions.get("formula_id") or is_supplier_basis:
                # Get applied_factors directly from calc_engine response
                # Calc engine returns resolved emission factors in "applied_factors" key
                applied_factors = emissions.get("applied_factors", {})
                
                # For supplier basis, build applied_factors from inputs if not present
                if is_supplier_basis and not applied_factors:
                    supplier_ef = row_data.get("supplier_ef")
                    supplier_ef_unit = row_data.get("supplier_ef_unit", "kgCO2e")
                    if supplier_ef:
                        applied_factors = {
                            "emission_factor_supplier_based": {
                                "label": "Supplier Emission Factor",
                                "value": float(supplier_ef),
                                "unit": supplier_ef_unit,
                                "source": "user_provided"
                            }
                        }
                
                calculation_details = {
                    "formula_id": emissions.get("formula_id"),
                    "outputs": {
                        "co2e": {
                            "value": self._extract_co2e(emissions),
                            "unit": emissions.get("unit", "tCO2e")
                        }
                    },
                    "audit_log": emissions.get("audit_log", []),
                    "applied_factors": applied_factors,
                    "formula_name": emissions.get("formula_name", "Supplier Method" if is_supplier_basis else None)
                }
            
            # Build emissions data - extract from outputs, handling both formats
            outputs = emissions.get("outputs", {})
            def extract_val(key):
                v = outputs.get(key, 0)
                return v.get("value", 0) if isinstance(v, dict) else v
            
            emissions_data = {
                "co2": extract_val("co2"),
                "ch4": extract_val("ch4"),
                "n2o": extract_val("n2o"),
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
                    "from_location": row_data.get("from_location"),
                    "to_location": row_data.get("to_location"),
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
                    "from_location": row_data.get("from_location"),
                    "to_location": row_data.get("to_location"),
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
        
        # Build C7 aggregated record — shape kept byte-identical to manual
        # C7 entries created via `modules/emissions/c7_router.py`.
        #   Monthly  → matches `create_or_update_c7_monthly_entry`
        #   Yearly   → matches `create_or_update_c7_yearly_entry`
        # Provenance fields (`upload_source`, `bulk_upload_job_id`) are
        # retained per product decision so bulk uploads stay traceable.
        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "facility_id": facility.get("id"),
            "organization_id": organization_id,
            "scope": "scope3",
            "category": category_name,
            "reporting_year": extract_year_from_reporting_period(reporting_period),
            "reporting_period": reporting_period,
            "c7_data_model_version": 2,
            "calculation_method_scope3": method.value if isinstance(method, CalculationMethod) else method,
            "scope3_activity_type": record_activity_type,
            "activity_type": record_activity_type,
            "scope3_ef_id": first_row.get("activity_match", {}).get("activity_id"),
            "scope3_activity": first_row.get("activity_match", {}).get("activity_name"),
            "formula_id": formula_id,
            # `formula_name` is set by manual C7 routes; bulk does not currently
            # surface a resolved name from the calc-engine response, so default
            # to None to keep the field present (parity over content).
            "formula_name": None,
            "employees": employees,
            "co2e_emissions": total_co2e,
            "total_emissions": total_co2e,
            "notes": first_row.get("row_data", {}).get("notes") or "",
            "record_source": (str(first_row.get("row_data", {}).get("record_source")).strip()
                              if first_row.get("row_data", {}).get("record_source") not in (None, "") else ""),
            "responsible_person": first_row.get("row_data", {}).get("responsible_person"),
            "responsible_person_designation": first_row.get("row_data", {}).get("responsible_designation") or "",
            "responsible_person_contact": str(first_row.get("row_data", {}).get("responsible_contact") or "") if first_row.get("row_data", {}).get("responsible_contact") else "",
            "process_names": [first_row.get("row_data", {}).get("process_name")] if first_row.get("row_data", {}).get("process_name") else [],
            "process_descriptions": [{"name": first_row.get("row_data", {}).get("process_name") or "", "description": first_row.get("row_data", {}).get("process_description") or ""}] if first_row.get("row_data", {}).get("process_name") else [],
            "version": 1,
            "created_at": now.isoformat(),
            "created_by": user_id,
            "created_by_email": user_email,
            "created_by_name": user_name,
            # Provenance (bulk-only fields retained for traceability).
            "upload_source": "bulk_upload",
            "bulk_upload_job_id": bulk_job_id,
            # Version tracking - embedded in record like manual upload
            "version": 1,
            "version_history": [{
                "version": 1,
                "changed_at": now.isoformat(),
                "changed_by": user_id,
                "changed_by_email": user_email,
                "changed_by_name": user_name,
                "action": "created",
                "changes_summary": "Initial creation via bulk upload",
            }],
        }

        # Frequency-specific aggregate totals — mirrors manual C7 routes.
        if is_yearly:
            # Manual yearly C7 adds `frequency_type`, `sub_category`,
            # `yearly_total`, and writes explicit None for updated_at/by.
            record["frequency_type"] = "yearly"
            record["sub_category"] = "Employee Commuting"
            record["yearly_total"] = {"co2e": total_co2e, "employee_count": len(employees)}
            record["updated_at"] = None
            record["updated_by"] = None
        else:
            # Manual monthly C7 stores `monthly_total` (singular) AND
            # `reporting_month` (lowercase 3-letter abbr, e.g. "jan").
            # Also store monthly_totals dict for per-month breakdown
            record["reporting_month"] = self._period_to_month_name(reporting_period)
            record["monthly_total"] = {"co2e": total_co2e, "employee_count": len(employees)}
            record["monthly_totals"] = monthly_totals if monthly_totals else None
        
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
    
    def _period_to_month_name(self, reporting_period: str) -> str:
        """Convert reporting period (YYYY-MM) to full month name for reporting_month field.
        
        Args:
            reporting_period: Period in YYYY-MM format (e.g., '2025-05')
            
        Returns:
            Month name in lowercase (e.g., 'may')
        """
        if not reporting_period:
            return None
        
        month_num_to_name = {
            '01': 'jan', '02': 'feb', '03': 'mar', '04': 'apr',
            '05': 'may', '06': 'jun', '07': 'jul', '08': 'aug',
            '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dec'
        }
        
        try:
            parts = reporting_period.split("-")
            if len(parts) == 2 and len(parts[0]) == 4 and parts[0].isdigit():
                month_num = parts[1]
                return month_num_to_name.get(month_num)
            return None
        except (ValueError, AttributeError, IndexError):
            return None
