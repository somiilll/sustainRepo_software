/**
 * C7 - Employee Commuting
 * Validation Rules
 * 
 * C7 has complex validation due to multi-employee structure
 */

import { isSupplierBased } from '../../../../../../constants/calculation-methods';

/**
 * Validation schema for C7
 */
export const validation = {
  // Required fields at form level
  required: ['facility_id', 'reporting_period', 'scope3_activity_id', 'activity_type'],
  
  // Employee-level required fields
  employeeRequired: ['name'],
  
  // Conditional required fields based on calculation method
  conditionalRequired: {
    // Activity-based requires distance and days
    km_travelled: {
      when: (formData) => !isSupplierBased(formData.calculationMethod),
      message: 'Distance travelled is required for activity-based calculation',
    },
    no_of_days: {
      when: (formData) => !isSupplierBased(formData.calculationMethod),
      message: 'Number of days is required for activity-based calculation',
    },
    // Supplier-based requires activity value and emission factor
    activity_value_supplier_based: {
      when: (formData) => isSupplierBased(formData.calculationMethod),
      message: 'Activity value is required for supplier-based calculation',
    },
    emission_factor_supplier_based: {
      when: (formData) => isSupplierBased(formData.calculationMethod),
      message: 'Emission factor is required for supplier-based calculation',
    },
  },
};

/**
 * Validate a single employee's data
 * @param {Object} employee - Employee data
 * @param {string} calculationMethod - Calculation method
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {Object} { isValid: boolean, errors: Object }
 */
export const validateEmployee = (employee, calculationMethod, frequencyType = 'monthly') => {
  const errors = {};
  
  // Employee must have a name
  if (!employee.name?.trim()) {
    errors.name = 'Employee name is required';
  }
  
  const isSupplier = isSupplierBased(calculationMethod);
  
  if (frequencyType === 'yearly') {
    // Validate yearly_data inputs
    const inputs = employee.yearly_data?.inputs || {};
    
    if (isSupplier) {
      if (!inputs.activity_value_supplier_based || parseFloat(inputs.activity_value_supplier_based) <= 0) {
        errors.activity_value_supplier_based = 'Activity value must be greater than 0';
      }
      if (!inputs.emission_factor_supplier_based || parseFloat(inputs.emission_factor_supplier_based) <= 0) {
        errors.emission_factor_supplier_based = 'Emission factor must be greater than 0';
      }
    } else {
      if (!inputs.km_travelled || parseFloat(inputs.km_travelled) <= 0) {
        errors.km_travelled = 'Distance must be greater than 0';
      }
      if (!inputs.no_of_days || parseFloat(inputs.no_of_days) <= 0) {
        errors.no_of_days = 'Number of days must be greater than 0';
      }
    }
  } else {
    // Validate monthly_data - at least one month must have data
    const monthlyData = employee.monthly_data || {};
    const hasAnyMonthData = Object.values(monthlyData).some(monthData => {
      const inputs = monthData?.inputs || {};
      if (isSupplier) {
        return inputs.activity_value_supplier_based && parseFloat(inputs.activity_value_supplier_based) > 0;
      } else {
        return inputs.km_travelled && parseFloat(inputs.km_travelled) > 0;
      }
    });
    
    if (!hasAnyMonthData) {
      errors.monthly_data = 'At least one month must have data entered';
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate all employees
 * @param {Array} employees - Array of employee data
 * @param {string} calculationMethod - Calculation method
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {Object} { isValid: boolean, errors: Object, employeeErrors: Object }
 */
export const validateEmployees = (employees, calculationMethod, frequencyType = 'monthly') => {
  const employeeErrors = {};
  
  if (!employees || employees.length === 0) {
    return {
      isValid: false,
      errors: { employees: 'At least one employee is required' },
      employeeErrors: {},
    };
  }
  
  let hasAnyValidEmployee = false;
  
  for (const employee of employees) {
    const { isValid, errors } = validateEmployee(employee, calculationMethod, frequencyType);
    if (!isValid) {
      employeeErrors[employee.id] = errors;
    } else {
      hasAnyValidEmployee = true;
    }
  }
  
  return {
    isValid: hasAnyValidEmployee && Object.keys(employeeErrors).length === 0,
    errors: hasAnyValidEmployee ? {} : { employees: 'At least one employee must have valid data' },
    employeeErrors,
  };
};

/**
 * Validate C7 form data (complete validation)
 * @param {Object} formData - Form data including employees
 * @returns {Object} { isValid: boolean, errors: Object, employeeErrors: Object }
 */
export const validateC7Form = (formData) => {
  const errors = {};
  
  // Check required fields
  for (const field of validation.required) {
    if (!formData[field]) {
      errors[field] = `${field.replace(/_/g, ' ')} is required`;
    }
  }
  
  // Validate employees
  const employeeValidation = validateEmployees(
    formData.employees,
    formData.calculationMethod,
    formData.frequencyType
  );
  
  return {
    isValid: Object.keys(errors).length === 0 && employeeValidation.isValid,
    errors: { ...errors, ...employeeValidation.errors },
    employeeErrors: employeeValidation.employeeErrors,
  };
};

/**
 * Validate employee emissions have been calculated
 * @param {Array} employees - Array of employee data
 * @param {string} frequencyType - 'monthly' or 'yearly'
 * @returns {Object} { isValid: boolean, message: string }
 */
export const validateCalculatedEmissions = (employees, frequencyType = 'monthly') => {
  if (!employees || employees.length === 0) {
    return { isValid: false, message: 'No employees to validate' };
  }
  
  if (frequencyType === 'yearly') {
    const hasCalculatedEmissions = employees.some(emp => 
      emp.yearly_data?.emissions?.co2e !== null && 
      emp.yearly_data?.emissions?.co2e !== undefined
    );
    
    if (!hasCalculatedEmissions) {
      return { isValid: false, message: 'Please calculate emissions for at least one employee' };
    }
  } else {
    const hasCalculatedEmissions = employees.some(emp => 
      Object.values(emp.monthly_data || {}).some(m => 
        m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined
      )
    );
    
    if (!hasCalculatedEmissions) {
      return { isValid: false, message: 'Please calculate emissions for at least one month' };
    }
  }
  
  return { isValid: true, message: '' };
};

export default validation;
