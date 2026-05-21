/**
 * C1 - Purchased Goods and Services
 * Validation Rules
 */

import { isSupplierBased, isSpendBased } from '../../../../../../constants/calculation-methods';

/**
 * Validation schema for C1
 */
export const validation = {
  // Required fields
  required: ['facility_id', 'reporting_period', 'scope3_activity_id'],
  
  // Conditional required fields
  conditionalRequired: {
    // Spend amount required for spend-based method
    spent_value: {
      when: (formData) => isSpendBased(formData.calculationMethod),
      message: 'Spend amount is required for spend-based calculation',
    },
    // Quantity required for activity-based method
    quantity: {
      when: (formData) => !isSpendBased(formData.calculationMethod) && !isSupplierBased(formData.calculationMethod),
      message: 'Quantity is required for activity-based calculation',
    },
    // Supplier EF required for supplier-based method
    supplier_emission_factor: {
      when: (formData) => isSupplierBased(formData.calculationMethod),
      message: 'Supplier emission factor is required for supplier-based calculation',
    },
    activity_value_supplier_based: {
      when: (formData) => isSupplierBased(formData.calculationMethod),
      message: 'Activity value is required for supplier-based calculation',
    },
  },
  
  // Field validators
  validators: {
    spent_value: (value, formData) => {
      if (isSpendBased(formData.calculationMethod)) {
        if (!value || parseFloat(value) <= 0) {
          return 'Spend amount must be greater than 0';
        }
      }
      return null;
    },
    quantity: (value, formData) => {
      if (!isSpendBased(formData.calculationMethod) && !isSupplierBased(formData.calculationMethod)) {
        if (!value || parseFloat(value) <= 0) {
          return 'Quantity must be greater than 0';
        }
      }
      return null;
    },
    supplier_emission_factor: (value, formData) => {
      if (isSupplierBased(formData.calculationMethod)) {
        if (!value || parseFloat(value) <= 0) {
          return 'Emission factor must be greater than 0';
        }
      }
      return null;
    },
  },
};

/**
 * Validate C1 form data
 * @param {Object} formData - Form data to validate
 * @returns {Object} { isValid: boolean, errors: Object }
 */
export const validateC1Form = (formData) => {
  const errors = {};
  
  // Check required fields
  for (const field of validation.required) {
    if (!formData[field]) {
      errors[field] = `${field} is required`;
    }
  }
  
  // Check conditional required fields
  for (const [field, config] of Object.entries(validation.conditionalRequired)) {
    if (config.when(formData) && !formData[field]) {
      errors[field] = config.message;
    }
  }
  
  // Run field validators
  for (const [field, validator] of Object.entries(validation.validators)) {
    const error = validator(formData[field], formData);
    if (error) {
      errors[field] = error;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export default validation;
