/**
 * C7 - Employee Commuting
 * Utility Functions
 */

import { isSupplierBased } from '../../../../../../constants/calculation-methods';

/**
 * Generate unique employee ID
 * @returns {string} Unique ID
 */
export const generateEmployeeId = () => {
  return `emp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create a new empty employee object
 * @param {Object} options - Options
 * @returns {Object} New employee
 */
export const createEmptyEmployee = (options = {}) => {
  const { activityType = '', frequencyType = 'monthly' } = options;
  
  const employee = {
    id: generateEmployeeId(),
    name: '',
    employee_id: '',
    activity_type: activityType,
    monthly_data: {},
    yearly_data: null,
  };
  
  if (frequencyType === 'yearly') {
    employee.yearly_data = {
      inputs: {},
      emissions: {},
      calculation_details: null,
    };
  }
  
  return employee;
};

/**
 * Check if employee has any input data
 * @param {Object} employee - Employee data
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {boolean}
 */
export const employeeHasData = (employee, frequencyType = 'monthly') => {
  if (frequencyType === 'yearly') {
    const inputs = employee.yearly_data?.inputs || {};
    return Object.values(inputs).some(v => v !== '' && v !== null && v !== undefined);
  }
  
  const monthlyData = employee.monthly_data || {};
  return Object.values(monthlyData).some(monthData => {
    const inputs = monthData?.inputs || {};
    return Object.values(inputs).some(v => v !== '' && v !== null && v !== undefined);
  });
};

/**
 * Check if employee has calculated emissions
 * @param {Object} employee - Employee data
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {boolean}
 */
export const employeeHasEmissions = (employee, frequencyType = 'monthly') => {
  if (frequencyType === 'yearly') {
    return employee.yearly_data?.emissions?.co2e != null;
  }
  
  const monthlyData = employee.monthly_data || {};
  return Object.values(monthlyData).some(m => m?.emissions?.co2e != null);
};

/**
 * Get total emissions for an employee
 * @param {Object} employee - Employee data
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {number} Total CO2e emissions
 */
export const getEmployeeTotalEmissions = (employee, frequencyType = 'monthly') => {
  if (frequencyType === 'yearly') {
    return employee.yearly_data?.emissions?.co2e || 0;
  }
  
  const monthlyData = employee.monthly_data || {};
  return Object.values(monthlyData).reduce(
    (sum, m) => sum + (m?.emissions?.co2e || 0),
    0
  );
};

/**
 * Get months with data for an employee
 * @param {Object} employee - Employee data
 * @returns {Array<string>} Array of month keys with data
 */
export const getEmployeeMonthsWithData = (employee) => {
  const monthlyData = employee.monthly_data || {};
  return Object.keys(monthlyData).filter(monthKey => {
    const data = monthlyData[monthKey];
    const inputs = data?.inputs || {};
    return Object.values(inputs).some(v => v !== '' && v !== null && v !== undefined);
  });
};

/**
 * Get months with calculated emissions for an employee
 * @param {Object} employee - Employee data
 * @returns {Array<string>} Array of month keys with emissions
 */
export const getEmployeeMonthsWithEmissions = (employee) => {
  const monthlyData = employee.monthly_data || {};
  return Object.keys(monthlyData).filter(monthKey => {
    const data = monthlyData[monthKey];
    return data?.emissions?.co2e != null;
  });
};

/**
 * Clear employee emissions while preserving inputs
 * @param {Object} employee - Employee data
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {Object} Updated employee
 */
export const clearEmployeeEmissions = (employee, frequencyType = 'monthly') => {
  const updated = { ...employee };
  
  if (frequencyType === 'yearly') {
    if (updated.yearly_data) {
      updated.yearly_data = {
        ...updated.yearly_data,
        emissions: {},
        calculation_details: null,
      };
    }
  } else {
    const monthlyData = { ...updated.monthly_data };
    for (const monthKey of Object.keys(monthlyData)) {
      monthlyData[monthKey] = {
        ...monthlyData[monthKey],
        emissions: {},
        calculation_details: null,
      };
    }
    updated.monthly_data = monthlyData;
  }
  
  return updated;
};

/**
 * Update employee input value
 * @param {Object} employee - Employee data
 * @param {string} field - Field name
 * @param {*} value - New value
 * @param {string} monthKey - Month key (for monthly mode)
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {Object} Updated employee
 */
export const updateEmployeeInput = (employee, field, value, monthKey = null, frequencyType = 'monthly') => {
  const updated = { ...employee };
  
  if (frequencyType === 'yearly') {
    updated.yearly_data = {
      ...updated.yearly_data,
      inputs: {
        ...updated.yearly_data?.inputs,
        [field]: value,
      },
    };
  } else {
    if (!monthKey) {
      console.warn('monthKey required for monthly frequency');
      return updated;
    }
    
    updated.monthly_data = {
      ...updated.monthly_data,
      [monthKey]: {
        ...updated.monthly_data?.[monthKey],
        inputs: {
          ...updated.monthly_data?.[monthKey]?.inputs,
          [field]: value,
        },
      },
    };
  }
  
  return updated;
};

/**
 * Get input fields for C7 based on calculation method
 * @param {string} calculationMethod - Calculation method
 * @returns {Array} Array of field configs
 */
export const getC7InputFields = (calculationMethod) => {
  const isSupplier = isSupplierBased(calculationMethod);
  
  if (isSupplier) {
    return [
      { 
        variable: 'activity_value_supplier_based', 
        label: 'Activity Value', 
        type: 'number', 
        unit: '', 
        required: true,
        placeholder: 'Enter activity value',
      },
      { 
        variable: 'emission_factor_supplier_based', 
        label: 'Emission Factor', 
        type: 'number', 
        unit: 'kgCO2e/unit', 
        required: true,
        isOverridable: true,
        placeholder: 'Enter emission factor',
      },
    ];
  }
  
  return [
    { 
      variable: 'km_travelled', 
      label: 'Distance Travelled', 
      type: 'number', 
      unit: 'km', 
      required: true,
      placeholder: 'Enter distance in km',
    },
    { 
      variable: 'no_of_days', 
      label: 'No. of Days Travelled', 
      type: 'number', 
      unit: 'days', 
      required: true,
      placeholder: 'Enter number of days',
    },
  ];
};

/**
 * Format emissions value for display
 * @param {number} value - Emissions value in tCO2e
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted value
 */
export const formatEmissions = (value, decimals = 4) => {
  if (value == null) return '-';
  return `${parseFloat(value).toFixed(decimals)} tCO2e`;
};

export default {
  generateEmployeeId,
  createEmptyEmployee,
  employeeHasData,
  employeeHasEmissions,
  getEmployeeTotalEmissions,
  getEmployeeMonthsWithData,
  getEmployeeMonthsWithEmissions,
  clearEmployeeEmissions,
  updateEmployeeInput,
  getC7InputFields,
  formatEmissions,
};
