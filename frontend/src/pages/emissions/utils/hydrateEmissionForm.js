/**
 * hydrateEmissionForm — Pure transformation utility
 *
 * Extracts form values from an existing emission record for edit mode.
 * This is a pure function: no side effects, no state setters, no API calls.
 * 
 * Used by:
 * - editEmissionDispatch.js (full Emissions.js edit flow)
 * - EmissionEntryForm.js (standalone edit mode hydration)
 * 
 * @param {Object} emission - The emission record to hydrate from
 * @param {Object} config - Configuration containing fuel database and lookup data
 * @param {Array} config.fuelDatabase - Array of fuel records
 * @param {Array} config.scope3EFData - Scope 3 emission factor data (optional)
 * @param {Array} config.fugitiveEmissionsData - Fugitive emissions data (optional)
 * @returns {Object} Hydrated form values ready for consumption
 */
export function hydrateEmissionForm(emission, config = {}) {
  const {
    fuelDatabase = [],
    scope3EFData = [],
    fugitiveEmissionsData = [],
  } = config;

  // =====================
  // Parse reporting period
  // =====================
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
    
    return periodStr;
  };

  const [startPeriodRaw, endPeriodRaw] = emission.reporting_period?.includes(' to ')
    ? emission.reporting_period.split(' to ')
    : [emission.reporting_period, emission.reporting_period];

  const startPeriod = parseReportingPeriod(startPeriodRaw);
  const endPeriod = parseReportingPeriod(endPeriodRaw);

  // =====================
  // Determine frequency type
  // =====================
  const frequencyType = emission.frequency_type || 'monthly';

  // =====================
  // Fuel lookup
  // =====================
  let fuelFromDb = emission.fuel_database_id 
    ? fuelDatabase.find(f => f.id === emission.fuel_database_id)
    : null;
  
  if (!fuelFromDb && emission.fuel_type) {
    fuelFromDb = fuelDatabase.find(f => f.fuel_name === emission.fuel_type);
  }

  // =====================
  // Scope 3 field extraction
  // =====================
  const extractScope3Fields = () => {
    const dynamicValues = emission.dynamic_field_values || {};
    const method = emission.calculation_method_scope3 || dynamicValues.calculation_method_scope3 || '';
    
    // Handle activityId which may be stored as string or object {value, unit}
    let activityId = emission.scope3_ef_id || dynamicValues.scope3_ef_id || '';
    if (typeof activityId === 'object' && activityId.value) {
      activityId = activityId.value;
    }
    
    // Get activity type
    let activityType = emission.scope3_activity_type || emission.activity_type || '';
    if (!activityType && dynamicValues.scope3_activity_type) {
      activityType = typeof dynamicValues.scope3_activity_type === 'object' 
        ? dynamicValues.scope3_activity_type.value 
        : dynamicValues.scope3_activity_type;
    }
    
    // For C7 records, check employees array for activity_type if not found at top level
    const isC7 = emission.category?.toLowerCase().includes('c7') || 
                 emission.category?.toLowerCase().includes('employee commuting');
    if (!activityType && isC7 && emission.employees?.length > 0) {
      activityType = emission.employees[0].activity_type || '';
    }
    
    // Try to look it up from scope3EFData (for legacy records)
    if (!activityType && activityId && scope3EFData.length > 0) {
      const matchedEF = scope3EFData.find(ef => ef.id === activityId);
      activityType = matchedEF?.activity_type || '';
    }
    
    // Normalize activity type for C7
    if (activityType && isC7) {
      const normalizedType = activityType.toLowerCase().replace(/\s+/g, '_');
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
    
    // Get subcategory
    let subcategory = '';
    if (dynamicValues.scope3_subcategory) {
      subcategory = typeof dynamicValues.scope3_subcategory === 'object'
        ? dynamicValues.scope3_subcategory.value
        : dynamicValues.scope3_subcategory;
    }

    // Get type of product for C11
    const topTypeOfProduct = emission.type_of_product;
    const dynTypeOfProduct = dynamicValues.type_of_product;
    const typeOfProductVal =
      topTypeOfProduct ||
      (typeof dynTypeOfProduct === 'object'
        ? dynTypeOfProduct?.value
        : dynTypeOfProduct) ||
      '';

    // Get custom activity for supplier_basis
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

    return {
      method,
      activityId,
      activityType,
      subcategory,
      typeOfProduct: typeOfProductVal,
      customActivity,
      isCustomActivity,
      isC7,
    };
  };

  // =====================
  // Biogenic field extraction
  // =====================
  const extractBiogenicFields = () => {
    if (emission.scope !== 'biogenic') return { biogenicScopeSelection: '' };

    const dynamicValues = emission.dynamic_field_values || {};
    const biogenicSelection = emission.biogenic_scope_selection || 
      (typeof dynamicValues.biogenic_scope_selection === 'object' 
        ? dynamicValues.biogenic_scope_selection.value 
        : dynamicValues.biogenic_scope_selection) || '';

    // If biogenic scope3, also extract scope3 fields
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

      return {
        biogenicScopeSelection: biogenicSelection,
        scope3Method: method,
        scope3ActivityType: activityType,
        scope3Subcategory: '',
        typeOfProduct: '',
        scope3ActivityId: activityId,
        scope3CustomActivity: customActivity,
        useCustomActivity: isCustomActivity,
      };
    }

    return { biogenicScopeSelection: biogenicSelection };
  };

  // =====================
  // Employee/C7 data extraction
  // =====================
  const extractEmployeeData = (scope3Fields) => {
    const { isC7 } = scope3Fields;
    
    if (!isC7 || emission.scope !== 'scope3') {
      return {
        employees: [],
        employeeMonthlyTotals: {},
        employeeYearlyTotal: {},
        editC7Month: null,
      };
    }

    const isMonthlyModel = emission.reporting_period && /^\d{4}-\d{2}$/.test(emission.reporting_period);
    
    if (isMonthlyModel) {
      const monthNum = parseInt(emission.reporting_period.split('-')[1], 10);
      const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthKey = monthKeys[monthNum - 1];
      
      const transformedEmployees = (emission.employees || []).map(emp => {
        const existingMonthData = emp.monthly_data?.[monthKey] || {};
        const monthEmissions = { ...(existingMonthData.emissions || emp.emissions || {}) };
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

      return {
        employees: transformedEmployees,
        employeeMonthlyTotals: emission.monthly_totals || {},
        employeeYearlyTotal: emission.yearly_total || {},
        editC7Month: monthKey,
      };
    } else if (frequencyType === 'yearly') {
      const transformedEmployees = (emission.employees || []).map(emp => {
        const existingYearlyData = emp.yearly_data || {};
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

      return {
        employees: transformedEmployees,
        employeeMonthlyTotals: emission.monthly_totals || {},
        employeeYearlyTotal: emission.yearly_total || {},
        editC7Month: null,
      };
    } else {
      return {
        employees: emission.employees || [],
        employeeMonthlyTotals: emission.monthly_totals || {},
        employeeYearlyTotal: emission.yearly_total || {},
        editC7Month: null,
      };
    }
  };

  // =====================
  // Build formData
  // =====================
  const buildFormData = () => {
    return {
      facility_id: emission.facility_id,
      reporting_period_start: startPeriod,
      reporting_period_end: endPeriod,
      scope: emission.scope,
      category: emission.category === 'Custom' ? '' : (emission.category || ''),
      sub_category: emission.sub_category || '',
      fuel_id: emission.fuel_database_id || fuelFromDb?.id || '',
      fuel_type: emission.fuel_type || '',
      quantity: '',
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
      record_source: emission.record_source || '',
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
      asset_name: emission.asset_name || '',
      from_location: emission.from_location || '',
      to_location: emission.to_location || '',
      // Process names
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
    };
  };

  // =====================
  // Parse existing evidences
  // =====================
  const parseExistingEvidences = () => {
    if (!emission.evidence_url) return [];
    return emission.evidence_url.split(',')
      .filter(url => url.trim())
      .map((url, idx) => ({
        url: url.trim(),
        filename: `Evidence ${idx + 1}`, // Filename will be fetched async in caller
        needsFilenameResolve: true,
      }));
  };

  // =====================
  // Execute extractions
  // =====================
  const scope3Fields = emission.scope === 'scope3' ? extractScope3Fields() : {
    method: '',
    activityId: '',
    activityType: '',
    subcategory: '',
    typeOfProduct: '',
    customActivity: '',
    isCustomActivity: false,
    isC7: false,
  };

  const biogenicFields = extractBiogenicFields();
  const employeeData = extractEmployeeData(scope3Fields);
  const formData = buildFormData();
  const existingEvidences = parseExistingEvidences();
  const savedProcessType = emission.process_type || emission.dynamic_field_values?.process_type || '';
  const processType = typeof savedProcessType === 'object'
    ? savedProcessType.value || ''
    : savedProcessType;

  // =====================
  // Return hydrated values
  // =====================
  return {
    // The raw emission for reference
    emission,
    
    // Frequency and period
    frequencyType,
    startPeriod,
    endPeriod,
    
    // Core form data
    formData,
    
    // Selected category for UI
    selectedCategory: emission.category || '',
    processType,
    
    // Fuel from database (if matched)
    fuelFromDb,
    
    // Scope 3 fields
    scope3Method: scope3Fields.method,
    scope3ActivityId: scope3Fields.activityId,
    scope3ActivityType: scope3Fields.activityType,
    scope3Subcategory: scope3Fields.subcategory,
    typeOfProduct: scope3Fields.typeOfProduct,
    scope3CustomActivity: scope3Fields.customActivity,
    useCustomActivity: scope3Fields.isCustomActivity,
    
    // Biogenic fields
    biogenicScopeSelection: biogenicFields.biogenicScopeSelection,
    // Biogenic scope3 overrides (if applicable)
    ...(biogenicFields.scope3Method ? {
      scope3Method: biogenicFields.scope3Method,
      scope3ActivityType: biogenicFields.scope3ActivityType,
      scope3Subcategory: biogenicFields.scope3Subcategory,
      typeOfProduct: biogenicFields.typeOfProduct,
      scope3ActivityId: biogenicFields.scope3ActivityId,
      scope3CustomActivity: biogenicFields.scope3CustomActivity,
      useCustomActivity: biogenicFields.useCustomActivity,
    } : {}),
    
    // Employee/C7 data
    employees: employeeData.employees,
    employeeMonthlyTotals: employeeData.employeeMonthlyTotals,
    employeeYearlyTotal: employeeData.employeeYearlyTotal,
    editC7Month: employeeData.editC7Month,
    
    // Evidence URLs (filenames need async resolution)
    existingEvidences,
    
    // Override flags (legacy, always reset)
    overrideCalorificValue: false,
    overrideDensity: false,
    overrideEmissionFactorHeat: false,
    overrideJustification: emission.override_justification || '',
    
    // Editing state
    editingEmissionId: emission.id,
  };
}

export default hydrateEmissionForm;
