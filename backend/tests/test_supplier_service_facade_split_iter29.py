"""Regression checks for supplier service facade delegation after modular split."""

import pytest

from modules.supplier_assessment import lifecycle_service, ranking_service, relationship_service, service as service_module


# --- Minimal async DB fakes for facade delegation smoke checks ---
class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limit):
        return list(self.docs)


class _Collection:
    def __init__(self, docs=None, count=0):
        self.docs = docs or []
        self.count = count

    async def find_one(self, *_args, **_kwargs):
        return self.docs[0] if self.docs else None

    def find(self, *_args, **_kwargs):
        return _Cursor(self.docs)

    async def count_documents(self, *_args, **_kwargs):
        return self.count

    async def update_one(self, *_args, **_kwargs):
        return None


class _DB:
    def __init__(self):
        self.supplier_relationships = _Collection([])
        self.supplier_questionnaires = _Collection([])
        self.supplier_questionnaire_responses = _Collection([])
        self.supplier_document_requirements = _Collection([], count=0)
        self.supplier_training_assignments = _Collection([])
        self.supplier_revenue_submissions = _Collection([])


def _delegated_operation(fn):
    assert fn.__closure__, "Expected delegated facade method with closure"
    for cell in fn.__closure__:
        value = cell.cell_contents
        if callable(value) and getattr(value, "__module__", "").startswith("modules.supplier_assessment"):
            return value
    raise AssertionError("Could not locate delegated operation in closure")


def test_facade_public_methods_bound_to_extracted_modules():
    service_cls = service_module.SupplierAssessmentService
    expected = {
        "create_supplier": relationship_service,
        "get_suppliers": relationship_service,
        "get_supplier": relationship_service,
        "update_supplier": relationship_service,
        "update_revenue_info": relationship_service,
        "submit_revenue_info": relationship_service,
        "update_revenue_percentage": relationship_service,
        "refresh_supplier_canonical_score": lifecycle_service,
        "_update_completion_status": lifecycle_service,
        "get_supplier_rankings": ranking_service,
    }

    for method_name, module in expected.items():
        assert hasattr(service_cls, method_name), f"Missing facade method: {method_name}"
        delegated = _delegated_operation(getattr(service_cls, method_name))
        assert delegated.__module__ == module.__name__, f"{method_name} no longer delegates to {module.__name__}"


@pytest.mark.asyncio
async def test_facade_delegation_smoke_calls_for_relationship_ranking_and_lifecycle(monkeypatch):
    fake_db = _DB()
    monkeypatch.setattr(service_module, "db", fake_db)

    svc = service_module.SupplierAssessmentService()

    # Relationship delegation smoke call
    assert await svc.get_supplier("missing-relationship") is None
    assert relationship_service.db is fake_db

    # Revenue legacy shim still delegates via relationship module
    assert await svc.update_revenue_percentage("missing-relationship", "missing-org", 12.5) is False

    # Ranking delegation smoke call
    rankings = await svc.get_supplier_rankings("customer-org-1")
    assert rankings["rankings"] == []
    assert ranking_service.db is fake_db

    # Lifecycle delegation smoke calls (relationship missing -> no-op/None)
    assert await svc.refresh_supplier_canonical_score("missing-relationship") is None
    await svc._update_completion_status("missing-relationship")
    assert lifecycle_service.db is fake_db
