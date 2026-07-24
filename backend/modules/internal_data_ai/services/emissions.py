"""Emissions service for Internal Data AI."""
from shared.database.mongo import db


async def search_records(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    query = {"organization_id": org_id}
    if facility_ids:
        query["facility_id"] = {"$in": facility_ids}

    scope = kwargs.get("scope")
    if scope:
        scope_num = scope.replace("scope ", "").replace("Scope ", "").strip()
        query["scope"] = {"$regex": scope_num}

    category = kwargs.get("category")
    if category:
        query["$or"] = [
            {"category": {"$regex": category, "$options": "i"}},
            {"sub_category": {"$regex": category, "$options": "i"}},
        ]

    fuel_type = kwargs.get("fuel_type")
    if fuel_type:
        query["fuel_type"] = {"$regex": fuel_type, "$options": "i"}

    period = kwargs.get("period")
    if period:
        query["$or"] = query.get("$or", []) + [
            {"reporting_period.year": {"$regex": str(period), "$options": "i"}},
        ]

    records = await db.emission_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)

    # Also get facility names for context
    fac_ids = list(set(r.get("facility_id") for r in records if r.get("facility_id")))
    fac_map = {}
    if fac_ids:
        facs = await db.facilities.find({"id": {"$in": fac_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        fac_map = {f["id"]: f["name"] for f in facs}

    summary = []
    for r in records[:20]:
        summary.append({
            "id": r.get("id"),
            "facility": fac_map.get(r.get("facility_id"), r.get("facility_id")),
            "scope": r.get("scope"),
            "category": r.get("category"),
            "sub_category": r.get("sub_category"),
            "fuel_type": r.get("fuel_type"),
            "quantity": r.get("quantity"),
            "unit": r.get("unit"),
            "total_emissions": r.get("total_emissions"),
            "co2e_emissions": r.get("co2e_emissions"),
            "status": r.get("status"),
            "reporting_period": r.get("reporting_period"),
        })

    return {
        "total_found": len(records),
        "showing": len(summary),
        "records": summary,
    }
