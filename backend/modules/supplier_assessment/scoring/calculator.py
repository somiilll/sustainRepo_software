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
        question_category: Optional[str],
        response_type: str,
        raw_value: Any,
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
            scoring_config: Configuration for how to score this question
            
        Returns:
            QuestionScore with raw score and audit details
        """
        # Get the appropriate rule
        rule = get_rule(scoring_config.rule)
        
        # Calculate raw score using the rule
        result = rule.calculate(raw_value, scoring_config)
        raw_score = result["score"]
        
        return QuestionScore(
            question_id=question_id,
            question_text=question_text,
            section=section,
            question_category=question_category,
            raw_response=raw_value,
            response_type=response_type,
            scoring_rule=scoring_config.rule.value if isinstance(scoring_config.rule, ScoringRuleType) else scoring_config.rule,
            raw_score=raw_score,
            calculation_details=result["calculation_details"],
        )

    @staticmethod
    def _missing_evidence_multiplier(question: Dict[str, Any]) -> float:
        configured_percent = question.get("missing_evidence_percent")
        if configured_percent is not None:
            return min(1.0, max(0.0, float(configured_percent) / 100))
        scores = question.get("point_scores") or {}
        full_score = float(scores.get("yes_with_evidence_score", scores.get("yes_score", 0)) or 0)
        reduced_score = float(scores.get("yes_without_evidence_score", 0) or 0)
        if full_score > 0:
            return min(1.0, max(0.0, reduced_score / full_score))
        return 0.5

    @staticmethod
    def _choice_mapping_uses_points(question: Dict[str, Any]) -> bool:
        max_points = question.get("max_points")
        choices = (question.get("scoring") or {}).get("choices") or {}
        try:
            highest_choice = max(float(value) for value in choices.values())
            return max_points is not None and abs(highest_choice - float(max_points)) < 0.0001
        except (TypeError, ValueError):
            return False
    
    def calculate_section_score(
        self,
        section: str,
        question_scores: List[QuestionScore],
        esg_weight: float,
        subcategory_weights: Optional[Dict[str, float]] = None,
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
                total_maximum_points=0,
                obtained_points=0,
                score=0,
                esg_weight=esg_weight,
                weighted_esg_contribution=0,
                is_applicable=False,
            )
        
        category_questions: Dict[str, List[QuestionScore]] = {}
        for question in question_scores:
            category_questions.setdefault(question.question_category or "legacy", []).append(question)
        category_details = {}
        for category, items in category_questions.items():
            maximum_points = sum(float(item.max_points if item.max_points is not None else 100) for item in items)
            if maximum_points <= 0:
                raise ValueError(f"Category '{category}' has no scorable maximum points")
            obtained_points = sum(
                float(item.points_earned) if item.points_earned is not None
                else float(item.raw_score) / 100 * float(item.max_points if item.max_points is not None else 100)
                for item in items
            )
            category_details[category] = {
                "obtained_points": obtained_points,
                "maximum_points": maximum_points,
                "normalized_percentage": obtained_points / maximum_points * 100,
            }
        category_scores = {category: details["normalized_percentage"] for category, details in category_details.items()}
        configured_weights = subcategory_weights or {}
        active_weights = {category: float(configured_weights.get(category, 0)) for category in category_scores}
        configured_total = sum(float(weight) for weight in configured_weights.values())
        if configured_weights and abs(configured_total - 100) > 0.01:
            raise ValueError(f"Configured category weights for {section} must total 100%")
        if not configured_weights:
            raise ValueError(f"No configured category weights are available for {section}")
        applicable_weight_total = sum(active_weights.values())
        if applicable_weight_total <= 0:
            raise ValueError(f"No applicable category weights are available for {section}")
        for category, details in category_details.items():
            details["base_configured_weightage"] = active_weights[category]
            details["configured_weightage"] = active_weights[category] / applicable_weight_total * 100
            details["weighted_contribution"] = details["normalized_percentage"] * details["configured_weightage"] / 100
        score = sum(details["weighted_contribution"] for details in category_details.values())
        
        # This section's contribution to overall ESG score
        weighted_esg_contribution = score * (esg_weight / 100)
        
        return SectionScore(
            section=section,
            questions=question_scores,
            total_maximum_points=sum(details["maximum_points"] for details in category_details.values()),
            obtained_points=sum(details["obtained_points"] for details in category_details.values()),
            score=score,
            esg_weight=esg_weight,
            weighted_esg_contribution=weighted_esg_contribution,
            is_applicable=True,
            category_scores=category_scores,
            category_weights={category: category_details[category]["configured_weightage"] for category in active_weights},
            category_details=category_details,
        )
    
    def calculate_esg_score(
        self,
        question_scores: List[QuestionScore],
        section_weights: ESGSectionWeights,
        subcategory_weights: Optional[Dict[str, Dict[str, float]]] = None,
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
        if abs(sum(weights_dict.values()) - 100) > 0.01:
            raise ValueError("ESG pillar weights must total 100%")
        
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
        
        configured_subcategory_weights = subcategory_weights or {}
        raw_section_scores = {}
        for section, questions in section_questions.items():
            raw_section_scores[section] = self.calculate_section_score(
                section=section,
                question_scores=questions,
                esg_weight=weights_dict.get(section, 33.33),
                subcategory_weights=configured_subcategory_weights.get(section),
            )
        section_scores = {}
        for section, raw_score in raw_section_scores.items():
            effective_weight = weights_dict.get(section, 0)
            section_scores[section] = raw_score.model_copy(update={
                "esg_weight": effective_weight,
                "weighted_esg_contribution": raw_score.score * effective_weight / 100,
                "is_applicable": raw_score.is_applicable,
            })
        overall_score = sum(score.weighted_esg_contribution for score in section_scores.values())
        
        return ESGScore(
            environment=section_scores.get("environment"),
            social=section_scores.get("social"),
            governance=section_scores.get("governance"),
            overall_score=overall_score,
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
        subcategory_weights: Optional[Dict[str, Dict[str, float]]] = None,
        ghg_score: Optional[float] = None,
        revenue_percentage: Optional[float] = None,
        manual_scores: Optional[Dict[str, Any]] = None,
        evidence_by_question: Optional[Dict[str, List[str]]] = None,
        question_reviews: Optional[Dict[str, Any]] = None,
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
        manual_scores = manual_scores or {}
        evidence_by_question = evidence_by_question or {}
        question_reviews = question_reviews or {}
        
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
                manual_entry = manual_scores.get(question_id)
                manual_score = manual_entry.get("score") if isinstance(manual_entry, dict) else manual_entry
                has_manual_score = manual_score is not None
                q_score = self.calculate_question_score(
                    question_id=question_id,
                    question_text=q.get("question_text", ""),
                    section=q.get("section") or q.get("category", "environment"),
                    question_category=q.get("question_category"),
                    response_type=q.get("response_type", "text"),
                    raw_value=manual_score if has_manual_score else raw_value,
                    scoring_config=scoring_config,
                )
                assessment_type = q.get("assessment_type", "standard")
                if assessment_type in {"type_a", "type_b", "type_c"} and q.get("response_type") == "yes_no":
                    answer_is_yes = str(raw_value).strip().lower() in {"yes", "true", "1"} or raw_value is True
                    has_evidence = bool(evidence_by_question.get(question_id))
                    max_points = float(q.get("max_points") or 100)
                    configured = q.get("point_scores") or {}
                    earned_points = float(configured.get("no_score", 0.0)) if not answer_is_yes else (
                        float(configured.get("yes_score", max_points)) if assessment_type == "type_b" else (
                            float(configured.get("yes_with_evidence_score", max_points)) if has_evidence else (
                                float(configured.get("yes_without_evidence_score", max_points / 2)) if assessment_type == "type_c" else 0.0
                            )
                        )
                    )
                    automatic_score = earned_points / max_points * 100 if max_points else 0.0
                    q_score.raw_score = automatic_score
                    q_score.max_points = max_points
                    q_score.points_earned = earned_points
                    q_score.calculation_details = {
                        "rule_type": assessment_type,
                        "max_points": max_points, "points_earned": earned_points,
                        "has_evidence": has_evidence,
                        "automatic_score_percent": automatic_score,
                    }
                elif assessment_type == "type_c" and q.get("response_type") == "dropdown":
                    has_evidence = bool(evidence_by_question.get(question_id))
                    max_points = float(q.get("max_points") or 100)
                    selected_option_points = float(q_score.raw_score)
                    if not self._choice_mapping_uses_points(q):
                        selected_option_points = selected_option_points / 100 * max_points
                    selected_option_points = min(max_points, max(0.0, selected_option_points))
                    evidence_multiplier = 1.0 if has_evidence else self._missing_evidence_multiplier(q)
                    earned_points = selected_option_points * evidence_multiplier
                    automatic_score = earned_points / max_points * 100 if max_points else 0.0
                    q_score.raw_score = automatic_score
                    q_score.max_points = max_points
                    q_score.points_earned = earned_points
                    q_score.calculation_details = {
                        "rule_type": assessment_type,
                        "selected_option_points": selected_option_points,
                        "missing_evidence_multiplier": evidence_multiplier,
                        "max_points": max_points,
                        "points_earned": earned_points,
                        "has_evidence": has_evidence,
                        "automatic_score_percent": automatic_score,
                    }
                elif q.get("response_type") == "dropdown" and q_score.scoring_rule == "choice_mapping":
                    max_points = float(q.get("max_points") or 100)
                    selected_option_points = min(max_points, max(0.0, float(q_score.raw_score)))
                    automatic_score = selected_option_points / max_points * 100 if max_points else 0.0
                    q_score.raw_score = automatic_score
                    q_score.max_points = max_points
                    q_score.points_earned = selected_option_points
                    q_score.calculation_details.update({
                        "selected_option_points": selected_option_points,
                        "max_points": max_points,
                        "points_earned": selected_option_points,
                        "automatic_score_percent": automatic_score,
                    })
                elif q.get("response_type") == "dropdown" and self._choice_mapping_uses_points(q):
                    max_points = float(q["max_points"])
                    earned_points = min(max_points, max(0.0, float(q_score.raw_score)))
                    q_score.raw_score = earned_points / max_points * 100 if max_points else 0.0
                    q_score.max_points = max_points
                    q_score.points_earned = earned_points
                    q_score.calculation_details.update({
                        "score_unit": "points",
                        "max_points": max_points,
                        "points_earned": earned_points,
                    })
                elif q.get("max_points") is not None:
                    q_score.max_points = float(q["max_points"])
                    q_score.points_earned = q_score.raw_score / 100 * q_score.max_points
                if has_manual_score:
                    q_score.raw_response = raw_value
                    q_score.calculation_details.update({
                        "manual_score": float(manual_score),
                        "score_source": "parent_manual_review",
                    })

                # Check if there is an approved reviewer decision
                review_entry = question_reviews.get(question_id)
                if isinstance(review_entry, dict) and review_entry.get("status") in {"accepted", "rejected"}:
                    rev_status = review_entry.get("status")
                    if review_entry.get("reviewer_score") is not None and not review_entry.get("needs_resubmission"):
                        # Reviewer set an explicit approved score (e.g., 0 or partial points)
                        approved_score = float(review_entry.get("reviewer_score", 0.0) or 0.0)
                        max_p = float(q_score.max_points if q_score.max_points is not None else 100)
                        # Interpret reviewer_score: if max_p is configured, reviewer_score is capped at max_p
                        points_approved = min(max_p, max(0.0, approved_score))
                        q_score.points_earned = points_approved
                        q_score.raw_score = (points_approved / max_p * 100) if max_p > 0 else 0.0
                        q_score.calculation_details.update({
                            "review_status": rev_status,
                            "reviewer_score": approved_score,
                            "reviewer_note": review_entry.get("reviewer_note"),
                            "score_source": "parent_question_review",
                        })
                    elif rev_status == "accepted":
                        q_score.calculation_details.update({
                            "review_status": "accepted",
                            "score_source": "parent_question_accepted",
                        })

                question_scores.append(q_score)
            except Exception as e:
                notes.append(f"Error calculating score for '{question_id}': {e}")
        
        # Calculate ESG score
        esg_score = self.calculate_esg_score(question_scores, esg_weights, subcategory_weights)
        
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
            esg_subcategory_weights=subcategory_weights or {},
            overall_weights=overall_weights.to_dict(),
            calculated_at=datetime.now(timezone.utc).isoformat(),
            notes=notes,
        )


# Singleton instance for convenience
score_calculator = ScoreCalculator()
