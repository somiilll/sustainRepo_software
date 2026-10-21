"""Waste (Generated / Recovered / Disposal / Spills): KPI rows, entry rules and display tree."""
from typing import Any, Dict, List, Optional

# (code, label, BRSR letter, hazardous?, field-key stem)
CATS = [
    ("e_waste", "E-waste", "(B)", True, "e_waste"),
    ("bio_medical", "Biomedical", "(C)", True, "bio_medical_waste"),
    ("battery", "Battery", "(E)", True, "battery_waste"),
    ("radioactive", "Radioactive", "(F)", True, "radioactive_waste"),
    ("other_hazardous", "Other hazardous waste", "(G)", True, "other_hazardous_waste"),
    ("plastic", "Plastic", "(A)", False, "plastic_waste"),
    ("c_and_d", "Construction & demolition", "(D)", False, "construction_and_demolition_waste"),
    ("other_non_hazardous", "Other non-hazardous waste", "(H)", False, "other_non_hazardous_waste"),
]

# op: (code, label, BRSR roman, GRI suffixes, overall field key)
RECOVERY_OPS = [
    ("recycled", "Recycled", "(i)", ["ii"], "waste_recycled"),
    ("reused", "Re-used", "(ii)", ["i"], "waste_re_used"),
    ("other_recovery", "Other recovery operations", "(iii)", ["iii"], "waste_other_recovery"),
]
DISPOSAL_OPS = [
    ("incineration", "Incineration", "(i)", ["i", "ii"], "waste_disposed_through_incineration"),
    ("landfilling", "Landfilling", "(ii)", ["iii"], "waste_disposed_through_landfilling"),
    ("other_disposal", "Other disposal operations", "(iii)", ["iv"], "waste_disposed_through_other_operations"),
]

STREAMS = {
    "Generated": {"verb": "generated", "title": "Generated", "gri": ("306-3-a", "306-3-a", "306-3-a"), "ops": [],
                  "op_group": None, "loc": None},
    "Recovered / Diverted from disposal": {"verb": "recovered", "title": "Recovered", "gri": ("306-4-a", "306-4-b", "306-4-c"),
                                           "ops": RECOVERY_OPS, "op_group": "By Recovery Operation",
                                           "loc": ("306-4-d-i", "306-4-d-ii")},
    "Disposal": {"verb": "disposed", "title": "Disposed", "gri": ("306-5-a", "306-5-b", "306-5-c"),
                 "ops": DISPOSAL_OPS, "op_group": "By Disposal Operation", "loc": ("306-5-d-i", "306-5-d-ii")},
}

OLD_CODES = {
    "Generated": {
        "quantity": "ENV_WASTE_GENERATED_IN_METRIC_TONNES",
        "hazardous_waste_generated": "ENV_QUANTITY_OF_HAZARDOUS_WASTE_GENERATED",
        "non_hazardous_waste_generated": "ENV_QUANTITY_OF_NONHAZARDOUS_WASTE_GENERATED",
    },
    "Recovered / Diverted from disposal": {
        "quantity": "ENV_WASTE_RECOVERED_IN_METRIC_TONNES",
        "hazardous_waste_recovered": "ENV_QUANTITY_OF_HAZARDOUS_WASTE_RECOVERED",
        "non_hazardous_waste_recovered": "ENV_QUANTITY_OF_NONHAZARDOUS_WASTE_RECOVERED",
        "hazardous_waste_recovered_onsite": "ENV_QUANTITY_OF_HAZARDOUS_WASTE_RECOVERED_ON",
        "hazardous_waste_recovered_offsite": "ENV_QUANTITY_OF_HAZARDOUS_WASTE_RECOVERED_OF",
        "non_hazardous_waste_recovered_onsite": "ENV_QUANTITY_OF_NONHAZARDOUS_WASTE_RECOVERED_1",
        "non_hazardous_waste_recovered_offsite": "ENV_QUANTITY_OF_NONHAZARDOUS_WASTE_RECOVERED_2",
    },
    "Disposal": {
        "quantity": "ENV_WASTE_DISPOSED_IN_METRIC_TONNES",
        "hazardous_waste_disposed": "ENV_QUANTITY_OF_HAZARDOUS_WASTE",
        "non_hazardous_waste_disposed": "ENV_QUANTITY_OF_NONHAZARDOUS_WASTE",
        "hazardous_waste_disposed_onsite": "ENV_QUANTITY_OF_HAZARDOUS_WASTE_DISPOSED_ONS",
        "hazardous_waste_disposed_offsite": "ENV_QUANTITY_OF_HAZARDOUS_WASTE_DISPOSED_OFF",
        "non_hazardous_waste_disposed_onsite": "ENV_QUANTITY_OF_NONHAZARDOUS_WASTE_DISPOSED_",
        "non_hazardous_waste_disposed_offsite": "ENV_QUANTITY_OF_NONHAZARDOUS_WASTE_DISPOSED__1",
    },
}

