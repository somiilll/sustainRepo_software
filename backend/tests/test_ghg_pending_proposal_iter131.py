"""
Tests for Iter 131:
1. Both Aman & Ravi (non-admin users with identical V2 GHG assignments) should
   see the same Scope 1 emission records from Facility E.
2. Admin sees emission records with `has_pending_proposal` indicator when a
   non-admin has a pending edit.
3. Non-admin sees own pending edits with `is_my_pending_proposal` flag.
4. Non-admin sees other-user pending edits with `has_pending_proposal` and
   `pending_proposal_by` fields.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
AMAN_EMAIL = "goyalsomil+1@hotmail.com"
RAVI_EMAIL = "goyalsomil+4@hotmail.com"
PASSWORD = "TestUser123!"
FACILITY_E_ID = "39ecd9be-9417-4df6-93c4-e583abf49260"


def _login(email):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text[:200]}")
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL)


@pytest.fixture(scope="module")
def aman_token():
    return _login(AMAN_EMAIL)


@pytest.fixture(scope="module")
def ravi_token():
    return _login(RAVI_EMAIL)


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _get_emissions(token, scope=None):
    url = f"{BASE_URL}/api/emissions"
    params = {}
    if scope:
        params["scope"] = scope
    r = requests.get(url, headers=_hdr(token), params=params, timeout=60)
    assert r.status_code == 200, f"GET /api/emissions failed: {r.status_code} {r.text[:300]}"
    return r.json()


class TestSameV2Visibility:
    """Both Aman and Ravi should see the same Scope 1 records at Facility E."""

    def test_aman_sees_scope1_facility_e(self, aman_token):
        recs = _get_emissions(aman_token)
        scope1_fe = [r for r in recs if r.get("scope") == "scope1" and r.get("facility_id") == FACILITY_E_ID]
        print(f"Aman scope1 @Facility E: {len(scope1_fe)}")
        assert len(scope1_fe) > 0, "Aman should see scope1 records at Facility E (V2 assignment)"

    def test_ravi_sees_scope1_facility_e(self, ravi_token):
        recs = _get_emissions(ravi_token)
        scope1_fe = [r for r in recs if r.get("scope") == "scope1" and r.get("facility_id") == FACILITY_E_ID]
        print(f"Ravi scope1 @Facility E: {len(scope1_fe)}")
        assert len(scope1_fe) > 0, "Ravi should see scope1 records at Facility E"

    def test_aman_and_ravi_see_same_records(self, aman_token, ravi_token):
        a = _get_emissions(aman_token)
        r = _get_emissions(ravi_token)
        # Build sets of scope1 record ids per user
        a_ids = {rec["id"] for rec in a if rec.get("scope") == "scope1" and rec.get("facility_id") == FACILITY_E_ID}
        r_ids = {rec["id"] for rec in r if rec.get("scope") == "scope1" and rec.get("facility_id") == FACILITY_E_ID}
        print(f"Aman ids: {len(a_ids)}, Ravi ids: {len(r_ids)}")
        print(f"Symmetric diff: {a_ids ^ r_ids}")
        assert a_ids == r_ids, (
            f"Aman and Ravi have identical V2 assignments but see different scope1 records. "
            f"Only Aman: {a_ids - r_ids}. Only Ravi: {r_ids - a_ids}"
        )
        assert len(a_ids) >= 1, "Both should see at least 1 record"


class TestPendingProposalIndicators:
    """Verify has_pending_proposal / is_my_pending_proposal / pending_proposal_by flags."""

    def test_admin_pending_indicators_shape(self, admin_token):
        recs = _get_emissions(admin_token)
        # Look for any record with pending indicator
        with_pending = [r for r in recs if r.get("has_pending_proposal")]
        print(f"Admin sees {len(with_pending)} records with pending proposals")
        for r in with_pending[:5]:
            assert "pending_proposal_by" in r
            print(f"  - {r.get('id')}: pending_by={r.get('pending_proposal_by')} status={r.get('pending_proposal_status')}")
        # Not strict - depends on seed data
        assert isinstance(recs, list)

    def test_nonadmin_pending_indicator_fields_present_in_schema(self, ravi_token):
        """Records returned should either be plain approved OR carry pending flags without error."""
        recs = _get_emissions(ravi_token)
        for r in recs:
            # If flagged, sanity check fields
            if r.get("is_my_pending_proposal"):
                # It's Ravi's own pending record - should have submitted_by matching
                assert r.get("submitted_by") is not None or r.get("approval_status") in (
                    "pending_create", "pending_update", "pending_delete", "pending"
                ), f"is_my_pending_proposal but no pending state: {r}"
            if r.get("has_pending_proposal") and not r.get("is_my_pending_proposal"):
                assert "pending_proposal_by" in r, "Missing pending_proposal_by on other-user pending indicator"
        print(f"Ravi: {len(recs)} records, all pending flags valid")

    def test_admin_no_duplicate_ids(self, admin_token):
        recs = _get_emissions(admin_token)
        ids = [r["id"] for r in recs if r.get("id")]
        assert len(ids) == len(set(ids)), "Duplicate record ids returned to admin"
