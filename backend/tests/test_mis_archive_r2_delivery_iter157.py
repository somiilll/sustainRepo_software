"""MIS archive/R2 delivery regression tests for scheduled Send Now flows."""

from __future__ import annotations

import hashlib
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from fastapi.responses import StreamingResponse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.mis_reports import router as mis_router
from modules.mis_reports import service as mis_service
from modules.mis_reports.contracts import EmissionsSummaryRequest


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


def _admin_credentials_from_memory() -> tuple[str | None, str | None]:
    """Read admin credentials from memory/test_credentials.md (no guessing)."""
    credentials_path = Path("/app/memory/test_credentials.md")
    if not credentials_path.exists():
        return None, None

    content = credentials_path.read_text(encoding="utf-8")
    email_match = re.search(r"## Admin Account[\s\S]*?\*\*Email\*\*:\s*([^\n]+)", content)
    password_match = re.search(r"## Admin Account[\s\S]*?\*\*Password\*\*:\s*([^\n]+)", content)
    email = email_match.group(1).strip() if email_match else None
    password = password_match.group(1).strip() if password_match else None
    return email, password


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _limit):
        return list(self._docs)

    def sort(self, *_args, **_kwargs):
        return self


class _FakeCollection:
    def __init__(self, one_doc=None, list_docs=None):
        self.one_doc = one_doc
        self.list_docs = list_docs or []
        self.inserted = []

    async def find_one(self, *_args, **_kwargs):
        return dict(self.one_doc) if isinstance(self.one_doc, dict) else self.one_doc

    def find(self, *_args, **_kwargs):
        return _FakeCursor(self.list_docs)

    async def insert_one(self, doc):
        self.inserted.append(dict(doc))


class _FakeDB:
    def __init__(self):
        self.organizations = _FakeCollection(
            one_doc={
                "id": "org-1",
                "name": "Acme/Org Ltd",
                "reporting_year_type": "financial_year",
                "financial_year_start_month": 4,
            }
        )
        self.facilities = _FakeCollection(
            list_docs=[
                {"id": "facility-a", "name": "Plant A"},
                {"id": "facility-b", "name": "Plant B"},
            ]
        )
        self.mis_report_delivery_runs = _FakeCollection()
        self.mis_report_deliveries = _FakeCollection()


class _FakeReportingPeriodService:
    def __init__(self, _organization, _now):
        pass

    def resolve(self, frequency):
        return {
            "frequency": frequency,
            "reporting_period": {
                "label": "August 2026",
                "start_date": "2026-08-01",
                "end_date": "2026-08-31",
            },
            "comparison_period": {"label": "July 2026", "start_date": "2026-07-01", "end_date": "2026-07-31"},
            "ytd_period": {"start_date": "2026-04-01", "end_date": "2026-08-31"},
            "previous_ytd_period": {"start_date": "2025-04-01", "end_date": "2025-08-31"},
            "reporting_calendar": {"label": "FY 2026–27"},
        }

    @staticmethod
    def filters_for(filters, _period, _frequency):
        return dict(filters)


# Module: store_delivery_artifact key/checksum and immutable bucket contract
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "filename,content_type,content_bytes,expected_ext",
    [
        ("report.pdf", "application/pdf", b"%PDF-1.4\nsmall-pdf", "pdf"),
        (
            "report.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            b"PK\x03\x04small-xlsx",
            "xlsx",
        ),
    ],
)
async def test_store_delivery_artifact_builds_mis_reports_key_and_sha(monkeypatch, filename, content_type, content_bytes, expected_ext):
    captured = {}

    class _FakeStorage:
        async def upload_file(self, file_content, upload_filename, bucket_type, upload_content_type, **kwargs):
            captured["file_content"] = file_content
            captured["filename"] = upload_filename
            captured["bucket_type"] = bucket_type
            captured["content_type"] = upload_content_type
            captured["kwargs"] = kwargs
            return {
                "success": True,
                "key": kwargs["object_key"],
                "file_size": len(file_content),
            }

    import r2_storage

    monkeypatch.setattr(r2_storage, "get_r2_storage", lambda: _FakeStorage())

    delivery_run_id = "d3f8e14f-aabc-4433-9f9f-2f958d57c9aa"
    organization_name = "Acme/Org Ltd"
    archive_date = "2026-02-14"
    artifact = await mis_service.store_delivery_artifact(
        content_bytes,
        filename,
        content_type,
        organization_name,
        archive_date,
        delivery_run_id,
    )

    expected_key = f"{mis_service.archive_org_name(organization_name)}/{archive_date}/{delivery_run_id}/report.{expected_ext}"
    expected_sha = hashlib.sha256(content_bytes).hexdigest()

    assert captured["bucket_type"] == "mis_reports"
    assert artifact["bucket_type"] == "mis_reports"
    assert captured["kwargs"]["object_key"] == expected_key
    assert artifact["storage_key"] == expected_key
    assert artifact["sha256"] == expected_sha
    assert artifact["file_size"] == len(content_bytes)
    assert "9067d872-8a3a-4ed9-8494-e3ef04952f7c" not in artifact["storage_key"]


