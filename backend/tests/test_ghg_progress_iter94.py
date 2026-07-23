"""Backend tests for GHG facility-based query fix + progress formula (iteration 94)."""
import os
import sys
import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-tracker-v2.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "goyalsomil2001@gmail.com"
LOGIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _calc(headers, kpi_id, period):
    return requests.post(
        f"{BASE_URL}/api/kpi-engine/calculate",
        json={"kpi_id": kpi_id, "period": period},
        headers=headers,
        timeout=60,
    )


# --- GHG facility-based query tests ---
def test_scope1_facility_query(headers):
    r = _calc(headers, "855de2ee-8684-4038-9b3f-c138f9f7893f", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope1:", d.get("value"), d.get("record_count"))
    assert d.get("record_count") == 23, d
    assert abs(d.get("value") - 84827.7352) < 0.01, d
    md = d.get("metadata", {})
    assert md.get("source_collection") == "emission_records", md
    assert md.get("ghg_scope") == "scope1", md


def test_scope2_facility_query(headers):
    r = _calc(headers, "ff0c0684-d717-49ad-80fc-90136bf29868", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope2:", d.get("value"), d.get("record_count"))
    assert d.get("record_count") == 15, d
    assert abs(d.get("value") - 247.6414) < 0.01, d


def test_scope3_c1_facility_query(headers):
    r = _calc(headers, "c21b756d-14cc-4548-ae0d-20611f93314e", {"year": 2026})
    assert r.status_code == 200, r.text
    d = r.json()
    print("Scope3-C1:", d.get("value"), d.get("record_count"))
    assert d.get("record_count") == 12, d
    assert abs(d.get("value") - 1716.6011) < 0.01, d


# --- Progress formula tests (direct) ---
def _load_calc_progress():
    from modules.esg_targets.router import _calculate_progress
    return _calculate_progress


def test_progress_upper_limit_with_baseline_mid():
    fn = _load_calc_progress()
    target = {"baseline": {"value": 10000}}
    # (10000 - 6000) / (10000 - 2000) * 100 = 4000/8000 * 100 = 50
    result = fn(6000, 2000, "upper_limit", target)
    assert abs(result - 50.0) < 0.01, f"Expected 50.0, got {result}"


def test_progress_upper_limit_with_baseline_at_target():
    fn = _load_calc_progress()
    target = {"baseline": {"value": 10000}}
    # actual == target: full progress
    result = fn(2000, 2000, "upper_limit", target)
    assert abs(result - 100.0) < 0.01, f"Expected 100.0, got {result}"


def test_progress_upper_limit_with_baseline_at_baseline():
    fn = _load_calc_progress()
    target = {"baseline": {"value": 10000}}
    # actual == baseline: no progress
    result = fn(10000, 2000, "upper_limit", target)
    assert abs(result - 0.0) < 0.01, f"Expected 0.0, got {result}"


def test_progress_lower_limit_unchanged():
    fn = _load_calc_progress()
    # 300/500 * 100 = 60
    result = fn(300, 500, "lower_limit", {})
    assert abs(result - 60.0) < 0.01, f"Expected 60.0, got {result}"


def test_progress_upper_limit_no_baseline_fallback():
    fn = _load_calc_progress()
    # No baseline, actual > target: target/actual * 100 = 2000/3000 * 100 ≈ 66.67
    result = fn(3000, 2000, "upper_limit", {})
    assert abs(result - 66.6667) < 0.01, f"Expected ~66.67, got {result}"


# --- Targets with progress endpoint ---
def test_targets_with_progress(headers):
    r = requests.get(
        f"{BASE_URL}/api/esg-targets/with-progress?section=environment",
        headers=headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    print("Targets count:", len(data) if isinstance(data, list) else data)
    # Should be a list or dict wrapper
    targets = data if isinstance(data, list) else data.get("targets", [])
    assert len(targets) > 0, "No environment targets found"
    # Look for Water Consumption target
    water = [t for t in targets if "water" in (t.get("metric_name") or t.get("name") or "").lower()]
    if water:
        wt = water[0]
        print("Water target:", wt.get("metric_name"), "progress:", wt.get("progress_percentage"), "actual:", wt.get("actual_value"))
        # progress should be calculated (not None) if actual_value present
        if wt.get("actual_value") is not None:
            assert wt.get("progress_percentage") is not None, f"Water progress missing: {wt}"
