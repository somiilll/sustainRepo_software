/**
 * Scope 3 Category Module Generator
 * 
 * Automatically generates category modules from configuration.
 * Special categories (C7) can override with custom implementations.
 */

import { createCategoryModule, categoryRegistry } from '../core/CategoryRegistry';
import { 
  CATEGORY_CONFIGS, 
  getBaseFields, 
  getBaseValidationSchema,
  getDefaultValues as getConfigDefaults 
} from './scope3-definitions';

/**
 * Build API payload for a Scope 3 category
 */
const buildPayload = (config) => (formData, context) => {
  const {
    facilityId,
    category,
    reportingPeriod,
    frequencyType,
    responsiblePerson,
    responsiblePersonDesignation,
    responsiblePersonContact,
    processNames,
    notes,
    dynamicFieldValues,
    calcEngineResult,
  } = context;
  
  const basePayload = {
    facility_id: facilityId,
    scope: 'scope3',
    category: category || config.name,
    reporting_period: reportingPeriod,
    frequency_type: frequencyType,
    calculation_method_scope3: formData.calculation_method,
    scope3_ef_id: formData.activity_id || null,
    scope3_activity: formData.custom_activity || null,
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation,
    responsible_person_contact: responsiblePersonContact,
    process_names: processNames?.filter(p => p.name).map(p => p.name) || [],
    process_descriptions: processNames?.filter(p => p.name) || [],
    notes: notes,
  };
  
  // Add subcategory if applicable
  if (config.requiresSubcategory && formData.subcategory) {
    basePayload.scope3_subcategory = formData.subcategory;
  }
  
  // Add activity type if applicable
  if (config.activityTypes && formData.activity_type) {
    basePayload.scope3_activity_type = formData.activity_type;
  }
  
  // Add asset name if applicable
  if (config.requiresAssetName && formData.asset_name) {
    basePayload.asset_name = formData.asset_name;
  }
  
  // Add location if applicable
  if (config.requiresLocation) {
    basePayload.from_location = formData.from_location || null;
    basePayload.to_location = formData.to_location || null;
  }
  
  // Handle supplier basis
  if (formData.calculation_method === 'supplier_basis') {
    basePayload.dynamic_field_values = {
      ...dynamicFieldValues,
      activity_value_supplier_based: {
        value: parseFloat(formData.activity_value_supplier_based) || 0,
        unit: formData.activity_value_supplier_based_unit || '',
      },
      emission_factor_supplier_based: {
        value: parseFloat(formData.emission_factor_supplier_based) || 0,
        unit: formData.emission_factor_supplier_based_unit || 'tCO2e/kg',
      },
    };
  } else {
    basePayload.dynamic_field_values = dynamicFieldValues;
    basePayload.calc_engine_result = calcEngineResult;
  }
  
  // Handle spend basis
  if (formData.calculation_method === 'spend_basis' && formData.spend_amount) {
    basePayload.dynamic_field_values = {
      ...basePayload.dynamic_field_values,
      spend_amount: {
        value: parseFloat(formData.spend_amount) || 0,
        unit: formData.spend_amount_unit || 'USD',
      },
    };
  }
  
  return basePayload;
};

/**
 * Normalize API response to form data
 */
const normalizeData = (config) => (apiData) => {
  const dfv = apiData.dynamic_field_values || {};
  
  const normalized = {
    calculation_method: apiData.calculation_method_scope3 || '',
    activity_id: apiData.scope3_ef_id || '',
    custom_activity: apiData.scope3_activity || '',
    activity_value_supplier_based: dfv.activity_value_supplier_based?.value?.toString() || '',
    activity_value_supplier_based_unit: dfv.activity_value_supplier_based?.unit || '',
    emission_factor_supplier_based: dfv.emission_factor_supplier_based?.value?.toString() || '',
    emission_factor_supplier_based_unit: dfv.emission_factor_supplier_based?.unit || 'tCO2e/kg',
  };
  
  if (config.activityTypes) {
    normalized.activity_type = dfv.scope3_activity_type?.value || apiData.scope3_activity_type || '';
  }
  
  if (config.requiresSubcategory) {
    normalized.subcategory = dfv.scope3_subcategory?.value || apiData.scope3_subcategory || '';
  }
  
  if (config.requiresAssetName) {
    normalized.asset_name = apiData.asset_name || dfv.asset_name?.value || '';
  }
  
  if (config.requiresLocation) {
    normalized.from_location = apiData.from_location || dfv.from_location?.value || '';
    normalized.to_location = apiData.to_location || dfv.to_location?.value || '';
  }
  
  if (config.methods.includes('spend_basis')) {
    normalized.spend_amount = dfv.spend_amount?.value?.toString() || '';
    normalized.spend_amount_unit = dfv.spend_amount?.unit || 'USD';
  }
  
  // Copy any additional dynamic field values
  Object.entries(dfv).forEach(([key, value]) => {
    if (!normalized[key]) {
      normalized[key] = typeof value === 'object' && value?.value !== undefined 
        ? value.value 
        : value;
    }
  });
  
  return normalized;
};

