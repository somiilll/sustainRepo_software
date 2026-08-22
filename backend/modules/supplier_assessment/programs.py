"""Program/revision binding for supplier assessments; legacy relationships remain unmodified."""
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict

from shared.database.mongo import db
from modules.sustainability_config.service import resolve_supplier_assessment_config


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def apply_legacy_request_overrides(
    config: Dict[str, Any],
    modules_enabled: Any = None,
    ghg_scopes_enabled: Any = None,
) -> Dict[str, Any]:
    """Translate existing request fields into a program revision, retaining API compatibility."""
    effective = deepcopy(config)
    modules = effective["modules"]
    if modules_enabled is not None:
        enabled = set(modules_enabled)
        for module_code in ("esg", "ghg"):
            modules[module_code]["enabled"] = module_code in enabled
    if ghg_scopes_enabled is not None:
        modules["ghg"]["scopes"] = list(ghg_scopes_enabled)
    return effective


def legacy_program_context(relationship: Dict[str, Any]) -> Dict[str, Any]:
    """Legacy rows preserve the historical ESG+GHG completion formula exactly."""
    return {
        "is_legacy": True,
        "program_id": None,
        "version": None,
        "config": {
            "modules": {
                "esg": {"enabled": True},
                "ghg": {"enabled": True, "scopes": relationship.get("ghg_scopes_enabled", ["scope1", "scope2"])},
            }
        },
    }


async def resolve_program_context(relationship: Dict[str, Any]) -> Dict[str, Any]:
    """Resolve bound revisions or the explicit legacy compatibility context."""
    program_id = relationship.get("assessment_program_id")
    version = relationship.get("assessment_program_version")
    if not program_id or version is None:
        return legacy_program_context(relationship)

    revision = await db.supplier_assessment_programs.find_one(
        {"program_id": program_id, "version": version}, {"_id": 0}
    )
    if not revision:
        return legacy_program_context(relationship)
    return {
        "is_legacy": False,
        "program_id": revision["program_id"],
        "version": revision["version"],
        "config": revision["config"],
    }


async def get_or_create_program_revision(customer_org_id: str, config: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    """Create a revision only when the resolved assessment configuration changes."""
    latest = await db.supplier_assessment_programs.find_one(
        {"customer_org_id": customer_org_id},
        {"_id": 0},
        sort=[("version", -1)],
    )
    if latest and latest.get("config") == config:
        return latest

    program_id = latest["program_id"] if latest else str(uuid.uuid4())
    version = (latest.get("version", 0) + 1) if latest else 1
    revision = {
        "id": str(uuid.uuid4()),
        "program_id": program_id,
        "version": version,
        "customer_org_id": customer_org_id,
        "config": deepcopy(config),
        "created_by": created_by,
        "created_at": _now(),
    }
    await db.supplier_assessment_programs.insert_one(revision)
    revision.pop("_id", None)
    return revision


async def bind_current_program(
    customer_org_id: str,
    created_by: str,
    modules_enabled: Any = None,
    ghg_scopes_enabled: Any = None,
) -> Dict[str, Any]:
    resolved_config = await resolve_supplier_assessment_config(customer_org_id)
    effective_config = apply_legacy_request_overrides(
        resolved_config, modules_enabled, ghg_scopes_enabled
    )
    return await get_or_create_program_revision(customer_org_id, effective_config, created_by)


async def ensure_indexes():
    await db.supplier_assessment_programs.create_index(
        [("customer_org_id", 1), ("version", 1)], unique=True
    )
    await db.supplier_assessment_programs.create_index(
        [("program_id", 1), ("version", 1)], unique=True
    )