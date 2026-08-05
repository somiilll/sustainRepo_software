"""
Supplier Assessment Scoring Engine

A modular, extensible scoring system for ESG questionnaires.
Supports multiple scoring rules without requiring code changes.

Architecture:
    - rules.py: Strategy pattern implementations for each scoring rule type
    - models.py: Pydantic models for configuration and results
    - calculator.py: Pure calculation logic (no DB access)
    - engine.py: High-level orchestration with database interaction

Calculation Flow:
    Raw Response → Question Score → Weighted Question Score → 
    Section Score → ESG Score → Overall Supplier Score

Supported Scoring Rules:
    - higher_is_better: Linear scale where higher values = higher scores
    - lower_is_better: Inverted scale where lower values = higher scores
    - boolean: Yes/No mapping with configurable scores
    - choice_mapping: Map discrete choices to specific scores
    - target_based: Score based on % of target achieved
    - manual: Requires human review/scoring
"""

from .engine import ScoringEngine
from .rules import (
    ScoringRule,
    HigherIsBetterRule,
    LowerIsBetterRule,
    BooleanRule,
    ChoiceMappingRule,
    TargetBasedRule,
    ManualScoringRule,
    get_rule,
    RULE_REGISTRY,
)
from .models import (
    ScoringConfig,
    ScoringRuleType,
    ResponseType,
    Section,
    QuestionConfig,
    QuestionScore,
    SectionScore,
    ESGScore,
    SupplierScore,
    ScoreBreakdown,
    ESGSectionWeights,
    OverallSupplierWeights,
)
from .calculator import ScoreCalculator, score_calculator

__all__ = [
    # Engine
    "ScoringEngine",
    
    # Rules
    "ScoringRule",
    "HigherIsBetterRule",
    "LowerIsBetterRule", 
    "BooleanRule",
    "ChoiceMappingRule",
    "TargetBasedRule",
    "ManualScoringRule",
    "get_rule",
    "RULE_REGISTRY",
    
    # Models
    "ScoringConfig",
    "ScoringRuleType",
    "ResponseType",
    "Section",
    "QuestionConfig",
    "QuestionScore",
    "SectionScore",
    "ESGScore",
    "SupplierScore",
    "ScoreBreakdown",
    "ESGSectionWeights",
    "OverallSupplierWeights",
    
    # Calculator
    "ScoreCalculator",
    "score_calculator",
]
