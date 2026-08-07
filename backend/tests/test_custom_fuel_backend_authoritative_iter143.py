"""
# Module: Custom Fuel backend-authoritative calc-engine validation
# Feature: execute-by-category payload normalization + save-guard contracts
"""

import os
from pathlib import Path

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "goyalsomil2001@gmail.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "TestUser123!")


def _require_base_url() -> str:
    assert BASE_URL, "REACT_APP_BACKEND_URL is required in environment"
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_headers(api_client):
    base = _require_base_url()
    resp = api_client.post(
        f"{base}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text[:300]}"
    data = resp.json()
    token = data.get("token") or data.get("access_token")
    assert isinstance(token, str) and token, "Missing auth token"
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def scope1_stationary_category_id(api_client, auth_headers):
    base = _require_base_url()
    resp = api_client.get(
        f"{base}/api/categories",
        headers=auth_headers,
        timeout=30,
    )
    assert resp.status_code == 200, f"/api/categories failed: {resp.status_code}"
    categories = resp.json()
    assert isinstance(categories, list) and categories, "Categories list is empty"

    stationary = [
        c for c in categories
        if (c.get("scope_code") == "scope1")
        and ("stationary" in (c.get("name") or "").lower())
    ]
    assert stationary, "No Scope1 Stationary category found"
    category_id = stationary[0].get("id")
    assert category_id, "Stationary category has no id"
    return category_id


def _assert_calc_response(data: dict):
    assert data.get("ok") is True
    assert isinstance(data.get("resolved_formula"), dict)
    assert data["resolved_formula"].get("name")
    assert isinstance(data.get("audit_log"), list)
    assert len(data["audit_log"]) > 0

    outputs = data.get("outputs") or {}
    assert isinstance(outputs, dict)
    for key in ("co2", "ch4", "n2o", "co2e"):
        assert key in outputs, f"Missing output key: {key}"
        assert "value" in outputs[key], f"Missing output value: {key}"


class TestCustomFuelCalcEngineExecuteByCategory:
    def test_heat_basis_payload_returns_formula_audit_outputs(
        self,
        api_client,
        auth_headers,
        scope1_stationary_category_id,
    ):
        base = _require_base_url()
        payload = {
            "category_id": scope1_stationary_category_id,
            "decision_inputs": {"calculation_methodology": "using_heat_basis_ncv"},
            "inputs": {
                "qty": {"value": 1000, "unit": "kg"},
                "cv": {"value": 0.043, "unit": "TJ/kg"},
                "ef_co2": {"value": 74000, "unit": "kgCO2/TJ"},
                "ef_ch4": {"value": 0, "unit": "kgCH4/TJ"},
                "ef_n2o": {"value": 0, "unit": "kgN2O/TJ"},
            },
            "user_overrides": {
                "cv": {"value": 0.043, "unit": "TJ/kg"},
                "emission_factor": {"value": 74000, "unit": "kgCO2/TJ"},
            },
            "context": {
                "scope": "scope1",
                "category": "Stationary Combustion",
                "facility_id": "test-facility",
                "fuel_name": "TEST_Custom Fuel",
                "fuel_id": None,
                "is_custom_fuel": True,
                "reporting_period": "2026-01",
            },
            "dry_run": True,
        }
        resp = api_client.post(
            f"{base}/api/calc-engine/execute-by-category",
            json=payload,
            headers=auth_headers,
            timeout=45,
        )
        assert resp.status_code == 200, f"Heat basis failed: {resp.status_code} {resp.text[:400]}"
        _assert_calc_response(resp.json())

    def test_qty_basis_payload_returns_formula_audit_outputs(
        self,
        api_client,
        auth_headers,
        scope1_stationary_category_id,
    ):
        base = _require_base_url()
        payload = {
            "category_id": scope1_stationary_category_id,
            "decision_inputs": {"calculation_methodology": "using_qty_basis_ef"},
            "inputs": {
                "qty": {"value": 1000, "unit": "kg"},
                "ef_quantity": {"value": 2.68, "unit": "kgCO2/kg"},
            },
            "user_overrides": {
                "emission_factor": {"value": 2.68, "unit": "kgCO2/kg"},
            },
            "context": {
                "scope": "scope1",
                "category": "Stationary Combustion",
                "facility_id": "test-facility",
                "fuel_name": "TEST_Custom Fuel",
                "fuel_id": None,
                "is_custom_fuel": True,
                "reporting_period": "2026-01",
            },
            "dry_run": True,
        }
        resp = api_client.post(
            f"{base}/api/calc-engine/execute-by-category",
            json=payload,
            headers=auth_headers,
            timeout=45,
        )
        assert resp.status_code == 200, f"Qty basis failed: {resp.status_code} {resp.text[:400]}"
        _assert_calc_response(resp.json())

    def test_carbon_composition_payload_returns_formula_audit_outputs(
        self,
        api_client,
        auth_headers,
        scope1_stationary_category_id,
    ):
        base = _require_base_url()
        payload = {
            "category_id": scope1_stationary_category_id,
            "decision_inputs": {"calculation_methodology": "using_carbon_composition"},
            "inputs": {
                "qty": {"value": 1000, "unit": "kg"},
                "carbon_content": {"value": 85, "unit": "%"},
                "oxidation_factor": {"value": 1, "unit": ""},
            },
            "user_overrides": {
                "carbon_content": {"value": 85, "unit": "%"},
                "oxidation_factor": {"value": 1, "unit": ""},
            },
            "context": {
                "scope": "scope1",
                "category": "Stationary Combustion",
                "facility_id": "test-facility",
                "fuel_name": "TEST_Custom Fuel",
                "fuel_id": None,
                "is_custom_fuel": True,
                "reporting_period": "2026-01",
            },
            "dry_run": True,
        }
        resp = api_client.post(
            f"{base}/api/calc-engine/execute-by-category",
            json=payload,
            headers=auth_headers,
            timeout=45,
        )
        assert resp.status_code == 200, f"Carbon composition failed: {resp.status_code} {resp.text[:400]}"
        _assert_calc_response(resp.json())


class TestCustomFuelSaveGuardsCodeContract:
    def test_custom_fuel_save_requires_backend_result_on_monthly_dispatch(self):
        content = Path("/app/frontend/src/modules/ghg/emissions/shared/hooks/useEmissionSubmit.js").read_text(encoding="utf-8")
        assert "backend calculation returned no result" in content
        assert "backend calculation failed" in content
        assert "if (useCustomFuel)" in content

    def test_custom_mode_uses_live_component_and_non_custom_uses_trace_component(self):
        content = Path("/app/frontend/src/components/EmissionEditForm.jsx").read_text(encoding="utf-8")
        assert "editUseCustomFuel ? (" in content
        assert "<CustomFuelLiveCalculation" in content
        assert "<EmissionCalculationTrace" in content
