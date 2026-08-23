"""Regression coverage for the supplier GHG Logs revision filter."""

from modules.supplier_assessment.ghg_submission_service import (
    exclude_reopened_supplier_submission_revisions,
)


def test_logs_hide_reopened_submitted_source_and_keep_editable_draft():
    records = [
        {
            "id": "submitted-1",
            "source": "supplier",
            "submission_id": "submission-1",
            "submitted_to_parent_org": "2026-08-23T10:00:00+00:00",
        },
        {
            "id": "reopened-draft-1",
            "source": "supplier",
            "submitted_to_parent_org": None,
            "resubmission_of": "submission-1",
        },
        {"id": "standard-record", "source": "manual"},
        {
            "id": "unrelated-submission",
            "source": "supplier",
            "submission_id": "submission-2",
            "submitted_to_parent_org": "2026-08-22T10:00:00+00:00",
        },
    ]

    visible_ids = {
        record["id"]
        for record in exclude_reopened_supplier_submission_revisions(records)
    }

    assert visible_ids == {"reopened-draft-1", "standard-record", "unrelated-submission"}


def test_logs_keep_submitted_supplier_record_until_a_reopened_draft_exists():
    records = [
        {
            "id": "submitted-1",
            "source": "supplier",
            "submission_id": "submission-1",
            "submitted_to_parent_org": "2026-08-23T10:00:00+00:00",
        }
    ]

    assert exclude_reopened_supplier_submission_revisions(records) == records