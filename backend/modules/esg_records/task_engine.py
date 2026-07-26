"""
ESG Reporting Task Generation Engine

Generates individual trackable tasks from assignments based on scheduling configuration.

NOTE: Task status is now COMPUTED at query time by CompletionService.
The status stored in tasks is a cached value that may be stale.
Always use CompletionService.get_task_status() for accurate status.

Supports:
- Historical backfill tasks
- Active/future tasks with due dates
- Timezone-aware scheduling
"""

from datetime import datetime, timedelta, timezone as tz
from typing import List, Dict, Optional, Any
from enum import Enum
import uuid
import calendar
from motor.motor_asyncio import AsyncIOMotorDatabase


class TaskStatus(str, Enum):
    """Operational status - represents work completion state"""
    BACKFILL_PENDING = "backfill_pending"  # Historical, needs data but not urgent
    PENDING = "pending"                     # Active, waiting for submission
    IN_PROGRESS = "in_progress"             # User started working on it
    COMPLETED = "completed"                 # User finished their work
    OVERDUE = "overdue"                     # Past due date, no submission
    SKIPPED = "skipped"                     # Intentionally skipped (with reason)
    REOPENED = "reopened"                   # Rejected, needs resubmission


class ApprovalStatus(str, Enum):
    """Approval/governance status - separate from operational completion"""
    NOT_REQUIRED = "not_required"           # No approval workflow
    PENDING_APPROVAL = "pending_approval"   # Awaiting reviewer/approver
    APPROVED = "approved"                   # Approved by reviewer
    REJECTED = "rejected"                   # Rejected, user must fix


class TaskType(str, Enum):
    HISTORICAL = "historical"   # Before assignment creation date
    ACTIVE = "active"           # Current period
    FUTURE = "future"           # Future periods


def get_last_day_of_month(year: int, month: int) -> int:
    """Get the last day of a given month, handling leap years."""
    return calendar.monthrange(year, month)[1]


def adjust_day_for_month(day: int, year: int, month: int) -> int:
    """Adjust day if it exceeds the month's last day (e.g., 31 -> 28 for Feb)."""
    last_day = get_last_day_of_month(year, month)
    return min(day, last_day)


def parse_date(date_val) -> Optional[datetime]:
    """Parse date from various formats to datetime."""
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val.replace(tzinfo=None) if date_val.tzinfo else date_val
    if isinstance(date_val, str):
        try:
            # Handle ISO format with timezone
            return datetime.fromisoformat(date_val.replace('Z', '+00:00')).replace(tzinfo=None)
        except (ValueError, TypeError):
            try:
                # Handle simple date format
                return datetime.strptime(date_val[:10], "%Y-%m-%d")
            except (ValueError, TypeError):
                return None
    return None


