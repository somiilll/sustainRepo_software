"""Regression tests for Internal Data AI Water/Waste approvals, spills routing, and retrieval-error formatting."""
import os
import re
import sys
from pathlib import Path

import pytest
import requests

sys.path.append(str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("OPENAI_API_KEY", "test-key")

from modules.internal_data_ai.query_contracts import QueryType, StructuredQueryPlan
from modules.internal_data_ai.response_builder import _build_esg_record_response


def _read_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env", encoding="utf-8") as handle:
            for line in handle:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    return (url or "").rstrip("/")


BASE_URL = _read_backend_url()


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def _login(session: requests.Session, email: str, password: str) -> str:
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=45,
    )
    if response.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login returned 429 for {email}. Body: {response.text[:300]}")
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text[:300]}"
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"Token missing for {email}. Keys={list(payload.keys())}"
    return token


def _ask(session: requests.Session, token: str, message: str, session_id: str) -> dict:
    response = session.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"message": message, "session_id": session_id},
        timeout=120,
    )
    assert response.status_code == 200, f"Chat failed ({message}): {response.status_code} {response.text[:800]}"
    return response.json()


def _highlights_map(payload: dict) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in payload.get("highlights") or []:
        if isinstance(item, dict) and item.get("label"):
            result[str(item["label"]).strip().lower()] = str(item.get("value", "")).strip()
    return result


def _parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    match = re.search(r"-?\d+", str(value))
    return int(match.group(0)) if match else None


@pytest.mark.skipif(not BASE_URL, reason="Missing REACT_APP_BACKEND_URL")
def test_water_approved_counts_are_reported_without_not_found():
    # Module: Internal AI approval-status lookup for Water records.
    session = _session()
    admin_token = _login(session, "goyalsomil2001@gmail.com", "TestUser123!")

    payload = _ask(
        session,
        admin_token,
        "how many approved records for water",
        "iter167-water-approved-counts",
    )

    assert payload.get("query_type") == "approval_status_lookup"
    rendered = f"{payload.get('answer', '')} {payload.get('highlights', [])}".lower()
    assert "not_found" not in rendered, payload
    assert "no water metric records currently have approved status" not in rendered, payload

    highlights = _highlights_map(payload)
    assert _parse_int(highlights.get("records found")) == 45, payload
    assert _parse_int(highlights.get("approved")) == 1, payload


@pytest.mark.skipif(not BASE_URL, reason="Missing REACT_APP_BACKEND_URL")
@pytest.mark.parametrize(
    "question",
    [
        "is waste spill metric for oct 2026 approved?",
        "is waste spill metric for october 2026 approved?",
    ],
)
def test_waste_spill_october_approval_routes_to_waste_spills(question: str):
    # Module: Internal AI metric routing for Waste -> Spills approval checks.
    session = _session()
    admin_token = _login(session, "goyalsomil2001@gmail.com", "TestUser123!")

    payload = _ask(session, admin_token, question, f"iter167-waste-spill-approved-{question[:10]}")
    assert payload.get("query_type") == "approval_status_lookup"

    rendered = f"{payload.get('answer', '')} {payload.get('highlights', [])}".lower()
    assert "not_found" not in rendered, payload
    assert "october 2026" in rendered or "2026-10" in rendered, payload

    highlights = _highlights_map(payload)
    source = highlights.get("source", "")
    assert "Environment" in source and "Waste" in source and "Spills" in source, payload
    assert _parse_int(highlights.get("approved")) == 1, payload


@pytest.mark.skipif(not BASE_URL, reason="Missing REACT_APP_BACKEND_URL")
def test_waste_spillage_amount_uses_volume_of_spill_value_without_inferred_unit():
    # Module: Internal AI semantic mapping for spill/spillage amount questions.
    session = _session()
    admin_token = _login(session, "goyalsomil2001@gmail.com", "TestUser123!")

    payload = _ask(
        session,
        admin_token,
        "how waste spillage was there for oct 2026",
        "iter167-waste-spillage-amount",
    )

    rendered = f"{payload.get('answer', '')} {payload.get('highlights', [])}".lower()
    assert "not_found" not in rendered, payload

    highlights = _highlights_map(payload)
    source = highlights.get("source", "")
    assert "Environment" in source and "Waste" in source and "Spills" in source, payload

    raw_data = payload.get("raw_data") or {}
    records = raw_data.get("records") or []
    assert records, payload
    first = records[0]
    metric_value = first.get("metric_value") or {}
    assert metric_value.get("field_label") == "Volume of spill", payload
    assert _parse_int(str(metric_value.get("value"))) == 4200, payload
    assert metric_value.get("unit") in (None, ""), payload

    answer = payload.get("answer", "")
    assert "4200" in answer, payload
    assert "unit not stored" in answer.lower(), payload


def test_retrieval_error_payload_never_formats_as_not_found():
    # Module: deterministic formatter behavior for retrieval failures.
    plan = StructuredQueryPlan(query_type=QueryType.APPROVAL_STATUS_LOOKUP, record_type="environment", category="Waste")
    response = _build_esg_record_response(
        plan,
        {"error": "TypeError: resolve_config() got an unexpected keyword argument 'org_id'"},
        "text",
    )

    rendered = f"{response.get('answer', '')} {response.get('highlights', [])}".lower()
    assert "could not be retrieved" in rendered
    assert "no record count" in rendered
    assert "not_found" not in rendered
    highlights = _highlights_map(response)
    assert highlights.get("state") == "STATUS_UNAVAILABLE"


@pytest.mark.skipif(not BASE_URL, reason="Missing REACT_APP_BACKEND_URL")
def test_restricted_user_is_scoped_to_authorized_facilities_only():
    # Module: Internal AI authorization boundaries for ESG records.
    session = _session()
    admin_token = _login(session, "goyalsomil2001@gmail.com", "TestUser123!")
    restricted_token = _login(session, "goyalsomil+4@hotmail.com", "TestUser123!")

    admin_payload = _ask(session, admin_token, "how many approved records for water", "iter167-admin-water-approved")
    restricted_payload = _ask(
        session,
        restricted_token,
        "how many approved records for water",
        "iter167-restricted-water-approved",
    )

    admin_h = _highlights_map(admin_payload)
    restricted_h = _highlights_map(restricted_payload)
    admin_found = _parse_int(admin_h.get("records found"))
    restricted_found = _parse_int(restricted_h.get("records found"))

    assert admin_found is not None and restricted_found is not None, {
        "admin": admin_payload,
        "restricted": restricted_payload,
    }
    assert restricted_found <= admin_found, {
        "admin_records_found": admin_found,
        "restricted_records_found": restricted_found,
        "admin": admin_payload,
        "restricted": restricted_payload,
    }

    restricted_raw = restricted_payload.get("raw_data") or {}
    restricted_facilities = {
        str(record.get("facility"))
        for record in (restricted_raw.get("records") or [])
        if record.get("facility")
    }
    assert restricted_facilities.issubset({"Facility E", "Organization level"}), restricted_payload
