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

    return router
