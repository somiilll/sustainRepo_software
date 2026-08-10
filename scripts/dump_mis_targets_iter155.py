"""Fetch Aug 2026 MIS executive payload and persist target details for reporting."""

import json
import re
from pathlib import Path

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
            return value.strip().rstrip("/")
    return None


def _read_admin_creds() -> tuple[str | None, str | None]:
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        return None, None
    text = path.read_text(encoding="utf-8")
    email_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Email\*\*:\s*([^\n]+)", text)
    pass_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Password\*\*:\s*([^\n]+)", text)
    return (
        email_match.group(1).strip() if email_match else None,
        pass_match.group(1).strip() if pass_match else None,
    )


def main() -> int:
    base_url = _read_frontend_backend_url()
    email, password = _read_admin_creds()
    if not base_url or not email or not password:
        print("Missing base_url or admin credentials")
        return 1

    login = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=40,
    )
    if login.status_code != 200:
        print(f"Login failed: {login.status_code} {login.text}")
        return 2

    token = login.json().get("access_token")
    payload = {
        "reporting_period_start": "2026-08",
        "reporting_period_end": "2026-08",
        "facility_ids": [],
        "categories": [],
        "scopes": ["scope1", "scope2", "scope3", "biogenic"],
    }
    report = requests.post(
        f"{base_url}/api/mis-reports/executive-report",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=120,
    )
    if report.status_code != 200:
        print(f"MIS report failed: {report.status_code} {report.text}")
        return 3

    data = report.json()
    sbti = [t for t in data.get("targets", []) if t.get("target_source") == "sbti"]

    out = {
        "target_summary": data.get("target_summary"),
        "sbti_targets": sbti,
    }
    out_path = Path("/app/test_reports/iteration_155_mis_sbti_targets_payload.json")
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Saved: {out_path}")
    print(f"SBTi in MIS payload: {len(sbti)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
