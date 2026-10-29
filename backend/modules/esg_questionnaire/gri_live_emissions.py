"""Read-only live GHG values for GRI 102-5 (Scope 1), 102-6 (Scope 2) and 102-7 (Scope 3) responses."""
import re
from typing import Any, Dict, List, Optional

from shared.database.mongo import db

UNIT = "tCO2e"
GASES = (("CO2", "co2_emissions"), ("CH4", "ch4_emissions"), ("N2O", "n2o_emissions"))
APPROACH_LABELS = {
    "equity_share": "Equity share approach",
    "control_operational": "Operational control approach",
    "control_financial": "Financial control approach",
    "control_both": "Operational and financial control approach",
    "control": "Control approach",
}
_FY = re.compile(r"^FY\s*(\d{4})\s*-\s*(\d{2,4})$")
_CY = re.compile(r"^CY\s*(\d{4})$")


def _months_for_period(period: str) -> List[str]:
    fy, cy = _FY.match(period.strip()), _CY.match(period.strip())
    if fy:
        start = int(fy.group(1))
        return [f"{start}-{m:02d}" for m in range(4, 13)] + [f"{start + 1}-{m:02d}" for m in range(1, 4)]
    if cy:
        return [f"{cy.group(1)}-{m:02d}" for m in range(1, 13)]
    return [period]


def _fmt(value: float) -> str:
    return f"{value:,.2f}"


def _num(record: Dict[str, Any], key: str) -> float:
    try:
        return float(record.get(key) or 0)
    except (TypeError, ValueError):
        return 0.0


def _total(records: List[Dict[str, Any]], key: str = "co2e_emissions") -> float:
    return sum(_num(r, key) for r in records)


def _is_indirect_biogenic(record: Dict[str, Any]) -> bool:
    return bool(re.match(r"^C\d+", str(record.get("category") or "").strip()))


def _by_category(records: List[Dict[str, Any]]) -> str:
    totals: Dict[str, float] = {}
    for record in records:
        name = str(record.get("category") or "Uncategorised").strip()
        totals[name] = totals.get(name, 0.0) + _num(record, "co2e_emissions")
    if not totals:
        return "No emissions recorded for this period."
    return "\n".join(f"{name}: {_fmt(value)} {UNIT}" for name, value in sorted(totals.items()))


def _gases(records: List[Dict[str, Any]], with_co2e: bool = False) -> str:
    lines = [f"CO2e: {_fmt(_total(records))} {UNIT}"] if with_co2e else []
    lines += [f"{label}: {_fmt(_total(records, key))} t" for label, key in GASES]
    return "\n".join(lines)


def _boundaries(org: Dict[str, Any]) -> str:
    approach = str(org.get("org_boundaries_approach") or "").lower()
    parts = [APPROACH_LABELS.get(approach, approach.replace("_", " ").capitalize())] if approach else []
    if approach == "equity_share" and org.get("org_boundaries_equity_percentage"):
        parts[0] += f" ({org['org_boundaries_equity_percentage']}% equity share)"
    notes = org.get("org_boundaries") or org.get("org_boundaries_notes")
    if notes:
        parts.append(str(notes))
    return "\n".join(parts) or "Organizational boundaries are not specified in the organization details."


def _base_year_text(org: Dict[str, Any], records: List[Dict[str, Any]], biogenic: Optional[List[Dict[str, Any]]] = None) -> str:
    base_year = org.get("base_year")
    if not base_year:
        return "Base year is not set in the organization settings."
    prefix = f"{base_year}-"
    in_base = [r for r in records if str(r.get("reporting_period") or r.get("reporting_month") or "").startswith(prefix)]
    return f"Base year: {base_year}\nBase year emissions: {_fmt(_total(in_base))} {UNIT}"


def _scope_values(prefix: str, records: List[Dict[str, Any]], biogenic: List[Dict[str, Any]], org: Dict[str, Any], base_records: List[Dict[str, Any]],
                  scope: str) -> Dict[str, str]:
    scope_total = f"{_fmt(_total(records))} {UNIT}"
    values = {
        f"{prefix}_c": f"{_fmt(_total(biogenic, 'co2_emissions'))} tCO2 (biogenic)",
        f"{prefix}_d_ii": _base_year_text(org, base_records),
        f"{prefix}_e": _boundaries(org),
    }
    if scope == "scope3":
        values.update({
            f"{prefix}_a_i": _by_category(records),
            f"{prefix}_a_ii": _gases(records),
            f"{prefix}_a_iii": f"{_fmt(_total(records) + _total(biogenic))} {UNIT} (Scope 3 + biogenic indirect)",
            f"{prefix}_a_iv": scope_total, f"{prefix}_a_v": scope_total,
            f"{prefix}_b": _by_category(records),
            f"{prefix}_c": _by_category(biogenic),
        })
    else:
        values.update({
            f"{prefix}_a_i": _gases(records),
            f"{prefix}_a_ii": f"{_fmt(_total(records) + _total(biogenic))} {UNIT} ({'Scope 1 + biogenic direct' if scope == 'scope1' else 'Scope 2 + biogenic indirect'})",
            f"{prefix}_a_iii": scope_total, f"{prefix}_a_iv": scope_total,
            f"{prefix}_b": _gases(records, with_co2e=True),
        })
    return values


async def live_gri_emission_values(org_id: str, reporting_period: str) -> Dict[str, str]:
    months = _months_for_period(reporting_period)
    base = {"organization_id": org_id, "status": {"$ne": "draft"}}
    period_filter = {"$or": [{"reporting_period": {"$in": months + [reporting_period]}}, {"reporting_month": {"$in": months}}]}
    records = await db.emission_records.find({**base, **period_filter}, {"_id": 0}).to_list(None)
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0}) or {}
    base_year = org.get("base_year")
    base_records = []
    if base_year:
        base_records = await db.emission_records.find(
            {**base, "$or": [{"reporting_period": {"$regex": f"^{base_year}-"}}, {"reporting_month": {"$regex": f"^{base_year}-"}}]}, {"_id": 0}).to_list(None)

    def of(scope: str, source=records):
        return [r for r in source if r.get("scope") == scope]

    biogenic = of("biogenic")
    direct = [r for r in biogenic if not _is_indirect_biogenic(r)]
    indirect = [r for r in biogenic if _is_indirect_biogenic(r)]
    base_biogenic = of("biogenic", base_records)
    values: Dict[str, str] = {}
    values.update(_scope_values("gri_102_5", of("scope1"), direct, org, of("scope1", base_records) + [r for r in base_biogenic if not _is_indirect_biogenic(r)], "scope1"))
    values.update(_scope_values("gri_102_6", of("scope2"), indirect, org, of("scope2", base_records) + [r for r in base_biogenic if _is_indirect_biogenic(r)], "scope2"))
    values.update(_scope_values("gri_102_7", of("scope3"), indirect, org, of("scope3", base_records), "scope3"))
    return values
