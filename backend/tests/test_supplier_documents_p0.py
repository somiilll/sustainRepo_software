"""P0 verification coverage for the focused Supplier Documents agreement tranche."""
from copy import deepcopy

import pytest

from modules.supplier_assessment import documents_service
from modules.supplier_assessment.module_registry import supplier_assessment_module_registry
from modules.supplier_assessment.router import router


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, field, direction):
        return _Cursor(sorted(self.docs, key=lambda item: item.get(field, ""), reverse=direction < 0))

    async def to_list(self, _limit):
        return deepcopy(self.docs)


class _Collection:
    def __init__(self, docs=None):
        self.docs = docs or []

    @staticmethod
    def _matches(document, query):
        return all(document.get(key) == value for key, value in query.items())

    def find(self, query, _projection=None):
        return _Cursor([document for document in self.docs if self._matches(document, query)])

    async def find_one(self, query, _projection=None, sort=None):
        matches = [document for document in self.docs if self._matches(document, query)]
        if sort:
            key, direction = sort[0]
            matches.sort(key=lambda item: item.get(key, 0), reverse=direction < 0)
        return deepcopy(matches[0]) if matches else None

    async def insert_one(self, document):
        stored = deepcopy(document)
        stored["_id"] = "mongo-object-id"
        self.docs.append(stored)
        document["_id"] = "mongo-object-id"

    async def update_one(self, query, update):
        for document in self.docs:
            if self._matches(document, query):
                document.update(update.get("$set", {}))
                return


class _Database:
    def __init__(self, **collections):
        for name, docs in collections.items():
            setattr(self, name, _Collection(docs))


class _Storage:
    def __init__(self):
        self.uploads = []

    async def upload_file(self, **kwargs):
        self.uploads.append(kwargs)
        return {"success": True, "key": f"supplier-assessment/documents/{len(self.uploads)}.pdf"}


def _relationship(relationship_id, supplier_org_id, program_id="program-1", version=1):
    return {
        "id": relationship_id,
        "supplier_org_id": supplier_org_id,
        "customer_org_id": "customer-1",
        "assessment_program_id": program_id,
        "assessment_program_version": version,
    }


@pytest.mark.asyncio
async def test_publish_keeps_immutable_metadata_and_versions_per_lineage(monkeypatch):
    database = _Database(
        organizations=[{"id": "customer-1", "name": "Customer One"}],
        supplier_relationships=[_relationship("relationship-1", "supplier-1")],
        supplier_document_versions=[],
        supplier_document_requirements=[],
    )
    storage = _Storage()

    async def enable_documents(_org_id, _user_id):
        return {"modules": {"documents": {"enabled": True}}}

    async def program_revision(_org_id, _config, _user_id):
        return {"program_id": "program-1", "version": 1}

    async def program_context(_relationship_data):
        return {"config": {"modules": {"documents": {"enabled": True}}}}

    monkeypatch.setattr(documents_service, "db", database)
    monkeypatch.setattr(documents_service, "get_r2_storage", lambda: storage)
    monkeypatch.setattr(documents_service, "_enable_documents_for_org", enable_documents)
    monkeypatch.setattr(documents_service, "get_or_create_program_revision", program_revision)
    monkeypatch.setattr(documents_service, "resolve_program_context", program_context)

    versions = []
    for _ in range(3):
        result = await documents_service.publish_agreement(
            "customer-1", "admin-1", "nda.pdf", "application/pdf", b"disposable agreement", "Supplier NDA"
        )
        versions.append(result["version"])
    separate = await documents_service.publish_agreement(
        "customer-1", "admin-1", "privacy.pdf", "application/pdf", b"separate agreement", "Privacy Addendum"
    )

    assert [version["version_number"] for version in versions] == [1, 2, 3]
    assert separate["version"]["version_number"] == 1
    assert all("_id" not in version for version in versions)
    assert storage.uploads[0]["bucket_type"] == "org_facility"
    assert storage.uploads[0]["folder"] == "supplier-assessment/documents"
    assert storage.uploads[0]["metadata"]["document_type"] == "supplier_agreement"
    assert len(database.supplier_document_versions.docs) == 4


@pytest.mark.asyncio
async def test_supplier_isolation_multiple_acceptances_and_immutable_acceptance(monkeypatch):
    supplier_one = _relationship("relationship-1", "supplier-1")
    supplier_two = _relationship("relationship-2", "supplier-2")
    other_supplier = _relationship("relationship-3", "supplier-3", "program-2", 1)
    database = _Database(
        supplier_document_requirements=[
            {"id": "requirement-1", "customer_org_id": "customer-1", "assessment_program_id": "program-1", "assessment_program_version": 1, "document_version_id": "version-1", "is_active": True, "title": "Supplier NDA", "created_at": "2026-01-01"},
            {"id": "requirement-2", "customer_org_id": "customer-1", "assessment_program_id": "program-2", "assessment_program_version": 1, "document_version_id": "version-2", "is_active": True, "title": "Other program", "created_at": "2026-01-01"},
        ],
        supplier_document_versions=[
            {"id": "version-1", "original_filename": "nda.pdf", "content_type": "application/pdf", "file_size": 42, "version_number": 1},
            {"id": "version-2", "original_filename": "other.pdf", "content_type": "application/pdf", "file_size": 42, "version_number": 1},
        ],
        supplier_document_acceptances=[],
    )
    monkeypatch.setattr(documents_service, "db", database)

    assert await documents_service.get_supplier_document(other_supplier, "requirement-1") is None
    assert (await documents_service.list_supplier_documents(other_supplier))[0]["id"] == "requirement-2"

    first = await documents_service.accept_supplier_document(supplier_one, "requirement-1", "user-1")
    repeated = await documents_service.accept_supplier_document(supplier_one, "requirement-1", "user-1")
    second_supplier = await documents_service.accept_supplier_document(supplier_two, "requirement-1", "user-2")
    assert first["id"] == repeated["id"]
    assert first["accepted_at"] == repeated["accepted_at"]
    assert first["document_version_id"] == second_supplier["document_version_id"] == "version-1"
    assert len(database.supplier_document_acceptances.docs) == 2

    documents_module = next(module for module in supplier_assessment_module_registry.enabled_modules({
        "modules": {"documents": {"enabled": True}}
    }) if module.module_code == "documents")
    assert (await documents_module.get_completion(database, supplier_one)).completion_percent == 100.0
    assert (await documents_module.get_completion(database, supplier_two)).completion_percent == 100.0


def test_document_api_exposes_no_update_or_delete_mutation_routes():
    document_routes = [route for route in router.routes if "/documents" in route.path]
    assert document_routes
    assert all("PUT" not in route.methods and "DELETE" not in route.methods for route in document_routes)