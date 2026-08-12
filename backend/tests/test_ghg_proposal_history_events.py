from modules.approval_workflow.proposal_service import build_emission_proposal_history_event, build_rejected_emission_preview
from modules.approval_workflow import proposal_service
import pytest


def _record(quantity, co2e, version):
    return {
        "id": "record-1",
        "organization_id": "org-1",
        "facility_id": "facility-e",
        "scope": "scope1",
        "category": "Stationary Combustion",
        "version": version,
        "dynamic_field_values": {"qty": {"value": quantity, "unit": "L"}},
        "total_emissions": co2e,
        "co2e_emissions": co2e,
    }


def test_approved_proposal_history_event_is_linked_and_contains_actual_changes():
    event = build_emission_proposal_history_event(
        _record(200, 0.525238683, 0),
        _record(205, 0.538369650, 1),
        {"id": "proposal-1", "request_type": "update", "submitted_by": "user-1", "submitted_by_email": "user@example.com", "submitted_by_name": "Request User", "submitted_at": "2026-08-12T08:00:00Z"},
        action="approved",
        actor_id="approver-1",
        actor_email="approver@example.com",
        actor_name="Approver",
        timestamp="2026-08-12T08:40:02Z",
    )

    assert event["id"] != "record-1"
    assert event["emission_id"] == "record-1"
    assert event["changes_summary"] == "Update Approved"
    assert event["changes"]["old_values"]["dynamic_field_values"]["qty"]["value"] == 200
    assert event["changes"]["new_values"]["dynamic_field_values"]["qty"]["value"] == 205
    assert event["approved_by_name"] == "Approver"
    assert event["requested_by_name"] == "Request User"


def test_rejected_proposal_history_event_keeps_the_record_unchanged_and_records_reason():
    current = _record(200, 0.525238683, 3)
    rejected_preview = build_rejected_emission_preview(current, {
        "entity_snapshot": {"proposed_changes": {
            "inputs": {"qty": {"value": 300, "unit": "L"}},
            "outputs": {"co2e": {"value": 0.03, "unit": "tCO2e"}},
        }}
    })
    event = build_emission_proposal_history_event(
        current, rejected_preview, {"id": "proposal-2", "request_type": "update"},
        action="rejected",
        actor_id="approver-1",
        actor_email="approver@example.com",
        actor_name="Approver",
        timestamp="2026-08-12T09:00:00Z",
        rejection_reason="Missing evidence",
    )

    assert event["emission_id"] == "record-1"
    assert event["changes_summary"] == "Update Rejected"
    assert event["changes"]["rejection_reason"] == "Missing evidence"
    assert event["approved_by_name"] is None
    assert event["field_changes"][0]["old_value"]["value"] == 200
    assert event["field_changes"][0]["new_value"]["value"] == 300


class _EmissionRecords:
    def __init__(self, record):
        self.record = record

    async def find_one(self, _query, _projection):
        return dict(self.record)

    async def update_one(self, _query, update):
        self.record.update(update["$set"])


class _History:
    def __init__(self):
        self.events = []

    async def insert_one(self, event):
        self.events.append(event)


class _DB:
    def __init__(self, record):
        self.emission_records = _EmissionRecords(record)
        self.emission_history = _History()


@pytest.mark.asyncio
async def test_approved_emission_proposal_writes_a_linked_post_apply_history_event(monkeypatch):
    record = _record(200, 0.525238683, 0)
    fake_db = _DB(record)
    monkeypatch.setattr(proposal_service, "db", fake_db)

    await proposal_service.ProposalService()._apply_proposal_to_record(
        record_id="record-1",
        entity_type="emission_record",
        entity_subtype="scope1",
        apply_data={"proposed_changes": {
            "inputs": {"qty": {"value": 205, "unit": "L"}},
            "outputs": {},
            "co2e_emissions": 0.538369650,
            "total_emissions": 0.538369650,
        }},
        proposal={"id": "proposal-1", "request_type": "update", "submitted_by": "user-1"},
        approver_id="approver-1",
        approver_email="approver@example.com",
        approver_name="Approver",
    )

    assert record["version"] == 1
    assert record["dynamic_field_values"]["qty"]["value"] == 205
    assert len(fake_db.emission_history.events) == 1
    event = fake_db.emission_history.events[0]
    assert event["emission_id"] == "record-1"
    assert event["changes_summary"] == "Update Approved"
    assert event["changes"]["new_values"]["total_emissions"] == pytest.approx(0.538369650)