def generate_task_periods(
    frequency: str,
    start_date: datetime,
    end_date: datetime,
    due_config: Dict[str, Any],
    assignment_created_at: datetime,
) -> List[Dict[str, Any]]:
    """
    Generate task periods based on frequency and date range.
    
    Returns list of task definitions with:
    - period_key: Unique identifier for the period
    - period_label: Human-readable label
    - period_start: Start of the period
    - period_end: End of the period
    - due_at: When data is due (datetime)
    - task_type: historical/active/future
    - is_backfill: True if before assignment creation
    """
    tasks = []
    now = datetime.now()
    
    due_time = due_config.get("time", "17:00")
    due_hour, due_minute = map(int, due_time.split(":"))
    
    if frequency == "daily":
        current = start_date
        while current <= end_date:
            due_at = current.replace(hour=due_hour, minute=due_minute, second=0)
            
            # Determine task type
            if current < assignment_created_at.replace(hour=0, minute=0, second=0):
                task_type = TaskType.HISTORICAL
                is_backfill = True
            elif current.date() == now.date():
                task_type = TaskType.ACTIVE
                is_backfill = False
            elif current > now:
                task_type = TaskType.FUTURE
                is_backfill = False
            else:
                task_type = TaskType.ACTIVE
                is_backfill = False
            
            tasks.append({
                "period_key": current.strftime("%Y-%m-%d"),
                "period_label": current.strftime("%d %b %Y"),
                "period_start": current,
                "period_end": current,
                "due_at": due_at,
                "task_type": task_type.value,
                "is_backfill": is_backfill,
            })
            current += timedelta(days=1)
    
    elif frequency == "weekly":
        day_of_week = due_config.get("day_of_week", "friday").lower()
        day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, 
                   "friday": 4, "saturday": 5, "sunday": 6}
        target_day = day_map.get(day_of_week, 4)
        
        current = start_date
        week_num = 1
        while current <= end_date:
            # Find end of week (or end_date if sooner)
            week_end = min(current + timedelta(days=6), end_date)
            
            # Due date is the target day of the week after the period
            days_until_due = (target_day - current.weekday()) % 7
            if days_until_due == 0:
                days_until_due = 7  # Next occurrence
            due_date = current + timedelta(days=days_until_due)
            due_at = due_date.replace(hour=due_hour, minute=due_minute, second=0)
            
            if current < assignment_created_at:
                task_type = TaskType.HISTORICAL
                is_backfill = True
            elif current <= now <= week_end:
                task_type = TaskType.ACTIVE
                is_backfill = False
            elif current > now:
                task_type = TaskType.FUTURE
                is_backfill = False
            else:
                task_type = TaskType.ACTIVE
                is_backfill = False
            
            tasks.append({
                "period_key": f"W{week_num:02d}-{current.strftime('%Y-%m-%d')}",
                "period_label": f"Week {week_num} ({current.strftime('%d %b')} - {week_end.strftime('%d %b')})",
                "period_start": current,
                "period_end": week_end,
                "due_at": due_at,
                "task_type": task_type.value,
                "is_backfill": is_backfill,
            })
            current = week_end + timedelta(days=1)
            week_num += 1
    
    elif frequency == "monthly":
        day_of_month = due_config.get("day_of_month", 1)
        current = start_date.replace(day=1)
        
        while current <= end_date:
            month_end = current.replace(day=get_last_day_of_month(current.year, current.month))
            
            # Adjust due day for month length
            adjusted_due_day = adjust_day_for_month(day_of_month, current.year, current.month)
            due_date = current.replace(day=adjusted_due_day)
            
            # If due date is before period start, push to next month
            if due_date < current:
                if current.month == 12:
                    next_month = current.replace(year=current.year + 1, month=1, day=1)
                else:
                    next_month = current.replace(month=current.month + 1, day=1)
                adjusted_due_day = adjust_day_for_month(day_of_month, next_month.year, next_month.month)
                due_date = next_month.replace(day=adjusted_due_day)
            
            due_at = due_date.replace(hour=due_hour, minute=due_minute, second=0)
            
            if month_end < assignment_created_at:
                task_type = TaskType.HISTORICAL
                is_backfill = True
            elif current <= now <= month_end:
                task_type = TaskType.ACTIVE
                is_backfill = False
            elif current > now:
                task_type = TaskType.FUTURE
                is_backfill = False
            else:
                task_type = TaskType.ACTIVE
                is_backfill = False
            
            tasks.append({
                "period_key": current.strftime("%Y-%m"),
                "period_label": current.strftime("%B %Y"),
                "period_start": current,
                "period_end": month_end,
                "due_at": due_at,
                "task_type": task_type.value,
                "is_backfill": is_backfill,
            })
            
            # Move to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    
    elif frequency == "quarterly":
        day_of_month = due_config.get("day_of_month", 1)
        quarter_end = due_config.get("quarter_end", True)
        
        # Determine quarters based on start date
        current = start_date.replace(day=1)
        q_month = ((current.month - 1) // 3) * 3 + 1  # Q1=1, Q2=4, Q3=7, Q4=10
        current = current.replace(month=q_month, day=1)
        quarter_num = 1
        
        while current <= end_date:
            q_end_month = q_month + 2
            q_end = datetime(current.year, q_end_month, get_last_day_of_month(current.year, q_end_month))
            
            # Due date: either end of quarter or specific day after quarter
            if quarter_end:
                due_date = q_end
            else:
                # Due on specific day of month after quarter ends
                if q_end_month == 12:
                    due_month_year = current.year + 1
                    due_month = 1
                else:
                    due_month_year = current.year
                    due_month = q_end_month + 1
                adjusted_due_day = adjust_day_for_month(day_of_month, due_month_year, due_month)
                due_date = datetime(due_month_year, due_month, adjusted_due_day)
            
            due_at = due_date.replace(hour=due_hour, minute=due_minute, second=0)
            
            if q_end < assignment_created_at:
                task_type = TaskType.HISTORICAL
                is_backfill = True
            elif current <= now <= q_end:
                task_type = TaskType.ACTIVE
                is_backfill = False
            elif current > now:
                task_type = TaskType.FUTURE
                is_backfill = False
            else:
                task_type = TaskType.ACTIVE
                is_backfill = False
            
            tasks.append({
                "period_key": f"{current.year}-Q{((q_month - 1) // 3) + 1}",
                "period_label": f"Q{((q_month - 1) // 3) + 1} {current.year}",
                "period_start": current,
                "period_end": q_end,
                "due_at": due_at,
                "task_type": task_type.value,
                "is_backfill": is_backfill,
            })
            
            # Move to next quarter
            q_month += 3
            if q_month > 12:
                q_month = 1
                current = datetime(current.year + 1, 1, 1)
            else:
                current = current.replace(month=q_month)
            quarter_num += 1
    
    elif frequency == "half_yearly":
        current = start_date.replace(day=1)
        h_month = 1 if current.month <= 6 else 7
        current = current.replace(month=h_month, day=1)
        half_num = 1
        
        while current <= end_date:
            h_end_month = 6 if h_month == 1 else 12
            h_end = datetime(current.year, h_end_month, get_last_day_of_month(current.year, h_end_month))
            
            day_of_month = due_config.get("day_of_month", 1)
            # Due 15 days after half-year ends
            due_date = h_end + timedelta(days=15)
            due_at = due_date.replace(hour=due_hour, minute=due_minute, second=0)
            
            if h_end < assignment_created_at:
                task_type = TaskType.HISTORICAL
                is_backfill = True
            elif current <= now <= h_end:
                task_type = TaskType.ACTIVE
                is_backfill = False
            elif current > now:
                task_type = TaskType.FUTURE
                is_backfill = False
            else:
                task_type = TaskType.ACTIVE
                is_backfill = False
            
            tasks.append({
                "period_key": f"{current.year}-H{1 if h_month == 1 else 2}",
                "period_label": f"H{1 if h_month == 1 else 2} {current.year}",
                "period_start": current,
                "period_end": h_end,
                "due_at": due_at,
                "task_type": task_type.value,
                "is_backfill": is_backfill,
            })
            
            # Move to next half
            if h_month == 1:
                h_month = 7
                current = current.replace(month=7)
            else:
                h_month = 1
                current = datetime(current.year + 1, 1, 1)
            half_num += 1
    
    elif frequency == "yearly":
        current = start_date.replace(month=1, day=1)
        
        while current <= end_date:
            year_end = datetime(current.year, 12, 31)
            
            day_of_month = due_config.get("day_of_month", 15)
            # Due 15 days after year ends (Jan 15 next year)
            due_date = datetime(current.year + 1, 1, min(day_of_month, 31))
            due_at = due_date.replace(hour=due_hour, minute=due_minute, second=0)
            
            if year_end < assignment_created_at:
                task_type = TaskType.HISTORICAL
                is_backfill = True
            elif current <= now <= year_end:
                task_type = TaskType.ACTIVE
                is_backfill = False
            elif current > now:
                task_type = TaskType.FUTURE
                is_backfill = False
            else:
                task_type = TaskType.ACTIVE
                is_backfill = False
            
            tasks.append({
                "period_key": str(current.year),
                "period_label": str(current.year),
                "period_start": current,
                "period_end": year_end,
                "due_at": due_at,
                "task_type": task_type.value,
                "is_backfill": is_backfill,
            })
            
            current = datetime(current.year + 1, 1, 1)
    
    return tasks


async def generate_tasks_for_assignment(
    db: AsyncIOMotorDatabase,
    assignment: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Generate reporting tasks for an assignment using SHARED TASK model.
    
    NEW ARCHITECTURE (V2):
    - ONE task per org/facility/category/subcategory/period (organizational obligation)
    - OR ONE task per org/question/period (for questionnaire assignments)
    - User assignments are tracked in esg_task_assignees collection
    - Tasks are NOT duplicated per user
    - Assignees are fetched from esg_assignment_assignees collection (V2 model)
    
    ENTITY TYPES:
    - record_category: KPI metrics (Water, Energy, GHG, etc.)
    - question: BRSR/GRI questionnaire questions
    
    This function:
    1. Generates task periods based on frequency
    2. Upserts tasks (creates if not exists, skips if exists)
    3. Fetches assignees from esg_assignment_assignees and links them to tasks
    """
    assignment_id = assignment.get("id")
    org_id = assignment.get("organization_id")
    entity_type = assignment.get("entity_type", "record_category")
    
    # Route to question task generator if entity_type is question
    if entity_type == "question":
        return await _generate_question_tasks(db, assignment)
    
    # Default: KPI metric task generation
    facility_id = assignment.get("facility_id")
    category = assignment.get("category")
    subcategory = assignment.get("subcategory")
    sub_subcategory = assignment.get("sub_subcategory")
    
    # V2: Fetch assignees from esg_assignment_assignees collection
    assignees = await db["esg_assignment_assignees"].find(
        {"assignment_id": assignment_id, "removed_at": None},
        {"_id": 0, "user_id": 1, "user_name": 1, "user_email": 1, "role": 1}
    ).to_list(100)
    
    if not assignees:
        # Log warning but continue - tasks can exist without assignees initially
        print(f"[TaskEngine] Warning: No assignees found for assignment {assignment_id}")
    
    # Parse dates
    start_date = parse_date(assignment.get("start_date"))
    end_date = parse_date(assignment.get("end_date"))
    created_at = parse_date(assignment.get("created_at")) or datetime.now()
    
    if not start_date:
        return {"error": "start_date is required for task generation", "tasks_created": 0}
    
    # Default end_date to end of current year if not specified
    if not end_date:
        end_date = datetime(datetime.now().year, 12, 31)
    
    frequency = assignment.get("filling_frequency")
    if not frequency:
        return {"error": "filling_frequency is required", "tasks_created": 0}
    
    due_config = assignment.get("due_config") or {
        "type": frequency,
        "time": "17:00",
        "timezone": assignment.get("timezone", "UTC"),
    }
    
    # Generate task periods
    task_periods = generate_task_periods(
        frequency=frequency,
        start_date=start_date,
        end_date=end_date,
        due_config=due_config,
        assignment_created_at=created_at,
    )
    
    if not task_periods:
        return {"error": "No task periods generated", "tasks_created": 0}
    
    now = datetime.now(tz.utc)
    tasks_created = 0
    tasks_existing = 0
    assignees_created = 0
    
    for period in task_periods:
        # Build unique key for this task
        task_unique_key = {
            "organization_id": org_id,
            "facility_id": facility_id,
            "category": category,
            "subcategory": subcategory,
            "sub_subcategory": sub_subcategory,
            "period_key": period["period_key"],
        }
        
        # Check if task already exists
        existing_task = await db["esg_reporting_tasks"].find_one(
            task_unique_key,
            {"_id": 0, "id": 1, "status": 1}
        )
        
        if existing_task:
            # Task exists, just ensure assignee is linked
            task_id = existing_task["id"]
            tasks_existing += 1
        else:
            # Create new task (organizational obligation)
            # NOTE: Status is NOT stored - it's computed on-the-fly by CompletionService
            task_id = str(uuid.uuid4())
            
            task_doc = {
                "id": task_id,
                "assignment_id": assignment_id,
                "organization_id": org_id,
                "facility_id": facility_id,
                "category": category,
                "subcategory": subcategory,
                "sub_subcategory": sub_subcategory,
                "period_key": period["period_key"],
                "period_label": period["period_label"],
                "period_start": period["period_start"],
                "period_end": period["period_end"],
                "due_at": period["due_at"],
                "timezone": due_config.get("timezone", "UTC"),
                "task_type": period["task_type"],
                "is_backfill": period["is_backfill"],
                # VERSIONING: Capture assignment state at task creation
                "assignment_version_at_creation": assignment.get("version", 1),
                "created_with_approval_workflow": assignment.get("requires_approval", False),
                "created_with_approver_id": assignment.get("approver_id"),
                "created_with_facility_snapshot": assignment.get("facility_snapshot"),
                # OWNERSHIP FIELDS: Track who submitted/completed the task
                # - submitted_by_user_id / submitted_at: Set when data is first submitted
                # - completed_by_user_id / completed_at: Set when approved (or immediately if no approval)
                # - approved_by_user_id / approved_at: Set when explicitly approved
                # These provide clear audit trail even after reassignments
                "submitted_by_user_id": None,
                "submitted_at": None,
                "completed_by_user_id": None,
                "completed_at": None,
                "approved_by_user_id": None,
                "approved_at": None,
                "created_at": now,
                "updated_at": now,
            }
            
            await db["esg_reporting_tasks"].insert_one(task_doc)
            tasks_created += 1
        
        # V2: Create assignee entries for ALL assignees from esg_assignment_assignees
        for assignee in assignees:
            user_id = assignee.get("user_id")
            if not user_id:
                continue
                
            assignee_exists = await db["esg_task_assignees"].find_one({
                "task_id": task_id,
                "user_id": user_id,
            })
            
            if not assignee_exists:
                assignee_doc = {
                    "id": str(uuid.uuid4()),
                    "task_id": task_id,
                    "assignment_id": assignment_id,
                    "organization_id": org_id,
                    "user_id": user_id,
                    "user_name": assignee.get("user_name"),
                    "user_email": assignee.get("user_email"),
                    "role": assignee.get("role", "editor"),
                    "assigned_by_user_id": assignment.get("created_by_user_id"),
                    "assigned_by_name": None,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                }
                await db["esg_task_assignees"].insert_one(assignee_doc)
                assignees_created += 1
    
    return {
        "assignment_id": assignment_id,
        "tasks_created": tasks_created,
        "tasks_existing": tasks_existing,
        "assignees_created": assignees_created,
        "date_range": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
        "frequency": frequency,
    }


async def _generate_question_tasks(
    db: AsyncIOMotorDatabase,
    assignment: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Generate tasks for a questionnaire (question) assignment.
    
    Similar to KPI metric task generation but:
    - Uses entity_type/entity_id instead of category/subcategory
    - Questions are typically org-level (no facility breakdown)
    - Task unique key is org + entity_id + period_key
    """
    assignment_id = assignment.get("id")
    org_id = assignment.get("organization_id")
    entity_id = assignment.get("entity_id")  # question_key
    section = assignment.get("section")
    framework_id = assignment.get("framework_id")
    
    # V2: Fetch assignees from esg_assignment_assignees collection
    assignees = await db["esg_assignment_assignees"].find(
        {"assignment_id": assignment_id, "removed_at": None},
        {"_id": 0, "user_id": 1, "user_name": 1, "user_email": 1, "role": 1}
    ).to_list(100)
    
    if not assignees:
        print(f"[TaskEngine] Warning: No assignees found for question assignment {assignment_id}")
    
    # Parse dates
    start_date = parse_date(assignment.get("start_date"))
    end_date = parse_date(assignment.get("end_date"))
    created_at = parse_date(assignment.get("created_at")) or datetime.now()
    
    if not start_date:
        return {"error": "start_date is required for task generation", "tasks_created": 0}
    
    if not end_date:
        end_date = datetime(datetime.now().year, 12, 31)
    
    # Questionnaires are typically yearly
    frequency = assignment.get("filling_frequency", "yearly")
    
    due_config = assignment.get("due_config") or {
        "type": frequency,
        "time": "17:00",
        "timezone": assignment.get("timezone", "UTC"),
    }
    
    # Generate task periods
    task_periods = generate_task_periods(
        frequency=frequency,
        start_date=start_date,
        end_date=end_date,
        due_config=due_config,
        assignment_created_at=created_at,
    )
    
    if not task_periods:
        return {"error": "No task periods generated", "tasks_created": 0}
    
    now = datetime.now(tz.utc)
    tasks_created = 0
    tasks_existing = 0
    assignees_created = 0
    
    for period in task_periods:
        # Build unique key for question task
        task_unique_key = {
            "organization_id": org_id,
            "entity_type": "question",
            "entity_id": entity_id,
            "period_key": period["period_key"],
        }
        
        # Check if task already exists
        existing_task = await db["esg_reporting_tasks"].find_one(
            task_unique_key,
            {"_id": 0, "id": 1, "status": 1}
        )
        
        if existing_task:
            task_id = existing_task["id"]
            tasks_existing += 1
        else:
            # Create new question task
            task_id = str(uuid.uuid4())
            
            task_doc = {
                "id": task_id,
                "assignment_id": assignment_id,
                "organization_id": org_id,
                "entity_type": "question",
                "entity_id": entity_id,
                "section": section,
                "framework_id": framework_id,
                "question_title": assignment.get("question_title"),
                # No category/subcategory/facility for question tasks
                "facility_id": None,
                "category": None,
                "subcategory": None,
                "sub_subcategory": None,
                "period_key": period["period_key"],
                "period_label": period["period_label"],
                "period_start": period["period_start"],
                "period_end": period["period_end"],
                "due_at": period["due_at"],
                "timezone": due_config.get("timezone", "UTC"),
                "task_type": period["task_type"],
                "is_backfill": period["is_backfill"],
                # VERSIONING
                "assignment_version_at_creation": assignment.get("version", 1),
                "created_with_approval_workflow": assignment.get("requires_approval", False),
                "created_with_approver_id": assignment.get("approver_id"),
                # OWNERSHIP FIELDS
                "submitted_by_user_id": None,
                "submitted_at": None,
                "completed_by_user_id": None,
                "completed_at": None,
                "approved_by_user_id": None,
                "approved_at": None,
                "created_at": now,
                "updated_at": now,
            }
            
            await db["esg_reporting_tasks"].insert_one(task_doc)
            tasks_created += 1
        
        # Create assignee entries
        for assignee in assignees:
            user_id = assignee.get("user_id")
            if not user_id:
                continue
            
            assignee_exists = await db["esg_task_assignees"].find_one({
                "task_id": task_id,
                "user_id": user_id,
            })
            
            if not assignee_exists:
                assignee_doc = {
                    "id": str(uuid.uuid4()),
                    "task_id": task_id,
                    "assignment_id": assignment_id,
                    "user_id": user_id,
                    "user_name": assignee.get("user_name"),
                    "user_email": assignee.get("user_email"),
                    "role": assignee.get("role", "editor"),
                    "is_active": True,
                    "assigned_at": now,
                }
                await db["esg_task_assignees"].insert_one(assignee_doc)
                assignees_created += 1
    
    return {
        "assignment_id": assignment_id,
        "entity_type": "question",
        "entity_id": entity_id,
        "tasks_created": tasks_created,
        "tasks_existing": tasks_existing,
        "assignees_created": assignees_created,
        "periods": len(task_periods),
    }


async def regenerate_tasks_for_assignment(
    db: AsyncIOMotorDatabase,
    assignment: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Regenerate tasks when frequency or dates change on an assignment.

    SMART REGENERATION RULES:
    - Completed tasks (verified by checking actual records): NEVER modify/delete
    - Pending/overdue tasks (no records): Can be reassigned or deleted
    - New periods: Generate tasks only for periods that don't already exist
    - Historical records: Always preserve original assignee and workflow config
    
    Status is COMPUTED from actual data records, NOT from stored task.status field.
    """
    from modules.esg_assignments.completion_service import completion_service, DataChecker
    
    org_id = assignment.get("organization_id")
    facility_id = assignment.get("facility_id")
    category = assignment.get("category")
    subcategory = assignment.get("subcategory")
    sub_subcategory = assignment.get("sub_subcategory")
    assignment_id = assignment.get("id")

    # Step 1: Find all existing tasks for this assignment's category/facility
    task_query = {
        "organization_id": org_id,
        "facility_id": facility_id,
        "category": category,
        "subcategory": subcategory,
        "sub_subcategory": sub_subcategory,
    }

    existing_tasks = await db["esg_reporting_tasks"].find(
        task_query, {"_id": 0, "id": 1, "period_key": 1, "status": 1, "due_at": 1, "is_backfill": 1}
    ).to_list(5000)

    # Step 2: Check ACTUAL record existence (single source of truth)
    # Status is computed from data, NOT from stored task.status
    completed_period_keys = set()
    pending_task_ids = []

    for task in existing_tasks:
        period_key = task.get("period_key")
        
        # Check if actual data exists for this period (computed status)
        has_data, _, approval_status = await DataChecker.check_exists(
            org_id, category, subcategory, facility_id, period_key
        )
        
        if has_data:
            # Data exists - task is completed (regardless of stored status)
            completed_period_keys.add(period_key)
        else:
            # No data - task is pending/overdue, can be modified
            pending_task_ids.append(task["id"])

    # Step 3: Delete only pending tasks (no data) and their assignees
    # NEVER delete tasks that have actual data records
    deleted_count = 0
    if pending_task_ids:
        await db["esg_reporting_tasks"].delete_many({"id": {"$in": pending_task_ids}})
        await db["esg_task_assignees"].delete_many({"task_id": {"$in": pending_task_ids}})
        deleted_count = len(pending_task_ids)

    # Step 4: Generate new tasks (will skip periods that already have completed tasks)
    result = await generate_tasks_for_assignment(db, assignment)
    result["deleted_pending"] = deleted_count
    result["preserved_completed"] = len(completed_period_keys)
    result["preserved_period_keys"] = list(completed_period_keys)

    return result




async def get_tasks_for_assignment(
    db: AsyncIOMotorDatabase,
    assignment_id: str,
    status_filter: Optional[str] = None,
    task_type_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get all tasks for an assignment with optional filters."""
    query = {"assignment_id": assignment_id}
    
    if status_filter:
        query["status"] = status_filter
    if task_type_filter:
        query["task_type"] = task_type_filter
    
    tasks = await db["esg_reporting_tasks"].find(
        query,
        {"_id": 0}
    ).sort("period_start", 1).to_list(1000)
    
    return tasks


async def get_tasks_for_user(
    db: AsyncIOMotorDatabase,
    user_id: str,
    organization_id: str,
    status_filter: Optional[List[str]] = None,
    include_backfill: bool = False,
    domain: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Get all tasks assigned to a user via esg_task_assignees join.
    
    New architecture: Tasks are organizational obligations, users are linked via esg_task_assignees.
    
    IMPORTANT: Task status is now COMPUTED on-the-fly using CompletionService,
    not read from the stored task.status field (which may be stale).
    """
    # Import CompletionService for computed status
    from modules.esg_assignments.completion_service import completion_service
    
    # Step 1: Get task IDs this user is assigned to
    assignee_query = {
        "user_id": user_id,
        "organization_id": organization_id,
        "is_active": True,
    }
    
    user_assignees = await db["esg_task_assignees"].find(
        assignee_query,
        {"_id": 0, "task_id": 1, "assignment_id": 1, "role": 1}
    ).to_list(500)
    
    if not user_assignees:
        return []
    
    task_ids = [a["task_id"] for a in user_assignees]
    assignee_map = {a["task_id"]: a for a in user_assignees}
    
    # Step 2: Query tasks by IDs (don't filter by status here - we compute it)
    task_query = {
        "id": {"$in": task_ids},
        "organization_id": organization_id,
    }
    
    if not include_backfill:
        task_query["is_backfill"] = False
    
    tasks = await db["esg_reporting_tasks"].find(
        task_query,
        {"_id": 0}
    ).sort("due_at", 1).to_list(500)
    
    # Step 3: Compute status AND approval_status for each task using CompletionService
    # Both are computed from RECORDS - tasks don't store status
    for task in tasks:
        computed_status, computed_approval = await completion_service.get_task_status_with_approval(task)
        task["status"] = computed_status.value
        task["computed_status"] = computed_status.value
        task["approval_status"] = computed_approval  # From records, not stored on task
        
        # Add assignee role info
        assignee_info = assignee_map.get(task["id"], {})
        task["user_role"] = assignee_info.get("role", "editor")
    
    # Step 4: Apply status filter AFTER computing status
    if status_filter:
        tasks = [t for t in tasks if t.get("status") in status_filter]
    
    # If domain filter is specified, we need to filter based on category's section
    # OR include question tasks from BRSR/GRI frameworks
    if domain and domain != 'all':
        # Get all categories for this section/domain
        domain_categories = await db["esg_record_categories"].find(
            {"section": domain},
            {"category": 1, "subcategory": 1}
        ).to_list(500)
        
        # Create a set of valid category combinations for this domain
        valid_cats = set()
        for cat in domain_categories:
            valid_cats.add((cat.get("category"), cat.get("subcategory")))
            # Also add just the category for tasks that might not have subcategory
            valid_cats.add((cat.get("category"), None))
        
        # Filter tasks: include KPI metrics matching category OR question tasks
        # Question tasks (entity_type="question") are included for all domains for now
        # In future, could filter by framework or section
        tasks = [
            t for t in tasks 
            if t.get("entity_type") == "question" or  # Include all question tasks
               (t.get("category"), t.get("subcategory")) in valid_cats or
               (t.get("category"), None) in valid_cats
        ]
    
    # Enrich tasks with assignment details (filling_frequency, start_date, end_date, requires_approval)
    assignment_ids = list(set(t.get("assignment_id") for t in tasks if t.get("assignment_id")))
    if assignment_ids:
        assignments = await db["esg_assignments"].find(
            {"id": {"$in": assignment_ids}},
            {"_id": 0, "id": 1, "filling_frequency": 1, "start_date": 1, "end_date": 1, "due_config": 1, "requires_approval": 1}
        ).to_list(len(assignment_ids))
        
        assignment_map = {a["id"]: a for a in assignments}
        
        for task in tasks:
            assignment = assignment_map.get(task.get("assignment_id"), {})
            task["filling_frequency"] = assignment.get("filling_frequency")
            task["assignment_start_date"] = assignment.get("start_date")
            task["assignment_end_date"] = assignment.get("end_date")
            task["requires_approval"] = assignment.get("requires_approval", False)
    
    # Filter out parent category tasks if that category has subcategories
    # Get categories that have subcategories defined
    categories_with_subs = await db["esg_record_categories"].distinct(
        "category",
        {"subcategory": {"$nin": [None, ""]}}
    )
    categories_with_subs_set = set(categories_with_subs)
    
    # Filter: exclude tasks where category has subcategories but task.subcategory is null/empty
    # BUT: Don't filter question tasks (they don't have category/subcategory)
    filtered_tasks = [
        t for t in tasks
        if t.get("entity_type") == "question" or  # Keep all question tasks
           not (t.get("category") in categories_with_subs_set and not t.get("subcategory"))
    ]
    
    # Enrich tasks with facility names
    facility_ids = list(set(t.get("facility_id") for t in filtered_tasks if t.get("facility_id")))
    if facility_ids:
        facilities = await db["facilities"].find(
            {"id": {"$in": facility_ids}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(len(facility_ids))
        facility_map = {f["id"]: f["name"] for f in facilities}
        
        for task in filtered_tasks:
            if task.get("facility_id"):
                task["facility_name"] = facility_map.get(task["facility_id"], "Unknown Facility")
    
    return filtered_tasks


async def update_task_status(
    db: AsyncIOMotorDatabase,
    task_id: str,
    new_status: str,
    approval_status: Optional[str] = None,
    user_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """
    DEPRECATED: Task status AND approval_status are now computed from RECORDS, not stored.
    
    This function now only updates audit metadata (timestamps, user IDs).
    Status is computed by CompletionService.get_task_status_with_approval().
    
    Use this function only for:
    - Recording metadata (who submitted, when approved, rejection reason, etc.)
    """
    now = datetime.now(tz.utc)
    
    # NOTE: We no longer store task.status OR approval_status - both computed from records
    update_doc = {
        "updated_at": now,
    }
    
    # Track submission timestamp (still useful for audit)
    if new_status == TaskStatus.COMPLETED.value:
        update_doc["submitted_at"] = now
        if user_id:
            update_doc["submitted_by_user_id"] = user_id
    
    # Track approval timestamp (audit trail, not source of truth)
    if approval_status == ApprovalStatus.APPROVED.value:
        update_doc["approved_at"] = now
        if user_id:
            update_doc["approved_by_user_id"] = user_id
    
    # Track rejection (audit trail)
    if approval_status == ApprovalStatus.REJECTED.value:
        update_doc["rejected_at"] = now
        if user_id:
            update_doc["rejected_by_user_id"] = user_id
        if reason:
            update_doc["rejection_reason"] = reason
    
    # Track skip reason
    if new_status == TaskStatus.SKIPPED.value:
        update_doc["skipped_at"] = now
        update_doc["skipped_reason"] = reason
    
    result = await db["esg_reporting_tasks"].update_one(
        {"id": task_id},
        {"$set": update_doc}
    )
    
    return {
        "updated": result.modified_count > 0, 
        "task_id": task_id, 
        "new_status": new_status,
        "approval_status": approval_status,
    }


async def get_task_summary(
    db: AsyncIOMotorDatabase,
    organization_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Get summary statistics for tasks (using esg_task_assignees for user filter)."""
    
    if user_id:
        # Get task IDs assigned to this user
        user_assignees = await db["esg_task_assignees"].find(
            {"user_id": user_id, "organization_id": organization_id, "is_active": True},
            {"task_id": 1}
        ).to_list(500)
        task_ids = [a["task_id"] for a in user_assignees]
        
        if not task_ids:
            return {
                "total": 0, "backfill_pending": 0, "pending": 0, "in_progress": 0,
                "submitted": 0, "approved": 0, "overdue": 0, "skipped": 0,
            }
        
        match_query = {"id": {"$in": task_ids}, "organization_id": organization_id}
    else:
        match_query = {"organization_id": organization_id}
    
    pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1}
        }}
    ]
    
    results = await db["esg_reporting_tasks"].aggregate(pipeline).to_list(100)
    
    summary = {
        "total": 0,
        "backfill_pending": 0,
        "pending": 0,
        "in_progress": 0,
        "completed": 0,
        "overdue": 0,
        "skipped": 0,
        "reopened": 0,
        # Approval breakdown
        "pending_approval": 0,
        "approved": 0,
        "rejected": 0,
    }
    
    for r in results:
        status = r["_id"]
        count = r["count"]
        summary["total"] += count
        if status in summary:
            summary[status] = count
    
    # Also get approval_status breakdown
    approval_pipeline = [
        {"$match": match_query},
        {"$group": {
            "_id": "$approval_status",
            "count": {"$sum": 1}
        }}
    ]
    approval_results = await db["esg_reporting_tasks"].aggregate(approval_pipeline).to_list(100)
    
    for r in approval_results:
        approval_status = r["_id"]
        if approval_status == "pending_approval":
            summary["pending_approval"] = r["count"]
        elif approval_status == "approved":
            summary["approved"] = r["count"]
        elif approval_status == "rejected":
            summary["rejected"] = r["count"]
    
    return summary


