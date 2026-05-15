"""
Calc Engine — Phase 1 foundations.

Public surface for server.py:
- build_calc_engine_router(db, get_current_user, get_super_admin_user)
- seed_calc_engine(db)
- CalcEngine(db)  — orchestrator for execution

Internal layout:
  variables.py        — system variable registry + seed
  units.py            — units_v2, compound units, dimension vectors, conversion
  properties.py       — 3-level resolver (user -> org [disabled P1] -> property_values -> fuel_db fallback)
  transformations.py  — engine-defined transforms (e.g. volume_to_mass)
  execution.py        — orchestrator: validate -> normalise -> resolve -> transform -> run -> aggregate -> audit
  audit.py            — structured per-step audit log accumulator
  models.py           — pydantic request/response schemas
  router.py           — FastAPI router: /api/super-admin/calc-engine/*
"""

from .execution import CalcEngine  # noqa: F401
from .seed import seed_calc_engine  # noqa: F401
from .router import build_calc_engine_router  # noqa: F401
