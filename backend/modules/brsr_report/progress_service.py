"""Per-section BRSR question status and progress counts."""
from typing import Any, Dict

from shared.database.mongo import db
from modules.esg_questionnaire.service import esg_questionnaire_service
from modules.esg_questionnaire.status_rules import adjusted_status
from .live_kpi_autofill import _has_reportable_value

SECTIONS = ("section_a", "section_b", "section_c")
STATUSES = ("pending", "draft", "in_progress", "saved", "approved", "rejected")
A_PREFIX = "brsr_a_"
SECTION_A_GROUPS = (
    ("I", "Details of the listed entity", ["cin", "entity_name", "year_of_incorporation", "registered_address", "corporate_address", "email", "telephone", "website", "financial_year", "stock_exchange", "paid_up_capital", "contact_person", "reporting_boundary", "assurance_provider", "assurance_type"]),
    ("II", "Products and services", ["business_activities", "products_services"]),
    ("III", "Operations", ["plants_offices", "markets_served", "export_contribution", "customer_types"]),
    ("IV", "Employees", ["employees_workers", "differently_abled", "women_representation", "turnover_rate"]),
    ("V", "Holding and subsidiaries", ["holding_subsidiary"]),
    ("VI", "CSR details", ["csr_applicability"]),
    ("VII", "Transparency and compliance", ["complaints_grievances", "material_issues"]),
)
PRINCIPLE_TITLES = {
    "P1": "Ethics, Transparency & Accountability", "P2": "Sustainable Products & Services", "P3": "Employee Wellbeing",
    "P4": "Stakeholder Responsiveness", "P5": "Human Rights", "P6": "Environment Protection",
    "P7": "Policy Advocacy", "P8": "Inclusive Growth", "P9": "Consumer Value",
}


def question_status(doc: Dict[str, Any]) -> str:
    if not doc:
        return "pending"
    approval = doc.get("approval_status")
    if approval in ("approved", "rejected"):
        return approval
    if doc.get("status") == "draft":
        return "draft"
    adjusted = adjusted_status(doc)
    if adjusted:
        return adjusted
    saved = doc.get("status") == "saved" or approval == "pending_approval"
    return "saved" if saved and _has_reportable_value(doc.get("value")) else "pending"


def _group_definitions(section: str, configs: list) -> list:
    if section == "section_a":
        return [{"id": numeral, "numeral": numeral, "label": label, "keys": [A_PREFIX + k for k in keys]}
                for numeral, label, keys in SECTION_A_GROUPS]
    groups: Dict[str, Any] = {}
    for config in configs:
        if config["section"] != section:
            continue
        if section == "section_c":
            gid = config.get("brsr_principle") or "P?"
            label = f"{gid.replace('P', 'Principle ')}: {PRINCIPLE_TITLES.get(gid, '')}"
        else:
            gid = (config.get("group") or "General").strip()
            label = gid
        groups.setdefault(gid, {"id": gid, "numeral": None, "label": label, "keys": []})["keys"].append(config["question_key"])
    values = list(groups.values())
    return sorted(values, key=lambda g: int(g["id"][1:]) if g["id"][1:].isdigit() else 99) if section == "section_c" else values


async def brsr_progress(org_id: str, reporting_period: str) -> Dict[str, Any]:
    configs = await db.esg_question_configs.find(
        {"frameworks": {"$in": ["BRSR", "brsr"]}, "section": {"$in": list(SECTIONS)}, "hidden": {"$ne": True}},
        {"_id": 0, "question_key": 1, "section": 1, "group": 1, "brsr_principle": 1, "order": 1},
    ).sort("order", 1).to_list(1000)
    docs = await db.organization_esg_responses.find(
        {"org_id": org_id, "reporting_year": reporting_period, "framework": {"$in": ["BRSR", "brsr"]}},
        {"_id": 0, "question_key": 1, "status": 1, "approval_status": 1, "value": 1},
    ).to_list(2000)
    by_key = {doc["question_key"]: doc for doc in docs if doc.get("question_key")}

    sections: Dict[str, Any] = {s: {"questions": {}, "counts": {k: 0 for k in STATUSES}} for s in SECTIONS}
    for config in configs:
        status = question_status(by_key.get(config["question_key"]))
        section = sections[config["section"]]
        section["questions"][config["question_key"]] = status
        section["counts"][status] += 1
    for section in sections.values():
        counts = section["counts"]
        total = len(section["questions"])
        answered = counts["saved"] + counts["approved"]
        section.update({
            "total": total, "answered": answered, "groups": [],
            "percent": round(answered / total * 100) if total else 0,
        })
    for name, section in sections.items():
        for group in _group_definitions(name, configs):
            keys = [k for k in group.pop("keys") if k in section["questions"]]
            section["groups"].append({**group, "total": len(keys),
                                      "answered": sum(section["questions"][k] in ("saved", "approved") for k in keys)})
    has_approval_states = any(
        doc.get("approval_status") in ("approved", "rejected", "pending_approval") for doc in by_key.values()
    )
    approval_enabled = has_approval_states or await esg_questionnaire_service._has_approval_workflow_enabled(org_id)
    return {"reporting_period": reporting_period, "approval_enabled": approval_enabled, "sections": sections}
