"""Formula & Calculation service for Internal Data AI."""
from shared.database.mongo import db


async def explain(org_id: str, **kwargs) -> dict:
    """Explain how something is calculated — formula, EF, methodology."""
    fuel_type = kwargs.get("fuel_type") or kwargs.get("entity_name") or ""
    category = kwargs.get("category") or ""
    scope = kwargs.get("scope") or ""

    results = {}

    # Find matching formulas
    formula_query = {}
    if category:
        formula_query["$or"] = [
            {"name": {"$regex": category, "$options": "i"}},
            {"description": {"$regex": category, "$options": "i"}},
        ]
    formulas = await db.ce_formulas.find(formula_query if formula_query else {}, {"_id": 0}).to_list(5)
    if formulas:
        results["formulas"] = [
            {
                "name": f.get("name"),
                "description": f.get("description"),
                "definition": f.get("definition"),
                "scope_ids": f.get("scope_ids"),
                "category_ids": f.get("category_ids"),
                "is_active": f.get("is_active"),
            }
            for f in formulas
        ]

    # Find relevant variables
    variables = await db.ce_variables.find({}, {"_id": 0, "key": 1, "label": 1, "type": 1, "default_unit": 1, "description": 1}).to_list(50)
    results["variables"] = variables[:10]

    # Find calculation audit log for specific records
    if fuel_type:
        audit_q = {"$or": [
            {"inputs.fuel_type": {"$regex": fuel_type, "$options": "i"}},
            {"context.fuel_type": {"$regex": fuel_type, "$options": "i"}},
        ]}
        audits = await db.ce_calculation_audit_logs.find(audit_q, {"_id": 0}).sort("created_at", -1).to_list(3)
        if audits:
            results["calculation_examples"] = [
                {
                    "formula_id": a.get("formula_id"),
                    "inputs": a.get("inputs"),
                    "outputs": a.get("outputs"),
                    "audit_log": a.get("audit_log"),
                    "created_at": a.get("created_at"),
                }
                for a in audits
            ]

    # Properties & unit conversions
    props = await db.ce_properties.find({}, {"_id": 0}).to_list(20)
    results["properties"] = [{"key": p.get("key"), "label": p.get("label"), "unit": p.get("unit")} for p in props]

    conversions = await db.ce_unit_conversions.find({"is_active": True}, {"_id": 0}).to_list(20)
    results["unit_conversions"] = [
        {"from": c.get("from_unit"), "to": c.get("to_unit"), "factor": c.get("factor")}
        for c in conversions
    ]

    return results
