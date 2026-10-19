"""
Regression tests for monthly all-or-nothing rollback flow.

Modules/features covered:
- POST /api/emissions/batch-rollback auth + validation behavior
- rollback scoping by created_by + submission_batch_id
- rollback removal of created emission records
- rollback removal of create approval requests when present
- C7 monthly compatibility with submission_batch_id rollback semantics
"""

import os
import uuid

import pytest
import requests
from pymongo import MongoClient


def _read_env_key_from_file(file_path: str, key: str):
    try:
        with open(file_path, encoding="utf-8") as file:
            for line in file:
                if line.startswith(f"{key}="):
                    raw = line.split("=", 1)[1].strip()
                    return raw.strip('"').strip("'")
    except FileNotFoundError:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").strip('"').strip("'") or _read_env_key_from_file(
    "/app/frontend/.env", "REACT_APP_BACKEND_URL"
)
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL is required for rollback tests")
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = (os.environ.get("MONGO_URL") or "").strip('"').strip("'") or _read_env_key_from_file("/app/backend/.env", "MONGO_URL")
DB_NAME = (os.environ.get("DB_NAME") or "").strip('"').strip("'") or _read_env_key_from_file("/app/backend/.env", "DB_NAME")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
COMMON_PASSWORD = "TestUser123!"
SUPPLIER_ADMIN_EMAIL = "goyalsomil+919@hotmail.com"
RESTRICTED_USER_EMAIL = "goyalsomil+1@hotmail.com"
RESTRICTED_USER_FACILITY_ID = "39ecd9be-9417-4df6-93c4-e583abf49260"


def _login(email: str, password: str) -> dict:
    response = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text[:300]}"
    data = response.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token returned for {email}: {data}"
    return {
        "token": token,
        "payload": data,
    }


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _first_facility_id(headers: dict) -> str:
    response = requests.get(f"{API}/facilities", headers=headers, timeout=30)
    assert response.status_code == 200, f"facilities fetch failed: {response.status_code} {response.text[:300]}"
    facilities = response.json()
    assert isinstance(facilities, list) and facilities, "No facilities returned for user"
    return facilities[0]["id"]


def _sample_emission_payload(*, facility_id: str, reporting_period: str, submission_batch_id: str) -> dict:
    return {
        "facility_id": facility_id,
        "reporting_period": reporting_period,
        "frequency_type": "monthly",
        "scope": "scope1",
        "category": "Stationary Combustion",
        "category_code": "stationary_combustion",
        "sub_category": "Diesel",
        "fuel_type": "Diesel",
        "dynamic_field_values": {
            "quantity": {"value": 100.0, "unit": "litre"},
        },
        "outputs": {
            "co2": {"value": 0.265, "unit": "tCO2"},
            "ch4": {"value": 0.00001, "unit": "tCH4"},
            "n2o": {"value": 0.000005, "unit": "tN2O"},
            "co2e": {"value": 0.266, "unit": "tCO2e"},
        },
        "source_of_information": "TEST_iter202_batch_rollback",
        "record_source": "manual",
        "notes": "TEST_iter202_batch_rollback",
        "submission_batch_id": submission_batch_id,
    }


@pytest.fixture(scope="module")
def admin_session():
    auth = _login(ADMIN_EMAIL, COMMON_PASSWORD)
    return {
        "token": auth["token"],
        "headers": _headers(auth["token"]),
    }


@pytest.fixture(scope="module")
def supplier_session():
    auth = _login(SUPPLIER_ADMIN_EMAIL, COMMON_PASSWORD)
    return {
        "token": auth["token"],
        "headers": _headers(auth["token"]),
    }


@pytest.fixture(scope="module")
def restricted_session():
    auth = _login(RESTRICTED_USER_EMAIL, COMMON_PASSWORD)
    return {
        "token": auth["token"],
        "headers": _headers(auth["token"]),
    }


@pytest.fixture(scope="module")
def mongo_db():
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME missing; DB-level assertions cannot run")
    client = MongoClient(MONGO_URL)
    try:
        yield client[DB_NAME]
    finally:
        client.close()