async def refresh_overdue_tasks(
    db: AsyncIOMotorDatabase,
    organization_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    DEPRECATED: Task status (including overdue) is now computed from data.
    
    Overdue status is determined by CompletionService.get_task_status() which
    checks if due_at < now AND no data exists.
    
    This function is kept for backwards compatibility but does nothing.
    The overdue calculation is done in completion_service.py lines 682-690.
    """
    # No-op: Status is computed, not stored
    return {"marked_overdue": 0, "note": "Status is now computed dynamically"}



async def remove_assignee_for_assignment(
    db: AsyncIOMotorDatabase,
    assignment_id: str,
) -> Dict[str, Any]:
    """
    Remove task assignees when an assignment is deleted.
    
    This soft-deletes (is_active=False) assignee records linked to the assignment.
    Tasks themselves are NOT deleted (they may have other assignees).
    """
    result = await db["esg_task_assignees"].update_many(
        {"assignment_id": assignment_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(tz.utc)}}
    )
    return {"deactivated": result.modified_count}


async def get_task_assignees(
    db: AsyncIOMotorDatabase,
    task_id: str,
    include_inactive: bool = False,
) -> List[Dict[str, Any]]:
    """Get all assignees for a task."""
    query = {"task_id": task_id}
    if not include_inactive:
        query["is_active"] = True
    
    assignees = await db["esg_task_assignees"].find(
        query, {"_id": 0}
    ).to_list(100)
    
    return assignees
