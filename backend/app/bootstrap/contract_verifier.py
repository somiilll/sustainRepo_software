"""
Module contract verifier — runs at FastAPI startup.

Mirrors the frontend's `verifyModuleContracts.js` philosophy: fail fast
in development if a backend module is missing required pieces. Once
domain modules expose `router`, `service`, `repository`, etc., this
verifier will check each module declares the right shape and fail boot
in dev / log a critical alert in prod.

Phase B1 scope (this iteration):
  - Verify the new package skeleton imports cleanly.
  - Verify env config + DB client initialize without errors.
  - Verify a known set of "first-class" modules are at minimum
    importable (no syntax errors in their `__init__.py`).

Subsequent phases will extend this with per-module schema checks
(e.g., `assert hasattr(module, 'router')`).
"""
import importlib
from typing import List

from app.logging import get_logger

logger = get_logger("bootstrap.contracts")

# Modules expected to exist post-Phase-B1. As more modules are populated
# in subsequent phases (B2 auth/users, B3 facilities/orgs/sinks, …),
# their import paths get added here.
_REQUIRED_MODULES: List[str] = [
    "app.config",
    "app.errors.exceptions",
    "app.logging.logger",
    "shared.database.mongo",
    "shared.helpers.passwords",
    "shared.helpers.tokens",
    "shared.helpers.email",
    "modules.auth",
    "modules.users",
    "modules.organizations",
    "modules.facilities",
    "modules.emissions",
    "modules.calculations",
    "modules.reports",
    "modules.dashboards",
    "modules.uploads",
    "modules.audit",
    "repositories",
    "jobs",
    "events",
]


def verify_module_contracts() -> None:
    """Import each required module to surface missing files / syntax errors at boot."""
    failed: List[str] = []
    for path in _REQUIRED_MODULES:
        try:
            importlib.import_module(path)
        except Exception as e:
            failed.append(f"{path}: {type(e).__name__}: {e}")

    if failed:
        logger.error(
            "Module contract verification FAILED — %d module(s) failed to import",
            len(failed),
        )
        for entry in failed:
            logger.error("  - %s", entry)
        # Phase B1: log only. Future phases may raise to fail boot in dev.
        return

    logger.info(
        "Module contract verification PASSED — %d module(s) importable, "
        "skeleton ready for incremental migration.",
        len(_REQUIRED_MODULES),
    )
