"""Backfill explicit Yes/No point scores for ESG Annual Basic, Standard, and Advanced."""
import asyncio
import sys

sys.path.insert(0, "/app/backend")

from modules.supplier_assessment.questionnaire_service import migrate_system_questionnaire_point_scores


async def main() -> None:
    result = await migrate_system_questionnaire_point_scores()
    print(
        "System questionnaire point-score migration complete: "
        f"{result['questions_updated']} updated across "
        f"{result['questionnaires']} questionnaires "
        f"({result['questions_checked']} Yes/No questions checked)."
    )


if __name__ == "__main__":
    asyncio.run(main())