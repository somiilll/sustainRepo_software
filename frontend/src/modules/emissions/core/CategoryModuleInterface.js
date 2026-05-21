/**
 * Category Module Interface
 * 
 * Every emission category must implement this contract.
 * This ensures consistent behavior across all categories and enables
 * the plugin-style architecture.
 */

/**
 * @typedef {Object} FieldConfig
 * @property {string} key - Field identifier
 * @property {string} label - Display label
 * @property {'text'|'number'|'select'|'date'|'textarea'|'checkbox'|'radio'|'custom'} type - Field type
 * @property {boolean} [required] - Whether field is required
 * @property {string} [placeholder] - Placeholder text
 * @property {Array<{value: string, label: string}>} [options] - Options for select/radio
 * @property {string} [unit] - Unit of measurement
 * @property {string} [unitSource] - Source for dynamic units ('fuel', 'all_units', 'scope3_ef')
 * @property {Array<string>} [allowedUnits] - Allowed unit options
 * @property {boolean} [isOverride] - Whether this is an override field
 * @property {string} [helpText] - Help text for the field
 * @property {string} [dependsOn] - Field this depends on for visibility
 * @property {Function} [visibilityCondition] - Function to determine visibility
 * @property {Object} [validation] - Zod validation config
 */

/**
 * @typedef {Object} CategoryModuleConfig
 * @property {string} id - Category identifier (e.g., 'c7', 'stationary_combustion')
 * @property {string} name - Display name
 * @property {string} scope - Scope code ('scope1', 'scope2', 'scope3', 'biogenic')
 * @property {string} [description] - Category description
 * @property {Array<string>} [methods] - Available calculation methods
 * @property {Array<string>} [activityTypes] - Available activity types (for C6/C7)
 * @property {boolean} [requiresSubcategory] - Whether subcategory selection is needed
 * @property {boolean} [supportsMultiEmployee] - Whether multi-employee mode is supported
 * @property {boolean} [supportsMonthly] - Whether monthly entries are supported
 * @property {boolean} [supportsYearly] - Whether yearly entries are supported
 */

/**
 * @typedef {Object} CategoryModule
 * @property {CategoryModuleConfig} config - Category configuration
 * @property {Array<FieldConfig>} fields - Form field definitions
 * @property {Object} validationSchema - Zod validation schema
 * @property {Function} buildPayload - Transforms form data to API payload
 * @property {Function} normalizeData - Normalizes API response to form data
 * @property {Function} getDefaultValues - Returns default form values
 * @property {Object} [tableColumns] - Column definitions for list view
 * @property {Object} [uploadConfig] - Bulk upload configuration
 * @property {React.Component} [FormSection] - Custom form section component (optional)
 * @property {React.Component} [EditSection] - Custom edit section component (optional)
 * @property {Function} [transformForChart] - Transform data for dashboard charts
 */

/**
 * Base class for category modules
 * Provides default implementations that can be overridden
 */
export class BaseCategoryModule {
  constructor(config) {
    this.config = config;
    this.fields = [];
    this.validationSchema = null;
  }

  /**
   * Get default form values
   * @returns {Object} Default values for the form
   */
  getDefaultValues() {
    const defaults = {};
    this.fields.forEach(field => {
      if (field.type === 'checkbox') {
        defaults[field.key] = false;
      } else if (field.type === 'number') {
        defaults[field.key] = '';
      } else {
        defaults[field.key] = '';
      }
    });
    return defaults;
  }

  /**
   * Build API payload from form data
   * @param {Object} formData - Form data
   * @param {Object} context - Additional context (facility, scope, etc.)
   * @returns {Object} API payload
   */
  buildPayload(formData, context) {
    throw new Error('buildPayload must be implemented by category module');
  }

  /**
   * Normalize API response to form data
   * @param {Object} apiData - API response data
   * @returns {Object} Normalized form data
   */
  normalizeData(apiData) {
    throw new Error('normalizeData must be implemented by category module');
  }

  /**
   * Validate form data
   * @param {Object} formData - Form data to validate
   * @returns {{valid: boolean, errors: Object}} Validation result
   */
  validate(formData) {
    if (!this.validationSchema) {
      return { valid: true, errors: {} };
    }
    
    try {
      this.validationSchema.parse(formData);
      return { valid: true, errors: {} };
    } catch (error) {
      const errors = {};
      if (error.errors) {
        error.errors.forEach(err => {
          const path = err.path.join('.');
          errors[path] = err.message;
        });
      }
      return { valid: false, errors };
    }
  }

  /**
   * Get visible fields based on current form state
   * @param {Object} formData - Current form data
   * @param {Object} context - Additional context
   * @returns {Array<FieldConfig>} Visible fields
   */
  getVisibleFields(formData, context) {
    return this.fields.filter(field => {
      if (!field.visibilityCondition) return true;
      return field.visibilityCondition(formData, context);
    });
  }

  /**
   * Transform emission data for chart display
   * @param {Object} emission - Emission record
   * @returns {Object} Chart-ready data
   */
  transformForChart(emission) {
    return {
      label: this.config.name,
      value: emission.outputs?.co2e?.value || emission.co2e_emissions || 0,
      category: emission.category,
      period: emission.reporting_period,
    };
  }

  /**
   * Get table column definitions
   * @returns {Array<Object>} Column definitions
   */
  getTableColumns() {
    return this.tableColumns || [
      { key: 'reporting_period', label: 'Period' },
      { key: 'category', label: 'Category' },
      { key: 'co2e_emissions', label: 'tCO₂e', align: 'right' },
    ];
  }
}

/**
 * Module interface for TypeScript-style documentation
 * All category modules should conform to this shape
 */
export const CategoryModuleInterface = {
  // Configuration
  config: {
    id: '',
    name: '',
    scope: '',
    description: '',
    methods: [],
    activityTypes: [],
    requiresSubcategory: false,
    supportsMultiEmployee: false,
    supportsMonthly: true,
    supportsYearly: true,
  },
  
  // Form field definitions
  fields: [],
  
  // Zod validation schema
  validationSchema: null,
  
  // Required methods
  buildPayload: (formData, context) => ({}),
  normalizeData: (apiData) => ({}),
  getDefaultValues: () => ({}),
  validate: (formData) => ({ valid: true, errors: {} }),
  
  // Optional methods
  getVisibleFields: (formData, context) => [],
  transformForChart: (emission) => ({}),
  getTableColumns: () => [],
  
  // Optional components
  FormSection: null,
  EditSection: null,
  
  // Upload configuration
  uploadConfig: {
    templateColumns: [],
    parseRow: (row) => ({}),
    validateRow: (row) => ({ valid: true, errors: [] }),
  },
};

export default BaseCategoryModule;
