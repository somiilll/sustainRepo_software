"""Internal Data AI regression checks for scope query, version-history privacy, and fuel resolution behavior."""
import json
import os
import re

import pytest
import requests

from modules.internal_data_ai.entity_resolution import resolve_fuel_entity
from modules.internal_data_ai.planner import plan_service_calls
from modules.internal_data_ai.query_contracts import QueryEntity, QueryType, StructuredQueryPlan


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


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _length):
        return self.rows


class _FuelDatabase:
    def __init__(self, rows):
        self.rows = rows

    def find(self, *_args):
        return _Cursor(self.rows)


class _DB:
    def __init__(self, fuels):
        self.fuel_database = _FuelDatabase(fuels)


@pytest.mark.asyncio
async def test_aliases_map_to_canonical_diesel_and_unknown_fails_closed():
    # Explicit fuel aliases must resolve to canonical Diesel.
    db = _DB([{"fuel_name": "Diesel"}, {"fuel_name": "Naphtha"}])
    for requested in ("Diesel", "HSD", "High Speed Diesel"):
        result = await resolve_fuel_entity(db, requested)
        assert result["status"] == "RESOLVED"
        assert result["canonical_value"] == "Diesel"

    # Unknown/ambiguous should fail closed in planning.
    unresolved_plan = StructuredQueryPlan(
        query_type=QueryType.CONSUMPTION_LOOKUP,
        entity=QueryEntity(type="fuel", raw_value="Unknown blend", canonical_value=None, resolution="NOT_FOUND"),
    )
    calls = plan_service_calls({}, unresolved_plan)
    assert calls == [{
        "service": "evidence_state",
        "method": "validate",
        "params": {
            "period": unresolved_plan.period.model_dump(),
            "entity_resolution": {"status": "NOT_FOUND"},
        },
    }]


def test_live_internal_ai_scope_and_record_history_single_login():
    # Live endpoint checks with exactly one login request (rate-limit sensitive).
    if not BASE_URL:
        pytest.fail("Missing REACT_APP_BACKEND_URL (frontend/.env)")

    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
        timeout=45,
    )
    if login_resp.status_code == 429:
        pytest.fail(f"BLOCKER: /api/auth/login returned 429 (rate limited). Body: {login_resp.text[:300]}")
    assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} {login_resp.text[:300]}"

    token = (login_resp.json().get("access_token") or login_resp.json().get("token"))
    assert token, f"No token found in login payload keys={list(login_resp.json().keys())}"
    headers = {"Authorization": f"Bearer {token}"}

    # Query 1: generic scope query must stay fuel-agnostic and not inject CO2 as fuel.
    q1_resp = requests.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers=headers,
        json={"message": "give scope 1 emissions"},
        timeout=120,
    )
    assert q1_resp.status_code == 200, f"Scope query failed: {q1_resp.status_code} {q1_resp.text[:500]}"
    q1_json = q1_resp.json()
    q1_text = json.dumps(q1_json, ensure_ascii=False).lower()
    assert q1_json.get("query_type") == "emission_lookup"
    assert "co2 – carbon dioxide" not in q1_text
    assert "co2 - carbon dioxide" not in q1_text
    assert "not_found" not in q1_text
    assert "no authorized data" not in q1_text

    # Query 2: record history must avoid internal IDs / formula-version terminology and timelines.
    q2_resp = requests.post(
        f"{BASE_URL}/api/internal-ai/chat",
        headers=headers,
        json={"message": "version history for diesel record for aug 2026"},
        timeout=120,
    )
    assert q2_resp.status_code == 200, f"History query failed: {q2_resp.status_code} {q2_resp.text[:500]}"
    q2_json = q2_resp.json()
    q2_text = json.dumps(q2_json, ensure_ascii=False).lower()
    assert q2_json.get("query_type") == "record_version_history"
    assert "`" not in q2_text
    assert re.search(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", q2_text) is None
    forbidden_terms = [
        "formula id",
        "formula_id",
        "formula-version",
        "formula version",
        "ce_formula_versions",
        "version timeline",
    ]
    for term in forbidden_terms:
        assert term not in q2_text, f"Forbidden term leaked: {term}"
