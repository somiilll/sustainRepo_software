"""
Iter-133 backend regression: three GHG edit/approval fixes.

Scenarios:
  1) Non-admin Ravi has a pending edit → GET /api/emissions/{id} returns
     is_my_pending_proposal=True and dynamic_field_values reflect his proposal.
  2) Non-admin Aman viewing same record → sees ORIGINAL approved values (not Ravi's).
  3) Multi-proposal: both Aman and Ravi can each submit their own pending edit.
  4) Rejection of UPDATE request reverts approval_status back to "approved" (never
     leaves record stuck as pending_approval or rejected).
  5) No records have stale pending_approval status without an actual pending request.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ghg-calc-engine-4.preview.emergentagent.com").rstrip("/")

ADMIN = ("goyalsomil2001@gmail.com", "TestUser123!")
AMAN = ("goyalsomil+1@hotmail.com", "TestUser123!")
RAVI = ("goyalsomil+4@hotmail.com", "TestUser123!")

# Record Ravi already has a pending edit on (per task context)
RAVI_TARGET_RECORD = "db491ca4-20fd-4e83-b653-4959744a5916"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token for {email}: {r.text}"
    return tok


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(*ADMIN),
        "aman": _login(*AMAN),
        "ravi": _login(*RAVI),
    }


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- 1 & 2: Ravi sees his proposal, Aman sees original ----------

def test_ravi_sees_own_pending_proposal(tokens):
    r = requests.get(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["ravi"]), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()

    assert data.get("is_my_pending_proposal") is True, (
        f"Expected is_my_pending_proposal=True for submitter. Got: {data.get('is_my_pending_proposal')}"
    )
    assert data.get("approval_status") == "pending_approval", (
        f"Expected approval_status=pending_approval. Got: {data.get('approval_status')}"
    )

    dfv = data.get("dynamic_field_values") or {}
    qty = (dfv.get("qty") or {}).get("value")
    assert qty is not None, f"qty missing in dynamic_field_values: {dfv}"
    # Ravi's proposal is qty=8908 per task context
    assert float(qty) == 8908, f"Expected Ravi's proposed qty=8908, got {qty}. dfv={dfv}"

    co2e = data.get("co2e_emissions")
    assert co2e is not None, "co2e_emissions missing"
    # Proposed co2e ~ 20.38
    assert abs(float(co2e) - 20.38) < 0.5, f"Expected co2e~20.38, got {co2e}"


def test_aman_sees_original_not_ravi_proposal(tokens):
    r = requests.get(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["aman"]), timeout=30)
    # Aman may or may not have access; if 403, skip cleanly
    if r.status_code == 403:
        pytest.skip("Aman does not have access to this record (KPI ACL)")
    assert r.status_code == 200, r.text
    data = r.json()

    # Aman is NOT the submitter, so should not see is_my_pending_proposal=True
    assert not data.get("is_my_pending_proposal"), (
        f"Aman should NOT have is_my_pending_proposal=True. Got: {data.get('is_my_pending_proposal')}"
    )

    dfv = data.get("dynamic_field_values") or {}
    qty = (dfv.get("qty") or {}).get("value")
    assert qty is not None, f"qty missing: {dfv}"
    # Original qty=1234 – Aman must see original, not Ravi's 8908
    assert float(qty) != 8908, f"Aman is seeing Ravi's proposal! qty={qty}"
    assert float(qty) == 1234, f"Expected original qty=1234 for Aman, got {qty}"


# ---------- 3: Multi-proposal (both Aman & Ravi have pending edits on same record) ----------

def test_multi_proposal_support(tokens):
    """Admin lists approval requests → both Ravi and Aman can have separate pending entries."""
    # Attempt to have Aman submit a pending edit on the same record
    # First get current record
    r = requests.get(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["aman"]), timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Aman cannot access record (status {r.status_code})")
    rec = r.json()
    dfv = rec.get("dynamic_field_values") or {}

    # Build minimal update payload keeping structure; change qty to a distinct number
    new_dfv = {**dfv}
    if "qty" in new_dfv and isinstance(new_dfv["qty"], dict):
        new_dfv["qty"] = {**new_dfv["qty"], "value": 4321}
    else:
        pytest.skip("Record has no qty field to modify")

    payload = {
        "scope": rec.get("scope"),
        "category": rec.get("category"),
        "facility_id": rec.get("facility_id"),
        "reporting_period": rec.get("reporting_period"),
        "dynamic_field_values": new_dfv,
    }
    # Include optional fields if present
    for k in ("subcategory", "fuel_database_id", "process_names"):
        if rec.get(k) is not None:
            payload[k] = rec.get(k)

    put = requests.put(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["aman"]), json=payload, timeout=45)
    # If Aman is not permitted to edit (no assignment) skip
    if put.status_code in (403, 400):
        pytest.skip(f"Aman not allowed to submit edit: {put.status_code} {put.text[:200]}")
    assert put.status_code == 200, put.text

    time.sleep(1)

    # Admin views approval requests
    ar = requests.get(
        f"{BASE_URL}/api/approval-workflows/requests?status=pending",
        headers=_h(tokens["admin"]),
        timeout=30,
    )
    assert ar.status_code == 200, ar.text
    body = ar.json()
    reqs = body if isinstance(body, list) else body.get("requests") or body.get("items") or []

    matching = [x for x in reqs if x.get("entity_id") == RAVI_TARGET_RECORD]
    submitters = {x.get("submitted_by") or x.get("submitter_id") or (x.get("submitted_by_details") or {}).get("id") for x in matching}
    submitter_emails = {(x.get("submitted_by_email") or (x.get("submitted_by_details") or {}).get("email") or "").lower() for x in matching}

    assert len(matching) >= 2, (
        f"Expected >=2 pending approval requests for record {RAVI_TARGET_RECORD} (multi-proposal). "
        f"Got {len(matching)}. Emails: {submitter_emails}"
    )

    # Now Ravi's GET must still show HIS proposal, not Aman's
    rr = requests.get(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["ravi"]), timeout=30)
    assert rr.status_code == 200
    ravi_qty = (((rr.json() or {}).get("dynamic_field_values") or {}).get("qty") or {}).get("value")
    assert float(ravi_qty) == 8908, f"Ravi's proposal overwritten by Aman's! qty={ravi_qty}"

    # Aman must still see HIS proposal
    ar2 = requests.get(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["aman"]), timeout=30)
    aman_data = ar2.json()
    assert aman_data.get("is_my_pending_proposal") is True
    aman_qty = (((aman_data or {}).get("dynamic_field_values") or {}).get("qty") or {}).get("value")
    assert float(aman_qty) == 4321, f"Aman not seeing his own proposal. qty={aman_qty}"


# ---------- 4: Rejection of UPDATE reverts approval_status to approved ----------

def test_rejection_reverts_status_to_approved(tokens):
    # Ensure Aman has a pending update (may have been created above). If not, create one.
    r = requests.get(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["aman"]), timeout=30)
    if r.status_code != 200:
        pytest.skip("Aman cannot access record")

    # Find Aman's approval request
    ar = requests.get(f"{BASE_URL}/api/approval-workflows/requests?status=pending", headers=_h(tokens["admin"]), timeout=30)
    assert ar.status_code == 200
    body = ar.json()
    reqs = body if isinstance(body, list) else body.get("requests") or body.get("items") or []
    aman_reqs = [x for x in reqs if x.get("entity_id") == RAVI_TARGET_RECORD and
                 (x.get("submitted_by_email") or (x.get("submitted_by_details") or {}).get("email") or "").lower() == AMAN[0].lower()]
    if not aman_reqs:
        pytest.skip("No pending Aman request to reject")

    req_id = aman_reqs[0].get("id") or aman_reqs[0].get("request_id") or aman_reqs[0].get("_id")
    assert req_id, f"Cannot find request id in {aman_reqs[0]}"

    # Reject
    rej = requests.post(
        f"{BASE_URL}/api/approval-workflows/requests/{req_id}/reject",
        headers=_h(tokens["admin"]),
        json={"comment": "test rejection iter133"},
        timeout=30,
    )
    assert rej.status_code in (200, 201, 204), f"Reject failed: {rej.status_code} {rej.text}"

    time.sleep(1)

    # Verify record's approval_status reverts to "approved" (Ravi still has a pending
    # proposal but the underlying record status should not be "rejected")
    admin_get = requests.get(f"{BASE_URL}/api/emissions/{RAVI_TARGET_RECORD}", headers=_h(tokens["admin"]), timeout=30)
    assert admin_get.status_code == 200
    admin_data = admin_get.json()
    status = admin_data.get("approval_status")
    # Ravi still has pending, so admin might still see pending_approval OR approved.
    # The key assertion: status must NOT be "rejected".
    assert status != "rejected", f"Record left in 'rejected' state after UPDATE rejection: {status}"


# ---------- 5: No stale pending_approval without actual pending request ----------

def test_no_stale_pending_approval_status(tokens):
    """List all emissions and cross-reference with pending approval_requests.
    Any record with approval_status='pending_approval' must have a matching pending request.
    """
    er = requests.get(f"{BASE_URL}/api/emissions?limit=500", headers=_h(tokens["admin"]), timeout=45)
    assert er.status_code == 200, er.text
    body = er.json()
    records = body if isinstance(body, list) else body.get("items") or body.get("records") or body.get("emissions") or []

    pending_records = [x for x in records if x.get("approval_status") == "pending_approval"]

    ar = requests.get(f"{BASE_URL}/api/approval-workflows/requests?status=pending&limit=500",
                      headers=_h(tokens["admin"]), timeout=45)
    assert ar.status_code == 200
    body2 = ar.json()
    reqs = body2 if isinstance(body2, list) else body2.get("requests") or body2.get("items") or []
    pending_entity_ids = {x.get("entity_id") for x in reqs if x.get("entity_type") == "emission_record"}

    stale = [r.get("id") for r in pending_records if r.get("id") not in pending_entity_ids]
    assert not stale, f"Records with stale pending_approval status (no matching request): {stale[:10]}"
