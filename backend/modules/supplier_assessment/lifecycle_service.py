"""Supplier lifecycle and completion operations."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from modules.supplier_assessment.module_registry import supplier_assessment_module_registry
from modules.supplier_assessment.programs import resolve_program_context
from shared.database.mongo import db

async def refresh_supplier_canonical_score(self, supplier_relationship_id: str) -> Optional[Dict[str, Any]]:
    """Persist the only supplier-level score consumed by tables, rankings, and details."""
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        return None
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    responses = await db.supplier_questionnaire_responses.find(
        {
            "supplier_relationship_id": supplier_relationship_id,
            "reporting_period": reporting_period,
            "status": "submitted",
            "parent_visible": {"$ne": False},
        },
        {"_id": 0, "questionnaire_id": 1, "submitted_at": 1, "calculated_score": 1, "manual_score": 1, "score_breakdown": 1},
    ).sort("submitted_at", -1).to_list(100)
    scored_responses = [
        response for response in responses
        if response.get("manual_score") is not None or response.get("calculated_score") is not None
    ]
    latest_breakdown = next((response.get("score_breakdown") for response in scored_responses if response.get("score_breakdown")), None)

    esg_values = [
        float(response["manual_score"] if response.get("manual_score") is not None else response["calculated_score"])
        for response in scored_responses
    ]
    section_values = {"environment": [], "social": [], "governance": []}
    for response in scored_responses:
        esg_score = (response.get("score_breakdown") or {}).get("esg_score") or {}
        for section in section_values:
            section_score = (esg_score.get(section) or {}).get("score")
            if section_score is not None:
                section_values[section].append(float(section_score))
    section_scores = {
        section: round(sum(values) / len(values), 2) if values else None
        for section, values in section_values.items()
    }
    esg_score = round(sum(esg_values) / len(esg_values), 2) if esg_values else None

    # Supplier assessment scoring is ESG-only. GHG, revenue, documents, and training
    # remain tracked as assessment/completion data, not score components.
    weights = {"esg": 100.0}
    is_complete = esg_score is not None
    overall_score = esg_score if is_complete else None
    now = datetime.now(timezone.utc).isoformat()
    snapshot = {
        "version": "supplier-assessment-canonical-v1",
        "reporting_period": reporting_period,
        "questionnaire_count": len(scored_responses),
        "esg_score": esg_score,
        "environment_score": section_scores["environment"],
        "social_score": section_scores["social"],
        "governance_score": section_scores["governance"],
        "ghg_score": None,
        "revenue_score": None,
        "component_weights": weights,
        "overall_score": overall_score,
        "is_complete": is_complete,
        "calculated_at": now,
    }
    await db.supplier_relationships.update_one(
        {"id": supplier_relationship_id},
        {"$set": {
            "canonical_score_snapshot": snapshot,
            "esg_score": esg_score,
            "ghg_score": None,
            "overall_score": overall_score,
            "last_scored_at": now,
            "updated_at": now,
        }},
    )
    return snapshot

async def _update_completion_status(self, relationship_id: str):
    """Compatibility facade delegating completion to registered assessment modules."""
    relationship = await db.supplier_relationships.find_one(
        {"id": relationship_id},
        {"_id": 0}
    )
    if not relationship:
        return
    context = await resolve_program_context(relationship)
    enabled_modules = supplier_assessment_module_registry.enabled_modules(context["config"])
    completions = [
        await module.get_completion(db, relationship)
        for module in enabled_modules
    ]
    completion_by_code = {completion.module_code: completion for completion in completions}
    applicable_modules = [
        module for module in enabled_modules
        if completion_by_code[module.module_code].is_applicable
    ]
    total_module_weight = sum(module.legacy_weight for module in applicable_modules)
    module_completion = sum(
        completion_by_code[module.module_code].completion_percent * module.legacy_weight
        for module in applicable_modules
    )
    if context["is_legacy"]:
        module_completion /= 100.0
    elif total_module_weight:
        module_completion = (module_completion / total_module_weight) * 0.8
    else:
        module_completion = 0.0

    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    revenue_submission = await db.supplier_revenue_submissions.find_one(
        {"supplier_relationship_id": relationship_id, "reporting_period": reporting_period, "status": "submitted", "parent_visible": {"$ne": False}}, {"_id": 0, "id": 1}
    )
    revenue_completion = 20.0 if revenue_submission else 0.0
    overall_completion = module_completion + revenue_completion
    
    # Update status
    status = "pending"
    if overall_completion > 0:
        status = "accepted"
    if overall_completion >= 100:
        status = "completed"
    
    update_fields = {
        completion.legacy_field: round(completion.completion_percent, 1)
        for completion in completions
    }
    update_fields.update({
        "overall_completion_percent": round(overall_completion, 1),
        "invitation_status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "revenue_submission_status": "submitted" if revenue_submission else "not_started",
    })
    await db.supplier_relationships.update_one(
        {"id": relationship_id},
        {"$set": update_fields}
    )
