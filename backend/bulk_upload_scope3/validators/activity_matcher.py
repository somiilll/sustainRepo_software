"""
Activity matching with fuzzy search for Scope 3 Bulk Upload
"""
from typing import Dict, List, Optional, Tuple
from rapidfuzz import fuzz, process

from ..models import ActivityMatch, ValidationError, ErrorSeverity, CalculationMethod


class ActivityMatcher:
    """Handles activity matching with fuzzy search"""
    
    def __init__(self, activities: List[Dict]):
        """
        Initialize with list of activities
        
        Args:
            activities: List of activity dicts from scope3_ef
        """
        self.activities = activities
        self._build_index()
    
    def _build_index(self):
        """Build search indices"""
        # Index by method
        self.by_method = {}
        # Index by activity_type
        self.by_activity_type = {}
        # Index by name (case-insensitive)
        self.by_name = {}
        
        for act in self.activities:
            # By method
            method = act.get("method", "").lower()
            if method not in self.by_method:
                self.by_method[method] = []
            self.by_method[method].append(act)
            
            # By activity type
            at = act.get("activity_type", "")
            if at:
                if at not in self.by_activity_type:
                    self.by_activity_type[at] = []
                self.by_activity_type[at].append(act)
            
            # By name
            name = act.get("activity", "").lower().strip()
            if name:
                self.by_name[name] = act
    
    def match_activity(self, activity_name: str, method: CalculationMethod,
                       activity_type: Optional[str] = None,
                       sub_category: Optional[str] = None) -> ActivityMatch:
        """
        Match an activity name to database activities
        
        Args:
            activity_name: Activity name from upload
            method: Calculation method
            activity_type: Activity type (for C6/C7)
            sub_category: Sub-category (for C8-C14)
            
        Returns:
            ActivityMatch result
        """
        if not activity_name:
            return ActivityMatch(
                matched=False,
                recommend_supplier_basis=True,
                suggestions=[]
            )
        
        activity_clean = str(activity_name).strip()
        activity_lower = activity_clean.lower()
        
        # For supplier_basis, allow custom activities
        if method == CalculationMethod.SUPPLIER_BASIS:
            # Try to match existing activity first
            if activity_lower in self.by_name:
                act = self.by_name[activity_lower]
                return ActivityMatch(
                    matched=True,
                    activity_name=act.get("activity"),
                    activity_id=act.get("id"),
                    confidence=100.0
                )
            # Allow custom activity for supplier_basis
            return ActivityMatch(
                matched=True,
                activity_name=activity_clean,
                confidence=100.0,
                is_fuzzy_match=False
            )
        
        # Get candidate activities based on method and filters
        candidates = self._get_candidates(method, activity_type, sub_category)
        
        if not candidates:
            return ActivityMatch(
                matched=False,
                recommend_supplier_basis=True,
                suggestions=["No activities found for this method/type combination. Consider using supplier_basis."]
            )
        
        # Exact match
        for cand in candidates:
            if cand.get("activity", "").lower().strip() == activity_lower:
                return ActivityMatch(
                    matched=True,
                    activity_name=cand.get("activity"),
                    activity_id=cand.get("id"),
                    confidence=100.0
                )
        
        # Fuzzy match
        candidate_names = [c.get("activity", "") for c in candidates if c.get("activity")]
        if candidate_names:
            result = process.extractOne(
                activity_clean, 
                candidate_names, 
                scorer=fuzz.ratio
            )
            
            if result:
                matched_name, score, _ = result
                
                if score >= 85:
                    # High confidence match
                    matched_act = next((c for c in candidates if c.get("activity") == matched_name), None)
                    return ActivityMatch(
                        matched=True,
                        activity_name=matched_name,
                        activity_id=matched_act.get("id") if matched_act else None,
                        confidence=float(score),
                        is_fuzzy_match=True,
                        suggestions=[f"Matched to '{matched_name}' (confidence: {score}%)"]
                    )
                elif score >= 60:
                    # Medium confidence - suggest but don't auto-match
                    top_matches = process.extract(activity_clean, candidate_names, scorer=fuzz.ratio, limit=3)
                    suggestions = [f"Did you mean '{m[0]}'? (similarity: {m[1]}%)" for m in top_matches]
                    return ActivityMatch(
                        matched=False,
                        confidence=float(score),
                        is_fuzzy_match=True,
                        suggestions=suggestions,
                        recommend_supplier_basis=True
                    )
        
        # No match found
        top_activities = [c.get("activity", "") for c in candidates[:5]]
        return ActivityMatch(
            matched=False,
            confidence=0.0,
            suggestions=[
                f"Activity '{activity_name}' not found.",
                f"Available activities include: {', '.join(top_activities)}",
                "Consider using supplier_basis with custom activity."
            ],
            recommend_supplier_basis=True
        )
    
    def _get_candidates(self, method: CalculationMethod, 
                        activity_type: Optional[str],
                        sub_category: Optional[str]) -> List[Dict]:
        """Get candidate activities based on filters"""
        method_key = method.value.lower()
        
        # Start with method-based filtering
        if method_key in self.by_method:
            candidates = self.by_method[method_key]
        else:
            candidates = self.activities
        
        # Filter by activity_type if provided
        if activity_type:
            at_lower = activity_type.lower().strip()
            candidates = [c for c in candidates if c.get("activity_type", "").lower() == at_lower]
        
        # Filter by sub_category if provided
        if sub_category:
            sub_lower = sub_category.lower().strip()
            candidates = [c for c in candidates if c.get("sub_category", "").lower() == sub_lower]
        
        return candidates
    
    def get_allowed_units(self, activity_id: str) -> List[str]:
        """Get allowed units for an activity"""
        for act in self.activities:
            if act.get("id") == activity_id:
                return act.get("allowed_units", [])
        return []
    
    def get_default_unit(self, activity_id: str) -> Optional[str]:
        """Get default unit for an activity"""
        for act in self.activities:
            if act.get("id") == activity_id:
                return act.get("default_unit")
        return None


def create_activity_match_error(match: ActivityMatch, activity_name: str,
                                row_num: int, sheet_name: str) -> ValidationError:
    """Create a validation error from a failed activity match"""
    message = f"Activity '{activity_name}' not found"
    
    if match.suggestions:
        suggestion = " | ".join(match.suggestions)
    elif match.recommend_supplier_basis:
        suggestion = "Use supplier_basis method with custom activity name"
    else:
        suggestion = "Check spelling or select from available activities"
    
    return ValidationError(
        sheet=sheet_name,
        row=row_num,
        column="Activity",
        error_type="ACTIVITY_NOT_FOUND",
        message=message,
        suggestion=suggestion,
        severity=ErrorSeverity.ERROR
    )
