"""Regression checks for questionnaire facade delegation after extraction to questionnaire_service."""

import pytest

from modules.supplier_assessment import questionnaire_service, service as service_module


def _delegated_operation(fn):
    assert fn.__closure__, "Expected delegated facade method with closure"
    for cell in fn.__closure__:
        value = cell.cell_contents
        if callable(value) and getattr(value, "__module__", "").startswith("modules.supplier_assessment"):
            return value
    raise AssertionError("Could not locate delegated operation in closure")


def test_facade_questionnaire_methods_bound_to_questionnaire_service_module():
    """Questionnaire creation/CRUD/response/manual-review/reopen facade contract."""
    service_cls = service_module.SupplierAssessmentService
    expected_methods = {
        "create_questionnaire",
        "get_questionnaires",
        "get_questionnaire",
        "update_questionnaire",
        "delete_questionnaire",
        "duplicate_questionnaire",
        "add_question",
        "update_question",
        "delete_question",
        "reorder_questions",
        "get_supplier_questionnaire_status",
        "get_questionnaire_for_supplier",
        "upload_supplier_question_evidence",
        "get_question_evidence_file",
        "submit_supplier_answers",
        "set_manual_questionnaire_score",
        "set_manual_question_score",
        "reopen_questionnaire",
        "get_supplier_submission_status",
    }

    for method_name in expected_methods:
        assert hasattr(service_cls, method_name), f"Missing facade method: {method_name}"
        delegated = _delegated_operation(getattr(service_cls, method_name))
        assert delegated.__module__ == questionnaire_service.__name__, (
            f"{method_name} no longer delegates to {questionnaire_service.__name__}"
        )


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limit):
        return list(self.docs)


class _Collection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, *_args, **_kwargs):
        return _Cursor(self.docs)


class _DB:
    def __init__(self):
        self.supplier_questionnaires = _Collection([])


@pytest.mark.asyncio
async def test_facade_get_questionnaires_smoke_binds_database_to_questionnaire_module(monkeypatch):
    fake_db = _DB()
    monkeypatch.setattr(service_module, "db", fake_db)

    service = service_module.SupplierAssessmentService()
    result = await service.get_questionnaires("customer-org-1")

    assert result == []
    assert questionnaire_service.db is fake_db
