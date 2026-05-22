"""
Health router — diagnostics endpoints used by frontend / CI.

Endpoints:
    GET /health           — basic liveness probe (existing behaviour preserved
                            in server.py for backward compat; mirrored here for
                            future migration).
    GET /health/contracts — runs the module contract verifier and returns
                            its JSON output. Useful for CI to fail fast if a
                            backend module went missing or has a syntax error.

The contracts endpoint runs `verify_module_contracts()` synchronously,
returning a structured JSON report instead of just logging — frontend
healthchecks and CI pipelines can call this without scraping logs.
"""
import importlib
from typing import Any, Dict, List

from fastapi import APIRouter

from app.bootstrap.contract_verifier import _REQUIRED_MODULES

router = APIRouter()


@router.get("/health/contracts")
async def health_contracts() -> Dict[str, Any]:
    """
    Re-run the module contract verifier and return a structured report.

    Response shape:
        {
          "status": "passed" | "failed",
          "modules_checked": int,
          "passed": List[str],
          "failed": List[{"path": str, "error_type": str, "error": str}]
        }
    """
    passed: List[str] = []
    failed: List[Dict[str, str]] = []

    for path in _REQUIRED_MODULES:
        try:
            # `importlib.import_module` is idempotent — already-imported
            # modules return the cached object without re-execution.
            importlib.import_module(path)
            passed.append(path)
        except Exception as e:
            failed.append({
                "path": path,
                "error_type": type(e).__name__,
                "error": str(e),
            })

    return {
        "status": "passed" if not failed else "failed",
        "modules_checked": len(_REQUIRED_MODULES),
        "passed": passed,
        "failed": failed,
    }