SPILL_TABLE_KEY = "spill_records"
SPILL_COUNT_KEY = "number_of_significant_spills"
SPILL_TOTAL_KEY = "total_volume_of_significant_spills"
SPILL_UNIT_FACTORS = {"litres": 1.0, "kilolitres": 1000.0}
SPILL_MATERIALS = ["Oil spills", "Fuel spills", "Spills of wastes", "Spills of chemicals", "Others"]
SPILL_COLUMNS = [
    {"key": "location", "label": "Location", "type": "text", "gri_disclosure": "306-3 (2016)-b-i"},
    {"key": "volume", "label": "Volume of spill", "type": "number", "gri_disclosure": "306-3 (2016)-b-ii"},
    {"key": "volume_unit", "label": "Unit", "type": "dropdown", "options": ["Litres", "KiloLitres"]},
    {"key": "material", "label": "Material", "type": "dropdown", "options": SPILL_MATERIALS, "gri_disclosure": "306-3 (2016)-b-iii"},
    {"key": "other_material_detail", "label": "Other material detail (if 'Others')", "type": "text", "gri_disclosure": "306-3 (2016)-b-iii"},
    {"key": "surface_affected", "label": "Surface affected", "type": "dropdown", "options": ["Soil", "Water", "Both"], "gri_disclosure": "306-3 (2016)-b-iii"},
]


def _build_stream(sub: str) -> Dict[str, Any]:
    cfg = STREAMS[sub]
    verb, title = cfg["verb"], cfg["title"]
    gri_total, gri_haz, gri_non = cfg["gri"]
    old = OLD_CODES[sub]
    rows: List[Dict[str, Any]] = []
    tree: List[tuple] = []
    sums: List[tuple] = []
    quality: List[tuple] = []

    def add(key, name, brsr, gri, group, level, parent=None, label=None):
        rows.append({"key": key, "name": name, "brsr": brsr, "gri": gri, "old_code": old.get(key),
                     "new_field": label or name, "unit": True, "kpi": True})
        tree.append((key, group, level, parent))

    haz_total, non_total = f"hazardous_waste_{verb}", f"non_hazardous_waste_{verb}"
    ops = cfg["ops"]
    add("quantity", f"Waste {title} (Total)", "P6-E9", gri_total, "Total", 0, label=f"Total waste {verb}")

    for is_haz, gri_x, group, total_key, total_name in (
        (True, gri_haz, "Hazardous Waste", haz_total, f"Hazardous Waste {title} (Total)"),
        (False, gri_non, "Non-hazardous Waste", non_total, f"Non-hazardous Waste {title} (Total)"),
    ):
        add(total_key, total_name, "P6-E9", gri_x, group, 1, "quantity", label="Hazardous Waste" if is_haz else "Non-hazardous Waste")
        cats = [c for c in CATS if c[3] == is_haz]
        for code, label, rom, _h, stem in cats:
            ckey = f"{stem}_{verb}"
            add(ckey, f"{label} {title}", f"P6-E9 {rom}", f"{gri_x}, {gri_total}", group, 2, total_key, label=label)
        sums.append((total_key, [f"{stem}_{verb}" for _c, _l, _r, _h, stem in cats]))

    for code, label, rom, sfx, okey in ops:
        gri = ", ".join([f"{gri_haz}-{s}" for s in sfx] + [f"{gri_non}-{s}" for s in sfx])
        add(okey, f"Waste {title} - {label}", f"P6-E9 {rom}", gri, cfg["op_group"], 1, label=label)

    sums.append(("quantity", [haz_total, non_total]))
    return {"rows": rows, "tree": tree, "rules": {"root": "quantity", "sums": sums, "le": [], "quality": quality, "other": []}}


