"""Live backend regression checks for parent supplier GHG read-only view contracts."""

import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

import pytest
import requests


def _read_env_value(path: str, key: str) -> Optional[str]:
    if not os.path.exists(path):
        return None
    for raw_line in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.strip().strip('"').strip("'")
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


@pytest.fixture(scope="module")
def ctx() -> Dict[str, Any]:
    base_url = _backend_base_url()
    creds = _credentials_from_memory()

    admin_token = _login(base_url, creds["admin"]["email"], creds["admin"]["password"])
    supplier_token = _login(base_url, creds["supplier"]["email"], creds["supplier"]["password"])
    non_admin_token = _login(base_url, creds["non_admin"]["email"], creds["non_admin"]["password"])

    emissions_response = requests.get(
        f"{base_url}/api/supplier-assessment/emissions/all",
        headers=_headers(admin_token),
        timeout=30,
    )
    assert emissions_response.status_code == 200, emissions_response.text[:300]
    rows = emissions_response.json().get("emissions") or []
    if not rows:
        pytest.skip("No parent-visible supplier emissions in this environment")

    candidate = next(
        (
            row
            for row in rows
            if row.get("scope") in {"scope1", "scope2"}
            and (row.get("facility_name") or row.get("facility_id"))
            and (row.get("fuel_type") or row.get("sub_category"))
        ),
        None,
    )
    if not candidate:
        pytest.skip("No eligible Scope 1/2 record with facility and fuel/subcategory found")

    return {
        "base_url": base_url,
        "admin_token": admin_token,
        "supplier_token": supplier_token,
        "non_admin_token": non_admin_token,
        "candidate": candidate,
    }


# Module: parent detail contract and sensitive evidence URL exclusion.
def test_parent_detail_exposes_read_only_record_without_raw_evidence_url(ctx: Dict[str, Any]):
    emission_id = ctx["candidate"]["id"]
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()

    assert payload.get("id") == emission_id
    assert payload.get("source") == "supplier"
    assert payload.get("scope") in {"scope1", "scope2"}
    assert "evidence_url" not in payload
    assert "evidence_file_name" not in payload
    assert isinstance(payload.get("evidence_files") or [], list)


# Module: populated parent detail should carry facility, fuel/subcategory, and quantity-style values.
def test_parent_detail_contains_non_empty_facility_and_data_values(ctx: Dict[str, Any]):
    emission_id = ctx["candidate"]["id"]
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx["admin_token"]),
        timeout=30,
    )
    assert response.status_code == 200, response.text[:300]
    payload = response.json()

    facility_name = (payload.get("facility_name") or "").strip()
    assert facility_name, "facility_name should be non-empty"

    fuel_or_subcategory = (payload.get("fuel_type") or payload.get("sub_category") or "").strip()
    assert fuel_or_subcategory, "fuel_type/sub_category should be non-empty"

    dynamic_values = payload.get("dynamic_field_values") or {}
    assert isinstance(dynamic_values, dict)
    has_dynamic_value = any(
        value not in (None, "", {})
        for key, value in dynamic_values.items()
        if not str(key).endswith("_unit")
    )
    quantity_value = payload.get("quantity")
    assert has_dynamic_value or quantity_value not in (None, ""), "Expected quantity/dynamic values in parent detail"


# Module: unauthorized users must not access parent detail endpoint.
@pytest.mark.parametrize("token_key", ["supplier_token", "non_admin_token"])
def test_parent_detail_rejects_unauthorized_authenticated_users(ctx: Dict[str, Any], token_key: str):
    emission_id = ctx["candidate"]["id"]
    response = requests.get(
        f"{ctx['base_url']}/api/supplier-assessment/emissions/{emission_id}",
        headers=_headers(ctx[token_key]),
        timeout=30,
    )
    assert response.status_code in (401, 403, 404), response.text[:300]
