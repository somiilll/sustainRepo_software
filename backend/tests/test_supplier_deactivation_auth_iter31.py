"""Regression coverage for immediate supplier account revocation on deletion."""
from copy import deepcopy

import pytest
from fastapi import HTTPException

from modules.auth import dependencies as auth_dependencies
from modules.supplier_assessment import service as service_module


class _Result:
    def __init__(self, modified_count):
        self.modified_count = modified_count


class _Collection:
    def __init__(self, docs):
        self.docs = docs

    @staticmethod
    def _matches(doc, query):
        for key, value in query.items():
            if isinstance(value, dict) and "$ne" in value:
                if doc.get(key) == value["$ne"]:
                    return False
            elif doc.get(key) != value:
                return False
        return True

    async def find_one(self, query, _projection=None):
        return next((deepcopy(doc) for doc in self.docs if self._matches(doc, query)), None)

    async def update_one(self, query, update):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                return _Result(1)
        return _Result(0)

    async def update_many(self, query, update):
        changed = 0
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                changed += 1
        return _Result(changed)


class _Database:
    def __init__(self):
        self.supplier_relationships = _Collection([{
            "id": "relationship-1", "supplier_org_id": "supplier-org-1", "is_active": True,
        }])
        self.users = _Collection([{
            "id": "supplier-user-1", "organization_id": "supplier-org-1", "user_type": "supplier",
            "role": "admin", "is_active": True, "is_deleted": False,
        }])


@pytest.mark.asyncio
async def test_deactivating_supplier_revokes_login_and_existing_session(monkeypatch):
    database = _Database()
    monkeypatch.setattr(service_module, "db", database)

    assert await service_module.supplier_service.deactivate_supplier("relationship-1") is True
    assert database.supplier_relationships.docs[0]["is_active"] is False
    revoked_user = database.users.docs[0]
    assert revoked_user["is_active"] is False
    assert revoked_user["supplier_access_revoked_by_relationship_id"] == "relationship-1"

    monkeypatch.setattr(auth_dependencies, "db", database)
    monkeypatch.setattr(auth_dependencies, "decode_access_token", lambda _token: {"sub": "supplier-user-1"})
    credentials = type("Credentials", (), {"credentials": "previously-issued-token"})()
    with pytest.raises(HTTPException) as error:
        await auth_dependencies.get_current_user(credentials)
    assert error.value.status_code == 403
    assert "deactivated" in error.value.detail.lower()