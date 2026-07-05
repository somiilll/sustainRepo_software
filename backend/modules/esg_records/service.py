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
        data: CreateRecordRequest,
        skip_assignment_check: bool = False,  # For admin override
    ) -> Dict[str, Any]:
        """
        Create a new ESG record.
        
        Validates user has an active assignment for the category/subcategory
        at the correct level (org vs facility).
        """
        collection = self._get_records_collection(section)
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # ACCESS CONTROL: Check if user has valid assignment
        assignment = None
        requires_approval = False
        
        if not skip_assignment_check:
            assignment = await self._validate_user_assignment(
                org_id=org_id,
                user_id=user_id,
                category=data.category,
                subcategory=data.subcategory,
                sub_subcategory=data.sub_subcategory,
                facility_id=data.facility_id,
                record_level=data.record_level,
            )
            if not assignment:
                raise ValueError(
                    f"No active assignment found for {data.category}/{data.subcategory or ''} "
                    f"at {'facility' if data.facility_id else 'organization'} level"
                )
            # Check if this assignment requires approval
            requires_approval = assignment.get("requires_approval", False)
        
        # Determine status based on approval requirement
        record_status = "submitted" if requires_approval else "saved"
        
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
            "status": record_status,
            "version": 1,
            "is_current": True,
            "created_by": user_id,
            "created_at": now_iso,
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
        
        # LINK TASK TO RECORD: Mark corresponding task as submitted
        await self._mark_task_submitted(
            org_id=org_id,
            user_id=user_id,
            category=data.category,
            subcategory=data.subcategory,
            sub_subcategory=data.sub_subcategory,
            facility_id=data.facility_id,
            reporting_period=data.reporting_period,
        )
        
        # Remove MongoDB _id before returning
        record.pop("_id", None)
        return record
    
    async def _validate_user_assignment(
        self,
        org_id: str,
        user_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        facility_id: Optional[str],
        record_level: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Check if user has an active assignment for the category at the correct level.
        
        Returns the assignment if valid, None otherwise.
        """
        # Build query to find matching assignment
        query = {
            "organization_id": org_id,
            "assigned_to_user_id": user_id,
            "entity_type": "record_category",
            "status": {"$nin": ["completed", "cancelled"]},
            "$or": [
                # Exact match
                {"category": category, "subcategory": subcategory, "sub_subcategory": sub_subcategory},
                # Parent category match (assigned to parent, filling child)
                {"category": category, "subcategory": None, "sub_subcategory": None},
                {"category": category, "subcategory": subcategory, "sub_subcategory": None},
            ]
        }
        
        # Check facility level match
        if record_level == "facility" and facility_id:
            query["$and"] = [
                {"$or": [
                    {"facility_id": facility_id},  # Exact facility match
                    {"assignment_level": "organization"},  # Org-level can add to any facility
                ]}
            ]
        elif record_level == "organization":
            # Org-level record: user must have org-level assignment
            query["assignment_level"] = "organization"
        
        assignment = await db.esg_assignments.find_one(query, {"_id": 0})
        return assignment
    
    async def _mark_task_submitted(
        self,
        org_id: str,
        user_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        facility_id: Optional[str],
        reporting_period: Any,
    ):
        """
        Mark the corresponding reporting task as submitted when a record is added.
        """
        try:
            # Determine period_key from reporting_period
            period_key = None
            if hasattr(reporting_period, 'model_dump'):
                rp = reporting_period.model_dump()
            else:
                rp = reporting_period if isinstance(reporting_period, dict) else {}
            
            rp_type = rp.get("reporting_type") or rp.get("type")
            if rp_type == "yearly":
                period_key = str(rp.get("year"))
            elif rp_type == "monthly":
                # Month could be name like "January" or number
                month = rp.get("month")
                if isinstance(month, str) and not month.isdigit():
                    # Convert month name to number
                    month_names = ["January", "February", "March", "April", "May", "June",
                                   "July", "August", "September", "October", "November", "December"]
                    try:
                        month_num = month_names.index(month) + 1
                    except ValueError:
                        month_num = 1
                else:
                    month_num = int(month) if month else 1
                period_key = f"{rp.get('year')}-{str(month_num).zfill(2)}"
            elif rp_type == "quarterly":
                quarter = rp.get("quarter", "").replace("Q", "") if rp.get("quarter") else "1"
                period_key = f"{rp.get('year')}-Q{quarter}"
            elif rp_type == "daily":
                period_key = rp.get("date")  # Expected format: YYYY-MM-DD
            elif rp_type == "weekly":
                period_key = rp.get("date")  # Use date for weekly as well
            
            if not period_key:
                return
            
            # Find and update the matching task
            query = {
                "organization_id": org_id,
                "assigned_to_user_id": user_id,
                "category": category,
                "period_key": period_key,
                "status": {"$in": ["pending", "backfill_pending", "overdue", "in_progress", "rejected"]},
            }
            if subcategory:
                query["subcategory"] = subcategory
            if sub_subcategory:
                query["sub_subcategory"] = sub_subcategory
            if facility_id:
                query["facility_id"] = facility_id
            
            now = datetime.now(timezone.utc)
            await db.esg_reporting_tasks.update_one(
                query,
                {"$set": {
                    "status": "submitted",
                    "submitted_at": now,
                    "updated_at": now,
                }}
            )
        except Exception as e:
            # Don't fail record creation if task update fails
            print(f"Warning: Failed to mark task as submitted: {e}")
    
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
        
        if data.status is not None:
            update_data["status"] = data.status
            changed_fields.append("status")
        
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
        
        # If status changed to submitted, mark the task as submitted
        if data.status == "submitted" and current.get("status") in ["rejected", "draft"]:
            await self._mark_task_submitted(
                org_id=current.get("org_id"),
                user_id=user_id,
                category=current.get("category"),
                subcategory=current.get("subcategory"),
                sub_subcategory=current.get("sub_subcategory"),
                facility_id=current.get("facility_id"),
                reporting_period=current.get("reporting_period"),
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

    # =========================================================================
    # Tracker & Assignment Methods
    # =========================================================================

    async def get_tracker_assignments(
        self,
        org_id: str,
        section: str,
        reporting_period: Optional[str] = None,
        framework: Optional[str] = None,
        category: Optional[str] = None,
        facility_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
        status: Optional[str] = None,
        staleness: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get tracker assignments for record categories.
        Uses esg_assignments collection with entity_type='record_category'.
        """
        # Build query for assignments
        query = {
            "organization_id": org_id,
            "entity_type": "record_category",
        }
        if reporting_period:
            query["reporting_period"] = reporting_period
        if category:
            query["category"] = category
        if facility_id:
            query["facility_id"] = facility_id
        if assigned_to:
            query["assigned_to_user_id"] = assigned_to
        if status:
            query["status"] = status

        assignments_cursor = db.esg_assignments.find(query, {"_id": 0})
        assignments = await assignments_cursor.to_list(500)

        # Enrich with user names and staleness calculation
        for assignment in assignments:
            # Get assigned user name
            if assignment.get("assigned_to_user_id"):
                user = await db.users.find_one(
                    {"id": assignment["assigned_to_user_id"]},
                    {"_id": 0, "full_name": 1, "name": 1, "email": 1}
                )
                if user:
                    assignment["assigned_to_name"] = user.get("full_name") or user.get("name") or user.get("email")
            
            # Get facility name
            if assignment.get("facility_id"):
                facility = await db.facilities.find_one(
                    {"id": assignment["facility_id"]},
                    {"_id": 0, "name": 1}
                )
                if facility:
                    assignment["facility_name"] = facility.get("name")
            
            # Calculate staleness based on last record entry
            last_entry = await self._get_last_record_entry(
                org_id, section, assignment.get("category"), assignment.get("facility_id")
            )
            if last_entry:
                last_updated = last_entry.get("updated_at") or last_entry.get("created_at")
                assignment["last_entry_at"] = last_updated
                if last_updated:
                    # Ensure timezone awareness
                    if isinstance(last_updated, str):
                        try:
                            last_updated = datetime.fromisoformat(last_updated.replace('Z', '+00:00'))
                        except:
                            last_updated = None
                    if last_updated and last_updated.tzinfo is None:
                        last_updated = last_updated.replace(tzinfo=timezone.utc)
                    if last_updated:
                        days_since = (datetime.now(timezone.utc) - last_updated).days
                        if days_since <= 30:
                            assignment["staleness"] = "fresh"
                        elif days_since <= 60:
                            assignment["staleness"] = "aging"
                        elif days_since <= 90:
                            assignment["staleness"] = "stale"
                        else:
                            assignment["staleness"] = "critical"
                    else:
                        assignment["staleness"] = "critical"
                else:
                    assignment["staleness"] = "critical"
            else:
                assignment["staleness"] = "critical"
                assignment["last_entry_at"] = None

        # Filter by staleness if requested
        if staleness:
            assignments = [a for a in assignments if a.get("staleness") == staleness]

        return assignments

    async def _get_last_record_entry(
        self,
        org_id: str,
        section: str,
        category: Optional[str],
        facility_id: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """Get the most recent record entry for a category."""
        collection = self._get_records_collection(section)
        query = {
            "organization_id": org_id,
            "is_current": True,
        }
        if category:
            query["category"] = category
        if facility_id:
            query["facility_id"] = facility_id
        
        record = await collection.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1},
            sort=[("updated_at", -1)]
        )
        return record

    async def get_tracker_stats(
        self,
        org_id: str,
        section: str,
        reporting_period: Optional[str] = None,
        framework: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get tracker statistics."""
        # Get total categories
        cat_query = {"section": section, "is_active": True}
        if framework:
            cat_query["frameworks"] = framework
        total_categories = await self._categories.count_documents(cat_query)

        # Get assignment counts
        assign_query = {
            "organization_id": org_id,
            "entity_type": "record_category",
        }
        if reporting_period:
            assign_query["reporting_period"] = reporting_period

        assigned = await db.esg_assignments.count_documents(assign_query)
        
        # Status counts
        completed = await db.esg_assignments.count_documents({**assign_query, "status": "completed"})
        in_progress = await db.esg_assignments.count_documents({**assign_query, "status": "in_progress"})
        
        # Overdue count
        now = datetime.now(timezone.utc)
        overdue = await db.esg_assignments.count_documents({
            **assign_query,
            "due_date": {"$lt": now},
            "status": {"$nin": ["completed", "approved"]}
        })

        return {
            "total_categories": total_categories,
            "assigned": assigned,
            "unassigned": max(0, total_categories - assigned),
            "completed": completed,
            "in_progress": in_progress,
            "overdue": overdue,
            "stale": 0,  # Would need to calculate based on last entries
        }

    async def create_assignment(
        self,
        org_id: str,
        assigned_by_user_id: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create or update a record category assignment.
        Uses esg_assignments collection.
        
        If `replace_existing` is True in data, deletes all existing assignments
        for the same category/subcategory/facility/reporting_period before creating new ones.
        """
        now = datetime.now(timezone.utc)
        assignment_id = str(uuid.uuid4())
        
        # Base query for finding existing assignments (without user_id - matches all users)
        base_query = {
            "organization_id": org_id,
            "entity_type": "record_category",
            "category": data.get("category"),
            "subcategory": data.get("subcategory"),
            "sub_subcategory": data.get("sub_subcategory"),
            "facility_id": data.get("facility_id"),
            "reporting_period": data.get("reporting_period"),
        }
        
        # If replace_existing flag is set, delete all existing assignments for this category combo
        if data.get("replace_existing"):
            deleted = await db.esg_assignments.delete_many(base_query)
            # Log deletion if any were removed
            if deleted.deleted_count > 0:
                history_doc = {
                    "id": str(uuid.uuid4()),
                    "assignment_id": None,
                    "action": "bulk_replaced",
                    "previous_value": {"deleted_count": deleted.deleted_count},
                    "new_value": {"category": data.get("category"), "subcategory": data.get("subcategory")},
                    "changed_by_user_id": assigned_by_user_id,
                    "created_at": now,
                }
                await db.esg_record_assignment_history.insert_one(history_doc)

        # Check for existing assignment with same params INCLUDING user_id
        existing = await db.esg_assignments.find_one({
            **base_query,
            "assigned_to_user_id": data.get("assigned_to_user_id"),
        })

        if existing:
            # Update existing assignment
            await db.esg_assignments.update_one(
                {"id": existing["id"]},
                {
                    "$set": {
                        "assignment_level": data.get("assignment_level", existing.get("assignment_level")),
                        "facility_id": data.get("facility_id"),
                        "filling_frequency": data.get("filling_frequency"),
                        "reminder_config": data.get("reminder_config"),
                        "requires_approval": data.get("requires_approval", False),
                        "role": data.get("role"),
                        # New scheduling fields
                        "start_date": data.get("start_date"),
                        "end_date": data.get("end_date"),
                        "timezone": data.get("timezone", "UTC"),
                        "due_config": data.get("due_config"),
                        "updated_at": now,
                    }
                }
            )
            assignment_id = existing["id"]
        else:
            # Create new assignment
            assignment_doc = {
                "id": assignment_id,
                "organization_id": org_id,
                "entity_type": "record_category",
                "entity_id": data.get("entity_id") or f"{data.get('category')}_{data.get('subcategory', '')}_{data.get('sub_subcategory', '')}".strip("_"),
                "category": data.get("category"),
                "subcategory": data.get("subcategory"),
                "sub_subcategory": data.get("sub_subcategory"),
                "assignment_level": data.get("assignment_level", "organization"),
                "facility_id": data.get("facility_id"),
                "assigned_to_user_id": data.get("assigned_to_user_id"),
                "assigned_by_user_id": assigned_by_user_id,
                "reporting_period": data.get("reporting_period"),
                "role": data.get("role", "editor"),
                "status": "pending",
                "filling_frequency": data.get("filling_frequency"),
                "reminder_config": data.get("reminder_config"),
                "requires_approval": False,
                # New scheduling fields
                "start_date": data.get("start_date"),
                "end_date": data.get("end_date"),
                "timezone": data.get("timezone", "UTC"),
                "due_config": data.get("due_config"),
                "created_at": now,
                "updated_at": now,
            }
            await db.esg_assignments.insert_one(assignment_doc)

            # Log to assignment history
            history_doc = {
                "id": str(uuid.uuid4()),
                "assignment_id": assignment_id,
                "action": "created",
                "previous_value": None,
                "new_value": {
                    "assigned_to": data.get("assigned_to_user_id"),
                    "role": data.get("role"),
                },
                "changed_by_user_id": assigned_by_user_id,
                "created_at": now,
            }
            await db.esg_record_assignment_history.insert_one(history_doc)

        # Auto-generate tasks if start_date and filling_frequency are provided
        if data.get("start_date") and data.get("filling_frequency"):
            try:
                from .task_engine import generate_tasks_for_assignment as gen_tasks
                # Fetch the created/updated assignment
                assignment = await db.esg_assignments.find_one({"id": assignment_id}, {"_id": 0})
                if assignment:
                    await gen_tasks(db, assignment)
            except Exception as e:
                # Log but don't fail the assignment creation
                print(f"Task generation warning: {e}")

        # CASCADE: If assigning parent category (no subcategory), create child assignments
        cascade_results = []
        if data.get("assign_children") and not data.get("subcategory"):
            cascade_results = await self._cascade_assignment_to_children(
                org_id=org_id,
                assigned_by_user_id=assigned_by_user_id,
                parent_assignment_id=assignment_id,
                data=data,
            )

        return {
            "id": assignment_id, 
            "status": "saved",
            "cascaded_assignments": len(cascade_results),
            "cascade_details": cascade_results,
        }

    async def _cascade_assignment_to_children(
        self,
        org_id: str,
        assigned_by_user_id: str,
        parent_assignment_id: str,
        data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        Cascade a parent category assignment to all child subcategories.
        
        When assigning a parent category (e.g., "Emissions"), this creates individual
        assignments for ALL subcategories defined in esg_record_categories by Super Admin.
        
        Source: esg_record_categories (Super Admin managed via /api/super-admin/esg-config/categories)
        
        Example: Assigning "Emissions" cascades to:
        - Emissions / Air Emissions (if defined by Super Admin)
        - Emissions / GHG Emissions (if defined by Super Admin)
        
        Each child gets its own task generation.
        """
        now = datetime.now(timezone.utc)
        parent_category = data.get("category")
        results = []
        
        # Find all child categories from Super Admin-managed esg_record_categories
        # Only get active categories
        child_categories = await db.esg_record_categories.find(
            {
                "category": parent_category,
                "subcategory": {"$exists": True, "$ne": None, "$ne": ""},
                "is_active": {"$ne": False},  # Include active (default) categories
            },
            {"_id": 0, "category": 1, "subcategory": 1, "sub_subcategory": 1}
        ).to_list(100)
        
        if not child_categories:
            return results
        
        # Group by subcategory to handle sub_subcategories
        seen = set()
        
        for child in child_categories:
            subcat = child.get("subcategory")
            sub_subcat = child.get("sub_subcategory")
            
            # Create unique key to avoid duplicates
            unique_key = f"{parent_category}|{subcat}|{sub_subcat or ''}"
            if unique_key in seen:
                continue
            seen.add(unique_key)
            
            # Build child assignment data
            child_data = {
                **data,
                "subcategory": subcat,
                "sub_subcategory": sub_subcat if sub_subcat else None,
                "entity_id": f"{parent_category}_{subcat}_{sub_subcat or ''}".strip("_"),
                "parent_assignment_id": parent_assignment_id,
                "assign_children": False,  # Don't cascade recursively
                "replace_existing": False,  # Don't replace on cascade
            }
            
            # Check if assignment already exists
            existing = await db.esg_assignments.find_one({
                "organization_id": org_id,
                "entity_type": "record_category",
                "category": parent_category,
                "subcategory": subcat,
                "sub_subcategory": sub_subcat if sub_subcat else None,
                "facility_id": data.get("facility_id"),
                "assigned_to_user_id": data.get("assigned_to_user_id"),
                "reporting_period": data.get("reporting_period"),
            })
            
            if existing:
                # Update existing
                await db.esg_assignments.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "start_date": data.get("start_date"),
                        "end_date": data.get("end_date"),
                        "timezone": data.get("timezone", "UTC"),
                        "due_config": data.get("due_config"),
                        "filling_frequency": data.get("filling_frequency"),
                        "parent_assignment_id": parent_assignment_id,
                        "updated_at": now,
                    }}
                )
                child_assignment_id = existing["id"]
                results.append({
                    "id": child_assignment_id,
                    "category": parent_category,
                    "subcategory": subcat,
                    "sub_subcategory": sub_subcat,
                    "action": "updated",
                })
            else:
                # Create new child assignment
                child_assignment_id = str(uuid.uuid4())
                child_doc = {
                    "id": child_assignment_id,
                    "organization_id": org_id,
                    "entity_type": "record_category",
                    "entity_id": child_data["entity_id"],
                    "category": parent_category,
                    "subcategory": subcat,
                    "sub_subcategory": sub_subcat if sub_subcat else None,
                    "parent_assignment_id": parent_assignment_id,
                    "assignment_level": data.get("assignment_level", "organization"),
                    "facility_id": data.get("facility_id"),
                    "assigned_to_user_id": data.get("assigned_to_user_id"),
                    "assigned_by_user_id": assigned_by_user_id,
                    "reporting_period": data.get("reporting_period"),
                    "role": data.get("role", "editor"),
                    "status": "pending",
                    "filling_frequency": data.get("filling_frequency"),
                    "reminder_config": data.get("reminder_config"),
                    "requires_approval": False,
                    "start_date": data.get("start_date"),
                    "end_date": data.get("end_date"),
                    "timezone": data.get("timezone", "UTC"),
                    "due_config": data.get("due_config"),
                    "created_at": now,
                    "updated_at": now,
                }
                await db.esg_assignments.insert_one(child_doc)
                
                results.append({
                    "id": child_assignment_id,
                    "category": parent_category,
                    "subcategory": subcat,
                    "sub_subcategory": sub_subcat,
                    "action": "created",
                })
            
            # Generate tasks for child assignment
            if data.get("start_date") and data.get("filling_frequency"):
                try:
                    from .task_engine import generate_tasks_for_assignment as gen_tasks
                    assignment = await db.esg_assignments.find_one({"id": child_assignment_id}, {"_id": 0})
                    if assignment:
                        await gen_tasks(db, assignment)
                except Exception as e:
                    print(f"Task generation warning for child {subcat}/{sub_subcat}: {e}")
        
        return results

    # =========================================================================
    # Draft Methods
    # =========================================================================

    async def get_user_drafts(
        self,
        org_id: str,
        section: str,
        user_id: str,
    ) -> List[Dict[str, Any]]:
        """Get user's drafts for a section."""
        cursor = db.esg_record_drafts.find(
            {
                "organization_id": org_id,
                "section": section,
                "user_id": user_id,
            },
            {"_id": 0}
        )
        return await cursor.to_list(100)

    async def save_as_draft(
        self,
        org_id: str,
        section: str,
        record_id: str,
        user_id: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Save a record as draft for the current user."""
        now = datetime.now(timezone.utc)
        
        # Check for existing draft
        existing = await db.esg_record_drafts.find_one({
            "organization_id": org_id,
            "section": section,
            "record_id": record_id,
            "user_id": user_id,
        })

        if existing:
            await db.esg_record_drafts.update_one(
                {"id": existing["id"]},
                {
                    "$set": {
                        "draft_data": data,
                        "updated_at": now,
                    }
                }
            )
            return {"id": existing["id"], "status": "updated"}
        else:
            draft_doc = {
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "section": section,
                "record_id": record_id,
                "user_id": user_id,
                "draft_data": data,
                "status": "draft",
                "created_at": now,
                "updated_at": now,
            }
            await db.esg_record_drafts.insert_one(draft_doc)
            return {"id": draft_doc["id"], "status": "created"}

    async def discard_draft(
        self,
        org_id: str,
        section: str,
        record_id: str,
        user_id: str,
    ) -> bool:
        """Discard a user's draft."""
        result = await db.esg_record_drafts.delete_one({
            "organization_id": org_id,
            "section": section,
            "record_id": record_id,
            "user_id": user_id,
        })
        return result.deleted_count > 0


# Singleton instance
esg_records_service = ESGRecordsService()
