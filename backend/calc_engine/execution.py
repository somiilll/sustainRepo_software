"""
Formula execution orchestrator.

A **formula** in Phase 1 is a structured dict (validated, not free-form) with:

{
  "id": "F1",
  "version_id": "v1",
  "outputs": [
      {"variable": "co2",  "unit": "kgCO2",  "produced_by_step": "compute_co2"},
      {"variable": "ch4",  "unit": "kgCH4",  "produced_by_step": "compute_ch4"},
      {"variable": "n2o",  "unit": "kgN2O",  "produced_by_step": "compute_n2o"},
      {"variable": "co2e", "unit": "kgCO2e", "produced_by_step": "aggregate_co2e"}
  ],
  "inputs": [
      {"variable": "qty",  "expected_unit": "kg",
       "allow_dimension_conversion": true,
       "allowed_transformations": ["volume_to_mass"],
       "required": true}
  ],
  "properties": [            # context-resolved; engine fetches automatically
      {"variable": "ef_q_co2", "expected_unit": "kgCO2/kg"},
      {"variable": "ef_q_ch4", "expected_unit": "kgCH4/kg"},
      {"variable": "ef_q_n2o", "expected_unit": "kgN2O/kg"},
      {"variable": "gwp_ch4",  "expected_unit": "1"},
      {"variable": "gwp_n2o",  "expected_unit": "1"}
  ],
  "steps": [
      {"name": "compute_co2",       "type": "expression", "expression": "qty * ef_q_co2"},
      {"name": "compute_ch4",       "type": "expression", "expression": "qty * ef_q_ch4"},
      {"name": "compute_n2o",       "type": "expression", "expression": "qty * ef_q_n2o"},
      {"name": "aggregate_co2e",    "type": "expression",
       "expression": "compute_co2 + compute_ch4 * gwp_ch4 + compute_n2o * gwp_n2o"}
  ]
}

Execution (per spec #8):
  1. Validate formula definition (variables known, outputs hooked to steps)
  2. Fetch input fields
  3. Validate runtime inputs (required, dimension)
  4. Normalise units (simple + compound, apply transformations if needed)
  5. Resolve properties from context (+user overrides)
  6. Execute formula steps in declaration order
  7. Compute outputs, aggregate co2e
  8. Emit audit log, return structured output
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .audit import AuditTrail
from .expression import extract_variable_names, safe_eval
from .properties import resolve_property
from .transformations import TRANSFORMATIONS, apply_transformation
from .units import convert, dims_equal, resolve_unit
from .variables import validate_variables


class FormulaDefinitionError(ValueError):
    pass


class CalculationError(RuntimeError):
    pass


class CalcEngine:
    def __init__(self, db):
        self.db = db

    # ---------- Unit validation ----------

    async def validate_input_unit(
        self,
        variable_key: str,
        unit: str,
        context: Dict[str, Any],
    ) -> None:
        """
        Validate that the provided unit is allowed for this variable.
        
        Uses ce_input_field_mappings to determine allowed units:
        - If unit_source == "fuel": allowed units come from fuel_database.allowed_units
        - If unit_source == "static" (or not set): allowed units come from mapping.allowed_units
        
        Raises CalculationError if unit is not allowed.
        """
        if not unit:
            return  # No unit to validate
        
        # Find input field mapping for this variable
        mapping = await self.db.ce_input_field_mappings.find_one(
            {"maps_to_variable": variable_key, "is_active": True},
            {"_id": 0}
        )
        
        if not mapping:
            return  # No mapping = no validation (allow any unit)
        
        unit_source = mapping.get("unit_source", "static")
        allowed_units = []
        
        if unit_source == "fuel":
            # Get allowed units from fuel database
            fuel_name = context.get("fuel_name") or context.get("fuel_type")
            if fuel_name:
                fuel = await self.db.fuel_database.find_one(
                    {"$or": [
                        {"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}},
                        {"id": fuel_name}
                    ]},
                    {"_id": 0}
                )
                if fuel:
                    allowed_units = fuel.get("allowed_units", [])
        else:
            # Static: get allowed units from mapping
            allowed_units = mapping.get("allowed_units", [])
            # Also allow default_unit if allowed_units is empty
            if not allowed_units and mapping.get("default_unit"):
                allowed_units = [mapping.get("default_unit")]
        
        # If no allowed_units defined, skip validation
        if not allowed_units:
            return
        
        # Validate unit is in allowed list
        if unit not in allowed_units:
            source_desc = "fuel" if unit_source == "fuel" else "field mapping"
            raise CalculationError(
                f"Unit '{unit}' is not allowed for variable '{variable_key}'. "
                f"Allowed units (from {source_desc}): {allowed_units}"
            )

    # ---------- Formula definition validation ----------

    async def validate_formula(self, formula: Dict[str, Any]) -> None:
        """Raise FormulaDefinitionError if the formula is structurally invalid."""
        required = ("inputs", "steps", "outputs")
        for k in required:
            if k not in formula:
                raise FormulaDefinitionError(f"Formula missing '{k}'")

        # Collect all variable references
        declared: set[str] = set()
        for inp in formula["inputs"]:
            declared.add(inp["variable"])
        for p in formula.get("properties", []):
            declared.add(p["variable"])

        step_names: List[str] = []
        used_in_expr: set[str] = set()
        for step in formula["steps"]:
            if step.get("type") != "expression":
                raise FormulaDefinitionError(
                    f"Phase 1 supports only step type='expression' (got {step.get('type')})"
                )
            if not step.get("name"):
                raise FormulaDefinitionError("Each step needs a 'name'")
            if not step.get("expression"):
                raise FormulaDefinitionError(f"Step '{step['name']}' missing expression")
            names = extract_variable_names(step["expression"])
            used_in_expr |= names
            step_names.append(step["name"])
            declared.add(step["name"])  # step output is a new usable name

        # All names used in expressions must be declared
        undeclared = used_in_expr - declared
        if undeclared:
            raise FormulaDefinitionError(
                f"Step expressions reference undeclared names: {sorted(undeclared)}"
            )

        # Output variables must be known + produced by a step
        out_vars = [o["variable"] for o in formula["outputs"]]
        unknowns = await validate_variables(self.db, out_vars)
        if unknowns:
            raise FormulaDefinitionError(f"Unknown output variables: {unknowns}")
        for o in formula["outputs"]:
            if o.get("produced_by_step") and o["produced_by_step"] not in step_names:
                raise FormulaDefinitionError(
                    f"Output '{o['variable']}' references missing step '{o['produced_by_step']}'"
                )

        # Gas vs. co2e-only rule
        gases = {"co2", "ch4", "n2o"}
        declared_out = set(out_vars)
        produces_gases = bool(gases & declared_out)
        produces_co2e_only = declared_out == {"co2e"}
        if not (produces_gases or produces_co2e_only):
            raise FormulaDefinitionError(
                "Formula must produce either (co2,ch4,n2o[,co2e]) or co2e only."
            )
        if produces_gases and ({"co2e"} - declared_out):
            # gas-based formulas must also produce co2e
            raise FormulaDefinitionError(
                "Gas-based formulas must also produce co2e (aggregation step)."
            )

        # Input variable keys must exist in variable registry
        inp_vars = [i["variable"] for i in formula["inputs"]]
        unknowns = await validate_variables(self.db, inp_vars)
        if unknowns:
            raise FormulaDefinitionError(f"Unknown input variables: {unknowns}")

    # ---------- Execution ----------

    async def execute(
        self,
        formula: Dict[str, Any],
        inputs: Dict[str, Any],            # { variable_key: {"value": n, "unit": "kg"} }
        context: Optional[Dict[str, Any]] = None,   # { fuel_code, region, year, ... }
        user_overrides: Optional[Dict[str, Any]] = None,
        dry_run: bool = True,
        emission_record_id: Optional[str] = None,
        org_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run a formula end-to-end and return outputs + audit trail."""
        context = context or {}
        user_overrides = user_overrides or {}
        audit = AuditTrail()

        await self.validate_formula(formula)
        audit.add({"step": "validate_formula",
                   "formula_id": formula.get("id"),
                   "version_id": formula.get("version_id")})

        env: Dict[str, Any] = {}

        # 0. Validate input units against allowed units (from input field mappings)
        for var, payload in inputs.items():
            if isinstance(payload, dict) and payload.get("unit"):
                await self.validate_input_unit(var, payload["unit"], context)
        
        # Also validate user override units
        for var, override in user_overrides.items():
            if isinstance(override, dict) and override.get("unit"):
                await self.validate_input_unit(var, override["unit"], context)

        # 1. Normalise inputs to expected_unit (with transformation fallback)
        for inp_decl in formula["inputs"]:
            var = inp_decl["variable"]
            expected_unit = inp_decl["expected_unit"]
            required = inp_decl.get("required", True)

            payload = inputs.get(var)
            if payload is None:
                if required:
                    raise CalculationError(f"Missing required input '{var}'")
                continue
            raw_value = float(payload["value"])
            raw_unit = payload.get("unit") or expected_unit

            audit.add({"step": "input",
                       "variable": var,
                       "value": raw_value, "unit": raw_unit,
                       "expected_unit": expected_unit})

            # Try direct conversion if dimensions match
            try:
                value, c_audit = await convert(self.db, raw_value, raw_unit, expected_unit)
                env[var] = value
                audit.add(c_audit)
                continue
            except ValueError as conv_err:
                # Dimension mismatch — attempt a transformation
                if not inp_decl.get("allow_dimension_conversion"):
                    raise CalculationError(str(conv_err))

                # Get dimensions of input and expected units
                try:
                    raw_unit_info = await resolve_unit(self.db, raw_unit)
                    expected_unit_info = await resolve_unit(self.db, expected_unit)
                    raw_dim = raw_unit_info.get("dimension_vector", {}) if raw_unit_info else {}
                    expected_dim = expected_unit_info.get("dimension_vector", {}) if expected_unit_info else {}
                except Exception:
                    raw_dim = {}
                    expected_dim = {}

                # Determine input and expected dimension types
                input_dimension = None
                expected_dimension = None
                for dim, power in raw_dim.items():
                    if power > 0:
                        input_dimension = dim
                        break
                for dim, power in expected_dim.items():
                    if power > 0:
                        expected_dimension = dim
                        break

                attempted: List[str] = []
                transformation_applied = False
                
                # First try explicitly allowed transformations
                allowed_transforms = inp_decl.get("allowed_transformations") or []
                
                # If no explicit list, auto-discover transformations that match dimensions
                if not allowed_transforms and input_dimension and expected_dimension:
                    for t_key, t_info in TRANSFORMATIONS.items():
                        if (t_info.get("from_dimension") == input_dimension and 
                            t_info.get("to_dimension") == expected_dimension):
                            allowed_transforms.append(t_key)
                
                for t_key in allowed_transforms:
                    if t_key not in TRANSFORMATIONS:
                        continue
                    t = TRANSFORMATIONS[t_key]
                    # Check if transformation applies to our input dimension
                    if input_dimension and t["from_dimension"] != input_dimension:
                        continue
                    try:
                        val, new_unit, t_audit = await apply_transformation(
                            self.db, t_key, raw_value, raw_unit, context, user_overrides
                        )
                        for a in t_audit:
                            audit.add(a)
                        # Now convert to expected_unit (same dim post-transformation)
                        final_val, final_audit = await convert(self.db, val, new_unit, expected_unit)
                        audit.add(final_audit)
                        env[var] = final_val
                        transformation_applied = True
                        break
                    except ValueError as te:
                        attempted.append(f"{t_key}:{te}")
                
                if not transformation_applied:
                    raise CalculationError(
                        f"Cannot convert '{var}' ({raw_unit} -> {expected_unit}). "
                        f"Attempted: {attempted or 'none'}"
                    )

        # 2. Resolve properties
        for prop_decl in formula.get("properties", []):
            var = prop_decl["variable"]
            expected_unit = prop_decl.get("expected_unit")
            
            # If expected_unit not defined in formula, look up from ce_variables
            if not expected_unit:
                var_def = await self.db.ce_variables.find_one({"key": var}, {"_id": 0})
                if var_def:
                    expected_unit = var_def.get("default_unit")
            
            value, unit, res_audit = await resolve_property(
                self.db, var, context, user_overrides, org_id=org_id,
            )
            audit.add(res_audit)
            
            # Only convert if we have both units and they differ
            if expected_unit and unit and unit != expected_unit:
                value, c_audit = await convert(self.db, value, unit, expected_unit)
                audit.add(c_audit)
            env[var] = value

        # 3. Run steps in declaration order
        for step in formula["steps"]:
            expr = step["expression"]
            allowed_names = list(env.keys())
            try:
                result = safe_eval(expr, env, allowed_names)
            except Exception as e:
                raise CalculationError(
                    f"Step '{step['name']}' failed: {e} (expression: {expr})"
                )
            env[step["name"]] = result
            audit.add({
                "step": "formula_step",
                "name": step["name"],
                "expression": expr,
                "output": result,
            })

        # 4. Collect outputs
        outputs: Dict[str, Dict[str, Any]] = {}
        for out in formula["outputs"]:
            src = out.get("produced_by_step") or out["variable"]
            if src not in env:
                raise CalculationError(
                    f"Output '{out['variable']}' not produced — step '{src}' did not run."
                )
            outputs[out["variable"]] = {"value": env[src], "unit": out["unit"]}

        audit.add({"step": "outputs", "outputs": outputs})

        result = {
            "formula_id": formula.get("id"),
            "formula_version_id": formula.get("version_id"),
            "inputs": inputs,
            "context": context,
            "outputs": outputs,
            "audit_log": audit.trail,
            "dry_run": dry_run,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        if not dry_run:
            await self.db.ce_calculation_audit_logs.insert_one({
                "id": str(uuid.uuid4()),
                "emission_record_id": emission_record_id,
                "org_id": org_id,
                "formula_id": formula.get("id"),
                "formula_version_id": formula.get("version_id"),
                "inputs": inputs,
                "context": context,
                "outputs": outputs,
                "audit_log": audit.trail,
                "created_at": result["generated_at"],
            })
            result["persisted"] = True

        return result
