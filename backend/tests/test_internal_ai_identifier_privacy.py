from modules.internal_data_ai.query_contracts import QueryEntity, QueryPeriod, QueryType, StructuredQueryPlan
from modules.internal_data_ai.response_builder import _evidence_formatter_data


def test_evidence_payload_excludes_internal_record_formula_and_version_identifiers():
    plan = StructuredQueryPlan(
        query_type=QueryType.METHODOLOGY_LOOKUP,
        entity=QueryEntity(type="fuel", canonical_value="Diesel", resolution="RESOLVED"),
        period=QueryPeriod(type="calendar_month", start_month="2026-08", end_month="2026-08"),
    )
    payload = _evidence_formatter_data(plan, {
        "emissions": {"records": [{"id": "record-secret", "fuel_type": "Diesel", "reporting_period": "2026-08"}]},
        "relationships": {"relationships": [{
            "record_id": "record-secret",
            "formula": {"id": "formula-secret", "name": "Stored Formula", "version_id": "version-secret", "definition": {"outputs": []}},
            "formula_versions": [{"id": "version-secret", "version_number": 7}],
            "linked_formula_version": {"id": "version-secret"},
            "calculation_audits": [{"id": "audit-secret"}],
            "emission_unit": {"unit": "tCO2e", "source": "formula_definition"},
            "evidence_state": "FOUND",
            "missing": [],
        }]},
        "evidence_state": {"evidence_state": "FOUND", "record_evidence": []},
    })

    rendered = str(payload)
    assert "record-secret" not in rendered
    assert "formula-secret" not in rendered
    assert "version-secret" not in rendered
    assert "version_number" not in rendered
    assert payload["relationships"][0]["formula"]["name"] == "Stored Formula"