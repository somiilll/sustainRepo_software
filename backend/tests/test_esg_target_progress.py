"""Tests for ESG Target progress endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')
EMAIL = "esg-test-user@example.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_list_targets_with_progress_returns_200(headers):
    r = requests.get(f"{BASE_URL}/api/esg-targets/with-progress", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # each target should have progress fields
    for t in data:
        assert "actual_value" in t
        assert "progress_percentage" in t


def test_water_target_progress_100pct(headers):
    """Water Reduction Target 2026: target=2000, actual=1500 (upper_limit), expect 100%."""
    r = requests.get(f"{BASE_URL}/api/esg-targets/with-progress", headers=headers)
    assert r.status_code == 200
    targets = r.json()
    water = next((t for t in targets if "Water Reduction Target 2026" in (t.get("target_name") or "")), None)
    assert water is not None, f"Water Reduction Target 2026 not found. Found: {[t.get('target_name') for t in targets]}"
    assert water.get("kpi_id") == "dc794426-138a-4fe5-80e8-111a12fcdc2f"
    assert water.get("actual_value") == 1500, f"Expected 1500, got {water.get('actual_value')}"
    assert water.get("progress_percentage") == 100.0, f"Expected 100, got {water.get('progress_percentage')}"
    assert water.get("record_count") == 1
    assert "calculation_period" in water


def test_target_without_kpi_shows_none_progress(headers):
    """Targets without kpi_id should have null progress (No KPI badge on frontend)."""
    r = requests.get(f"{BASE_URL}/api/esg-targets/with-progress", headers=headers)
    assert r.status_code == 200
    targets = r.json()
    no_kpi = [t for t in targets if not t.get("kpi_id")]
    for t in no_kpi:
        assert t.get("actual_value") is None
        assert t.get("progress_percentage") is None


def test_single_target_progress_endpoint(headers):
    """Get single target progress and verify shape."""
    r = requests.get(f"{BASE_URL}/api/esg-targets/with-progress", headers=headers)
    targets = r.json()
    water = next((t for t in targets if t.get("kpi_id") == "dc794426-138a-4fe5-80e8-111a12fcdc2f"), None)
    assert water is not None
    tid = water["id"]

    r2 = requests.get(f"{BASE_URL}/api/esg-targets/{tid}/progress", headers=headers)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["target_value"] == 2000
    assert d["actual_value"] == 1500
    assert d["progress_percentage"] == 100.0
    assert d["goal_type"] == "upper_limit"
    assert d["record_count"] == 1
    assert "calculation_period" in d
    assert d["calculation_period"].get("year") == 2026 or d["calculation_period"].get("year") is not None


def test_single_target_progress_404(headers):
    r = requests.get(f"{BASE_URL}/api/esg-targets/nonexistent-id/progress", headers=headers)
    assert r.status_code == 404


def test_unauthenticated_denied():
    r = requests.get(f"{BASE_URL}/api/esg-targets/with-progress")
    assert r.status_code in (401, 403)


def test_progress_endpoint_no_mongo_id_leak(headers):
    r = requests.get(f"{BASE_URL}/api/esg-targets/with-progress", headers=headers)
    for t in r.json():
        assert "_id" not in t
