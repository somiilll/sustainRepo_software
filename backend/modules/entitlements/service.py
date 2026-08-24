"""Canonical organization entitlement resolution.

Organization configuration is authoritative. Legacy organization flags are read
only as a compatibility source during the one-time migration and mirrored on
writes for older, not-yet-migrated consumers.
"""
from datetime import datetime, timezone
from copy import deepcopy
from typing import Any, Dict, Optional

from shared.database.mongo import db


ENTITLEMENT_CATALOG = (
    "repo_pilot",
    "environment",
    "social",
    "governance",
    "materiality",
    "reporting",
    "workflow",
    "uploads",
    "targets",
    "reports",
    "mis_reports",
    "peer_benchmarking",
    "supplier_assessment",
    "audit_trails",
    "evidence_storage",
)

DEFAULT_ENTITLEMENT_CONFIG = {
    "repo_pilot": {"internal_data_ai": False, "data_retrieval": False},
    "environment": {
        "ghg": {"enabled": True, "coverage": "scope_1_2_3", "monthly_rows_allowed": None},
        "energy": {"enabled": True, "monthly_rows_allowed": None},
        "water": {"enabled": True, "monthly_rows_allowed": None},
        "waste": {"enabled": True, "monthly_rows_allowed": None},
        "biodiversity": {"enabled": True, "monthly_rows_allowed": None},
        "climate_change": {"enabled": True, "monthly_rows_allowed": None},
        "material": {"enabled": True, "monthly_rows_allowed": None},
        "other_emissions": {"enabled": True, "monthly_rows_allowed": None},
    },
    "social": {"enabled": True},
    "governance": {"enabled": True},
    "materiality": {"enabled": True, "assessment_types": ["traditional", "double"]},
    "reporting": {"enabled": True, "brsr": True, "gri": True},
    "workflow": {"enabled": True, "workflow_type": "multi_level"},
    "uploads": {"bulk_upload": True, "ocr": True},
    "targets": {"enabled": False, "voluntary": False, "sbti": False},
    "reports": {"enabled": True, "scope_1_2": True, "scope_1_2_3": True, "ai_executive_summary": True},
    "mis_reports": {"enabled": True, "configurations_allowed": None},
    "peer_benchmarking": {"enabled": True},
    "supplier_assessment": {"enabled": True, "suppliers_allowed": None},
    "audit_trails": {"enabled": True},
    "evidence_storage": {"enabled": True, "storage_limit_gb": None},
}

# Deprecated name retained for callers that need the complete config default.
DEFAULT_ENTITLEMENTS = DEFAULT_ENTITLEMENT_CONFIG


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _deep_merge(defaults: Dict[str, Any], supplied: Dict[str, Any]) -> Dict[str, Any]:
    result = deepcopy(defaults)
    for key, value in supplied.items():
        if key not in result:
            continue
        if isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        elif value is not None:
            result[key] = value
    return result


