"""
Score Calculator - Unified Calculation Engine

Implements the calculation flow:
Raw Response → Question Score → Weighted Question Score → Section Score → ESG Score → Overall Supplier Score

This is a pure calculation module with no database access.
All data must be passed in as parameters.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

from .models import (
    ScoringConfig,
    ScoringRuleType,
    QuestionScore,
    SectionScore,
    ESGScore,
    SupplierScore,
    ScoreBreakdown,
    ESGSectionWeights,
    OverallSupplierWeights,
)
from .rules import get_rule


class ScoreCalculator:
    """
    Unified score calculation engine.
    
    Usage:
        calculator = ScoreCalculator()
        
        # Calculate individual question score
        q_score = calculator.calculate_question_score(
            question_id="q1",
            question_text="Renewable energy %",
            section="environment",
            response_type="number",
            raw_value=75,
            weight=2.0,
            scoring_config=ScoringConfig(rule="higher_is_better", target=100)
        )
        
        # Calculate full supplier score
        breakdown = calculator.calculate_full_score(
            supplier_id="s1",
            questionnaire_id="q1",
            questions=[...],  # List of question configs
            answers={...},    # Dict of question_id -> answer
            esg_weights=ESGSectionWeights(),
            overall_weights=OverallSupplierWeights(),
            ghg_score=85.0,
            revenue_percentage=15.0
        )
    """
    
    def calculate_question_score(
        self,
        question_id: str,
        question_text: str,
        section: str,
        response_type: str,
        raw_value: Any,
        weight: float,
        scoring_config: ScoringConfig,
    ) -> QuestionScore:
        """
        Calculate score for a single question.
        
        Args:
            question_id: Unique identifier for the question
            question_text: The question text (for audit trail)
            section: ESG section (environment/social/governance)
            response_type: Type of response (yes_no/number/dropdown/etc)
            raw_value: The supplier's raw response
            weight: Question weight (multiplier)
            scoring_config: Configuration for how to score this question
            
        Returns:
            QuestionScore with raw_score, weighted_score, and calculation details
        """
        # Get the appropriate rule
        rule = get_rule(scoring_config.rule)
        
        # Calculate raw score using the rule
        result = rule.calculate(raw_value, scoring_config)
        raw_score = result["score"]
        
        # Calculate weighted score
        weighted_score = raw_score * weight
        
        return QuestionScore(
            question_id=question_id,
            question_text=question_text,
            section=section,
            raw_response=raw_value,
            response_type=response_type,
            scoring_rule=scoring_config.rule.value if isinstance(scoring_config.rule, ScoringRuleType) else scoring_config.rule,
            raw_score=raw_score,
            weight=weight,
            weighted_score=weighted_score,
            calculation_details=result["calculation_details"],
        )
    
    def calculate_section_score(
        self,
        section: str,
        question_scores: List[QuestionScore],
        esg_weight: float,
    ) -> SectionScore:
        """
        Aggregate question scores into a section score.
        
        Formula:
            section_score = sum(weighted_scores) / sum(weights) * (weight_contribution)
            
        Args:
            section: ESG section name
            question_scores: List of QuestionScore for this section
            esg_weight: This section's weight in the overall ESG score
            
        Returns:
            SectionScore with aggregated score
        """
        if not question_scores:
            return SectionScore(
                section=section,
                questions=[],
                total_weight=0,
                weighted_sum=0,
                score=0,
                esg_weight=esg_weight,
                weighted_esg_contribution=0,
            )
        
        total_weight = sum(q.weight for q in question_scores)
        weighted_sum = sum(q.weighted_score for q in question_scores)
        
        # Section score = weighted average of question scores
        if total_weight > 0:
            score = weighted_sum / total_weight
        else:
            score = 0
        
        # This section's contribution to overall ESG score
        weighted_esg_contribution = score * (esg_weight / 100)
        
        return SectionScore(
            section=section,
            questions=question_scores,
            total_weight=total_weight,
            weighted_sum=weighted_sum,
            score=round(score, 2),
            esg_weight=esg_weight,
            weighted_esg_contribution=round(weighted_esg_contribution, 2),
        )
    
    def calculate_esg_score(
        self,
        question_scores: List[QuestionScore],
        section_weights: ESGSectionWeights,
    ) -> ESGScore:
        """
        Calculate overall ESG score from question scores.
        
        Flow:
            1. Group questions by section
            2. Calculate section scores
            3. Calculate weighted average for overall ESG
            
        Args:
            question_scores: All question scores
            section_weights: Weight configuration for E/S/G sections
            
        Returns:
            ESGScore with section breakdown and overall score
        """
        weights_dict = section_weights.to_dict()
        
        # Group by section
        section_questions: Dict[str, List[QuestionScore]] = {
            "environment": [],
            "social": [],
            "governance": [],
        }
        
        for qs in question_scores:
            section = qs.section.lower()
            if section in section_questions:
                section_questions[section].append(qs)
        
        # Calculate section scores
        section_scores = {}
        for section, questions in section_questions.items():
            section_scores[section] = self.calculate_section_score(
                section=section,
                question_scores=questions,
                esg_weight=weights_dict.get(section, 33.33),
            )
        
        # Calculate overall ESG score (weighted average)
        overall_score = sum(
            ss.weighted_esg_contribution for ss in section_scores.values()
        )
        
        return ESGScore(
            environment=section_scores.get("environment"),
            social=section_scores.get("social"),
            governance=section_scores.get("governance"),
            overall_score=round(overall_score, 2),
            section_weights=weights_dict,
        )
    
    def calculate_supplier_score(
        self,
        supplier_id: str,
        questionnaire_id: str,
        esg_score: Optional[ESGScore],
        ghg_score: Optional[float],
        revenue_percentage: Optional[float],
        overall_weights: OverallSupplierWeights,
    ) -> SupplierScore:
        """
        Calculate final supplier score combining all components.
        
        Formula:
            supplier_score = (esg_score * esg_weight/100) + 
                           (ghg_score * ghg_weight/100) + 
                           (revenue_score * revenue_weight/100)
            
        Where:
            - revenue_score = normalized revenue impact (higher % = better, capped at 100)
            
        Args:
            supplier_id: Supplier relationship ID
            questionnaire_id: Questionnaire ID
            esg_score: Calculated ESG score
            ghg_score: GHG performance score (0-100, where 100 = best emissions profile)
            revenue_percentage: Supplier's revenue percentage contribution
            overall_weights: Component weight configuration
            
        Returns:
            SupplierScore with overall score
        """
        weights = overall_weights.to_dict()
        
        # Get component scores
        esg_value = esg_score.overall_score if esg_score else 0
        ghg_value = ghg_score if ghg_score is not None else 0
        
        # Revenue score: normalize percentage to 0-100
        # Higher revenue % = more strategic supplier = higher score
        # Cap at 100 (if supplier is 100% of revenue)
        revenue_value = min(100, (revenue_percentage or 0))
        
        # Calculate weighted overall score
        overall = (
            (esg_value * weights["esg"] / 100) +
            (ghg_value * weights["ghg"] / 100) +
            (revenue_value * weights["revenue"] / 100)
        )
        
        return SupplierScore(
            supplier_id=supplier_id,
            questionnaire_id=questionnaire_id,
            esg_score=esg_score,
            ghg_score=ghg_score,
            revenue_score=revenue_value,
            overall_score=round(overall, 2),
            component_weights=weights,
            calculated_at=datetime.now(timezone.utc).isoformat(),
        )
    
    def calculate_full_score(
        self,
        supplier_id: str,
        questionnaire_id: str,
        questionnaire_title: Optional[str],
        supplier_name: Optional[str],
        questions: List[Dict[str, Any]],
        answers: Dict[str, Any],
        esg_weights: ESGSectionWeights,
        overall_weights: OverallSupplierWeights,
        ghg_score: Optional[float] = None,
        revenue_percentage: Optional[float] = None,
    ) -> ScoreBreakdown:
        """
        Calculate complete supplier score with full breakdown.
        
        This is the main entry point for scoring a supplier's questionnaire response.
        
        Args:
            supplier_id: Supplier relationship ID
            questionnaire_id: Questionnaire ID
            questionnaire_title: Questionnaire name (for audit trail)
            supplier_name: Company name (for audit trail)
            questions: List of question configurations, each containing:
                - id: question ID
                - question_text: the question
                - category/section: ESG section
                - response_type: type of response
                - weight: question weight
                - scoring: ScoringConfig or dict
            answers: Dict mapping question_id to raw answer value
            esg_weights: Section weight configuration
            overall_weights: Component weight configuration
            ghg_score: Pre-calculated GHG score (optional)
            revenue_percentage: Revenue contribution percentage (optional)
            
        Returns:
            ScoreBreakdown with complete audit trail
        """
        question_scores: List[QuestionScore] = []
        notes: List[str] = []
        
        # Calculate score for each question
        for q in questions:
            question_id = q.get("id")
            raw_value = answers.get(question_id)
            
            # Skip unanswered questions
            if raw_value is None:
                notes.append(f"Question '{question_id}' not answered, excluded from scoring")
                continue
            
            # Get scoring config
            scoring_dict = q.get("scoring", {})
            if not scoring_dict:
                # Default to manual scoring if no config
                scoring_dict = {"rule": "manual"}
                notes.append(f"Question '{question_id}' has no scoring config, using manual scoring")
            
            # Build ScoringConfig
            try:
                if isinstance(scoring_dict, ScoringConfig):
                    scoring_config = scoring_dict
                else:
                    scoring_config = ScoringConfig(**scoring_dict)
            except Exception as e:
                notes.append(f"Invalid scoring config for '{question_id}': {e}")
                continue
            
            # Calculate question score
            try:
                q_score = self.calculate_question_score(
                    question_id=question_id,
                    question_text=q.get("question_text", ""),
                    section=q.get("category", q.get("section", "environment")),
                    response_type=q.get("response_type", "text"),
                    raw_value=raw_value,
                    weight=q.get("weight", 1.0),
                    scoring_config=scoring_config,
                )
                question_scores.append(q_score)
            except Exception as e:
                notes.append(f"Error calculating score for '{question_id}': {e}")
        
        # Calculate ESG score
        esg_score = self.calculate_esg_score(question_scores, esg_weights)
        
        # Calculate supplier score
        supplier_score = self.calculate_supplier_score(
            supplier_id=supplier_id,
            questionnaire_id=questionnaire_id,
            esg_score=esg_score,
            ghg_score=ghg_score,
            revenue_percentage=revenue_percentage,
            overall_weights=overall_weights,
        )
        
        # Build section scores dict
        section_scores = {
            "environment": esg_score.environment,
            "social": esg_score.social,
            "governance": esg_score.governance,
        }
        
        return ScoreBreakdown(
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            questionnaire_id=questionnaire_id,
            questionnaire_title=questionnaire_title,
            question_scores=question_scores,
            section_scores=section_scores,
            esg_score=esg_score,
            supplier_score=supplier_score,
            esg_section_weights=esg_weights.to_dict(),
            overall_weights=overall_weights.to_dict(),
            calculated_at=datetime.now(timezone.utc).isoformat(),
            notes=notes,
        )


# Singleton instance for convenience
score_calculator = ScoreCalculator()
