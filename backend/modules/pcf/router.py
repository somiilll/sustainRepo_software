"""Secure SustainRepo routes that adapt the preserved PCF engine."""
import asyncio
import os
import re
import tempfile
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from starlette.background import BackgroundTask

from modules.auth.dependencies import get_current_user
from modules.entitlements.dependencies import assert_entitlement
from shared.database.mongo import db

from .vendor_engine import get_pcf_engine, get_sample_input, get_workspace_template


router = APIRouter(prefix="/pcf", tags=["PCF Studio"])


async def _organization_id_for_pcf(current_user: dict) -> str:
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="An organization context is required for PCF Studio")
    if current_user.get("role") != "super_admin":
        await assert_entitlement(org_id, "pcf_studio")
    return org_id


async def _validate_facility_context(org_id: str, facility_id: str | None) -> None:
    if not facility_id:
        return
    facility = await db.facilities.find_one(
        {"id": facility_id, "organization_id": org_id},
        {"_id": 0, "id": 1},
    )
    if not facility:
        raise HTTPException(status_code=404, detail="Facility is not available in the current organization")


async def _engine():
    return await asyncio.to_thread(get_pcf_engine)


async def _pcf_context(
    current_user: dict,
    facility_id: str | None,
) -> str:
    org_id = await _organization_id_for_pcf(current_user)
    await _validate_facility_context(org_id, facility_id)
    return org_id


@router.get("/workspace", response_class=HTMLResponse)
async def get_workspace(current_user: dict = Depends(get_current_user)):
    await _organization_id_for_pcf(current_user)
    return HTMLResponse(get_workspace_template())


@router.get("/context")
async def get_context(current_user: dict = Depends(get_current_user)):
    org_id = await _organization_id_for_pcf(current_user)
    organization = await db.organizations.find_one(
        {"id": org_id},
        {"_id": 0, "id": 1, "name": 1, "country": 1, "city": 1},
    )
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    facilities = await db.facilities.find(
        {"organization_id": org_id, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "country": 1, "city": 1, "products_services": 1},
    ).sort("name", 1).to_list(1000)
    return {
        "organization": organization,
        "facilities": facilities,
    }


@router.get("/fuels")
async def get_fuels(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_available_fuels()


@router.get("/fuel-factors")
async def get_fuel_factors(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_fuel_factors_map()


@router.get("/fugitive-gases")
async def get_fugitive_gases(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_available_fugitive_gases()


@router.get("/fugitive-factors")
async def get_fugitive_factors(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_fugitive_gases_map()


@router.get("/freight-vehicles")
async def get_freight_vehicles(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_freight_vehicles()


@router.get("/epa-waste")
async def get_epa_waste(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_available_epa_waste_materials()


@router.get("/defra-materials")
async def get_defra_materials(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_available_defra_materials()


@router.get("/water-factors")
async def get_water_factors(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_available_water_factors()


@router.get("/useeio")
async def get_useeio_commodities(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_available_useeio_commodities(limit=200)


@router.get("/agribalyse")
async def get_agribalyse_products(
    q: str | None = None,
    current_user: dict = Depends(get_current_user),
    x_pcf_facility_id: str | None = Header(default=None),
):
    await _pcf_context(current_user, x_pcf_facility_id)
    return (await _engine()).factors_db.get_available_agribalyse_products(query=q, limit=100)


@router.get("/sample-data")
async def get_sample_data(current_user: dict = Depends(get_current_user), x_pcf_facility_id: str | None = Header(default=None)):
    await _pcf_context(current_user, x_pcf_facility_id)
    return await asyncio.to_thread(get_sample_input)


@router.get("/search-factors")
async def search_factors(
    q: str = "",
    source: str | None = None,
    region: str | None = None,
    limit: int = 30,
    current_user: dict = Depends(get_current_user),
    x_pcf_facility_id: str | None = Header(default=None),
):
    await _pcf_context(current_user, x_pcf_facility_id)
    source_filter = None if source in {None, "", "all"} else source
    return (await _engine()).factors_db.search_factors(
        query=q,
        source_filter=source_filter,
        region_filter=region,
        limit=max(1, min(limit, 50)),
    )


@router.post("/match")
async def match_factor(
    payload: dict[str, Any],
    current_user: dict = Depends(get_current_user),
    x_pcf_facility_id: str | None = Header(default=None),
):
    await _pcf_context(current_user, x_pcf_facility_id)
    engine = await _engine()
    try:
        return engine.matcher.match(engine.match_request_type(**payload)).model_dump()
    except (TypeError, ValueError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/match-batch")
async def match_batch(
    payload: dict[str, Any],
    current_user: dict = Depends(get_current_user),
    x_pcf_facility_id: str | None = Header(default=None),
):
    await _pcf_context(current_user, x_pcf_facility_id)
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=422, detail="items must be a list")
    engine = await _engine()
    results = []
    for item in items:
        try:
            results.append(engine.matcher.match(engine.match_request_type(**item)).model_dump())
        except (TypeError, ValueError, KeyError):
            results.append({"error": "Unable to match this item"})
    return results


@router.post("/calculate")
async def calculate_pcf(
    payload: dict[str, Any],
    current_user: dict = Depends(get_current_user),
    x_pcf_facility_id: str | None = Header(default=None),
):
    await _pcf_context(current_user, x_pcf_facility_id)
    engine = await _engine()
    try:
        return engine.calculator.calculate(engine.pcf_input_type(**payload)).model_dump()
    except (TypeError, ValueError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def _export_filename(product_name: str, extension: str) -> str:
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", product_name).strip("._") or "product"
    return f"PCF_Declaration_{safe_name}.{extension}"


async def _export_pcf(payload: dict[str, Any], extension: str):
    engine = await _engine()
    try:
        pcf_input = engine.pcf_input_type(**payload)
        result = engine.calculator.calculate(pcf_input)
    except (TypeError, ValueError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    with tempfile.NamedTemporaryFile(suffix=f".{extension}", delete=False) as temporary_file:
        temporary_path = temporary_file.name
    try:
        if extension == "xlsx":
            engine.exporter_type.export_to_excel(result, temporary_path)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            engine.exporter_type.export_to_pdf(result, temporary_path, payload=pcf_input)
            media_type = "application/pdf"
    except Exception:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)
        raise
    return FileResponse(
        temporary_path,
        media_type=media_type,
        filename=_export_filename(pcf_input.product.name, extension),
        background=BackgroundTask(os.remove, temporary_path),
    )


@router.post("/export-excel")
async def export_excel(
    payload: dict[str, Any],
    current_user: dict = Depends(get_current_user),
    x_pcf_facility_id: str | None = Header(default=None),
):
    await _pcf_context(current_user, x_pcf_facility_id)
    return await _export_pcf(payload, "xlsx")


@router.post("/export-pdf")
async def export_pdf(
    payload: dict[str, Any],
    current_user: dict = Depends(get_current_user),
    x_pcf_facility_id: str | None = Header(default=None),
):
    await _pcf_context(current_user, x_pcf_facility_id)
    return await _export_pcf(payload, "pdf")