@pytest.fixture(scope="module")
def cleanup_record_ids(admin_session):
    created_standard = []
    created_c7 = []
    yield {"standard": created_standard, "c7": created_c7}

    for record_id in created_standard:
        requests.delete(f"{API}/emissions/{record_id}", headers=admin_session["headers"], timeout=20)

    for record_id in created_c7:
        requests.delete(f"{API}/emissions/c7/{record_id}", headers=admin_session["headers"], timeout=20)


class TestBatchRollbackEndpoint:
    """Batch rollback API behavior and data integrity."""

    def test_01_batch_rollback_requires_auth(self):
        response = requests.post(
            f"{API}/emissions/batch-rollback",
            json={"submission_batch_id": f"TEST-{uuid.uuid4()}"},
            timeout=20,
        )
        assert response.status_code in (401, 403), (
            f"Expected 401/403 without auth, got {response.status_code}: {response.text[:200]}"
        )

    def test_02_batch_rollback_validates_submission_batch_id(self, admin_session):
        response = requests.post(
            f"{API}/emissions/batch-rollback",
            json={"submission_batch_id": "   "},
            headers=admin_session["headers"],
            timeout=20,
        )
        assert response.status_code == 422, f"Expected 422 for blank id, got {response.status_code}: {response.text[:200]}"

    def test_03_batch_rollback_removes_only_creator_records(
        self,
        admin_session,
        supplier_session,
        cleanup_record_ids,
    ):
        facility_id = _first_facility_id(admin_session["headers"])
        batch_id = f"TEST-iter202-admin-{uuid.uuid4()}"

        payload = _sample_emission_payload(
            facility_id=facility_id,
            reporting_period="2026-10",
            submission_batch_id=batch_id,
        )
        create_response = requests.post(
            f"{API}/emissions",
            headers=admin_session["headers"],
            json=payload,
            timeout=30,
        )
        assert create_response.status_code == 200, (
            f"Admin create failed: {create_response.status_code} {create_response.text[:300]}"
        )
        created = create_response.json()
        created_id = created["id"]
        cleanup_record_ids["standard"].append(created_id)

        # Other authenticated user attempts rollback with same batch id; must not touch admin data.
        foreign_rollback = requests.post(
            f"{API}/emissions/batch-rollback",
            headers=supplier_session["headers"],
            json={"submission_batch_id": batch_id},
            timeout=30,
        )
        assert foreign_rollback.status_code == 200, (
            f"Foreign rollback failed unexpectedly: {foreign_rollback.status_code} {foreign_rollback.text[:200]}"
        )
        assert foreign_rollback.json().get("rolled_back_count") == 0

        # Record still exists for creator.
        get_after_foreign = requests.get(
            f"{API}/emissions/{created_id}",
            headers=admin_session["headers"],
            timeout=20,
        )
        assert get_after_foreign.status_code == 200, "Foreign rollback wrongly removed creator's record"

        # Creator rolls back and record must be removed.
        owner_rollback = requests.post(
            f"{API}/emissions/batch-rollback",
            headers=admin_session["headers"],
            json={"submission_batch_id": batch_id},
            timeout=30,
        )
        assert owner_rollback.status_code == 200, (
            f"Owner rollback failed: {owner_rollback.status_code} {owner_rollback.text[:200]}"
        )
        assert owner_rollback.json().get("rolled_back_count") >= 1

        get_after_owner = requests.get(
            f"{API}/emissions/{created_id}",
            headers=admin_session["headers"],
            timeout=20,
        )
        assert get_after_owner.status_code == 404, (
            f"Record still present after owner rollback: {get_after_owner.status_code} {get_after_owner.text[:200]}"
        )

        cleanup_record_ids["standard"].remove(created_id)

    def test_04_batch_rollback_removes_create_approval_requests_when_present(
        self,
        restricted_session,
        cleanup_record_ids,
        mongo_db,
    ):
        batch_id = f"TEST-iter202-restricted-{uuid.uuid4()}"
        payload = _sample_emission_payload(
            facility_id=RESTRICTED_USER_FACILITY_ID,
            reporting_period="2026-11",
            submission_batch_id=batch_id,
        )

        create_response = requests.post(
            f"{API}/emissions",
            headers=restricted_session["headers"],
            json=payload,
            timeout=30,
        )
        if create_response.status_code != 200:
            pytest.skip(
                "Restricted user could not create test emission in this environment: "
                f"{create_response.status_code} {create_response.text[:240]}"
            )

        created = create_response.json()
        created_id = created["id"]
        cleanup_record_ids["standard"].append(created_id)

        pre_approval_count = mongo_db.approval_requests.count_documents(
            {
                "entity_type": "emission_record",
                "entity_id": created_id,
                "request_type": "create",
            }
        )

        rollback_response = requests.post(
            f"{API}/emissions/batch-rollback",
            headers=restricted_session["headers"],
            json={"submission_batch_id": batch_id},
            timeout=30,
        )
        assert rollback_response.status_code == 200, (
            f"Rollback failed: {rollback_response.status_code} {rollback_response.text[:200]}"
        )

        remaining_record = mongo_db.emission_records.count_documents({"id": created_id})
        assert remaining_record == 0, "Emission record still present after rollback"

        if pre_approval_count == 0:
            pytest.skip("No create approval request existed for this user/org setup; deletion assertion skipped")

        post_approval_count = mongo_db.approval_requests.count_documents(
            {
                "entity_type": "emission_record",
                "entity_id": created_id,
                "request_type": "create",
            }
        )
        assert post_approval_count == 0, "Create approval request was not removed by rollback"

        cleanup_record_ids["standard"].remove(created_id)

    def test_05_c7_monthly_records_participate_in_batch_rollback(
        self,
        admin_session,
        cleanup_record_ids,
    ):
        facility_id = _first_facility_id(admin_session["headers"])
        batch_id = f"TEST-iter202-c7-{uuid.uuid4()}"

        c7_payload = {
            "facility_id": facility_id,
            "reporting_year": 2099,
            "reporting_month": "feb",
            "calculation_method": "activity_basis",
            "activity_type": "car_travel",
            "activity_name": "TEST_iter202_c7",
            "submission_batch_id": batch_id,
            "employees": [
                {
                    "id": str(uuid.uuid4()),
                    "name": "TEST Iter202 Employee",
                    "employee_id": f"TEST-{uuid.uuid4().hex[:8]}",
                    "department": "QA",
                    "activity_type": "car_travel",
                    "inputs": {"distance_km": 10, "working_days": 2},
                    "emissions": {"co2e": 0.1},
                }
            ],
            "notes": "TEST_iter202_c7_batch_rollback",
            "responsible_person": "TEST_QA",
        }

        create_response = requests.post(
            f"{API}/emissions/c7/month",
            headers=admin_session["headers"],
            json=c7_payload,
            timeout=30,
        )
        assert create_response.status_code == 200, (
            f"C7 create failed: {create_response.status_code} {create_response.text[:300]}"
        )
        created_c7 = create_response.json()
        c7_id = created_c7["id"]
        cleanup_record_ids["c7"].append(c7_id)

        rollback_response = requests.post(
            f"{API}/emissions/batch-rollback",
            headers=admin_session["headers"],
            json={"submission_batch_id": batch_id},
            timeout=30,
        )
        assert rollback_response.status_code == 200
        assert rollback_response.json().get("rolled_back_count", 0) >= 1, (
            "Expected rollback to remove C7 monthly record with matching submission_batch_id"
        )

        fetch_deleted = requests.get(
            f"{API}/emissions/{c7_id}",
            headers=admin_session["headers"],
            timeout=20,
        )
        assert fetch_deleted.status_code == 404, "C7 record still exists after rollback"

        cleanup_record_ids["c7"].remove(c7_id)
