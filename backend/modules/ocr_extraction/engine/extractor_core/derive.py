"""Step 6 - rows that follow from a primary row, always linked by parent_id so an edit to the parent flows down.

- Electricity  -> one Scope 3 C3 row 'Electricity - T&D losses and Generation' (Emergent combines both; the
  prototype made two rows, which is why its card said 3 rows while the table showed 2).
- Fuels        -> C3 well-to-tank row.  Steam/heat -> C3 row.
- A printed line holding two activities (waste moved AND treated) is split by the reader, not here.
- Argon/CO2 shielding-gas blend -> CO2 share as Scope 1 process emission + argon share as Cat 1 goods.
"""
from __future__ import annotations

import re

from .config import load


def companion_specs(row: dict, item: dict) -> list[dict]:
    """Describe the extra rows; the pipeline turns each spec into a full row."""
    pol = load().policy
    act = load().taxonomy.get(row["activity_id"])
    ghg = row["ghg"]
    out = []
    comps = pol["companions"]
    if "electricity" in act["companions"] and comps["electricity"]["enabled"] and ghg["scope"] == "scope_2":
        out.append({"kind": "c3_electricity", "ghg": {"scope": "scope_3", "category": "cat_3", "subcategory": comps["electricity"]["subcategory_label"]},
                    "formula": "s3_activity", "use_quantity": True, "label": f"T&D losses and generation - {row['extracted_item']}"})
    if "fuel_wtt" in act["companions"] and comps["fuel_wtt"]["enabled"] and ghg["scope"] in ("scope_1", "biogenic"):
        out.append({"kind": "c3_wtt", "ghg": {"scope": "scope_3", "category": "cat_3", "subcategory": comps["fuel_wtt"]["subcategory_label"]},
                    "formula": "s3_activity", "use_quantity": True, "label": f"Well-to-tank - {row['extracted_item']}"})
    if "steam_heat" in act["companions"] and comps["steam_heat"]["enabled"] and ghg["scope"] == "scope_2":
        out.append({"kind": "c3_heat", "ghg": {"scope": "scope_3", "category": "cat_3", "subcategory": comps["steam_heat"]["subcategory_label"]},
                    "formula": "s3_activity", "use_quantity": True, "label": f"T&D losses and generation - {row['extracted_item']}"})
    return out


def co2_share(text: str) -> float | None:
    """'Ar 82% CO2 18%' -> 0.18 ; 'CO2 20%' -> 0.2 ; 'Argon/CO2 80:20' -> 0.2"""
    t = text.lower().replace("₂", "2")
    m = re.search(r"co2\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)\s*%", t) or re.search(r"(\d{1,2}(?:\.\d+)?)\s*%\s*co2", t)
    if m:
        return float(m.group(1)) / 100
    m = re.search(r"(?:ar(?:gon)?\s*[/+-]\s*co2|ar(?:gon)?.*co2).*?(\d{1,2})\s*[:/]\s*(\d{1,2})", t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return b / (a + b) if a + b else None
    return None
