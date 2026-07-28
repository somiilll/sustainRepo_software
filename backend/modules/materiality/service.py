"""
Materiality Assessment Service

Business logic for materiality assessments.
Separates data operations from evaluation logic.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Tuple

from shared.database.mongo import db
from .models import (
    MaterialTopicCreate, MaterialTopicUpdate,
    AssessmentCreate, AssessmentUpdate,
    TopicScoreInput, ManualOverrideInput,
    AssessmentStatus, ScoreSource, MaterialityStatus,
)
from .evaluator import MaterialityEvaluator

logger = logging.getLogger(__name__)

# Collections
TOPICS_COLLECTION = "material_topics"
ASSESSMENTS_COLLECTION = "materiality_assessments"
SCORES_COLLECTION = "materiality_scores"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_id() -> str:
    return str(uuid.uuid4())


class MaterialityService:
    """Service for materiality assessment operations"""
    
    # =========================================================================
    # MATERIAL TOPIC MASTER
    # =========================================================================
    
    @staticmethod
    async def get_all_topics(
        framework: Optional[str] = None,
        category: Optional[str] = None,
        active_only: bool = True,
    ) -> List[dict]:
        """Get all material topics from master list"""
        query = {}
        if framework:
            query["framework"] = framework
        if category:
            query["category"] = category
        if active_only:
            query["is_active"] = True
        
        topics = await db[TOPICS_COLLECTION].find(query, {"_id": 0}).sort("topic_code", 1).to_list(500)
        return topics
    
    @staticmethod
    async def get_topic(topic_id: str) -> Optional[dict]:
        """Get single topic by ID"""
        return await db[TOPICS_COLLECTION].find_one({"id": topic_id}, {"_id": 0})
    
    @staticmethod
    async def create_topic(data: MaterialTopicCreate, created_by: str) -> dict:
        """Create a new material topic"""
        topic = {
            "id": _gen_id(),
            "topic_code": data.topic_code,
            "topic_name": data.topic_name,
            "description": data.description,
            "framework": data.framework,
            "category": data.category.value if hasattr(data.category, 'value') else data.category,
            "is_active": data.is_active,
            "is_custom": data.is_custom,
            "sector_tags": data.sector_tags,
            "created_by": created_by,
            "created_at": _now(),
            "updated_at": None,
        }
        await db[TOPICS_COLLECTION].insert_one(topic)
        topic.pop("_id", None)
        logger.info(f"Created material topic {topic['id']}: {data.topic_code} - {data.topic_name}")
        return topic
    
    @staticmethod
    async def update_topic(topic_id: str, data: MaterialTopicUpdate) -> Optional[dict]:
        """Update a material topic"""
        update = {"updated_at": _now()}
        if data.topic_name is not None:
            update["topic_name"] = data.topic_name
        if data.description is not None:
            update["description"] = data.description
        if data.category is not None:
            update["category"] = data.category.value if hasattr(data.category, 'value') else data.category
        if data.is_active is not None:
            update["is_active"] = data.is_active
        
        await db[TOPICS_COLLECTION].update_one({"id": topic_id}, {"$set": update})
        return await db[TOPICS_COLLECTION].find_one({"id": topic_id}, {"_id": 0})
    
    @staticmethod
    async def seed_gri_topics() -> int:
        """Seed default GRI topics if not exists"""
        existing = await db[TOPICS_COLLECTION].count_documents({"framework": "GRI"})
        if existing > 0:
            return 0
        
        gri_topics = [
            # Universal Standards
            ("101", "Biodiversity", "Environmental", "Operational sites in biodiversity-sensitive areas, impacts on biodiversity, habitats protected or restored."),
            ("102", "Climate Change", "Environmental", "Climate-related risks and opportunities, GHG emissions targets, climate adaptation strategies."),
            ("103", "Energy", "Environmental", "Energy consumption within and outside the organization, energy intensity, reduction initiatives."),
            # Economic (200 series)
            ("201", "Economic Performance", "Governance", "Direct economic value generated and distributed, financial implications of climate change."),
            ("202", "Market Presence", "Governance", "Entry-level wage ratios and local hiring practices."),
            ("203", "Indirect Economic Impacts", "Governance", "Infrastructure investments and services supported."),
            ("204", "Procurement Practices", "Governance", "Proportion of spending on local suppliers."),
            ("205", "Anti-corruption", "Governance", "Risk assessments, anti-corruption training, and confirmed incidents."),
            ("206", "Anti-competitive Behavior", "Governance", "Legal actions for anti-competitive behavior and antitrust."),
            ("207", "Tax", "Governance", "Tax governance, control, and risk management approach."),
            # Environmental (300 series)
            ("301", "Materials", "Environmental", "Materials used by weight or volume, recycled input materials, reclaimed products."),
            ("302", "Energy", "Environmental", "Energy consumption, intensity, and reduction initiatives."),
            ("303", "Water and Effluents", "Environmental", "Water withdrawal, discharge, and consumption across operations."),
            ("304", "Biodiversity", "Environmental", "Operational sites in or near areas of high biodiversity value."),
            ("305", "Emissions", "Environmental", "Direct and indirect GHG emissions, intensity, and reduction."),
            ("306", "Waste", "Environmental", "Waste generation, diversion from disposal, and directed to disposal."),
            ("307", "Environmental Compliance", "Environmental", "Non-compliance with environmental laws and regulations."),
            ("308", "Supplier Environmental Assessment", "Environmental", "Environmental criteria in supplier screening and assessment."),
            # Social (400 series)
            ("401", "Employment", "Social", "New hires, turnover, benefits, and parental leave."),
            ("402", "Labor/Management Relations", "Social", "Minimum notice periods for operational changes."),
            ("403", "Occupational Health and Safety", "Social", "Occupational health management, hazard identification, injury rates."),
            ("404", "Training and Education", "Social", "Average training hours, skills management, and career development."),
            ("405", "Diversity and Equal Opportunity", "Social", "Diversity in governance bodies and across employee categories."),
            ("406", "Non-discrimination", "Social", "Incidents of discrimination and corrective actions taken."),
            ("407", "Freedom of Association and Collective Bargaining", "Social", "Operations where right to freedom of association may be at risk."),
            ("408", "Child Labor", "Social", "Operations and suppliers at risk for child labor."),
            ("409", "Forced or Compulsory Labor", "Social", "Operations and suppliers at risk for forced or compulsory labor."),
            ("410", "Security Practices", "Social", "Security personnel trained in human rights policies."),
            ("411", "Rights of Indigenous Peoples", "Social", "Incidents of violations involving rights of indigenous peoples."),
            ("412", "Human Rights Assessment", "Social", "Operations subject to human rights reviews or impact assessments."),
            ("413", "Local Communities", "Social", "Community engagement, impact assessments, and development programs."),
            ("414", "Supplier Social Assessment", "Social", "Social criteria in supplier screening and assessment."),
            ("415", "Public Policy", "Social", "Political contributions and lobbying activities."),
            ("416", "Customer Health and Safety", "Social", "Assessment of health and safety impacts of products and services."),
            ("417", "Marketing and Labeling", "Social", "Product and service information and labeling requirements."),
            ("418", "Customer Privacy", "Social", "Substantiated complaints regarding breaches of customer privacy."),
        ]
        
        now = _now()
        docs = []
        for code, name, category, desc in gri_topics:
            docs.append({
                "id": _gen_id(),
                "topic_code": code,
                "topic_name": name,
                "description": desc,
                "framework": "GRI",
                "category": category,
                "is_active": True,
                "is_custom": False,
                "sector_tags": [],
                "created_by": "system",
                "created_at": now,
                "updated_at": None,
            })
        
        await db[TOPICS_COLLECTION].insert_many(docs)
        logger.info(f"Seeded {len(docs)} GRI material topics")
        return len(docs)
    
    # =========================================================================
    # MATERIALITY ASSESSMENTS
    # =========================================================================
    
    @staticmethod
    async def get_assessments(
        organization_id: str,
        reporting_year: Optional[str] = None,
        assessment_type: Optional[str] = None,
    ) -> List[dict]:
        """Get all assessments for an organization"""
        query = {"organization_id": organization_id}
        if reporting_year:
            query["reporting_year"] = reporting_year
        if assessment_type:
            query["assessment_type"] = assessment_type
        
        assessments = await db[ASSESSMENTS_COLLECTION].find(
            query, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        
        # Enrich with stats
        for a in assessments:
            stats = await MaterialityService._get_assessment_stats(a["id"])
            a.update(stats)
        
        return assessments
    
    @staticmethod
    async def get_assessment(assessment_id: str) -> Optional[dict]:
        """Get single assessment by ID"""
        assessment = await db[ASSESSMENTS_COLLECTION].find_one({"id": assessment_id}, {"_id": 0})
        if assessment:
            stats = await MaterialityService._get_assessment_stats(assessment_id)
            assessment.update(stats)
        return assessment
    
    @staticmethod
    async def get_assessment_by_year(
        organization_id: str, 
        reporting_year: str,
        assessment_type: str = "traditional",
    ) -> Optional[dict]:
        """Get assessment for a specific reporting year and type"""
        assessment = await db[ASSESSMENTS_COLLECTION].find_one(
            {
                "organization_id": organization_id, 
                "reporting_year": reporting_year,
                "assessment_type": assessment_type,
            },
            {"_id": 0}
        )
        if assessment:
            stats = await MaterialityService._get_assessment_stats(assessment["id"])
            assessment.update(stats)
        return assessment
    
    @staticmethod
    async def create_assessment(
        organization_id: str,
        data: AssessmentCreate,
        created_by: str,
    ) -> Tuple[bool, str, Optional[dict]]:
        """Create a new materiality assessment"""
        assessment_type = data.assessment_type or "traditional"
        
        # Check for existing assessment for same year AND type
        existing = await db[ASSESSMENTS_COLLECTION].find_one({
            "organization_id": organization_id,
            "reporting_year": data.reporting_year,
            "assessment_type": assessment_type,
        })
        if existing:
            return False, f"{assessment_type.title()} assessment already exists for {data.reporting_year}", None
        
        # Set axis labels based on type
        if assessment_type == "double":
            x_axis_label = "Impact Materiality"
            y_axis_label = "Financial Materiality"
            x_cutoff_label = "impact_cutoff"
            y_cutoff_label = "financial_cutoff"
            default_name = f"Double Materiality Assessment {data.reporting_year}"
        else:
            x_axis_label = "Impact to Business"
            y_axis_label = "Impact on Stakeholders"
            x_cutoff_label = "business_cutoff"
            y_cutoff_label = "stakeholder_cutoff"
            default_name = f"Materiality Assessment {data.reporting_year}"
        
        assessment = {
            "id": _gen_id(),
            "organization_id": organization_id,
            "reporting_year": data.reporting_year,
            "assessment_type": assessment_type,
            "name": data.name or default_name,
            "description": data.description,
            "status": AssessmentStatus.DRAFT.value,
            # Axis labels (for UI)
            "x_axis_label": x_axis_label,
            "y_axis_label": y_axis_label,
            # Default cutoffs (configurable)
            "business_cutoff": 3.0,  # X-axis cutoff (business/impact)
            "stakeholder_cutoff": 3.0,  # Y-axis cutoff (stakeholder/financial)
            "scale_min": 1.0,
            "scale_max": 5.0,
            "created_by": created_by,
            "created_at": _now(),
            "updated_at": None,
        }
        
        await db[ASSESSMENTS_COLLECTION].insert_one(assessment)
        assessment.pop("_id", None)
        
        # Add stats
        assessment.update({
            "total_topics": 0,
            "scored_topics": 0,
            "material_topics": 0,
        })
        
        logger.info(f"Created {assessment_type} materiality assessment {assessment['id']} for {organization_id} year {data.reporting_year}")
        return True, "Assessment created", assessment
    
    @staticmethod
    async def update_assessment(
        assessment_id: str,
        data: AssessmentUpdate,
    ) -> Optional[dict]:
        """Update assessment settings (cutoffs, status, etc.)"""
        update = {"updated_at": _now()}
        
        if data.name is not None:
            update["name"] = data.name
        if data.description is not None:
            update["description"] = data.description
        if data.status is not None:
            update["status"] = data.status.value if hasattr(data.status, 'value') else data.status
        if data.business_cutoff is not None:
            update["business_cutoff"] = data.business_cutoff
        if data.stakeholder_cutoff is not None:
            update["stakeholder_cutoff"] = data.stakeholder_cutoff
        if data.scale_min is not None:
            update["scale_min"] = data.scale_min
        if data.scale_max is not None:
            update["scale_max"] = data.scale_max
        
        await db[ASSESSMENTS_COLLECTION].update_one({"id": assessment_id}, {"$set": update})
        
        # If cutoffs changed, recalculate all topic statuses
        if data.business_cutoff is not None or data.stakeholder_cutoff is not None:
            await MaterialityService._recalculate_assessment_statuses(assessment_id)
        
        return await MaterialityService.get_assessment(assessment_id)
    
    @staticmethod
    async def delete_assessment(assessment_id: str) -> bool:
        """Delete an assessment and its scores"""
        await db[SCORES_COLLECTION].delete_many({"assessment_id": assessment_id})
        result = await db[ASSESSMENTS_COLLECTION].delete_one({"id": assessment_id})
        return result.deleted_count > 0
    
    @staticmethod
    async def _get_assessment_stats(assessment_id: str) -> dict:
        """Get topic stats for an assessment"""
        total = await db[SCORES_COLLECTION].count_documents({"assessment_id": assessment_id})
        scored = await db[SCORES_COLLECTION].count_documents({
            "assessment_id": assessment_id,
            "business_score": {"$ne": None},
            "stakeholder_score": {"$ne": None},
        })
        material = await db[SCORES_COLLECTION].count_documents({
            "assessment_id": assessment_id,
            "is_material": True,
        })
        return {
            "total_topics": total,
            "scored_topics": scored,
            "material_topics": material,
        }
    
    # =========================================================================
    # TOPIC SCORES
    # =========================================================================
    
    @staticmethod
    async def add_topics_to_assessment(
        assessment_id: str,
        topic_ids: List[str],
    ) -> int:
        """Add topics from master list to an assessment"""
        assessment = await db[ASSESSMENTS_COLLECTION].find_one({"id": assessment_id}, {"_id": 0})
        if not assessment:
            return 0
        
        # Get existing topic IDs
        existing = await db[SCORES_COLLECTION].find(
            {"assessment_id": assessment_id},
            {"topic_id": 1}
        ).to_list(500)
        existing_ids = {e["topic_id"] for e in existing}
        
        # Get topics to add
        new_ids = [tid for tid in topic_ids if tid not in existing_ids]
        if not new_ids:
            return 0
        
        topics = await db[TOPICS_COLLECTION].find(
            {"id": {"$in": new_ids}},
            {"_id": 0}
        ).to_list(500)
        
        now = _now()
        docs = []
        for topic in topics:
            docs.append({
                "id": _gen_id(),
                "assessment_id": assessment_id,
                "topic_id": topic["id"],
                "topic_code": topic["topic_code"],
                "topic_name": topic["topic_name"],
                "category": topic["category"],
                "description": topic.get("description"),
                # Scores - initially null
                "business_score": None,
                "stakeholder_score": None,
                "score_source": ScoreSource.MANUAL.value,
                # Auto-calculated
                "auto_status": None,
                # Manual override
                "has_override": False,
                "override_is_material": None,
                "override_reason": None,
                # Final result
                "final_status": None,
                "is_material": False,
                "created_at": now,
                "updated_at": None,
                "updated_by": None,
            })
        
        if docs:
            await db[SCORES_COLLECTION].insert_many(docs)
        
        logger.info(f"Added {len(docs)} topics to assessment {assessment_id}")
        return len(docs)
    
    @staticmethod
    async def remove_topic_from_assessment(assessment_id: str, topic_id: str) -> bool:
        """Remove a topic from an assessment"""
        result = await db[SCORES_COLLECTION].delete_one({
            "assessment_id": assessment_id,
            "topic_id": topic_id,
        })
        return result.deleted_count > 0
    
    @staticmethod
    async def get_assessment_topics(assessment_id: str) -> List[dict]:
        """Get all topics with scores for an assessment"""
        return await db[SCORES_COLLECTION].find(
            {"assessment_id": assessment_id},
            {"_id": 0}
        ).sort("topic_code", 1).to_list(500)
    
    @staticmethod
    async def score_topic(
        assessment_id: str,
        data: TopicScoreInput,
        updated_by: str,
    ) -> Optional[dict]:
        """Score a topic (manual entry)"""
        # Get assessment for cutoffs
        assessment = await db[ASSESSMENTS_COLLECTION].find_one({"id": assessment_id}, {"_id": 0})
        if not assessment:
            return None
        
        # Calculate auto status
        auto_status, auto_is_material = MaterialityEvaluator.evaluate(
            data.business_score,
            data.stakeholder_score,
            assessment["business_cutoff"],
            assessment["stakeholder_cutoff"],
        )
        
        # Get existing override if any
        existing = await db[SCORES_COLLECTION].find_one({
            "assessment_id": assessment_id,
            "topic_id": data.topic_id,
        }, {"_id": 0})
        
        has_override = existing.get("has_override", False) if existing else False
        override_is_material = existing.get("override_is_material") if existing else None
        
        # Calculate final status
        final_status, is_material = MaterialityEvaluator.get_final_status(
            auto_status, auto_is_material, has_override, override_is_material
        )
        
        update = {
            "business_score": data.business_score,
            "stakeholder_score": data.stakeholder_score,
            "score_source": data.source.value,
            "auto_status": auto_status.value,
            "final_status": final_status,
            "is_material": is_material,
            "updated_at": _now(),
            "updated_by": updated_by,
        }
        
        await db[SCORES_COLLECTION].update_one(
            {"assessment_id": assessment_id, "topic_id": data.topic_id},
            {"$set": update}
        )
        
        return await db[SCORES_COLLECTION].find_one(
            {"assessment_id": assessment_id, "topic_id": data.topic_id},
            {"_id": 0}
        )
    
    @staticmethod
    async def set_override(
        assessment_id: str,
        topic_id: str,
        data: ManualOverrideInput,
        updated_by: str,
    ) -> Optional[dict]:
        """Set manual override for a topic's materiality"""
        existing = await db[SCORES_COLLECTION].find_one({
            "assessment_id": assessment_id,
            "topic_id": topic_id,
        }, {"_id": 0})
        
        if not existing:
            return None
        
        # Recalculate final status with override
        auto_status = MaterialityStatus(existing.get("auto_status", "non_material"))
        auto_is_material = auto_status == MaterialityStatus.MATERIAL
        
        final_status, is_material = MaterialityEvaluator.get_final_status(
            auto_status, auto_is_material, True, data.is_material
        )
        
        update = {
            "has_override": True,
            "override_is_material": data.is_material,
            "override_reason": data.override_reason,
            "final_status": final_status,
            "is_material": is_material,
            "updated_at": _now(),
            "updated_by": updated_by,
        }
        
        await db[SCORES_COLLECTION].update_one(
            {"assessment_id": assessment_id, "topic_id": topic_id},
            {"$set": update}
        )
        
        return await db[SCORES_COLLECTION].find_one(
            {"assessment_id": assessment_id, "topic_id": topic_id},
            {"_id": 0}
        )
    
    @staticmethod
    async def clear_override(
        assessment_id: str,
        topic_id: str,
        updated_by: str,
    ) -> Optional[dict]:
        """Clear manual override, revert to auto-calculated status"""
        existing = await db[SCORES_COLLECTION].find_one({
            "assessment_id": assessment_id,
            "topic_id": topic_id,
        }, {"_id": 0})
        
        if not existing:
            return None
        
        # Revert to auto status
        auto_status = existing.get("auto_status", "non_material")
        is_material = auto_status == MaterialityStatus.MATERIAL.value
        
        update = {
            "has_override": False,
            "override_is_material": None,
            "override_reason": None,
            "final_status": auto_status,
            "is_material": is_material,
            "updated_at": _now(),
            "updated_by": updated_by,
        }
        
        await db[SCORES_COLLECTION].update_one(
            {"assessment_id": assessment_id, "topic_id": topic_id},
            {"$set": update}
        )
        
        return await db[SCORES_COLLECTION].find_one(
            {"assessment_id": assessment_id, "topic_id": topic_id},
            {"_id": 0}
        )
    
    @staticmethod
    async def _recalculate_assessment_statuses(assessment_id: str):
        """Recalculate all topic statuses when cutoffs change"""
        assessment = await db[ASSESSMENTS_COLLECTION].find_one({"id": assessment_id}, {"_id": 0})
        if not assessment:
            return
        
        topics = await db[SCORES_COLLECTION].find(
            {"assessment_id": assessment_id},
            {"_id": 0}
        ).to_list(500)
        
        for topic in topics:
            if topic.get("business_score") is None or topic.get("stakeholder_score") is None:
                continue
            
            auto_status, auto_is_material = MaterialityEvaluator.evaluate(
                topic["business_score"],
                topic["stakeholder_score"],
                assessment["business_cutoff"],
                assessment["stakeholder_cutoff"],
            )
            
            final_status, is_material = MaterialityEvaluator.get_final_status(
                auto_status,
                auto_is_material,
                topic.get("has_override", False),
                topic.get("override_is_material"),
            )
            
            await db[SCORES_COLLECTION].update_one(
                {"id": topic["id"]},
                {"$set": {
                    "auto_status": auto_status.value,
                    "final_status": final_status,
                    "is_material": is_material,
                }}
            )
        
        logger.info(f"Recalculated {len(topics)} topic statuses for assessment {assessment_id}")
    
    # =========================================================================
    # MATRIX DATA
    # =========================================================================
    
    @staticmethod
    async def get_matrix_data(assessment_id: str) -> List[dict]:
        """Get data formatted for the materiality matrix chart"""
        topics = await db[SCORES_COLLECTION].find(
            {"assessment_id": assessment_id},
            {"_id": 0}
        ).to_list(500)
        
        matrix_data = []
        for t in topics:
            if t.get("business_score") is not None and t.get("stakeholder_score") is not None:
                matrix_data.append({
                    "id": t["id"],
                    "topic_id": t["topic_id"],
                    "topic_code": t["topic_code"],
                    "topic_name": t["topic_name"],
                    "category": t["category"],
                    "x": t["business_score"],
                    "y": t["stakeholder_score"],
                    "auto_status": t.get("auto_status", "non_material"),
                    "final_status": t.get("final_status", "non_material"),
                    "is_material": t.get("is_material", False),
                    "has_override": t.get("has_override", False),
                })
        
        return matrix_data
    
    # =========================================================================
    # FINAL MATERIAL TOPICS (for reports/disclosures)
    # =========================================================================
    
    @staticmethod
    async def get_final_material_topics(assessment_id: str) -> List[dict]:
        """
        Get final list of material topics for reports/disclosures.
        
        IMPORTANT: This uses final_status (considering overrides),
        NOT auto_status.
        """
        return await db[SCORES_COLLECTION].find(
            {"assessment_id": assessment_id, "is_material": True},
            {"_id": 0}
        ).sort("topic_code", 1).to_list(500)
    
    @staticmethod
    async def get_material_topic_codes_for_org(organization_id: str, reporting_year: Optional[str] = None) -> List[str]:
        """
        Get list of material topic codes for an organization.
        Used by GRI Questionnaire, Assignment, and Reporting pages.
        
        Returns topic codes like ['302', '305', '403'] for filtering.
        If no assessment exists or no topics are material, returns empty list.
        """
        # Find the most recent assessment or specific year
        query = {"organization_id": organization_id}
        if reporting_year:
            query["reporting_year"] = reporting_year
        
        assessment = await db[ASSESSMENTS_COLLECTION].find_one(
            query,
            {"_id": 0, "id": 1},
            sort=[("created_at", -1)]
        )
        
        if not assessment:
            return []
        
        # Get material topics
        material = await db[SCORES_COLLECTION].find(
            {"assessment_id": assessment["id"], "is_material": True},
            {"_id": 0, "topic_code": 1}
        ).to_list(500)
        
        return [t["topic_code"] for t in material]


# Singleton instance
materiality_service = MaterialityService()
