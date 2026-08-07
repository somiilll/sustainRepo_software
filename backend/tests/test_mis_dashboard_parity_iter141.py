"""MIS vs dashboard parity diagnostics for FY 2026-04 to 2027-03."""

import json
import os
from collections import Counter

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
PASSWORD = "TestUser123!"
START_PERIOD = "2026-04"
END_PERIOD = "2027-03"
OUT_PATH = "/app/test_reports/mis_dashboard_parity_iter141_diagnostics.json"


@pytest.fixture(scope="session")
def api_client():
    """HTTP session for external preview API checks."""
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def admin_headers(api_client):
    """Authenticate admin and return bearer header."""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": PASSWORD},
        timeout=45,
    )
    assert response.status_code == 200
    payload = response.json()
    token = payload.get("token") or payload.get("access_token")
    assert isinstance(token, str) and len(token) > 20
    return {"Authorization": f"Bearer {token}"}


def _get(api_client, headers, path, params=None):
    resp = api_client.get(f"{BASE_URL}{path}", headers=headers, params=params, timeout=60)
    assert resp.status_code == 200, f"{path} failed: {resp.status_code} {resp.text[:300]}"
    return resp.json()


def _post(api_client, headers, path, payload):
    resp = api_client.post(f"{BASE_URL}{path}", headers=headers, json=payload, timeout=90)
    assert resp.status_code == 200, f"{path} failed: {resp.status_code} {resp.text[:300]}"
    return resp.json()


