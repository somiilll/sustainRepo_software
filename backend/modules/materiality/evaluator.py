"""
Materiality Evaluation Service

Single source of truth for materiality classification logic.
Isolated from UI and data layer for easy modification.

Future extensibility:
- Weighted average calculations
- Multi-source score aggregation
- Disclosure-level evaluation
"""

from typing import Optional, Tuple
from .models import MaterialityStatus


class MaterialityEvaluator:
    """
    Centralized evaluation service for materiality classification.
    
    All classification logic goes through this service.
    Do NOT embed classification logic elsewhere.
    """
    
    @staticmethod
    def evaluate(
        business_score: Optional[float],
        stakeholder_score: Optional[float],
        business_cutoff: float,
        stakeholder_cutoff: float,
    ) -> Tuple[MaterialityStatus, bool]:
        """
        Evaluate materiality based on scores and cutoffs.
        
        Returns:
            (status, is_material)
            - status: MATERIAL, NON_MATERIAL, or MONITOR
            - is_material: True if meets both cutoffs
        
        Logic (isolated here for future changes):
        - MATERIAL: business >= cutoff AND stakeholder >= cutoff
        - MONITOR: meets one cutoff but not both
        - NON_MATERIAL: below both cutoffs
        """
        if business_score is None or stakeholder_score is None:
            return MaterialityStatus.NON_MATERIAL, False
        
        meets_business = business_score >= business_cutoff
        meets_stakeholder = stakeholder_score >= stakeholder_cutoff
        
        if meets_business and meets_stakeholder:
            return MaterialityStatus.MATERIAL, True
        elif meets_business or meets_stakeholder:
            return MaterialityStatus.MONITOR, False
        else:
            return MaterialityStatus.NON_MATERIAL, False
    
    @staticmethod
    def get_final_status(
        auto_status: MaterialityStatus,
        auto_is_material: bool,
        has_override: bool,
        override_is_material: Optional[bool],
    ) -> Tuple[str, bool]:
        """
        Get final materiality decision considering manual override.
        
        Override takes precedence over auto-calculation.
        Reports and disclosures use this final result.
        """
        if has_override and override_is_material is not None:
            final_is_material = override_is_material
            # Override can flip status
            if override_is_material:
                final_status = MaterialityStatus.MATERIAL.value
            else:
                final_status = MaterialityStatus.NON_MATERIAL.value
        else:
            final_status = auto_status.value
            final_is_material = auto_is_material
        
        return final_status, final_is_material
    
    # ==========================================================================
    # Future extension points (not implemented)
    # ==========================================================================
    
    @staticmethod
    def calculate_weighted_score(
        scores_by_category: dict,  # {category: (business, stakeholder)}
        weights: dict,  # {category: weight}
    ) -> Tuple[float, float]:
        """
        Future: Calculate weighted average from multiple stakeholder categories.
        
        Example:
            scores = {"employees": (4.5, 4.2), "customers": (3.8, 4.0)}
            weights = {"employees": 0.4, "customers": 0.6}
            -> weighted_business, weighted_stakeholder
        """
        # Placeholder for future implementation
        raise NotImplementedError("Weighted scoring not implemented in Phase 1")
    
    @staticmethod
    def aggregate_multi_source_scores(
        scores_by_source: list,  # [(source, business, stakeholder), ...]
    ) -> Tuple[float, float]:
        """
        Future: Aggregate scores from multiple sources (manual, survey, import).
        
        Strategy TBD: average, weighted, latest-wins, etc.
        """
        # Placeholder for future implementation
        raise NotImplementedError("Multi-source aggregation not implemented in Phase 1")
