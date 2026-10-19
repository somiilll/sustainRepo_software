"""Organization & Facility service for Internal Data AI."""
from shared.database.mongo import db


async def get_info(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        return {"error": "Organization not found"}

    fac_query = {"organization_id": org_id}
    if facility_ids:
        fac_query["id"] = {"$in": facility_ids}
    facilities = await db.facilities.find(fac_query, {"_id": 0}).to_list(100)

    org_config = await db.esg_org_configs.find_one({"org_id": org_id}, {"_id": 0})

    return {
        "organization": {
            "name": org.get("name"),
            "corporate_address": org.get("corporate_address"),
            "industry": org.get("sector") or org.get("industry"),
            "base_year": org.get("base_year"),
            "reporting_frequency": org.get("reporting_frequency"),
            "org_boundaries": org.get("org_boundaries"),
        },
        "facilities": [
            {
                "id": f.get("id"),
                "name": f.get("name"),
                "address": f.get("address"),
                "sector": f.get("sector"),
                "country": f.get("country"),
                "state": f.get("state"),
            }
            for f in facilities
        ],
        "config": {
            "enabled_frameworks": (org_config or {}).get("enabled_frameworks", []),
            "enabled_modules": (org_config or {}).get("enabled_modules", []),
        },
        "total_facilities": len(facilities),
    }
