"""Create GRI KPI framework mappings for every KPI definition GRI reference that has none (idempotent, tagged gri_kpi_ref_sync). Run: python -m scripts.sync_gri_kpi_reference_mappings"""
import asyncio
import uuid
from datetime import datetime, timezone

from shared.database.mongo import db

REVIEW_SOURCE = "gri_kpi_ref_sync"


def resolve(question_key, questions):
    """(question_key, answer_path) from a KPI GRI reference key, or None if no questionnaire destination exists."""
    if question_key in questions:
        return question_key, None
    parent, _, sub_key = (question_key or "").rpartition("_")
    config = questions.get(parent)
    if config and config.get("input_type") == "sub_questions" and sub_key in {s["sub_key"] for s in config.get("sub_questions") or []}:
        return parent, sub_key
    return None


def derived_key(reference):
    return "gri_" + reference.replace("-", "_").replace(" ", "_").replace("(", "").replace(")", "")


async def main():
    now = datetime.now(timezone.utc).isoformat()
    removed = (await db.kpi_framework_mappings.delete_many({"framework": "GRI", "review_source": REVIEW_SOURCE})).deleted_count
    questions = {q["question_key"]: q async for q in db.esg_question_configs.find({"framework": "GRI"}, {"_id": 0, "question_key": 1, "input_type": 1, "sub_questions": 1})}
    mapped = {(d["kpi_id"], d["reference"]) async for d in db.kpi_framework_mappings.find({"framework": "GRI", "is_active": True}, {"_id": 0, "kpi_id": 1, "reference": 1})}
    pending, skipped = [], []
    async for kpi in db.esg_kpi_definitions.find({"status": {"$ne": "archived"}, "framework_references.framework": "GRI"}, {"_id": 0}):
        for ref in kpi["framework_references"]:
            if ref["framework"] != "GRI" or (kpi["id"], ref["reference"]) in mapped:
                continue
            target = resolve(ref.get("question_key") or derived_key(ref["reference"]), questions)
            (pending if target else skipped).append((kpi, ref, target))
    cells = {}
    for kpi, ref, target in pending:
        cells.setdefault(target, []).append(kpi["id"])
    created = 0
    for kpi, ref, (question_key, answer_path) in pending:
        exact = len(cells[(question_key, answer_path)]) == 1
        rule = "avg" if (kpi.get("aggregation_type") or "").lower() in {"avg", "average"} else "sum"
        await db.kpi_framework_mappings.insert_one({
            "id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "reviewed_at": now, "kpi_id": kpi["id"], "source_kpi_ids": [kpi["id"]],
            "source_metric_code": kpi["metric_code"], "source_metric_name": kpi["metric_name"], "source_category": kpi.get("category_name"),
            "source_subcategory": kpi.get("subcategory"), "source_sub_subcategory": kpi.get("sub_subcategory") or "",
            "source_tag": f"{kpi.get('category_name')} → {kpi.get('subcategory')}", "framework": "GRI", "reference": ref["reference"],
            "question_key": question_key, "answer_path": answer_path, "display_label": kpi["metric_name"], "aggregation_rule": rule,
            "destination_unit": (kpi.get("unit_config") or {}).get("default_unit") or None, "include_unit": True,
            "mapping_status": "exact_destination" if exact else "needs_answer_path",
            "mapping_role": "direct_destination" if exact else "supporting_source", "is_active": True,
            "period_column_strategy": "reporting_year_filter", "reporting_period_source": "runtime_filter", "review_source": REVIEW_SOURCE})
        created += 1
    exact_count = sum(1 for ids in cells.values() if len(ids) == 1)
    print(f"removed={removed} created={created} exact_cells={exact_count} shared_cells={len(cells) - exact_count} skipped_no_question={len(skipped)}")
    for kpi, ref, _ in skipped[:40]:
        print("skipped", ref["reference"], "|", kpi["metric_name"][:50])


if __name__ == "__main__":
    asyncio.run(main())
