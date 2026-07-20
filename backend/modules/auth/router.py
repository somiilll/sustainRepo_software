"""
Auth router — 7 routes:
    POST   /auth/signup
    POST   /auth/login
    POST   /auth/change-password
    POST   /auth/forgot-password
    POST   /auth/reset-password
    GET    /auth/me
    PUT    /auth/profile

Behaviour preserved exactly from server.py — same response shapes,
status codes, validation messages, and side effects (email sending).
"""
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from shared.database.mongo import db
from shared.helpers.email import send_email
from shared.helpers.passwords import (
    verify_password,
    get_password_hash,
)
from shared.helpers.tokens import create_access_token, create_refresh_token, decode_access_token
from shared.security import limiter

from modules.auth.contracts import (
    UserCreate,
    UserLogin,
    PasswordChange,
    PasswordReset,
    ProfileUpdate,
    ResetPasswordRequest,
    UserResponse,
    TokenResponse,
)
from modules.auth.dependencies import get_current_user
from modules.auth.email_templates import password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_password_strength(pwd: str) -> None:
    """Shared validation used by both /change-password and /reset-password.

    Rules — kept identical to legacy behaviour:
      - >= 8 chars
      - >= 1 uppercase, lowercase, digit, special char
    """
    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not any(c.isupper() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.islower() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in pwd):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)")


@router.post("/auth/signup", response_model=TokenResponse)
@limiter.limit("5/minute")
async def signup(request: Request, user_data: UserCreate):
    existing = await db.users.find_one(
        {"email": user_data.email, "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_dict = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "password_hash": get_password_hash(user_data.password),
        "organization_id": user_data.organization_id,
        "assigned_facilities": [],
        "requires_password_change": False,
        "recovery_email": None,
        "recovery_mobile": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.users.insert_one(user_dict)

    access_token = create_access_token(data={"sub": user_dict["id"]})
    refresh_token = create_refresh_token(data={"sub": user_dict["id"]})
    user_response = UserResponse(**{k: v for k, v in user_dict.items() if k != "password_hash"})

    return TokenResponse(access_token=access_token, refresh_token=refresh_token, token_type="bearer", user=user_response)


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin):
    logger.info(f"[AUTH_LOGIN] Attempt: email={credentials.email}")
    
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        logger.warning(f"[AUTH_LOGIN] Failed: email={credentials.email}, reason=invalid_credentials")
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    if user.get("is_deleted", False):
        logger.warning(f"[AUTH_LOGIN] Failed: email={credentials.email}, reason=account_deleted")
        raise HTTPException(status_code=403, detail="Your account has been deleted. Please contact your administrator.")

    if not user.get("is_active", True):
        logger.warning(f"[AUTH_LOGIN] Failed: email={credentials.email}, reason=account_inactive")
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Please contact your administrator.")

    if user.get("role") != "super_admin" and user.get("organization_id"):
        org = await db.organizations.find_one({"id": user["organization_id"]}, {"_id": 0})
        if org and (org.get("is_deleted") or not org.get("is_active", True)):
            raise HTTPException(status_code=403, detail="Your organization has been deactivated. Please contact your administrator.")

        if org and org.get("subscription_expires_at"):
            try:
                expires_str = org["subscription_expires_at"]
                now = datetime.now(timezone.utc)
                if 'T' in str(expires_str):
                    expires_at = datetime.fromisoformat(expires_str.replace('Z', '+00:00'))
                    is_expired = expires_at < now
                else:
                    expires_date = datetime.strptime(str(expires_str), '%Y-%m-%d').date()
                    is_expired = expires_date < now.date()

                if is_expired:
                    raise HTTPException(status_code=403, detail="Your organization's subscription has expired. Please contact your administrator to renew.")
            except (ValueError, TypeError) as e:
                # Lenient — date parse failures don't block login (legacy behaviour).
                print(f"Subscription date parse error: {e}")

    access_token = create_access_token(data={"sub": user["id"]})
    refresh_token = create_refresh_token(data={"sub": user["id"]})
    user_response = UserResponse(**{k: v for k, v in user.items() if k != "password_hash"})

    logger.info(f"[AUTH_LOGIN] Success: email={credentials.email}, user_id={user['id']}, role={user.get('role')}")
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, token_type="bearer", user=user_response)


@router.post("/auth/change-password")
async def change_password(password_data: PasswordChange, current_user: dict = Depends(get_current_user)):
    if not verify_password(password_data.old_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Incorrect old password")

    if password_data.old_password == password_data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    _validate_password_strength(password_data.new_password)

    new_hash = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password_hash": new_hash, "requires_password_change": False}},
    )
    return {"message": "Password changed successfully"}


@router.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, reset_data: PasswordReset):
    user = await db.users.find_one({"email": reset_data.email}, {"_id": 0})
    if not user:
        # Don't reveal if user exists.
        return {"message": "If the email exists, recovery instructions will be sent"}

    reset_token = str(uuid.uuid4())
    await db.password_resets.insert_one({
        "id": reset_token,
        "user_id": user["id"],
        "email": user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "used": False,
    })

    frontend_url = os.environ.get('FRONTEND_URL', 'https://repo-pilot-preview.preview.emergentagent.com')
    reset_link = f"{frontend_url}/reset-password?token={reset_token}"

    email_body = password_reset_email(user.get('full_name', 'User'), reset_link)
    await send_email(user["email"], "Reset Your SustainRepo Password", email_body)

    return {"message": "If the email exists, recovery instructions will be sent"}


@router.post("/auth/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, reset_data: ResetPasswordRequest):
    """Reset password using token from email."""
    reset_record = await db.password_resets.find_one(
        {"id": reset_data.token, "used": False}, {"_id": 0}
    )
    if not reset_record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    expires_at = datetime.fromisoformat(reset_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset token has expired")

    _validate_password_strength(reset_data.new_password)

    new_hash = get_password_hash(reset_data.new_password)
    await db.users.update_one(
        {"id": reset_record["user_id"]},
        {"$set": {"password_hash": new_hash, "requires_password_change": False}},
    )
    await db.password_resets.update_one(
        {"id": reset_data.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": "Password reset successfully. You can now login with your new password."}


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)


@router.put("/auth/profile", response_model=UserResponse)
async def update_profile(profile_data: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update current user's profile (name)."""
    if not profile_data.full_name or len(profile_data.full_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters")

    update_dict = {
        "full_name": profile_data.full_name.strip(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.update_one({"id": current_user["id"]}, {"$set": update_dict})

    updated_user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return UserResponse(**updated_user)



class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/auth/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh_token(request: Request, data: RefreshRequest):
    """Exchange a valid refresh token for a new access token."""
    import jwt as _jwt
    try:
        payload = decode_access_token(data.refresh_token)
    except _jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired. Please login again.")
    except _jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_access = create_access_token(data={"sub": user_id})
    new_refresh = create_refresh_token(data={"sub": user_id})
    user_response = UserResponse(**{k: v for k, v in user.items() if k != "password_hash"})

    return TokenResponse(access_token=new_access, refresh_token=new_refresh, token_type="bearer", user=user_response)
