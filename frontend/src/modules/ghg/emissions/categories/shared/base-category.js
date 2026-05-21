/**
 * Base Category Module
 * 
 * Template/base class for category modules.
 * Other category modules should extend or follow this pattern.
 */

/**
 * Default category configuration
 */
export const defaultConfig = {
  // Category identification
  code: '',
  name: '',
  scope: '',
  
  // UI features
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  
  // Entry modes
  supportsMonthly: true,
  supportsYearly: true,
  
  // Special features
  multiEmployee: false,
  
  // Available calculation methods
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  
  // Subcategory options (if requiresSubcategory is true)
  subcategories: [],
  
  // Activity types (if hasActivityType is true)
  activityTypes: [],
};

/**
 * Default validation rules
 * Categories can override specific rules
 */
export const defaultValidation = {
  // Required fields for all categories
  required: ['facility_id', 'reporting_period'],
  
  // Conditional required fields
  conditionalRequired: {
    // field: { when: (formData) => boolean }
  },
  
  // Field validators
  validators: {
    // field: (value, formData) => string | null (error message or null if valid)
  },
};

/**
 * Default payload builder
 * Builds API payload from form data
 * @param {Object} formData - Form data
 * @param {Object} context - Context (user, facility, etc.)
 * @returns {Object} API payload
 */
export const defaultPayloadBuilder = (formData, context = {}) => {
  const payload = {
    facility_id: formData.facilityId,
    scope: formData.scope,
    category: formData.category,
    reporting_period: formData.reportingPeriod,
    notes: formData.notes || '',
  };
  
  // Add dynamic field values if present
  if (formData.dynamicFieldValues) {
    payload.dynamic_field_values = formData.dynamicFieldValues;
  }
  
  return payload;
};

/**
 * Default normalizer
 * Normalizes API response data for form use
 * @param {Object} apiData - Raw API response
 * @returns {Object} Normalized form data
 */
export const defaultNormalizer = (apiData) => {
  return {
    facilityId: apiData.facility_id,
    scope: apiData.scope,
    category: apiData.category,
    reportingPeriod: apiData.reporting_period,
    notes: apiData.notes || '',
    dynamicFieldValues: apiData.dynamic_field_values || {},
  };
};

/**
 * Create a category module with defaults
 * @param {Object} overrides - Category-specific overrides
 * @returns {Object} Complete category module
 */
export const createCategoryModule = (overrides = {}) => {
  return {
    config: {
      ...defaultConfig,
      ...overrides.config,
    },
    validation: {
      ...defaultValidation,
      ...overrides.validation,
    },
    payloadBuilder: overrides.payloadBuilder || defaultPayloadBuilder,
    normalizer: overrides.normalizer || defaultNormalizer,
    form: overrides.form || null,
    editForm: overrides.editForm || null,
    hooks: overrides.hooks || {},
    utils: overrides.utils || {},
  };
};

export default {
  defaultConfig,
  defaultValidation,
  defaultPayloadBuilder,
  defaultNormalizer,
  createCategoryModule,
};
