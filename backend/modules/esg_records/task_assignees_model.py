"""
ESG Task Assignees Model

This module defines the schema for task-to-user mappings.
Tasks are organizational reporting obligations; assignees are responsible users.

Architecture:
- ONE task = ONE reporting obligation (e.g., "Scope 1 Emissions - Jan 2026")
- MANY assignees = MANY responsible users for that task
"""

from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class AssigneeRole(str, Enum):
    """Roles for task assignees"""
    OWNER = "owner"           # Primary responsible person
    EDITOR = "editor"         # Can edit/submit data
    REVIEWER = "reviewer"     # Can review submissions
    APPROVER = "approver"     # Can approve submissions
    VIEWER = "viewer"         # Read-only access


class TaskAssignee(BaseModel):
    """
    Maps a user to a task with a specific role.
    
    This replaces the old `assigned_to_user_id` on tasks.
    Multiple users can be assigned to the same task.
    """
    id: str
    task_id: str                          # Reference to esg_reporting_tasks.id
    assignment_id: Optional[str] = None   # Reference to esg_assignments.id (nullable)
    organization_id: str
    user_id: str
    user_name: Optional[str] = None       # Denormalized for display
    user_email: Optional[str] = None      # Denormalized for display
    role: AssigneeRole = AssigneeRole.EDITOR
    assigned_by_user_id: Optional[str] = None
    assigned_by_name: Optional[str] = None
    is_active: bool = True                # Soft delete support
    created_at: datetime
    updated_at: Optional[datetime] = None


class CreateTaskAssigneeRequest(BaseModel):
    """Request to assign a user to a task"""
    task_id: str
    user_id: str
    role: AssigneeRole = AssigneeRole.EDITOR
    assignment_id: Optional[str] = None


class UpdateTaskAssigneeRequest(BaseModel):
    """Request to update an assignee's role"""
    role: Optional[AssigneeRole] = None
    is_active: Optional[bool] = None


class TaskAssigneeResponse(BaseModel):
    """Response with assignee details"""
    id: str
    task_id: str
    user_id: str
    user_name: Optional[str]
    user_email: Optional[str]
    role: str
    is_active: bool
    created_at: datetime


# ============================================================
# Updated Task Schema (additions only - don't break existing)
# ============================================================

class TaskAuditFields(BaseModel):
    """
    New audit fields to add to esg_reporting_tasks.
    These track WHO performed actions, not WHO is assigned.
    """
    submitted_by_user_id: Optional[str] = None
    submitted_by_name: Optional[str] = None
    submitted_at: Optional[datetime] = None
    
    approved_by_user_id: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    
    rejected_by_user_id: Optional[str] = None
    rejected_by_name: Optional[str] = None
    rejected_at: Optional[datetime] = None
    
    last_updated_by_user_id: Optional[str] = None
    last_updated_by_name: Optional[str] = None


# ============================================================
# Task Uniqueness Key
# ============================================================

def get_task_unique_key(task: dict) -> tuple:
    """
    Returns a tuple that uniquely identifies a task.
    
    Task uniqueness is based on:
    - organization_id
    - facility_id (nullable)
    - category
    - subcategory
    - sub_subcategory (nullable)
    - period_key (derived from period_start/end)
    
    NOT based on user_id (tasks are shared).
    """
    return (
        task.get("organization_id"),
        task.get("facility_id"),
        task.get("category"),
        task.get("subcategory"),
        task.get("sub_subcategory"),
        task.get("period_key"),
    )
