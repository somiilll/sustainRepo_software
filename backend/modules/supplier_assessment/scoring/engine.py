"""
Scoring Engine - High-level orchestration layer

This module provides the main interface for scoring supplier assessments.
It handles database interaction, GHG score calculation, and full audit trails.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

from .calculator import ScoreCalculator
from .models import (
    ESGSectionWeights,
    OverallSupplierWeights,
    ScoreBreakdown,
    SupplierScore,
)


class ScoringEngine:
    """
    High-level scoring engine that orchestrates all scoring operations.
    
    This class bridges the pure calculation logic (ScoreCalculator) with
    database operations and business logic.
    
    Usage:
        engine = ScoringEngine(db)
        
        # Calculate full supplier score
        breakdown = await engine.calculate_supplier_assessment(
            supplier_relationship_id="...",
            questionnaire_id="..."
        )
        
        # Get score without saving
        score = await engine.preview_score(...)
    """
    
    def __init__(self, db):
        """
        Initialize the scoring engine.
        
        Args:
            db: MongoDB database instance
        """
        self.db = db
        self.calculator = ScoreCalculator()
    
    async def calculate_supplier_assessment(
        self,
        supplier_relationship_id: str,
        questionnaire_id: str,
        save_to_db: bool = True,
        answers_override: Optional[Dict[str, Any]] = None,
    ) -> ScoreBreakdown:
        """
        Calculate complete supplier assessment score.
        
        This method:
        1. Fetches questionnaire with questions
        2. Fetches supplier's answers
        3. Fetches supplier's GHG data
        4. Fetches supplier's revenue percentage
        5. Runs the calculation
        6. Optionally saves results to database
        
        Args:
            supplier_relationship_id: The supplier relationship ID
            questionnaire_id: The questionnaire to score
            save_to_db: Whether to save results (default True)
            
        Returns:
            ScoreBreakdown with complete audit trail
        """
        # Fetch questionnaire with questions
        questionnaire = await self.db.supplier_questionnaires.find_one(
            {"id": questionnaire_id},
            {"_id": 0}
        )
        if not questionnaire:
            raise ValueError(f"Questionnaire not found: {questionnaire_id}")
        
        questions = await self.db.supplier_questions.find(
            {"questionnaire_id": questionnaire_id, "is_active": True},
            {"_id": 0}
        ).to_list(500)
        
        # Fetch supplier's responses
        response_doc = await self.db.supplier_questionnaire_responses.find_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
                "status": "submitted",
                "parent_visible": {"$ne": False},
            },
            {"_id": 0}, sort=[("revision", -1)]
        )
        answers = answers_override if answers_override is not None else (response_doc.get("answers", {}) if response_doc else {})
        
        # Fetch supplier relationship for revenue and name
        relationship = await self.db.supplier_relationships.find_one(
            {"id": supplier_relationship_id},
            {"_id": 0}
        )
        supplier_name = relationship.get("company_name") if relationship else None
        revenue_percentage = await self._submitted_revenue_percentage(supplier_relationship_id, relationship)
        
        # Calculate GHG score
        ghg_score = await self._calculate_ghg_score(supplier_relationship_id)
        
        # Get weight configurations
        esg_weights = self._get_esg_weights(questionnaire)
        overall_weights = self._get_overall_weights(questionnaire)
        
        # Run calculation
        breakdown = self.calculator.calculate_full_score(
            supplier_id=supplier_relationship_id,
            questionnaire_id=questionnaire_id,
            questionnaire_title=questionnaire.get("name"),
            supplier_name=supplier_name,
            questions=questions,
            answers=answers,
            esg_weights=esg_weights,
            overall_weights=overall_weights,
            ghg_score=ghg_score,
            revenue_percentage=revenue_percentage,
        )
        
        # Save results if requested
        if save_to_db:
            await self._save_score_results(
                supplier_relationship_id=supplier_relationship_id,
                questionnaire_id=questionnaire_id,
                breakdown=breakdown,
            )
        
        return breakdown
    
    async def _calculate_ghg_score(self, supplier_relationship_id: str) -> Optional[float]:
        """
        Calculate GHG performance score for a supplier.
        
        Formula: Higher score = better (lower emissions relative to peers)
        
        For now, uses a simple normalization:
        - 0 emissions = 100 score
        - 1000+ tCO2e = 0 score
        - Linear interpolation between
        
        TODO: Consider industry benchmarks, scope breakdown, YoY improvement
        """
        emissions = await self.db.emission_records.find(
            {
                "source": "supplier",
                "supplier_relationship_id": supplier_relationship_id,
                "submitted_to_parent_org": {"$exists": True, "$ne": None},
                "parent_visible": {"$ne": False},
            },
            {"_id": 0, "total_emissions": 1, "scope": 1}
        ).to_list(1000)
        
        if not emissions:
            return None  # No GHG data submitted
        
        total_emissions = sum(e.get("total_emissions", 0) or 0 for e in emissions)
        
        # Simple normalization: assume 1000 tCO2e is "bad" (score 0)
        # 0 tCO2e is "good" (score 100)
        # This should be configurable per organization
        max_acceptable = 1000  # tCO2e
        
        if total_emissions >= max_acceptable:
            return 0.0
        
        return round(100 - (total_emissions / max_acceptable * 100), 2)

    async def _submitted_revenue_percentage(self, supplier_relationship_id: str, relationship: Optional[Dict[str, Any]]) -> Optional[float]:
        reporting_period = (relationship or {}).get("reporting_period")
        query = {"supplier_relationship_id": supplier_relationship_id, "status": "submitted", "parent_visible": {"$ne": False}}
        if reporting_period:
            query["reporting_period"] = reporting_period
        submission = await self.db.supplier_revenue_submissions.find_one(query, {"_id": 0, "revenue_percentage": 1}, sort=[("revision", -1)])
        return submission.get("revenue_percentage") if submission else None
    
    def _get_esg_weights(self, questionnaire: Dict[str, Any]) -> ESGSectionWeights:
        """Extract ESG section weights from questionnaire config."""
        section_weights = questionnaire.get("section_weights", {})
        # Also check for new field name
        esg_weights = questionnaire.get("esg_section_weights", section_weights)
        
        return ESGSectionWeights(
            environment=esg_weights.get("environment", 33.33),
            social=esg_weights.get("social", 33.33),
            governance=esg_weights.get("governance", 33.34),
        )
    
    def _get_overall_weights(self, questionnaire: Dict[str, Any]) -> OverallSupplierWeights:
        """Extract overall supplier score weights from questionnaire config."""
        overall_weights = questionnaire.get("overall_supplier_weights", {})
        
        return OverallSupplierWeights(
            esg=overall_weights.get("esg", 40),
            ghg=overall_weights.get("ghg", 40),
            revenue=overall_weights.get("revenue", 20),
        )
    
    async def _save_score_results(
        self,
        supplier_relationship_id: str,
        questionnaire_id: str,
        breakdown: ScoreBreakdown,
    ) -> None:
        """Save scoring results to database."""
        now = datetime.now(timezone.utc).isoformat()
        
        # Update supplier_questionnaire_responses with calculated score
        await self.db.supplier_questionnaire_responses.update_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
            },
            {"$set": {
                "calculated_score": breakdown.supplier_score.overall_score,
                "esg_score": breakdown.esg_score.overall_score,
                "score_breakdown": breakdown.model_dump(),
                "scored_at": now,
            }}
        )
        
        # Update supplier_relationships with latest scores
        await self.db.supplier_relationships.update_one(
            {"id": supplier_relationship_id},
            {"$set": {
                "esg_score": breakdown.esg_score.overall_score,
                "ghg_score": breakdown.supplier_score.ghg_score,
                "overall_score": breakdown.supplier_score.overall_score,
                "last_scored_at": now,
                "updated_at": now,
            }}
        )
    
    async def get_score_breakdown(
        self,
        supplier_relationship_id: str,
        questionnaire_id: str,
    ) -> Optional[ScoreBreakdown]:
        """
        Retrieve previously calculated score breakdown.
        
        Args:
            supplier_relationship_id: The supplier relationship ID
            questionnaire_id: The questionnaire ID
            
        Returns:
            ScoreBreakdown if exists, None otherwise
        """
        response_doc = await self.db.supplier_questionnaire_responses.find_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
            },
            {"_id": 0, "score_breakdown": 1}
        )
        
        if response_doc and response_doc.get("score_breakdown"):
            return ScoreBreakdown(**response_doc["score_breakdown"])
        
        return None
    
    async def recalculate_all_suppliers(
        self,
        questionnaire_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Recalculate scores for all suppliers who have responded to a questionnaire.
        
        Useful when questionnaire scoring config changes.
        
        Args:
            questionnaire_id: The questionnaire to recalculate
            
        Returns:
            List of results with supplier_id and new_score
        """
        responses = await self.db.supplier_questionnaire_responses.find(
            {"questionnaire_id": questionnaire_id, "status": "submitted"},
            {"_id": 0, "supplier_relationship_id": 1}
        ).to_list(1000)
        
        results = []
        for r in responses:
            supplier_id = r["supplier_relationship_id"]
            try:
                breakdown = await self.calculate_supplier_assessment(
                    supplier_relationship_id=supplier_id,
                    questionnaire_id=questionnaire_id,
                    save_to_db=True,
                )
                results.append({
                    "supplier_id": supplier_id,
                    "new_score": breakdown.supplier_score.overall_score,
                    "status": "success",
                })
            except Exception as e:
                results.append({
                    "supplier_id": supplier_id,
                    "status": "error",
                    "error": str(e),
                })
        
        return results
