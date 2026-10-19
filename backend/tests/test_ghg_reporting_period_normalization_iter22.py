"""Regression tests for GHG reporting-period normalization contracts and scope3 bulk-save paths."""

import sys
import uuid
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

sys.path.insert(0, "/app/backend")

from bulk_upload_scope3.models import RowResult, UploadStatus
from bulk_upload_scope3.processors.upload_processor import UploadProcessor
from bulk_upload_scope3 import router as bulk_router
from modules.emissions.contracts import EmissionRecordCreate
from modules.emissions.c7_contracts import C7YearlyEntryCreate
from modules.supplier_assessment.contracts import SupplierEmissionCreate


class _InsertResult:
    def __init__(self, count: int):
        self.inserted_ids = [str(i) for i in range(count)]


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _limit):
        return list(self._docs)


class _Collection:
    def __init__(self, find_one_doc=None, find_docs=None):
        self.find_one_doc = find_one_doc
        self.find_docs = find_docs or []
        self.inserted = []
        self.updated = []
        self.deleted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)
        return _InsertResult(1)

    async def insert_many(self, docs):
        docs = list(docs)
        self.inserted.extend(docs)
        return _InsertResult(len(docs))

    async def update_one(self, query, update):
        self.updated.append({"query": query, "update": update})

    async def delete_many(self, query):
        self.deleted.append(query)

    async def find_one(self, *_args, **_kwargs):
        return self.find_one_doc

    def find(self, *_args, **_kwargs):
        return _Cursor(self.find_docs)


class _FakeDB:
    def __init__(self, *, job_doc=None, pending_docs=None):
        self.bulk_upload_jobs = _Collection(find_one_doc=job_doc)
        self.bulk_upload_pending_records = _Collection(find_docs=pending_docs)
        self.emission_records = _Collection()
        self.emission_history = _Collection()
        self.bulk_upload_errors = _Collection()


@pytest.mark.parametrize(
    "model_cls, field_name",
    [
        (EmissionRecordCreate, "reporting_period"),
        (C7YearlyEntryCreate, "reporting_year"),
        (SupplierEmissionCreate, "reporting_period"),
    ],
)
def test_contract_models_normalize_cy_and_fy_variants(model_cls, field_name):
    # Contracts: EmissionRecordCreate, C7YearlyEntryCreate, SupplierEmissionCreate
    base = {
        "facility_id": "fac-1",
        "scope": "scope1",
        "category": "Stationary Combustion",
        "sub_category": "Diesel",
    }
    if model_cls is C7YearlyEntryCreate:
        base = {
            "facility_id": "fac-1",
            "calculation_method": "activity_basis",
            "activity_type": "car_travel",
            "employees": [{"employee_id": "E1", "yearly_value": 10}],
        }
    if model_cls is SupplierEmissionCreate:
        base = {
            "scope": "scope1",
            "category": "Stationary Combustion",
        }

    payload_cy = {**base, field_name: "CY 2026"}
    payload_fy = {**base, field_name: "FY 2026-27"}

    model_cy = model_cls(**payload_cy)
    model_fy = model_cls(**payload_fy)

    assert getattr(model_cy, field_name) == "CY2026"
    assert getattr(model_fy, field_name) == "FY 2026-2027"


@pytest.mark.parametrize(
    "model_cls, field_name, value",
    [
        (EmissionRecordCreate, "reporting_period", "CY26"),
        (EmissionRecordCreate, "reporting_period", "FY 2026-2029"),
        (C7YearlyEntryCreate, "reporting_year", "2026"),
        (SupplierEmissionCreate, "reporting_period", "FY 2026-2028"),
    ],
)
def test_contract_models_reject_malformed_annual_values(model_cls, field_name, value):
    # Negative validation contracts for malformed annual periods
    base = {
        "facility_id": "fac-1",
        "scope": "scope1",
        "category": "Stationary Combustion",
        "sub_category": "Diesel",
    }
    if model_cls is C7YearlyEntryCreate:
        base = {
            "facility_id": "fac-1",
            "calculation_method": "activity_basis",
            "activity_type": "car_travel",
            "employees": [{"employee_id": "E1", "yearly_value": 10}],
        }
    if model_cls is SupplierEmissionCreate:
        base = {
            "scope": "scope1",
            "category": "Stationary Combustion",
        }

    with pytest.raises(ValidationError):
        model_cls(**{**base, field_name: value})


