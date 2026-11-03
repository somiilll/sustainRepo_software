"""Map KPIs to GRI 2-27-a (i fines), 2-7-a, 2-7-b (i permanent, ii temporary) and 2-9-c (v gender) (idempotent, tagged gri_2_autofill_sync). Run: python -m scripts.add_gri2_autofill_mappings"""
import asyncio
import uuid
from datetime import datetime, timezone

from shared.database.mongo import db

REVIEW_SOURCE = "gri_2_autofill_sync"
DIVERSITY = "Employee Diversity - "
BOARD = "Board of Directors Diversity - Board of Directors (Total)"
PLAN = [
    ("2-27-a", "gri_2_27_a", "i", [("Non-compliance - Resulting in Fine / Penalty", "Resulting in Fine / Penalty")]),
    ("2-7-a", "gri_2_7_a", None, [(DIVERSITY + "Total Employees", "Total"), (DIVERSITY + "Total Employees (Female)", "Female"), (DIVERSITY + "Total Employees (Male)", "Male")]),
    ("2-7-b", "gri_2_7_b", "i", [(DIVERSITY + "Permanent employees", "Total"), (DIVERSITY + "Permanent employees (Female)", "Female"), (DIVERSITY + "Permanent employees (Male)", "Male")]),
    ("2-7-b", "gri_2_7_b", "ii", [(DIVERSITY + "Temporary", "Total"), (DIVERSITY + "Temporary (Female)", "Female"), (DIVERSITY + "Temporary (Male)", "Male")]),
    ("2-9-c", "gri_2_9_c", "v", [(BOARD + " (Female)", "Female"), (BOARD + " (Male)", "Male")]),
]


async def main():
    now = datetime.now(timezone.utc).isoformat()
    created = 0
    for reference, question_key, answer_path, rows in PLAN:
        for order, (metric_name, label) in enumerate(rows, 1):
            kpi = await db.esg_kpi_definitions.find_one({"metric_name": metric_name, "status": {"$ne": "archived"}}, {"_id": 0})
            if not kpi:
                print("missing KPI:", metric_name)
                continue
            doc = {
                "kpi_id": kpi["id"], "source_kpi_ids": [kpi["id"]], "source_metric_code": kpi.get("metric_code"), "source_metric_name": kpi["metric_name"],
                "source_category": kpi.get("category_name"), "source_subcategory": kpi.get("subcategory"), "source_sub_subcategory": kpi.get("sub_subcategory") or "",
                "source_tag": f"{kpi.get('category_name')} → {kpi.get('subcategory')}", "framework": "GRI", "reference": reference,
                "question_key": question_key, "answer_path": answer_path, "display_label": label, "display_order": order, "aggregation_rule": "sum",
                "destination_unit": (kpi.get("unit_config") or {}).get("default_unit") or "count", "include_unit": True,
                "mapping_status": "exact_destination", "mapping_role": "direct_destination", "is_active": True,
                "period_column_strategy": "reporting_year_filter", "reporting_period_source": "runtime_filter", "review_source": REVIEW_SOURCE,
            }
            result = await db.kpi_framework_mappings.update_one(
                {"framework": "GRI", "question_key": question_key, "answer_path": answer_path, "kpi_id": kpi["id"], "review_source": REVIEW_SOURCE},
                {"$set": {**doc, "updated_at": now}, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now, "reviewed_at": now}}, upsert=True)
            created += bool(result.upserted_id)
    print(f"created={created}")


if __name__ == "__main__":
    asyncio.run(main())
