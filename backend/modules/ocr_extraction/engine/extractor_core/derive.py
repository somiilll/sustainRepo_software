"""Step 6 - rows that follow from a primary row, always linked by parent_id so an edit to the parent flows down.

- Electricity  -> one Scope 3 C3 row 'Electricity - T&D losses and Generation' (Emergent combines both; the
  prototype made two rows, which is why its card said 3 rows while the table showed 2).
- Fuels        -> C3 well-to-tank row.  Steam/heat -> C3 row.
- Waste line that is ALSO the transport (e.g. 'Transportation of 5 MT hazardous waste to TSDF') -> waste row
  (Cat 5 + Waste module, no transport inside) + Cat 4 transport row.  Only 'waste transport' -> Cat 4 only
  (handled by the activity waste.transport_only).
- Argon/CO2 shielding-gas blend -> CO2 share as Scope 1 process emission + argon share as Cat 1 goods.
"""
from __future__ import annotations

import re

from .config import load

TRANSPORT_WORDS = re.compile(r"\b(transport|transportation|carting|cartage|hauling|freight|lifting|collection and transport|trip)\b", re.I)


def companion_specs(row: dict, item: dict) -> list[dict]:
    """Describe the extra rows; the pipeline turns each spec into a full row."""
    pol = load().policy
    tax = load().taxonomy
    act = tax.get(row["activity_id"])
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
    # waste disposal line that also carries the transport
    if act.get("waste_disposal") and pol["waste_transport"]["mode"] == "split_if_waste_details":
        text = " ".join(str(item.get(k) or "") for k in ("description", "description_en", "notes"))
        others = " ".join(x for x in ((item.get("doc") or {}).get("other_lines") or []) if x)
        # a separate transport line on the same document already carries the transport -> no extra row
        if TRANSPORT_WORDS.search(text) and not TRANSPORT_WORDS.search(others)                 and (item.get("disposal_method") or item.get("waste_type") or item.get("quantity")):
            out.append({"kind": "waste_transport", "ghg": {"scope": "scope_3", "category": pol["waste_transport"]["transport_category"],
                                                           "subcategory": "Road freight - waste transport"},
                        "formula": None, "activity_id": "waste.transport_only", "move_amount": True,
                        "label": f"Transport of waste - {row['extracted_item']}"})
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
