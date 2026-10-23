"""Water (Consumption / Withdrawal / Discharge / Recycle): field keys, KPI rows and entry rules."""
from typing import Any, Dict, List, Optional

from .env_schema import ENV_LABELS, ENV_SUM_RULES, apply_table_rules
from .workforce_schema import CATEGORY as WORKFORCE_CATEGORY, GRID_LABELS, GRID_RULES
from .waste_schema import WASTE_LABELS, WASTE_RULES, apply_spill_rules
from shared.unit_registry import can_convert, convert as unit_convert

TOLERANCE = 0.01

W_SOURCES = [
    ("surface", "Surface Water", "water_withdrawal_through_surface_water", "i", "(i)", "ENV_QUANTITY_LITRES_FROM_SURFACE_WATER_WITHD"),
    ("ground", "Ground Water", "water_withdrawal_through_ground_water", "ii", "(ii)", "ENV_QUANTITY_LITRES_FROM_GROUND_WATER_WITHDR"),
    ("seawater", "Seawater / Desalinated", "water_withdrawal_through_seawater_desalinated_water", "iii", "(iv)", "ENV_QUANTITY_LITRES_FROM_SEAWATER_DESALINATE"),
    ("produced", "Produced Water", "water_withdrawal_through_produced_water", "iv", "(v)", "ENV_QUANTITY_LITRES_FROM_PRODUCED_WATER_WITH"),
    ("third_party", "Third-party Water", "water_withdrawal_through_third_party_water", "v", "(iii)", "ENV_QUANTITY_LITRES_FROM_THIRD_PARTY_WATER_W"),
    ("others", "Others", "water_withdrawal_through_other_sources", None, "(v)", None),
]

D_DESTS = [
    ("surface", "Surface Water", "water_discharged_to_surface_water", "i", "(i)", "ENV_QUANTITY_LITRES_DISCHARGED_TO_SURFACE_WA"),
    ("ground", "Ground Water", "water_discharged_to_ground_water", "ii", "(ii)", "ENV_QUANTITY_LITRES_DISCHARGED_TO_GROUND_WAT"),
    ("seawater", "Seawater / Desalinated", "water_discharged_to_seawater_desalinated_water", "iii", "(iii)", "ENV_QUANTITY_LITRES_DISCHARGED_TO_SEAWATER"),
    ("third_party", "Third-party Water", "water_discharged_to_third_party_water", "iv", "(iv)", "ENV_QUANTITY_LITRES_DISCHARGED_TO_THIRD_PART"),
    ("others", "Others", "water_discharged_to_other_destinations", None, "(v)", None),
]

TREATMENTS = [
    ("no_treatment", "No treatment"),
    ("with_treatment", "With treatment"),
    ("primary", "Primary treatment"),
    ("secondary", "Secondary treatment"),
    ("tertiary", "Tertiary treatment"),
]

OVERALL_TREATMENT_KEYS = {
    "no_treatment": ("water_discharged_with_no_treatment_done", "Untreated discharge"),
    "with_treatment": ("quantity_discharged_with_treatment_done", "Treated discharge"),
    "primary": ("water_discharged_with_primary_level_treatment_done", "Primary treatment"),
    "secondary": ("water_discharged_with_secondary_level_treatment_done", "Secondary treatment"),
    "tertiary": ("water_discharged_with_tertiary_level_treatment_done", "Tertiary treatment"),
}


def ws_w_key(code: str) -> str:
    return f"ws_withdrawal_{code}"


def d_key(code: str, treatment: str, stress: bool) -> str:
    return f"{'ws_discharge' if stress else 'discharge'}_{code}_{treatment}"


def d_total_key(code: str, base: str, stress: bool) -> str:
    return f"ws_discharge_{code}" if stress else base


def _row(key, name, brsr=None, gri=None, old_code=None, new_field=None, unit=True):
    return {"key": key, "name": name, "brsr": brsr, "gri": gri, "old_code": old_code,
            "new_field": new_field, "unit": unit}


