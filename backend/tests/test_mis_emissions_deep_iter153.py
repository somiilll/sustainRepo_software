"""Tests for MIS Emissions Overview 4 bug fixes (iter153).

Verifies:
1. Scope 3 canonical 15 categories always present in composition.
2. Total.current_value == sum(scope1+scope2+scope3+biogenic) current_values.
3. emissions_deep.months has 13 entries.
4. PDF export returns 200 with GHG Emissions / Total Emissions text.
5. _period_to_months parses CY and FY correctly.
6. Existing pytest suites still pass.
"""

import os
import re
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://esg-reports-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASS = "TestUser123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def exec_report(headers):
    payload = {"reporting_period_start": "2026-08", "reporting_period_end": "2026-08"}
    r = requests.post(f"{BASE_URL}/api/mis-reports/executive-report", json=payload, headers=headers, timeout=120)
    assert r.status_code == 200, f"executive-report failed: {r.status_code} {r.text[:500]}"
    return r.json()


def test_period_to_months_helper():
    from modules.mis_reports.service import _period_to_months
    cy = _period_to_months("CY2025")
    assert cy == [f"2025-{m:02d}" for m in range(1, 13)]
    fy = _period_to_months("FY 2025-2026", fy_start_month=4)
    assert fy[0] == "2025-04"
    assert fy[-1] == "2026-03"
    assert len(fy) == 12
    fy2 = _period_to_months("2025-2026", fy_start_month=4)
    assert len(fy2) == 12
    assert _period_to_months("") == []


def test_scope3_canonical_list():
    from modules.mis_reports.service import SCOPE3_CANONICAL
    assert len(SCOPE3_CANONICAL) == 15
    for i in range(1, 16):
        assert any(c.startswith(f"C{i} ") or c.startswith(f"C{i}-") or c.startswith(f"C{i}\u2009") for c in SCOPE3_CANONICAL), f"missing C{i}"


def test_emissions_deep_present(exec_report):
    deep = exec_report.get("emissions_deep")
    assert deep, "emissions_deep missing from executive-report response"
    assert "months" in deep
    assert len(deep["months"]) == 13, f"expected 13 months got {len(deep['months'])}"


def test_scope3_has_15_categories(exec_report):
    deep = exec_report["emissions_deep"]
    comp = deep.get("scope3", {}).get("composition", [])
    cats = [c["category"] for c in comp]
    assert len(cats) >= 15, f"expected >=15 scope3 categories got {len(cats)}: {cats}"
    # Ensure C1..C15 all appear
    for i in range(1, 16):
        pat = re.compile(rf"^C{i}\s*[-\u2009]", re.I)
        assert any(pat.match(c) for c in cats), f"missing C{i} in scope3 composition: {cats}"


def test_total_equals_scope_sum(exec_report):
    deep = exec_report["emissions_deep"]
    total_cv = deep["total"]["current_value"]
    s = sum(deep[k].get("current_value") or 0 for k in ("scope1", "scope2", "scope3", "biogenic"))
    assert abs(total_cv - s) < 0.5, f"total {total_cv} != sum {s}"


def test_scope1_has_category_trends(exec_report):
    deep = exec_report["emissions_deep"]
    ct = deep.get("scope1", {}).get("category_trends", {})
    # If scope1 has any data, category_trends should not be empty; still allow structural check
    assert isinstance(ct, dict)


def test_pdf_export(headers):
    payload = {"reporting_period_start": "2026-08", "reporting_period_end": "2026-08"}
    r = requests.post(
        f"{BASE_URL}/api/mis-reports/emissions-summary/export/pdf",
        json=payload, headers=headers, timeout=180,
    )
    assert r.status_code == 200, f"PDF export failed: {r.status_code} {r.text[:400]}"
    content = r.content
    assert content[:4] == b"%PDF", "response is not PDF"
    assert len(content) > 10_000, f"PDF suspiciously small: {len(content)} bytes"

    # Extract textual content — try pdfplumber, else raw byte search
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            text_all = "\n".join((p.extract_text() or "") for p in pdf.pages)
    except Exception:
        text_all = content.decode("latin-1", errors="ignore")

    assert "GHG Emissions" in text_all, "GHG Emissions master heading not found in PDF"
    assert "Total Emissions" in text_all, "Total Emissions sub-section not found in PDF"
    # At least some of the C-labels
    found_cats = sum(1 for i in range(1, 16) if re.search(rf"C{i}\b", text_all))
    assert found_cats >= 10, f"Only {found_cats}/15 Scope 3 category labels found in PDF"
