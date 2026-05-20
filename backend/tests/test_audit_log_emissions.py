"""
Tests for the Edit Emission Dialog audit log endpoint.
GET /api/user/calc-engine/audit-log/{emission_record_id}
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sustainrepo-preview-2.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "goyalsomil2@hotmail.com"
ADMIN_PASSWORD = "Test123!"

# Known test emission IDs from the review request
EMISSION_231_KL = "1d1dcfc7-7b1d-44a4-950b-e6ffeda92277"  # 231 kL diesel
EMISSION_1000_KG = "a940bff9-443f-497d-a3df-4008763a3286"  # 1000 kg diesel
BOGUS_ID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture(scope="module")
def admin_token():
    # Attempt multiple login endpoints
    for path in ["/api/auth/login", "/api/login"]:
        r = requests.post(
            f"{BASE_URL}{path}",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=30,
        )
        if r.status_code == 200:
            data = r.json()
            token = data.get("access_token") or data.get("token")
            if token:
                return token
    pytest.skip(f"Admin login failed via known paths; last status {r.status_code} body {r.text[:200]}")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Endpoint existence ----------
class TestAuditLogEndpoint:
    def test_endpoint_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/user/calc-engine/audit-log/{EMISSION_231_KL}", timeout=30)
        assert r.status_code in (401, 403), f"Expected 401/403 w/o auth, got {r.status_code}"

    def test_audit_log_231_kl(self, auth_headers):
        url = f"{BASE_URL}/api/user/calc-engine/audit-log/{EMISSION_231_KL}"
        r = requests.get(url, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"Status {r.status_code} body {r.text[:300]}"
        data = r.json()
        # Structure assertions
        assert "audit_log" in data
        assert "found" in data
        assert data["emission_record_id"] == EMISSION_231_KL
        # If found, audit_log must be a list with entries
        if data.get("found"):
            assert isinstance(data["audit_log"], list)
            assert len(data["audit_log"]) > 0, "Expected non-empty audit_log when found=true"
            # Look for input entry with qty-like variable and value 231
            input_entries = [e for e in data["audit_log"] if e.get("step") == "input"]
            print(f"231kL audit inputs: {[(e.get('variable'), e.get('value'), e.get('unit')) for e in input_entries]}")
            # Should contain some input entry
            assert len(input_entries) > 0, "Expected at least one input step"

    def test_audit_log_1000_kg(self, auth_headers):
        url = f"{BASE_URL}/api/user/calc-engine/audit-log/{EMISSION_1000_KG}"
        r = requests.get(url, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"Status {r.status_code} body {r.text[:300]}"
        data = r.json()
        assert "audit_log" in data
        assert data["emission_record_id"] == EMISSION_1000_KG
        if data.get("found"):
            input_entries = [e for e in data["audit_log"] if e.get("step") == "input"]
            print(f"1000kg audit inputs: {[(e.get('variable'), e.get('value'), e.get('unit')) for e in input_entries]}")

    def test_audit_log_bogus_id_returns_empty(self, auth_headers):
        """Non-existent emission_record_id should return 200 w/ found=false (per code)."""
        url = f"{BASE_URL}/api/user/calc-engine/audit-log/{BOGUS_ID}"
        r = requests.get(url, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("found") is False
        assert data.get("audit_log") == []

    def test_audit_log_response_no_mongo_id(self, auth_headers):
        """Response must not leak mongo _id."""
        url = f"{BASE_URL}/api/user/calc-engine/audit-log/{EMISSION_231_KL}"
        r = requests.get(url, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Recursively check no key is literally "_id"
        def _no_mongo_id(obj):
            if isinstance(obj, dict):
                assert "_id" not in obj, f"_id leaked in response: keys={list(obj.keys())}"
                for v in obj.values():
                    _no_mongo_id(v)
            elif isinstance(obj, list):
                for i in obj:
                    _no_mongo_id(i)
        _no_mongo_id(data)

    def test_old_path_not_used(self, auth_headers):
        """The old /api/calc-engine/audit-log path should NOT be the primary one.
        Frontend uses /api/user/calc-engine/audit-log.  Verify old variant returns 404/403/405."""
        r = requests.get(
            f"{BASE_URL}/api/calc-engine/audit-log/{EMISSION_231_KL}",
            headers=auth_headers,
            timeout=30,
        )
        # Either 404 (not mounted) or 403 (super-admin only). Both indicate frontend MUST use /user/ path.
        assert r.status_code in (401, 403, 404, 405), f"Old path returned unexpected {r.status_code}"
