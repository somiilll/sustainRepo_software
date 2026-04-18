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

    # --- SuperAdmin write endpoints ---

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

    @router.delete("/super-admin/calc-engine/variables/{var_id}")
    async def delete_variable(
        var_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        var = await db.ce_variables.find_one({"id": var_id}, {"_id": 0})
        if not var:
            raise HTTPException(status_code=404, detail="Variable not found")
        if var.get("is_system_defined"):
            raise HTTPException(status_code=400, detail="System variables cannot be deleted")
        await db.ce_variables.delete_one({"id": var_id})
        return {"message": "Variable deleted"}

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

    class _Unused: pass  # sentinel so imports above keep their place
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
