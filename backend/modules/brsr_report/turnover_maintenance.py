"""Idempotent maintenance for workforce turnover units and derived KPIs."""
from datetime import datetime, timezone

from shared.database.mongo import db


TURNOVER_RATE_FORMULA = "(leaving / ((start_of_year + end_of_year) / 2)) * 100"
TURNOVER_SUBCATEGORIES = ["Employee Turnover", "Workers Turnover"]


async def ensure_turnover_configuration() -> None:
    now = datetime.now(timezone.utc).isoformat()
    await db.esg_kpi_definitions.update_many(
        {
            "metric_name": {"$regex": "^(Employee|Worker) Turnover Rate ", "$options": "i"},
            "status": {"$ne": "archived"},
        },
        {
            "$set": {
                "formula_config.formula_definition": TURNOVER_RATE_FORMULA,
                "metadata.calculation_scope": "per_record_then_period_aggregate",
                "metadata.period_aggregation": "average",
                "updated_at": now,
            }
        },
    )

    records = await db.social_records.find(
        {
            "category": "Employees/Worker",
            "subcategory": {"$in": TURNOVER_SUBCATEGORIES},
        },
        {"_id": 0, "id": 1, "field_values": 1},
    ).to_list(10000)
    for record in records:
        field_values = dict(record.get("field_values") or {})
        changed = False
        for key, value in list(field_values.items()):
            if key.endswith("_unit") or not isinstance(value, (int, float)):
                continue
            unit_key = f"{key}_unit"
            if field_values.get(unit_key) != "Number":
                field_values[unit_key] = "Number"
                changed = True
        if changed:
            await db.social_records.update_one(
                {"id": record["id"]},
                {"$set": {"field_values": field_values, "unit_metadata_migrated_at": now}},
            )