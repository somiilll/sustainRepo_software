/**
 * Emissions Module - Core Index
 * 
 * Main entry point for the emissions module architecture.
 * Exports all core components, hooks, stores, and services.
 */

// Core
export { categoryRegistry, createCategoryModule } from './core/CategoryRegistry';
export { BaseCategoryModule, CategoryModuleInterface } from './core/CategoryModuleInterface';
export { 
  EmissionsProvider, 
  EmissionsContext,
  useEmissions, 
  useCategoryModule, 
  useEmissionForm,
  useEmissionFilters,
  useMethodLabels,
} from './core/EmissionsContext';

// Stores
export { 
  useEmissionsStore, 
  useEditFormStore, 
  useEntryFormStore 
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
  DynamicFormRenderer 
} from './shared/components/DynamicFormRenderer';

// Category Modules
export { default as C7EmployeeCommutingModule } from './categories/C7EmployeeCommuting';
export { default as GenericScope3Module } from './categories/GenericScope3';

/**
 * Initialize all category modules
 * Call this once at app startup to register all modules
 */
export function initializeCategoryModules() {
  // Import modules to trigger registration
  require('./categories/C7EmployeeCommuting');
  require('./categories/GenericScope3');
  
  // Future modules will be added here:
  // require('./categories/C1PurchasedGoods');
  // require('./categories/C4UpstreamTransportation');
  // require('./categories/C6BusinessTravel');
  // etc.
  
  console.log('[Emissions] Category modules initialized:', categoryRegistry.size);
}

/**
 * Module version for debugging
 */
export const MODULE_VERSION = '1.0.0';
