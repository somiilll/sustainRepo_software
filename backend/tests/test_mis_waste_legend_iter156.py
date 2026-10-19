"""Regression checks for MIS PDF waste legend layout and export integrity (Aug 2026)."""

# Module/feature under test: MIS reports PDF export + Waste Performance grouped-bar legend placement.

import os
import re
from pathlib import Path
from typing import Dict, List, Tuple

import fitz
import pytest
import requests


def _read_frontend_backend_url() -> str | None:
    env_path = Path("/app/frontend/.env")
    if not env_path.exists():
        return None
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "REACT_APP_BACKEND_URL":
            return value.strip()
    return None


def _read_admin_credentials() -> Tuple[str | None, str | None]:
    creds_path = Path("/app/memory/test_credentials.md")
    if not creds_path.exists():
        return None, None
    text = creds_path.read_text(encoding="utf-8")
    email_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Email\*\*:\s*([^\n]+)", text)
    pass_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Password\*\*:\s*([^\n]+)", text)
    email = email_match.group(1).strip() if email_match else None
    password = pass_match.group(1).strip() if pass_match else None
    return email, password


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_backend_url()
ADMIN_EMAIL_FROM_FILE, ADMIN_PASSWORD_FROM_FILE = _read_admin_credentials()
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL") or ADMIN_EMAIL_FROM_FILE
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD") or ADMIN_PASSWORD_FROM_FILE


@pytest.fixture(scope="session")
def base_url() -> str:
    assert BASE_URL, "REACT_APP_BACKEND_URL is required (env or /app/frontend/.env)"
    return BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api_client() -> requests.Session:
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_context(api_client: requests.Session, base_url: str) -> Dict:
    assert ADMIN_EMAIL and ADMIN_PASSWORD, "Admin credentials missing in /app/memory/test_credentials.md"
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=40,
    )
    assert response.status_code == 200, f"Login failed: {response.status_code} {response.text}"
    data = response.json()
    token = data.get("access_token")
    user = data.get("user") or {}
    assert isinstance(token, str) and token
    assert user.get("organization_id")
    return {"token": token, "user": user}


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
def exported_pdf(api_client: requests.Session, base_url: str, auth_context: Dict, mis_payload: Dict) -> Dict:
    headers = {"Authorization": f"Bearer {auth_context['token']}"}
    response = api_client.post(
        f"{base_url}/api/mis-reports/emissions-summary/export/pdf",
        headers=headers,
        json=mis_payload,
        timeout=220,
    )
    assert response.status_code == 200, f"MIS PDF export failed: {response.status_code} {response.text}"
    content_type = response.headers.get("content-type", "").lower()
    assert content_type.startswith("application/pdf"), f"Unexpected content type: {content_type}"
    assert response.content[:4] == b"%PDF"
    assert len(response.content) > 2000, "Exported PDF appears empty/suspiciously small"

    pdf_path = Path("/app/test_reports/iteration_156_mis_exec_2026_08.pdf")
    pdf_path.write_bytes(response.content)
    return {"path": str(pdf_path), "size": len(response.content)}


@pytest.fixture(scope="session")
def pdf_context(exported_pdf: Dict) -> Dict:
    pdf_path = exported_pdf["path"]
    doc = fitz.open(pdf_path)
    page_texts: List[str] = [doc[i].get_text("text") or "" for i in range(doc.page_count)]

    waste_page_idx = next((idx for idx, txt in enumerate(page_texts) if "Waste Performance" in txt), None)
    hazard_trend_idx = next((idx for idx, txt in enumerate(page_texts) if "Hazardous Waste Trends" in txt), None)
    nonhaz_trend_idx = next((idx for idx, txt in enumerate(page_texts) if "Non-Hazardous Waste Trends" in txt), None)

    out_dir = Path("/app/test_reports/iteration_156_pdf_pages")
    out_dir.mkdir(parents=True, exist_ok=True)

    exported_images = []
    if waste_page_idx is not None:
        candidate_indexes = sorted(set([waste_page_idx, min(waste_page_idx + 1, doc.page_count - 1)]))
        for idx in candidate_indexes:
            pix = doc[idx].get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
            out_path = out_dir / f"waste_page_{idx + 1:02d}.png"
            pix.save(str(out_path))
            exported_images.append(str(out_path))
    doc.close()

    return {
        "pdf_path": pdf_path,
        "page_count": len(page_texts),
        "full_text": "\n".join(page_texts),
        "waste_page_idx": waste_page_idx,
        "hazard_trend_idx": hazard_trend_idx,
        "nonhaz_trend_idx": nonhaz_trend_idx,
        "exported_images": exported_images,
    }


def test_login_and_pdf_export_success(exported_pdf: Dict):
    assert exported_pdf["size"] > 2000


def test_pdf_is_non_empty_and_has_pages(pdf_context: Dict):
    assert pdf_context["page_count"] > 0


def test_waste_section_present_and_surrounding_waste_charts_render(pdf_context: Dict):
    assert pdf_context["waste_page_idx"] is not None, "Missing Waste Performance section in PDF"
    assert pdf_context["hazard_trend_idx"] is not None, "Missing 'Hazardous Waste Trends' section text"
    assert pdf_context["nonhaz_trend_idx"] is not None, "Missing 'Non-Hazardous Waste Trends' section text"


def test_waste_section_page_images_exported_for_visual_review(pdf_context: Dict):
    assert pdf_context["exported_images"], "Waste section page images were not exported"
    for image_path in pdf_context["exported_images"]:
        assert Path(image_path).exists(), f"Expected image artifact missing: {image_path}"


def test_grouped_bar_renderer_uses_dedicated_bottom_legend_band_from_source_contract():
    source = Path("/app/backend/modules/mis_reports/pdf_charts.py").read_text(encoding="utf-8")
    assert "def _render_grouped_bar" in source
    assert "legend_height = 0.46" in source
    assert "fig.legend(handles, labels" in source
    assert "ax.legend(" not in source[source.find("def _render_grouped_bar"): source.find("def _render_grouped_bar") + 1400]
