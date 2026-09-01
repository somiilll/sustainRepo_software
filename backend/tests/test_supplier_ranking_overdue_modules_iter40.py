"""Supplier ranking overdue-module regression tests (live API + isolated ranking service logic)."""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

import pytest
import requests

from modules.supplier_assessment import ranking_service
from modules.supplier_assessment.ghg_submission_service import has_overdue_supplier_ghg_submission_window


# Supplier ranking features: payload contract + overdue module state evaluation


def _read_env_value(path: str, key: str) -> str | None:
    env_path = Path(path)
    if not env_path.exists():
        return None
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        current_key, value = line.split("=", 1)
        if current_key.strip() == key:
            return value.strip().strip('"').strip("'")
    return None


def _backend_base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL") or _read_env_value("/app/frontend/.env", "REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL unavailable for live API checks")
    return base.rstrip("/")


def _admin_credentials() -> tuple[str, str]:
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("/app/memory/test_credentials.md missing")
    text = path.read_text(encoding="utf-8")

    blocks = re.split(r"\n## ", text)
    for index, block in enumerate(blocks):
        normalized = block if index == 0 else f"## {block}"
        email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", normalized)
        password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", normalized)
        role_match = re.search(r"\*\*Role\*\*:\s*([^\n]+)", normalized)
        user_type_match = re.search(r"\*\*User Type\*\*:\s*([^\n]+)", normalized)
        if not email_match or not password_match or not role_match:
            continue
        role = role_match.group(1).strip()
        user_type = user_type_match.group(1).strip() if user_type_match else ""
        if role == "admin" and user_type != "supplier":
            return email_match.group(1).strip(), password_match.group(1).strip()
    pytest.skip("Could not parse admin credentials from /app/memory/test_credentials.md")


@pytest.fixture(scope="module")
def admin_session() -> Dict[str, Any]:
    base_url = _backend_base_url()
    email, password = _admin_credentials()
    login_response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert login_response.status_code == 200, login_response.text[:400]
    token = (login_response.json() or {}).get("access_token")
    assert token, "No access_token returned from /api/auth/login"

    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}"})
    return {"base_url": base_url, "session": session}


def test_live_rankings_payload_contract(admin_session):
    base_url = admin_session["base_url"]
    session = admin_session["session"]
    response = session.get(f"{base_url}/api/supplier-assessment/rankings", timeout=30)
    assert response.status_code == 200, response.text[:400]
    body = response.json()

    assert isinstance(body.get("rankings"), list)
    assert isinstance(body.get("total_suppliers"), int)
    assert isinstance(body.get("ranked_suppliers"), int)
    assert isinstance(body.get("score_distribution"), dict)
    assert isinstance(body.get("averages"), dict)
    assert isinstance(body.get("module_summary"), dict)

    if body["rankings"]:
        row = body["rankings"][0]
        assert "supplier_id" in row
        assert "company_name" in row
        assert isinstance(row.get("overdue_modules") or [], list)
        assert isinstance(row.get("document_statuses") or [], list)
        assert isinstance(row.get("training_statuses") or [], list)


def test_overdue_kpi_counts_each_supplier_once(admin_session):
    """Frontend KPI regression: overdue follow-up counts suppliers, not overdue module entries."""
    base_url = admin_session["base_url"]
    session = admin_session["session"]
    response = session.get(f"{base_url}/api/supplier-assessment/rankings", timeout=30)
    assert response.status_code == 200, response.text[:400]
    rankings = (response.json() or {}).get("rankings") or []

    frontend_overdue_count = len([row for row in rankings if (row.get("overdue_modules") or [])])
    unique_suppliers_with_overdue = len({
        row.get("supplier_id")
        for row in rankings
        if row.get("supplier_id") and (row.get("overdue_modules") or [])
    })

    assert frontend_overdue_count == unique_suppliers_with_overdue
    assert frontend_overdue_count <= len(rankings)


class _FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = [dict(doc) for doc in docs]

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, _limit: int):
        return [dict(doc) for doc in self._docs]


class _FakeCollection:
    def __init__(self, docs: List[Dict[str, Any]] | None = None):
        self._docs = docs or []

    def find(self, *_args, **_kwargs):
        return _FakeCursor(self._docs)


class _FakeDB:
    def __init__(self, *, suppliers: List[Dict[str, Any]], questionnaires=None, responses=None, ghg_submissions=None, revenue_submissions=None, doc_requirements=None, doc_submissions=None, training_requirements=None, training_assignments=None, training_progress=None):
        self.supplier_relationships = _FakeCollection(suppliers)
        self.supplier_questionnaires = _FakeCollection(questionnaires or [])
        self.supplier_questionnaire_responses = _FakeCollection(responses or [])
        self.supplier_ghg_submissions = _FakeCollection(ghg_submissions or [])
        self.supplier_revenue_submissions = _FakeCollection(revenue_submissions or [])
        self.supplier_document_requirements = _FakeCollection(doc_requirements or [])
        self.supplier_document_submissions = _FakeCollection(doc_submissions or [])
        self.supplier_training_requirements = _FakeCollection(training_requirements or [])
        self.supplier_training_assignments = _FakeCollection(training_assignments or [])
        self.supplier_training_progress = _FakeCollection(training_progress or [])


