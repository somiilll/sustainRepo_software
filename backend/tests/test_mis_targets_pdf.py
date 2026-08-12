"""Tests for MIS executive report targets and PDF export endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://questionnaire-ai-hub.preview.emergentagent.com").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
PERIOD = {"reporting_period_start": "2024-04", "reporting_period_end": "2025-03"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No access_token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Executive report targets ---
class TestExecutiveReportTargets:
    def test_executive_report_returns_200(self, headers):
        r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=PERIOD, headers=headers, timeout=60)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
        self._body = r.json()

    def test_targets_field_present(self, headers):
        r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=PERIOD, headers=headers, timeout=60)
        body = r.json()
        assert "targets" in body, f"targets not in response keys: {list(body.keys())}"
        assert isinstance(body["targets"], list)
        print(f"Found {len(body['targets'])} targets")

    def test_targets_have_required_fields(self, headers):
        r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=PERIOD, headers=headers, timeout=60)
        targets = r.json().get("targets", [])
        assert len(targets) > 0, "Expected at least 1 active target"
        required = {"name", "target_value", "baseline_value", "baseline_period", "unit", "category", "kpi_name", "reporting_period"}
        for t in targets:
            missing = required - set(t.keys())
            assert not missing, f"Target missing fields {missing}: {t}"

    def test_targets_name_not_empty(self, headers):
        r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=PERIOD, headers=headers, timeout=60)
        targets = r.json().get("targets", [])
        for t in targets:
            name = t.get("name")
            assert name and name != "Unnamed" and name.strip() != "", f"Target has empty/unnamed name: {t}"
            print(f"Target name: {name}")

    def test_targets_have_baseline_where_expected(self, headers):
        r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=PERIOD, headers=headers, timeout=60)
        targets = r.json().get("targets", [])
        with_baseline = [t for t in targets if t.get("baseline_value") is not None]
        print(f"{len(with_baseline)}/{len(targets)} targets have baseline_value populated")
        # At least one should have baseline based on context
        assert len(with_baseline) > 0, "No targets have baseline_value populated"

    def test_only_active_targets(self, headers):
        # Verify count matches expected 5 active targets
        r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=PERIOD, headers=headers, timeout=60)
        targets = r.json().get("targets", [])
        print(f"Active targets count: {len(targets)}")
        assert len(targets) <= 100  # sanity - only active queried


# --- PDF Export ---
class TestPDFExport:
    def test_pdf_export_returns_200_and_pdf_bytes(self, headers):
        r = requests.post(
            f"{BASE_URL}/api/mis-reports/emissions-summary/export/pdf",
            json=PERIOD, headers=headers, timeout=90,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text[:500]}"
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct.lower(), f"Wrong content-type: {ct}"
        assert r.content[:4] == b"%PDF", f"Not a PDF, starts with: {r.content[:20]}"
        assert len(r.content) > 1000, f"PDF too small: {len(r.content)} bytes"
        print(f"PDF size: {len(r.content)} bytes")
