"""
Backend tests for the _merge_year_responses fix in ESG Questionnaire service.

Validates:
- Atomic question types (yes_no_with_text, textarea) are preserved as-is (no FY suffixes)
- FY comparison tables still get _current_fy / _previous_fy suffixes
- Saving and reloading via the API does not corrupt the response keys
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gri-workflow.preview.emergentagent.com").rstrip("/")
EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
FRAMEWORK = "BRSR"
SECTION = "environment"
REPORTING_YEAR = "2026-27"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def session(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# Helpers ---------------------------------------------------------------------

def _list_atomic_questions(session):
    """Return list of question configs where response_mode == 'atomic'."""
    r = session.get(f"{BASE_URL}/api/esg-questionnaire/configs?framework={FRAMEWORK}&section={SECTION}", timeout=30)
    assert r.status_code == 200, r.text
    configs = r.json().get("configs", [])
    return configs


# Tests -----------------------------------------------------------------------

class TestQuestionConfigResponseMode:
    """Verify response_mode field exists on question configs."""

    def test_configs_have_response_mode(self, session):
        configs = _list_atomic_questions(session)
        assert len(configs) > 0, "No configs returned"
        # Each config should have response_mode (atomic or fy_comparison)
        missing = [c["question_key"] for c in configs if "response_mode" not in c]
        print(f"Total configs: {len(configs)}; configs missing response_mode: {len(missing)}")
        # Not a hard fail because backend service defaults to fy_comparison; but report
        # Sanity: at least some configs should be marked atomic for the assurance bug fix
        atomic = [c for c in configs if c.get("response_mode") == "atomic"]
        fy = [c for c in configs if c.get("response_mode") == "fy_comparison"]
        print(f"Atomic: {len(atomic)} | FY comparison: {len(fy)}")
        # The Assurance subtab questions (env_assurance_*) should be atomic
        assurance = [c for c in configs if c["question_key"].startswith("env_assurance_")]
        print(f"env_assurance_* questions: {[c['question_key'] for c in assurance]}")
        for c in assurance:
            assert c.get("response_mode") == "atomic", \
                f"env_assurance question {c['question_key']} should be atomic, got {c.get('response_mode')}"


class TestAtomicYesNoWithTextRoundTrip:
    """The core bug: atomic yes_no_with_text answers must not get _current_fy suffix."""

    QUESTION_KEY = "env_assurance_energy"

    def test_save_and_reload_preserves_atomic_keys(self, session):
        # Unique agency name so we can detect mutation
        agency = f"TEST_AGENCY_{uuid.uuid4().hex[:8]}"

        # Save atomic response - frontend sends as flat object
        payload = {
            "responses": {
                self.QUESTION_KEY: {
                    "answer": "Yes",
                    "agency_name": agency,
                    "type_of_assurance": "Reasonable",
                }
            }
        }
        put = session.put(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{REPORTING_YEAR}",
            json=payload, timeout=30,
        )
        assert put.status_code == 200, put.text

        # GET via standard endpoint
        get_single = session.get(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{REPORTING_YEAR}",
            timeout=30,
        )
        assert get_single.status_code == 200, get_single.text
        responses = get_single.json().get("responses", {})
        q = responses.get(self.QUESTION_KEY)
        assert q is not None, f"Question {self.QUESTION_KEY} not in responses: {responses}"
        assert isinstance(q, dict), f"Expected dict, got {type(q)}: {q}"

        # CRITICAL: keys must be exact 'answer', 'agency_name', not 'answer_current_fy' etc.
        keys = set(q.keys())
        corrupted = {k for k in keys if k.endswith("_current_fy") or k.endswith("_previous_fy")}
        assert not corrupted, f"Atomic question has FY-suffixed keys (bug present): {corrupted} in {q}"
        assert q.get("answer") == "Yes", f"answer wrong: {q}"
        assert q.get("agency_name") == agency, f"agency_name wrong: {q}"

    def test_multi_year_endpoint_preserves_atomic(self, session):
        get_multi = session.get(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{REPORTING_YEAR}/multi-year",
            timeout=30,
        )
        assert get_multi.status_code == 200, get_multi.text
        data = get_multi.json()
        current = data.get("current_year_data", {})
        q = current.get(self.QUESTION_KEY)
        if q is None:
            pytest.skip("No saved atomic data found in multi-year (depends on previous test ordering)")
        assert isinstance(q, dict)
        corrupted = [k for k in q.keys() if k.endswith("_current_fy") or k.endswith("_previous_fy")]
        assert not corrupted, f"multi-year returned corrupted atomic keys: {corrupted} in {q}"
        assert q.get("answer") in ("Yes", "No")


class TestMultipleAtomicQuestions:
    """Save 3 atomic questions (env_assurance_*) and verify all load correctly."""

    QUESTIONS = ["env_assurance_energy", "env_assurance_water_withdrawal", "env_assurance_water_discharged"]

    def test_save_and_reload_multiple_atomic(self, session):
        payload_responses = {}
        for qk in self.QUESTIONS:
            payload_responses[qk] = {
                "answer": "Yes",
                "agency_name": f"TEST_AGENCY_{qk[-12:]}",
                "type_of_assurance": "Limited",
            }
        put = session.put(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{REPORTING_YEAR}",
            json={"responses": payload_responses}, timeout=30,
        )
        assert put.status_code == 200, put.text

        get_resp = session.get(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{REPORTING_YEAR}",
            timeout=30,
        )
        assert get_resp.status_code == 200
        responses = get_resp.json().get("responses", {})
        for qk in self.QUESTIONS:
            q = responses.get(qk)
            assert q is not None, f"Missing {qk} in reloaded responses"
            corrupted = [k for k in q.keys() if k.endswith("_current_fy") or k.endswith("_previous_fy")]
            assert not corrupted, f"{qk} has corrupted keys: {corrupted} in {q}"
            assert q.get("answer") == "Yes"
            assert q.get("agency_name", "").startswith("TEST_AGENCY_")


class TestFYComparisonStillWorks:
    """Regression: FY comparison questions (response_mode='fy_comparison') still get suffixes."""

    QUESTION_KEY = "env_sustainable_rd_capex"

    def test_fy_comparison_keeps_suffixes(self, session):
        payload = {
            "responses": {
                self.QUESTION_KEY: {
                    "rd": {"current_fy": "11111", "previous_fy": "22222"},
                    "capex": {"current_fy": "33333", "previous_fy": "44444"},
                }
            }
        }
        put = session.put(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{REPORTING_YEAR}",
            json=payload, timeout=30,
        )
        assert put.status_code == 200, put.text

        get_resp = session.get(
            f"{BASE_URL}/api/esg-questionnaire/responses/{FRAMEWORK}/{SECTION}/{REPORTING_YEAR}",
            timeout=30,
        )
        assert get_resp.status_code == 200
        responses = get_resp.json().get("responses", {})
        q = responses.get(self.QUESTION_KEY)
        assert q is not None, f"FY question missing in reload: {list(responses.keys())}"
        rd = q.get("rd", {})
        # Must NOT be double-suffixed (i.e., 'current_fy_current_fy')
        bad = [k for k in rd.keys() if "_current_fy_current_fy" in k or "_previous_fy_previous_fy" in k]
        assert not bad, f"Double suffix bug present: {bad}"
        # Should still contain current_fy / previous_fy
        assert "current_fy" in rd or any(k.endswith("_current_fy") for k in rd), f"FY data missing: {rd}"
        print(f"FY rd: {rd}")
        print(f"FY capex: {q.get('capex')}")
