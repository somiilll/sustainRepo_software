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
    is_overridable: Optional[bool] = True  # For property types - can users override the default value?


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
    scope_ids: Optional[List[str]] = None  # Multiple scopes
    category_ids: Optional[List[str]] = None  # Multiple categories
    category_id: Optional[str] = None  # Legacy single category
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
    emission_record_id: Optional[str] = None  # Link audit log to emission record
    scope3_ef_id: Optional[str] = None  # Reference to scope3_ef record for EF lookup


class ExecuteByFormulaRequest(BaseModel):
    formula_id: str
    inputs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)
    user_overrides: Dict[str, Any] = Field(default_factory=dict)
    org_id: Optional[str] = None
    dry_run: bool = True


# ---------- Router factory ----------


def extract_formula_ids_from_tree(tree_node: dict) -> list:
    """Recursively extract all formula IDs from a decision tree, including nested 'next' nodes"""
    formula_ids = []
    
    if not tree_node:
        return formula_ids
    
    node_type = tree_node.get("type")
    
    # Handle type-based nodes
    if node_type == "leaf":
        formula_id = tree_node.get("formula_id")
        if formula_id:
            formula_ids.append(formula_id)
    elif node_type == "branch":
        options = tree_node.get("options", {})
        for option_value, option_node in options.items():
            formula_ids.extend(extract_formula_ids_from_tree(option_node))
    
    # Handle nodes without explicit type (infer from structure)
    if not node_type:
        # Check if this is a leaf (has formula_id directly)
        if "formula_id" in tree_node:
            formula_ids.append(tree_node["formula_id"])
        
        # Check if this has a "next" node (nested decision tree)
        if "next" in tree_node:
            formula_ids.extend(extract_formula_ids_from_tree(tree_node["next"]))
        
        # Check if this is a branch (has options or field_name)
        if "options" in tree_node:
            for option_value, option_node in tree_node["options"].items():
                if isinstance(option_node, dict):
                    formula_ids.extend(extract_formula_ids_from_tree(option_node))
    
    return list(set(formula_ids))  # Deduplicate


