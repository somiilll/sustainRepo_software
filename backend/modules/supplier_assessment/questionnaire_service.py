"""Questionnaire authoring, response, evidence, and manual-review operations."""
import uuid
import logging
import json
import re
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from r2_storage import get_r2_storage
from shared.database.mongo import db
from modules.supplier_assessment.due_dates import has_due_date_passed, validate_due_date
from modules.supplier_assessment.programs import resolve_program_context
from modules.sustainability_config.service import resolve_supplier_assessment_config
from app.logging import get_logger, log_event
from shared.utils.emission_records import normalize_reporting_period
from shared.helpers.email import send_email
from modules.supplier_assessment.unlock_notification_service import notify_supplier_module_unlocked
from modules.supplier_assessment.email_templates import questionnaire_change_email
from app.config.env import FRONTEND_URL

logger = get_logger(__name__)

ESG_SECTIONS = ("environment", "social", "governance")
SYSTEM_QUESTIONNAIRE_BANKS = {
    "basic": {
        "bank_id": "esg_annual_basic",
        "name": "ESG Annual (Basic)",
        "description": "Tier 1 – Basic MSME supplier ESG assessment.",
        "config_key": "basic_question_bank_enabled",
    },
    "standard": {
        "bank_id": "esg_annual_standard",
        "name": "ESG Annual (Standard)",
        "description": "Tier 2 – Standard supplier ESG assessment.",
        "config_key": "standard_question_bank_enabled",
    },
    "advanced": {
        "bank_id": "esg_annual_advanced",
        "name": "ESG Annual (Advanced)",
        "description": "Tier 3 – Strategic supplier ESG assessment.",
        "config_key": "advanced_question_bank_enabled",
    },
}

INITIAL_QUESTIONNAIRE_REPORTING_PERIOD = "FY 2026-2027"
QUESTIONNAIRE_YEAR_TOKEN_PATTERN = re.compile(r"\[(?:\s*reporting\s+year\s*)?\]", re.IGNORECASE)
QUESTIONNAIRE_YEAR_VALUE_PATTERN = re.compile(r"\[\s*(?:FY\s*\d{4}\s*-\s*\d{2,4}|CY\s*\d{4})\s*\]", re.IGNORECASE)


def normalize_questionnaire_template_name(name: str) -> str:
    """Keep questionnaire names independent from reporting-period labels."""
    normalized = str(name or "").strip()
    if not normalized:
        raise ValueError("Questionnaire name is required")
    normalized = QUESTIONNAIRE_YEAR_TOKEN_PATTERN.sub("", normalized)
    normalized = QUESTIONNAIRE_YEAR_VALUE_PATTERN.sub("", normalized)
    return re.sub(r"\s{2,}", " ", normalized).strip()


def _normalize_evidence_filename(filename: str) -> str:
    return re.sub(r"\s+", " ", str(filename or "").strip().lower())


def resolve_questionnaire_display_name(name: str, reporting_period: Optional[str]) -> str:
    """Return the reusable template name; period context is displayed separately."""
    return normalize_questionnaire_template_name(name)


def normalize_questionnaire_reporting_period(value: Optional[str]) -> Optional[str]:
    """Use the full-year GHG storage representation for questionnaire associations."""
    return normalize_reporting_period(value) or (str(value).strip() if value else None)


def questionnaire_reporting_periods(questionnaire: Dict[str, Any]) -> List[str]:
    """Return explicit associations, safely interpreting legacy templates as FY 2026-27 only."""
    periods = [normalize_questionnaire_reporting_period(str(period)) for period in (questionnaire.get("reporting_periods") or []) if str(period).strip()]
    if periods:
        return list(dict.fromkeys(periods))
    legacy_period = normalize_questionnaire_reporting_period(questionnaire.get("assignment_reporting_period"))
    return [legacy_period or INITIAL_QUESTIONNAIRE_REPORTING_PERIOD]


def _normalize_reporting_periods(periods: Optional[List[str]], fallback_period: Optional[str] = None) -> List[str]:
    normalized = [normalize_questionnaire_reporting_period(str(period)) for period in (periods or []) if str(period).strip()]
    if not normalized and fallback_period:
        normalized.append(normalize_questionnaire_reporting_period(fallback_period))
    normalized = list(dict.fromkeys(period for period in normalized if period))
    if not normalized:
        raise ValueError("Associate the questionnaire with at least one reporting period")
    return normalized


def questionnaire_is_available_for_period(questionnaire: Dict[str, Any], reporting_period: Optional[str]) -> bool:
    normalized_period = normalize_questionnaire_reporting_period(reporting_period)
    return not normalized_period or normalized_period in questionnaire_reporting_periods(questionnaire)


def with_questionnaire_reporting_period(questionnaire: Dict[str, Any], reporting_period: Optional[str]) -> Dict[str, Any]:
    questionnaire["name"] = normalize_questionnaire_template_name(questionnaire.get("name", "Questionnaire"))
    questionnaire["display_name"] = questionnaire["name"]
    questionnaire["reporting_periods"] = questionnaire_reporting_periods(questionnaire)
    questionnaire["reporting_period"] = reporting_period if questionnaire_is_available_for_period(questionnaire, reporting_period) else None
    return questionnaire


