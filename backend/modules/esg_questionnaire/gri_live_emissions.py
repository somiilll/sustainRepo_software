"""Read-only live GHG values for GRI 102-5 / 102-6 / 102-7 answers, built from GRI KPI framework mappings."""
from typing import Any, Dict, Optional

from modules.brsr_report.proposal_calculator import _ghg_period
from modules.kpi_engine.ghg_adapter import calculate_ghg_kpi
from shared.database.mongo import db

APPROACH_LABELS = {
    "equity_share": "Equity share approach",
    "control_operational": "Operational control approach",
    "control_financial": "Financial control approach",
    "control_both": "Operational and financial control approach",
    "control": "Control approach",
}
PREFIXES = {"scope1": ("gri_102_5", "scope1_total"), "scope2": ("gri_102_6", "scope2_total"), "scope3": ("gri_102_7", "scope3_total")}


def _fmt(value: float) -> str:
    return f"{value:,.2f}"


def _boundaries(org: Dict[str, Any]) -> str:
    approach = str(org.get("org_boundaries_approach") or "").lower()
    parts = [APPROACH_LABELS.get(approach, approach.replace("_", " ").capitalize())] if approach else []
    if approach == "equity_share" and org.get("org_boundaries_equity_percentage"):
        parts[0] += f" ({org['org_boundaries_equity_percentage']}% equity share)"
    notes = org.get("org_boundaries") or org.get("org_boundaries_notes")
    if notes:
        parts.append(str(notes))
    return "\n".join(parts) or "Organizational boundaries are not specified in the organization details."




async def _kpi_value(kpi: Dict[str, Any], org_id: str, period: Optional[Dict[str, Any]], cache: Dict[str, float]) -> float:
    if kpi["id"] in cache:
        return cache[kpi["id"]]
    if kpi.get("source_type") == "composite":
        ids = ((kpi.get("source_config") or {}).get("composite") or {}).get("source_kpi_ids") or []
        children = await db.esg_kpi_definitions.find({"id": {"$in": ids}}, {"_id": 0}).to_list(None)
        value = sum([await _kpi_value(child, org_id, period, cache) for child in children])
    else:
        result = await calculate_ghg_kpi(kpi=kpi, org_id=org_id, period=period)
        value = float(result.get("value") or 0)
    cache[kpi["id"]] = value
    return value


async def live_gri_emission_values(org_id: str, reporting_period: str) -> Dict[str, str]:
    period, cache = _ghg_period(reporting_period), {}
    mappings = await db.kpi_framework_mappings.find(
        {"framework": "GRI", "is_active": True, "review_source": "gri_ghg_sync"}, {"_id": 0}).sort("display_order", 1).to_list(None)
    kpis = {k["id"]: k for k in await db.esg_kpi_definitions.find({"id": {"$in": [m["kpi_id"] for m in mappings]}}, {"_id": 0}).to_list(None)}
    lines: Dict[str, list] = {}
    for mapping in mappings:
        kpi = kpis.get(mapping["kpi_id"])
        if not kpi:
            continue
        key = f"{mapping['question_key']}_{mapping['answer_path']}" if mapping.get("answer_path") else mapping["question_key"]
        value = await _kpi_value(kpi, org_id, period, cache)
        lines.setdefault(key, []).append(f"{mapping['display_label']}: {_fmt(value)} {mapping.get('destination_unit') or 'tCO2e'}")
    values = {key: "\n".join(rows) for key, rows in lines.items()}

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0}) or {}
    base_year = org.get("base_year")
    for scope, (prefix, total_key) in PREFIXES.items():
        if base_year:
            base = await calculate_ghg_kpi(org_id=org_id, period={"year": int(base_year), "reporting_year_type": "CY"}, mapping_key=total_key)
            values[f"{prefix}_d_ii"] = f"Base year: {base_year}\nBase year emissions: {_fmt(float(base.get('value') or 0))} tCO2e"
        else:
            values[f"{prefix}_d_ii"] = "Base year is not set in the organization settings."
        values[f"{prefix}_e"] = _boundaries(org)
    return values
