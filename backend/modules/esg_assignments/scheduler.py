"""
Reminder Scheduler for ESG Assignments

Background job that checks for due reminders and triggers notifications.
Can be run as a cron job or background task.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from shared.database.mongo import db
from shared.helpers.email import send_email
from .service import assignment_service
from .models import AssignmentStatus
from .email_templates import (
    assignment_reminder_email,
    assignment_overdue_email,
)


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
        self._notifications = db["notifications"]
        self._organizations = db["organizations"]
    
    async def process_due_reminders(self) -> Dict[str, Any]:
        """
        Process all due reminders.
        
        Returns summary of processed reminders.
        """
        due_reminders = await assignment_service.get_due_reminders()
        
        processed = 0
        failed = 0
        emails_sent = 0
        
        for assignment in due_reminders:
            try:
                email_sent = await self._send_reminder(assignment)
                await assignment_service.mark_reminder_sent(assignment["id"])
                processed += 1
                if email_sent:
                    emails_sent += 1
            except Exception as e:
                logging.error(f"Failed to send reminder for assignment {assignment['id']}: {e}")
                failed += 1
        
        return {
            "processed": processed,
            "failed": failed,
            "emails_sent": emails_sent,
            "total_due": len(due_reminders),
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
    
    async def process_overdue_notifications(self) -> Dict[str, Any]:
        """
        Send summary emails for users with overdue assignments.
        
        Groups overdue assignments by user and sends one email per user.
        """
        # Get all organizations
        orgs_cursor = self._organizations.find({}, {"id": 1})
        orgs = await orgs_cursor.to_list(1000)
        
        total_users_notified = 0
        total_overdue = 0
        
        for org in orgs:
            org_id = org.get("id")
            if not org_id:
                continue
            
            overdue = await self.get_overdue_assignments(org_id)
            if not overdue:
                continue
            
            # Group by user - V2 architecture (multiple assignees per assignment)
            by_user = {}
            for a in overdue:
                # Get assignees from V2 architecture only
                assignee_ids = await self._get_assignment_assignees(a.get("id"), org_id)
                
                for user_id in assignee_ids:
                    if user_id not in by_user:
                        by_user[user_id] = []
                    by_user[user_id].append(a)
            
            # Send email to each user
            for user_id, user_overdue in by_user.items():
                try:
                    user = await self._users.find_one({"id": user_id}, {"email": 1, "name": 1})
                    if not user or not user.get("email"):
                        continue
                    
                    user_name = user.get("name") or user.get("email", "").split("@")[0]
                    email_body = assignment_overdue_email(
                        user_name=user_name,
                        overdue_count=len(user_overdue),
                        assignments=user_overdue,
                    )
                    
                    await send_email(
                        to_email=user["email"],
                        subject=f"⚠️ {len(user_overdue)} Overdue ESG Assignment(s) Require Attention",
                        body=email_body,
                    )
                    
                    total_users_notified += 1
                    total_overdue += len(user_overdue)
                except Exception as e:
                    logging.error(f"Failed to send overdue email to user {user_id}: {e}")
        
        return {
            "users_notified": total_users_notified,
            "total_overdue_assignments": total_overdue,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
    
    async def _send_reminder(self, assignment: Dict[str, Any]) -> bool:
        """
        Send reminder for an assignment.
        
        Creates in-app notification and sends email.
        Returns True if email was sent successfully.
        
        Uses V2 architecture (multiple assignees per assignment).
        """
        # Get assignees from V2 architecture only
        assignment_id = assignment.get("id")
        org_id = assignment.get("organization_id")
        assignee_ids = await self._get_assignment_assignees(assignment_id, org_id)
        
        additional_recipients = assignment.get("reminder_recipients") or []
        
        all_recipients = assignee_ids + additional_recipients
        
        # Get assignment details for notification
        entity_type = assignment.get("entity_type", "")
        entity_id = assignment.get("entity_id", "")
        due_date = assignment.get("due_date")
        status = assignment.get("status", "pending")
        reporting_period = assignment.get("reporting_period", "")
        
        # Build notification message
        due_str = ""
        if due_date:
            if isinstance(due_date, datetime):
                due_str = f" (Due: {due_date.strftime('%Y-%m-%d')})"
            else:
                due_str = f" (Due: {due_date})"
        
        message = f"Reminder: {entity_type.title()} '{entity_id}' is {status}{due_str}"
        
        now = datetime.now(timezone.utc)
        email_sent = False
        
        for user_id in all_recipients:
            # Create in-app notification
            notification = {
                "id": f"notif_{assignment['id']}_{user_id}_{now.timestamp()}",
                "user_id": user_id,
                "organization_id": org_id,
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
            
            # Send email
            try:
                user = await self._users.find_one({"id": user_id}, {"email": 1, "name": 1})
                if user and user.get("email"):
                    user_name = user.get("name") or user.get("email", "").split("@")[0]
                    
                    email_body = assignment_reminder_email(
                        user_name=user_name,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        status=status,
                        due_date=due_date,
                        reporting_period=reporting_period,
                    )
                    
                    success = await send_email(
                        to_email=user["email"],
                        subject=f"ESG Assignment Reminder: {entity_id}",
                        body=email_body,
                    )
                    
                    if success:
                        email_sent = True
            except Exception as e:
                logging.error(f"Failed to send reminder email to user {user_id}: {e}")
        
        return email_sent
    
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

    async def _get_assignment_assignees(
        self,
        assignment_id: str,
        organization_id: str,
    ) -> List[str]:
        """
        Get assignee user IDs for an assignment (V2 architecture).
        
        Note: organization_id filter is optional as some legacy data may not have it.
        
        TODO: Remove this method after migration when all uses consolidated.
        """
        # Query without org_id filter (some legacy data missing this field)
        assignees = await db.esg_assignment_assignees.find(
            {
                "assignment_id": assignment_id,
                "$or": [
                    {"removed_at": None},
                    {"removed_at": {"$exists": False}},
                ],
            },
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        
        return [a["user_id"] for a in assignees]



# Singleton instance
reminder_scheduler = ReminderScheduler()


async def run_reminder_job():
    """
    Entry point for cron job - processes due reminders.
    
    Can be called via:
    - python -m modules.esg_assignments.cron_job reminders
    """
    logging.info("Starting reminder job...")
    result = await reminder_scheduler.process_due_reminders()
    logging.info(f"Reminder job completed: {result}")
    return result


async def run_overdue_job():
    """
    Entry point for cron job - sends overdue summary emails.
    
    Can be called via:
    - python -m modules.esg_assignments.cron_job overdue
    """
    logging.info("Starting overdue notifications job...")
    result = await reminder_scheduler.process_overdue_notifications()
    logging.info(f"Overdue notifications job completed: {result}")
    return result

