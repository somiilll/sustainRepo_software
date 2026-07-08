"""
Version comparison utilities for ESG Records, Questionnaires, and Framework responses.
Single source of truth for diff computation across all versioned entities.
"""

from typing import Any, Dict, List, Optional


def compare_versions(previous: Dict[str, Any], current: Dict[str, Any], prefix: str = "") -> List[Dict[str, Any]]:
    """
    Compare two snapshots and return field-level changes with hierarchical paths.
    
    Returns:
        [
            {"field": "field_values.quantity", "old": 120, "new": 145},
            {"field": "field_values.scope1.co2e", "old": 10.4, "new": 12.1},
            {"field": "status", "old": "pending", "new": "approved"}
        ]
    """
    changes = []
    all_keys = set(previous.keys()) | set(current.keys())
    
    # Skip internal/metadata fields
    skip_keys = {"_id", "id", "created_at", "updated_at", "created_by", "updated_by", "version", "is_current"}
    
    for key in all_keys:
        if key in skip_keys:
            continue
            
        field_path = f"{prefix}.{key}" if prefix else key
        old_val = previous.get(key)
        new_val = current.get(key)
        
        # Both are dicts - recurse
        if isinstance(old_val, dict) and isinstance(new_val, dict):
            changes.extend(compare_versions(old_val, new_val, field_path))
        # One is dict, other is not, or both are non-dict
        elif old_val != new_val:
            changes.append({
                "field": field_path,
                "old": old_val,
                "new": new_val
            })
    
    return changes


def get_changed_field_paths(previous: Dict[str, Any], current: Dict[str, Any]) -> List[str]:
    """
    Get list of hierarchical field paths that changed.
    Useful for storing in DB for later querying.
    
    Returns:
        ["field_values.quantity", "field_values.scope1.co2e", "status"]
    """
    changes = compare_versions(previous, current)
    return [c["field"] for c in changes]


def format_field_display_name(field_path: str) -> str:
    """
    Convert hierarchical field path to human-readable display name.
    
    "field_values.total_quantity" -> "Total Quantity"
    "field_values.scope1.co2e" -> "Scope1 Co2E"
    """
    # Take last part of path for display
    parts = field_path.split(".")
    last_part = parts[-1] if parts else field_path
    
    # Skip 'field_values' prefix in display
    if len(parts) > 1 and parts[0] == "field_values":
        display_parts = parts[1:]
        last_part = " > ".join(p.replace("_", " ").title() for p in display_parts)
    else:
        last_part = last_part.replace("_", " ").title()
    
    return last_part
