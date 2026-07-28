"""
Materiality Assessment API Router

REST endpoints for materiality assessments.
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user
from .models import (
    MaterialTopicCreate, MaterialTopicUpdate,
    AssessmentCreate, AssessmentUpdate,
    TopicScoreInput, ManualOverrideInput,
    BulkTopicSelectionInput,
)
from .service import materiality_service

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# MATERIAL TOPIC MASTER
# =============================================================================

@router.get("/materiality/topics")
async def get_material_topics(
    framework: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    active_only: bool = Query(True),
    current_user: dict = Depends(get_current_user),
):
    """Get all material topics from master list"""
    topics = await materiality_service.get_all_topics(framework, category, active_only)
    return {"topics": topics, "total": len(topics)}


@router.post("/materiality/topics")
async def create_material_topic(
    data: MaterialTopicCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new material topic (admin only)"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    topic = await materiality_service.create_topic(data, current_user.get("id"))
    return topic


@router.put("/materiality/topics/{topic_id}")
async def update_material_topic(
    topic_id: str,
    data: MaterialTopicUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a material topic (admin only)"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    topic = await materiality_service.update_topic(topic_id, data)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic


@router.post("/materiality/topics/seed")
async def seed_gri_topics(current_user: dict = Depends(get_current_user)):
    """Seed default GRI topics (admin/super_admin only)"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    count = await materiality_service.seed_gri_topics()
    return {"message": f"Seeded {count} GRI topics", "count": count}


# =============================================================================
# MATERIALITY ASSESSMENTS
# =============================================================================

