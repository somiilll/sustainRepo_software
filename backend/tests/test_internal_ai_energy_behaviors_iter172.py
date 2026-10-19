"""
# Module: Internal Data AI chat endpoint live behavior validation
# Features: renewable-energy percentage retrieval, FY normalization, fuel-energy dual-source output, and RBAC scope checks
"""

import os
from typing import Any

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
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
RESTRICTED_EMAIL = "goyalsomil+4@hotmail.com"
PASSWORD = "TestUser123!"
ALLOWED_RESTRICTED_FACILITIES = {"Facility E", "Organization level"}


@pytest.fixture(scope="module")
def session() -> requests.Session:
    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})
    return client


def _login(session: requests.Session, email: str) -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL missing")
    try:
        response = session.post(
            f"{API}/auth/login",
            json={"email": email, "password": PASSWORD},
            timeout=60,
        )
    except Exception as exc:
        pytest.skip(f"Login endpoint unreachable for {email}: {exc}")
    if response.status_code != 200:
        pytest.skip(f"Login failed for {email}: {response.status_code} {response.text[:300]}")
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    if not token:
        pytest.skip(f"No token for {email}. keys={list(payload.keys())}")
    return token


@pytest.fixture(scope="module")
def tokens(session: requests.Session) -> dict[str, str]:
    return {
        "admin": _login(session, ADMIN_EMAIL),
        "restricted": _login(session, RESTRICTED_EMAIL),
    }


def _chat(session: requests.Session, token: str, message: str) -> dict[str, Any]:
    response = session.post(
        f"{API}/internal-ai/chat",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"message": message},
        timeout=180,
    )
    assert response.status_code == 200, f"Chat failed: {response.status_code} {response.text[:500]}"
    payload = response.json()
    assert isinstance(payload.get("answer"), str)
    assert payload.get("query_type")
    return payload


def _renewable_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_data = payload.get("raw_data") or {}
    rows = raw_data.get("renewable_energy_results") or []
    return rows if isinstance(rows, list) else []


def _extract_expected_renewable_row(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    for row in rows:
        if row.get("renewable_value") == 500 and row.get("total_value") == 10000 and float(row.get("percentage", -1)) == 5.0:
            return row
    return None


def test_renewable_energy_percentage_for_fy_2026_2027_returns_expected_formula_values(session: requests.Session, tokens: dict[str, str]):
    payload = _chat(session, tokens["admin"], "how much renewable energy % for FY 2026-2027")
    answer_lower = (payload.get("answer") or "").lower()

    assert payload.get("query_type") == "esg_metric_lookup"
    assert "not_found" not in answer_lower
    assert "renewable energy" in answer_lower
    assert "formula" in answer_lower

    rows = _renewable_rows(payload)
    assert rows, f"Expected renewable_energy_results rows in raw_data. payload={payload}"
    expected = _extract_expected_renewable_row(rows)
    assert expected is not None, f"Expected 500/10000/5 row not found. rows={rows}"


@pytest.mark.parametrize(
    "message",
    [
        "how much renewable energy % for FY 2026-2027",
        "how much renewable energy % for FY 2026-27",
    ],
)
def test_fy_normalization_accepts_long_and_short_forms_for_same_year(message: str, session: requests.Session, tokens: dict[str, str]):
    payload = _chat(session, tokens["admin"], message)
    rows = _renewable_rows(payload)
    assert rows, f"No renewable rows returned for message={message}. payload={payload}"
    expected = _extract_expected_renewable_row(rows)
    assert expected is not None, f"Expected FY renewable row missing for message={message}. rows={rows}"


def test_fuel_energy_dec_2026_returns_environment_and_scope1_calculations_with_source_labels(session: requests.Session, tokens: dict[str, str]):
    payload = _chat(session, tokens["admin"], "Fuel energy in Dec 2026")

    assert payload.get("query_type") == "fuel_energy_lookup"
    answer_lower = (payload.get("answer") or "").lower()
    assert "environment" in answer_lower and "fuel within organization" in answer_lower
    assert "scope 1" in answer_lower
    assert "fuel is not present in the canonical fuel database" not in answer_lower

    raw_data = payload.get("raw_data") or {}
    energy_data = raw_data.get("energy") or {}
    fuel_energy_data = raw_data.get("fuel_energy") or {}
    energy_records = energy_data.get("records") or []
    calculations = fuel_energy_data.get("calculations") or []

    assert energy_records, f"Expected environment energy records. payload={payload}"
    assert any(
        str(record.get("reporting_period", "")).lower().startswith("december 2026")
        and (record.get("metric_value") or {}).get("value") == 4500
        for record in energy_records
    ), f"Expected December 2026 quantity 4500 in environment energy records. records={energy_records}"

    assert calculations, f"Expected scope1 fuel energy calculations. payload={payload}"
    for calc in calculations:
        assert calc.get("density_source") in {"record override", "fuel database default"}
        assert calc.get("ncv_source") in {"record override", "fuel database default"}


def test_generic_fuel_energy_phrase_does_not_trigger_literal_canonical_lookup_failure(session: requests.Session, tokens: dict[str, str]):
    payload = _chat(session, tokens["admin"], "Fuel energy")
    assert payload.get("query_type") == "fuel_energy_lookup"
    answer_lower = (payload.get("answer") or "").lower()
    assert "fuel is not present in the canonical fuel database" not in answer_lower
    assert "no authorized environment" not in answer_lower


def test_restricted_user_does_not_receive_records_outside_assigned_facilities(session: requests.Session, tokens: dict[str, str]):
    payload = _chat(session, tokens["restricted"], "Fuel energy in Dec 2026")
    assert payload.get("query_type") == "fuel_energy_lookup"

    raw_data = payload.get("raw_data") or {}
    energy_data = raw_data.get("energy") or {}
    energy_records = energy_data.get("records") or []
    assert energy_records, "Restricted user should still receive authorized records (if present)."

    facilities = {record.get("facility") for record in energy_records if record.get("facility")}
    assert facilities.issubset(ALLOWED_RESTRICTED_FACILITIES), (
        f"Restricted user received unauthorized facilities. facilities={facilities} "
        f"allowed={ALLOWED_RESTRICTED_FACILITIES}"
    )
