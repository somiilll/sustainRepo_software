"""
Calculation Engine

The core engine that:
1. Selects the appropriate calculation method based on context
2. Resolves all required parameters
3. Executes the calculation
4. Returns results with audit trail
"""

import re
import math
from typing import Dict, Any, Optional, List, Tuple
from .models import (
    CalculationContext,
    CalculationRequest,
    CalculationResult,
    CalculationAudit,
    ParameterResolution
)
from .resolver import ParameterResolver


class CalculationEngine:
    """
    Universal Context-Aware Emission Calculation Engine.
    
    This engine:
    - Does NOT hardcode any formulas or emission factors
    - Dynamically selects calculation methods based on rules
    - Resolves parameters from multiple sources with priority
    - Supports multiple computation models (factor-based, fugitive, process, etc.)
    - Provides full audit trail
    """
    
    def __init__(self, db):
        """
        Initialize the calculation engine.
        
        Args:
            db: Motor AsyncIOMotorDatabase instance
        """
        self.db = db
        self.resolver = ParameterResolver(db)
    
    async def calculate(self, request: CalculationRequest) -> CalculationResult:
        """
        Execute emission calculation.
        
        Flow:
        1. Select best calculation method
        2. Resolve all required parameters
        3. Normalize units
        4. Execute formula
        5. Apply GWP (if needed)
        6. Return result with audit
        
        Args:
            request: CalculationRequest with context, inputs, and overrides
            
        Returns:
            CalculationResult with emissions and audit trail
        """
        context = request.context
        
        try:
            # Step 1: Select calculation method
            method, method_error = await self._select_method(context, request.force_method_id)
            
            if not method:
                return CalculationResult(
                    co2e=0,
                    output_unit="kg",
                    audit=CalculationAudit(
                        method_id="none",
                        method_name="No method found",
                        parameters_resolved=[],
                        formula_used="",
                        intermediate_values={},
                        gwp_source=None,
                        gwp_values_used={}
                    ),
                    success=False,
                    error=method_error or "No applicable calculation method found for the given context"
                )
            
            # Step 2: Resolve all required parameters
            # Include parameters from required, optional, AND parameter_sources
            parameter_sources = method.get("parameter_sources", [])
            
            # Get all parameter keys from parameter_sources (includes constants, derived, etc.)
            source_param_keys = [ps.get("parameter_key") for ps in parameter_sources if ps.get("parameter_key")]
            
            # Combine all parameter keys (required + optional + from sources)
            all_params = list(set(
                method.get("required_parameters", []) + 
                method.get("optional_parameters", []) + 
                source_param_keys
            ))
            
            resolved_params = await self.resolver.resolve_all_parameters(
                parameter_keys=all_params,
                context=context,
                user_inputs=request.inputs,
                overrides=request.overrides,
                override_justifications=request.override_justifications,
                parameter_sources=parameter_sources
            )
            
            # Check if all required parameters are resolved
            missing_required = []
            for param_key in method.get("required_parameters", []):
                resolution = resolved_params.get(param_key)
                if not resolution or resolution.source == "not_found":
                    missing_required.append(param_key)
            
            if missing_required:
                return CalculationResult(
                    co2e=0,
                    output_unit="kg",
                    audit=CalculationAudit(
                        method_id=method.get("id", ""),
                        method_name=method.get("method_name", ""),
                        parameters_resolved=list(resolved_params.values()),
                        formula_used=method.get("formula") or "",
                        intermediate_values={},
                        gwp_source=None,
                        gwp_values_used={}
                    ),
                    success=False,
                    error=f"Missing required parameters: {', '.join(missing_required)}"
                )
            
            # Step 3: Normalize units (convert to standard units based on quantity_unit)
            normalized_values = await self._normalize_units(resolved_params, context, request.inputs)
            
            # Step 4: Resolve GWP values if any parameter source is gwp_config
            gwp_values = {}
            gwp_source = None
            
            # Check if method needs GWP values (either for gas split or direct formula use)
            needs_gwp = method.get("supports_gas_split", False)
            
            # Also check if any parameter source is gwp_config
            for ps in method.get("parameter_sources", []):
                if ps.get("source_type") == "gwp_config":
                    needs_gwp = True
                    break
            
            # Also check if formula contains gwp references
            formula = method.get("formula") or ""
            if "gwp_co2" in formula or "gwp_ch4" in formula or "gwp_n2o" in formula:
                needs_gwp = True
            
            # Also check steps for gwp references
            for step in method.get("steps", []):
                step_formula = step.get("formula") or ""
                if "gwp_co2" in step_formula or "gwp_ch4" in step_formula or "gwp_n2o" in step_formula:
                    needs_gwp = True
                    break
            
            if needs_gwp:
                gwp_data = await self.resolver.get_gwp_values(context)
                gwp_source = gwp_data.get("source")
                
                # Determine if CH4 is fossil or non-fossil based on context
                is_biogenic = context.scope == "biogenic" or context.category == "Biogenic Emissions"
                ch4_gwp = gwp_data.get("ch4_non_fossil", 27.0) if is_biogenic else gwp_data.get("ch4_fossil", 29.8)
                
                gwp_values = {
                    "co2": gwp_data.get("co2", 1),
                    "ch4": ch4_gwp,
                    "n2o": gwp_data.get("n2o", 273)
                }
                
                # Add GWP values to normalized_values so they can be used in formulas
                normalized_values["gwp_co2"] = gwp_values["co2"]
                normalized_values["gwp_ch4"] = gwp_values["ch4"]
                normalized_values["gwp_n2o"] = gwp_values["n2o"]
            
            # Step 5: Execute calculation
            if method.get("steps") and len(method.get("steps", [])) > 0:
                # Multi-step calculation
                result_values, intermediate = await self._execute_multi_step(
                    method.get("steps", []),
                    normalized_values
                )
            else:
                # Single formula calculation
                result_values, intermediate = await self._execute_formula(
                    method.get("formula", ""),
                    normalized_values,
                    method.get("outputs", ["co2e"])
                )
            
            # Step 6: Calculate CO2e if not already in results but we have individual gases
            # This is a FALLBACK only if the method didn't define co2e in its formula
            if "co2e" not in result_values and method.get("supports_gas_split", False):
                co2_val = result_values.get("co2", 0)
                ch4_val = result_values.get("ch4", 0)
                n2o_val = result_values.get("n2o", 0)
                
                # Use GWP values to calculate CO2e
                co2e = (
                    co2_val * gwp_values.get("co2", 1) +
                    ch4_val * gwp_values.get("ch4", 29.8) +
                    n2o_val * gwp_values.get("n2o", 273)
                )
                result_values["co2e"] = co2e
            
            # Build result
            # For steps-based methods, concatenate step formulas for audit
            formula_display = method.get("formula") or ""
            if not formula_display and method.get("steps"):
                formula_display = " → ".join([
                    f"{s.get('output_key')}: {s.get('formula')}" 
                    for s in sorted(method.get("steps", []), key=lambda x: x.get("step_order", 0))
                ])
            
            return CalculationResult(
                co2e=result_values.get("co2e", 0),
                co2=result_values.get("co2"),
                ch4=result_values.get("ch4"),
                n2o=result_values.get("n2o"),
                output_unit=method.get("output_unit", "kg"),
                audit=CalculationAudit(
                    method_id=method.get("id", ""),
                    method_name=method.get("method_name", ""),
                    parameters_resolved=list(resolved_params.values()),
                    formula_used=formula_display,
                    intermediate_values=intermediate,
                    gwp_source=gwp_source,
                    gwp_values_used=gwp_values
                ),
                success=True,
                error=None,
                warnings=[]
            )
            
        except Exception as e:
            return CalculationResult(
                co2e=0,
                output_unit="kg",
                audit=CalculationAudit(
                    method_id="error",
                    method_name="Calculation Error",
                    parameters_resolved=[],
                    formula_used="",
                    intermediate_values={},
                    gwp_source=None,
                    gwp_values_used={}
                ),
                success=False,
                error=str(e)
            )
    
    async def _select_method(
        self,
        context: CalculationContext,
        force_method_id: Optional[str] = None
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        Select the best calculation method based on context and rules.
        
        Selection process:
        1. If force_method_id is provided, use that method
        2. Otherwise, evaluate all rules matching the context
        3. Select method from highest priority matching rule
        4. Return error if matching rule found but method is inactive
        
        Args:
            context: Calculation context
            force_method_id: Optional method ID to force
            
        Returns:
            Tuple of (method document or None, error message or None)
        """
        
        # If forced, get that specific method
        if force_method_id:
            method = await self.db.calc_methods.find_one(
                {"id": force_method_id, "is_active": True},
                {"_id": 0}
            )
            if not method:
                # Check if method exists but is inactive
                inactive_method = await self.db.calc_methods.find_one(
                    {"id": force_method_id},
                    {"_id": 0, "method_name": 1, "is_active": 1}
                )
                if inactive_method:
                    return None, f"Method '{inactive_method.get('method_name')}' is inactive"
                return None, f"Method with ID '{force_method_id}' not found"
            return method, None
        
        # Build query for matching rules
        rule_query = {
            "is_active": True,
            "$or": [
                {"scope": context.scope},
                {"scope": None},
                {"scope": {"$exists": False}}
            ]
        }
        
        # Get all potentially matching rules, sorted by priority
        rules = await self.db.calc_rules.find(
            rule_query,
            {"_id": 0}
        ).sort("priority", 1).to_list(100)
        
        # Evaluate each rule's conditions
        matched_rule = None
        for rule in rules:
            if self._rule_matches_context(rule, context):
                matched_rule = rule
                # Get the method for this rule
                method = await self.db.calc_methods.find_one(
                    {"id": rule.get("method_id"), "is_active": True},
                    {"_id": 0}
                )
                if method:
                    return method, None
                else:
                    # Rule matched but method is inactive - return error, don't fallback
                    inactive_method = await self.db.calc_methods.find_one(
                        {"id": rule.get("method_id")},
                        {"_id": 0, "method_name": 1}
                    )
                    method_name = inactive_method.get("method_name") if inactive_method else rule.get("method_id")
                    return None, f"No active method found for category '{context.category}'. Method '{method_name}' is inactive."
        
        # No matching rule found - return clear error
        return None, f"No calculation method configured for scope '{context.scope}' and category '{context.category}'"
    
    def _rule_matches_context(
        self,
        rule: Dict[str, Any],
        context: CalculationContext
    ) -> bool:
        """
        Check if a rule matches the given context.
        
        Args:
            rule: Rule document
            context: Calculation context
            
        Returns:
            True if rule matches, False otherwise
        """
        # Check scope
        if rule.get("scope") and rule["scope"] != context.scope:
            return False
        
        # Check category
        if rule.get("category"):
            if context.category and rule["category"].lower() != context.category.lower():
                return False
        
        # Check sub_category
        if rule.get("sub_category"):
            if context.sub_category and rule["sub_category"].lower() != context.sub_category.lower():
                return False
        
        # Check industry
        if rule.get("industry"):
            if context.industry and rule["industry"].lower() != context.industry.lower():
                return False
        
        # Check additional conditions
        conditions = rule.get("conditions", {})
        for key, expected_value in conditions.items():
            context_value = getattr(context, key, None) or context.extra.get(key)
            
            # Handle boolean conditions
            if isinstance(expected_value, bool):
                if expected_value and not context_value:
                    return False
                if not expected_value and context_value:
                    return False
            # Handle value matching
            elif context_value != expected_value:
                return False
        
        return True
    
    async def _normalize_units(
        self,
        resolved_params: Dict[str, ParameterResolution],
        context: CalculationContext,
        user_inputs: Dict[str, Any] = None
    ) -> Dict[str, float]:
        """
        Normalize units for input parameters based on standard_units defined in input fields.
        
        Flow:
        1. Get the input field definition for quantity-type parameters
        2. Check if user's unit is in standard_units → no conversion needed
        3. If not, find a conversion path from user's unit to one of the standard units
        4. Apply conversion using user-provided values (like density) or fetch from fuel DB
        
        Args:
            resolved_params: Dict of resolved parameters
            context: Calculation context
            user_inputs: User input dict containing quantity, quantity_unit, and other values
            
        Returns:
            Dict of normalized values
        """
        normalized = {}
        user_inputs = user_inputs or {}
        
        # First pass: collect all values from resolved params
        for param_key, resolution in resolved_params.items():
            if resolution.source == "not_found":
                normalized[param_key] = 0.0
            else:
                normalized[param_key] = resolution.value
        
        # Get the quantity unit from user inputs or context
        quantity_unit = user_inputs.get("quantity_unit") or getattr(context, 'input_unit', None)
        
        if not quantity_unit:
            return normalized
        
        # Check quantity-type parameters for conversion
        quantity_params = ("quantity", "fuel_quantity", "consumption")
        
        for param_key in quantity_params:
            if param_key not in resolved_params:
                continue
                
            resolution = resolved_params[param_key]
            if resolution.source == "not_found":
                continue
                
            value = resolution.value
            
            # Get the input field definition to check standard_units
            input_field = await self.db.calc_input_fields.find_one(
                {"field_key": param_key},
                {"_id": 0}
            )
            
            standard_units = []
            if input_field:
                standard_units = input_field.get("standard_units", [])
            
            # If no standard_units defined, default to ["kg"] for quantity fields
            if not standard_units:
                standard_units = ["kg"]
            
            # Check if user's unit is already a standard unit
            if quantity_unit in standard_units:
                # No conversion needed
                normalized[param_key] = value
                continue
            
            # User's unit is not standard - find a conversion path
            conversion = await self._find_conversion_to_standard(quantity_unit, standard_units)
            
            if conversion:
                # Build conversion values: include resolved params + user inputs
                conversion_values = dict(normalized)
                # Add numeric values from user_inputs (like density)
                for k, v in user_inputs.items():
                    if isinstance(v, (int, float)) and k not in conversion_values:
                        conversion_values[k] = v
                
                requires_param = conversion.get("requires_parameter")
                
                # If requires a parameter not in conversion_values, fetch it
                if requires_param and requires_param not in conversion_values:
                    param_value = await self._fetch_conversion_parameter(conversion, context)
                    if param_value is not None:
                        conversion_values[requires_param] = param_value
                
                # Apply conversion
                value = self._apply_conversion(value, conversion, conversion_values)
            
            normalized[param_key] = value
        
        return normalized
    
    async def _find_conversion_to_standard(
        self,
        from_unit: str,
        standard_units: List[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Find a conversion rule from the user's unit to any of the standard units.
        
        Args:
            from_unit: The unit to convert from (e.g., "L")
            standard_units: List of acceptable target units (e.g., ["kg", "t"])
            
        Returns:
            Conversion rule dict or None if not found
        """
        # Try to find conversion to any of the standard units
        for to_unit in standard_units:
            conversion = await self.db.calc_unit_conversions.find_one(
                {"from_unit": from_unit, "to_unit": to_unit, "is_active": True},
                {"_id": 0}
            )
            if conversion:
                return conversion
        
        return None
    
    async def _fetch_conversion_parameter(
        self,
        conversion: Dict[str, Any],
        context: CalculationContext
    ) -> Optional[float]:
        """
        Fetch a required parameter for a unit conversion.
        
        For example, when converting L -> kg, we need the density of the fuel.
        This looks up the parameter from the source specified in the conversion.
        
        Args:
            conversion: Unit conversion document
            context: Calculation context with fuel information
            
        Returns:
            The parameter value or None if not found
        """
        requires_param = conversion.get("requires_parameter")
        if not requires_param:
            return None
        
        param_source = conversion.get("parameter_source", "fuel_database")
        param_field = conversion.get("parameter_source_field") or requires_param
        default_value = conversion.get("parameter_default_value")
        
        if param_source == "fuel_database":
            # Get fuel from context
            fuel_id = context.fuel_id or context.extra.get("fuel_id")
            fuel_name = context.fuel or context.extra.get("fuel_name")
            
            if fuel_id or fuel_name:
                query = {}
                if fuel_id:
                    query["id"] = fuel_id
                elif fuel_name:
                    query["$or"] = [
                        {"name": {"$regex": fuel_name, "$options": "i"}},
                        {"fuel_name": {"$regex": fuel_name, "$options": "i"}}
                    ]
                
                fuel = await self.db.fuel_database.find_one(query, {"_id": 0})
                if fuel:
                    # Map parameter field to actual fuel DB field
                    field_mapping = {
                        "density": "density",
                        "cv": "cv",
                        "ncv": "ncv",
                        "ef_co2": "ef_co2",
                        "ef_ch4": "ef_ch4",
                        "ef_n2o": "ef_n2o"
                    }
                    actual_field = field_mapping.get(param_field, param_field)
                    value = fuel.get(actual_field)
                    
                    if value is not None:
                        return float(value)
        
        elif param_source == "constant":
            return default_value
        
        # Return default value if nothing found
        return default_value
    
    def _apply_conversion(
        self,
        value: float,
        conversion: Dict[str, Any],
        all_values: Dict[str, float]
    ) -> float:
        """Apply a unit conversion"""
        
        conversion_type = conversion.get("conversion_type", "multiply")
        
        if conversion_type == "multiply":
            return value * conversion.get("factor", 1)
        
        elif conversion_type == "divide":
            factor = conversion.get("factor", 1)
            return value / factor if factor != 0 else 0
        
        elif conversion_type == "formula":
            formula = conversion.get("formula", "value")
            # Simple formula evaluation
            local_vars = {"value": value, **all_values}
            try:
                return eval(formula, {"__builtins__": {}}, local_vars)
            except Exception:
                return value
        
        return value
    
    async def _execute_formula(
        self,
        formula: str,
        values: Dict[str, float],
        outputs: List[str]
    ) -> tuple:
        """
        Execute a calculation formula.
        
        Supports formulas like:
        - "quantity * cv * ef_co2"
        - "charge * leakage_rate * gwp"
        - "{co2: quantity * cv * ef_co2, ch4: quantity * cv * ef_ch4}"
        
        Args:
            formula: Formula string
            values: Dict of parameter values
            outputs: List of expected output keys
            
        Returns:
            Tuple of (result_values dict, intermediate_values dict)
        """
        intermediate = {}
        result_values = {}
        calculation_breakdown = []
        
        if not formula:
            return {output: 0 for output in outputs}, intermediate
        
        # Check if formula is a dict-style formula (multiple outputs)
        if formula.strip().startswith("{") and ":" in formula:
            # Parse multi-output formula
            # Format: {co2: expr1, ch4: expr2, n2o: expr3, co2e: co2*gwp + ...}
            formula_clean = formula.strip()[1:-1]  # Remove braces
            parts = self._parse_multi_output_formula(formula_clean)
            
            # Create a working copy of values that we can add results to
            # This allows later formulas to reference earlier outputs (e.g., co2e uses co2, ch4, n2o)
            working_values = dict(values)
            
            step_num = 0
            for output_key, expr in parts.items():
                step_num += 1
                try:
                    # Build substituted formula for display
                    substituted = self._substitute_values_in_formula(expr, working_values)
                    
                    result = self._safe_eval(expr, working_values)
                    result_values[output_key] = result
                    # Add result to working values so it can be used by subsequent formulas
                    working_values[output_key] = result
                    intermediate[f"{output_key}_formula"] = expr
                    
                    # Add to breakdown
                    calculation_breakdown.append({
                        "step": step_num,
                        "output": output_key,
                        "formula": expr,
                        "substituted": substituted,
                        "result": self._format_number_for_display(result),
                        "description": ""
                    })
                except Exception as e:
                    result_values[output_key] = 0
                    working_values[output_key] = 0
                    intermediate[f"{output_key}_error"] = f"Formula evaluation error: {str(e)}"
                    calculation_breakdown.append({
                        "step": step_num,
                        "output": output_key,
                        "formula": expr,
                        "error": str(e)
                    })
        else:
            # Single output formula
            try:
                # Build substituted formula for display
                substituted = self._substitute_values_in_formula(formula, values)
                
                result = self._safe_eval(formula, values)
                # Assign to first output or co2e
                primary_output = outputs[0] if outputs else "co2e"
                result_values[primary_output] = result
                intermediate["formula_result"] = result
                
                # Add to breakdown
                calculation_breakdown.append({
                    "step": 1,
                    "output": primary_output,
                    "formula": formula,
                    "substituted": substituted,
                    "result": self._format_number_for_display(result),
                    "description": ""
                })
            except Exception as e:
                result_values[outputs[0] if outputs else "co2e"] = 0
                intermediate["formula_error"] = str(e)
                calculation_breakdown.append({
                    "step": 1,
                    "output": outputs[0] if outputs else "co2e",
                    "formula": formula,
                    "error": str(e)
                })
        
        # Add breakdown to intermediate for audit
        intermediate["_calculation_breakdown"] = calculation_breakdown
        
        return result_values, intermediate
    
    def _substitute_values_in_formula(self, formula: str, values: Dict[str, float]) -> str:
        """Substitute variable values into formula for display"""
        substituted = formula
        for var_name, var_value in values.items():
            if var_name in formula and isinstance(var_value, (int, float)):
                formatted_val = self._format_number_for_display(var_value)
                # Replace variable with value (word boundary aware)
                substituted = re.sub(rf'\b{var_name}\b', formatted_val, substituted)
        return substituted
    
    def _format_number_for_display(self, value: float) -> str:
        """Format a number for display in calculation breakdown"""
        if value == 0:
            return "0"
        abs_val = abs(value)
        if abs_val < 0.0001:
            # For very small numbers, show significant digits
            formatted = f"{value:.10f}".rstrip('0').rstrip('.')
            if formatted == "0" or formatted == "-0":
                formatted = f"{value:.12g}"
            return formatted
        elif abs_val >= 1000:
            return f"{value:,.2f}"
        else:
            return f"{value:.6f}".rstrip('0').rstrip('.')
    
    def _parse_multi_output_formula(self, formula_content: str) -> Dict[str, str]:
        """Parse a multi-output formula string"""
        parts = {}
        
        # Simple parser for "key: expression" pairs
        current_key = None
        current_expr = []
        depth = 0
        
        for segment in formula_content.split(","):
            segment = segment.strip()
            
            if ":" in segment and depth == 0:
                # Save previous
                if current_key:
                    parts[current_key] = " ".join(current_expr).strip()
                
                # Parse new key:value
                key_part, expr_part = segment.split(":", 1)
                current_key = key_part.strip()
                current_expr = [expr_part.strip()]
            else:
                if current_key:
                    current_expr.append(segment)
        
        # Save last
        if current_key:
            parts[current_key] = " ".join(current_expr).strip()
        
        return parts
    
    async def _execute_multi_step(
        self,
        steps: List[Dict[str, Any]],
        values: Dict[str, float]
    ) -> tuple:
        """
        Execute a multi-step calculation.
        
        Each step produces an intermediate value that can be used in subsequent steps.
        
        Args:
            steps: List of step definitions
            values: Initial parameter values
            
        Returns:
            Tuple of (result_values dict, intermediate_values dict)
        """
        intermediate = dict(values)  # Start with initial values
        result_values = {}
        
        # Track calculation breakdown for display
        calculation_breakdown = []
        
        # Sort steps by order
        sorted_steps = sorted(steps, key=lambda x: x.get("step_order", 0))
        
        for step in sorted_steps:
            output_key = step.get("output_key", f"step_{step.get('step_order', 0)}")
            formula = step.get("formula", "")
            
            try:
                # Build substituted formula for display
                substituted = formula
                for var_name, var_value in intermediate.items():
                    if var_name in formula and isinstance(var_value, (int, float)):
                        # Format number for display - handle very small numbers
                        abs_val = abs(var_value) if var_value != 0 else 0
                        if abs_val == 0:
                            formatted_val = "0"
                        elif abs_val < 0.0001:
                            # For very small numbers, show significant digits
                            formatted_val = f"{var_value:.10f}".rstrip('0').rstrip('.')
                            if formatted_val == "0" or formatted_val == "-0":
                                formatted_val = f"{var_value:.12g}"
                        elif abs_val >= 1000:
                            formatted_val = f"{var_value:,.2f}"
                        else:
                            formatted_val = f"{var_value:.6f}".rstrip('0').rstrip('.')
                        
                        # Replace variable with value (word boundary aware)
                        import re
                        substituted = re.sub(rf'\b{var_name}\b', formatted_val, substituted)
                
                result = self._safe_eval(formula, intermediate)
                intermediate[output_key] = result
                
                # Format result for display
                if abs(result) < 0.0001 and result != 0:
                    result_formatted = f"{result:.10f}".rstrip('0').rstrip('.')
                else:
                    result_formatted = f"{result:.6f}".rstrip('0').rstrip('.')
                
                # Add to breakdown
                calculation_breakdown.append({
                    "step": step.get("step_order", 0),
                    "output": output_key,
                    "formula": formula,
                    "substituted": substituted,
                    "result": result_formatted,
                    "description": step.get("description", "")
                })
                
                # If this is a final output (co2, ch4, n2o, co2e), add to results
                if output_key in ["co2", "ch4", "n2o", "co2e"]:
                    result_values[output_key] = result
            except Exception as e:
                intermediate[f"{output_key}_error"] = str(e)
                intermediate[output_key] = 0
                calculation_breakdown.append({
                    "step": step.get("step_order", 0),
                    "output": output_key,
                    "formula": formula,
                    "error": str(e)
                })
        
        # Add breakdown to intermediate for audit
        intermediate["_calculation_breakdown"] = calculation_breakdown
        
        return result_values, intermediate
    
    def _safe_eval(self, expression: str, variables: Dict[str, float]) -> float:
        """
        Safely evaluate a mathematical expression.
        
        Only allows basic math operations and provided variables.
        
        Args:
            expression: Mathematical expression string
            variables: Dict of variable values
            
        Returns:
            Calculated result
        """
        # Replace common symbols
        expression = expression.replace("×", "*").replace("÷", "/")
        
        # Allowed functions
        safe_functions = {
            "abs": abs,
            "round": round,
            "min": min,
            "max": max,
            "pow": pow,
            "sqrt": math.sqrt,
            "log": math.log,
            "log10": math.log10,
            "exp": math.exp
        }
        
        # Build safe namespace
        namespace = {**safe_functions, **variables}
        
        # Validate expression (only allow safe characters)
        allowed_pattern = r'^[\w\s\.\+\-\*\/\(\)\,\×\÷]+$'
        if not re.match(allowed_pattern, expression):
            raise ValueError(f"Invalid characters in expression: {expression}")
        
        try:
            result = eval(expression, {"__builtins__": {}}, namespace)
            return float(result) if result is not None else 0.0
        except Exception as e:
            raise ValueError(f"Formula evaluation error: {e}")
    
    async def get_available_methods(
        self,
        context: CalculationContext
    ) -> List[Dict[str, Any]]:
        """
        Get all methods available for the given context.
        
        Args:
            context: Calculation context
            
        Returns:
            List of available method documents
        """
        query = {
            "is_active": True,
            "$or": [
                {"applicable_scopes": context.scope},
                {"applicable_scopes": {"$size": 0}},
                {"applicable_scopes": {"$exists": False}}
            ]
        }
        
        methods = await self.db.calc_methods.find(
            query,
            {"_id": 0}
        ).sort("rank", 1).to_list(100)
        
        return methods
    
    async def preview_calculation(
        self,
        request: CalculationRequest
    ) -> Dict[str, Any]:
        """
        Preview calculation without executing.
        Shows which method would be used and what parameters would be resolved.
        
        Args:
            request: Calculation request
            
        Returns:
            Preview information
        """
        context = request.context
        
        # Select method
        method, method_error = await self._select_method(context, request.force_method_id)
        
        if not method:
            return {
                "method": None,
                "parameters": {},
                "error": method_error or "No applicable method found"
            }
        
        # Resolve parameters
        all_params = method.get("required_parameters", []) + method.get("optional_parameters", [])
        resolved = await self.resolver.resolve_all_parameters(
            parameter_keys=all_params,
            context=context,
            user_inputs=request.inputs,
            overrides=request.overrides,
            override_justifications=request.override_justifications,
            parameter_sources=method.get("parameter_sources", [])
        )
        
        return {
            "method": {
                "id": method.get("id"),
                "name": method.get("method_name"),
                "formula": method.get("formula"),
                "outputs": method.get("outputs", []),
                "parameter_sources": method.get("parameter_sources", [])
            },
            "parameters": {
                key: {
                    "value": res.value,
                    "unit": res.unit,
                    "source": res.source,
                    "source_reference": res.source_reference,
                    "is_override": res.is_override
                }
                for key, res in resolved.items()
            },
            "missing_required": [
                key for key in method.get("required_parameters", [])
                if resolved.get(key, ParameterResolution(
                    parameter_key=key, value=0, source="not_found", priority=999
                )).source == "not_found"
            ]
        }
