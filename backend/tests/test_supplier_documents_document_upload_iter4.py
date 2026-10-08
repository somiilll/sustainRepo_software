"""Regression tests for Supplier Documents DOCUMENT_UPLOAD lifecycle and mode compatibility."""

from copy import deepcopy
import uuid

import pytest

from modules.supplier_assessment import documents_service


# Module: lightweight in-memory collection/query helpers for documents_service tests
class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, field, direction):
        return _Cursor(sorted(self.docs, key=lambda item: item.get(field, 0), reverse=direction < 0))

    async def to_list(self, _limit):
        return deepcopy(self.docs)


class _Collection:
    def __init__(self, docs=None):
        self.docs = docs or []

    @staticmethod
    def _matches(document, query):
        for key, value in query.items():
            if key == "$or":
                if not any(_Collection._matches(document, part) for part in value):
                    return False
                continue
            actual = document.get(key)
            if isinstance(value, dict):
                if "$in" in value and actual not in value["$in"]:
                    return False
                if "$ne" in value and actual == value["$ne"]:
                    return False
                if "$exists" in value:
                    exists = key in document
                    if bool(value["$exists"]) != exists:
                        return False
            elif actual != value:
                return False
        return True

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
        stored["_id"] = "mongo-id"
        self.docs.append(stored)
        document["_id"] = "mongo-id"

    async def update_one(self, query, update, upsert=False):
        for document in self.docs:
            if self._matches(document, query):
                if "$set" in update:
                    document.update(deepcopy(update["$set"]))
                if "$addToSet" in update:
                    for key, value in update["$addToSet"].items():
                        existing = list(document.get(key) or [])
                        if value not in existing:
                            existing.append(value)
                        document[key] = existing
                return
        if upsert:
            new_doc = deepcopy(query)
            new_doc.update(deepcopy(update.get("$setOnInsert", {})))
            new_doc.update(deepcopy(update.get("$set", {})))
            self.docs.append(new_doc)

    async def update_many(self, query, update):
        for document in self.docs:
            if self._matches(document, query):
                if "$set" in update:
                    document.update(deepcopy(update["$set"]))


class _Database:
    def __init__(self):
        self.supplier_document_requirements = _Collection()
        self.supplier_document_versions = _Collection()
        self.supplier_document_submissions = _Collection()
        self.supplier_document_views = _Collection()
        self.supplier_relationships = _Collection()


class _Storage:
    def __init__(self):
        self.uploads = []

    async def upload_file(self, **kwargs):
        key = f"document-responses/{uuid.uuid4()}-{kwargs.get('filename', 'file.pdf')}"
        self.uploads.append({**kwargs, "key": key})
        return {"success": True, "key": key}


def _relationship(rel_id="rel-1", supplier_org_id="supplier-org-1"):
    return {
        "id": rel_id,
        "supplier_org_id": supplier_org_id,
        "customer_org_id": "customer-1",
        "assessment_program_id": "program-1",
        "assessment_program_version": 1,
        "reporting_period": "FY 2025-26",
        "is_active": True,
        "company_name": f"Supplier {rel_id}",
    }


def _seed_upload_document(db, relationship_id="rel-1", response_mode="DOCUMENT_UPLOAD"):
    db.supplier_document_versions.docs.append({
        "id": "ver-1",
        "customer_org_id": "customer-1",
        "original_filename": "source.pdf",
        "content_type": "application/pdf",
        "file_size": 100,
        "bucket_type": "supplier_assessment",
        "r2_key": "documents/source.pdf",
        "version_number": 1,
    })
    db.supplier_document_requirements.docs.append({
        "id": "req-1",
        "customer_org_id": "customer-1",
        "assessment_program_id": "program-1",
        "assessment_program_version": 1,
        "document_version_id": "ver-1",
        "response_mode": response_mode,
        "response_options": ["I have done it", "I will do it"] if response_mode == "STATUS" else [],
        "supplier_relationship_ids": [relationship_id],
        "assignment_mode": "selected",
        "is_active": True,
        "title": "Upload Document",
        "created_at": "2026-02-01T00:00:00+00:00",
    })


@pytest.fixture
def test_env(monkeypatch):
    # Feature area: documents_service DOCUMENT_UPLOAD and parent visibility workflow
    database = _Database()
    storage = _Storage()
    monkeypatch.setattr(documents_service, "db", database)
    monkeypatch.setattr(documents_service, "get_r2_storage", lambda: storage)
    return database, storage


@pytest.mark.asyncio
async def test_publish_invalid_response_mode_mentions_document_upload():
    with pytest.raises(ValueError) as exc_info:
        await documents_service.publish_agreement(
            customer_org_id="customer-1",
            created_by="admin-1",
            filename="policy.pdf",
            content_type="application/pdf",
            content=b"pdf",
            title="Mode Validation",
            response_mode="invalid_mode",
        )

    assert str(exc_info.value) == "Document response mode must be ACCEPTANCE, STATUS, or DOCUMENT_UPLOAD"


