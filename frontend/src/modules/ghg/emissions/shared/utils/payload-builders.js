/**
 * Emission Payload Builders
 * 
 * Utility functions for building API payloads for emission submissions.
 * These help keep the handleSubmit function lean.
 */

/**
 * Build reporting period string based on year type
 */
export const buildReportingPeriod = (reportingYearType, reportingYear, monthKey = null) => {
  if (monthKey) {
    // Monthly format
    const monthIndex = parseInt(monthKey.replace('month', ''));
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[monthIndex - 1] || monthKey;
    
    if (reportingYearType === 'financial') {
      // Financial year: Apr-Mar
      const actualYear = monthIndex >= 4 
        ? reportingYear 
        : parseInt(reportingYear) + 1;
      return `${monthName} ${actualYear} (FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)})`;
    } else {
      return `${monthName} ${reportingYear}`;
    }
  }
  
  // Yearly format
  if (reportingYearType === 'financial') {
    return `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`;
  }
  return `CY${reportingYear}`;
};

/**
 * Build base payload fields common to all emission types
 */
export const buildBasePayload = ({
  facilityId,
  scope,
  category,
  processNames,
  responsiblePerson,
  responsiblePersonDesignation,
  responsiblePersonContact,
  notes,
  assetName,
  fromLocation,
  toLocation,
  supplierName,
  supplierCode,
  employeeName,
  employeeId,
}) => {
  const validProcesses = processNames.filter(p => p.name && p.name.trim() !== '');
  
  return {
    facility_id: facilityId,
    scope: scope,
    category: category,
    process_names: validProcesses.map(p => p.name),
    process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation || null,
    responsible_person_contact: responsiblePersonContact || null,
    notes: notes || null,
    asset_name: assetName || null,
    from_location: fromLocation || null,
    to_location: toLocation || null,
    // Scope 3 optional supplier/employee fields
    supplier_name: supplierName || null,
    supplier_code: supplierCode || null,
    employee_name: employeeName || null,
    employee_id: employeeId || null,
  };
};

/**
 * Build C7 Employee Commuting monthly payload
 */
export const buildC7MonthlyPayload = ({
  facilityId,
  monthKey,
  monthEmployees,
  reportingPeriod,
  scope3Method,
  scope3ActivityType,
  scope3ActivityId,
  activityName,
  validProcesses,
  responsiblePerson,
  responsiblePersonDesignation,
  responsiblePersonContact,
  notes,
}) => {
  return {
    facility_id: facilityId,
    month_key: monthKey,
    reporting_period: reportingPeriod,
    calculation_method: scope3Method,
    activity_type: scope3ActivityType,
    activity_id: scope3ActivityId,
    activity_name: activityName,
    formula_id: monthEmployees[0]?.calculation_details?.formula_id || null,
    formula_name: monthEmployees[0]?.calculation_details?.formula_name || null,
    employees: monthEmployees,
    notes: notes,
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation,
    responsible_person_contact: responsiblePersonContact,
    process_names: validProcesses.map(p => p.name),
    process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
  };
};

/**
 * Build C7 Employee Commuting yearly payload
 */
export const buildC7YearlyPayload = ({
  facilityId,
  reportingPeriod,
  employees,
  scope3Method,
  scope3ActivityType,
  scope3ActivityId,
  activityName,
  validProcesses,
  responsiblePerson,
  responsiblePersonDesignation,
  responsiblePersonContact,
  notes,
}) => {
  const yearlyEmployees = employees
    .filter(emp => emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined)
    .map(emp => ({
      id: emp.id,
      name: emp.name,
      employee_id: emp.employee_id,
      department: emp.department,
      from_location: emp.from_location || null,
      to_location: emp.to_location || null,
      activity_type: emp.activity_type || scope3ActivityType,
      inputs: emp.yearly_data?.inputs || {},
      emissions: emp.yearly_data?.emissions || {},
      calculation_details: emp.yearly_data?.calculation_details || null,
    }));

  return {
    facility_id: facilityId,
    reporting_year: reportingPeriod,
    calculation_method: scope3Method,
    activity_type: scope3ActivityType,
    activity_id: scope3ActivityId,
    activity_name: activityName,
    formula_id: yearlyEmployees[0]?.calculation_details?.formula_id || null,
    formula_name: yearlyEmployees[0]?.calculation_details?.formula_name || null,
    employees: yearlyEmployees,
    notes: notes,
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation,
    responsible_person_contact: responsiblePersonContact,
    process_names: validProcesses.map(p => p.name),
    process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
  };
};

/**
 * Build Scope 3 regular emission payload
 */