# Module: optional live R2 smoke write/read/delete in mis-reports-dev
@pytest.mark.asyncio
async def test_r2_mis_reports_bucket_smoke_write_read_delete():
    if not os.environ.get("R2_BUCKET_MIS_REPORTS"):
        pytest.skip("R2_BUCKET_MIS_REPORTS is not configured")

    import r2_storage

    storage = r2_storage.get_r2_storage()
    object_key = f"pytest-temp/{datetime.now(timezone.utc).strftime('%Y-%m-%d')}/{uuid.uuid4()}/report.txt"
    content = b"temporary-r2-mis-smoke"
    uploaded = False
    try:
        result = await storage.upload_file(
            content,
            "report.txt",
            "mis_reports",
            "text/plain",
            metadata={"purpose": "pytest-temp-cleanup"},
            object_key=object_key,
        )
        uploaded = bool(result.get("success"))
        assert result.get("bucket_type") == "mis_reports"
        assert result.get("key") == object_key

        downloaded, content_type = await storage.get_file("mis_reports", object_key)
        assert downloaded == content
        assert content_type in {"text/plain", "binary/octet-stream", "application/octet-stream"}
        assert hashlib.sha256(downloaded).hexdigest() == hashlib.sha256(content).hexdigest()
    finally:
        if uploaded:
            await storage.delete_file("mis_reports", object_key)


# Module: send_schedule persisted immutable snapshots/artifacts/delivery timestamps
@pytest.mark.asyncio
async def test_send_schedule_persists_required_delivery_run_fields(monkeypatch):
    fake_db = _FakeDB()
    monkeypatch.setattr(mis_service, "db", fake_db)
    monkeypatch.setattr(mis_service, "ReportingPeriodService", _FakeReportingPeriodService)
    monkeypatch.setattr(mis_service, "now_iso", lambda: "2026-02-14T10:00:00+00:00")

    async def _fake_aggregate_emissions(_filters, _current_user):
        return {
            "total_emissions": 42.5,
            "unit": "tCO2e",
            "record_count": 2,
            "scope_breakdown": [{"scope": "scope1", "emissions": 42.5}],
        }

    async def _fake_exec_report(_filters, _current_user, _context, _sections):
        return {"kpis": [], "current": {"scope_breakdown": []}}

    async def _fake_store_delivery_artifact(content, filename, content_type, _org_name, _archive_date, _delivery_id):
        ext = filename.rsplit(".", 1)[-1].lower()
        return {
            "format": ext,
            "filename": filename,
            "content_type": content_type,
            "file_size": len(content),
            "storage_key": f"Acme-Org Ltd/2026-02-14/run-id/report.{ext}",
            "bucket_type": "mis_reports",
            "sha256": hashlib.sha256(content).hexdigest(),
        }

    async def _fake_send_email(_email, _subject, _html, _attachments):
        return True

    monkeypatch.setattr(mis_service, "aggregate_emissions", _fake_aggregate_emissions)
    monkeypatch.setattr(mis_service, "build_executive_mis_report", _fake_exec_report)
    monkeypatch.setattr(mis_service, "build_executive_pdf", lambda *_: b"%PDF-1.4 test")
    monkeypatch.setattr(mis_service, "build_executive_excel", lambda *_: b"PK\x03\x04 test")
    monkeypatch.setattr(mis_service, "store_delivery_artifact", _fake_store_delivery_artifact)
    monkeypatch.setattr(mis_service, "send_email_with_attachments", _fake_send_email)

    schedule = {
        "id": "schedule-123",
        "name": "Monthly ESG Reports",
        "organization_id": "org-1",
        "frequency": "monthly",
        "timezone": "UTC",
        "facility_mode": "specific",
        "filters": {
            "reporting_period_start": "2026-08",
            "reporting_period_end": "2026-08",
            "facility_ids": ["facility-a", "facility-b"],
            "scopes": ["scope1"],
            "categories": ["Combustion"],
        },
        "content": {"sections": ["executive", "emissions", "targets"]},
        "recipients": [
            {"id": "r1", "name": "Alice", "email": "alice@example.com"},
            {"id": "r2", "name": "Bob", "email": "bob@example.com"},
        ],
        "recipient_emails": ["alice@example.com", "bob@example.com"],
    }

    current_user = {"role": "admin", "organization_id": "org-1", "email": "admin@example.com"}
    delivery = await mis_service.send_schedule(schedule, current_user)

    assert delivery["id"] == delivery["delivery_run_id"]
    assert delivery["organization_id"] == "org-1"
    assert delivery["schedule_id"] == "schedule-123"
    assert delivery["requested_at"] == "2026-02-14T10:00:00+00:00"
    assert delivery["generated_at"] == "2026-02-14T10:00:00+00:00"
    assert delivery["report_configuration_snapshot"]["facility_selection"]["facility_ids"] == ["facility-a", "facility-b"]
    assert delivery["report_configuration_snapshot"]["sections"] == ["executive", "emissions", "targets"]
    assert delivery["report_configuration_snapshot"]["filters"]["categories"] == ["Combustion"]
    assert len(delivery["recipient_snapshot"]) == 2
    assert delivery["report_period"]["label"] == "August 2026"
    assert delivery["pdf_storage_key"].endswith("/report.pdf")
    assert delivery["excel_storage_key"].endswith("/report.xlsx")
    assert isinstance(delivery["pdf_file_size"], int) and delivery["pdf_file_size"] > 0
    assert isinstance(delivery["excel_file_size"], int) and delivery["excel_file_size"] > 0
    assert isinstance(delivery["pdf_checksum"], str) and len(delivery["pdf_checksum"]) == 64
    assert isinstance(delivery["excel_checksum"], str) and len(delivery["excel_checksum"]) == 64
    assert delivery["schedule_snapshot"] == schedule

    assert len(fake_db.mis_report_delivery_runs.inserted) == 1
    persisted_run = fake_db.mis_report_delivery_runs.inserted[0]
    assert persisted_run["id"] == persisted_run["delivery_run_id"]
    assert persisted_run["recipient_snapshot"][0]["email"] == "alice@example.com"

    assert len(fake_db.mis_report_deliveries.inserted) == 2
    assert all(item.get("sent_at") == "2026-02-14T10:00:00+00:00" for item in fake_db.mis_report_deliveries.inserted)


