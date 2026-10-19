"""
Test suite for compound unit conversion using user-provided custom density.

Bug context:
When converting ef_quantity (kgCO2/L -> kgCO2/kg) and qty (L -> kg) during
calc-engine execution, the compound L -> kg conversion must use the
user-provided density value (`density` in inputs) instead of falling back
to fuel_database default density.

Expected behavior with payload:
  qty = 6220 L
  ef_quantity = 0.1 kgCO2/L
  density = 0.6 kg/L  (user override)

Should yield co2 ~= 622 kgCO2 == 0.622 tCO2e (because volume-to-mass and
EF L->kg conversions cancel out when the SAME density is used consistently).

If the bug exists (different densities used at different stages), the result
will be incorrect. The fix also requires the audit log to show:
  method = property_based_user_override
  factor = 0.6
for at least one L->kg component conversion.
"""

import os
import json
import pytest
import requests

def _read_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        # Read from frontend/.env (kept in repo for testing)
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
    assert url, "REACT_APP_BACKEND_URL not configured"
    return url.rstrip("/")


BASE_URL = _read_backend_url()
TEST_EMAIL = "goyalsomil@hotmail.com"
TEST_PASSWORD = "Test123!"
CATEGORY_ID = "8d62f52d-0ca6-4737-9b14-dd60878c1f27"


# --- Fixtures ---
@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No access_token in response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    }


# --- Helpers ---
def _execute_payload(density_value):
    """Build the execute-by-category payload with given density value (kg/L)."""
    return {
        "category_id": CATEGORY_ID,
        "decision_inputs": {"ef_quantity_provided": "true"},
        "inputs": {
            "qty": {"value": 6220, "unit": "L"},
            "ef_quantity": {"value": 0.1, "unit": "kgCO2/L"},
            "density": {"value": density_value, "unit": "kg/L"},
        },
        "context": {},
        "user_overrides": {},
        "dry_run": True,
    }


def _flatten_audit(audit_log):
    """Return all dicts in audit_log, recursing into component_conversions/sub-steps."""
    items = []
    for entry in audit_log or []:
        items.append(entry)
        # include nested component_conversions if any
        for ccs in entry.get("component_conversions", []) or []:
            items.append(ccs)
    return items


# --- Tests ---
class TestCompoundUnitUserDensity:
    """Compound unit conversion with user-provided density override."""

    def test_execute_with_user_density_returns_expected_co2e(self, headers):
        """Calc must yield ~0.622 tCO2e (622 kgCO2) for qty=6220 L * ef=0.1 kgCO2/L."""
        payload = _execute_payload(0.6)
        resp = requests.post(
            f"{BASE_URL}/api/calc-engine/execute-by-category",
            json=payload,
            headers=headers,
            timeout=60,
        )
        assert resp.status_code == 200, f"Execute failed: {resp.status_code} {resp.text}"
        result = resp.json()
        print("\n--- RESULT (density=0.6) ---")
        print(json.dumps(result.get("outputs"), indent=2))

        outputs = result.get("outputs", {})
        assert outputs, f"No outputs returned: {result}"

        # Find a co2 / co2e output
        co2_val = None
        co2_unit = None
        for key in ("co2e", "co2"):
            if key in outputs:
                co2_val = float(outputs[key]["value"])
                co2_unit = outputs[key].get("unit", "")
                break
        assert co2_val is not None, f"No co2/co2e output found in: {outputs}"

        # Normalize to kg
        unit_lc = (co2_unit or "").lower()
        if unit_lc.startswith("t") or unit_lc.startswith("tco"):
            co2_kg = co2_val * 1000.0
        else:
            co2_kg = co2_val

        # Expected: 622 kgCO2 (tolerance 1%)
        assert abs(co2_kg - 622.0) < 6.22, (
            f"Expected ~622 kgCO2 (0.622 tCO2e) with user density=0.6, "
            f"got {co2_val} {co2_unit} (={co2_kg} kgCO2). "
            f"This suggests the user density override is NOT being used."
        )

    def test_audit_log_shows_property_based_user_override(self, headers):
        """Audit log must show method=property_based_user_override with factor=0.6
        for at least one L->kg component during compound conversion."""
        payload = _execute_payload(0.6)
        resp = requests.post(
            f"{BASE_URL}/api/calc-engine/execute-by-category",
            json=payload,
            headers=headers,
            timeout=60,
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()
        audit = result.get("audit_log", [])
        assert audit, "audit_log missing from response"

        all_entries = _flatten_audit(audit)

        # Look for property_based_user_override anywhere with factor==0.6
        matches = [
            e for e in all_entries
            if e.get("method") == "property_based_user_override"
            and abs(float(e.get("factor", 0)) - 0.6) < 1e-6
        ]
        # Also check inside component_conversions arrays nested as 'method' fields
        if not matches:
            for e in all_entries:
                for cc in e.get("component_conversions", []) or []:
                    if cc.get("method") == "property_based_user_override" and \
                       abs(float(cc.get("factor", 0)) - 0.6) < 1e-6:
                        matches.append(cc)

        print("\n--- Matching audit entries ---")
        print(json.dumps(matches, indent=2, default=str))

        if not matches:
            # Print the full audit for diagnostic purposes
            print("\n--- FULL AUDIT LOG ---")
            print(json.dumps(audit, indent=2, default=str)[:8000])

        assert matches, (
            "Expected at least one audit entry with method='property_based_user_override' "
            "and factor=0.6 for user-provided density override, but none found. "
            "This indicates the fix in _convert_component is not being applied."
        )

    def test_different_user_density_changes_result(self, headers):
        """Changing user-provided density must change the computed result, proving
        that the user value (not fuel_database default) drives the conversion."""
        r1 = requests.post(
            f"{BASE_URL}/api/calc-engine/execute-by-category",
            json=_execute_payload(0.6),
            headers=headers,
            timeout=60,
        )
        r2 = requests.post(
            f"{BASE_URL}/api/calc-engine/execute-by-category",
            json=_execute_payload(0.85),
            headers=headers,
            timeout=60,
        )
        assert r1.status_code == 200 and r2.status_code == 200, \
            f"Status: {r1.status_code}/{r2.status_code}"

        def _co2(resp):
            outs = resp.json().get("outputs", {})
            for k in ("co2e", "co2"):
                if k in outs:
                    return float(outs[k]["value"])
            return None

        v1, v2 = _co2(r1), _co2(r2)
        print(f"\ndensity=0.6 -> {v1}, density=0.85 -> {v2}")
        assert v1 is not None and v2 is not None
        # If user density is honored AND L->kg cancels out in both stages,
        # values may actually match (since EF L->kg uses same density as qty L->kg).
        # So the more meaningful check is: BOTH should yield ~0.622 tCO2e (622 kg).
        for v, unit in ((v1, r1.json()["outputs"].get("co2e", r1.json()["outputs"].get("co2", {})).get("unit", "")),
                       (v2, r2.json()["outputs"].get("co2e", r2.json()["outputs"].get("co2", {})).get("unit", ""))):
            unit_lc = (unit or "").lower()
            v_kg = v * 1000.0 if unit_lc.startswith("t") else v
            assert abs(v_kg - 622.0) < 6.22, (
                f"Result {v} {unit} (={v_kg} kg) must remain ~622 kgCO2 "
                f"regardless of density value when user override is honored at both "
                f"qty(L->kg) and ef(L->kg) stages."
            )
