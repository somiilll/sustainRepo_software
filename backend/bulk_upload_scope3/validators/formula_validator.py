"""
Formula validation for Scope 3 Bulk Upload
Validates inputs against calc-engine formula requirements
"""
from typing import Dict, List, Optional, Any, Tuple
import httpx

from ..models import (
    ValidationError, ErrorSeverity, CalculationMethod, FormulaValidation
)


class FormulaValidator:
    """Validates row data against formula requirements from calc-engine"""
    
    def __init__(self, db, api_base_url: str = ""):
        """
        Initialize formula validator
        
        Args:
            db: Database connection
            api_base_url: Base URL for internal API calls (optional)
        """
        self.db = db
        self.api_base_url = api_base_url
        self._form_config_cache = {}
        self._formula_cache = {}
    
    async def get_form_config(self, category_id: str) -> Optional[Dict]:
        """Fetch form config for a category from calc-engine"""
        if category_id in self._form_config_cache:
            return self._form_config_cache[category_id]
        
        # Fetch from ce_formulas and ce_categories
        category = await self.db.ce_categories.find_one(
            {"id": category_id},
            {"_id": 0}
        )
        
        if not category:
            return None
        
        formulas = await self.db.ce_formulas.find(
            {"category_id": category_id, "is_active": {"$ne": False}},
            {"_id": 0}
        ).to_list(100)
        
        # Get decision tree if exists
        decision_tree = await self.db.ce_decision_trees.find_one(
            {"category_id": category_id},
            {"_id": 0}
        )
        
        config = {
            "category": category,
            "formulas": formulas,
            "decision_tree": decision_tree.get("tree") if decision_tree else None,
            "has_decision_tree": decision_tree is not None
        }
        
        self._form_config_cache[category_id] = config
        return config
    
    async def get_category_by_code(self, category_code: str) -> Optional[Dict]:
        """Get category by code (e.g., 'C1', 'C2')"""
        pattern = f"^{category_code}\\s*-"
        return await self.db.ce_categories.find_one(
            {"name": {"$regex": pattern, "$options": "i"}, "scope_code": "scope3"},
            {"_id": 0}
        )
    
    def match_formula(self, form_config: Dict, method: CalculationMethod,
                      activity_type: Optional[str] = None) -> Optional[Dict]:
        """
        Match the appropriate formula based on method and activity type
        
        Args:
            form_config: Form configuration with formulas
            method: Calculation method
            activity_type: Activity type (for C6/C7)
            
        Returns:
            Matched formula dict or None
        """
        formulas = form_config.get("formulas", [])
        if not formulas:
            return None
        
        # Method to formula name mapping
        method_keywords = {
            CalculationMethod.ACTIVITY_BASIS: ["activity", "quantity"],
            CalculationMethod.SPEND_BASIS: ["spend", "spent", "monetary"],
            CalculationMethod.SUPPLIER_BASIS: ["supplier"],
        }
        
        # Activity type to formula name mapping for C6/C7
        activity_type_keywords = {
            "air_travel": ["passenger", "distance", "air"],
            "rail_travel": ["passenger", "distance", "rail"],
            "taxi_travel": ["passenger", "distance", "taxi"],
            "bus_travel": ["passenger", "distance", "bus"],
            "car_travel": ["km", "distance", "car"],
            "bike_travel": ["km", "distance", "bike"],
            "hotel_stay": ["hotel", "room", "night"],
            "wfh": ["wfh", "work from home", "remote"],
        }
        
        # Try to match by activity_type first if provided
        if activity_type and activity_type in activity_type_keywords:
            keywords = activity_type_keywords[activity_type]
            for formula in formulas:
                formula_name = formula.get("name", "").lower()
                if any(kw in formula_name for kw in keywords):
                    return formula
        
        # Match by method keywords
        keywords = method_keywords.get(method, [])
        for formula in formulas:
            formula_name = formula.get("name", "").lower()
            if any(kw in formula_name for kw in keywords):
                return formula
        
        # Fallback to first formula
        return formulas[0] if formulas else None
    
    def validate_formula_inputs(self, row_data: Dict, formula: Dict,
                                method: CalculationMethod,
                                row_num: int, sheet_name: str) -> FormulaValidation:
        """
        Validate that row data has all required formula inputs
        
        Args:
            row_data: Row data from upload
            formula: Matched formula
            method: Calculation method
            row_num: Row number for error reporting
            sheet_name: Sheet name for error reporting
            
        Returns:
            FormulaValidation result
        """
        if not formula:
            return FormulaValidation(
                valid=True,
                formula_id=None,
                formula_name=None,
                missing_inputs=[],
                allowed_units=[]
            )
        
        # For supplier_basis, we calculate differently
        if method == CalculationMethod.SUPPLIER_BASIS:
            # Check supplier-specific required fields
            required = {
                "supplier_quantity": ["supplier_quantity", "quantity_supplier"],
                "supplier_ef": ["supplier_ef", "emission_factor_supplier"],
            }
            missing = []
            for field, keys in required.items():
                if not any(row_data.get(k) for k in keys):
                    missing.append(field.replace("_", " ").title())
            
            return FormulaValidation(
                valid=len(missing) == 0,
                formula_id=formula.get("id"),
                formula_name=formula.get("name"),
                missing_inputs=missing,
                allowed_units=[]
            )
        
        # Get required inputs from formula definition
        definition = formula.get("definition", {})
        if isinstance(definition, str):
            import json
            try:
                definition = json.loads(definition)
            except (json.JSONDecodeError, TypeError):
                definition = {}
        
        formula_inputs = definition.get("inputs", [])
        if not formula_inputs:
            formula_inputs = formula.get("inputs", [])
        
        # Map row data keys to formula input variables
        key_mapping = {
            "quantity_used": ["activity_value", "quantity", "amount"],
            "spent_amount": ["spend_amount", "amount_spent", "spend_value"],
            "distance_travelled": ["distance", "distance_km", "distance_travelled"],
            "quantity_goods": ["quantity_of_goods", "goods_quantity", "weight"],
            "passengers": ["passengers", "number_of_passengers", "passenger_count"],
            "rooms": ["rooms", "number_of_rooms", "room_count"],
            "nights": ["nights", "number_of_nights", "night_count"],
            "working_days": ["working_days", "days_worked"],
            "working_hours": ["working_hours", "hours_per_day"],
        }
        
        missing = []
        for inp in formula_inputs:
            var_name = inp.get("variable", "") if isinstance(inp, dict) else str(inp)
            
            # Check if this input is provided
            found = False
            
            # Direct match
            if row_data.get(var_name):
                found = True
            else:
                # Check mapped keys
                for row_key, formula_vars in key_mapping.items():
                    if var_name in formula_vars and row_data.get(row_key):
                        found = True
                        break
                
                # Check reverse mapping
                for row_key, formula_vars in key_mapping.items():
                    if row_key == var_name and row_data.get(row_key):
                        found = True
                        break
            
            if not found:
                # Get label for display
                if isinstance(inp, dict):
                    label = inp.get("label", var_name)
                    if isinstance(label, dict):
                        label = label.get("value", var_name)
                else:
                    label = var_name
                missing.append(label)
        
        # Get allowed units from formula
        allowed_units = []
        for inp in formula_inputs:
            if isinstance(inp, dict):
                units = inp.get("allowed_units", [])
                if units:
                    allowed_units.extend(units)
        
        return FormulaValidation(
            valid=len(missing) == 0,
            formula_id=formula.get("id"),
            formula_name=formula.get("name"),
            missing_inputs=missing,
            allowed_units=list(set(allowed_units))
        )
    
    def create_missing_inputs_error(self, validation: FormulaValidation,
                                    row_num: int, sheet_name: str) -> ValidationError:
        """Create validation error for missing formula inputs"""
        return ValidationError(
            sheet=sheet_name,
            row=row_num,
            column="Multiple",
            error_type="MISSING_FORMULA_INPUTS",
            message=f"Required formula inputs missing: {', '.join(validation.missing_inputs)}",
            suggestion=f"Please fill in: {', '.join(validation.missing_inputs)}",
            severity=ErrorSeverity.ERROR
        )


