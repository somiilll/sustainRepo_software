"""
# Module: Supplier assessment GHG submission cadence + lock semantics
# Features: submission periods API contract, cadence resolver rules, lock/unlock editability guards
"""

import os
import uuid
from types import SimpleNamespace

import pytest
import requests

from modules.supplier_assessment import ghg_submission_service as service


def _base_url() -> str:
    base = os.environ.get("REACT_APP_BACKEND_URL")
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL is required for live tests")
    return base.rstrip("/")


def _login(email: str, password: str) -> dict:
    response = requests.post(
        f"{_base_url()}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    token = payload.get("access_token") or payload.get("token")
    assert isinstance(token, str) and token.strip(), payload
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="session")
def supplier_headers() -> dict:
    return _login("goyalsomil+919@hotmail.com", "TestUser123!")


@pytest.fixture(scope="session")
def supplier_periods_payload(supplier_headers) -> dict:
    response = requests.get(
        f"{_base_url()}/api/supplier-assessment/my-assessment/emissions/submission-periods",
        headers=supplier_headers,
        timeout=30,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert isinstance(payload, dict)
    return payload


def test_submission_periods_api_contract_has_expected_fields_and_no_bson(supplier_periods_payload):
    assert supplier_periods_payload.get("frequency") in {"monthly", "quarterly", "yearly"}
    periods = supplier_periods_payload.get("periods")
    assert isinstance(periods, list)
    assert len(periods) >= 1

    first = periods[0]
    for key in (
        "period_key",
        "frequency",
        "label",
        "period_start",
        "period_end",
        "due_date",
        "status",
        "revision",
        "month_keys",
    ):
        assert key in first, first
    assert "_id" not in first


def test_generic_emissions_custom_fuel_direct_post_returns_4xx_not_500(supplier_headers, supplier_periods_payload):
    facilities_response = requests.get(
        f"{_base_url()}/api/facilities",
        headers=supplier_headers,
        timeout=30,
    )
    assert facilities_response.status_code == 200, facilities_response.text
    facilities = facilities_response.json() or []
    if not facilities:
        pytest.skip("No supplier facilities available for direct emissions API test")

    periods = supplier_periods_payload.get("periods") or []
    if not periods:
        pytest.skip("No supplier periods available for custom-fuel direct-post regression")
    chosen_period = periods[0]
    is_yearly_period = chosen_period.get("frequency") == "yearly"
    reporting_period = chosen_period.get("period_key") if is_yearly_period else (chosen_period.get("month_keys") or [None])[0]
    if not reporting_period:
        pytest.skip("Supplier period is missing month_keys")

    response = requests.post(
        f"{_base_url()}/api/emissions",
        headers=supplier_headers,
        json={
            "facility_id": facilities[0]["id"],
            "reporting_period": reporting_period,
            "frequency_type": "yearly" if is_yearly_period else "monthly",
            "scope": "scope1",
            "category": "Process Emissions",
            "sub_category": "Natural Gas",
            "is_custom_fuel": True,
            "dynamic_field_values": {},
            "outputs": {},
        },
        timeout=30,
    )
    assert 400 <= response.status_code < 500, response.text


def _relationship(cadence: str) -> dict:
    return {
        "id": "REL_TEST",
        "reporting_period": "FY 2025-26",
        "ghg_submission_frequency": cadence,
        "financial_year_start_month": 4,
    }


def test_resolver_monthly_maps_exactly_one_month():
    period = service.resolve_supplier_submission_period(_relationship("monthly"), "2025-09", "monthly")
    assert period["period_key"] == "2025-09"
    assert period["month_keys"] == ["2025-09"]


def test_resolver_quarterly_uses_financial_year_quarter_order_apr_to_mar():
    q1 = service.resolve_supplier_submission_period(_relationship("quarterly"), "2025-04", "monthly")
    q2 = service.resolve_supplier_submission_period(_relationship("quarterly"), "2025-07", "monthly")
    q3 = service.resolve_supplier_submission_period(_relationship("quarterly"), "2025-10", "monthly")
    q4 = service.resolve_supplier_submission_period(_relationship("quarterly"), "2026-01", "monthly")

    assert q1["period_key"] == "FY 2025-26-Q1"
    assert q1["month_keys"] == ["2025-04", "2025-05", "2025-06"]
    assert q2["month_keys"] == ["2025-07", "2025-08", "2025-09"]
    assert q3["month_keys"] == ["2025-10", "2025-11", "2025-12"]
    assert q4["month_keys"] == ["2026-01", "2026-02", "2026-03"]


def test_resolver_yearly_maps_all_twelve_months():
    period = service.resolve_supplier_submission_period(_relationship("yearly"), "2025-04", "monthly")
    assert period["period_key"] == "FY 2025-26"
    assert len(period["month_keys"]) == 12
    assert period["month_keys"][0] == "2025-04"
    assert period["month_keys"][-1] == "2026-03"


def test_yearly_data_with_non_yearly_submission_cadence_is_rejected():
    with pytest.raises(ValueError, match="Yearly GHG data can only be used with yearly submission frequency"):
        service.resolve_supplier_submission_period(_relationship("monthly"), "FY 2025-26", "yearly")


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def to_list(self, _limit):
        return list(self._rows)


class _FakeSubmissionsCollection:
    def __init__(self, rows=None, find_one_doc=None):
        self._rows = rows or []
        self._find_one_doc = find_one_doc

    async def create_index(self, *_args, **_kwargs):
        return None

    def find(self, *_args, **_kwargs):
        return _FakeCursor(self._rows)

    async def find_one(self, *_args, **_kwargs):
        if not self._find_one_doc:
            return None
        if _args and isinstance(_args[0], dict):
            expected_status = _args[0].get("status")
            if expected_status and self._find_one_doc.get("status") != expected_status:
                return None
        return self._find_one_doc


@pytest.mark.asyncio
async def test_overdue_is_indicator_not_lock(monkeypatch):
    overdue_relationship = {
        "id": "REL_OVERDUE",
        "reporting_period": "FY 2020-21",
        "ghg_submission_frequency": "monthly",
        "financial_year_start_month": 4,
    }
    fake_db = SimpleNamespace(
        supplier_ghg_submissions=_FakeSubmissionsCollection(rows=[]),
    )
    monkeypatch.setattr(service, "db", fake_db)

    periods = await service.get_supplier_ghg_submission_periods(overdue_relationship)
    assert len(periods) == 12
    assert periods[0]["status"] == "in_progress"
    assert periods[0]["is_overdue"] is True


@pytest.mark.asyncio
async def test_submitted_period_blocks_but_unlocked_allows_writes(monkeypatch):
    relationship = {
        "id": "REL_LOCK",
        "reporting_period": "FY 2025-26",
        "ghg_submission_frequency": "monthly",
        "financial_year_start_month": 4,
    }

    fake_db_submitted = SimpleNamespace(
        supplier_ghg_submissions=_FakeSubmissionsCollection(find_one_doc={"id": "SUB_1", "status": "submitted"}),
    )
    monkeypatch.setattr(service, "db", fake_db_submitted)
    with pytest.raises(ValueError, match="submitted and locked"):
        await service.can_modify_supplier_ghg_record(relationship, "2025-04", "monthly")

    fake_db_unlocked = SimpleNamespace(
        supplier_ghg_submissions=_FakeSubmissionsCollection(find_one_doc={"id": "SUB_1", "status": "unlocked"}),
    )
    monkeypatch.setattr(service, "db", fake_db_unlocked)
    period = await service.can_modify_supplier_ghg_record(relationship, "2025-04", "monthly")
    assert period["period_key"] == "2025-04"


def test_auth_login_sets_http_only_cookie_and_cors_explicit_origin():
    trusted_origin = _base_url()
    login_response = requests.post(
        f"{_base_url()}/api/auth/login",
        json={"email": "goyalsomil2001@gmail.com", "password": "TestUser123!"},
        headers={"Origin": trusted_origin},
        timeout=30,
    )
    assert login_response.status_code == 200, login_response.text
    set_cookie = login_response.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie

    options_response = requests.options(
        f"{_base_url()}/api/auth/login",
        headers={
            "Origin": trusted_origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
        timeout=30,
    )
    assert options_response.status_code in (200, 204)
    assert options_response.headers.get("access-control-allow-origin") == trusted_origin
    assert options_response.headers.get("access-control-allow-credentials") == "true"


def test_auth_brute_force_lockout_after_five_invalid_attempts():
    random_email = f"iter33-lockout-{uuid.uuid4().hex[:12]}@example.com"
    statuses = []
    for _ in range(6):
        response = requests.post(
            f"{_base_url()}/api/auth/login",
            json={"email": random_email, "password": "WrongPassword123!"},
            timeout=30,
        )
        statuses.append(response.status_code)
    assert statuses[-1] == 429, f"Expected final attempt lockout 429, got {statuses}"
