"""
# Module: Internal AI regression checks (iteration 159)
# Features: scope normalization variants and framework version org scoping
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.internal_data_ai.services import analytics, history, brsr, gri
from test_internal_ai_scope_period_methodology_iter158 import FakeCollection, FakeDB


def _aug_2026_period_payload():
    return {"start_month": "2026-08", "end_month": "2026-08", "label": "August 2026", "source": "explicit"}


@pytest.mark.asyncio
@pytest.mark.parametrize("scope_input", ["Scope 1", "scope 1", "1"])
async def test_analytics_scope_variants_normalize_and_apply_org_facility_category_period(monkeypatch, scope_input):
    fake_db = FakeDB({
        "facilities": FakeCollection([
            {"id": "fa", "organization_id": "org-a", "name": "Facility A"},
        ]),
        "emission_records": FakeCollection([
            {"id": "r-1", "organization_id": "org-a", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 10},
            {"id": "r-2", "organization_id": "org-a", "facility_id": "fa", "scope": "2", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 20},
            {"id": "r-3", "organization_id": "org-a", "facility_id": "fb", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 30},
            {"id": "r-4", "organization_id": "org-a", "facility_id": "fa", "scope": "1", "category": "Mobile", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 40},
            {"id": "r-5", "organization_id": "org-a", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-07", "co2e_emissions": 50},
            {"id": "r-6", "organization_id": "org-b", "facility_id": "fa", "scope": "1", "category": "Stationary", "sub_category": "Diesel", "reporting_period": "2026-08", "co2e_emissions": 60},
        ]),
    })
    monkeypatch.setattr(analytics, "db", fake_db)

    result = await analytics.query(
        org_id="org-a",
        facility_ids=["fa"],
        scope=scope_input,
        category="Stationary",
        period=_aug_2026_period_payload(),
    )

    assert result["total_records"] == 1
    assert result["period"] == "August 2026"

    pipeline = fake_db.emission_records.aggregate_calls[0]
    match_stage = next(stage["$match"] for stage in pipeline if "$match" in stage)
    match_s = str(match_stage)
    assert "organization_id" in match_s and "org-a" in match_s
    assert "facility_id" in match_s and "fa" in match_s
    assert "category" in match_s and "Stationary" in match_s
    assert "reporting_period" in match_s and "2026-08" in match_s
    assert "^1$" in match_s


@pytest.mark.asyncio
async def test_history_framework_version_query_is_org_scoped_and_allowlisted(monkeypatch):
    fake_db = FakeDB({
        "organization_esg_responses": FakeCollection([
            {"id": "rec-1", "organization_id": "org-a", "question_key": "q-1", "framework": "BRSR"},
        ]),
        "esg_responses_versions": FakeCollection([]),
    })
    monkeypatch.setattr(history, "db", fake_db)

    await history.get_framework_version_history(org_id="org-a", entity_name="BRSR")
    query = fake_db.esg_responses_versions.find_calls[0]["query"]
    assert query.get("organization_id") == "org-a"
    assert "$or" in query
    assert set(query["$or"][0].keys()) == {"record_id"}
    assert set(query["$or"][1].keys()) == {"question_key"}


@pytest.mark.asyncio
async def test_brsr_version_history_query_is_org_scoped(monkeypatch):
    fake_db = FakeDB({
        "organization_esg_responses": FakeCollection([
            {"id": "rec-1", "organization_id": "org-a", "question_key": "brsr_q1", "framework": "BRSR"},
        ]),
        "esg_responses_versions": FakeCollection([]),
    })
    monkeypatch.setattr(brsr, "db", fake_db)

    await brsr.get_version_history(org_id="org-a")
    query = fake_db.esg_responses_versions.find_calls[0]["query"]
    assert query.get("organization_id") == "org-a" or any(
        isinstance(clause, dict) and clause.get("organization_id") == "org-a"
        for clause in query.get("$and", [])
    )


@pytest.mark.asyncio
async def test_gri_version_history_query_is_org_scoped(monkeypatch):
    fake_db = FakeDB({
        "organization_esg_responses": FakeCollection([
            {"id": "rec-1", "organization_id": "org-a", "question_key": "gri_q1", "framework": "GRI"},
        ]),
        "esg_responses_versions": FakeCollection([]),
    })
    monkeypatch.setattr(gri, "db", fake_db)

    await gri.get_version_history(org_id="org-a")
    query = fake_db.esg_responses_versions.find_calls[0]["query"]
    assert query.get("organization_id") == "org-a"
