import pytest

from modules.supplier_assessment.assignment_notification_service import (
    notify_supplier_assignment,
    supplier_has_logged_in,
)


def test_supplier_assignment_email_requires_a_successful_login():
    assert supplier_has_logged_in({"invitation_status": "pending"}) is False
    assert supplier_has_logged_in({"invitation_status": "accepted"}) is True
    assert supplier_has_logged_in({}) is False


@pytest.mark.asyncio
async def test_pending_supplier_assignment_email_is_suppressed_before_database_write():
    delivered = await notify_supplier_assignment(
        {
            "id": "relationship-1",
            "contact_email": "supplier@example.com",
            "invitation_status": "pending",
        },
        "training",
        "training-assignment-1",
        "Supplier training",
    )

    assert delivered is False