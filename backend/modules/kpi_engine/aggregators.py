"""
KPI Engine - Aggregators

Aggregation functions for KPI calculations.
Supports: SUM, COUNT, AVG, MIN, MAX, FORMULA (future)
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from .utils import extract_field_value, parse_numeric_value


class AggregationType(str, Enum):
    """Supported aggregation types."""
    SUM = "sum"
    COUNT = "count"
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    FORMULA = "formula"  # Future implementation


class Aggregator:
    """
    Performs aggregation calculations on ESG records.
    
    Usage:
        aggregator = Aggregator()
        result = aggregator.aggregate(records, "sum", "quantity")
    """
    
    @staticmethod
    def aggregate(
        records: List[Dict[str, Any]],
        aggregation_type: str,
        value_field: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Perform aggregation on a list of records.
        
        Args:
            records: List of ESG record documents
            aggregation_type: Type of aggregation (sum, count, avg, min, max)
            value_field: Field key to aggregate (required for sum, avg, min, max)
            
        Returns:
            Dict with 'value' and 'record_count'
        """
        agg_type = aggregation_type.lower()
        
        if agg_type == AggregationType.COUNT.value:
            return Aggregator.count(records)
        elif agg_type == AggregationType.SUM.value:
            return Aggregator.sum(records, value_field)
        elif agg_type == AggregationType.AVG.value:
            return Aggregator.avg(records, value_field)
        elif agg_type == AggregationType.MIN.value:
            return Aggregator.min(records, value_field)
        elif agg_type == AggregationType.MAX.value:
            return Aggregator.max(records, value_field)
        else:
            # Default to count for unknown types
            return Aggregator.count(records)
    
    @staticmethod
    def count(records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Count the number of records.
        
        Args:
            records: List of records
            
        Returns:
            Dict with count value
        """
        count = len(records)
        return {
            "value": count,
            "record_count": count,
        }
    
    @staticmethod
    def sum(
        records: List[Dict[str, Any]], 
        value_field: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sum the values of a specific field across records.
        
        Args:
            records: List of records
            value_field: Field key to sum from field_values
            
        Returns:
            Dict with sum value and record count
        """
        if not value_field:
            # No value field specified - return count instead
            return Aggregator.count(records)
        
        total = 0.0
        valid_count = 0
        
        for record in records:
            raw_value = extract_field_value(record, value_field)
            numeric_value = parse_numeric_value(raw_value)
            
            if numeric_value is not None:
                total += numeric_value
                valid_count += 1
        
        return {
            "value": total,
            "record_count": len(records),
            "valid_record_count": valid_count,
        }
    
    @staticmethod
    def avg(
        records: List[Dict[str, Any]], 
        value_field: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculate average of a specific field across records.
        
        Args:
            records: List of records
            value_field: Field key to average from field_values
            
        Returns:
            Dict with average value and record count
        """
        if not value_field:
            return {"value": None, "record_count": len(records), "error": "No value_field specified"}
        
        values = []
        
        for record in records:
            raw_value = extract_field_value(record, value_field)
            numeric_value = parse_numeric_value(raw_value)
            
            if numeric_value is not None:
                values.append(numeric_value)
        
        if not values:
            return {
                "value": None,
                "record_count": len(records),
                "valid_record_count": 0,
            }
        
        avg_value = sum(values) / len(values)
        
        return {
            "value": avg_value,
            "record_count": len(records),
            "valid_record_count": len(values),
        }
    
    @staticmethod
    def min(
        records: List[Dict[str, Any]], 
        value_field: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Find minimum value of a specific field across records.
        
        Args:
            records: List of records
            value_field: Field key to find min from field_values
            
        Returns:
            Dict with min value and record count
        """
        if not value_field:
            return {"value": None, "record_count": len(records), "error": "No value_field specified"}
        
        values = []
        
        for record in records:
            raw_value = extract_field_value(record, value_field)
            numeric_value = parse_numeric_value(raw_value)
            
            if numeric_value is not None:
                values.append(numeric_value)
        
        if not values:
            return {
                "value": None,
                "record_count": len(records),
                "valid_record_count": 0,
            }
        
        return {
            "value": min(values),
            "record_count": len(records),
            "valid_record_count": len(values),
        }
    
    @staticmethod
    def max(
        records: List[Dict[str, Any]], 
        value_field: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Find maximum value of a specific field across records.
        
        Args:
            records: List of records
            value_field: Field key to find max from field_values
            
        Returns:
            Dict with max value and record count
        """
        if not value_field:
            return {"value": None, "record_count": len(records), "error": "No value_field specified"}
        
        values = []
        
        for record in records:
            raw_value = extract_field_value(record, value_field)
            numeric_value = parse_numeric_value(raw_value)
            
            if numeric_value is not None:
                values.append(numeric_value)
        
        if not values:
            return {
                "value": None,
                "record_count": len(records),
                "valid_record_count": 0,
            }
        
        return {
            "value": max(values),
            "record_count": len(records),
            "valid_record_count": len(values),
        }
    
    @staticmethod
    def group_by(
        records: List[Dict[str, Any]],
        group_field: str,
        aggregation_type: str,
        value_field: Optional[str] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Group records by a field and aggregate each group.
        Useful for dimension-based reporting.
        
        Args:
            records: List of records
            group_field: Field key to group by (from field_values)
            aggregation_type: Type of aggregation for each group
            value_field: Field key to aggregate
            
        Returns:
            Dict mapping group values to aggregation results
        """
        # Group records by the group_field value
        groups: Dict[str, List[Dict[str, Any]]] = {}
        
        for record in records:
            group_value = extract_field_value(record, group_field)
            if group_value is None:
                group_value = "_unknown"
            else:
                group_value = str(group_value)
            
            if group_value not in groups:
                groups[group_value] = []
            groups[group_value].append(record)
        
        # Aggregate each group
        results = {}
        for group_value, group_records in groups.items():
            results[group_value] = Aggregator.aggregate(
                group_records, 
                aggregation_type, 
                value_field
            )
        
        return results
