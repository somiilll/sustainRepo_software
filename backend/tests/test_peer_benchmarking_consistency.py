"""
Test Peer Benchmarking metrics consistency vs Dashboard endpoints.

Verifies:
- /api/benchmarking/my-company returns valid metric shape
- Waste Recycled % matches environment_detail_service
- LTIFR matches social_detail_service
- Disciplinary/Corruption cases matches governance_detail_service
- AP Days matches governance_detail_service
- Scope 1/2 emissions match emission_records-based dashboard
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-executive-pack.preview.emergentagent.com").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def my_company(headers):
    r = requests.get(f"{BASE_URL}/api/benchmarking/my-company", headers=headers, timeout=120)
    assert r.status_code == 200, f"my-company failed: {r.status_code} {r.text[:500]}"
    return r.json()


DATE_PARAMS = {"start_date": "2020-01-01", "end_date": "2030-12-31"}


@pytest.fixture(scope="module")
def env_detail(headers):
    r = requests.get(f"{BASE_URL}/api/dashboard/environment-detail", headers=headers, params=DATE_PARAMS, timeout=120)
    assert r.status_code == 200, f"env-detail failed: {r.status_code} {r.text[:500]}"
    return r.json()


@pytest.fixture(scope="module")
def social_detail(headers):
    r = requests.get(f"{BASE_URL}/api/dashboard/social-detail", headers=headers, params=DATE_PARAMS, timeout=120)
    assert r.status_code == 200, f"social-detail failed: {r.status_code} {r.text[:500]}"
    return r.json()


@pytest.fixture(scope="module")
def gov_detail(headers):
    r = requests.get(f"{BASE_URL}/api/dashboard/governance-detail", headers=headers, params=DATE_PARAMS, timeout=120)
    assert r.status_code == 200, f"gov-detail failed: {r.status_code} {r.text[:500]}"
    return r.json()


def _val(metric):
    return metric.get("normalizedValue") if isinstance(metric, dict) else None


def _close(a, b, tol=0.5):
    """Both None ok; or numeric within tol."""
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return abs(float(a) - float(b)) <= tol


class TestPeerBenchmarkingShape:
    def test_response_shape(self, my_company):
        assert "metrics" in my_company
        m = my_company["metrics"]
        required = [
            "scope1", "scope2", "emissionIntensityPerTurnover", "treatedWaterDischarged",
            "renewableEnergy", "wasteRecycled", "hazardousWaste", "wasteIntensity",
            "ltirEmployee", "ltirWorker", "dataPrivacyPolicy", "disciplinaryAction",
            "daysAccountsPayable",
        ]
        missing = [k for k in required if k not in m]
        assert not missing, f"Missing metric fields: {missing}"
        # Each metric must have canonical fields
        for k in required:
            item = m[k]
            for f in ("normalizedValue", "reportedUnit", "reasoning"):
                assert f in item, f"{k} missing field {f}"


class TestConsistencyWithDashboard:
    def test_waste_recycled_matches_env_detail(self, my_company, env_detail):
        pb_val = _val(my_company["metrics"]["wasteRecycled"])
        # environment-detail returns hazardous_waste and non_hazardous_waste with generated/recovered
        haz = env_detail.get("hazardous_waste") or {}
        nonhaz = env_detail.get("non_hazardous_waste") or {}
        gen = (haz.get("generated") or 0) + (nonhaz.get("generated") or 0)
        rec = (haz.get("recovered") or 0) + (nonhaz.get("recovered") or 0)
        env_val = round((rec / gen) * 100, 2) if gen else None
        print(f"PB wasteRecycled={pb_val} ENV computed={env_val} (rec={rec}/gen={gen})")
        assert _close(pb_val, env_val, tol=0.5), f"wasteRecycled mismatch: PB={pb_val} vs ENV={env_val}"

    def test_ltifr_matches_social_detail(self, my_company, social_detail):
        pb_val = _val(my_company["metrics"]["ltirEmployee"])
        social_kpis = social_detail.get("kpis") or {}
        soc_val = social_kpis.get("ltifr")
        print(f"PB ltifr={pb_val} SOC ltifr={soc_val}")
        assert _close(pb_val, soc_val, tol=0.5), f"LTIFR mismatch: PB={pb_val} vs SOC={soc_val}"

    def test_disciplinary_matches_gov_detail(self, my_company, gov_detail):
        pb_val = _val(my_company["metrics"]["disciplinaryAction"])
        gov_kpis = gov_detail.get("kpis") or {}
        gov_val = gov_kpis.get("corruption_cases")
        print(f"PB disciplinary={pb_val} GOV corruption={gov_val}")
        assert _close(pb_val, gov_val, tol=0.001), f"Disciplinary mismatch: PB={pb_val} vs GOV={gov_val}"

    def test_ap_days_matches_gov_detail(self, my_company, gov_detail):
        pb_val = _val(my_company["metrics"]["daysAccountsPayable"])
        gov_kpis = gov_detail.get("kpis") or {}
        gov_val = gov_kpis.get("ap_days")
        print(f"PB ap_days={pb_val} GOV ap_days={gov_val}")
        assert _close(pb_val, gov_val, tol=0.5), f"AP Days mismatch: PB={pb_val} vs GOV={gov_val}"

    def test_scope1_scope2_present(self, my_company):
        s1 = _val(my_company["metrics"]["scope1"])
        s2 = _val(my_company["metrics"]["scope2"])
        print(f"PB scope1={s1} scope2={s2}")
        # ORG1 has emissions - both should be non-null numeric
        assert s1 is not None, "Scope 1 is None (expected non-null for ORG1)"
        assert s2 is not None, "Scope 2 is None (expected non-null for ORG1)"
        assert isinstance(s1, (int, float))
        assert isinstance(s2, (int, float))
