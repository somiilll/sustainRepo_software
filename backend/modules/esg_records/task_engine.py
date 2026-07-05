"""
ESG Reporting Task Generation Engine

Generates individual trackable tasks from assignments based on scheduling configuration.
Supports:
- Historical backfill tasks
- Active/future tasks with due dates
- Timezone-aware scheduling
- Status management
"""

from datetime import datetime, timedelta, timezone as tz
from typing import List, Dict, Optional, Any
from enum import Enum
import uuid
import calendar
from motor.motor_asyncio import AsyncIOMotorDatabase


class TaskStatus(str, Enum):
    BACKFILL_PENDING = "backfill_pending"  # Historical, needs data but not urgent
    PENDING = "pending"                     # Active, waiting for submission
    IN_PROGRESS = "in_progress"             # User started working on it
    SUBMITTED = "submitted"                 # Data submitted, awaiting approval
    APPROVED = "approved"                   # Approved/finalized
    OVERDUE = "overdue"                     # Past due date, no submission
    SKIPPED = "skipped"                     # Intentionally skipped (with reason)


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
        except:
            try:
                # Handle simple date format
                return datetime.strptime(date_val[:10], "%Y-%m-%d")
            except:
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
    Generate reporting tasks for an assignment.
    
    Deletes existing tasks for the assignment and creates new ones
    based on the current configuration.
    """
    assignment_id = assignment.get("id")
    org_id = assignment.get("organization_id")
    
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
    
    # Delete existing tasks for this assignment
    await db["esg_reporting_tasks"].delete_many({"assignment_id": assignment_id})
    
    # Create task documents
    now = datetime.now(tz.utc)
    tasks_to_insert = []
    
    for period in task_periods:
        # Determine initial status
        if period["is_backfill"]:
            status = TaskStatus.BACKFILL_PENDING.value
        elif period["task_type"] == TaskType.FUTURE.value:
            status = TaskStatus.PENDING.value
        elif period["due_at"] < datetime.now():
            status = TaskStatus.OVERDUE.value
        else:
            status = TaskStatus.PENDING.value
        
        task_doc = {
            "id": str(uuid.uuid4()),
            "assignment_id": assignment_id,
            "organization_id": org_id,
            "facility_id": assignment.get("facility_id"),
            "category": assignment.get("category"),
            "subcategory": assignment.get("subcategory"),
            "sub_subcategory": assignment.get("sub_subcategory"),
            "assigned_to_user_id": assignment.get("assigned_to_user_id"),
            "period_key": period["period_key"],
            "period_label": period["period_label"],
            "period_start": period["period_start"],
            "period_end": period["period_end"],
            "due_at": period["due_at"],
            "timezone": due_config.get("timezone", "UTC"),
            "task_type": period["task_type"],
            "is_backfill": period["is_backfill"],
            "status": status,
            "submitted_at": None,
            "approved_at": None,
            "skipped_reason": None,
            "created_at": now,
            "updated_at": now,
        }
        tasks_to_insert.append(task_doc)
    
    # Bulk insert
    if tasks_to_insert:
        await db["esg_reporting_tasks"].insert_many(tasks_to_insert)
    
    return {
        "assignment_id": assignment_id,
        "tasks_created": len(tasks_to_insert),
        "date_range": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
        "frequency": frequency,
    }


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
    """Get all tasks assigned to a user with assignment details."""
    query = {
        "assigned_to_user_id": user_id,
        "organization_id": organization_id,
    }
    
    if status_filter:
        query["status"] = {"$in": status_filter}
    
    if not include_backfill:
        query["is_backfill"] = False
    
    tasks = await db["esg_reporting_tasks"].find(
        query,
        {"_id": 0}
    ).sort("due_at", 1).to_list(500)
    
    # If domain filter is specified, we need to filter based on category's section
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
        
        # Filter tasks
        tasks = [
            t for t in tasks 
            if (t.get("category"), t.get("subcategory")) in valid_cats or
               (t.get("category"), None) in valid_cats
        ]
    
    # Enrich tasks with assignment details (filling_frequency, start_date, end_date)
    assignment_ids = list(set(t.get("assignment_id") for t in tasks if t.get("assignment_id")))
    if assignment_ids:
        assignments = await db["esg_assignments"].find(
            {"id": {"$in": assignment_ids}},
            {"_id": 0, "id": 1, "filling_frequency": 1, "start_date": 1, "end_date": 1, "due_config": 1}
        ).to_list(len(assignment_ids))
        
        assignment_map = {a["id"]: a for a in assignments}
        
        for task in tasks:
            assignment = assignment_map.get(task.get("assignment_id"), {})
            task["filling_frequency"] = assignment.get("filling_frequency")
            task["assignment_start_date"] = assignment.get("start_date")
            task["assignment_end_date"] = assignment.get("end_date")
    
    # Filter out parent category tasks if that category has subcategories
    # Get categories that have subcategories defined
    categories_with_subs = await db["esg_record_categories"].distinct(
        "category",
        {"subcategory": {"$ne": None, "$ne": ""}}
    )
    categories_with_subs_set = set(categories_with_subs)
    
    # Filter: exclude tasks where category has subcategories but task.subcategory is null/empty
    filtered_tasks = [
        t for t in tasks
        if not (t.get("category") in categories_with_subs_set and not t.get("subcategory"))
    ]
    
    return filtered_tasks


async def update_task_status(
    db: AsyncIOMotorDatabase,
    task_id: str,
    new_status: str,
    user_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Update a task's status."""
    now = datetime.now(tz.utc)
    
    update_doc = {
        "status": new_status,
        "updated_at": now,
    }
    
    if new_status == TaskStatus.SUBMITTED.value:
        update_doc["submitted_at"] = now
    elif new_status == TaskStatus.APPROVED.value:
        update_doc["approved_at"] = now
    elif new_status == TaskStatus.SKIPPED.value:
        update_doc["skipped_reason"] = reason
    
    result = await db["esg_reporting_tasks"].update_one(
        {"id": task_id},
        {"$set": update_doc}
    )
    
    return {"updated": result.modified_count > 0, "task_id": task_id, "new_status": new_status}


async def get_task_summary(
    db: AsyncIOMotorDatabase,
    organization_id: str,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Get summary statistics for tasks."""
    match_query = {"organization_id": organization_id}
    if user_id:
        match_query["assigned_to_user_id"] = user_id
    
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
        "submitted": 0,
        "approved": 0,
        "overdue": 0,
        "skipped": 0,
    }
    
    for r in results:
        status = r["_id"]
        count = r["count"]
        summary["total"] += count
        if status in summary:
            summary[status] = count
    
    return summary


async def refresh_overdue_tasks(
    db: AsyncIOMotorDatabase,
    organization_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Cron job helper: Mark pending tasks as overdue if past due date.
    Only affects non-backfill tasks.
    """
    now = datetime.now()
    
    query = {
        "status": TaskStatus.PENDING.value,
        "is_backfill": False,
        "due_at": {"$lt": now},
    }
    
    if organization_id:
        query["organization_id"] = organization_id
    
    result = await db["esg_reporting_tasks"].update_many(
        query,
        {"$set": {
            "status": TaskStatus.OVERDUE.value,
            "updated_at": datetime.now(tz.utc),
        }}
    )
    
    return {"marked_overdue": result.modified_count}
