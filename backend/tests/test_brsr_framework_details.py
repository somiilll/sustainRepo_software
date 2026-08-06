"""Backend tests for BRSR Framework Details endpoints."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://custom-fuel-builder.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "esg-test-user@example.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def auth_token():
    """Login the BRSR-enabled test admin user."""
    # Try common login routes
    candidates = [
        f"{API}/auth/login",
        f"{API}/login",
        f"{API}/users/login",
    ]
    last = None
    for url in candidates:
        r = requests.post(url, json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        last = (url, r.status_code, r.text[:200])
        if r.status_code == 200:
            data = r.json()
            token = data.get("access_token") or data.get("token") or data.get("data", {}).get("token")
            if token:
                return token
    pytest.skip(f"Login failed across {candidates}. Last: {last}")


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# -------- GET BRSR details --------
class TestBRSRGet:
    def test_get_brsr_details_returns_200(self, headers):
        r = requests.get(f"{API}/organizations/my/framework-details/brsr", headers=headers)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert data["framework"] == "BRSR"
        assert "is_complete" in data
        assert "org_id" in data


# -------- PUT BRSR details (full create or update) --------
SAMPLE_PAYLOAD = {
    "cin": "L12345MH2024PLC123456",
    "listed_entity_name": "TEST_BRSR Entity Ltd",
    "year_of_incorporation": 2010,
    "corporate_address": "123 Test Street, Bandra",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "pincode": "400050",
    "email": "test@brsr-entity.com",
    "telephone": "+91-22-12345678",
    "website": "https://brsr-entity.com",
    "paid_up_capital": 1000000.0,
    "assurance_provider": "TEST Assurance LLP",
    "assurance_type": "Reasonable",
    "export_contribution_percentage": 12.5,
    "customer_types_brief": "B2B and B2C across India",
    "stock_exchange": "Both NSE & BSE",
    "reporting_boundary": "Standalone",
    "business_activities": [
        {"description": "Manufacturing", "main_activity": "Cement Manufacturing", "turnover_percentage": 80}
    ],
    "products_services": [
        {"product_service": "Cement", "nic_code": "2394", "turnover_percentage": 90}
    ],
    "plants_offices": [
        {"location_type": "National", "num_plants": 5, "num_offices": 10}
    ],
    "markets_served": [
        {"location_type": "National", "number": 25}
    ],
}


class TestBRSRPut:
    def test_put_saves_brsr_and_returns_complete(self, headers):
        r = requests.put(
            f"{API}/organizations/my/framework-details/brsr",
            headers=headers,
            json=SAMPLE_PAYLOAD,
        )
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:400]}"
        data = r.json()
        assert data["framework"] == "BRSR"
        assert data["details"]["cin"] == SAMPLE_PAYLOAD["cin"]
        assert data["details"]["listed_entity_name"] == SAMPLE_PAYLOAD["listed_entity_name"]
        assert data["details"]["stock_exchange"] == "Both NSE & BSE"
        assert len(data["details"]["business_activities"]) == 1
        # With all mandatory fields and 1 row in each table, should be complete
        assert data["is_complete"] is True, f"Expected complete, missing={data.get('missing_fields')}"

    def test_put_persists_via_get(self, headers):
        r = requests.get(f"{API}/organizations/my/framework-details/brsr", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["details"]["cin"] == SAMPLE_PAYLOAD["cin"]
        assert data["details"]["city"] == "Mumbai"
        assert data["is_complete"] is True

    def test_put_partial_returns_missing_fields(self, headers):
        partial = {**SAMPLE_PAYLOAD, "cin": "", "email": ""}
        r = requests.put(
            f"{API}/organizations/my/framework-details/brsr",
            headers=headers,
            json=partial,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["is_complete"] is False
        assert "cin" in data["missing_fields"]
        assert "email" in data["missing_fields"]

    def test_put_invalid_pincode_returns_422(self, headers):
        bad = {**SAMPLE_PAYLOAD, "pincode": "abcde"}
        r = requests.put(
            f"{API}/organizations/my/framework-details/brsr",
            headers=headers,
            json=bad,
        )
        assert r.status_code in (400, 422), f"Got {r.status_code}: {r.text[:300]}"

    def test_put_invalid_stock_exchange_returns_422(self, headers):
        bad = {**SAMPLE_PAYLOAD, "stock_exchange": "INVALID"}
        r = requests.put(
            f"{API}/organizations/my/framework-details/brsr",
            headers=headers,
            json=bad,
        )
        assert r.status_code in (400, 422)


# -------- Validate endpoint --------
class TestBRSRValidate:
    def test_validate_returns_status(self, headers):
        r = requests.get(f"{API}/organizations/my/framework-details/brsr/validate", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert "is_complete" in data
        assert "missing_fields" in data


# -------- Auth required --------
class TestBRSRAuth:
    def test_get_without_token_returns_401_or_403(self):
        r = requests.get(f"{API}/organizations/my/framework-details/brsr")
        assert r.status_code in (401, 403)


# -------- Cleanup: restore complete state --------
class TestBRSRCleanupRestore:
    def test_restore_complete_state(self, headers):
        # Restore so subsequent UI tests see a saved entity
        r = requests.put(
            f"{API}/organizations/my/framework-details/brsr",
            headers=headers,
            json=SAMPLE_PAYLOAD,
        )
        assert r.status_code == 200