# Module: send_schedule partial archive failure cleanup and persisted failed-run contract
@pytest.mark.asyncio
async def test_send_schedule_cleans_pdf_when_second_artifact_upload_fails(monkeypatch):
    fake_db = _FakeDB()
    monkeypatch.setattr(mis_service, "db", fake_db)
    monkeypatch.setattr(mis_service, "ReportingPeriodService", _FakeReportingPeriodService)
    monkeypatch.setattr(mis_service, "now_iso", lambda: "2026-02-14T11:00:00+00:00")
    async def _fake_summary(*_args, **_kwargs):
        return {
            "total_emissions": 1.0,
            "unit": "tCO2e",
            "record_count": 1,
            "scope_breakdown": [{"scope": "scope1", "emissions": 1.0}],
        }

    async def _fake_exec_report(*_args, **_kwargs):
        return {"kpis": [], "current": {"scope_breakdown": []}}

    monkeypatch.setattr(mis_service, "aggregate_emissions", _fake_summary)
    monkeypatch.setattr(mis_service, "build_executive_mis_report", _fake_exec_report)
    monkeypatch.setattr(mis_service, "build_executive_pdf", lambda *_: b"pdf-bytes")
    monkeypatch.setattr(mis_service, "build_executive_excel", lambda *_: b"xlsx-bytes")

    call_counter = {"count": 0}

    async def _store_with_second_failure(_content, filename, content_type, _org_name, _archive_date, _delivery_id):
        call_counter["count"] += 1
        if call_counter["count"] == 1:
            return {
                "format": "pdf",
                "filename": filename,
                "content_type": content_type,
                "file_size": 9,
                "storage_key": "Acme-Org Ltd/2026-02-14/run-id/report.pdf",
                "bucket_type": "mis_reports",
                "sha256": hashlib.sha256(b"pdf-bytes").hexdigest(),
            }
        raise RuntimeError("xlsx upload failed")

    monkeypatch.setattr(mis_service, "store_delivery_artifact", _store_with_second_failure)

    deleted = []

    class _FakeDeleteStorage:
        async def delete_file(self, bucket_type, key):
            deleted.append((bucket_type, key))
            return True

    import r2_storage

    monkeypatch.setattr(r2_storage, "get_r2_storage", lambda: _FakeDeleteStorage())

    schedule = {
        "id": "schedule-456",
        "name": "Monthly ESG Reports",
        "organization_id": "org-1",
        "frequency": "monthly",
        "timezone": "UTC",
        "facility_mode": "all",
        "filters": {
            "reporting_period_start": "2026-08",
            "reporting_period_end": "2026-08",
            "facility_ids": [],
            "scopes": ["scope1"],
            "categories": [],
        },
        "content": {"sections": ["executive"]},
        "recipients": [{"id": "r1", "name": "Alice", "email": "alice@example.com"}],
        "recipient_emails": ["alice@example.com"],
    }

    current_user = {"role": "admin", "organization_id": "org-1", "email": "admin@example.com"}
    failed_delivery = await mis_service.send_schedule(schedule, current_user)

    assert failed_delivery["status"] == "failed"
    assert failed_delivery["artifacts"] == []
    assert failed_delivery["pdf_storage_key"] is None
    assert failed_delivery["excel_storage_key"] is None
    assert failed_delivery["pdf_checksum"] is None
    assert failed_delivery["excel_checksum"] is None
    assert deleted == [("mis_reports", "Acme-Org Ltd/2026-02-14/run-id/report.pdf")]

    persisted_failed = fake_db.mis_report_delivery_runs.inserted[0]
    assert persisted_failed["artifacts"] == []
    assert persisted_failed["pdf_storage_key"] is None
    assert persisted_failed["excel_storage_key"] is None
    assert persisted_failed["pdf_checksum"] is None
    assert persisted_failed["excel_checksum"] is None
    assert len(fake_db.mis_report_deliveries.inserted) == 0


