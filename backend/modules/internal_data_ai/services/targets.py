"""Targets service for Internal Data AI."""
from shared.database.mongo import db


async def get_progress(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    target_name = kwargs.get("target_name") or kwargs.get("entity_name") or ""

    # ESG targets
    esg_query = {"organization_id": org_id}
    if target_name:
        esg_query["target_name"] = {"$regex": target_name, "$options": "i"}
    esg_targets = await db.esg_targets.find(esg_query, {"_id": 0}).to_list(20)

    # SBTi targets
    sbti_query = {"organization_id": org_id}
    if target_name:
        sbti_query["target_name"] = {"$regex": target_name, "$options": "i"}
    sbti_targets = await db.sbti_targets.find(sbti_query, {"_id": 0}).to_list(10)

    results = []
    for t in esg_targets:
        results.append({
            "type": "ESG Target",
            "name": t.get("target_name"),
            "section": t.get("section"),
            "category": t.get("category"),
            "metric": t.get("metric_label"),
            "baseline_value": t.get("baseline_value"),
            "target_value": t.get("target_value"),
            "current_value": t.get("current_value"),
            "target_year": t.get("target_year"),
            "baseline_year": t.get("baseline_year"),
            "status": t.get("status"),
            "unit": t.get("unit"),
        })

    for t in sbti_targets:
        results.append({
            "type": "SBTi Target",
            "name": t.get("target_name"),
            "term": t.get("term_type"),
            "base_year": t.get("base_year"),
            "target_year": t.get("target_year"),
            "tracking_mode": t.get("tracking_mode"),
            "kpi_name": t.get("kpi_name"),
        })

    return {"total_targets": len(results), "targets": results}
