"""Supplier GHG log dedupe regression checks for reopened/resubmitted revisions."""

import os
from pathlib import Path
import re

import pytest
from pymongo import MongoClient
import requests


def _resolve_base_url() -> str:
    env_url = (os.environ.get("REACT_APP_BACKEND_URL") or "").strip()
    if env_url:
        return env_url.rstrip("/")

    frontend_env = Path("/app/frontend/.env")
    if frontend_env.exists():
        for raw_line in frontend_env.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "REACT_APP_BACKEND_URL":
                return value.strip().rstrip("/")
    return ""


BASE_URL = _resolve_base_url()
RELATIONSHIP_ID_REPORTED = "53d631c3-9bc7-4c20-babc-068bc53af68f"


def _read_backend_env() -> dict:
    env_path = Path("/app/backend/.env")
    if not env_path.exists():
        return {}
    values = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        cleaned = value.strip()
        if (cleaned.startswith('"') and cleaned.endswith('"')) or (
            cleaned.startswith("'") and cleaned.endswith("'")
        ):
            cleaned = cleaned[1:-1]
        values[key.strip()] = cleaned
    return values


def _credentials_from_memory() -> tuple[str, str]:
    credentials_path = Path("/app/memory/test_credentials.md")
    if not credentials_path.exists():
        pytest.skip("/app/memory/test_credentials.md missing")

    text = credentials_path.read_text(encoding="utf-8")
    supplier_block = None
    for block in re.split(r"\n## ", text):
        if "Supplier Account" in block:
            supplier_block = block
            break

    if not supplier_block:
        pytest.skip("Supplier credentials block missing in /app/memory/test_credentials.md")

    email_match = re.search(r"\*\*Email\*\*:\s*([^\n]+)", supplier_block)
    password_match = re.search(r"\*\*Password\*\*:\s*([^\n]+)", supplier_block)
    if not email_match or not password_match:
        pytest.skip("Supplier credentials missing in /app/memory/test_credentials.md")

    return email_match.group(1).strip(), password_match.group(1).strip()


@pytest.fixture(scope="session")
def api_base_url() -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is missing")
    return BASE_URL


@pytest.fixture(scope="session")
def supplier_session(api_base_url: str):
    session = requests.Session()
    email, password = _credentials_from_memory()
    response = session.post(
        f"{api_base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Supplier login failed: {response.status_code} {response.text}"
    token = response.json().get("access_token")
    assert token, "Missing access_token in supplier login response"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


# Module: supplier emissions API list + revision history retention
def test_supplier_get_emissions_hides_superseded_non_current_revisions(supplier_session, api_base_url):
    response = supplier_session.get(f"{api_base_url}/api/emissions", timeout=30)
    assert response.status_code == 200, f"Unexpected status: {response.status_code} {response.text}"

    records = response.json()
    assert isinstance(records, list)

    superseded = [
        record.get("id")
        for record in records
        if record.get("source") == "supplier" and record.get("is_current_revision") is False
    ]
    assert superseded == [], f"Found superseded rows in /api/emissions response: {superseded}"


# Module: supplier revision history endpoint retains historical rows (audit-safe)
def test_supplier_revision_history_retains_prior_revisions_when_lineage_exists(supplier_session, api_base_url):
    emissions_response = supplier_session.get(f"{api_base_url}/api/emissions", timeout=30)
    assert emissions_response.status_code == 200
    records = emissions_response.json()

    candidate = next(
        (
            row
            for row in records
            if row.get("source") == "supplier"
            and (row.get("revision_lineage_id") or row.get("revised_from_record_id") or row.get("revision_number", 0) > 1)
        ),
        None,
    )
    if not candidate:
        pytest.skip("No supplier revision lineage candidate visible for this supplier account")

    revision_response = supplier_session.get(
        f"{api_base_url}/api/supplier-assessment/my-assessment/emissions/{candidate['id']}/revisions",
        timeout=30,
    )
    assert revision_response.status_code == 200, (
        f"Unexpected revision-history status: {revision_response.status_code} {revision_response.text}"
    )
    payload = revision_response.json()

    revisions = payload.get("revisions") or []
    assert isinstance(revisions, list) and len(revisions) >= 1
    assert all("_id" not in row for row in revisions)

    if len(revisions) > 1:
        assert any(row.get("is_current_revision") is False for row in revisions), (
            "Revision history has multiple rows but no historical non-current revision"
        )


# Module: direct DB retention verification for user-reported supplier relationship
def test_reported_relationship_retains_historical_revisions_in_mongodb():
    env = _read_backend_env()
    mongo_url = env.get("MONGO_URL")
    db_name = env.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME missing in /app/backend/.env")

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    try:
        collection = client[db_name]["emission_records"]
        rows = list(collection.find(
            {
                "source": "supplier",
                "supplier_relationship_id": RELATIONSHIP_ID_REPORTED,
            },
            {
                "_id": 0,
                "id": 1,
                "is_current_revision": 1,
                "revision_lineage_id": 1,
                "reporting_period": 1,
            },
        ))
    finally:
        client.close()

    assert rows, "No supplier emission records found for reported relationship"

    non_current = [row for row in rows if row.get("is_current_revision") is False]
    current = [row for row in rows if row.get("is_current_revision") is True]
    assert non_current, "Historical non-current revisions were not found (possible deletion)"
    assert current, "Current revision rows were not found for reported relationship"
