/**
 * editEmissionDispatch — E4 modularization phase.
 *
 * The full hydration logic for the Edit Emission dialog. Lifted byte-identically
 * from the legacy `handleEdit(emission)` closure in src/pages/Emissions.js.
 *
 * Takes the page's state setters + reads (`scope3EFData`, `fugitiveEmissionsData`)
 * + helpers (`getAuthHeader`) as a `ctx` object. Behaviour preserved exactly.
 */
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export async function editEmissionDispatch(emission, ctx) {
  const {
    // State reads
    scope3EFData, fugitiveEmissionsData, fuelDatabase,
    // Setters
    setEditEmployees, setEditEmployeeMonthlyTotals, setEditEmployeeYearlyTotal,
    setDynamicFieldValues, setExistingEvidences, setEditingEmissionId,
    setEmissionAuditLog, setIsEditLoading, setDialogOpen,
    setScope3Method, setScope3ActivityId, setScope3ActivityType,
    setScope3Subcategory, setScope3CustomActivity, setUseCustomActivity,
    setBiogenicScopeSelection, setEditFrequencyType, setEditingEmission,
    setOverrideCalorificValue, setOverrideDensity, setOverrideEmissionFactorHeat,
    setOverrideJustification, setSelectedCategory, setFormData, setEditC7Month,
    // Helpers
    getAuthHeader,
  } = ctx;

    // CRITICAL: Clear stale employee state IMMEDIATELY before any hydration
    // This prevents previous edit session data from bleeding through
    setEditEmployees([]);
    setEditEmployeeMonthlyTotals({});
    setEditEmployeeYearlyTotal({});
    
    // Parse reporting_period - could be "February 2025" or "2025-02" or "February 2025 to March 2025"
    const parseReportingPeriod = (periodStr) => {
      if (!periodStr) return '';
      
      // If already in YYYY-MM format
      if (/^\d{4}-\d{2}$/.test(periodStr)) {
        return periodStr;
      }
      
      // Try to parse "Month Year" format (e.g., "February 2025")
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const match = periodStr.match(/^(\w+)\s+(\d{4})$/);
      if (match) {
        const monthIndex = monthNames.indexOf(match[1]);
        if (monthIndex >= 0) {
          return `${match[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
        }
      }
      
      return periodStr; // Return as-is if can't parse
    };
    
    const [startPeriodRaw, endPeriodRaw] = emission.reporting_period?.includes(' to ')
      ? emission.reporting_period.split(' to ')
      : [emission.reporting_period, emission.reporting_period];
    
    const startPeriod = parseReportingPeriod(startPeriodRaw);
    const endPeriod = parseReportingPeriod(endPeriodRaw);

    setEditingEmission(emission);
    
    // Set frequency type from the emission (locked once saved, defaults to 'monthly' for legacy records)
    const freqType = emission.frequency_type || 'monthly';
    setEditFrequencyType(freqType);
    
    // Check if this emission was created with a fuel from database
    // First try by ID, then by fuel_type name (for yearly records that may not have fuel_database_id)
    let fuelFromDb = emission.fuel_database_id 
      ? fuelDatabase.find(f => f.id === emission.fuel_database_id)
      : null;
    
    // If no fuel found by ID but we have fuel_type, try to find by name
    if (!fuelFromDb && emission.fuel_type) {
      fuelFromDb = fuelDatabase.find(f => f.fuel_name === emission.fuel_type);
    }
    
    // Set the category state for UI display
    setSelectedCategory(emission.category || '');
    
    // Handle biogenic emissions - restore biogenicScopeSelection
    if (emission.scope === 'biogenic') {
      const dynamicValues = emission.dynamic_field_values || {};
      const biogenicSelection = emission.biogenic_scope_selection || 
        (typeof dynamicValues.biogenic_scope_selection === 'object' 
          ? dynamicValues.biogenic_scope_selection.value 
          : dynamicValues.biogenic_scope_selection) || '';
      setBiogenicScopeSelection(biogenicSelection);
      
      // If biogenic scope3, also load scope3 fields
      if (biogenicSelection === 'scope3') {
        const method = emission.calculation_method_scope3 || dynamicValues.calculation_method_scope3 || '';
        
        let activityId = emission.scope3_ef_id || dynamicValues.scope3_ef_id || '';
        if (typeof activityId === 'object' && activityId.value) {
          activityId = activityId.value;
        }
        
        let activityType = emission.scope3_activity_type || '';
        if (!activityType && dynamicValues.scope3_activity_type) {
          activityType = typeof dynamicValues.scope3_activity_type === 'object' 
            ? dynamicValues.scope3_activity_type.value 
            : dynamicValues.scope3_activity_type;
        }
        
        let customActivity = '';
        let isCustomActivity = false;
        if (method === 'supplier_basis') {
          const scope3Activity = dynamicValues.scope3_activity;
          customActivity = typeof scope3Activity === 'object'
            ? scope3Activity.value
            : (emission.scope3_activity || scope3Activity || '');
          
          const topLevelEfId = emission.scope3_ef_id;
          const dynamicEfId = dynamicValues.scope3_ef_id;
          const dynamicEfIdValue = typeof dynamicEfId === 'object' ? dynamicEfId.value : dynamicEfId;
          
          if (dynamicEfIdValue && dynamicEfIdValue !== '') {
            activityId = dynamicEfIdValue;
            isCustomActivity = false;
          } else if (topLevelEfId && topLevelEfId !== '') {
            activityId = topLevelEfId;
            isCustomActivity = false;
          } else if (customActivity && customActivity.trim() !== '') {
            isCustomActivity = true;
            activityId = '';
          }
        }
        
        setScope3Method(method);
        setScope3ActivityType(activityType);
        setScope3Subcategory(''); // Biogenic doesn't use subcategory
        setScope3ActivityId(activityId);
        setScope3CustomActivity(customActivity);
        setUseCustomActivity(isCustomActivity);
      }
    }
    // Set Scope 3 specific fields if applicable
    else if (emission.scope === 'scope3') {
      // Extract method and activity from top-level fields or dynamic_field_values
      const dynamicValues = emission.dynamic_field_values || {};
      const method = emission.calculation_method_scope3 || dynamicValues.calculation_method_scope3 || '';
      
      // Handle activityId which may be stored as string or object {value, unit}
      let activityId = emission.scope3_ef_id || dynamicValues.scope3_ef_id || '';
      if (typeof activityId === 'object' && activityId.value) {
        activityId = activityId.value;
      }
      
      // Get activity type from stored field first, then fall back to lookup
      let activityType = emission.scope3_activity_type || emission.activity_type || '';
      if (!activityType && dynamicValues.scope3_activity_type) {
        activityType = typeof dynamicValues.scope3_activity_type === 'object' 
          ? dynamicValues.scope3_activity_type.value 
          : dynamicValues.scope3_activity_type;
      }
      
      // For C7 records, check employees array for activity_type if not found at top level
      const isC7 = emission.category?.toLowerCase().includes('c7') || emission.category?.toLowerCase().includes('employee commuting');
      if (!activityType && isC7 && emission.employees?.length > 0) {
        activityType = emission.employees[0].activity_type || '';
      }
      
      // If still no activity type, try to look it up from scope3EFData (for legacy records)
      if (!activityType && activityId && scope3EFData.length > 0) {
        const matchedEF = scope3EFData.find(ef => ef.id === activityId);
        activityType = matchedEF?.activity_type || '';
      }
      
      // Normalize activity type to match dropdown values (e.g., 'Work From Home' -> 'wfh', 'Water Travel' -> 'water_travel')
      // The dropdown uses lowercase underscore format from scope3_ef.activity_type
      if (activityType && isC7) {
        // Check if it's already in the correct format (lowercase with underscores)
        const normalizedType = activityType.toLowerCase().replace(/\s+/g, '_');
        // Map display names back to internal values
        const displayToInternalMap = {
          'work_from_home': 'wfh',
          'car_travel': 'car_travel',
          'bus_travel': 'bus_travel', 
          'rail_travel': 'rail_travel',
          'air_travel': 'air_travel',
          'taxi_travel': 'taxi_travel',
          'bike_travel': 'bike_travel',
          'water_travel': 'water_travel',
          'hotel_stay': 'hotel_stay',
        };
        activityType = displayToInternalMap[normalizedType] || normalizedType;
      }
      
      // Get subcategory from stored field (for C8/C10/C11/C13/C14)
      let subcategory = '';
      if (dynamicValues.scope3_subcategory) {
        subcategory = typeof dynamicValues.scope3_subcategory === 'object'
          ? dynamicValues.scope3_subcategory.value
          : dynamicValues.scope3_subcategory;
      }
      
      // DEBUG: Log extracted scope3 values from emission record
      console.log('[FUGITIVE DEBUG - handleEdit] Extracted Scope3 values:', {
        emission_id: emission.id,
        emission_category: emission.category,
        method,
        activityId,
        activityType,
        subcategory,
        dynamicValues_scope3_subcategory: dynamicValues.scope3_subcategory,
        dynamicValues_scope3_ef_id: dynamicValues.scope3_ef_id,
        emission_scope3_ef_id: emission.scope3_ef_id,
        fugitiveEmissionsDataCount: fugitiveEmissionsData.length,
      });
      
      // Get custom activity for supplier_basis
      let customActivity = '';
      let isCustomActivity = false;
      if (method === 'supplier_basis') {
        // For supplier_basis, the activity name is stored in scope3_activity
        const scope3Activity = dynamicValues.scope3_activity;
        customActivity = typeof scope3Activity === 'object'
          ? scope3Activity.value
          : (emission.scope3_activity || scope3Activity || '');
        
        // Determine if this is a custom activity entry
        // Check BOTH top-level scope3_ef_id AND dynamic_field_values.scope3_ef_id
        // It's a custom activity ONLY if BOTH are null/empty
        const topLevelEfId = emission.scope3_ef_id;
        const dynamicEfId = dynamicValues.scope3_ef_id;
        const dynamicEfIdValue = typeof dynamicEfId === 'object' ? dynamicEfId.value : dynamicEfId;
        
        // Use dynamic value as source of truth for activityId (it's more reliably stored)
        if (dynamicEfIdValue && dynamicEfIdValue !== '') {
          activityId = dynamicEfIdValue;
          isCustomActivity = false;
        } else if (topLevelEfId && topLevelEfId !== '') {
          activityId = topLevelEfId;
          isCustomActivity = false;
        } else if (customActivity && customActivity.trim() !== '') {
          // No activity ID anywhere but has a custom activity name
          isCustomActivity = true;
          activityId = '';
        }
      }
      
      // If subcategory is fugitive_emissions and activityId exists, check if it's from fugitiveEmissionsData
      // This handles the case where the activity came from fuel_database
      if (subcategory === 'fugitive_emissions' && activityId && fugitiveEmissionsData.length > 0) {
        const matchedFugitive = fugitiveEmissionsData.find(f => f.id === activityId);
        // Fugitive emission validation happens silently
      }
      
      setScope3Method(method);
      setScope3ActivityType(activityType);
      setScope3Subcategory(subcategory);
      setScope3ActivityId(activityId);
      setScope3CustomActivity(customActivity);
      setUseCustomActivity(isCustomActivity);
      
      // Check if this is a C7 record - always load employee data (reuse isC7 from above)
      if (isC7) {
        // Check if this is a new monthly model record (has reporting_period like "2026-01")
        const isMonthlyModel = emission.reporting_period && /^\d{4}-\d{2}$/.test(emission.reporting_period);
        
        if (isMonthlyModel) {
          // Extract month from reporting_period (e.g., "2026-01" -> "jan")
          const monthNum = parseInt(emission.reporting_period.split('-')[1], 10);
          const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          const monthKey = monthKeys[monthNum - 1];
          
          // Transform employees to have monthly_data structure for MultiEmployeeInput compatibility
          // Check if employee already has monthly_data (new save format) vs flat structure (old format)
          const transformedEmployees = (emission.employees || []).map(emp => {
            // ALWAYS ensure monthly_data[monthKey].emissions is populated
            // The DB might have emissions at root level (emp.emissions) or inside monthly_data
            const existingMonthData = emp.monthly_data?.[monthKey] || {};
            // Clone emissions so we can normalise without mutating shared refs
            const monthEmissions = { ...(existingMonthData.emissions || emp.emissions || {}) };
            // Hydration normalisation: a previously saved record may carry
            // `co2e: null/undefined` (e.g. when calc resulted in 0 or wasn't
            // re-run before save). Normalise to `0` so validation + display
            // behave consistently and the user can re-save without ghost
            // "Please calculate emissions" errors.
            if (monthEmissions.co2e === null || monthEmissions.co2e === undefined) {
              monthEmissions.co2e = 0;
            }
            const monthInputs = existingMonthData.inputs || emp.inputs || {};
            const monthCalcDetails = existingMonthData.calculation_details || emp.calculation_details || null;
            
            return {
              ...emp,
              monthly_data: {
                ...emp.monthly_data,
                [monthKey]: {
                  inputs: monthInputs,
                  emissions: monthEmissions,
                  calculation_details: monthCalcDetails,
                }
              }
            };
          });
          setEditEmployees(transformedEmployees);
          
          // Store the editing month for reference
          setEditC7Month(monthKey);
        } else if (freqType === 'yearly') {
          // YEARLY MODE: Transform employees to have yearly_data structure
          const transformedEmployees = (emission.employees || []).map(emp => {
            // ALWAYS ensure yearly_data.emissions is populated
            // The DB might have emissions at root level (emp.emissions) or inside yearly_data
            const existingYearlyData = emp.yearly_data || {};
            // Clone to avoid mutating refs and normalise co2e null/undefined → 0
            const yearlyEmissions = { ...(existingYearlyData.emissions || emp.emissions || {}) };
            if (yearlyEmissions.co2e === null || yearlyEmissions.co2e === undefined) {
              yearlyEmissions.co2e = 0;
            }
            const yearlyInputs = existingYearlyData.inputs || emp.inputs || {};
            const yearlyCalcDetails = existingYearlyData.calculation_details || emp.calculation_details || null;
            
            return {
              ...emp,
              yearly_data: {
                inputs: yearlyInputs,
                emissions: yearlyEmissions,
                calculation_details: yearlyCalcDetails,
              }
            };
          });
          setEditEmployees(transformedEmployees);
          setEditC7Month(null);
        } else {
          // Old model - employees already have monthly_data structure
          setEditEmployees(emission.employees || []);
          setEditC7Month(null);
        }
        setEditEmployeeMonthlyTotals(emission.monthly_totals || {});
        setEditEmployeeYearlyTotal(emission.yearly_total || {});
      } else {
        // Not a monthly model - reset to yearly totals
        setEditEmployees([]);
        setEditEmployeeMonthlyTotals({});
        setEditEmployeeYearlyTotal({});
        setEditC7Month(null);
      }
    } else {
      // Non-C7 category - only reset C7-specific employee data, NOT scope3 fields
      // The scope3 fields (method, subcategory, activityId, etc.) were already set above
      // and should be preserved for C8, C10, C11, C13, C14 categories
      setEditEmployees([]);
      setEditEmployeeMonthlyTotals({});
      setEditEmployeeYearlyTotal({});
      setEditC7Month(null);
    }
    
    // Reset legacy override flags (not used with new dynamic structure)
    setOverrideCalorificValue(false);
    setOverrideDensity(false);
    setOverrideEmissionFactorHeat(false);
    // Load override justification if exists (#17)
    setOverrideJustification(emission.override_justification || '');
    
    setFormData({
      facility_id: emission.facility_id,
      reporting_period_start: startPeriod,
      reporting_period_end: endPeriod,
      scope: emission.scope,
      category: emission.category === 'Custom' ? '' : (emission.category || ''),
      sub_category: emission.sub_category || '',
      fuel_id: emission.fuel_database_id || fuelFromDb?.id || '',
      fuel_type: emission.fuel_type || '',
      quantity: '', // Will be populated from dynamic_field_values
      quantity_unit: '',
      emission_factor_co2: '',
      emission_factor_ch4: '',
      emission_factor_n2o: '',
      emission_factor_basis_quantity: fuelFromDb?.emission_factor_basis_quantity?.toString() || '',
      emission_factor_basis_unit: fuelFromDb?.emission_factor_basis_unit || 'tCO2/MWh',
      calorific_value: '',
      calorific_value_unit: fuelFromDb?.calorific_value_unit || '',
      calorific_value_justification: '',
      density: '',
      density_unit: fuelFromDb?.density_unit || '',
      density_justification: '',
      emission_factor_heat: '',
      emission_factor_heat_justification: '',
      conversion_factor: '1',
      source_of_information: emission.source_of_information || '',
      justification: emission.justification || '',
      notes: emission.notes || '',
      responsible_person: emission.responsible_person || '',
      responsible_person_designation: emission.responsible_person_designation || '',
      responsible_person_contact: emission.responsible_person_contact || '',
      evidence_url: emission.evidence_url || '',
      // Scope 3 optional fields
      supplier_name: emission.supplier_name || '',
      supplier_code: emission.supplier_code || '',
      employee_name: emission.employee_name || '',
      employee_id: emission.employee_id || '',
      asset_name: emission.asset_name || '', // Asset Name for C8/C13/C14/C15
      from_location: emission.from_location || '', // From Location for C4/C6/C7/C9
      to_location: emission.to_location || '', // To Location for C4/C6/C7/C9
      // Load process names with descriptions
      process_names: (() => {
        if (emission.process_descriptions?.length > 0) {
          return emission.process_descriptions.map(pd => ({
            name: pd.name || '',
            description: pd.description || ''
          }));
        }
        if (emission.process_names?.length > 0) {
          return emission.process_names.map(name => ({
            name: typeof name === 'string' ? name : (name.name || ''),
            description: typeof name === 'object' ? (name.description || '') : ''
          }));
        }
        return [{ name: '', description: '' }];
      })(),
    });
    
    // Parse existing evidences from evidence_url (comma-separated)
    if (emission.evidence_url) {
      const existingUrls = emission.evidence_url.split(',').filter(url => url.trim());
      
      // Fetch actual filenames for each file
      const evidencesWithFilenames = await Promise.all(
        existingUrls.map(async (url, idx) => {
          const trimmedUrl = url.trim();
          const fileIdMatch = trimmedUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
          if (fileIdMatch) {
            try {
              const response = await axios.get(`${API}/files/${fileIdMatch[1]}/info`);
              return {
                url: trimmedUrl,
                filename: response.data.filename || `Evidence ${idx + 1}`,
                file_id: fileIdMatch[1]
              };
            } catch (error) {
              console.error('Failed to fetch file info:', error);
              return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };
            }
          }
          return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };
        })
      );
      
      setExistingEvidences(evidencesWithFilenames);
    } else {
      setExistingEvidences([]);
    }
    
    // Dynamic field values will be populated from audit_log after form config loads
    // Set initial empty state - the useEffect will populate once dynamicInputFields is available
    setDynamicFieldValues({});
    
    // Clear previous audit log to prevent stale data showing
    setEmissionAuditLog([]);
    
    // Store the emission ID for fetching audit log
    setEditingEmissionId(emission.id);
    
    // Open dialog AFTER all data is set (original working flow)
    // Brief loading state to prevent initial render flash
    setIsEditLoading(true);
    setDialogOpen(true);
    
    // Small delay then clear loading - data is already set
    await new Promise(resolve => setTimeout(resolve, 50));
    setIsEditLoading(false);
}

export default editEmissionDispatch;
