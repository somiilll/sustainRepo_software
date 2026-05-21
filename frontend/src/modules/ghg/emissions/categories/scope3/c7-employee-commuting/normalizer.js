/**
 * C7 - Employee Commuting
 * Data Normalizer
 * 
 * Transforms API response data into form-friendly format for C7
 */

/**
 * Normalize a single employee from API response
 * @param {Object} apiEmployee - Employee data from API
 * @returns {Object} Normalized employee data
 */
const normalizeEmployee = (apiEmployee) => {
  if (!apiEmployee) return null;
  
  return {
    id: apiEmployee.id || `emp-${Date.now()}`,
    name: apiEmployee.name || '',
    employee_id: apiEmployee.employee_id || '',
    activity_type: apiEmployee.activity_type || '',
    
    // Monthly data
    monthly_data: apiEmployee.monthly_data 
      ? Object.fromEntries(
          Object.entries(apiEmployee.monthly_data).map(([monthKey, data]) => [
            monthKey,
            {
              inputs: data?.inputs || {},
              emissions: data?.emissions || {},
              calculation_details: data?.calculation_details || null,
            }
          ])
        )
      : {},
    
    // Yearly data
    yearly_data: apiEmployee.yearly_data 
      ? {
          inputs: apiEmployee.yearly_data.inputs || apiEmployee.inputs || {},
          emissions: apiEmployee.yearly_data.emissions || apiEmployee.emissions || {},
          calculation_details: apiEmployee.yearly_data.calculation_details || 
                               apiEmployee.calculation_details || null,
        }
      : null,
  };
};

/**
 * Normalize API response for C7 emission entry
 * @param {Object} apiData - Raw API response data
 * @returns {Object} Normalized form data
 */
export const normalize = (apiData) => {
  if (!apiData) return null;
  
  const dfv = apiData.dynamic_field_values || {};
  
  // Extract calculation method
  const calculationMethod = dfv.calculation_method_scope3?.value || 
                           apiData.calculation_method_scope3 || 
                           'activity_basis';
  
  // Determine frequency type based on data structure
  // If reporting_period contains month info (YYYY-MM or FY with monthly_data), it's monthly
  const reportingPeriod = apiData.reporting_period || '';
  const hasMonthlyData = apiData.employees?.some(emp => 
    emp.monthly_data && Object.keys(emp.monthly_data).length > 0
  );
  const frequencyType = hasMonthlyData ? 'monthly' : 'yearly';
  
  // Parse reporting period
  let reportingYear = '';
  let yearType = 'calendar';
  
  if (reportingPeriod.startsWith('FY')) {
    yearType = 'financial';
    reportingYear = reportingPeriod.replace('FY', '').split('-')[0];
  } else {
    reportingYear = reportingPeriod.split('-')[0];
  }
  
  // Normalize employees
  const employees = (apiData.employees || []).map(normalizeEmployee).filter(Boolean);
  
  // Build normalized data
  const normalized = {
    id: apiData.id,
    facilityId: apiData.facility_id,
    scope: apiData.scope || 'scope3',
    category: apiData.category,
    subCategory: apiData.sub_category,
    reportingPeriod: apiData.reporting_period,
    reportingYear: parseInt(reportingYear) || new Date().getFullYear(),
    yearType,
    frequencyType,
    calculationMethod,
    
    // Activity selection
    scope3ActivityId: dfv.scope3_ef_id?.value || apiData.scope3_ef_id,
    scope3Activity: dfv.scope3_activity?.value || apiData.scope3_activity || apiData.sub_category,
    activityType: apiData.activity_type || apiData.scope3_activity_type || '',
    
    // Formula info
    formulaId: apiData.formula_id,
    formulaName: apiData.formula_name,
    
    // Notes and responsible person
    notes: apiData.notes || '',
    responsiblePerson: apiData.responsible_person || '',
    responsiblePersonDesignation: apiData.responsible_person_designation || '',
    responsiblePersonContact: apiData.responsible_person_contact || '',
    
    // Evidence
    evidenceUrl: apiData.evidence_url || '',
    evidenceFileName: apiData.evidence_file_name || '',
    
    // Employees data
    employees,
    
    // Totals
    monthlyTotals: apiData.monthly_totals || {},
    yearlyTotal: apiData.yearly_total || {},
    
    // Emission outputs (summary)
    totalEmissions: apiData.total_emissions,
    
    // Version info
    version: apiData.version || 0,
    createdAt: apiData.created_at,
    updatedAt: apiData.updated_at,
    
    // Keep raw for reference
    dynamicFieldValues: dfv,
  };
  
  return normalized;
};

/**
 * Normalize list of C7 entries
 * @param {Array} apiDataList - Array of API response data
 * @returns {Array} Array of normalized entries
 */
export const normalizeList = (apiDataList) => {
  if (!Array.isArray(apiDataList)) return [];
  return apiDataList.map(normalize).filter(Boolean);
};

/**
 * Denormalize C7 form data back to API format
 * Useful for comparison or debugging
 * @param {Object} formData - Normalized form data
 * @returns {Object} API-compatible format
 */
export const denormalize = (formData) => {
  return {
    facility_id: formData.facilityId,
    scope: formData.scope,
    category: formData.category,
    sub_category: formData.subCategory || formData.scope3Activity,
    reporting_period: formData.reportingPeriod,
    calculation_method_scope3: formData.calculationMethod,
    scope3_ef_id: formData.scope3ActivityId,
    scope3_activity: formData.scope3Activity,
    activity_type: formData.activityType,
    formula_id: formData.formulaId,
    formula_name: formData.formulaName,
    notes: formData.notes,
    employees: formData.employees,
    monthly_totals: formData.monthlyTotals,
    yearly_total: formData.yearlyTotal,
  };
};

/**
 * Extract employee monthly totals from employees array
 * @param {Array} employees - Array of employee data
 * @returns {Object} Monthly totals { jan: { co2e: number }, ... }
 */
export const calculateMonthlyTotals = (employees) => {
  const totals = {};
  
  for (const emp of employees) {
    if (!emp.monthly_data) continue;
    
    for (const [monthKey, data] of Object.entries(emp.monthly_data)) {
      if (data?.emissions?.co2e != null) {
        if (!totals[monthKey]) {
          totals[monthKey] = { co2e: 0 };
        }
        totals[monthKey].co2e += data.emissions.co2e;
      }
    }
  }
  
  return totals;
};

/**
 * Extract yearly total from employees array
 * @param {Array} employees - Array of employee data
 * @returns {Object} Yearly total { co2e: number }
 */
export const calculateYearlyTotal = (employees) => {
  let total = 0;
  
  for (const emp of employees) {
    if (emp.yearly_data?.emissions?.co2e != null) {
      total += emp.yearly_data.emissions.co2e;
    }
  }
  
  return { co2e: total, unit: 'tCO2e' };
};

export default normalize;
