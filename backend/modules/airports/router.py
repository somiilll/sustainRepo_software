"""
Airport API router.

Endpoints:
  GET  /api/airports/search?q=<query>           — search airports
  POST /api/airports/calculate-distance          — Haversine distance between two IATA codes
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from modules.airports.service import search_airports, calculate_distance

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/airports", tags=["Airports"])


# ── Request / Response models ───────────────────────────────────────────────

class DistanceRequest(BaseModel):
    from_airport_code: str
    to_airport_code: str


class AirportResult(BaseModel):
    iata_code: str
    airport_name: str
    city: str
    country: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DistanceResult(BaseModel):
    distance_km: float
    method: str
    earth_radius_km: int
    from_airport: dict  # AirportResult-like
    to_airport: dict


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/search", response_model=list[AirportResult])
async def airport_search(q: str = Query(..., min_length=1, description="Search query")):
    """Search airports by IATA code, name, city or country."""
    results = await search_airports(q)
    return results


@router.post("/calculate-distance")
async def airport_calculate_distance(body: DistanceRequest):
    """Calculate Haversine great-circle distance between two airports."""
    from_code = body.from_airport_code.strip().upper()
    to_code = body.to_airport_code.strip().upper()

    if not from_code or not to_code:
        raise HTTPException(status_code=400, detail="Both airport codes are required.")

    if from_code == to_code:
        # Same airport — distance is 0
        from modules.airports.service import get_airport_by_iata
        apt = await get_airport_by_iata(from_code)
        if not apt:
            raise HTTPException(status_code=404, detail=f"Airport not found: {from_code}")
        airport_data = {
            "airport_code": apt["iata_code"],
            "airport_name": apt["airport_name"],
            "city": apt["city"],
            "country": apt["country"],
            "latitude": apt["latitude"],
            "longitude": apt["longitude"],
        }
        return {
            "distance_km": 0,
            "method": "HAVERSINE",
            "earth_radius_km": 6371,
            "from": airport_data,
            "to": airport_data,
        }

    try:
        result = await calculate_distance(from_code, to_code)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
