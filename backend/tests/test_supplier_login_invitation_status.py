from types import SimpleNamespace

import pytest

from modules.auth import dependencies


class _Relationships:
    def __init__(self):
        self.calls = []

    async def update_many(self, query, update):
        self.calls.append((query, update))


@pytest.mark.asyncio
async def test_first_supplier_login_accepts_only_pending_active_relationships(monkeypatch):
    relationships = _Relationships()
    monkeypatch.setattr(dependencies, "db", SimpleNamespace(supplier_relationships=relationships))

    await dependencies.mark_supplier_invitation_accepted_on_login(
        {"organization_id": "supplier-org", "user_type": "supplier"},
        {"org_type": "supplier"},
    )

    assert len(relationships.calls) == 1
    query, update = relationships.calls[0]
    assert query == {"supplier_org_id": "supplier-org", "is_active": True, "invitation_status": "pending"}
    assert update["$set"]["invitation_status"] == "accepted"
    assert update["$set"]["accepted_at"]


@pytest.mark.asyncio
async def test_customer_login_does_not_update_supplier_relationship_status(monkeypatch):
    relationships = _Relationships()
    monkeypatch.setattr(dependencies, "db", SimpleNamespace(supplier_relationships=relationships))

    await dependencies.mark_supplier_invitation_accepted_on_login(
        {"organization_id": "customer-org", "user_type": "customer"},
        {"org_type": "customer"},
    )

    assert relationships.calls == []