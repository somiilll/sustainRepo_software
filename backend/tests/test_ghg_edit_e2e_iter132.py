"""
End-to-end regression for iter-132 fixes.

Flow:
1. Aman (non-admin) submits an update to an approved emission record.
2. GET /api/emissions/{id} as Aman must return the PROPOSED values.
3. GET /api/emissions/{id} as Admin must still return the ORIGINAL values.
4. Admin approves the request via /api/approval-workflows/requests/{req}/decide.
5. GET /api/emissions/{id} must now show the NEW approved values with
   dynamic_field_values correctly populated (this validates the
   'inputs'→'dynamic_field_values' mapping fix in approval_workflow/service.py).
6. co2e_emissions must equal the proposed outputs.co2e.value.
7. Cleanup: admin restores the original qty/co2e.
"""
import os
import copy
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://esg-emissions-hub.preview.emergentagent.com"

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
AMAN_EMAIL = "goyalsomil+1@hotmail.com"
PASSWORD = "TestUser123!"


def _login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code}")
    j = r.json()
    return j.get("access_token") or j.get("token")


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _get(path, tok):
    return requests.get(f"{BASE_URL}{path}", headers=_hdr(tok), timeout=60)


def _dfv_val(dfv, key):
    if not dfv:
        return None
    v = dfv.get(key)
    if isinstance(v, dict):
        return v.get("value")
    return v


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL)


@pytest.fixture(scope="module")
def aman_token():
    return _login(AMAN_EMAIL)


def _find_editable_record(token):
    r = _get("/api/emissions", token)
    if r.status_code != 200:
        return None
    for rec in r.json():
        if (rec.get("approval_status") == "approved"
                and rec.get("scope") in ("scope1", "scope2")
                and rec.get("dynamic_field_values", {}).get("qty")):
            return rec
    return None


def _build_put_payload(rec, new_qty_value):
    """Build a PUT /api/emissions/{id} payload keeping most fields and only tweaking qty."""
    dfv = copy.deepcopy(rec.get("dynamic_field_values") or {})
    if "qty" in dfv and isinstance(dfv["qty"], dict):
        dfv["qty"]["value"] = new_qty_value
    # Preserve outputs but scale co2e/co2 with qty ratio if we can
    orig_qty = _dfv_val(rec.get("dynamic_field_values"), "qty")
    outputs = copy.deepcopy(rec.get("outputs") or {})
    if orig_qty and float(orig_qty) > 0:
        ratio = float(new_qty_value) / float(orig_qty)
        for key in ("co2", "ch4", "n2o", "co2e"):
            if key in outputs and isinstance(outputs[key], dict) and outputs[key].get("value") is not None:
                outputs[key]["value"] = float(outputs[key]["value"]) * ratio

    payload = {
        "scope": rec.get("scope"),
        "category": rec.get("category"),
        "category_id": rec.get("category_id"),
        "sub_category": rec.get("sub_category"),
        "fuel_type": rec.get("fuel_type"),
        "facility_id": rec.get("facility_id"),
        "reporting_period": rec.get("reporting_period"),
        "frequency_type": rec.get("frequency_type") or "monthly",
        "dynamic_field_values": dfv,
        "outputs": outputs,
        "notes": rec.get("notes") or "",
        "evidence_files": rec.get("evidence_files") or [],
        "emission_factor": rec.get("emission_factor"),
        "is_custom_factor": rec.get("is_custom_factor", False),
        "process_names": rec.get("process_names") or [],
        "process_descriptions": rec.get("process_descriptions") or [],
        "responsible_person": rec.get("responsible_person") or "",
        "responsible_person_designation": rec.get("responsible_person_designation") or "",
        "responsible_person_contact": rec.get("responsible_person_contact") or "",
        "source_of_information": rec.get("source_of_information") or "",
        "scope3_activity": rec.get("scope3_activity"),
        "calculation_method_scope3": rec.get("calculation_method_scope3"),
        "biogenic_scope_selection": rec.get("biogenic_scope_selection"),
        "scope3_ef_id": rec.get("scope3_ef_id"),
    }
    # Strip None to avoid Pydantic issues
    return {k: v for k, v in payload.items() if v is not None}, outputs


def _find_pending_req_for_record(admin_token, record_id):
    r = _get("/api/approval-workflows/requests?status=pending", admin_token)
    if r.status_code != 200:
        return None
    for req in r.json().get("requests", []):
        if req.get("entity_type") == "emission_record" and req.get("entity_id") == record_id:
            return req
    return None