_BUILT = {sub: _build_stream(sub) for sub in STREAMS}

WASTE_RULES = {sub.lower(): built["rules"] for sub, built in _BUILT.items()}
WASTE_LABELS = {r["key"]: r["new_field"] for built in _BUILT.values() for r in built["rows"]}


def waste_rows(sub: str) -> List[Dict[str, Any]]:
    if sub == "Spills":
        return spill_rows()
    return _BUILT[sub]["rows"]


def spill_rows() -> List[Dict[str, Any]]:
    gri = "306-3 (2016)-a"
    return [
        {"key": SPILL_COUNT_KEY, "name": "Number of Significant Spills", "brsr": None, "gri": gri, "old_code": None,
         "new_field": "Number of significant spills", "unit": False, "kpi": True},
        {"key": SPILL_TOTAL_KEY, "name": "Total Volume of Significant Spills", "brsr": None, "gri": gri, "old_code": None,
         "new_field": "Total volume of significant spills", "unit": True, "kpi": True},
    ]


def waste_tree_meta(sub: str) -> Dict[str, Dict[str, Any]]:
    if sub == "Spills":
        return {SPILL_COUNT_KEY: {"group": "Summary", "level": 0, "parent_key": None, "sum_parents": [], "order": 0},
                SPILL_TOTAL_KEY: {"group": "Summary", "level": 0, "parent_key": None, "sum_parents": [], "order": 1},
                SPILL_TABLE_KEY: {"group": "Spill Records", "level": 0, "parent_key": None, "sum_parents": [], "order": 2}}
    built = _BUILT[sub]
    sum_parents: Dict[str, List[str]] = {}
    for parent, children in built["rules"]["sums"]:
        for child in children:
            sum_parents.setdefault(child, []).append(parent)
    return {key: {"group": group, "level": level, "parent_key": parent,
                  "sum_parents": sum_parents.get(key, []), "order": i}
            for i, (key, group, level, parent) in enumerate(built["tree"])}


def apply_spill_rules(field_values: Dict[str, Any], is_draft: bool = False) -> Dict[str, Any]:
    """Count the spill rows and total their volume (converted to the chosen total unit)."""
    rows = field_values.get(SPILL_TABLE_KEY) or []
    if not isinstance(rows, list):
        raise ValueError("Spill records must be a list")
    clean = [r for r in rows if isinstance(r, dict) and any(v not in (None, "") for v in r.values())]
    total_unit = field_values.get(f"{SPILL_TOTAL_KEY}_unit") or "Litres"
    target = SPILL_UNIT_FACTORS.get(str(total_unit).lower(), 1.0)
    total = 0.0
    for i, row in enumerate(clean, start=1):
        raw = row.get("volume")
        try:
            volume = float(raw) if raw not in (None, "") else None
        except (TypeError, ValueError):
            raise ValueError(f"Spill {i}: invalid volume '{raw}'")
        if volume is not None and volume < 0:
            raise ValueError(f"Spill {i}: volume cannot be negative")
        if not is_draft:
            if volume is None:
                raise ValueError(f"Spill {i}: volume is required")
            if not row.get("material"):
                raise ValueError(f"Spill {i}: material is required")
            if row.get("material") == "Others" and not str(row.get("other_material_detail") or "").strip():
                raise ValueError(f"Spill {i}: specify the material when 'Others' is selected")
        if volume is not None:
            total += volume * SPILL_UNIT_FACTORS.get(str(row.get("volume_unit") or "Litres").lower(), 1.0) / target
    return {**field_values, SPILL_TABLE_KEY: clean, SPILL_COUNT_KEY: len(clean),
            SPILL_TOTAL_KEY: round(total, 6), f"{SPILL_TOTAL_KEY}_unit": total_unit}
