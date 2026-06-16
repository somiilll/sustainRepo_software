"""
ESG Platform - Super Admin Seed Script

Seeds the initial ESG Super Admin user in the users_esg collection.
Run this script once to create the first ESG administrator.

Usage:
    python seed_esg_superadmin.py
"""

import asyncio
import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "ghg_platform")

# ESG Super Admin credentials - CHANGE THESE IN PRODUCTION
ESG_SUPERADMIN_EMAIL = "esg-superadmin@sustainrepo.com"
ESG_SUPERADMIN_PASSWORD = "ESGAdmin123!"
ESG_SUPERADMIN_NAME = "ESG Super Administrator"


def get_password_hash(password: str) -> str:
    """Hash password using bcrypt."""
    import bcrypt
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()


async def seed_esg_superadmin():
    """Seed the ESG Super Admin user."""
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Check if ESG Super Admin already exists
    existing = await db.users_esg.find_one(
        {"email": ESG_SUPERADMIN_EMAIL},
        {"_id": 0}
    )
    
    if existing:
        print(f"ESG Super Admin already exists: {ESG_SUPERADMIN_EMAIL}")
        print("Skipping seed.")
        return
    
    # Create ESG Super Admin
    superadmin = {
        "id": str(uuid.uuid4()),
        "email": ESG_SUPERADMIN_EMAIL,
        "full_name": ESG_SUPERADMIN_NAME,
        "role": "super_admin",
        "password_hash": get_password_hash(ESG_SUPERADMIN_PASSWORD),
        "organization_id": None,  # Super admin not tied to any org
        "assigned_facilities": [],
        "is_active": True,
        "is_deleted": False,
        "requires_password_change": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
    }
    
    await db.users_esg.insert_one(superadmin)
    
    print("=" * 60)
    print("ESG Super Admin Created Successfully!")
    print("=" * 60)
    print(f"Email:    {ESG_SUPERADMIN_EMAIL}")
    print(f"Password: {ESG_SUPERADMIN_PASSWORD}")
    print(f"Name:     {ESG_SUPERADMIN_NAME}")
    print("=" * 60)
    print("IMPORTANT: Change the password after first login!")
    print("=" * 60)
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_esg_superadmin())
