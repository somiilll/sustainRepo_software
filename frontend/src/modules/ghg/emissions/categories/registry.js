/**
 * Category Registry
 * 
 * Central registry for emission category modules.
 * This pattern replaces scattered if/else conditionals with a clean,
 * extensible module system.
 * 
 * Each category module can define:
 * - form: Form component for data entry
 * - editForm: Form component for editing (if different from create)
 * - validation: Validation rules
 * - payloadBuilder: Function to build API payload
 * - normalizer: Function to normalize API response data
 * - config: Category-specific configuration
 * 
 * Usage:
 *   import { getCategoryModule, getCategoryConfig } from '@/modules/ghg/emissions/categories';
 *   const module = getCategoryModule('c7');
 *   const FormComponent = module.form;
 */

// Registry storage
const categoryRegistry = {};

/**
 * Register a category module
 * @param {string} categoryCode - Category code (e.g., 'c1', 'c7', 'stationary_combustion')
 * @param {Object} module - Category module object
 */
export const registerCategory = (categoryCode, module) => {
  const code = categoryCode.toLowerCase();
  categoryRegistry[code] = {
    code,
    ...module,
  };
};

/**
 * Get category module by code or name
 * @param {string} categoryIdentifier - Category code or full name
 * @returns {Object|null} Category module or null if not found
 */
export const getCategoryModule = (categoryIdentifier) => {
  if (!categoryIdentifier) return null;
  
  const identifier = categoryIdentifier.toLowerCase();
  
  // Direct match by code
  if (categoryRegistry[identifier]) {
    return categoryRegistry[identifier];
  }
  
  // Match by partial code (e.g., "C7 - Employee Commuting" -> "c7")
  for (const [code, module] of Object.entries(categoryRegistry)) {
    if (identifier.includes(code)) {
      return module;
    }
  }
  
  return null;
};

/**
 * Get category configuration
 * @param {string} categoryIdentifier - Category code or name
 * @returns {Object} Category config or default config
 */
export const getCategoryConfig = (categoryIdentifier) => {
  const module = getCategoryModule(categoryIdentifier);
  return module?.config || getDefaultCategoryConfig();
};

/**
 * Get default category configuration
 * @returns {Object}
 */
export const getDefaultCategoryConfig = () => ({
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis'],
});

/**
 * Check if category is registered
 * @param {string} categoryIdentifier - Category code or name
 * @returns {boolean}
 */
export const isCategoryRegistered = (categoryIdentifier) => {
  return getCategoryModule(categoryIdentifier) !== null;
};

/**
 * Get all registered category codes
 * @returns {Array<string>}
 */
export const getRegisteredCategories = () => {
  return Object.keys(categoryRegistry);
};

/**
 * Get category form component
 * @param {string} categoryIdentifier - Category code or name
 * @returns {React.Component|null}
 */
export const getCategoryForm = (categoryIdentifier) => {
  const module = getCategoryModule(categoryIdentifier);
  return module?.form || null;
};

/**
 * Get category edit form component
 * @param {string} categoryIdentifier - Category code or name
 * @returns {React.Component|null}
 */
export const getCategoryEditForm = (categoryIdentifier) => {
  const module = getCategoryModule(categoryIdentifier);
  return module?.editForm || module?.form || null;
};

/**
 * Get category validation schema
 * @param {string} categoryIdentifier - Category code or name
 * @returns {Object|null}
 */
export const getCategoryValidation = (categoryIdentifier) => {
  const module = getCategoryModule(categoryIdentifier);
  return module?.validation || null;
};

/**
 * Get category payload builder
 * @param {string} categoryIdentifier - Category code or name
 * @returns {Function|null}
 */
export const getCategoryPayloadBuilder = (categoryIdentifier) => {
  const module = getCategoryModule(categoryIdentifier);
  return module?.payloadBuilder || null;
};

/**
 * Build payload using category-specific builder
 * @param {string} categoryIdentifier - Category code or name
 * @param {Object} formData - Form data
 * @param {Object} context - Additional context (user, facility, etc.)
 * @returns {Object} Built payload
 */
export const buildCategoryPayload = (categoryIdentifier, formData, context = {}) => {
  const builder = getCategoryPayloadBuilder(categoryIdentifier);
  if (builder) {
    return builder(formData, context);
  }
  // Fallback to default payload structure
  return formData;
};

/**
 * Get category normalizer
 * @param {string} categoryIdentifier - Category code or name
 * @returns {Function|null}
 */
export const getCategoryNormalizer = (categoryIdentifier) => {
  const module = getCategoryModule(categoryIdentifier);
  return module?.normalizer || null;
};

/**
 * Normalize data using category-specific normalizer
 * @param {string} categoryIdentifier - Category code or name
 * @param {Object} apiData - Raw API response data
 * @returns {Object} Normalized data for form
 */
export const normalizeCategoryData = (categoryIdentifier, apiData) => {
  const normalizer = getCategoryNormalizer(categoryIdentifier);
  if (normalizer) {
    return normalizer(apiData);
  }
  // Fallback to passing through unchanged
  return apiData;
};

export default {
  registerCategory,
  getCategoryModule,
  getCategoryConfig,
  getDefaultCategoryConfig,
  isCategoryRegistered,
  getRegisteredCategories,
  getCategoryForm,
  getCategoryEditForm,
  getCategoryValidation,
  getCategoryPayloadBuilder,
  buildCategoryPayload,
  getCategoryNormalizer,
  normalizeCategoryData,
};
