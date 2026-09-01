"""Supplier assessment due-date guardrail regression tests (mocked dependencies only)."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from modules.supplier_assessment import documents_service, questionnaire_service, relationship_service, training_service
from modules.supplier_assessment.due_dates import validate_due_date


class _UnexpectedCall(RuntimeError):
    """Raised when a downstream dependency is hit unexpectedly in guard tests."""


class _SentinelValidationError(ValueError):
    """Raised to prove shared validator is invoked in service paths."""


def _yesterday_iso() -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()


def test_due_date_accepts_today_and_future_dates():
    """Shared validator allows today/future and optional empty values."""
    today = datetime.now(timezone.utc).date()
    validate_due_date(today.isoformat())
    validate_due_date((today + timedelta(days=1)).isoformat())
    validate_due_date(None)
    validate_due_date("")


def test_due_date_rejects_past_and_invalid_dates():
    """Shared validator blocks previous dates and invalid strings."""
    with pytest.raises(ValueError, match="cannot be in the past"):
        validate_due_date(_yesterday_iso())
    with pytest.raises(ValueError, match="valid ISO date"):
        validate_due_date("not-a-date")


# relationship_service: supplier create/update should reject past due_date in service path
@pytest.mark.asyncio
async def test_create_supplier_rejects_past_due_date_before_db_calls(monkeypatch):
    async def _unexpected_find_one(*_args, **_kwargs):
        raise _UnexpectedCall("DB should not be hit when due date is invalid")

    monkeypatch.setattr(relationship_service.db.supplier_relationships, "find_one", _unexpected_find_one)

    with pytest.raises(ValueError, match="cannot be in the past"):
        await relationship_service.create_supplier(
            object(),
            customer_org_id="org-1",
            company_name="TEST Co",
            contact_person="Test User",
            email="test@example.com",
            contact_number=None,
            due_date=_yesterday_iso(),
            created_by="admin",
            created_by_email="admin@example.com",
        )


@pytest.mark.asyncio
async def test_update_supplier_rejects_past_due_date(monkeypatch):
    class _DummyService:
        async def get_supplier(self, _relationship_id):
            return {"id": "rel-1"}

    async def _unexpected_update(*_args, **_kwargs):
        raise _UnexpectedCall("Update should not run when due date is invalid")

    monkeypatch.setattr(relationship_service.db.supplier_relationships, "update_one", _unexpected_update)

    with pytest.raises(ValueError, match="cannot be in the past"):
        await relationship_service.update_supplier(_DummyService(), "rel-1", {"due_date": _yesterday_iso()})


# questionnaire_service: create/update should reject past due_date in service path
@pytest.mark.asyncio
async def test_create_questionnaire_rejects_past_due_date_before_db_calls(monkeypatch):
    async def _unexpected_insert(*_args, **_kwargs):
        raise _UnexpectedCall("Insert should not run when due date is invalid")

    monkeypatch.setattr(questionnaire_service.db.supplier_questionnaires, "insert_one", _unexpected_insert)

    with pytest.raises(ValueError, match="cannot be in the past"):
        await questionnaire_service.create_questionnaire(
            object(),
            organization_id="org-1",
            name="ESG 2026",
            description="desc",
            due_date=_yesterday_iso(),
            scoring_method="question",
            section_weights=None,
            esg_section_weights=None,
            overall_supplier_weights=None,
            created_by="admin",
        )


@pytest.mark.asyncio
async def test_update_questionnaire_rejects_past_due_date(monkeypatch):
    class _DummyService:
        async def get_questionnaire(self, _questionnaire_id):
            return {"id": "q-1", "name": "Q"}

    async def _unexpected_update(*_args, **_kwargs):
        raise _UnexpectedCall("Update should not run when due date is invalid")

    monkeypatch.setattr(questionnaire_service.db.supplier_questionnaires, "update_one", _unexpected_update)

    with pytest.raises(ValueError, match="cannot be in the past"):
        await questionnaire_service.update_questionnaire(_DummyService(), "q-1", {"due_date": _yesterday_iso()})


# documents_service: publish/update should enforce shared validator before upload/write
@pytest.mark.asyncio
async def test_publish_agreement_invokes_validator_before_storage_upload(monkeypatch):
    calls = {"validator": 0, "upload": 0}

    def _validator(_due_date):
        calls["validator"] += 1
        raise _SentinelValidationError("validator-called")

    class _Storage:
        async def upload_file(self, *_args, **_kwargs):
            calls["upload"] += 1
            raise _UnexpectedCall("Storage upload should not occur when due date is invalid")

    monkeypatch.setattr(documents_service, "validate_due_date", _validator)
    monkeypatch.setattr(documents_service, "get_r2_storage", lambda: _Storage())

    with pytest.raises(_SentinelValidationError, match="validator-called"):
        await documents_service.publish_agreement(
            customer_org_id="org-1",
            created_by="admin",
            filename="policy.pdf",
            content_type="application/pdf",
            content=b"pdf-bytes",
            title="Policy",
            due_date=_yesterday_iso(),
        )

    assert calls["validator"] == 1
    assert calls["upload"] == 0


@pytest.mark.asyncio
async def test_update_document_due_date_rejects_past_due_date(monkeypatch):
    async def _unexpected_find_one(*_args, **_kwargs):
        raise _UnexpectedCall("DB should not be queried when due date is invalid")

    monkeypatch.setattr(documents_service.db.supplier_document_requirements, "find_one", _unexpected_find_one)

    with pytest.raises(ValueError, match="cannot be in the past"):
        await documents_service.update_document_due_date("org-1", "req-1", _yesterday_iso())


# training_service: create/update should enforce shared validator before persistence/upload paths
@pytest.mark.asyncio
async def test_create_training_invokes_validator_before_org_config_and_storage(monkeypatch):
    calls = {"validator": 0, "org_config": 0, "upload": 0}

    def _validator(_due_date):
        calls["validator"] += 1
        raise _SentinelValidationError("validator-called")

    async def _unexpected_org_config(*_args, **_kwargs):
        calls["org_config"] += 1
        raise _UnexpectedCall("Org config should not be reached when due date is invalid")

    class _Storage:
        async def upload_file(self, *_args, **_kwargs):
            calls["upload"] += 1
            raise _UnexpectedCall("Storage upload should not occur when due date is invalid")

    monkeypatch.setattr(training_service, "validate_due_date", _validator)
    monkeypatch.setattr(training_service.sustainability_config_service, "resolve_supplier_assessment_config", _unexpected_org_config)
    monkeypatch.setattr(training_service, "get_r2_storage", lambda: _Storage())

    with pytest.raises(_SentinelValidationError, match="validator-called"):
        await training_service.create_training(
            org_id="org-1",
            user_id="admin",
            title="Intro training",
            description="desc",
            threshold=100.0,
            file_name="deck.pdf",
            content_type="application/pdf",
            content=b"pdf-bytes",
            relationship_ids=["rel-1"],
            due_date=_yesterday_iso(),
        )

    assert calls["validator"] == 1
    assert calls["org_config"] == 0
    assert calls["upload"] == 0


@pytest.mark.asyncio
async def test_update_training_rejects_past_due_date_before_write(monkeypatch):
    calls = {"update": 0}

    async def _find_one(*_args, **_kwargs):
        return {"id": "training-1", "organization_id": "org-1", "is_active": True, "is_deleted": False}

    async def _unexpected_update_one(*_args, **_kwargs):
        calls["update"] += 1
        raise _UnexpectedCall("Update should not be persisted when due date is invalid")

    fake_db = SimpleNamespace(
        supplier_training_requirements=SimpleNamespace(
            find_one=_find_one,
            update_one=_unexpected_update_one,
        )
    )
    monkeypatch.setattr(training_service, "db", fake_db)

    with pytest.raises(ValueError, match="cannot be in the past"):
        await training_service.update_training("org-1", "training-1", {"due_date": _yesterday_iso()})

    assert calls["update"] == 0