"""Set the Policy / Governance group on BRSR Section B questions. Backs up first; idempotent."""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db

POLICY = "Policy and management processes"
GOVERNANCE = "Governance, leadership and oversight"
GROUPS = {
    **{k: POLICY for k in (
        "ngrbc_policy_matrix", "policy_translated_to_procedures", "policy_extend_to_value_chain",
        "codes_certifications_standards", "commitments_goals_targets", "performance_against_targets")},
    **{k: GOVERNANCE for k in (
        "director_statement", "highest_authority_details", "sustainability_committee_details",
        "ngrbc_review_details", "performance_against_policies", "independent_policy_assessment")},
}


async def run() -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    backup = Path("/app/backups") / f"brsr_section_b_groups_{stamp}.json"
    backup.parent.mkdir(parents=True, exist_ok=True)
    docs = await db.esg_question_configs.find({"question_key": {"$in": list(GROUPS)}}, {"_id": 0}).to_list(100)
    backup.write_text(json.dumps(docs, default=str, indent=2), encoding="utf-8")
    updated = 0
    for key, group in GROUPS.items():
        result = await db.esg_question_configs.update_many({"question_key": key}, {"$set": {"group": group}})
        updated += result.modified_count
    return {"updated": updated, "backup": str(backup)}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run()), indent=2))