def withdrawal_rows() -> List[Dict[str, Any]]:
    rows = [_row("quantity", "Water Withdrawal (Total)", "P6-E3", "303-3-a", "ENV_QUANTITY_LITRES_WITHDRAWN")]
    for code, label, key, sfx, rom, old in W_SOURCES:
        rows.append(_row(key, f"Water Withdrawal - {label}", f"P6-E3 {rom}", f"303-3-a-{sfx}" if sfx else None, old,
                         new_field=f"Through {label}"))
    rows.append(_row("freshwater_withdrawal", None, None, "303-3-c-i", "ENV_FRESHWATER_WITHDRAWAL_1000_MGL_TOTAL_DIS"))
    rows.append(_row("other_water_withdrawal", None, None, "303-3-c-ii", "ENV_OTHER_WATER_WITHDRAWAL_1000_MGL_TOTAL_DI"))
    rows.append(_row("water_withdrawal_in_water_stress_area", "Water Withdrawal in Water-stress Areas (Total)",
                     "P6-L1", "303-3-b", "ENV_QUANTITY_FROM_WATER_STRESS_AREA"))
    for code, label, _k, _s, rom, _o in W_SOURCES:
        rows.append(_row(ws_w_key(code), f"Water Withdrawal in Water-stress Areas - {label}", f"P6-L1 {rom}", "303-3-b",
                         new_field=f"Through {label}"))
    return rows


def discharge_rows() -> List[Dict[str, Any]]:
    rows = [_row("quantity", "Water Discharge (Total)", "P6-E4", "303-4-a", "ENV_QUANTITY_LITRES_DISCHARGED",
                 new_field="Water Discharged (Total)")]
    for code, label, base, sfx, rom, old in D_DESTS:
        rows.append(_row(base, f"Water Discharge to {label}", f"P6-E4 {rom}", f"303-4-a-{sfx}" if sfx else None, old,
                         new_field=f"To {label}"))
        for t, tlabel in TREATMENTS:
            rows.append(_row(d_key(code, t, False), f"Water Discharge to {label} - {tlabel}", f"P6-E4 {rom}", "303-2-a",
                             new_field=tlabel))
    for t, _tl in TREATMENTS:
        key, label = OVERALL_TREATMENT_KEYS[t]
        rows.append(_row(key, f"Water Discharge - {label}", "P6-E4", "303-2-a"))
    rows.append(_row("freshwater_discharge", None, None, "303-4-b-i", "ENV_FRESHWATER_DISCHARGE_1000_MGL_TOTAL_DISS"))
    rows.append(_row("other_water_discharge", None, None, "303-4-b-ii", "ENV_OTHER_WATER_DISCHARGE_1000_MGL_TOTAL_DIS"))
    rows.append(_row("water_sent_for_use_to_other_organization", "Water Discharge - Sent to Other Organisations", "P6-E4 (iv)", "303-4-a"))
    rows.append(_row("quantity_discharged_to_water_stress_area", "Water Discharge to Water-stress Areas (Total)",
                     "P6-L1", "303-4-c", "ENV_QUANTITY_IN_WATER_STRESS_AREA"))
    for code, label, _b, _s, rom, _o in D_DESTS:
        rows.append(_row(d_total_key(code, None, True), f"Water-stress Discharge to {label}", f"P6-L1 {rom}", "303-4-c",
                         new_field=f"To {label}"))
        for t, tlabel in TREATMENTS:
            rows.append(_row(d_key(code, t, True), f"Water-stress Discharge to {label} - {tlabel}", f"P6-L1 {rom}", "303-2-a",
                             new_field=tlabel))
    rows.append(_row("ws_discharge_freshwater", "Water-stress Discharge - Freshwater", None, "303-4-c",
                     new_field="Water stress discharge - Freshwater (≤1,000 mg/L TDS)"))
    rows.append(_row("ws_discharge_other_water", "Water-stress Discharge - Other Water", None, "303-4-c",
                     new_field="Water stress discharge - Other water (>1,000 mg/L TDS)"))
    rows.append(_row("discharge_non_compliance_incidents", "Incidents of Non-compliance with Discharge Limits",
                     None, "303-4-d", new_field="Incidents of non-compliance with discharge limits", unit=False))
    return rows


