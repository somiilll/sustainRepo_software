/**
 * C2 - Capital Goods
 * Data Normalizer
 */

/**
 * Normalize API response for C2 emission entry
 * @param {Object} apiData - Raw API response data
 * @returns {Object} Normalized form data
 */
export const normalize = (apiData) => {
  if (!apiData) return null;
  
  const dfv = apiData.dynamic_field_values || {};
  
  const calculationMethod = dfv.calculation_method_scope3?.value || 
                           apiData.calculation_method_scope3 || 
                           'activity_basis';
  
  const normalized = {
    id: apiData.id,
    facilityId: apiData.facility_id,
    scope: apiData.scope || 'scope3',
    category: apiData.category,
    subCategory: apiData.sub_category,
    reportingPeriod: apiData.reporting_period,
    calculationMethod,
    scope3ActivityId: dfv.scope3_ef_id?.value || apiData.scope3_ef_id,
    scope3Activity: dfv.scope3_activity?.value || apiData.scope3_activity || apiData.sub_category,
    notes: apiData.notes || '',
    responsiblePerson: apiData.responsible_person || '',
    responsiblePersonDesignation: apiData.responsible_person_designation || '',
    responsiblePersonContact: apiData.responsible_person_contact || '',
    evidenceUrl: apiData.evidence_url || '',
    evidenceFileName: apiData.evidence_file_name || '',
    co2Emissions: apiData.co2_emissions,
    ch4Emissions: apiData.ch4_emissions,
    n2oEmissions: apiData.n2o_emissions,
    co2eEmissions: apiData.co2e_emissions,
    totalEmissions: apiData.total_emissions,
    version: apiData.version || 0,
    createdAt: apiData.created_at,
    updatedAt: apiData.updated_at,
    dynamicFieldValues: dfv,
  };
  
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
    normalized.quantity = dfv.qty?.value || dfv.activity_value?.value;
    normalized.quantityUnit = dfv.qty?.unit || dfv.activity_value?.unit;
  }
  
  return normalized;
};

export const normalizeList = (apiDataList) => {
  if (!Array.isArray(apiDataList)) return [];
  return apiDataList.map(normalize).filter(Boolean);
};

export default normalize;
