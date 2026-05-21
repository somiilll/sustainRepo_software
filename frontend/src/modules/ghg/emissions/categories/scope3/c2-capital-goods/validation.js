/**
 * C2 - Capital Goods
 * Validation Rules
 * 
 * C2 shares similar validation with C1
 */

import { isSupplierBased, isSpendBased } from '../../../../../../constants/calculation-methods';

/**
 * Validation schema for C2
 */
export const validation = {
  required: ['facility_id', 'reporting_period', 'scope3_activity_id'],
  
  conditionalRequired: {
    spent_value: {
      when: (formData) => isSpendBased(formData.calculationMethod),
      message: 'Spend amount is required for spend-based calculation',
    },
    quantity: {
      when: (formData) => !isSpendBased(formData.calculationMethod) && !isSupplierBased(formData.calculationMethod),
      message: 'Quantity is required for activity-based calculation',
    },
    supplier_emission_factor: {
      when: (formData) => isSupplierBased(formData.calculationMethod),
      message: 'Supplier emission factor is required for supplier-based calculation',
    },
    activity_value_supplier_based: {
      when: (formData) => isSupplierBased(formData.calculationMethod),
      message: 'Activity value is required for supplier-based calculation',
    },
  },
  
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
  },
};

/**
 * Validate C2 form data
 * @param {Object} formData - Form data to validate
 * @returns {Object} { isValid: boolean, errors: Object }
 */
export const validateC2Form = (formData) => {
  const errors = {};
  
  for (const field of validation.required) {
    if (!formData[field]) {
      errors[field] = `${field} is required`;
    }
  }
  
  for (const [field, config] of Object.entries(validation.conditionalRequired)) {
    if (config.when(formData) && !formData[field]) {
      errors[field] = config.message;
    }
  }
  
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
