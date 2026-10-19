"""
Category Configuration Service

Provides category-level settings including allowed reporting frequencies.
Backward compatible - returns all frequencies if no specific config exists.
"""

from typing import Optional, List, Dict, Any
from shared.database.mongo import db

# Default frequencies available for all categories (backward compatibility)
ALL_FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"]

# Default frequency configs per category (can be overridden in DB)
DEFAULT_CATEGORY_CONFIGS = {
    # Environment categories - typically monthly or quarterly
    "Water": {
        "allowed_frequencies": ["monthly", "quarterly", "yearly"],
        "default_frequency": "monthly"
    },
    "Energy": {
        "allowed_frequencies": ["monthly", "quarterly", "yearly"],
        "default_frequency": "monthly"
    },
    "Waste": {
        "allowed_frequencies": ["monthly", "quarterly", "yearly"],
        "default_frequency": "monthly"
    },
    "GHG Emissions": {
        "allowed_frequencies": ["monthly", "quarterly", "yearly"],
        "default_frequency": "monthly"
    },
    
    # Social categories - often quarterly or yearly
    "Employees/Worker": {
        "allowed_frequencies": ["quarterly", "half_yearly", "yearly"],
        "default_frequency": "quarterly"
    },
    "Health & Safety": {
        "allowed_frequencies": ["monthly", "quarterly", "yearly"],
        "default_frequency": "monthly"
    },
    "Training": {
        "allowed_frequencies": ["quarterly", "yearly"],
        "default_frequency": "quarterly"
    },
    "Complaints": {
        "allowed_frequencies": ["monthly", "quarterly"],
        "default_frequency": "monthly"
    },
    
    # Governance categories - typically quarterly or yearly
    "Anti-corruption": {
        "allowed_frequencies": ["quarterly", "yearly"],
        "default_frequency": "yearly"
    },
    "Board Composition": {
        "allowed_frequencies": ["yearly"],
        "default_frequency": "yearly"
    },
    "Ethics & Compliance": {
        "allowed_frequencies": ["quarterly", "yearly"],
        "default_frequency": "quarterly"
    },
}


class CategoryConfigService:
    """Service for managing category-level configurations."""
    
    COLLECTION_NAME = "category_frequency_configs"
    
    def __init__(self, database=None):
        self._db = database or db
        self._collection = self._db[self.COLLECTION_NAME]
    
    async def get_frequency_config(
        self, 
        category: str, 
        subcategory: Optional[str] = None,
        org_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get frequency configuration for a category/subcategory.
        
        Priority:
        1. Org-specific config (if org_id provided)
        2. Subcategory-specific config
        3. Category-level config
        4. Default hardcoded config
        5. All frequencies (ultimate fallback)
        """
        
        # Try org-specific config first
        if org_id:
            config = await self._collection.find_one({
                "org_id": org_id,
                "category": category,
                "subcategory": subcategory
            }, {"_id": 0})
            if config:
                return self._format_response(config)
        
        # Try subcategory-specific config (global)
        if subcategory:
            config = await self._collection.find_one({
                "org_id": {"$exists": False},
                "category": category,
                "subcategory": subcategory
            }, {"_id": 0})
            if config:
                return self._format_response(config)
        
        # Try category-level config (global)
        config = await self._collection.find_one({
            "org_id": {"$exists": False},
            "category": category,
            "subcategory": {"$in": [None, ""]}
        }, {"_id": 0})
        if config:
            return self._format_response(config)
        
        # Use default hardcoded config
        if category in DEFAULT_CATEGORY_CONFIGS:
            return {
                "category": category,
                "subcategory": subcategory,
                "allowed_frequencies": DEFAULT_CATEGORY_CONFIGS[category]["allowed_frequencies"],
                "default_frequency": DEFAULT_CATEGORY_CONFIGS[category]["default_frequency"],
                "source": "default"
            }
        
        # Ultimate fallback - all frequencies allowed
        return {
            "category": category,
            "subcategory": subcategory,
            "allowed_frequencies": ALL_FREQUENCIES,
            "default_frequency": "monthly",
            "source": "fallback"
        }
    
    async def set_frequency_config(
        self,
        category: str,
        allowed_frequencies: List[str],
        default_frequency: str,
        subcategory: Optional[str] = None,
        org_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Set frequency configuration for a category/subcategory.
        Can be global or org-specific.
        """
        # Validate frequencies
        invalid = [f for f in allowed_frequencies if f not in ALL_FREQUENCIES]
        if invalid:
            raise ValueError(f"Invalid frequencies: {invalid}. Valid: {ALL_FREQUENCIES}")
        
        if default_frequency not in allowed_frequencies:
            raise ValueError(f"Default frequency must be in allowed_frequencies")
        
        # Build query for upsert
        query = {"category": category}
        if subcategory:
            query["subcategory"] = subcategory
        else:
            query["subcategory"] = None
        
        if org_id:
            query["org_id"] = org_id
        
        # Upsert the config
        config = {
            **query,
            "allowed_frequencies": allowed_frequencies,
            "default_frequency": default_frequency
        }
        
        await self._collection.update_one(
            query,
            {"$set": config},
            upsert=True
        )
        
        return self._format_response(config)
    
    async def list_configs(self, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all frequency configs, optionally filtered by org."""
        query = {}
        if org_id:
            query["org_id"] = org_id
        
        configs = await self._collection.find(query, {"_id": 0}).to_list(500)
        return configs
    
    async def delete_frequency_config(
        self,
        category: str,
        subcategory: Optional[str] = None,
        org_id: Optional[str] = None
    ) -> bool:
        """
        Delete a frequency configuration.
        
        Returns True if deleted, False if not found.
        """
        query = {"category": category}
        
        if subcategory:
            query["subcategory"] = subcategory
        else:
            query["subcategory"] = None
        
        if org_id:
            query["org_id"] = org_id
        else:
            query["org_id"] = {"$exists": False}
        
        result = await self._collection.delete_one(query)
        return result.deleted_count > 0
    
    def _format_response(self, config: Dict) -> Dict[str, Any]:
        """Format config response."""
        return {
            "category": config.get("category"),
            "subcategory": config.get("subcategory"),
            "allowed_frequencies": config.get("allowed_frequencies", ALL_FREQUENCIES),
            "default_frequency": config.get("default_frequency", "monthly"),
            "org_id": config.get("org_id"),
            "source": "database" if config.get("org_id") or config.get("category") else "default"
        }


# Default service instance
category_config_service = CategoryConfigService()
