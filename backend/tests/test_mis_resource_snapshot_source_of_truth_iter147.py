"""Pure MIS tests for dashboard-metrics-only resource snapshot wiring."""

from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.mis_reports import service as mis_service


class _FakeDashboardService:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def get_dashboard_metrics(self, org_id, facility_ids=None, financial_year=None, start_date=None, end_date=None):
        self.calls.append(
            {
                "org_id": org_id,
                "facility_ids": facility_ids,
                "financial_year": financial_year,
                "start_date": start_date,
                "end_date": end_date,
            }
        )
        return self.payload


# Module: MIS build_resource_snapshot single source-of-truth dashboard wiring
@pytest.mark.asyncio
async def test_build_resource_snapshot_calls_dashboard_metrics_and_maps_resources(monkeypatch):
    dashboard_payload = {
        "energy": {"total": 240.0, "renewable_total": 60.0, "non_renewable": 180.0},
        "water": {"consumption": 90.0, "withdrawal": 110.0, "totalinput": 200.0, "recycled": 40.0},
        # Intentionally inconsistent breakdown to ensure MIS does not recalculate totals.
        "waste": {
            "generated": 100.0,
            "recovered": 35.0,
            "disposal": 65.0,
            "hazardous_generated": 70.0,
            "non_hazardous_generated": 50.0,
        },
    }
    fake_service = _FakeDashboardService(dashboard_payload)

    monkeypatch.setattr(mis_service, "get_dashboard_metrics_service", lambda _db: fake_service)

    snapshot = await mis_service.build_resource_snapshot(
        "org-1",
        ["fac-1", "fac-2"],
        {"reporting_period_start": "2026-04", "reporting_period_end": "2026-08"},
    )

    assert len(fake_service.calls) == 1
    assert fake_service.calls[0] == {
        "org_id": "org-1",
        "facility_ids": ["fac-1", "fac-2"],
        "financial_year": None,
        "start_date": "2026-04",
        "end_date": "2026-08",
    }

    assert snapshot["energy"]["total"] == 240.0
    assert snapshot["water"]["totalinput"] == 200.0
    assert snapshot["waste"]["generated"] == 100.0
    assert snapshot["waste"]["hazardous_generated"] == 70.0
    assert snapshot["waste"]["non_hazardous_generated"] == 50.0

    # Derived percentages must use dashboard section data only.
    assert snapshot["energy"]["renewable_pct"] == 25.0
    assert snapshot["water"]["recycle_pct"] == 20.0


# Module: MIS build_resource_snapshot must not use environment detail / recycled-water overrides
@pytest.mark.asyncio
async def test_build_resource_snapshot_does_not_call_environment_detail_or_recycled_water_override(monkeypatch):
    fake_service = _FakeDashboardService(
        {
            "energy": {"total": 0.0, "renewable_total": 9999.0},
            "water": {"recycled": 12.0, "totalinput": 0.0},
            "waste": {"generated": 5.0, "recovered": 1.0},
        }
    )

    async def _explode(*_args, **_kwargs):
        raise AssertionError("Forbidden call path executed")

    monkeypatch.setattr(mis_service, "get_dashboard_metrics_service", lambda _db: fake_service)
    monkeypatch.setattr(mis_service, "get_environment_detail", _explode)
    monkeypatch.setattr(mis_service, "dashboard_recycled_water", _explode)

    snapshot = await mis_service.build_resource_snapshot(
        "org-2",
        None,
        {"reporting_period_start": "2026-01", "reporting_period_end": "2026-03"},
    )

    # water recycle_pct guards division by zero and only uses dashboard water values.
    assert snapshot["water"]["recycle_pct"] == 0
    # energy renewable_pct uses dashboard energy values, guarded by total=0.
    assert snapshot["energy"]["renewable_pct"] == 0
    # no recomputation of waste totals
    assert snapshot["waste"]["generated"] == 5.0
