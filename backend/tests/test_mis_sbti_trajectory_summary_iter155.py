"""Regression tests for MIS Targets SBTi trajectory summary table (Aug 2026 PDF)."""

# Module under test: MIS Reports (SBTi target mapping + PDF Targets section rendering)

import os
import re
from typing import Any, Dict, List, Tuple

import pdfplumber
import pytest
import requests
from pymongo import MongoClient


def _read_frontend_backend_url() -> str | None:
    env_path = "/app/frontend/.env"
    if not os.path.exists(env_path):
        return None
    with open(env_path, "r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if key.strip() == "REACT_APP_BACKEND_URL":
                return value.strip()
    return None


def _read_admin_credentials() -> Tuple[str | None, str | None]:
    creds_path = "/app/memory/test_credentials.md"
    if not os.path.exists(creds_path):
        return None, None

    email = None
    password = None
    with open(creds_path, "r", encoding="utf-8") as handle:
        text = handle.read()

    # Prefer the first listed Admin Account block
    email_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Email\*\*:\s*([^\n]+)", text)
    pass_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Password\*\*:\s*([^\n]+)", text)
    if email_match:
        email = email_match.group(1).strip()
    if pass_match:
        password = pass_match.group(1).strip()
    return email, password


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_backend_url()
ADMIN_EMAIL_FROM_FILE, ADMIN_PASSWORD_FROM_FILE = _read_admin_credentials()
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL") or ADMIN_EMAIL_FROM_FILE
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD") or ADMIN_PASSWORD_FROM_FILE
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="session")
def base_url() -> str:
    assert BASE_URL, "REACT_APP_BACKEND_URL is required"
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_context(api_client: requests.Session, base_url: str) -> Dict[str, Any]:
    assert ADMIN_EMAIL and ADMIN_PASSWORD, "Admin credentials not available from /app/memory/test_credentials.md or env"
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=40,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text}"
    data = response.json()
    token = data.get("access_token")
    user = data.get("user") or {}
    assert token and isinstance(token, str)
    assert user.get("organization_id"), "organization_id missing in login response"
    return {"token": token, "user": user}


@pytest.fixture(scope="session")
def active_sbti_targets(api_client: requests.Session, base_url: str, auth_context: Dict[str, Any]) -> Dict[str, Any]:
    """Get active SBTi targets from API, or DB fallback if API access is gated."""
    headers = {"Authorization": f"Bearer {auth_context['token']}"}
    response = api_client.get(f"{base_url}/api/sbti-targets", headers=headers, timeout=50)

    if response.status_code == 200:
        payload = response.json()
        targets = payload.get("targets", [])
        return {
            "source": "api",
            "status_code": response.status_code,
            "targets": targets,
            "total": payload.get("total", len(targets)),
        }

    if response.status_code in {401, 403}:
        assert MONGO_URL and DB_NAME, "MONGO_URL and DB_NAME are required for DB fallback"
        org_id = auth_context["user"]["organization_id"]
        client = MongoClient(MONGO_URL)
        try:
            docs = list(
                client[DB_NAME]["sbti_targets"].find(
                    {"organization_id": org_id, "status": "active"},
                    {"_id": 0},
                )
            )
        finally:
            client.close()

        return {
            "source": "db_fallback",
            "status_code": response.status_code,
            "targets": docs,
            "total": len(docs),
        }

    pytest.fail(f"Unexpected /api/sbti-targets response: {response.status_code} {response.text}")


@pytest.fixture(scope="session")
def mis_payload() -> Dict[str, Any]:
    return {
        "reporting_period_start": "2026-08",
        "reporting_period_end": "2026-08",
        "facility_ids": [],
        "categories": [],
        "scopes": ["scope1", "scope2", "scope3", "biogenic"],
    }


@pytest.fixture(scope="session")
def executive_report(api_client: requests.Session, base_url: str, auth_context: Dict[str, Any], mis_payload: Dict[str, Any]) -> Dict[str, Any]:
    headers = {"Authorization": f"Bearer {auth_context['token']}"}
    response = api_client.post(
        f"{base_url}/api/mis-reports/executive-report",
        headers=headers,
        json=mis_payload,
        timeout=120,
    )
    assert response.status_code == 200, f"Executive MIS payload failed: {response.status_code} {response.text}"
    data = response.json()
    assert isinstance(data.get("targets"), list), "targets missing in executive report"
    return data