# Modules tested: MIS report aggregation, dashboard stats/metrics parity, and ESG environment record filters.
def test_mis_dashboard_parity_diagnostics(api_client, admin_headers):
    filter_schema = _get(api_client, admin_headers, "/api/mis-reports/filter-schema")
    mis_facilities = filter_schema.get("facilities", [])
    mis_facility_ids = [f.get("id") for f in mis_facilities if f.get("id")]

    facilities = _get(api_client, admin_headers, "/api/facilities")
    facilities_by_id = {f.get("id"): f for f in facilities if f.get("id")}
    active_facility_ids = [f.get("id") for f in facilities if f.get("is_active") is not False and f.get("id")]
    inactive_facility_ids = [f.get("id") for f in facilities if f.get("is_active") is False and f.get("id")]

    payload = {
        "reporting_period_start": START_PERIOD,
        "reporting_period_end": END_PERIOD,
        "facility_ids": mis_facility_ids,
        "scopes": ["scope1", "scope2", "scope3", "biogenic"],
        "categories": [],
    }

    mis_exec = _post(api_client, admin_headers, "/api/mis-reports/executive-report", payload)
    mis_summary = _post(api_client, admin_headers, "/api/mis-reports/emissions-summary", payload)

    metrics_params = {
        "start_date": START_PERIOD,
        "end_date": END_PERIOD,
        "facility_ids": ",".join(mis_facility_ids),
    }
    dashboard_metrics = _get(api_client, admin_headers, "/api/esg-records/dashboard-metrics", params=metrics_params)
    dashboard_metrics_no_facility_filter = _get(
        api_client,
        admin_headers,
        "/api/esg-records/dashboard-metrics",
        params={"start_date": START_PERIOD, "end_date": END_PERIOD},
    )

    stats_params = [("start_period", START_PERIOD), ("end_period", END_PERIOD)]
    stats_params.extend([("facility_id", fid) for fid in mis_facility_ids])
    dashboard_stats = _get(api_client, admin_headers, "/api/dashboard/stats", params=stats_params)

    env_detail = _get(
        api_client,
        admin_headers,
        "/api/dashboard/environment-detail",
        params={
            "start_date": START_PERIOD,
            "end_date": END_PERIOD,
            "facility_ids": ",".join(mis_facility_ids),
        },
    )
    env_detail_no_facility_filter = _get(
        api_client,
        admin_headers,
        "/api/dashboard/environment-detail",
        params={"start_date": START_PERIOD, "end_date": END_PERIOD},
    )
    esg_analytics = _get(
        api_client,
        admin_headers,
        "/api/dashboard/esg-analytics",
        params={
            "start_date": START_PERIOD,
            "end_date": END_PERIOD,
            "facility_ids": ",".join(mis_facility_ids),
        },
    )
    esg_analytics_no_facility_filter = _get(
        api_client,
        admin_headers,
        "/api/dashboard/esg-analytics",
        params={"start_date": START_PERIOD, "end_date": END_PERIOD},
    )

    water_recycle_records = _get(
        api_client,
        admin_headers,
        "/api/esg-records/records/environment",
        params={
            "category": "Water",
            "subcategory": "Recycle",
            "limit": 100,
            "page": 1,
            "include_imported": "false",
        },
    )
    waste_records = _get(
        api_client,
        admin_headers,
        "/api/esg-records/records/environment",
        params={
            "category": "Waste",
            "limit": 100,
            "page": 1,
            "include_imported": "false",
        },
    )

    recycle_rows = water_recycle_records.get("records", [])
    recycle_status_counter = Counter((r.get("approval_status") or "null") for r in recycle_rows)
    recycle_field_keys = sorted({k for r in recycle_rows for k in (r.get("field_values") or {}).keys()})

    waste_rows = waste_records.get("records", [])
    waste_status_counter = Counter((r.get("approval_status") or "null") for r in waste_rows)
    waste_field_keys = sorted({k for r in waste_rows for k in (r.get("field_values") or {}).keys()})
    waste_subcategories = Counter((r.get("subcategory") or "") for r in waste_rows)

    mis_total = float((mis_exec.get("current") or {}).get("total_emissions") or 0)
    dashboard_total = float(dashboard_stats.get("total_emissions") or 0)

    diagnostics = {
        "period": {"start": START_PERIOD, "end": END_PERIOD},
        "facility_scope": {
            "mis_filter_schema_count": len(mis_facility_ids),
            "mis_filter_schema_ids": sorted(mis_facility_ids),
            "facilities_endpoint_total": len(facilities_by_id),
            "facilities_endpoint_active_count": len(active_facility_ids),
            "facilities_endpoint_inactive_count": len(inactive_facility_ids),
            "inactive_facility_ids": sorted(inactive_facility_ids),
            "mis_minus_facilities_endpoint": sorted(set(mis_facility_ids) - set(facilities_by_id.keys())),
            "facilities_endpoint_minus_mis": sorted(set(facilities_by_id.keys()) - set(mis_facility_ids)),
        },
        "emissions_comparison": {
            "mis_executive_current_total": round(mis_total, 4),
            "mis_emissions_summary_total": round(float(mis_summary.get("total_emissions") or 0), 4),
            "dashboard_stats_total": round(dashboard_total, 4),
            "absolute_gap_dashboard_minus_mis": round(dashboard_total - mis_total, 4),
            "dashboard_monthly_trend_total_sum": round(
                sum(float(row.get("total") or 0) for row in dashboard_stats.get("emissions_trend", [])), 4
            ),
            "dashboard_non_monthly_contribution_estimate": round(
                dashboard_total
                - sum(float(row.get("total") or 0) for row in dashboard_stats.get("emissions_trend", [])),
                4,
            ),
            "dashboard_yearly_facility_analysis": dashboard_stats.get("yearly_facility_analysis", []),
            "dashboard_yearly_fuel_analysis": dashboard_stats.get("yearly_fuel_analysis", []),
            "dashboard_monthly_trend_rows": len(dashboard_stats.get("emissions_trend", [])),
            "mis_period_breakdown_rows": len((mis_exec.get("current") or {}).get("period_breakdown", [])),
        },
        "water_comparison": {
            "mis_water": mis_exec.get("water", {}),
            "dashboard_metrics_water": dashboard_metrics.get("water", {}),
            "dashboard_metrics_water_no_facility_filter": dashboard_metrics_no_facility_filter.get("water", {}),
            "dashboard_esg_analytics_water_totals": {
                "withdrawn": round(sum(float(r.get("withdrawn") or 0) for r in esg_analytics.get("water", [])), 2),
                "consumed": round(sum(float(r.get("consumed") or 0) for r in esg_analytics.get("water", [])), 2),
                "discharged": round(sum(float(r.get("discharged") or 0) for r in esg_analytics.get("water", [])), 2),
                "recycled": round(sum(float(r.get("recycled") or 0) for r in esg_analytics.get("water", [])), 2),
            },
            "dashboard_esg_analytics_water_totals_no_facility_filter": {
                "withdrawn": round(sum(float(r.get("withdrawn") or 0) for r in esg_analytics_no_facility_filter.get("water", [])), 2),
                "consumed": round(sum(float(r.get("consumed") or 0) for r in esg_analytics_no_facility_filter.get("water", [])), 2),
                "discharged": round(sum(float(r.get("discharged") or 0) for r in esg_analytics_no_facility_filter.get("water", [])), 2),
                "recycled": round(sum(float(r.get("recycled") or 0) for r in esg_analytics_no_facility_filter.get("water", [])), 2),
            },
            "water_detail_sources": env_detail.get("water_sources", []),
            "water_detail_sources_no_facility_filter": env_detail_no_facility_filter.get("water_sources", []),
            "water_recycle_records_total": water_recycle_records.get("total", len(recycle_rows)),
            "water_recycle_records_approval_status_counts": dict(recycle_status_counter),
            "water_recycle_field_keys_present": recycle_field_keys,
        },
        "waste_comparison": {
            "mis_waste": mis_exec.get("waste", {}),
            "dashboard_metrics_waste": dashboard_metrics.get("waste", {}),
            "dashboard_metrics_waste_no_facility_filter": dashboard_metrics_no_facility_filter.get("waste", {}),
            "dashboard_esg_analytics_waste_totals": {
                "generated": round(sum(float(r.get("generated") or 0) for r in esg_analytics.get("waste", [])), 2),
                "recovered": round(sum(float(r.get("recovered") or 0) for r in esg_analytics.get("waste", [])), 2),
                "disposed": round(sum(float(r.get("disposed") or 0) for r in esg_analytics.get("waste", [])), 2),
            },
            "dashboard_esg_analytics_waste_totals_no_facility_filter": {
                "generated": round(sum(float(r.get("generated") or 0) for r in esg_analytics_no_facility_filter.get("waste", [])), 2),
                "recovered": round(sum(float(r.get("recovered") or 0) for r in esg_analytics_no_facility_filter.get("waste", [])), 2),
                "disposed": round(sum(float(r.get("disposed") or 0) for r in esg_analytics_no_facility_filter.get("waste", [])), 2),
            },
            "environment_detail_hazardous": env_detail.get("hazardous_waste", {}),
            "environment_detail_non_hazardous": env_detail.get("non_hazardous_waste", {}),
            "waste_records_total": waste_records.get("total", len(waste_rows)),
            "waste_records_approval_status_counts": dict(waste_status_counter),
            "waste_subcategory_counts": dict(waste_subcategories),
            "waste_field_keys_present": waste_field_keys,
        },
        "energy_comparison": {
            "mis_energy": mis_exec.get("energy", {}),
            "dashboard_metrics_energy": dashboard_metrics.get("energy", {}),
            "dashboard_metrics_energy_no_facility_filter": dashboard_metrics_no_facility_filter.get("energy", {}),
            "dashboard_esg_analytics_energy_totals": {
                "renewable": round(sum(float(r.get("renewable") or 0) for r in esg_analytics.get("energy", [])), 2),
                "non_renewable": round(sum(float(r.get("nonRenewable") or 0) for r in esg_analytics.get("energy", [])), 2),
            },
            "dashboard_esg_analytics_energy_totals_no_facility_filter": {
                "renewable": round(sum(float(r.get("renewable") or 0) for r in esg_analytics_no_facility_filter.get("energy", [])), 2),
                "non_renewable": round(sum(float(r.get("nonRenewable") or 0) for r in esg_analytics_no_facility_filter.get("energy", [])), 2),
            },
            "dashboard_esg_analytics_energy_renewable_pct": round(
                (
                    sum(float(r.get("renewable") or 0) for r in esg_analytics.get("energy", []))
                    /
                    (
                        sum(float(r.get("renewable") or 0) for r in esg_analytics.get("energy", []))
                        + sum(float(r.get("nonRenewable") or 0) for r in esg_analytics.get("energy", []))
                    )
                    * 100
                )
                if (
                    sum(float(r.get("renewable") or 0) for r in esg_analytics.get("energy", []))
                    + sum(float(r.get("nonRenewable") or 0) for r in esg_analytics.get("energy", []))
                )
                else 0,
                2,
            ),
            "dashboard_esg_analytics_energy_renewable_pct_no_facility_filter": round(
                (
                    sum(float(r.get("renewable") or 0) for r in esg_analytics_no_facility_filter.get("energy", []))
                    /
                    (
                        sum(float(r.get("renewable") or 0) for r in esg_analytics_no_facility_filter.get("energy", []))
                        + sum(float(r.get("nonRenewable") or 0) for r in esg_analytics_no_facility_filter.get("energy", []))
                    )
                    * 100
                )
                if (
                    sum(float(r.get("renewable") or 0) for r in esg_analytics_no_facility_filter.get("energy", []))
                    + sum(float(r.get("nonRenewable") or 0) for r in esg_analytics_no_facility_filter.get("energy", []))
                )
                else 0,
                2,
            ),
        },
        "supplier_assessment": {
            "mis_supplier_assessment": mis_exec.get("supplier_assessment", {}),
        },
    }

    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(diagnostics, fp, indent=2)

    print(json.dumps(diagnostics, indent=2))

    assert len(mis_facility_ids) > 0
    assert "energy" in mis_exec and "water" in mis_exec and "waste" in mis_exec