"""Tests for GRI version history parent/subpart aggregation fix (iteration 126)."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
REPORTING_PERIOD = "FY 2026-2027"


@pytest.fixture(scope="module")
def auth_headers():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    token = resp.json().get("access_token") or resp.json().get("token")
    assert token, f"No token in login response: {resp.json()}"
    return {"Authorization": f"Bearer {token}"}


def _fetch_history(question_key: str, headers: dict):
    resp = requests.get(
        f"{BASE_URL}/api/esg-questionnaire/history/{question_key}",
        params={"reporting_period": REPORTING_PERIOD},
        headers=headers,
        timeout=30,
    )
    assert resp.status_code == 200, f"{question_key} -> {resp.status_code} {resp.text}"
    return resp.json()


class TestGriParentHistory:
    """Version history aggregation for parent GRI keys."""

    def test_parent_key_returns_subpart_entries(self, auth_headers):
        data = _fetch_history("gri_101_2_a", auth_headers)
        assert "history" in data
        assert "total" in data
        assert data["question_key"] == "gri_101_2_a"
        assert data["reporting_period"] == REPORTING_PERIOD
        # As per fix: should now return many entries (was 0 before)
        assert data["total"] > 0, "Parent key must aggregate subpart history"
        assert isinstance(data["history"], list)
        assert len(data["history"]) == data["total"]

    def test_parent_key_entries_are_only_subparts(self, auth_headers):
        data = _fetch_history("gri_101_2_a", auth_headers)
        pattern = re.compile(r"^gri_101_2_a(_.+)?$")
        for entry in data["history"]:
            qk = entry.get("question_key")
            assert qk, f"Entry missing question_key: {entry}"
            assert pattern.match(qk), f"Unexpected key in parent history: {qk}"

    def test_history_entries_shape(self, auth_headers):
        data = _fetch_history("gri_101_2_a", auth_headers)
        assert data["total"] > 0
        entry = data["history"][0]
        for field in ("question_key", "action", "timestamp", "performed_by", "change_details"):
            assert field in entry, f"Missing field '{field}' in history entry: {entry}"
        # performed_by shape
        pb = entry["performed_by"]
        assert isinstance(pb, dict)
        assert "name" in pb or "user_id" in pb or "email" in pb

    def test_history_sorted_desc_by_timestamp(self, auth_headers):
        data = _fetch_history("gri_101_2_a", auth_headers)
        timestamps = [e.get("timestamp") for e in data["history"] if e.get("timestamp")]
        assert timestamps == sorted(timestamps, reverse=True), "History should be sorted desc by timestamp"

    def test_no_mongo_id_leak(self, auth_headers):
        data = _fetch_history("gri_101_2_a", auth_headers)
        for entry in data["history"]:
            assert "_id" not in entry


class TestGriSubpartHistory:
    """Version history for subpart keys should not leak parent/sibling data."""

    def test_subpart_key_returns_only_own_history(self, auth_headers):
        data = _fetch_history("gri_101_2_a_i", auth_headers)
        assert "history" in data
        # Every entry must match exactly the subpart key (regex ^gri_101_2_a_i_ would
        # only match deeper nesting which shouldn't exist here)
        for entry in data["history"]:
            qk = entry.get("question_key")
            assert qk == "gri_101_2_a_i" or qk.startswith("gri_101_2_a_i_"), (
                f"Subpart history leaked unrelated key: {qk}"
            )
            # It must NOT include sibling subparts
            assert qk not in {"gri_101_2_a_ii", "gri_101_2_a_iii", "gri_101_2_a_iv", "gri_101_2_a_v", "gri_101_2_a"}

    def test_subpart_count_le_parent_count(self, auth_headers):
        parent = _fetch_history("gri_101_2_a", auth_headers)
        subpart = _fetch_history("gri_101_2_a_i", auth_headers)
        assert subpart["total"] <= parent["total"], (
            "Subpart history cannot exceed parent aggregate"
        )


class TestGriHistoryEdgeCases:
    def test_unknown_key_returns_empty(self, auth_headers):
        data = _fetch_history("gri_999_nonexistent_key", auth_headers)
        assert data["total"] == 0
        assert data["history"] == []

    def test_missing_reporting_period_returns_422(self, auth_headers):
        resp = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/history/gri_101_2_a",
            headers=auth_headers,
            timeout=30,
        )
        assert resp.status_code in (400, 422)

    def test_unauthenticated_returns_401(self):
        resp = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/history/gri_101_2_a",
            params={"reporting_period": REPORTING_PERIOD},
            timeout=30,
        )
        assert resp.status_code in (401, 403)
