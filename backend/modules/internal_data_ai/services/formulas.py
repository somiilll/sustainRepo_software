"""Formula-linked methodology retrieval for Internal Data AI."""
from typing import Any, Iterable
import re

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


def _definition_reference_values(definition: Any) -> set[str]:
    if not isinstance(definition, dict):
        return set()
    values = set()
    for section in ("inputs", "properties", "outputs"):
        for item in definition.get(section, []):
            if isinstance(item, dict) and item.get("variable"):
                values.add(str(item["variable"]))
    for step in definition.get("steps", []):
        if isinstance(step, dict) and step.get("name"):
            values.add(str(step["name"]))
    return values


def _fallback_label(key: str) -> str:
    known_labels = {"co2": "CO₂", "ch4": "CH₄", "n2o": "N₂O", "co2e": "CO₂e"}
    return known_labels.get(key, key.replace("_", " ").title())


def _humanize_expression(expression: str, labels: dict[str, str]) -> str:
    return re.sub(
        r"\b[a-zA-Z_][a-zA-Z0-9_]*\b",
        lambda match: labels.get(match.group(0), _fallback_label(match.group(0))),
        expression or "",
    )


def build_methodology_summary(formula: dict, variables: list[dict], properties: list[dict]) -> dict:
    """Create a business-readable formula view without IDs, raw schema, or units."""
    labels = {
        item["key"]: item.get("label") or _fallback_label(item["key"])
        for item in [*variables, *properties]
        if item.get("key")
    }
    definition = formula.get("definition")
    if not isinstance(definition, dict):
        return {"name": formula.get("name") or "Calculation methodology", "formula": str(definition or "")}
    steps = []
    for step in definition.get("steps", []):
        if not isinstance(step, dict) or not step.get("name") or not step.get("expression"):
            continue
        steps.append({
            "result": labels.get(step["name"], _fallback_label(step["name"])),
            "formula": _humanize_expression(step["expression"], labels),
        })
    return {"name": formula.get("name") or "Calculation methodology", "steps": steps}


def _global_or_org_scope(org_id: str) -> dict:
    """Allow documented global configuration or an override owned by this org only."""
    return {"$or": [{"organization_id": org_id}, {"organization_id": {"$exists": False}}, {"organization_id": None}]}


async def get_formulas_by_ids(org_id: str, formula_ids: list[str]) -> list[dict]:
    """Return only global or organization-owned formulas linked from authorized records."""
    if not formula_ids:
        return []
    return await db.ce_formulas.find(
        and_filters({"id": {"$in": formula_ids}}, _global_or_org_scope(org_id)),
        {"_id": 0},
    ).to_list(100)


async def get_formula_versions(formula_ids: list[str]) -> list[dict]:
    """Formula versions are reachable only through formula IDs already authorized upstream."""
    if not formula_ids:
        return []
    return await db.ce_formula_versions.find(
        {"formula_id": {"$in": formula_ids}},
        {"_id": 0},
    ).sort("effective_from", -1).to_list(500)


async def get_calculation_audits(org_id: str, emission_record_ids: list[str]) -> list[dict]:
    """Retrieve calculation audits only for authorized records within the authenticated organization."""
    if not emission_record_ids:
        return []
    return await db.ce_calculation_audit_logs.find(
        {"org_id": org_id, "emission_record_id": {"$in": emission_record_ids}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)


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

        definition_keys = _definition_reference_values(formula.get("definition"))
        variable_keys = _formula_reference_values(formula, ("variable_ids", "variables", "input_variables")) | definition_keys
        property_keys = _formula_reference_values(formula, ("property_keys", "properties")) | definition_keys
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
            "presentation": build_methodology_summary(formula, variables, properties),
        })

    methodology_summaries = []
    seen_summaries = set()
    for item in methodologies:
        summary = item.get("presentation") if item.get("formula_available") else None
        fingerprint = repr(summary)
        if summary and fingerprint not in seen_summaries:
            methodology_summaries.append(summary)
            seen_summaries.add(fingerprint)
    return {
        "reporting_period": period.get("label") if isinstance(period, dict) else None,
        "methodologies": methodologies,
        "methodology_summaries": methodology_summaries,
    }