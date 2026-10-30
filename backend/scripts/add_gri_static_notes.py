"""Set editable static methodology notes on GRI questions and add the missing 305-2-e / 305-3-f questions (idempotent). Run: python -m scripts.add_gri_static_notes"""
import asyncio
import uuid
from datetime import datetime, timezone

from shared.database.mongo import db

MISSING = {
    "gri_305_2_e": ("305-2", "Energy indirect (Scope 2) GHG emissions", "Source of the emission factors and the global warming potential (GWP) rates used, or a reference to the GWP source.", 5),
    "gri_305_3_f": ("305-3", "Other indirect (Scope 3) GHG emissions", "Source of the emission factors and the global warming potential (GWP) rates used, or a reference to the GWP source.", 6),
}
INTENSITY_SCOPE = "This intensity covers scope1 + scope 2"
ENERGY_WITHIN = "Energy intensity includes energy consumption within the organization"
ENERGY_TYPES = "This includes fuel, heating, electricity, steam and cooling"
IPCC = "IPCC is used in conversion"
REVENUE = "Revenue is used to calculate intensity"
NOTES = {
    "gri_102_8_b": INTENSITY_SCOPE, "gri_305_4_c": INTENSITY_SCOPE,
    "gri_103_4_b": ENERGY_WITHIN, "gri_302_3_d": ENERGY_WITHIN,
    "gri_103_4_c": ENERGY_TYPES, "gri_302_3_c": ENERGY_TYPES,
    "gri_302_1_g": IPCC, "gri_305_1_e": IPCC,
    "gri_302_3_b": REVENUE, "gri_305_4_b": REVENUE,
    "gri_305_2_e": "CEA's emissions factor is used and IPCC is used for GWP",
    "gri_305_3_f": "Emission factor is used of USEEIO, USEPA, DEFRA, IPCC, CEA",
}


async def main():
    now = datetime.now(timezone.utc).isoformat()
    template = await db.esg_question_configs.find_one({"question_key": "gri_305_1_f"}, {"_id": 0})
    added = 0
    for key, (disclosure, name, description, order) in MISSING.items():
        if not await db.esg_question_configs.find_one({"question_key": key}, {"_id": 1}):
            await db.esg_question_configs.insert_one({**template, "id": str(uuid.uuid4()), "question_key": key, "disclosure_id": disclosure,
                                                      "disclosure_name": name, "description": description, "question_order": order, "created_at": now, "updated_at": now})
            added += 1
    for key, note in NOTES.items():
        await db.esg_question_configs.update_one({"question_key": key, "static_note": {"$exists": False}}, {"$set": {"static_note": note, "updated_at": now}})
    print(f"questions added={added} notes set={await db.esg_question_configs.count_documents({'question_key': {'$in': list(NOTES)}, 'static_note': {'$exists': True}})}")


if __name__ == "__main__":
    asyncio.run(main())
