"""Regression tests for organization AI query aliases (sustainability config + Internal AI routing)."""

import os
import uuid
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

SUPERADMIN_EMAIL = "superadmin@ecotrack.com"
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
ORG_A = "9067d872-8a3a-4ed9-8494-e3ef04952f7c"


@pytest.fixture(scope="module")
def session() -> requests.Session:
    client = requests.Session()
    client.headers.update({"Content-Type": "application/json"})
    return client


def _login(session: requests.Session, email: str, password: str) -> str:
    resp = session.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=45,
    )
    if resp.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login rate-limited for {email}: {resp.text[:300]}")
    assert resp.status_code == 200, f"Login failed for {email}: {resp.status_code} {resp.text[:300]}"
    payload = resp.json()
    token = payload.get("access_token") or payload.get("token")
    assert token, f"No token for {email}. Keys={list(payload.keys())}"
    return token


@pytest.fixture(scope="module")
def tokens(session: requests.Session) -> dict[str, str]:
    assert BASE_URL, "REACT_APP_BACKEND_URL missing"
    return {
        "superadmin": _login(session, SUPERADMIN_EMAIL, PASSWORD),
        "admin": _login(session, ADMIN_EMAIL, PASSWORD),
    }


@pytest.fixture(scope="module")
def alias_context(session: requests.Session, tokens: dict[str, str]) -> dict[str, Any]:
    """Sustainability config alias setup/restore around tests.
    Module: Super-admin org config alias persistence + deterministic Internal AI alias routing.
    """
    super_headers = {"Authorization": f"Bearer {tokens['superadmin']}", "Content-Type": "application/json"}

    # 1) Backup current alias configuration
    existing_resp = session.get(
        f"{API}/sustainability-config/org-config",
        headers=super_headers,
        params={"org_id": ORG_A},
        timeout=45,
    )
    assert existing_resp.status_code == 200, existing_resp.text
    existing_cfg = existing_resp.json()
    original_aliases = list(existing_cfg.get("ai_query_aliases") or [])

    # 2) Discover governance incidents subcategory + one field for field alias test
    gov_defaults_resp = session.get(
        f"{API}/sustainability-config/default-modules/governance",
        headers=super_headers,
        timeout=45,
    )
    assert gov_defaults_resp.status_code == 200, gov_defaults_resp.text
    governance_modules = gov_defaults_resp.json() or []
    incidents_module = next((m for m in governance_modules if (m.get("module_name") or "").lower() == "incidents"), None)
    if not incidents_module:
        pytest.skip("Governance default module 'Incidents' not found")

    incidents_subcategory = (incidents_module.get("subcategories") or [None])[0]
    if not incidents_subcategory:
        pytest.skip("No governance subcategory available under Incidents module")
    subcategory_name = incidents_subcategory.get("subcategory_name")
    if not subcategory_name:
        pytest.skip("Governance subcategory name missing under Incidents module")

    first_field = (incidents_subcategory.get("fields") or [None])[0]
    if not first_field:
        pytest.skip("No governance incident fields available to validate field alias")
    field_key = first_field.get("field_key") or first_field.get("field_code")
    if not field_key:
        pytest.skip("Governance incident field has no field_key/field_code")

    suffix = uuid.uuid4().hex[:8]
    category_alias = f"board test alias {suffix}"
    subcategory_alias = f"incident sub alias {suffix}"
    field_alias = f"incident field alias {suffix}"

    temp_rules = [
        {
            "section": "governance",
            "category": "Incidents",
            "aliases": [category_alias],
        },
        {
            "section": "governance",
            "category": "Incidents",
            "subcategory": subcategory_name,
            "aliases": [subcategory_alias],
        },
        {
            "section": "governance",
            "category": "Incidents",
            "subcategory": subcategory_name,
            "field_key": field_key,
            "aliases": [field_alias],
        },
    ]

    merged_aliases = [
        rule
        for rule in original_aliases
        if not (
            (rule.get("section") == "governance")
            and (str(rule.get("category") or "").lower() == "incidents")
            and any(
                marker in (rule.get("aliases") or [])
                for marker in (category_alias, subcategory_alias, field_alias)
            )
        )
    ] + temp_rules

    update_resp = session.put(
        f"{API}/sustainability-config/org-config",
        headers=super_headers,
        params={"org_id": ORG_A},
        json={"ai_query_aliases": merged_aliases},
        timeout=45,
    )
    assert update_resp.status_code == 200, update_resp.text

    context = {
        "original_aliases": original_aliases,
        "temp_aliases": {
            "category_alias": category_alias,
            "subcategory_alias": subcategory_alias,
            "field_alias": field_alias,
            "field_key": field_key,
            "subcategory": subcategory_name,
        },
    }

    yield context

    restore_resp = session.put(
        f"{API}/sustainability-config/org-config",
        headers=super_headers,
        params={"org_id": ORG_A},
        json={"ai_query_aliases": original_aliases},
        timeout=45,
    )
    assert restore_resp.status_code == 200, f"Restore failed: {restore_resp.status_code} {restore_resp.text[:300]}"


