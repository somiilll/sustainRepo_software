"""
# Module: Internal Data AI combined renewable energy ledger validation
# Features: FY renewable formula, scope sourcing, scope1 factor logic, authorization boundaries, dedup/unit integrity
"""

import math
import os
import re
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
ENERGY_FACTORS_TO_GJ = {
    "j": 1e-9,
    "kj": 1e-6,
    "mj": 1e-3,
    "gj": 1.0,
    "tj": 1000.0,
    "kwh": 0.0036,
    "mwh": 3.6,
    "gwh": 3600.0,
}


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


def _combined_raw_data(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    raw_data = payload.get("raw_data") or {}
    env_data = raw_data.get("environment_energy") or {}
    ghg_data = raw_data.get("ghg_energy") or {}
    return env_data, ghg_data


def _factor_to_gj(unit: str) -> float | None:
    key = (unit or "").strip().lower().replace(" ", "")
    key = key.replace("kilojoule(kj)", "kj")
    return ENERGY_FACTORS_TO_GJ.get(key)


def _to_gj(value: float, unit: str) -> float | None:
    factor = _factor_to_gj(unit)
    if factor is None:
        return None
    return float(value) * factor


def _extract_result_percent(answer: str) -> float | None:
    match = re.search(r"Result:\s*([0-9]+(?:\.[0-9]+)?)%", answer)
    return float(match.group(1)) if match else None


def test_combined_renewable_fy_query_returns_three_denominator_sources_and_formula(
    session: requests.Session, tokens: dict[str, str]
):
    payload = _chat(session, tokens["admin"], "how much renewable energy % for FY 2026-2027")
    answer = payload.get("answer") or ""

    assert payload.get("query_type") == "esg_metric_lookup"
    assert "combined energy ledger" in answer.lower()
    assert "formula:" in answer.lower()
    assert "scope 1 fuel energy" in answer.lower()
    assert "scope 2 electricity energy" in answer.lower()
    assert "environment total energy" in answer.lower()

    env_data, ghg_data = _combined_raw_data(payload)
    env_rows = env_data.get("renewable_energy_results") or []
    scope1_rows = ghg_data.get("scope1_calculations") or []
    scope2_rows = ghg_data.get("scope2_electricity") or []

    assert env_rows, f"Missing environment renewable rows. payload={payload}"
    assert scope1_rows, f"Missing scope1 denominator rows. payload={payload}"
    assert scope2_rows, f"Missing scope2 denominator rows. payload={payload}"

    env_renewable_gj = 0.0
    env_total_gj = 0.0
    for row in env_rows:
        renewable_gj = _to_gj(row.get("renewable_value"), row.get("unit"))
        total_gj = _to_gj(row.get("total_value"), row.get("unit"))
        assert renewable_gj is not None and total_gj is not None, f"Unsupported env unit: {row}"
        env_renewable_gj += renewable_gj
        env_total_gj += total_gj

    scope2_total_gj = 0.0
    scope2_renewable_gj = 0.0
    for row in scope2_rows:
        qty = row.get("quantity")
        unit = row.get("unit")
        converted = _to_gj(qty, unit) if isinstance(qty, (int, float)) else None
        assert converted is not None, f"Unsupported scope2 source/unit: {row}"
        scope2_total_gj += converted
        if row.get("renewable"):
            scope2_renewable_gj += converted

    scope1_total_gj = sum(float(row.get("energy_tj", 0.0)) * 1000.0 for row in scope1_rows)
    denominator = scope1_total_gj + scope2_total_gj + env_total_gj
    numerator = env_renewable_gj + scope2_renewable_gj

    assert denominator > 0, "Combined denominator must be non-zero"
    expected_pct = (numerator / denominator) * 100.0
    answer_pct = _extract_result_percent(answer)
    assert answer_pct is not None, f"Result percent not present in answer: {answer}"
    assert math.isclose(answer_pct, expected_pct, rel_tol=0, abs_tol=1e-6)


def test_scope2_quantities_are_energy_activity_values_with_valid_units_only(
    session: requests.Session, tokens: dict[str, str]
):
    payload = _chat(session, tokens["admin"], "how much renewable energy % for FY 2026-2027")
    _, ghg_data = _combined_raw_data(payload)
    scope2_rows = ghg_data.get("scope2_electricity") or []

    assert scope2_rows, f"No scope2 electricity rows found. payload={payload}"
    for row in scope2_rows:
        assert isinstance(row.get("quantity"), (int, float)), f"Non-numeric scope2 quantity: {row}"
        assert row.get("unit"), f"Unitless scope2 row: {row}"
        assert _factor_to_gj(row.get("unit")) is not None, f"Non-energy scope2 unit included: {row}"
        assert "co2" not in str(row.get("unit", "")).lower(), f"Scope2 unit appears emissions-based: {row}"


def test_scope1_override_precedence_and_low_kgm3_density_exclusion(
    session: requests.Session, tokens: dict[str, str]
):
    payload = _chat(session, tokens["admin"], "how much renewable energy % for FY 2026-2027")
    _, ghg_data = _combined_raw_data(payload)
    scope1_rows = ghg_data.get("scope1_calculations") or []

    assert scope1_rows, f"No scope1 calculations found. payload={payload}"
    assert any(row.get("density_source") == "record override" for row in scope1_rows), "Expected at least one density override"
    assert any(row.get("density_source") == "fuel database default" for row in scope1_rows), "Expected at least one density default"
    assert any(row.get("ncv_source") == "record override" for row in scope1_rows), "Expected at least one NCV override"
    assert any(row.get("ncv_source") == "fuel database default" for row in scope1_rows), "Expected at least one NCV default"

    invalid_density_rows = [
        row
        for row in scope1_rows
        if str(row.get("density_unit", "")).lower().replace(" ", "") in {"kg/m3", "kg/m³"}
        and isinstance(row.get("density"), (int, float))
        and float(row.get("density")) < 100
    ]
    assert not invalid_density_rows, f"Low kg/m3 density rows should be excluded, found={invalid_density_rows}"


def test_environment_energy_source_row_remains_500_of_10000_kj(
    session: requests.Session, tokens: dict[str, str]
):
    payload = _chat(session, tokens["admin"], "how much renewable energy % for FY 2026-2027")
    env_data, _ = _combined_raw_data(payload)
    rows = env_data.get("renewable_energy_results") or []

    matching = [
        row
        for row in rows
        if float(row.get("renewable_value", -1)) == 500.0
        and float(row.get("total_value", -1)) == 10000.0
        and float(row.get("percentage", -1)) == 5.0
        and str(row.get("unit", "")).lower() in {"kilojoule (kj)", "kj"}
    ]
    assert matching, f"Expected environment 500/10000 kJ row missing. rows={rows}"


def test_authorization_boundary_restricts_combined_data_to_user_facilities(
    session: requests.Session, tokens: dict[str, str]
):
    payload = _chat(session, tokens["restricted"], "how much renewable energy % for FY 2026-2027")
    env_data, ghg_data = _combined_raw_data(payload)

    env_records = env_data.get("records") or []
    env_facilities = {row.get("facility") for row in env_records if row.get("facility")}
    assert env_facilities.issubset(ALLOWED_RESTRICTED_FACILITIES), (
        f"Restricted user received unauthorized environment facilities: {env_facilities}"
    )

    scope2_rows = ghg_data.get("scope2_electricity") or []
    assert not scope2_rows, f"Restricted scope1-only user should not receive scope2 rows: {scope2_rows}"


def test_combined_sources_have_no_duplicates_or_unitless_entries(
    session: requests.Session, tokens: dict[str, str]
):
    payload = _chat(session, tokens["admin"], "how much renewable energy % for FY 2026-2027")
    env_data, ghg_data = _combined_raw_data(payload)

    env_rows = env_data.get("renewable_energy_results") or []
    scope1_rows = ghg_data.get("scope1_calculations") or []
    scope2_rows = ghg_data.get("scope2_electricity") or []

    assert all(row.get("unit") for row in env_rows), f"Unitless environment rows found: {env_rows}"
    assert all(row.get("quantity_unit") for row in scope1_rows), f"Unitless scope1 rows found: {scope1_rows}"
    assert all(row.get("unit") for row in scope2_rows), f"Unitless scope2 rows found: {scope2_rows}"

    scope1_keys = [
        (
            row.get("fuel_type"),
            row.get("reporting_period"),
            row.get("quantity"),
            row.get("quantity_unit"),
            row.get("density"),
            row.get("density_unit"),
            row.get("ncv"),
            row.get("ncv_unit"),
            row.get("energy_tj"),
        )
        for row in scope1_rows
    ]
    scope2_keys = [
        (
            row.get("period"),
            row.get("quantity"),
            row.get("unit"),
            row.get("renewable"),
        )
        for row in scope2_rows
    ]

    assert len(scope1_keys) == len(set(scope1_keys)), "Duplicate scope1 source rows detected"
    assert len(scope2_keys) == len(set(scope2_keys)), "Duplicate scope2 source rows detected"