/**
 * Transform emission data for chart display
 */
const transformForChart = (config) => (emission) => {
  const dfv = emission.dynamic_field_values || {};
  
  return {
    label: config.name,
    value: emission.outputs?.co2e?.value || emission.co2e_emissions || 0,
    category: emission.category,
    period: emission.reporting_period,
    method: emission.calculation_method_scope3,
    activityType: dfv.scope3_activity_type?.value || emission.scope3_activity_type,
  };
};

/**
 * Get table columns for a category
 */
const getTableColumns = (config) => () => {
  const columns = [
    { key: 'reporting_period', label: 'Period', width: '100px' },
  ];
  
  if (config.activityTypes) {
    columns.push({ 
      key: 'activity_type', 
      label: 'Activity Type', 
      width: '150px',
    });
  }
  
  if (config.requiresAssetName) {
    columns.push({ 
      key: 'asset_name', 
      label: 'Asset', 
      width: '150px',
    });
  }
  
  columns.push({
    key: 'calculation_method',
    label: 'Method',
    width: '100px',
    render: (value) => {
      const labels = {
        'activity_basis': 'Average',
        'spend_basis': 'Spend',
        'supplier_basis': 'Supplier',
      };
      return labels[value] || value;
    },
  });
  
  columns.push({
    key: 'co2e_emissions',
    label: 'tCO₂e',
    width: '100px',
    align: 'right',
    render: (value) => value?.toFixed(4) || '0.0000',
  });
  
  return columns;
};

/**
 * Generate a category module from configuration
 */
export function generateCategoryModule(categoryId) {
  const config = CATEGORY_CONFIGS[categoryId];
  
  if (!config) {
    console.warn(`[CategoryGenerator] Unknown category: ${categoryId}`);
    return null;
  }
  
  return createCategoryModule({
    ...config,
    scope: 'scope3',
    supportsMonthly: true,
    supportsYearly: true,
    fields: getBaseFields(config),
    validationSchema: getBaseValidationSchema(config),
    getDefaultValues: () => getConfigDefaults(config),
    buildPayload: buildPayload(config),
    normalizeData: normalizeData(config),
    transformForChart: transformForChart(config),
    getTableColumns: getTableColumns(config),
    autoRegister: true,
  });
}

/**
 * Register all Scope 3 categories
 * Call this once at app startup
 */
export function registerAllScope3Categories() {
  const categoryIds = Object.keys(CATEGORY_CONFIGS);
  const modules = {};
  
  categoryIds.forEach(categoryId => {
    // Skip C7 - it has its own specialized implementation
    if (categoryId === 'c7') return;
    
    const module = generateCategoryModule(categoryId);
    if (module) {
      modules[categoryId] = module;
      
      // Also register by full name
      const fullName = module.config.name.toLowerCase().replace(/\s+/g, '_');
      categoryRegistry.register(fullName, module);
    }
  });
  
  return modules;
}

/**
 * Get category module by ID or name
 */
export function getCategoryModule(categoryIdOrName) {
  // First check registry
  let module = categoryRegistry.get(categoryIdOrName);
  if (module) return module;
  
  // Try to extract category code from name
  const codeMatch = categoryIdOrName?.match(/c(\d+)/i);
  if (codeMatch) {
    const code = `c${codeMatch[1]}`;
    module = categoryRegistry.get(code);
    if (module) return module;
  }
  
  // Fallback to generic
  return categoryRegistry.getGenericModule('scope3');
}

export default {
  generateCategoryModule,
  registerAllScope3Categories,
  getCategoryModule,
  CATEGORY_CONFIGS,
};
