"""Phase 1 compatibility tests for supplier-assessment programs and module completion."""
from copy import deepcopy

import pytest

from modules.supplier_assessment import programs
from modules.supplier_assessment import documents_service
from modules.supplier_assessment.module_registry import supplier_assessment_module_registry
from modules.supplier_assessment.service import supplier_service
from modules.sustainability_config.contracts import OrganizationConfigUpdate
from modules.sustainability_config.service import resolve_supplier_assessment_config_from_org_config


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _limit):
        return deepcopy(self.docs)


class _Collection:
    def __init__(self, docs=None):
        self.docs = docs or []

    @staticmethod
    def _matches(doc, query):
        return all(doc.get(key) == value for key, value in query.items())

    def find(self, query, _projection=None):
        return _Cursor([doc for doc in self.docs if self._matches(doc, query)])

    async def find_one(self, query, _projection=None, sort=None):
        matches = [doc for doc in self.docs if self._matches(doc, query)]
        if sort and matches:
            key, direction = sort[0]
            matches.sort(key=lambda doc: doc.get(key, 0), reverse=direction < 0)
        return deepcopy(matches[0]) if matches else None

    async def count_documents(self, query):
        return len([doc for doc in self.docs if self._matches(doc, query)])

    async def insert_one(self, doc):
        self.docs.append(deepcopy(doc))

    async def update_one(self, query, update):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                return


class _Database:
    def __init__(self, **collections):
        for name, docs in collections.items():
            setattr(self, name, _Collection(docs))


def _relationship():
    return {
        "id": "relationship-1",
        "customer_org_id": "customer-1",
        "revenue_percentage": 42,
        "ghg_scopes_enabled": ["scope1", "scope2"],
    }


def _completion_database():
    return _Database(
        supplier_relationships=[_relationship()],
        supplier_questionnaires=[{"id": "questionnaire-1", "organization_id": "customer-1", "is_active": True}],
        supplier_questionnaire_responses=[{
            "questionnaire_id": "questionnaire-1",
            "supplier_relationship_id": "relationship-1",
            "answers": {"question-1": "yes", "question-2": None},
        }],
        supplier_questions=[
            {"id": "question-1", "questionnaire_id": "questionnaire-1", "is_active": True},
            {"id": "question-2", "questionnaire_id": "questionnaire-1", "is_active": True},
        ],
        emission_records=[
            {"source": "supplier", "supplier_relationship_id": "relationship-1"},
            {"source": "supplier", "supplier_relationship_id": "relationship-1"},
        ],
        supplier_assessment_programs=[],
    )


def test_supplier_assessment_configuration_supports_future_schema_without_modules():
    payload = OrganizationConfigUpdate.model_validate({
        "supplier_assessment": {
            "modules": {
                "esg": {"enabled": True},
                "ghg": {"enabled": True, "scopes": ["scope1"]},
                "documents": {"enabled": False},
                "training": {"enabled": False},
            }
        }
    })
    resolved = resolve_supplier_assessment_config_from_org_config(payload.model_dump())
    assert resolved["modules"]["esg"]["enabled"] is True
    assert resolved["modules"]["ghg"]["scopes"] == ["scope1"]
    assert resolved["modules"]["documents"]["enabled"] is False
    assert resolved["modules"]["training"]["enabled"] is False


def test_registry_registers_only_phase_one_adapters():
    assert supplier_assessment_module_registry.registered_codes() == ["esg", "ghg", "documents"]


@pytest.mark.asyncio
async def test_esg_and_ghg_adapters_match_existing_completion_rules():
    database = _completion_database()
    relationship = _relationship()
    adapters = {adapter.module_code: adapter for adapter in supplier_assessment_module_registry.enabled_modules({
        "modules": {"esg": {"enabled": True}, "ghg": {"enabled": True}}
    })}
    assert (await adapters["esg"].get_completion(database, relationship)).completion_percent == 50.0
    assert (await adapters["ghg"].get_completion(database, relationship)).completion_percent == 50.0