@pytest.mark.asyncio
async def test_bulk_upload_immediate_save_normalizes_reporting_period(monkeypatch):
    # Scope 3 bulk immediate-save path should normalize before emission_records.insert_many
    fake_db = _FakeDB()
    processor = UploadProcessor(fake_db, organization_id="org-1", user_id="user-1")

    async def _fake_process_sheet(*_args, **_kwargs):
        result = RowResult(
            sheet="C1 - Purchased Goods and Services",
            row=2,
            success=True,
            emission_id="rec-1",
            co2e=1.0,
            row_data={"reporting_period": "CY 2026"},
        )
        record = {
            "id": "rec-1",
            "facility_id": "fac-1",
            "organization_id": "org-1",
            "scope": "scope3",
            "category": "C1 - Purchased Goods and Services",
            "reporting_period": "CY 2026",
            "co2e_emissions": 1.0,
        }
        return [result], [record]

    async def _identity_limits(_results, records):
        return records, []

    async def _noop_assert(*_args, **_kwargs):
        return None

    async def _fake_caps(*_args, **_kwargs):
        return SimpleNamespace(
            scope1_enabled=True,
            scope2_enabled=True,
            scope3_enabled=True,
            is_scope3_sheet_enabled=lambda _code: True,
        )

    monkeypatch.setattr(processor, "_process_sheet", _fake_process_sheet)
    monkeypatch.setattr(processor, "_apply_period_row_limits", _identity_limits)
    monkeypatch.setattr("bulk_upload_scope3.processors.upload_processor.assert_period_row_batch_limit", _noop_assert)
    monkeypatch.setattr("bulk_upload_scope3.processors.upload_processor.resolve_ghg_capabilities", _fake_caps)

    # Minimal workbook bytes with one recognized sheet so process_upload loop runs.
    from openpyxl import Workbook
    import io

    wb = Workbook()
    ws = wb.active
    ws.title = "C1 - Purchased Goods and Services"
    ws.append(["Facility Name"])
    ws.append(["Test Facility"])
    stream = io.BytesIO()
    wb.save(stream)

    summary = await processor.process_upload(stream.getvalue(), "test.xlsx", validate_only=False)

    assert summary.status in {UploadStatus.COMPLETED, UploadStatus.PARTIAL_SUCCESS}
    assert fake_db.emission_records.inserted, "Expected immediate-save insert_many call"
    assert fake_db.emission_records.inserted[0]["reporting_period"] == "CY2026"


@pytest.mark.asyncio
async def test_bulk_upload_pending_save_normalizes_reporting_period(monkeypatch):
    # Scope 3 pending-save route should normalize before emission_records.insert_many
    job_id = f"job-{uuid.uuid4()}"
    pending_record = {
        "id": "pending-1",
        "facility_id": "fac-1",
        "organization_id": "org-1",
        "scope": "scope3",
        "category": "C1 - Purchased Goods and Services",
        "reporting_period": "FY 2026-27",
        "job_id": job_id,
        "expires_at": "2099-01-01T00:00:00Z",
    }
    fake_db = _FakeDB(
        job_doc={
            "id": job_id,
            "organization_id": "org-1",
            "success_count": 1,
            "error_count": 0,
            "created_emission_ids": [],
        },
        pending_docs=[pending_record],
    )

    async def _noop_assert(*_args, **_kwargs):
        return None

    monkeypatch.setattr("bulk_upload_scope3.router.assert_period_row_batch_limit", _noop_assert)

    result = await bulk_router.save_valid_rows(
        job_id=job_id,
        db=fake_db,
        current_user={"id": "user-1", "organization_id": "org-1", "email": "a@b.com", "full_name": "Admin"},
    )

    assert result["success"] is True
    assert fake_db.emission_records.inserted, "Expected pending-save insert_many call"
    assert fake_db.emission_records.inserted[0]["reporting_period"] == "FY 2026-2027"


def test_frontend_ghg_logs_cy_regex_and_overlap_guard_static_check():
    # Static frontend check for CY regex + overlap logic around date filtering in GHG Logs
    with open("/app/frontend/src/pages/Emissions.js", "r", encoding="utf-8") as handle:
        source = handle.read()

    assert r"period.match(/^CY\s*(\d{4})$/)" in source
    assert "rangesOverlap(cyStartNum, cyEndNum, filterStartNum, filterEndNum)" in source