def recycle_rows() -> List[Dict[str, Any]]:
    return [_row("total_quantity_of_water_recycled", "Total Quantity of Water Recycled", old_code="ENV_WATER_CONSUPTION_COPY_1")]


ROWS = {"Withdrawal": withdrawal_rows, "Discharge": discharge_rows, "Recycle": recycle_rows}

# ----------------------------------------------------------------------------
# Entry rules (leaf -> root order)
# ----------------------------------------------------------------------------

C_SOURCES = [
    "water_consumed_through_ground_water", "water_consumed_through_surface_water",
    "water_consumed_through_third_party_water", "water_consumed_through_seawater_desalinated_water",
]


def _rules_consumption() -> Dict[str, Any]:
    return {"root": "quantity",
            "sums": [("quantity", C_SOURCES)],
            "le": [("quantity_consumed_in_water_stress_area", "quantity")],
            "quality": [],
            "other": []}


def _rules_withdrawal() -> Dict[str, Any]:
    src = [k for _c, _l, k, *_ in W_SOURCES]
    ws = [ws_w_key(c) for c, *_ in W_SOURCES]
    return {"root": "quantity",
            "sums": [("water_withdrawal_in_water_stress_area", ws), ("quantity", src)],
            "le": [("water_withdrawal_in_water_stress_area", "quantity")]
                  + [(ws_w_key(c), k) for c, _l, k, *_ in W_SOURCES],
            "quality": [(["freshwater_withdrawal", "other_water_withdrawal"], "quantity")],
            "other": []}


def _rules_discharge() -> Dict[str, Any]:
    sums, le = [], []
    for stress in (False, True):
        for code, _l, base, *_ in D_DESTS:
            total = d_total_key(code, base, stress)
            sums.append((d_key(code, "with_treatment", stress),
                         [d_key(code, t, stress) for t in ("primary", "secondary", "tertiary")]))
            sums.append((total, [d_key(code, "no_treatment", stress), d_key(code, "with_treatment", stress)]))
    for t, _tl in TREATMENTS:
        sums.append((OVERALL_TREATMENT_KEYS[t][0], [d_key(c, t, False) for c, *_ in D_DESTS]))
    sums.append(("quantity_discharged_to_water_stress_area", [d_total_key(c, b, True) for c, _l, b, *_ in D_DESTS]))
    sums.append(("quantity", [b for _c, _l, b, *_ in D_DESTS]))
    le.append(("quantity_discharged_to_water_stress_area", "quantity"))
    le.append(("water_sent_for_use_to_other_organization", "quantity"))
    le += [(d_total_key(c, b, True), b) for c, _l, b, *_ in D_DESTS]
    return {"root": "quantity", "sums": sums, "le": le,
            "quality": [(["freshwater_discharge", "other_water_discharge"], "quantity"),
                        (["ws_discharge_freshwater", "ws_discharge_other_water"], "quantity_discharged_to_water_stress_area")],
            "other": ["discharge_non_compliance_incidents"]}


RULES = {"consumption": _rules_consumption(), "withdrawal": _rules_withdrawal(), "discharge": _rules_discharge()}


