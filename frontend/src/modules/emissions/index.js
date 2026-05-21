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

  // Attach the shared Scope 3 flat-field renderer to opted-in modules.
  // Pilot: C1 (Purchased Goods and Services) — proves config-driven rendering
  // via the registry. Other categories continue using legacy inline JSX until
  // explicitly migrated.
  const {
    Scope3DynamicFieldsRenderer,
  } = require('./shared/renderers/Scope3DynamicFieldsRenderer');

  const c1Module = categoryRegistry.get('c1');
  if (c1Module) {
    c1Module.DynamicFieldsRenderer = Scope3DynamicFieldsRenderer;
  }

  // eslint-disable-next-line no-console
  console.log(`[Emissions] Category modules initialized: ${categoryRegistry.size} entries`);
  return categoryRegistry.size;
}

/**
 * Module version for debugging
 */
export const MODULE_VERSION = '1.1.0';
