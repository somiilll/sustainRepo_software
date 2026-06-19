"""
ESG Records Module - Service Layer

Handles business logic for ESG records with versioning support.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
from shared.database.mongo import db

from .contracts import (
    ESG_SECTION, REPORTING_TYPE, CreateRecordRequest, 
    UpdateRecordRequest, RecordListFilters
)


class ESGRecordsService:
    """Service for managing ESG records with versioning."""
    
    def __init__(self):
        self._categories = db["esg_record_categories"]
        self._field_configs = db["esg_record_field_configs"]
    
    def _get_records_collection(self, section: ESG_SECTION):
        """Get the records collection for a section."""
        return db[f"{section}_records"]
    
    def _get_versions_collection(self, section: ESG_SECTION):
        """Get the versions collection for a section."""
        return db[f"{section}_record_versions"]
    
    # =========================================================================
    # Category Management
    # =========================================================================
    
    async def list_categories(
        self,
        section: ESG_SECTION,
        framework: Optional[str] = None,
        include_inactive: bool = False
    ) -> List[Dict[str, Any]]:
        """List categories for a section."""
        query = {"section": section}
        if not include_inactive:
            query["is_active"] = True
        if framework:
            query["frameworks"] = framework
        
        cursor = self._categories.find(query, {"_id": 0}).sort("order", 1)
        return await cursor.to_list(None)
    
    async def get_category(self, category_id: str) -> Optional[Dict[str, Any]]:
        """Get a single category config."""
        return await self._categories.find_one(
            {"id": category_id}, 
            {"_id": 0}
        )
    
    async def get_category_by_name(
        self, 
        section: ESG_SECTION, 
        category: str, 
        subcategory: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Get category by name."""
        query = {"section": section, "category": category}
        if subcategory:
            query["subcategory"] = subcategory
        return await self._categories.find_one(query, {"_id": 0})
    
    # =========================================================================
    # Record CRUD
    # =========================================================================
    
    async def create_record(
        self,
        section: ESG_SECTION,
        org_id: str,
        user_id: str,
        data: CreateRecordRequest
    ) -> Dict[str, Any]:
        """Create a new ESG record."""
        collection = self._get_records_collection(section)
        now = datetime.now(timezone.utc).isoformat()
        
        record = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "facility_id": data.facility_id,
            "record_level": data.record_level,
            "section": section,
            "category_id": data.category_id,
            "category": data.category,
            "subcategory": data.subcategory,
            "sub_subcategory": data.sub_subcategory,
            "frameworks": data.frameworks,
            "reporting_period": data.reporting_period.model_dump(),
            "field_values": data.field_values,
            "evidence_files": data.evidence_files,
            "source_of_information": data.source_of_information,
            "notes": data.notes,
            "version": 1,
            "is_current": True,
            "created_by": user_id,
            "created_at": now,
            "updated_by": None,
            "updated_at": None
        }
        
        await collection.insert_one(record)
        
        # Create initial version snapshot
        await self._create_version_snapshot(
            section=section,
            record_id=record["id"],
            version=1,
            snapshot=record,
            changed_fields=[],
            user_id=user_id
        )
        
        # Remove MongoDB _id before returning
        record.pop("_id", None)
        return record
    
    async def update_record(
        self,
        section: ESG_SECTION,
        record_id: str,
        user_id: str,
        data: UpdateRecordRequest
    ) -> Optional[Dict[str, Any]]:
        """Update a record (creates new version)."""
        collection = self._get_records_collection(section)
        now = datetime.now(timezone.utc).isoformat()
        
        # Get current record
        current = await collection.find_one(
            {"id": record_id, "is_current": True},
            {"_id": 0}
        )
        if not current:
            return None
        
        # Track changed fields
        changed_fields = []
        update_data = {}
        
        if data.record_level is not None:
            update_data["record_level"] = data.record_level
            changed_fields.append("record_level")
        
        if data.facility_id is not None:
            update_data["facility_id"] = data.facility_id
            changed_fields.append("facility_id")
        
        if data.reporting_period is not None:
            update_data["reporting_period"] = data.reporting_period.model_dump()
            changed_fields.append("reporting_period")
        
        if data.field_values is not None:
            update_data["field_values"] = data.field_values
            changed_fields.append("field_values")
        
        if data.evidence_files is not None:
            update_data["evidence_files"] = data.evidence_files
            changed_fields.append("evidence_files")
        
        if data.source_of_information is not None:
            update_data["source_of_information"] = data.source_of_information
            changed_fields.append("source_of_information")
        
        if data.notes is not None:
            update_data["notes"] = data.notes
            changed_fields.append("notes")
        
        # Increment version
        new_version = current["version"] + 1
        update_data["version"] = new_version
        update_data["updated_by"] = user_id
        update_data["updated_at"] = now
        
        # Update record
        await collection.update_one(
            {"id": record_id, "is_current": True},
            {"$set": update_data}
        )
        
        # Get updated record
        updated = await collection.find_one(
            {"id": record_id, "is_current": True},
            {"_id": 0}
        )
        
        # Create version snapshot
        await self._create_version_snapshot(
            section=section,
            record_id=record_id,
            version=new_version,
            snapshot=updated,
            changed_fields=changed_fields,
            change_reason=data.change_reason,
            user_id=user_id
        )
        
        return updated
    
    async def get_record(
        self,
        section: ESG_SECTION,
        record_id: str,
        org_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a single record."""
        collection = self._get_records_collection(section)
        return await collection.find_one(
            {"id": record_id, "org_id": org_id, "is_current": True},
            {"_id": 0}
        )
    
    async def list_records(
        self,
        section: ESG_SECTION,
        org_id: str,
        filters: RecordListFilters
    ) -> Dict[str, Any]:
        """List records with filtering and pagination."""
        collection = self._get_records_collection(section)
        
        # Build query
        query = {"org_id": org_id, "is_current": True}
        
        if filters.category:
            query["category"] = filters.category
        if filters.subcategory:
            query["subcategory"] = filters.subcategory
        if filters.reporting_type:
            query["reporting_period.reporting_type"] = filters.reporting_type
        if filters.facility_id:
            query["facility_id"] = filters.facility_id
        if filters.framework:
            query["frameworks"] = filters.framework
        if filters.year:
            query["reporting_period.year"] = filters.year
        if filters.month:
            query["reporting_period.month"] = filters.month
        if filters.search:
            query["$or"] = [
                {"category": {"$regex": filters.search, "$options": "i"}},
                {"subcategory": {"$regex": filters.search, "$options": "i"}},
                {"notes": {"$regex": filters.search, "$options": "i"}},
                {"source_of_information": {"$regex": filters.search, "$options": "i"}}
            ]
        
        # Count total
        total = await collection.count_documents(query)
        
        # Paginate
        skip = (filters.page - 1) * filters.limit
        cursor = collection.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(filters.limit)
        records = await cursor.to_list(None)
        
        return {
            "records": records,
            "total": total,
            "page": filters.page,
            "limit": filters.limit,
            "total_pages": (total + filters.limit - 1) // filters.limit
        }
    
    async def delete_record(
        self,
        section: ESG_SECTION,
        record_id: str,
        org_id: str
    ) -> bool:
        """Soft delete a record (marks as not current)."""
        collection = self._get_records_collection(section)
        result = await collection.update_one(
            {"id": record_id, "org_id": org_id, "is_current": True},
            {"$set": {"is_current": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
        )
        return result.modified_count > 0
    
    # =========================================================================
    # Version Management
    # =========================================================================
    
    async def _create_version_snapshot(
        self,
        section: ESG_SECTION,
        record_id: str,
        version: int,
        snapshot: Dict[str, Any],
        changed_fields: List[str],
        user_id: str,
        change_reason: Optional[str] = None
    ):
        """Create a version snapshot."""
        collection = self._get_versions_collection(section)
        now = datetime.now(timezone.utc).isoformat()
        
        version_doc = {
            "id": str(uuid.uuid4()),
            "record_id": record_id,
            "version": version,
            "section": section,
            "snapshot": snapshot,
            "changed_fields": changed_fields,
            "change_reason": change_reason,
            "created_by": user_id,
            "created_at": now
        }
        
        await collection.insert_one(version_doc)
    
    async def get_record_versions(
        self,
        section: ESG_SECTION,
        record_id: str
    ) -> List[Dict[str, Any]]:
        """Get all versions of a record."""
        collection = self._get_versions_collection(section)
        cursor = collection.find(
            {"record_id": record_id},
            {"_id": 0}
        ).sort("version", -1)
        return await cursor.to_list(None)
    
    async def get_version(
        self,
        section: ESG_SECTION,
        record_id: str,
        version: int
    ) -> Optional[Dict[str, Any]]:
        """Get a specific version of a record."""
        collection = self._get_versions_collection(section)
        return await collection.find_one(
            {"record_id": record_id, "version": version},
            {"_id": 0}
        )
    
    # =========================================================================
    # Statistics
    # =========================================================================
    
    async def get_record_stats(
        self,
        section: ESG_SECTION,
        org_id: str
    ) -> Dict[str, Any]:
        """Get record statistics for an organization."""
        collection = self._get_records_collection(section)
        
        # Total records
        total = await collection.count_documents({"org_id": org_id, "is_current": True})
        
        # By category
        pipeline = [
            {"$match": {"org_id": org_id, "is_current": True}},
            {"$group": {"_id": "$category", "count": {"$sum": 1}}}
        ]
        by_category = {}
        async for doc in collection.aggregate(pipeline):
            by_category[doc["_id"]] = doc["count"]
        
        # By reporting type
        pipeline = [
            {"$match": {"org_id": org_id, "is_current": True}},
            {"$group": {"_id": "$reporting_period.reporting_type", "count": {"$sum": 1}}}
        ]
        by_reporting_type = {}
        async for doc in collection.aggregate(pipeline):
            by_reporting_type[doc["_id"]] = doc["count"]
        
        return {
            "total": total,
            "by_category": by_category,
            "by_reporting_type": by_reporting_type
        }
    
    # =========================================================================
    # Admin Methods (Super Admin Only)
    # =========================================================================
    
    async def admin_list_categories(
        self,
        section: Optional[ESG_SECTION] = None,
        framework: Optional[str] = None,
        include_inactive: bool = False
    ) -> List[Dict[str, Any]]:
        """List all categories across sections (Super Admin)."""
        query = {}
        if section:
            query["section"] = section
        if not include_inactive:
            query["is_active"] = True
        if framework:
            query["frameworks"] = framework
        
        cursor = self._categories.find(query, {"_id": 0}).sort([("section", 1), ("order", 1)])
        return await cursor.to_list(None)
    
    async def create_category(self, category_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new category (Super Admin)."""
        await self._categories.insert_one(category_doc)
        category_doc.pop("_id", None)
        return category_doc
    
    async def update_category(
        self, 
        category_id: str, 
        update_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a category (Super Admin)."""
        await self._categories.update_one(
            {"id": category_id},
            {"$set": update_data}
        )
        return await self.get_category(category_id)
    
    async def delete_category(self, category_id: str) -> bool:
        """Delete a category (Super Admin)."""
        result = await self._categories.delete_one({"id": category_id})
        return result.deleted_count > 0
    
    async def count_records_by_category(self, category_id: str) -> int:
        """Count records using a specific category."""
        total = 0
        for section in ["environment", "social", "governance"]:
            collection = self._get_records_collection(section)
            count = await collection.count_documents({"category_id": category_id, "is_current": True})
            total += count
        return total
    
    async def get_admin_stats(self) -> Dict[str, Any]:
        """Get ESG configuration statistics (Super Admin)."""
        # Category counts by section
        pipeline = [
            {"$group": {"_id": "$section", "count": {"$sum": 1}, "active": {"$sum": {"$cond": ["$is_active", 1, 0]}}}}
        ]
        by_section = {}
        async for doc in self._categories.aggregate(pipeline):
            by_section[doc["_id"]] = {"total": doc["count"], "active": doc["active"]}
        
        # Total categories
        total_categories = await self._categories.count_documents({})
        active_categories = await self._categories.count_documents({"is_active": True})
        
        # Record counts per section
        record_counts = {}
        for section in ["environment", "social", "governance"]:
            collection = self._get_records_collection(section)
            record_counts[section] = await collection.count_documents({"is_current": True})
        
        return {
            "categories": {
                "total": total_categories,
                "active": active_categories,
                "by_section": by_section
            },
            "records": record_counts
        }


# Singleton instance
esg_records_service = ESGRecordsService()
