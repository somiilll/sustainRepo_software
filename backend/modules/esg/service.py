"""
ESG Configuration Service

Business logic for ESG organization configuration management.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from shared.database.mongo import db
from modules.esg.contracts import (
    ESGOrgConfigCreate,
    ESGOrgConfigUpdate,
    ESGOrgConfigResponse,
    VALID_SCOPES,
    VALID_FRAMEWORKS,
    VALID_MODULES,
)


class ESGConfigService:
    """Service for managing ESG organization configurations."""

    COLLECTION_NAME = "esg_org_configs"

    def __init__(self, database=None):
        self._db = database or db
        self._collection = self._db[self.COLLECTION_NAME]

    async def get_by_org_id(self, org_id: str) -> Optional[Dict[str, Any]]:
        """Get ESG config for an organization."""
        return await self._collection.find_one({"org_id": org_id}, {"_id": 0})

    async def create(self, config: ESGOrgConfigCreate) -> Dict[str, Any]:
        """Create a new ESG config for an organization."""
        # Validate values
        self._validate_scopes(config.enabled_scopes)
        self._validate_frameworks(config.enabled_frameworks)
        self._validate_modules(config.enabled_modules)

        # Check if config already exists for this org
        existing = await self.get_by_org_id(config.org_id)
        if existing:
            raise ValueError(f"ESG config already exists for organization {config.org_id}")

        config_dict = {
            "id": str(uuid.uuid4()),
            "org_id": config.org_id,
            "enabled_scopes": config.enabled_scopes,
            "approval_workflow_enabled": config.approval_workflow_enabled,
            "enabled_frameworks": config.enabled_frameworks,
            "enabled_modules": config.enabled_modules,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": None,
        }

        await self._collection.insert_one(config_dict)
        return config_dict

    async def update(self, org_id: str, update: ESGOrgConfigUpdate) -> Optional[Dict[str, Any]]:
        """Update ESG config for an organization."""
        existing = await self.get_by_org_id(org_id)
        if not existing:
            return None

        update_dict = update.model_dump(exclude_unset=True)
        
        # Validate if provided
        if "enabled_scopes" in update_dict:
            self._validate_scopes(update_dict["enabled_scopes"])
        if "enabled_frameworks" in update_dict:
            self._validate_frameworks(update_dict["enabled_frameworks"])
        if "enabled_modules" in update_dict:
            self._validate_modules(update_dict["enabled_modules"])

        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

        await self._collection.update_one(
            {"org_id": org_id},
            {"$set": update_dict}
        )

        return await self.get_by_org_id(org_id)

    async def delete(self, org_id: str) -> bool:
        """Delete ESG config for an organization."""
        result = await self._collection.delete_one({"org_id": org_id})
        return result.deleted_count > 0

    async def list_all(self) -> List[Dict[str, Any]]:
        """List all ESG configs."""
        return await self._collection.find({}, {"_id": 0}).to_list(1000)

    async def get_enabled_frameworks(self, org_id: str) -> List[str]:
        """Get list of enabled frameworks for an organization."""
        config = await self.get_by_org_id(org_id)
        if not config:
            return []
        return config.get("enabled_frameworks", [])

    async def get_enabled_modules(self, org_id: str) -> List[str]:
        """Get list of enabled modules for an organization."""
        config = await self.get_by_org_id(org_id)
        if not config:
            return []
        return config.get("enabled_modules", [])

    async def is_framework_enabled(self, org_id: str, framework: str) -> bool:
        """Check if a specific framework is enabled for an organization."""
        frameworks = await self.get_enabled_frameworks(org_id)
        return framework in frameworks

    async def is_module_enabled(self, org_id: str, module: str) -> bool:
        """Check if a specific module is enabled for an organization."""
        modules = await self.get_enabled_modules(org_id)
        return module in modules

    def _validate_scopes(self, scopes: List[str]) -> None:
        """Validate scope values."""
        invalid = [s for s in scopes if s not in VALID_SCOPES]
        if invalid:
            raise ValueError(f"Invalid scopes: {invalid}. Valid values: {VALID_SCOPES}")

    def _validate_frameworks(self, frameworks: List[str]) -> None:
        """Validate framework values."""
        invalid = [f for f in frameworks if f not in VALID_FRAMEWORKS]
        if invalid:
            raise ValueError(f"Invalid frameworks: {invalid}. Valid values: {VALID_FRAMEWORKS}")

    def _validate_modules(self, modules: List[str]) -> None:
        """Validate module values."""
        invalid = [m for m in modules if m not in VALID_MODULES]
        if invalid:
            raise ValueError(f"Invalid modules: {invalid}. Valid values: {VALID_MODULES}")


# Default service instance
esg_config_service = ESGConfigService()
