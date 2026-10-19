"""Fetch and store active SBTi target details for iteration 155 reporting."""

import json
import os
import re
from pathlib import Path

import requests


def read_backend_url() -> str | None:
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


def read_admin_creds() -> tuple[str | None, str | None]:
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        return None, None
    text = path.read_text(encoding="utf-8")
    email_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Email\*\*:\s*([^\n]+)", text)
    pass_match = re.search(r"##\s*Admin Account[\s\S]*?\*\*Password\*\*:\s*([^\n]+)", text)
    email = email_match.group(1).strip() if email_match else None
    password = pass_match.group(1).strip() if pass_match else None
    return email, password


def main() -> int:
    base_url = os.environ.get("REACT_APP_BACKEND_URL") or read_backend_url()
    email, password = read_admin_creds()
    if not base_url or not email or not password:
        print("Missing base URL or credentials")
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
    response = requests.get(
        f"{base_url}/api/sbti-targets",
        headers={"Authorization": f"Bearer {token}"},
        timeout=40,
    )
    if response.status_code != 200:
        print(f"SBTi endpoint failed: {response.status_code} {response.text}")
        return 3

    payload = response.json()
    out_path = Path("/app/test_reports/iteration_155_sbti_targets.json")
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved: {out_path}")
    print(f"Total active SBTi targets: {payload.get('total', len(payload.get('targets', [])))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
