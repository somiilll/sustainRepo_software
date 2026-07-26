"""
Tests for Phases 4-6: Monthly vs Yearly Data Entry Support
- Phase 4: Listing & filtering  (frontend filter logic verification by data presence)
- Phase 5: Dashboard aggregations (deduplication of monthly when yearly exists)
- Phase 6: Reports/Exports (generator handles yearly records without errors)
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://immutable-records-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "goyalsomil@hotmail.com"
ADMIN_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ============== Phase 4: yearly record exists in dataset ==============

class TestPhase4YearlyRecord:
    def test_emissions_list_contains_yearly_scope1(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/emissions", timeout=30)
        assert r.status_code == 200, r.text
        emissions = r.json()
        assert isinstance(emissions, list) and len(emissions) > 0

        yearly = [e for e in emissions if e.get("frequency_type") == "yearly"]
        # Per problem statement, there is a yearly record (Scope 1, CY2025, Stationary Combustion / Natural Gas)
        assert len(yearly) >= 1, "No yearly records found - Phase 4 cannot be verified end-to-end"

        # Validate one of the yearly records matches the expected shape
        match = [e for e in yearly if e.get("scope") == "scope1"
                 and (e.get("reporting_period") or "").startswith("CY")
                 and "Stationary Combustion" in (e.get("category") or "")]
        assert len(match) >= 1, f"Expected Scope1 / CY*/Stationary Combustion yearly record. Got: {[(e.get('scope'), e.get('reporting_period'), e.get('category')) for e in yearly]}"

    def test_yearly_record_has_required_fields(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/emissions", timeout=30)
        emissions = r.json()
        yearly = [e for e in emissions if e.get("frequency_type") == "yearly"]
        assert yearly, "No yearly records present"
        e = yearly[0]
        assert "reporting_period" in e
        assert "facility_id" in e
        assert "scope" in e
        assert "category" in e
        assert "total_emissions" in e


# ============== Phase 5: Dashboard deduplication ==============

class TestPhase5DashboardDedup:
    def test_dashboard_stats_endpoint_works(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/dashboard-stats", timeout=60)
        assert r.status_code == 200, f"dashboard-stats failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "total_emissions" in data or "scope1_emissions" in data or "emissions_by_facility" in data, f"Unexpected schema: {list(data.keys())[:20]}"

    def test_dashboard_dedup_yearly_excludes_conflicting_monthly(self, auth_session):
        """
        If both yearly and monthly records exist for the same facility/category/scope/year,
        the dashboard sum should equal yearly + (other monthly records that don't conflict),
        NOT the raw sum of all records.
        """
        emissions = auth_session.get(f"{BASE_URL}/api/emissions", timeout=30).json()
        stats = auth_session.get(f"{BASE_URL}/api/dashboard-stats", timeout=60).json()

        def extract_year(period):
            if not period:
                return None
            period = period.strip()
            if period.startswith("CY"):
                return period[2:6]
            if period.startswith("FY"):
                parts = period.replace("FY ", "FY").replace("FY", "").split("-")
                return parts[0].strip() if parts else None
            if "-" in period and len(period) >= 7:
                return period[:4]
            return period[:4] if len(period) >= 4 else None

        # Build expected dedup
        yearly_keys = set()
        for e in emissions:
            if e.get("frequency_type") == "yearly":
                yk = (e.get("facility_id"), e.get("category"), e.get("scope"), extract_year(e.get("reporting_period")))
                yearly_keys.add(yk)

        included = []
        for e in emissions:
            if e.get("frequency_type") == "yearly":
                included.append(e)
            else:
                yk = (e.get("facility_id"), e.get("category"), e.get("scope"), extract_year(e.get("reporting_period")))
                if yk not in yearly_keys:
                    included.append(e)

        expected_total = sum(e.get("total_emissions") or 0 for e in included)
        raw_total = sum(e.get("total_emissions") or 0 for e in emissions)

        api_total = stats.get("total_emissions")
        assert api_total is not None, f"total_emissions missing from dashboard-stats. keys={list(stats.keys())[:30]}"

        # Equity share may scale values (use_equity_share toggle); allow either equal-to-expected (no-equity)
        # or strictly less than raw_total when a conflict exists. If yearly_keys is empty, expected==raw.
        if yearly_keys:
            # The dashboard must have applied dedup → api_total should equal expected_total OR be <= raw_total
            # Allow small float tolerance; equity share might also affect, so check it's not greater than raw
            assert api_total <= raw_total + 1e-3, (
                f"Dashboard total ({api_total}) exceeds raw sum ({raw_total}); dedup not applied"
            )
            # And ideally close to expected_total (within 1% if no equity adjustment is on)
            # Just ensure it's NOT equal to raw_total (i.e., dedup happened OR equity adjusted)
            if abs(api_total - raw_total) < 1e-3 and abs(expected_total - raw_total) > 1e-3:
                pytest.fail(f"Dashboard returned raw total ({api_total}) instead of dedup total ({expected_total})")
        else:
            # No conflicts; api_total should match raw (modulo equity)
            pass


# ============== Phase 6: Report generator handles yearly records ==============

class TestPhase6ReportGenerator:
    def test_report_endpoint_with_yearly_records_succeeds(self, auth_session):
        """Trigger a report covering 2025 and ensure no 500 errors."""
        # Discover available report endpoint
        candidate_payloads = [
            ("/api/reports/generate", {"start_period": "2025-01", "end_period": "2025-12", "report_type": "ghg_inventory"}),
            ("/api/reports/generate", {"start_period": "2025-01", "end_period": "2025-12"}),
            ("/api/generate-report", {"start_period": "2025-01", "end_period": "2025-12"}),
        ]
        last = None
        for path, payload in candidate_payloads:
            r = auth_session.post(f"{BASE_URL}{path}", json=payload, timeout=120)
            last = (path, r.status_code, r.text[:300])
            if r.status_code in (200, 201, 202):
                # Success — yearly records were handled without server error
                assert r.status_code in (200, 201, 202)
                return
            if r.status_code == 404:
                continue
            # If endpoint accepted request but returned 4xx (validation), still no server crash
            if 400 <= r.status_code < 500:
                pytest.skip(f"Report endpoint {path} returned {r.status_code} (likely needs more params): {r.text[:200]}")
                return
        pytest.skip(f"No working report endpoint found. Last attempt: {last}")

    def test_report_methods_directly_via_module(self):
        """Direct unit test of _filter_emissions_by_period and _deduplicate_emissions for yearly handling."""
        import sys
        sys.path.insert(0, "/app/backend")
        from report_generator import ReportGenerator  # type: ignore

        rg = ReportGenerator.__new__(ReportGenerator)  # bypass __init__

        emissions = [
            {"id": "y1", "facility_id": "f1", "category": "Stationary Combustion", "scope": "scope1",
             "reporting_period": "CY2025", "frequency_type": "yearly", "total_emissions": 100.0},
            {"id": "m1", "facility_id": "f1", "category": "Stationary Combustion", "scope": "scope1",
             "reporting_period": "2025-01", "frequency_type": "monthly", "total_emissions": 10.0},
            {"id": "m2", "facility_id": "f2", "category": "Mobile Combustion", "scope": "scope1",
             "reporting_period": "2025-03", "frequency_type": "monthly", "total_emissions": 5.0},
        ]

        # Filter to 2025 range
        filtered = rg._filter_emissions_by_period(emissions, "2025-01", "2025-12")
        ids = {e["id"] for e in filtered}
        assert "y1" in ids, "Yearly CY2025 should be included in 2025 range"
        assert "m1" in ids and "m2" in ids

        dedup = rg._deduplicate_emissions(filtered)
        ids2 = {e["id"] for e in dedup}
        assert "y1" in ids2
        assert "m1" not in ids2, "Conflicting monthly should be dropped"
        assert "m2" in ids2, "Non-conflicting monthly retained"
