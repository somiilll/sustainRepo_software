"""
Airport reference data service.

Handles:
- One-time CSV import into MongoDB `airports` collection
- Text search across IATA code, name, city, country
- Haversine great-circle distance calculation
"""
import csv
import math
import logging
from typing import List, Optional

from shared.database.mongo import db

logger = logging.getLogger(__name__)

COLLECTION = "airports"


# ── CSV Import ──────────────────────────────────────────────────────────────

async def seed_airports_from_csv(csv_path: str) -> int:
    """
    Import airport records from CSV into MongoDB.
    Only imports rows that have a non-empty IATA code.
    Skips if the collection already has data.
    Returns the number of inserted documents.
    """
    existing_count = await db[COLLECTION].count_documents({})
    if existing_count > 0:
        logger.info(f"Airports collection already has {existing_count} records — skipping seed.")
        return existing_count

    records: list[dict] = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            iata = (row.get("iata_code") or "").strip()
            if not iata:
                continue

            lat_raw = (row.get("latitude_deg") or "").strip()
            lon_raw = (row.get("longitude_deg") or "").strip()
            try:
                lat = float(lat_raw) if lat_raw else None
                lon = float(lon_raw) if lon_raw else None
            except ValueError:
                lat, lon = None, None

            records.append({
                "iata_code": iata,
                "airport_name": (row.get("name") or "").strip(),
                "city": (row.get("municipality") or "").strip(),
                "country": (row.get("iso_country") or "").strip(),
                "latitude": lat,
                "longitude": lon,
            })

    if records:
        await db[COLLECTION].insert_many(records)
        logger.info(f"Seeded {len(records)} airports into MongoDB.")

    # Create indexes for fast lookups
    await db[COLLECTION].create_index("iata_code", unique=True)
    await db[COLLECTION].create_index([
        ("iata_code", 1),
        ("airport_name", 1),
        ("city", 1),
        ("country", 1),
    ])
    # Text index for full-text search
    await db[COLLECTION].create_index([
        ("iata_code", "text"),
        ("airport_name", "text"),
        ("city", "text"),
        ("country", "text"),
    ])

    return len(records)


# ── Search ──────────────────────────────────────────────────────────────────

async def search_airports(query: str, limit: int = 15) -> List[dict]:
    """
    Search airports by IATA code, name, city or country.
    Returns up to `limit` results, prioritising exact IATA matches.
    """
    q = query.strip()
    if not q:
        return []

    results: list[dict] = []
    seen_iata: set[str] = set()

    # 1. Exact IATA match (case-insensitive)
    exact = await db[COLLECTION].find_one(
        {"iata_code": q.upper()},
        {"_id": 0},
    )
    if exact:
        results.append(exact)
        seen_iata.add(exact["iata_code"])

    # 2. Regex prefix match on multiple fields
    regex = {"$regex": f"^{q}", "$options": "i"}
    prefix_cursor = db[COLLECTION].find(
        {"$or": [
            {"iata_code": regex},
            {"city": regex},
            {"airport_name": {"$regex": q, "$options": "i"}},
            {"country": regex},
        ]},
        {"_id": 0},
    ).limit(limit * 2)

    async for doc in prefix_cursor:
        if doc["iata_code"] not in seen_iata:
            results.append(doc)
            seen_iata.add(doc["iata_code"])
        if len(results) >= limit:
            break

    return results[:limit]


# ── Distance ────────────────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine great-circle distance in kilometres."""
    R = 6371.0  # Earth radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def get_airport_by_iata(code: str) -> Optional[dict]:
    """Fetch a single airport by IATA code."""
    return await db[COLLECTION].find_one(
        {"iata_code": code.upper().strip()},
        {"_id": 0},
    )


async def calculate_distance(from_code: str, to_code: str) -> dict:
    """
    Compute the Haversine distance between two airports identified by IATA code.
    Returns a dict with full audit trail (coordinates, method, result).
    Raises ValueError for missing airports or coordinates.
    """
    from_airport = await get_airport_by_iata(from_code)
    if not from_airport:
        raise ValueError(f"Airport not found: {from_code}")

    to_airport = await get_airport_by_iata(to_code)
    if not to_airport:
        raise ValueError(f"Airport not found: {to_code}")

    # Validate coordinates
    for label, apt in [("from", from_airport), ("to", to_airport)]:
        if apt["latitude"] is None or apt["longitude"] is None:
            raise ValueError(
                f"Coordinates unavailable for {apt['iata_code']} ({apt['airport_name']})"
            )
        if not (-90 <= apt["latitude"] <= 90):
            raise ValueError(f"Invalid latitude for {apt['iata_code']}: {apt['latitude']}")
        if not (-180 <= apt["longitude"] <= 180):
            raise ValueError(f"Invalid longitude for {apt['iata_code']}: {apt['longitude']}")

    distance = haversine_km(
        from_airport["latitude"], from_airport["longitude"],
        to_airport["latitude"], to_airport["longitude"],
    )

    return {
        "distance_km": round(distance, 3),
        "method": "HAVERSINE",
        "earth_radius_km": 6371,
        "from": {
            "airport_code": from_airport["iata_code"],
            "airport_name": from_airport["airport_name"],
            "city": from_airport["city"],
            "country": from_airport["country"],
            "latitude": from_airport["latitude"],
            "longitude": from_airport["longitude"],
        },
        "to": {
            "airport_code": to_airport["iata_code"],
            "airport_name": to_airport["airport_name"],
            "city": to_airport["city"],
            "country": to_airport["country"],
            "latitude": to_airport["latitude"],
            "longitude": to_airport["longitude"],
        },
    }
