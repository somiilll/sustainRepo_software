"""Server-side conversion of a reviewed OCR row into one canonical GHG record."""
from __future__ import annotations

from typing import Any

from calc_engine.currency_conversion import (
    PPP_INFLATION_METHOD,
    STANDARD_METHOD,
    currency_conversion_source_name,
    normalize_currency_method,
    resolve_currency_conversion,
)
from calc_engine.execution import CalcEngine, CalculationError, FormulaDefinitionError
from calc_engine.formulas import DecisionTreeError, resolve_formula_id
from calc_engine.versioning import (
    CalculationVersionError,
    formula_snapshot,
    get_decision_tree_for_execution,
    resolve_formula_version_for_tree,
)


SCOPE3_METHODS = {
    "activity": "activity_basis",
    "activity_basis": "activity_basis",
    "spend": "spend_basis",
    "spend_basis": "spend_basis",
    "supplier": "supplier_basis",
    "supplier_basis": "supplier_basis",
}
MASS_UNITS = {"g", "gram", "grams", "kg", "kilogram", "kilograms", "t", "tonne", "tonnes", "metricton", "metrictons", "lb", "lbs", "pound", "pounds"}
VOLUME_UNITS = {"ml", "millilitre", "millilitres", "l", "litre", "litres", "liter", "liters", "kl", "kilolitre", "kilolitres", "kiloliter", "kiloliters", "m3", "m³", "gallon", "gallons", "gal"}
STANDARD_COMBUSTION_CATEGORY_KEYS = {"stationarycombustion", "mobilecombustion"}


def scope3_method(value: Any) -> str | None:
    return SCOPE3_METHODS.get(str(value or "").strip().lower())


def _number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def quantity_basis(unit: Any) -> str:
    normalized = str(unit or "").strip().lower().replace(" ", "")
    if normalized in MASS_UNITS:
        return "mass"
    if normalized in VOLUME_UNITS:
        return "volume"
    raise ValueError("The extracted quantity unit must be a recognized mass or volume unit for Stationary or Mobile Combustion.")


def is_standard_combustion_category(values: dict, category: dict) -> bool:
    category_values = (
        category.get("code"),
        category.get("name"),
        category.get("category"),
        values.get("category_code"),
        values.get("category"),
    )
    return any(
        "".join(character for character in str(value or "").lower() if character.isalnum())
        in STANDARD_COMBUSTION_CATEGORY_KEYS
        for value in category_values
    )


async def resolve_ghg_category(db, values: dict) -> dict:
    category_id = values.get("category_id") or values.get("ghg_category_id")
    if category_id:
        category = await db.emission_categories.find_one({"id": category_id, "is_active": {"$ne": False}}, {"_id": 0})
        if category:
            return category
    category_name = str(values.get("category") or "").strip()
    if not category_name:
        raise ValueError("Select a GHG category before saving this row.")
    candidates = await db.emission_categories.find(
        {"is_active": {"$ne": False}, "$or": [
            {"name": category_name},
            {"category": category_name},
            {"display_name": category_name},
        ]},
        {"_id": 0},
    ).to_list(20)
    scope = values.get("scope")
    matching_scope = [candidate for candidate in candidates if candidate.get("scope") in (None, "", scope)]
    category = (matching_scope or candidates or [None])[0]
    if not category:
        raise ValueError(f"No active GHG category matches '{category_name}'.")
    return category


def build_decision_inputs(values: dict, category: dict) -> dict:
    decisions = dict(values.get("decision_inputs") or {})
    scope = values.get("scope")
    if scope == "scope3":
        method = scope3_method(values.get("ef_method") or values.get("calculation_method_scope3"))
        if not method:
            raise ValueError("Select a Scope 3 calculation method before saving this row.")
        decisions["calculation_method_scope3"] = method
        if values.get("scope3_activity_type"):
            decisions["activity_type"] = values["scope3_activity_type"]
        if values.get("scope3_subcategory"):
            decisions["scope3_subcategory"] = values["scope3_subcategory"]
        if method == "spend_basis":
            decisions["spend_currency_conversion_method"] = normalize_currency_method(
                values.get("spend_currency_conversion_method")
            )
    elif scope == "scope1":
        if is_standard_combustion_category(values, category):
            decisions["calculation_methodology"] = "using_heat_basis_ncv"
        else:
            decisions["calculation_methodology"] = values.get("calculation_methodology") or "using_qty_basis_ef"
        if decisions["calculation_methodology"] in {"using_qty_basis_ef", "using_heat_basis_ncv"}:
            basis_key = "ef_quantity_basis" if decisions["calculation_methodology"] == "using_qty_basis_ef" else "cv_quantity_basis"
            decisions[basis_key] = values.get(basis_key) or quantity_basis(values.get("unit"))
    if values.get("type_of_product"):
        decisions["type_of_product"] = values["type_of_product"]
    if category.get("code"):
        decisions.setdefault("category_code", category["code"])
    return decisions


def build_formula_inputs(formula: dict, values: dict) -> dict:
    quantity = _number(values.get("quantity"))
    cost = _number(values.get("cost"))
    distance = _number(values.get("distance_km"))
    inputs: dict[str, dict] = {}
    for declaration in formula.get("definition", {}).get("inputs", []):
        variable = declaration.get("variable")
        if not variable:
            continue
        lowered = variable.lower()
        payload = None
        if "spent" in lowered or "cost" in lowered or "monetary" in lowered:
            if cost is not None:
                payload = {"value": cost, "unit": values.get("currency") or declaration.get("expected_unit") or ""}
        elif "distance" in lowered or "travel" in lowered or lowered.startswith("km"):
            if distance is not None:
                payload = {"value": distance, "unit": "km"}
        elif any(token in lowered for token in ("activity", "quantity", "qty", "consumption", "energy", "volume", "mass")):
            if quantity is not None:
                payload = {"value": quantity, "unit": values.get("unit") or declaration.get("expected_unit") or ""}
        elif _number(values.get(variable)) is not None:
            payload = {"value": _number(values[variable]), "unit": values.get(f"{variable}_unit") or declaration.get("expected_unit") or ""}
        if payload is not None:
            inputs[variable] = payload
        elif declaration.get("required", True):
            raise ValueError(f"The selected formula requires '{variable}', which was not extracted. Edit this row before saving.")
    return inputs


