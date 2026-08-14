"""ESG Records module: Water quantity_unit edit persistence regression tests."""

import copy
import os

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_headers(session):
    assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
    resp = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    token = resp.json().get("access_token") or resp.json().get("token")
    assert token, f"No access token in login response: {resp.text}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _pick_editable_water_record(records):
    for rec in records:
        if rec.get("source_type") == "ghg_import":
            continue
        if rec.get("is_locked"):
            continue
        field_values = rec.get("field_values") or {}
        qty = field_values.get("quantity")
        if isinstance(qty, (int, float)):
            return rec
    return None


def _get_record(session, headers, record_id):
    resp = session.get(
        f"{BASE_URL}/api/esg-records/records/environment/{record_id}",
        headers=headers,
        timeout=30,
    )
    assert resp.status_code == 200, f"Record fetch failed: {resp.status_code} {resp.text}"
    return resp.json()


def _update_field_values(session, headers, record_id, field_values):
    resp = session.put(
        f"{BASE_URL}/api/esg-records/records/environment/{record_id}",
        headers=headers,
        json={"field_values": field_values, "status": "completed"},
        timeout=30,
    )
    assert resp.status_code == 200, f"Update failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data.get("record"), f"Missing updated record payload: {data}"
    return data["record"]


def test_water_quantity_unit_edit_persists_and_numeric_value_unchanged(session, admin_headers):
    list_resp = session.get(
        f"{BASE_URL}/api/esg-records/records/environment",
        headers=admin_headers,
        params={"category": "Water", "include_imported": "false", "limit": 100},
        timeout=30,
    )
    assert list_resp.status_code == 200, f"List failed: {list_resp.status_code} {list_resp.text}"
    records = list_resp.json().get("records", [])
    target = _pick_editable_water_record(records)
    if not target:
        pytest.skip("No editable Water record with numeric quantity found in this org")

    record_id = target["id"]
    original = _get_record(session, admin_headers, record_id)
    original_field_values = copy.deepcopy(original.get("field_values") or {})

    original_quantity = original_field_values.get("quantity")
    if not isinstance(original_quantity, (int, float)):
        pytest.skip("Selected Water record does not expose numeric quantity on detail payload")

    original_unit = original_field_values.get("quantity_unit")
    intermediate_unit = "Litres" if original_unit == "KiloLitres" else "KiloLitres"

    try:
        # Step 1: Move away from current unit (if needed) so Step 2 validates actual persistence.
        fv_step1 = copy.deepcopy(original_field_values)
        fv_step1["quantity_unit"] = intermediate_unit
        _update_field_values(session, admin_headers, record_id, fv_step1)
        step1 = _get_record(session, admin_headers, record_id)
        assert step1.get("field_values", {}).get("quantity_unit") == intermediate_unit
        assert step1.get("field_values", {}).get("quantity") == original_quantity

        # Step 2: Explicitly set KiloLitres and verify persistence.
        fv_step2 = copy.deepcopy(step1.get("field_values") or {})
        fv_step2["quantity_unit"] = "KiloLitres"
        _update_field_values(session, admin_headers, record_id, fv_step2)
        step2 = _get_record(session, admin_headers, record_id)
        step2_fv = step2.get("field_values") or {}

        assert step2_fv.get("quantity_unit") == "KiloLitres"
        assert step2_fv.get("quantity") == original_quantity

        # Ensure only unit changed between original and final for the quantity key path.
        non_unit_original = {k: v for k, v in original_field_values.items() if k != "quantity_unit"}
        non_unit_final = {k: v for k, v in step2_fv.items() if k != "quantity_unit"}
        assert non_unit_original == non_unit_final
    finally:
        # Restore production-like record to original values.
        _update_field_values(session, admin_headers, record_id, original_field_values)
