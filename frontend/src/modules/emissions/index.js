/**
 * Emissions Module - Core Index
 *
 * Main entry point for the emissions module architecture.
 * Exports all core components, hooks, stores, and services.
 *
 * NOTE: Importing this file (via `initializeCategoryModules`) is a
 * **non-functional** registration step. It only wires the plugin
 * registry — it does NOT alter existing business logic, validations,
 * calculations, API payloads, or UI behaviour anywhere in the app.
 */

import { categoryRegistry } from './core/CategoryRegistry';

// Core
export { categoryRegistry, createCategoryModule } from './core/CategoryRegistry';
export { BaseCategoryModule, CategoryModuleInterface } from './core/CategoryModuleInterface';
export {
  EmissionsProvider,
  useEmissions,
  useCategoryModule,
  useEmissionForm,
  useEmissionFilters,
  useMethodLabels,
} from './core/EmissionsContext';
export { default as EmissionsContext } from './core/EmissionsContext';

// Stores
export {
  useEmissionsStore,
  useEditFormStore,
  useEntryFormStore,
} from './stores/emissionsStore';

// Services
export {
  createEmissionsService,
  createDashboardService,
  createUploadService,
  createServices,
} from './services/api.service';

// Shared Components
export {
  DynamicField,
  FormSection,
  DynamicFormRenderer,
} from './shared/components/DynamicFormRenderer';

// Category Modules (specialised reference implementations)
export { default as C7EmployeeCommutingModule } from './categories/C7EmployeeCommuting';
export { default as GenericScope3Module } from './categories/GenericScope3';

// Generators (Scope 3 C1..C15 + Scope 1)
export {
  generateCategoryModule,
  registerAllScope3Categories,
  getCategoryModule,
} from './categories/CategoryGenerator';

let _initialized = false;

/**
 * Initialize all category modules.
 * Idempotent — safe to call multiple times.
 *
 * Registers:
 *   - C7 (specialised) + GenericScope3 (fallback)
 *   - C1..C6, C8..C15 (auto-generated via CategoryGenerator)
 *   - Scope 1: Stationary / Mobile / Fugitive + GenericScope1 fallback
 */
export function initializeCategoryModules() {
  if (_initialized) {
    return categoryRegistry.size;
  }
  _initialized = true;

  // Specialised modules (auto-register on import)
  require('./categories/C7EmployeeCommuting');
  require('./categories/GenericScope3');

  // Scope 1 modules (auto-register on import)
  require('./categories/Scope1Modules');

  // Auto-generate & register all remaining Scope 3 categories
  const { registerAllScope3Categories } = require('./categories/CategoryGenerator');
  registerAllScope3Categories();

  // Attach the shared Scope 3 flat-field renderer to all flat-field categories.
  // The renderer is category-agnostic — it reads everything it needs from the
  // calc-engine `dynamicInputFields` + props. C7 is excluded (multi-employee).
  const {
    Scope3DynamicFieldsRenderer,
  } = require('./shared/renderers/Scope3DynamicFieldsRenderer');

  const FLAT_FIELD_SCOPE3_CATEGORIES = [
    'c1', 'c2', 'c3', 'c4', 'c5', 'c6',
    'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15',
  ];
  FLAT_FIELD_SCOPE3_CATEGORIES.forEach((id) => {
    const mod = categoryRegistry.get(id);
    if (mod) {
      mod.DynamicFieldsRenderer = Scope3DynamicFieldsRenderer;
    }
  });

  // Wire category capabilities from the static definitions.
  // Capabilities are derived from `scope3-definitions.js` flags so the page
  // can query `module.hasCapability('asset-name')` instead of maintaining
  // hard-coded `['c8','c13','c14','c15'].some(...)` chains in JSX.
  const { CATEGORY_CONFIGS } = require('./categories/scope3-definitions');
  Object.entries(CATEGORY_CONFIGS).forEach(([id, cfg]) => {
    const mod = categoryRegistry.get(id);
    if (!mod) return;
    const caps = new Set(mod.capabilities || []);
    if (cfg.requiresAssetName) caps.add('asset-name');
    if (cfg.requiresLocation) caps.add('journey-locations');
    if (cfg.requiresSubcategory) caps.add('subcategory');
    if (cfg.activityTypes) caps.add('activity-types');
    if (cfg.supportsMultiEmployee) caps.add('multi-employee');
    mod.capabilities = Array.from(caps);
    mod.hasCapability = (cap) => mod.capabilities.includes(cap);
  });

  // eslint-disable-next-line no-console
  console.log(`[Emissions] Category modules initialized: ${categoryRegistry.size} entries`);
  return categoryRegistry.size;
}

/**
 * Module version for debugging
 */
export const MODULE_VERSION = '1.1.0';
