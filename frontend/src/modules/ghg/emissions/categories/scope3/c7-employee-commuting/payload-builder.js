/**
 * C7 - Employee Commuting
 * Payload Builder
 * 
 * Transforms form data into API-compatible payload for C7
 * C7 uses special endpoints: /api/emissions/c7/month and /api/emissions/c7/yearly
 */

import { isSupplierBased } from '../../../../../../constants/calculation-methods';

/**
 * Build base payload structure for C7
 * @param {Object} formData - Form data
 * @returns {Object} Base payload
 */
const buildBasePayload = (formData) => {
  const {
    facilityId,
    category,
    calculationMethod,
    scope3ActivityId,
    scope3Activity,
    activityType,
    notes,
    responsiblePerson,
    responsiblePersonDesignation,
    responsiblePersonContact,
    formulaId,
    formulaName,
  } = formData;
  
  return {
    facility_id: facilityId,
    scope: 'scope3',
    category: category || 'C7 - Employee Commuting',
    sub_category: scope3Activity,
    calculation_method_scope3: calculationMethod,
    scope3_ef_id: scope3ActivityId,
    scope3_activity: scope3Activity,
    scope3_activity_type: activityType,
    activity_type: activityType,
    formula_id: formulaId || null,
    formula_name: formulaName || '',
    notes: notes || '',
    responsible_person: responsiblePerson || '',
    responsible_person_designation: responsiblePersonDesignation || '',
    responsible_person_contact: responsiblePersonContact || '',
  };
};

/**
 * Transform employee data for API (handle is_override fields)
 * @param {Object} employee - Employee data
 * @param {string} calculationMethod - Calculation method
 * @returns {Object} Transformed employee data
 */
const transformEmployeeInputs = (employee, calculationMethod) => {
  const isSupplier = isSupplierBased(calculationMethod);
  
  // Process monthly_data if present
  const monthlyData = {};
  if (employee.monthly_data) {
    for (const [monthKey, monthData] of Object.entries(employee.monthly_data)) {
      monthlyData[monthKey] = {
        inputs: { ...monthData.inputs },
        emissions: monthData.emissions || {},
        calculation_details: monthData.calculation_details || null,
      };
      
      // Handle is_override for supplier-based emission factors
      if (isSupplier && monthData.inputs?.emission_factor_supplier_based) {
        monthlyData[monthKey].inputs.emission_factor_supplier_based_is_override = 
          monthData.inputs.emission_factor_supplier_based_is_override ?? true;
      }
    }
  }
  
  // Process yearly_data if present
  let yearlyData = null;
  if (employee.yearly_data) {
    yearlyData = {
      inputs: { ...employee.yearly_data.inputs },
      emissions: employee.yearly_data.emissions || {},
      calculation_details: employee.yearly_data.calculation_details || null,
    };
    
    // Handle is_override for supplier-based emission factors
    if (isSupplier && yearlyData.inputs?.emission_factor_supplier_based) {
      yearlyData.inputs.emission_factor_supplier_based_is_override = 
        employee.yearly_data.inputs?.emission_factor_supplier_based_is_override ?? true;
    }
  }
  
  return {
    id: employee.id,
    name: employee.name,
    employee_id: employee.employee_id || '',
    activity_type: employee.activity_type || '',
    monthly_data: monthlyData,
    yearly_data: yearlyData,
  };
};

/**
 * Build yearly payload for C7
 * Used when frequency is 'yearly'
 * Endpoint: POST /api/emissions/c7/yearly
 * 
 * @param {Object} formData - Form data
 * @param {Object} context - Additional context
 * @returns {Object} Yearly payload
 */
export const buildYearlyPayload = (formData, context = {}) => {
  const basePayload = buildBasePayload(formData);
  const { employees, reportingYear, yearType } = formData;
  
  // Build reporting period
  const reportingPeriod = yearType === 'financial' 
    ? `FY${reportingYear}` 
    : `${reportingYear}`;
  
  // Filter employees with calculated yearly emissions
  const employeesWithData = employees.filter(emp => 
    emp.yearly_data?.emissions?.co2e !== null && 
    emp.yearly_data?.emissions?.co2e !== undefined
  );
  
  // Transform employee data
  const transformedEmployees = employeesWithData.map(emp => ({
    id: emp.id,
    name: emp.name,
    employee_id: emp.employee_id || '',
    activity_type: emp.activity_type || formData.activityType,
    inputs: emp.yearly_data?.inputs || {},
    emissions: emp.yearly_data?.emissions || {},
    calculation_details: emp.yearly_data?.calculation_details || null,
  }));
  
  // Calculate yearly total
  const yearlyTotal = employeesWithData.reduce(
    (sum, emp) => sum + (emp.yearly_data?.emissions?.co2e || 0), 
    0
  );
  
  return {
    ...basePayload,
    reporting_period: reportingPeriod,
    employees: transformedEmployees,
    yearly_total: {
      co2e: yearlyTotal,
      unit: 'tCO2e',
    },
  };
};

