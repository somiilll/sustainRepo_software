"""CBAM auth: reuses the platform login. Org admins get role "admin"; everyone else is read-only ("viewer")."""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status

from modules.auth.dependencies import get_current_user

ADMIN_ROLES = {"admin", "super_admin"}
_seeded_orgs: set[str] = set()


@dataclass
class User:
    id: str
    email: str
    org_id: str
    org_name: str
    role: str


async def current_user(host_user: dict = Depends(get_current_user)) -> User:
    org_id = host_user.get("organization_id")
    if not org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No organization assigned")
    if org_id not in _seeded_orgs:
        from ..seed import ensure_seeded

        await ensure_seeded(org_id)
        _seeded_orgs.add(org_id)
    from shared.database.mongo import db as host_db

    org = await host_db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
    role = "admin" if host_user.get("role") in ADMIN_ROLES else "viewer"
    return User(host_user["id"], host_user.get("email", ""), org_id, (org or {}).get("name") or org_id, role)


def require_role(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role != "admin" and user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only organization admins can change CBAM data")
        return user

    return dep
