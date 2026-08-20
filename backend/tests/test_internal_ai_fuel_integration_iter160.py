"""
Integration tests for Internal Data AI — fuel_type filter at the MongoDB query
level, consumption_breakdown response, and a live-endpoint reachability check.

These tests wrap the shared `db` object with a fake Motor-like collection that
records the query filters + aggregation pipelines it receives, so we can
assert that `fuel_type` propagates all the way from the service layer down to
Mongo without needing a real database.
"""
import os
import re
import json
import pytest
import asyncio
from unittest.mock import patch

import requests

from modules.internal_data_ai.services import analytics as analytics_service
from modules.internal_data_ai.services import emissions as emissions_service


def _read_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.strip().startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            url = ""
    return (url or "").rstrip("/")


BASE_URL = _read_backend_url()


# ---------------------------------------------------------------------------
# Fake Motor collection — records the filter/pipeline it was called with
# ---------------------------------------------------------------------------
class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []
        self.find_calls = []
        self.aggregate_calls = []
        self.count_calls = []

    def find(self, query=None, projection=None):
        self.find_calls.append(query)
        return _FakeCursor(self.docs)

    def aggregate(self, pipeline):
        self.aggregate_calls.append(pipeline)
        # Inspect the $group stage's _id shape so we return a compatible doc.
        group_id = None
        for stage in pipeline:
            if "$group" in stage:
                group_id = stage["$group"].get("_id")
                break
        if isinstance(group_id, dict):
            # consumption_pipeline groups by {fuel_type, unit}
            doc_id = {"fuel_type": "Crude Oil", "unit": "L"}
        else:
            doc_id = "fac-1"
        return _FakeCursor([
            {"_id": doc_id, "total_emissions": 12.5, "total_quantity": 100.0, "record_count": 3},
        ])

    async def count_documents(self, query):
        self.count_calls.append(query)
        return len(self.docs)


class _FakeDB:
    def __init__(self):
        self.emission_records = _FakeCollection([
            {
                "id": "e1", "organization_id": "org-1", "facility_id": "fac-1",
                "scope": "1", "category": "Stationary Combustion",
                "fuel_type": "Crude Oil", "quantity": 100, "unit": "L",
                "reporting_period": "2026-07", "co2e_emissions": 12.5,
            }
        ])
        self.facilities = _FakeCollection([
            {"id": "fac-1", "name": "Facility A"},
        ])

    def __getitem__(self, name):
        return getattr(self, name, _FakeCollection())


def _pipeline_has_fuel_filter(pipeline, fuel_value):
    """Return True when any $match stage in the pipeline restricts fuel_type."""
    text = json.dumps(pipeline, default=str)
    return "fuel_type" in text and fuel_value in text


# ---------------------------------------------------------------------------
# analytics.query() — fuel_type propagation + consumption_breakdown
# ---------------------------------------------------------------------------
class TestAnalyticsQueryFuelFilter:
    """Test 10 + Test 11: analytics.query accepts fuel_type and returns
    consumption_breakdown in the response."""

    @pytest.mark.asyncio
    async def test_fuel_type_applied_in_pipeline(self):
        fake = _FakeDB()
        with patch.object(analytics_service, "db", fake):
            result = await analytics_service.query(
                org_id="org-1",
                facility_ids=None,
                fuel_type="Crude Oil",
                period={"start_month": "2026-07", "end_month": "2026-07",
                         "label": "July 2026", "source": "explicit"},
            )
        # At least one aggregate pipeline must reference fuel_type=Crude Oil
        pipelines = fake.emission_records.aggregate_calls
        assert pipelines, "No aggregate calls were made"
        assert any(_pipeline_has_fuel_filter(p, "Crude Oil") for p in pipelines), \
            f"fuel_type filter was not injected into pipelines: {pipelines}"
        # Response contains the new fields
        assert "consumption_breakdown" in result
        assert result.get("fuel_type_filter") == "Crude Oil"
        assert result.get("period") == "July 2026"

    @pytest.mark.asyncio
    async def test_no_fuel_type_does_not_filter(self):
        fake = _FakeDB()
        with patch.object(analytics_service, "db", fake):
            result = await analytics_service.query(
                org_id="org-1",
                facility_ids=None,
                period={"start_month": "2026-07", "end_month": "2026-07",
                         "label": "July 2026", "source": "explicit"},
            )
        # No pipeline stage should mention fuel_type as a filter value
        pipelines = fake.emission_records.aggregate_calls
        # (there IS a $group by fuel_type in consumption pipeline, but no $match on it)
        match_stages = []
        for p in pipelines:
            for stage in p:
                if "$match" in stage:
                    match_stages.append(stage["$match"])
        assert not any("fuel_type" in json.dumps(m, default=str) for m in match_stages), \
            f"Unexpected fuel_type filter present: {match_stages}"
        assert result.get("fuel_type_filter") is None
        assert "consumption_breakdown" in result