def extract_decision_fields_from_tree(tree_node: dict, parent_field: str = None, parent_value: str = None) -> list:
    """
    Extract all decision field names from a decision tree with parent context.
    
    Returns a list of decision fields with their parent context, e.g.:
    [
        {"field_name": "calculation_method_scope3", "allowed_values": [...], "parent_field": None, "parent_value": None},
        {"field_name": "activity_type", "allowed_values": [...], "parent_field": "calculation_method_scope3", "parent_value": "activity_basis"}
    ]
    """
    fields = []
    
    if not tree_node:
        return fields
    
    node_type = tree_node.get("type")
    
    # Handle nodes with field_name (branch nodes)
    field_name = tree_node.get("field_name")
    if field_name:
        allowed_values = tree_node.get("allowed_values", [])
        
        # If no explicit allowed_values, extract from options keys
        if not allowed_values and "options" in tree_node:
            allowed_values = list(tree_node["options"].keys())
        
        fields.append({
            "field_name": field_name,
            "allowed_values": allowed_values,
            "description": f"Select {field_name}",
            "parent_field": parent_field,
            "parent_value": parent_value
        })
    
    # Recurse into options (for both type-based and inferred branches)
    options = tree_node.get("options", {})
    for option_value, option_node in options.items():
        if isinstance(option_node, dict):
            # Check if this option has a "next" node (nested decision)
            next_node = option_node.get("next")
            if next_node:
                # Pass current field as parent context
                child_fields = extract_decision_fields_from_tree(
                    next_node, 
                    parent_field=field_name, 
                    parent_value=option_value
                )
                fields.extend(child_fields)
            else:
                # Regular recursion for non-"next" structures
                child_fields = extract_decision_fields_from_tree(
                    option_node,
                    parent_field=field_name,
                    parent_value=option_value
                )
                # Add child fields that aren't already in our list
                for cf in child_fields:
                    if cf["field_name"] not in [f["field_name"] for f in fields]:
                        fields.append(cf)
    
    return fields


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
        # Get units from main 'units' table (has symbol, name, aliases - used by Scope 1, 2)
        main_units = await db.units.find({"is_active": True}, {"_id": 0}).sort("symbol", 1).to_list(1000)
        
        # Transform simple units to have consistent structure for frontend (key/label aliases)
        for u in main_units:
            # Add 'key' and 'label' fields as aliases for CalcEngineUnits.js compatibility
            u['key'] = u.get('symbol')
            u['label'] = u.get('name', u.get('symbol'))
            # Build dimension_vector from unit_type if not present
            if 'dimension_vector' not in u:
                unit_type = u.get('unit_type', 'mass')
                dimension_map = {
                    "mass": {"mass": 1},
                    "volume": {"volume": 1},
                    "energy": {"energy": 1},
                    "money": {"money": 1},
                    "currency": {"money": 1},
                    "emissions": {"mass_co2e": 1},
                }
                u['dimension_vector'] = dimension_map.get(unit_type, {"mass": 1})
        
        # Get compound units from ce_compound_units
        compound = await db.ce_compound_units.find({}, {"_id": 0}).sort("key", 1).to_list(1000)
        
        # Transform compound units to have consistent structure with simple units
        for cu in compound:
            # Add 'symbol' field as alias for 'key' for frontend compatibility
            cu['symbol'] = cu.get('key')
            cu['name'] = cu.get('label', cu.get('key'))
        
        return {"simple": main_units, "compound": compound}

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

    @router.get("/calc-engine/property-source-mappings")
    async def list_property_source_mappings(current_user: dict = Depends(get_current_user)):
        """List all property source mappings that define where properties are read from."""
        mappings = await db.ce_property_source_mappings.find({}, {"_id": 0}).sort("property_key", 1).to_list(1000)
        return mappings

    @router.get("/calc-engine/fuel-allowed-units/{fuel_name}")
    async def get_fuel_allowed_units(
        fuel_name: str,
        current_user: dict = Depends(get_current_user),
    ):
        """Get allowed units for a specific fuel from fuel_database."""
        fuel = await db.fuel_database.find_one(
            {"$or": [
                {"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}},
                {"id": fuel_name}
            ]},
            {"_id": 0}
        )
        if not fuel:
            raise HTTPException(status_code=404, detail=f"Fuel '{fuel_name}' not found")
        
        allowed_units = fuel.get("allowed_units", [])
        default_unit = fuel.get("default_unit")
        
        unit_details = []
        for unit_key in allowed_units:
            # Check main units table
            unit = await db.units.find_one({"symbol": unit_key, "is_active": True}, {"_id": 0})
            if unit:
                # Add key/label aliases for compatibility
                unit["key"] = unit.get("symbol")
                unit["label"] = unit.get("name", unit.get("symbol"))
                unit_details.append(unit)
            else:
                # Check compound units
                compound = await db.ce_compound_units.find_one({"key": unit_key}, {"_id": 0})
                if compound:
                    unit_details.append(compound)
        
        return {
            "fuel_name": fuel.get("fuel_name"),
            "default_unit": default_unit,
            "allowed_units": allowed_units,
            "unit_details": unit_details,
        }

    @router.get("/calc-engine/unit-conversions")
    async def list_unit_conversions(
        from_unit: str = None,
        to_unit: str = None,
        dimension: str = None,
        current_user: dict = Depends(get_current_user),
    ):
        """List all unit conversions from DB. No hardcoded values."""
        query = {"is_active": True}
        if from_unit:
            query["from_unit"] = from_unit
        if to_unit:
            query["to_unit"] = to_unit
        if dimension:
            query["dimension"] = dimension
        
        conversions = await db.ce_unit_conversions.find(query, {"_id": 0}).to_list(10000)
        return conversions

    @router.get("/calc-engine/convert")
    async def convert_unit(
        value: float,
        from_unit: str,
        to_unit: str,
        fuel_name: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """Convert a value from one unit to another using DB-defined conversions.
        For property-based conversions (like L→kg via density), pass fuel_name to lookup the property.
        No fallback to hardcoded values - if conversion not defined, returns error.
        """
        if from_unit == to_unit:
            return {"value": value, "from_unit": from_unit, "to_unit": to_unit, "result": value, "factor": 1}
        
        # Look for direct conversion
        conversion = await db.ce_unit_conversions.find_one(
            {"from_unit": from_unit, "to_unit": to_unit, "is_active": True},
            {"_id": 0}
        )
        
        if conversion:
            conversion_type = conversion.get("conversion_type", "static")
            
            if conversion_type == "property_based":
                # Need to lookup property value from fuel
                property_key = conversion.get("property_key")
                if not fuel_name:
                    raise HTTPException(
                        status_code=400,
                        detail=f"This conversion requires fuel_name to lookup '{property_key}'"
                    )
                
                # Lookup fuel
                fuel = await db.fuel_database.find_one(
                    {"$or": [
                        {"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}},
                        {"id": fuel_name}
                    ]}, 
                    {"_id": 0}
                )
                if not fuel:
                    raise HTTPException(status_code=404, detail=f"Fuel '{fuel_name}' not found")
                
                property_value = fuel.get(property_key)
                if property_value is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Fuel '{fuel_name}' does not have property '{property_key}'"
                    )
                
                factor = float(property_value)
                result = value * factor
                return {
                    "value": value,
                    "from_unit": from_unit,
                    "to_unit": to_unit,
                    "result": result,
                    "factor": factor,
                    "method": "property_based",
                    "property_key": property_key,
                    "property_value": property_value,
                    "fuel_name": fuel_name,
                    "conversion_id": conversion["id"],
                    "defined_by": conversion.get("defined_by"),
                }
            else:
                # Static conversion
                result = value * conversion["factor"]
                return {
                    "value": value,
                    "from_unit": from_unit,
                    "to_unit": to_unit,
                    "result": result,
                    "factor": conversion["factor"],
                    "method": "static",
                    "conversion_id": conversion["id"],
                    "defined_by": conversion.get("defined_by"),
                }
        
        # Look for reverse conversion
        reverse = await db.ce_unit_conversions.find_one(
            {"from_unit": to_unit, "to_unit": from_unit, "is_active": True},
            {"_id": 0}
        )
        
        if reverse:
            conversion_type = reverse.get("conversion_type", "static")
            
            if conversion_type == "property_based":
                # Reverse of property-based - need to divide by property value
                property_key = reverse.get("property_key")
                if not fuel_name:
                    raise HTTPException(
                        status_code=400,
                        detail=f"This conversion requires fuel_name to lookup '{property_key}'"
                    )
                
                fuel = await db.fuel_database.find_one(
                    {"$or": [
                        {"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}},
                        {"id": fuel_name}
                    ]}, 
                    {"_id": 0}
                )
                if not fuel:
                    raise HTTPException(status_code=404, detail=f"Fuel '{fuel_name}' not found")
                
                property_value = fuel.get(property_key)
                if property_value is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Fuel '{fuel_name}' does not have property '{property_key}'"
                    )
                
                factor = 1 / float(property_value)
                result = value * factor
                return {
                    "value": value,
                    "from_unit": from_unit,
                    "to_unit": to_unit,
                    "result": result,
                    "factor": factor,
                    "method": "property_based_reverse",
                    "property_key": property_key,
                    "property_value": property_value,
                    "fuel_name": fuel_name,
                    "conversion_id": reverse["id"],
                    "reverse": True,
                    "defined_by": reverse.get("defined_by"),
                }
            else:
                # Static reverse
                factor = 1 / reverse["factor"]
                result = value * factor
                return {
                    "value": value,
                    "from_unit": from_unit,
                    "to_unit": to_unit,
                    "result": result,
                    "factor": factor,
                    "method": "static_reverse",
                    "conversion_id": reverse["id"],
                    "reverse": True,
                    "defined_by": reverse.get("defined_by"),
                }
        
        # Check for compound unit conversion (same derived dimension)
        # Look up compound units
        from_compound = await db.ce_compound_units.find_one({"key": from_unit}, {"_id": 0})
        to_compound = await db.ce_compound_units.find_one({"key": to_unit}, {"_id": 0})
        
        if from_compound and to_compound:
            # Both are compound units - check if same derived dimension
            from_dim = from_compound.get("derived_dimension_vector", {})
            to_dim = to_compound.get("derived_dimension_vector", {})
            
            if from_dim == to_dim:
                # Same dimension - compute factor from component unit conversions
                # For compound units like MJ/kg -> TJ/kg, we need:
                # - Convert numerator units (MJ -> TJ)
                # - Convert denominator units (kg -> kg)
                # Final factor = (numerator_factor) / (denominator_factor)
                
                from_components = from_compound.get("components", [])
                to_components = to_compound.get("components", [])
                
                # Build lookup for to_compound components by dimension contribution
                # We match components by their power sign (positive = numerator, negative = denominator)
                to_comp_map = {}
                for tc in to_components:
                    power = tc.get("power", 1)
                    key = f"{'pos' if power > 0 else 'neg'}_{abs(power)}"
                    to_comp_map[key] = tc
                
                # Calculate total conversion factor
                total_factor = 1.0
                component_conversions = []
                
                for fc in from_components:
                    from_unit_key = fc.get("unit_key")
                    power = fc.get("power", 1)
                    match_key = f"{'pos' if power > 0 else 'neg'}_{abs(power)}"
                    
                    # Find corresponding to_component
                    tc = to_comp_map.get(match_key)
                    if not tc:
                        # Try to find any component with matching power
                        for tcomp in to_components:
                            if tcomp.get("power") == power:
                                tc = tcomp
                                break
                    
                    if not tc:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot match component '{from_unit_key}' (power {power}) in target compound unit"
                        )
                    
                    to_unit_key = tc.get("unit_key")
                    
                    if from_unit_key == to_unit_key:
                        # Same unit, factor is 1
                        comp_factor = 1.0
                    else:
                        # Look up conversion between component units
                        conv = await db.ce_unit_conversions.find_one({
                            "from_unit": from_unit_key, 
                            "to_unit": to_unit_key
                        }, {"_id": 0})
                        
                        if conv:
                            comp_factor = conv.get("factor", 1.0)
                        else:
                            # Try reverse
                            rev_conv = await db.ce_unit_conversions.find_one({
                                "from_unit": to_unit_key, 
                                "to_unit": from_unit_key
                            }, {"_id": 0})
                            if rev_conv and rev_conv.get("factor"):
                                comp_factor = 1.0 / rev_conv.get("factor")
                            else:
                                raise HTTPException(
                                    status_code=404,
                                    detail=f"No conversion defined from '{from_unit_key}' to '{to_unit_key}' for compound unit conversion"
                                )
                    
                    # Apply power to factor (e.g., for kg^-1, we need factor^-1)
                    total_factor *= (comp_factor ** power)
                    component_conversions.append({
                        "from": from_unit_key,
                        "to": to_unit_key,
                        "factor": comp_factor,
                        "power": power
                    })
                
                result = value * total_factor
                return {
                    "value": value,
                    "from_unit": from_unit,
                    "to_unit": to_unit,
                    "result": result,
                    "factor": total_factor,
                    "method": "compound_same_dimension",
                    "component_conversions": component_conversions,
                }
        
        # No conversion found - error, no silent assumptions
        raise HTTPException(
            status_code=404,
            detail=f"No conversion defined from '{from_unit}' to '{to_unit}'. SuperAdmin must define this conversion."
        )

    # --- User-accessible Execute Endpoints (for Emissions UI) ---
    
    @router.post("/calc-engine/execute-by-category")
    async def user_execute_by_category(
        req: ExecuteByCategoryRequest,
        current_user: dict = Depends(get_current_user),
    ):
        """
        Execute calculation via decision tree OR direct formula lookup.
        This endpoint is used by the Emissions UI to calculate emissions.
        
        Flow:
        1. Try to find a decision tree for the category
        2. If decision tree exists, resolve formula via the tree
        3. If NO decision tree, fall back to direct formula lookup by category_id
        4. If scope3_ef_id is provided, enrich context with activity data for EF lookup
        """
        # DEBUG: Log incoming request for fugitive emissions debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[FUGITIVE DEBUG - Backend] execute-by-category called with:")
        logger.info(f"  category_id: {req.category_id}")
        logger.info(f"  scope3_ef_id: {req.scope3_ef_id}")
        logger.info(f"  context.fuel_name: {req.context.get('fuel_name')}")
        logger.info(f"  context.scope3_ef_id: {req.context.get('scope3_ef_id')}")
        logger.info(f"  decision_inputs: {req.decision_inputs}")
        logger.info(f"  inputs: {req.inputs}")
        
        # If scope3_ef_id provided, look up the activity and enrich context
        enriched_context = dict(req.context)
        if req.scope3_ef_id:
            # First try scope3_ef collection
            scope3_ef_record = await db.scope3_ef.find_one(
                {"id": req.scope3_ef_id}, {"_id": 0}
            )
            logger.info(f"[FUGITIVE DEBUG - Backend] scope3_ef lookup result: {scope3_ef_record is not None}")
            
            if scope3_ef_record:
                # Add activity details to context for property resolution
                enriched_context["fuel_name"] = scope3_ef_record.get("activity")
                enriched_context["activity"] = scope3_ef_record.get("activity")
                enriched_context["activity_type"] = scope3_ef_record.get("activity_type")
                enriched_context["scope3_ef_id"] = req.scope3_ef_id
                # Also include category if available
                if scope3_ef_record.get("category"):
                    enriched_context["category"] = scope3_ef_record.get("category")
            else:
                # Fallback to fuel_database for fugitive emissions
                # Fugitive emissions activities are stored in fuel_database with gwp_fugitives
                fuel_db_record = await db.fuel_database.find_one(
                    {"id": req.scope3_ef_id}, {"_id": 0}
                )
                logger.info(f"[FUGITIVE DEBUG - Backend] fuel_database lookup result: {fuel_db_record is not None}")
                if fuel_db_record:
                    logger.info(f"[FUGITIVE DEBUG - Backend] fuel_db_record: fuel_name={fuel_db_record.get('fuel_name')}, gwp_fugitives={fuel_db_record.get('gwp_fugitives')}")
                
                if fuel_db_record:
                    # Add fuel database details to context for fugitive emissions
                    enriched_context["fuel_name"] = fuel_db_record.get("fuel_name")
                    enriched_context["activity"] = fuel_db_record.get("fuel_name")
                    enriched_context["scope3_ef_id"] = req.scope3_ef_id
                    enriched_context["source"] = "fuel_database"
                    # Include GWP for fugitive emissions - the formula expects 'co2_gwp_fugitives'
                    if fuel_db_record.get("gwp_fugitives"):
                        gwp_value = fuel_db_record.get("gwp_fugitives")
                        enriched_context["gwp_fugitives"] = gwp_value
                        enriched_context["co2_gwp_fugitives"] = gwp_value  # Formula property name
                        enriched_context["emission_factor"] = gwp_value
        
        logger.info(f"[FUGITIVE DEBUG - Backend] enriched_context.fuel_name: {enriched_context.get('fuel_name')}")
        logger.info(f"[FUGITIVE DEBUG - Backend] enriched_context.co2_gwp_fugitives: {enriched_context.get('co2_gwp_fugitives')}")
        
        tree = await get_decision_tree_for_category(db, req.category_id)
        formula_id = None
        tree_path = []
        
        logger.info(f"[FUGITIVE DEBUG - Backend] decision tree found: {tree is not None}")
        
        if tree:
            # Decision tree exists - resolve formula via tree traversal
            try:
                formula_id, tree_path = resolve_formula_id(tree["tree"], req.decision_inputs)
                logger.info(f"[FUGITIVE DEBUG - Backend] formula_id from tree: {formula_id}, tree_path: {tree_path}")
            except DecisionTreeError as e:
                raise HTTPException(status_code=400, detail=str(e))

            if not formula_id:
                raise HTTPException(status_code=400, detail="Decision tree did not resolve to a formula")
        else:
            # No decision tree - look up formula directly by category_id
            formula_doc = await db.ce_formulas.find_one(
                {"category_id": req.category_id, "is_active": True}, {"_id": 0},
            )
            logger.info(f"[FUGITIVE DEBUG - Backend] direct formula lookup found: {formula_doc is not None}")
            if formula_doc:
                formula_id = formula_doc["id"]
            else:
                logger.error(f"[FUGITIVE DEBUG - Backend] No decision tree or formula for category: {req.category_id}")
                raise HTTPException(
                    status_code=404,
                    detail=f"No decision tree or formula configured for category {req.category_id}",
                )

        formula_doc = await db.ce_formulas.find_one(
            {"id": formula_id, "is_active": True}, {"_id": 0},
        )
        if not formula_doc:
            raise HTTPException(status_code=404,
                                detail=f"Formula '{formula_id}' not found or inactive")
        definition = dict(formula_doc["definition"])
        definition.setdefault("id", formula_doc["id"])
        definition.setdefault("version_id", formula_doc.get("version_id"))

        # Merge any fugitive emissions properties from enriched_context into user_overrides
        # so the property resolver can find them
        merged_user_overrides = dict(req.user_overrides)
        if enriched_context.get("co2_gwp_fugitives"):
            merged_user_overrides["co2_gwp_fugitives"] = {
                "value": enriched_context["co2_gwp_fugitives"],
                "unit": "kgCO2e/kg"
            }
        
        # For spend_basis formulas, resolve inflation_rate and ppp from currency_conversion table
        # if not provided in user_overrides
        if req.decision_inputs.get("calculation_method_scope3") == "spend_basis":
            # Get the currency from inputs (e.g., spent_value.unit = "INR")
            input_currency = None
            for input_key, input_val in req.inputs.items():
                if isinstance(input_val, dict) and input_val.get("unit"):
                    unit = input_val.get("unit", "").upper()
                    if unit in ["INR", "USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD"]:
                        input_currency = unit
                        break
            
            # Fetch currency conversion data if we have a currency
            if input_currency and input_currency != "USD":
                currency_conversion = await db.currency_conversion.find_one(
                    {"source_currency": input_currency, "is_active": True}, {"_id": 0}
                )
                logger.info(f"[SPEND BASIS] Currency conversion lookup for {input_currency}: {currency_conversion is not None}")
                if currency_conversion:
                    logger.info(f"[SPEND BASIS] Found: ppp={currency_conversion.get('purchase_parity')}, inflation={currency_conversion.get('inflation_factor')}")
                
                # Get the source from currency_conversion record
                currency_source = currency_conversion.get("source") if currency_conversion else "Default"
                
                # Add inflation_rate if not in user_overrides
                if "inflation_rate" not in merged_user_overrides:
                    if currency_conversion and currency_conversion.get("inflation_factor"):
                        merged_user_overrides["inflation_rate"] = {
                            "value": float(currency_conversion.get("inflation_factor")),
                            "unit": "",
                            "source_name": currency_source
                        }
                    else:
                        # Default to 1.0
                        merged_user_overrides["inflation_rate"] = {"value": 1.0, "unit": "", "source_name": "Default"}
                
                # Add ppp if not in user_overrides
                if "ppp" not in merged_user_overrides:
                    if currency_conversion and currency_conversion.get("purchase_parity"):
                        merged_user_overrides["ppp"] = {
                            "value": float(currency_conversion.get("purchase_parity")),
                            "unit": "",
                            "source_name": currency_source
                        }
                    else:
                        # Default to 1.0
                        merged_user_overrides["ppp"] = {"value": 1.0, "unit": "", "source_name": "Default"}
            else:
                # USD or no currency - use defaults of 1.0
                if "inflation_rate" not in merged_user_overrides:
                    merged_user_overrides["inflation_rate"] = {"value": 1.0, "unit": "", "source_name": "Default (USD)"}
                if "ppp" not in merged_user_overrides:
                    merged_user_overrides["ppp"] = {"value": 1.0, "unit": "", "source_name": "Default (USD)"}

        try:
            result = await engine.execute(
                formula=definition, inputs=req.inputs, context=enriched_context,
                user_overrides=merged_user_overrides, dry_run=req.dry_run,
                emission_record_id=req.emission_record_id,
                org_id=req.org_id,
            )
        except (FormulaDefinitionError, CalculationError, ValueError) as e:
            logger.error(f"[CALC ERROR] Calculation failed: {str(e)}")
            logger.error(f"[CALC ERROR] Formula: {formula_id}, Inputs: {req.inputs}")
            raise HTTPException(status_code=400, detail=str(e))

        return {
            "ok": True,
            "resolved_formula": {"id": formula_id, "name": formula_doc.get("name"),
                                  "version_id": formula_doc.get("version_id")},
            "decision_path": tree_path,
            **result,
        }

    @router.get("/calc-engine/form-config/{category_id}")
    async def get_form_config_for_category(
        category_id: str,
        scope: str = None,
        current_user: dict = Depends(get_current_user),
    ):
        """
        Get the dynamic form configuration for a given category.
        Returns:
        - The decision tree (if any) for the category
        - The formula(s) that could be applied
        - The required input fields and their mappings
        - The applicable fuels for this scope+category
        
        This allows the frontend to dynamically render the correct input fields
        based on what the formula actually needs.
        """
        # 1. Get the decision tree for this category
        tree = await get_decision_tree_for_category(db, category_id)
        
        # 2. Get the category details
        category_doc = await db.emission_categories.find_one(
            {"id": category_id, "is_active": True}, {"_id": 0}
        )
        
        # 3. Determine which formula(s) are applicable
        formulas_info = []
        decision_fields = []
        
        if tree:
            # Extract all possible formulas from the decision tree
            formula_ids = extract_formula_ids_from_tree(tree.get("tree", {}))
            
            # Also extract decision fields (what the user needs to answer to traverse the tree)
            decision_fields = extract_decision_fields_from_tree(tree.get("tree", {}))
            
            for fid in formula_ids:
                formula_doc = await db.ce_formulas.find_one(
                    {"id": fid, "is_active": True}, {"_id": 0}
                )
                if formula_doc:
                    formulas_info.append({
                        "id": formula_doc["id"],
                        "name": formula_doc.get("name"),
                        "inputs": formula_doc.get("definition", {}).get("inputs", []),
                        "outputs": formula_doc.get("definition", {}).get("outputs", []),
                        "properties": formula_doc.get("definition", {}).get("properties", []),
                    })
        else:
            # No decision tree - find formulas directly linked to this category
            # Check both category_id (singular) and category_ids (plural array)
            formulas = await db.ce_formulas.find(
                {
                    "is_active": True,
                    "$or": [
                        {"category_id": category_id},
                        {"category_ids": category_id}
                    ]
                }, 
                {"_id": 0}
            ).to_list(20)
            
            for formula_doc in formulas:
                formulas_info.append({
                    "id": formula_doc["id"],
                    "name": formula_doc.get("name"),
                    "inputs": formula_doc.get("definition", {}).get("inputs", []),
                    "outputs": formula_doc.get("definition", {}).get("outputs", []),
                    "properties": formula_doc.get("definition", {}).get("properties", []),
                })
        
        # 4. Collect all unique input variables needed across all possible formulas
        all_input_vars = set()
        all_property_keys = set()
        for f in formulas_info:
            for inp in f.get("inputs", []):
                all_input_vars.add(inp.get("variable"))
            for prop in f.get("properties", []):
                if prop.get("key"):
                    all_property_keys.add(prop.get("key"))
        
        # 5. Get input field mappings - include both formula input variables AND override fields
        # This mirrors how the Sandbox works - loads all applicable mappings for the scope+category
        
        # Get scope ID for filtering
        scope_doc = await db.emission_scopes.find_one({"code": scope}, {"_id": 0}) if scope else None
        scope_id = scope_doc.get("id") if scope_doc else None
        
        # Build query to get:
        # a) Mappings for formula input variables
        # b) Override mappings (is_override=true) that apply to this category+scope
        mapping_query = {
            "is_active": True,
            "$or": [
                # Formula input variables
                {"maps_to_variable": {"$in": list(all_input_vars)}},
                # Override fields that apply to this category and scope
                {
                    "is_override": True,
                    "$and": [
                        {"$or": [
                            {"applies_to_categories": {"$size": 0}},
                            {"applies_to_categories": {"$exists": False}},
                            {"applies_to_categories": category_id}
                        ]},
                        {"$or": [
                            {"applies_to_scopes": {"$size": 0}},
                            {"applies_to_scopes": {"$exists": False}},
                            {"applies_to_scopes": scope_id} if scope_id else {"applies_to_scopes": {"$exists": True}}
                        ]}
                    ]
                }
            ]
        }
        
        input_mappings = await db.ce_input_field_mappings.find(
            mapping_query,
            {"_id": 0}
        ).sort("display_order", 1).to_list(100)
        
        # 6. Get applicable fuels for this scope+category
        # All active fuels are applicable unless they have specific scope restrictions
        # Fuels without is_active field are considered active
        fuel_query = {"$or": [
            {"is_active": True},
            {"is_active": {"$exists": False}},
            {"is_active": None}
        ]}
        fuels = await db.fuel_database.find(fuel_query, {"_id": 0}).to_list(500)
        
        # Filter fuels by scope if specified (only if fuel has allowed_scopes field)
        if scope:
            filtered_fuels = []
            for fuel in fuels:
                allowed_scopes = fuel.get("allowed_scopes")
                # Include fuel if: no restrictions, empty restrictions, or scope is in allowed list
                if allowed_scopes is None or len(allowed_scopes) == 0 or scope in allowed_scopes:
                    filtered_fuels.append(fuel)
            fuels = filtered_fuels
        
        # 7. Get variables metadata
        var_keys = list(all_input_vars)
        variables = await db.ce_variables.find(
            {"key": {"$in": var_keys}}, {"_id": 0}
        ).to_list(100)
        
        return {
            "category_id": category_id,
            "category": category_doc,
            "has_decision_tree": tree is not None,
            "decision_tree_id": tree.get("id") if tree else None,
            "decision_tree": tree.get("tree") if tree else None,  # Include actual tree structure
            "decision_fields": decision_fields,  # Fields user must answer to traverse tree
            "formulas": formulas_info,
            "required_input_variables": list(all_input_vars),
            "required_properties": list(all_property_keys),
            "input_field_mappings": input_mappings,
            "variables": variables,
            "applicable_fuels": fuels,
        }

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
        doc.pop("_id", None)
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
            "is_overridable": payload.is_overridable if payload.type == "property" else None,
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
        doc.pop("_id", None)
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

    # --- Unit Conversions CRUD (DB-driven, no hardcoding) ---
    # Note: Simple units are managed in the Units module (/units endpoint)
    # ce_units table has been deprecated - all simple units come from 'units' table

    @router.post("/super-admin/calc-engine/unit-conversions")
    async def create_unit_conversion(
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Create a unit conversion. This is the ONLY place conversions are defined - no hardcoding."""
        from_unit = payload.get("from_unit")
        to_unit = payload.get("to_unit")
        factor = payload.get("factor")
        conversion_type = payload.get("conversion_type", "static")  # 'static' or 'property_based'
        property_key = payload.get("property_key")  # For property-based conversions
        
        if not from_unit or not to_unit:
            raise HTTPException(status_code=400, detail="from_unit and to_unit are required")
        if conversion_type == "static" and factor is None:
            raise HTTPException(status_code=400, detail="factor is required for static conversions")
        if conversion_type == "property_based" and not property_key:
            raise HTTPException(status_code=400, detail="property_key is required for property-based conversions")
        if from_unit == to_unit:
            raise HTTPException(status_code=400, detail="from_unit and to_unit must be different")
        
        # Validate units exist in main units table
        from_u = await db.units.find_one({"symbol": from_unit, "is_active": True}, {"_id": 0})
        to_u = await db.units.find_one({"symbol": to_unit, "is_active": True}, {"_id": 0})
        
        if not from_u:
            raise HTTPException(status_code=400, detail=f"Unit '{from_unit}' does not exist. Add it in the Units module first.")
        if not to_u:
            raise HTTPException(status_code=400, detail=f"Unit '{to_unit}' does not exist. Add it in the Units module first.")
        
        # For property-based conversions, validate property exists in variables
        if conversion_type == "property_based":
            prop_var = await db.ce_variables.find_one({"key": property_key, "type": "property"}, {"_id": 0})
            if not prop_var:
                raise HTTPException(status_code=400, detail=f"Property '{property_key}' not found in Variable Registry")
        
        # Get dimensions (handle both units table with unit_type and ce_units with dimension_vector)
        def get_dimension(unit_doc):
            if unit_doc.get("dimension_vector"):
                dims = list(unit_doc["dimension_vector"].keys())
                return dims[0] if dims else None
            elif unit_doc.get("unit_type"):
                return unit_doc["unit_type"]
            return None
        
        from_dim = get_dimension(from_u)
        to_dim = get_dimension(to_u)
        
        # Check if conversion already exists
        existing = await db.ce_unit_conversions.find_one(
            {"from_unit": from_unit, "to_unit": to_unit},
            {"_id": 0}
        )
        if existing:
            raise HTTPException(status_code=400, detail=f"Conversion from '{from_unit}' to '{to_unit}' already exists")
        
        doc = {
            "id": str(uuid.uuid4()),
            "from_unit": from_unit,
            "to_unit": to_unit,
            "conversion_type": conversion_type,
            "factor": float(factor) if factor is not None else None,
            "property_key": property_key if conversion_type == "property_based" else None,
            "dimension": from_dim or to_dim or "unknown",
            "description": payload.get("description", ""),
            "defined_by": current_user.get("email", "superadmin"),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_unit_conversions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/super-admin/calc-engine/unit-conversions/{conversion_id}")
    async def update_unit_conversion(
        conversion_id: str,
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Update a unit conversion."""
        conversion = await db.ce_unit_conversions.find_one({"id": conversion_id}, {"_id": 0})
        if not conversion:
            raise HTTPException(status_code=404, detail="Conversion not found")
        
        updates = {}
        if "conversion_type" in payload:
            updates["conversion_type"] = payload["conversion_type"]
        if "factor" in payload:
            updates["factor"] = float(payload["factor"]) if payload["factor"] is not None else None
        if "property_key" in payload:
            updates["property_key"] = payload["property_key"]
        if "description" in payload:
            updates["description"] = payload["description"]
        if "is_active" in payload:
            updates["is_active"] = payload["is_active"]
        
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        updates["updated_by"] = current_user.get("email", "superadmin")
        
        await db.ce_unit_conversions.update_one({"id": conversion_id}, {"$set": updates})
        return await db.ce_unit_conversions.find_one({"id": conversion_id}, {"_id": 0})

    @router.delete("/super-admin/calc-engine/unit-conversions/{conversion_id}")
    async def delete_unit_conversion(
        conversion_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Delete a unit conversion."""
        conversion = await db.ce_unit_conversions.find_one({"id": conversion_id}, {"_id": 0})
        if not conversion:
            raise HTTPException(status_code=404, detail="Conversion not found")
        
        await db.ce_unit_conversions.delete_one({"id": conversion_id})
        return {"message": f"Conversion from '{conversion['from_unit']}' to '{conversion['to_unit']}' deleted"}

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
            dv, _ = await _resolve_compound(db, components)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        doc = {
            "id": str(uuid.uuid4()),
            "key": key,
            "label": payload.get("label", key),
            "components": components,
            "derived_dimension_vector": dv,
            "is_system": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_compound_units.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/super-admin/calc-engine/compound-units/{unit_id}")
    async def update_compound_unit(
        unit_id: str,
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Update a compound unit's label and components."""
        from .units import _resolve_compound
        unit = await db.ce_compound_units.find_one({"id": unit_id}, {"_id": 0})
        if not unit:
            raise HTTPException(status_code=404, detail="Compound unit not found")
        
        components = payload.get("components", unit.get("components", []))
        if not components:
            raise HTTPException(status_code=400, detail="Components are required")
        
        try:
            dv, _ = await _resolve_compound(db, components)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        updates = {
            "label": payload.get("label", unit["label"]),
            "components": components,
            "derived_dimension_vector": dv,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_compound_units.update_one({"id": unit_id}, {"$set": updates})
        return await db.ce_compound_units.find_one({"id": unit_id}, {"_id": 0})

    @router.delete("/super-admin/calc-engine/compound-units/{unit_id}")
    async def delete_compound_unit(
        unit_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Delete a compound unit."""
        unit = await db.ce_compound_units.find_one({"id": unit_id}, {"_id": 0})
        if not unit:
            raise HTTPException(status_code=404, detail="Compound unit not found")
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
            "maps_to_context_value_when_filled": payload.get("maps_to_context_value_when_filled", "true"),  # Value when field has input
            "maps_to_context_value_when_empty": payload.get("maps_to_context_value_when_empty", "false"),  # Value when field is empty
            "default_unit": payload.get("default_unit"),
            "allowed_units": payload.get("allowed_units", []),
            "is_required": payload.get("is_required", False),
            "is_override": payload.get("is_override", False),  # Whether this is an override field
            "options": payload.get("options", []),  # For select field_type: [{value, label}, ...]
            "display_order": payload.get("display_order", 0),
            "applies_to_categories": payload.get("applies_to_categories", []),  # Empty = all
            "applies_to_scopes": payload.get("applies_to_scopes", []),  # Empty = all
            "placeholder": payload.get("placeholder"),
            "help_text": payload.get("help_text"),
            "unit_source": payload.get("unit_source", "static"),  # 'static' or 'fuel'
            "validation_rules": payload.get("validation_rules", {}),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_input_field_mappings.insert_one(doc)
        doc.pop("_id", None)
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

    # --- Property Source Mappings CRUD ---

    @router.post("/super-admin/calc-engine/property-source-mappings")
    async def create_property_source_mapping(
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Create a property source mapping that defines where a property value is read from."""
        property_key = payload.get("property_key")
        if not property_key:
            raise HTTPException(status_code=400, detail="property_key is required")
        
        existing = await db.ce_property_source_mappings.find_one({"property_key": property_key}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail=f"Mapping for '{property_key}' already exists")
        
        source_table = payload.get("source_table")
        if source_table not in ["fuel_database", "gwp_config", "units", "custom", "scope3_ef", "currency_conversion"]:
            raise HTTPException(status_code=400, detail="source_table must be fuel_database, gwp_config, units, scope3_ef, currency_conversion, or custom")
        
        # Validate conditions if provided
        conditions = payload.get("conditions") or []
        for i, cond in enumerate(conditions):
            if not cond.get("field"):
                raise HTTPException(status_code=400, detail=f"Condition {i+1}: field is required")
            if cond.get("operator") not in [None, "equals", "not_equals", "greater_than", "greater_than_or_equals", 
                                             "less_than", "less_than_or_equals", "in", "contains", "exists"]:
                raise HTTPException(status_code=400, detail=f"Condition {i+1}: invalid operator")
        
        doc = {
            "id": str(uuid.uuid4()),
            "property_key": property_key,
            "description": payload.get("description", ""),
            "source_table": source_table,
            "source_field": payload.get("source_field"),  # e.g., "calorific_value", "emission_factor_co2"
            "source_unit_field": payload.get("source_unit_field"),  # e.g., "calorific_value_unit"
            "lookup_context_key": payload.get("lookup_context_key"),  # e.g., "fuel_code" - what context key to use for lookup
            "lookup_table_field": payload.get("lookup_table_field"),  # e.g., "fuel_code" - what field in the table to match
            "filter_field": payload.get("filter_field"),  # Legacy: For gwp_config: "gas_type"
            "filter_value": payload.get("filter_value"),  # Legacy: For gwp_config: "CH4" or "N2O"
            "conditions": conditions,  # NEW: SuperAdmin-configurable conditions
            "sort_by": payload.get("sort_by"),  # NEW: Field to sort results by (e.g., "year_applicable")
            "sort_order": payload.get("sort_order", "desc"),  # NEW: "asc" or "desc"
            "fallback_behavior": payload.get("fallback_behavior", "use_default"),  # NEW: What to do if no match
            "default_value": payload.get("default_value"),  # Fallback if not found
            "default_unit": payload.get("default_unit"),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ce_property_source_mappings.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/super-admin/calc-engine/property-source-mappings/{mapping_id}")
    async def update_property_source_mapping(
        mapping_id: str,
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Update a property source mapping."""
        mapping = await db.ce_property_source_mappings.find_one({"id": mapping_id}, {"_id": 0})
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        
        updates = {k: v for k, v in payload.items() if k not in ["id", "created_at"]}
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.ce_property_source_mappings.update_one({"id": mapping_id}, {"$set": updates})
        return await db.ce_property_source_mappings.find_one({"id": mapping_id}, {"_id": 0})

    @router.delete("/super-admin/calc-engine/property-source-mappings/{mapping_id}")
    async def delete_property_source_mapping(
        mapping_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Delete a property source mapping."""
        mapping = await db.ce_property_source_mappings.find_one({"id": mapping_id}, {"_id": 0})
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        await db.ce_property_source_mappings.delete_one({"id": mapping_id})
        return {"message": f"Mapping for '{mapping['property_key']}' deleted"}

    @router.post("/super-admin/calc-engine/resolve-property")
    async def resolve_property_value(
        payload: Dict[str, Any],
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Test resolving a property value using the source mappings."""
        property_key = payload.get("property_key")
        context = payload.get("context", {})
        
        mapping = await db.ce_property_source_mappings.find_one(
            {"property_key": property_key, "is_active": True}, {"_id": 0}
        )
        if not mapping:
            raise HTTPException(status_code=404, detail=f"No source mapping for '{property_key}'")
        
        value = None
        unit = mapping.get("default_unit")
        source_info = {"mapping": mapping, "resolved_from": None}
        
        if mapping["source_table"] == "fuel_database":
            lookup_key = mapping.get("lookup_context_key", "fuel_code")
            lookup_value = context.get(lookup_key)
            if lookup_value:
                table_field = mapping.get("lookup_table_field", "fuel_code")
                fuel = await db.fuel_database.find_one({table_field: lookup_value}, {"_id": 0})
                if fuel:
                    value = fuel.get(mapping["source_field"])
                    if mapping.get("source_unit_field"):
                        unit = fuel.get(mapping["source_unit_field"]) or unit
                    source_info["resolved_from"] = f"fuel_database.{mapping['source_field']} where {table_field}={lookup_value}"
        
        elif mapping["source_table"] == "gwp_config":
            gwp = await db.gwp_config.find_one({"is_active": True}, {"_id": 0})
            if gwp:
                filter_field = mapping.get("filter_field")
                filter_value = mapping.get("filter_value")
                if filter_field and filter_value:
                    # GWP values stored as gwp_values array with gas_type
                    for gv in gwp.get("gwp_values", []):
                        if gv.get(filter_field) == filter_value:
                            value = gv.get(mapping["source_field"])
                            source_info["resolved_from"] = f"gwp_config.gwp_values where {filter_field}={filter_value}"
                            break
                else:
                    value = gwp.get(mapping["source_field"])
                    source_info["resolved_from"] = f"gwp_config.{mapping['source_field']}"
        
        elif mapping["source_table"] == "currency_conversion":
            # Build query based on filter
            query = {"is_active": True}
            filter_field = mapping.get("filter_field")
            filter_value = mapping.get("filter_value")
            
            # Dynamic fiscal year derivation for year_applicable filter
            derived_year = None
            if filter_field == "year_applicable":
                # Check if context has reporting_period to derive fiscal year
                reporting_period = context.get("reporting_period")  # Format: "YYYY-MM" or "YYYY-MM-DD"
                reporting_period_start = context.get("reporting_period_start")  # Alternative: explicit start date
                
                if reporting_period or reporting_period_start:
                    try:
                        # Parse the reporting period to get year and month
                        period_str = reporting_period or reporting_period_start
                        if isinstance(period_str, str):
                            parts = period_str.split("-")
                            year = int(parts[0])
                            month = int(parts[1]) if len(parts) > 1 else 1
                            
                            # Fiscal year logic: April (month >= 4) starts new fiscal year
                            # April 2025 - March 2026 → FY 2025 (year_applicable = 2025)
                            # January 2026 - March 2026 → still FY 2025 (year_applicable = 2025)
                            if month >= 4:  # April onwards = current year's fiscal year
                                derived_year = year
                            else:  # Jan-March = previous year's fiscal year
                                derived_year = year - 1
                            
                            query["year_applicable"] = derived_year
                            source_info["fiscal_year_derived"] = True
                            source_info["derived_from_period"] = period_str
                    except (ValueError, IndexError) as e:
                        # If parsing fails, fall back to static filter_value
                        pass
                
                # If no derived year, use static filter_value
                if derived_year is None and filter_value:
                    try:
                        query["year_applicable"] = int(filter_value)
                    except:
                        query["year_applicable"] = filter_value
            
            elif filter_field == "is_active":
                query[filter_field] = filter_value.lower() == "true" if filter_value else True
            elif filter_field and filter_value:
                query[filter_field] = filter_value.upper() if filter_field.endswith("_currency") else filter_value
            
            currency_config = await db.currency_conversion.find_one(query, {"_id": 0})
            if currency_config:
                value = currency_config.get(mapping["source_field"])
                if derived_year is not None:
                    filter_desc = f" where year_applicable={derived_year} (derived from fiscal year)"
                elif filter_field:
                    filter_desc = f" where {filter_field}={filter_value}"
                else:
                    filter_desc = ""
                source_info["resolved_from"] = f"currency_conversion.{mapping['source_field']}{filter_desc}"
        
        if value is None and mapping.get("default_value") is not None:
            value = mapping["default_value"]
            source_info["resolved_from"] = "default_value"
        
        return {
            "property_key": property_key,
            "value": value,
            "unit": unit,
            "context": context,
            "source_info": source_info,
        }

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
            scope_ids=payload.scope_ids,
            category_ids=payload.category_ids,
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
                scope_ids=payload.scope_ids,
                category_ids=payload.category_ids,
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

    # ----------------------------------------------------------------
    # GET AUDIT LOG BY EMISSION RECORD ID
    # Used by Edit Emission dialog to populate dynamic fields
    # ----------------------------------------------------------------
    @router.get("/user/calc-engine/audit-log/{emission_record_id}")
    async def get_audit_log_by_emission(
        emission_record_id: str,
        current_user: dict = Depends(get_current_user),
    ):
        """
        Fetch the calculation audit log for a specific emission record.
        Returns the most recent audit log entry for the given emission_record_id.
        """
        audit_doc = await db.ce_calculation_audit_logs.find_one(
            {"emission_record_id": emission_record_id},
            {"_id": 0},
            sort=[("created_at", -1)]  # Get most recent
        )
        
        if not audit_doc:
            # Return empty audit log if none found (legacy emissions)
            return {
                "emission_record_id": emission_record_id,
                "audit_log": [],
                "found": False
            }
        
        return {
            "emission_record_id": emission_record_id,
            "formula_id": audit_doc.get("formula_id"),
            "inputs": audit_doc.get("inputs", {}),
            "context": audit_doc.get("context", {}),
            "outputs": audit_doc.get("outputs", {}),
            "audit_log": audit_doc.get("audit_log", []),
            "created_at": audit_doc.get("created_at"),
            "found": True
        }

    return router
