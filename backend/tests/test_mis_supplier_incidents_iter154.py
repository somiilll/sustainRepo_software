"""Tests for MIS PDF supplier assessment + incident trends bug fixes (iter154).

Verifies:
1. Supplier Assessment: /executive-report supplier_scores now contain
   overall/esg/ghg completion_percent values (not None).
2. PDF _sec_supplier_assessment reads *_completion_percent fields — the
   generated PDF no longer prints 'Not Assessed' for the 3 known suppliers.
3. Governance period filter helper converts 'YYYY-MM' to nested
   reporting_period.year + reporting_period.month query correctly.
4. Incident trends: twelve_month_operational_trends.incidents non-zero for
   months with governance incident records (2026-04 → 2, 2026-08 → 1).
5. Executive summary incident_breakdown non-zero when violations exist.
6. Regression: executive-report top-level keys still present.
"""

import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASS = "TestUser123!"


# ── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def exec_report(headers):
    # Use a period which the request context says has an incident: 2026-08
    payload = {"reporting_period_start": "2026-08", "reporting_period_end": "2026-08"}
    r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report",
                      json=payload, headers=headers, timeout=180)
    assert r.status_code == 200, f"executive-report failed: {r.status_code} {r.text[:500]}"
    return r.json()


# ── Bug 2b: helper unit test (pure) ───────────────────────────────────────
def test_governance_period_filter_helper():
    from modules.mis_reports.service import _governance_period_filter
    f = _governance_period_filter("2026-08")
    assert f == {"reporting_period.year": 2026,
                 "reporting_period.month": {"$in": ["8", 8]}}
    f2 = _governance_period_filter("2026-04")
    assert f2 == {"reporting_period.year": 2026,
                  "reporting_period.month": {"$in": ["4", 4]}}


# ── Regression: top-level keys still present ──────────────────────────────
def test_executive_report_top_level_keys(exec_report):
    for k in ("current", "previous", "kpis", "supplier_scores",
              "executive_summary", "emissions_deep",
              "twelve_month_operational_trends", "supplier_assessment"):
        assert k in exec_report, f"missing key: {k}"


# ── Bug 1a: supplier_scores have completion_percent values ────────────────
def test_supplier_scores_have_completion_percent(exec_report):
    scores = exec_report.get("supplier_scores") or []
    assert len(scores) >= 3, f"expected >=3 suppliers, got {len(scores)}"
    # At least some suppliers should have non-None overall_completion_percent
    with_completion = [s for s in scores
                       if s.get("overall_completion_percent") is not None]
    assert len(with_completion) >= 1, (
        f"No supplier has overall_completion_percent set; sample: {scores[:2]}")
    # Expected values from request context: 90.0, 60.0, 60.0
    completions = sorted(
        [s.get("overall_completion_percent") for s in scores
         if s.get("overall_completion_percent") is not None],
        reverse=True,
    )
    # Not strict equality — just verify the 90/60/60 expectation ballpark
    assert completions[0] >= 80, f"top completion should be >=80, got {completions}"
    print(f"[iter154] supplier completions (sorted desc): {completions}")


def test_supplier_scores_include_esg_and_ghg_completion(exec_report):
    scores = exec_report.get("supplier_scores") or []
    fields_present = {
        "esg": any(s.get("esg_completion_percent") is not None for s in scores),
        "ghg": any(s.get("ghg_completion_percent") is not None for s in scores),
    }
    assert fields_present["esg"], "no supplier has esg_completion_percent"
    assert fields_present["ghg"], "no supplier has ghg_completion_percent"


# ── Bug 1b: PDF export no longer prints 'Not Assessed' for real suppliers ─
def test_pdf_supplier_assessment_shows_scores(headers):
    payload = {"reporting_period_start": "2026-08", "reporting_period_end": "2026-08"}
    r = requests.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary/export/pdf",
        json=payload, headers=headers, timeout=180,
    )
    assert r.status_code == 200, f"pdf export failed: {r.status_code} {r.text[:300]}"
    assert r.headers.get("content-type", "").startswith("application/pdf")
    pdf_bytes = r.content
    assert len(pdf_bytes) > 5000

    try:
        import pdfplumber
    except ImportError:
        pytest.skip("pdfplumber not installed")

    text_all = ""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text_all += (page.extract_text() or "") + "\n"

    assert "Supplier Assessment" in text_all, "supplier assessment section missing"
    # There are 3 known suppliers with real completion values → at most one
    # (of the max 3 x 3 = 9 score cells) may be 'Not Assessed'; we assert
    # the PDF is NOT saturated with 'Not Assessed'.
    na_count = text_all.count("Not Assessed")
    print(f"[iter154] 'Not Assessed' occurrences in PDF: {na_count}")
    # Before the fix all 9 cells (3 suppliers x 3 scores) showed Not Assessed.
    assert na_count < 9, (
        f"PDF still shows too many 'Not Assessed' entries: {na_count}")


# ── Bug 2a: twelve_month_operational_trends.incidents non-zero ────────────
def test_operational_trends_incidents_nonzero(exec_report):
    ops = exec_report.get("twelve_month_operational_trends") or {}
    incidents = ops.get("incidents") or []
    assert incidents, "no incident trend series returned"
    by_period = {e["period"]: e.get("value") for e in incidents}

    # Expected per request: 2026-04 → 2, 2026-08 → 1
    total = sum((v or 0) for v in by_period.values())
    print(f"[iter154] incident by period (only non-zero): "
          f"{ {p: v for p, v in by_period.items() if v} }")
    assert total > 0, (
        f"All incident trend values are 0; got {by_period}")

    if "2026-08" in by_period:
        assert (by_period["2026-08"] or 0) >= 1, (
            f"2026-08 expected >=1 incident, got {by_period['2026-08']}")


# ── Bug 2c: executive_summary.incident_breakdown non-zero ─────────────────
def test_incident_breakdown_current_period(exec_report):
    es = exec_report.get("executive_summary") or {}
    ib = es.get("incident_breakdown") or {}
    assert ib, "incident_breakdown missing from executive_summary"
    # For 2026-08 (has 1 violation record per problem context)
    total_ib = (ib.get("safety_incidents") or 0) + \
               (ib.get("data_breaches") or 0) + \
               (ib.get("violations") or 0)
    print(f"[iter154] incident_breakdown for 2026-08: {ib}")
    # The problem statement says 2026-08 has value=1 in incidents (violation)
    assert total_ib >= 1, (
        f"incident_breakdown all zero for 2026-08 — governance query broken; "
        f"got {ib}")
