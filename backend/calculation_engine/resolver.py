"""
Parameter Resolver

Resolves parameter values based on context with override hierarchy:
1. User input (highest priority)
2. Organization override
3. Facility override  
4. Regional database
5. Fuel database
6. Global default (lowest priority)
"""

from typing import Dict, Any, Optional, List
from .models import ParameterResolution, CalculationContext


class ParameterResolver:
    """
    Context-aware parameter resolution engine.
    Fetches parameter values from appropriate sources based on context and priority.
    """
    
    def __init__(self, db):
        """
        Initialize resolver with database connection.
        
        Args:
            db: Motor AsyncIOMotorDatabase instance
        """
        self.db = db
    
    async def resolve_parameter(
        self,
        parameter_key: str,
        context: CalculationContext,
        user_input: Optional[float] = None,
        user_input_unit: Optional[str] = None,
        override_value: Optional[float] = None,
        override_justification: Optional[str] = None
    ) -> ParameterResolution:
        """
        Resolve a single parameter value based on context and override hierarchy.
        
        Resolution order (first match wins):
        1. User explicit override (with justification)
        2. User input (direct value)
        3. Organization-level override
        4. Facility-level override
        5. Fuel database (context-matched)
        6. Regional parameter values
        7. Global default parameter values
        
        Args:
            parameter_key: The parameter to resolve (e.g., "density", "ef_co2")
            context: Calculation context with scope, category, org, facility, fuel info
            user_input: Direct user input value (if provided)
            user_input_unit: Unit of user input
            override_value: Override value (requires justification)
            override_justification: Justification for override
            
        Returns:
            ParameterResolution with value, source, and audit info
        """
        
        # Priority 1: User explicit override
        if override_value is not None:
            return ParameterResolution(
                parameter_key=parameter_key,
                value=override_value,
                unit=user_input_unit,
                source="user_override",
                source_reference=None,
                priority=1,
                conditions_matched={},
                is_override=True
            )
        
        # Priority 2: User direct input
        if user_input is not None:
            return ParameterResolution(
                parameter_key=parameter_key,
                value=user_input,
                unit=user_input_unit,
                source="user_input",
                source_reference=None,
                priority=2,
                conditions_matched={},
                is_override=False
            )
        
        # Priority 3: Organization-level override
        if context.organization_id:
            org_override = await self._get_org_override(parameter_key, context)
            if org_override:
                return org_override
        
        # Priority 4: Facility-level override
        if context.facility_id:
            facility_override = await self._get_facility_override(parameter_key, context)
            if facility_override:
                return facility_override
        
        # Priority 5: Fuel database (with context matching)
        if context.fuel_database_id or context.fuel_type:
            fuel_value = await self._get_from_fuel_database(parameter_key, context)
            if fuel_value:
                return fuel_value
        
        # Priority 6: Regional parameter values
        regional_value = await self._get_regional_value(parameter_key, context)
        if regional_value:
            return regional_value
        
        # Priority 7: Global default from calc_parameter_values
        global_value = await self._get_global_default(parameter_key, context)
        if global_value:
            return global_value
        
        # No value found
        return ParameterResolution(
            parameter_key=parameter_key,
            value=0.0,
            unit=None,
            source="not_found",
            source_reference=None,
            priority=999,
            conditions_matched={},
            is_override=False
        )
    
    async def resolve_all_parameters(
        self,
        parameter_keys: List[str],
        context: CalculationContext,
        user_inputs: Dict[str, Any] = {},
        overrides: Dict[str, Any] = {},
        override_justifications: Dict[str, str] = {}
    ) -> Dict[str, ParameterResolution]:
        """
        Resolve multiple parameters at once.
        
        Args:
            parameter_keys: List of parameter keys to resolve
            context: Calculation context
            user_inputs: Dict of user input values {param_key: value}
            overrides: Dict of override values {param_key: value}
            override_justifications: Dict of override justifications
            
        Returns:
            Dict of resolved parameters {param_key: ParameterResolution}
        """
        resolved = {}
        
        for param_key in parameter_keys:
            # Extract user input for this parameter
            user_value = user_inputs.get(param_key)
            user_unit = user_inputs.get(f"{param_key}_unit")
            
            # Extract override
            override_value = overrides.get(param_key)
            override_just = override_justifications.get(param_key)
            
            resolution = await self.resolve_parameter(
                parameter_key=param_key,
                context=context,
                user_input=user_value,
                user_input_unit=user_unit,
                override_value=override_value,
                override_justification=override_just
            )
            
            resolved[param_key] = resolution
        
        return resolved
    
    async def _get_org_override(
        self,
        parameter_key: str,
        context: CalculationContext
    ) -> Optional[ParameterResolution]:
        """Get organization-level parameter override"""
        
        query = {
            "parameter_key": parameter_key,
            "organization_id": context.organization_id,
            "facility_id": None,  # Org-level, not facility-level
            "is_active": True
        }
        
        # Add fuel condition if applicable
        if context.fuel_type:
            query["$or"] = [
                {"conditions.fuel_type": context.fuel_type},
                {"conditions.fuel_type": {"$exists": False}},
                {"conditions": {}}
            ]
        
        override = await self.db.calc_parameter_overrides.find_one(query, {"_id": 0})
        
        if override:
            return ParameterResolution(
                parameter_key=parameter_key,
                value=override["value"],
                unit=override.get("unit"),
                source="organization_override",
                source_reference=override.get("id"),
                priority=10,
                conditions_matched=override.get("conditions", {}),
                is_override=True
            )
        
        return None
    
    async def _get_facility_override(
        self,
        parameter_key: str,
        context: CalculationContext
    ) -> Optional[ParameterResolution]:
        """Get facility-level parameter override"""
        
        query = {
            "parameter_key": parameter_key,
            "facility_id": context.facility_id,
            "is_active": True
        }
        
        if context.fuel_type:
            query["$or"] = [
                {"conditions.fuel_type": context.fuel_type},
                {"conditions.fuel_type": {"$exists": False}},
                {"conditions": {}}
            ]
        
        override = await self.db.calc_parameter_overrides.find_one(query, {"_id": 0})
        
        if override:
            return ParameterResolution(
                parameter_key=parameter_key,
                value=override["value"],
                unit=override.get("unit"),
                source="facility_override",
                source_reference=override.get("id"),
                priority=15,
                conditions_matched=override.get("conditions", {}),
                is_override=True
            )
        
        return None
    
    async def _get_from_fuel_database(
        self,
        parameter_key: str,
        context: CalculationContext
    ) -> Optional[ParameterResolution]:
        """Get parameter value from fuel database"""
        
        # Map parameter keys to fuel database fields
        FUEL_DB_MAPPING = {
            "cv": "calorific_value",
            "calorific_value": "calorific_value",
            "ncv": "calorific_value",
            "density": "density",
            "ef_co2": "emission_factor_co2",
            "emission_factor_co2": "emission_factor_co2",
            "ef_ch4": "emission_factor_ch4",
            "emission_factor_ch4": "emission_factor_ch4",
            "ef_n2o": "emission_factor_n2o",
            "emission_factor_n2o": "emission_factor_n2o",
            "gwp_fugitives": "gwp_fugitives"
        }
        
        fuel_field = FUEL_DB_MAPPING.get(parameter_key)
        if not fuel_field:
            return None
        
        # Find fuel by ID or name
        fuel_query = {}
        if context.fuel_database_id:
            fuel_query["id"] = context.fuel_database_id
        elif context.fuel_type:
            fuel_query["fuel_name"] = context.fuel_type
            
            # Add context-based filtering for best match
            if context.region and context.region != "Global":
                # Try region-specific first
                fuel_query["region"] = context.region
                fuel = await self.db.fuel_database.find_one(fuel_query, {"_id": 0})
                if not fuel:
                    # Fallback to Global
                    fuel_query["region"] = "Global"
        
        if not fuel_query:
            return None
        
        fuel = await self.db.fuel_database.find_one(fuel_query, {"_id": 0})
        
        if fuel and fuel.get(fuel_field) is not None:
            # Get unit based on field type
            unit = None
            if fuel_field == "calorific_value":
                unit = fuel.get("calorific_value_unit")
            elif fuel_field == "density":
                unit = fuel.get("density_unit")
            elif fuel_field.startswith("emission_factor"):
                unit = "kg/TJ"  # Standard unit for EFs in fuel database
            
            return ParameterResolution(
                parameter_key=parameter_key,
                value=fuel[fuel_field],
                unit=unit,
                source="fuel_database",
                source_reference=fuel.get("id"),
                priority=50,
                conditions_matched={
                    "fuel_type": fuel.get("fuel_name"),
                    "region": fuel.get("region", "Global")
                },
                is_override=False
            )
        
        return None
    
    async def _get_regional_value(
        self,
        parameter_key: str,
        context: CalculationContext
    ) -> Optional[ParameterResolution]:
        """Get regional parameter value"""
        
        if not context.region and not context.country:
            return None
        
        query = {
            "parameter_key": parameter_key,
            "is_active": True,
            "$or": [
                {"conditions.region": context.region or context.country},
                {"conditions.country": context.country}
            ]
        }
        
        # Add scope/category conditions
        if context.scope:
            query["$or"].append({"conditions.scope": context.scope})
        
        value = await self.db.calc_parameter_values.find_one(
            query,
            {"_id": 0},
            sort=[("priority", 1)]  # Lower priority = higher preference
        )
        
        if value:
            return ParameterResolution(
                parameter_key=parameter_key,
                value=value["value"],
                unit=value.get("unit"),
                source="regional",
                source_reference=value.get("id"),
                priority=value.get("priority", 70),
                conditions_matched=value.get("conditions", {}),
                is_override=False
            )
        
        return None
    
    async def _get_global_default(
        self,
        parameter_key: str,
        context: CalculationContext
    ) -> Optional[ParameterResolution]:
        """Get global default parameter value"""
        
        query = {
            "parameter_key": parameter_key,
            "is_active": True,
            "source": "global_default"
        }
        
        # Try to find with scope/category match first
        if context.scope:
            scoped_query = {**query, "conditions.scope": context.scope}
            value = await self.db.calc_parameter_values.find_one(scoped_query, {"_id": 0})
            if value:
                return ParameterResolution(
                    parameter_key=parameter_key,
                    value=value["value"],
                    unit=value.get("unit"),
                    source="global_default",
                    source_reference=value.get("id"),
                    priority=100,
                    conditions_matched=value.get("conditions", {}),
                    is_override=False
                )
        
        # Fallback to any global default
        value = await self.db.calc_parameter_values.find_one(query, {"_id": 0})
        
        if value:
            return ParameterResolution(
                parameter_key=parameter_key,
                value=value["value"],
                unit=value.get("unit"),
                source="global_default",
                source_reference=value.get("id"),
                priority=100,
                conditions_matched=value.get("conditions", {}),
                is_override=False
            )
        
        return None
    
    async def get_gwp_values(self, context: CalculationContext) -> Dict[str, float]:
        """
        Get GWP values from active gwp_config.
        
        Returns:
            Dict with co2, ch4_fossil, ch4_non_fossil, n2o GWP values
        """
        # Get active GWP config
        gwp_config = await self.db.gwp_config.find_one({"is_active": True}, {"_id": 0})
        
        if gwp_config:
            return {
                "co2": gwp_config.get("co2_gwp", 1),
                "ch4_fossil": gwp_config.get("ch4_fossil_gwp", 29.8),
                "ch4_non_fossil": gwp_config.get("ch4_non_fossil_gwp", 27.0),
                "n2o": gwp_config.get("n2o_gwp", 273),
                "source": gwp_config.get("source_name", "Unknown"),
                "config_id": gwp_config.get("id")
            }
        
        # Default AR6 values
        return {
            "co2": 1,
            "ch4_fossil": 29.8,
            "ch4_non_fossil": 27.0,
            "n2o": 273,
            "source": "IPCC AR6 (Default)",
            "config_id": None
        }