async def validate_decision_tree(db, category_id: str, row_data: Dict,
                                  method: CalculationMethod,
                                  activity_type: Optional[str] = None) -> Tuple[Optional[str], List[str]]:
    """
    Traverse decision tree to find matching formula
    
    Args:
        db: Database connection
        category_id: Category ID
        row_data: Row data from upload
        method: Calculation method
        activity_type: Activity type (for C6/C7)
        
    Returns:
        Tuple of (formula_id, list_of_missing_decisions)
    """
    decision_tree_doc = await db.ce_decision_trees.find_one(
        {"category_id": category_id},
        {"_id": 0}
    )
    
    if not decision_tree_doc or not decision_tree_doc.get("tree"):
        return None, []
    
    tree = decision_tree_doc["tree"]
    
    # Build decision inputs
    decision_inputs = {
        "calculation_method_scope3": method.value,
    }
    if activity_type:
        decision_inputs["activity_type"] = activity_type
    
    # Traverse tree
    def traverse(node):
        if not node:
            return None, []
        
        # Leaf node with formula
        if "formula_id" in node:
            return node["formula_id"], []
        
        # Decision node
        if "decision_key" in node:
            key = node["decision_key"]
            value = decision_inputs.get(key)
            
            if not value:
                return None, [key]
            
            branches = node.get("branches", {})
            if value in branches:
                return traverse(branches[value])
            elif "default" in branches:
                return traverse(branches["default"])
            else:
                return None, [f"{key}={value} (not found in tree)"]
        
        return None, []
    
    return traverse(tree)
