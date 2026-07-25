"""
ESG Records Module - Service Layer

Handles business logic for ESG records with versioning support.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
from fastapi import HTTPException
from shared.database.mongo import db

from .contracts import (
    ESG_SECTION, REPORTING_TYPE, CreateRecordRequest, 
    UpdateRecordRequest, RecordListFilters
)
from .version_utils import compare_versions, get_changed_field_paths, format_field_display_name


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
        allow_without_assignment: bool = False,  # Allow if no assignment found (admin)
    ) -> Dict[str, Any]:
        """
        Create a new ESG record.
        
        Validates user has an active assignment for the category/subcategory
        at the correct level (org vs facility).
        
        Args:
            skip_assignment_check: If True, skip assignment lookup entirely
            allow_without_assignment: If True, allow record creation even without assignment
                                      (but still look up assignment to get requires_approval)
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
            if not assignment and not allow_without_assignment:
                # Get facility name if facility_id is provided
                facility_name = None
                if data.facility_id:
                    facility = await db.facilities.find_one(
                        {"id": data.facility_id},
                        {"_id": 0, "name": 1}
                    )
                    facility_name = facility.get("name") if facility else data.facility_id
                
                location_str = f"at {facility_name}" if facility_name else "at organization level"
                raise ValueError(
                    f"No active assignment found for {data.category}/{data.subcategory or ''} "
                    f"{location_str}"
                )
            # Check if this assignment requires approval
            if assignment:
                requires_approval = assignment.get("requires_approval", False)
            
            # PERIOD VALIDATION: Check if user has a task for this reporting period
            if not allow_without_assignment and data.reporting_period:
                period_valid = await self._validate_task_period(
                    org_id=org_id,
                    user_id=user_id,
                    category=data.category,
                    subcategory=data.subcategory,
                    sub_subcategory=data.sub_subcategory,
                    facility_id=data.facility_id,
                    reporting_period=data.reporting_period,
                )
                if not period_valid:
                    rp = data.reporting_period
                    # Convert month number to name if needed
                    month_display = rp.month
                    if month_display:
                        if isinstance(month_display, int) or (isinstance(month_display, str) and month_display.isdigit()):
                            month_names = ["January", "February", "March", "April", "May", "June",
                                          "July", "August", "September", "October", "November", "December"]
                            month_idx = int(month_display) - 1
                            if 0 <= month_idx < 12:
                                month_display = month_names[month_idx]
                    period_str = f"{month_display} {rp.year}" if month_display else str(rp.year)
                    raise ValueError(
                        f"No task assigned for period {period_str}. "
                        f"You can only submit data for periods assigned to you."
                    )
        
        # Determine record status using dual-status architecture
        # status = operational completion
        # approval_status = governance state
        if data.status == 'draft':
            # Draft: not completed yet, no approval needed
            record_status = "draft"
            record_approval_status = "not_required"
        else:
            # Completed: mark as completed, check if approval is required
            record_status = "completed"
            record_approval_status = "pending_approval" if requires_approval else "not_required"
        
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
            "approval_status": record_approval_status,
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
        
        # LINK TASK TO RECORD: Mark corresponding task as completed (only if not draft)
        if record_status != "draft":
            await self._mark_task_completed(
                org_id=org_id,
                user_id=user_id,
                category=data.category,
                subcategory=data.subcategory,
                sub_subcategory=data.sub_subcategory,
                facility_id=data.facility_id,
                reporting_period=data.reporting_period,
                requires_approval=requires_approval,
            )
        
        # CREATE APPROVAL REQUEST if requires approval
        if record_status != "draft" and requires_approval and assignment:
            await self._create_approval_request(
                org_id=org_id,
                record=record,
                assignment=assignment,
                user_id=user_id,
                section=section,
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
        
        Returns the MOST SPECIFIC matching assignment (prefers exact subcategory match).
        This ensures we get the correct requires_approval setting.
        """
        # Build query to find matching assignments (get all potential matches)
        query = {
            "organization_id": org_id,
            "assigned_to_user_id": user_id,
            "entity_type": "record_category",
            "status": {"$nin": ["completed", "cancelled"]},
            "category": category,
        }
        
        # Check facility level match
        if record_level == "facility" and facility_id:
            query["$or"] = [
                {"facility_id": facility_id},  # Exact facility match
                {"assignment_level": "organization"},  # Org-level can add to any facility
            ]
        elif record_level == "organization":
            # Org-level record: user must have org-level assignment
            query["assignment_level"] = "organization"
        
        # Get all matching assignments for this category
        assignments = await db.esg_assignments.find(query, {"_id": 0}).to_list(100)
        
        if not assignments:
            return None
        
        # Find the most specific matching assignment
        # Priority: exact match > subcategory match > category-only match
        best_match = None
        best_score = -1
        
        for assignment in assignments:
            score = 0
            a_subcat = assignment.get("subcategory")
            a_sub_subcat = assignment.get("sub_subcategory")
            
            # Exact match on all levels
            if a_subcat == subcategory and a_sub_subcat == sub_subcategory:
                score = 3
            # Subcategory match (sub_subcategory is None in assignment)
            elif a_subcat == subcategory and a_sub_subcat is None:
                score = 2
            # Category-only match (both subcategory and sub_subcategory are None)
            elif a_subcat is None and a_sub_subcat is None:
                score = 1
            # Subcategory matches but we're filling a different sub_subcategory
            elif a_subcat == subcategory:
                score = 2
            else:
                continue  # No match
            
            if score > best_score:
                best_score = score
                best_match = assignment
        
        return best_match

    async def _validate_task_period(
        self,
        org_id: str,
        user_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        facility_id: Optional[str],
        reporting_period: Any,
    ) -> bool:
        """
        Check if user has an active task for the given reporting period.
        Returns True if a matching task exists, False otherwise.
        """
        # Build period_key from reporting_period
        if not reporting_period:
            return True  # No period specified, allow
        
        rp = reporting_period
        rp_type = getattr(rp, 'reporting_type', None) or getattr(rp, 'type', None)
        year = getattr(rp, 'year', None)
        month = getattr(rp, 'month', None)
        quarter = getattr(rp, 'quarter', None)
        
        if not year:
            return True  # Can't validate without year
        
        # Build period_key to match task's period_key
        if rp_type == "monthly" and month:
            # Convert month name to number
            month_names = ["January", "February", "March", "April", "May", "June",
                          "July", "August", "September", "October", "November", "December"]
            if isinstance(month, str) and month in month_names:
                month_num = month_names.index(month) + 1
            elif isinstance(month, int):
                month_num = month
            else:
                month_num = 1
            period_key = f"{year}-{str(month_num).zfill(2)}"
        elif rp_type == "quarterly" and quarter:
            q = quarter.replace("Q", "") if isinstance(quarter, str) else quarter
            period_key = f"{year}-Q{q}"
        elif rp_type == "yearly":
            period_key = str(year)
        else:
            # Default to yearly if type not specified
            period_key = str(year)
        
        # Step 1: Find task IDs that match the period_key and category
        task_query = {
            "organization_id": org_id,
            "category": category,
            "period_key": period_key,
        }
        if subcategory:
            task_query["subcategory"] = subcategory
        if sub_subcategory:
            task_query["sub_subcategory"] = sub_subcategory
        if facility_id:
            task_query["facility_id"] = facility_id
        
        matching_tasks = await db.esg_reporting_tasks.find(
            task_query,
            {"_id": 0, "id": 1}
        ).to_list(100)
        
        if not matching_tasks:
            return False  # No tasks for this period
        
        task_ids = [t["id"] for t in matching_tasks]
        
        # Step 2: Check if user is assigned to any of these tasks
        assignee = await db.esg_task_assignees.find_one({
            "task_id": {"$in": task_ids},
            "user_id": user_id,
            "is_active": True,
        })
        
        return assignee is not None

    def _calculate_field_changes(
        self,
        old_values: Dict[str, Any],
        new_values: Dict[str, Any],
        old_record: Optional[Dict[str, Any]] = None,
        new_record: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Calculate the differences between old and new field values.
        Also includes changes to reporting_period if records are provided.
        Returns a list of changes with field_key, old_value, new_value.
        """
        changes = []
        all_keys = set(old_values.keys()) | set(new_values.keys())
        
        for key in all_keys:
            old_val = old_values.get(key)
            new_val = new_values.get(key)
            
            # Check if values are different
            if old_val != new_val:
                changes.append({
                    "field_key": key,
                    "old_value": old_val,
                    "new_value": new_val,
                })
        
        # Check reporting_period changes if records provided
        if old_record and new_record:
            old_rp = old_record.get("reporting_period", {})
            new_rp = new_record.get("reporting_period", {})
            
            if old_rp != new_rp:
                # Format period for display
                def format_period(rp):
                    if not rp:
                        return None
                    if isinstance(rp, dict):
                        month = rp.get("month", "")
                        year = rp.get("year", "")
                        quarter = rp.get("quarter", "")
                        if month and year:
                            return f"{month} {year}"
                        elif quarter and year:
                            return f"{quarter} {year}"
                        elif year:
                            return str(year)
                    return str(rp)
                
                changes.append({
                    "field_key": "reporting_period",
                    "old_value": format_period(old_rp),
                    "new_value": format_period(new_rp),
                })
        
        return changes

    async def _create_approval_request(
        self,
        org_id: str,
        record: Dict[str, Any],
        assignment: Dict[str, Any],
        user_id: str,
        section: str,
        is_edit: bool = False,
        changes_summary: Optional[List[Dict[str, Any]]] = None,
        previous_snapshot: Optional[Dict[str, Any]] = None,
    ):
        """
        Create an approval request when a record is saved with requires_approval=True.
        Uses the approver_id from the assignment or approval_chain if multi-level.
        """
        try:
            approver_id = assignment.get("approver_id")
            approval_chain = assignment.get("approval_chain", [])
            
            # Determine approvers - use approval_chain if available, otherwise single approver
            # Handle both formats: list of strings (user IDs) or list of objects with approver_id
            if approval_chain and len(approval_chain) > 0:
                first_item = approval_chain[0]
                # Check if it's a string (user ID directly) or object
                if isinstance(first_item, str):
                    current_approvers = [first_item]
                else:
                    current_approvers = [first_item.get("approver_id")] if first_item else []
                total_levels = len(approval_chain)
            elif approver_id:
                current_approvers = [approver_id]
                total_levels = 1
            else:
                print("Warning: Assignment requires approval but no approver_id set")
                return
            
            # Get submitter info
            submitter = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1})
            submitter_email = submitter.get("email", "") if submitter else ""
            submitter_name = submitter.get("full_name", "") if submitter else ""
            
            # Get category config to include field definitions
            category_config = await self.get_category_by_name(
                section, 
                record.get("category"), 
                record.get("subcategory")
            )
            field_definitions = category_config.get("fields", []) if category_config else []
            
            now = datetime.now(timezone.utc).isoformat()
            
            # Build entity_snapshot with edit info if applicable
            entity_snapshot = {
                "category": record.get("category"),
                "subcategory": record.get("subcategory"),
                "sub_subcategory": record.get("sub_subcategory"),
                "field_values": record.get("field_values"),
                "field_definitions": field_definitions,
                "reporting_period": record.get("reporting_period"),
                "facility_id": record.get("facility_id"),
            }
            
            # Add edit-specific info if this is a re-approval
            if is_edit:
                entity_snapshot["is_edit"] = True
                entity_snapshot["changes_summary"] = changes_summary or []
                if previous_snapshot:
                    entity_snapshot["previous_field_values"] = previous_snapshot.get("field_values", {})
            
            # Create approval request document
            approval_request = {
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "workflow_id": f"assignment_{assignment.get('id')}",  # Link to assignment
                "workflow_name": f"ESG Record {'Edit' if is_edit else ''} Approval - {record.get('category')}",
                
                # Entity being approved
                "entity_type": "esg_record",
                "entity_id": record.get("id"),
                "entity_subtype": section,
                "entity_snapshot": entity_snapshot,
                
                # Submission info
                "submitted_by": user_id,
                "submitted_by_email": submitter_email,
                "submitted_by_name": submitter_name,
                "submitted_at": now,
                "submission_comment": "Edited after approval" if is_edit else None,
                
                # Current state
                "status": "pending",
                "current_level": 1,
                "current_approvers": current_approvers,
                "total_levels": total_levels,
                
                # Progress tracking
                "steps_completed": [],
                
                # Metadata
                "created_at": now,
                "updated_at": now,
            }
            
            await db.approval_requests.insert_one(approval_request)
            print(f"Created approval request {approval_request['id']} for record {record.get('id')} (is_edit={is_edit})")
        except Exception as e:
            print(f"Warning: Failed to create approval request: {e}")

    
    async def _mark_task_completed(
        self,
        org_id: str,
        user_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        facility_id: Optional[str],
        reporting_period: Any,
        requires_approval: bool = False,
    ):
        """
        Mark the corresponding reporting task as completed when a record is saved.
        
        New architecture:
        - status = 'completed' (operational - user finished work)
        - approval_status = 'pending_approval' if requires_approval else 'not_required'
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
            
            # Find matching task - use task_assignees for new architecture
            # First find task by category/period, then verify user is assigned via esg_task_assignees
            task_query = {
                "organization_id": org_id,
                "category": category,
                "period_key": period_key,
                "status": {"$in": ["pending", "backfill_pending", "overdue", "in_progress", "reopened"]},
            }
            if subcategory:
                task_query["subcategory"] = subcategory
            if sub_subcategory:
                task_query["sub_subcategory"] = sub_subcategory
            if facility_id:
                task_query["facility_id"] = facility_id
            
            task = await db.esg_reporting_tasks.find_one(task_query, {"_id": 0, "id": 1})
            if not task:
                return
            
            # Verify user is assigned to this task
            assignee = await db.esg_task_assignees.find_one({
                "task_id": task["id"],
                "user_id": user_id,
                "is_active": True,
            })
            if not assignee:
                # Fallback: check legacy assigned_to_user_id (for backwards compatibility)
                legacy_task = await db.esg_reporting_tasks.find_one({
                    **task_query,
                    "assigned_to_user_id": user_id,
                })
                if not legacy_task:
                    return
            
            # Update task with new status architecture
            now = datetime.now(timezone.utc)
            update_doc = {
                "status": "completed",
                "completed_at": now,
                "completed_by_user_id": user_id,
                "updated_at": now,
                "approval_status": "pending_approval" if requires_approval else "not_required",
            }
            
            await db.esg_reporting_tasks.update_one(
                {"id": task["id"]},
                {"$set": update_doc}
            )
        except Exception as e:
            # Don't fail record creation if task update fails
            print(f"Warning: Failed to mark task as submitted: {e}")
    

    async def _revert_task_to_pending(
        self,
        org_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        facility_id: Optional[str],
        reporting_period: Any,
    ):
        """
        Revert a task back to pending when the associated record's reporting_period changes.
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
                month = rp.get("month")
                if isinstance(month, str) and not month.isdigit():
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
            
            if not period_key:
                return
            
            # Find and revert the task
            task_query = {
                "organization_id": org_id,
                "category": category,
                "period_key": period_key,
            }
            if subcategory:
                task_query["subcategory"] = subcategory
            if sub_subcategory:
                task_query["sub_subcategory"] = sub_subcategory
            if facility_id:
                task_query["facility_id"] = facility_id
            
            now = datetime.now(timezone.utc).isoformat()
            result = await db.esg_reporting_tasks.update_one(
                task_query,
                {"$set": {
                    "status": "pending",
                    "approval_status": "not_required",
                    "updated_at": now,
                }}
            )
            
            if result.modified_count > 0:
                print(f"Reverted task to pending for {category}/{subcategory} period={period_key}")
        except Exception as e:
            print(f"Warning: Failed to revert task to pending: {e}")

    async def update_record(
        self,
        section: ESG_SECTION,
        record_id: str,
        user_id: str,
        data: UpdateRecordRequest
    ) -> Optional[Dict[str, Any]]:
        """
        Update a record (creates new version).
        
        Dual-status architecture:
        - status: operational completion (completed, draft, reopened)
        - approval_status: governance state (not_required, pending_approval, approved, rejected)
        """
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
        
        # Check if this record's assignment requires approval
        # Must match exact subcategory to avoid cross-matching different subcategories
        requires_approval = False
        assignment_query = {
            "organization_id": current.get("org_id"),
            "category": current.get("category"),
            "entity_type": "record_category",
        }
        if current.get("facility_id"):
            assignment_query["facility_id"] = current.get("facility_id")
        if current.get("subcategory"):
            assignment_query["subcategory"] = current.get("subcategory")
        
        assignment = await db.esg_assignments.find_one(assignment_query, {"_id": 0})
        
        if assignment:
            requires_approval = assignment.get("requires_approval", False)
            print(f"Found assignment {assignment.get('id')} for {current.get('category')}/{current.get('subcategory')}, requires_approval={requires_approval}")
        else:
            print(f"No assignment found for {current.get('category')}/{current.get('subcategory')}, facility={current.get('facility_id')}")
        
        # Handle status updates with dual-status architecture
        # Map incoming status values to the correct dual-status fields
        if data.status is not None:
            incoming_status = data.status
            
            if incoming_status == "draft":
                # Draft: operational status is draft, no approval needed
                update_data["status"] = "draft"
                update_data["approval_status"] = "not_required"
                changed_fields.append("status")
                changed_fields.append("approval_status")
            elif incoming_status in ["submitted", "completed"]:
                # Completing the record: status = completed, approval_status based on workflow
                update_data["status"] = "completed"
                update_data["approval_status"] = "pending_approval" if requires_approval else "not_required"
                changed_fields.append("status")
                changed_fields.append("approval_status")
            else:
                # Pass through other statuses directly (reopened, etc.)
                update_data["status"] = incoming_status
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
        
        # Determine if approval request needs to be created
        # Case 1: Status changed to completed from draft/rejected/reopened/pending (new submission)
        # Case 2: Already approved record is edited (re-submission for approval)
        new_status = update_data.get("status")
        old_status = current.get("status")
        old_approval_status = current.get("approval_status")
        
        should_create_approval = False
        is_edit_of_approved = False
        
        print(f"Update record check: new_status={new_status}, old_status={old_status}, old_approval_status={old_approval_status}, changed_fields={changed_fields}")
        
        if new_status == "completed" and old_status in ["rejected", "draft", "reopened", "pending"]:
            # New submission
            should_create_approval = requires_approval
            print(f"Case 1: New submission, should_create_approval={should_create_approval}")
        elif old_approval_status == "approved" and "field_values" in changed_fields:
            # Edit of an approved record - needs re-approval
            should_create_approval = requires_approval
            is_edit_of_approved = True
            print(f"Case 2: Edit of approved record, should_create_approval={should_create_approval}")
            # Update approval_status back to pending
            await collection.update_one(
                {"id": record_id, "is_current": True},
                {"$set": {"approval_status": "pending_approval" if requires_approval else "not_required"}}
            )
            updated["approval_status"] = "pending_approval" if requires_approval else "not_required"
        
        # If status changed to completed, mark the task as completed
        if new_status == "completed" and old_status in ["rejected", "draft", "reopened", "pending"]:
            await self._mark_task_completed(
                org_id=current.get("org_id"),
                user_id=user_id,
                category=current.get("category"),
                subcategory=current.get("subcategory"),
                sub_subcategory=current.get("sub_subcategory"),
                facility_id=current.get("facility_id"),
                reporting_period=updated.get("reporting_period"),  # Use NEW period
                requires_approval=requires_approval,
            )
        
        # Handle reporting_period change on a completed record
        # If user changes the period, revert OLD task to pending and mark NEW task as completed
        if "reporting_period" in changed_fields and current.get("status") == "completed":
            old_period = current.get("reporting_period")
            new_period = updated.get("reporting_period")
            
            print(f"Reporting period changed from {old_period} to {new_period}")
            
            # Revert the old task back to pending
            await self._revert_task_to_pending(
                org_id=current.get("org_id"),
                category=current.get("category"),
                subcategory=current.get("subcategory"),
                sub_subcategory=current.get("sub_subcategory"),
                facility_id=current.get("facility_id"),
                reporting_period=old_period,
            )
            
            # Mark the new task as completed
            await self._mark_task_completed(
                org_id=current.get("org_id"),
                user_id=user_id,
                category=current.get("category"),
                subcategory=current.get("subcategory"),
                sub_subcategory=current.get("sub_subcategory"),
                facility_id=current.get("facility_id"),
                reporting_period=new_period,
                requires_approval=requires_approval,
            )
        
        # Create approval request if needed
        if should_create_approval and assignment:
            print(f"Creating approval request for edit={is_edit_of_approved}")
            # Calculate changes for edit scenarios
            changes_summary = None
            if is_edit_of_approved:
                changes_summary = self._calculate_field_changes(
                    old_values=current.get("field_values", {}),
                    new_values=updated.get("field_values", {}),
                    old_record=current,
                    new_record=updated,
                )
                print(f"Changes summary: {changes_summary}")
            
            await self._create_approval_request(
                org_id=current.get("org_id"),
                record=updated,
                assignment=assignment,
                user_id=user_id,
                section=section,
                is_edit=is_edit_of_approved,
                changes_summary=changes_summary,
                previous_snapshot=current if is_edit_of_approved else None,
            )
        elif should_create_approval and not assignment:
            print("WARNING: should_create_approval=True but no assignment found!")
        
        # Create version snapshot with hierarchical field paths (paths only, not values)
        field_changes = compare_versions(current, updated) if current else []
        changed_field_paths = [c["field"] for c in field_changes]
        await self._create_version_snapshot(
            section=section,
            record_id=record_id,
            version=new_version,
            snapshot=updated,
            changed_fields=changed_field_paths,
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
        filters: RecordListFilters,
        assigned_categories: Optional[List[tuple]] = None,
    ) -> Dict[str, Any]:
        """
        List records with filtering and pagination.
        
        If assigned_categories is provided, only returns records matching those categories.
        assigned_categories is a list of (category, subcategory, sub_subcategory) tuples.
        """
        collection = self._get_records_collection(section)
        
        # Build query
        query = {"org_id": org_id, "is_current": True}
        
        # Handle single category or multiple categories
        if filters.categories and len(filters.categories) > 0:
            query["category"] = {"$in": filters.categories}
        elif filters.category:
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
        
        # Filter by assigned categories for non-admin users
        if assigned_categories:
            # Build category filter conditions
            category_conditions = []
            for cat, subcat, sub_subcat in assigned_categories:
                condition = {"category": cat}
                # If subcategory is specified in assignment, filter by it
                if subcat:
                    condition["subcategory"] = subcat
                # If sub_subcategory is specified, add it
                if sub_subcat:
                    condition["sub_subcategory"] = sub_subcat
                category_conditions.append(condition)
            
            if category_conditions:
                # If other $or conditions exist, wrap them together
                if "$or" in query:
                    existing_or = query.pop("$or")
                    query["$and"] = [
                        {"$or": existing_or},
                        {"$or": category_conditions}
                    ]
                else:
                    query["$or"] = category_conditions
        
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
        org_id: str,
        user_id: Optional[str] = None,
    ) -> bool:
        """
        Hard delete a record from database.
        Also reverts the associated task status back to 'pending' and cancels approval requests.
        """
        collection = self._get_records_collection(section)
        
        # First, get the record details to find the associated task
        record = await collection.find_one(
            {"id": record_id, "org_id": org_id, "is_current": True},
            {"_id": 0}
        )
        
        if not record:
            return False
        
        # Hard delete the record
        result = await collection.delete_one(
            {"id": record_id, "org_id": org_id, "is_current": True}
        )
        
        if result.deleted_count > 0:
            # Revert the associated task status back to pending
            await self._revert_task_to_pending(
                org_id=org_id,
                category=record.get("category"),
                subcategory=record.get("subcategory"),
                sub_subcategory=record.get("sub_subcategory"),
                facility_id=record.get("facility_id"),
                reporting_period=record.get("reporting_period"),
            )
            
            # Cancel any pending approval requests for this record
            await db.approval_requests.update_many(
                {
                    "entity_type": "esg_record",
                    "entity_id": record_id,
                    "status": "pending",
                },
                {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        
        return result.deleted_count > 0
    
    async def _revert_task_to_pending(
        self,
        org_id: str,
        category: str,
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
        facility_id: Optional[str],
        reporting_period: Dict[str, Any],
    ):
        """
        Revert a task back to pending when its associated record is deleted.
        """
        try:
            # Determine period_key from reporting_period
            period_key = None
            rp = reporting_period if isinstance(reporting_period, dict) else {}
            
            rp_type = rp.get("reporting_type") or rp.get("type")
            if rp_type == "yearly":
                period_key = str(rp.get("year"))
            elif rp_type == "monthly":
                month = rp.get("month")
                if isinstance(month, str) and not month.isdigit():
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
                period_key = rp.get("date")
            elif rp_type == "weekly":
                period_key = rp.get("date")
            
            if not period_key:
                return
            
            # Find matching completed task
            task_query = {
                "organization_id": org_id,
                "category": category,
                "period_key": period_key,
                "status": "completed",  # Only revert completed tasks
            }
            if subcategory:
                task_query["subcategory"] = subcategory
            if sub_subcategory:
                task_query["sub_subcategory"] = sub_subcategory
            if facility_id:
                task_query["facility_id"] = facility_id
            
            task = await db.esg_reporting_tasks.find_one(task_query, {"_id": 0, "id": 1, "is_backfill": 1})
            if not task:
                return
            
            # Determine what status to revert to
            # If it was a backfill task, revert to backfill_pending, otherwise pending
            revert_status = "backfill_pending" if task.get("is_backfill") else "pending"
            
            # Update task to pending status
            now = datetime.now(timezone.utc)
            update_doc = {
                "status": revert_status,
                "approval_status": "not_required",
                "completed_at": None,
                "completed_by_user_id": None,
                "updated_at": now,
            }
            
            await db.esg_reporting_tasks.update_one(
                {"id": task["id"]},
                {"$set": update_doc}
            )
            
            print(f"Reverted task {task['id']} to {revert_status} after record deletion")
        except Exception as e:
            print(f"Warning: Failed to revert task status after record deletion: {e}")
    
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
        """Get all versions of a record with user names and field changes."""
        collection = self._get_versions_collection(section)
        cursor = collection.find(
            {"record_id": record_id},
            {"_id": 0}
        ).sort("version", -1)
        versions = await cursor.to_list(None)
        
        # Collect user IDs for bulk lookup
        user_ids = list(set(v.get("created_by") for v in versions if v.get("created_by")))
        user_map = {}
        if user_ids:
            users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(None)
            user_map = {u["id"]: u.get("name") or u.get("email", "Unknown") for u in users}
        
        # Process versions - compute field changes by comparing consecutive snapshots
        for i, v in enumerate(versions):
            if "snapshot" in v and isinstance(v["snapshot"], dict):
                v["snapshot"].pop("_id", None)
            
            # Add user name
            v["changed_by_name"] = user_map.get(v.get("created_by"), "Unknown")
            
            # Determine change type
            v["change_type"] = "created" if v.get("version") == 1 else "updated"
            
            # Use stored changed_fields paths to compute diffs from snapshots
            if v.get("version", 1) > 1 and i + 1 < len(versions):
                # Compute from snapshots using utility
                prev_snapshot = versions[i + 1].get("snapshot", {})
                curr_snapshot = v.get("snapshot", {})
                changes = compare_versions(prev_snapshot, curr_snapshot)
                v["field_diffs"] = [
                    {"field": c["field"], "display_name": format_field_display_name(c["field"]), "old_value": c["old"], "new_value": c["new"]}
                    for c in changes
                ]
            else:
                v["field_diffs"] = []
        
        return versions
    
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
        org_id: str,
        category: str = None,
        subcategory: str = None,
    ) -> Dict[str, Any]:
        """Get record statistics for an organization."""
        collection = self._get_records_collection(section)
        base_filter = {"org_id": org_id, "is_current": True}
        if category:
            base_filter["category"] = category
        if subcategory:
            base_filter["subcategory"] = subcategory
        
        # Total records
        total = await collection.count_documents(base_filter)
        
        # By category
        pipeline = [
            {"$match": base_filter},
            {"$group": {"_id": "$category", "count": {"$sum": 1}}}
        ]
        by_category = {}
        async for doc in collection.aggregate(pipeline):
            by_category[doc["_id"]] = doc["count"]
        
        # By reporting type
        pipeline = [
            {"$match": base_filter},
            {"$group": {"_id": "$reporting_period.reporting_type", "count": {"$sum": 1}}}
        ]
        by_reporting_type = {}
        async for doc in collection.aggregate(pipeline):
            by_reporting_type[doc["_id"]] = doc["count"]
        
        # By status
        drafts = await collection.count_documents({**base_filter, "status": "draft"})
        completed = await collection.count_documents({**base_filter, "status": "completed"})
        
        # By approval_status
        approved = await collection.count_documents({**base_filter, "approval_status": "approved"})
        pending = await collection.count_documents({**base_filter, "approval_status": "pending_approval"})
        rejected = await collection.count_documents({**base_filter, "approval_status": "rejected"})
        not_required = await collection.count_documents({
            **base_filter,
            "$or": [{"approval_status": "not_required"}, {"approval_status": None}, {"approval_status": {"$exists": False}}]
        })
        
        # "submitted" = completed records (not draft) regardless of approval
        submitted = completed
        
        return {
            "total": total,
            "by_category": by_category,
            "by_reporting_type": by_reporting_type,
            "drafts": drafts,
            "submitted": submitted,
            "approved": approved,
            "pending_approval": pending,
            "rejected": rejected,
            "not_required": not_required,
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
        Now includes multi-assignee data from esg_task_assignees.
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

        # Group assignments by category/subcategory to aggregate assignees
        # Key: (category, subcategory, sub_subcategory, facility_id)
        grouped = {}
        for assignment in assignments:
            key = (
                assignment.get("category"),
                assignment.get("subcategory"),
                assignment.get("sub_subcategory"),
                assignment.get("facility_id"),
            )
            if key not in grouped:
                grouped[key] = {
                    **assignment,
                    "assignees": [],  # New: list of all assignees
                }
            
            # Fetch assignees from the new esg_assignment_assignees table
            assignment_assignees = await db.esg_assignment_assignees.find(
                {"assignment_id": assignment.get("id"), "removed_at": None},
                {"_id": 0}
            ).to_list(100)
            
            for assignee_record in assignment_assignees:
                user_id = assignee_record.get("user_id")
                if not user_id:
                    continue
                    
                # Get user details
                user = await db.users.find_one(
                    {"id": user_id},
                    {"_id": 0, "full_name": 1, "name": 1, "email": 1}
                )
                assignee_entry = {
                    "user_id": user_id,
                    "user_name": user.get("full_name") or user.get("name") if user else None,
                    "user_email": user.get("email") if user else None,
                    "role": assignee_record.get("role", "editor"),
                    "assignment_id": assignment.get("id"),
                    "assigned_at": assignee_record.get("assigned_at"),
                }
                
                # Avoid duplicates
                existing_ids = [a["user_id"] for a in grouped[key]["assignees"]]
                if user_id not in existing_ids:
                    grouped[key]["assignees"].append(assignee_entry)
            
            # Fallback: check legacy assigned_to_user_id for backwards compatibility
            if not grouped[key]["assignees"] and assignment.get("assigned_to_user_id"):
                user = await db.users.find_one(
                    {"id": assignment["assigned_to_user_id"]},
                    {"_id": 0, "full_name": 1, "name": 1, "email": 1}
                )
                assignee_entry = {
                    "user_id": assignment["assigned_to_user_id"],
                    "user_name": user.get("full_name") or user.get("name") if user else None,
                    "user_email": user.get("email") if user else None,
                    "role": "editor",
                    "assignment_id": assignment.get("id"),
                }
                grouped[key]["assignees"].append(assignee_entry)

        # Convert grouped dict back to list
        aggregated_assignments = list(grouped.values())

        # Enrich with facility names and staleness calculation
        for assignment in aggregated_assignments:
            # Set assigned_to_name from first assignee for backwards compatibility
            if assignment["assignees"]:
                assignment["assigned_to_name"] = assignment["assignees"][0].get("user_name")
                assignment["assigned_to_email"] = assignment["assignees"][0].get("user_email")
            
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
                        except (ValueError, TypeError):
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
            aggregated_assignments = [a for a in aggregated_assignments if a.get("staleness") == staleness]

        return aggregated_assignments

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
            # Get assignment IDs before deleting (for cleanup)
            old_assignments = await db.esg_assignments.find(base_query, {"_id": 0, "id": 1}).to_list(100)
            old_assignment_ids = [a["id"] for a in old_assignments]
            
            deleted = await db.esg_assignments.delete_many(base_query)
            
            # Clean up task_assignees for deleted assignments
            if old_assignment_ids:
                await db.esg_task_assignees.delete_many({"assignment_id": {"$in": old_assignment_ids}})
            
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
                        "approver_id": data.get("approver_id"),
                        "approval_chain": data.get("approval_chain", []),
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
                "requires_approval": data.get("requires_approval", False),
                "approver_id": data.get("approver_id"),
                "approval_chain": data.get("approval_chain", []),
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
                    task_result = await gen_tasks(db, assignment)
                    print(f"Task generation result for assignment {assignment_id}: {task_result}")
            except Exception as e:
                import traceback
                error_msg = f"Task generation failed: {str(e)}"
                print(f"ERROR: {error_msg}")
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=error_msg)

        # CASCADE: If assigning parent category (no subcategory), create child assignments
        cascade_results = []
        if data.get("assign_children") and not data.get("subcategory"):
            cascade_results = await self._cascade_assignment_to_children(
                org_id=org_id,
                assigned_by_user_id=assigned_by_user_id,
                parent_assignment_id=assignment_id,
                data=data,
            )

        # PROPAGATE APPROVAL: When a category-level assignment has requires_approval,
        # propagate approver settings to ALL subcategory assignments under that category
        # Only triggers for category-level assignments (no subcategory specified)
        propagated = 0
        if data.get("requires_approval") and not data.get("subcategory") and data.get("approver_id"):
            child_query = {
                "organization_id": org_id,
                "entity_type": "record_category",
                "category": data.get("category"),
                "subcategory": {"$ne": None},
            }
            result = await db.esg_assignments.update_many(
                child_query,
                {"$set": {
                    "requires_approval": True,
                    "approver_id": data.get("approver_id"),
                    "approval_chain": data.get("approval_chain", []),
                    "updated_at": now,
                }}
            )
            propagated = result.modified_count
            if propagated > 0:
                print(f"Propagated approval config to {propagated} subcategory assignments under {data.get('category')}")

        return {
            "id": assignment_id, 
            "status": "saved",
            "cascaded_assignments": len(cascade_results),
            "cascade_details": cascade_results,
            "propagated_approval": propagated,
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
                "subcategory": {"$exists": True, "$nin": [None, ""]},
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
                        task_result = await gen_tasks(db, assignment)
                        print(f"Task generation result for child assignment {child_assignment_id}: {task_result}")
                except Exception as e:
                    import traceback
                    print(f"ERROR: Task generation failed for child {subcat}/{sub_subcat}: {e}")
                    traceback.print_exc()
                    # Don't fail cascade, but log the error
        
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
