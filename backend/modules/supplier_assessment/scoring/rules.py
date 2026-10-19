"""
Scoring Rules - Strategy Pattern Implementation

Each rule implements the calculate() method that transforms a raw response into a normalized score (0-100).
Rules are designed to be pure functions with no side effects for easy testing and auditability.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union
from .models import ScoringConfig, ScoringRuleType


class ScoringRule(ABC):
    """
    Abstract base class for scoring rules.
    
    Each rule takes a raw response value and scoring configuration,
    and returns a normalized score between 0-100.
    """
    
    @property
    @abstractmethod
    def rule_type(self) -> ScoringRuleType:
        """Return the rule type enum."""
        pass
    
    @abstractmethod
    def calculate(
        self,
        raw_value: Any,
        config: ScoringConfig,
    ) -> Dict[str, Any]:
        """
        Calculate the score for a given raw value.
        
        Args:
            raw_value: The raw response value from the supplier
            config: Scoring configuration for this question
            
        Returns:
            Dict containing:
                - score: float (0-100)
                - calculation_details: dict with audit trail
        """
        pass
    
    def _build_result(
        self,
        score: float,
        details: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Helper to build standardized result."""
        return {
            "score": min(100.0, max(0.0, score)),  # Clamp to 0-100
            "calculation_details": {
                "rule_type": self.rule_type.value,
                **details,
            }
        }


class HigherIsBetterRule(ScoringRule):
    """
    Score increases linearly as the value increases.
    
    Use cases:
        - Renewable energy percentage (0-100% -> 0-100 score)
        - Supplier diversity spend (more = better)
        - Employee satisfaction rate
        
    Formula:
        score = ((value - min) / (target - min)) * max_score
        
    Examples:
        - value=50, min=0, target=100 -> score=50
        - value=75, min=0, target=100 -> score=75
        - value=100, min=0, target=100 -> score=100
    """
    
    @property
    def rule_type(self) -> ScoringRuleType:
        return ScoringRuleType.HIGHER_IS_BETTER
    
    def calculate(
        self,
        raw_value: Any,
        config: ScoringConfig,
    ) -> Dict[str, Any]:
        try:
            value = float(raw_value)
        except (ValueError, TypeError):
            return self._build_result(0, {
                "error": f"Invalid numeric value: {raw_value}",
                "raw_value": raw_value,
            })
        
        min_val = config.min if config.min is not None else 0
        target = config.target if config.target is not None else 100
        max_score = config.max_score
        
        # Avoid division by zero
        if target == min_val:
            score = max_score if value >= target else 0
        else:
            # Linear interpolation
            score = ((value - min_val) / (target - min_val)) * max_score
        
        # Cap at max_score
        score = min(score, max_score)
        
        return self._build_result(score, {
            "raw_value": value,
            "min": min_val,
            "target": target,
            "max_score": max_score,
            "formula": f"(({value} - {min_val}) / ({target} - {min_val})) * {max_score}",
        })


class LowerIsBetterRule(ScoringRule):
    """
    Score decreases as the value increases (inverted scale).
    
    Use cases:
        - Carbon emissions (lower = better)
        - Workplace injuries (lower = better)
        - Energy consumption per unit
        - Water waste
        
    Formula:
        score = ((max_acceptable - value) / (max_acceptable - min)) * max_score
        
    Examples:
        - emissions=0, max_acceptable=1000 -> score=100
        - emissions=500, max_acceptable=1000 -> score=50
        - emissions=1000+, max_acceptable=1000 -> score=0
    """
    
    @property
    def rule_type(self) -> ScoringRuleType:
        return ScoringRuleType.LOWER_IS_BETTER
    
    def calculate(
        self,
        raw_value: Any,
        config: ScoringConfig,
    ) -> Dict[str, Any]:
        try:
            value = float(raw_value)
        except (ValueError, TypeError):
            return self._build_result(0, {
                "error": f"Invalid numeric value: {raw_value}",
                "raw_value": raw_value,
            })
        
        min_val = config.min if config.min is not None else 0
        max_acceptable = config.max_acceptable if config.max_acceptable is not None else config.max or 100
        max_score = config.max_score
        
        # If value is at or below minimum, full score
        if value <= min_val:
            return self._build_result(max_score, {
                "raw_value": value,
                "min": min_val,
                "max_acceptable": max_acceptable,
                "max_score": max_score,
                "note": "Value at or below minimum, full score",
            })
        
        # If value exceeds max acceptable, zero score
        if value >= max_acceptable:
            return self._build_result(0, {
                "raw_value": value,
                "min": min_val,
                "max_acceptable": max_acceptable,
                "max_score": max_score,
                "note": "Value exceeds max acceptable, zero score",
            })
        
        # Avoid division by zero
        if max_acceptable == min_val:
            score = 0
        else:
            # Inverted linear interpolation
            score = ((max_acceptable - value) / (max_acceptable - min_val)) * max_score
        
        return self._build_result(score, {
            "raw_value": value,
            "min": min_val,
            "max_acceptable": max_acceptable,
            "max_score": max_score,
            "formula": f"(({max_acceptable} - {value}) / ({max_acceptable} - {min_val})) * {max_score}",
        })


