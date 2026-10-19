"""Regression tests for supplier overview clarification badge gating."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List

import pytest

from modules.supplier_assessment import questionnaire_service


def _fake_service(*, questionnaire: Dict[str, Any], relationship: Dict[str, Any], response_doc: Dict[str, Any]):
    async def _get_questionnaire(_questionnaire_id: str):
        return {
            **questionnaire,
            "questions": [dict(q) for q in questionnaire.get("questions", [])],
        }

    async def _get_supplier(_relationship_id: str):
        return dict(relationship)

    async def _current_response(*_args, **_kwargs):
        return dict(response_doc)

    async def _question_evidence_metadata(*_args, **_kwargs):
        return []

    return SimpleNamespace(
        get_questionnaire=_get_questionnaire,
        get_supplier=_get_supplier,
        _current_questionnaire_response=_current_response,
        _question_evidence_metadata=_question_evidence_metadata,
        _question_evidence_requirement=lambda value: value or "not_required",
    )


# get_questionnaire_for_supplier: only currently unlocked clarification items should be editable
@pytest.mark.asyncio
async def test_supplier_question_items_flag_only_active_unlocks_for_editing():
    questionnaire_id = "qn-clarification"
    questionnaire = {
        "id": questionnaire_id,
        "name": "ESG Annual (Standard)",
        "organization_id": "org-1",
        "is_active": True,
        "is_deleted": False,
        "reporting_periods": ["FY 2026-2027"],
        "questions": [
            {"id": "q1", "question_text": "Active clarification", "evidence_requirement": "optional"},
            {"id": "q2", "question_text": "Historical clarification", "evidence_requirement": "optional"},
            {"id": "q3", "question_text": "Final rejected", "evidence_requirement": "optional"},
            {"id": "q4", "question_text": "Accepted", "evidence_requirement": "optional"},
        ],
    }
    relationship = {
        "id": "rel-1",
        "customer_org_id": "org-1",
        "reporting_period": "FY 2026-2027",
        "questionnaire_ids": [questionnaire_id],
    }
    response_doc = {
        "status": "submitted",
        "has_unlocked_questions": True,
        "unlocked_question_ids": ["q1"],
        "question_reviews": {
            "q1": {"status": "rejected", "needs_resubmission": True, "unlocked_for_supplier": True},
            "q2": {"status": "rejected", "needs_resubmission": True, "unlocked_for_supplier": False, "resubmitted_at": "2026-02-15T10:20:00Z"},
            "q3": {"status": "rejected", "needs_resubmission": False, "unlocked_for_supplier": False},
            "q4": {"status": "accepted", "needs_resubmission": False, "unlocked_for_supplier": False},
        },
        "answers": {"q1": True, "q2": True, "q3": False, "q4": True},
        "question_evidence": {},
    }
    service = _fake_service(questionnaire=questionnaire, relationship=relationship, response_doc=response_doc)

    payload = await questionnaire_service.get_questionnaire_for_supplier(service, questionnaire_id, "rel-1")

    assert payload["has_unlocked_questions"] is True
    assert set(payload["unlocked_question_ids"]) == {"q1"}

    by_id = {item["id"]: item for item in payload["questions"]}
    assert by_id["q1"]["is_unlocked_for_edit"] is True
    assert by_id["q2"]["is_unlocked_for_edit"] is False
    assert by_id["q3"]["is_unlocked_for_edit"] is False
    assert by_id["q4"]["is_unlocked_for_edit"] is False

    assert by_id["q2"]["review"]["needs_resubmission"] is True
    assert by_id["q2"]["review"]["unlocked_for_supplier"] is False
    assert by_id["q3"]["review"]["status"] == "rejected"
    assert by_id["q4"]["review"]["status"] == "accepted"


# get_questionnaire_for_supplier: historical clarification after resubmission remains locked and not editable
@pytest.mark.asyncio
async def test_supplier_question_items_keep_historical_clarifications_locked_after_resubmission():
    questionnaire_id = "qn-resubmitted"
    questionnaire = {
        "id": questionnaire_id,
        "name": "ESG Annual (Standard)",
        "organization_id": "org-1",
        "is_active": True,
        "is_deleted": False,
        "reporting_periods": ["FY 2026-2027"],
        "questions": [
            {"id": "q1", "question_text": "Previously clarified", "evidence_requirement": "optional"},
        ],
    }
    relationship = {
        "id": "rel-1",
        "customer_org_id": "org-1",
        "reporting_period": "FY 2026-2027",
        "questionnaire_ids": [questionnaire_id],
    }
    response_doc = {
        "status": "submitted",
        "has_unlocked_questions": False,
        "unlocked_question_ids": [],
        "question_reviews": {
            "q1": {
                "status": "rejected",
                "needs_resubmission": True,
                "unlocked_for_supplier": False,
                "reviewer_note": "Please attach more detail",
                "resubmitted_at": "2026-02-16T08:00:00Z",
            },
        },
        "answers": {"q1": True},
        "question_evidence": {},
    }
    service = _fake_service(questionnaire=questionnaire, relationship=relationship, response_doc=response_doc)

    payload = await questionnaire_service.get_questionnaire_for_supplier(service, questionnaire_id, "rel-1")

    assert payload["has_unlocked_questions"] is False
    assert payload["unlocked_question_ids"] == []
    only_question = payload["questions"][0]
    assert only_question["review"]["needs_resubmission"] is True
    assert only_question["review"]["unlocked_for_supplier"] is False
    assert only_question["is_unlocked_for_edit"] is False
