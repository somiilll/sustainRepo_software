import pytest
from pydantic import ValidationError

from modules.supplier_assessment.contracts import (
    SupplierDataVerificationSubmit,
    SupplierResponsesSubmit,
)
from modules.supplier_assessment import ghg_submission_service
from modules.supplier_assessment.service import SupplierAssessmentService


def test_esg_final_submission_requires_verified_data_acknowledgement():
    with pytest.raises(ValidationError):
        SupplierResponsesSubmit(answers=[], is_draft=False, data_verified=False)


def test_esg_draft_does_not_require_verified_data_acknowledgement():
    payload = SupplierResponsesSubmit(answers=[], is_draft=True)
    assert payload.data_verified is False


def test_esg_final_submission_accepts_verified_data_acknowledgement():
    payload = SupplierResponsesSubmit(answers=[], is_draft=False, data_verified=True)
    assert payload.data_verified is True


def test_ghg_submission_contract_only_accepts_verified_data():
    assert SupplierDataVerificationSubmit(data_verified=True).data_verified is True
    with pytest.raises(ValidationError):
        SupplierDataVerificationSubmit(data_verified=False)


@pytest.mark.asyncio
async def test_ghg_service_rejects_unverified_submission_before_database_access():
    with pytest.raises(ValueError, match="reviewed and verified"):
        await ghg_submission_service.submit_supplier_ghg(
            {"id": "relationship-1"},
            "supplier-user-1",
            data_verified=False,
        )


def test_ghg_submission_contract_rejects_missing_data_verified_field():
    with pytest.raises(ValidationError):
        SupplierDataVerificationSubmit()


def test_esg_final_submission_rejects_missing_data_verified_flag():
    with pytest.raises(ValidationError):
        SupplierResponsesSubmit(answers=[], is_draft=False)


# Feature: ESG final submission must persist data verification audit fields.
@pytest.mark.asyncio
async def test_esg_final_submission_sets_data_verification_audit_fields(monkeypatch):
    service = SupplierAssessmentService()
    captured_update = {}

    class FakeResponsesCollection:
        async def update_many(self, *args, **kwargs):
            return None

        async def update_one(self, query, update):
            captured_update["query"] = query
            captured_update["update"] = update
            return None

    class FakeDB:
        supplier_questionnaire_responses = FakeResponsesCollection()

    monkeypatch.setattr("modules.supplier_assessment.service.db", FakeDB())

    async def fake_get_supplier(_relationship_id):
        return {"id": "rel-1", "questionnaire_ids": ["q-1"], "reporting_period": "FY 2026-27"}

    async def fake_current_response(*args, **kwargs):
        return {"id": "resp-1", "status": "in_progress", "answers": {}}

    async def fake_calculate(*args, **kwargs):
        return 88.5, {"score": "ok"}

    async def fake_refresh(*args, **kwargs):
        return {"overall_score": 80}

    async def fake_update_completion(*args, **kwargs):
        return None

    monkeypatch.setattr(service, "get_supplier", fake_get_supplier)
    monkeypatch.setattr(service, "_current_questionnaire_response", fake_current_response)
    monkeypatch.setattr(service, "_calculate_questionnaire_score", fake_calculate)
    monkeypatch.setattr(service, "refresh_supplier_canonical_score", fake_refresh)
    monkeypatch.setattr(service, "_update_completion_status", fake_update_completion)

    result = await service.submit_supplier_answers(
        questionnaire_id="q-1",
        supplier_relationship_id="rel-1",
        supplier_org_id="org-1",
        answers=[{"question_id": "q-item-1", "answer": "yes"}],
        is_draft=False,
        data_verified=True,
        verified_by="supplier-user-1",
    )

    assert result["status"] == "submitted"
    update_data = captured_update["update"]["$set"]
    assert update_data["data_verified"] is True
    assert isinstance(update_data.get("data_verified_at"), str)
    assert update_data["data_verified_by"] == "supplier-user-1"


# Feature: GHG final submission must persist data verification audit fields.
@pytest.mark.asyncio
async def test_ghg_final_submission_sets_data_verification_audit_fields(monkeypatch):
    captured_submission_update = {}

    class FakeEmissionRecordsCollection:
        async def find_one(self, *args, **kwargs):
            return None

        def find(self, *args, **kwargs):
            class _Cursor:
                async def to_list(self, _limit):
                    return [
                        {
                            "id": "em-1",
                            "revision_lineage_id": "lineage-1",
                            "revision_number": 1,
                            "total_emissions": 42.0,
                            "scope": "scope1",
                            "category": "Fuel",
                        }
                    ]

            return _Cursor()

        async def update_one(self, *args, **kwargs):
            return None

        async def update_many(self, query, update):
            if query.get("id") == {"$in": ["em-1"]}:
                captured_submission_update["update"] = update
            return None

    class FakeDB:
        emission_records = FakeEmissionRecordsCollection()

    async def fake_refresh_supplier_score(*args, **kwargs):
        return {"overall_score": 75}

    monkeypatch.setattr("modules.supplier_assessment.ghg_submission_service.db", FakeDB())
    monkeypatch.setattr(
        "modules.supplier_assessment.service.supplier_service.refresh_supplier_canonical_score",
        fake_refresh_supplier_score,
    )

    relationship = {"id": "rel-1", "reporting_period": "FY 2026-27"}
    result = await ghg_submission_service.submit_supplier_ghg(
        relationship,
        submitted_by="supplier-user-1",
        data_verified=True,
    )

    assert result["status"] == "submitted"
    assert result["data_verified"] is True
    assert isinstance(result.get("data_verified_at"), str)
    assert result["data_verified_by"] == "supplier-user-1"

    update_data = captured_submission_update["update"]["$set"]
    assert update_data["data_verified"] is True
    assert isinstance(update_data.get("data_verified_at"), str)
    assert update_data["data_verified_by"] == "supplier-user-1"