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
from typing import Dict, Any, Optional, List
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
            method = await self._select_method(context, request.force_method_id)
            
            if not method:
                return CalculationResult(
                    co2e=0,
                    output_unit="kg",
                    audit=CalculationAudit(
                        method_id="none",
                        method_name="No method found",
                        method_type="none",
                        parameters_resolved=[],
                        formula_used="",
                        intermediate_values={},
                        gwp_source=None,
                        gwp_values_used={}
                    ),
                    success=False,
                    error="No applicable calculation method found for the given context"
                )
            
            # Step 2: Resolve all required parameters
            all_params = method.get("required_parameters", []) + method.get("optional_parameters", [])
            resolved_params = await self.resolver.resolve_all_parameters(
                parameter_keys=all_params,
                context=context,
                user_inputs=request.inputs,
                overrides=request.overrides,
                override_justifications=request.override_justifications
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
                        method_type=method.get("method_type", ""),
                        parameters_resolved=list(resolved_params.values()),
                        formula_used=method.get("formula", ""),
                        intermediate_values={},
                        gwp_source=None,
                        gwp_values_used={}
                    ),
                    success=False,
                    error=f"Missing required parameters: {', '.join(missing_required)}"
                )
            
            # Step 3: Normalize units (convert to standard units)
            normalized_values = await self._normalize_units(resolved_params, context)
            
            # Step 4: Execute calculation
            method_type = method.get("method_type", "factor_based")
            
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
            
            # Step 5: Apply GWP if needed (gas split to CO2e)
            gwp_values = {}
            gwp_source = None
            
            if method.get("supports_gas_split", False):
                gwp_data = await self.resolver.get_gwp_values(context)
                gwp_source = gwp_data.get("source")
                gwp_values = {
                    "co2": gwp_data.get("co2", 1),
                    "ch4": gwp_data.get("ch4_fossil", 29.8),  # Default to fossil
                    "n2o": gwp_data.get("n2o", 273)
                }
                
                # Determine if CH4 is fossil or non-fossil based on context
                if context.scope == "biogenic" or context.category == "Biogenic Emissions":
                    gwp_values["ch4"] = gwp_data.get("ch4_non_fossil", 27.0)
                
                # Calculate CO2e from gas breakdown
                co2_val = result_values.get("co2", 0)
                ch4_val = result_values.get("ch4", 0)
                n2o_val = result_values.get("n2o", 0)
                
                co2e = (
                    co2_val * gwp_values.get("co2", 1) +
                    ch4_val * gwp_values.get("ch4", 29.8) +
                    n2o_val * gwp_values.get("n2o", 273)
                )
                result_values["co2e"] = co2e
            
            # Build result
            return CalculationResult(
                co2e=result_values.get("co2e", 0),
                co2=result_values.get("co2"),
                ch4=result_values.get("ch4"),
                n2o=result_values.get("n2o"),
                output_unit=method.get("output_unit", "kg"),
                audit=CalculationAudit(
                    method_id=method.get("id", ""),
                    method_name=method.get("method_name", ""),
                    method_type=method.get("method_type", ""),
                    parameters_resolved=list(resolved_params.values()),
                    formula_used=method.get("formula", ""),
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
                    method_type="error",
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
    ) -> Optional[Dict[str, Any]]:
        """
        Select the best calculation method based on context and rules.
        
        Selection process:
        1. If force_method_id is provided, use that method
        2. Otherwise, evaluate all rules matching the context
        3. Select method from highest priority matching rule
        
        Args:
            context: Calculation context
            force_method_id: Optional method ID to force
            
        Returns:
            Selected method document or None
        """
        
        # If forced, get that specific method
        if force_method_id:
            method = await self.db.calc_methods.find_one(
                {"id": force_method_id, "is_active": True},
                {"_id": 0}
            )
            return method
        
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
        for rule in rules:
            if self._rule_matches_context(rule, context):
                # Get the method for this rule
                method = await self.db.calc_methods.find_one(
                    {"id": rule.get("method_id"), "is_active": True},
                    {"_id": 0}
                )
                if method:
                    return method
        
        # Fallback: Find a default method for the scope
        default_method = await self.db.calc_methods.find_one(
            {
                "is_active": True,
                "$or": [
                    {"applicable_scopes": context.scope},
                    {"applicable_scopes": {"$size": 0}}
                ]
            },
            {"_id": 0},
            sort=[("rank", 1)]
        )
        
        return default_method
    
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
        context: CalculationContext
    ) -> Dict[str, float]:
        """
        Convert all parameters to standard units.
        
        Standard units:
        - Mass: kg
        - Energy: TJ
        - Emission factors: kg/TJ
        - Density: kg/L
        
        Args:
            resolved_params: Dict of resolved parameters
            context: Calculation context
            
        Returns:
            Dict of normalized values
        """
        normalized = {}
        
        for param_key, resolution in resolved_params.items():
            if resolution.source == "not_found":
                normalized[param_key] = 0.0
                continue
            
            value = resolution.value
            unit = resolution.unit
            
            # Get conversion if needed
            if unit:
                conversion = await self._get_unit_conversion(param_key, unit, context)
                if conversion:
                    value = self._apply_conversion(value, conversion, normalized)
            
            normalized[param_key] = value
        
        return normalized
    
    async def _get_unit_conversion(
        self,
        param_key: str,
        from_unit: str,
        context: CalculationContext
    ) -> Optional[Dict[str, Any]]:
        """Get unit conversion rule"""
        
        # Define standard units for each parameter type
        STANDARD_UNITS = {
            "quantity": "kg",
            "fuel_quantity": "kg",
            "cv": "TJ/kg",
            "ncv": "TJ/kg",
            "calorific_value": "TJ/kg",
            "density": "kg/L",
            "ef_co2": "kg/TJ",
            "ef_ch4": "kg/TJ",
            "ef_n2o": "kg/TJ",
            "emission_factor_co2": "kg/TJ",
            "emission_factor_ch4": "kg/TJ",
            "emission_factor_n2o": "kg/TJ"
        }
        
        to_unit = STANDARD_UNITS.get(param_key)
        if not to_unit or from_unit == to_unit:
            return None
        
        # Look up conversion rule
        conversion = await self.db.calc_unit_conversions.find_one(
            {"from_unit": from_unit, "to_unit": to_unit, "is_active": True},
            {"_id": 0}
        )
        
        if conversion:
            return conversion
        
        # Built-in conversions (fallback)
        BUILTIN_CONVERSIONS = {
            # Mass conversions
            ("g", "kg"): {"conversion_type": "multiply", "factor": 0.001},
            ("tonne", "kg"): {"conversion_type": "multiply", "factor": 1000},
            ("t", "kg"): {"conversion_type": "multiply", "factor": 1000},
            ("lb", "kg"): {"conversion_type": "multiply", "factor": 0.453592},
            
            # Volume to mass (requires density)
            ("L", "kg"): {"conversion_type": "formula", "formula": "value * density", "requires_parameter": "density"},
            ("kL", "kg"): {"conversion_type": "formula", "formula": "value * 1000 * density", "requires_parameter": "density"},
            ("m3", "kg"): {"conversion_type": "formula", "formula": "value * density * 1000", "requires_parameter": "density"},
            
            # NCV conversions
            ("MJ/kg", "TJ/kg"): {"conversion_type": "multiply", "factor": 0.000001},
            ("GJ/t", "TJ/kg"): {"conversion_type": "multiply", "factor": 0.001},
            ("TJ/Gg", "TJ/kg"): {"conversion_type": "multiply", "factor": 0.000001},
            ("kJ/kg", "TJ/kg"): {"conversion_type": "multiply", "factor": 0.000000001},
        }
        
        return BUILTIN_CONVERSIONS.get((from_unit, to_unit))
    
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
            except:
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
        
        if not formula:
            return {output: 0 for output in outputs}, intermediate
        
        # Check if formula is a dict-style formula (multiple outputs)
        if formula.strip().startswith("{") and ":" in formula:
            # Parse multi-output formula
            # Format: {co2: expr1, ch4: expr2, n2o: expr3}
            formula_clean = formula.strip()[1:-1]  # Remove braces
            parts = self._parse_multi_output_formula(formula_clean)
            
            for output_key, expr in parts.items():
                try:
                    result = self._safe_eval(expr, values)
                    result_values[output_key] = result
                    intermediate[f"{output_key}_formula"] = expr
                except Exception as e:
                    result_values[output_key] = 0
                    intermediate[f"{output_key}_error"] = str(e)
        else:
            # Single output formula
            try:
                result = self._safe_eval(formula, values)
                # Assign to first output or co2e
                primary_output = outputs[0] if outputs else "co2e"
                result_values[primary_output] = result
                intermediate["formula_result"] = result
            except Exception as e:
                result_values[outputs[0] if outputs else "co2e"] = 0
                intermediate["formula_error"] = str(e)
        
        return result_values, intermediate
    
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
        
        # Sort steps by order
        sorted_steps = sorted(steps, key=lambda x: x.get("step_order", 0))
        
        for step in sorted_steps:
            output_key = step.get("output_key", f"step_{step.get('step_order', 0)}")
            formula = step.get("formula", "")
            
            try:
                result = self._safe_eval(formula, intermediate)
                intermediate[output_key] = result
                
                # If this is a final output (co2, ch4, n2o, co2e), add to results
                if output_key in ["co2", "ch4", "n2o", "co2e"]:
                    result_values[output_key] = result
            except Exception as e:
                intermediate[f"{output_key}_error"] = str(e)
                intermediate[output_key] = 0
        
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
        method = await self._select_method(context, request.force_method_id)
        
        if not method:
            return {
                "method": None,
                "parameters": {},
                "error": "No applicable method found"
            }
        
        # Resolve parameters
        all_params = method.get("required_parameters", []) + method.get("optional_parameters", [])
        resolved = await self.resolver.resolve_all_parameters(
            parameter_keys=all_params,
            context=context,
            user_inputs=request.inputs,
            overrides=request.overrides,
            override_justifications=request.override_justifications
        )
        
        return {
            "method": {
                "id": method.get("id"),
                "name": method.get("method_name"),
                "type": method.get("method_type"),
                "formula": method.get("formula"),
                "outputs": method.get("outputs", [])
            },
            "parameters": {
                key: {
                    "value": res.value,
                    "unit": res.unit,
                    "source": res.source,
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
