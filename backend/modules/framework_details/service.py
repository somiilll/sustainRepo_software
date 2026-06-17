"""
Framework Details Service

Business logic for managing framework-specific organization details.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from shared.database.mongo import db
from modules.framework_details.contracts import (
    BRSRDetailsCreate,
    BRSRDetailsUpdate,
    VALID_FRAMEWORKS,
)


class FrameworkDetailsService:
    """Service for managing framework-specific organization details."""

    COLLECTION_NAME = "organization_framework_details"

    def __init__(self, database=None):
        self._db = database or db
        self._collection = self._db[self.COLLECTION_NAME]

    async def get(self, org_id: str, framework: str) -> Optional[Dict[str, Any]]:
        """Get framework details for an organization."""
        return await self._collection.find_one(
            {"org_id": org_id, "framework": framework},
            {"_id": 0}
        )

    async def create_or_update_brsr(
        self, 
        org_id: str, 
        details: BRSRDetailsCreate
    ) -> Dict[str, Any]:
        """Create or update BRSR details for an organization."""
        existing = await self.get(org_id, "BRSR")
        
        details_dict = details.model_dump()
        now = datetime.now(timezone.utc).isoformat()
        
        if existing:
            # Update existing
            update_data = {
                **details_dict,
                "updated_at": now,
            }
            await self._collection.update_one(
                {"org_id": org_id, "framework": "BRSR"},
                {"$set": update_data}
            )
            return await self.get(org_id, "BRSR")
        else:
            # Create new
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "framework": "BRSR",
                **details_dict,
                "created_at": now,
                "updated_at": None,
            }
            await self._collection.insert_one(doc)
            doc.pop("_id", None)
            return doc

    async def update_brsr(
        self, 
        org_id: str, 
        update: BRSRDetailsUpdate
    ) -> Optional[Dict[str, Any]]:
        """Partial update BRSR details for an organization."""
        existing = await self.get(org_id, "BRSR")
        if not existing:
            return None

        update_dict = update.model_dump(exclude_unset=True)
        if not update_dict:
            return existing

        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self._collection.update_one(
            {"org_id": org_id, "framework": "BRSR"},
            {"$set": update_dict}
        )
        
        return await self.get(org_id, "BRSR")

    async def delete(self, org_id: str, framework: str) -> bool:
        """Delete framework details for an organization."""
        result = await self._collection.delete_one(
            {"org_id": org_id, "framework": framework}
        )
        return result.deleted_count > 0

    async def list_for_org(self, org_id: str) -> list:
        """List all framework details for an organization."""
        cursor = self._collection.find({"org_id": org_id}, {"_id": 0})
        return await cursor.to_list(100)

    async def validate_brsr_complete(self, org_id: str) -> tuple[bool, list]:
        """
        Validate that all mandatory BRSR fields are complete.
        Returns (is_valid, list_of_missing_fields).
        """
        details = await self.get(org_id, "BRSR")
        if not details:
            return False, ["No BRSR details found"]

        missing = []
        mandatory_fields = [
            "cin", "listed_entity_name", "year_of_incorporation",
            "corporate_address", "city", "state", "country", "pincode",
            "email", "telephone", "website",
            "paid_up_capital", "assurance_provider", "assurance_type",
            "export_contribution_percentage", "customer_types_brief",
            "stock_exchange", "reporting_boundary"
        ]

        for field in mandatory_fields:
            value = details.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(field)

        # Validate dynamic tables have at least one row each
        if not details.get("business_activities"):
            missing.append("business_activities (at least 1 row required)")
        if not details.get("products_services"):
            missing.append("products_services (at least 1 row required)")
        if not details.get("plants_offices"):
            missing.append("plants_offices (at least 1 row required)")
        if not details.get("markets_served"):
            missing.append("markets_served (at least 1 row required)")

        return len(missing) == 0, missing


# Default service instance
framework_details_service = FrameworkDetailsService()
