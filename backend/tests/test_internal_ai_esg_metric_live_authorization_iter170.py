"""Live Internal AI ESG metric state + authorization regression checks."""
import os
import re

import pytest
import requests


def _read_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env", encoding="utf-8") as handle:
            for line in handle:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    return (url or "").rstrip("/")


BASE_URL = _read_backend_url()


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session: requests.Session, email: str, password: str) -> str:
    resp = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=45,
    )
    if resp.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login returned 429 for {email}. Body: {resp.text[:300]}")
    assert resp.status_code == 200, f"Login failed for {email}: {resp.status_code} {resp.text[:300]}"
    payload = resp.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"Token missing for {email}. Keys={list(payload.keys())}"
    return token


def _ask(session: requests.Session, token: str, message: str, session_id: str) -> dict:
    resp = session.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"message": message, "session_id": session_id},
        timeout=120,
    )
    assert resp.status_code == 200, f"Chat failed ({message}): {resp.status_code} {resp.text[:600]}"
    return resp.json()


def _highlights_map(payload: dict) -> dict:
    result = {}
    for item in payload.get("highlights") or []:
        if isinstance(item, dict) and item.get("label"):
            result[str(item["label"]).strip().lower()] = str(item.get("value", "")).strip()
    return result


def _parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    match = re.search(r"-?\d+", str(value))
    return int(match.group(0)) if match else None


def _contains_internal_identifier(text: str) -> bool:
    checks = [
        r"\b[0-9a-f]{24}\b",  # mongo-like object id
        r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",  # uuid
    ]
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in checks)


@pytest.mark.skipif(not BASE_URL, reason="Missing REACT_APP_BACKEND_URL")
def test_water_pending_and_approved_queries_use_real_statuses_without_internal_ids():
    # Module: Internal AI approval-status lookup for ESG water records.
    session = _session()
    admin_token = _login(session, "goyalsomil2001@gmail.com", "TestUser123!")

    pending = _ask(
        session,
        admin_token,
        "Which water metrics are pending approval?",
        "iter170-water-pending",
    )
    approved = _ask(
        session,
        admin_token,
        "Which water metrics are approved?",
        "iter170-water-approved",
    )

    assert pending.get("query_type") == "approval_status_lookup"
    assert approved.get("query_type") == "approval_status_lookup"

    pending_text = f"{pending.get('answer', '')} {pending.get('highlights', [])}"
    approved_text = f"{approved.get('answer', '')} {approved.get('highlights', [])}"
    assert not _contains_internal_identifier(pending_text), pending
    assert not _contains_internal_identifier(approved_text), approved

    pending_h = _highlights_map(pending)
    approved_h = _highlights_map(approved)

    # Distinguish zero-pending from status-unavailable branch.
    if "No water metric records are pending approval." in (pending.get("answer") or ""):
        assert "Awaiting approval: 0" in (pending.get("answer") or "")
        assert "No approval-status data was provided" not in (pending.get("answer") or "")

    if "No Water metric records currently have Approved status." in (approved.get("answer") or ""):
        assert "Approved: 0" in (approved.get("answer") or "")
        assert "No approval-status data was provided" not in (approved.get("answer") or "")

    # If status-unavailable is claimed, unavailable highlight must be non-zero.
    if "No approval-status data was provided" in (pending.get("answer") or ""):
        assert _parse_int(pending_h.get("status unavailable")) and _parse_int(pending_h.get("status unavailable")) > 0
    if "No approval-status data was provided" in (approved.get("answer") or ""):
        assert _parse_int(approved_h.get("status unavailable")) and _parse_int(approved_h.get("status unavailable")) > 0


@pytest.mark.skipif(not BASE_URL, reason="Missing REACT_APP_BACKEND_URL")
def test_water_consumption_july_2026_uses_period_filtered_environment_records():
    # Module: Internal AI consumption lookup against ESG environment Water records.
    session = _session()
    admin_token = _login(session, "goyalsomil2001@gmail.com", "TestUser123!")

    payload = _ask(
        session,
        admin_token,
        "What is water consumption for July 2026?",
        "iter170-water-july-2026",
    )

    assert payload.get("query_type") == "consumption_lookup"
    answer = payload.get("answer") or ""
    lowered = answer.lower()

    # Must anchor to requested period in answer output.
    assert ("july 2026" in lowered) or ("2026-07" in lowered), payload

    # Must stay deterministic about absent data (no fabrication fallback wording).
    assert "i don't have" not in lowered
    assert "unable to determine" not in lowered

    # Never expose internal IDs in answer/highlights.
    rendered = f"{answer} {payload.get('highlights', [])}"
    assert not _contains_internal_identifier(rendered), payload


@pytest.mark.skipif(not BASE_URL, reason="Missing REACT_APP_BACKEND_URL")
def test_admin_vs_restricted_scope_is_authorized_and_fail_closed_for_non_assigned_facility_prompt():
    # Module: Internal AI authorization boundaries for admin and restricted users.
    session = _session()
    admin_token = _login(session, "goyalsomil2001@gmail.com", "TestUser123!")
    restricted_token = _login(session, "goyalsomil+4@hotmail.com", "TestUser123!")

    admin_pending = _ask(
        session,
        admin_token,
        "Which water metrics are pending approval?",
        "iter170-admin-pending",
    )
    user_pending = _ask(
        session,
        restricted_token,
        "Which water metrics are pending approval?",
        "iter170-restricted-pending",
    )

    assert admin_pending.get("query_type") == "approval_status_lookup"
    assert user_pending.get("query_type") == "approval_status_lookup"

    admin_found = _parse_int(_highlights_map(admin_pending).get("records found"))
    user_found = _parse_int(_highlights_map(user_pending).get("records found"))
    assert admin_found is not None and user_found is not None, {
        "admin": admin_pending,
        "restricted": user_pending,
    }
    assert user_found <= admin_found, {
        "admin_records_found": admin_found,
        "restricted_records_found": user_found,
        "admin": admin_pending,
        "restricted": user_pending,
    }

    # Ask for a clearly non-existent facility string: should fail closed to zero for restricted user.
    fail_closed = _ask(
        session,
        restricted_token,
        "Which water metrics are approved for Facility ZZZ_UNAUTHORIZED_ONLY?",
        "iter170-restricted-failclosed",
    )
    assert fail_closed.get("query_type") == "approval_status_lookup"
    fail_h = _highlights_map(fail_closed)
    fail_found = _parse_int(fail_h.get("records found"))
    assert fail_found == 0, fail_closed
    assert "No" in (fail_closed.get("answer") or ""), fail_closed
