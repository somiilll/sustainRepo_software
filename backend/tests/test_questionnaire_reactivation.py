"""Regression tests for questionnaire deactivate/reactivate supplier access."""

from types import SimpleNamespace

import pytest

from modules.supplier_assessment import questionnaire_service


class _UpdateResult:
    modified_count = 1


@pytest.mark.asyncio
async def test_organization_can_reactivate_its_hidden_system_questionnaire(monkeypatch):
    existing = {
        "id": "questionnaire-1",
        "organization_id": "customer-1",
        "name": "ESG Annual (Standard)",
        "system_question_bank": "standard",
        "system_bank_last_enabled": True,
        "system_hidden_by_org": True,
        "is_active": False,
        "is_deleted": False,
    }
    captured = {}

    class _Service:
        async def get_questionnaire(self, _questionnaire_id):
            return {**existing, **captured}

    async def _update_one(query, update):
        assert query == {"id": existing["id"]}
        captured.update(update["$set"])
        return _UpdateResult()

    monkeypatch.setattr(
        questionnaire_service,
        "db",
        SimpleNamespace(supplier_questionnaires=SimpleNamespace(update_one=_update_one)),
    )

    await questionnaire_service.update_questionnaire(
        _Service(), existing["id"], {"is_active": True}
    )

    assert captured["is_active"] is True
    assert captured["is_deleted"] is False
    assert captured["system_hidden_by_org"] is False
    assert captured["system_bank_last_enabled"] is True


@pytest.mark.asyncio
async def test_organization_cannot_override_globally_disabled_system_bank(monkeypatch):
    class _Service:
        async def get_questionnaire(self, _questionnaire_id):
            return {
                "id": "questionnaire-1",
                "system_question_bank": "standard",
                "system_bank_last_enabled": False,
                "is_active": False,
            }

    async def _unexpected_update(*_args, **_kwargs):
        raise AssertionError("Globally disabled questionnaire must not be reactivated")

    monkeypatch.setattr(
        questionnaire_service,
        "db",
        SimpleNamespace(supplier_questionnaires=SimpleNamespace(update_one=_unexpected_update)),
    )

    with pytest.raises(ValueError, match="Super Admin must re-enable"):
        await questionnaire_service.update_questionnaire(
            _Service(), "questionnaire-1", {"is_active": True}
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("response_status", ["not_started", "in_progress", "reopened", "submitted"])
async def test_active_assigned_questionnaire_preserves_supplier_response_status(response_status):
    questionnaire = {
        "id": "questionnaire-1",
        "organization_id": "customer-1",
        "name": "ESG Questionnaire",
        "is_active": True,
        "is_deleted": False,
        "reporting_periods": ["FY 2026-2027"],
        "questions": [],
    }
    relationship = {
        "id": "relationship-1",
        "customer_org_id": "customer-1",
        "reporting_period": "FY 2026-2027",
        "questionnaire_ids": ["questionnaire-1"],
    }

    class _Service:
        async def get_questionnaire(self, _questionnaire_id):
            return dict(questionnaire)

        async def get_supplier(self, _supplier_relationship_id):
            return dict(relationship)

        async def _current_questionnaire_response(self, *_args):
            if response_status == "not_started":
                return None
            return {"status": response_status, "answers": {}, "question_evidence": {}}

    result = await questionnaire_service.get_questionnaire_for_supplier(
        _Service(), questionnaire["id"], relationship["id"]
    )

    assert result is not None
    assert result["response_status"] == response_status
    assert (result["response_status"] == "submitted") is (response_status == "submitted")


@pytest.mark.asyncio
async def test_inactive_questionnaire_is_not_directly_available_to_supplier():
    class _Service:
        async def get_questionnaire(self, _questionnaire_id):
            return {
                "id": "questionnaire-1",
                "organization_id": "customer-1",
                "name": "ESG Questionnaire",
                "is_active": False,
                "is_deleted": False,
                "reporting_periods": ["FY 2026-2027"],
                "questions": [],
            }

        async def get_supplier(self, _supplier_relationship_id):
            return {
                "id": "relationship-1",
                "customer_org_id": "customer-1",
                "reporting_period": "FY 2026-2027",
                "questionnaire_ids": ["questionnaire-1"],
            }

    result = await questionnaire_service.get_questionnaire_for_supplier(
        _Service(), "questionnaire-1", "relationship-1"
    )

    assert result is None