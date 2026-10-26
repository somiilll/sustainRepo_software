"""Hide the standalone BRSR LTIFR question (LTIFR is captured in the safety incidents table)."""
import asyncio
from shared.database.mongo import db

QUESTION_KEY = "ltifr_employees_workers"


async def main():
    result = await db.esg_question_configs.update_many(
        {"question_key": QUESTION_KEY}, {"$set": {"hidden": True}}
    )
    print(f"matched={result.matched_count} modified={result.modified_count}")


if __name__ == "__main__":
    asyncio.run(main())
