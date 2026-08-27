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
from shared.utils.emission_records import eligible_ghg_record_filter


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
        manual_scores_override: Optional[Dict[str, Any]] = None,
        reporting_period: Optional[str] = None,
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
        
        # Fetch supplier relationship before selecting the period-specific submitted response.
        relationship = await self.db.supplier_relationships.find_one(
            {"id": supplier_relationship_id},
            {"_id": 0}
        )
        supplier_name = relationship.get("company_name") if relationship else None
        effective_period = reporting_period or (relationship or {}).get("reporting_period")

        # Fetch the parent-visible response for the active reporting period.
        response_query: Dict[str, Any] = {
            "questionnaire_id": questionnaire_id,
            "supplier_relationship_id": supplier_relationship_id,
            "status": "submitted",
            "parent_visible": {"$ne": False},
        }
        if effective_period:
            response_query["reporting_period"] = effective_period
        response_doc = await self.db.supplier_questionnaire_responses.find_one(
            response_query,
            {"_id": 0}, sort=[("revision", -1)]
        )
        answers = answers_override if answers_override is not None else (response_doc.get("answers", {}) if response_doc else {})
        manual_scores = manual_scores_override if manual_scores_override is not None else (response_doc.get("manual_question_scores", {}) if response_doc else {})
        revenue = await self.get_revenue_component(supplier_relationship_id, effective_period)
        
        # Calculate GHG score
        ghg_component = await self.get_ghg_component(
            supplier_relationship_id, effective_period, revenue.get("revenue_amount")
        )
        
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
            ghg_score=ghg_component.get("score"),
            revenue_percentage=revenue.get("revenue_percentage"),
            manual_scores=manual_scores,
        )
        breakdown.supplier_score.ghg_intensity_tco2e_per_million_revenue = ghg_component.get("intensity")
        breakdown.supplier_score.ghg_total_emissions = ghg_component.get("total_emissions")
        
        # Save results if requested
        if save_to_db:
            await self._save_score_results(
                supplier_relationship_id=supplier_relationship_id,
                questionnaire_id=questionnaire_id,
                breakdown=breakdown,
            )
        
        return breakdown
    
    async def get_ghg_component(
        self,
        supplier_relationship_id: str,
        reporting_period: Optional[str],
        revenue_amount: Optional[float],
    ) -> Dict[str, Any]:
        """Return the persisted-GHG component using emissions intensity, never absolute emissions."""
        query = {
            "source": "supplier",
            "supplier_relationship_id": supplier_relationship_id,
            "submitted_to_parent_org": {"$exists": True, "$ne": None},
            "parent_visible": {"$ne": False},
        }
        if reporting_period:
            from modules.supplier_assessment.ghg_submission_service import reporting_period_values
            query["reporting_period"] = {"$in": reporting_period_values(reporting_period)}
        query.update(eligible_ghg_record_filter())
        emissions = await self.db.emission_records.find(
            query,
            {"_id": 0, "total_emissions": 1, "scope": 1}
        ).to_list(1000)
        if not emissions:
            return {"score": None, "intensity": None, "total_emissions": 0.0, "scope1_emissions": 0.0, "scope2_emissions": 0.0}
        scope1 = sum(float(item.get("total_emissions") or 0) for item in emissions if item.get("scope") in {"scope1", "scope_1"})
        scope2 = sum(float(item.get("total_emissions") or 0) for item in emissions if item.get("scope") in {"scope2", "scope_2"})
        total = scope1 + scope2
        if revenue_amount is None or float(revenue_amount) <= 0:
            return {"score": None, "intensity": None, "total_emissions": round(total, 2), "scope1_emissions": round(scope1, 2), "scope2_emissions": round(scope2, 2)}
        intensity = (total / float(revenue_amount)) * 1_000_000
        # Default benchmark: 100 tCO2e per one million units of supplier revenue.
        score = max(0.0, min(100.0, 100.0 - intensity))
        return {"score": round(score, 2), "intensity": round(intensity, 4), "total_emissions": round(total, 2), "scope1_emissions": round(scope1, 2), "scope2_emissions": round(scope2, 2)}

    async def get_revenue_component(self, supplier_relationship_id: str, reporting_period: Optional[str]) -> Dict[str, Optional[float]]:
        query = {"supplier_relationship_id": supplier_relationship_id, "status": "submitted", "parent_visible": {"$ne": False}}
        if reporting_period:
            query["reporting_period"] = reporting_period
        submission = await self.db.supplier_revenue_submissions.find_one(
            query, {"_id": 0, "revenue_percentage": 1, "revenue_amount": 1}, sort=[("revision", -1)]
        )
        if not submission:
            return {"revenue_percentage": None, "revenue_amount": None}
        return {"revenue_percentage": submission.get("revenue_percentage"), "revenue_amount": submission.get("revenue_amount")}
    
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
        
        # Persist the questionnaire-level result, then refresh the one canonical
        # supplier snapshot used by every downstream view.
        await self.db.supplier_questionnaire_responses.update_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
                "status": "submitted",
                "parent_visible": {"$ne": False},
            },
            {"$set": {
                "calculated_score": breakdown.esg_score.overall_score,
                "esg_score": breakdown.esg_score.overall_score,
                "score_breakdown": breakdown.model_dump(),
                "scored_at": now,
            }}
        )
        
        from modules.supplier_assessment.service import supplier_service
        await supplier_service.refresh_supplier_canonical_score(supplier_relationship_id)
    
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
