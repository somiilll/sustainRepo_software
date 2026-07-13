"""
ESG KPI Definitions Module - Service Layer

Business logic for KPI definitions with version history support.
Super Admin only - manages reusable metric configurations.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid
import re

from shared.database.mongo import db
from .contracts import (
    KPIDefinitionCreate, KPIDefinitionUpdate, KPIStatus
)


class ESGKPIDefinitionsService:
    """Service for managing ESG KPI definitions."""
    
    COLLECTION = "esg_kpi_definitions"
    
    # =========================================================================
    # CRUD Operations
    # =========================================================================
    
    async def create_kpi_definition(
        self,
        data: KPIDefinitionCreate,
        user_id: str,
        user_name: str = None
    ) -> Dict[str, Any]:
        """Create a new KPI definition."""
        now = datetime.now(timezone.utc).isoformat()
        
        # Auto-generate metric_code if not provided
        metric_code = data.metric_code
        if not metric_code:
            metric_code = await self._generate_metric_code(data.metric_name, data.section)
        else:
            # Validate uniqueness of provided metric_code
            existing = await db[self.COLLECTION].find_one(
                {"metric_code": metric_code},
                {"_id": 0, "id": 1}
            )
            if existing:
                raise ValueError(f"metric_code '{metric_code}' already exists")
        
        kpi_def = {
            "id": str(uuid.uuid4()),
            
            "metric_name": data.metric_name.strip(),
            "short_name": data.short_name,
            "metric_code": metric_code,
            "description": data.description,
            
            "section": data.section,
            "category_name": data.category_name,
            "subcategory": data.subcategory,
            "sub_subcategory": data.sub_subcategory,
            
            "source_type": data.source_type.value,
            "source_config": data.source_config,
            
            "aggregation_type": data.aggregation_type.value,
            "value_field": data.value_field,
            
            "filters": [f.dict() for f in data.filters] if data.filters else [],
            "dimensions": data.dimensions or [],
            "supported_scopes": data.supported_scopes or ["organization", "facility"],
            
            "output_type": data.output_type.value,
            "unit_config": data.unit_config.dict() if data.unit_config else None,
            
            "formula_config": data.formula_config.dict() if data.formula_config else None,
            "validation_rules": [v.dict() for v in data.validation_rules] if data.validation_rules else [],
            
            "display_config": data.display_config.dict() if data.display_config else None,
            "visibility": data.visibility.dict() if data.visibility else {
                "dashboard_enabled": True,
                "reports_enabled": True,
                "tracking_enabled": True,
                "target_enabled": True,
                "analytics_enabled": True
            },
            
            "status": data.status.value,
            
            "tags": data.tags or [],
            "metadata": data.metadata,
            
            "version": 1,
            "created_by": user_id,
            "created_by_name": user_name,
            "created_at": now,
            "updated_by": None,
            "updated_by_name": None,
            "updated_at": None,
        }
        
        await db[self.COLLECTION].insert_one(kpi_def)
        
        return self._sanitize(kpi_def)
    
    async def get_kpi_definition(
        self,
        kpi_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a single KPI definition by ID."""
        kpi_def = await db[self.COLLECTION].find_one(
            {"id": kpi_id},
            {"_id": 0}
        )
        if kpi_def:
            kpi_def = await self._populate_reference_counts(kpi_def)
        return kpi_def
    
    async def get_kpi_by_code(
        self,
        metric_code: str
    ) -> Optional[Dict[str, Any]]:
        """Get a KPI definition by metric_code."""
        kpi_def = await db[self.COLLECTION].find_one(
            {"metric_code": metric_code},
            {"_id": 0}
        )
        return kpi_def
    
    async def list_kpi_definitions(
        self,
        section: Optional[str] = None,
        category_name: Optional[str] = None,
        status: Optional[str] = None,
        source_type: Optional[str] = None,
        search: Optional[str] = None,
        tags: Optional[List[str]] = None,
        include_archived: bool = False
    ) -> List[Dict[str, Any]]:
        """List KPI definitions with optional filters."""
        query = {}
        
        if section:
            query["section"] = section
        if category_name:
            query["category_name"] = category_name
        if status:
            query["status"] = status
        elif not include_archived:
            query["status"] = {"$ne": KPIStatus.ARCHIVED.value}
        if source_type:
            query["source_type"] = source_type
        if tags:
            query["tags"] = {"$in": tags}
        if search:
            from shared.security import safe_regex
            _s = safe_regex(search)
            query["$or"] = [
                {"metric_name": {"$regex": _s, "$options": "i"}},
                {"short_name": {"$regex": _s, "$options": "i"}},
                {"metric_code": {"$regex": _s, "$options": "i"}},
                {"description": {"$regex": _s, "$options": "i"}}
            ]
        
        cursor = db[self.COLLECTION].find(query, {"_id": 0}).sort([
            ("section", 1),
            ("category_name", 1),
            ("created_at", -1)
        ])
        kpi_defs = await cursor.to_list(1000)
        
        # Populate reference counts
        for kpi_def in kpi_defs:
            kpi_def = await self._populate_reference_counts(kpi_def)
        
        return kpi_defs
    
    async def update_kpi_definition(
        self,
        kpi_id: str,
        data: KPIDefinitionUpdate,
        user_id: str,
        user_name: str = None
    ) -> Optional[Dict[str, Any]]:
        """Update an existing KPI definition."""
        current = await db[self.COLLECTION].find_one(
            {"id": kpi_id},
            {"_id": 0}
        )
        if not current:
            return None
        
        now = datetime.now(timezone.utc).isoformat()
        new_version = current.get("version", 1) + 1
        
        # Build update dict from non-None fields
        update_data = {}
        update_dict = data.dict(exclude_unset=True)
        
        for key, value in update_dict.items():
            if value is not None:
                # Handle enum values
                if hasattr(value, 'value'):
                    update_data[key] = value.value
                elif hasattr(value, 'dict'):
                    update_data[key] = value.dict()
                elif isinstance(value, list):
                    # Handle list of pydantic models
                    update_data[key] = [
                        v.dict() if hasattr(v, 'dict') else v
                        for v in value
                    ]
                else:
                    update_data[key] = value
        
        # Always update audit fields
        update_data["version"] = new_version
        update_data["updated_by"] = user_id
        update_data["updated_by_name"] = user_name
        update_data["updated_at"] = now
        
        await db[self.COLLECTION].update_one(
            {"id": kpi_id},
            {"$set": update_data}
        )
        
        updated = await db[self.COLLECTION].find_one({"id": kpi_id}, {"_id": 0})
        return self._sanitize(updated)
    
    async def archive_kpi_definition(
        self,
        kpi_id: str,
        user_id: str,
        user_name: str = None
    ) -> Optional[Dict[str, Any]]:
        """Archive a KPI definition. Validates no active references."""
        current = await db[self.COLLECTION].find_one(
            {"id": kpi_id},
            {"_id": 0}
        )
        if not current:
            return None
        
        # Check for active references
        ref_counts = await self._get_reference_counts(kpi_id)
        if ref_counts["target_count"] > 0:
            raise ValueError(
                f"Cannot archive: {ref_counts['target_count']} active target(s) reference this KPI"
            )
        
        now = datetime.now(timezone.utc).isoformat()
        
        await db[self.COLLECTION].update_one(
            {"id": kpi_id},
            {"$set": {
                "status": KPIStatus.ARCHIVED.value,
                "updated_by": user_id,
                "updated_by_name": user_name,
                "updated_at": now
            }}
        )
        
        updated = await db[self.COLLECTION].find_one({"id": kpi_id}, {"_id": 0})
        return self._sanitize(updated)
    
    async def delete_kpi_definition(
        self,
        kpi_id: str
    ) -> bool:
        """Hard delete a KPI definition. Use with caution - prefer archive."""
        # Check for references
        ref_counts = await self._get_reference_counts(kpi_id)
        if ref_counts["target_count"] > 0 or ref_counts["dashboard_count"] > 0:
            raise ValueError(
                f"Cannot delete: KPI has active references "
                f"(targets: {ref_counts['target_count']}, dashboards: {ref_counts['dashboard_count']})"
            )
        
        result = await db[self.COLLECTION].delete_one({"id": kpi_id})
        return result.deleted_count > 0
    
    async def duplicate_kpi_definition(
        self,
        kpi_id: str,
        user_id: str,
        user_name: str = None
    ) -> Optional[Dict[str, Any]]:
        """Duplicate a KPI definition, resetting ID, version, and status."""
        source = await db[self.COLLECTION].find_one(
            {"id": kpi_id},
            {"_id": 0}
        )
        if not source:
            return None
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Generate new metric_code
        new_metric_code = await self._generate_metric_code(
            f"{source['metric_name']} (Copy)",
            source.get("section", "environment")
        )
        
        # Copy everything except specified fields
        new_kpi = {**source}
        new_kpi["id"] = str(uuid.uuid4())
        new_kpi["metric_name"] = f"{source['metric_name']} (Copy)"
        new_kpi["metric_code"] = new_metric_code
        new_kpi["status"] = KPIStatus.DRAFT.value
        new_kpi["version"] = 1
        new_kpi["created_by"] = user_id
        new_kpi["created_by_name"] = user_name
        new_kpi["created_at"] = now
        new_kpi["updated_by"] = None
        new_kpi["updated_by_name"] = None
        new_kpi["updated_at"] = None
        
        await db[self.COLLECTION].insert_one(new_kpi)
        
        return self._sanitize(new_kpi)
    
    # =========================================================================
    # Lookup Endpoints (for UI dropdowns)
    # =========================================================================
    
    async def get_sections_summary(self) -> List[Dict[str, Any]]:
        """Get summary of KPIs grouped by section."""
        pipeline = [
            {"$match": {"status": {"$ne": KPIStatus.ARCHIVED.value}}},
            {"$group": {
                "_id": "$section",
                "count": {"$sum": 1},
                "categories": {"$addToSet": "$category_name"}
            }},
            {"$project": {
                "_id": 0,
                "section": "$_id",
                "count": 1,
                "categories": 1
            }}
        ]
        
        results = await db[self.COLLECTION].aggregate(pipeline).to_list(100)
        return results
    
    async def get_unique_tags(self) -> List[str]:
        """Get all unique tags across KPI definitions."""
        pipeline = [
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags"}},
            {"$sort": {"_id": 1}}
        ]
        
        results = await db[self.COLLECTION].aggregate(pipeline).to_list(500)
        return [r["_id"] for r in results if r["_id"]]
    
    async def get_kpis_for_targets(
        self,
        section: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get KPIs available for target creation (target_enabled=True, status=active)."""
        query = {
            "status": KPIStatus.ACTIVE.value,
            "visibility.target_enabled": True
        }
        if section:
            query["section"] = section
        
        cursor = db[self.COLLECTION].find(
            query,
            {
                "_id": 0,
                "id": 1,
                "metric_name": 1,
                "metric_code": 1,
                "section": 1,
                "category_name": 1,
                "subcategory": 1,
                "unit_config": 1,
                "output_type": 1
            }
        ).sort([("section", 1), ("category_name", 1), ("metric_name", 1)])
        
        return await cursor.to_list(500)
    
    # =========================================================================
    # Helpers
    # =========================================================================
    
    async def _generate_metric_code(self, metric_name: str, section: str) -> str:
        """Generate a unique metric_code from metric_name and section."""
        # Create base code: section prefix + sanitized name
        section_prefix = {
            "environment": "ENV",
            "social": "SOC",
            "governance": "GOV"
        }.get(section.lower(), "ESG")
        
        # Sanitize name: uppercase, remove special chars, replace spaces with underscores
        sanitized = re.sub(r'[^A-Z0-9\s]', '', metric_name.upper())
        sanitized = re.sub(r'\s+', '_', sanitized.strip())
        
        # Truncate if too long
        if len(sanitized) > 30:
            sanitized = sanitized[:30]
        
        base_code = f"{section_prefix}_{sanitized}"
        
        # Check for uniqueness and add suffix if needed
        code = base_code
        counter = 1
        while True:
            existing = await db[self.COLLECTION].find_one(
                {"metric_code": code},
                {"_id": 0, "id": 1}
            )
            if not existing:
                break
            code = f"{base_code}_{counter}"
            counter += 1
        
        return code
    
    async def _get_reference_counts(self, kpi_id: str) -> Dict[str, int]:
        """Get count of references to this KPI from targets, dashboards, etc."""
        kpi = await db[self.COLLECTION].find_one({"id": kpi_id}, {"_id": 0, "metric_code": 1})
        if not kpi:
            return {"target_count": 0, "dashboard_count": 0}
        
        metric_code = kpi.get("metric_code")
        
        # Count targets referencing this KPI
        target_count = await db.esg_targets.count_documents({
            "metric_key": metric_code,
            "status": {"$nin": ["cancelled", "archived"]}
        })
        
        # Future: count dashboard widgets, report definitions, etc.
        dashboard_count = 0
        
        return {
            "target_count": target_count,
            "dashboard_count": dashboard_count
        }
    
    async def _populate_reference_counts(self, kpi_def: Dict[str, Any]) -> Dict[str, Any]:
        """Populate reference counts for a KPI definition."""
        counts = await self._get_reference_counts(kpi_def["id"])
        kpi_def["target_count"] = counts["target_count"]
        kpi_def["dashboard_count"] = counts["dashboard_count"]
        return kpi_def
    
    def _sanitize(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Remove MongoDB _id from document."""
        if doc and "_id" in doc:
            del doc["_id"]
        return doc


# Singleton instance
esg_kpi_definitions_service = ESGKPIDefinitionsService()