class BooleanRule(ScoringRule):
    """
    Simple yes/no scoring with configurable scores.
    
    Use cases:
        - ISO certifications (Yes/No)
        - Policy existence (Yes/No)
        - Board diversity requirements met
        
    Examples:
        - "Yes" / True / "true" / "1" -> true_score (default 100)
        - "No" / False / "false" / "0" -> false_score (default 0)
    """
    
    @property
    def rule_type(self) -> ScoringRuleType:
        return ScoringRuleType.BOOLEAN
    
    def calculate(
        self,
        raw_value: Any,
        config: ScoringConfig,
    ) -> Dict[str, Any]:
        true_score = config.true_score
        false_score = config.false_score
        
        # Normalize to boolean
        is_true = self._to_boolean(raw_value)
        
        if is_true is None:
            return self._build_result(false_score, {
                "error": f"Could not interpret as boolean: {raw_value}",
                "raw_value": raw_value,
                "true_score": true_score,
                "false_score": false_score,
            })
        
        score = true_score if is_true else false_score
        
        return self._build_result(score, {
            "raw_value": raw_value,
            "interpreted_as": is_true,
            "true_score": true_score,
            "false_score": false_score,
        })
    
    def _to_boolean(self, value: Any) -> Optional[bool]:
        """Convert various representations to boolean."""
        if isinstance(value, bool):
            return value
        
        if isinstance(value, (int, float)):
            return value != 0
        
        if isinstance(value, str):
            lower = value.lower().strip()
            if lower in ("yes", "true", "1", "y", "on"):
                return True
            if lower in ("no", "false", "0", "n", "off"):
                return False
        
        return None


class ChoiceMappingRule(ScoringRule):
    """
    Maps discrete choices to specific scores.
    
    Use cases:
        - Carbon target type (SBTi=100, Net Zero=80, None=0)
        - Rating scales (Excellent=100, Good=75, Fair=50, Poor=25)
        - Maturity levels (Advanced=100, Intermediate=60, Basic=30, None=0)
        
    Configuration:
        choices: {
            "SBTi Approved": 100,
            "Net Zero Target": 80,
            "Reduction Target": 60,
            "No Target": 0
        }
    """
    
    @property
    def rule_type(self) -> ScoringRuleType:
        return ScoringRuleType.CHOICE_MAPPING
    
    def calculate(
        self,
        raw_value: Any,
        config: ScoringConfig,
    ) -> Dict[str, Any]:
        choices = config.choices or {}
        
        if not choices:
            return self._build_result(0, {
                "error": "No choice mappings configured",
                "raw_value": raw_value,
            })
        
        # Try exact match first
        if raw_value in choices:
            return self._build_result(choices[raw_value], {
                "raw_value": raw_value,
                "matched_choice": raw_value,
                "available_choices": list(choices.keys()),
            })
        
        # Try case-insensitive match
        if isinstance(raw_value, str):
            lower_value = raw_value.lower().strip()
            for choice, score in choices.items():
                if isinstance(choice, str) and choice.lower().strip() == lower_value:
                    return self._build_result(score, {
                        "raw_value": raw_value,
                        "matched_choice": choice,
                        "match_type": "case_insensitive",
                        "available_choices": list(choices.keys()),
                    })
        
        # No match found
        return self._build_result(0, {
            "error": f"Value '{raw_value}' not found in choices",
            "raw_value": raw_value,
            "available_choices": list(choices.keys()),
        })


class ManualScoringRule(ScoringRule):
    """
    Score requires manual review and entry.
    
    Use cases:
        - Qualitative assessments
        - Complex narrative responses
        - Evidence review requirements
        
    Returns the raw value as score if numeric, otherwise 0.
    Flags for manual review in calculation_details.
    """
    
    @property
    def rule_type(self) -> ScoringRuleType:
        return ScoringRuleType.MANUAL
    
    def calculate(
        self,
        raw_value: Any,
        config: ScoringConfig,
    ) -> Dict[str, Any]:
        # If a manual score was already provided (numeric), use it
        try:
            if raw_value is not None:
                score = float(raw_value)
                return self._build_result(score, {
                    "raw_value": raw_value,
                    "requires_manual_review": config.requires_manual_review,
                    "note": "Manual score provided",
                })
        except (ValueError, TypeError):
            pass
        
        # Text response or no score - requires manual review
        return self._build_result(0, {
            "raw_value": raw_value,
            "requires_manual_review": True,
            "note": "Awaiting manual score entry",
        })


# Rule Registry - Maps rule types to rule classes
RULE_REGISTRY: Dict[ScoringRuleType, type] = {
    ScoringRuleType.HIGHER_IS_BETTER: HigherIsBetterRule,
    ScoringRuleType.LOWER_IS_BETTER: LowerIsBetterRule,
    ScoringRuleType.BOOLEAN: BooleanRule,
    ScoringRuleType.CHOICE_MAPPING: ChoiceMappingRule,
    ScoringRuleType.MANUAL: ManualScoringRule,
}


def get_rule(rule_type: Union[str, ScoringRuleType]) -> ScoringRule:
    """
    Factory function to get a scoring rule instance.
    
    Args:
        rule_type: Either a ScoringRuleType enum or string
        
    Returns:
        An instance of the appropriate ScoringRule subclass
        
    Raises:
        ValueError: If rule_type is not recognized
    """
    if isinstance(rule_type, str):
        try:
            rule_type = ScoringRuleType(rule_type)
        except ValueError:
            raise ValueError(f"Unknown scoring rule type: {rule_type}")
    
    rule_class = RULE_REGISTRY.get(rule_type)
    if rule_class is None:
        raise ValueError(f"No rule implementation for: {rule_type}")
    
    return rule_class()