class TestGhgEditApprovalE2E:

    def test_full_edit_then_approve_flow(self, admin_token, aman_token):
        # 1. Find a candidate record Aman can see & edit
        rec = _find_editable_record(aman_token)
        if not rec:
            pytest.skip("No editable emission record available to Aman")
        record_id = rec["id"]
        orig_dfv = copy.deepcopy(rec.get("dynamic_field_values") or {})
        orig_qty = float(_dfv_val(orig_dfv, "qty"))
        orig_co2e = float(rec.get("co2e_emissions") or 0)
        # Pick a distinctive proposed value
        proposed_qty = orig_qty + 3.0
        print(f"Record {record_id}: orig_qty={orig_qty}, orig_co2e={orig_co2e}, proposed_qty={proposed_qty}")

        # 2. Aman submits PUT
        payload, outputs = _build_put_payload(rec, proposed_qty)
        put_resp = requests.put(f"{BASE_URL}/api/emissions/{record_id}",
                                headers=_hdr(aman_token), json=payload, timeout=60)
        assert put_resp.status_code == 200, f"PUT failed: {put_resp.status_code} {put_resp.text[:400]}"
        put_body = put_resp.json()
        print(f"After PUT: approval_status={put_body.get('approval_status')}")
        # Should be pending_approval
        assert put_body.get("approval_status") in ("pending_approval", "pending_update"), \
            f"Expected pending status, got {put_body.get('approval_status')}"

        try:
            # 3. Aman GET should see PROPOSED value
            time.sleep(0.5)
            aman_get = _get(f"/api/emissions/{record_id}", aman_token)
            assert aman_get.status_code == 200, aman_get.text[:300]
            aman_qty = float(_dfv_val(aman_get.json().get("dynamic_field_values"), "qty"))
            print(f"Aman sees qty={aman_qty}")
            assert abs(aman_qty - proposed_qty) < 0.001, (
                f"Aman should see proposed {proposed_qty}, got {aman_qty}"
            )

            # 4. Admin GET should see ORIGINAL value
            admin_get = _get(f"/api/emissions/{record_id}", admin_token)
            assert admin_get.status_code == 200, admin_get.text[:300]
            admin_qty = float(_dfv_val(admin_get.json().get("dynamic_field_values"), "qty"))
            print(f"Admin sees qty={admin_qty}")
            assert abs(admin_qty - orig_qty) < 0.001, (
                f"Admin should see original {orig_qty}, got {admin_qty}"
            )

            # 5. Find pending approval request and approve it
            req = _find_pending_req_for_record(admin_token, record_id)
            assert req, "No pending approval request found for the record"
            req_id = req["id"]
            print(f"Approving request {req_id}")
            dec = requests.post(
                f"{BASE_URL}/api/approval-workflows/requests/{req_id}/decide",
                headers=_hdr(admin_token),
                json={"action": "approve", "comment": "iter132 e2e test"},
                timeout=60,
            )
            assert dec.status_code == 200, f"Approval failed: {dec.status_code} {dec.text[:400]}"
            time.sleep(1)

            # 6. After approval, both users should see the proposed value
            final_admin = _get(f"/api/emissions/{record_id}", admin_token).json()
            final_qty = float(_dfv_val(final_admin.get("dynamic_field_values"), "qty"))
            final_co2e = float(final_admin.get("co2e_emissions") or 0)
            print(f"Post-approval: qty={final_qty}, co2e={final_co2e}")
            assert abs(final_qty - proposed_qty) < 0.001, (
                f"After approval qty should be {proposed_qty}, got {final_qty} "
                f"(this validates the inputs→dynamic_field_values mapping fix)"
            )
            expected_co2e = (outputs.get("co2e") or {}).get("value")
            if expected_co2e is not None:
                assert abs(final_co2e - float(expected_co2e)) < 0.001, (
                    f"co2e should match proposed {expected_co2e}, got {final_co2e}"
                )
            # approval_status back to approved
            assert final_admin.get("approval_status") == "approved", \
                f"approval_status should be 'approved', got {final_admin.get('approval_status')}"
        finally:
            # 7. Cleanup: restore original qty & co2e as admin
            print("Cleanup: restoring original values")
            cleanup_payload = copy.deepcopy(payload)
            cleanup_dfv = copy.deepcopy(orig_dfv)
            cleanup_payload["dynamic_field_values"] = cleanup_dfv
            cleanup_payload["outputs"] = copy.deepcopy(rec.get("outputs") or {})
            try:
                requests.put(f"{BASE_URL}/api/emissions/{record_id}",
                             headers=_hdr(admin_token), json=cleanup_payload, timeout=60)
            except Exception as e:
                print(f"Cleanup failed: {e}")