@pytest.mark.asyncio
async def test_publish_accepts_document_upload_response_mode(test_env, monkeypatch):
    database, storage = test_env
    relationship = _relationship()
    database.supplier_relationships.docs.append(relationship)

    async def _enabled(_org_id, _user_id):
        return {"modules": {"documents": {"enabled": True}}}

    async def _revision(_org_id, _config, _user_id):
        return {"program_id": "program-1", "version": 1}

    async def _context(_relationship):
        return {"config": {"modules": {"documents": {"enabled": True}}}}

    monkeypatch.setattr(documents_service, "_enable_documents_for_org", _enabled)
    monkeypatch.setattr(documents_service, "get_or_create_program_revision", _revision)
    monkeypatch.setattr(documents_service, "resolve_program_context", _context)

    published = await documents_service.publish_agreement(
        customer_org_id="customer-1",
        created_by="admin-1",
        filename="policy.pdf",
        content_type="application/pdf",
        content=b"pdf",
        title="DOC Upload Policy",
        response_mode="DOCUMENT_UPLOAD",
        relationship_ids=[relationship["id"]],
    )

    requirement = published["requirements"][0]
    assert requirement["response_mode"] == "DOCUMENT_UPLOAD"
    assert requirement["response_options"] == []
    assert storage.uploads[0]["content_type"] == "application/pdf"


@pytest.mark.asyncio
async def test_document_upload_requires_view_and_file_then_locks_and_parent_visibility(test_env):
    database, _ = test_env
    relationship = _relationship()
    database.supplier_relationships.docs.append(relationship)
    _seed_upload_document(database)

    with pytest.raises(ValueError, match="View the document"):
        await documents_service.submit_supplier_document_upload(relationship, "req-1", "supplier-user")

    await documents_service.mark_supplier_document_viewed(relationship, "req-1", "ver-1", "supplier-user")
    with pytest.raises(ValueError, match="Upload at least one response file"):
        await documents_service.submit_supplier_document_upload(relationship, "req-1", "supplier-user")

    await documents_service.upload_supplier_document_response_files(
        relationship,
        "req-1",
        "supplier-user",
        [{"filename": "reply-1.pdf", "content_type": "application/pdf", "content": b"one"}],
    )
    submitted = await documents_service.submit_supplier_document_upload(relationship, "req-1", "supplier-user")

    assert submitted["status"] == "submitted"
    assert submitted["parent_visible"] is True
    parent_rows = await documents_service.list_document_supplier_responses("customer-1", "req-1")
    assert len(parent_rows["responses"]) == 1
    assert parent_rows["responses"][0]["submission_status"] == "submitted"
    assert len(parent_rows["responses"][0]["response_files"]) == 1


@pytest.mark.asyncio
async def test_locked_upload_cannot_mutate_until_parent_reopen_then_resubmit_latest_only(test_env):
    database, _ = test_env
    relationship = _relationship()
    database.supplier_relationships.docs.append(relationship)
    _seed_upload_document(database)

    await documents_service.upload_supplier_document_response_files(
        relationship,
        "req-1",
        "supplier-user",
        [{"filename": "reply-1.pdf", "content_type": "application/pdf", "content": b"one"}],
    )
    await documents_service.mark_supplier_document_viewed(relationship, "req-1", "ver-1", "supplier-user")
    submitted = await documents_service.submit_supplier_document_upload(relationship, "req-1", "supplier-user")

    with pytest.raises(ValueError, match="locked"):
        await documents_service.upload_supplier_document_response_files(
            relationship,
            "req-1",
            "supplier-user",
            [{"filename": "reply-2.pdf", "content_type": "application/pdf", "content": b"two"}],
        )

    first_file_id = submitted["response_files"][0]["id"]
    with pytest.raises(ValueError, match="locked"):
        await documents_service.remove_supplier_document_response_file(relationship, "req-1", first_file_id)

    reopened = await documents_service.reopen_supplier_document("customer-1", relationship["id"], "req-1", "admin-1")
    assert reopened["status"] == "reopened"
    assert reopened["revision"] == 2
    assert reopened["response_files"][0]["id"] == first_file_id

    await documents_service.remove_supplier_document_response_file(relationship, "req-1", first_file_id)
    await documents_service.upload_supplier_document_response_files(
        relationship,
        "req-1",
        "supplier-user",
        [{"filename": "reply-replacement.pdf", "content_type": "application/pdf", "content": b"new"}],
    )
    latest = await documents_service.submit_supplier_document_upload(relationship, "req-1", "supplier-user")

    assert latest["status"] == "submitted"
    assert len(latest["response_files"]) == 1
    assert latest["response_files"][0]["original_filename"] == "reply-replacement.pdf"

    parent_rows = await documents_service.list_document_supplier_responses("customer-1", "req-1")
    parent_files = parent_rows["responses"][0]["response_files"]
    assert len(parent_files) == 1
    assert parent_files[0]["original_filename"] == "reply-replacement.pdf"

    parent_file = await documents_service.get_customer_supplier_document_response_file(
        "customer-1", "req-1", relationship["id"], parent_files[0]["id"]
    )
    assert parent_file["original_filename"] == "reply-replacement.pdf"

    old_file = await documents_service.get_customer_supplier_document_response_file(
        "customer-1", "req-1", relationship["id"], first_file_id
    )
    assert old_file is None


@pytest.mark.asyncio
async def test_acceptance_and_status_modes_still_work(test_env):
    database, _ = test_env
    relationship = _relationship()
    database.supplier_relationships.docs.append(relationship)

    # Feature area: compatibility guard for existing ACCEPTANCE mode
    _seed_upload_document(database, response_mode="ACCEPTANCE")
    await documents_service.mark_supplier_document_viewed(relationship, "req-1", "ver-1", "supplier-user")
    accepted = await documents_service.accept_supplier_document(relationship, "req-1", "supplier-user")
    assert accepted["status"] == "submitted"

    database.supplier_document_requirements.docs = []
    database.supplier_document_submissions.docs = []
    _seed_upload_document(database, response_mode="STATUS")
    responded = await documents_service.respond_to_supplier_document(
        relationship, "req-1", "I have done it", "supplier-user"
    )
    assert responded["status"] == "submitted"
    assert responded["response_value"] == "I have done it"
