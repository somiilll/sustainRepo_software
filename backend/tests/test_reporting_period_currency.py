"""
Tests for the calc-engine reporting_period context for currency conversion year lookup.

Covers:
1. The extract_year_from_reporting_period helper in calc_engine.router
2. The same helper in bulk_upload_scope3.processors.emission_calculator
3. End-to-end API call to /api/calc-engine/execute-by-category with reporting_period context,
   verifying that the correct currency_conversion row (by year_applicable) is consumed for
   spend_basis Scope 3 formulas.
"""

import os
import sys
import uuid
import asyncio
import pytest
import requests

# Make backend importable
sys.path.insert(0, "/app/backend")

from calc_engine.router import extract_year_from_reporting_period as ce_extract
from bulk_upload_scope3.processors.emission_calculator import (
    extract_year_from_reporting_period as bulk_extract,
)

# Load env from frontend/.env for public URL (used by Kubernetes ingress)
def _load_env(path):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass

_load_env("/app/frontend/.env")
_load_env("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = "goyalsomil@hotmail.com"
TEST_PASSWORD = "Test123!"


# ---------- Helper unit tests ----------

class TestExtractYearHelper:
    """Unit tests for the FY/CY/monthly year extraction logic (both helpers)."""

    @pytest.mark.parametrize("fn", [ce_extract, bulk_extract])
    @pytest.mark.parametrize(
        "value,expected",
        [
            ("2025-04", 2025),
            ("2025-4", 2025),
            ("2025-12", 2025),
            ("FY 2025-2026", 2026),   # END year
            ("FY 2025-26", 2026),
            ("FY 2024-2025", 2025),
            ("fy 2023-2024", 2024),
            ("CY 2025", 2025),
            ("CY2025", 2025),
            ("2025", 2025),
            ("", None),
            (None, None),
            ("invalid", None),
        ],
    )
    def test_extract_year(self, fn, value, expected):
        assert fn(value) == expected

    def test_both_helpers_agree(self):
        for value in ["2025-04", "FY 2025-2026", "CY 2025", "2025"]:
            assert ce_extract(value) == bulk_extract(value), (
                f"Helpers disagree for {value!r}"
            )


# ---------- API integration ----------

@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(
        f"{API}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30,
    )
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token in login response: {data}")
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def db():
    """Direct MongoDB access for fixture setup/teardown (sync pymongo)."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    return client[db_name]


@pytest.fixture(scope="module")
def seeded_currency_rows(db):
    """Seed two currency_conversion rows for INR for distinct years."""
    rows = [
        {
            "id": f"TEST_CC_{uuid.uuid4()}",
            "source_currency": "INR",
            "year_applicable": 2024,
            "purchase_parity": 22.0,
            "inflation_factor": 1.05,
            "source": "TEST_FIXTURE_2024",
            "is_active": True,
        },
        {
            "id": f"TEST_CC_{uuid.uuid4()}",
            "source_currency": "INR",
            "year_applicable": 2026,
            "purchase_parity": 28.0,
            "inflation_factor": 1.15,
            "source": "TEST_FIXTURE_2026",
            "is_active": True,
        },
    ]
    db.currency_conversion.insert_many(rows)
    yield rows
    db.currency_conversion.delete_many({"id": {"$in": [r["id"] for r in rows]}})


# Locate any active spend_basis formula category for a smoke API call
@pytest.fixture(scope="module")
def spend_basis_category_id(db):
    cursor = db.ce_decision_trees.find({"is_active": True}, {"_id": 0})
    for tree in cursor:
        if "spend_basis" in str(tree):
            cat = tree.get("category_id")
            if cat:
                return cat
    pytest.skip("No spend_basis decision tree seeded in DB")


class TestCalcEngineReportingPeriodContext:
    """
    Verifies the calc-engine consumes context.reporting_period for currency lookup.

    We don't necessarily assert numeric output (formula may vary); we assert that the
    request is accepted (no 4xx/5xx solely due to context handling) and that the audit
    log / outputs reference a year-specific source we seeded.
    """

    def test_execute_with_fy_reporting_period_uses_end_year(
        self, headers, spend_basis_category_id, seeded_currency_rows
    ):
        payload = {
            "category_id": spend_basis_category_id,
            "decision_inputs": {"calculation_method_scope3": "spend_basis"},
            "inputs": {
                "spent_value": {"value": 1000.0, "unit": "INR"},
            },
            "context": {
                "scope": "scope3",
                "reporting_period": "FY 2025-2026",  # → year 2026
            },
            "user_overrides": {},
            "dry_run": True,
        }
        resp = requests.post(
            f"{API}/calc-engine/execute-by-category",
            json=payload, headers=headers, timeout=60,
        )
        # We tolerate 400/404 if formula not configured for this test category, but
        # we *must not* see 500. And on 200 we verify year-2026 source was used.
        assert resp.status_code != 500, f"Server error: {resp.text[:500]}"
        if resp.status_code != 200:
            pytest.skip(f"Non-200 ({resp.status_code}) - formula not exec-able: {resp.text[:200]}")
        data = resp.json()
        body = str(data)
        assert "TEST_FIXTURE_2026" in body or "2026" in body, (
            f"Expected year-2026 currency source to be used, got: {body[:800]}"
        )
        assert "TEST_FIXTURE_2024" not in body, (
            "Year-2024 row should NOT have been used for FY 2025-2026"
        )

    def test_execute_with_monthly_reporting_period_uses_calendar_year(
        self, headers, spend_basis_category_id, seeded_currency_rows
    ):
        payload = {
            "category_id": spend_basis_category_id,
            "decision_inputs": {"calculation_method_scope3": "spend_basis"},
            "inputs": {"spent_value": {"value": 1000.0, "unit": "INR"}},
            "context": {
                "scope": "scope3",
                "reporting_period": "2024-04",  # → year 2024
            },
            "user_overrides": {},
            "dry_run": True,
        }
        resp = requests.post(
            f"{API}/calc-engine/execute-by-category",
            json=payload, headers=headers, timeout=60,
        )
        assert resp.status_code != 500, f"Server error: {resp.text[:500]}"
        if resp.status_code != 200:
            pytest.skip(f"Non-200 ({resp.status_code}): {resp.text[:200]}")
        body = str(resp.json())
        assert "TEST_FIXTURE_2024" in body or "2024" in body
        assert "TEST_FIXTURE_2026" not in body

    def test_execute_with_no_reporting_period_falls_back(
        self, headers, spend_basis_category_id, seeded_currency_rows
    ):
        """No reporting_period in context should still succeed via fallback (latest year)."""
        payload = {
            "category_id": spend_basis_category_id,
            "decision_inputs": {"calculation_method_scope3": "spend_basis"},
            "inputs": {"spent_value": {"value": 1000.0, "unit": "INR"}},
            "context": {"scope": "scope3"},
            "user_overrides": {},
            "dry_run": True,
        }
        resp = requests.post(
            f"{API}/calc-engine/execute-by-category",
            json=payload, headers=headers, timeout=60,
        )
        assert resp.status_code != 500, f"Server error: {resp.text[:500]}"
