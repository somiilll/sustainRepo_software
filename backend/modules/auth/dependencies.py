"""
Auth dependencies — FastAPI `Depends(...)` callables.

These are imported by server.py (legacy routes still reference the bare
names) AND by the new modular routers. Behaviour is byte-identical to
the original definitions in server.py.
"""
from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from shared.database.mongo import db
from shared.helpers.tokens import decode_access_token

# Module-level security scheme — same instance used everywhere so
# OpenAPI introspection sees a single bearer scheme.
security = HTTPBearer()


async def ensure_supplier_relationship_active(user: dict, organization: dict | None = None) -> None:
    """Prevent supplier accounts with no active customer relationship from accessing the platform."""
    if user.get("role") == "super_admin" or not user.get("organization_id"):
        return
    organization = organization or await db.organizations.find_one(
        {"id": user["organization_id"]}, {"_id": 0, "org_type": 1}
    )
    is_supplier = user.get("user_type") == "supplier" or (organization or {}).get("org_type") == "supplier"
    if not is_supplier:
        return
    relationship = await db.supplier_relationships.find_one(
        {"supplier_org_id": user["organization_id"], "is_active": True},
        {"_id": 0, "id": 1},
    )
    if not relationship:
        raise HTTPException(status_code=403, detail="Your supplier access has been deactivated by your customer.")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Resolve and validate the bearer token, returning the user document.

    Behaviour preserved exactly from the original server.py implementation:
      - Token decode failures → 401
      - Missing user → 401
      - Soft-deleted user → 403
      - Inactive user → 403
      - Inactive organization → 403
      - Expired subscription → 403 (super-admins exempt; date parse failures are tolerated)
    """
    try:
        token = credentials.credentials
        payload = decode_access_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    if user.get("is_deleted"):
        raise HTTPException(status_code=403, detail="Your account has been deleted. Please contact your administrator.")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Please contact your administrator.")

    organization = None
    if user.get("role") != "super_admin" and user.get("organization_id"):
        organization = await db.organizations.find_one({"id": user["organization_id"]}, {"_id": 0})

        if organization and (organization.get("is_deleted") or not organization.get("is_active", True)):
            raise HTTPException(status_code=403, detail="Your organization has been deactivated. Please contact your administrator.")

        if organization and organization.get("subscription_expires_at"):
            try:
                expires_str = organization["subscription_expires_at"]
                now = datetime.now(timezone.utc)
                if "T" in str(expires_str):
                    expires_at = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
                    is_expired = expires_at < now
                else:
                    expires_date = datetime.strptime(str(expires_str), "%Y-%m-%d").date()
                    is_expired = expires_date < now.date()
                if is_expired:
                    raise HTTPException(status_code=403, detail="Your organization's subscription has expired. Please contact your administrator to renew.")
            except (ValueError, TypeError):
                # Same lenient behaviour as the legacy implementation —
                # date parse failures don't block login.
                pass

    await ensure_supplier_relationship_active(user, organization)

    return user


async def get_super_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user


async def get_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def get_approver_user(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Allow access for:
    - Admins/Super Admins (can approve anything in their org)
    - Users with approver role or is_approver flag
    - Users who are assigned as approvers for specific questions/sections
    """
    role = current_user.get("role", "user")
    
    # Admins and super admins can always approve
    if role in ["super_admin", "admin"]:
        return current_user
    
    # Check if user has approver flag
    if current_user.get("is_approver"):
        return current_user
    
    # For regular users, we allow access - the service layer will filter
    # to only show submissions where they are assigned as approver
    return current_user
