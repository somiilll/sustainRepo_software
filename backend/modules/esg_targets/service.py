"""
ESG Targets Module - Service Layer

Business logic for ESG targets with version history support.
Uses the shared version_utils for consistent diff tracking.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid

from shared.database.mongo import db
from modules.esg_records.version_utils import compare_versions, get_changed_field_paths, format_field_display_name
from .contracts import (
    ESGTargetCreate, ESGTargetUpdate, ESGTargetResponse,
    TargetStatus, ScopeType
)


class ESGTargetsService:
    """Service for managing ESG targets with versioning."""
    
    COLLECTION = "esg_targets"
    VERSIONS_COLLECTION = "esg_target_versions"
    
    # =========================================================================
    # CRUD Operations
    # =========================================================================
    
    async def create_target(
        self,
        org_id: str,
        data: ESGTargetCreate,
        user_id: str,
        user_name: str = None
    ) -> Dict[str, Any]:
        """Create a new ESG target."""
        now = datetime.now(timezone.utc).isoformat()
        
        # Validate facility scope
        if data.scope_type == ScopeType.FACILITY and not data.facility_ids:
            raise ValueError("facility_ids required when scope_type is FACILITY")
        
        target = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            
            "target_name": data.target_name.strip(),
            "description": data.description,
            
            "section": data.section,
            "category": data.category,
            "subcategory": data.subcategory,
            "sub_subcategory": data.sub_subcategory,
            "metric_key": data.metric_key,
            "metric_label": data.metric_label,
            
            "scope_type": data.scope_type.value,
            "facility_ids": data.facility_ids if data.scope_type == ScopeType.FACILITY else None,
            
            "reporting_type": data.reporting_type,
            "reporting_period": data.reporting_period,
            
            "target_type": data.target_type.value,
            "goal_type": data.goal_type.value,
            "target_value": data.target_value,
            "minimum_value": data.minimum_value,
            "maximum_value": data.maximum_value,
            "unit": data.unit,
            
            "baseline": data.baseline.dict() if data.baseline else None,
            
            "tracking_mode": data.tracking_mode.value,
            "tracking_values": data.tracking_values,
            "start_period": data.start_period,
            "end_period": data.end_period,
            "trajectory": data.trajectory.value,
            
            "thresholds": data.thresholds.dict() if data.thresholds else None,
            
            "status": data.status.value,
            
            "metadata": data.metadata,
            
            "version": 1,
            "created_by": user_id,
            "created_by_name": user_name,
            "created_at": now,
            "updated_by": None,
            "updated_by_name": None,
            "updated_at": None,
        }
        
        await db[self.COLLECTION].insert_one(target)
        
        # Create initial version snapshot
        await self._create_version_snapshot(
            target_id=target["id"],
            version=1,
            snapshot=target,
            changed_fields=[],
            user_id=user_id,
            user_name=user_name
        )
        
        return self._sanitize(target)
    
    async def get_target(
        self,
        target_id: str,
        org_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a single target by ID."""
        target = await db[self.COLLECTION].find_one(
            {"id": target_id, "organization_id": org_id},
            {"_id": 0}
        )
        if target:
            target = await self._populate_facility_names(target)
        return target
    
    async def list_targets(
        self,
        org_id: str,
        section: Optional[str] = None,
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        facility_id: Optional[str] = None,
        reporting_period: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List targets with optional filters."""
        query = {"organization_id": org_id}
        
        if section:
            query["section"] = section
        if category:
            query["category"] = category
        if subcategory:
            query["subcategory"] = subcategory
        if facility_id:
            query["facility_ids"] = facility_id
        if reporting_period:
            query["reporting_period"] = reporting_period
        if status:
            query["status"] = status
        if search:
            query["$or"] = [
                {"target_name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"metric_label": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = db[self.COLLECTION].find(query, {"_id": 0}).sort("created_at", -1)
        targets = await cursor.to_list(1000)
        
        # Populate facility names
        for target in targets:
            target = await self._populate_facility_names(target)
        
        return targets
    
    async def update_target(
        self,
        target_id: str,
        org_id: str,
        data: ESGTargetUpdate,
        user_id: str,
        user_name: str = None
    ) -> Optional[Dict[str, Any]]:
        """Update an existing target."""
        current = await db[self.COLLECTION].find_one(
            {"id": target_id, "organization_id": org_id},
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
                else:
                    update_data[key] = value
        
        # Always update audit fields
        update_data["version"] = new_version
        update_data["updated_by"] = user_id
        update_data["updated_by_name"] = user_name
        update_data["updated_at"] = now
        
        await db[self.COLLECTION].update_one(
            {"id": target_id},
            {"$set": update_data}
        )
        
        updated = await db[self.COLLECTION].find_one({"id": target_id}, {"_id": 0})
        
        # Create version snapshot with hierarchical field paths
        field_changes = compare_versions(current, updated)
        changed_field_paths = [c["field"] for c in field_changes]
        
        await self._create_version_snapshot(
            target_id=target_id,
            version=new_version,
            snapshot=updated,
            changed_fields=changed_field_paths,
            user_id=user_id,
            user_name=user_name
        )
        
        return self._sanitize(updated)
    
    async def delete_target(
        self,
        target_id: str,
        org_id: str
    ) -> bool:
        """Delete a target and its version history."""
        result = await db[self.COLLECTION].delete_one(
            {"id": target_id, "organization_id": org_id}
        )
        if result.deleted_count > 0:
            # Also delete version history
            await db[self.VERSIONS_COLLECTION].delete_many({"target_id": target_id})
            return True
        return False
    
    async def duplicate_target(
        self,
        target_id: str,
        org_id: str,
        user_id: str,
        user_name: str = None
    ) -> Optional[Dict[str, Any]]:
        """Duplicate a target, resetting ID, version, audit fields, and status."""
        source = await db[self.COLLECTION].find_one(
            {"id": target_id, "organization_id": org_id},
            {"_id": 0}
        )
        if not source:
            return None
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Copy everything except specified fields
        new_target = {**source}
        new_target["id"] = str(uuid.uuid4())
        new_target["target_name"] = f"{source['target_name']} (Copy)"
        new_target["status"] = TargetStatus.DRAFT.value
        new_target["version"] = 1
        new_target["created_by"] = user_id
        new_target["created_by_name"] = user_name
        new_target["created_at"] = now
        new_target["updated_by"] = None
        new_target["updated_by_name"] = None
        new_target["updated_at"] = None
        
        await db[self.COLLECTION].insert_one(new_target)
        
        # Create initial version for duplicate
        await self._create_version_snapshot(
            target_id=new_target["id"],
            version=1,
            snapshot=new_target,
            changed_fields=[],
            user_id=user_id,
            user_name=user_name
        )
        
        return self._sanitize(new_target)
    
    # =========================================================================
    # Version History
    # =========================================================================
    
    async def _create_version_snapshot(
        self,
        target_id: str,
        version: int,
        snapshot: Dict[str, Any],
        changed_fields: List[str],
        user_id: str,
        user_name: str = None
    ):
        """Create a version snapshot for audit trail."""
        now = datetime.now(timezone.utc).isoformat()
        
        version_doc = {
            "id": str(uuid.uuid4()),
            "target_id": target_id,
            "version": version,
            "snapshot": snapshot,
            "changed_fields": changed_fields,  # Hierarchical paths
            "created_by": user_id,
            "created_by_name": user_name,
            "created_at": now
        }
        
        await db[self.VERSIONS_COLLECTION].insert_one(version_doc)
    
    async def get_target_versions(
        self,
        target_id: str,
        org_id: str
    ) -> List[Dict[str, Any]]:
        """Get version history for a target with computed field diffs."""
        # Verify target belongs to org
        target = await db[self.COLLECTION].find_one(
            {"id": target_id, "organization_id": org_id},
            {"_id": 0, "id": 1}
        )
        if not target:
            return []
        
        cursor = db[self.VERSIONS_COLLECTION].find(
            {"target_id": target_id},
            {"_id": 0}
        ).sort("version", -1)
        versions = await cursor.to_list(100)
        
        # Process versions - compute field diffs
        for i, v in enumerate(versions):
            if "snapshot" in v and isinstance(v["snapshot"], dict):
                v["snapshot"].pop("_id", None)
            
            v["change_type"] = "created" if v.get("version") == 1 else "updated"
            
            # Compute field diffs from snapshots
            if v.get("version", 1) > 1 and i + 1 < len(versions):
                prev_snapshot = versions[i + 1].get("snapshot", {})
                curr_snapshot = v.get("snapshot", {})
                changes = compare_versions(prev_snapshot, curr_snapshot)
                v["field_diffs"] = [
                    {
                        "field": c["field"],
                        "display_name": format_field_display_name(c["field"]),
                        "old_value": c["old"],
                        "new_value": c["new"]
                    }
                    for c in changes
                ]
            else:
                v["field_diffs"] = []
        
        return versions
    
    # =========================================================================
    # Helpers
    # =========================================================================
    
    async def _populate_facility_names(self, target: Dict[str, Any]) -> Dict[str, Any]:
        """Populate facility names from IDs."""
        if target.get("facility_ids"):
            facilities = await db.facilities.find(
                {"id": {"$in": target["facility_ids"]}},
                {"_id": 0, "id": 1, "name": 1}
            ).to_list(100)
            target["facility_names"] = [f.get("name", f.get("id")) for f in facilities]
        return target
    
    def _sanitize(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Remove MongoDB _id from document."""
        if doc and "_id" in doc:
            del doc["_id"]
        return doc


# Singleton instance
esg_targets_service = ESGTargetsService()
