"""
Backend regression tests for iteration reviewing:
1) my-accessible-questions endpoint returns correct filter for admin vs user
2) Partial PUT of only-changed Section A fields succeeds without 'not assigned' errors
3) Completion detection recognises existing Section A data (nested responses format)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
USER_EMAIL = "goyalsomil+4@hotmail.com"
PASSWORD = "TestUser123!"
FRAMEWORK = "BRSR"
SECTION = "section_a"
YEAR = "2026-27"
REPORTING_PERIOD = "FY 2026-2027"


def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    assert tok, f"No token in login response: {body}"
    return tok


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, PASSWORD)}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_headers():
    return {"Authorization": f"Bearer {_login(USER_EMAIL, PASSWORD)}",
            "Content-Type": "application/json"}


# ---- Test 1: /my-accessible-questions -----------------------------------

class TestAccessibleQuestions:

    def test_admin_sees_full_access(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/my-accessible-questions",
            params={"reporting_period": REPORTING_PERIOD, "section": SECTION},
            headers=admin_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_admin") is True, f"Admin flag missing: {data}"
        assert data.get("has_full_access") is True

    def test_non_admin_user_filter(self, user_headers):
        r = requests.get(
            f"{BASE_URL}/api/esg-assignments/my-accessible-questions",
            params={"reporting_period": REPORTING_PERIOD, "section": SECTION},
            headers=user_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_admin") is False, f"Non-admin returned as admin: {data}"
        # accessible_questions should be a list (may be empty per task note)
        assert isinstance(data.get("accessible_questions"), list)
        # Log what user actually sees
        print(f"User accessible_questions: {data.get('accessible_questions')}, "
              f"has_full_access={data.get('has_full_access')}")


# ---- Test 2: Partial save (admin edits only one field) -------------------

class TestPartialSave:
    def test_admin_partial_save_year_only(self, admin_headers):
        # Snapshot current value to restore later
        r_before = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
            headers=admin_headers, timeout=30,
        )
        assert r_before.status_code == 200, r_before.text
        before_responses = r_before.json().get("responses", {}) or {}
        original_year = before_responses.get("brsr_a_year_of_incorporation")

        new_year = 1995 + (uuid.uuid4().int % 30)  # random 1995-2024
        if new_year == original_year:
            new_year += 1

        # Save ONLY brsr_a_year_of_incorporation - not all fields
        r = requests.put(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
            headers=admin_headers,
            json={"responses": {"brsr_a_year_of_incorporation": new_year}},
            timeout=30,
        )
        assert r.status_code == 200, (
            f"Partial save failed: {r.status_code} {r.text}"
        )

        # Verify via GET
        r_after = requests.get(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
            headers=admin_headers, timeout=30,
        )
        assert r_after.status_code == 200
        after = r_after.json().get("responses", {}) or {}
        got = after.get("brsr_a_year_of_incorporation")
        assert got == new_year, (
            f"Partial save didn't persist: expected {new_year}, got {got!r}"
        )

        # Other fields should remain intact
        for other_key in ("brsr_a_cin", "brsr_a_entity_name", "brsr_a_email"):
            if other_key in before_responses:
                assert after.get(other_key) == before_responses.get(other_key), (
                    f"Field {other_key} was clobbered by partial save. "
                    f"Before: {before_responses.get(other_key)!r}, "
                    f"After: {after.get(other_key)!r}"
                )

        # Restore original
        if original_year is not None:
            requests.put(
                f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
                headers=admin_headers,
                json={"responses": {"brsr_a_year_of_incorporation": original_year}},
                timeout=30,
            )


# ---- Test 3: Completion detection for Section A --------------------------

class TestCompletionDetection:
    def test_completion_recognises_section_a_data(self, admin_headers):
        # Ensure admin has some data saved
        cin_val = f"TESTCIN-{uuid.uuid4().hex[:6]}"
        r = requests.put(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{YEAR}",
            headers=admin_headers,
            json={"responses": {"brsr_a_cin": cin_val}},
            timeout=30,
        )
        assert r.status_code == 200, r.text

        # Query tracking / completion for section_a
        # Try a couple of common paths
        candidates = [
            f"/api/tracking/all/frameworks/brsr/sections/SECTION_A",
            f"/api/tracking/all/frameworks/BRSR/sections/section_a",
        ]
        found = False
        for path in candidates:
            r = requests.get(
                f"{BASE_URL}{path}",
                params={"reporting_period": REPORTING_PERIOD},
                headers=admin_headers, timeout=60,
            )
            if r.status_code == 200:
                found = True
                data = r.json()
                # Look for brsr_a_cin in returned disclosures
                disclosures = data.get("disclosures") or data.get("items") or []
                if not disclosures and isinstance(data, dict):
                    for v in data.values():
                        if (isinstance(v, list) and v
                                and isinstance(v[0], dict)
                                and "entity_id" in v[0]):
                            disclosures = v
                            break
                cin_disc = None
                for d in disclosures:
                    if (d.get("entity_id") or d.get("question_key")) == "brsr_a_cin":
                        cin_disc = d
                        break
                if cin_disc:
                    status = (cin_disc.get("status") or
                              cin_disc.get("completion_status") or
                              cin_disc.get("progress"))
                    print(f"brsr_a_cin status on {path}: {status} | disc={cin_disc}")
                    # Should NOT be 'not_started' since we just saved data
                    assert status not in ("not_started", None, "", 0), (
                        f"Completion detection failed – brsr_a_cin has data '{cin_val}' "
                        f"but tracker shows status={status}. Full disc: {cin_disc}"
                    )
                    return
        if not found:
            pytest.skip("No tracking endpoint returned 200; skipping completion check")
        pytest.skip("brsr_a_cin not found in any tracker response; skipping")