def _labels() -> Dict[str, str]:
    labels = {}
    for fn in (withdrawal_rows, discharge_rows):
        for r in fn():
            labels[r["key"]] = r["new_field"] or r["name"] or r["key"].replace("_", " ").capitalize()
    labels["quantity"] = "Total"
    labels.update({"freshwater_withdrawal": "Freshwater withdrawal", "other_water_withdrawal": "Other water withdrawal",
                   "freshwater_discharge": "Freshwater discharge", "other_water_discharge": "Other water discharge"})
    labels.update({
        "water_consumed_through_surface_water": "Through Surface Water",
        "water_consumed_through_ground_water": "Through Ground Water",
        "water_consumed_through_seawater_desalinated_water": "Through Seawater / Desalinated Water",
        "water_consumed_through_third_party_water": "Through Third-party Water",
    })
    for code, label, key, *_ in W_SOURCES:
        labels[key] = f"Through {label}"
        labels[ws_w_key(code)] = f"Through {label}"
    for code, label, base, *_ in D_DESTS:
        labels[base] = f"To {label}"
        labels[d_total_key(code, None, True)] = f"To {label}"
        for stress in (False, True):
            labels[d_key(code, "no_treatment", stress)] = "No treatment"
            labels[d_key(code, "with_treatment", stress)] = "With treatment"
            for treatment in ("primary", "secondary", "tertiary"):
                labels[d_key(code, treatment, stress)] = f"{treatment.capitalize()} treatment"
    return labels


LABELS = _labels()


_ACTIVE_LABELS: Dict[str, str] = {}


def _label(key: str) -> str:
    if key in _ACTIVE_LABELS:
        return _ACTIVE_LABELS[key]
    return LABELS.get(key) or WASTE_LABELS.get(key) or ENV_LABELS.get(key) or key.replace("_", " ").capitalize()


def _num(value: Any, key: str) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{_label(key)}: invalid number '{value}'")


def _fmt(value: float) -> str:
    return f"{value:g}"


