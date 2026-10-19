"""Test category frequency config endpoint for Assignment Wizard improvements."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/') or "http://localhost:8001"
# Note: use frontend/.env if REACT_APP_BACKEND_URL not present
if not BASE_URL or BASE_URL == "http://localhost:8001":
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip('/')
                    break
    except FileNotFoundError:
        pass

LOGIN_EMAIL = "goyalsomil2001@gmail.com"
LOGIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def auth_token():
    """Login as admin and return token."""
    for path in ["/api/auth/login", "/api/esg-auth/login", "/api/users/login"]:
        r = requests.post(f"{BASE_URL}{path}",
                          json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
                          timeout=15)
        if r.status_code == 200:
            data = r.json()
            token = data.get("access_token") or data.get("token") or (data.get("data") or {}).get("access_token")
            if token:
                return token
    pytest.skip("Could not authenticate on any known endpoint")


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


def test_frequency_config_water(headers):
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency?category=Water",
                     headers=headers, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["category"] == "Water"
    assert set(data["allowed_frequencies"]) == {"monthly", "quarterly", "yearly"}
    assert data["default_frequency"] == "monthly"


def test_frequency_config_energy(headers):
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency?category=Energy",
                     headers=headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert set(data["allowed_frequencies"]) == {"monthly", "quarterly", "yearly"}


def test_frequency_config_ghg_emissions(headers):
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency?category=GHG Emissions",
                     headers=headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert set(data["allowed_frequencies"]) == {"monthly", "quarterly", "yearly"}


def test_frequency_config_training_governance(headers):
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency?category=Training",
                     headers=headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert set(data["allowed_frequencies"]) == {"quarterly", "yearly"}


def test_frequency_config_board_composition(headers):
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency?category=Board Composition",
                     headers=headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["allowed_frequencies"] == ["yearly"]
    assert data["default_frequency"] == "yearly"


def test_frequency_config_unknown_category_fallback(headers):
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency?category=UnknownXYZ",
                     headers=headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    # fallback returns all 6
    assert len(data["allowed_frequencies"]) == 6


def test_frequency_config_requires_auth():
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency?category=Water", timeout=10)
    assert r.status_code in (401, 403)


def test_frequency_config_missing_category(headers):
    r = requests.get(f"{BASE_URL}/api/esg-records/category-config/frequency",
                     headers=headers, timeout=10)
    assert r.status_code == 422  # missing required query param
