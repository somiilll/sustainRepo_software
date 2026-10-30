"""Reclaimed Products & Packaging: add per-product-category % KPI (BRSR P2-L5, GRI 301-3-a) and clear refs from the Average KPI (idempotent)."""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

from shared.database.mongo import db

CODE = "ENV_RECLAIMED_PRODUCTS_BY_CATEGORY"
AVERAGE_CODE = "ENV_OF_RECLAIMED_PRODUCTS"
CATEGORY, SUB = "Material", "Reclaimed Products & Packaging"


async def main():
    now = datetime.now(timezone.utc).isoformat()
    average = await db.esg_kpi_definitions.find_one({"metric_code": AVERAGE_CODE}, {"_id": 0})
    os.makedirs("/app/backups", exist_ok=True)
    with open(f"/app/backups/reclaimed_products_{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H%M%S')}.json", "w") as file:
        json.dump(average, file, default=str)
    refs = [{"framework": "BRSR", "reference": "P2-L5", "question_key": "p2_reclaimed_products_pct", "answer_path": None, "reference_type": "exact"},
            {"framework": "GRI", "reference": "301-3-a", "question_key": "gri_301_3_a", "answer_path": None, "reference_type": "exact"}]
    doc = {k: v for k, v in average.items() if k not in {"id", "created_at", "created_by", "created_by_name", "updated_by", "updated_by_name", "tree_group", "tree_level", "tree_order", "tree_parent_key"}}
    doc.update({
        "metric_code": CODE, "metric_name": "% Reclaimed Products and Packaging (by Product Category)",
        "short_name": "% Reclaimed Products and Packaging (by Product Category)",
        "description": "% reclaimed products and packaging of products sold, reported separately for each product category.",
        "value_field": "reclaimed_products_by_category.percent_reclaimed", "aggregation_type": "avg",
        "source_config": {"records": {"table": {"field": "reclaimed_products_by_category", "value_column": "percent_reclaimed", "dimension_columns": ["product_category"]}}},
        "dimensions": ["organization", "product_category"], "tags": ["row-based"],
        "metadata": {"row_based": True, "table_field": "reclaimed_products_by_category", "dimension_columns": ["product_category"]},
        "brsr_reference": "P2-L5", "gri_disclosure": "301-3-a", "framework_references": refs, "updated_at": now,
    })
    existing = await db.esg_kpi_definitions.find_one({"metric_code": CODE}, {"_id": 0, "id": 1})
    if existing:
        await db.esg_kpi_definitions.update_one({"id": existing["id"]}, {"$set": doc})
    else:
        await db.esg_kpi_definitions.insert_one({"id": str(uuid.uuid4()), "created_at": now, "created_by": None, "created_by_name": "reclaimed products script", **doc})
    await db.esg_kpi_definitions.update_one({"metric_code": AVERAGE_CODE}, {"$set": {
        "brsr_reference": None, "gri_disclosure": None, "framework_references": [], "updated_at": now}})
    await db.kpi_framework_mappings.update_many({"source_metric_code": AVERAGE_CODE, "framework": {"$in": ["BRSR", "GRI"]}}, {"$set": {"is_active": False, "updated_at": now}})
    await db.esg_record_categories.update_one(
        {"category": CATEGORY, "subcategory": SUB},
        {"$set": {"fields.$[f].brsr_reference": None, "fields.$[f].gri_disclosure": None}},
        array_filters=[{"f.field_key": "average_percentage_reclaimed_products"}])
    print("done")


if __name__ == "__main__":
    asyncio.run(main())
