"""Shared validation for admin-controlled Supplier Assessment deadlines."""
from datetime import date, datetime, timezone
from typing import Optional


def validate_due_date(due_date: Optional[str]) -> None:
    """Allow an optional current or future ISO calendar date, never a past date."""
    if due_date in (None, ""):
        return
    try:
        selected_date = date.fromisoformat(str(due_date)[:10])
    except (TypeError, ValueError) as error:
        raise ValueError("Due date must be a valid ISO date") from error
    if selected_date < datetime.now(timezone.utc).date():
        raise ValueError("Due date cannot be in the past")