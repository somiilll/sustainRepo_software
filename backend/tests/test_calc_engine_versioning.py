from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from calc_engine.versioning import (
    CalculationVersionError,
    apply_record_version_binding,
    get_formula_for_execution,
)
from calc_engine.formulas import DecisionTreeError, _formula_version_map
from bulk_upload_scope3.models import CalculationMethod
from bulk_upload_scope3.processors.emission_calculator import EmissionCalculator
from modules.emissions.c7_contracts import C7YearlyEntryCreate


def _db(**collections):
    return SimpleNamespace(**collections)


@pytest.mark.asyncio
async def test_formula_version_map_rejects_cross_formula_version_ids():
    formula_cursor = SimpleNamespace(to_list=AsyncMock(return_value=[
        {"id": "PPP", "version_id": "PPP-v1"},
        {"id": "STANDARD", "version_id": "PPP-v1"},
    ]))
    formulas = SimpleNamespace(find=lambda *args, **kwargs: formula_cursor)
    version_cursor = SimpleNamespace(to_list=AsyncMock(return_value=[
        {"id": "PPP-v1", "formula_id": "PPP"},
    ]))
    versions = SimpleNamespace(find=lambda *args, **kwargs: version_cursor)

    with pytest.raises(DecisionTreeError, match="formula-specific versions"):
        await _formula_version_map(
            _db(ce_formulas=formulas, ce_formula_versions=versions),
            {
                "field_name": "method",
                "options": {
                    "ppp": {"formula_id": "PPP"},
                    "standard": {"formula_id": "STANDARD"},
                },
            },
        )


@pytest.mark.asyncio
async def test_pinned_formula_uses_historical_definition_after_current_changes():
    formulas = SimpleNamespace(find_one=AsyncMock(return_value={
        "id": "F1",
        "name": "Formula 1",
        "version_id": "F1-v2",
        "version_number": 2,
        "is_active": True,
        "definition": {"expression": "qty * 20"},
    }))
    versions = SimpleNamespace(find_one=AsyncMock(return_value={
        "id": "F1-v1",
        "formula_id": "F1",
        "version_number": 1,
        "definition_snapshot": {"expression": "qty * 10"},
    }))

    resolved = await get_formula_for_execution(
        _db(ce_formulas=formulas, ce_formula_versions=versions),
        "F1",
        "F1-v1",
    )

    assert resolved["version_id"] == "F1-v1"
    assert resolved["definition"]["expression"] == "qty * 10"


@pytest.mark.asyncio
async def test_pinned_formula_rejects_version_owned_by_another_formula():
    formulas = SimpleNamespace(find_one=AsyncMock(return_value={
        "id": "STANDARD",
        "name": "Standard",
        "version_id": "PPP-v1",
        "is_active": True,
        "definition": {"expression": "standard"},
    }))
    versions = SimpleNamespace(find_one=AsyncMock(side_effect=[
        None,
        {"id": "PPP-v1", "formula_id": "PPP"},
    ]))

    with pytest.raises(CalculationVersionError, match="different formula"):
        await get_formula_for_execution(
            _db(ce_formulas=formulas, ce_formula_versions=versions),
            "STANDARD",
            "PPP-v1",
        )


@pytest.mark.asyncio
async def test_new_record_gets_canonical_version_references_and_snapshot():
    formulas = SimpleNamespace(find_one=AsyncMock(return_value={
        "id": "F1",
        "name": "Formula 1",
        "version_id": "F1-v1",
        "version_number": 1,
        "is_active": True,
        "definition": {"expression": "qty * 10"},
    }))
    formula_versions = SimpleNamespace(find_one=AsyncMock(return_value={
        "id": "F1-v1",
        "formula_id": "F1",
        "version_number": 1,
        "definition_snapshot": {"expression": "qty * 10"},
    }))
    tree_versions = SimpleNamespace(find_one=AsyncMock(return_value={
        "id": "TREE-v1",
        "formula_version_map": {"F1": "F1-v1"},
    }))
    trees = SimpleNamespace(find_one=AsyncMock(return_value=None))

    result = await apply_record_version_binding(
        _db(
            ce_formulas=formulas,
            ce_formula_versions=formula_versions,
            ce_decision_tree_versions=tree_versions,
            ce_decision_trees=trees,
        ),
        {
            "formula_id": "F1",
            "formula_version_id": "F1-v1",
            "decision_tree_version_id": "TREE-v1",
        },
    )

    assert result["formula_version_id"] == "F1-v1"
    assert result["decision_tree_version_id"] == "TREE-v1"
    assert result["formula_snapshot"]["definition"]["expression"] == "qty * 10"


@pytest.mark.asyncio
async def test_existing_unversioned_record_remains_on_legacy_flow():
    result = await apply_record_version_binding(
        _db(),
        {
            "formula_id": "F1",
            "formula_version_id": "F1-v2",
            "decision_tree_version_id": "TREE-v2",
            "formula_snapshot": {"expression": "qty * 20"},
        },
        existing_record={"id": "legacy", "formula_id": "F1"},
    )

    assert "formula_version_id" not in result
    assert "decision_tree_version_id" not in result
    assert "formula_snapshot" not in result


@pytest.mark.asyncio
async def test_versioned_record_cannot_switch_to_newer_tree():
    with pytest.raises(CalculationVersionError, match="historical decision-tree"):
        await apply_record_version_binding(
            _db(),
            {
                "formula_id": "F1",
                "decision_tree_version_id": "TREE-v2",
            },
            existing_record={
                "id": "record-1",
                "formula_id": "F1",
                "formula_version_id": "F1-v1",
                "decision_tree_version_id": "TREE-v1",
            },
        )


@pytest.mark.asyncio
async def test_bulk_calculator_resolves_current_catalog_versions():
    formulas = SimpleNamespace(find_one=AsyncMock(return_value={"version_id": "F1-v2"}))
    trees = SimpleNamespace(find_one=AsyncMock(return_value={"version_id": "TREE-v2"}))
    calculator = EmissionCalculator(_db(ce_formulas=formulas, ce_decision_trees=trees))

    result = await calculator._get_version_binding("category-1", "F1")

    assert result == {
        "formula_version_id": "F1-v2",
        "decision_tree_version_id": "TREE-v2",
    }


def test_bulk_scope3_record_keeps_resolved_version_references():
    calculator = EmissionCalculator(_db())

    record = calculator.build_emission_record(
        row_data={"reporting_period": "2026-01", "activity": "Steel"},
        category_code="C1",
        category_name="C1 - Purchased Goods and Services",
        facility={"id": "facility-1"},
        organization_id="org-1",
        user_id="user-1",
        method=CalculationMethod.ACTIVITY_BASIS,
        activity_match={"activity_id": "activity-1", "activity_name": "Steel"},
        calculated_emissions={
            "co2": 0,
            "ch4": 0,
            "n2o": 0,
            "co2e": 1.25,
            "unit": "tCO2e",
            "formula_version_id": "F1-v2",
            "decision_tree_version_id": "TREE-v2",
        },
        formula_id="F1",
    )

    assert record["formula_version_id"] == "F1-v2"
    assert record["decision_tree_version_id"] == "TREE-v2"


def test_c7_yearly_contract_accepts_version_references():
    payload = C7YearlyEntryCreate(
        facility_id="facility-1",
        reporting_year="CY2099",
        calculation_method="activity_basis",
        activity_type="car",
        formula_id="F1",
        formula_version_id="F1-v1",
        decision_tree_version_id="TREE-v1",
        employees=[],
    )

    assert payload.formula_version_id == "F1-v1"
    assert payload.decision_tree_version_id == "TREE-v1"