def normalize_entitlement_config(value: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Return the complete nested entitlement configuration, including legacy data."""
    supplied = value or {}
    converted: Dict[str, Any] = {}
    for code, default in DEFAULT_ENTITLEMENT_CONFIG.items():
        raw = supplied.get(code)
        if isinstance(raw, bool):
            if code == "repo_pilot":
                converted[code] = {"internal_data_ai": raw, "data_retrieval": raw}
            elif code == "environment":
                converted[code] = {name: {"enabled": raw} for name in default}
            elif code == "uploads":
                converted[code] = {"bulk_upload": raw, "ocr": raw}
            elif code == "targets":
                converted[code] = {"enabled": raw, "voluntary": raw, "sbti": raw}
            elif code in {"reporting", "reports"}:
                converted[code] = {name: raw for name in default if name != "workflow_type"}
            elif code == "workflow":
                converted[code] = {"enabled": raw}
            else:
                converted[code] = {"enabled": raw}
        elif isinstance(raw, dict):
            converted[code] = raw
    return _deep_merge(DEFAULT_ENTITLEMENT_CONFIG, converted)


def entitlement_access_map(value: Optional[Dict[str, Any]]) -> Dict[str, bool]:
    """Produce top-level and granular booleans for navigation and route guards."""
    config = normalize_entitlement_config(value)
    environment = config["environment"]
    ghg = environment["ghg"]
    ghg_enabled = bool(ghg["enabled"])
    scope_1_2 = ghg["coverage"] in {"scope_1_2", "scope_1_2_3"}
    scope_3 = ghg["coverage"] in {"scope_3", "scope_1_2_3"}
    access = {
        "repo_pilot": bool(config["repo_pilot"]["internal_data_ai"] or config["repo_pilot"]["data_retrieval"]),
        "environment": any(item["enabled"] for item in environment.values()),
        "social": bool(config["social"]["enabled"]),
        "governance": bool(config["governance"]["enabled"]),
        "materiality": bool(config["materiality"]["enabled"]),
        "reporting": bool(config["reporting"]["enabled"]),
        "workflow": bool(config["workflow"]["enabled"]),
        "uploads": bool(config["uploads"]["bulk_upload"] or config["uploads"]["ocr"]),
        "targets": bool(config["targets"]["enabled"]),
        "reports": bool(config["reports"]["enabled"]),
        "mis_reports": bool(config["mis_reports"]["enabled"]),
        "peer_benchmarking": bool(config["peer_benchmarking"]["enabled"]),
        "supplier_assessment": bool(config["supplier_assessment"]["enabled"]),
        "audit_trails": bool(config["audit_trails"]["enabled"]),
        "evidence_storage": bool(config["evidence_storage"]["enabled"]),
        "repo_pilot.internal_data_ai": bool(config["repo_pilot"]["internal_data_ai"]),
        "repo_pilot.data_retrieval": bool(config["repo_pilot"]["data_retrieval"]),
        "environment.ghg": ghg_enabled,
        "environment.ghg.scope_1_2": ghg_enabled and scope_1_2,
        "environment.ghg.scope_3": ghg_enabled and scope_3,
        "reporting.brsr": bool(config["reporting"]["enabled"] and config["reporting"]["brsr"]),
        "reporting.gri": bool(config["reporting"]["enabled"] and config["reporting"]["gri"]),
        "uploads.bulk_upload": bool(config["uploads"]["bulk_upload"]),
        "uploads.ocr": bool(config["uploads"]["ocr"]),
        "targets.voluntary": bool(config["targets"]["enabled"] and config["targets"]["voluntary"]),
        "targets.sbti": bool(config["targets"]["enabled"] and config["targets"]["sbti"]),
        "reports.scope_1_2": bool(config["reports"]["enabled"] and config["reports"]["scope_1_2"] and ghg_enabled and scope_1_2),
        "reports.scope_1_2_3": bool(config["reports"]["enabled"] and config["reports"]["scope_1_2_3"] and ghg_enabled and scope_3),
        "reports.ai_executive_summary": bool(config["reports"]["enabled"] and config["reports"]["ai_executive_summary"]),
    }
    for name, settings in environment.items():
        access[f"environment.{name}"] = bool(settings["enabled"])
    return access


def normalize_entitlements(value: Optional[Dict[str, Any]]) -> Dict[str, bool]:
    """Return the 15 canonical top-level access flags for legacy consumers."""
    access = entitlement_access_map(value)
    return {code: access[code] for code in ENTITLEMENT_CATALOG}


def legacy_entitlements(organization: Optional[Dict[str, Any]]) -> Dict[str, bool]:
    """Convert legacy organization flags without making them the source of truth."""
    org = organization or {}
    access = org.get("module_access") or {}
    resolved = {code: bool(access[code]) if code in access else bool(normalize_entitlements(None)[code]) for code in ENTITLEMENT_CATALOG}

    if "repo_pilot" not in access:
        resolved["repo_pilot"] = bool(org.get("repo_pilot_enabled", False))
    if "targets" not in access:
        resolved["targets"] = bool(org.get("sbti_targets_enabled", False))
    if "environment" not in access:
        resolved["environment"] = bool(org.get("has_ghg", True) or org.get("has_esg", True))
    if "social" not in access:
        resolved["social"] = bool(org.get("has_esg", True))
    if "governance" not in access:
        resolved["governance"] = bool(org.get("has_esg", True))
    if "mis_reports" not in access and "reports" in access:
        resolved["mis_reports"] = bool(access["reports"])
    return resolved


async def resolve_entitlements(org_id: str, *, migrate: bool = False) -> Dict[str, bool]:
    """Resolve canonical access, optionally materializing legacy organizations."""
    organization = await db["organizations"].find_one(
        {"id": org_id},
        {"_id": 0, "has_ghg": 1, "has_esg": 1, "repo_pilot_enabled": 1,
         "sbti_targets_enabled": 1, "module_access": 1},
    )
    config = await db["organization_config"].find_one(
        {"organization_id": org_id}, {"_id": 0, "entitlements": 1},
    )
    configured = (config or {}).get("entitlements")
    if configured is not None:
        normalized = normalize_entitlement_config(configured)
        if migrate and normalized != configured:
            await db["organization_config"].update_one(
                {"organization_id": org_id}, {"$set": {"entitlements": normalized, "updated_at": _now()}},
            )
        return normalize_entitlements(normalized)

    resolved = legacy_entitlements(organization)
    nested = normalize_entitlement_config(resolved)
    if migrate and organization:
        now = _now()
        await db["organization_config"].update_one(
            {"organization_id": org_id},
            {
                "$set": {
                    "entitlements": nested,
                    "updated_at": now,
                    "updated_by": "legacy_entitlement_migration",
                },
                "$setOnInsert": {
                    "organization_id": org_id,
                    "created_at": now,
                    "created_by": "legacy_entitlement_migration",
                },
            },
            upsert=True,
        )
    return normalize_entitlements(nested)


async def sync_legacy_entitlement_mirror(org_id: str, entitlements: Dict[str, Any]) -> None:
    """Keep deprecated fields readable while Org Config remains authoritative."""
    resolved = normalize_entitlements(entitlements)
    await db["organizations"].update_one(
        {"id": org_id},
        {"$set": {
            "module_access": resolved,
            "repo_pilot_enabled": resolved["repo_pilot"],
            "sbti_targets_enabled": resolved["targets"],
            "has_ghg": resolved["environment"],
            "has_esg": any(resolved[code] for code in ("environment", "social", "governance")),
        }},
    )