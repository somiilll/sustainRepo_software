"""
Framework Details Service

Business logic for managing framework-specific organization details.
Supports hybrid structure:
- Static data: organization_framework_details
- Yearly data: organization_framework_yearly_data
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from shared.database.mongo import db
from modules.framework_details.contracts import (
    BRSRDetailsCreate,
    BRSRDetailsUpdate,
    BRSRYearlyDataCreate,
    BRSRYearlyDataUpdate,
    VALID_FRAMEWORKS,
)


class FrameworkDetailsService:
    """Service for managing framework-specific organization details."""

    STATIC_COLLECTION = "organization_framework_details"
    YEARLY_COLLECTION = "organization_framework_yearly_data"

    def __init__(self, database=None):
        self._db = database or db
        self._static_collection = self._db[self.STATIC_COLLECTION]
        self._yearly_collection = self._db[self.YEARLY_COLLECTION]

    # =========================================================================
    # Static Data Methods (organization_framework_details)
    # =========================================================================

    async def get(self, org_id: str, framework: str, reporting_period: str = "") -> Optional[Dict[str, Any]]:
        """Get static framework details for an organization, optionally filtered by reporting period."""
        query = {"org_id": org_id, "framework": framework}
        if reporting_period:
            query["reporting_period"] = reporting_period
        return await self._static_collection.find_one(query, {"_id": 0})

    async def create_or_update_brsr(
        self, 
        org_id: str, 
        details: BRSRDetailsCreate
    ) -> Dict[str, Any]:
        """Create or update BRSR static details for an organization, keyed by reporting_period."""
        reporting_period = getattr(details, 'reporting_period', '') or ''
        existing = await self.get(org_id, "BRSR", reporting_period)
        
        details_dict = details.model_dump()
        now = datetime.now(timezone.utc).isoformat()
        
        if existing:
            update_data = {
                **details_dict,
                "updated_at": now,
            }
            query = {"org_id": org_id, "framework": "BRSR"}
            if reporting_period:
                query["reporting_period"] = reporting_period
            await self._static_collection.update_one(query, {"$set": update_data})
            return await self.get(org_id, "BRSR", reporting_period)
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "framework": "BRSR",
                **details_dict,
                "created_at": now,
                "updated_at": None,
            }
            await self._static_collection.insert_one(doc)
            doc.pop("_id", None)
            return doc

    async def update_brsr(
        self, 
        org_id: str, 
        update: BRSRDetailsUpdate
    ) -> Optional[Dict[str, Any]]:
        """Partial update BRSR static details."""
        existing = await self.get(org_id, "BRSR")
        if not existing:
            return None

        update_dict = update.model_dump(exclude_unset=True)
        if not update_dict:
            return existing

        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self._static_collection.update_one(
            {"org_id": org_id, "framework": "BRSR"},
            {"$set": update_dict}
        )
        
        return await self.get(org_id, "BRSR")

    async def delete(self, org_id: str, framework: str) -> bool:
        """Delete static framework details for an organization."""
        result = await self._static_collection.delete_one(
            {"org_id": org_id, "framework": framework}
        )
        return result.deleted_count > 0

    async def list_for_org(self, org_id: str) -> list:
        """List all static framework details for an organization."""
        cursor = self._static_collection.find({"org_id": org_id}, {"_id": 0})
        return await cursor.to_list(100)

    async def validate_brsr_complete(self, org_id: str) -> tuple[bool, list]:
        """Validate that all mandatory BRSR static fields are complete."""
        details = await self.get(org_id, "BRSR")
        if not details:
            return False, ["No BRSR details found"]

        missing = []
        mandatory_fields = [
            "cin", "listed_entity_name", "year_of_incorporation",
            "corporate_address", "city", "state", "country", "pincode",
            "email", "telephone", "website",
            "assurance_provider", "assurance_type",
            "stock_exchange", "reporting_boundary"
        ]

        for field in mandatory_fields:
            value = details.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(field)

        return len(missing) == 0, missing

    # =========================================================================
    # Yearly Data Methods (organization_framework_yearly_data)
    # =========================================================================

    async def get_yearly(
        self, 
        org_id: str, 
        framework: str, 
        reporting_year: str
    ) -> Optional[Dict[str, Any]]:
        """Get yearly framework data for a specific reporting year."""
        return await self._yearly_collection.find_one(
            {"org_id": org_id, "framework": framework, "reporting_year": reporting_year},
            {"_id": 0}
        )

    async def list_yearly(
        self, 
        org_id: str, 
        framework: str
    ) -> List[Dict[str, Any]]:
        """List all yearly data records for an org+framework."""
        cursor = self._yearly_collection.find(
            {"org_id": org_id, "framework": framework},
            {"_id": 0}
        ).sort("reporting_year", -1)
        return await cursor.to_list(100)

    async def create_or_update_yearly_brsr(
        self,
        org_id: str,
        reporting_year: str,
        data: BRSRYearlyDataCreate
    ) -> Dict[str, Any]:
        """Create or update BRSR yearly data for a reporting year."""
        existing = await self.get_yearly(org_id, "BRSR", reporting_year)
        
        data_dict = data.model_dump()
        now = datetime.now(timezone.utc).isoformat()
        
        if existing:
            update_data = {
                **data_dict,
                "updated_at": now,
            }
            await self._yearly_collection.update_one(
                {"org_id": org_id, "framework": "BRSR", "reporting_year": reporting_year},
                {"$set": update_data}
            )
            return await self.get_yearly(org_id, "BRSR", reporting_year)
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "framework": "BRSR",
                "reporting_year": reporting_year,
                **data_dict,
                "created_at": now,
                "updated_at": None,
            }
            await self._yearly_collection.insert_one(doc)
            doc.pop("_id", None)
            return doc

    async def update_yearly_brsr(
        self,
        org_id: str,
        reporting_year: str,
        update: BRSRYearlyDataUpdate
    ) -> Optional[Dict[str, Any]]:
        """Partial update BRSR yearly data."""
        existing = await self.get_yearly(org_id, "BRSR", reporting_year)
        if not existing:
            return None

        update_dict = update.model_dump(exclude_unset=True)
        if not update_dict:
            return existing

        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self._yearly_collection.update_one(
            {"org_id": org_id, "framework": "BRSR", "reporting_year": reporting_year},
            {"$set": update_dict}
        )
        
        return await self.get_yearly(org_id, "BRSR", reporting_year)

    async def delete_yearly(
        self, 
        org_id: str, 
        framework: str, 
        reporting_year: str
    ) -> bool:
        """Delete yearly data for a specific reporting year."""
        result = await self._yearly_collection.delete_one(
            {"org_id": org_id, "framework": framework, "reporting_year": reporting_year}
        )
        return result.deleted_count > 0

    async def get_available_years(
        self, 
        org_id: str, 
        framework: str
    ) -> List[str]:
        """Get list of reporting years with data for an org+framework."""
        cursor = self._yearly_collection.find(
            {"org_id": org_id, "framework": framework},
            {"_id": 0, "reporting_year": 1}
        ).sort("reporting_year", -1)
        docs = await cursor.to_list(100)
        return [doc["reporting_year"] for doc in docs]

    async def validate_yearly_brsr_complete(
        self, 
        org_id: str, 
        reporting_year: str
    ) -> tuple[bool, list]:
        """Validate that mandatory BRSR yearly fields are complete."""
        data = await self.get_yearly(org_id, "BRSR", reporting_year)
        if not data:
            return False, ["No yearly data found for this reporting year"]

        missing = []
        
        # Check business activities has at least one row
        if not data.get("business_activities"):
            missing.append("business_activities (at least 1 row required)")
        
        # Check products/services has at least one row
        if not data.get("products_services"):
            missing.append("products_services (at least 1 row required)")
        
        # Check plants/offices has at least one row
        if not data.get("plants_offices"):
            missing.append("plants_offices (at least 1 row required)")
        
        # Check markets served has at least one row
        if not data.get("markets_served"):
            missing.append("markets_served (at least 1 row required)")
        
        # Check employee details has some data
        emp_details = data.get("employee_worker_details", {})
        if not emp_details or all(v == 0 for k, v in emp_details.items() if isinstance(v, int)):
            missing.append("employee_worker_details (at least some employee/worker counts required)")
        
        return len(missing) == 0, missing


# Default service instance
framework_details_service = FrameworkDetailsService()
