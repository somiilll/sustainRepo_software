"""
Emission Calculator for Scope 3 Bulk Upload
Handles emission calculations using the calc-engine
"""
from typing import Dict, List, Optional, Any
import uuid
from datetime import datetime, timezone

from ..models import CalculationMethod


class EmissionCalculator:
    """Calculates emissions for bulk upload rows"""
    
    def __init__(self, db):
        self.db = db
    
    def _extract_co2e(self, emissions: Dict) -> float:
        """Extract co2e value from emissions dict that may have nested structure"""
        co2e = emissions.get("co2e", 0)
        if isinstance(co2e, dict):
            return float(co2e.get("value", 0))
        return float(co2e) if co2e else 0.0
    
    async def calculate_emissions(self, row_data: Dict, category_code: str,
                                   method: CalculationMethod,
                                   activity_id: Optional[str] = None,
                                   formula_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculate emissions for a row
        
        Args:
            row_data: Row data from upload
            category_code: Category code (C1-C15)
            method: Calculation method
            activity_id: Matched activity ID (optional)
            formula_id: Matched formula ID (optional)
            
        Returns:
            Dict with calculated emissions
        """
        # For supplier_basis, calculate directly
        if method == CalculationMethod.SUPPLIER_BASIS:
            return self._calculate_supplier_basis(row_data)
        
        # For activity_basis and spend_basis, use emission factors from database
        if activity_id:
            return await self._calculate_with_ef(row_data, activity_id, method)
        
        # Fallback - return zeros (will need manual calculation)
        return {
            "co2": 0.0,
            "ch4": 0.0,
            "n2o": 0.0,
            "co2e": 0.0,
            "calculation_method": "manual_required",
            "notes": "Activity not matched - manual calculation required"
        }
    
    def _calculate_supplier_basis(self, row_data: Dict) -> Dict[str, Any]:
        """Calculate emissions using supplier-provided emission factor"""
        quantity = float(row_data.get("supplier_quantity") or 0)
        ef = float(row_data.get("supplier_ef") or 0)
        
        # Simple calculation: Emissions = Quantity × Emission Factor
        co2e = quantity * ef
        
        return {
            "co2": 0.0,
            "ch4": 0.0,
            "n2o": 0.0,
            "co2e": co2e,
            "calculation_method": "supplier_basis",
            "inputs": {
                "supplier_quantity": quantity,
                "supplier_ef": ef,
                "supplier_unit": row_data.get("supplier_unit"),
                "supplier_ef_unit": row_data.get("supplier_ef_unit")
            }
        }
    
    async def _calculate_with_ef(self, row_data: Dict, activity_id: str,
                                  method: CalculationMethod) -> Dict[str, Any]:
        """Calculate emissions using database emission factor"""
        # Fetch emission factor
        ef_data = await self.db.scope3_ef.find_one(
            {"id": activity_id},
            {"_id": 0}
        )
        
        if not ef_data:
            return {
                "co2": 0.0,
                "ch4": 0.0,
                "n2o": 0.0,
                "co2e": 0.0,
                "calculation_method": "ef_not_found",
                "notes": f"Emission factor not found for activity_id: {activity_id}"
            }
        
        # Get emission factor value
        ef_value = float(ef_data.get("emission_factor") or ef_data.get("ef") or 0)
        
        # Get quantity based on method
        if method == CalculationMethod.ACTIVITY_BASIS:
            quantity = float(row_data.get("quantity_used") or 0)
            
            # For transportation, might need distance × quantity
            if row_data.get("distance_travelled") and row_data.get("quantity_goods"):
                distance = float(row_data.get("distance_travelled") or 0)
                goods_qty = float(row_data.get("quantity_goods") or 0)
                quantity = distance * goods_qty  # tonne.km
        
        elif method == CalculationMethod.SPEND_BASIS:
            quantity = float(row_data.get("spent_amount") or 0)
        
        else:
            quantity = 0
        
        # Calculate CO2e
        co2e = quantity * ef_value
        
        # Try to get individual gas emissions if available
        co2 = quantity * float(ef_data.get("co2_factor", ef_value))
        ch4 = quantity * float(ef_data.get("ch4_factor", 0))
        n2o = quantity * float(ef_data.get("n2o_factor", 0))
        
        return {
            "co2": co2,
            "ch4": ch4,
            "n2o": n2o,
            "co2e": co2e,
            "calculation_method": method.value,
            "emission_factor_id": activity_id,
            "emission_factor_value": ef_value,
            "emission_factor_unit": ef_data.get("unit", "kgCO2e"),
            "inputs": {
                "quantity": quantity,
                "unit": row_data.get("unit_quantity") or row_data.get("unit_goods")
            }
        }
    
    def build_emission_record(self, row_data: Dict, category_code: str,
                               category_name: str, facility: Dict,
                               organization_id: str, user_id: str,
                               method: CalculationMethod,
                               activity_match: Dict,
                               calculated_emissions: Dict,
                               formula_id: Optional[str] = None,
                               bulk_job_id: Optional[str] = None) -> Dict:
        """
        Build emission record in the format expected by the database
        
        This matches the format used by UI-created emissions
        """
        now = datetime.now(timezone.utc)
        
        # Get reporting period and frequency from row_data (already parsed)
        reporting_period = row_data.get("reporting_period", "")
        frequency_type = row_data.get("frequency_type", "monthly")
        reporting_year_type = row_data.get("reporting_year_type")  # financial_year or calendar_year
        
        # If reporting_period not set, try to parse from reporting_month (legacy)
        if not reporting_period and row_data.get("reporting_month"):
            reporting_month = row_data.get("reporting_month", "")
            # Convert "Jan-2025" to "2025-01" format
            month_map = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
                'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
                'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
            }
            try:
                parts = reporting_month.split("-")
                if len(parts) == 2:
                    month_abbr = parts[0].lower()[:3]
                    year = parts[1]
                    month_num = month_map.get(month_abbr, "01")
                    reporting_period = f"{year}-{month_num}"
                else:
                    reporting_period = reporting_month
            except (ValueError, AttributeError, IndexError):
                reporting_period = reporting_month
        
        # Build dynamic field values
        dynamic_field_values = {}
        
        if method == CalculationMethod.ACTIVITY_BASIS:
            if row_data.get("quantity_used"):
                dynamic_field_values["activity_value"] = {
                    "value": float(row_data.get("quantity_used")),
                    "unit": row_data.get("unit_quantity", "")
                }
            if row_data.get("distance_travelled"):
                dynamic_field_values["distance_travelled"] = {
                    "value": float(row_data.get("distance_travelled")),
                    "unit": "km"
                }
            if row_data.get("quantity_goods"):
                dynamic_field_values["quantity_of_goods"] = {
                    "value": float(row_data.get("quantity_goods")),
                    "unit": row_data.get("unit_goods", "t")
                }
            if row_data.get("passengers"):
                dynamic_field_values["passengers"] = {
                    "value": float(row_data.get("passengers")),
                    "unit": ""
                }
        
        elif method == CalculationMethod.SPEND_BASIS:
            if row_data.get("spent_amount"):
                dynamic_field_values["spend_amount"] = {
                    "value": float(row_data.get("spent_amount")),
                    "unit": "INR"
                }
        
        elif method == CalculationMethod.SUPPLIER_BASIS:
            dynamic_field_values["activity_value_supplier_based"] = {
                "value": float(row_data.get("supplier_quantity", 0)),
                "unit": row_data.get("supplier_unit", "")
            }
            dynamic_field_values["emission_factor_supplier_based"] = {
                "value": float(row_data.get("supplier_ef", 0)),
                "unit": row_data.get("supplier_ef_unit", "kgCO2e")
            }
        
        # Build outputs
        outputs = {
            "co2": {
                "value": calculated_emissions.get("co2", 0),
                "unit": "tCO2"
            },
            "ch4": {
                "value": calculated_emissions.get("ch4", 0),
                "unit": "tCH4"
            },
            "n2o": {
                "value": calculated_emissions.get("n2o", 0),
                "unit": "tN2O"
            },
            "co2e": {
                "value": calculated_emissions.get("co2e", 0),
                "unit": "tCO2e"
            }
        }
        
        # Sync sub_category with scope3_activity for consistency (as done in manual entry)
        sub_category = row_data.get("sub_category") or activity_match.get("activity_name") or row_data.get("activity")
        
        record = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "facility_id": facility.get("id"),
            "facility_name": facility.get("name"),
            "scope": "scope3",
            "sub_scope": None,
            "category": category_name,
            "sub_category": sub_category,
            "calculation_method_scope3": method.value,
            "scope3_ef_id": activity_match.get("activity_id"),
            "scope3_activity": activity_match.get("activity_name") or row_data.get("activity"),
            "scope3_activity_type": row_data.get("activity_type"),
            "scope3_subcategory": row_data.get("sub_category"),
            "scope3_custom_activity": row_data.get("activity") if method == CalculationMethod.SUPPLIER_BASIS and not activity_match.get("activity_id") else None,
            "use_custom_activity": method == CalculationMethod.SUPPLIER_BASIS and not activity_match.get("activity_id"),
            "reporting_period": reporting_period,
            "frequency_type": frequency_type,
            "reporting_year_type": reporting_year_type,
            "dynamic_field_values": dynamic_field_values,
            "outputs": outputs,
            "co2_emissions": calculated_emissions.get("co2", 0),
            "ch4_emissions": calculated_emissions.get("ch4", 0),
            "n2o_emissions": calculated_emissions.get("n2o", 0),
            "co2e_emissions": calculated_emissions.get("co2e", 0),
            "formula_id": formula_id,
            "supplier_name": row_data.get("supplier_name"),
            "supplier_code": row_data.get("supplier_code"),
            "source_of_information": "Bulk Upload",
            "responsible_person": row_data.get("responsible_person"),
            "responsible_person_designation": row_data.get("responsible_designation"),
            "responsible_person_contact": row_data.get("responsible_contact"),
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
            "upload_source": "bulk_upload",
            "bulk_upload_job_id": bulk_job_id
        }
        
        return record
    
    def build_c7_aggregated_record(self, employee_rows: List[Dict], 
                                    category_name: str, facility: Dict,
                                    organization_id: str, user_id: str,
                                    bulk_job_id: Optional[str] = None) -> Dict:
        """
        Build aggregated C7 emission record with multiple employees
        
        Args:
            employee_rows: List of processed employee row data with calculations
            category_name: Full category name
            facility: Facility dict
            organization_id: Organization ID
            user_id: User ID
            bulk_job_id: Bulk upload job ID
            
        Returns:
            Aggregated emission record
        """
        if not employee_rows:
            return None
        
        now = datetime.now(timezone.utc)
        
        # Use first row for common fields
        first_row = employee_rows[0]
        method = first_row.get("method", CalculationMethod.ACTIVITY_BASIS)
        if isinstance(method, str):
            method = CalculationMethod(method)
        
        # Build employees array
        employees = []
        monthly_totals = {}
        total_co2e = 0.0
        
        for emp_data in employee_rows:
            row_data = emp_data.get("row_data", {})
            emissions = emp_data.get("emissions", {})
            reporting_month = row_data.get("reporting_month", "")
            
            # Convert month format
            month_key = self._month_to_key(reporting_month)
            
            employee = {
                "id": str(uuid.uuid4()),
                "name": row_data.get("employee_name"),
                "employee_id": row_data.get("employee_id"),
                "department": row_data.get("department"),
                "monthly_data": {
                    month_key: {
                        "inputs": {
                            "distance_travelled": row_data.get("distance_travelled"),
                            "passengers": row_data.get("passengers"),
                            "working_days": row_data.get("working_days"),
                            "working_hours": row_data.get("working_hours")
                        },
                        "emissions": {
                            "co2e": self._extract_co2e(emissions)
                        }
                    }
                }
            }
            employees.append(employee)
            
            # Aggregate monthly totals
            co2e = self._extract_co2e(emissions)
            if month_key not in monthly_totals:
                monthly_totals[month_key] = {"co2e": 0}
            monthly_totals[month_key]["co2e"] += co2e
            total_co2e += co2e
        
        # Parse reporting period from first row
        reporting_month = first_row.get("row_data", {}).get("reporting_month", "")
        month_map = {
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
            'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
            'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        }
        try:
            parts = reporting_month.split("-")
            if len(parts) == 2:
                month_abbr = parts[0].lower()[:3]
                year = parts[1]
                month_num = month_map.get(month_abbr, "01")
                reporting_period = f"{year}-{month_num}"
            else:
                reporting_period = reporting_month
        except (ValueError, AttributeError, IndexError):
            reporting_period = reporting_month
        
        record = {
            "id": str(uuid.uuid4()),
            "organization_id": organization_id,
            "facility_id": facility.get("id"),
            "facility_name": facility.get("name"),
            "scope": "scope3",
            "sub_scope": None,
            "category": category_name,
            "calculation_method_scope3": method.value if isinstance(method, CalculationMethod) else method,
            "scope3_ef_id": first_row.get("activity_match", {}).get("activity_id"),
            "scope3_activity": first_row.get("activity_match", {}).get("activity_name"),
            "scope3_activity_type": first_row.get("row_data", {}).get("activity_type"),
            "reporting_period": reporting_period,
            "employees": employees,
            "monthly_totals": monthly_totals,
            "yearly_total": {"co2e": total_co2e},
            "co2e_emissions": total_co2e,
            "co2_emissions": 0,
            "ch4_emissions": 0,
            "n2o_emissions": 0,
            "outputs": {
                "co2e": {"value": total_co2e, "unit": "tCO2e"}
            },
            "source_of_information": "Bulk Upload",
            "responsible_person": first_row.get("row_data", {}).get("responsible_person"),
            "responsible_person_designation": first_row.get("row_data", {}).get("responsible_designation"),
            "responsible_person_contact": first_row.get("row_data", {}).get("responsible_contact"),
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
            "upload_source": "bulk_upload",
            "bulk_upload_job_id": bulk_job_id
        }
        
        return record
    
    def _month_to_key(self, reporting_month: str) -> str:
        """Convert 'Jan-2025' to 'jan' key"""
        try:
            return reporting_month.split("-")[0].lower()[:3]
        except (ValueError, AttributeError, IndexError):
            return "jan"
