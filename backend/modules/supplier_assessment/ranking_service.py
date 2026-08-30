"""Supplier ranking and scoring read-model operations."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from shared.database.mongo import db

# ========================================================================
# Supplier Rankings
# ========================================================================

async def get_supplier_rankings(
    self,
    customer_org_id: str,
    reporting_period: Optional[str] = None,
) -> Dict[str, Any]:
    """Read rankings exclusively from the persisted canonical score snapshot."""
    supplier_query = {"customer_org_id": customer_org_id, "is_active": True}
    if reporting_period:
        supplier_query["reporting_period"] = reporting_period
    suppliers = await db.supplier_relationships.find(
        supplier_query,
        {"_id": 0}
    ).to_list(1000)
    
    active_questionnaires = await db.supplier_questionnaires.find(
        {"organization_id": customer_org_id, "is_active": True},
        {"_id": 0, "id": 1, "question_count": 1, "due_date": 1},
    ).to_list(500)
    questionnaire_by_id = {questionnaire["id"]: questionnaire for questionnaire in active_questionnaires}
    all_questionnaire_ids = set(questionnaire_by_id)
    supplier_ids = [supplier["id"] for supplier in suppliers]
    response_docs = await db.supplier_questionnaire_responses.find(
        {"supplier_relationship_id": {"$in": supplier_ids}},
        {"_id": 0, "supplier_relationship_id": 1, "questionnaire_id": 1, "reporting_period": 1, "status": 1, "answers": 1, "revision": 1, "updated_at": 1},
    ).sort([("revision", -1), ("updated_at", -1)]).to_list(10000)
    supplier_by_id = {supplier["id"]: supplier for supplier in suppliers}
    current_responses: Dict[tuple[str, str], Dict[str, Any]] = {}
    for response in response_docs:
        supplier = supplier_by_id.get(response["supplier_relationship_id"])
        if not supplier:
            continue
        response_period = response.get("reporting_period")
        if response_period and response_period != supplier.get("reporting_period"):
            continue
        key = (response["supplier_relationship_id"], response["questionnaire_id"])
        if key not in current_responses:
            current_responses[key] = response

    document_requirements = await db.supplier_document_requirements.find({
        "customer_org_id": customer_org_id,
        "is_active": True,
        "$or": [{"reporting_period": reporting_period}, {"reporting_period": {"$exists": False}}, {"reporting_period": None}],
    }, {"_id": 0, "id": 1, "document_version_id": 1, "due_date": 1, "reporting_period": 1, "supplier_relationship_ids": 1, "assessment_program_id": 1, "assessment_program_version": 1}).to_list(1000)
    document_submissions = await db.supplier_document_submissions.find(
        {"supplier_relationship_id": {"$in": supplier_ids}, "is_current": True},
        {"_id": 0, "supplier_relationship_id": 1, "document_requirement_id": 1, "status": 1},
    ).to_list(10000)
    document_submission_status = {
        (submission["supplier_relationship_id"], submission["document_requirement_id"]): submission.get("status")
        for submission in document_submissions
    }
    training_requirements = await db.supplier_training_requirements.find(
        {"organization_id": customer_org_id, "is_active": True, "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "due_date": 1},
    ).to_list(1000)
    training_due_dates = {requirement["id"]: requirement.get("due_date") for requirement in training_requirements}
    training_assignments = await db.supplier_training_assignments.find(
        {"supplier_relationship_id": {"$in": supplier_ids}, "is_active": True},
        {"_id": 0, "id": 1, "supplier_relationship_id": 1, "training_requirement_id": 1, "reporting_period": 1},
    ).to_list(10000)
    training_progress = await db.supplier_training_progress.find(
        {"supplier_relationship_id": {"$in": supplier_ids}},
        {"_id": 0, "training_assignment_id": 1, "status": 1},
    ).to_list(10000)
    training_status_by_assignment = {
        progress["training_assignment_id"]: progress.get("status") for progress in training_progress
    }
    def due_date_has_passed(value: Optional[str]) -> bool:
        if not value:
            return False
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date() < datetime.now(timezone.utc).date()
        except ValueError:
            return False

    rankings = []
    module_totals: Dict[str, Dict[str, float]] = {}
    for s in suppliers:
        snapshot = s.get("canonical_score_snapshot") or {}
        esg_score = snapshot.get("esg_score")
        env_score = snapshot.get("environment_score")
        social_score = snapshot.get("social_score")
        gov_score = snapshot.get("governance_score")
        overall_score = esg_score
        
        assigned_questionnaire_ids = set(s.get("questionnaire_ids") or all_questionnaire_ids)
        assigned_questionnaire_ids &= all_questionnaire_ids
        supplier_responses = [
            current_responses[(s["id"], questionnaire_id)]
            for questionnaire_id in assigned_questionnaire_ids
            if (s["id"], questionnaire_id) in current_responses
        ]
        total_questions = sum(int(questionnaire_by_id[questionnaire_id].get("question_count") or 0) for questionnaire_id in assigned_questionnaire_ids)
        answered_questions = sum(
            len([answer for answer in (response.get("answers") or {}).values() if answer not in (None, "")])
            for response in supplier_responses
        )
        submitted_questionnaire_ids = {
            response["questionnaire_id"] for response in supplier_responses if response.get("status") == "submitted"
        }
        submitted_count = len(submitted_questionnaire_ids)
        applicable_documents = [
            requirement for requirement in document_requirements
            if (
                (not requirement.get("reporting_period") or requirement["reporting_period"] == s.get("reporting_period"))
                and (
                    s["id"] in (requirement.get("supplier_relationship_ids") or [])
                    or (
                        not requirement.get("supplier_relationship_ids")
                        and requirement.get("assessment_program_id") == s.get("assessment_program_id")
                        and requirement.get("assessment_program_version") == s.get("assessment_program_version")
                    )
                )
            )
        ]
        applicable_training = [
            assignment for assignment in training_assignments
            if assignment["supplier_relationship_id"] == s["id"]
            and (not assignment.get("reporting_period") or assignment.get("reporting_period") == s.get("reporting_period"))
        ]
        overdue_modules = []
        if any(
            questionnaire_id not in submitted_questionnaire_ids
            and due_date_has_passed(questionnaire_by_id[questionnaire_id].get("due_date") or s.get("due_date"))
            for questionnaire_id in assigned_questionnaire_ids
        ):
            overdue_modules.append("ESG Questionnaire")
        enabled_modules = set(s.get("modules_enabled") or ["esg", "ghg"])
        if "ghg" in enabled_modules and float(s.get("ghg_completion_percent") or 0) < 100 and due_date_has_passed(s.get("due_date")):
            overdue_modules.append("GHG Emissions")
        if any(
            document_submission_status.get((s["id"], requirement["id"])) != "submitted"
            and due_date_has_passed(requirement.get("due_date") or s.get("due_date"))
            for requirement in applicable_documents
        ):
            overdue_modules.append("Documents")
        if any(
            training_status_by_assignment.get(assignment["id"]) != "completed"
            and due_date_has_passed(training_due_dates.get(assignment["training_requirement_id"]) or s.get("due_date"))
            for assignment in applicable_training
        ):
            overdue_modules.append("Training")
        is_overdue = bool(overdue_modules)
        all_assigned_submitted = bool(assigned_questionnaire_ids) and submitted_count == len(assigned_questionnaire_ids)
        if s.get("overall_completion_percent", 0) >= 100:
            completion_status, status_label = "completed", "Completed"
        elif is_overdue and not all_assigned_submitted:
            completion_status, status_label = "overdue", "Overdue"
        elif all_assigned_submitted:
            completion_status, status_label = "submitted", "Submitted"
        elif answered_questions > 0 or any(float(s.get(field) or 0) > 0 for field in ("esg_completion_percent", "ghg_completion_percent", "documents_completion_percent", "training_completion_percent")):
            completion_status, status_label = "in_progress", "In Progress"
        elif s.get("invitation_status") == "pending":
            completion_status, status_label = "invited", "Invited"
        else:
            completion_status, status_label = "not_started", "Not Started"
        attention_reasons = [f"Overdue: {module}" for module in overdue_modules]
        module_progress: Dict[str, float] = {}
        module_fields = {
            "esg": "esg_completion_percent",
            "ghg": "ghg_completion_percent",
            "documents": "documents_completion_percent",
            "training": "training_completion_percent",
        }
        for module_code, completion_field in module_fields.items():
            if module_code not in enabled_modules:
                continue
            if module_code == "documents" and not applicable_documents:
                continue
            if module_code == "training" and not applicable_training:
                continue
            completion = round(float(s.get(completion_field) or 0), 1)
            module_progress[module_code] = completion
            totals = module_totals.setdefault(module_code, {"configured_suppliers": 0.0, "completed_suppliers": 0.0, "completion_total": 0.0})
            totals["configured_suppliers"] += 1
            totals["completed_suppliers"] += int(completion >= 100)
            totals["completion_total"] += completion
        
        rankings.append({
            "supplier_id": s["id"],
            "company_name": s["company_name"],
            "esg_score": round(esg_score, 1) if esg_score is not None else None,
            "environment_score": round(env_score, 1) if env_score is not None else None,
            "social_score": round(social_score, 1) if social_score is not None else None,
            "governance_score": round(gov_score, 1) if gov_score is not None else None,
            # Rankings are ESG-led: GHG is tracked in its dedicated emissions view.
            "overall_score": round(esg_score, 1) if esg_score is not None else None,
            "completion_status": completion_status,
            "status_label": status_label,
            "question_progress": f"{answered_questions} / {total_questions} questions" if completion_status == "in_progress" and total_questions else None,
            "attention_reasons": attention_reasons,
            "overdue_modules": overdue_modules,
            "module_progress": module_progress,
            "due_date": s.get("due_date"),
            "revenue_percentage": s.get("revenue_percentage"),
            "revenue_amount": s.get("revenue_amount"),
            "revenue_currency": s.get("revenue_currency"),
        })
    
    # Sort and rank suppliers by ESG score. GHG has its own parent-emissions experience.
    rankings.sort(key=lambda x: (x["overall_score"] is None, -(x["overall_score"] or 0)))
    
    # Add ranks
    for i, r in enumerate(rankings):
        r["rank"] = i + 1 if r["overall_score"] is not None else None
    
    # Calculate aggregates for charts
    ranked_suppliers = [r for r in rankings if r["overall_score"] is not None]
    
    # Score distribution buckets
    score_distribution = {
        "excellent": len([r for r in ranked_suppliers if r["overall_score"] is not None and r["overall_score"] >= 80]),
        "good": len([r for r in ranked_suppliers if r["overall_score"] is not None and 60 <= r["overall_score"] < 80]),
        "average": len([r for r in ranked_suppliers if r["overall_score"] is not None and 40 <= r["overall_score"] < 60]),
        "poor": len([r for r in ranked_suppliers if r["overall_score"] is not None and r["overall_score"] < 40]),
    }
    
    # ESG data remains useful even when a supplier lacks other assessment modules.
    def average_score(field: str) -> Optional[float]:
        values = [float(row[field]) for row in rankings if row.get(field) is not None]
        return round(sum(values) / len(values), 1) if values else None

    avg_esg = average_score("esg_score")
    avg_env = average_score("environment_score")
    avg_social = average_score("social_score")
    avg_gov = average_score("governance_score")
    module_summary = {
        code: {
            "configured_suppliers": int(totals["configured_suppliers"]),
            "completed_suppliers": int(totals["completed_suppliers"]),
            "average_completion": round(totals["completion_total"] / totals["configured_suppliers"], 1) if totals["configured_suppliers"] else 0.0,
        }
        for code, totals in module_totals.items()
    }
    
    return {
        "rankings": rankings,
        "total_suppliers": len(rankings),
        "ranked_suppliers": len(ranked_suppliers),
        "score_distribution": score_distribution,
        "averages": {
            "esg": avg_esg,
            "environment": avg_env,
            "social": avg_social,
            "governance": avg_gov,
        },
        "module_summary": module_summary,
    }
