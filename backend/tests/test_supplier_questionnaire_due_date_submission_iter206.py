"""Supplier questionnaire due-date submission contract regression tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from modules.supplier_assessment import questionnaire_service
from modules.supplier_assessment.due_dates import has_due_date_passed


class _FakeCursor:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows

    async def to_list(self, _limit: int):
        return list(self._rows)


class _FakeCollection:
    def __init__(self, *, rows: Optional[List[Dict[str, Any]]] = None, single: Optional[Dict[str, Any]] = None):
        self.rows = rows or []
        self.single = single
        self.inserted: List[Dict[str, Any]] = []
        self.updated: List[Dict[str, Any]] = []

    async def find_one(self, *_args, **_kwargs):
        return dict(self.single) if self.single is not None else None

    def find(self, query: Dict[str, Any], *_args, **_kwargs):
        response_type = query.get("response_type")
        if response_type:
            filtered = [row for row in self.rows if row.get("response_type") == response_type]
            return _FakeCursor(filtered)
        if "$or" in query:
            # Required evidence question query path.
            return _FakeCursor([row for row in self.rows if row.get("required_evidence")])
        return _FakeCursor(list(self.rows))

    async def insert_one(self, doc: Dict[str, Any]):
        self.inserted.append(dict(doc))

    async def update_one(self, *_args, **kwargs):
        self.updated.append(kwargs)

    async def update_many(self, *_args, **kwargs):
        self.updated.append(kwargs)


def _iso_date(days: int) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def _fake_service(relationship: Dict[str, Any], *, score: float = 88.4):
    async def _get_supplier(_supplier_relationship_id: str):
        return dict(relationship)

    async def _current_response(*_args, **_kwargs):
        return None

    async def _calculate(*_args, **_kwargs):
        return score, {"overall": score}

    async def _canonical(*_args, **_kwargs):
        return score

    async def _update_completion(*_args, **_kwargs):
        return None

    async def _get_questionnaire(_questionnaire_id: str):
        return {
            "id": "q-1",
            "organization_id": relationship["customer_org_id"],
            "is_active": True,
            "is_deleted": False,
            "due_date": None,
            "reporting_periods": [relationship.get("reporting_period") or "FY 2026-2027"],
            "questions": [{"id": "question-1", "evidence_requirement": "not_required"}],
        }

    async def _question_evidence_metadata(*_args, **_kwargs):
        return []

    return SimpleNamespace(
        get_supplier=_get_supplier,
        _default_reporting_period=lambda: "FY 2026-2027",
        _current_questionnaire_response=_current_response,
        _calculate_questionnaire_score=_calculate,
        refresh_supplier_canonical_score=_canonical,
        _update_completion_status=_update_completion,
        get_questionnaire=_get_questionnaire,
        _question_evidence_metadata=_question_evidence_metadata,
        _question_evidence_requirement=lambda value: value or "not_required",
    )


def _fake_db(*, questionnaire_due_date: Optional[str], question_rows: Optional[List[Dict[str, Any]]] = None):
    return SimpleNamespace(
        supplier_questionnaires=_FakeCollection(single={
            "id": "q-1",
            "is_active": True,
            "reporting_periods": ["FY 2026-2027"],
            "assignment_reporting_period": "FY 2026-2027",
            "due_date": questionnaire_due_date,
        }),
        supplier_questions=_FakeCollection(rows=question_rows or []),
        supplier_questionnaire_responses=_FakeCollection(),
    )


def test_has_due_date_passed_respects_calendar_day_boundary():
    """Due date remains open for its configured date, overdue only after that date."""
    assert has_due_date_passed(_iso_date(-1)) is True
    assert has_due_date_passed(_iso_date(0)) is False
    assert has_due_date_passed(_iso_date(+1)) is False
    assert has_due_date_passed(None) is False


# submit_supplier_answers: draft allowed after deadline, final blocked after deadline extension requirement
@pytest.mark.asyncio
async def test_submit_supplier_answers_allows_draft_but_blocks_final_when_due_date_passed(monkeypatch):
    relationship = {
        "id": "rel-1",
        "customer_org_id": "org-1",
        "due_date": None,
        "reporting_period": "FY 2026-2027",
        "questionnaire_ids": ["q-1"],
    }
    fake_db = _fake_db(questionnaire_due_date=_iso_date(-1))
    monkeypatch.setattr(questionnaire_service, "db", fake_db)
    service = _fake_service(relationship)

    draft_result = await questionnaire_service.submit_supplier_answers(
        service,
        questionnaire_id="q-1",
        supplier_relationship_id="rel-1",
        supplier_org_id="supplier-org-1",
        answers=[{"question_id": "question-1", "answer": True}],
        is_draft=True,
        data_verified=False,
    )
    assert draft_result["status"] == "in_progress"
    assert draft_result["message"] == "Answers saved"

    with pytest.raises(ValueError, match="extend the questionnaire due date"):
        await questionnaire_service.submit_supplier_answers(
            service,
            questionnaire_id="q-1",
            supplier_relationship_id="rel-1",
            supplier_org_id="supplier-org-1",
            answers=[{"question_id": "question-1", "answer": True}],
            is_draft=False,
            data_verified=True,
            verified_by="user-1",
        )


# get_questionnaire_for_supplier: payload should expose submission_deadline_passed for past effective deadline
@pytest.mark.asyncio
async def test_supplier_questionnaire_payload_marks_submission_deadline_passed(monkeypatch):
    relationship = {
        "id": "rel-1",
        "customer_org_id": "org-1",
        "due_date": _iso_date(-1),
        "reporting_period": "FY 2026-2027",
        "questionnaire_ids": ["q-1"],
    }
    fake_db = _fake_db(questionnaire_due_date=None)
    monkeypatch.setattr(questionnaire_service, "db", fake_db)
    service = _fake_service(relationship)

    payload = await questionnaire_service.get_questionnaire_for_supplier(service, "q-1", "rel-1")
    assert payload is not None
    assert payload["submission_deadline_passed"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "questionnaire_due_date,relationship_due_date",
    [
        (None, None),
        (_iso_date(+3), None),
    ],
)
async def test_submit_supplier_answers_allows_final_submission_when_deadline_not_passed(
    monkeypatch,
    questionnaire_due_date: Optional[str],
    relationship_due_date: Optional[str],
):
    """Final submission remains possible when due date is missing or still in the future."""
    relationship = {
        "id": "rel-1",
        "customer_org_id": "org-1",
        "due_date": relationship_due_date,
        "reporting_period": "FY 2026-2027",
        "questionnaire_ids": ["q-1"],
    }
    fake_db = _fake_db(questionnaire_due_date=questionnaire_due_date)
    monkeypatch.setattr(questionnaire_service, "db", fake_db)
    service = _fake_service(relationship)

    result = await questionnaire_service.submit_supplier_answers(
        service,
        questionnaire_id="q-1",
        supplier_relationship_id="rel-1",
        supplier_org_id="supplier-org-1",
        answers=[{"question_id": "question-1", "answer": True}],
        is_draft=False,
        data_verified=True,
        verified_by="user-1",
    )

    assert result["status"] == "submitted"
    assert result["message"] == "Questionnaire submitted"