def apply_water_rules(category: Optional[str], subcategory: Optional[str],
                      field_values: Dict[str, Any], is_draft: bool = False) -> Dict[str, Any]:
    """Auto-fill totals from their parts, or validate typed totals against them."""
    cat, sub = (category or "").strip().lower(), (subcategory or "").strip().lower()
    global _ACTIVE_LABELS
    _ACTIVE_LABELS = GRID_LABELS.get(sub, {}) if cat == WORKFORCE_CATEGORY.lower() else {}
    field_values = apply_table_rules(category, subcategory, field_values, is_draft)
    if cat == "waste" and sub == "spills":
        return apply_spill_rules(field_values, is_draft)
    rules = (RULES.get(sub) if cat == "water" else WASTE_RULES.get(sub) if cat == "waste"
             else GRID_RULES.get(sub) if cat == WORKFORCE_CATEGORY.lower()
             else ENV_SUM_RULES.get((cat, sub)))
    if not rules:
        return field_values

    roots = rules["root"] if isinstance(rules["root"], list) else [rules["root"]]
    keys = {*roots, *rules["other"]}
    for parent, children in rules["sums"]:
        keys.add(parent)
        keys.update(children)
    for small, big in rules["le"]:
        keys.update((small, big))
    for parts, total in rules["quality"]:
        keys.update(parts)
        keys.add(total)
    for parts, total in rules.get("sum_le", []):
        keys.update(parts)
        keys.add(total)
    for key, num, den, _scale in rules.get("ratios", []):
        keys.update((key, num, den))

    values = {k: _num(field_values.get(k), k) for k in keys}
    if any(v is not None and v < 0 for v in values.values()):
        raise ValueError("Water values cannot be negative")
    if is_draft:
        return field_values

    out = dict(field_values)

    default_unit = "MT" if cat == "waste" else "Litres"

    def unit_of(key):
        return str(field_values.get(f"{key}_unit") or out.get(f"{key}_unit") or default_unit)

    def in_unit(value, key, target_key):
        source_unit, target_unit = unit_of(key), unit_of(target_key)
        if not can_convert(source_unit, target_unit):
            return None
        return unit_convert(value, source_unit, target_unit)

    def normalised_sum(keys, target_key):
        converted = [in_unit(values[key], key, target_key) for key in keys if values[key] is not None]
        return None if any(value is None for value in converted) else sum(converted)

    def value_with_unit(value, key, target_key=None):
        target_key = target_key or key
        normalized_value = in_unit(value, key, target_key) if key != target_key else value
        return f"{_fmt(normalized_value)} {unit_of(target_key)}"

    def entered_breakdown(keys, target_key):
        parts = [
            f"{_label(key)}: {value_with_unit(values[key], key, target_key)}"
            for key in keys if values[key] is not None
        ]
        return "; ".join(parts) or "no detailed values"

    for parent, children in rules["sums"]:
        entered = [child for child in children if values[child] is not None]
        if not entered:
            continue
        total = normalised_sum(entered, parent)
        if total is None:
            continue
        if parent in rules.get("auto_sum_parents", []) or values[parent] is None:
            values[parent] = round(total, 6)
            out[parent] = values[parent]
            out[f"{parent}_unit"] = unit_of(parent)
        elif abs(values[parent] - total) > max(TOLERANCE, abs(total) * 1e-6):
            raise ValueError(
                f"{_label(parent)} is {value_with_unit(values[parent], parent)}, but its detailed entries total "
                f"{_fmt(total)} {unit_of(parent)} ({entered_breakdown(entered, parent)}). "
                f"Enter only {_label(parent)} and leave its details blank, or update the listed details so they total "
                f"{value_with_unit(values[parent], parent)}."
            )

    for key, num, den, scale in rules.get("ratios", []):
        if values[num] is not None and values[den]:
            values[key] = out[key] = round(values[num] * scale / values[den], 6)

    if all(values[r] is None for r in roots) and not any(values[c] is not None for _p, ch in rules["sums"] for c in ch):
        raise ValueError(
            f"Enter at least one value for {', '.join(_label(root) for root in roots)}, "
            "or provide one of its source/destination breakdown values."
        )

    for small, big in rules["le"]:
        small_value = in_unit(values[small], small, big) if values[small] is not None else None
        if small_value is not None and values[big] is not None and small_value > values[big] + TOLERANCE:
            raise ValueError(
                f"{_label(small)} is {value_with_unit(values[small], small, big)}, which cannot exceed "
                f"{_label(big)} at {value_with_unit(values[big], big)}."
            )

    for parts, total in rules.get("sum_le", []):
        entered = [part for part in parts if values[part] is not None]
        part_sum = normalised_sum(entered, total) if entered else None
        if part_sum is not None and values[total] is not None and part_sum > values[total] + TOLERANCE:
            raise ValueError(
                f"The entered breakdown totals {_fmt(part_sum)} {unit_of(total)} "
                f"({entered_breakdown(entered, total)}), which exceeds {_label(total)} at "
                f"{value_with_unit(values[total], total)}."
            )

    for parts, total in rules["quality"]:
        if values[total] is None or any(values[p] is None for p in parts):
            continue
        part_sum = normalised_sum(parts, total)
        if part_sum is None:
            continue
        if abs(part_sum - values[total]) > max(TOLERANCE, abs(part_sum) * 1e-6):
            raise ValueError(
                f"{_label(total)} is {value_with_unit(values[total], total)}, but its required breakdown totals "
                f"{_fmt(part_sum)} {unit_of(total)} ({entered_breakdown(parts, total)})."
            )
    # Persist a field-level unit even when the user selected the default. This
    # makes every Water/Waste KPI unit explicit for reports and conversions.
    for key, value in values.items():
        if value is not None and not out.get(f"{key}_unit"):
            out[f"{key}_unit"] = unit_of(key)
    return out


# ----------------------------------------------------------------------------
# Display tree (entry form + KPI list): group header, indent level, display parent
# ----------------------------------------------------------------------------

