import pytest

from modules.supplier_assessment import ghg_submission_service
from modules.supplier_assessment.ghg_submission_service import resolve_supplier_ghg_scopes


def test_scope1_only_assignment_is_exact():
    assert resolve_supplier_ghg_scopes({"ghg_scopes_enabled": ["scope1"]}) == ["scope1"]


def test_scope2_only_assignment_is_exact():
    assert resolve_supplier_ghg_scopes({"ghg_scopes_enabled": ["scope2"]}) == ["scope2"]


def test_scope1_and_scope2_assignment_preserves_canonical_order():
    assert resolve_supplier_ghg_scopes({"ghg_scopes_enabled": ["scope2", "scope1"]}) == ["scope1", "scope2"]


def test_scope3_and_biogenic_are_never_supplier_scopes():
    assert resolve_supplier_ghg_scopes({"ghg_scopes_enabled": ["scope1", "scope3", "biogenic"]}) == ["scope1"]


def test_empty_scope_assignment_remains_empty():
    assert resolve_supplier_ghg_scopes({"ghg_scopes_enabled": []}) == []


def test_legacy_missing_assignment_defaults_to_scope1_and_scope2():
    assert resolve_supplier_ghg_scopes({}) == ["scope1", "scope2"]


@pytest.mark.asyncio
async def test_effective_scopes_come_from_bound_program_not_relationship_shadow(monkeypatch):
    async def fake_program_context(_relationship):
        return {
            "config": {
                "modules": {
                    "ghg": {"enabled": True, "scopes": ["scope2"]},
                },
            },
        }

    monkeypatch.setattr(ghg_submission_service, "resolve_program_context", fake_program_context)

    effective = await ghg_submission_service.resolve_effective_supplier_ghg_scopes(
        {"ghg_scopes_enabled": ["scope1"]}
    )

    assert effective == ["scope2"]