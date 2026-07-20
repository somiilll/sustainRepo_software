"""Emission Factor service for Internal Data AI."""
from shared.database.mongo import db


async def lookup(org_id: str, **kwargs) -> dict:
    fuel_type = kwargs.get("fuel_type") or kwargs.get("entity_name") or ""
    category = kwargs.get("category") or ""

    results = []

    # Search fuel_database
    fuel_query = {}
    if fuel_type:
        fuel_query["$or"] = [
            {"fuel_name": {"$regex": fuel_type, "$options": "i"}},
            {"category": {"$regex": fuel_type, "$options": "i"}},
        ]
    fuel_docs = await db.fuel_database.find(fuel_query, {"_id": 0}).to_list(10)
    for f in fuel_docs:
        results.append({
            "source": "Fuel Database",
            "fuel_name": f.get("fuel_name"),
            "category": f.get("category"),
            "scope": f.get("scope"),
            "co2_ef": f.get("emission_factor_co2"),
            "ch4_ef": f.get("emission_factor_ch4"),
            "n2o_ef": f.get("emission_factor_n2o"),
            "unit": f.get("unit") or f.get("emission_factor_unit"),
            "calorific_value": f.get("calorific_value"),
            "calorific_unit": f.get("calorific_value_unit"),
            "density": f.get("density"),
            "database": f.get("database_source") or f.get("source"),
        })

    # Search scope3_ef
    s3_query = {}
    if fuel_type:
        s3_query["$or"] = [
            {"activity": {"$regex": fuel_type, "$options": "i"}},
            {"category": {"$regex": fuel_type, "$options": "i"}},
        ]
    if category:
        s3_query["category"] = {"$regex": category, "$options": "i"}
    s3_docs = await db.scope3_ef.find(s3_query, {"_id": 0}).to_list(10)
    for s in s3_docs:
        results.append({
            "source": "Scope 3 EF Database",
            "activity": s.get("activity"),
            "category": s.get("category"),
            "method": s.get("method"),
            "emission_factor": s.get("emission_factor"),
            "unit": s.get("unit"),
            "region": s.get("region"),
            "database_source": s.get("source"),
        })

    # Check org-level overrides
    overrides = await db.emission_factors.find(
        {"$or": [
            {"name": {"$regex": fuel_type, "$options": "i"}},
            {"category": {"$regex": fuel_type, "$options": "i"}},
        ]},
        {"_id": 0}
    ).to_list(5)
    for o in overrides:
        results.append({
            "source": "Custom Override",
            "name": o.get("name"),
            "factor": o.get("factor"),
            "unit": o.get("unit"),
            "scope": o.get("scope"),
            "category": o.get("category"),
            "is_custom": True,
        })

    return {"query": fuel_type or category, "total_found": len(results), "emission_factors": results}
