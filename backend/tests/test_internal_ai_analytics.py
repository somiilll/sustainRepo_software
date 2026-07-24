"""
Backend tests for Internal Data AI - verifying analytics.py fix that adds
`unit` and `period` fields to the aggregation response so the LLM response
formatter can mention them (instead of "unit not provided" / "time period
not provided").

Covers:
- POST /api/auth/login (org admin ORG1)
- POST /api/internal-ai/chat with kpi_lookup-style scope1/scope2 questions
- Regression: "highest emissions" analytics query (table/chart)
- Regression: evidence retrieval (uploaded files with preview_url)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
CHAT_TIMEOUT = 90  # LLM calls take 8-17s, allow generous buffer


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    resp = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": EMAIL,
        "password": PASSWORD,
    }, timeout=30)
    if resp.status_code != 200:
        pytest.skip(f"Login failed with status {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token in login response: {data}")
    return token


@pytest.fixture(scope="module")
def authed_client(api_client, auth_token):
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


def _chat(client, message, session_id=None):
    payload = {"message": message}
    if session_id:
        payload["session_id"] = session_id
    resp = client.post(f"{BASE_URL}/api/internal-ai/chat", json=payload, timeout=CHAT_TIMEOUT)
    return resp


class TestLogin:
    def test_login_success(self, auth_token):
        assert isinstance(auth_token, str)
        assert len(auth_token) > 10


class TestScope1EmissionsUnitPeriodFix:
    """PRIMARY bug fix verification: unit/period should be present in answer."""

    def test_scope1_emissions_facility_e(self, authed_client):
        resp = _chat(authed_client, "What is our total scope 1 emissions for Facility E?")
        assert resp.status_code == 200, resp.text[:500]
        data = resp.json()
        assert "answer" in data
        answer = data["answer"]
        assert isinstance(answer, str) and len(answer) > 0
        answer_lower = answer.lower()

        assert "unit not provided" not in answer_lower, f"Unit missing bug regressed: {answer}"
        assert "time period not provided" not in answer_lower, f"Period missing bug regressed: {answer}"
        assert "tco2e" in answer_lower, f"Expected tCO2e unit mentioned in answer: {answer}"

    def test_show_scope1_emissions(self, authed_client):
        resp = _chat(authed_client, "Show scope 1 emissions")
        assert resp.status_code == 200, resp.text[:500]
        answer = resp.json().get("answer", "")
        answer_lower = answer.lower()
        assert "unit not provided" not in answer_lower
        assert "time period not provided" not in answer_lower
        assert "tco2e" in answer_lower, f"Expected tCO2e unit mentioned: {answer}"

    def test_scope2_emissions_total(self, authed_client):
        resp = _chat(authed_client, "Scope 2 emissions total")
        assert resp.status_code == 200, resp.text[:500]
        answer = resp.json().get("answer", "")
        answer_lower = answer.lower()
        assert "unit not provided" not in answer_lower
        assert "time period not provided" not in answer_lower
        assert "tco2e" in answer_lower, f"Expected tCO2e unit mentioned: {answer}"


class TestRegressionHighestEmissions:
    def test_highest_emissions_facility(self, authed_client):
        resp = _chat(authed_client, "Which facility has the highest emissions?")
        assert resp.status_code == 200, resp.text[:500]
        data = resp.json()
        answer_lower = data.get("answer", "").lower()
        assert "tco2e" in answer_lower, f"Expected tCO2e unit mentioned: {data.get('answer')}"
        # raw_data or chart should be present for table/chart response types
        assert data.get("raw_data") is not None or data.get("chart") is not None, (
            f"Expected raw_data or chart for ranking query, got response_type={data.get('response_type')}"
        )


class TestRegressionEvidenceRetrieval:
    def test_uploaded_evidence_files(self, authed_client):
        resp = _chat(authed_client, "Show me uploaded evidence files")
        assert resp.status_code == 200, resp.text[:500]
        data = resp.json()
        assert data.get("intent") == "evidence_retrieval", f"Unexpected intent: {data.get('intent')}"
        evidence = data.get("evidence")
        if evidence:
            assert isinstance(evidence, list)
            first = evidence[0]
            assert "filename" in first
            # preview_url should be a working presigned URL (or None gracefully, not error)
            if first.get("preview_url"):
                assert first["preview_url"].startswith("http")