/**
 * Build monthly payload for C7
 * Used when frequency is 'monthly'
 * Endpoint: POST /api/emissions/c7/month (called per employee)
 * 
 * @param {Object} formData - Form data
 * @param {Object} context - Additional context
 * @returns {Array} Array of monthly payloads (one per employee with data)
 */
export const buildMonthlyPayload = (formData, context = {}) => {
  const basePayload = buildBasePayload(formData);
  const { employees, reportingYear, yearType } = formData;
  const payloads = [];
  
  // Filter employees with monthly data
  const employeesWithMonthlyData = employees.filter(emp => 
    Object.values(emp.monthly_data || {}).some(m => 
      m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined
    )
  );
  
  for (const employee of employeesWithMonthlyData) {
    // Transform monthly data with proper structure
    const monthlyData = employee.monthly_data || {};
    
    // Build reporting period based on first month with data
    const firstMonth = Object.keys(monthlyData).find(m => 
      monthlyData[m]?.emissions?.co2e !== null && 
      monthlyData[m]?.emissions?.co2e !== undefined
    );
    
    const reportingPeriod = yearType === 'financial'
      ? `FY${reportingYear}`
      : `${reportingYear}`;
    
    // Calculate monthly totals for this employee
    const monthlyTotals = {};
    for (const [monthKey, data] of Object.entries(monthlyData)) {
      if (data?.emissions?.co2e !== null && data?.emissions?.co2e !== undefined) {
        monthlyTotals[monthKey] = {
          co2e: data.emissions.co2e,
        };
      }
    }
    
    const payload = {
      ...basePayload,
      reporting_period: reportingPeriod,
      employees: [{
        id: employee.id,
        name: employee.name,
        employee_id: employee.employee_id || '',
        activity_type: employee.activity_type || formData.activityType,
        monthly_data: Object.fromEntries(
          Object.entries(monthlyData).map(([month, data]) => [
            month,
            {
              inputs: data?.inputs || {},
              emissions: data?.emissions || {},
              calculation_details: data?.calculation_details || null,
            }
          ])
        ),
      }],
      monthly_totals: monthlyTotals,
    };
    
    payloads.push(payload);
  }
  
  return payloads;
};

/**
 * Build payload for C7 (auto-detects yearly vs monthly)
 * @param {Object} formData - Form data
 * @param {Object} context - Additional context
 * @returns {Object|Array} Payload or array of payloads
 */
export const buildPayload = (formData, context = {}) => {
  const { frequencyType } = formData;
  
  if (frequencyType === 'yearly') {
    return buildYearlyPayload(formData, context);
  }
  
  return buildMonthlyPayload(formData, context);
};

/**
 * Build calculation request payload for a single employee
 * Used to call calc-engine for individual employee calculations
 * 
 * @param {Object} params - Calculation parameters
 * @returns {Object} Calc engine request payload
 */
export const buildCalculationPayload = ({
  employee,
  monthKey,
  activityId,
  activityType,
  calculationMethod,
  formulaId,
  isYearly = false,
}) => {
  const inputData = isYearly 
    ? employee.yearly_data 
    : employee.monthly_data?.[monthKey];
  
  if (!inputData?.inputs) {
    return null;
  }
  
  const inputs = inputData.inputs;
  const isSupplier = isSupplierBased(calculationMethod);
  
  // Build decision inputs for calc engine
  const decisionInputs = {
    scope3_ef_id: activityId,
    activity_type: activityType,
    calculation_method_scope3: calculationMethod,
  };
  
  // Build dynamic field values
  const dynamicFieldValues = {};
  
  if (isSupplier) {
    if (inputs.activity_value_supplier_based) {
      dynamicFieldValues.activity_value_supplier_based = {
        value: parseFloat(inputs.activity_value_supplier_based),
        unit: inputs.activity_value_supplier_based_unit || '',
      };
    }
    if (inputs.emission_factor_supplier_based) {
      dynamicFieldValues.emission_factor_supplier_based = {
        value: parseFloat(inputs.emission_factor_supplier_based),
        unit: inputs.emission_factor_supplier_based_unit || 'kgCO2e/unit',
        is_override: inputs.emission_factor_supplier_based_is_override ?? true,
      };
    }
  } else {
    if (inputs.km_travelled) {
      dynamicFieldValues.km_travelled = {
        value: parseFloat(inputs.km_travelled),
        unit: 'km',
      };
    }
    if (inputs.no_of_days) {
      dynamicFieldValues.no_of_days = {
        value: parseFloat(inputs.no_of_days),
        unit: 'days',
      };
    }
  }
  
  return {
    category_id: 'scope3_c7',
    decision_inputs: decisionInputs,
    dynamic_field_values: dynamicFieldValues,
    formula_id: formulaId || null,
  };
};

export default buildPayload;
