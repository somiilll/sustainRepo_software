"""
Test bug fix: clearing production_quantity/turnover in Yearly Organization Data
should delete the corresponding records (production -> soft delete; turnover -> hard delete).

Endpoint: POST/GET /api/organization/yearly-data/{reporting_year}
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://brsr-restructure.preview.emergentagent.com").rstrip("/")
TEST_EMAIL = "goyalsomil2001@gmail.com"
TEST_PASSWORD = "TestUser123!"
ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"

# Use a dedicated test year so we don't interfere with other tests
TEST_YEAR = "2099-00"


@pytest.fixture(scope="module")
def auth_headers():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=15,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_headers):
    """Reset test year state before and after the module run."""
    # Clear before
    requests.post(
        f"{BASE_URL}/api/organization/yearly-data/{TEST_YEAR}",
        json={"turnover": "", "production_quantity": "", "production_unit": "MT"},
        headers=auth_headers,
        timeout=15,
    )
    yield
    # Clear after
    requests.post(
        f"{BASE_URL}/api/organization/yearly-data/{TEST_YEAR}",
        json={"turnover": "", "production_quantity": "", "production_unit": "MT"},
        headers=auth_headers,
        timeout=15,
    )


def _post(headers, payload):
    return requests.post(
        f"{BASE_URL}/api/organization/yearly-data/{TEST_YEAR}",
        json=payload,
        headers=headers,
        timeout=15,
    )


def _get(headers):
    return requests.get(
        f"{BASE_URL}/api/organization/yearly-data/{TEST_YEAR}",
        headers=headers,
        timeout=15,
    )


# ----- Tests -----


class TestYearlyDataSaveAndClear:
    def test_01_save_valid_production_and_turnover(self, auth_headers):
        resp = _post(auth_headers, {
            "turnover": "1000000",
            "production_quantity": "500",
            "production_unit": "MT",
        })
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("success") is True

        # Verify with GET
        get_resp = _get(auth_headers)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["turnover"] == "1000000"
        assert str(data["production_quantity"]).startswith("500")
        assert data["production_unit"] == "MT"

    def test_02_update_existing_production_and_turnover(self, auth_headers):
        # Save again with new values - should update, not duplicate
        resp = _post(auth_headers, {
            "turnover": "2000000",
            "production_quantity": "750",
            "production_unit": "MT",
        })
        assert resp.status_code == 200, resp.text

        get_resp = _get(auth_headers)
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["turnover"] == "2000000"
        assert str(data["production_quantity"]).startswith("750")

    def test_03_clear_production_only_soft_deletes_record(self, auth_headers):
        # Clear production_quantity (null), keep turnover
        resp = _post(auth_headers, {
            "turnover": "2000000",
            "production_quantity": None,
            "production_unit": "MT",
        })
        assert resp.status_code == 200, resp.text

        get_resp = _get(auth_headers)
        assert get_resp.status_code == 200
        data = get_resp.json()
        # production_quantity should be empty string (no active record)
        assert data["production_quantity"] in ("", None), (
            f"Expected empty production_quantity after clear, got: {data['production_quantity']!r}"
        )
        # turnover should remain
        assert data["turnover"] == "2000000"

    def test_04_clear_production_with_empty_string(self, auth_headers):
        # First re-save production
        resp = _post(auth_headers, {
            "turnover": "2000000",
            "production_quantity": "300",
            "production_unit": "MT",
        })
        assert resp.status_code == 200
        # Verify saved
        data = _get(auth_headers).json()
        assert str(data["production_quantity"]).startswith("300")

        # Now clear with empty string
        resp = _post(auth_headers, {
            "turnover": "2000000",
            "production_quantity": "",
            "production_unit": "MT",
        })
        assert resp.status_code == 200

        data = _get(auth_headers).json()
        assert data["production_quantity"] in ("", None), (
            f"Empty-string clear failed; got: {data['production_quantity']!r}"
        )
        assert data["turnover"] == "2000000"

    def test_05_clear_turnover_only_deletes_turnover(self, auth_headers):
        # Re-save both values
        resp = _post(auth_headers, {
            "turnover": "3000000",
            "production_quantity": "400",
            "production_unit": "MT",
        })
        assert resp.status_code == 200

        # Clear turnover only
        resp = _post(auth_headers, {
            "turnover": "",
            "production_quantity": "400",
            "production_unit": "MT",
        })
        assert resp.status_code == 200

        data = _get(auth_headers).json()
        assert data["turnover"] in ("", None), (
            f"Expected empty turnover after clear, got: {data['turnover']!r}"
        )
        assert str(data["production_quantity"]).startswith("400")

    def test_06_clear_both_at_once(self, auth_headers):
        # Re-save both
        resp = _post(auth_headers, {
            "turnover": "4000000",
            "production_quantity": "600",
            "production_unit": "MT",
        })
        assert resp.status_code == 200

        # Clear both
        resp = _post(auth_headers, {
            "turnover": "",
            "production_quantity": "",
            "production_unit": "MT",
        })
        assert resp.status_code == 200

        data = _get(auth_headers).json()
        assert data["turnover"] in ("", None)
        assert data["production_quantity"] in ("", None)

    def test_07_resave_after_clear_creates_new_record(self, auth_headers):
        # Saving after a clear must work (not be blocked by the soft-deleted record)
        resp = _post(auth_headers, {
            "turnover": "5000000",
            "production_quantity": "900",
            "production_unit": "MT",
        })
        assert resp.status_code == 200

        data = _get(auth_headers).json()
        assert data["turnover"] == "5000000"
        assert str(data["production_quantity"]).startswith("900")
