"""Focused unit tests for supplier training validation and progress/version behavior."""

from copy import deepcopy

import pytest

from modules.supplier_assessment import training_service
from modules.supplier_assessment.module_registry import TrainingAssessmentModule


# --- Minimal async collection fakes for training module/service tests ---
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
        for key, value in query.items():
            if isinstance(value, dict) and "$in" in value:
                if doc.get(key) not in value["$in"]:
                    return False
                continue
            if doc.get(key) != value:
                return False
        return True

    async def find_one(self, query, _projection=None):
        for doc in self.docs:
            if self._matches(doc, query):
                return deepcopy(doc)
        return None

    def find(self, query, _projection=None):
        return _Cursor([doc for doc in self.docs if self._matches(doc, query)])

    async def count_documents(self, query):
        return len([doc for doc in self.docs if self._matches(doc, query)])

    async def update_one(self, query, update, upsert=False):
        for index, doc in enumerate(self.docs):
            if self._matches(doc, query):
                next_doc = deepcopy(doc)
                next_doc.update(update.get("$set", {}))
                self.docs[index] = next_doc
                return
        if upsert:
            self.docs.append(deepcopy(update.get("$set", {})))

    async def insert_one(self, doc):
        self.docs.append(deepcopy(doc))


class _DB:
    def __init__(self, **collections):
        for name, docs in collections.items():
            setattr(self, name, _Collection(docs))


@pytest.mark.asyncio
async def test_create_training_requires_title(monkeypatch):
    # Completion is server-owned at 100%; the only early form validation is title presence.
    with pytest.raises(ValueError, match="Title"):
        await training_service.create_training(
            org_id="org-1",
            user_id="user-1",
            title="",
            description="desc",
            threshold=0,
            file_name="training.pdf",
            content_type="application/pdf",
            content=b"%PDF-1.4",
            relationship_ids=["rel-1"],
        )


@pytest.mark.asyncio
async def test_create_training_always_stores_a_100_percent_threshold(monkeypatch):
    fake_db = _DB(
        organizations=[{"id": "org-1", "name": "Customer One"}],
        supplier_relationships=[{"id": "rel-1", "customer_org_id": "org-1", "is_active": True}],
        supplier_training_contents=[], supplier_training_versions=[],
        supplier_training_requirements=[], supplier_training_assignments=[],
    )

    class _Storage:
        async def upload_file(self, *_args, **_kwargs):
            return {"key": "supplier-assessment/training/test.pdf"}

    async def _enabled_training(_org_id):
        return {"modules": {"training": {"enabled": True}}}

    async def _program_context(_relationship):
        return {"config": {"modules": {}}}

    async def _revision(*_args):
        return {"program_id": "program-1", "version": 1}

    monkeypatch.setattr(training_service, "db", fake_db)
    monkeypatch.setattr(training_service, "get_r2_storage", lambda: _Storage())
    monkeypatch.setattr(training_service.sustainability_config_service, "resolve_supplier_assessment_config", _enabled_training)
    monkeypatch.setattr(training_service, "resolve_program_context", _program_context)
    monkeypatch.setattr(training_service, "get_or_create_program_revision", _revision)

    result = await training_service.create_training(
        org_id="org-1", user_id="user-1", title="Safety", description="desc", threshold=1,
        file_name="training.pdf", content_type="application/pdf", content=b"%PDF-1.4",
        relationship_ids=["rel-1"], due_date="2026-12-31",
    )

    assert result["training"]["completion_threshold"] == 100.0
    assert fake_db.supplier_training_requirements.docs[0]["completion_threshold"] == 100.0


@pytest.mark.asyncio
async def test_create_training_rejects_unsupported_content_type():
    # training_service.create_training supported file types only
    with pytest.raises(ValueError, match="Unsupported training file"):
        await training_service.create_training(
            org_id="org-1",
            user_id="user-1",
            title="Intro Training",
            description="desc",
            threshold=80,
            file_name="training.txt",
            content_type="text/plain",
            content=b"not-allowed",
            relationship_ids=["rel-1"],
        )


def test_supported_training_mime_types_include_requested_formats():
    # Supported canonical types for PDF/PPT/PPTX/audio/video
    assert "application/pdf" in training_service.ALLOWED_TYPES
    assert "application/vnd.ms-powerpoint" in training_service.ALLOWED_TYPES
    assert "application/vnd.openxmlformats-officedocument.presentationml.presentation" in training_service.ALLOWED_TYPES
    assert "audio/mpeg" in training_service.ALLOWED_TYPES
    assert "video/mp4" in training_service.ALLOWED_TYPES


@pytest.mark.asyncio
async def test_update_progress_status_lifecycle_and_version_id_immutable(monkeypatch):
    # Progress lifecycle and immutable training_version_id persistence
    fake_db = _DB(
        supplier_training_assignments=[{
            "id": "assignment-1",
            "supplier_relationship_id": "relationship-1",
            "training_requirement_id": "requirement-1",
            "requirement_version_id": "training-version-immutable",
            "is_active": True,
        }],
        supplier_training_requirements=[{"id": "requirement-1", "completion_threshold": 80}],
        supplier_training_progress=[],
    )
    monkeypatch.setattr(training_service, "db", fake_db)

    relationship = {"id": "relationship-1"}

    status_zero = await training_service.update_progress(relationship, "assignment-1", 0, "supplier-user")
    assert status_zero["status"] == "not_started"
    assert status_zero["training_version_id"] == "training-version-immutable"

    status_mid = await training_service.update_progress(relationship, "assignment-1", 50, "supplier-user")
    assert status_mid["status"] == "in_progress"
    assert status_mid["training_version_id"] == "training-version-immutable"
    assert status_mid["completed_at"] is None

    status_done = await training_service.update_progress(relationship, "assignment-1", 80, "supplier-user")
    assert status_done["status"] == "completed"
    assert status_done["training_version_id"] == "training-version-immutable"
    assert status_done["completed_at"] is not None

    with pytest.raises(ValueError, match="between 0 and 100"):
        await training_service.update_progress(relationship, "assignment-1", 101, "supplier-user")


@pytest.mark.asyncio
async def test_training_module_completion_empty_and_completed_paths():
    # module_registry.TrainingAssessmentModule completion contract
    module = TrainingAssessmentModule()

    empty_db = _DB(supplier_training_assignments=[], supplier_training_progress=[])
    empty_completion = await module.get_completion(empty_db, {"id": "relationship-1"})
    assert empty_completion.completion_percent == 100.0

    populated_db = _DB(
        supplier_training_assignments=[
            {"id": "a1", "supplier_relationship_id": "relationship-1", "is_active": True, "requirement_version_id": "v1"},
            {"id": "a2", "supplier_relationship_id": "relationship-1", "is_active": True, "requirement_version_id": "v2"},
        ],
        supplier_training_progress=[
            {"training_assignment_id": "a1", "supplier_relationship_id": "relationship-1", "status": "completed"},
            {"training_assignment_id": "a2", "supplier_relationship_id": "relationship-1", "status": "in_progress"},
        ],
    )
    partial_completion = await module.get_completion(populated_db, {"id": "relationship-1"})
    assert partial_completion.completion_percent == 50.0
