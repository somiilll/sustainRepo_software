"""
FastAPI router for calc engine CRUD + sandbox.

All endpoints live under /api/super-admin/calc-engine/*
Read endpoints under /api/calc-engine/* are open to authenticated users
(needed when the Emissions UI will render formulas later — in Phase 1 we just
expose them for the Superadmin sandbox + external tests).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .execution import CalcEngine, CalculationError, FormulaDefinitionError
from .formulas import (
    DecisionTreeError,
    create_decision_tree,
    create_formula,
    get_decision_tree_for_category,
    list_formulas,
    resolve_formula_id,
    soft_delete_formula,
    update_decision_tree,
    update_formula,
    validate_decision_tree,
)
from .fuel_import import import_from_fuel_database
from .transformations import list_transformations
from .units import resolve_unit


# ---------- Pydantic schemas ----------


class DryRunRequest(BaseModel):
    formula: Dict[str, Any]
    inputs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    user_overrides: Dict[str, Any] = Field(default_factory=dict)
    org_id: Optional[str] = None


class VariableCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    key: str
    label: str
    type: str
    dimension: str
    default_unit: Optional[str] = None
    description: Optional[str] = None


class PropertyValueCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    property_key: str
    value: float
    unit: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None


class FormulaPayload(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[str] = None
    definition: Dict[str, Any]


class DecisionTreePayload(BaseModel):
    category_id: str
    tree: Dict[str, Any]


class ExecuteByCategoryRequest(BaseModel):
    category_id: str
    decision_inputs: Dict[str, Any] = Field(default_factory=dict)
    inputs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    user_overrides: Dict[str, Any] = Field(default_factory=dict)
    org_id: Optional[str] = None
    dry_run: bool = True


class ExecuteByFormulaRequest(BaseModel):
    formula_id: str
    inputs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    user_overrides: Dict[str, Any] = Field(default_factory=dict)
    org_id: Optional[str] = None
    dry_run: bool = True


# ---------- Router factory ----------


def build_calc_engine_router(db, get_current_user, get_super_admin_user) -> APIRouter:
    router = APIRouter()
    engine = CalcEngine(db)

    # --- Read endpoints (any authenticated user) ---

    @router.get("/calc-engine/variables")
    async def list_variables(current_user: dict = Depends(get_current_user)):
        items = await db.ce_variables.find({}, {"_id": 0}).sort("key", 1).to_list(1000)
        return items

    @router.get("/calc-engine/units")
    async def list_units(current_user: dict = Depends(get_current_user)):
        simple = await db.ce_units.find({}, {"_id": 0}).sort("key", 1).to_list(1000)
        compound = await db.ce_compound_units.find({}, {"_id": 0}).sort("key", 1).to_list(1000)
        return {"simple": simple, "compound": compound}

    @router.get("/calc-engine/properties")
    async def list_properties(current_user: dict = Depends(get_current_user)):
        props = await db.ce_properties.find({}, {"_id": 0}).sort("key", 1).to_list(1000)
        return props

    @router.get("/calc-engine/transformations")
    async def list_transforms(current_user: dict = Depends(get_current_user)):
        return list_transformations()

    @router.get("/calc-engine/resolve-unit")
    async def describe_unit(key: str, current_user: dict = Depends(get_current_user)):
        try:
            return await resolve_unit(db, key)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    @router.get("/calc-engine/input-field-mappings")
    async def list_input_field_mappings(current_user: dict = Depends(get_current_user)):
        """List all input field mappings that define how UI fields connect to formula variables."""
        mappings = await db.ce_input_field_mappings.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
        return mappings

    # --- SuperAdmin write endpoints ---

    # Helper to find formulas using a variable
    async def _find_formulas_using_variable(var_key: str) -> List[dict]:
        """Find all active formulas that reference a variable key."""
        formulas = await db.ce_formulas.find({"is_active": True}, {"_id": 0}).to_list(10000)
        using_formulas = []
        for f in formulas:
            definition = f.get("definition", {})
            # Check inputs
            for inp in definition.get("inputs", []):
                if inp.get("variable") == var_key:
                    using_formulas.append({"id": f["id"], "name": f["name"], "usage": "input"})
                    break
            else:
                # Check properties
                for prop in definition.get("properties", []):
                    if prop.get("variable") == var_key:
                        using_formulas.append({"id": f["id"], "name": f["name"], "usage": "property"})
                        break
                else:
                    # Check outputs
                    for out in definition.get("outputs", []):
                        if out.get("variable") == var_key:
                            using_formulas.append({"id": f["id"], "name": f["name"], "usage": "output"})
                            break
                    else:
                        # Check step expressions
                        for step in definition.get("steps", []):
                            expr = step.get("expression", "")
                            # Simple check: variable appears as word in expression
                            import re
                            if re.search(rf'\b{re.escape(var_key)}\b', expr):
                                using_formulas.append({"id": f["id"], "name": f["name"], "usage": f"step '{step.get('name')}'"})
                                break
        return using_formulas

    @router.get("/super-admin/calc-engine/variables/{var_id}/usage")
    async def get_variable_usage(
        var_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Check which formulas use a variable."""
        var = await db.ce_variables.find_one({"id": var_id}, {"_id": 0})
        if not var:
            raise HTTPException(status_code=404, detail="Variable not found")
        using_formulas = await _find_formulas_using_variable(var["key"])
        return {
            "variable": var,
            "used_in_formulas": using_formulas,
            "can_delete": len(using_formulas) == 0,
        }

    @router.post("/super-admin/calc-engine/variables")
    async def create_variable(
        payload: VariableCreate,
        current_user: dict = Depends(get_super_admin_user),
    ):
        if payload.type not in {"input", "output", "property", "intermediate"}:
            raise HTTPException(status_code=400,
                                detail="type must be input|output|property|intermediate")
        existing = await db.ce_variables.find_one({"key": payload.key}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail=f"Variable '{payload.key}' already exists")
        doc = {
            "id": str(uuid.uuid4()),
            **payload.model_dump(),
            "is_system_defined": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_variables.insert_one(doc)
        return doc

    @router.put("/super-admin/calc-engine/variables/{var_id}")
    async def update_variable(
        var_id: str,
        payload: VariableCreate,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Update a variable. Key change blocked if used in formulas."""
        var = await db.ce_variables.find_one({"id": var_id}, {"_id": 0})
        if not var:
            raise HTTPException(status_code=404, detail="Variable not found")
        
        if payload.type not in {"input", "output", "property", "intermediate"}:
            raise HTTPException(status_code=400,
                                detail="type must be input|output|property|intermediate")
        
        # If key is changing, check usage
        if payload.key != var["key"]:
            using_formulas = await _find_formulas_using_variable(var["key"])
            if using_formulas:
                formula_names = ", ".join([f"'{f['name']}'" for f in using_formulas[:5]])
                if len(using_formulas) > 5:
                    formula_names += f" and {len(using_formulas) - 5} more"
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot change key '{var['key']}' — used in formulas: {formula_names}"
                )
            # Check if new key already exists
            existing = await db.ce_variables.find_one({"key": payload.key}, {"_id": 0})
            if existing:
                raise HTTPException(status_code=400, detail=f"Variable '{payload.key}' already exists")
        
        updates = {
            "key": payload.key,
            "label": payload.label,
            "type": payload.type,
            "dimension": payload.dimension,
            "default_unit": payload.default_unit,
            "description": payload.description,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_variables.update_one({"id": var_id}, {"$set": updates})
        return await db.ce_variables.find_one({"id": var_id}, {"_id": 0})

    @router.delete("/super-admin/calc-engine/variables/{var_id}")
    async def delete_variable(
        var_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        var = await db.ce_variables.find_one({"id": var_id}, {"_id": 0})
        if not var:
            raise HTTPException(status_code=404, detail="Variable not found")
        
        # Check if variable is used in any formula
        using_formulas = await _find_formulas_using_variable(var["key"])
        if using_formulas:
            formula_names = ", ".join([f"'{f['name']}' ({f['usage']})" for f in using_formulas[:5]])
            if len(using_formulas) > 5:
                formula_names += f" and {len(using_formulas) - 5} more"
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete '{var['key']}' — currently used in: {formula_names}"
            )
        
        await db.ce_variables.delete_one({"id": var_id})
        return {"message": f"Variable '{var['key']}' deleted"}

    @router.post("/super-admin/calc-engine/property-values")
    async def create_property_value(
        payload: PropertyValueCreate,
        current_user: dict = Depends(get_super_admin_user),
    ):
        prop = await db.ce_properties.find_one({"key": payload.property_key}, {"_id": 0})
        if not prop:
            raise HTTPException(status_code=404,
                                detail=f"Property '{payload.property_key}' not found")
        doc = {
            "id": str(uuid.uuid4()),
            "property_id": prop["id"],
            "property_key": prop["key"],
            "value": float(payload.value),
            "unit": payload.unit or prop.get("unit"),
            "context": payload.context or {},
            "version_id": str(uuid.uuid4()),
            "effective_from": payload.effective_from
                or datetime.now(timezone.utc).isoformat(),
            "effective_to": payload.effective_to,
            "source": "superadmin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_property_values.insert_one(doc)
        return doc

    @router.get("/calc-engine/property-values")
    async def list_property_values(
        property_key: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        query: Dict[str, Any] = {}
        if property_key:
            query["property_key"] = property_key
        items = await db.ce_property_values.find(query, {"_id": 0}).to_list(10000)
        return items

    @router.delete("/super-admin/calc-engine/property-values/{value_id}")
    async def delete_property_value(
        value_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        res = await db.ce_property_values.delete_one({"id": value_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Property value not found")
        return {"message": "Property value deleted"}

    # --- Units CRUD ---

    @router.post("/super-admin/calc-engine/units")
    async def create_unit(
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Create a simple unit."""
        key = payload.get("key")
        if not key:
            raise HTTPException(status_code=400, detail="Unit key is required")
        existing = await db.ce_units.find_one({"key": key}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail=f"Unit '{key}' already exists")
        
        dimension_vector = payload.get("dimension_vector", {})
        doc = {
            "id": str(uuid.uuid4()),
            "key": key,
            "label": payload.get("label", key),
            "dimension_vector": dimension_vector,
            "to_base_factor": float(payload.get("to_base_factor", 1.0)),
            "is_system": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_units.insert_one(doc)
        return doc

    @router.put("/super-admin/calc-engine/units/{unit_id}")
    async def update_unit(
        unit_id: str,
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Update a unit."""
        unit = await db.ce_units.find_one({"id": unit_id}, {"_id": 0})
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")
        
        updates = {
            "label": payload.get("label", unit["label"]),
            "dimension_vector": payload.get("dimension_vector", unit.get("dimension_vector", {})),
            "to_base_factor": float(payload.get("to_base_factor", unit.get("to_base_factor", 1.0))),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        # Key change check
        if payload.get("key") and payload["key"] != unit["key"]:
            existing = await db.ce_units.find_one({"key": payload["key"]}, {"_id": 0})
            if existing:
                raise HTTPException(status_code=400, detail=f"Unit '{payload['key']}' already exists")
            updates["key"] = payload["key"]
        
        await db.ce_units.update_one({"id": unit_id}, {"$set": updates})
        return await db.ce_units.find_one({"id": unit_id}, {"_id": 0})

    @router.delete("/super-admin/calc-engine/units/{unit_id}")
    async def delete_unit(
        unit_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Delete a unit (only non-system units)."""
        unit = await db.ce_units.find_one({"id": unit_id}, {"_id": 0})
        if not unit:
            raise HTTPException(status_code=404, detail="Unit not found")
        if unit.get("is_system"):
            raise HTTPException(status_code=400, detail="System units cannot be deleted")
        await db.ce_units.delete_one({"id": unit_id})
        return {"message": f"Unit '{unit['key']}' deleted"}

    @router.post("/super-admin/calc-engine/compound-units")
    async def create_compound_unit(
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Create a compound unit from components."""
        from .units import _resolve_compound
        key = payload.get("key")
        if not key:
            raise HTTPException(status_code=400, detail="Compound unit key is required")
        existing = await db.ce_compound_units.find_one({"key": key}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail=f"Compound unit '{key}' already exists")
        
        components = payload.get("components", [])
        if not components:
            raise HTTPException(status_code=400, detail="Components are required")
        
        try:
            dv, factor = await _resolve_compound(db, components)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        doc = {
            "id": str(uuid.uuid4()),
            "key": key,
            "label": payload.get("label", key),
            "components": components,
            "derived_dimension_vector": dv,
            "to_base_factor": factor,
            "is_system": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_compound_units.insert_one(doc)
        return doc

    @router.delete("/super-admin/calc-engine/compound-units/{unit_id}")
    async def delete_compound_unit(
        unit_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Delete a compound unit (only non-system)."""
        unit = await db.ce_compound_units.find_one({"id": unit_id}, {"_id": 0})
        if not unit:
            raise HTTPException(status_code=404, detail="Compound unit not found")
        if unit.get("is_system"):
            raise HTTPException(status_code=400, detail="System compound units cannot be deleted")
        await db.ce_compound_units.delete_one({"id": unit_id})
        return {"message": f"Compound unit '{unit['key']}' deleted"}

    # --- Input Field Mappings CRUD ---

    @router.post("/super-admin/calc-engine/input-field-mappings")
    async def create_input_field_mapping(
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Create an input field mapping that connects a UI field to a formula variable."""
        field_key = payload.get("field_key")
        if not field_key:
            raise HTTPException(status_code=400, detail="field_key is required")
        existing = await db.ce_input_field_mappings.find_one({"field_key": field_key}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail=f"Field mapping '{field_key}' already exists")
        
        doc = {
            "id": str(uuid.uuid4()),
            "field_key": field_key,
            "field_label": payload.get("field_label", field_key),
            "field_type": payload.get("field_type", "number"),  # number, text, select, etc.
            "maps_to_variable": payload.get("maps_to_variable"),  # The formula variable key
            "maps_to_context": payload.get("maps_to_context"),  # Or a context key
            "default_unit": payload.get("default_unit"),
            "allowed_units": payload.get("allowed_units", []),
            "is_required": payload.get("is_required", False),
            "display_order": payload.get("display_order", 0),
            "applies_to_categories": payload.get("applies_to_categories", []),  # Empty = all
            "applies_to_scopes": payload.get("applies_to_scopes", []),  # Empty = all
            "placeholder": payload.get("placeholder"),
            "help_text": payload.get("help_text"),
            "validation_rules": payload.get("validation_rules", {}),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_input_field_mappings.insert_one(doc)
        return doc

    @router.put("/super-admin/calc-engine/input-field-mappings/{mapping_id}")
    async def update_input_field_mapping(
        mapping_id: str,
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Update an input field mapping."""
        mapping = await db.ce_input_field_mappings.find_one({"id": mapping_id}, {"_id": 0})
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        
        updates = {k: v for k, v in payload.items() if k != "id"}
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.ce_input_field_mappings.update_one({"id": mapping_id}, {"$set": updates})
        return await db.ce_input_field_mappings.find_one({"id": mapping_id}, {"_id": 0})

    @router.delete("/super-admin/calc-engine/input-field-mappings/{mapping_id}")
    async def delete_input_field_mapping(
        mapping_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Delete an input field mapping."""
        mapping = await db.ce_input_field_mappings.find_one({"id": mapping_id}, {"_id": 0})
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        await db.ce_input_field_mappings.delete_one({"id": mapping_id})
        return {"message": f"Mapping '{mapping['field_key']}' deleted"}

    # --- Sandbox (dry-run) ---

    @router.post("/super-admin/calc-engine/dry-run")
    async def dry_run(
        req: DryRunRequest,
        current_user: dict = Depends(get_super_admin_user),
    ):
        try:
            result = await engine.execute(
                formula=req.formula,
                inputs=req.inputs,
                context=req.context,
                user_overrides=req.user_overrides,
                dry_run=True,
                org_id=req.org_id,
            )
            return {"ok": True, **result}
        except FormulaDefinitionError as e:
            raise HTTPException(status_code=400, detail=f"Formula error: {e}")
        except CalculationError as e:
            raise HTTPException(status_code=400, detail=f"Calculation error: {e}")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.post("/super-admin/calc-engine/validate-formula")
    async def validate_formula(
        formula: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        try:
            await engine.validate_formula(formula)
            return {"ok": True, "message": "Formula is structurally valid"}
        except FormulaDefinitionError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # --- One-click Import from Fuel DB ---

    @router.post("/super-admin/calc-engine/import-from-fuel-db")
    async def import_fuel_db(
        dry_run: bool = True,
        overwrite: bool = False,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Materialise property_values from fuel_database rows.

        dry_run=true (default): preview the changes, no DB writes.
        overwrite=true: replace existing property_values with the same (property, context);
                       otherwise they are skipped.
        """
        try:
            return await import_from_fuel_database(db, dry_run=dry_run, overwrite=overwrite)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # --- Formulas ---

    @router.get("/calc-engine/formulas")
    async def list_formulas_endpoint(
        category_id: Optional[str] = None,
        include_inactive: bool = False,
        current_user: dict = Depends(get_current_user),
    ):
        return await list_formulas(db, include_inactive=include_inactive,
                                    category_id=category_id)

    @router.get("/calc-engine/formulas/{formula_id}")
    async def get_formula(formula_id: str, current_user: dict = Depends(get_current_user)):
        doc = await db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Formula not found")
        return doc

    @router.get("/calc-engine/formulas/{formula_id}/versions")
    async def get_formula_versions(formula_id: str,
                                    current_user: dict = Depends(get_current_user)):
        return await db.ce_formula_versions.find(
            {"formula_id": formula_id}, {"_id": 0},
        ).sort("version_number", -1).to_list(100)

    class _Unused:
        pass  # sentinel so imports above keep their place
    # (payload classes defined at module scope above)

    @router.post("/super-admin/calc-engine/formulas")
    async def create_formula_endpoint(
        payload: FormulaPayload,
        current_user: dict = Depends(get_super_admin_user),
    ):
        try:
            await engine.validate_formula(payload.definition)
        except FormulaDefinitionError as e:
            raise HTTPException(status_code=400, detail=f"Formula invalid: {e}")
        doc = await create_formula(
            db,
            name=payload.name, description=payload.description,
            category_id=payload.category_id, definition=payload.definition,
            created_by=current_user.get("id") or current_user.get("email") or "superadmin",
        )
        return doc

    @router.put("/super-admin/calc-engine/formulas/{formula_id}")
    async def update_formula_endpoint(
        formula_id: str,
        payload: FormulaPayload,
        current_user: dict = Depends(get_super_admin_user),
    ):
        try:
            await engine.validate_formula(payload.definition)
        except FormulaDefinitionError as e:
            raise HTTPException(status_code=400, detail=f"Formula invalid: {e}")
        try:
            return await update_formula(
                db, formula_id,
                name=payload.name, description=payload.description,
                category_id=payload.category_id, definition=payload.definition,
                created_by=current_user.get("id") or current_user.get("email") or "superadmin",
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    @router.delete("/super-admin/calc-engine/formulas/{formula_id}")
    async def delete_formula_endpoint(
        formula_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        try:
            await soft_delete_formula(db, formula_id)
            return {"message": "Formula deactivated (soft-delete)"}
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    # --- Decision Trees ---

    @router.get("/calc-engine/decision-trees")
    async def list_decision_trees(
        category_id: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        query: Dict[str, Any] = {"is_active": True}
        if category_id:
            query["category_id"] = category_id
        return await db.ce_decision_trees.find(query, {"_id": 0}).to_list(10000)

    @router.post("/super-admin/calc-engine/decision-trees")
    async def create_decision_tree_endpoint(
        payload: DecisionTreePayload,
        current_user: dict = Depends(get_super_admin_user),
    ):
        try:
            return await create_decision_tree(
                db, category_id=payload.category_id, tree=payload.tree,
                created_by=current_user.get("id") or "superadmin",
            )
        except DecisionTreeError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.put("/super-admin/calc-engine/decision-trees/{tree_id}")
    async def update_decision_tree_endpoint(
        tree_id: str,
        payload: DecisionTreePayload,
        current_user: dict = Depends(get_super_admin_user),
    ):
        try:
            return await update_decision_tree(
                db, tree_id, tree=payload.tree,
                created_by=current_user.get("id") or "superadmin",
            )
        except (DecisionTreeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.delete("/super-admin/calc-engine/decision-trees/{tree_id}")
    async def delete_decision_tree_endpoint(
        tree_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Delete a decision tree."""
        tree = await db.ce_decision_trees.find_one({"id": tree_id}, {"_id": 0})
        if not tree:
            raise HTTPException(status_code=404, detail="Decision tree not found")
        
        await db.ce_decision_trees.delete_one({"id": tree_id})
        return {"message": "Decision tree deleted"}

    # --- Category-driven execute: resolve via decision tree, then run ---

    @router.post("/super-admin/calc-engine/execute-by-category")
    async def execute_by_category(
        req: ExecuteByCategoryRequest,
        current_user: dict = Depends(get_super_admin_user),
    ):
        tree = await get_decision_tree_for_category(db, req.category_id)
        if not tree:
            raise HTTPException(
                status_code=404,
                detail=f"No decision tree configured for category {req.category_id}",
            )
        try:
            formula_id, tree_path = resolve_formula_id(tree["tree"], req.decision_inputs)
        except DecisionTreeError as e:
            raise HTTPException(status_code=400, detail=str(e))

        if not formula_id:
            raise HTTPException(status_code=400, detail="Decision tree did not resolve to a formula")

        formula_doc = await db.ce_formulas.find_one(
            {"id": formula_id, "is_active": True}, {"_id": 0},
        )
        if not formula_doc:
            raise HTTPException(status_code=404,
                                detail=f"Formula '{formula_id}' not found or inactive")
        definition = dict(formula_doc["definition"])
        definition.setdefault("id", formula_doc["id"])
        definition.setdefault("version_id", formula_doc.get("version_id"))

        try:
            result = await engine.execute(
                formula=definition, inputs=req.inputs, context=req.context,
                user_overrides=req.user_overrides, dry_run=req.dry_run,
                org_id=req.org_id,
            )
        except (FormulaDefinitionError, CalculationError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e))

        return {
            "ok": True,
            "resolved_formula": {"id": formula_id, "name": formula_doc.get("name"),
                                  "version_id": formula_doc.get("version_id")},
            "decision_path": tree_path,
            **result,
        }

    # --- Formula-direct execute (for sandbox when tree not needed) ---

    @router.post("/super-admin/calc-engine/execute")
    async def execute_formula_endpoint(
        req: ExecuteByFormulaRequest,
        current_user: dict = Depends(get_super_admin_user),
    ):
        formula_doc = await db.ce_formulas.find_one({"id": req.formula_id}, {"_id": 0})
        if not formula_doc:
            raise HTTPException(status_code=404, detail="Formula not found")
        definition = dict(formula_doc["definition"])
        definition.setdefault("id", formula_doc["id"])
        definition.setdefault("version_id", formula_doc.get("version_id"))
        try:
            result = await engine.execute(
                formula=definition, inputs=req.inputs, context=req.context,
                user_overrides=req.user_overrides, dry_run=req.dry_run,
                org_id=req.org_id,
            )
        except (FormulaDefinitionError, CalculationError, ValueError) as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"ok": True, **result}

    return router
