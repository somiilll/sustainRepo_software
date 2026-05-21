/**
 * Category Registry
 * 
 * Central registry for all emission category modules.
 * Implements factory pattern for dynamic module loading.
 * 
 * Usage:
 *   const module = categoryRegistry.get('c7');
 *   const Form = module.FormSection;
 *   const payload = module.buildPayload(formData, context);
 */

// Category modules will be imported and registered here
const registry = new Map();

/**
 * Category Registry API
 */
export const categoryRegistry = {
  /**
   * Register a category module
   * @param {string} categoryId - Category identifier
   * @param {Object} module - Category module implementation
   */
  register(categoryId, module) {
    const normalizedId = categoryId.toLowerCase().replace(/\s+/g, '_');
    registry.set(normalizedId, module);
    
    // Also register by display name for flexibility
    if (module.config?.name) {
      const nameKey = module.config.name.toLowerCase().replace(/\s+/g, '_');
      if (nameKey !== normalizedId) {
        registry.set(nameKey, module);
      }
    }
  },

  /**
   * Get a category module by ID
   * @param {string} categoryId - Category identifier
   * @returns {Object|null} Category module or null if not found
   */
  get(categoryId) {
    if (!categoryId) return null;
    const normalizedId = categoryId.toLowerCase().replace(/\s+/g, '_');
    return registry.get(normalizedId) || null;
  },

  /**
   * Check if a category is registered
   * @param {string} categoryId - Category identifier
   * @returns {boolean}
   */
  has(categoryId) {
    if (!categoryId) return false;
    const normalizedId = categoryId.toLowerCase().replace(/\s+/g, '_');
    return registry.has(normalizedId);
  },

  /**
   * Get all registered categories
   * @returns {Array<Object>} Array of category modules
   */
  getAll() {
    const seen = new Set();
    const modules = [];
    
    registry.forEach((module, key) => {
      const id = module.config?.id || key;
      if (!seen.has(id)) {
        seen.add(id);
        modules.push(module);
      }
    });
    
    return modules;
  },

  /**
   * Get categories by scope
   * @param {string} scope - Scope code ('scope1', 'scope2', 'scope3', 'biogenic')
   * @returns {Array<Object>} Array of category modules for the scope
   */
  getByScope(scope) {
    return this.getAll().filter(module => module.config?.scope === scope);
  },

  /**
   * Get category module for an emission record
   * Attempts to match by category name, scope, and other identifiers
   * @param {Object} emission - Emission record
   * @returns {Object|null} Matched category module
   */
  getForEmission(emission) {
    const { category, scope, scope3_category } = emission;
    
    // Try direct category match
    if (category) {
      const module = this.get(category);
      if (module) return module;
      
      // Try extracting category code (e.g., "C7 - Employee Commuting" -> "c7")
      const codeMatch = category.match(/^(c\d+)/i);
      if (codeMatch) {
        const module = this.get(codeMatch[1]);
        if (module) return module;
      }
    }
    
    // Try scope3_category
    if (scope3_category) {
      const module = this.get(scope3_category);
      if (module) return module;
    }
    
    // Fallback: return generic module for scope
    return this.getGenericModule(scope);
  },

  /**
   * Get generic fallback module for a scope
   * @param {string} scope - Scope code
   * @returns {Object|null} Generic module
   */
  getGenericModule(scope) {
    const genericKey = `generic_${scope}`;
    return registry.get(genericKey) || null;
  },

  /**
   * Register a generic fallback module for a scope
   * @param {string} scope - Scope code
   * @param {Object} module - Generic module
   */
  registerGeneric(scope, module) {
    registry.set(`generic_${scope}`, module);
  },

  /**
   * Clear all registered modules (useful for testing)
   */
  clear() {
    registry.clear();
  },

  /**
   * Get registry size
   * @returns {number} Number of registered modules
   */
  get size() {
    return registry.size;
  },
};

/**
 * Decorator/helper to create a category module with proper structure
 * @param {Object} config - Module configuration
 * @returns {Object} Category module
 */
export function createCategoryModule(config) {
  const module = {
    config: {
      id: config.id,
      name: config.name,
      scope: config.scope,
      description: config.description || '',
      methods: config.methods || [],
      activityTypes: config.activityTypes || [],
      requiresSubcategory: config.requiresSubcategory || false,
      supportsMultiEmployee: config.supportsMultiEmployee || false,
      supportsMonthly: config.supportsMonthly !== false,
      supportsYearly: config.supportsYearly !== false,
    },
    fields: config.fields || [],
    validationSchema: config.validationSchema || null,
    
    // Methods with defaults
    buildPayload: config.buildPayload || ((formData) => formData),
    normalizeData: config.normalizeData || ((data) => data),
    getDefaultValues: config.getDefaultValues || (() => ({})),
    validate: config.validate || (() => ({ valid: true, errors: {} })),
    getVisibleFields: config.getVisibleFields || ((formData, ctx) => module.fields),
    transformForChart: config.transformForChart || ((emission) => ({
      label: module.config.name,
      value: emission.outputs?.co2e?.value || emission.co2e_emissions || 0,
    })),
    getTableColumns: config.getTableColumns || (() => []),
    
    // Optional components
    FormSection: config.FormSection || null,
    EditSection: config.EditSection || null,
    
    // Upload config
    uploadConfig: config.uploadConfig || null,
  };
  
  // Auto-register if ID is provided
  if (config.autoRegister !== false && config.id) {
    categoryRegistry.register(config.id, module);
  }
  
  return module;
}

export default categoryRegistry;