def _tree_consumption() -> List[Dict[str, Any]]:
    out = [("quantity", "Total", 0, None)]
    out += [(k, "Total", 1, "quantity") for k in (
        "water_consumed_through_surface_water", "water_consumed_through_ground_water",
        "water_consumed_through_seawater_desalinated_water", "water_consumed_through_third_party_water")]
    out.append(("quantity_consumed_in_water_stress_area", "Water-stress Areas", 0, None))
    out.append(("change_in_water_storage", "Change in Water Storage", 0, None))
    return out


def _tree_withdrawal() -> List[Dict[str, Any]]:
    out = [("quantity", "Total", 0, None)]
    out += [(k, "Total", 1, "quantity") for _c, _l, k, *_ in W_SOURCES]
    out += [("freshwater_withdrawal", "By Quality", 1, None), ("other_water_withdrawal", "By Quality", 1, None)]
    ws_total = "water_withdrawal_in_water_stress_area"
    out.append((ws_total, "Water-stress Areas", 0, None))
    out += [(ws_w_key(c), "Water-stress Areas", 1, ws_total) for c, *_ in W_SOURCES]
    return out


def _tree_discharge() -> List[Dict[str, Any]]:
    out = [("quantity", "Total", 0, None)]
    for code, _l, base, *_ in D_DESTS:
        out.append((base, "Total", 1, "quantity"))
        out.append((d_key(code, "no_treatment", False), "Total", 2, base))
        wt = d_key(code, "with_treatment", False)
        out.append((wt, "Total", 2, base))
        out += [(d_key(code, t, False), "Total", 3, wt) for t in ("primary", "secondary", "tertiary")]
    treated = OVERALL_TREATMENT_KEYS["with_treatment"][0]
    out.append((OVERALL_TREATMENT_KEYS["no_treatment"][0], "By Treatment", 1, None))
    out.append((treated, "By Treatment", 1, None))
    out += [(OVERALL_TREATMENT_KEYS[t][0], "By Treatment", 2, treated) for t in ("primary", "secondary", "tertiary")]
    out += [("freshwater_discharge", "By Quality", 1, None), ("other_water_discharge", "By Quality", 1, None)]
    out.append(("water_sent_for_use_to_other_organization", "Of Which", 1, None))
    ws_total = "quantity_discharged_to_water_stress_area"
    out.append((ws_total, "Water-stress Areas", 0, None))
    for code, _l, _b, *_ in D_DESTS:
        ws_dest = d_total_key(code, None, True)
        out.append((ws_dest, "Water-stress Areas", 1, ws_total))
        out.append((d_key(code, "no_treatment", True), "Water-stress Areas", 2, ws_dest))
        wt = d_key(code, "with_treatment", True)
        out.append((wt, "Water-stress Areas", 2, ws_dest))
        out += [(d_key(code, t, True), "Water-stress Areas", 3, wt) for t in ("primary", "secondary", "tertiary")]
    out += [("ws_discharge_freshwater", "Water-stress Areas", 1, ws_total),
            ("ws_discharge_other_water", "Water-stress Areas", 1, ws_total)]
    out.append(("discharge_non_compliance_incidents", "Compliance", 0, None))
    return out


_TREES = {"Consumption": _tree_consumption, "Withdrawal": _tree_withdrawal, "Discharge": _tree_discharge}


def tree_meta(subcategory: str) -> Dict[str, Dict[str, Any]]:
    """key -> {group, level, parent_key, sum_parents, order} for a Water subcategory."""
    build = _TREES.get(subcategory)
    if not build:
        return {}
    rules = RULES[subcategory.lower()]
    sum_parents: Dict[str, List[str]] = {}
    for parent, children in rules["sums"]:
        for child in children:
            sum_parents.setdefault(child, []).append(parent)
    return {
        key: {"group": group, "level": level, "parent_key": parent,
              "sum_parents": sum_parents.get(key, []), "order": i}
        for i, (key, group, level, parent) in enumerate(build())
    }
