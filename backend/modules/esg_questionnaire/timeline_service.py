"""Read-only, reporting-year-safe timeline resolver for BRSR and GRI responses."""
from typing import Any

from shared.database.mongo import db
from .timeline_contracts import QuestionResponseTimeline, QuestionTimelineEvent, TimelineActor, TimelineEvidenceState


class QuestionResponseTimelineService:
    """Normalizes existing questionnaire data sources without creating or migrating data."""

    SUPPORTED_FRAMEWORKS = {"BRSR", "GRI"}

    @staticmethod
    def _actor(name: Any = None, email: Any = None) -> TimelineActor | None:
        if not name and not email:
            return None
        return TimelineActor(name=name or None, email=email or None)

    @staticmethod
    def _timestamp(value: Any) -> str | None:
        return value.isoformat() if hasattr(value, "isoformat") else value

    @classmethod
    def build_timeline(
        cls,
        *,
        framework: str,
        question_key: str,
        reporting_year: str,
        current_response: dict | None,
        submissions: list[dict],
        audit_events: list[dict],
        approval_requests: list[dict],
        version_events: list[dict],
        excluded_unscoped_events: int = 0,
    ) -> QuestionResponseTimeline:
        events: list[QuestionTimelineEvent] = []
        for submission in submissions:
            events.append(QuestionTimelineEvent(
                event_type="SUBMITTED",
                timestamp=cls._timestamp(submission.get("submitted_at") or submission.get("created_at")),
                requester=cls._actor(submission.get("submitted_by_user_name"), submission.get("submitted_by_user_email")),
                submitted_value=submission.get("value"),
                source="esg_response_submissions",
                evidence_state=TimelineEvidenceState.FOUND,
            ))

        for audit in audit_events:
            detail = audit.get("change_details") or {}
            action = audit.get("action")
            requester = cls._actor(detail.get("submitted_by"), None)
            approver_data = audit.get("performed_by") or {}
            approver = cls._actor(approver_data.get("name"), approver_data.get("email"))
            if action in {"submission_approved", "approved"}:
                events.append(QuestionTimelineEvent(
                    event_type="APPROVED",
                    timestamp=cls._timestamp(audit.get("timestamp")),
                    requester=requester,
                    approver=approver,
                    submitted_value=detail.get("old_value"),
                    final_value=detail.get("final_value", detail.get("new_value")),
                    approver_edited=bool(detail.get("was_merged")),
                    source="question_audit_log",
                ))
            elif action in {"submission_rejected", "rejected"}:
                events.append(QuestionTimelineEvent(
                    event_type="REJECTED",
                    timestamp=cls._timestamp(audit.get("timestamp")),
                    requester=requester,
                    approver=approver,
                    rejection_reason=detail.get("rejection_reason") or audit.get("rejection_reason"),
                    source="question_audit_log",
                    evidence_state=TimelineEvidenceState.FOUND_PARTIAL if detail.get("submitted_by") is None else TimelineEvidenceState.FOUND,
                ))
            elif action in {"created", "updated"}:
                actor = cls._actor(approver_data.get("name"), approver_data.get("email"))
                events.append(QuestionTimelineEvent(
                    event_type="CREATED" if action == "created" else "UPDATED",
                    timestamp=cls._timestamp(audit.get("timestamp")),
                    requester=actor,
                    submitted_value=detail.get("old_value"),
                    final_value=detail.get("new_value"),
                    source="question_audit_log",
                ))

        # Versions are included only when their snapshot is explicitly scoped to this reporting year.
        for version in version_events:
            snapshot = version.get("snapshot") or {}
            version_year = version.get("reporting_year") or snapshot.get("reporting_year")
            if version_year != reporting_year:
                continue
            events.append(QuestionTimelineEvent(
                event_type=str(version.get("change_type", "VERSION")).upper(),
                timestamp=cls._timestamp(version.get("created_at")),
                source="esg_responses_versions",
                evidence_state=TimelineEvidenceState.FOUND_PARTIAL,
            ))

        events.sort(key=lambda event: event.timestamp or "", reverse=True)
        sources = []
        for source, rows in (("organization_esg_responses", [current_response] if current_response else []), ("esg_response_submissions", submissions), ("question_audit_log", audit_events), ("approval_requests", approval_requests), ("esg_responses_versions", version_events)):
            if rows:
                sources.append(source)
        state = TimelineEvidenceState.NOT_FOUND if not events and not current_response else (
            TimelineEvidenceState.FOUND_PARTIAL if excluded_unscoped_events else TimelineEvidenceState.FOUND
        )
        return QuestionResponseTimeline(
            framework=framework,
            question_key=question_key,
            reporting_year=reporting_year,
            evidence_state=state,
            current_response=current_response or {},
            events=events,
            sources_used=sources,
            excluded_unscoped_events=excluded_unscoped_events,
        )

    async def get_timeline(self, organization_id: str, framework: str, question_key: str, reporting_year: str) -> QuestionResponseTimeline:
        normalized_framework = framework.upper()
        if normalized_framework not in self.SUPPORTED_FRAMEWORKS:
            raise ValueError("Only BRSR and GRI timelines are supported")
        current_response = await db.organization_esg_responses.find_one(
            {"$or": [{"org_id": organization_id}, {"organization_id": organization_id}], "framework": {"$regex": f"^{normalized_framework}$", "$options": "i"}, "question_key": question_key, "reporting_year": reporting_year},
            {"_id": 0},
        )
        submissions = await db.esg_response_submissions.find(
            {"organization_id": organization_id, "framework": {"$regex": f"^{normalized_framework}$", "$options": "i"}, "question_key": question_key, "reporting_period": reporting_year},
            {"_id": 0},
        ).to_list(100)
        audit_events = await db.question_audit_log.find(
            {"$and": [
                {"$or": [{"organization_id": organization_id}, {"org_id": organization_id}]},
                {"question_key": question_key},
                {"$or": [{"reporting_period": reporting_year}, {"reporting_year": reporting_year}]},
            ]},
            {"_id": 0},
        ).to_list(100)
        approval_requests = await db.approval_requests.find(
            {"organization_id": organization_id, "entity_type": "esg_response", "entity_id": question_key, "framework": {"$regex": f"^{normalized_framework}$", "$options": "i"}, "entity_snapshot.reporting_year": reporting_year},
            {"_id": 0},
        ).to_list(100)
        version_events = await db.esg_responses_versions.find(
            {"record_id": question_key},
            {"_id": 0},
        ).to_list(100)
        unscoped_approval_events = await db.approval_history.count_documents(
            {"organization_id": organization_id, "entity_type": "esg_response", "entity_id": question_key, "reporting_year": {"$exists": False}}
        )
        return self.build_timeline(
            framework=normalized_framework,
            question_key=question_key,
            reporting_year=reporting_year,
            current_response=current_response,
            submissions=submissions,
            audit_events=audit_events,
            approval_requests=approval_requests,
            version_events=version_events,
            excluded_unscoped_events=unscoped_approval_events,
        )


question_response_timeline_service = QuestionResponseTimelineService()