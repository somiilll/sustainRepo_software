"""One-time cleanup: rename legacy saved BRSR table row keys (wrk_ -> workers_, thirdparty -> third_party ...) to current names.
Dry run by default; pass --apply to write. Original value is kept in legacy_value_backup. Run: python -m scripts.rename_legacy_brsr_keys [--apply]"""
import asyncio
import copy
import sys
from datetime import datetime, timezone

from modules.brsr_report.generic_render import _canon, _empty
from modules.brsr_report.section_c_overrides import apply_overrides
from shared.database.mongo import db


async def main(apply: bool):
    row_keys = {}
    async for config in db.esg_question_configs.find({"frameworks": {"$in": ["BRSR"]}, "table_config.fixed_rows": {"$exists": True}}, {"_id": 0}):
        row_keys[config["question_key"]] = [r["key"] for r in apply_overrides(config)["table_config"]["fixed_rows"] if not r.get("section_header") and not r.get("sub_header")]
    renamed = conflicts = 0
    async for doc in db.organization_esg_responses.find({"framework": {"$in": ["BRSR", "brsr"]}, "question_key": {"$in": list(row_keys)}}):
        original = doc.get("value")
        if not isinstance(original, dict):
            continue
        value = copy.deepcopy(original)
        holder = value["rows"] if isinstance(value.get("rows"), dict) else value
        wanted = {_canon(k): k for k in row_keys[doc["question_key"]]}
        changes = {}
        for key in list(holder):
            target = wanted.get(_canon(key))
            if not target or target == key:
                continue
            if not _empty(holder.get(target)):
                conflicts += 1
                print(f"CONFLICT {doc['question_key']} {doc.get('reporting_year')}: {key} and {target} both have data (keeping {target}, dropping {key})")
                changes[key] = None
                continue
            changes[key] = target
        if not changes:
            continue
        for old, new in changes.items():
            moved = holder.pop(old)
            if new:
                holder[new] = moved
        renamed += sum(1 for new in changes.values() if new)
        print(f"{'RENAME' if apply else 'would rename'} {doc['question_key']} {doc.get('reporting_year')}: {changes}")
        if apply:
            await db.organization_esg_responses.update_one(
                {"_id": doc["_id"]},
                {"$set": {"value": value, "legacy_keys_renamed_at": datetime.now(timezone.utc).isoformat()}},
            )
            await db.organization_esg_responses.update_one({"_id": doc["_id"], "legacy_value_backup": {"$exists": False}}, {"$set": {"legacy_value_backup": original}})
    print(f"renamed={renamed} conflicts={conflicts} apply={apply}")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