async def execute_ocr_calculation(db, values: dict, category: dict, organization_id: str) -> dict:
    category_id = category["id"]
    decision_inputs = build_decision_inputs(values, category)
    scope3_ef_id = values.get("scope3_ef_id") or (values.get("factor_id") if values.get("scope") == "scope3" else None)
    context = {
        "organization_id": organization_id,
        "scope": values.get("scope"),
        "category": category.get("name") or category.get("category") or values.get("category"),
        "category_id": category_id,
        "reporting_period": values.get("reporting_period"),
        "fuel_name": values.get("fuel_name") or values.get("subcategory"),
        "fuel_id": values.get("fuel_id") or values.get("factor_id"),
        "scope3_ef_id": scope3_ef_id,
    }
    if scope3_ef_id:
        activity = await db.scope3_ef.find_one({"id": scope3_ef_id}, {"_id": 0})
        if activity:
            context.update({
                "fuel_name": activity.get("activity"),
                "activity": activity.get("activity"),
                "activity_type": activity.get("activity_type"),
                "scope3_ef_default_unit": activity.get("unit") or activity.get("default_unit"),
            })
    try:
        tree = await get_decision_tree_for_execution(db, category_id, None)
    except CalculationVersionError as error:
        raise ValueError(str(error)) from error
    if tree:
        try:
            formula_id, tree_path = resolve_formula_id(tree["tree"], decision_inputs)
        except DecisionTreeError as error:
            raise ValueError(f"The reviewed OCR values do not resolve a formula: {error}") from error
        if not formula_id:
            raise ValueError("The reviewed OCR values did not resolve a calculation formula.")
    else:
        formula_doc = await db.ce_formulas.find_one(
            {"is_active": True, "$or": [{"category_id": category_id}, {"category_ids": category_id}]},
            {"_id": 0},
        )
        if not formula_doc:
            raise ValueError("No active calculation formula is configured for this category.")
        formula_id, tree_path = formula_doc["id"], []
    try:
        formula_doc = await resolve_formula_version_for_tree(db, tree, formula_id, None)
    except CalculationVersionError as error:
        raise ValueError(str(error)) from error
    formula = dict(formula_doc["definition"])
    formula.setdefault("id", formula_doc["id"])
    formula.setdefault("version_id", formula_doc.get("version_id"))
    inputs = build_formula_inputs(formula_doc, values)
    overrides = {}
    if decision_inputs.get("calculation_method_scope3") == "spend_basis":
        method = normalize_currency_method(values.get("spend_currency_conversion_method"))
        decision_inputs["spend_currency_conversion_method"] = method
        currency = str(values.get("currency") or "").upper()
        if currency and currency != "USD":
            conversion = await resolve_currency_conversion(
                db,
                source_currency=currency,
                reporting_period=values.get("reporting_period"),
                reporting_year_type=None,
                method=method,
            )
            if method == STANDARD_METHOD and conversion and conversion.get("exchange_rate"):
                overrides["exchange_rate"] = {"value": float(conversion["exchange_rate"]), "unit": "", "source_name": currency_conversion_source_name(conversion, method)}
            elif method == PPP_INFLATION_METHOD and conversion and conversion.get("inflation_factor") and conversion.get("purchase_parity"):
                source_name = currency_conversion_source_name(conversion, method)
                overrides["inflation_rate"] = {"value": float(conversion["inflation_factor"]), "unit": "", "source_name": source_name}
                overrides["ppp"] = {"value": float(conversion["purchase_parity"]), "unit": "", "source_name": source_name}
            else:
                raise ValueError(f"No active currency conversion is configured for {currency} and {values.get('reporting_period')}.")
        else:
            if method == STANDARD_METHOD:
                overrides["exchange_rate"] = {"value": 1.0, "unit": "", "source_name": "Default (USD)"}
            else:
                overrides["inflation_rate"] = {"value": 1.0, "unit": "", "source_name": "Default (USD)"}
                overrides["ppp"] = {"value": 1.0, "unit": "", "source_name": "Default (USD)"}
    try:
        result = await CalcEngine(db).execute(formula, inputs, context, overrides, dry_run=False, org_id=organization_id)
    except (CalculationError, FormulaDefinitionError, ValueError) as error:
        raise ValueError(str(error)) from error
    if result.get("audit_log_id"):
        await db.ce_calculation_audit_logs.update_one(
            {"id": result["audit_log_id"]},
            {"$set": {
                "decision_tree_version_id": tree.get("version_id") if tree else None,
                "formula_snapshot": formula_snapshot(formula_doc),
            }},
        )
    return {
        "inputs": inputs,
        "outputs": result.get("outputs") or {},
        "audit_log_id": result.get("audit_log_id"),
        "decision_inputs": decision_inputs,
        "formula_id": formula_id,
        "formula_version_id": formula_doc.get("version_id"),
        "decision_tree_version_id": tree.get("version_id") if tree else None,
        "formula_snapshot": formula_snapshot(formula_doc),
        "decision_path": tree_path,
    }