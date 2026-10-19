"""
KPI Engine - Filter Builder

Builds MongoDB queries from KPI filter definitions.
Supports various operators: =, !=, >, <, >=, <=, in, not_in, between, contains, starts_with
"""

from enum import Enum
from typing import Any, Dict, List, Optional


class FilterOperator(str, Enum):
    """Supported filter operators."""
    EQUALS = "="
    NOT_EQUALS = "!="
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_EQUAL = ">="
    LESS_EQUAL = "<="
    IN = "in"
    NOT_IN = "not_in"
    BETWEEN = "between"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"


class FilterBuilder:
    """
    Builds MongoDB queries from KPI filter definitions.
    
    Filter definitions come from esg_kpi_definitions.filters array:
    [
        {"field_key": "source_type", "operator": "=", "value": "Ground Water"},
        {"field_key": "quantity", "operator": ">", "value": 1000}
    ]
    
    These filters are applied to the field_values object in records.
    """
    
    @staticmethod
    def build_filter(filter_def: Dict[str, Any]) -> Dict[str, Any]:
        """
        Build a single MongoDB filter from a filter definition.
        
        Args:
            filter_def: Filter definition with field_key, operator, value
            
        Returns:
            MongoDB filter dict
        """
        field_key = filter_def.get("field_key", "")
        operator = filter_def.get("operator", "=")
        value = filter_def.get("value")
        
        if not field_key:
            return {}
        
        # Build the field path - filters apply to field_values
        field_path = f"field_values.{field_key}"
        
        # Map operator to MongoDB query
        if operator == "=" or operator == FilterOperator.EQUALS.value:
            return {field_path: value}
            
        elif operator == "!=" or operator == FilterOperator.NOT_EQUALS.value:
            return {field_path: {"$ne": value}}
            
        elif operator == ">" or operator == FilterOperator.GREATER_THAN.value:
            return {field_path: {"$gt": value}}
            
        elif operator == "<" or operator == FilterOperator.LESS_THAN.value:
            return {field_path: {"$lt": value}}
            
        elif operator == ">=" or operator == FilterOperator.GREATER_EQUAL.value:
            return {field_path: {"$gte": value}}
            
        elif operator == "<=" or operator == FilterOperator.LESS_EQUAL.value:
            return {field_path: {"$lte": value}}
            
        elif operator == "in" or operator == FilterOperator.IN.value:
            # Value should be a list
            if isinstance(value, list):
                return {field_path: {"$in": value}}
            return {field_path: {"$in": [value]}}
            
        elif operator == "not_in" or operator == FilterOperator.NOT_IN.value:
            if isinstance(value, list):
                return {field_path: {"$nin": value}}
            return {field_path: {"$nin": [value]}}
            
        elif operator == "between" or operator == FilterOperator.BETWEEN.value:
            # Value should be [min, max]
            if isinstance(value, list) and len(value) == 2:
                return {field_path: {"$gte": value[0], "$lte": value[1]}}
            return {}
            
        elif operator == "contains" or operator == FilterOperator.CONTAINS.value:
            # Case-insensitive contains
            return {field_path: {"$regex": str(value), "$options": "i"}}
            
        elif operator == "starts_with" or operator == FilterOperator.STARTS_WITH.value:
            return {field_path: {"$regex": f"^{value}", "$options": "i"}}
            
        elif operator == "exists" or operator == FilterOperator.EXISTS.value:
            return {field_path: {"$exists": True, "$ne": None}}
            
        elif operator == "not_exists" or operator == FilterOperator.NOT_EXISTS.value:
            return {field_path: {"$exists": False}}
            
        # Default to equals
        return {field_path: value}
    
    @staticmethod
    def build_filters(filter_defs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Build MongoDB filter from multiple filter definitions.
        All filters are combined with AND logic.
        
        Args:
            filter_defs: List of filter definitions
            
        Returns:
            Combined MongoDB filter dict
        """
        if not filter_defs:
            return {}
            
        combined_filter = {}
        
        for filter_def in filter_defs:
            single_filter = FilterBuilder.build_filter(filter_def)
            combined_filter.update(single_filter)
            
        return combined_filter
    
    @staticmethod
    def build_category_filter(
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        sub_subcategory: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Build filter for category hierarchy.
        
        Args:
            category: Category name
            subcategory: Subcategory name
            sub_subcategory: Sub-subcategory name
            
        Returns:
            MongoDB filter dict
        """
        filters = {}
        
        if category:
            filters["category"] = category
        if subcategory:
            filters["subcategory"] = subcategory
        if sub_subcategory:
            filters["sub_subcategory"] = sub_subcategory
            
        return filters
    
    @staticmethod
    def merge_filters(*filter_dicts: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge multiple filter dictionaries into one.
        
        Args:
            filter_dicts: Variable number of filter dicts
            
        Returns:
            Merged filter dict
        """
        merged = {}
        for f in filter_dicts:
            if f:
                merged.update(f)
        return merged
