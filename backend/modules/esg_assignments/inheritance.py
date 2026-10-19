"""
Inheritance resolution logic for ESG Assignments

Handles the "most specific wins" rule for determining effective assignments.
Hierarchy for Questions: Section > Topic > Principle > Question
Hierarchy for Records: Category > Subcategory > Record Type
"""

from typing import Optional, List, Dict, Any
from .models import AssignmentLevel, EntityType


# ============================================
# SPECIFICITY ORDER (higher = more specific)
# ============================================

QUESTION_SPECIFICITY = {
    AssignmentLevel.SECTION: 1,
    AssignmentLevel.TOPIC: 2,
    AssignmentLevel.PRINCIPLE: 3,
    AssignmentLevel.QUESTION: 4,
}

RECORD_SPECIFICITY = {
    AssignmentLevel.CATEGORY: 1,
    AssignmentLevel.SUBCATEGORY: 2,
    AssignmentLevel.RECORD_TYPE: 3,
}


def get_specificity(assignment_level: AssignmentLevel, entity_type: EntityType) -> int:
    """Get the specificity score for an assignment level"""
    if entity_type == EntityType.QUESTION:
        return QUESTION_SPECIFICITY.get(assignment_level, 0)
    else:
        return RECORD_SPECIFICITY.get(assignment_level, 0)


def get_parent_levels(assignment_level: AssignmentLevel, entity_type: EntityType) -> List[AssignmentLevel]:
    """Get all parent levels that could provide inherited assignments"""
    if entity_type == EntityType.QUESTION:
        level_order = [
            AssignmentLevel.SECTION,
            AssignmentLevel.TOPIC,
            AssignmentLevel.PRINCIPLE,
            AssignmentLevel.QUESTION,
        ]
    else:
        level_order = [
            AssignmentLevel.CATEGORY,
            AssignmentLevel.SUBCATEGORY,
            AssignmentLevel.RECORD_TYPE,
        ]
    
    try:
        current_idx = level_order.index(assignment_level)
        return level_order[:current_idx]  # All levels before current
    except ValueError:
        return []


def resolve_effective_assignment(
    assignments: List[Dict[str, Any]],
    entity_type: EntityType
) -> Optional[Dict[str, Any]]:
    """
    Resolve the effective assignment from a list of potentially matching assignments.
    Uses "most specific wins" rule.
    
    Args:
        assignments: List of assignment documents that could apply
        entity_type: Whether this is for a question or record
    
    Returns:
        The most specific assignment, or None if no assignments
    """
    if not assignments:
        return None
    
    if len(assignments) == 1:
        return assignments[0]
    
    # Sort by specificity (descending) and take the most specific
    def get_sort_key(assignment):
        level = AssignmentLevel(assignment.get("assignment_level", "question"))
        return get_specificity(level, entity_type)
    
    sorted_assignments = sorted(assignments, key=get_sort_key, reverse=True)
    return sorted_assignments[0]


def build_inheritance_query(
    entity_type: EntityType,
    question_key: Optional[str] = None,
    section: Optional[str] = None,
    topic: Optional[str] = None,
    principle: Optional[str] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    record_type: Optional[str] = None,
    organization_id: str = None,
    reporting_period: str = None,
) -> Dict[str, Any]:
    """
    Build a MongoDB query that finds all potentially applicable assignments
    for an entity, considering inheritance.
    
    Returns query that matches:
    - Direct assignment to the specific entity
    - Parent-level assignments that would inherit down
    
    Example for question "env_assurance_energy":
    - Direct: entity_id = "env_assurance_energy", level = "question"
    - Topic: entity_id = "Assurance", level = "topic"
    - Section: entity_id = "environment", level = "section"
    - Principle: entity_id = "P6", level = "principle"
    """
    base_query = {
        "organization_id": organization_id,
        "entity_type": entity_type.value,
        "reporting_period": reporting_period,
    }
    
    or_conditions = []
    
    if entity_type == EntityType.QUESTION:
        # Add all possible matching conditions for questions
        if question_key:
            or_conditions.append({
                "assignment_level": AssignmentLevel.QUESTION.value,
                "entity_id": question_key
            })
        if topic:
            or_conditions.append({
                "assignment_level": AssignmentLevel.TOPIC.value,
                "entity_id": topic
            })
        if section:
            or_conditions.append({
                "assignment_level": AssignmentLevel.SECTION.value,
                "entity_id": section
            })
        if principle:
            or_conditions.append({
                "assignment_level": AssignmentLevel.PRINCIPLE.value,
                "entity_id": principle
            })
    else:
        # Add all possible matching conditions for records
        if record_type:
            or_conditions.append({
                "assignment_level": AssignmentLevel.RECORD_TYPE.value,
                "entity_id": record_type
            })
        if subcategory:
            or_conditions.append({
                "assignment_level": AssignmentLevel.SUBCATEGORY.value,
                "entity_id": subcategory
            })
        if category:
            or_conditions.append({
                "assignment_level": AssignmentLevel.CATEGORY.value,
                "entity_id": category
            })
    
    if or_conditions:
        base_query["$or"] = or_conditions
    
    return base_query


def get_question_hierarchy(question_config: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """
    Extract hierarchy information from a question config.
    
    Returns dict with section, topic (group), principle, and question_key
    """
    return {
        "question_key": question_config.get("question_key"),
        "section": question_config.get("section"),
        "topic": question_config.get("group"),  # 'group' field is the topic/subtab
        "principle": question_config.get("brsr_principle") or question_config.get("principle"),
    }


def get_record_hierarchy(record_category: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """
    Extract hierarchy information from a record category.
    
    Returns dict with category, subcategory, and record_type
    """
    return {
        "category": record_category.get("category"),
        "subcategory": record_category.get("subcategory"),
        "record_type": record_category.get("record_type") or record_category.get("id"),
    }