@pytest.fixture(scope="session")
def exported_pdf(api_client: requests.Session, base_url: str, auth_context: Dict[str, Any], mis_payload: Dict[str, Any]) -> Dict[str, Any]:
    headers = {"Authorization": f"Bearer {auth_context['token']}"}
    response = api_client.post(
        f"{base_url}/api/mis-reports/emissions-summary/export/pdf",
        headers=headers,
        json=mis_payload,
        timeout=180,
    )
    assert response.status_code == 200, f"MIS PDF export failed: {response.status_code} {response.text}"
    assert response.headers.get("content-type", "").lower().startswith("application/pdf")
    assert response.content[:4] == b"%PDF"
    assert len(response.content) > 2000, "Exported PDF appears empty/suspiciously small"

    pdf_path = "/app/test_reports/iteration_155_mis_exec_2026_08.pdf"
    with open(pdf_path, "wb") as handle:
        handle.write(response.content)

    text_by_page: List[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        assert len(pdf.pages) > 0, "PDF has zero pages"
        for page in pdf.pages:
            text_by_page.append(page.extract_text() or "")

    return {
        "pdf_path": pdf_path,
        "text_by_page": text_by_page,
        "full_text": "\n".join(text_by_page),
    }


def _target_expected_value(source_target: Dict[str, Any], field_a: str, field_b: str | None = None) -> Any:
    if field_b is not None and source_target.get(field_b) is not None:
        return source_target.get(field_b)
    return source_target.get(field_a)


def test_active_sbti_target_discovery_and_fields(active_sbti_targets: Dict[str, Any]):
    """Ensure active SBTi targets are discoverable and key fields are present for trajectory reporting."""
    assert active_sbti_targets["source"] in {"api", "db_fallback"}
    assert isinstance(active_sbti_targets["targets"], list)
    assert isinstance(active_sbti_targets["total"], int)

    for t in active_sbti_targets["targets"]:
        assert t.get("target_name"), f"target_name missing in {t}"
        assert t.get("term_type") is not None, f"term_type missing in {t.get('target_name')}"
        assert t.get("base_year") is not None, f"base_year missing in {t.get('target_name')}"
        assert t.get("target_year") is not None, f"target_year missing in {t.get('target_name')}"
        assert t.get("unit") is not None, f"unit missing in {t.get('target_name')}"


def test_trajectory_heading_is_present_before_summary_and_cards(exported_pdf: Dict[str, Any]):
    """Validate section ordering: trajectory heading appears before Active Targets summary and target cards."""
    text = exported_pdf["full_text"]

    heading_idx = text.find("SBTi Trajectory Summary")
    summary_idx = text.find("Active Targets")
    cards_idx = text.find("SBTi Targets")

    assert heading_idx >= 0, "Missing exact heading: 'SBTi Trajectory Summary'"
    assert summary_idx >= 0, "Missing general active-target summary table label: 'Active Targets'"
    assert cards_idx >= 0, "Missing detailed SBTi target cards subsection label: 'SBTi Targets'"
    assert heading_idx < summary_idx, "Trajectory heading must appear before active-target summary"
    assert heading_idx < cards_idx, "Trajectory heading must appear before detailed SBTi cards"


def test_all_active_sbti_targets_appear_in_trajectory_summary_text(active_sbti_targets: Dict[str, Any], exported_pdf: Dict[str, Any]):
    """Every active SBTi target should be represented in the trajectory summary area with baseline/current/target cues."""
    if active_sbti_targets["total"] == 0:
        pytest.skip("No active SBTi targets available for this organization")

    text = exported_pdf["full_text"]
    # Ensure expected six-column table headers appear
    for header in ["SBTi Target", "Term", "Baseline", "Current", "Target", "Status"]:
        assert header in text, f"Trajectory table header missing: {header}"

    for source in active_sbti_targets["targets"]:
        name = source.get("target_name")
        base_year = str(source.get("base_year", ""))
        target_year = str(source.get("target_year", ""))
        term = (source.get("term_type") or "").replace("_", " ").title()

        assert name in text, f"Target name missing in trajectory summary/PDF: {name}"
        if term:
            assert term in text, f"Term label missing in trajectory summary for {name}"
        if base_year:
            assert base_year in text, f"Baseline year missing in trajectory summary for {name}"
        if target_year:
            assert target_year in text, f"Target year missing in trajectory summary for {name}"


def test_trajectory_table_page_layout_and_six_columns_fit(exported_pdf: Dict[str, Any]):
    """Locate trajectory page, validate six-column headers, and check glyph bounds fit page width."""
    pdf_path = exported_pdf["pdf_path"]
    target_page_index = -1

    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages):
            page_text = page.extract_text() or ""
            if "SBTi Trajectory Summary" in page_text:
                target_page_index = idx
                words = page.extract_words(x_tolerance=2, y_tolerance=2)
                assert words, "Trajectory page text extraction failed"
                max_right = max(word.get("x1", 0) for word in words)
                assert max_right <= page.width + 0.5, (
                    f"Detected text overflow beyond page width on trajectory page: max_right={max_right}, width={page.width}"
                )

                header_line = page_text
                for token in ["SBTi Target", "Term", "Baseline", "Current", "Target", "Status"]:
                    assert token in header_line, f"Missing column token on trajectory page: {token}"
                break

    assert target_page_index >= 0, "Could not find PDF page containing 'SBTi Trajectory Summary'"


def test_regression_detailed_cards_still_render_for_sbti_and_esg(executive_report: Dict[str, Any], exported_pdf: Dict[str, Any]):
    """Regression: detailed target cards still exist for both SBTi and non-SBTi targets."""
    targets = executive_report.get("targets", [])
    sbti_count = sum(1 for t in targets if t.get("target_source") == "sbti")
    esg_count = sum(1 for t in targets if t.get("target_source") != "sbti")

    assert sbti_count > 0, "No SBTi targets in executive report; cannot verify SBTi cards regression"
    assert esg_count > 0, "No non-SBTi ESG targets in executive report; regression risk for ESG cards"

    full_text = exported_pdf["full_text"]
    assert "SBTi Targets" in full_text, "Detailed SBTi target cards section missing"
    # General target card group labels should remain available for standard ESG targets.
    assert (
        "Environment Targets" in full_text
        or "Social Targets" in full_text
        or "Governance Targets" in full_text
    ), "Detailed standard ESG target card section labels are missing"
