"""
Live API tests for Question Registry routing via /api/internal-ai/chat.
Iteration 177: Validates framework-precedence routing (BRSR/GRI → ESG Module → Legacy Intent).
"""
import os
import json
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://emissions-review.preview.emergentagent.com").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}",
    })
    return s


def _ask(client, message):
    payload = {"message": message, "session_id": f"iter177-{uuid.uuid4()}"}
    r = client.post(f"{BASE_URL}/api/internal-ai/chat", json=payload, timeout=90)
    assert r.status_code == 200, f"Chat failed for '{message}': {r.status_code} {r.text[:500]}"
    return r.json()


def _highlights_text(resp):
    hl = resp.get("highlights") or []
    parts = []
    for h in hl:
        if isinstance(h, dict):
            parts.append(json.dumps(h))
        else:
            parts.append(str(h))
    return " | ".join(parts)


# ── CIN Routing ──────────────────────────────────────────────────
class TestCINLive:
    def test_cin_full_phrase(self, client):
        resp = _ask(client, "What is our Corporate Identity Number?")
        assert resp.get("query_type") == "brsr_lookup", f"Wrong query_type: {resp.get('query_type')} | {_highlights_text(resp)}"
        text = json.dumps(resp).lower()
        assert "found" in text or "state" in text
        # Expected sample value from problem statement
        assert "1234567890" in json.dumps(resp), f"CIN value 1234567890 not found. Highlights: {_highlights_text(resp)}"

    def test_cin_abbreviation(self, client):
        resp = _ask(client, "What is our CIN?")
        assert resp.get("query_type") == "brsr_lookup", f"Wrong query_type: {resp.get('query_type')}"
        assert "1234567890" in json.dumps(resp), f"CIN value not found. Highlights: {_highlights_text(resp)}"


# ── CSR Routing ──────────────────────────────────────────────────
class TestCSRLive:
    def test_csr_applicability(self, client):
        resp = _ask(client, "CSR applicability under Section 135")
        assert resp.get("query_type") == "brsr_lookup", f"Wrong query_type: {resp.get('query_type')}"
        text = json.dumps(resp).upper()
        # Expected state: CONFIGURED — RESPONSE NOT FOUND
        assert "CONFIGURED" in text and ("NOT FOUND" in text or "RESPONSE NOT FOUND" in text), \
            f"Expected 'CONFIGURED — RESPONSE NOT FOUND' state. Got: {_highlights_text(resp)}"


# ── Anti-corruption Policy vs Incidents ──────────────────────────
class TestAntiCorruptionLive:
    def test_anticorruption_policy(self, client):
        resp = _ask(client, "Do we have an anti-corruption policy?")
        assert resp.get("query_type") == "brsr_lookup", f"Policy should route to brsr_lookup. Got: {resp.get('query_type')}"
        text = json.dumps(resp).upper()
        assert "FOUND" in text, f"Expected State: FOUND. Got: {_highlights_text(resp)}"

    def test_antibribery_policy_synonym(self, client):
        resp = _ask(client, "What is our anti-bribery policy?")
        assert resp.get("query_type") == "brsr_lookup", f"Anti-bribery should route to brsr_lookup. Got: {resp.get('query_type')}"
        text = json.dumps(resp).upper()
        assert "FOUND" in text, f"Expected State: FOUND. Got: {_highlights_text(resp)}"

    def test_anticorruption_incidents_not_brsr(self, client):
        resp = _ask(client, "How many anti-corruption incidents were reported?")
        qt = resp.get("query_type")
        assert qt != "brsr_lookup", f"Incidents should NOT be brsr_lookup. Got: {qt} | {_highlights_text(resp)}"
        # Should be esg_metric_lookup or similar governance route
        assert qt in ("esg_metric_lookup", "kpi_lookup", "esg_lookup"), f"Unexpected query_type for incidents: {qt}"


# ── Regressions ──────────────────────────────────────────────────
class TestRegressions:
    def test_water_consumption_still_esg_metric(self, client):
        resp = _ask(client, "What is our total water consumption?")
        qt = resp.get("query_type")
        assert qt != "brsr_lookup", f"Water should not be brsr_lookup. Got: {qt}"
        assert qt in ("esg_metric_lookup", "kpi_lookup", "esg_lookup"), f"Unexpected query_type: {qt}"

    def test_brsr_count_still_works(self, client):
        resp = _ask(client, "How many BRSR questions are filled?")
        assert resp.get("query_type") == "brsr_lookup", f"BRSR count should be brsr_lookup. Got: {resp.get('query_type')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
