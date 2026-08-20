"""Dedicated read-only regression safety net for C7 Employee Commuting.

C7 is intentionally separate from the normal audit-log replay architecture.
These tests use frozen, sanitized production-shaped fixtures, replay only the
authoritative calculator with ``dry_run=true``, and never invoke C7 persistence.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any, Dict

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

from ghg_golden_support import ADMIN_EMAIL, ADMIN_PASSWORD, API, auth_header, login
from modules.emissions.c7_contracts import (
    C7MonthlyEntryCreate,
    C7MonthlyEntryResponse,
    C7YearlyEntryCreate,
    C7YearlyEntryResponse,
)

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "c7_safety_net.json").read_text())
COLLECTIONS = ("emission_records", "ce_calculation_audit_logs", "emission_history")


def _collection_counts() -> Dict[str, int]:
    load_dotenv("/app/backend/.env")
    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    return {name: db[name].count_documents({}) for name in COLLECTIONS}


@pytest.fixture(scope="module", autouse=True)
def c7_read_only_guard():
    before = _collection_counts()
    yield
    assert _collection_counts() == before, "C7 safety-net tests must not write production collections"


@pytest.fixture(scope="module")
def headers() -> Dict[str, str]:
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        pytest.skip("Admin login failed")
    return auth_header(token)


def test_c7_fixture_identity_and_coverage():
    identity = FIXTURES["category_identity"]
    assert identity == {
        "category_id": "e805180d-d3cc-4a7f-a71e-bf1d920d8919",
        "category_code": "C7",
        "category": "C7 - Employee Commuting",
        "scope": "scope3",
    }
    models = {fixture["model"] for fixture in FIXTURES["aggregate_contract_fixtures"]}
    assert models == {"v2-monthly", "v2-yearly", "legacy"}
    assert any(fixture["employee_count"] == 0 for fixture in FIXTURES["aggregate_contract_fixtures"])


@pytest.mark.parametrize("fixture", FIXTURES["replay_fixtures"], ids=lambda item: item["fixture_id"])
def test_c7_authoritative_calculator_replay_is_unchanged(fixture: Dict[str, Any], headers: Dict[str, str]):
    request_body = fixture["request"]
    assert request_body["dry_run"] is True
    response = requests.post(
        f"{API}/calc-engine/execute-by-category",
        json=request_body,
        headers=headers,
        timeout=180,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()
    expected = fixture["expected"]
    assert (payload.get("resolved_formula") or {}).get("id") == expected["formula_id"]
    assert payload.get("decision_path") == expected["decision_path"]
    co2e = (payload.get("outputs") or {}).get("co2e") or {}
    assert co2e.get("unit") == expected["unit"]
    assert math.isclose(co2e.get("value"), expected["co2e"], rel_tol=0, abs_tol=1e-12)


@pytest.mark.parametrize("fixture", FIXTURES["aggregate_contract_fixtures"], ids=lambda item: item["fixture_id"])
def test_c7_saved_aggregate_contract_is_unchanged(fixture: Dict[str, Any]):
    assert fixture["scope"] == "scope3"
    assert "employee commuting" in fixture["category"].lower()
    assert fixture["employee_count"] == len(fixture["employee_fields"] and fixture.get("employee_co2e", []) or []) or fixture["model"] == "legacy"

    if fixture["model"] == "v2-monthly":
        employee_sum = sum(fixture["employee_co2e"])
        assert math.isclose(employee_sum, fixture["monthly_total"]["co2e"], rel_tol=0, abs_tol=1e-12)
        assert fixture["monthly_total"]["employee_count"] == fixture["employee_count"]
        assert math.isclose(employee_sum, fixture["total_emissions"], rel_tol=0, abs_tol=1e-12)
    elif fixture["model"] == "v2-yearly":
        employee_sum = sum(fixture["employee_co2e"])
        assert math.isclose(employee_sum, fixture["yearly_total"]["co2e"], rel_tol=0, abs_tol=1e-12)
        assert fixture["yearly_total"]["employee_count"] == fixture["employee_count"]
        assert math.isclose(employee_sum, fixture["total_emissions"], rel_tol=0, abs_tol=1e-12)
    elif fixture["employee_count"]:
        assert len(fixture["months_with_employee_data"]) == 12
        assert math.isclose(sum(fixture["monthly_totals"].values()), fixture["yearly_total"]["co2e"], rel_tol=0, abs_tol=1e-12)
        assert math.isclose(fixture["yearly_total"]["co2e"], fixture["total_emissions"], rel_tol=0, abs_tol=1e-12)
    else:
        assert fixture["monthly_totals"] is None
        assert fixture["yearly_total"] is None
        assert fixture["total_emissions"] is None


def test_c7_contract_models_keep_monthly_and_yearly_payload_fields():
    monthly_fields = C7MonthlyEntryCreate.model_fields
    yearly_fields = C7YearlyEntryCreate.model_fields
    assert {
        "facility_id", "reporting_year", "reporting_month", "calculation_method",
        "activity_type", "employees",
    } <= set(monthly_fields)
    assert {
        "facility_id", "reporting_year", "calculation_method", "activity_type", "employees",
    } <= set(yearly_fields)
    assert "reporting_month" not in yearly_fields
    assert "monthly_total" in C7MonthlyEntryResponse.model_fields
    assert "yearly_total" in C7YearlyEntryResponse.model_fields