def _enabled_taxonomy_by_section(taxonomy: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    return {
        section: [dict(item) for item in (taxonomy.get(section) or []) if item.get("enabled")]
        for section in ESG_SECTIONS
    }


def _default_question_category(taxonomy: Dict[str, Any], section: str) -> Optional[str]:
    enabled = _enabled_taxonomy_by_section(taxonomy).get(section) or []
    return enabled[0].get("code") if enabled else None


def _validate_question_category(taxonomy: Dict[str, Any], section: str, category: Optional[str]) -> str:
    if section not in ESG_SECTIONS:
        raise ValueError("Question section must be Environment, Social, or Governance")
    resolved = category or _default_question_category(taxonomy, section)
    if resolved in {"policy", "reporting", "certification"}:
        resolved = _default_question_category(taxonomy, section)
    enabled_codes = {item.get("code") for item in _enabled_taxonomy_by_section(taxonomy).get(section, [])}
    if not resolved or resolved not in enabled_codes:
        raise ValueError("Choose an enabled Supplier Assessment subcategory for this question")
    return resolved


def _with_compatible_point_scores(question: Dict[str, Any]) -> Dict[str, Any]:
    """Expose complete point-score fields for legacy Yes/No questions without rewriting them."""
    if question.get("response_type") != "yes_no":
        return question

    maximum = float(question.get("max_points") or question.get("exact_numerical_weight") or question.get("weight") or 1)
    configured_scores = dict(question.get("point_scores") or {})
    scoring = question.get("scoring") or {}
    yes_score = configured_scores.get("yes_score")
    if yes_score is None:
        yes_score = configured_scores.get("yes_with_evidence_score")
    if yes_score is None:
        yes_score = maximum * float(scoring.get("true_score", 100)) / 100
    no_score = configured_scores.get("no_score")
    if no_score is None:
        no_score = maximum * float(scoring.get("false_score", 0)) / 100
    without_evidence = configured_scores.get("yes_without_evidence_score")
    if without_evidence is None:
        without_evidence = yes_score / 2 if question.get("evidence_requirement") == "evidence_scored" or question.get("assessment_type") == "type_c" else yes_score

    question["point_scores"] = {
        "yes_score": yes_score,
        "yes_with_evidence_score": configured_scores.get("yes_with_evidence_score", yes_score),
        "yes_without_evidence_score": without_evidence,
        "no_score": no_score,
    }
    return question

# ========================================================================
# Questionnaire Management (Customer Admin)
# ========================================================================

async def create_questionnaire(
    self,
    organization_id: str,
    name: str,
    description: Optional[str],
    due_date: Optional[str],
    scoring_method: str,
    section_weights: Optional[Dict[str, float]],
    esg_section_weights: Optional[Dict[str, float]],
    overall_supplier_weights: Optional[Dict[str, float]],
    created_by: str,
    assignment_mode: str = "all",
    supplier_relationship_ids: Optional[List[str]] = None,
    assignment_reporting_period: Optional[str] = None,
    reporting_periods: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a new questionnaire template."""
    validate_due_date(due_date)
    questionnaire_id = str(uuid.uuid4())
    supplier_config = await resolve_supplier_assessment_config(organization_id)
    esg_subcategories = supplier_config.get("esg_subcategories") or {}
    esg_weights = self._validated_weight_config(
        esg_section_weights or section_weights,
        {"environment": 33.33, "social": 33.33, "governance": 33.34},
        "ESG category weights",
    )
    supplier_weights = self._validated_weight_config(
        overall_supplier_weights,
        {"esg": 40.0, "ghg": 40.0, "revenue": 20.0},
        "Overall component weights",
    )
    effective_reporting_period = assignment_reporting_period or await self._organization_default_reporting_period(organization_id)
    associated_periods = _normalize_reporting_periods(reporting_periods, effective_reporting_period)
    relationship_query = {"customer_org_id": organization_id, "is_active": True, "reporting_period": effective_reporting_period}
    eligible_relationships = await db.supplier_relationships.find(
        relationship_query, {"_id": 0, "id": 1}
    ).to_list(1000)
    eligible_ids = {relationship["id"] for relationship in eligible_relationships}
    requested_ids = list(dict.fromkeys(supplier_relationship_ids or []))
    if assignment_mode == "selected":
        if not requested_ids:
            raise ValueError("Select at least one supplier for this questionnaire")
        if set(requested_ids) - eligible_ids:
            raise ValueError("Selected supplier is unavailable for this ESG questionnaire")
        assigned_supplier_ids = requested_ids
    else:
        assigned_supplier_ids = [relationship["id"] for relationship in eligible_relationships]

    existing_questionnaire_ids = [
        item["id"] for item in await db.supplier_questionnaires.find(
            {"organization_id": organization_id, "is_active": True, "reporting_periods": normalize_questionnaire_reporting_period(effective_reporting_period)}, {"_id": 0, "id": 1}
        ).to_list(1000)
    ]
    questionnaire = {
        "id": questionnaire_id,
        "organization_id": organization_id,
        "name": normalize_questionnaire_template_name(name),
        "description": description,
        "due_date": due_date,
        "scoring_method": scoring_method or "question",
        "section_weights": esg_weights,
        "esg_section_weights": esg_weights,
        "overall_supplier_weights": supplier_weights,
        "esg_subcategories": esg_subcategories,
        "assignment_mode": assignment_mode,
        "assigned_supplier_ids": assigned_supplier_ids,
        "assignment_reporting_period": normalize_questionnaire_reporting_period(effective_reporting_period),
        "reporting_periods": associated_periods,
        "is_active": True,
        "is_deleted": False,
        "question_count": 0,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.supplier_questionnaires.insert_one(questionnaire)
    questionnaire.pop("_id", None)
    # Freeze historic implicit assignments before applying the new questionnaire's targeting.
    legacy_relationships = await db.supplier_relationships.find(
        {"customer_org_id": organization_id, "is_active": True, "questionnaire_ids": {"$exists": False}},
        {"_id": 0, "id": 1},
    ).to_list(1000)
    if legacy_relationships:
        await db.supplier_relationships.update_many(
            {"id": {"$in": [relationship["id"] for relationship in legacy_relationships]}},
            {"$set": {"questionnaire_ids": existing_questionnaire_ids, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    if assigned_supplier_ids:
        await db.supplier_relationships.update_many(
            {"id": {"$in": assigned_supplier_ids}},
            {"$addToSet": {"questionnaire_ids": questionnaire_id, "modules_enabled": "esg"}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return with_questionnaire_reporting_period(questionnaire, effective_reporting_period)


async def seed_bundled_questionnaire_banks() -> None:
    """Upsert versioned system question banks bundled with the application."""
    now = datetime.now(timezone.utc).isoformat()
    for filename in ("esg_annual_basic.json", "esg_annual_standard.json"):
        source_path = Path(__file__).parent / "data" / filename
        bank = json.loads(source_path.read_text(encoding="utf-8"))
        await db.supplier_question_banks.update_one(
            {"id": bank["id"]},
            {"$set": {**bank, "updated_at": now}, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )


async def _system_questionnaire_reset_data(organization_id: str, questionnaire_id: str, bank_key: str) -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Build the original Super Admin bank configuration for one organization-owned template."""
    definition = SYSTEM_QUESTIONNAIRE_BANKS[bank_key]
    bank = await db.supplier_question_banks.find_one({"id": definition["bank_id"], "is_active": True}, {"_id": 0})
    if not bank:
        raise ValueError("The original Super Admin questionnaire bank is unavailable")
    taxonomy = (await resolve_supplier_assessment_config(organization_id)).get("esg_subcategories") or {}
    organization = await db.organizations.find_one(
        {"id": organization_id}, {"_id": 0, "reporting_year_type": 1, "financial_year_start_month": 1}
    ) or {}
    now_date = datetime.now(timezone.utc)
    if organization.get("reporting_year_type") == "calendar_year":
        initial_reporting_period = f"CY {now_date.year}"
    else:
        start_month = int(organization.get("financial_year_start_month") or 4)
        start_year = now_date.year if now_date.month >= start_month else now_date.year - 1
        initial_reporting_period = f"FY {start_year}-{str(start_year + 1)[-2:]}"
    codes_by_name = {
        section: {"".join(char for char in item.get("name", "").lower() if char.isalnum()): item.get("code") for item in taxonomy.get(section, []) if item.get("enabled")}
        for section in ESG_SECTIONS
    }
    now = datetime.now(timezone.utc).isoformat()
    questions = []
    for order, source in enumerate(bank.get("questions") or []):
        section = str(source.get("pillar", "")).lower()
        category_code = codes_by_name.get(section, {}).get("".join(char for char in source.get("subcategory", "").lower() if char.isalnum()))
        if not category_code:
            continue
        assessment_type = source.get("assessment_type", "type_a")
        max_points = float(source.get("max_points") or 1)
        questions.append({
            "id": str(uuid.uuid4()), "questionnaire_id": questionnaire_id, "question_text": source["assessment_question"],
            "description": source.get("configuration"), "response_type": "yes_no", "options": None, "required": True,
            "evidence_requirement": "required" if assessment_type == "type_a" else ("not_required" if assessment_type == "type_b" else "evidence_scored"),
            "assessment_type": assessment_type, "max_points": max_points, "weight": max_points, "importance": "medium", "exact_numerical_weight": max_points,
            "point_scores": {"yes_score": max_points, "yes_with_evidence_score": max_points, "yes_without_evidence_score": max_points / 2, "no_score": 0},
            "category": section, "question_category": category_code, "order": order, "parent_question_id": None,
            "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0}, "is_active": True,
            "system_question_bank": bank_key, "source_question_id": source.get("source_question_id"), "created_at": now,
        })
    if not questions:
        raise ValueError("The original Super Admin questionnaire bank has no applicable questions")
    questionnaire_data = {
        "name": definition["name"], "description": definition["description"], "scoring_method": "question",
        "section_weights": {"environment": 33.33, "social": 33.33, "governance": 33.34},
        "esg_section_weights": {"environment": 33.33, "social": 33.33, "governance": 33.34},
        "overall_supplier_weights": {"esg": 40, "ghg": 40, "revenue": 20}, "esg_subcategories": taxonomy,
        "assignment_mode": "all", "assigned_supplier_ids": [], "reporting_periods": [normalize_questionnaire_reporting_period(initial_reporting_period)],
        "question_count": len(questions), "system_question_bank": bank_key,
    }
    return questionnaire_data, questions


async def _reset_and_hide_system_questionnaire(questionnaire: Dict[str, Any]) -> None:
    """Restore a deleted system template to its Super Admin baseline while retaining response documents."""
    questionnaire_id = questionnaire["id"]
    organization_id = questionnaire["organization_id"]
    reset_data, baseline_questions = await _system_questionnaire_reset_data(
        organization_id, questionnaire_id, questionnaire["system_question_bank"]
    )
    response_periods = await db.supplier_questionnaire_responses.distinct(
        "reporting_period", {"questionnaire_id": questionnaire_id, "reporting_period": {"$nin": [None, ""]}}
    )
    reset_data["reporting_periods"] = list(dict.fromkeys([
        *reset_data["reporting_periods"],
        *(normalize_questionnaire_reporting_period(period) for period in response_periods if normalize_questionnaire_reporting_period(period)),
    ]))
    existing_questions = await db.supplier_questions.find(
        {"questionnaire_id": questionnaire_id}, {"_id": 0}
    ).to_list(1000)
    existing_by_source = {
        question.get("source_question_id"): question
        for question in existing_questions if question.get("source_question_id")
    }
    baseline_source_ids = {question.get("source_question_id") for question in baseline_questions if question.get("source_question_id")}
    now = datetime.now(timezone.utc).isoformat()
    for baseline_question in baseline_questions:
        existing = existing_by_source.get(baseline_question.get("source_question_id"))
        if existing:
            baseline_question["id"] = existing["id"]
            baseline_question["created_at"] = existing.get("created_at") or baseline_question["created_at"]
            baseline_question["updated_at"] = now
            await db.supplier_questions.update_one({"id": existing["id"]}, {"$set": baseline_question})
        else:
            await db.supplier_questions.insert_one(baseline_question)
    stale_question_ids = [
        question["id"] for question in existing_questions
        if question.get("source_question_id") not in baseline_source_ids
    ]
    if stale_question_ids:
        await db.supplier_questions.update_many(
            {"id": {"$in": stale_question_ids}},
            {"$set": {"is_active": False, "system_reset_at": now, "updated_at": now}},
        )
    reset_data.update({
        "is_active": False, "is_deleted": True, "system_hidden_by_org": True,
        "system_bank_last_enabled": True, "system_reset_at": now, "updated_at": now,
    })
    await db.supplier_questionnaires.update_one({"id": questionnaire_id}, {"$set": reset_data, "$unset": {"due_date": "", "assignment_reporting_period": ""}})
    await db.supplier_relationships.update_many(
        {"customer_org_id": organization_id, "questionnaire_ids": questionnaire_id},
        {"$pull": {"questionnaire_ids": questionnaire_id}, "$set": {"updated_at": now}},
    )


async def sync_system_questionnaire_bank(organization_id: str, created_by: str, bank_key: str, enabled: bool) -> None:
    """Activate, deactivate, or create one system-owned questionnaire bank for an organization."""
    definition = SYSTEM_QUESTIONNAIRE_BANKS[bank_key]
    configured_weights = (await resolve_supplier_assessment_config(organization_id)).get("esg_section_weights") or {"environment": 33.33, "social": 33.33, "governance": 33.34}
    existing = await db.supplier_questionnaires.find_one(
        {"organization_id": organization_id, "system_question_bank": bank_key}, {"_id": 0, "id": 1, "is_deleted": 1, "system_hidden_by_org": 1, "system_bank_last_enabled": 1}
    )
    if existing:
        now = datetime.now(timezone.utc).isoformat()
        was_enabled = existing.get("system_bank_last_enabled")
        is_org_hidden = bool(existing.get("system_hidden_by_org") or existing.get("is_deleted"))
        if not enabled:
            await db.supplier_questionnaires.update_one(
                {"id": existing["id"]}, {"$set": {"is_active": False, "is_deleted": True, "system_bank_last_enabled": False, "esg_section_weights": configured_weights, "section_weights": configured_weights, "updated_at": now}}
            )
        elif is_org_hidden and was_enabled is not False:
            await db.supplier_questionnaires.update_one(
                {"id": existing["id"]}, {"$set": {"system_hidden_by_org": True, "system_bank_last_enabled": True, "esg_section_weights": configured_weights, "section_weights": configured_weights, "updated_at": now}}
            )
        else:
            await db.supplier_questionnaires.update_one(
                {"id": existing["id"]}, {"$set": {"is_active": True, "is_deleted": False, "system_hidden_by_org": False, "system_bank_last_enabled": True, "esg_section_weights": configured_weights, "section_weights": configured_weights, "updated_at": now}}
            )
        return
    if not enabled:
        return
    bank = await db.supplier_question_banks.find_one({"id": definition["bank_id"], "is_active": True}, {"_id": 0})
    if not bank:
        logger.warning("System questionnaire bank %s is unavailable", definition["bank_id"])
        return
    taxonomy = (await resolve_supplier_assessment_config(organization_id)).get("esg_subcategories") or {}
    organization = await db.organizations.find_one(
        {"id": organization_id}, {"_id": 0, "reporting_year_type": 1, "financial_year_start_month": 1}
    ) or {}
    now_date = datetime.now(timezone.utc)
    if organization.get("reporting_year_type") == "calendar_year":
        initial_reporting_period = f"CY {now_date.year}"
    else:
        start_month = int(organization.get("financial_year_start_month") or 4)
        start_year = now_date.year if now_date.month >= start_month else now_date.year - 1
        initial_reporting_period = f"FY {start_year}-{str(start_year + 1)[-2:]}"
    codes_by_name = {
        section: {"".join(char for char in item.get("name", "").lower() if char.isalnum()): item.get("code") for item in taxonomy.get(section, []) if item.get("enabled")}
        for section in ESG_SECTIONS
    }
    now = datetime.now(timezone.utc).isoformat()
    questionnaire_id = str(uuid.uuid4())
    questions = []
    for order, source in enumerate(bank.get("questions") or []):
        section = str(source.get("pillar", "")).lower()
        category_code = codes_by_name.get(section, {}).get("".join(char for char in source.get("subcategory", "").lower() if char.isalnum()))
        if not category_code:
            continue
        assessment_type = source.get("assessment_type", "type_a")
        max_points = float(source.get("max_points") or 1)
        questions.append({
            "id": str(uuid.uuid4()), "questionnaire_id": questionnaire_id, "question_text": source["assessment_question"],
            "description": source.get("configuration"), "response_type": "yes_no", "options": None, "required": True,
            "evidence_requirement": "required" if assessment_type == "type_a" else ("not_required" if assessment_type == "type_b" else "evidence_scored"),
            "assessment_type": assessment_type, "max_points": max_points, "weight": max_points, "importance": "medium", "exact_numerical_weight": max_points,
            "point_scores": {"yes_score": max_points, "yes_with_evidence_score": max_points, "yes_without_evidence_score": max_points / 2, "no_score": 0},
            "category": section, "question_category": category_code, "order": order, "parent_question_id": None,
            "scoring": {"rule": "boolean", "true_score": 100, "false_score": 0}, "is_active": True,
            "system_question_bank": bank_key, "source_question_id": source.get("source_question_id"), "created_at": now,
        })
    if not questions:
        return
    await db.supplier_questionnaires.insert_one({
        "id": questionnaire_id, "organization_id": organization_id, "name": definition["name"], "description": definition["description"],
        "scoring_method": "question", "section_weights": configured_weights,
        "esg_section_weights": configured_weights, "overall_supplier_weights": {"esg": 40, "ghg": 40, "revenue": 20},
        "esg_subcategories": taxonomy, "assignment_mode": "all", "assigned_supplier_ids": [], "reporting_periods": [normalize_questionnaire_reporting_period(initial_reporting_period)], "is_active": True, "is_deleted": False,
        "question_count": len(questions), "system_question_bank": bank_key, "system_hidden_by_org": False, "system_bank_last_enabled": True, "created_by": created_by, "created_at": now,
    })
    await db.supplier_questions.insert_many(questions)


async def sync_questionnaire_banks_for_organization(
    organization_id: str,
    created_by: str,
    supplier_config: Optional[Dict[str, Any]] = None,
) -> None:
    """Synchronize all centrally managed questionnaire banks for one organization."""
    config = supplier_config or await resolve_supplier_assessment_config(organization_id)
    for bank_key, definition in SYSTEM_QUESTIONNAIRE_BANKS.items():
        await sync_system_questionnaire_bank(
            organization_id,
            created_by,
            bank_key,
            bool(config.get(definition["config_key"], True)),
        )


async def sync_questionnaire_banks_for_all_organizations() -> None:
    """Seed bundled banks and roll them out idempotently to every active organization."""
    await migrate_legacy_questionnaire_reporting_periods()
    await seed_bundled_questionnaire_banks()
    organizations = await db.organizations.find(
        {"is_active": {"$ne": False}, "is_deleted": {"$ne": True}}, {"_id": 0, "id": 1}
    ).to_list(None)
    for organization in organizations:
        await sync_questionnaire_banks_for_organization(organization["id"], "system_questionnaire_bank_sync")


async def migrate_legacy_questionnaire_reporting_periods() -> Dict[str, int]:
    """Add the FY 2026-27 baseline association and remove legacy year suffixes without touching responses."""
    questionnaires = await db.supplier_questionnaires.find(
        {}, {"_id": 0, "id": 1, "name": 1, "reporting_periods": 1, "assignment_reporting_period": 1}
    ).to_list(None)
    updated = 0
    for questionnaire in questionnaires:
        normalized_name = normalize_questionnaire_template_name(questionnaire.get("name", "Questionnaire"))
        reporting_periods = questionnaire_reporting_periods(questionnaire)
        assignment_reporting_period = normalize_questionnaire_reporting_period(questionnaire.get("assignment_reporting_period"))
        changes: Dict[str, Any] = {}
        if questionnaire.get("name") != normalized_name:
            changes["name"] = normalized_name
        if questionnaire.get("reporting_periods") != reporting_periods:
            changes["reporting_periods"] = reporting_periods
        if questionnaire.get("assignment_reporting_period") and questionnaire.get("assignment_reporting_period") != assignment_reporting_period:
            changes["assignment_reporting_period"] = assignment_reporting_period
        if changes:
            changes["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.supplier_questionnaires.update_one({"id": questionnaire["id"]}, {"$set": changes})
            updated += 1
    return {"updated": updated, "total": len(questionnaires)}


async def migrate_system_questionnaire_point_scores() -> Dict[str, int]:
    """Persist explicit Yes/No point scores for the three system questionnaire banks."""
    questionnaire_ids = [
        questionnaire["id"]
        for questionnaire in await db.supplier_questionnaires.find(
            {"system_question_bank": {"$in": list(SYSTEM_QUESTIONNAIRE_BANKS)}},
            {"_id": 0, "id": 1},
        ).to_list(None)
    ]
    if not questionnaire_ids:
        return {"questionnaires": 0, "questions_checked": 0, "questions_updated": 0}

    questions = await db.supplier_questions.find(
        {
            "questionnaire_id": {"$in": questionnaire_ids},
            "response_type": "yes_no",
            "is_active": {"$ne": False},
        },
        {"_id": 0},
    ).to_list(None)
    updated = 0
    for question in questions:
        existing_scores = question.get("point_scores")
        normalized_question = _with_compatible_point_scores(dict(question))
        normalized_scores = normalized_question["point_scores"]
        if existing_scores == normalized_scores:
            continue
        await db.supplier_questions.update_one(
            {"id": question["id"], "questionnaire_id": question["questionnaire_id"]},
            {"$set": {"point_scores": normalized_scores, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        updated += 1
    return {
        "questionnaires": len(questionnaire_ids),
        "questions_checked": len(questions),
        "questions_updated": updated,
    }


async def sync_advanced_questionnaire_bank(organization_id: str, created_by: str, enabled: bool) -> None:
    """Backward-compatible wrapper for the Advanced bank synchronizer."""
    await sync_system_questionnaire_bank(organization_id, created_by, "advanced", enabled)

async def get_questionnaires(
    self,
    organization_id: str,
    include_inactive: bool = False,
    reporting_period: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get questionnaires for an organization, including inactive templates when requested by an admin."""
    filters: List[Dict[str, Any]] = [{"organization_id": organization_id}]
    if include_inactive:
        filters.append({"$or": [
            {"is_active": True},
            {"is_active": False, "is_deleted": False},
        ]})
    else:
        filters.extend([{"is_active": True}, {"is_deleted": {"$ne": True}}])
    if reporting_period:
        associated_period = normalize_questionnaire_reporting_period(reporting_period)
        period_filters: List[Dict[str, Any]] = [{"reporting_periods": associated_period}]
        if associated_period == INITIAL_QUESTIONNAIRE_REPORTING_PERIOD:
            period_filters.extend([
                {"reporting_periods": {"$exists": False}, "assignment_reporting_period": reporting_period},
                {"reporting_periods": {"$exists": False}, "assignment_reporting_period": {"$in": [None, ""]}},
            ])
        filters.append({"$or": period_filters})
    query = {"$and": filters}
    questionnaires = await db.supplier_questionnaires.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    questionnaire_ids = [questionnaire["id"] for questionnaire in questionnaires]
    locked_ids = set(await db.supplier_questionnaire_responses.distinct(
        "questionnaire_id", {"questionnaire_id": {"$in": questionnaire_ids}, "status": "submitted", "$or": [{"is_current": True}, {"is_current": {"$exists": False}}]}
    )) if questionnaire_ids else set()
    reviewable_ids = set(await db.supplier_questionnaire_responses.distinct(
        "questionnaire_id", {
            "questionnaire_id": {"$in": questionnaire_ids},
            "status": "submitted",
            "$or": [{"is_current": True}, {"is_current": {"$exists": False}}],
        }
    )) if questionnaire_ids else set()
    history_ids = set(await db.supplier_questionnaire_responses.distinct(
        "questionnaire_id", {
            "questionnaire_id": {"$in": questionnaire_ids},
            "$or": [{"status": "submitted"}, {"submitted_at": {"$exists": True, "$nin": [None, ""]}}],
        }
    )) if questionnaire_ids else set()
    supplier_query: Dict[str, Any] = {"customer_org_id": organization_id, "is_active": True}
    if reporting_period:
        supplier_query["reporting_period"] = reporting_period
    active_suppliers = await db.supplier_relationships.find(
        supplier_query,
        {"_id": 0, "id": 1, "questionnaire_ids": 1},
    ).to_list(1000)
    for questionnaire in questionnaires:
        questionnaire["scoring_method"] = questionnaire.get("scoring_method") or "question"
        questionnaire["has_locked_submissions"] = questionnaire["id"] in locked_ids
        questionnaire["has_reviewable_submissions"] = questionnaire["id"] in reviewable_ids
        questionnaire["has_submission_history"] = questionnaire["id"] in history_ids
        if questionnaire.get("assignment_mode") == "all":
            assigned_count = len(active_suppliers)
        else:
            assigned_ids = set(questionnaire.get("assigned_supplier_ids") or [])
            assigned_count = sum(
                supplier["id"] in assigned_ids
                or questionnaire["id"] in (supplier.get("questionnaire_ids") or [])
                for supplier in active_suppliers
            )
        questionnaire["assigned_supplier_count"] = assigned_count
        questionnaire["total_supplier_count"] = len(active_suppliers)
        with_questionnaire_reporting_period(questionnaire, reporting_period)
    return questionnaires

async def get_questionnaire(self, questionnaire_id: str) -> Optional[Dict[str, Any]]:
    """Get single questionnaire with questions."""
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id},
        {"_id": 0}
    )
    if questionnaire:
        questionnaire["scoring_method"] = questionnaire.get("scoring_method") or "question"
        questionnaire.update(await _questionnaire_submission_state(questionnaire_id))
        with_questionnaire_reporting_period(questionnaire, None)
        questions = await db.supplier_questions.find(
            {"questionnaire_id": questionnaire_id, "is_active": True},
            {"_id": 0}
        ).sort("order", 1).to_list(500)
        questionnaire["questions"] = ordered_question_hierarchy([
            _with_compatible_point_scores(question) for question in questions
        ])
    return questionnaire


async def _questionnaire_submission_state(questionnaire_id: str) -> Dict[str, bool]:
    """Separate current locks from permanent submission history for safe questionnaire administration."""
    locked_submission = await db.supplier_questionnaire_responses.find_one(
        {"questionnaire_id": questionnaire_id, "status": "submitted", "$or": [{"is_current": True}, {"is_current": {"$exists": False}}]}, {"_id": 0, "id": 1}
    )
    reviewable_submission = await db.supplier_questionnaire_responses.find_one(
        {
            "questionnaire_id": questionnaire_id,
            "status": "submitted",
            "$or": [{"is_current": True}, {"is_current": {"$exists": False}}],
        },
        {"_id": 0, "id": 1},
    )
    submitted_history = await db.supplier_questionnaire_responses.find_one(
        {
            "questionnaire_id": questionnaire_id,
            "$or": [{"status": "submitted"}, {"submitted_at": {"$exists": True, "$nin": [None, ""]}}],
        },
        {"_id": 0, "id": 1},
    )
    return {
        "has_locked_submissions": bool(locked_submission),
        "has_reviewable_submissions": bool(reviewable_submission),
        "has_submission_history": bool(submitted_history),
    }


async def unlock_all_questionnaire_responses(self, customer_org_id: str, questionnaire_id: str, unlocked_by: str) -> int:
    responses = await db.supplier_questionnaire_responses.find(
        {"questionnaire_id": questionnaire_id, "is_current": True, "status": "submitted"}, {"_id": 0, "id": 1, "supplier_relationship_id": 1}
    ).to_list(1000)
    if not responses:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    await db.supplier_questionnaire_responses.update_many(
        {"id": {"$in": [response["id"] for response in responses]}},
        {"$set": {"status": "reopened", "reopened_at": now, "reopened_by": unlocked_by, "updated_at": now}},
    )
    relationships = await db.supplier_relationships.find(
        {"id": {"$in": list({response["supplier_relationship_id"] for response in responses})}, "customer_org_id": customer_org_id}, {"_id": 0}
    ).to_list(1000)
    for relationship in relationships:
        await notify_supplier_module_unlocked(relationship, "esg", f"{questionnaire_id}:{now}:{relationship['id']}")
    return len(responses)


async def _notify_questionnaire_change(questionnaire_id: str, question_text: str) -> None:
    relationships = await db.supplier_relationships.find(
        {"questionnaire_ids": questionnaire_id, "is_active": True}, {"_id": 0, "contact_email": 1, "company_name": 1}
    ).to_list(1000)
    for relationship in relationships:
        email = str(relationship.get("contact_email") or "").strip()
        if email:
            try:
                await send_email(email, "ESG questionnaire updated", questionnaire_change_email(question_text, f"{FRONTEND_URL.rstrip('/')}/login"))
            except Exception:
                logger.exception("supplier_assessment.questionnaire_change_email_failed")

async def update_questionnaire(
    self,
    questionnaire_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update questionnaire."""
    existing = await self.get_questionnaire(questionnaire_id)
    if not existing:
        return None
    if set(updates) - {"is_active"}:
        submission_state = await _questionnaire_submission_state(questionnaire_id)
        if submission_state["has_locked_submissions"]:
            raise ValueError("Unlock all submitted supplier responses before editing this questionnaire")
    if "due_date" in updates:
        validate_due_date(updates["due_date"])
    if "name" in updates:
        updates["name"] = normalize_questionnaire_template_name(updates["name"])
    if "reporting_periods" in updates:
        updated_periods = _normalize_reporting_periods(updates["reporting_periods"])
        response_periods = set(await db.supplier_questionnaire_responses.distinct(
            "reporting_period", {"questionnaire_id": questionnaire_id, "reporting_period": {"$nin": [None, ""]}}
        ))
        removed_response_periods = response_periods - set(updated_periods)
        if removed_response_periods:
            raise ValueError("A reporting period with existing questionnaire responses cannot be removed")
        updates["reporting_periods"] = updated_periods
    if "esg_section_weights" in updates or "section_weights" in updates:
        updates["esg_section_weights"] = self._validated_weight_config(
            updates.get("esg_section_weights") or updates.get("section_weights"),
            {"environment": 33.33, "social": 33.33, "governance": 33.34},
            "ESG category weights",
        )
        updates["section_weights"] = updates["esg_section_weights"]
    if "overall_supplier_weights" in updates:
        updates["overall_supplier_weights"] = self._validated_weight_config(
            updates["overall_supplier_weights"],
            {"esg": 40.0, "ghg": 40.0, "revenue": 20.0},
            "Overall component weights",
        )
    if "is_active" in updates:
        if existing.get("system_question_bank"):
            if updates["is_active"]:
                if existing.get("system_bank_last_enabled") is False:
                    raise ValueError("Super Admin must re-enable this system questionnaire bank")
                updates["is_deleted"] = False
                updates["system_hidden_by_org"] = False
                updates["system_bank_last_enabled"] = True
            else:
                updates["is_deleted"] = False
                updates["system_hidden_by_org"] = True
                updates["system_bank_last_enabled"] = True
        else:
            updates["is_deleted"] = False
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.supplier_questionnaires.update_one(
        {"id": questionnaire_id},
        {"$set": updates}
    )
    return await self.get_questionnaire(questionnaire_id)


async def list_questionnaire_assignments(self, customer_org_id: str, questionnaire_id: str, reporting_period: Optional[str] = None) -> Optional[Dict[str, Any]]:
    questionnaire = await db.supplier_questionnaires.find_one({"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True}, {"_id": 0})
    if not questionnaire:
        return None
    supplier_query = {"customer_org_id": customer_org_id, "is_active": True}
    effective_period = reporting_period or questionnaire.get("assignment_reporting_period")
    if not questionnaire_is_available_for_period(questionnaire, effective_period):
        return None
    if effective_period:
        supplier_query["reporting_period"] = effective_period
    suppliers = await db.supplier_relationships.find(supplier_query, {"_id": 0, "id": 1, "company_name": 1, "questionnaire_ids": 1, "reporting_period": 1}).to_list(1000)
    assigned_ids = set(questionnaire.get("assigned_supplier_ids") or [])
    response_query: Dict[str, Any] = {"questionnaire_id": questionnaire_id, "supplier_relationship_id": {"$in": [supplier["id"] for supplier in suppliers]}, "is_current": True}
    if effective_period:
        response_query["reporting_period"] = effective_period
    responses = await db.supplier_questionnaire_responses.find(
        response_query, {"_id": 0, "supplier_relationship_id": 1, "status": 1}
    ).to_list(1000)
    response_statuses = {response["supplier_relationship_id"]: response.get("status") for response in responses}
    rows = []
    for supplier in suppliers:
        is_assigned = supplier["id"] in assigned_ids or ("questionnaire_ids" in supplier and questionnaire_id in (supplier.get("questionnaire_ids") or []))
        status = response_statuses.get(supplier["id"], "not_started")
        rows.append({"supplier_relationship_id": supplier["id"], "supplier_name": supplier.get("company_name", "Supplier"), "is_assigned": is_assigned, "status": status, "can_unassign": is_assigned and status != "submitted", "can_unlock": is_assigned and status == "submitted"})
    return {"questionnaire_id": questionnaire_id, "reporting_period": effective_period, "assignments": rows}


async def assign_questionnaire_to_supplier(self, customer_org_id: str, questionnaire_id: str, supplier_relationship_id: str, reporting_period: Optional[str] = None) -> None:
    questionnaire = await db.supplier_questionnaires.find_one({"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True}, {"_id": 0, "assigned_supplier_ids": 1, "reporting_periods": 1, "assignment_reporting_period": 1})
    relationship_query = {"id": supplier_relationship_id, "customer_org_id": customer_org_id, "is_active": True}
    if reporting_period:
        relationship_query["reporting_period"] = reporting_period
    relationship = await db.supplier_relationships.find_one(relationship_query, {"_id": 0, "id": 1})
    if not questionnaire or not relationship or not questionnaire_is_available_for_period(questionnaire, relationship.get("reporting_period")):
        raise ValueError("Questionnaire or supplier is unavailable")
    now = datetime.now(timezone.utc).isoformat()
    await db.supplier_questionnaires.update_one({"id": questionnaire_id}, {"$addToSet": {"assigned_supplier_ids": supplier_relationship_id}, "$set": {"assignment_mode": "selected", "updated_at": now}})
    await db.supplier_relationships.update_one({"id": supplier_relationship_id}, {"$addToSet": {"questionnaire_ids": questionnaire_id, "modules_enabled": "esg"}, "$set": {"updated_at": now}})


async def unassign_questionnaire_from_supplier(self, customer_org_id: str, questionnaire_id: str, supplier_relationship_id: str, reporting_period: Optional[str] = None) -> None:
    relationship = await db.supplier_relationships.find_one({"id": supplier_relationship_id, "customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "questionnaire_ids": 1, "reporting_period": 1})
    effective_period = reporting_period or (relationship or {}).get("reporting_period")
    response = await db.supplier_questionnaire_responses.find_one(
        {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "reporting_period": effective_period, "is_current": True, "status": "submitted"}, {"_id": 0, "id": 1}
    )
    if response:
        raise ValueError("A submitted questionnaire cannot be unassigned")
    questionnaire = await db.supplier_questionnaires.find_one({"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1})
    if not questionnaire or not relationship:
        raise ValueError("Questionnaire or supplier is unavailable")
    now = datetime.now(timezone.utc).isoformat()
    if "questionnaire_ids" not in relationship:
        active_ids = [item["id"] for item in await db.supplier_questionnaires.find({"organization_id": customer_org_id, "is_active": True, "id": {"$ne": questionnaire_id}}, {"_id": 0, "id": 1}).to_list(1000)]
        await db.supplier_relationships.update_one({"id": supplier_relationship_id}, {"$set": {"questionnaire_ids": active_ids, "updated_at": now}})
    else:
        await db.supplier_relationships.update_one({"id": supplier_relationship_id}, {"$pull": {"questionnaire_ids": questionnaire_id}, "$set": {"updated_at": now}})
    await db.supplier_questionnaires.update_one({"id": questionnaire_id}, {"$pull": {"assigned_supplier_ids": supplier_relationship_id}, "$set": {"assignment_mode": "selected", "updated_at": now}})

async def delete_questionnaire(self, questionnaire_id: str) -> bool:
    """Soft delete questionnaire."""
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id}, {"_id": 0, "id": 1, "organization_id": 1, "system_question_bank": 1}
    )
    if not questionnaire:
        return False
    if (await _questionnaire_submission_state(questionnaire_id))["has_submission_history"]:
        raise ValueError("This questionnaire has submitted supplier responses and cannot be deleted. Mark it inactive to stop new submissions.")
    if questionnaire.get("system_question_bank"):
        await _reset_and_hide_system_questionnaire(questionnaire)
        return True
    result = await db.supplier_questionnaires.update_one(
        {"id": questionnaire_id},
        {"$set": {"is_active": False, "is_deleted": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return result.modified_count > 0

async def duplicate_questionnaire(
    self,
    questionnaire_id: str,
    new_name: str,
    created_by: str,
) -> Optional[Dict[str, Any]]:
    """Duplicate a questionnaire with all questions."""
    original = await self.get_questionnaire(questionnaire_id)
    if not original:
        return None
    
    # Create new questionnaire
    new_questionnaire = await self.create_questionnaire(
        organization_id=original["organization_id"],
        name=new_name,
        description=original.get("description"),
        due_date=original.get("due_date"),
        scoring_method=original.get("scoring_method", "question"),
        section_weights=original.get("section_weights"),
        esg_section_weights=original.get("esg_section_weights"),
        overall_supplier_weights=original.get("overall_supplier_weights"),
        created_by=created_by,
    )
    
    # Copy parent questions first, then reconnect their subquestions to the new IDs.
    copied_ids = {}
    for q in [item for item in original.get("questions", []) if not item.get("parent_question_id")]:
        copied = await self.add_question(
            questionnaire_id=new_questionnaire["id"],
            question_text=q["question_text"],
            description=q.get("description"),
            response_type=q["response_type"],
            options=q.get("options"),
            required=q.get("required", True),
            evidence_requirement=q.get("evidence_requirement", "not_required"),
            weight=q.get("weight", 1.0),
            importance=q.get("importance"),
            exact_numerical_weight=q.get("exact_numerical_weight"),
            category=q["category"],
            order=q.get("order", 0),
            scoring=q.get("scoring"),
            question_category=q.get("question_category", "policy"),
        )
        copied_ids[q["id"]] = copied["id"]
    for q in [item for item in original.get("questions", []) if item.get("parent_question_id")]:
        await self.add_question(
            questionnaire_id=new_questionnaire["id"],
            question_text=q["question_text"],
            description=q.get("description"),
            response_type=q["response_type"],
            options=q.get("options"),
            required=q.get("required", True),
            evidence_requirement=q.get("evidence_requirement", "not_required"),
            weight=q.get("weight", 1.0),
            importance=q.get("importance"),
            exact_numerical_weight=q.get("exact_numerical_weight"),
            category=q["category"],
            order=q.get("order", 0),
            scoring=q.get("scoring"),
            parent_question_id=copied_ids.get(q.get("parent_question_id")),
            question_category=q.get("question_category", "policy"),
        )
    
    return await self.get_questionnaire(new_questionnaire["id"])

# ========================================================================
# Question Management
# ========================================================================

async def add_question(
    self,
    questionnaire_id: str,
    question_text: str,
    description: Optional[str],
    response_type: str,
    options: Optional[List[Dict[str, Any]]],
    required: bool,
    evidence_requirement: str,
    weight: Optional[float],
    exact_numerical_weight: Optional[float],
    category: str,
    order: int,
    scoring: Optional[Dict[str, Any]] = None,
    parent_question_id: Optional[str] = None,
    question_category: Optional[str] = None,
    assessment_type: str = "standard",
    max_points: Optional[float] = None,
    point_scores: Optional[Dict[str, float]] = None,
    missing_evidence_percent: Optional[float] = None,
) -> Dict[str, Any]:
    """Add a question to a questionnaire."""
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id}, {"_id": 0, "organization_id": 1, "esg_subcategories": 1}
    )
    if not questionnaire:
        raise ValueError("Questionnaire not found")
    if (await _questionnaire_submission_state(questionnaire_id))["has_locked_submissions"]:
        raise ValueError("Unlock all submitted supplier responses before editing questionnaire questions")
    # Authoring follows the organization's current configuration so a newly enabled
    # custom category is immediately available on existing questionnaires as well.
    taxonomy = (await resolve_supplier_assessment_config(questionnaire["organization_id"])).get("esg_subcategories") or {}
    if taxonomy != questionnaire.get("esg_subcategories"):
        await db.supplier_questionnaires.update_one(
            {"id": questionnaire_id}, {"$set": {"esg_subcategories": taxonomy, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    parent_question = None
    if parent_question_id:
        parent_question = await db.supplier_questions.find_one(
            {"id": parent_question_id, "questionnaire_id": questionnaire_id, "is_active": True}, {"_id": 0}
        )
        if not parent_question:
            raise ValueError("Parent question not found")
        if parent_question.get("parent_question_id"):
            raise ValueError("Subquestions cannot contain nested subquestions")
    question_id = str(uuid.uuid4())
    effective_weight = exact_numerical_weight or weight or max_points or 1.0
    scoring = self._synchronize_choice_mapping(scoring, options)
    question = {
        "id": question_id,
        "questionnaire_id": questionnaire_id,
        "question_text": question_text,
        "description": description,
        "response_type": response_type,
        "options": options,
        "required": required,
        "evidence_requirement": self._question_evidence_requirement(evidence_requirement),
        "assessment_type": assessment_type,
        "max_points": max_points,
        "point_scores": point_scores,
        "missing_evidence_percent": missing_evidence_percent,
        "weight": effective_weight,
        "exact_numerical_weight": exact_numerical_weight,
        "category": parent_question.get("category") if parent_question else category,
        "question_category": parent_question.get("question_category") if parent_question else _validate_question_category(taxonomy, category, question_category),
        "order": order,
        "parent_question_id": parent_question_id,
        "scoring": scoring,  # New: Scoring configuration
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.supplier_questions.insert_one(question)
    
    # Update question count
    await db.supplier_questionnaires.update_one(
        {"id": questionnaire_id},
        {"$inc": {"question_count": 1}}
    )
    await _notify_questionnaire_change(questionnaire_id, question_text)
    
    return question

async def update_question(
    self,
    question_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a question."""
    existing = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if not existing:
        return None
    if (await _questionnaire_submission_state(existing["questionnaire_id"]))["has_locked_submissions"]:
        raise ValueError("Unlock all submitted supplier responses before editing questionnaire questions")
    if "question_category" in updates or "category" in updates:
        questionnaire = await db.supplier_questionnaires.find_one(
            {"id": existing["questionnaire_id"]}, {"_id": 0, "organization_id": 1, "esg_subcategories": 1}
        ) or {}
        taxonomy = questionnaire.get("esg_subcategories") or (
            await resolve_supplier_assessment_config(questionnaire.get("organization_id"))
        ).get("esg_subcategories") or {}
        requested_category = updates.get("question_category", existing.get("question_category"))
        requested_section = updates.get("category", existing.get("category"))
        if requested_category not in {"policy", "reporting", "certification"}:
            updates["question_category"] = _validate_question_category(taxonomy, requested_section, requested_category)
    if "parent_question_id" in updates and updates["parent_question_id"] != existing.get("parent_question_id"):
        parent_question_id = updates["parent_question_id"]
        parent_question = await db.supplier_questions.find_one(
            {"id": parent_question_id, "questionnaire_id": existing["questionnaire_id"], "is_active": True}, {"_id": 0}
        ) if parent_question_id else None
        if parent_question_id and (not parent_question or parent_question.get("parent_question_id")):
            raise ValueError("Subquestions must belong to an active top-level question")
        if parent_question:
            updates["category"] = parent_question.get("category")
    if {"importance", "exact_numerical_weight", "weight"}.intersection(updates):
        importance, exact_weight, effective_weight = self._resolve_question_weight(
            updates.get("importance", existing.get("importance")),
            updates.get("exact_numerical_weight", existing.get("exact_numerical_weight")),
            updates.get("weight", existing.get("weight")),
        )
        updates.update({
            "importance": importance,
            "exact_numerical_weight": exact_weight,
            "weight": effective_weight,
        })
    if "scoring" in updates or "options" in updates:
        updates["scoring"] = self._synchronize_choice_mapping(
            updates.get("scoring", existing.get("scoring")),
            updates.get("options", existing.get("options")),
        )
    if "evidence_requirement" in updates:
        updates["evidence_requirement"] = self._question_evidence_requirement(updates["evidence_requirement"])
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.supplier_questions.update_one(
        {"id": question_id},
        {"$set": updates}
    )
    if "question_text" in updates or any(field in updates for field in {"scoring", "options", "max_points", "point_scores", "weight", "exact_numerical_weight", "assessment_type"}):
        await _notify_questionnaire_change(existing["questionnaire_id"], updates.get("question_text") or existing.get("question_text", ""))
    updated_question = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if updated_question and ("scoring" in updates or "options" in updates or {"importance", "exact_numerical_weight", "weight", "max_points", "point_scores", "assessment_type", "evidence_requirement", "parent_question_id"}.intersection(updates)):
        from modules.supplier_assessment.scoring import ScoringEngine
        await ScoringEngine(db).recalculate_all_suppliers(updated_question["questionnaire_id"])
    return updated_question

async def delete_question(self, question_id: str) -> bool:
    """Soft delete a question."""
    question = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if not question:
        return False
    if (await _questionnaire_submission_state(question["questionnaire_id"]))["has_locked_submissions"]:
        raise ValueError("Unlock all submitted supplier responses before deleting questionnaire questions")
    
    now = datetime.now(timezone.utc).isoformat()
    affected_ids = [question_id]
    if not question.get("parent_question_id"):
        children = await db.supplier_questions.find(
            {"parent_question_id": question_id, "questionnaire_id": question["questionnaire_id"], "is_active": True}, {"_id": 0, "id": 1}
        ).to_list(500)
        affected_ids.extend(child["id"] for child in children)
    result = await db.supplier_questions.update_many(
        {"id": {"$in": affected_ids}, "is_active": True},
        {"$set": {"is_active": False, "updated_at": now}}
    )
    
    if result.modified_count > 0:
        await db.supplier_questionnaires.update_one(
            {"id": question["questionnaire_id"]},
            {"$inc": {"question_count": -result.modified_count}}
        )
    
    return result.modified_count > 0


def ordered_question_hierarchy(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return each parent directly followed by its always-visible subquestions."""
    question_ids = {question["id"] for question in questions}
    children_by_parent: Dict[str, List[Dict[str, Any]]] = {}
    parents: List[Dict[str, Any]] = []
    for question in questions:
        parent_id = question.get("parent_question_id")
        if parent_id and parent_id in question_ids:
            children_by_parent.setdefault(parent_id, []).append(question)
        else:
            parents.append(question)
    ordered: List[Dict[str, Any]] = []
    for parent in parents:
        ordered.append(parent)
        ordered.extend(sorted(children_by_parent.get(parent["id"], []), key=lambda item: (item.get("order", 0), item.get("created_at", ""))))
    return ordered

async def reorder_questions(
    self,
    questionnaire_id: str,
    question_orders: List[Dict[str, Any]],  # [{"id": "...", "order": 1}, ...]
) -> bool:
    """Reorder questions in a questionnaire."""
    if (await _questionnaire_submission_state(questionnaire_id))["has_locked_submissions"]:
        raise ValueError("Unlock all submitted supplier responses before reordering questionnaire questions")
    for item in question_orders:
        await db.supplier_questions.update_one(
            {"id": item["id"], "questionnaire_id": questionnaire_id},
            {"$set": {"order": item["order"]}}
        )
    return True

# ========================================================================
# Supplier Response Management
# ========================================================================

async def _current_questionnaire_response(self, questionnaire_id: str, supplier_relationship_id: str, reporting_period: Optional[str] = None) -> Optional[Dict[str, Any]]:
    query = {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "is_current": True}
    if reporting_period:
        query["reporting_period"] = reporting_period
    response = await db.supplier_questionnaire_responses.find_one(
        query,
        {"_id": 0}, sort=[("revision", -1)],
    )
    if response:
        return response
    legacy_query = {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "is_current": {"$exists": False}}
    if reporting_period:
        legacy_query["reporting_period"] = {"$exists": False}
    return await db.supplier_questionnaire_responses.find_one(
        legacy_query,
        {"_id": 0}, sort=[("submitted_at", -1)],
    )

async def get_supplier_questionnaire_status(
    self,
    supplier_org_id: str,
    customer_org_id: str,
) -> List[Dict[str, Any]]:
    """Get questionnaire status for a supplier."""
    # Get relationship
    relationship = await db.supplier_relationships.find_one(
        {
            "supplier_org_id": supplier_org_id,
            "customer_org_id": customer_org_id,
            "is_active": True,
        },
        {"_id": 0}
    )
    if not relationship:
        return []
    
    # Relationships created before explicit assignment retain legacy access to all active questionnaires.
    questionnaire_query: Dict[str, Any] = {
        "organization_id": customer_org_id,
        "is_active": True,
        "reporting_periods": normalize_questionnaire_reporting_period(relationship.get("reporting_period")),
    }
    if "questionnaire_ids" in relationship:
        questionnaire_query["id"] = {"$in": relationship.get("questionnaire_ids") or []}
    questionnaires = await db.supplier_questionnaires.find(
        questionnaire_query,
        {"_id": 0}
    ).to_list(100)
    
    statuses = []
    for q in questionnaires:
        # Get response status
        response_doc = await self._current_questionnaire_response(q["id"], relationship["id"], relationship.get("reporting_period"))
        
        active_questions = await db.supplier_questions.find(
            {"questionnaire_id": q["id"], "is_active": True},
            {"_id": 0, "id": 1},
        ).to_list(None)
        active_question_ids = {question["id"] for question in active_questions}
        total_questions = len(active_question_ids)
        
        answered_count = 0
        status = "not_started"
        completion_percent = 0.0
        calculated_score = None
        submitted_at = None
        has_unlocked_questions = False
        unlocked_question_count = 0
        
        if response_doc:
            answers = response_doc.get("answers", {})
            unresolved_clarification_ids = active_question_ids & set(response_doc.get("unlocked_question_ids") or [])
            answered_count = sum(
                answer is not None and question_id in active_question_ids and question_id not in unresolved_clarification_ids
                for question_id, answer in answers.items()
            )
            status = response_doc.get("status", "in_progress")
            submitted_at = response_doc.get("submitted_at")
            calculated_score = response_doc.get("calculated_score")
            has_unlocked_questions = bool(response_doc.get("has_unlocked_questions"))
            unlocked_question_count = len(unresolved_clarification_ids)
            
            if total_questions > 0:
                completion_percent = min(100.0, (answered_count / total_questions) * 100)
        
        statuses.append({
            "questionnaire_id": q["id"],
            "questionnaire_name": normalize_questionnaire_template_name(q["name"]),
            "reporting_period": relationship.get("reporting_period"),
            "supplier_relationship_id": relationship["id"],
            "status": status,
            "completion_percent": round(completion_percent, 1),
            "answered_count": answered_count,
            "total_questions": total_questions,
            "calculated_score": calculated_score,
            "submitted_at": submitted_at,
            "has_unlocked_questions": has_unlocked_questions,
            "unlocked_question_count": unlocked_question_count,
            "due_date": q.get("due_date") or relationship.get("due_date"),
        })
    
    return statuses

async def get_questionnaire_for_supplier(
    self,
    questionnaire_id: str,
    supplier_relationship_id: str,
) -> Optional[Dict[str, Any]]:
    """Get questionnaire with supplier's answers."""
    questionnaire = await self.get_questionnaire(questionnaire_id)
    if not questionnaire:
        return None
    
    # Get supplier's responses
    relationship = await self.get_supplier(supplier_relationship_id)
    if (
        not relationship
        or questionnaire.get("organization_id") != relationship.get("customer_org_id")
        or questionnaire.get("is_active") is not True
        or questionnaire.get("is_deleted") is True
        or not questionnaire_is_available_for_period(questionnaire, relationship.get("reporting_period"))
        or ("questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", []))
    ):
        return None
    response_doc = await self._current_questionnaire_response(questionnaire_id, supplier_relationship_id, (relationship or {}).get("reporting_period"))
    questionnaire["submission_deadline_passed"] = has_due_date_passed(
        questionnaire.get("due_date") or relationship.get("due_date")
    )
    
    answers = response_doc.get("answers", {}) if response_doc else {}
    evidence_by_question = response_doc.get("question_evidence", {}) if response_doc else {}
    
    # Merge answers into questions
    question_timestamps = response_doc.get("question_timestamps", {}) if response_doc else {}
    question_reviews = response_doc.get("question_reviews", {}) if response_doc else {}
    clarification_replies = response_doc.get("clarification_replies", {}) if response_doc else {}
    unlocked_ids = set(response_doc.get("unlocked_question_ids") or []) if response_doc else set()
    for q in questionnaire.get("questions", []):
        q["answer"] = answers.get(q["id"])
        q["evidence_requirement"] = self._question_evidence_requirement(q.get("evidence_requirement"))
        q["evidence_files"] = await self._question_evidence_metadata(
            supplier_relationship_id, questionnaire_id, q["id"], evidence_by_question.get(q["id"], []),
            (response_doc.get("reused_evidence_by_question") or {}).get(q["id"], []) if response_doc else [],
        )
        q["timestamps"] = question_timestamps.get(q["id"])
        q["is_unlocked_for_edit"] = q["id"] in unlocked_ids
        q["review"] = question_reviews.get(q["id"]) if q["is_unlocked_for_edit"] else None
        q["clarification_reply"] = clarification_replies.get(q["id"]) if q["is_unlocked_for_edit"] else None
    
    questionnaire["response_status"] = response_doc.get("status", "not_started") if response_doc else "not_started"
    questionnaire["has_unlocked_questions"] = bool(response_doc.get("has_unlocked_questions")) if response_doc else False
    questionnaire["unlocked_question_ids"] = list(unlocked_ids)
    questionnaire["submitted_at"] = response_doc.get("submitted_at") if response_doc else None
    questionnaire["reopened_at"] = response_doc.get("reopened_at") if response_doc else None
    with_questionnaire_reporting_period(questionnaire, relationship.get("reporting_period"))
    
    return questionnaire

async def _question_evidence_metadata(
    self, supplier_relationship_id: str, questionnaire_id: str, question_id: str, evidence_ids: List[str], reused_evidence_ids: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    records = await db.supplier_question_evidence.find(
        {"supplier_relationship_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "is_deleted": {"$ne": True},
         "$or": [{"id": {"$in": evidence_ids or []}}, {"question_id": question_id}]},
        {"_id": 0, "id": 1, "original_filename": 1, "content_type": 1, "file_size": 1, "uploaded_at": 1},
    ).to_list(100)
    by_id = {record["id"]: record for record in records}
    reused_ids = set(reused_evidence_ids or [])
    ordered_ids = list(dict.fromkeys([*(evidence_ids or []), *(record["id"] for record in records if record["id"] not in (evidence_ids or []))]))
    return [{**by_id[evidence_id], "reused": evidence_id in reused_ids} for evidence_id in ordered_ids if evidence_id in by_id]


async def find_supplier_question_evidence_duplicates(
    self, relationship: Dict[str, Any], questionnaire_id: str, sha256_hash: str, filename: str,
) -> Dict[str, Optional[Dict[str, Any]]]:
    """Find reusable evidence only inside the supplier/questionnaire/reporting-period boundary."""
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id, "organization_id": relationship["customer_org_id"], "is_active": True}, {"_id": 0, "id": 1}
    )
    if not questionnaire or ("questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", [])):
        raise ValueError("Questionnaire is not assigned to this supplier")
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    if "questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", []):
        raise ValueError("Questionnaire is not assigned to this supplier")
    scope = {
        "customer_org_id": relationship["customer_org_id"], "supplier_relationship_id": relationship["id"],
        "questionnaire_id": questionnaire_id, "reporting_period": reporting_period, "is_deleted": {"$ne": True},
    }
    projection = {"_id": 0, "id": 1, "original_filename": 1, "content_type": 1, "file_size": 1, "uploaded_at": 1}
    exact = await db.supplier_question_evidence.find_one({**scope, "sha256_hash": sha256_hash.lower()}, projection)
    filename_match = None if exact else await db.supplier_question_evidence.find_one(
        {**scope, "$or": [
            {"normalized_filename": _normalize_evidence_filename(filename)},
            {"original_filename": {"$regex": f"^{re.escape(str(filename).strip())}$", "$options": "i"}},
        ]}, projection
    )
    return {"exact_match": exact, "filename_match": filename_match}


async def reuse_supplier_question_evidence(
    self, relationship: Dict[str, Any], questionnaire_id: str, question_id: str, evidence_id: str,
) -> Dict[str, Any]:
    """Attach an existing evidence asset to one more question without creating an R2 object."""
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    response = await self._current_questionnaire_response(questionnaire_id, relationship["id"], reporting_period)
    is_partially_unlocked = bool(response and response.get("has_unlocked_questions") and question_id in (response.get("unlocked_question_ids") or []))
    if not response or (response.get("status") == "submitted" and not is_partially_unlocked):
        raise ValueError("Save a Yes response before reusing evidence")
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True}, {"_id": 0, "response_type": 1}
    )
    if not question or (question.get("response_type") == "yes_no" and response.get("answers", {}).get(question_id) is not True):
        raise ValueError("Select Yes before attaching evidence for this question")
    evidence = await db.supplier_question_evidence.find_one(
        {"id": evidence_id, "customer_org_id": relationship["customer_org_id"], "supplier_relationship_id": relationship["id"],
         "questionnaire_id": questionnaire_id, "reporting_period": reporting_period, "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if not evidence:
        raise ValueError("Reusable evidence file is unavailable for this reporting period")
    question_evidence = dict(response.get("question_evidence") or {})
    question_evidence[question_id] = list(dict.fromkeys([*(question_evidence.get(question_id) or []), evidence_id]))
    reused = dict(response.get("reused_evidence_by_question") or {})
    reused[question_id] = list(dict.fromkeys([*(reused.get(question_id) or []), evidence_id]))
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]}, {"$set": {"question_evidence": question_evidence, "reused_evidence_by_question": reused, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {key: evidence[key] for key in ("id", "original_filename", "content_type", "file_size", "uploaded_at") if key in evidence} | {"reused": True}

async def upload_supplier_question_evidence(
    self, relationship: Dict[str, Any], questionnaire_id: str, question_id: str,
    filename: str, content_type: str, content: bytes, uploaded_by: str, sha256_hash: Optional[str] = None,
) -> Dict[str, Any]:
    questionnaire = await self.get_questionnaire(questionnaire_id)
    if (
        not questionnaire
        or questionnaire.get("organization_id") != relationship["customer_org_id"]
        or questionnaire.get("is_active") is not True
        or questionnaire.get("is_deleted") is True
    ):
        raise ValueError("Questionnaire not found")
    if (
        not questionnaire_is_available_for_period(questionnaire, relationship.get("reporting_period"))
        or ("questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", []))
    ):
        raise ValueError("Questionnaire is not assigned to this supplier")
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True}, {"_id": 0, "id": 1, "response_type": 1}
    )
    if not question:
        raise ValueError("Question not found")
    if not content or len(content) > self.MAX_QUESTION_EVIDENCE_SIZE:
        raise ValueError("Evidence files must be no larger than 5MB")
    if content_type not in self.QUESTION_EVIDENCE_CONTENT_TYPES:
        raise ValueError("Unsupported evidence file type")
    calculated_hash = hashlib.sha256(content).hexdigest()
    if sha256_hash and sha256_hash.lower() != calculated_hash:
        raise ValueError("The selected file hash could not be verified")
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    response_doc = await self._current_questionnaire_response(questionnaire_id, relationship["id"], reporting_period)
    is_partially_unlocked = bool(response_doc and response_doc.get("has_unlocked_questions") and question_id in (response_doc.get("unlocked_question_ids") or []))
    if response_doc and response_doc.get("status") == "submitted" and not is_partially_unlocked:
        raise ValueError("Questionnaire already submitted and locked")
    if question.get("response_type") == "yes_no" and (response_doc or {}).get("answers", {}).get(question_id) is not True:
        raise ValueError("Select Yes before uploading evidence for this question")
    upload = await get_r2_storage().upload_file(
        content, filename, self.QUESTION_EVIDENCE_BUCKET, content_type,
        folder=self.QUESTION_EVIDENCE_FOLDER,
        metadata={"uploaded_by": uploaded_by, "kind": "supplier_question_evidence", "question_id": question_id},
        organization_id=relationship["customer_org_id"],
    )
    if upload.get("error"):
        raise ValueError(upload["error"])
    now = datetime.now(timezone.utc).isoformat()
    evidence = {
        "id": str(uuid.uuid4()), "organization_id": relationship["customer_org_id"],
        "supplier_relationship_id": relationship["id"],
        "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": relationship["customer_org_id"],
        "questionnaire_id": questionnaire_id, "question_id": question_id, "reporting_period": reporting_period,
        "original_filename": filename, "normalized_filename": _normalize_evidence_filename(filename), "sha256_hash": calculated_hash,
        "content_type": content_type, "file_size": len(content),
        "bucket_type": self.QUESTION_EVIDENCE_BUCKET, "r2_key": upload["key"], "uploaded_by": uploaded_by,
        "uploaded_at": now, "is_deleted": False,
    }
    await db.supplier_question_evidence.insert_one(evidence)
    if not response_doc:
        response_doc = {
            "id": str(uuid.uuid4()), "questionnaire_id": questionnaire_id, "supplier_relationship_id": relationship["id"],
            "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": relationship["customer_org_id"], "answers": {}, "question_evidence": {},
            "status": "in_progress", "reporting_period": reporting_period, "revision": 1, "is_current": True,
            "parent_visible": False, "data_verified": False, "created_at": now, "updated_at": now,
        }
        await db.supplier_questionnaire_responses.insert_one(response_doc)
    question_evidence = dict(response_doc.get("question_evidence") or {})
    question_evidence[question_id] = [*question_evidence.get(question_id, []), evidence["id"]]
    reused = dict(response_doc.get("reused_evidence_by_question") or {})
    reused[question_id] = [item for item in reused.get(question_id, []) if item != evidence["id"]]
    await db.supplier_questionnaire_responses.update_one(
        {"id": response_doc["id"]}, {"$set": {"question_evidence": question_evidence, "reused_evidence_by_question": reused, "updated_at": now}}
    )
    return {key: value for key, value in evidence.items() if key in {"id", "original_filename", "content_type", "file_size", "uploaded_at"}}

async def delete_supplier_question_evidence(
    self, relationship: Dict[str, Any], questionnaire_id: str, question_id: str, evidence_id: str,
) -> Optional[Dict[str, Any]]:
    evidence = await db.supplier_question_evidence.find_one(
        {"id": evidence_id, "supplier_relationship_id": relationship["id"], "questionnaire_id": questionnaire_id,
         "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if not evidence:
        return None
    response = await db.supplier_questionnaire_responses.find_one(
        {"questionnaire_id": questionnaire_id, "supplier_relationship_id": relationship["id"],
         "reporting_period": evidence.get("reporting_period"), f"question_evidence.{question_id}": evidence_id,
         "$or": [
             {"status": {"$in": ["in_progress", "reopened"]}},
             {"has_unlocked_questions": True, "unlocked_question_ids": question_id},
         ]},
        {"_id": 0}, sort=[("revision", -1)],
    )
    if not response:
        raise ValueError("Evidence is part of a locked submission and cannot be removed")
    now = datetime.now(timezone.utc).isoformat()
    question_evidence = dict(response.get("question_evidence") or {})
    question_evidence[question_id] = [item for item in question_evidence.get(question_id, []) if item != evidence_id]
    reused = dict(response.get("reused_evidence_by_question") or {})
    reused[question_id] = [item for item in reused.get(question_id, []) if item != evidence_id]
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]}, {"$set": {"question_evidence": question_evidence, "reused_evidence_by_question": reused, "updated_at": now}}
    )
    await db.supplier_question_evidence.update_one({"id": evidence_id}, {"$set": {"last_unlinked_at": now}})
    return {"id": evidence_id, "unlinked_at": now, "physical_file_retained": True}

async def get_question_evidence_file(
    self, relationship: Dict[str, Any], questionnaire_id: str, question_id: str, evidence_id: str,
    parent_visible_only: bool = False,
) -> Optional[Dict[str, Any]]:
    response = await self._current_questionnaire_response(
        questionnaire_id, relationship["id"], relationship.get("reporting_period")
    )
    if parent_visible_only:
        response = await db.supplier_questionnaire_responses.find_one(
            {"questionnaire_id": questionnaire_id, "supplier_relationship_id": relationship["id"],
             "reporting_period": relationship.get("reporting_period"), "status": "submitted", "parent_visible": {"$ne": False}},
            {"_id": 0}, sort=[("revision", -1)],
        )
    evidence_ids = ((response or {}).get("question_evidence") or {}).get(question_id, [])
    query = {"id": evidence_id, "supplier_relationship_id": relationship["id"], "questionnaire_id": questionnaire_id,
             "reporting_period": relationship.get("reporting_period"), "is_deleted": {"$ne": True}}
    if evidence_id not in evidence_ids:
        query["question_id"] = question_id
    return await db.supplier_question_evidence.find_one(query, {"_id": 0})

async def _delete_unreferenced_question_evidence(evidence_ids: List[str], supplier_relationship_id: str, questionnaire_id: str, reporting_period: str) -> None:
    if not evidence_ids:
        return
    responses = await db.supplier_questionnaire_responses.find({"supplier_relationship_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "reporting_period": reporting_period}, {"_id": 0, "question_evidence": 1}).to_list(1000)
    mapped = {item for response in responses for ids in (response.get("question_evidence") or {}).values() for item in ids}
    for evidence_id in set(evidence_ids) - mapped:
        evidence = await db.supplier_question_evidence.find_one({"id": evidence_id, "supplier_relationship_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "reporting_period": reporting_period}, {"_id": 0})
        if evidence:
            if not await get_r2_storage().delete_file(evidence["bucket_type"], evidence["r2_key"]):
                raise ValueError("R2 did not confirm evidence deletion")
            await db.supplier_question_evidence.delete_one({"id": evidence_id})


async def submit_supplier_answers(
    self,
    questionnaire_id: str,
    supplier_relationship_id: str,
    supplier_org_id: str,
    answers: List[Dict[str, Any]],
    is_draft: bool,
    data_verified: bool = False,
    verified_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Submit or save draft answers."""
    # Check if response doc exists
    relationship = await self.get_supplier(supplier_relationship_id)
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id, "is_active": True}, {"_id": 0, "reporting_periods": 1, "assignment_reporting_period": 1, "due_date": 1}
    )
    if (
        not relationship
        or not questionnaire
        or not questionnaire_is_available_for_period(questionnaire, relationship.get("reporting_period"))
        or ("questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", []))
    ):
        raise ValueError("Questionnaire is not assigned to this supplier")
    reporting_period = (relationship or {}).get("reporting_period") or self._default_reporting_period()
    response_doc = await self._current_questionnaire_response(questionnaire_id, supplier_relationship_id, reporting_period)
    is_partially_unlocked = bool(response_doc and response_doc.get("has_unlocked_questions"))
    submitted_qids = {a["question_id"] for a in answers}
    unlocked_set = set((response_doc or {}).get("unlocked_question_ids") or [])
    if response_doc and response_doc.get("status") == "submitted" and not is_partially_unlocked:
        raise ValueError("Questionnaire already submitted and locked")
    if response_doc and response_doc.get("status") == "submitted" and is_partially_unlocked:
        # Only allow answers to be updated for questions that are currently unlocked
        invalid_qids = submitted_qids - unlocked_set
        if invalid_qids:
            raise ValueError("Only questions requested for clarification can be edited")
    
    # Build answers dict
    now = datetime.now(timezone.utc).isoformat()
    answers_dict = {}
    question_evidence = {}
    question_timestamps = {}
    clarification_replies = {}
    if response_doc:
        answers_dict = dict(response_doc.get("answers", {}))
        question_evidence = dict(response_doc.get("question_evidence", {}))
        question_timestamps = dict(response_doc.get("question_timestamps", {}))
        clarification_replies = dict(response_doc.get("clarification_replies", {}))
    
    for answer in answers:
        qid = answer["question_id"]
        val = answer["answer"]
        prior_val = answers_dict.get(qid)
        answers_dict[qid] = val
        # Track per-question created_at and updated_at
        ts = dict(question_timestamps.get(qid) or {})
        if not ts.get("created_at"):
            ts["created_at"] = now
        if prior_val != val:
            ts["updated_at"] = now
        clarification_reply = answer.get("clarification_reply")
        if clarification_reply is not None:
            message = str(clarification_reply).strip()
            if message:
                clarification_replies[qid] = {"message": message, "replied_at": now, "replied_by": supplier_org_id}
                ts["clarification_replied_at"] = now
            else:
                clarification_replies.pop(qid, None)
        question_timestamps[qid] = ts
    reused_evidence = dict((response_doc or {}).get("reused_evidence_by_question") or {})
    yes_no_questions = await db.supplier_questions.find({"questionnaire_id": questionnaire_id, "is_active": True, "response_type": "yes_no"}, {"_id": 0, "id": 1}).to_list(500)
    no_answer_ids = {question["id"] for question in yes_no_questions if answers_dict.get(question["id"]) in {False, "false", "False", "no", "No", "NO", 0}}
    evidence_to_remove = []
    for question_id in no_answer_ids:
        evidence_to_remove.extend(question_evidence.pop(question_id, []) or [])
        reused_evidence.pop(question_id, None)
    
    status = "in_progress" if is_draft else "submitted"
    submitted_at = None if is_draft else datetime.now(timezone.utc).isoformat()
    if submitted_at:
        for qid in answers_dict:
            ts = dict(question_timestamps.get(qid) or {})
            if not ts.get("created_at"):
                ts["created_at"] = submitted_at
            ts["submitted_at"] = submitted_at
            question_timestamps[qid] = ts
    if not is_draft and not data_verified:
        raise ValueError("Confirm that the submitted data has been reviewed and verified")
    if not is_draft and has_due_date_passed(questionnaire.get("due_date") or relationship.get("due_date")):
        raise ValueError("Submission deadline has passed. Your parent organization must extend the questionnaire due date before you can submit.")
    if not is_draft:
        required_evidence_questions = await db.supplier_questions.find(
            {"questionnaire_id": questionnaire_id, "is_active": True, "$or": [{"evidence_requirement": "required"}, {"assessment_type": "type_a"}]},
            {"_id": 0, "id": 1, "question_text": 1, "response_type": 1},
        ).to_list(500)
        missing_evidence = [
            question.get("question_text") or "Question"
            for question in required_evidence_questions
            if (
                question.get("response_type") != "yes_no"
                or answers_dict.get(question["id"]) is True
            ) and not question_evidence.get(question["id"])
        ]
        if missing_evidence:
            raise ValueError(f"Evidence is required for a Yes response: {', '.join(missing_evidence[:3])}")
        if is_partially_unlocked:
            unanswered_clarifications = [
                question_id for question_id in unlocked_set
                if not str((clarification_replies.get(question_id) or {}).get("message") or "").strip()
            ]
            if unanswered_clarifications:
                raise ValueError("Add a reply to the reviewer before resubmitting each requested clarification")
    # Calculate score if submitting
    calculated_score = None
    if not is_draft:
        calculated_score, score_breakdown = await self._calculate_questionnaire_score(
            questionnaire_id, answers_dict, supplier_relationship_id, question_evidence
        )
    else:
        score_breakdown = None
    
    if response_doc:
        response_id = response_doc["id"]
        # Update existing
        update_data = {
            "answers": answers_dict,
            "question_evidence": question_evidence,
            "reused_evidence_by_question": reused_evidence,
            "question_timestamps": question_timestamps,
            "clarification_replies": clarification_replies,
            "customer_org_id": relationship["customer_org_id"],
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if submitted_at:
            # If this was a partial resubmission of unlocked questions, lock them back up
            if is_partially_unlocked:
                q_reviews = dict(response_doc.get("question_reviews") or {})
                review_history = list(response_doc.get("review_history") or [])
                for qid in submitted_qids:
                    if qid in q_reviews:
                        q_reviews[qid]["unlocked_for_supplier"] = False
                        q_reviews[qid]["resubmitted_at"] = submitted_at
                        review_history.append({
                            "question_id": qid,
                            "event": "supplier_clarification_resubmitted",
                            "supplier_revision": 2 + sum(1 for entry in review_history if entry.get("question_id") == qid and entry.get("event") == "supplier_clarification_resubmitted"),
                            "supplier_reply": (clarification_replies.get(qid) or {}).get("message"),
                            "supplier_answer_snapshot": answers_dict.get(qid),
                            "evidence_snapshot": list(question_evidence.get(qid) or []),
                            "replied_at": (clarification_replies.get(qid) or {}).get("replied_at") or submitted_at,
                        })
                remaining_unlocked = [qid for qid, rev in q_reviews.items() if rev.get("needs_resubmission") and rev.get("unlocked_for_supplier")]
                update_data["question_reviews"] = q_reviews
                update_data["review_history"] = review_history
                update_data["unlocked_question_ids"] = remaining_unlocked
                update_data["has_unlocked_questions"] = len(remaining_unlocked) > 0

            update_data.update({
                "submitted_at": submitted_at,
                "parent_visible": True,
                "data_verified": True,
                "data_verified_at": submitted_at,
                "data_verified_by": verified_by,
            })
            await db.supplier_questionnaire_responses.update_many(
                {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "reporting_period": reporting_period, "id": {"$ne": response_doc["id"]}, "parent_visible": True},
                {"$set": {"parent_visible": False, "replaced_at": submitted_at}},
            )
        if calculated_score is not None:
            update_data["calculated_score"] = calculated_score
            update_data["score_breakdown"] = score_breakdown
        
        await db.supplier_questionnaire_responses.update_one(
            {"id": response_doc["id"]},
            {"$set": update_data}
        )
        await _delete_unreferenced_question_evidence(evidence_to_remove, supplier_relationship_id, questionnaire_id, reporting_period)
    else:
        # Create new
        response_id = str(uuid.uuid4())
        new_doc = {
            "id": response_id,
            "questionnaire_id": questionnaire_id,
            "supplier_relationship_id": supplier_relationship_id,
            "supplier_org_id": supplier_org_id,
            "customer_org_id": relationship["customer_org_id"],
            "answers": answers_dict,
            "question_evidence": question_evidence,
            "reused_evidence_by_question": reused_evidence,
            "question_timestamps": question_timestamps,
            "clarification_replies": clarification_replies,
            "status": status,
            "calculated_score": calculated_score,
            "score_breakdown": score_breakdown,
            "reporting_period": reporting_period,
            "submitted_at": submitted_at,
            "revision": 1,
            "is_current": True,
            "parent_visible": not is_draft,
            "data_verified": bool(data_verified) if not is_draft else False,
            "data_verified_at": submitted_at,
            "data_verified_by": verified_by if not is_draft else None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.supplier_questionnaire_responses.insert_one(new_doc)
        response_id = new_doc["id"]
        await _delete_unreferenced_question_evidence(evidence_to_remove, supplier_relationship_id, questionnaire_id, reporting_period)
    
    # Update completion status
    canonical_score = None
    if not is_draft:
        canonical_score = await self.refresh_supplier_canonical_score(supplier_relationship_id)
        log_event(logger, logging.INFO, "supplier_assessment.questionnaire.locked", action="supplier_assessment.questionnaire.submit", outcome="locked", context={"supplier_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "response_id": response_id, "reporting_period": reporting_period})
    await self._update_completion_status(supplier_relationship_id)
    
    return {
        "status": status,
        "calculated_score": calculated_score,
        "canonical_score": canonical_score,
        "message": "Answers saved" if is_draft else "Questionnaire submitted",
    }

async def _calculate_questionnaire_score(
    self,
    questionnaire_id: str,
    answers: Dict[str, Any],
    supplier_relationship_id: Optional[str] = None,
    evidence_by_question: Optional[Dict[str, List[str]]] = None,
) -> tuple[float, Optional[Dict[str, Any]]]:
    """
    Calculate questionnaire score using the new unified scoring engine.
    
    The new engine supports per-question scoring rules:
    - higher_is_better: Linear scale (e.g., renewable energy %)
    - lower_is_better: Inverted scale (e.g., emissions)
    - boolean: Yes/No mapping
    - choice_mapping: Map choices to scores
    - manual: Requires human review
    
    Falls back to legacy scoring for backward compatibility.
    """
    from modules.supplier_assessment.scoring import ScoringEngine
    
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id},
        {"_id": 0}
    )
    if not questionnaire:
        return 0.0, None
    
    questions = await db.supplier_questions.find(
        {"questionnaire_id": questionnaire_id, "is_active": True},
        {"_id": 0}
    ).to_list(500)
    
    engine = ScoringEngine(db)
    try:
        breakdown = await engine.calculate_supplier_assessment(
            supplier_relationship_id=supplier_relationship_id or "unknown", questionnaire_id=questionnaire_id,
            save_to_db=False, answers_override=answers, manual_scores_override={},
            evidence_by_question_override=evidence_by_question,
            reporting_period=(await self.get_supplier(supplier_relationship_id) if supplier_relationship_id else {}).get("reporting_period") if supplier_relationship_id else None,
        )
        return breakdown.esg_score.overall_score, breakdown.model_dump()
    except Exception as error:
        raise ValueError(f"Hierarchical ESG scoring could not be calculated: {error}") from error

# ========================================================================
# Customer Admin: View Supplier Responses
# ========================================================================

async def get_supplier_responses_for_admin(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
) -> Optional[Dict[str, Any]]:
    """Admin views a supplier's questionnaire responses."""
    questionnaire = await self.get_questionnaire(questionnaire_id)
    if not questionnaire:
        return None
    
    relationship = await self.get_supplier(supplier_relationship_id)
    response_doc = await db.supplier_questionnaire_responses.find_one(
        {
            "questionnaire_id": questionnaire_id,
            "supplier_relationship_id": supplier_relationship_id,
            "reporting_period": (relationship or {}).get("reporting_period"),
            "status": "submitted",
            "parent_visible": {"$ne": False},
            "$or": [{"is_current": True}, {"is_current": {"$exists": False}}],
        },
        {"_id": 0}, sort=[("revision", -1)],
    )
    if not response_doc:
        current_in_progress = await db.supplier_questionnaire_responses.find_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
                "reporting_period": (relationship or {}).get("reporting_period"),
                "is_current": True,
                "status": {"$in": ["in_progress", "reopened"]},
            },
            {"_id": 0, "id": 1},
        )
        if current_in_progress:
            raise ValueError("This supplier response is in progress and cannot be reviewed until it is submitted and locked")
        return None
    answers = response_doc.get("answers", {}) if response_doc else {}
    
    # Merge answers into questions
    manual_question_scores = response_doc.get("manual_question_scores", {})
    question_timestamps = response_doc.get("question_timestamps", {})
    question_reviews = response_doc.get("question_reviews", {})
    review_marks = response_doc.get("review_marks", {})
    question_review_drafts = response_doc.get("question_review_drafts", {})
    clarification_replies = response_doc.get("clarification_replies", {})
    review_history = list(response_doc.get("review_history") or [])
    reviewer_ids = list({entry.get("reviewed_by") for entry in review_history if entry.get("reviewed_by")})
    reviewers = await db.users.find({"id": {"$in": reviewer_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(len(reviewer_ids)) if reviewer_ids else []
    reviewer_names = {reviewer["id"]: reviewer.get("full_name") or reviewer.get("name") or reviewer.get("email") or "Reviewer" for reviewer in reviewers}
    for q in questionnaire.get("questions", []):
        q["answer"] = answers.get(q["id"])
        q["evidence_requirement"] = self._question_evidence_requirement(q.get("evidence_requirement"))
        q["evidence_files"] = await self._question_evidence_metadata(
            supplier_relationship_id, questionnaire_id, q["id"], (response_doc.get("question_evidence") or {}).get(q["id"], []),
            (response_doc.get("reused_evidence_by_question") or {}).get(q["id"], []),
        )
        manual_entry = manual_question_scores.get(q["id"])
        q["manual_score"] = manual_entry.get("score") if isinstance(manual_entry, dict) else manual_entry
        q["manual_score_note"] = manual_entry.get("note") if isinstance(manual_entry, dict) else None
        q["timestamps"] = question_timestamps.get(q["id"])
        q["review"] = question_reviews.get(q["id"])
        q["review_draft"] = question_review_drafts.get(q["id"])
        q["marked_for_review"] = bool(question_review_drafts.get(q["id"]) or (review_marks.get(q["id"]) or {}).get("marked"))
        q["is_unlocked_for_supplier"] = q["id"] in set(response_doc.get("unlocked_question_ids") or [])
        q["clarification_reply"] = clarification_replies.get(q["id"])
        question_history = [entry for entry in review_history if entry.get("question_id") == q["id"]]
        timestamps = question_timestamps.get(q["id"]) or {}
        if timestamps.get("submitted_at"):
            question_history.insert(0, {
                "event": "supplier_submission",
                "submitted_at": timestamps["submitted_at"],
                "supplier_revision": response_doc.get("revision") or 1,
                "supplier_answer_snapshot": answers.get(q["id"]),
                "evidence_snapshot": list((response_doc.get("question_evidence") or {}).get(q["id"], [])),
            })
        for entry in question_history:
            if entry.get("reviewed_by"):
                entry["reviewer_name"] = reviewer_names.get(entry["reviewed_by"], "Reviewer")
        q["history"] = question_history
    
    questionnaire["response_status"] = response_doc.get("status", "not_started") if response_doc else "not_started"
    questionnaire["calculated_score"] = response_doc.get("calculated_score") if response_doc else None
    questionnaire["manual_score"] = response_doc.get("manual_score") if response_doc else None
    questionnaire["manual_score_note"] = response_doc.get("manual_score_note") if response_doc else None
    questionnaire["submitted_at"] = response_doc.get("submitted_at") if response_doc else None
    questionnaire["score_breakdown"] = response_doc.get("score_breakdown") if response_doc else None
    questionnaire["canonical_score_snapshot"] = (relationship or {}).get("canonical_score_snapshot")
    questionnaire["has_unlocked_questions"] = bool(response_doc.get("has_unlocked_questions"))
    questionnaire["unlocked_question_ids"] = list(response_doc.get("unlocked_question_ids") or [])
    
    return questionnaire

async def get_questionnaire_submissions_for_admin(
    self,
    customer_org_id: str,
    questionnaire_id: str,
    reporting_period: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True},
        {"_id": 0, "id": 1, "name": 1, "reporting_periods": 1, "assignment_reporting_period": 1},
    )
    if not questionnaire or not questionnaire_is_available_for_period(questionnaire, reporting_period):
        return None
    query: Dict[str, Any] = {
        "questionnaire_id": questionnaire_id,
        "status": "submitted",
        "parent_visible": {"$ne": False},
        "$or": [{"is_current": True}, {"is_current": {"$exists": False}}],
    }
    if reporting_period:
        query["reporting_period"] = reporting_period
    responses = await db.supplier_questionnaire_responses.find(
        query,
        {"_id": 0, "supplier_relationship_id": 1, "submitted_at": 1, "calculated_score": 1, "manual_question_scores": 1},
    ).sort("submitted_at", -1).to_list(1000)
    supplier_ids = [response["supplier_relationship_id"] for response in responses]
    suppliers = await db.supplier_relationships.find(
        {"id": {"$in": supplier_ids}, "customer_org_id": customer_org_id, "is_active": True},
        {"_id": 0, "id": 1, "company_name": 1},
    ).to_list(1000)
    supplier_names = {supplier["id"]: supplier.get("company_name") for supplier in suppliers}
    submissions = [
        {
            "supplier_id": response["supplier_relationship_id"],
            "supplier_name": supplier_names.get(response["supplier_relationship_id"], "Supplier"),
            "submitted_at": response.get("submitted_at"),
            "calculated_score": response.get("calculated_score"),
            "manual_question_count": len(response.get("manual_question_scores") or {}),
        }
        for response in responses
        if response["supplier_relationship_id"] in supplier_names
    ]
    return {"questionnaire_id": questionnaire["id"], "questionnaire_name": normalize_questionnaire_template_name(questionnaire["name"]), "reporting_period": reporting_period, "submissions": submissions}

async def set_manual_questionnaire_score(self, supplier_relationship_id: str, questionnaire_id: str, score: float, note: Optional[str], scored_by: str) -> Optional[Dict[str, Any]]:
    relationship = await self.get_supplier(supplier_relationship_id)
    response = await db.supplier_questionnaire_responses.find_one(
        {"supplier_relationship_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "reporting_period": (relationship or {}).get("reporting_period"), "status": "submitted", "parent_visible": {"$ne": False}}, {"_id": 0}, sort=[("revision", -1)]
    )
    if not response:
        return None
    now = datetime.now(timezone.utc).isoformat()
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]}, {"$set": {"manual_score": score, "manual_score_note": note, "manual_scored_by": scored_by, "manual_scored_at": now}}
    )
    await self.refresh_supplier_canonical_score(supplier_relationship_id)
    return {"questionnaire_id": questionnaire_id, "manual_score": score, "manual_score_note": note, "manual_scored_at": now}

async def set_manual_question_score(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
    question_id: str,
    score: float,
    note: Optional[str],
    scored_by: str,
) -> Optional[Dict[str, Any]]:
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        return None
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True},
        {"_id": 0, "id": 1, "scoring": 1},
    )
    if not question:
        raise ValueError("Question not found")
    if (question.get("scoring") or {}).get("rule") != "manual":
        raise ValueError("Only questions marked as Manual Review can be manually scored.")
    response = await db.supplier_questionnaire_responses.find_one(
        {
            "supplier_relationship_id": supplier_relationship_id,
            "questionnaire_id": questionnaire_id,
            "reporting_period": relationship.get("reporting_period"),
            "status": "submitted",
            "parent_visible": {"$ne": False},
        },
        {"_id": 0},
        sort=[("revision", -1)],
    )
    if not response:
        return None
    answer = (response.get("answers") or {}).get(question_id)
    if answer is None or answer == "":
        raise ValueError("A supplier response is required before this question can be scored")
    now = datetime.now(timezone.utc).isoformat()
    manual_scores = dict(response.get("manual_question_scores") or {})
    manual_scores[question_id] = {"score": float(score), "note": note, "scored_by": scored_by, "scored_at": now}
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]},
        {
            "$set": {"manual_question_scores": manual_scores, "updated_at": now},
            "$unset": {"manual_score": "", "manual_score_note": "", "manual_scored_by": "", "manual_scored_at": ""},
        },
    )
    from modules.supplier_assessment.scoring import ScoringEngine
    breakdown = await ScoringEngine(db).calculate_supplier_assessment(
        supplier_relationship_id=supplier_relationship_id,
        questionnaire_id=questionnaire_id,
        save_to_db=True,
        reporting_period=relationship.get("reporting_period"),
    )
    return {
        "questionnaire_id": questionnaire_id,
        "question_id": question_id,
        "manual_score": manual_scores[question_id],
        "calculated_score": breakdown.esg_score.overall_score,
        "score_breakdown": breakdown.model_dump(),
    }

async def review_supplier_question_response(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
    question_id: str,
    decision: Dict[str, Any],
    reviewer_id: str,
) -> Dict[str, Any]:
    """Parent organization review for a single question response (accept / reject with optional resubmission)."""
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        raise ValueError("Supplier not found")
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True},
        {"_id": 0, "id": 1, "question_text": 1, "max_points": 1, "section": 1, "category": 1},
    )
    if not question:
        raise ValueError("Question not found")
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    response = await db.supplier_questionnaire_responses.find_one(
        {
            "supplier_relationship_id": supplier_relationship_id,
            "questionnaire_id": questionnaire_id,
            "reporting_period": reporting_period,
            "status": "submitted",
            "parent_visible": {"$ne": False},
            "$or": [{"is_current": True}, {"is_current": {"$exists": False}}],
        },
        {"_id": 0},
        sort=[("revision", -1)],
    )
    if not response:
        raise ValueError("This supplier response is not locked and cannot be reviewed")
    answers = response.get("answers") or {}
    if question_id in set(response.get("unlocked_question_ids") or []):
        raise ValueError("This question is unlocked for supplier clarification and cannot be reviewed until it is resubmitted")
    if question_id not in answers or answers.get(question_id) is None or answers.get(question_id) == "":
        raise ValueError("A supplier response is required before this question can be reviewed")

    status = decision.get("status")
    if status not in {"accepted", "rejected"}:
        raise ValueError("Decision status must be 'accepted' or 'rejected'")

    needs_resubmission = bool(decision.get("needs_resubmission")) if status == "rejected" else False
    reviewer_score = float(decision.get("reviewer_score") or 0.0) if status == "rejected" and not needs_resubmission else None
    reviewer_note = (decision.get("reviewer_note") or "").strip()
    if needs_resubmission and not reviewer_note:
        raise ValueError("A reviewer comment is required when clarification is requested")
    if reviewer_score is not None and (reviewer_score < 0 or reviewer_score > float(question.get("max_points") or 100)):
        raise ValueError("Approved score must be between zero and the question maximum")

    now = datetime.now(timezone.utc).isoformat()
    review_entry = {
        "status": status,
        "needs_resubmission": needs_resubmission,
        "reviewer_score": reviewer_score,
        "reviewer_note": reviewer_note,
        "unlocked_for_supplier": needs_resubmission,
        "reviewed_by": reviewer_id,
        "reviewed_at": now,
    }

    question_reviews = dict(response.get("question_reviews") or {})
    question_reviews[question_id] = review_entry
    question_review_drafts = dict(response.get("question_review_drafts") or {})
    question_review_drafts.pop(question_id, None)
    review_marks = dict(response.get("review_marks") or {})
    review_marks.pop(question_id, None)

    review_history = list(response.get("review_history") or [])
    review_history.append({
        "question_id": question_id,
        "status": status,
        "needs_resubmission": needs_resubmission,
        "reviewer_score": reviewer_score,
        "reviewer_note": reviewer_note,
        "reviewed_by": reviewer_id,
        "reviewed_at": now,
        "supplier_answer_snapshot": answers.get(question_id),
        "evidence_snapshot": list((response.get("question_evidence") or {}).get(question_id) or []),
    })

    unlocked_questions = [qid for qid, rev in question_reviews.items() if rev.get("needs_resubmission") and rev.get("unlocked_for_supplier")]
    has_unlocked = len(unlocked_questions) > 0

    update_fields: Dict[str, Any] = {
        "question_reviews": question_reviews,
        "question_review_drafts": question_review_drafts,
        "review_marks": review_marks,
        "review_history": review_history,
        "has_unlocked_questions": has_unlocked,
        "unlocked_question_ids": unlocked_questions,
        "updated_at": now,
    }

    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]},
        {"$set": update_fields},
    )
    await self._update_completion_status(supplier_relationship_id)

    from modules.supplier_assessment.scoring import ScoringEngine
    breakdown = await ScoringEngine(db).calculate_supplier_assessment(
        supplier_relationship_id=supplier_relationship_id,
        questionnaire_id=questionnaire_id,
        save_to_db=True,
        reporting_period=reporting_period,
    )

    email_delivered = False
    if needs_resubmission:
        email_delivered = await _send_question_clarification_notification(
            relationship=relationship,
            questionnaire_id=questionnaire_id,
            question_text=question.get("question_text") or "Question",
            reviewer_note=reviewer_note,
            response_id=response["id"],
            question_id=question_id,
        )

    log_event(logger, logging.INFO, "supplier_assessment.question_review.completed",
              action="supplier_assessment.question_review", outcome="succeeded",
              context={"supplier_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "question_id": question_id, "status": status, "needs_resubmission": needs_resubmission})

    return {
        "questionnaire_id": questionnaire_id,
        "question_id": question_id,
        "review": review_entry,
        "calculated_score": breakdown.esg_score.overall_score,
        "overall_score": breakdown.supplier_score.overall_score,
        "score_breakdown": breakdown.model_dump(),
        "email_delivered": email_delivered,
    }


async def save_supplier_question_review_draft(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
    question_id: str,
    decision: Dict[str, Any],
    reviewer_id: str,
) -> Dict[str, Any]:
    """Save a parent-only review draft without changing score, visibility, or supplier access."""
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        raise ValueError("Supplier not found")
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True},
        {"_id": 0, "id": 1, "max_points": 1},
    )
    if not question:
        raise ValueError("Question not found")
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    response = await db.supplier_questionnaire_responses.find_one(
        {
            "supplier_relationship_id": supplier_relationship_id,
            "questionnaire_id": questionnaire_id,
            "reporting_period": reporting_period,
            "status": "submitted",
            "parent_visible": {"$ne": False},
            "$or": [{"is_current": True}, {"is_current": {"$exists": False}}],
        },
        {"_id": 0, "id": 1, "answers": 1, "question_review_drafts": 1, "review_marks": 1},
        sort=[("revision", -1)],
    )
    if not response:
        raise ValueError("This supplier response is not locked and cannot be reviewed")
    if question_id not in (response.get("answers") or {}):
        raise ValueError("A supplier response is required before this question can be marked for review")

    status = decision.get("status")
    if status not in {"accepted", "rejected"}:
        raise ValueError("Decision status must be 'accepted' or 'rejected'")
    needs_resubmission = bool(decision.get("needs_resubmission")) if status == "rejected" else False
    reviewer_note = (decision.get("reviewer_note") or "").strip()
    reviewer_score = float(decision.get("reviewer_score") or 0.0) if status == "rejected" and not needs_resubmission else None
    if needs_resubmission and not reviewer_note:
        raise ValueError("A reviewer comment is required when clarification is requested")
    if status == "rejected" and not needs_resubmission and not reviewer_note:
        raise ValueError("A review rationale is required when rejecting a response")
    if reviewer_score is not None and (reviewer_score < 0 or reviewer_score > float(question.get("max_points") or 100)):
        raise ValueError("Approved score must be between zero and the question maximum")

    now = datetime.now(timezone.utc).isoformat()
    draft = {
        "status": status,
        "needs_resubmission": needs_resubmission,
        "reviewer_score": reviewer_score,
        "reviewer_note": reviewer_note,
        "drafted_by": reviewer_id,
        "drafted_at": now,
    }
    drafts = dict(response.get("question_review_drafts") or {})
    drafts[question_id] = draft
    marks = dict(response.get("review_marks") or {})
    marks[question_id] = {"marked": True, "marked_by": reviewer_id, "marked_at": now}
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]},
        {"$set": {"question_review_drafts": drafts, "review_marks": marks, "updated_at": now}},
    )
    return {"question_id": question_id, "review_draft": draft, "marked_for_review": True}


async def set_supplier_question_review_mark(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
    question_id: str,
    marked: bool,
    reviewer_id: str,
) -> Dict[str, Any]:
    """Persist a parent-review follow-up flag without changing the supplier response or score."""
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        raise ValueError("Supplier not found")
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True},
        {"_id": 0, "id": 1},
    )
    if not question:
        raise ValueError("Question not found")
    response = await db.supplier_questionnaire_responses.find_one(
        {
            "supplier_relationship_id": supplier_relationship_id,
            "questionnaire_id": questionnaire_id,
            "reporting_period": relationship.get("reporting_period") or self._default_reporting_period(),
            "status": "submitted",
            "parent_visible": {"$ne": False},
            "$or": [{"is_current": True}, {"is_current": {"$exists": False}}],
        },
        {"_id": 0, "id": 1, "review_marks": 1},
        sort=[("revision", -1)],
    )
    if not response:
        raise ValueError("This supplier response is not available for review")

    review_marks = dict(response.get("review_marks") or {})
    if marked:
        review_marks[question_id] = {
            "marked": True,
            "marked_by": reviewer_id,
            "marked_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        review_marks.pop(question_id, None)
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]},
        {"$set": {"review_marks": review_marks, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"question_id": question_id, "marked_for_review": marked}


async def _send_question_clarification_notification(
    relationship: Dict[str, Any],
    questionnaire_id: str,
    question_text: str,
    reviewer_note: str,
    response_id: str,
    question_id: str,
) -> bool:
    recipient_email = str(relationship.get("contact_email") or "").strip().lower()
    if not recipient_email:
        return False
    customer = await db.organizations.find_one(
        {"id": relationship["customer_org_id"]},
        {"_id": 0, "name": 1, "organization_name": 1},
    ) or {}
    customer_name = customer.get("organization_name") or customer.get("name") or "Your customer"
    q_doc = await db.supplier_questionnaires.find_one({"id": questionnaire_id}, {"_id": 0, "name": 1})
    q_name = (q_doc or {}).get("name") or "ESG Questionnaire"
    from modules.supplier_assessment.email_templates import question_clarification_requested_email
    body = question_clarification_requested_email(
        supplier_name=relationship.get("contact_person") or relationship.get("company_name") or "Supplier",
        customer_name=customer_name,
        questionnaire_name=q_name,
        question_text=question_text,
        reviewer_comment=reviewer_note,
        login_link=f"{FRONTEND_URL.rstrip('/')}/login",
    )
    try:
        return await send_email(
            recipient_email,
            f"Action needed: Clarification requested for {q_name}",
            body,
        )
    except Exception as error:
        logger.error("Failed to send question clarification email: %s", error)
        return False


async def reopen_questionnaire(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
    reopened_by: Optional[str] = None,
) -> bool:
    """Create a private draft revision while preserving the parent-visible submission."""
    relationship = await self.get_supplier(supplier_relationship_id)
    reporting_period = (relationship or {}).get("reporting_period") or self._default_reporting_period()
    visible_response = await db.supplier_questionnaire_responses.find_one(
        {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "reporting_period": reporting_period, "status": "submitted", "parent_visible": {"$ne": False}},
        {"_id": 0}, sort=[("revision", -1)],
    )
    if not visible_response:
        return False
    current = await self._current_questionnaire_response(questionnaire_id, supplier_relationship_id, reporting_period)
    if current and current.get("status") != "submitted":
        return False
    if current and current.get("id") != visible_response.get("id"):
        return False
    now = datetime.now(timezone.utc).isoformat()
    if current:
        await db.supplier_questionnaire_responses.update_one({"id": current["id"]}, {"$set": {"is_current": False}})
    revision = int(visible_response.get("revision") or 1) + 1
    draft = {
        "id": str(uuid.uuid4()), "questionnaire_id": questionnaire_id,
        "supplier_relationship_id": supplier_relationship_id,
        "supplier_org_id": visible_response.get("supplier_org_id"),
        "customer_org_id": (relationship or {}).get("customer_org_id") or visible_response.get("customer_org_id"),
        "answers": visible_response.get("answers", {}), "question_evidence": visible_response.get("question_evidence", {}), "status": "in_progress",
        "calculated_score": None, "submitted_at": None, "reporting_period": reporting_period, "revision": revision,
        "is_current": True, "parent_visible": False, "reopened_at": now,
        "reopened_by": reopened_by, "created_at": now, "updated_at": now,
    }
    await db.supplier_questionnaire_responses.insert_one(draft)
    log_event(logger, logging.INFO, "supplier_assessment.questionnaire.unlocked", action="supplier_assessment.questionnaire.reopen", outcome="unlocked", context={"supplier_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "response_id": draft["id"], "reporting_period": reporting_period})
    return True

async def get_supplier_submission_status(self, supplier_relationship_id: str) -> Dict[str, Any]:
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        return {"esg": [], "esg_items": [], "ghg": {"status": "pending"}, "documents": [], "training": []}
    submitted_responses = await db.supplier_questionnaire_responses.find(
        {"supplier_relationship_id": supplier_relationship_id, "reporting_period": (relationship or {}).get("reporting_period"), "status": "submitted", "parent_visible": {"$ne": False}},
        {"_id": 0, "questionnaire_id": 1, "submitted_at": 1, "revision": 1},
    ).to_list(100)
    submitted_by_questionnaire = {item["questionnaire_id"]: item for item in submitted_responses}
    questionnaire_ids = relationship.get("questionnaire_ids") or []
    questionnaire_query: Dict[str, Any] = {
        "organization_id": relationship["customer_org_id"],
        "is_active": True,
        "reporting_periods": normalize_questionnaire_reporting_period(relationship.get("reporting_period")),
    }
    if questionnaire_ids:
        questionnaire_query["id"] = {"$in": questionnaire_ids}
    questionnaires = await db.supplier_questionnaires.find(
        questionnaire_query,
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(500)
    esg_items = []
    for questionnaire in questionnaires:
        submitted = submitted_by_questionnaire.get(questionnaire["id"])
        esg_items.append({
            "questionnaire_id": questionnaire["id"],
            "name": questionnaire.get("name", "Questionnaire"),
            "status": "locked" if submitted else "pending",
            "locked_at": submitted.get("submitted_at") if submitted else None,
            "submitted_at": submitted.get("submitted_at") if submitted else None,
            "due_date": relationship.get("due_date"),
        })
    from modules.supplier_assessment.ghg_submission_service import reporting_period_values
    ghg_entries = await db.emission_records.find(
        {
            "source": "supplier", "supplier_relationship_id": supplier_relationship_id,
            "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False},
            "reporting_period": {"$in": reporting_period_values(relationship.get("reporting_period"))},
        },
        {"_id": 0, "submitted_to_parent_org": 1},
    ).to_list(1000)
    locked_at = min((entry.get("submitted_to_parent_org") for entry in ghg_entries if entry.get("submitted_to_parent_org")), default=None)
    from modules.supplier_assessment.documents_service import list_supplier_documents
    from modules.supplier_assessment.training_service import supplier_trainings
    documents = [
        {"id": item["id"], "name": item.get("title", "Document"), "status": "locked" if item.get("submission_status") == "submitted" else "pending", "locked_at": item.get("responded_at"), "due_date": item.get("due_date") or relationship.get("due_date")}
        for item in await list_supplier_documents(relationship)
    ]
    training = [
        {"id": item["assignment_id"], "training_requirement_id": item.get("training_requirement_id"), "name": item.get("title", "Training"), "status": item.get("status", "pending"), "completed_at": item.get("completed_at"), "progress_percent": item.get("progress_percent", 0), "due_date": item.get("due_date") or relationship.get("due_date")}
        for item in await supplier_trainings(relationship)
    ]
    program_context = await resolve_program_context(relationship)
    program_modules = (program_context.get("config") or {}).get("modules") or {}
    module_visibility = {
        "esg": bool((program_modules.get("esg") or {}).get("enabled", False)),
        "ghg": bool((program_modules.get("ghg") or {}).get("enabled", False)),
        "documents": bool((program_modules.get("documents") or {}).get("enabled", False)) and bool(documents),
        "training": bool((program_modules.get("training") or {}).get("enabled", False)) and bool(training),
    }
    return {
        "esg": [item for item in esg_items if item["status"] == "locked"],
        "esg_items": esg_items,
        "ghg": {"status": "locked" if ghg_entries else "pending", "locked_at": locked_at, "entry_count": len(ghg_entries), "due_date": relationship.get("due_date")},
        "documents": documents,
        "training": training,
        "module_visibility": module_visibility,
    }
