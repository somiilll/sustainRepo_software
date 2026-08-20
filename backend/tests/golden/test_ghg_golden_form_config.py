"""
Golden regression: the GHG dynamic-form CONFIG must not change.

`GET /api/calc-engine/form-config/{category_id}` is the single input to the
frontend's `dynamicInputFields` derivation (currently duplicated between
`EmissionEntryForm.js` and `Emissions.js`). Locking this response means the
Phase 1 extraction can be proven to receive identical input before and after.

Covers every active emission category over live HTTP.
READ-ONLY: GET requests only.
"""
from __future__ import annotations

from typing import Any, Dict, List

import pytest
import requests

from ghg_golden_support import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    API,
    FORM_CONFIG_BASELINE,
    auth_header,
    load_baseline,
    login,
    stable_hash,
    strip_volatile,
)

BASELINE = load_baseline(FORM_CONFIG_BASELINE)
CONFIGS: Dict[str, Any] = BASELINE["configs"]
CATEGORY_IDS: List[str] = sorted(CONFIGS.keys())


@pytest.fixture(scope="module")
def headers() -> Dict[str, str]:
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        pytest.skip("Admin login failed")
    return auth_header(token)


def _normalise(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Must stay in lock-step with capture_ghg_baseline._normalise_form_config."""
    mappings = [
        {
            "field_key": m.get("field_key"),
            "field_label": m.get("field_label"),
            "field_type": m.get("field_type"),
            "maps_to_variable": m.get("maps_to_variable"),
            "maps_to_context": m.get("maps_to_context"),
            "default_unit": m.get("default_unit"),
            "allowed_units": m.get("allowed_units") or [],
            "is_required": bool(m.get("is_required")),
            "is_override": bool(m.get("is_override")),
            "display_order": m.get("display_order"),
            "unit_source": m.get("unit_source"),
            "compound_with_variable": m.get("compound_with_variable"),
            "options": m.get("options") or [],
            "validation_rules": m.get("validation_rules") or {},
            "placeholder": m.get("placeholder"),
            "help_text": m.get("help_text"),
        }
        for m in (cfg.get("input_field_mappings") or [])
    ]
    formulas = [
        {
            "id": f.get("id"),
            "name": f.get("name"),
            "inputs": f.get("inputs") or [],
            "outputs": f.get("outputs") or [],
            "properties": f.get("properties") or [],
        }
        for f in (cfg.get("formulas") or [])
    ]
    fuels = cfg.get("applicable_fuels") or []
    return {
        "has_decision_tree": cfg.get("has_decision_tree"),
        "decision_tree": strip_volatile(cfg.get("decision_tree") or {}),
        "decision_fields": cfg.get("decision_fields") or [],
        "formulas": sorted(formulas, key=lambda f: str(f["id"])),
        "required_input_variables": sorted(cfg.get("required_input_variables") or []),
        "required_properties": sorted(cfg.get("required_properties") or []),
        "input_field_mappings": mappings,
        "input_field_mapping_order": [m["field_key"] for m in mappings],
        "variables": sorted(
            [
                {
                    "key": v.get("key"),
                    "label": v.get("label"),
                    "type": v.get("type"),
                    "dimension": v.get("dimension"),
                    "default_unit": v.get("default_unit"),
                }
                for v in (cfg.get("variables") or [])
            ],
            key=lambda v: str(v["key"]),
        ),
        "applicable_fuel_count": len(fuels),
        "applicable_fuel_id_hash": stable_hash(
            sorted(str(f.get("id")) for f in fuels if isinstance(f, dict))
        ),
    }


def test_baseline_is_populated():
    assert CATEGORY_IDS, "No form-config baselines captured"
    assert not BASELINE["failures"], f"Capture had failures: {BASELINE['failures']}"


@pytest.mark.parametrize(
    "category_id",
    CATEGORY_IDS,
    ids=[f"{CONFIGS[c]['category_name']}__{c[:8]}" for c in CATEGORY_IDS],
)
def test_form_config_unchanged(category_id, headers):
    expected = {k: v for k, v in CONFIGS[category_id].items() if k != "category_name"}
    resp = requests.get(
        f"{API}/calc-engine/form-config/{category_id}", headers=headers, timeout=120
    )
    assert resp.status_code == 200, f"{resp.status_code}: {resp.text[:300]}"
    actual = _normalise(resp.json())

    for key in sorted(expected):
        assert stable_hash(actual.get(key)) == stable_hash(expected[key]), (
            f"form-config.{key} changed for "
            f"{CONFIGS[category_id]['category_name']} ({category_id})\n"
            f"  expected: {str(expected[key])[:400]}\n"
            f"  actual:   {str(actual.get(key))[:400]}"
        )
