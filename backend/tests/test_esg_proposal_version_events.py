from modules.approval_workflow.proposal_service import build_esg_proposal_version_event, build_rejected_esg_preview


def _record(volume, version=1):
    return {
        "id": "waste-record-1",
        "field_values": {"volume_of_spill": volume, "material_of_spill": "Fuel spills"},
        "version": version,
    }


def test_approved_esg_proposal_creates_standard_record_version_event():
    event = build_esg_proposal_version_event(
        _record(2212, 1), _record(4400, 2),
        {"id": "proposal-1", "submitted_by": "requester-1", "submitted_by_name": "Ravi", "submitted_at": "2026-08-12T09:48:10Z", "entity_snapshot": {"approver_edited": True, "changes_summary": [{"field_key": "volume_of_spill", "old_value": 2212, "new_value": 3000}]}},
        section="environment", action="approved", actor_id="approver-1", actor_email="approver@example.com", actor_name="Somil", timestamp="2026-08-12T09:48:39Z",
    )

    assert event["record_id"] == "waste-record-1"
    assert event["version"] == 2
    assert event["change_type"] == "approved"
    assert event["requested_by_name"] == "Ravi"
    assert event["approved_by_name"] == "Somil"
    assert event["approver_edited"] is True
    assert event["submitted_field_diffs"][0]["new_value"] == 3000
    assert event["approver_field_diffs"][0]["old_value"] == 3000
    assert event["field_diffs"] == [{
        "field": "volume_of_spill", "display_name": "Volume Of Spill", "old_value": 2212, "new_value": 4400,
    }]


def test_rejected_esg_proposal_keeps_approved_record_and_stores_rejected_diff():
    current = _record(2212, 2)
    preview = build_rejected_esg_preview(current, {"entity_snapshot": {"field_values": {"volume_of_spill": 3000, "material_of_spill": "Fuel spills"}}})
    event = build_esg_proposal_version_event(
        current, preview, {"id": "proposal-2", "submitted_by_name": "Ravi"},
        section="environment", action="rejected", actor_id="approver-1", actor_email="approver@example.com", actor_name="Somil", timestamp="2026-08-12T10:00:00Z", rejection_reason="Incorrect value",
    )

    assert current["field_values"]["volume_of_spill"] == 2212
    assert event["record_was_changed"] is False
    assert event["change_type"] == "rejected"
    assert event["rejection_reason"] == "Incorrect value"
    assert event["field_diffs"][0]["old_value"] == 2212
    assert event["field_diffs"][0]["new_value"] == 3000