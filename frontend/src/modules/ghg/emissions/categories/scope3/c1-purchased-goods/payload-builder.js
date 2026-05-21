/**
 * C1 - Purchased Goods and Services
 * Payload Builder
 * 
 * Transforms form data into API-compatible payload
 */

import { isSupplierBased, isSpendBased } from '../../../../../../constants/calculation-methods';

/**
 * Build API payload for C1 emission entry
 * @param {Object} formData - Form data from UI
 * @param {Object} context - Additional context (user, facility, organization)
 * @returns {Object} API payload
 */
export const buildPayload = (formData, context = {}) => {
  const {
    facilityId,
    category,
    reportingPeriod,
    calculationMethod,
    scope3ActivityId,
    scope3Activity,
    notes,
    responsiblePerson,
    responsiblePersonDesignation,
    responsiblePersonContact,
    evidenceUrl,
    evidenceFileName,
    dynamicFieldValues = {},
  } = formData;
  
  // Base payload structure
  const payload = {
    facility_id: facilityId,
    scope: 'scope3',
    category: category || 'C1 - Purchased Goods and Services',
    sub_category: scope3Activity,
    reporting_period: reportingPeriod,
    calculation_method_scope3: calculationMethod,
    scope3_ef_id: scope3ActivityId,
    scope3_activity: scope3Activity,
    notes: notes || '',
    responsible_person: responsiblePerson || '',
    responsible_person_designation: responsiblePersonDesignation || '',
    responsible_person_contact: responsiblePersonContact || '',
  };
  
  // Add evidence if provided
  if (evidenceUrl) {
    payload.evidence_url = evidenceUrl;
    payload.evidence_file_name = evidenceFileName || '';
  }
  
  // Build dynamic field values based on calculation method
  const dfv = { ...dynamicFieldValues };
  
  // Add method to dynamic field values
  dfv.calculation_method_scope3 = {
    value: calculationMethod,
    unit: '',
  };
  
  // Add activity reference
  if (scope3ActivityId) {
    dfv.scope3_ef_id = {
      value: scope3ActivityId,
      unit: '',
    };
    dfv.scope3_activity = {
      value: scope3Activity,
      unit: '',
    };
  }
  
  // Handle method-specific fields
  if (isSpendBased(calculationMethod)) {
    // Spend-based: needs spent_value
    if (formData.spentValue) {
      dfv.spent_value = {
        value: parseFloat(formData.spentValue),
        unit: formData.spentValueUnit || formData.currency || 'USD',
      };
    }
  } else if (isSupplierBased(calculationMethod)) {
    // Supplier-based: needs activity_value and emission_factor
    if (formData.activityValueSupplierBased) {
      dfv.activity_value_supplier_based = {
        value: parseFloat(formData.activityValueSupplierBased),
        unit: formData.activityValueUnit || '',
      };
    }
    if (formData.supplierEmissionFactor) {
      dfv.emission_factor_supplier_based = {
        value: parseFloat(formData.supplierEmissionFactor),
        unit: formData.supplierEmissionFactorUnit || '',
      };
    }
  } else {
    // Activity-based: needs qty/activity_value
    if (formData.quantity) {
      dfv.qty = {
        value: parseFloat(formData.quantity),
        unit: formData.quantityUnit || '',
      };
    }
    if (formData.activityValue) {
      dfv.activity_value = {
        value: parseFloat(formData.activityValue),
        unit: formData.activityValueUnit || '',
      };
    }
  }
  
  payload.dynamic_field_values = dfv;
  
  return payload;
};

/**
 * Build monthly payload for C1
 * @param {Object} formData - Form data
 * @param {Object} monthlyData - Monthly data entries
 * @param {Object} context - Additional context
 * @returns {Array} Array of monthly payloads
 */
export const buildMonthlyPayload = (formData, monthlyData, context = {}) => {
  const payloads = [];
  
  for (const [monthKey, data] of Object.entries(monthlyData)) {
    if (!data || Object.keys(data).length === 0) continue;
    
    const monthPayload = buildPayload({
      ...formData,
      ...data,
      reportingPeriod: `${formData.reportingYear}-${monthKey}`,
    }, context);
    
    payloads.push(monthPayload);
  }
  
  return payloads;
};

export default buildPayload;
