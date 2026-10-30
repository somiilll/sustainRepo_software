"""Read-only live GRI answers built from GRI KPI framework mappings (GHG, base year, intensity) plus organization-detail text."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from modules.brsr_report.proposal_calculator import calculate_kpi_contribution
from shared.audit_trail.diff import PathChange
from shared.audit_trail.models import AuditSource
from shared.audit_trail.service import audit_trail_service
from shared.database.mongo import db

APPROACH_LABELS = {
    "equity_share": "Equity share approach",
    "control_operational": "Operational control approach",
    "control_financial": "Financial control approach",
    "control_both": "Operational and financial control approach",
    "control": "Control approach",
}
REVIEW_SOURCES = ["gri_ghg_sync", "gri_305_sync"]
BOUNDARY_KEYS = ("gri_102_5_e", "gri_102_6_e", "gri_102_7_e", "gri_305_1_f", "gri_305_2_f")


def _fmt(value: float) -> str:
    return f"{value:.6g}" if abs(value) < 1 else f"{value:,.2f}"


def _boundaries(org: Dict[str, Any]) -> str:
    approach = str(org.get("org_boundaries_approach") or "").lower()
    parts = [APPROACH_LABELS.get(approach, approach.replace("_", " ").capitalize())] if approach else []
    if approach == "equity_share" and org.get("org_boundaries_equity_percentage"):
        parts[0] += f" ({org['org_boundaries_equity_percentage']}% equity share)"
    notes = org.get("org_boundaries") or org.get("org_boundaries_notes")
    if notes:
        parts.append(str(notes))
    return "\n".join(parts) or "Organizational boundaries are not specified in the organization details."


async def _compute_live_values(org_id: str, reporting_period: str):
    mappings = await db.kpi_framework_mappings.find(
        {"framework": "GRI", "is_active": True, "review_source": {"$in": REVIEW_SOURCES}}, {"_id": 0}).sort("display_order", 1).to_list(None)
    kpis = {k["id"]: k for k in await db.esg_kpi_definitions.find({"id": {"$in": [m["kpi_id"] for m in mappings]}}, {"_id": 0}).to_list(None)}
    sub_question_keys = {q["question_key"] async for q in db.esg_question_configs.find(
        {"question_key": {"$in": list({m["question_key"] for m in mappings})}, "input_type": "sub_questions"}, {"_id": 0, "question_key": 1})}
    lines: Dict[str, list] = {}
    sources: Dict[str, Dict[str, set]] = {}
    for mapping in mappings:
        kpi = kpis.get(mapping["kpi_id"])
        if not kpi:
            continue
        use_part = mapping.get("answer_path") and mapping["question_key"] in sub_question_keys
        key = f"{mapping['question_key']}_{mapping['answer_path']}" if use_part else mapping["question_key"]
        value, _records = await calculate_kpi_contribution(kpi, org_id, reporting_period, mapping.get("aggregation_rule") or "sum")
        unit = mapping.get("destination_unit") or (kpi.get("unit_config") or {}).get("default_unit") or ""
        label = mapping.get("display_label") or kpi["metric_name"]
        source = sources.setdefault(key, {"mapping_ids": set(), "source_tags": set()})
        source["mapping_ids"].add(mapping.get("id"))
        source["source_tags"].add(label)
        lines.setdefault(key, []).append(f"{label}: {_fmt(float(value)) + (' ' + unit if unit else '') if value is not None else 'no data'}")
    values = {key: "\n".join(rows) for key, rows in lines.items()}

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0}) or {}
    boundaries = _boundaries(org)
    for key in BOUNDARY_KEYS:
        values[key] = boundaries
        sources[key] = {"mapping_ids": set(), "source_tags": {"Organization details"}}
    return values, sources


async def live_gri_emission_values(org_id: str, reporting_period: str) -> Dict[str, str]:
    return (await _compute_live_values(org_id, reporting_period))[0]


async def sync_gri_live_values(org_id: str, reporting_period: str, triggered_by: Optional[str] = None) -> Dict[str, Any]:
    """Persist KPI-derived GRI answers and log each change to the audit trail so version history shows them."""
    configs = await db.esg_question_configs.find(
        {"framework": "GRI", "hidden": {"$ne": True}}, {"_id": 0, "question_key": 1, "section": 1, "sub_questions": 1}).to_list(None)
    values, sources = await _compute_live_values(org_id, reporting_period)
    section_by_key: Dict[str, str] = {}
    for config in configs:
        keys = [f"{config['question_key']}_{sub['sub_key']}" for sub in config.get("sub_questions") or []] or [config["question_key"]]
        for key in keys:
            section_by_key[key] = config.get("section")
    wanted = {key: value for key, value in values.items() if key in section_by_key}
    if not wanted:
        return {"reporting_period": reporting_period, "updated": 0}
    existing = {doc["question_key"]: doc async for doc in db.organization_esg_responses.find(
        {"org_id": org_id, "reporting_year": reporting_period, "framework": "GRI", "question_key": {"$in": list(wanted)}},
        {"_id": 0, "question_key": 1, "value": 1, "kpi_autofill_updated_at": 1})}
    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for key, value in wanted.items():
        old = existing.get(key, {}).get("value")
        if old == value:
            continue
        await db.organization_esg_responses.update_one(
            {"org_id": org_id, "question_key": key, "reporting_year": reporting_period, "framework": "GRI"},
            {"$set": {"value": value, "status": "saved", "section": section_by_key[key], "organization_id": org_id,
                      "kpi_autofill_updated_at": now, "updated_at": now},
             "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
            upsert=True)
        await audit_trail_service.record_system_changes(
            framework="GRI", organization_id=org_id, reporting_period=reporting_period, question_key=key,
            changes=[PathChange(path="value", old=old, new=value)], scalar=True, state_token=existing.get(key, {}).get("kpi_autofill_updated_at"),
            source=AuditSource(type="kpi_sync", mapping_ids=[m for m in sources[key]["mapping_ids"] if m],
                               source_tags=list(sources[key]["source_tags"]), triggered_by_user_id=triggered_by))
        updated += 1
    return {"reporting_period": reporting_period, "updated": updated}
