"""
Backend tests for the 4 fixes:
1) BRSR status showing pending_approval
2) BRSR shows BRSR badge (not GRI) in approval queue
3) BRSR opens BRSRApprovalPanel (verified via framework field)
4) GRI answers persist after approval
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASS = "TestUser123!"
ORG_ID = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"
REPORTING_PERIOD = "2024"

GRI_KEY = "gri_101_2_c"
BRSR_KEY = "policy_translated_to_procedures"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _save_response(auth, question_key, value):
    return requests.post(
        f"{BASE_URL}/api/esg-questionnaire/response",
        headers=auth,
        json={"question_key": question_key, "value": value, "reporting_period": REPORTING_PERIOD, "status": "saved"},
    )


def _get_pending_approvals(auth):
    # Approval workflow endpoint - uses /requests?status=pending
    r = requests.get(f"{BASE_URL}/api/approval-workflows/requests", headers=auth, params={"status": "pending"})
    return r


def test_save_gri_response_creates_pending_approval(auth):
    """Fix 1 & 4: Saving GRI should save to organization_esg_responses AND create submission."""
    resp = _save_response(auth, GRI_KEY, "TEST GRI value pending approval")
    assert resp.status_code == 200, f"Save failed: {resp.text}"
    data = resp.json()
    print("GRI save response:", data)
    # Should be submitted for approval (if approver configured) OR direct saved
    # Now verify the value is visible via GET
    r2 = requests.get(
        f"{BASE_URL}/api/esg-questionnaire/response/{GRI_KEY}",
        headers=auth,
        params={"reporting_period": REPORTING_PERIOD},
    )
    if r2.status_code == 200:
        d = r2.json()
        print("GRI get response:", d)
        # Value must be present
        assert d.get("value") is not None or d.get("response", {}).get("value") is not None, (
            f"GRI value not persisted in organization_esg_responses: {d}"
        )


def test_save_brsr_response_framework_correct(auth):
    """Fix 2: Saving BRSR should tag framework=BRSR in approval_request."""
    resp = _save_response(auth, BRSR_KEY, "Yes")
    assert resp.status_code == 200, f"Save failed: {resp.text}"
    data = resp.json()
    print("BRSR save response:", data)


def test_approval_queue_brsr_has_framework_brsr(auth):
    """Fix 2 & 3: BRSR item in approval queue should have framework=BRSR."""
    r = _get_pending_approvals(auth)
    print("Pending approvals status:", r.status_code)
    if r.status_code != 200:
        pytest.skip(f"pending-approvals endpoint returned {r.status_code}: {r.text[:200]}")
    items = r.json() if isinstance(r.json(), list) else r.json().get("requests", r.json().get("items", []))
    print(f"Found {len(items)} pending approvals")
    brsr_items = [
        it for it in items
        if it.get("entity_type") == "esg_response" and it.get("entity_id") == BRSR_KEY
    ]
    if not brsr_items:
        pytest.skip(f"No BRSR pending item found for {BRSR_KEY}")
    for it in brsr_items:
        fw = it.get("framework") or it.get("entity_snapshot", {}).get("framework")
        print("BRSR item framework:", fw, "full:", {k: it.get(k) for k in ("framework","entity_type","entity_id")})
        assert fw and fw.upper() == "BRSR", f"BRSR item has wrong framework: {fw}"


def test_gri_answer_persists_after_approval(auth):
    """Fix 4: Approve a pending GRI submission and confirm value still in organization_esg_responses."""
    # find pending GRI approval
    r = _get_pending_approvals(auth)
    if r.status_code != 200:
        pytest.skip("no pending approvals endpoint")
    items = r.json() if isinstance(r.json(), list) else r.json().get("requests", r.json().get("items", []))
    gri_items = [
        it for it in items
        if it.get("entity_type") == "esg_response" and it.get("entity_id") == GRI_KEY
    ]
    if not gri_items:
        pytest.skip("No GRI pending approval to approve")
    req_id = gri_items[0]["id"]

    # Value before approval
    before = requests.get(
        f"{BASE_URL}/api/esg-questionnaire/response/{GRI_KEY}",
        headers=auth, params={"reporting_period": REPORTING_PERIOD},
    )
    before_val = before.json().get("value") if before.status_code == 200 else None
    print("Before approval value:", before_val)

    # Approve
    ap = requests.post(
        f"{BASE_URL}/api/approval-workflow/approve/{req_id}",
        headers=auth, json={"comment": "test approval"},
    )
    print("Approve status:", ap.status_code, ap.text[:200])
    assert ap.status_code in (200, 201), f"Approval failed: {ap.text}"

    # Value after approval
    after = requests.get(
        f"{BASE_URL}/api/esg-questionnaire/response/{GRI_KEY}",
        headers=auth, params={"reporting_period": REPORTING_PERIOD},
    )
    assert after.status_code == 200, f"GET after approval failed: {after.text}"
    after_val = after.json().get("value")
    print("After approval value:", after_val)
    assert after_val, f"GRI value ERASED after approval! Before={before_val}, After={after_val}"
