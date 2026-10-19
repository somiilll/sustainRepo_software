"""Regression tests for MIS: SBTi target visibility + PDF target section + export flow."""

import os
from typing import Dict, List

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


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_backend_url()
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "goyalsomil2001@gmail.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "TestUser123!")
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
def auth_context(api_client: requests.Session, base_url: str) -> Dict:
    """Auth setup used across all SBTi/MIS checks."""
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
def sbti_targets_state(api_client: requests.Session, base_url: str, auth_context: Dict) -> Dict:
    """Fetch SBTi targets via API; fallback to DB when endpoint access is gated."""
    headers = {"Authorization": f"Bearer {auth_context['token']}"}
    response = api_client.get(f"{base_url}/api/sbti-targets", headers=headers, timeout=40)

    if response.status_code == 200:
        payload = response.json()
        targets = payload.get("targets", [])
        total = payload.get("total", len(targets))
        return {
            "source": "api",
            "status_code": 200,
            "targets": targets,
            "total": total,
        }

    if response.status_code == 403:
        assert MONGO_URL and DB_NAME, "MONGO_URL and DB_NAME are required for fallback DB inspection"
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
            "status_code": 403,
            "targets": docs,
            "total": len(docs),
        }

    pytest.fail(f"Unexpected /api/sbti-targets response: {response.status_code} {response.text}")


@pytest.fixture(scope="session")
def mis_payload() -> Dict:
    return {
        "reporting_period_start": "2026-08",
        "reporting_period_end": "2026-08",
        "facility_ids": [],
        "categories": [],
        "scopes": ["scope1", "scope2", "scope3", "biogenic"],
    }


@pytest.fixture(scope="session")
def mis_report_data(api_client: requests.Session, base_url: str, auth_context: Dict, mis_payload: Dict) -> Dict:
    """Generate executive MIS JSON payload for target-level assertions."""
    headers = {"Authorization": f"Bearer {auth_context['token']}"}
    response = api_client.post(
        f"{base_url}/api/mis-reports/executive-report",
        headers=headers,
        json=mis_payload,
        timeout=120,
    )
    assert response.status_code == 200, f"MIS executive report failed: {response.status_code} {response.text}"
    data = response.json()
    assert isinstance(data.get("targets"), list), "targets list missing from executive report"
    assert isinstance(data.get("target_summary"), dict), "target_summary missing from executive report"
    return data


@pytest.fixture(scope="session")
def mis_pdf_text(api_client: requests.Session, base_url: str, auth_context: Dict, mis_payload: Dict) -> Dict:
    """Export MIS PDF and parse full text for section/name regression checks."""
    headers = {"Authorization": f"Bearer {auth_context['token']}"}
    response = api_client.post(
        f"{base_url}/api/mis-reports/emissions-summary/export/pdf",
        headers=headers,
        json=mis_payload,
        timeout=180,
    )
    assert response.status_code == 200, f"MIS PDF export failed: {response.status_code} {response.text}"
    assert response.headers.get("content-type", "").lower().startswith("application/pdf")

    pdf_path = "/app/test_reports/iteration_154_mis_exec_2026_08.pdf"
    with open(pdf_path, "wb") as handle:
        handle.write(response.content)

    text_blocks: List[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        assert len(pdf.pages) > 0, "Exported MIS PDF has no pages"
        for page in pdf.pages:
            text_blocks.append(page.extract_text() or "")

    return {
        "pdf_path": pdf_path,
        "text": "\n".join(text_blocks),
        "page_count": len(text_blocks),
    }


def test_sbti_targets_discovery(sbti_targets_state: Dict):
    """Capture SBTi target ids/names/count and confirm discovery path."""
    assert sbti_targets_state["source"] in {"api", "db_fallback"}
    assert isinstance(sbti_targets_state["targets"], list)
    assert isinstance(sbti_targets_state["total"], int)
    if sbti_targets_state["targets"]:
        sample = sbti_targets_state["targets"][0]
        assert sample.get("target_name"), "target_name missing in discovered SBTi target"


def test_mis_report_includes_all_active_sbti_targets(sbti_targets_state: Dict, mis_report_data: Dict):
    """Each active SBTi target must be present in MIS targets with SBTi metadata mapping."""
    report_targets = mis_report_data.get("targets", [])
    report_sbti = [t for t in report_targets if t.get("section") == "sbti" and t.get("target_source") == "sbti"]
    report_by_name = {t.get("name"): t for t in report_sbti}

    for source_target in sbti_targets_state["targets"]:
        expected_name = source_target.get("target_name")
        assert expected_name in report_by_name, f"Missing SBTi target in MIS report: {expected_name}"
        mapped = report_by_name[expected_name]

        expected_type = source_target.get("target_type", "percentage")
        expected_target_value = source_target.get("target_intensity") if expected_type in {"intensity_revenue", "intensity_production"} else source_target.get("target_value")

        assert mapped.get("section") == "sbti"
        assert mapped.get("target_source") == "sbti"
        assert str(mapped.get("reporting_period", "")) == str(source_target.get("target_year", ""))
        assert mapped.get("unit") == source_target.get("unit")
        assert mapped.get("target_type") == expected_type
        assert mapped.get("target_value") == expected_target_value


def test_target_summary_and_regression_for_non_sbti_targets(mis_report_data: Dict, sbti_targets_state: Dict):
    """target_summary.active must include both ESG and SBTi targets; ESG targets remain present."""
    targets = mis_report_data.get("targets", [])
    summary = mis_report_data.get("target_summary", {})

    assert summary.get("active") == len(targets), "target_summary.active does not match total targets list"

    sbti_count = sum(1 for t in targets if t.get("section") == "sbti" and t.get("target_source") == "sbti")
    esg_count = sum(1 for t in targets if t.get("target_source") != "sbti")

    assert sbti_count == sbti_targets_state["total"], "SBTi count mismatch between discovered targets and MIS report"
    assert esg_count > 0, "Regression: non-SBTi ESG targets missing from MIS targets list"


def test_pdf_contains_sbti_subsection_and_target_details(sbti_targets_state: Dict, mis_pdf_text: Dict):
    """MIS PDF must include SBTi subsection and each discovered SBTi target name/type/year."""
    full_text = mis_pdf_text["text"]
    assert "Targets" in full_text, "Targets section missing in MIS PDF"

    if sbti_targets_state["total"] == 0:
        pytest.skip("No active SBTi targets found for this org; name-level SBTi PDF checks skipped")

    assert "SBTi Targets" in full_text, "SBTi Targets subsection missing in MIS PDF"

    for source_target in sbti_targets_state["targets"]:
        name = source_target.get("target_name")
        target_year = str(source_target.get("target_year", ""))
        term_type = (source_target.get("term_type") or "").replace("_", " ").title()

        assert name in full_text, f"SBTi target name missing in PDF: {name}"
        if term_type:
            assert f"SBTi {term_type} Target" in full_text, f"SBTi term type label missing for: {name}"
        if target_year:
            assert target_year in full_text, f"Target year missing in PDF for: {name}"


def test_pdf_generated_for_visual_legend_review(mis_pdf_text: Dict):
    """Ensure PDF artifact is available for manual visual legend overlap review."""
    assert mis_pdf_text["page_count"] > 0
    assert os.path.exists(mis_pdf_text["pdf_path"]), "Expected PDF artifact not found for visual review"
