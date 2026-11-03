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

def test_kpi_synced_audit_entry_appears_as_system_event_with_old_and_new_values():
    timeline = QuestionResponseTimelineService.build_timeline(
        framework="BRSR", question_key="p1_accounts_payables", reporting_year="FY 2026-2027",
        current_response={"value": {"days_payables": {"current_fy": 0.77}}}, submissions=[],
        audit_events=[{"action": "kpi_synced", "timestamp": "2026-10-27T06:58:34Z", "performed_by": {"type": "system", "name": "KPI Sync (System)"},
                       "change_details": {"old_value": {"days_payables": {"current_fy": 0.02}}, "new_value": {"days_payables": {"current_fy": 0.77}}}}],
        approval_requests=[], version_events=[],
    )
    event = timeline.events[0]
    assert event.event_type == "KPI_SYNCED"
    assert event.requester.name == "KPI Sync (System)"
    assert event.submitted_value == {"days_payables": {"current_fy": 0.02}}
    assert event.final_value == {"days_payables": {"current_fy": 0.77}}
