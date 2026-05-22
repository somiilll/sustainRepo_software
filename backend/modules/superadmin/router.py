"""Phase B9 + B9b: Super-admin / Platform Config aggregator router.

Composes 7 focused sub-routers. Each sub-router holds ~13 cohesive routes.
"""
from fastapi import APIRouter

from modules.superadmin.router_organizations import router as r_organizations
from modules.superadmin.router_factors import router as r_factors
from modules.superadmin.router_reference_data import router as r_reference_data
from modules.superadmin.router_units_fuels import router as r_units_fuels
from modules.superadmin.router_gwp_currency import router as r_gwp_currency
from modules.superadmin.router_formulas import router as r_formulas
from modules.superadmin.router_misc import router as r_misc

router = APIRouter()
router.include_router(r_organizations)
router.include_router(r_factors)
router.include_router(r_reference_data)
router.include_router(r_units_fuels)
router.include_router(r_gwp_currency)
router.include_router(r_formulas)
router.include_router(r_misc)
