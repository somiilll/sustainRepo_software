"""Iteration 153: Backend integration tests for MIS Executive Summary v2 (Page 2 redesign).

Tests /api/mis-reports/executive-report endpoint's `executive_summary` payload
and PDF export at /api/mis-reports/emissions-summary/export/pdf.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASS = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tk = data.get("access_token") or data.get("token")
    assert tk, f"no access_token in login response: {list(data.keys())}"
    return tk


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def exec_report(headers):
    payload = {
        "reporting_period_start": "2026-08",
        "reporting_period_end": "2026-08",
    }
    r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=payload, headers=headers, timeout=120)
    assert r.status_code == 200, f"executive-report failed: {r.status_code} {r.text[:500]}"
    return r.json()


# ─── Section: Structure ──────────────────────────────────────────────────────

class TestExecSummaryStructure:
    def test_executive_summary_present(self, exec_report):
        assert "executive_summary" in exec_report, f"Missing executive_summary. Keys: {list(exec_report.keys())}"
        es = exec_report["executive_summary"]
        assert "current_month_label" in es
        assert "previous_month_label" in es
        assert "sections" in es
        assert isinstance(es["sections"], list)

    def test_month_labels_no_forbidden_terms(self, exec_report):
        es = exec_report["executive_summary"]
        for label in [es["current_month_label"], es["previous_month_label"]]:
            for bad in ["MTD", "YTD", " FY", " CY"]:
                assert bad not in label, f"forbidden term {bad!r} in label {label!r}"

    def test_five_sections_default(self, exec_report):
        es = exec_report["executive_summary"]
        titles = [s["title"] for s in es["sections"]]
        expected = ["GHG Emissions", "Energy Consumption", "Water", "Waste", "Social & Governance"]
        assert titles == expected, f"Expected sections {expected}, got {titles}"


# ─── Section: Metric counts ──────────────────────────────────────────────────

def _sec(es, key):
    for s in es["sections"]:
        if s["key"] == key:
            return s
    raise AssertionError(f"section {key} not found")


class TestSectionContent:
    def test_ghg_metrics(self, exec_report):
        s = _sec(exec_report["executive_summary"], "ghg")
        names = [m["name"] for m in s["metrics"]]
        assert names == ["Scope 1", "Scope 2", "Scope 3", "Biogenic", "Intensity by Production", "Intensity by Revenue"]

    def test_energy_metrics(self, exec_report):
        s = _sec(exec_report["executive_summary"], "energy")
        names = [m["name"] for m in s["metrics"]]
        assert names == ["Renewable Energy", "Non-Renewable Energy", "Intensity by Production", "Intensity by Revenue"]

    def test_water_metrics(self, exec_report):
        s = _sec(exec_report["executive_summary"], "water")
        names = [m["name"] for m in s["metrics"]]
        assert names == ["Consumption", "Withdrawal", "Discharge", "Recycle"]

    def test_waste_metrics(self, exec_report):
        s = _sec(exec_report["executive_summary"], "waste")
        names = [m["name"] for m in s["metrics"]]
        assert names == ["Generated", "Disposed", "Recycled"]

    def test_social_governance_metrics(self, exec_report):
        s = _sec(exec_report["executive_summary"], "social_governance")
        names = [m["name"] for m in s["metrics"]]
        assert names == ["LTIFR", "Account Payable Days", "Number of Incidents"]
        ib = s.get("incident_breakdown")
        assert ib is not None, "incident_breakdown missing"
        for k in ["safety_incidents", "data_breaches", "violations"]:
            assert k in ib, f"incident_breakdown missing {k}"


# ─── Section: Metric object schema ────────────────────────────────────────────

REQUIRED_METRIC_KEYS = {"name", "current", "previous", "unit", "text", "variance_pct", "color"}
FORBIDDEN_RE = re.compile(r"\b(MTD|YTD|FY|CY)\b")


class TestMetricSchema:
    def test_all_metrics_have_required_keys(self, exec_report):
        for section in exec_report["executive_summary"]["sections"]:
            for m in section["metrics"]:
                missing = REQUIRED_METRIC_KEYS - set(m.keys())
                assert not missing, f"{section['key']}/{m.get('name')} missing keys: {missing}"

    def test_no_forbidden_terms_in_insights(self, exec_report):
        for section in exec_report["executive_summary"]["sections"]:
            for m in section["metrics"]:
                text = m.get("text") or ""
                assert not FORBIDDEN_RE.search(text), f"forbidden term in {section['key']}/{m['name']}: {text!r}"

    def test_incident_count_is_integer(self, exec_report):
        s = _sec(exec_report["executive_summary"], "social_governance")
        inc_metric = next(m for m in s["metrics"] if m["name"] == "Number of Incidents")
        cur = inc_metric["current"]
        # Should be int (not float like 4.0). Allow None/0.
        if cur is not None:
            assert isinstance(cur, int) or (isinstance(cur, float) and cur.is_integer()), (
                f"incident current not integer: {cur!r} type={type(cur).__name__}"
            )
            # Stricter: expect int type per spec
            assert isinstance(cur, int), f"incident current should be int, got {type(cur).__name__}: {cur}"

    def test_units_correct(self, exec_report):
        es = exec_report["executive_summary"]
        for m in _sec(es, "ghg")["metrics"][:4]:
            assert m["unit"] == "tCO2e", f"GHG scope unit wrong: {m['name']}={m['unit']}"
        assert _sec(es, "ghg")["metrics"][4]["unit"].startswith("tCO2e/")
        assert _sec(es, "ghg")["metrics"][5]["unit"].startswith("tCO2e/")

        for m in _sec(es, "energy")["metrics"][:2]:
            assert m["unit"] == "MWh", f"Energy unit wrong: {m}"
        for m in _sec(es, "water")["metrics"]:
            assert m["unit"] == "KL", f"Water unit wrong: {m}"
        for m in _sec(es, "waste")["metrics"]:
            assert m["unit"] == "kg", f"Waste unit wrong: {m}"

        sg = _sec(es, "social_governance")["metrics"]
        assert sg[1]["unit"] == "days"
        assert sg[2]["unit"] == "count"


# ─── Section: Insight logic outputs ──────────────────────────────────────────

class TestInsightLogic:
    def test_all_insights_are_strings(self, exec_report):
        for section in exec_report["executive_summary"]["sections"]:
            for m in section["metrics"]:
                assert isinstance(m["text"], str) and len(m["text"]) > 0

    def test_color_values_valid(self, exec_report):
        allowed = {"green", "red", "amber", "grey"}
        for section in exec_report["executive_summary"]["sections"]:
            for m in section["metrics"]:
                assert m["color"] in allowed, f"invalid color {m['color']!r} for {section['key']}/{m['name']}"

    def test_zero_or_null_handling(self, exec_report):
        """No metric with current=0 should produce 'inf%' or nonsense text."""
        for section in exec_report["executive_summary"]["sections"]:
            for m in section["metrics"]:
                assert "inf" not in m["text"].lower(), f"inf in text {m}"
                if m["current"] is None:
                    assert "No data available" in m["text"], f"expected 'No data available' for None current: {m}"
                elif m["current"] == 0 and m["variance_pct"] == -100.0:
                    assert "Decreased to 0" in m["text"], f"expected 'Decreased to 0' text: {m}"


# ─── Section: PDF export ─────────────────────────────────────────────────────

class TestPDFExport:
    def test_pdf_export_returns_valid_pdf(self, headers):
        payload = {
            "reporting_period_start": "2026-08",
            "reporting_period_end": "2026-08",
        }
        r = requests.post(
            f"{BASE_URL}/api/mis-reports/emissions-summary/export/pdf",
            json=payload, headers=headers, timeout=180,
        )
        assert r.status_code == 200, f"PDF export failed: {r.status_code} {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        assert r.content[:4] == b"%PDF", f"invalid PDF header: {r.content[:20]!r}"
        assert len(r.content) > 5000, f"PDF too small: {len(r.content)} bytes"


# ─── Section: Section filter ─────────────────────────────────────────────────

class TestSectionFilter:
    def test_ghg_only_selected(self, headers):
        payload = {
            "reporting_period_start": "2026-08",
            "reporting_period_end": "2026-08",
            "selected_sections": ["ghg"],
        }
        r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=payload, headers=headers, timeout=120)
        assert r.status_code == 200, r.text[:300]
        es = r.json().get("executive_summary")
        assert es is not None
        keys = [s["key"] for s in es["sections"]]
        # ghg selected always includes energy per code; but water/waste/social should be absent
        assert "ghg" in keys
        assert "water" not in keys
        assert "waste" not in keys
        assert "social_governance" not in keys
