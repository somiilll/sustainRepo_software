"""
Shared support for the GHG golden-record safety net (Phase 0).

READ-ONLY by design:
  * every calculation replay uses `dry_run=True`, so the calc engine never
    writes a `ce_calculation_audit_logs` document;
  * no emission record is created, updated or deleted;
  * Mongo is only ever read.

Nothing in this module imports application code that mutates state.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from typing import Any, Dict, List, Optional, Tuple

BASELINE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "baselines")

CALC_BASELINE = os.path.join(BASELINE_DIR, "ghg_calc_replay.json")
TREE_BASELINE = os.path.join(BASELINE_DIR, "ghg_decision_trees.json")
FORM_CONFIG_BASELINE = os.path.join(BASELINE_DIR, "ghg_form_config.json")
RECORD_CONTRACT_BASELINE = os.path.join(BASELINE_DIR, "ghg_record_contract.json")
HTTP_BASELINE = os.path.join(BASELINE_DIR, "ghg_http_endpoint.json")
API_CONTRACT_BASELINE = os.path.join(BASELINE_DIR, "ghg_api_contract.json")
FINDINGS = os.path.join(BASELINE_DIR, "ghg_known_inconsistencies.json")

# Relative tolerance for float comparison. The refactor must reproduce the
# baseline to ~1e-12; anything looser would let real drift through.
REL_TOL = 1e-12
ABS_TOL = 1e-15


# ---------------------------------------------------------------- environment


def backend_base_url() -> str:
    env_url = os.environ.get("REACT_APP_BACKEND_URL")
    if env_url:
        return env_url.rstrip("/")
    with open("/app/frontend/.env", "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL is required")


API = f"{backend_base_url()}/api"

ADMIN_EMAIL = "goyalsomil2001@gmail.com"
ADMIN_PASSWORD = "TestUser123!"
SUPER_ADMIN_EMAIL = "superadmin@ecotrack.com"
SUPER_ADMIN_PASSWORD = "TestUser123!"


def login(email: str, password: str) -> Optional[str]:
    import requests

    resp = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        timeout=60,
    )
    if resp.status_code != 200:
        return None
    body = resp.json()
    return body.get("access_token") or body.get("token")


def auth_header(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def mongo_db():
    from dotenv import load_dotenv
    from motor.motor_asyncio import AsyncIOMotorClient

    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


# ------------------------------------------------------------------ baselines


def load_baseline(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_baseline(path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(BASELINE_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, sort_keys=True, default=str)
        f.write("\n")


# --------------------------------------------------------------- normalisers


VOLATILE_KEYS = {"created_at", "updated_at", "generated_at", "created_by"}


def strip_volatile(obj: Any) -> Any:
    """Drop timestamp/author keys so snapshots stay stable across runs."""
    if isinstance(obj, dict):
        return {k: strip_volatile(v) for k, v in obj.items() if k not in VOLATILE_KEYS}
    if isinstance(obj, list):
        return [strip_volatile(v) for v in obj]
    return obj


def stable_hash(obj: Any) -> str:
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()


def bucket_key(record: Dict[str, Any]) -> str:
    """Canonical GHG behaviour bucket for a stored emission record."""
    return "|".join(
        [
            str(record.get("scope") or "-"),
            str(record.get("category") or "-"),
            str(record.get("calculation_method_scope3") or "-"),
            str(record.get("frequency_type") or "unspecified"),
            "custom_fuel" if record.get("is_custom_fuel") else "standard_fuel",
            str(record.get("biogenic_scope_selection") or "-"),
            str(record.get("process_type") or "-"),
        ]
    )


def fixture_slug(record: Dict[str, Any]) -> str:
    raw = bucket_key(record).lower()
    for ch in " |/-()":
        raw = raw.replace(ch, "_")
    while "__" in raw:
        raw = raw.replace("__", "_")
    return raw.strip("_")


def reconstruct_user_overrides(audit_trail: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Rebuild the `user_overrides` argument from a persisted audit trail.

    Every property the user overrode is recorded as a `resolve_property` step
    with `source == "user_override"`, carrying the exact value + unit that was
    used. Replaying with these restores the original calculation faithfully.
    """
    overrides: Dict[str, Any] = {}
    for step in audit_trail or []:
        if step.get("step") != "resolve_property":
            continue
        if step.get("source") != "user_override":
            continue
        key = step.get("property")
        if not key:
            continue
        overrides[key] = {
            "value": step.get("value"),
            "unit": step.get("unit") or "",
            "source_name": "User Override",
        }
    return overrides


def normalise_outputs(outputs: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """{var: {value, unit}} with floats coerced, ignoring key order."""
    out: Dict[str, Dict[str, Any]] = {}
    for key, val in (outputs or {}).items():
        if isinstance(val, dict):
            value = val.get("value")
            unit = val.get("unit")
        else:
            value = val
            unit = None
        out[key] = {
            "value": float(value) if isinstance(value, (int, float)) else value,
            "unit": unit,
        }
    return out


def floats_equal(a: Any, b: Any) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(float(a), float(b), rel_tol=REL_TOL, abs_tol=ABS_TOL)
    return a == b


def compare_outputs(
    expected: Dict[str, Dict[str, Any]], actual: Dict[str, Dict[str, Any]]
) -> List[str]:
    """Return a list of human-readable differences (empty == identical)."""
    diffs: List[str] = []
    for key in sorted(set(expected) | set(actual)):
        exp = expected.get(key)
        act = actual.get(key)
        if exp is None:
            diffs.append(f"{key}: unexpected output {act}")
            continue
        if act is None:
            diffs.append(f"{key}: missing output (expected {exp})")
            continue
        if not floats_equal(exp.get("value"), act.get("value")):
            diffs.append(
                f"{key}.value expected {exp.get('value')!r} got {act.get('value')!r}"
            )
        if (exp.get("unit") or "") != (act.get("unit") or ""):
            diffs.append(
                f"{key}.unit expected {exp.get('unit')!r} got {act.get('unit')!r}"
            )
    return diffs


# ------------------------------------------------------- decision-tree walker


def enumerate_tree_paths(
    node: Dict[str, Any], prefix: Optional[List[Tuple[str, str]]] = None
) -> List[Dict[str, Any]]:
    """
    Enumerate every leaf of a decision tree as
    `{"decision_inputs": {...}, "formula_id": "..."}`.

    Mirrors `calc_engine.formulas.resolve_formula_id` traversal semantics
    (`formula_id` may sit on the node itself or on an option child).
    """
    prefix = prefix or []
    if not isinstance(node, dict):
        return []
    if "formula_id" in node:
        return [{"decision_inputs": dict(prefix), "formula_id": node["formula_id"]}]

    field = node.get("field_name")
    leaves: List[Dict[str, Any]] = []
    for value, child in (node.get("options") or {}).items():
        branch = prefix + [(field, value)]
        if isinstance(child, dict) and "formula_id" in child:
            leaves.append(
                {"decision_inputs": dict(branch), "formula_id": child["formula_id"]}
            )
        elif isinstance(child, dict) and isinstance(child.get("next"), dict):
            leaves.extend(enumerate_tree_paths(child["next"], branch))
    return leaves
