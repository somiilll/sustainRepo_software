"""
Users admin router — 4 routes:
    POST   /admin/users
    GET    /admin/users
    PUT    /admin/users/{user_id}/assign-facilities
    DELETE /admin/users/{user_id}

Behaviour preserved exactly from server.py.
ESG Platform: Uses users collection.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from shared.database.mongo import db
from shared.helpers.email import send_email
from shared.helpers.passwords import generate_random_password, get_password_hash

from modules.auth.contracts import UserResponse
from modules.auth.dependencies import get_admin_user
from modules.auth.email_templates import user_invite_email
from modules.users.contracts import UserCreateRequest

router = APIRouter()


@router.post("/admin/users")
async def create_user(
    user_data: UserCreateRequest,
    current_user: dict = Depends(get_admin_user),
):
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")

    # Enforce per-org max_users limit.
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if org:
        max_users = org.get("max_users", 20)
        current_user_count = await db.users.count_documents({
            "organization_id": org_id,
            "role": "user",
            "is_deleted": {"$ne": True},
        })
        if current_user_count >= max_users:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum user limit ({max_users}) reached for your organization",
            )

    # Email uniqueness — soft-deleted accounts release the email.
    existing = await db.users.find_one(
        {"email": user_data.email, "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    temp_password = generate_random_password()
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "full_name": user_data.full_name,
        "role": "user",
        "password_hash": get_password_hash(temp_password),
        "organization_id": org_id,
        "assigned_facilities": user_data.assigned_facilities,
        "requires_password_change": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_dict)

    org_name_doc = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})
    org_name = org_name_doc.get("name", "your organization") if org_name_doc else "your organization"

    frontend_url = os.environ.get('FRONTEND_URL', 'https://emission-review-hub.preview.emergentagent.com')
    login_link = f"{frontend_url}/login"

    email_body = user_invite_email(
        full_name=user_data.full_name,
        email=user_data.email,
        temp_password=temp_password,
        org_name=org_name,
        login_link=login_link,
    )
    await send_email(user_data.email, "Welcome to SustainRepo - Your Account is Ready!", email_body)

    # Don't return temp_password — sent via email only.
    return {"message": "User created and email sent"}


@router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(current_user: dict = Depends(get_admin_user)):
    org_id = current_user.get("organization_id")
    if not org_id:
        return []  # Admin without organization has no users to manage.
    query = {"organization_id": org_id, "role": "user", "is_deleted": {"$ne": True}}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [UserResponse(**u) for u in users]


@router.put("/admin/users/{user_id}/assign-facilities")
async def assign_facilities(
    user_id: str,
    facility_ids: List[str],
    current_user: dict = Depends(get_admin_user),
):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"assigned_facilities": facility_ids}})
    return {"message": "Facilities assigned successfully"}


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_admin_user)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user_to_delete = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")

    # Admins can only delete users from their own organization.
    if current_user["role"] == "admin":
        if user_to_delete.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Not authorized to delete users from other organizations")

    # Hard delete — same as legacy.
    await db.users.delete_one({"id": user_id})
    return {"message": "User deleted permanently."}
