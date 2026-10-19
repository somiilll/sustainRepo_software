"""Live regression checks for parent Supplier GHG detail mapping labels and auth guards."""

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
import requests


def _read_env_value(path: str, key: str) -> Optional[str]:
    if not os.path.exists(path):
        return None
    for raw_line in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        candidate_key, value = line.split("=", 1)
        if candidate_key.strip() == key:
            return value.strip().strip('"').strip("'")
    return None


def _backend_base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL") or _read_env_value("/app/frontend/.env", "REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL unavailable for live checks")
    return base.rstrip("/")


def _credentials_from_memory() -> Dict[str, Dict[str, str]]:
    path = "/app/memory/test_credentials.md"
    if not os.path.exists(path):
        pytest.skip("/app/memory/test_credentials.md missing")

    text = Path(path).read_text(encoding="utf-8")

    def _block(title: str) -> Dict[str, str]:
        match = re.search(rf"##\s+{re.escape(title)}[\s\S]*?(?=\n##\s+|\Z)", text)
        if not match:
            return {}
        chunk = match.group(0)
        email = re.search(r"\*\*Email\*\*:\s*([^\n]+)", chunk)
        password = re.search(r"\*\*Password\*\*:\s*([^\n]+)", chunk)
        return {
            "email": email.group(1).strip() if email else "",
            "password": password.group(1).strip() if password else "",
        }

    admin = _block("Admin Account")
    supplier = _block("Supplier Account")
    non_admin = _block("Aman")

    if not admin.get("email") or not admin.get("password"):
        pytest.skip("Admin credentials missing in /app/memory/test_credentials.md")
    if not supplier.get("email") or not supplier.get("password"):
        pytest.skip("Supplier credentials missing in /app/memory/test_credentials.md")
    if not non_admin.get("email") or not non_admin.get("password"):
        pytest.skip("Non-admin credentials (Aman) missing in /app/memory/test_credentials.md")

    return {
        "admin": admin,
        "supplier": supplier,
        "non_admin": non_admin,
    }


def _login(base_url: str, email: str, password: str) -> str:
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, f"Login failed for {email}: {response.status_code} {response.text[:300]}"
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"No token returned for {email}"
    return token


def _headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _find_mapping(mappings: List[Dict[str, Any]], variable: str) -> Optional[Dict[str, Any]]:
    for mapping in mappings:
        if mapping.get("maps_to_variable") == variable or mapping.get("field_key") == variable:
            return mapping
    return None


@pytest.fixture(scope="module")
def ctx() -> Dict[str, Any]:
    base_url = _backend_base_url()
    creds = _credentials_from_memory()

    admin_token = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_token = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])
    non_admin_token = _login(base_url, creds["non_admin"]["email"], creds["non_admin"]["password"])

    all_response = requests.get(
        f"{base_url}/api/supplier-assessment/emissions/all",
        headers=_headers(admin_token),
        timeout=30,
    )
    assert all_response.status_code == 200, all_response.text[:300]
    rows = all_response.json().get("emissions") or []
    if not rows:
        pytest.skip("No parent-visible supplier emissions available in this environment")

    def _has_dynamic_var(row: Dict[str, Any], var_name: str) -> bool:
        dynamic_values = row.get("dynamic_field_values") or {}
        return var_name in dynamic_values

    scope2_candidate = next(
        (
            row
            for row in rows
            if row.get("scope") == "scope2"
            and (_has_dynamic_var(row, "qty_energy") or _has_dynamic_var(row, "ef_quantity_electricity_co2"))
        ),
        None,
    )
    fugitive_candidate = next(
        (
            row
            for row in rows
            if (row.get("category") or "").lower().find("fugitive") >= 0
            and (_has_dynamic_var(row, "qty") or _has_dynamic_var(row, "co2_gwp_fugitives"))
        ),
        None,
    )

    fallback = rows[0]

    return {
        "base_url": base_url,
        "admin_token": admin_token,
        "supplier_token": supplier_token,
        "non_admin_token": non_admin_token,
        "scope2_candidate": scope2_candidate,
        "fugitive_candidate": fugitive_candidate,
        "fallback": fallback,
    }


# Module: parent detail must include sanitized evidence metadata and dynamic mapping payload.
def test_parent_detail_includes_input_field_mappings_and_redacts_raw_evidence_fields(ctx: Dict[str, Any]):
    emission_id = ctx["fallback"]["id"]
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()

    assert payload.get("id") == emission_id
    assert "evidence_url" not in payload
    assert "evidence_file_name" not in payload
    assert isinstance(payload.get("evidence_files") or [], list)
    assert isinstance(payload.get("input_field_mappings") or [], list)

    dynamic_keys = set((payload.get("dynamic_field_values") or {}).keys())
    for mapping in payload.get("input_field_mappings") or []:
        variable = mapping.get("maps_to_variable") or mapping.get("field_key")
        assert variable in dynamic_keys
        assert isinstance(mapping.get("field_label") or mapping.get("label") or "", str)


# Module: scope2 mappings in parent detail should expose configured labels for dynamic variables.
def test_scope2_parent_detail_uses_mapping_labels_for_known_variables_when_available(ctx: Dict[str, Any]):
    candidate = ctx.get("scope2_candidate")
    if not candidate:
        pytest.skip("No parent-visible Scope 2 sample found with qty_energy/ef_quantity_electricity_co2")

    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{candidate['id']}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()
    mappings = payload.get("input_field_mappings") or []

    for variable in ("qty_energy", "ef_quantity_electricity_co2"):
        if variable in (payload.get("dynamic_field_values") or {}):
            mapping = _find_mapping(mappings, variable)
            assert mapping is not None, f"Missing mapping for {variable}"
            assert (mapping.get("field_label") or mapping.get("label") or "").strip(), (
                f"Missing mapping label for {variable}"
            )


# Module: fugitive mappings in parent detail should expose configured labels for dynamic variables.
def test_fugitive_parent_detail_uses_mapping_labels_for_known_variables_when_available(ctx: Dict[str, Any]):
    candidate = ctx.get("fugitive_candidate")
    if not candidate:
        pytest.skip("No parent-visible Fugitive sample found with qty/co2_gwp_fugitives")

    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{candidate['id']}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()
    mappings = payload.get("input_field_mappings") or []

    for variable in ("qty", "co2_gwp_fugitives"):
        if variable in (payload.get("dynamic_field_values") or {}):
            mapping = _find_mapping(mappings, variable)
            assert mapping is not None, f"Missing mapping for {variable}"
            assert (mapping.get("field_label") or mapping.get("label") or "").strip(), (
                f"Missing mapping label for {variable}"
            )


# Module: parent detail endpoint must reject supplier and non-admin authenticated users.
@pytest.mark.parametrize("token_key", ["supplier_token", "non_admin_token"])
def test_parent_detail_is_blocked_for_supplier_and_non_admin_tokens(ctx: Dict[str, Any], token_key: str):
    emission_id = ctx["fallback"]["id"]
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx[token_key]),
        timeout=30,
    )
    assert response.status_code in (401, 403, 404), response.text[:300]
