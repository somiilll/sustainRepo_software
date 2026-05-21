"""
Backend tests for DYNAMIC emission record structure.
- dynamic_field_values: Dict[str, {value, unit, is_override, justification}]
- outputs: Dict[str, {value, unit}]  (keys: co2, ch4, n2o, co2e)
Covers: create -> list -> get-by-facility -> update (override toggle) -> delete.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://emissions-tracker-18.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "goyalsomil2@hotmail.com"
ADMIN_PASSWORD = "Test123!"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def facility_id(headers):
    r = requests.get(f"{API}/facilities", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    fs = r.json()
    assert len(fs) > 0, "No facility available for admin"
    return fs[0]["id"]


@pytest.fixture(scope="module")
def created_record_ids():
    """Holds ids across tests for cleanup."""
    return []


# ---------- module-level cleanup ----------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(request, created_record_ids):
    def finalize():
        try:
            tok_resp = requests.post(f"{API}/auth/login",
                                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
            if tok_resp.status_code != 200:
                return
            t = tok_resp.json().get("token") or tok_resp.json().get("access_token")
            h = {"Authorization": f"Bearer {t}"}
            for rid in created_record_ids:
                requests.delete(f"{API}/emissions/{rid}", headers=h, timeout=30)
        except Exception:
            pass
    request.addfinalizer(finalize)


# ---------- helpers ----------
def _sample_payload(facility_id, with_override=False):
    dfv = {
        "qty": {"value": 1000.0, "unit": "kg", "is_override": False, "justification": None},
        "cv":  {"value": 45.5, "unit": "MJ/kg",
                "is_override": bool(with_override),
                "justification": "Lab test report 2025-Q4" if with_override else None},
        "density": {"value": 0.832, "unit": "kg/L", "is_override": False, "justification": None},
    }
    outputs = {
        "co2":  {"value": 3.155, "unit": "tCO2"},
        "ch4":  {"value": 0.00012, "unit": "tCH4"},
        "n2o":  {"value": 0.00003, "unit": "tN2O"},
        "co2e": {"value": 3.168, "unit": "tCO2e"},
    }
    return {
        "facility_id": facility_id,
        "reporting_period": "2025-10",
        "scope": "scope1",
        "category": "Stationary Combustion",
        "sub_category": "Diesel",
        "fuel_type": "Diesel",
        "dynamic_field_values": dfv,
        "outputs": outputs,
        "source_of_information": "TEST_dynamic_fields",
        "notes": f"TEST record {uuid.uuid4().hex[:8]}",
        "process_names": ["TEST_process_A"],
        "process_descriptions": [{"name": "TEST_process_A", "description": "desc"}],
    }


# ---------- tests ----------

# create emission with dynamic fields (no override)
class TestCreateDynamicEmission:
    def test_create_sets_dynamic_field_values_and_outputs(self, headers, facility_id, created_record_ids):
        payload = _sample_payload(facility_id, with_override=False)
        r = requests.post(f"{API}/emissions", headers=headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
        body = r.json()
        rid = body["id"]
        created_record_ids.append(rid)

        # dynamic_field_values echoed back intact
        dfv = body.get("dynamic_field_values") or {}
        assert "qty" in dfv and "cv" in dfv and "density" in dfv, f"Missing keys: {dfv}"
        assert dfv["qty"]["value"] == 1000.0
        assert dfv["qty"]["unit"] == "kg"
        assert dfv["qty"]["is_override"] is False
        assert dfv["cv"]["unit"] == "MJ/kg"
        assert dfv["cv"]["is_override"] is False

        # outputs stored
        outs = body.get("outputs") or {}
        assert outs.get("co2", {}).get("value") == pytest.approx(3.155)
        assert outs.get("co2e", {}).get("value") == pytest.approx(3.168)

        # convenience accessors derived from outputs
        assert body.get("co2_emissions") == pytest.approx(3.155)
        assert body.get("ch4_emissions") == pytest.approx(0.00012)
        assert body.get("n2o_emissions") == pytest.approx(0.00003)
        assert body.get("co2e_emissions") == pytest.approx(3.168)
        assert body.get("total_emissions") == pytest.approx(3.168)

        # no MongoDB _id leak
        assert "_id" not in body

    def test_create_with_override_persists_flag_and_justification(self, headers, facility_id, created_record_ids):
        payload = _sample_payload(facility_id, with_override=True)
        r = requests.post(f"{API}/emissions", headers=headers, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        created_record_ids.append(body["id"])

        dfv = body["dynamic_field_values"]
        assert dfv["cv"]["is_override"] is True
        assert dfv["cv"]["justification"] == "Lab test report 2025-Q4"
        # Non-overridden field still false
        assert dfv["qty"]["is_override"] is False


# read / list
class TestListAndGetDynamicEmission:
    def test_list_contains_dynamic_field_values_and_outputs(self, headers, facility_id, created_record_ids):
        assert len(created_record_ids) >= 1
        rid = created_record_ids[0]
        r = requests.get(f"{API}/emissions", headers=headers,
                         params={"facility_id": facility_id}, timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json()
        found = next((x for x in rows if x["id"] == rid), None)
        assert found is not None, f"Created record {rid} not returned in list"
        assert "_id" not in found

        # list must surface qty from dynamic_field_values (used by UI table)
        dfv = found.get("dynamic_field_values") or {}
        assert dfv.get("qty", {}).get("value") == 1000.0
        assert dfv.get("qty", {}).get("unit") == "kg"

        # list must surface co2e in outputs (used by UI table)
        outs = found.get("outputs") or {}
        assert outs.get("co2e", {}).get("value") == pytest.approx(3.168)
        # and convenience flat fields
        assert found.get("co2e_emissions") == pytest.approx(3.168)


# update: toggle override on density, change quantity
class TestUpdateDynamicEmission:
    def test_update_persists_new_dynamic_values_and_override_toggle(self, headers, facility_id, created_record_ids):
        assert len(created_record_ids) >= 1
        rid = created_record_ids[0]

        new_payload = _sample_payload(facility_id, with_override=False)
        # change qty value + unit
        new_payload["dynamic_field_values"]["qty"] = {
            "value": 2500.0, "unit": "L", "is_override": False, "justification": None,
        }
        # flip density to override with justification
        new_payload["dynamic_field_values"]["density"] = {
            "value": 0.840, "unit": "kg/L", "is_override": True, "justification": "Updated density",
        }
        # new outputs
        new_payload["outputs"]["co2e"] = {"value": 7.92, "unit": "tCO2e"}
        new_payload["outputs"]["co2"] = {"value": 7.88, "unit": "tCO2"}

        r = requests.put(f"{API}/emissions/{rid}", headers=headers, json=new_payload, timeout=30)
        assert r.status_code == 200, f"Update failed: {r.status_code} {r.text}"
        body = r.json()

        dfv = body["dynamic_field_values"]
        assert dfv["qty"]["value"] == 2500.0
        assert dfv["qty"]["unit"] == "L"
        assert dfv["density"]["is_override"] is True
        assert dfv["density"]["justification"] == "Updated density"
        assert body["co2e_emissions"] == pytest.approx(7.92)

        # GET-after-PUT to confirm persistence
        r2 = requests.get(f"{API}/emissions", headers=headers,
                          params={"facility_id": facility_id}, timeout=30)
        assert r2.status_code == 200
        row = next((x for x in r2.json() if x["id"] == rid), None)
        assert row is not None
        assert row["dynamic_field_values"]["qty"]["value"] == 2500.0
        assert row["dynamic_field_values"]["density"]["is_override"] is True
        assert row["outputs"]["co2e"]["value"] == pytest.approx(7.92)


# delete
class TestDeleteDynamicEmission:
    def test_delete_record(self, headers, created_record_ids):
        # pop the oldest so cleanup doesn't try to re-delete
        if not created_record_ids:
            pytest.skip("nothing to delete")
        rid = created_record_ids.pop(0)
        r = requests.delete(f"{API}/emissions/{rid}", headers=headers, timeout=30)
        assert r.status_code in (200, 204), r.text
