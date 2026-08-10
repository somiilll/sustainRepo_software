"""Formula-linked methodology retrieval for Internal Data AI."""
from typing import Any, Iterable

from shared.database.mongo import db
from modules.internal_data_ai.query_scope import and_filters, extract_consumption


def _string_values(value: Any) -> set[str]:
    if isinstance(value, str):
        return {value}
    if isinstance(value, (list, tuple, set)):
        return {str(item) for item in value if isinstance(item, (str, int, float))}
    if isinstance(value, dict):
        return {str(item) for item in value.keys()}
    return set()


def _formula_reference_values(formula: dict, keys: Iterable[str]) -> set[str]:
    values: set[str] = set()
    for key in keys:
        values.update(_string_values(formula.get(key)))
    return values


def _global_or_org_scope(org_id: str) -> dict:
    """Allow documented global configuration or an override owned by this org only."""
    return {"$or": [{"organization_id": org_id}, {"organization_id": {"$exists": False}}, {"organization_id": None}]}


async def explain(org_id: str, **kwargs) -> dict:
    """Trace authorized emission records to their exact stored formula IDs.

    Formula names, categories, and fuels are never used to select a methodology.
    """
    emission_records = list(kwargs.get("emission_records") or [])
    period = kwargs.get("period") or {}
    if not emission_records:
        return {
            "reporting_period": period.get("label") if isinstance(period, dict) else None,
            "methodologies": [],
            "message": "No authorized emission record was found for this methodology request.",
        }

    methodologies = []
    for record in emission_records[:5]:
        formula_id = record.get("formula_id")
        base = {
            "emission_record_id": record.get("id"),
            "facility": record.get("facility"),
            "reporting_period": record.get("reporting_period"),
            "category": record.get("category"),
            "scope": record.get("scope"),
            "result": record.get("co2e_emissions") if record.get("co2e_emissions") is not None else record.get("total_emissions"),
            "result_unit": "tCO2e",
            "formula_id": formula_id,
        }
        if not formula_id:
            methodologies.append({
                **base,
                "formula_available": False,
                "message": "Formula information is not available for this calculation record.",
            })
            continue

        formula = await db.ce_formulas.find_one(
            and_filters({"id": formula_id}, _global_or_org_scope(org_id)),
            {"_id": 0},
        )
        if not formula:
            methodologies.append({
                **base,
                "formula_available": False,
                "message": f"The calculation references formula ID {formula_id}, but the corresponding formula definition could not be retrieved.",
            })
            continue

        variable_keys = _formula_reference_values(formula, ("variable_ids", "variables", "input_variables"))
        property_keys = _formula_reference_values(formula, ("property_keys", "properties"))
        variables = []
        if variable_keys:
            variables = await db.ce_variables.find(
                and_filters({"key": {"$in": list(variable_keys)}}, _global_or_org_scope(org_id)),
                {"_id": 0, "id": 1, "key": 1, "label": 1, "description": 1, "default_unit": 1},
            ).to_list(100)
        properties = []
        if property_keys:
            properties = await db.ce_properties.find(
                and_filters({"key": {"$in": list(property_keys)}}, _global_or_org_scope(org_id)),
                {"_id": 0, "id": 1, "key": 1, "label": 1, "value": 1, "unit": 1, "description": 1},
            ).to_list(100)

        audit = await db.ce_calculation_audit_logs.find_one(
            {"org_id": org_id, "emission_record_id": record.get("id"), "formula_id": formula_id},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        units = [unit for unit in (record.get("unit"), record.get("emission_factor_unit")) if unit]
        conversions = []
        if units:
            conversions = await db.ce_unit_conversions.find(
                {"is_active": True, "$or": [{"from_unit": {"$in": units}}, {"to_unit": {"$in": units}}]},
                {"_id": 0, "from_unit": 1, "to_unit": 1, "factor": 1},
            ).to_list(50)

        methodologies.append({
            **base,
            "formula_available": True,
            "formula": {
                "id": formula.get("id"),
                "name": formula.get("name"),
                "definition": formula.get("definition"),
                "description": formula.get("description"),
                "version": formula.get("version") or formula.get("version_number"),
            },
            "record_inputs": {
                "quantity": extract_consumption(record)[0],
                "unit": extract_consumption(record)[1],
                "emission_factor": record.get("emission_factor"),
                "emission_factor_unit": record.get("emission_factor_unit"),
            },
            "variables": variables,
            "properties": properties,
            "unit_conversions": conversions,
            "calculation_audit": {
                "inputs": audit.get("inputs"),
                "outputs": audit.get("outputs"),
                "audit_log": audit.get("audit_log"),
                "created_at": audit.get("created_at"),
                "formula_version_id": audit.get("formula_version_id"),
            } if audit else None,
            "audit_message": None if audit else "Detailed calculation inputs are not available.",
        })

    return {
        "reporting_period": period.get("label") if isinstance(period, dict) else None,
        "methodologies": methodologies,
    }