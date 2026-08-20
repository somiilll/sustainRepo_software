"""Focused regressions for deterministic BRSR planning and retrieval."""
import pytest

from modules.internal_data_ai.query_contracts import QueryType
from modules.internal_data_ai.query_understanding import build_query_plan
from modules.internal_data_ai.reporting_periods import extract_explicit_period
from modules.internal_data_ai.services import brsr


def test_generic_brsr_count_does_not_create_question_key_filter():
    plan = build_query_plan(
        "How many BRSR questions are filled?",
        {"intent": "brsr_lookup", "entities": {"metric": "BRSR questions filled"}},
        None,
    )

    assert plan.query_type == QueryType.BRSR_LOOKUP
    assert plan.category is None
    assert plan.requested_metric is None


def test_bare_year_range_resolves_as_financial_year():
    period = extract_explicit_period("How many BRSR questions are filled for 2026-2027?", {})

    assert period is not None
    assert period.label == "FY 2026–27"
    assert period.start_month == "2026-04"
    assert period.end_month == "2027-03"


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, _limit):
        return self.rows


class _Collection:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def find(self, query, projection):
        self.calls.append((query, projection))
        return _Cursor(self.rows)


class _Database:
    def __init__(self):
        self.organization_esg_responses = _Collection([{"id": "response-1", "question_key": "p1_training_awareness_coverage"}])
        self.esg_responses_versions = _Collection([{
            "record_id": "p1_training_awareness_coverage",
            "version": 2,
            "change_type": "updated",
            "created_at": "2026-08-01T00:00:00+00:00",
        }])


@pytest.mark.asyncio
async def test_brsr_history_resolves_response_keys_from_unified_collection(monkeypatch):
    fake_db = _Database()
    monkeypatch.setattr(brsr, "db", fake_db)

    result = await brsr.get_version_history(
        "org-1",
        metric="p1_training_awareness_coverage",
    )

    assert result["total"] == 1
    assert result["history"][0]["question_key"] == "p1_training_awareness_coverage"
    version_record_ids = fake_db.esg_responses_versions.calls[0][0]["$and"][1]["$or"][0]["record_id"]["$in"]
    assert set(version_record_ids) == {"response-1", "p1_training_awareness_coverage"}
    assert fake_db.organization_esg_responses.calls