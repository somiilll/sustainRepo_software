"""
Audit helpers — pure functions used by emission CRUD routes.

`compute_field_changes` is the canonical "deep diff" used to populate
the `emission_history` collection. It compares old vs new dicts and
returns a structured change list with human-readable labels.

The function is intentionally large because it knows about every
emission field's display label, formatting rules, and aggregate
field-grouping. Phase B5 lifts it from server.py into this shared
helper so:
  - the new modular emissions router can import it without circular deps
  - future tests can exercise it without spinning up the full FastAPI app
"""
import json
def compute_field_changes(old_values: dict, new_values: dict, fields_to_track: list = None) -> list:
    """
    Compute field-level changes between old and new values.
    Returns a list of change objects with field, old_value, new_value.
    
    Args:
        old_values: Dictionary of old field values
        new_values: Dictionary of new field values
        fields_to_track: Optional list of field names to track. If None, tracks all fields.
    
    Returns:
        List of dicts: [{"field": "field_name", "old_value": x, "new_value": y}, ...]
    """
    changes = []
    
    # Default fields to track for emissions - all important fields
    if fields_to_track is None:
        fields_to_track = [
            # Core identifiers
            "facility_id", "scope", "category", "subcategory",
            # Activity & Method
            "activity", "activity_name", "scope3_activity", "scope3_activity_type", "calculation_method_scope3",
            "scope3_ef_id", "fuel_type", "fuel_name", "fuel_id",
            # Quantities & Units
            "quantity", "unit", "reporting_period",
            # Emission factors
            "emission_factor", "emission_factor_co2", "emission_factor_ch4", "emission_factor_n2o",
            "ef_unit", "ef_source",
            # Outputs
            "co2_emissions", "ch4_emissions", "n2o_emissions", "co2e_emissions", "total_emissions",
            # Supplier data (C1, C2, C4, C9)
            "supplier_name", "supplier_code", "supplier_emission_factor", "supplier_ef_unit",
            # Customer data (C9)
            "customer_name", "customer_code",
            # Asset name (for C8/C13/C14/C15)
            "asset_name",
            # Location fields (C4, C6, C7, C9)
            "from_location", "to_location",
            # Optional inputs
            "spend_amount", "distance_travelled", "passengers_travelled", "working_days",
            "working_hours", "inflation_rate", "purchase_power_value",
            # C6/C7 specific - employee info & travel details
            "employee_name", "employee_id", "nights_stayed", "rooms_taken",
            # Person responsible
            "responsible_person", "responsible_person_designation", "responsible_person_contact",
            # Process info
            "process_names", "process_descriptions",
            # Notes
            "notes", "justification",
            # Override justification (#17)
            "override_justification",
            "override_calorific_value", "override_density", "override_emission_factor_heat",
            # Evidence
            "evidence_url", "evidence_file_name",
            # C7 specific
            "employees", "monthly_totals", "yearly_total",
        ]
    
    # Track evidence separately - normalize empty string and None to avoid false changes
    old_evidence = old_values.get("evidence_url") or None
    new_evidence = new_values.get("evidence_url") or None
    if old_evidence != new_evidence:
        changes.append({
            "field": "evidence",
            "old_value": "Evidence attached" if old_evidence else "No evidence",
            "new_value": "Evidence updated" if new_evidence else "Evidence removed",
            "field_type": "evidence"
        })
    
    # Track calculation method changes with readable names (only *_basis, no *_based fallbacks)
    method_names = {
        'spend_basis': 'Spend Based',
        'average_data': 'Average Data',
        'activity_basis': 'Activity Based',
        'supplier_basis': 'Supplier Based',
        'distance_basis': 'Distance Based',
        'fuel_basis': 'Fuel Based',
        'asset_basis': 'Asset Based',
        'lessor_basis': 'Lessor Based',
        'lessee_basis': 'Lessee Based',
        'investment_basis': 'Investment Based',
        'equity_basis': 'Equity Based'
    }
    
    old_method = old_values.get("calculation_method_scope3")
    new_method = new_values.get("calculation_method_scope3")
    # Also check in dynamic_field_values
    if not old_method:
        old_dfv = old_values.get("dynamic_field_values", {}) or {}
        old_method_field = old_dfv.get("calculation_method_scope3", {})
        old_method = old_method_field.get("value") if isinstance(old_method_field, dict) else old_method_field
    if not new_method:
        new_dfv = new_values.get("dynamic_field_values", {}) or {}
        new_method_field = new_dfv.get("calculation_method_scope3", {})
        new_method = new_method_field.get("value") if isinstance(new_method_field, dict) else new_method_field
    
    if old_method != new_method and (old_method or new_method):
        changes.append({
            "field": "calculation_method_scope3",
            "old_value": method_names.get(old_method, old_method) if old_method else "(not set)",
            "new_value": method_names.get(new_method, new_method) if new_method else "(not set)",
            "field_type": "simple"
        })
    
    # Track activity changes - prioritize scope3_activity over sub_category to avoid showing category name
    # The sub_category often contains "Employee Commuting" (category) instead of actual activity like "Local bus"
    old_dfv = old_values.get("dynamic_field_values", {}) or {}
    new_dfv = new_values.get("dynamic_field_values", {}) or {}
    
    # First check scope3_activity directly, then in dynamic_field_values, then fallback to sub_category
    old_activity = old_values.get("scope3_activity")
    if not old_activity:
        old_act_field = old_dfv.get("scope3_activity", {})
        old_activity = old_act_field.get("value") if isinstance(old_act_field, dict) else old_act_field
    if not old_activity:
        # Only use sub_category if it's different from the category (C7 - Employee Commuting)
        old_sub = old_values.get("sub_category")
        if old_sub and "Employee Commuting" not in str(old_sub) and "C7" not in str(old_sub):
            old_activity = old_sub
    
    new_activity = new_values.get("scope3_activity")
    if not new_activity:
        new_act_field = new_dfv.get("scope3_activity", {})
        new_activity = new_act_field.get("value") if isinstance(new_act_field, dict) else new_act_field
    if not new_activity:
        # Only use sub_category if it's different from the category
        new_sub = new_values.get("sub_category")
        if new_sub and "Employee Commuting" not in str(new_sub) and "C7" not in str(new_sub):
            new_activity = new_sub
    
    # Check if custom activity was used (for display purposes)
    old_use_custom = old_dfv.get("use_custom_activity", {})
    old_is_custom = old_use_custom.get("value") if isinstance(old_use_custom, dict) else old_use_custom
    new_use_custom = new_dfv.get("use_custom_activity", {})
    new_is_custom = new_use_custom.get("value") if isinstance(new_use_custom, dict) else new_use_custom
    
    # Format activity display with custom indicator
    def format_activity_display(activity_name, is_custom):
        if not activity_name:
            return "(not set)"
        if is_custom:
            return f"{activity_name} (custom)"
        return activity_name
    
    if old_activity != new_activity and (old_activity or new_activity):
        changes.append({
            "field": "activity",
            "old_value": format_activity_display(old_activity, old_is_custom),
            "new_value": format_activity_display(new_activity, new_is_custom),
            "field_type": "simple"
        })
    
    # Track process_names changes with friendly message
    old_process_names = old_values.get("process_names") or []
    new_process_names = new_values.get("process_names") or []
    if old_process_names != new_process_names:
        old_display = ", ".join(old_process_names) if old_process_names else "(none)"
        new_display = ", ".join(new_process_names) if new_process_names else "(none)"
        changes.append({
            "field": "process_names",
            "old_value": old_display,
            "new_value": new_display,
            "field_type": "simple"
        })
    
    # Track process_descriptions changes with friendly message
    old_process_descs = old_values.get("process_descriptions") or []
    new_process_descs = new_values.get("process_descriptions") or []
    if old_process_descs != new_process_descs:
        def format_process_desc(descs):
            if not descs:
                return "(none)"
            return "; ".join([f"{d.get('name', '')}: {d.get('description', '')}" for d in descs if d.get('name')])
        changes.append({
            "field": "process_descriptions",
            "old_value": format_process_desc(old_process_descs),
            "new_value": format_process_desc(new_process_descs),
            "field_type": "simple"
        })
    
    # Track employees array changes with detailed breakdown (C6/C7)
    old_employees = old_values.get("employees") or []
    new_employees = new_values.get("employees") or []
    
    if old_employees != new_employees:
        # Build maps by employee id for comparison
        old_emp_map = {emp.get("id") or emp.get("employee_id") or emp.get("name", f"emp_{i}"): emp 
                       for i, emp in enumerate(old_employees)}
        new_emp_map = {emp.get("id") or emp.get("employee_id") or emp.get("name", f"emp_{i}"): emp 
                       for i, emp in enumerate(new_employees)}
        
        all_emp_ids = set(old_emp_map.keys()) | set(new_emp_map.keys())
        
        for emp_id in all_emp_ids:
            old_emp = old_emp_map.get(emp_id, {})
            new_emp = new_emp_map.get(emp_id, {})
            
            if not old_emp and new_emp:
                # Employee added
                emp_name = new_emp.get("name", emp_id)
                changes.append({
                    "field": "employee_added",
                    "old_value": "(none)",
                    "new_value": f"{emp_name}",
                    "field_type": "employee"
                })
            elif old_emp and not new_emp:
                # Employee removed
                emp_name = old_emp.get("name", emp_id)
                changes.append({
                    "field": "employee_removed",
                    "old_value": f"{emp_name}",
                    "new_value": "(removed)",
                    "field_type": "employee"
                })
            else:
                # Employee modified - check specific fields
                emp_name = new_emp.get("name") or old_emp.get("name") or emp_id
                
                # Track employee name change
                old_name = old_emp.get("name")
                new_name = new_emp.get("name")
                if old_name != new_name and (old_name or new_name):
                    changes.append({
                        "field": "employee_name",
                        "old_value": old_name or "(not set)",
                        "new_value": new_name or "(not set)",
                        "field_type": "employee",
                        "employee_id": emp_id
                    })
                
                # Track employee_id change
                old_emp_id = old_emp.get("employee_id")
                new_emp_id = new_emp.get("employee_id")
                if old_emp_id != new_emp_id and (old_emp_id or new_emp_id):
                    changes.append({
                        "field": "employee_code",
                        "old_value": old_emp_id or "(not set)",
                        "new_value": new_emp_id or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track department change
                old_dept = old_emp.get("department")
                new_dept = new_emp.get("department")
                if old_dept != new_dept and (old_dept or new_dept):
                    changes.append({
                        "field": "employee_department",
                        "old_value": old_dept or "(not set)",
                        "new_value": new_dept or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track activity_type change
                old_activity = old_emp.get("activity_type")
                new_activity = new_emp.get("activity_type")
                if old_activity != new_activity and (old_activity or new_activity):
                    changes.append({
                        "field": "employee_activity_type",
                        "old_value": old_activity or "(not set)",
                        "new_value": new_activity or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track from_location change
                old_from = old_emp.get("from_location")
                new_from = new_emp.get("from_location")
                if old_from != new_from and (old_from or new_from):
                    changes.append({
                        "field": "employee_from_location",
                        "old_value": old_from or "(not set)",
                        "new_value": new_from or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track to_location change
                old_to = old_emp.get("to_location")
                new_to = new_emp.get("to_location")
                if old_to != new_to and (old_to or new_to):
                    changes.append({
                        "field": "employee_to_location",
                        "old_value": old_to or "(not set)",
                        "new_value": new_to or "(not set)",
                        "field_type": "employee",
                        "employee_name": emp_name
                    })
                
                # Track input changes - check yearly_data.inputs, monthly_data.*.inputs, and flat inputs
                old_yearly = old_emp.get("yearly_data", {}) or {}
                new_yearly = new_emp.get("yearly_data", {}) or {}
                
                # For yearly mode: check yearly_data.inputs or flat inputs
                old_inputs = old_yearly.get("inputs", {}) or old_emp.get("inputs", {}) or {}
                new_inputs = new_yearly.get("inputs", {}) or new_emp.get("inputs", {}) or {}
                
                # Label mapping for common input fields
                input_label_map = {
                    "distance": "Distance Travelled",
                    "km_travelled": "Distance Travelled (km)",
                    "working_days": "Working Days",
                    "working_hours": "Working Hours",
                    "days_travelled": "Days Travelled",
                    "qty_days_travelled": "No. of Days Travelled",
                    "nights_stayed": "Nights Stayed",
                    "rooms_taken": "Rooms Taken",
                    "no_of_employees": "No. of Employees",
                    "fuel_consumed": "Fuel Consumed",
                    "electricity_consumed": "Electricity Consumed",
                    "qty": "Quantity",
                    "activity_value": "Activity Value",
                    "spent_value": "Spent Value",
                }
                
                # For monthly mode: also check monthly_data
                old_monthly = old_emp.get("monthly_data", {}) or {}
                new_monthly = new_emp.get("monthly_data", {}) or {}
                
                # Detect structure migration: flat/yearly → monthly or monthly → flat/yearly
                old_has_monthly = bool(old_monthly)
                new_has_monthly = bool(new_monthly)
                is_migrating_to_monthly = not old_has_monthly and new_has_monthly
                is_migrating_from_monthly = old_has_monthly and not new_has_monthly
                
                # Track monthly inputs and emissions if present
                for month_key in set(old_monthly.keys()) | set(new_monthly.keys()):
                    old_month_data = old_monthly.get(month_key, {}) or {}
                    new_month_data = new_monthly.get(month_key, {}) or {}
                    old_month_inputs = old_month_data.get("inputs", {}) or {}
                    new_month_inputs = new_month_data.get("inputs", {}) or {}
                    
                    # Track monthly input changes
                    for input_key in set(old_month_inputs.keys()) | set(new_month_inputs.keys()):
                        if input_key.endswith('_unit'):
                            continue
                        old_input_val = old_month_inputs.get(input_key)
                        new_input_val = new_month_inputs.get(input_key)
                        
                        # STRUCTURAL MIGRATION FIX: When migrating TO monthly, check if old value exists in flat structure
                        effective_old_val = old_input_val
                        if is_migrating_to_monthly and old_input_val is None:
                            # Check flat structure for old value
                            effective_old_val = old_inputs.get(input_key)
                        
                        # STRUCTURAL MIGRATION FIX: When migrating FROM monthly, check if new value exists in flat structure
                        effective_new_val = new_input_val
                        if is_migrating_from_monthly and new_input_val is None:
                            effective_new_val = new_inputs.get(input_key)
                        
                        if effective_old_val != effective_new_val and (effective_old_val is not None or effective_new_val is not None):
                            input_label = input_label_map.get(input_key, input_key.replace('_', ' ').title())
                            changes.append({
                                "field": f"employee_input_{input_key}",
                                "old_value": effective_old_val if effective_old_val is not None else "(not set)",
                                "new_value": effective_new_val if effective_new_val is not None else "(not set)",
                                "field_type": "employee_input",
                                "employee_name": emp_name,
                                "display_name": f"{input_label} ({month_key.title()})"
                            })
                    
                    # Track monthly emissions changes per employee
                    old_month_emissions = old_month_data.get("emissions", {}) or {}
                    new_month_emissions = new_month_data.get("emissions", {}) or {}
                    old_month_co2e = old_month_emissions.get("co2e")
                    new_month_co2e = new_month_emissions.get("co2e")
                    
                    # STRUCTURAL MIGRATION FIX: When migrating TO monthly, use flat emissions as old value
                    effective_old_co2e = old_month_co2e
                    if is_migrating_to_monthly and old_month_co2e is None:
                        flat_old_emissions = old_yearly.get("emissions", {}) or old_emp.get("emissions", {}) or {}
                        effective_old_co2e = flat_old_emissions.get("co2e")
                    
                    # STRUCTURAL MIGRATION FIX: When migrating FROM monthly, use flat emissions as new value
                    effective_new_co2e = new_month_co2e
                    if is_migrating_from_monthly and new_month_co2e is None:
                        flat_new_emissions = new_yearly.get("emissions", {}) or new_emp.get("emissions", {}) or {}
                        effective_new_co2e = flat_new_emissions.get("co2e")
                    
                    if effective_old_co2e is not None or effective_new_co2e is not None:
                        old_val = float(effective_old_co2e) if effective_old_co2e is not None else 0
                        new_val = float(effective_new_co2e) if effective_new_co2e is not None else 0
                        if abs(old_val - new_val) > 0.0001:
                            changes.append({
                                "field": "employee_emissions_monthly",
                                "old_value": f"{old_val:.4f} tCO2e" if effective_old_co2e is not None else "(not calculated)",
                                "new_value": f"{new_val:.4f} tCO2e" if effective_new_co2e is not None else "(not calculated)",
                                "field_type": "employee_emission",
                                "employee_name": emp_name,
                                "display_name": f"Emissions ({month_key.title()})"
                            })
                
                # Track ALL yearly/flat input fields dynamically
                all_input_keys = set(old_inputs.keys()) | set(new_inputs.keys())
                for input_key in all_input_keys:
                    old_input_val = old_inputs.get(input_key)
                    new_input_val = new_inputs.get(input_key)
                    
                    # Skip unit fields
                    if input_key.endswith('_unit'):
                        continue
                    
                    # FIX: Skip tracking "removal" of flat structure fields when they now exist in monthly structure
                    # This prevents duplicate tracking when migrating from flat to monthly structure
                    if old_input_val is not None and new_input_val is None:
                        # Check if this field exists in any month of new_monthly
                        field_exists_in_monthly = False
                        for month_data in new_monthly.values():
                            if isinstance(month_data, dict):
                                month_inputs = month_data.get("inputs", {}) or {}
                                if input_key in month_inputs and month_inputs.get(input_key) is not None:
                                    field_exists_in_monthly = True
                                    break
                        if field_exists_in_monthly:
                            continue  # Skip this "removal" as field now exists in monthly structure
                    
                    if old_input_val != new_input_val and (old_input_val is not None or new_input_val is not None):
                        # Get human-readable label
                        input_label = input_label_map.get(input_key, input_key.replace('_', ' ').title())
                        changes.append({
                            "field": f"employee_input_{input_key}",
                            "old_value": old_input_val if old_input_val is not None else "(not set)",
                            "new_value": new_input_val if new_input_val is not None else "(not set)",
                            "field_type": "employee_input",
                            "employee_name": emp_name,
                            "display_name": input_label
                        })
                
                # Track employee emissions (co2e) changes - yearly/flat structure
                old_emissions = old_yearly.get("emissions", {}) or old_emp.get("emissions", {}) or {}
                new_emissions = new_yearly.get("emissions", {}) or new_emp.get("emissions", {}) or {}
                
                old_co2e = old_emissions.get("co2e")
                new_co2e = new_emissions.get("co2e")
                
                # STRUCTURAL MIGRATION FIX: Skip tracking yearly/flat emissions separately when migrating to/from monthly
                # The monthly emissions tracking above already handles the migration with proper old/new values
                if is_migrating_to_monthly or is_migrating_from_monthly:
                    # Skip - already tracked in monthly emissions with proper values from flat structure
                    pass
                elif old_co2e is not None or new_co2e is not None:
                    # Compare with tolerance for floating point
                    old_val = float(old_co2e) if old_co2e is not None else 0
                    new_val = float(new_co2e) if new_co2e is not None else 0
                    if abs(old_val - new_val) > 0.0001:  # Tolerance for floating point comparison
                        changes.append({
                            "field": "employee_emissions",
                            "old_value": f"{old_val:.4f} tCO2e" if old_co2e is not None else "(not calculated)",
                            "new_value": f"{new_val:.4f} tCO2e" if new_co2e is not None else "(not calculated)",
                            "field_type": "employee_emission",
                            "employee_name": emp_name,
                            "display_name": "Emissions (tCO2e)"
                        })
    
    for field in fields_to_track:
        # Skip fields that are handled specially above
        if field in ["evidence_url", "evidence_file_name", "calculation_method_scope3", "sub_category", "scope3_activity", "activity", "activity_name", "process_names", "process_descriptions", "employees", "monthly_totals", "yearly_total"]:
            continue
            
        old_val = old_values.get(field)
        new_val = new_values.get(field)
        
        # Handle nested dicts/lists comparison
        if isinstance(old_val, (dict, list)) or isinstance(new_val, (dict, list)):
            # Convert to JSON string for comparison
            import json
            old_str = json.dumps(old_val, sort_keys=True, default=str) if old_val else None
            new_str = json.dumps(new_val, sort_keys=True, default=str) if new_val else None
            if old_str != new_str:
                changes.append({
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                    "field_type": "complex"
                })
        elif old_val != new_val:
            # Only record if there's an actual change
            # Handle None vs empty string equivalence
            if not (old_val in (None, '', 0) and new_val in (None, '', 0)):
                changes.append({
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                    "field_type": "simple"
                })
    
    # Handle dynamic_field_values specially - only show meaningful changes
    old_dfv = old_values.get("dynamic_field_values", {}) or {}
    new_dfv = new_values.get("dynamic_field_values", {}) or {}
    
    # Fields to skip in dynamic field values tracking
    dfv_skip_fields = ['scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                       'scope3_subcategory', 'scope3_activity_type', 'ppp', 'scope3_activity', 
                       'biogenic_scope_selection']
    
    # Required input fields - always show if value changed
    required_input_fields = ['qty', 'activity_value', 'spent_value', 'activity_value_supplier_based', 
                             'emission_factor_supplier_based', 'distance', 'weight']
    
    all_dfv_keys = set(old_dfv.keys()) | set(new_dfv.keys())
    dfv_changes = {}
    
    for key in all_dfv_keys:
        if key in dfv_skip_fields or key.startswith('override_'):
            continue
            
        old_field = old_dfv.get(key, {})
        new_field = new_dfv.get(key, {})
        
        # Get values - handle both dict format and direct values
        old_value = old_field.get('value') if isinstance(old_field, dict) else old_field
        new_value = new_field.get('value') if isinstance(new_field, dict) else new_field
        old_unit = old_field.get('unit', '') if isinstance(old_field, dict) else ''
        new_unit = new_field.get('unit', '') if isinstance(new_field, dict) else ''
        
        # Check if user actually overrode these fields
        old_is_override = old_field.get('is_override', False) if isinstance(old_field, dict) else False
        new_is_override = new_field.get('is_override', False) if isinstance(new_field, dict) else False
        
        # Determine if this is a required input field
        is_required_field = key in required_input_fields
        
        # For REQUIRED fields (qty, activity_value, etc.): show if value actually changed
        if is_required_field:
            # Skip if value didn't change
            if old_value == new_value and old_unit == new_unit:
                continue
        else:
            # For OPTIONAL/OVERRIDE fields (cv, density, ef, etc.):
            # ONLY show if is_override is True in either old or new
            # DO NOT show if both old and new have is_override=False (user never touched it)
            if not old_is_override and not new_is_override:
                continue
            
            # Skip if nothing actually changed
            if old_value == new_value and old_unit == new_unit and old_is_override == new_is_override:
                continue
        
        # Record the change with full precision
        dfv_changes[key] = {
            "old_value": old_value,
            "old_unit": old_unit,
            "new_value": new_value,
            "new_unit": new_unit,
            "old_is_override": old_is_override,
            "new_is_override": new_is_override,
            "is_required": is_required_field
        }
    
    # Add dfv changes as a structured field if there are any meaningful changes
    if dfv_changes:
        # Build old and new value dicts, only including fields with actual values
        old_vals = {}
        new_vals = {}
        for k, v in dfv_changes.items():
            # For required fields, always include if there's a value
            if v.get("is_required"):
                if v["old_value"] not in (None, ''):
                    old_vals[k] = {"value": v["old_value"], "unit": v["old_unit"]}
                if v["new_value"] not in (None, ''):
                    new_vals[k] = {"value": v["new_value"], "unit": v["new_unit"]}
            else:
                # For optional/override fields, include if is_override was/is True
                # Handle transitions between database default and custom override
                if v["old_is_override"] and v["old_value"] not in (None, '', 0, 0.0):
                    old_vals[k] = {"value": v["old_value"], "unit": v["old_unit"]}
                elif not v["old_is_override"] and v["new_is_override"]:
                    # User is switching from database default to custom override
                    old_vals[k] = {"value": "Default Value Used", "unit": ""}
                
                if v["new_is_override"] and v["new_value"] not in (None, '', 0, 0.0):
                    new_vals[k] = {"value": v["new_value"], "unit": v["new_unit"]}
                elif v["old_is_override"] and not v["new_is_override"]:
                    # User is switching from custom override back to database default
                    new_vals[k] = {"value": "Default Value Used", "unit": ""}
        
        # Only add to changes if there's something to show
        if old_vals or new_vals:
            changes.append({
                "field": "input_values",
                "old_value": old_vals,
                "new_value": new_vals,
                "field_type": "input_values"
            })
    
    # Remove the raw dynamic_field_values from changes as we handle it specially above
    changes = [c for c in changes if c["field"] != "dynamic_field_values"]
    
    return changes


