"""BRSR import proposals API + lifecycle regression tests (P0 proposal workflow)."""

import os
import re
import uuid
from typing import Dict

import pytest
import requests
from pymongo import MongoClient


def _read_env_value(file_path: str, key: str) -> str:
    if not os.path.exists(file_path):
        return ""
    with open(file_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key:
                return v.strip().strip('"').strip("'")
    return ""


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_env_value("/app/frontend/.env", "REACT_APP_BACKEND_URL")
MONGO_URL = os.environ.get("MONGO_URL") or _read_env_value("/app/backend/.env", "MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _read_env_value("/app/backend/.env", "DB_NAME")


def _read_test_credentials() -> Dict[str, str]:
    with open("/app/memory/test_credentials.md", "r", encoding="utf-8") as credentials_file:
        content = credentials_file.read()
    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", content)
    password_match = re.search(r"Password\*\*:\s*(\S+)", content)
    assert email_match and password_match, "Test credentials are missing"
    return {"email": email_match.group(0), "password": password_match.group(1)}


@pytest.fixture(scope="session")
def api_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_context(api_session: requests.Session) -> Dict[str, str]:
    # Module: Auth bootstrap for API-level proposal tests
    assert BASE_URL, "Missing REACT_APP_BACKEND_URL"
    credentials = _read_test_credentials()
    response = api_session.post(
        f"{BASE_URL}/api/auth/login",
        json=credentials,
        timeout=20,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code}"
    data = response.json()
    token = data.get("access_token")
    user = data.get("user") or {}
    org_id = user.get("organization_id") or user.get("org_id")

    assert token and isinstance(token, str)
    assert org_id and isinstance(org_id, str)
    return {"token": token, "org_id": org_id}


@pytest.fixture(scope="session")
def mongo_db():
    assert MONGO_URL, "Missing MONGO_URL"
    assert DB_NAME, "Missing DB_NAME"
    client = MongoClient(MONGO_URL)
    try:
        yield client[DB_NAME]
    finally:
        client.close()


@pytest.fixture
def temp_mapping_data(mongo_db, auth_context):
    # Module: Temporary BRSR proposal lifecycle data setup + cleanup
    suffix = uuid.uuid4().hex[:10]
    mapping_id = f"TEST_BRSR_MAP_{suffix}"
    kpi_id = f"TEST_BRSR_KPI_{suffix}"
    question_key = f"TEST_BRSR_Q_{suffix}"
    period_a = "FY 2099-2100"
    period_b = "FY 2100-2101"
    org_id = auth_context["org_id"]

    mapping_doc = {
        "id": mapping_id,
        "framework": "BRSR",
        "question_key": question_key,
        "answer_path": "temp_metric.total",
        "mapping_status": "exact_destination",
        "is_active": True,
        "kpi_id": kpi_id,
        "source_kpi_ids": [kpi_id],
        "source_tag": "Air Emissions → Fugitive Emissions",
        "reference": "BRSR TEST",
        "aggregation_rule": "sum",
        "destination_unit": "tonnes",
    }
    kpi_def_doc = {
        "id": kpi_id,
        "status": "active",
        "section": "environment",
        "metric_name": "Test Air Emissions",
        "metric_code": "TEST-AIR-001",
        "category_name": "Air Emissions",
        "subcategory": "Fugitive Emissions",
        "aggregation_type": "sum",
        "value_field": "quantity",
        "unit_config": {"default_unit": "tonnes", "allow_unit_conversion": False},
        "filters": [],
    }
    question_doc = {
        "id": f"TEST_BRSR_QCFG_{suffix}",
        "framework": "BRSR",
        "section": "section_c",
        "question_key": question_key,
        "question": "Test question for proposal lifecycle",
        "status": "active",
    }

    rec_a_id = f"TEST_BRSR_REC_A_{suffix}"
    rec_b_id = f"TEST_BRSR_REC_B_{suffix}"
    env_record_a = {
        "id": rec_a_id,
        "org_id": org_id,
        "organization_id": org_id,
        "category": "Air Emissions",
        "subcategory": "Fugitive Emissions",
        "is_current": True,
        "status": "submitted",
        "reporting_period": {"reporting_type": "monthly", "year": 2099, "month": 4},
        "field_values": {"quantity": 10},
    }
    env_record_b = {
        "id": rec_b_id,
        "organization_id": org_id,
        "category": "Air Emissions",
        "subcategory": "Fugitive Emissions",
        "is_current": True,
        "status": "submitted",
        "reporting_period": {"reporting_type": "monthly", "year": 2100, "month": 4},
        "field_values": {"quantity": 22},
    }
    baseline_response = {
        "id": f"TEST_BRSR_RESP_{suffix}",
        "org_id": org_id,
        "organization_id": org_id,
        "framework": "BRSR",
        "section": "section_c",
        "question_key": question_key,
        "reporting_year": period_a,
        "value": {"preserve": {"value": 777}},
        "status": "saved",
    }

    mongo_db.kpi_framework_mappings.insert_one(mapping_doc)
    mongo_db.esg_kpi_definitions.insert_one(kpi_def_doc)
    mongo_db.esg_question_configs.insert_one(question_doc)
    mongo_db.environment_records.insert_many([env_record_a, env_record_b])
    mongo_db.organization_esg_responses.insert_one(baseline_response)

    try:
        yield {
            "mapping_id": mapping_id,
            "question_key": question_key,
            "period_a": period_a,
            "period_b": period_b,
            "org_id": org_id,
            "rec_a_id": rec_a_id,
        }
    finally:
        mongo_db.kpi_framework_mappings.delete_one({"id": mapping_id})
        mongo_db.esg_kpi_definitions.delete_one({"id": kpi_id})
        mongo_db.esg_question_configs.delete_one({"question_key": question_key})
        mongo_db.environment_records.delete_many({"id": {"$in": [rec_a_id, rec_b_id]}})
        mongo_db.organization_esg_responses.delete_many({"question_key": question_key, "org_id": org_id})
        mongo_db.brsr_kpi_import_proposals.delete_many({"mapping_id": mapping_id, "org_id": org_id})
        mongo_db.question_audit_log.delete_many({"mapping_id": mapping_id, "org_id": org_id})


def _auth_headers(auth_context: Dict[str, str]) -> Dict[str, str]:
    return {"Authorization": f"Bearer {auth_context['token']}"}


def test_import_proposals_contract_for_fy_2026_2027(api_session: requests.Session, auth_context: Dict[str, str]):
    # Feature: Authenticated proposal listing contract and six expected values
    response = api_session.get(
        f"{BASE_URL}/api/brsr-report/import-proposals",
        params={"reporting_period": "FY 2026-2027"},
        headers=_auth_headers(auth_context),
        timeout=30,
    )
    assert response.status_code == 200

    data = response.json()
    assert data["reporting_period"] == "FY 2026-2027"
    proposals = data.get("proposals", [])
    assert len(proposals) == 6
    assert data.get("counts", {}).get("total") == 6

    values = sorted([round(float(item["proposed_value"]), 6) for item in proposals])
    assert values == sorted([42.0, 44.0, 123.0, 43.0, 31.0, 12.0])

    for proposal in proposals:
        assert "mapping_id" in proposal and isinstance(proposal["mapping_id"], str)
        assert "source_fingerprint" in proposal and len(proposal["source_fingerprint"]) == 64
        assert "source_tag" in proposal and "→" in proposal["source_tag"]
        assert proposal["resolved_answer_path"].endswith("current_fy")
        assert isinstance(proposal.get("contributing_kpis", []), list)
        assert len(proposal.get("contributing_kpis", [])) > 0


def test_import_proposal_lifecycle_period_scope_and_conflicts(
    api_session: requests.Session,
    auth_context: Dict[str, str],
    mongo_db,
    temp_mapping_data,
):
    # Feature: pending→accepted→stale→rejected-hidden→changed-pending→edited lifecycle
    mapping_id = temp_mapping_data["mapping_id"]
    period_a = temp_mapping_data["period_a"]
    period_b = temp_mapping_data["period_b"]
    org_id = temp_mapping_data["org_id"]
    rec_a_id = temp_mapping_data["rec_a_id"]

    def list_for_period(period: str):
        res = api_session.get(
            f"{BASE_URL}/api/brsr-report/import-proposals",
            params={"reporting_period": period},
            headers=_auth_headers(auth_context),
            timeout=30,
        )
        assert res.status_code == 200
        payload = res.json()
        match = [item for item in payload.get("proposals", []) if item.get("mapping_id") == mapping_id]
        return payload, (match[0] if match else None)

    _, proposal = list_for_period(period_a)
    assert proposal is not None
    assert proposal["status"] == "pending"
    assert float(proposal["proposed_value"]) == 10.0
    first_fingerprint = proposal["source_fingerprint"]

    accept_res = api_session.post(
        f"{BASE_URL}/api/brsr-report/import-proposals/{mapping_id}/decision",
        params={"reporting_period": period_a},
        headers=_auth_headers(auth_context),
        json={"action": "accept", "source_fingerprint": first_fingerprint},
        timeout=30,
    )
    assert accept_res.status_code == 200
    accept_data = accept_res.json()
    assert accept_data["status"] == "accepted"
    assert float(accept_data["saved_value"]) == 10.0

    saved_response = mongo_db.organization_esg_responses.find_one(
        {"org_id": org_id, "question_key": temp_mapping_data["question_key"], "reporting_year": period_a},
        {"_id": 0, "value": 1},
    )
    assert saved_response["value"]["preserve"]["value"] == 777
    assert float(saved_response["value"]["temp_metric"]["total"]["current_fy"]) == 10.0

    mongo_db.environment_records.update_one({"id": rec_a_id, "org_id": org_id}, {"$set": {"field_values.quantity": 12}})
    _, stale_proposal = list_for_period(period_a)
    assert stale_proposal is not None
    assert stale_proposal["status"] == "stale"
    assert float(stale_proposal["proposed_value"]) == 12.0
    stale_fingerprint = stale_proposal["source_fingerprint"]

    conflict_res = api_session.post(
        f"{BASE_URL}/api/brsr-report/import-proposals/{mapping_id}/decision",
        params={"reporting_period": period_a},
        headers=_auth_headers(auth_context),
        json={"action": "accept", "source_fingerprint": first_fingerprint},
        timeout=30,
    )
    assert conflict_res.status_code == 409

    reject_res = api_session.post(
        f"{BASE_URL}/api/brsr-report/import-proposals/{mapping_id}/decision",
        params={"reporting_period": period_a},
        headers=_auth_headers(auth_context),
        json={"action": "reject", "source_fingerprint": stale_fingerprint},
        timeout=30,
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "rejected"

    _, hidden_after_reject = list_for_period(period_a)
    assert hidden_after_reject is None

    response_after_reject = mongo_db.organization_esg_responses.find_one(
        {"org_id": org_id, "question_key": temp_mapping_data["question_key"], "reporting_year": period_a},
        {"_id": 0, "value": 1},
    )
    assert float(response_after_reject["value"]["temp_metric"]["total"]["current_fy"]) == 10.0

    mongo_db.environment_records.update_one({"id": rec_a_id, "org_id": org_id}, {"$set": {"field_values.quantity": 13}})
    _, pending_again = list_for_period(period_a)
    assert pending_again is not None
    assert pending_again["status"] == "pending"
    assert float(pending_again["proposed_value"]) == 13.0

    edit_res = api_session.post(
        f"{BASE_URL}/api/brsr-report/import-proposals/{mapping_id}/decision",
        params={"reporting_period": period_a},
        headers=_auth_headers(auth_context),
        json={"action": "edit", "source_fingerprint": pending_again["source_fingerprint"], "edited_value": "99.5"},
        timeout=30,
    )
    assert edit_res.status_code == 200
    edit_data = edit_res.json()
    assert edit_data["status"] == "edited"
    assert float(edit_data["saved_value"]) == 99.5

    edited_response = mongo_db.organization_esg_responses.find_one(
        {"org_id": org_id, "question_key": temp_mapping_data["question_key"], "reporting_year": period_a},
        {"_id": 0, "value": 1},
    )
    assert float(edited_response["value"]["temp_metric"]["total"]["current_fy"]) == 99.5

    _, proposal_period_b = list_for_period(period_b)
    assert proposal_period_b is not None
    assert proposal_period_b["status"] == "pending"
    assert float(proposal_period_b["proposed_value"]) == 22.0
