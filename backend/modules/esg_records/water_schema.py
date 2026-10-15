"""Water (Consumption / Withdrawal / Discharge / Recycle): field keys, KPI rows and entry rules."""
from typing import Any, Dict, List, Optional

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
                         new_field=f"Water withdrawal through {label}" if old is None or code == "produced" else None))
    rows.append(_row("freshwater_withdrawal", None, None, "303-3-c-i", "ENV_FRESHWATER_WITHDRAWAL_1000_MGL_TOTAL_DIS"))
    rows.append(_row("other_water_withdrawal", None, None, "303-3-c-ii", "ENV_OTHER_WATER_WITHDRAWAL_1000_MGL_TOTAL_DI"))
    rows.append(_row("water_withdrawal_in_water_stress_area", "Water Withdrawal in Water-stress Areas (Total)",
                     "P6-L1", "303-3-b", "ENV_QUANTITY_FROM_WATER_STRESS_AREA"))
    for code, label, _k, _s, rom, _o in W_SOURCES:
        rows.append(_row(ws_w_key(code), f"Water Withdrawal in Water-stress Areas - {label}", f"P6-L1 {rom}", "303-3-b",
                         new_field=f"Water withdrawal in water stress area - {label}"))
    return rows


def discharge_rows() -> List[Dict[str, Any]]:
    rows = [_row("quantity", "Water Discharge (Total)", "P6-E4", "303-4-a", "ENV_QUANTITY_LITRES_DISCHARGED")]
    for code, label, base, sfx, rom, old in D_DESTS:
        rows.append(_row(base, f"Water Discharge to {label}", f"P6-E4 {rom}", f"303-4-a-{sfx}" if sfx else None, old,
                         new_field=None if old else f"Water discharged to {label}"))
        for t, tlabel in TREATMENTS:
            rows.append(_row(d_key(code, t, False), f"Water Discharge to {label} - {tlabel}", f"P6-E4 {rom}", "303-2-a",
                             new_field=f"Discharge to {label} - {tlabel}"))
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
                         new_field=f"Water stress discharge to {label}"))
        for t, tlabel in TREATMENTS:
            rows.append(_row(d_key(code, t, True), f"Water-stress Discharge to {label} - {tlabel}", f"P6-L1 {rom}", "303-2-a",
                             new_field=f"Water stress discharge to {label} - {tlabel}"))
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
    return labels


LABELS = _labels()


def _label(key: str) -> str:
    return LABELS.get(key) or key.replace("_", " ").capitalize()


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
    rules = RULES.get((subcategory or "").lower()) if (category or "").lower() == "water" else None
    if not rules:
        return field_values

    keys = {rules["root"], *rules["other"]}
    for parent, children in rules["sums"]:
        keys.add(parent)
        keys.update(children)
    for small, big in rules["le"]:
        keys.update((small, big))
    for parts, total in rules["quality"]:
        keys.update(parts)
        keys.add(total)

    values = {k: _num(field_values.get(k), k) for k in keys}
    if any(v is not None and v < 0 for v in values.values()):
        raise ValueError("Water values cannot be negative")
    if is_draft:
        return field_values

    out = dict(field_values)
    for parent, children in rules["sums"]:
        entered = [values[c] for c in children if values[c] is not None]
        if not entered:
            continue
        total = sum(entered)
        if values[parent] is None:
            values[parent] = round(total, 6)
            out[parent] = values[parent]
        elif abs(values[parent] - total) > max(TOLERANCE, abs(total) * 1e-6):
            raise ValueError(
                f"{_label(parent)} ({_fmt(values[parent])}) must equal the sum of its parts ({_fmt(total)}). "
                "Fix the parts or enter only the total."
            )

    if values[rules["root"]] is None:
        raise ValueError("Enter the total, or at least one source/destination value")

    for small, big in rules["le"]:
        if values[small] is not None and values[big] is not None and values[small] > values[big] + TOLERANCE:
            raise ValueError(f"{_label(small)} cannot exceed {_label(big)}")

    for parts, total in rules["quality"]:
        if values[total] is None or any(values[p] is None for p in parts):
            continue
        part_sum = sum(values[p] for p in parts)
        if abs(part_sum - values[total]) > max(TOLERANCE, abs(part_sum) * 1e-6):
            raise ValueError(
                f"{' + '.join(_label(p) for p in parts)} ({_fmt(part_sum)}) must equal {_label(total)} ({_fmt(values[total])})"
            )
    return out