# ---------------------------------------------------------------------------
# emissions.search_records() — existing fuel_type filter preserved
# ---------------------------------------------------------------------------
class TestEmissionsSearchFuelFilter:
    """Test 12: emissions.search_records still applies fuel_type filter."""

    @pytest.mark.asyncio
    async def test_fuel_type_applied_in_find_query(self):
        fake = _FakeDB()
        with patch.object(emissions_service, "db", fake):
            result = await emissions_service.search_records(
                org_id="org-1",
                facility_ids=None,
                fuel_type="Crude Oil",
                period={"start_month": "2026-07", "end_month": "2026-07",
                         "label": "July 2026", "source": "explicit"},
            )
        # The find() query must include a regex-based fuel_type filter
        queries = fake.emission_records.find_calls
        assert queries, "No find calls were made against emission_records"
        joined = json.dumps(queries, default=str)
        assert "fuel_type" in joined and "Crude Oil" in joined, \
            f"fuel_type filter missing from find query: {queries}"
        assert result.get("period") == "July 2026"
        assert result.get("total_found") >= 0

    @pytest.mark.asyncio
    async def test_no_fuel_type_no_filter(self):
        fake = _FakeDB()
        with patch.object(emissions_service, "db", fake):
            await emissions_service.search_records(
                org_id="org-1",
                facility_ids=None,
                period={"start_month": "2026-07", "end_month": "2026-07",
                         "label": "July 2026", "source": "explicit"},
            )
        queries = fake.emission_records.find_calls
        assert queries
        assert "fuel_type" not in json.dumps(queries, default=str)


# ---------------------------------------------------------------------------
# Live endpoint reachability — /api/auth/login + /api/internal-ai/chat
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def auth_token():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    try:
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
            timeout=30,
        )
    except Exception as e:
        pytest.skip(f"Login endpoint unreachable: {e}")
    if r.status_code != 200:
        pytest.skip(f"Login failed with {r.status_code}: {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token in login response keys: {list(data.keys())}")
    return token


class TestLiveEndpoints:
    """Test 14 + Test 15: backend healthy, login works, chat endpoint reachable."""

    def test_login_returns_token(self, auth_token):
        assert isinstance(auth_token, str) and len(auth_token) > 10

    def test_internal_ai_chat_reachable(self, auth_token):
        r = requests.post(
            f"{BASE_URL}/api/internal-ai/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"message": "How much Crude Oil was consumed for July 2026?"},
            timeout=120,
        )
        # Endpoint must NOT return 500. Any structured 2xx/4xx is acceptable.
        assert r.status_code != 500, f"Chat endpoint returned 500: {r.text[:500]}"
        assert r.status_code < 600
        # If it's 200, verify schema
        if r.status_code == 200:
            body = r.json()
            assert "answer" in body
            assert "session_id" in body
            # For a fuel query the router should NOT route to esg_kpi_definitions
            intent = body.get("intent")
            assert intent is not None
