"""
Activity matching for Scope 3 Bulk Upload (Exact matching only)
"""
from typing import Dict, List, Optional, Tuple
import re

from ..models import ActivityMatch, ValidationError, ErrorSeverity, CalculationMethod


class ActivityMatcher:
    """Handles activity matching with exact matching only (no fuzzy)"""
    
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
        # Index by name (case-insensitive, normalized)
        self.by_name = {}
        # Index by normalized name (for matching variations)
        self.by_normalized_name = {}
        
        for act in self.activities:
            # By method - handle None values
            method = (act.get("method") or "").lower()
            if method not in self.by_method:
                self.by_method[method] = []
            self.by_method[method].append(act)
            
            # By activity type
            at = act.get("activity_type") or ""
            if at:
                if at not in self.by_activity_type:
                    self.by_activity_type[at] = []
                self.by_activity_type[at].append(act)
            
            # By name (exact, lowercase) - handle None values
            name = (act.get("activity") or "").lower().strip()
            if name:
                self.by_name[name] = act
                # Also index normalized version
                normalized = self._normalize_activity_name(name)
                self.by_normalized_name[normalized] = act
    
    def _normalize_activity_name(self, name: str) -> str:
        """
        Normalize activity name for matching variations.
        Examples:
            "Van - Diesel" -> "van-diesel"
            "Van-Diesel" -> "van-diesel"
            "Cars - Medium Size - Petrol" -> "cars-medium size-petrol"
        """
        if not name:
            return ""
        # Lowercase and strip
        normalized = name.lower().strip()
        # Replace multiple spaces/dashes with single dash
        normalized = re.sub(r'\s*-\s*', '-', normalized)
        # Remove extra whitespace
        normalized = re.sub(r'\s+', ' ', normalized)
        return normalized
    
    def match_activity(self, activity_name: str, method: CalculationMethod,
                       activity_type: Optional[str] = None,
                       sub_category: Optional[str] = None) -> ActivityMatch:
        """
        Match an activity name to database activities using exact matching only.
        
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
        activity_normalized = self._normalize_activity_name(activity_clean)
        
        # For supplier_basis, allow custom activities
        if method == CalculationMethod.SUPPLIER_BASIS:
            # Try to match existing activity first (exact or normalized)
            if activity_lower in self.by_name:
                act = self.by_name[activity_lower]
                return ActivityMatch(
                    matched=True,
                    activity_name=act.get("activity"),
                    activity_id=act.get("id"),
                    confidence=100.0
                )
            if activity_normalized in self.by_normalized_name:
                act = self.by_normalized_name[activity_normalized]
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
        
        # Exact match (case-insensitive)
        for cand in candidates:
            cand_name = cand.get("activity", "").lower().strip()
            if cand_name == activity_lower:
                return ActivityMatch(
                    matched=True,
                    activity_name=cand.get("activity"),
                    activity_id=cand.get("id"),
                    confidence=100.0
                )
        
        # Normalized match (handles "Van - Diesel" vs "Van-Diesel")
        for cand in candidates:
            cand_normalized = self._normalize_activity_name(cand.get("activity", ""))
            if cand_normalized == activity_normalized:
                return ActivityMatch(
                    matched=True,
                    activity_name=cand.get("activity"),
                    activity_id=cand.get("id"),
                    confidence=100.0
                )
        
        # No match found - provide helpful suggestions
        top_activities = [c.get("activity", "") for c in candidates[:10]]
        return ActivityMatch(
            matched=False,
            confidence=0.0,
            suggestions=[
                f"Activity '{activity_name}' not found (exact match required).",
                f"Available activities include: {', '.join(top_activities[:5])}",
                "Use exact activity names or consider using supplier_basis with custom activity."
            ],
            recommend_supplier_basis=True
        )
    
    def _get_candidates(self, method: CalculationMethod, 
                        activity_type: Optional[str],
                        sub_category: Optional[str]) -> List[Dict]:
        """
        Get candidate activities based on filters.
        
        For subcategory categories (C8, C10, C11, C13, C14):
        - Uses SAME logic as frontend EmissionEntryForm.js (lines 407-429):
          - For electricity: ONLY show entries with exact 'subcategory' field match
          - For stationary/mobile: If entry has no 'subcategory' defined, show in BOTH
        - Check 'subcategory' field (no underscore) - this is what frontend uses
        - Fugitive emissions come from fuel_database with 'subcategory': 'fugitive_emissions'
        """
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
            sub_lower = sub_category.lower().strip().replace(" ", "_")
            
            # For electricity: ONLY show entries with exact 'subcategory' = 'electricity'
            # (Same as frontend line 411-416)
            if sub_lower == 'electricity':
                candidates = [c for c in candidates 
                             if (c.get("subcategory") or "").lower() == "electricity"]
            
            # For stationary_combustion or mobile_combustion:
            # Show entries where 'subcategory' is null/empty (valid for both)
            # OR where 'subcategory' matches exactly
            # (Same as frontend lines 419-428)
            elif sub_lower in ['stationary_combustion', 'mobile_combustion']:
                filtered = []
                for c in candidates:
                    # Use 'subcategory' field (no underscore) like frontend does
                    c_subcat = c.get("subcategory") or ""
                    
                    if not c_subcat or c_subcat == "":
                        # No subcategory defined - valid for BOTH stationary and mobile
                        filtered.append(c)
                    elif c_subcat.lower().replace(" ", "_") == sub_lower:
                        # Exact match on subcategory
                        filtered.append(c)
                    # Also check array format (like frontend line 425-426)
                    elif isinstance(c_subcat, list) and sub_lower.replace("_", " ") in [s.lower() for s in c_subcat]:
                        filtered.append(c)
                candidates = filtered
            
            # For fugitive_emissions: match activities with subcategory = 'fugitive_emissions'
            # (These are loaded from fuel_database via get_fugitive_emissions)
            elif sub_lower == 'fugitive_emissions':
                candidates = [c for c in candidates 
                             if (c.get("sub_category") or "").lower().replace(" ", "_") == "fugitive_emissions" or
                                (c.get("subcategory") or "").lower().replace(" ", "_") == "fugitive_emissions"]
            
            # For process_emissions (supplier_basis only): allow custom activities
            elif sub_lower == 'process_emissions':
                candidates = [c for c in candidates 
                             if 'process' in (c.get("subcategory") or "").lower() or
                                'process' in (c.get("sub_category") or "").lower()]
            
            # Default: exact match on subcategory field
            else:
                candidates = [c for c in candidates 
                             if (c.get("subcategory") or "").lower().strip().replace(" ", "_") == sub_lower]
        
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
