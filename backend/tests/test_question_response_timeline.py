from modules.esg_questionnaire.timeline_service import QuestionResponseTimelineService


def test_brsr_timeline_keeps_submitter_value_distinct_from_approver_final_value():
    timeline = QuestionResponseTimelineService.build_timeline(
        framework="BRSR", question_key="brsr_water", reporting_year="FY 2026-27",
        current_response={"value": 4400, "approval_status": "approved"},
        submissions=[{"id": "submission-1", "submitted_at": "2026-08-12T10:00:00Z", "submitted_by_user_name": "Ravi", "value": 4000}],
        audit_events=[{"action": "submission_approved", "timestamp": "2026-08-12T10:05:00Z", "performed_by": {"name": "Somil"}, "change_details": {"old_value": 4000, "final_value": 4400, "was_merged": True, "submitted_by": "Ravi"}}],
        approval_requests=[], version_events=[],
    )
    event = timeline.events[0]
    assert event.event_type == "APPROVED"
    assert event.requester.name == "Ravi"
    assert event.approver.name == "Somil"
    assert event.submitted_value == 4000
    assert event.final_value == 4400
    assert event.approver_edited is True


def test_gri_rejection_is_year_scoped_and_exposes_reason():
    timeline = QuestionResponseTimelineService.build_timeline(
        framework="GRI", question_key="gri_energy", reporting_year="FY 2026-27",
        current_response={"value": 100, "approval_status": "approved"}, submissions=[],
        audit_events=[{"action": "submission_rejected", "timestamp": "2026-08-12T10:00:00Z", "performed_by": {"name": "Somil"}, "change_details": {"submitted_by": "Ravi", "rejection_reason": "Evidence missing"}}],
        approval_requests=[], version_events=[], excluded_unscoped_events=1,
    )
    event = timeline.events[0]
    assert event.event_type == "REJECTED"
    assert event.rejection_reason == "Evidence missing"
    assert timeline.excluded_unscoped_events == 1
    assert timeline.evidence_state.value == "FOUND_PARTIAL"