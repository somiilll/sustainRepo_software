"""
Assignment Progress Calculation Engine

This module now delegates ALL progress calculations to CompletionService,
which is the single source of truth for completion/progress.

Kept for backward compatibility with existing imports.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from shared.database.mongo import db
from modules.esg_assignments.completion_service import completion_service, CompletionService
import logging

logger = logging.getLogger(__name__)


class ProgressResult:
    """Progress calculation result - mirrors CompletionService.ProgressResult."""
    def __init__(self):
        self.total = 0
        self.completed = 0
        self.pending = 0
        self.overdue = 0
        self.last_updated: Optional[datetime] = None
        self.period_details: List[Dict] = []
    
    @property
    def percentage(self) -> float:
        if self.total == 0:
            return 0.0
        return round((self.completed / self.total) * 100, 1)
    
    def to_dict(self) -> Dict:
        last_updated_str = None
        if self.last_updated:
            if isinstance(self.last_updated, datetime):
                last_updated_str = self.last_updated.isoformat()
            else:
                last_updated_str = str(self.last_updated)
        
        return {
            "total": self.total,
            "filled": self.completed,
            "completed": self.completed,
            "pending": self.pending,
            "overdue": self.overdue,
            "percentage": self.percentage,
            "last_updated": last_updated_str,
            "period_details": self.period_details,
        }


class ProgressEngine:
    """
    Progress calculation engine - delegates to CompletionService.
    
    Kept for backward compatibility with existing code.
    """
    
    async def get_assignment_progress(
        self,
        assignment_id: str,
        include_period_details: bool = False,
    ) -> Dict[str, Any]:
        """Get progress for a single assignment."""
        assignment = await db.esg_assignments.find_one({"id": assignment_id}, {"_id": 0})
        if not assignment:
            return {"error": "Assignment not found", "total": 0, "completed": 0, "percentage": 0.0}
        
        progress = await completion_service.get_assignment_progress(assignment, include_period_details)
        return progress.to_dict()
    
    async def get_category_progress(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str] = None,
        sub_subcategory: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get aggregated progress for a category."""
        query = {
            "organization_id": organization_id,
            "category": category,
        }
        if subcategory:
            query["subcategory"] = subcategory
        if sub_subcategory:
            query["sub_subcategory"] = sub_subcategory
        
        assignments = await db.esg_assignments.find(query, {"_id": 0}).to_list(500)
        
        if not assignments:
            return {"total": 0, "completed": 0, "filled": 0, "pending": 0, "overdue": 0, "percentage": 0.0}
        
        total = completed = pending = overdue = 0
        last_updated = None
        
        for assignment in assignments:
            progress = await completion_service.get_assignment_progress(assignment)
            total += progress.total
            completed += progress.completed
            pending += progress.pending
            overdue += progress.overdue
            if progress.last_updated and (not last_updated or progress.last_updated > last_updated):
                last_updated = progress.last_updated
        
        return {
            "total": total,
            "completed": completed,
            "filled": completed,
            "pending": pending,
            "overdue": overdue,
            "percentage": round((completed / total) * 100, 1) if total > 0 else 0.0,
            "last_updated": last_updated.isoformat() if isinstance(last_updated, datetime) else str(last_updated) if last_updated else None,
        }
    
    async def get_bulk_progress(
        self,
        organization_id: str,
        categories: List[Dict],
    ) -> Dict[str, Dict]:
        """Get progress for multiple categories."""
        result = {}
        
        for cat_info in categories:
            category = cat_info.get("category", "")
            subcategory = cat_info.get("subcategory")
            sub_subcategory = cat_info.get("sub_subcategory")
            
            key = "|".join(filter(None, [category, subcategory, sub_subcategory]))
            
            progress = await self.get_category_progress(
                organization_id, category, subcategory, sub_subcategory
            )
            result[key] = progress
        
        return result


# Singleton instance
_progress_engine = None


def get_progress_engine() -> ProgressEngine:
    """Get or create the progress engine singleton."""
    global _progress_engine
    if _progress_engine is None:
        _progress_engine = ProgressEngine()
    return _progress_engine


async def get_assignment_progress(assignment_id: str) -> Dict[str, Any]:
    """Convenience function to get assignment progress."""
    return await get_progress_engine().get_assignment_progress(assignment_id)


async def get_bulk_progress(organization_id: str, categories: List[Dict]) -> Dict[str, Dict]:
    """Convenience function to get bulk progress."""
    return await get_progress_engine().get_bulk_progress(organization_id, categories)