@pytest.mark.asyncio
async def test_program_revision_binding_reuses_same_config_and_versions_changes(monkeypatch):
    database = _Database(supplier_assessment_programs=[])
    monkeypatch.setattr(programs, "db", database)
    config = {"modules": {"esg": {"enabled": True}, "ghg": {"enabled": True, "scopes": ["scope1", "scope2"]}}}

    first = await programs.get_or_create_program_revision("customer-1", config, "user-1")
    same = await programs.get_or_create_program_revision("customer-1", config, "user-2")
    changed = await programs.get_or_create_program_revision(
        "customer-1", programs.apply_legacy_request_overrides(config, ["esg"], None), "user-1"
    )

    assert first["program_id"] == same["program_id"] == changed["program_id"]
    assert first["version"] == same["version"] == 1
    assert changed["version"] == 2
    assert "assessment_program_id" not in first


@pytest.mark.asyncio
async def test_legacy_relationship_uses_explicit_compatibility_context(monkeypatch):
    database = _completion_database()
    monkeypatch.setattr(programs, "db", database)
    context = await programs.resolve_program_context(_relationship())
    assert context["is_legacy"] is True
    assert [module.module_code for module in supplier_assessment_module_registry.enabled_modules(context["config"])] == ["esg", "ghg"]


@pytest.mark.asyncio
async def test_completion_facade_preserves_legacy_weighted_result(monkeypatch):
    database = _completion_database()
    monkeypatch.setattr("modules.supplier_assessment.service.db", database)
    monkeypatch.setattr(programs, "db", database)

    await supplier_service._update_completion_status("relationship-1")
    updated = database.supplier_relationships.docs[0]

    assert updated["esg_completion_percent"] == 50.0
    assert updated["ghg_completion_percent"] == 50.0
    assert updated["overall_completion_percent"] == 60.0
    assert updated["invitation_status"] == "accepted"


@pytest.mark.asyncio
async def test_document_acceptance_is_versioned_and_contributes_to_completion(monkeypatch):
    relationship = {
        **_relationship(),
        "supplier_org_id": "supplier-org-1",
        "assessment_program_id": "program-documents",
        "assessment_program_version": 1,
    }
    database = _completion_database()
    database.supplier_relationships.docs = [relationship]
    database.supplier_assessment_programs.docs = [{
        "program_id": "program-documents", "version": 1,
        "config": {"modules": {
            "esg": {"enabled": True}, "ghg": {"enabled": True}, "documents": {"enabled": True},
        }},
    }]
    database.supplier_document_requirements = _Collection([{
        "id": "requirement-1", "customer_org_id": "customer-1", "assessment_program_id": "program-documents",
        "assessment_program_version": 1, "document_version_id": "document-version-1", "is_active": True,
    }])
    database.supplier_document_versions = _Collection([{
        "id": "document-version-1", "original_filename": "nda.pdf", "content_type": "application/pdf",
        "file_size": 12, "version_number": 1,
    }])
    database.supplier_document_acceptances = _Collection([])
    monkeypatch.setattr(documents_service, "db", database)
    monkeypatch.setattr(programs, "db", database)
    monkeypatch.setattr("modules.supplier_assessment.service.db", database)

    document_module = next(module for module in supplier_assessment_module_registry.enabled_modules({
        "modules": {"documents": {"enabled": True}}
    }) if module.module_code == "documents")
    assert (await document_module.get_completion(database, relationship)).completion_percent == 0.0
    acceptance = await documents_service.accept_supplier_document(relationship, "requirement-1", "supplier-user-1")
    assert acceptance["document_version_id"] == "document-version-1"
    assert (await document_module.get_completion(database, relationship)).completion_percent == 100.0

    await supplier_service._update_completion_status("relationship-1")
    assert database.supplier_relationships.docs[0]["documents_completion_percent"] == 100.0
    assert database.supplier_relationships.docs[0]["overall_completion_percent"] == 73.3


@pytest.mark.asyncio
async def test_document_version_numbers_increment_per_agreement_lineage(monkeypatch):
    database = _Database(supplier_document_versions=[{
        "customer_org_id": "customer-1", "document_key": "supplier-nda", "version_number": 2,
    }])
    monkeypatch.setattr(documents_service, "db", database)
    assert documents_service._document_key("Supplier NDA", "ignored.pdf") == "supplier-nda"
    assert await documents_service._next_document_version_number("customer-1", "supplier-nda") == 3