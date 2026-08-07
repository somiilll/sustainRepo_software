"""
# Module: Scope 1 custom-fuel edit/calc decision-tree regression
# Feature: editUseCustomFuel gate bypass + ef_quantity_provided=true branch resolution
"""

import os
import uuid
import requests
import pytest


def _read_base_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    raise AssertionError("REACT_APP_BACKEND_URL must be set")


BASE_URL = _read_base_url()

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"


def _find_stationary_scope1_category(categories):
    for c in categories:
        if (c.get("scope_code") == "scope1") and (c.get("name", "").strip().lower() == "stationary combustion"):
            return c
    return None


def _find_ef_node(node):
    if not node or not isinstance(node, dict):
        return None
    if node.get("field_name") == "ef_quantity_provided":
        return node
    for option in (node.get("options") or {}).values():
        found = _find_ef_node(option.get("next"))
        if found:
            return found
    return None


def _pick_input_variables(form_config):
    mappings = form_config.get("input_field_mappings") or []

    qty_var = None
    ef_var = None

    for m in mappings:
        v = (m.get("maps_to_variable") or "").lower()
        fk = (m.get("field_key") or "").lower()
        if not ef_var and (v == "ef_quantity" or fk == "ef_quantity"):
            ef_var = m
        if not qty_var and (v in {"qty", "quantity_fuel", "quantity"} or fk in {"qty", "quantity_fuel", "quantity"}):
            qty_var = m

    # Fallbacks if naming differs slightly
    if not ef_var:
        ef_var = next((m for m in mappings if "ef" in (m.get("maps_to_variable") or "").lower()), None)
    if not qty_var:
        qty_var = next((m for m in mappings if "qty" in (m.get("maps_to_variable") or "").lower() or "quantity" in (m.get("maps_to_variable") or "").lower()), None)

    assert qty_var is not None, f"Quantity-like input mapping not found in form-config: {mappings}"
    assert ef_var is not None, f"EF-like input mapping not found in form-config: {mappings}"

    return qty_var, ef_var


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No auth token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def scope1_stationary_context(auth_headers):
    cats = requests.get(f"{BASE_URL}/api/categories?scope_code=scope1", headers=auth_headers, timeout=30)
    assert cats.status_code == 200, f"Failed categories fetch: {cats.status_code} {cats.text}"
    categories = cats.json()
    category = _find_stationary_scope1_category(categories)
    assert category, "Stationary Combustion category not found under scope1"

    cfg = requests.get(
        f"{BASE_URL}/api/calc-engine/form-config/{category['id']}?scope=scope1",
        headers=auth_headers,
        timeout=40,
    )
    assert cfg.status_code == 200, f"Failed form-config fetch: {cfg.status_code} {cfg.text}"
    form_config = cfg.json()

    ef_node = _find_ef_node(form_config.get("decision_tree"))
    assert ef_node is not None, "ef_quantity_provided node not found in decision tree"

    qty_map, ef_map = _pick_input_variables(form_config)
    return {
        "category": category,
        "form_config": form_config,
        "ef_node": ef_node,
        "qty_map": qty_map,
        "ef_map": ef_map,
    }


class TestCustomFuelEditDecisionTreeRegression:
    def test_login_works_with_admin_credentials(self, auth_headers):
        assert "Authorization" in auth_headers
        assert auth_headers["Authorization"].startswith("Bearer ")

    def test_custom_fuel_dry_run_resolves_true_branch_formula(self, auth_headers, scope1_stationary_context):
        ctx = scope1_stationary_context
        category_id = ctx["category"]["id"]
        ef_node = ctx["ef_node"]

        true_formula_id = (ef_node.get("options") or {}).get("true", {}).get("formula_id")
        false_formula_id = (ef_node.get("options") or {}).get("false", {}).get("formula_id")

        qty_var = ctx["qty_map"].get("maps_to_variable")
        ef_var = ctx["ef_map"].get("maps_to_variable")
        qty_unit = ctx["qty_map"].get("default_unit") or "kg"
        ef_unit = ctx["ef_map"].get("default_unit") or "kgCO2/kg"

        decision_inputs = {
            "calculation_methodology": "using_ncv",
            "ef_quantity_provided": "true",
        }

        payload = {
            "category_id": category_id,
            "decision_inputs": decision_inputs,
            "inputs": {
                qty_var: {"value": 25, "unit": qty_unit},
                ef_var: {"value": 2.4, "unit": ef_unit},
            },
            "context": {
                "scope": "scope1",
                "category": "Stationary Combustion",
                "fuel_name": f"TEST_CF_{uuid.uuid4().hex[:8]}",
                "fuel_id": None,
                "is_custom_fuel": True,
            },
            "user_overrides": {
                ef_var: {"value": 2.4, "unit": ef_unit},
            },
            "dry_run": True,
        }

        r = requests.post(
            f"{BASE_URL}/api/calc-engine/execute-by-category",
            json=payload,
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"Dry-run failed: {r.status_code} {r.text}"
        data = r.json()

        resolved_formula = data.get("resolved_formula") or {}
        outputs = data.get("outputs") or {}
        co2e = (outputs.get("co2e") or {}).get("value")

        assert outputs, f"No outputs from calc-engine: {data}"
        assert co2e is not None and float(co2e) > 0, f"Expected positive co2e for manual quantity+EF path, got {outputs}"

        if true_formula_id:
            assert resolved_formula.get("id") == true_formula_id, (
                f"Expected ef_quantity_provided=true branch formula {true_formula_id}, "
                f"got {resolved_formula.get('id')}"
            )

        if true_formula_id and false_formula_id and true_formula_id != false_formula_id:
            assert resolved_formula.get("id") != false_formula_id, (
                "Resolved to false branch formula despite ef_quantity_provided=true"
            )