def _iso_days(delta_days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=delta_days)).date().isoformat()


def _supplier_base() -> Dict[str, Any]:
    return {
        "id": "supplier-1",
        "customer_org_id": "customer-1",
        "company_name": "TEST Supplier",
        "is_active": True,
        "reporting_period": "FY 2026-27",
        "assessment_program_id": "program-1",
        "assessment_program_version": 1,
        "canonical_score_snapshot": {
            "esg_score": 72,
            "environment_score": 70,
            "social_score": 73,
            "governance_score": 74,
        },
        "modules_enabled": ["esg", "ghg", "documents", "training"],
        "revenue_required": True,
        "due_date": _iso_days(-5),
    }


@pytest.mark.asyncio
async def test_overdue_modules_include_ghg_and_annual_revenue_when_due(monkeypatch):
    fake_db = _FakeDB(suppliers=[_supplier_base()])
    monkeypatch.setattr(ranking_service, "db", fake_db)

    async def _ghg_overdue(_relationship, _statuses):
        return True

    monkeypatch.setattr(ranking_service, "has_overdue_supplier_ghg_submission_window", _ghg_overdue)
    payload = await ranking_service.get_supplier_rankings(None, "customer-1", "FY 2026-27")
    row = payload["rankings"][0]

    assert "GHG Emissions" in row["overdue_modules"]
    assert "Annual Revenue" in row["overdue_modules"]


@pytest.mark.asyncio
async def test_submitted_ghg_and_revenue_are_not_flagged_overdue(monkeypatch):
    fake_db = _FakeDB(
        suppliers=[_supplier_base()],
        revenue_submissions=[
            {
                "supplier_relationship_id": "supplier-1",
                "reporting_period": "FY 2026-27",
                "status": "submitted",
                "parent_visible": True,
            }
        ],
    )
    monkeypatch.setattr(ranking_service, "db", fake_db)

    async def _ghg_not_overdue(_relationship, _statuses):
        return False

    monkeypatch.setattr(ranking_service, "has_overdue_supplier_ghg_submission_window", _ghg_not_overdue)
    payload = await ranking_service.get_supplier_rankings(None, "customer-1", "FY 2026-27")
    row = payload["rankings"][0]

    assert "GHG Emissions" not in row["overdue_modules"]
    assert "Annual Revenue" not in row["overdue_modules"]


@pytest.mark.asyncio
async def test_existing_esg_documents_training_overdue_logic_still_available(monkeypatch):
    supplier = _supplier_base()
    supplier["questionnaire_ids"] = ["q-1"]
    fake_db = _FakeDB(
        suppliers=[supplier],
        questionnaires=[
            {
                "id": "q-1",
                "question_count": 2,
                "due_date": _iso_days(-7),
            }
        ],
        responses=[],
        doc_requirements=[
            {
                "id": "doc-1",
                "document_version_id": "doc-v1",
                "title": "Code of Conduct",
                "due_date": _iso_days(-7),
                "reporting_period": "FY 2026-27",
                "supplier_relationship_ids": ["supplier-1"],
                "assessment_program_id": "program-1",
                "assessment_program_version": 1,
            }
        ],
        training_requirements=[
            {
                "id": "training-1",
                "title": "Safety Training",
                "due_date": _iso_days(-7),
            }
        ],
        training_assignments=[
            {
                "id": "assignment-1",
                "supplier_relationship_id": "supplier-1",
                "training_requirement_id": "training-1",
                "reporting_period": "FY 2026-27",
            }
        ],
        training_progress=[],
    )
    monkeypatch.setattr(ranking_service, "db", fake_db)

    async def _ghg_not_overdue(_relationship, _statuses):
        return False

    monkeypatch.setattr(ranking_service, "has_overdue_supplier_ghg_submission_window", _ghg_not_overdue)
    payload = await ranking_service.get_supplier_rankings(None, "customer-1", "FY 2026-27")
    row = payload["rankings"][0]

    assert "ESG Questionnaire" in row["overdue_modules"]
    assert "Documents" in row["overdue_modules"]
    assert "Training" in row["overdue_modules"]


@pytest.mark.asyncio
async def test_ghg_submission_window_helper_does_not_flag_submitted_period():
    relationship = {
        "id": "supplier-1",
        "customer_org_id": "customer-1",
        "reporting_period": "CY2024",
        "financial_year_start_month": 1,
        "ghg_submission_frequency": "monthly",
    }
    fully_submitted = {f"2024-{month:02d}": "submitted" for month in range(1, 13)}

    is_overdue = await has_overdue_supplier_ghg_submission_window(
        relationship,
        fully_submitted,
    )
    assert is_overdue is False
