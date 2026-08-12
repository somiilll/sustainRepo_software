"""Authorized relationship traversal for Internal Data AI calculation evidence."""
from collections import defaultdict

from modules.internal_data_ai.data_normalization import resolve_emission_unit
from modules.internal_data_ai.query_contracts import EvidenceState
from modules.internal_data_ai.services.formulas import (
    get_calculation_audits,
    get_formula_versions,
    get_formulas_by_ids,
)


def _formula_view(formula: dict | None) -> dict | None:
    if not formula:
        return None
    return {
        "id": formula.get("id"),
        "name": formula.get("name"),
        "description": formula.get("description"),
        "definition": formula.get("definition"),
        "version_id": formula.get("version_id"),
        "version_number": formula.get("version_number"),
    }


async def resolve_calculation_relationships(
    org_id: str,
    facility_ids: list = None,
    emission_records: list[dict] = None,
    **_kwargs,
) -> dict:
    """Traverse authorized records to formulas, formula history, audits, and unit evidence.

    Record IDs are supplied by an organization-scoped retrieval service. This resolver
    never accepts organization or record IDs from the language model.
    """
    if emission_records is None and facility_ids and isinstance(facility_ids[0], dict):
        emission_records, facility_ids = facility_ids, None
    emission_records = list(emission_records or [])
    record_ids = [record.get("id") for record in emission_records if record.get("id")]
    formula_ids = sorted({record.get("formula_id") for record in emission_records if record.get("formula_id")})
    formulas, versions, audits = await get_formulas_by_ids(org_id, formula_ids), await get_formula_versions(formula_ids), await get_calculation_audits(org_id, record_ids)
    formulas_by_id = {formula.get("id"): formula for formula in formulas if formula.get("id")}
    versions_by_formula = defaultdict(list)
    versions_by_id = {}
    for version in versions:
        versions_by_formula[version.get("formula_id")].append(version)
        if version.get("id"):
            versions_by_id[version["id"]] = version
    audits_by_record = defaultdict(list)
    for audit in audits:
        audits_by_record[audit.get("emission_record_id")].append(audit)

    relationships = []
    for record in emission_records:
        record_id = record.get("id")
        formula_id = record.get("formula_id")
        formula = formulas_by_id.get(formula_id)
        record_audits = audits_by_record.get(record_id, [])
        latest_audit = record_audits[0] if record_audits else None
        linked_version = versions_by_id.get((latest_audit or {}).get("formula_version_id"))
        missing = []
        if not formula_id:
            missing.append("formula_id")
        elif not formula:
            missing.append("formula_definition")
        if not latest_audit:
            missing.append("record_level_calculation_audit")
        elif not latest_audit.get("formula_version_id"):
            missing.append("formula_version_id_on_audit")
        elif not linked_version:
            missing.append("formula_version_definition")

        if not formula_id or not formula:
            evidence_state = EvidenceState.RELATIONSHIP_MISSING
        elif missing:
            evidence_state = EvidenceState.FOUND_PARTIAL
        else:
            evidence_state = EvidenceState.FOUND

        unit_evidence = resolve_emission_unit(
            record,
            formula_definition=formula,
            calculation_audit=latest_audit,
        )
        relationships.append({
            "record_id": record_id,
            "fuel_type": record.get("fuel_type"),
            "facility": record.get("facility"),
            "reporting_period": record.get("reporting_period"),
            "formula": _formula_view(formula),
            "formula_versions": versions_by_formula.get(formula_id, []),
            "linked_formula_version": linked_version,
            "calculation_audits": record_audits,
            "record_emission_factor": {
                "value": record.get("emission_factor"),
                "unit": record.get("emission_factor_unit"),
            },
            "emission_unit": unit_evidence,
            "evidence_state": evidence_state.value,
            "missing": missing,
        })

    state = EvidenceState.NOT_FOUND if not relationships else EvidenceState.FOUND
    if any(item["evidence_state"] == EvidenceState.RELATIONSHIP_MISSING.value for item in relationships):
        state = EvidenceState.RELATIONSHIP_MISSING
    elif any(item["evidence_state"] == EvidenceState.FOUND_PARTIAL.value for item in relationships):
        state = EvidenceState.FOUND_PARTIAL
    return {"evidence_state": state.value, "relationships": relationships}