# Module: export/pdf regression remains direct on-demand path (no schedule archive flow)
@pytest.mark.asyncio
async def test_export_pdf_route_returns_streaming_response_without_archive_flow(monkeypatch):
    async def _allow(_user):
        return None

    async def _fake_report(_filters, _user):
        return {"kpis": [], "current": {"scope_breakdown": []}}

    async def _fake_context(_user):
        return ({"name": "Acme Org"}, True)

    async def _should_not_archive(*_args, **_kwargs):
        raise AssertionError("Archive storage should not be called by direct export path")

    monkeypatch.setattr(mis_router, "require_mis_admin", _allow)
    monkeypatch.setattr(mis_router, "build_executive_mis_report", _fake_report)
    monkeypatch.setattr(mis_router, "get_mis_reporting_context", _fake_context)
    monkeypatch.setattr(mis_router, "build_executive_pdf", lambda *_: b"%PDF-1.4 direct-export")
    monkeypatch.setattr(mis_service, "store_delivery_artifact", _should_not_archive)

    request = EmissionsSummaryRequest(
        reporting_period_start="2026-08",
        reporting_period_end="2026-08",
        facility_ids=[],
        scopes=["scope1"],
        categories=[],
    )
    user = {"role": "admin", "organization_id": "org-1", "email": "admin@example.com"}

    response = await mis_router.export_emissions_summary("pdf", request, user)
    assert isinstance(response, StreamingResponse)
    assert response.media_type == "application/pdf"
    assert "attachment; filename=MIS_Emissions_Summary_2026-08_2026-08.pdf" in response.headers.get("content-disposition", "")


# Module: live API regression for direct export endpoint behavior (no send-now side-effects)
def test_live_export_pdf_endpoint_is_direct_download_contract():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not available")

    admin_email, admin_password = _admin_credentials_from_memory()
    if not admin_email or not admin_password:
        pytest.skip("Admin credentials missing in /app/memory/test_credentials.md")

    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})

    login = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": admin_email, "password": admin_password},
        timeout=30,
    )
    assert login.status_code == 200
    token = login.json().get("token") or login.json().get("access_token")
    assert isinstance(token, str) and token

    response = client.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary/export/pdf",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "reporting_period_start": "2026-08",
            "reporting_period_end": "2026-08",
            "facility_ids": [],
            "scopes": ["scope1", "scope2", "scope3", "biogenic"],
            "categories": [],
        },
        timeout=90,
    )

    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith("application/pdf")
    assert "attachment; filename=MIS_Emissions_Summary_2026-08_2026-08.pdf" in response.headers.get("content-disposition", "")
    assert len(response.content) > 200