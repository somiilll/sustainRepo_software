"""
Supplier Assessment Service - Business logic layer.
"""
import uuid
import os
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from shared.database.mongo import db
from shared.helpers.passwords import generate_random_password, get_password_hash
from shared.helpers.email import send_email
from modules.supplier_assessment.email_templates import (
    supplier_invitation_email,
    supplier_reminder_email,
)
from modules.supplier_assessment.module_registry import supplier_assessment_module_registry
from modules.supplier_assessment.programs import (
    apply_legacy_request_overrides,
    bind_current_program,
    get_or_create_program_revision,
    resolve_program_context,
)
from r2_storage import get_r2_storage
from modules.supplier_assessment import lifecycle_service as lifecycle_operations
from modules.supplier_assessment import ranking_service as ranking_operations
from modules.supplier_assessment import relationship_service as relationship_operations
from modules.supplier_assessment import questionnaire_service as questionnaire_operations


def _delegate_to(operations, operation):
    """Keep legacy monkeypatching and the public facade stable during extraction."""
    async def delegated(self, *args, **kwargs):
        operations.db = db
        return await operation(self, *args, **kwargs)
    return delegated


class SupplierAssessmentService:
    """Service for supplier assessment operations."""

    IMPORTANCE_WEIGHTS = {"low": 1.0, "medium": 2.0, "high": 3.0, "critical": 4.0}
    QUESTION_EVIDENCE_BUCKET = "supplier_assessment"
    QUESTION_EVIDENCE_FOLDER = "questionnaire-evidence"
    MAX_QUESTION_EVIDENCE_SIZE = 5 * 1024 * 1024
    QUESTION_EVIDENCE_CONTENT_TYPES = {
        "application/pdf", "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }

    # Focused services keep the public facade and test seams stable for all callers.
    _default_reporting_period = staticmethod(relationship_operations._default_reporting_period)
    _organization_default_reporting_period = _delegate_to(relationship_operations, relationship_operations._organization_default_reporting_period)
    create_supplier = _delegate_to(relationship_operations, relationship_operations.create_supplier)
    get_suppliers = _delegate_to(relationship_operations, relationship_operations.get_suppliers)
    get_supplier = _delegate_to(relationship_operations, relationship_operations.get_supplier)
    get_program_context = _delegate_to(relationship_operations, relationship_operations.get_program_context)
    update_supplier = _delegate_to(relationship_operations, relationship_operations.update_supplier)
    deactivate_supplier = _delegate_to(relationship_operations, relationship_operations.deactivate_supplier)
    send_reminder = _delegate_to(relationship_operations, relationship_operations.send_reminder)
    _pending_reminder_modules = _delegate_to(relationship_operations, relationship_operations._pending_reminder_modules)
    get_supplier_relationship_for_user = _delegate_to(relationship_operations, relationship_operations.get_supplier_relationship_for_user)
    update_revenue_info = _delegate_to(relationship_operations, relationship_operations.update_revenue_info)
    submit_revenue_info = _delegate_to(relationship_operations, relationship_operations.submit_revenue_info)
    update_revenue_percentage = _delegate_to(relationship_operations, relationship_operations.update_revenue_percentage)
    refresh_supplier_canonical_score = _delegate_to(lifecycle_operations, lifecycle_operations.refresh_supplier_canonical_score)
    _update_completion_status = _delegate_to(lifecycle_operations, lifecycle_operations._update_completion_status)
    get_supplier_rankings = _delegate_to(ranking_operations, ranking_operations.get_supplier_rankings)
    create_questionnaire = _delegate_to(questionnaire_operations, questionnaire_operations.create_questionnaire)
    get_questionnaires = _delegate_to(questionnaire_operations, questionnaire_operations.get_questionnaires)
    get_questionnaire = _delegate_to(questionnaire_operations, questionnaire_operations.get_questionnaire)
    update_questionnaire = _delegate_to(questionnaire_operations, questionnaire_operations.update_questionnaire)
    delete_questionnaire = _delegate_to(questionnaire_operations, questionnaire_operations.delete_questionnaire)
    duplicate_questionnaire = _delegate_to(questionnaire_operations, questionnaire_operations.duplicate_questionnaire)
    add_question = _delegate_to(questionnaire_operations, questionnaire_operations.add_question)
    update_question = _delegate_to(questionnaire_operations, questionnaire_operations.update_question)
    delete_question = _delegate_to(questionnaire_operations, questionnaire_operations.delete_question)
    reorder_questions = _delegate_to(questionnaire_operations, questionnaire_operations.reorder_questions)
    _current_questionnaire_response = _delegate_to(questionnaire_operations, questionnaire_operations._current_questionnaire_response)
    get_supplier_questionnaire_status = _delegate_to(questionnaire_operations, questionnaire_operations.get_supplier_questionnaire_status)
    get_questionnaire_for_supplier = _delegate_to(questionnaire_operations, questionnaire_operations.get_questionnaire_for_supplier)
    _question_evidence_metadata = _delegate_to(questionnaire_operations, questionnaire_operations._question_evidence_metadata)
    upload_supplier_question_evidence = _delegate_to(questionnaire_operations, questionnaire_operations.upload_supplier_question_evidence)
    get_question_evidence_file = _delegate_to(questionnaire_operations, questionnaire_operations.get_question_evidence_file)
    submit_supplier_answers = _delegate_to(questionnaire_operations, questionnaire_operations.submit_supplier_answers)
    _calculate_questionnaire_score = _delegate_to(questionnaire_operations, questionnaire_operations._calculate_questionnaire_score)
    _calculate_legacy_score = _delegate_to(questionnaire_operations, questionnaire_operations._calculate_legacy_score)
    _get_legacy_answer_score = _delegate_to(questionnaire_operations, questionnaire_operations._get_legacy_answer_score)
    get_supplier_responses_for_admin = _delegate_to(questionnaire_operations, questionnaire_operations.get_supplier_responses_for_admin)
    get_questionnaire_submissions_for_admin = _delegate_to(questionnaire_operations, questionnaire_operations.get_questionnaire_submissions_for_admin)
    set_manual_questionnaire_score = _delegate_to(questionnaire_operations, questionnaire_operations.set_manual_questionnaire_score)
    set_manual_question_score = _delegate_to(questionnaire_operations, questionnaire_operations.set_manual_question_score)
    reopen_questionnaire = _delegate_to(questionnaire_operations, questionnaire_operations.reopen_questionnaire)
    get_supplier_submission_status = _delegate_to(questionnaire_operations, questionnaire_operations.get_supplier_submission_status)

    @staticmethod
    def _validated_weight_config(weights: Optional[Dict[str, float]], defaults: Dict[str, float], label: str) -> Dict[str, float]:
        resolved = {**defaults, **(weights or {})}
        if set(resolved) != set(defaults):
            raise ValueError(f"{label} must include: {', '.join(defaults)}")
        try:
            normalized = {key: float(value) for key, value in resolved.items()}
        except (TypeError, ValueError):
            raise ValueError(f"{label} must contain numeric values")
        if any(value < 0 for value in normalized.values()) or abs(sum(normalized.values()) - 100) > 0.01:
            raise ValueError(f"{label} must total 100%")
        return normalized

    @classmethod
    def _resolve_question_weight(cls, importance: Optional[str], exact_numerical_weight: Optional[float], legacy_weight: Optional[float]) -> tuple[str, Optional[float], float]:
        normalized_importance = (importance or "medium").lower()
        if normalized_importance not in cls.IMPORTANCE_WEIGHTS:
            normalized_importance = "medium"
        if exact_numerical_weight is not None:
            return normalized_importance, float(exact_numerical_weight), float(exact_numerical_weight)
        # Preserve historic API clients which only supplied `weight`.
        if importance is None and legacy_weight not in (None, 1, 1.0):
            return normalized_importance, float(legacy_weight), float(legacy_weight)
        return normalized_importance, None, cls.IMPORTANCE_WEIGHTS[normalized_importance]

    @staticmethod
    def _synchronize_choice_mapping(
        scoring: Optional[Dict[str, Any]],
        options: Optional[List[Dict[str, Any]]],
    ) -> Optional[Dict[str, Any]]:
        """Keep dropdown option scores and canonical choice mappings aligned."""
        normalized = dict(scoring or {})
        if normalized.get("rule") != "choice_mapping":
            return scoring
        option_scores = {
            str(option["value"]): float(option["score"])
            for option in (options or [])
            if option.get("value") not in (None, "") and option.get("score") is not None
        }
        if option_scores:
            normalized["choices"] = option_scores
        return normalized

    @staticmethod
    def _question_evidence_requirement(value: Optional[str]) -> str:
        return value if value in {"not_required", "optional", "required"} else "not_required"
    


# Singleton instance
supplier_service = SupplierAssessmentService()
