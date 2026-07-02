"""
Reminder Scheduler for ESG Assignments

Background job that checks for due reminders and triggers notifications.
Can be run as a cron job or background task.
"""

import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any
from shared.database.mongo import db
from .service import assignment_service
from .models import AssignmentStatus


class ReminderScheduler:
    """
    Scheduler for sending assignment reminders.
    
    Usage:
        scheduler = ReminderScheduler()
        await scheduler.process_due_reminders()
    
    Can be called from:
    - Cron job
    - Background task
    - API endpoint (for manual trigger)
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._users = db["users"]
        self._notifications = db["notifications"]  # For in-app notifications
    
    async def process_due_reminders(self) -> Dict[str, Any]:
        """
        Process all due reminders.
        
        Returns summary of processed reminders.
        """
        due_reminders = await assignment_service.get_due_reminders()
        
        processed = 0
        failed = 0
        
        for assignment in due_reminders:
            try:
                await self._send_reminder(assignment)
                await assignment_service.mark_reminder_sent(assignment["id"])
                processed += 1
            except Exception as e:
                print(f"Failed to send reminder for assignment {assignment['id']}: {e}")
                failed += 1
        
        return {
            "processed": processed,
            "failed": failed,
            "total_due": len(due_reminders),
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
    
    async def _send_reminder(self, assignment: Dict[str, Any]):
        """
        Send reminder for an assignment.
        
        Creates in-app notification. Can be extended to send emails.
        """
        assigned_user_id = assignment.get("assigned_to_user_id")
        additional_recipients = assignment.get("reminder_recipients") or []
        
        all_recipients = [assigned_user_id] + additional_recipients
        
        # Get assignment details for notification
        entity_type = assignment.get("entity_type")
        entity_id = assignment.get("entity_id")
        due_date = assignment.get("due_date")
        status = assignment.get("status")
        
        # Build notification message
        due_str = ""
        if due_date:
            if isinstance(due_date, datetime):
                due_str = f" (Due: {due_date.strftime('%Y-%m-%d')})"
            else:
                due_str = f" (Due: {due_date})"
        
        message = f"Reminder: {entity_type.title()} '{entity_id}' is {status}{due_str}"
        
        # Create notifications for all recipients
        now = datetime.now(timezone.utc)
        
        for user_id in all_recipients:
            notification = {
                "id": f"notif_{assignment['id']}_{user_id}_{now.timestamp()}",
                "user_id": user_id,
                "organization_id": assignment.get("organization_id"),
                "type": "assignment_reminder",
                "title": "ESG Assignment Reminder",
                "message": message,
                "assignment_id": assignment.get("id"),
                "entity_type": entity_type,
                "entity_id": entity_id,
                "read": False,
                "created_at": now,
            }
            
            await self._notifications.insert_one(notification)
    
    async def get_overdue_assignments(self, organization_id: str) -> List[Dict[str, Any]]:
        """Get all overdue assignments for an organization"""
        now = datetime.now(timezone.utc)
        
        cursor = self._assignments.find(
            {
                "organization_id": organization_id,
                "due_date": {"$lt": now},
                "status": {"$nin": [
                    AssignmentStatus.APPROVED.value,
                    AssignmentStatus.SUBMITTED.value,
                ]},
            },
            {"_id": 0}
        ).sort("due_date", 1)
        
        return await cursor.to_list(500)
    
    async def get_upcoming_deadlines(
        self,
        organization_id: str,
        days_ahead: int = 7,
    ) -> List[Dict[str, Any]]:
        """Get assignments with deadlines in the next X days"""
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=days_ahead)
        
        cursor = self._assignments.find(
            {
                "organization_id": organization_id,
                "due_date": {"$gte": now, "$lte": future},
                "status": {"$nin": [
                    AssignmentStatus.APPROVED.value,
                    AssignmentStatus.SUBMITTED.value,
                ]},
            },
            {"_id": 0}
        ).sort("due_date", 1)
        
        return await cursor.to_list(500)


# Import timedelta at the top level for get_upcoming_deadlines
from datetime import timedelta

# Singleton instance
reminder_scheduler = ReminderScheduler()


async def run_reminder_job():
    """
    Entry point for cron job.
    
    Can be called via:
    - python -c "import asyncio; from modules.esg_assignments.scheduler import run_reminder_job; asyncio.run(run_reminder_job())"
    """
    result = await reminder_scheduler.process_due_reminders()
    print(f"Reminder job completed: {result}")
    return result