@router.get("/materiality/assessments")
async def get_assessments(
    reporting_year: Optional[str] = Query(None),
    assessment_type: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get all materiality assessments for the organization"""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    assessments = await materiality_service.get_assessments(org_id, reporting_year, assessment_type)
    return {"assessments": assessments, "total": len(assessments)}


@router.get("/materiality/assessments/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single assessment with details"""
    assessment = await materiality_service.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    # Auth check
    if current_user.get("role") != "super_admin":
        if assessment.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    return assessment


@router.get("/materiality/assessments/by-year/{reporting_year}")
async def get_assessment_by_year(
    reporting_year: str,
    assessment_type: str = Query("traditional", description="traditional or double"),
    current_user: dict = Depends(get_current_user),
):
    """Get assessment for a specific reporting year and type"""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    assessment = await materiality_service.get_assessment_by_year(org_id, reporting_year, assessment_type)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found for this year and type")
    
    return assessment


@router.post("/materiality/assessments")
async def create_assessment(
    data: AssessmentCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new materiality assessment"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    success, message, assessment = await materiality_service.create_assessment(
        org_id, data, current_user.get("id")
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return assessment


@router.put("/materiality/assessments/{assessment_id}")
async def update_assessment(
    assessment_id: str,
    data: AssessmentUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update assessment settings (cutoffs, status, etc.)"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify ownership
    existing = await materiality_service.get_assessment(assessment_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if current_user.get("role") != "super_admin":
        if existing.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    assessment = await materiality_service.update_assessment(assessment_id, data)
    return assessment


@router.delete("/materiality/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete an assessment"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify ownership
    existing = await materiality_service.get_assessment(assessment_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if current_user.get("role") != "super_admin":
        if existing.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    success = await materiality_service.delete_assessment(assessment_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete assessment")
    
    return {"message": "Assessment deleted"}


# =============================================================================
# ASSESSMENT TOPICS
# =============================================================================

@router.get("/materiality/assessments/{assessment_id}/topics")
async def get_assessment_topics(
    assessment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all topics with scores for an assessment"""
    # Verify access
    assessment = await materiality_service.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if current_user.get("role") != "super_admin":
        if assessment.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    topics = await materiality_service.get_assessment_topics(assessment_id)
    return {"topics": topics, "total": len(topics)}


@router.post("/materiality/assessments/{assessment_id}/topics")
async def add_topics_to_assessment(
    assessment_id: str,
    data: BulkTopicSelectionInput,
    current_user: dict = Depends(get_current_user),
):
    """Add topics from master list to an assessment"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Verify ownership
    assessment = await materiality_service.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if current_user.get("role") != "super_admin":
        if assessment.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    count = await materiality_service.add_topics_to_assessment(assessment_id, data.topic_ids)
    return {"message": f"Added {count} topics", "added": count}


@router.delete("/materiality/assessments/{assessment_id}/topics/{topic_id}")
async def remove_topic_from_assessment(
    assessment_id: str,
    topic_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove a topic from an assessment"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    success = await materiality_service.remove_topic_from_assessment(assessment_id, topic_id)
    if not success:
        raise HTTPException(status_code=404, detail="Topic not found in assessment")
    
    return {"message": "Topic removed"}


# =============================================================================
# SCORING
# =============================================================================

@router.put("/materiality/assessments/{assessment_id}/topics/{topic_id}/score")
async def score_topic(
    assessment_id: str,
    topic_id: str,
    data: TopicScoreInput,
    current_user: dict = Depends(get_current_user),
):
    """Score a topic (business and stakeholder impact)"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Ensure topic_id matches
    data.topic_id = topic_id
    
    score = await materiality_service.score_topic(
        assessment_id, data, current_user.get("id")
    )
    if not score:
        raise HTTPException(status_code=404, detail="Topic not found in assessment")
    
    return score


@router.put("/materiality/assessments/{assessment_id}/topics/{topic_id}/override")
async def set_override(
    assessment_id: str,
    topic_id: str,
    data: ManualOverrideInput,
    current_user: dict = Depends(get_current_user),
):
    """Set manual override for a topic's materiality"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    score = await materiality_service.set_override(
        assessment_id, topic_id, data, current_user.get("id")
    )
    if not score:
        raise HTTPException(status_code=404, detail="Topic not found in assessment")
    
    return score


@router.delete("/materiality/assessments/{assessment_id}/topics/{topic_id}/override")
async def clear_override(
    assessment_id: str,
    topic_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Clear manual override, revert to auto-calculated status"""
    if current_user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    score = await materiality_service.clear_override(
        assessment_id, topic_id, current_user.get("id")
    )
    if not score:
        raise HTTPException(status_code=404, detail="Topic not found in assessment")
    
    return score


# =============================================================================
# MATRIX & FINAL TOPICS
# =============================================================================

@router.get("/materiality/assessments/{assessment_id}/matrix")
async def get_matrix_data(
    assessment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get data for the materiality matrix visualization"""
    # Verify access
    assessment = await materiality_service.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if current_user.get("role") != "super_admin":
        if assessment.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    matrix_data = await materiality_service.get_matrix_data(assessment_id)
    return {
        "data": matrix_data,
        "cutoffs": {
            "business": assessment.get("business_cutoff", 3.0),
            "stakeholder": assessment.get("stakeholder_cutoff", 3.0),
        },
        "scale": {
            "min": assessment.get("scale_min", 1.0),
            "max": assessment.get("scale_max", 5.0),
        },
    }


@router.get("/materiality/assessments/{assessment_id}/final-topics")
async def get_final_material_topics(
    assessment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get final list of material topics for reports/disclosures.
    Uses final_status (considering overrides), NOT auto_status.
    """
    # Verify access
    assessment = await materiality_service.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if current_user.get("role") != "super_admin":
        if assessment.get("organization_id") != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    
    topics = await materiality_service.get_final_material_topics(assessment_id)
    return {"topics": topics, "total": len(topics)}


@router.get("/materiality/material-topics")
async def get_material_topic_codes(
    reporting_year: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Get material topic codes for the current organization.
    Used by GRI Questionnaire, Assignment, and Reporting pages.
    
    Returns: {"topic_codes": ["302", "305", "403"], "total": 3}
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    codes = await materiality_service.get_material_topic_codes_for_org(org_id, reporting_year)
    return {"topic_codes": codes, "total": len(codes)}
