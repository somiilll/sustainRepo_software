"""
Calculation Engine API Routes

Provides REST endpoints for:
- SuperAdmin: Managing calculation methods, rules, parameters
- Admin/User: Executing calculations, previewing results
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

from .models import (
    # Input Fields
    InputFieldCreate, InputFieldResponse,
    # Input Templates
    InputTemplateCreate, InputTemplateResponse,
    # Parameter Values
    ParameterValueCreate, ParameterValueResponse,
    # Calculation Methods
    CalculationMethodCreate, CalculationMethodResponse,
    # Calculation Rules
    CalculationRuleCreate, CalculationRuleResponse,
    # Parameter Overrides
    ParameterOverrideCreate, ParameterOverrideResponse,
    # Unit Conversions
    UnitConversionCreate, UnitConversionResponse,
    # Calculation
    CalculationRequest, CalculationResult, CalculationContext
)
from .engine import CalculationEngine


def create_calculation_routes(db, get_current_user, get_super_admin_user, get_admin_user):
    """
    Factory function to create calculation engine routes.
    
    Args:
        db: Motor database instance
        get_current_user: Dependency for current user
        get_super_admin_user: Dependency for super admin
        get_admin_user: Dependency for admin
        
    Returns:
        APIRouter with calculation engine routes
    """
    
    router = APIRouter(prefix="/calc-engine", tags=["Calculation Engine"])
    engine = CalculationEngine(db)
    
    # ============================================
    # INPUT FIELDS (SuperAdmin)
    # ============================================
    
    @router.get("/super-admin/input-fields", response_model=List[InputFieldResponse])
    async def get_all_input_fields(current_user: dict = Depends(get_super_admin_user)):
        """Get all input field definitions"""
        fields = await db.calc_input_fields.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
        return [InputFieldResponse(**f) for f in fields]
    
    @router.post("/super-admin/input-fields", response_model=InputFieldResponse)
    async def create_input_field(
        field_data: InputFieldCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Create a new input field definition"""
        # Check for duplicate
        existing = await db.calc_input_fields.find_one({"field_key": field_data.field_key})
        if existing:
            raise HTTPException(status_code=400, detail=f"Field key '{field_data.field_key}' already exists")
        
        field_dict = field_data.model_dump()
        field_dict["id"] = str(uuid.uuid4())
        field_dict["created_by"] = current_user["id"]
        field_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_input_fields.insert_one(field_dict)
        return InputFieldResponse(**field_dict)
    
    @router.put("/super-admin/input-fields/{field_id}", response_model=InputFieldResponse)
    async def update_input_field(
        field_id: str,
        field_data: InputFieldCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Update an input field definition"""
        existing = await db.calc_input_fields.find_one({"id": field_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Field not found")
        
        update_dict = field_data.model_dump()
        update_dict["updated_by"] = current_user["id"]
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_input_fields.update_one({"id": field_id}, {"$set": update_dict})
        updated = await db.calc_input_fields.find_one({"id": field_id}, {"_id": 0})
        return InputFieldResponse(**updated)
    
    @router.delete("/super-admin/input-fields/{field_id}")
    async def delete_input_field(field_id: str, current_user: dict = Depends(get_super_admin_user)):
        """Delete an input field definition"""
        result = await db.calc_input_fields.delete_one({"id": field_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Field not found")
        return {"message": "Field deleted successfully"}
    
    # ============================================
    # INPUT TEMPLATES (SuperAdmin)
    # ============================================
    
    @router.get("/super-admin/input-templates", response_model=List[InputTemplateResponse])
    async def get_all_input_templates(current_user: dict = Depends(get_super_admin_user)):
        """Get all input templates with populated fields"""
        templates = await db.calc_input_templates.find({}, {"_id": 0}).sort("display_order", 1).to_list(1000)
        
        # Populate fields for each template
        result = []
        for template in templates:
            field_keys = template.get("field_keys", [])
            fields = await db.calc_input_fields.find(
                {"field_key": {"$in": field_keys}},
                {"_id": 0}
            ).to_list(100)
            template["fields"] = fields
            result.append(InputTemplateResponse(**template))
        
        return result
    
    @router.post("/super-admin/input-templates", response_model=InputTemplateResponse)
    async def create_input_template(
        template_data: InputTemplateCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Create a new input template"""
        existing = await db.calc_input_templates.find_one({"template_key": template_data.template_key})
        if existing:
            raise HTTPException(status_code=400, detail=f"Template key '{template_data.template_key}' already exists")
        
        template_dict = template_data.model_dump()
        template_dict["id"] = str(uuid.uuid4())
        template_dict["created_by"] = current_user["id"]
        template_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_input_templates.insert_one(template_dict)
        return InputTemplateResponse(**template_dict)
    
    @router.put("/super-admin/input-templates/{template_id}", response_model=InputTemplateResponse)
    async def update_input_template(
        template_id: str,
        template_data: InputTemplateCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Update an input template"""
        existing = await db.calc_input_templates.find_one({"id": template_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Template not found")
        
        update_dict = template_data.model_dump()
        update_dict["updated_by"] = current_user["id"]
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_input_templates.update_one({"id": template_id}, {"$set": update_dict})
        updated = await db.calc_input_templates.find_one({"id": template_id}, {"_id": 0})
        return InputTemplateResponse(**updated)
    
    @router.delete("/super-admin/input-templates/{template_id}")
    async def delete_input_template(template_id: str, current_user: dict = Depends(get_super_admin_user)):
        """Delete an input template"""
        result = await db.calc_input_templates.delete_one({"id": template_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"message": "Template deleted successfully"}
    
    # ============================================
    # PARAMETER VALUES (SuperAdmin)
    # ============================================
    
    @router.get("/super-admin/parameter-values", response_model=List[ParameterValueResponse])
    async def get_all_parameter_values(
        parameter_key: Optional[str] = None,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Get all parameter values, optionally filtered by key"""
        query = {}
        if parameter_key:
            query["parameter_key"] = parameter_key
        
        values = await db.calc_parameter_values.find(query, {"_id": 0}).sort("priority", 1).to_list(10000)
        return [ParameterValueResponse(**v) for v in values]
    
    @router.post("/super-admin/parameter-values", response_model=ParameterValueResponse)
    async def create_parameter_value(
        value_data: ParameterValueCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Create a new parameter value"""
        value_dict = value_data.model_dump()
        value_dict["id"] = str(uuid.uuid4())
        value_dict["created_by"] = current_user["id"]
        value_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_parameter_values.insert_one(value_dict)
        return ParameterValueResponse(**value_dict)
    
    @router.put("/super-admin/parameter-values/{value_id}", response_model=ParameterValueResponse)
    async def update_parameter_value(
        value_id: str,
        value_data: ParameterValueCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Update a parameter value"""
        existing = await db.calc_parameter_values.find_one({"id": value_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Parameter value not found")
        
        update_dict = value_data.model_dump()
        update_dict["updated_by"] = current_user["id"]
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_parameter_values.update_one({"id": value_id}, {"$set": update_dict})
        updated = await db.calc_parameter_values.find_one({"id": value_id}, {"_id": 0})
        return ParameterValueResponse(**updated)
    
    @router.delete("/super-admin/parameter-values/{value_id}")
    async def delete_parameter_value(value_id: str, current_user: dict = Depends(get_super_admin_user)):
        """Delete a parameter value"""
        result = await db.calc_parameter_values.delete_one({"id": value_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Parameter value not found")
        return {"message": "Parameter value deleted successfully"}
    
    # ============================================
    # CALCULATION METHODS (SuperAdmin)
    # ============================================
    
    @router.get("/super-admin/methods", response_model=List[CalculationMethodResponse])
    async def get_all_methods(current_user: dict = Depends(get_super_admin_user)):
        """Get all calculation methods"""
        methods = await db.calc_methods.find({}, {"_id": 0}).sort("rank", 1).to_list(1000)
        return [CalculationMethodResponse(**m) for m in methods]
    
    @router.post("/super-admin/methods", response_model=CalculationMethodResponse)
    async def create_method(
        method_data: CalculationMethodCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Create a new calculation method"""
        existing = await db.calc_methods.find_one({"method_key": method_data.method_key})
        if existing:
            raise HTTPException(status_code=400, detail=f"Method key '{method_data.method_key}' already exists")
        
        method_dict = method_data.model_dump()
        method_dict["id"] = str(uuid.uuid4())
        method_dict["created_by"] = current_user["id"]
        method_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_methods.insert_one(method_dict)
        return CalculationMethodResponse(**method_dict)
    
    @router.put("/super-admin/methods/{method_id}", response_model=CalculationMethodResponse)
    async def update_method(
        method_id: str,
        method_data: CalculationMethodCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Update a calculation method"""
        existing = await db.calc_methods.find_one({"id": method_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Method not found")
        
        update_dict = method_data.model_dump()
        update_dict["updated_by"] = current_user["id"]
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_methods.update_one({"id": method_id}, {"$set": update_dict})
        updated = await db.calc_methods.find_one({"id": method_id}, {"_id": 0})
        return CalculationMethodResponse(**updated)
    
    @router.delete("/super-admin/methods/{method_id}")
    async def delete_method(method_id: str, current_user: dict = Depends(get_super_admin_user)):
        """Delete a calculation method"""
        # Check if method is used in any rules
        rule_using = await db.calc_rules.find_one({"method_id": method_id})
        if rule_using:
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete method - it is used in calculation rules"
            )
        
        result = await db.calc_methods.delete_one({"id": method_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Method not found")
        return {"message": "Method deleted successfully"}
    
    # ============================================
    # CALCULATION RULES (SuperAdmin)
    # ============================================
    
    @router.get("/super-admin/rules", response_model=List[CalculationRuleResponse])
    async def get_all_rules(current_user: dict = Depends(get_super_admin_user)):
        """Get all calculation rules"""
        rules = await db.calc_rules.find({}, {"_id": 0}).sort("priority", 1).to_list(1000)
        
        # Populate method names
        result = []
        for rule in rules:
            method = await db.calc_methods.find_one({"id": rule.get("method_id")}, {"_id": 0})
            rule["method_name"] = method.get("method_name") if method else "Unknown"
            result.append(CalculationRuleResponse(**rule))
        
        return result
    
    @router.post("/super-admin/rules", response_model=CalculationRuleResponse)
    async def create_rule(
        rule_data: CalculationRuleCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Create a new calculation rule"""
        existing = await db.calc_rules.find_one({"rule_key": rule_data.rule_key})
        if existing:
            raise HTTPException(status_code=400, detail=f"Rule key '{rule_data.rule_key}' already exists")
        
        # Verify method exists
        method = await db.calc_methods.find_one({"id": rule_data.method_id})
        if not method:
            raise HTTPException(status_code=400, detail="Referenced method not found")
        
        rule_dict = rule_data.model_dump()
        rule_dict["id"] = str(uuid.uuid4())
        rule_dict["created_by"] = current_user["id"]
        rule_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_rules.insert_one(rule_dict)
        rule_dict["method_name"] = method.get("method_name")
        return CalculationRuleResponse(**rule_dict)
    
    @router.put("/super-admin/rules/{rule_id}", response_model=CalculationRuleResponse)
    async def update_rule(
        rule_id: str,
        rule_data: CalculationRuleCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Update a calculation rule"""
        existing = await db.calc_rules.find_one({"id": rule_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Rule not found")
        
        # Verify method exists
        method = await db.calc_methods.find_one({"id": rule_data.method_id})
        if not method:
            raise HTTPException(status_code=400, detail="Referenced method not found")
        
        update_dict = rule_data.model_dump()
        update_dict["updated_by"] = current_user["id"]
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_rules.update_one({"id": rule_id}, {"$set": update_dict})
        updated = await db.calc_rules.find_one({"id": rule_id}, {"_id": 0})
        updated["method_name"] = method.get("method_name")
        return CalculationRuleResponse(**updated)
    
    @router.delete("/super-admin/rules/{rule_id}")
    async def delete_rule(rule_id: str, current_user: dict = Depends(get_super_admin_user)):
        """Delete a calculation rule"""
        result = await db.calc_rules.delete_one({"id": rule_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Rule not found")
        return {"message": "Rule deleted successfully"}
    
    # ============================================
    # PARAMETER OVERRIDES (Admin/SuperAdmin)
    # ============================================
    
    @router.get("/parameter-overrides", response_model=List[ParameterOverrideResponse])
    async def get_parameter_overrides(
        organization_id: Optional[str] = None,
        facility_id: Optional[str] = None,
        current_user: dict = Depends(get_admin_user)
    ):
        """Get parameter overrides for organization/facility"""
        query = {"is_active": True}
        
        # Access control
        if current_user["role"] != "super_admin":
            org_id = current_user.get("organization_id")
            if org_id:
                query["organization_id"] = org_id
        elif organization_id:
            query["organization_id"] = organization_id
        
        if facility_id:
            query["facility_id"] = facility_id
        
        overrides = await db.calc_parameter_overrides.find(query, {"_id": 0}).to_list(1000)
        return [ParameterOverrideResponse(**o) for o in overrides]
    
    @router.post("/parameter-overrides", response_model=ParameterOverrideResponse)
    async def create_parameter_override(
        override_data: ParameterOverrideCreate,
        current_user: dict = Depends(get_admin_user)
    ):
        """Create a parameter override (org/facility level)"""
        # Access control
        if current_user["role"] != "super_admin":
            if override_data.organization_id != current_user.get("organization_id"):
                raise HTTPException(status_code=403, detail="Cannot create override for another organization")
        
        override_dict = override_data.model_dump()
        override_dict["id"] = str(uuid.uuid4())
        override_dict["created_by"] = current_user["id"]
        override_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_parameter_overrides.insert_one(override_dict)
        return ParameterOverrideResponse(**override_dict)
    
    @router.put("/parameter-overrides/{override_id}", response_model=ParameterOverrideResponse)
    async def update_parameter_override(
        override_id: str,
        override_data: ParameterOverrideCreate,
        current_user: dict = Depends(get_admin_user)
    ):
        """Update a parameter override"""
        existing = await db.calc_parameter_overrides.find_one({"id": override_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Override not found")
        
        # Access control
        if current_user["role"] != "super_admin":
            if existing.get("organization_id") != current_user.get("organization_id"):
                raise HTTPException(status_code=403, detail="Not authorized")
        
        update_dict = override_data.model_dump()
        update_dict["updated_by"] = current_user["id"]
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_parameter_overrides.update_one({"id": override_id}, {"$set": update_dict})
        updated = await db.calc_parameter_overrides.find_one({"id": override_id}, {"_id": 0})
        return ParameterOverrideResponse(**updated)
    
    @router.delete("/parameter-overrides/{override_id}")
    async def delete_parameter_override(override_id: str, current_user: dict = Depends(get_admin_user)):
        """Delete a parameter override"""
        existing = await db.calc_parameter_overrides.find_one({"id": override_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Override not found")
        
        # Access control
        if current_user["role"] != "super_admin":
            if existing.get("organization_id") != current_user.get("organization_id"):
                raise HTTPException(status_code=403, detail="Not authorized")
        
        await db.calc_parameter_overrides.delete_one({"id": override_id})
        return {"message": "Override deleted successfully"}
    
    # ============================================
    # UNIT CONVERSIONS (SuperAdmin)
    # ============================================
    
    @router.get("/super-admin/unit-conversions", response_model=List[UnitConversionResponse])
    async def get_all_unit_conversions(current_user: dict = Depends(get_super_admin_user)):
        """Get all unit conversion definitions"""
        conversions = await db.calc_unit_conversions.find({}, {"_id": 0}).to_list(1000)
        return [UnitConversionResponse(**c) for c in conversions]
    
    @router.post("/super-admin/unit-conversions", response_model=UnitConversionResponse)
    async def create_unit_conversion(
        conversion_data: UnitConversionCreate,
        current_user: dict = Depends(get_super_admin_user)
    ):
        """Create a unit conversion definition"""
        # Check for duplicate
        existing = await db.calc_unit_conversions.find_one({
            "from_unit": conversion_data.from_unit,
            "to_unit": conversion_data.to_unit
        })
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"Conversion from '{conversion_data.from_unit}' to '{conversion_data.to_unit}' already exists"
            )
        
        conversion_dict = conversion_data.model_dump()
        conversion_dict["id"] = str(uuid.uuid4())
        conversion_dict["created_by"] = current_user["id"]
        conversion_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.calc_unit_conversions.insert_one(conversion_dict)
        return UnitConversionResponse(**conversion_dict)
    
    @router.delete("/super-admin/unit-conversions/{conversion_id}")
    async def delete_unit_conversion(conversion_id: str, current_user: dict = Depends(get_super_admin_user)):
        """Delete a unit conversion"""
        result = await db.calc_unit_conversions.delete_one({"id": conversion_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Conversion not found")
        return {"message": "Conversion deleted successfully"}
    
    @router.get("/units")
    async def get_available_units(current_user: dict = Depends(get_current_user)):
        """Get all units from the units collection for dropdowns"""
        units = await db.units.find({"is_active": True}, {"_id": 0}).sort("unit_type", 1).to_list(1000)
        return units
    
    # ============================================
    # CALCULATION ENDPOINTS (All Users)
    # ============================================
    
    @router.post("/calculate", response_model=CalculationResult)
    async def execute_calculation(
        request: CalculationRequest,
        current_user: dict = Depends(get_current_user)
    ):
        """Execute an emission calculation"""
        # Add user context
        if not request.context.organization_id and current_user.get("organization_id"):
            request.context.organization_id = current_user["organization_id"]
        
        result = await engine.calculate(request)
        return result
    
    @router.post("/preview")
    async def preview_calculation(
        request: CalculationRequest,
        current_user: dict = Depends(get_current_user)
    ):
        """Preview calculation without executing - shows method and parameter resolution"""
        if not request.context.organization_id and current_user.get("organization_id"):
            request.context.organization_id = current_user["organization_id"]
        
        preview = await engine.preview_calculation(request)
        return preview
    
    @router.get("/methods")
    async def get_available_methods(
        scope: str,
        category: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        """Get available calculation methods for given context"""
        context = CalculationContext(
            scope=scope,
            category=category or "",
            organization_id=current_user.get("organization_id")
        )
        
        methods = await engine.get_available_methods(context)
        return {"methods": methods}
    
    @router.get("/input-template")
    async def get_input_template_for_context(
        scope: str,
        category: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        """Get input template (fields) for given context"""
        query = {"is_active": True}
        
        if scope:
            query["$or"] = [
                {"applicable_scopes": scope},
                {"applicable_scopes": {"$size": 0}},
                {"applicable_scopes": {"$exists": False}}
            ]
        
        if category:
            query["applicable_categories"] = category
        
        templates = await db.calc_input_templates.find(query, {"_id": 0}).to_list(10)
        
        if not templates:
            # Return default template
            return {"template": None, "fields": []}
        
        template = templates[0]
        
        # Populate fields
        field_keys = template.get("field_keys", [])
        fields = await db.calc_input_fields.find(
            {"field_key": {"$in": field_keys}},
            {"_id": 0}
        ).sort("display_order", 1).to_list(100)
        
        return {
            "template": template,
            "fields": fields
        }
    
    # ============================================
    # SEEDING ENDPOINT (SuperAdmin)
    # ============================================
    
    @router.post("/super-admin/seed-default-methods")
    async def seed_default_methods(current_user: dict = Depends(get_super_admin_user)):
        """
        Seed default calculation methods and rules.
        Creates basic methods for Scope 1 and Scope 2 calculations.
        """
        created_methods = 0
        created_rules = 0
        
        # Default methods
        default_methods = [
            {
                "method_key": "factor_based_combustion",
                "method_name": "Stationary/Mobile Combustion (Gas Split)",
                "description": "Standard combustion calculation: qty × NCV × EF for each gas",
                "required_parameters": ["quantity", "ncv", "ef_co2"],
                "optional_parameters": ["density", "ef_ch4", "ef_n2o"],
                "parameter_sources": [
                    {"parameter_key": "quantity", "source_type": "user_input"},
                    {"parameter_key": "ncv", "source_type": "fuel_database", "fuel_db_field": "calorific_value", "allow_override": True},
                    {"parameter_key": "density", "source_type": "fuel_database", "fuel_db_field": "density", "allow_override": True},
                    {"parameter_key": "ef_co2", "source_type": "fuel_database", "fuel_db_field": "emission_factor_co2", "allow_override": True},
                    {"parameter_key": "ef_ch4", "source_type": "fuel_database", "fuel_db_field": "emission_factor_ch4", "allow_override": True},
                    {"parameter_key": "ef_n2o", "source_type": "fuel_database", "fuel_db_field": "emission_factor_n2o", "allow_override": True}
                ],
                "formula": "{co2: quantity * ncv * ef_co2, ch4: quantity * ncv * ef_ch4, n2o: quantity * ncv * ef_n2o}",
                "outputs": ["co2", "ch4", "n2o", "co2e"],
                "output_unit": "kg",
                "supports_gas_split": True,
                "applicable_scopes": ["scope1", "biogenic"],
                "applicable_categories": ["Stationary Combustion", "Mobile Combustion"],
                "rank": 10,
                "is_active": True
            },
            {
                "method_key": "fugitive_gwp",
                "method_name": "Fugitive Emissions (GWP-based)",
                "description": "Fugitive emissions: quantity × GWP",
                "required_parameters": ["quantity", "gwp"],
                "optional_parameters": [],
                "parameter_sources": [
                    {"parameter_key": "quantity", "source_type": "user_input"},
                    {"parameter_key": "gwp", "source_type": "fuel_database", "fuel_db_field": "gwp_fugitives", "allow_override": True}
                ],
                "formula": "quantity * gwp",
                "outputs": ["co2e"],
                "output_unit": "kg",
                "supports_gas_split": False,
                "applicable_scopes": ["scope1"],
                "applicable_categories": ["Fugitive Emissions"],
                "rank": 10,
                "is_active": True
            },
            {
                "method_key": "electricity_location",
                "method_name": "Electricity (Location-Based)",
                "description": "Scope 2 electricity: consumption × grid emission factor",
                "required_parameters": ["consumption", "grid_ef"],
                "optional_parameters": [],
                "parameter_sources": [
                    {"parameter_key": "consumption", "source_type": "user_input"},
                    {"parameter_key": "grid_ef", "source_type": "fuel_database", "fuel_db_field": "emission_factor_co2", "allow_override": True}
                ],
                "formula": "consumption * grid_ef",
                "outputs": ["co2e"],
                "output_unit": "kg",
                "supports_gas_split": False,
                "applicable_scopes": ["scope2"],
                "applicable_categories": ["Purchased Electricity"],
                "rank": 10,
                "is_active": True
            },
            {
                "method_key": "electricity_market",
                "method_name": "Electricity (Market-Based)",
                "description": "Scope 2 electricity with supplier-specific factor",
                "required_parameters": ["consumption", "supplier_ef"],
                "optional_parameters": [],
                "parameter_sources": [
                    {"parameter_key": "consumption", "source_type": "user_input"},
                    {"parameter_key": "supplier_ef", "source_type": "user_input", "allow_override": False}
                ],
                "formula": "consumption * supplier_ef",
                "outputs": ["co2e"],
                "output_unit": "kg",
                "supports_gas_split": False,
                "applicable_scopes": ["scope2"],
                "applicable_categories": ["Purchased Electricity"],
                "rank": 20,
                "is_active": True
            }
        ]
        
        for method in default_methods:
            existing = await db.calc_methods.find_one({"method_key": method["method_key"]})
            if not existing:
                method["id"] = str(uuid.uuid4())
                method["created_by"] = current_user["id"]
                method["created_at"] = datetime.now(timezone.utc).isoformat()
                await db.calc_methods.insert_one(method)
                created_methods += 1
        
        # Default rules
        default_rules = [
            {
                "rule_key": "scope1_combustion_default",
                "rule_name": "Scope 1 Combustion Default",
                "description": "Default rule for Scope 1 combustion emissions",
                "scope": "scope1",
                "category": "Stationary Combustion",
                "method_key": "factor_based_combustion",
                "priority": 100,
                "is_active": True
            },
            {
                "rule_key": "scope1_mobile_default",
                "rule_name": "Scope 1 Mobile Default",
                "description": "Default rule for Scope 1 mobile combustion",
                "scope": "scope1",
                "category": "Mobile Combustion",
                "method_key": "factor_based_combustion",
                "priority": 100,
                "is_active": True
            },
            {
                "rule_key": "scope1_fugitive_default",
                "rule_name": "Scope 1 Fugitive Default",
                "description": "Default rule for fugitive emissions",
                "scope": "scope1",
                "category": "Fugitive Emissions",
                "method_key": "fugitive_gwp",
                "priority": 100,
                "is_active": True
            },
            {
                "rule_key": "scope2_electricity_location",
                "rule_name": "Scope 2 Electricity (Location)",
                "description": "Default location-based electricity calculation",
                "scope": "scope2",
                "category": "Purchased Electricity",
                "method_key": "electricity_location",
                "priority": 100,
                "is_active": True
            }
        ]
        
        for rule in default_rules:
            existing = await db.calc_rules.find_one({"rule_key": rule["rule_key"]})
            if not existing:
                # Get method ID
                method = await db.calc_methods.find_one({"method_key": rule.pop("method_key")})
                if method:
                    rule["method_id"] = method["id"]
                    rule["id"] = str(uuid.uuid4())
                    rule["created_by"] = current_user["id"]
                    rule["created_at"] = datetime.now(timezone.utc).isoformat()
                    await db.calc_rules.insert_one(rule)
                    created_rules += 1
        
        # Default input fields (without unit configuration - units come from fuel database)
        default_fields = [
            {"field_key": "quantity", "field_name": "Quantity", "data_type": "number", "is_required": True, "display_order": 1, "description": "Amount of fuel consumed"},
            {"field_key": "consumption", "field_name": "Consumption", "data_type": "number", "is_required": True, "display_order": 1, "description": "Energy consumption"},
        ]
        
        created_fields = 0
        for field in default_fields:
            existing = await db.calc_input_fields.find_one({"field_key": field["field_key"]})
            if not existing:
                field["id"] = str(uuid.uuid4())
                field["created_by"] = current_user["id"]
                field["created_at"] = datetime.now(timezone.utc).isoformat()
                await db.calc_input_fields.insert_one(field)
                created_fields += 1
        
        return {
            "message": "Default methods, rules, and fields seeded successfully",
            "created_methods": created_methods,
            "created_rules": created_rules,
            "created_fields": created_fields
        }
    
    return router