export const buildScope3Payload = ({
  basePayload,
  reportingPeriod,
  frequencyType,
  scope3Method,
  scope3ActivityType,
  scope3ActivityId,
  scope3Subcategory,
  activityName,
  emissionFactor,
  emissionFactorUnit,
  source,
  formulaId,
  formulaName,
  dynamicFieldValues,
  calcEngineResult,
  yearlyData,
  monthlyData,
  monthKey,
}) => {
  const isYearly = frequencyType === 'yearly';
  const data = isYearly ? yearlyData : (monthlyData?.[monthKey] || {});

  return {
    ...basePayload,
    reporting_period: reportingPeriod,
    frequency_type: frequencyType,
    scope3_method: scope3Method,
    scope3_activity_type: scope3ActivityType,
    scope3_activity_id: scope3ActivityId,
    scope3_subcategory: scope3Subcategory || null,
    activity_name: activityName,
    emission_factor: emissionFactor,
    emission_factor_unit: emissionFactorUnit,
    source: source,
    formula_id: formulaId,
    formula_name: formulaName,
    dynamic_field_values: dynamicFieldValues,
    calc_engine_result: calcEngineResult,
    // Input values
    quantity: data.qty || data.quantity || null,
    unit: data.unit || data.qty_unit || null,
  };
};

/**
 * Build Process Emissions payload
 */
export const buildProcessEmissionsPayload = ({
  basePayload,
  reportingPeriod,
  frequencyType,
  selectedTemplate,
  selectedSubIndustry,
  templateInputValues,
  yearlyData,
  monthlyData,
  monthKey,
}) => {
  const isYearly = frequencyType === 'yearly';
  const data = isYearly ? yearlyData : (monthlyData?.[monthKey] || {});

  return {
    ...basePayload,
    reporting_period: reportingPeriod,
    frequency_type: frequencyType,
    emission_type: 'process',
    sub_industry: selectedSubIndustry,
    template_id: selectedTemplate?.id,
    template_name: selectedTemplate?.template_name,
    approach: selectedTemplate?.approach,
    formula: selectedTemplate?.formula,
    input_fields: selectedTemplate?.input_fields,
    input_values: templateInputValues || data,
  };
};

/**
 * Build regular fuel-based emission payload (Scope 1, 2, Biogenic)
 */
export const buildFuelEmissionPayload = ({
  basePayload,
  reportingPeriod,
  frequencyType,
  fuelId,
  fuelName,
  useCustomFuel,
  customFuelName,
  customEmissionFactor,
  customEmissionFactorUnit,
  customSource,
  formulaId,
  formulaName,
  biogenicScopeSelection,
  dynamicFieldValues,
  calcEngineResult,
  yearlyData,
  monthlyData,
  monthKey,
}) => {
  const isYearly = frequencyType === 'yearly';
  const data = isYearly ? yearlyData : (monthlyData?.[monthKey] || {});

  return {
    ...basePayload,
    reporting_period: reportingPeriod,
    frequency_type: frequencyType,
    fuel_id: useCustomFuel ? null : fuelId,
    fuel_name: useCustomFuel ? customFuelName : fuelName,
    use_custom_fuel: useCustomFuel,
    custom_emission_factor: useCustomFuel ? parseFloat(customEmissionFactor) : null,
    custom_emission_factor_unit: useCustomFuel ? customEmissionFactorUnit : null,
    custom_source: useCustomFuel ? customSource : null,
    formula_id: formulaId,
    formula_name: formulaName,
    biogenic_scope: biogenicScopeSelection || null,
    dynamic_field_values: dynamicFieldValues,
    calc_engine_result: calcEngineResult,
    // Input values
    quantity: data.qty || data.quantity || null,
    unit: data.unit || data.qty_unit || null,
    evidence: data.evidence || [],
  };
};

/**
 * Group employees by month for C7 monthly submissions
 */
export const groupEmployeesByMonth = (employees, scope3ActivityType) => {
  const monthlyEmployeeGroups = {};
  
  employees.forEach(emp => {
    const monthlyData = emp.monthly_data || {};
    Object.entries(monthlyData).forEach(([monthKey, monthData]) => {
      // Only include months with calculated emissions
      if (monthData?.emissions?.co2e !== null && monthData?.emissions?.co2e !== undefined) {
        if (!monthlyEmployeeGroups[monthKey]) {
          monthlyEmployeeGroups[monthKey] = [];
        }
        monthlyEmployeeGroups[monthKey].push({
          id: emp.id,
          name: emp.name,
          employee_id: emp.employee_id,
          department: emp.department,
          from_location: emp.from_location || null,
          to_location: emp.to_location || null,
          activity_type: emp.activity_type || scope3ActivityType,
          inputs: monthData.inputs || {},
          emissions: monthData.emissions || {},
          calculation_details: monthData.calculation_details || null,
        });
      }
    });
  });
  
  return monthlyEmployeeGroups;
};

export default {
  buildReportingPeriod,
  buildBasePayload,
  buildC7MonthlyPayload,
  buildC7YearlyPayload,
  buildScope3Payload,
  buildProcessEmissionsPayload,
  buildFuelEmissionPayload,
  groupEmployeesByMonth,
};
