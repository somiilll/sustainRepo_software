import pytest

from modules.internal_data_ai import relationship_resolver


@pytest.mark.asyncio
async def test_relationship_resolver_uses_authorized_record_chain_and_audit_unit(monkeypatch):
    async def fake_formulas(org_id, formula_ids):
        assert org_id == "org-a"
        assert formula_ids == ["formula-1"]
        return [{
            "id": "formula-1",
            "name": "Diesel calculation",
            "definition": {"outputs": [{"variable": "co2e", "unit": "tCO2e"}]},
            "version_id": "version-2",
            "version_number": 2,
        }]

    async def fake_versions(formula_ids):
        assert formula_ids == ["formula-1"]
        return [{"id": "version-2", "formula_id": "formula-1", "version_number": 2, "effective_from": "2026-01-01"}]

    async def fake_audits(org_id, record_ids):
        assert org_id == "org-a"
        assert record_ids == ["record-1"]
        return [{
            "emission_record_id": "record-1",
            "formula_id": "formula-1",
            "formula_version_id": "version-2",
            "outputs": {"co2e": {"value": 4.2, "unit": "tCO2e"}},
        }]

    monkeypatch.setattr(relationship_resolver, "get_formulas_by_ids", fake_formulas)
    monkeypatch.setattr(relationship_resolver, "get_formula_versions", fake_versions)
    monkeypatch.setattr(relationship_resolver, "get_calculation_audits", fake_audits)

    result = await relationship_resolver.resolve_calculation_relationships("org-a", [{
        "id": "record-1", "formula_id": "formula-1", "fuel_type": "Diesel", "reporting_period": "2026-08"
    }])

    relationship = result["relationships"][0]
    assert result["evidence_state"] == "FOUND"
    assert relationship["linked_formula_version"]["version_number"] == 2
    assert relationship["emission_unit"] == {"unit": "tCO2e", "source": "calculation_audit"}


@pytest.mark.asyncio
async def test_relationship_resolver_marks_missing_formula_or_version_as_partial(monkeypatch):
    async def empty(*_args):
        return []

    monkeypatch.setattr(relationship_resolver, "get_formulas_by_ids", empty)
    monkeypatch.setattr(relationship_resolver, "get_formula_versions", empty)
    monkeypatch.setattr(relationship_resolver, "get_calculation_audits", empty)

    result = await relationship_resolver.resolve_calculation_relationships("org-a", [{"id": "record-1", "formula_id": "formula-1"}])

    assert result["evidence_state"] == "RELATIONSHIP_MISSING"
    assert "formula_definition" in result["relationships"][0]["missing"]