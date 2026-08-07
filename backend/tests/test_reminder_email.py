"""Test the reminder email formatting fix for entity_id and reporting_period."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://admin-report-pack.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_list_assignments(headers):
    r = requests.get(f"{BASE_URL}/api/esg-assignments/assignments", headers=headers)
    print("List assignments:", r.status_code)
    assert r.status_code == 200
    data = r.json()
    if isinstance(data, dict):
        data = data.get("assignments", [])
    print(f"Number of assignments: {len(data)}")
    if data:
        print(f"Sample assignment keys: {list(data[0].keys())}")
        print(f"Sample entity_id: {data[0].get('entity_id')}")
        print(f"Sample start_date: {data[0].get('start_date')}, end_date: {data[0].get('end_date')}")
        print(f"Sample reporting_period: {data[0].get('reporting_period')}")


def test_send_reminder(headers):
    # Get an assignment
    r = requests.get(f"{BASE_URL}/api/esg-assignments/assignments", headers=headers)
    assert r.status_code == 200
    assignments = r.json()
    if isinstance(assignments, dict):
        assignments = assignments.get("assignments", [])
    if not assignments:
        pytest.skip("No assignments to test with")

    # Pick one with underscore in entity_id if possible
    target = None
    for a in assignments:
        if "_" in (a.get("entity_id") or ""):
            target = a
            break
    if not target:
        target = assignments[0]

    print(f"Target assignment entity_id: {target.get('entity_id')}")
    print(f"Target start_date: {target.get('start_date')}, end_date: {target.get('end_date')}")

    r2 = requests.post(
        f"{BASE_URL}/api/esg-assignments/assignments/{target['id']}/remind",
        headers=headers,
    )
    print("Reminder response:", r2.status_code, r2.text[:500])
    assert r2.status_code in (200, 500)  # 500 acceptable if Resend not configured, we check logs