def _highlights_map(payload: dict) -> dict[str, str]:
    mapped = {}
    for item in payload.get("highlights") or []:
        if isinstance(item, dict) and item.get("label"):
            mapped[str(item["label"]).strip().lower()] = str(item.get("value", "")).strip()
    return mapped


def test_superadmin_get_put_get_and_resolved_alias_catalog(session: requests.Session, tokens: dict[str, str], alias_context: dict[str, Any]):
    # Module: org-config CRUD around ai_query_aliases + resolved governance catalog.
    super_headers = {"Authorization": f"Bearer {tokens['superadmin']}"}
    admin_headers = {"Authorization": f"Bearer {tokens['admin']}"}
    temp = alias_context["temp_aliases"]

    raw_resp = session.get(
        f"{API}/sustainability-config/org-config",
        headers=super_headers,
        params={"org_id": ORG_A},
        timeout=45,
    )
    assert raw_resp.status_code == 200, raw_resp.text
    raw_aliases = raw_resp.json().get("ai_query_aliases") or []
    alias_values = {alias for rule in raw_aliases for alias in (rule.get("aliases") or [])}
    assert temp["category_alias"] in alias_values
    assert temp["subcategory_alias"] in alias_values
    assert temp["field_alias"] in alias_values

    resolved_resp = session.get(f"{API}/sustainability-config/resolved", headers=admin_headers, timeout=45)
    assert resolved_resp.status_code == 200, resolved_resp.text
    resolved = resolved_resp.json()
    governance_modules = resolved.get("governance_modules") or []

    incidents_module = next((m for m in governance_modules if (m.get("module_name") or "").lower() == "incidents"), None)
    assert incidents_module is not None, "Incidents governance module missing in resolved config"
    assert temp["category_alias"] in (incidents_module.get("aliases") or [])

    incidents_sub = next(
        (s for s in (incidents_module.get("subcategories") or []) if (s.get("subcategory_name") or "") == temp["subcategory"]),
        None,
    )
    assert incidents_sub is not None, "Incidents subcategory missing in resolved governance module"
    assert temp["subcategory_alias"] in (incidents_sub.get("aliases") or [])

    target_field = next(
        (f for f in (incidents_sub.get("fields") or []) if (f.get("field_key") or f.get("field_code")) == temp["field_key"]),
        None,
    )
    assert target_field is not None, f"Field {temp['field_key']} missing in resolved governance incidents fields"
    assert temp["field_alias"] in (target_field.get("aliases") or [])


def test_internal_ai_alias_phrase_routes_to_incidents_category(session: requests.Session, tokens: dict[str, str], alias_context: dict[str, Any]):
    # Module: Internal Data AI category alias resolution should route governance query to configured category.
    admin_headers = {"Authorization": f"Bearer {tokens['admin']}", "Content-Type": "application/json"}
    category_alias = alias_context["temp_aliases"]["category_alias"]

    chat_resp = session.post(
        f"{API}/internal-ai/chat",
        headers=admin_headers,
        json={"message": f"In governance, which {category_alias} are pending approval?", "session_id": f"iter171-{uuid.uuid4().hex[:6]}"},
        timeout=120,
    )
    assert chat_resp.status_code == 200, chat_resp.text
    payload = chat_resp.json()
    assert payload.get("query_type") == "approval_status_lookup"

    source_value = _highlights_map(payload).get("source", "")
    raw_data = payload.get("raw_data") or {}
    esg_data = raw_data.get("esg_records") if isinstance(raw_data.get("esg_records"), dict) else raw_data

    assert (esg_data.get("section") or "").lower() == "governance"
    assert (esg_data.get("category") or "").lower() == "incidents", payload
    assert "Governance" in source_value and "Incidents" in source_value


def test_alias_precedence_over_standard_wording(session: requests.Session, tokens: dict[str, str], alias_context: dict[str, Any]):
    # Module: alias precedence — organization alias should override default category wording.
    admin_headers = {"Authorization": f"Bearer {tokens['admin']}", "Content-Type": "application/json"}
    category_alias = alias_context["temp_aliases"]["category_alias"]

    chat_resp = session.post(
        f"{API}/internal-ai/chat",
        headers=admin_headers,
        json={"message": f"Show governance {category_alias} records", "session_id": f"iter171-precedence-{uuid.uuid4().hex[:6]}"},
        timeout=120,
    )
    assert chat_resp.status_code == 200, chat_resp.text
    payload = chat_resp.json()
    raw_data = payload.get("raw_data") or {}
    esg_data = raw_data.get("esg_records") if isinstance(raw_data.get("esg_records"), dict) else raw_data
    assert (esg_data.get("category") or "").lower() == "incidents", payload


def test_non_super_admin_cannot_update_org_config_aliases(session: requests.Session, tokens: dict[str, str]):
    # Module: RBAC guard for super-admin-only org config updates.
    admin_headers = {"Authorization": f"Bearer {tokens['admin']}", "Content-Type": "application/json"}
    denied_resp = session.put(
        f"{API}/sustainability-config/org-config",
        headers=admin_headers,
        params={"org_id": ORG_A},
        json={"ai_query_aliases": []},
        timeout=45,
    )
    assert denied_resp.status_code in (401, 403), denied_resp.text
