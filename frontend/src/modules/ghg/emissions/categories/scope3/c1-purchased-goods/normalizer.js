/**
 * C1 - Purchased Goods and Services
 * Data Normalizer
 * 
 * Transforms API response data into form-friendly format
 */

/**
 * Normalize API response for C1 emission entry
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
  
  // Base normalized data
  const normalized = {
    id: apiData.id,
    facilityId: apiData.facility_id,
    scope: apiData.scope || 'scope3',
    category: apiData.category,
    subCategory: apiData.sub_category,
    reportingPeriod: apiData.reporting_period,
    calculationMethod,
    
    // Activity selection
    scope3ActivityId: dfv.scope3_ef_id?.value || apiData.scope3_ef_id,
    scope3Activity: dfv.scope3_activity?.value || apiData.scope3_activity || apiData.sub_category,
    
    // Notes and responsible person
    notes: apiData.notes || '',
    responsiblePerson: apiData.responsible_person || '',
    responsiblePersonDesignation: apiData.responsible_person_designation || '',
    responsiblePersonContact: apiData.responsible_person_contact || '',
    
    // Evidence
    evidenceUrl: apiData.evidence_url || '',
    evidenceFileName: apiData.evidence_file_name || '',
    
    // Emission outputs
    co2Emissions: apiData.co2_emissions,
    ch4Emissions: apiData.ch4_emissions,
    n2oEmissions: apiData.n2o_emissions,
    co2eEmissions: apiData.co2e_emissions,
    totalEmissions: apiData.total_emissions,
    
    // Version info
    version: apiData.version || 0,
    createdAt: apiData.created_at,
    updatedAt: apiData.updated_at,
    
    // Keep raw dynamic field values for form
    dynamicFieldValues: dfv,
  };
  
  // Extract method-specific values
  if (calculationMethod === 'spend_basis' || calculationMethod === 'spend_based') {
    normalized.spentValue = dfv.spent_value?.value;
    normalized.spentValueUnit = dfv.spent_value?.unit;
    normalized.currency = dfv.spent_value?.unit;
  } else if (calculationMethod === 'supplier_basis' || calculationMethod === 'supplier_based') {
    normalized.activityValueSupplierBased = dfv.activity_value_supplier_based?.value;
    normalized.activityValueUnit = dfv.activity_value_supplier_based?.unit;
    normalized.supplierEmissionFactor = dfv.emission_factor_supplier_based?.value;
    normalized.supplierEmissionFactorUnit = dfv.emission_factor_supplier_based?.unit;
  } else {
    // Activity-based
    normalized.quantity = dfv.qty?.value || dfv.activity_value?.value;
    normalized.quantityUnit = dfv.qty?.unit || dfv.activity_value?.unit;
    normalized.activityValue = dfv.activity_value?.value;
    normalized.activityValueUnit = dfv.activity_value?.unit;
  }
  
  return normalized;
};

/**
 * Normalize list of C1 entries
 * @param {Array} apiDataList - Array of API response data
 * @returns {Array} Array of normalized entries
 */
export const normalizeList = (apiDataList) => {
  if (!Array.isArray(apiDataList)) return [];
  return apiDataList.map(normalize).filter(Boolean);
};

/**
 * Denormalize form data back to API format
 * Useful for comparison or debugging
 * @param {Object} formData - Normalized form data
 * @returns {Object} API-compatible format
 */
export const denormalize = (formData) => {
  // This is essentially what payload-builder does
  // but kept here for completeness
  return {
    facility_id: formData.facilityId,
    scope: formData.scope,
    category: formData.category,
    sub_category: formData.subCategory || formData.scope3Activity,
    reporting_period: formData.reportingPeriod,
    calculation_method_scope3: formData.calculationMethod,
    scope3_ef_id: formData.scope3ActivityId,
    scope3_activity: formData.scope3Activity,
    notes: formData.notes,
  };
};

export default normalize;
