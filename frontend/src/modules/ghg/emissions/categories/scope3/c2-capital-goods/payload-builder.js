/**
 * C2 - Capital Goods
 * Payload Builder
 * 
 * C2 uses similar payload structure to C1
 */

import { isSupplierBased, isSpendBased } from '../../../../../../constants/calculation-methods';

/**
 * Build API payload for C2 emission entry
 * @param {Object} formData - Form data from UI
 * @param {Object} context - Additional context
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
  
  const payload = {
    facility_id: facilityId,
    scope: 'scope3',
    category: category || 'C2 - Capital Goods',
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
  
  if (evidenceUrl) {
    payload.evidence_url = evidenceUrl;
    payload.evidence_file_name = evidenceFileName || '';
  }
  
  const dfv = { ...dynamicFieldValues };
  
  dfv.calculation_method_scope3 = {
    value: calculationMethod,
    unit: '',
  };
  
  if (scope3ActivityId) {
    dfv.scope3_ef_id = { value: scope3ActivityId, unit: '' };
    dfv.scope3_activity = { value: scope3Activity, unit: '' };
  }
  
  if (isSpendBased(calculationMethod)) {
    if (formData.spentValue) {
      dfv.spent_value = {
        value: parseFloat(formData.spentValue),
        unit: formData.spentValueUnit || formData.currency || 'USD',
      };
    }
  } else if (isSupplierBased(calculationMethod)) {
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
    if (formData.quantity) {
      dfv.qty = {
        value: parseFloat(formData.quantity),
        unit: formData.quantityUnit || '',
      };
    }
  }
  
  payload.dynamic_field_values = dfv;
  
  return payload;
};

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
