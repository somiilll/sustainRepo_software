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
import { resolveGhgCapabilities } from '../ghg/config/resolveGhgCapabilities';

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

  // Scope 2 module (auto-register on import)
  require('./categories/Scope2Modules');

  // Auto-generate & register all remaining Scope 3 categories
  const { registerAllScope3Categories } = require('./categories/CategoryGenerator');
  registerAllScope3Categories();

  const FLAT_FIELD_SCOPE3_CATEGORIES = [
    'c1', 'c2', 'c3', 'c4', 'c5', 'c6',
    'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15',
  ];

  // Attach the shared Step 3 (year/monthly accordion) renderer to ALL modules
  // — this is the CREATE-flow analogue of `DynamicFieldsRenderer`.
  // `EmissionEntryForm.js` looks up `module.Step3Renderer` to render the
  // year/monthly data section. Modules can override with a different
  // component for category-specific Step 3 (e.g. multi-employee grid for
  // C7, wizard for CBAM) by assigning to `mod.Step3Renderer` after this.
  const { Step3FrequencyRenderer } = require('./shared/renderers/Step3FrequencyRenderer');
  const attachStep3 = (mod) => {
    if (mod && !mod.Step3Renderer) {
      mod.Step3Renderer = Step3FrequencyRenderer;
    }
  };
  FLAT_FIELD_SCOPE3_CATEGORIES.forEach((id) => attachStep3(categoryRegistry.get(id)));
  attachStep3(categoryRegistry.get('c7'));

  // Registry behavior consumes the same canonical capability resolver as the UI.
  const registryCapabilityNames = {
    subcategory: 'subcategory',
    assetName: 'asset-name',
    journeyLocations: 'journey-locations',
    activityType: 'activity-types',
    multiEmployee: 'multi-employee',
    typeOfProduct: 'type-of-product',
    customerCounterparty: 'customer-counterparty',
    flightDetails: 'flight-details',
    supplierBasisOtherActivity: 'supplier-basis-other-activity',
  };
  [...FLAT_FIELD_SCOPE3_CATEGORIES, 'c7'].forEach((id) => {
    const mod = categoryRegistry.get(id);
    if (!mod) return;
    const caps = new Set(mod.capabilities || []);
    const canonicalCapabilities = resolveGhgCapabilities({
      categoryCode: id,
      scopeCode: 'scope3',
    }).capabilities;
    Object.entries(registryCapabilityNames).forEach(([key, capabilityName]) => {
      if (canonicalCapabilities[key]) caps.add(capabilityName);
    });
    mod.capabilities = Array.from(caps);
    mod.hasCapability = (cap) => mod.capabilities.includes(cap);
  });

  // Attach edit-flow business logic to all flat-field Scope 3 categories
  // via the shared `Scope3FlatEdit` helpers. The factory binds each
  // module's `hasCapability(...)` so payload appends asset_name /
  // journey-locations / etc. automatically per the module's capabilities.
  const { createScope3FlatEditApi } = require('./categories/shared/Scope3FlatEdit');
  const { createScope3FlatCreateApi } = require('./categories/shared/Scope3FlatCreate');
  FLAT_FIELD_SCOPE3_CATEGORIES.forEach((id) => {
    const mod = categoryRegistry.get(id);
    if (!mod) return;
    const editApi = createScope3FlatEditApi(mod);
    mod.validateEditSubmission = editApi.validateEditSubmission;
    mod.buildEditPayload = editApi.buildEditPayload;
    // CREATE-flow (Phase 7l B) — same module exposes both surfaces.
    const createApi = createScope3FlatCreateApi(mod);
    mod.validateCreateSubmission = createApi.validateCreateSubmission;
    mod.buildCreatePayload = createApi.buildCreatePayload;
    mod.extractInputsForCalcEngine = createApi.extractInputsForCalcEngine;
    mod.buildDynamicFieldValues = createApi.buildDynamicFieldValues;
    mod.buildDecisionContext = createApi.buildDecisionContext;
  });

  // Also attach to the GenericScope3 fallback module. This handles
  // biogenic-scope3 edits (where formData.scope === 'biogenic') and any
  // Scope 3 record whose category doesn't match a C1–C15 code.
  const genericScope3 = categoryRegistry.getGenericModule('scope3');
  if (genericScope3) {
    // Generic fallback has no special capabilities — shared helper handles it.
    genericScope3.capabilities = genericScope3.capabilities || [];
    genericScope3.hasCapability =
      genericScope3.hasCapability || ((cap) => genericScope3.capabilities.includes(cap));
    const genericEditApi = createScope3FlatEditApi(genericScope3);
    genericScope3.validateEditSubmission = genericEditApi.validateEditSubmission;
    genericScope3.buildEditPayload = genericEditApi.buildEditPayload;
    // CREATE-flow surface
    const genericCreateApi = createScope3FlatCreateApi(genericScope3);
    genericScope3.validateCreateSubmission = genericCreateApi.validateCreateSubmission;
    genericScope3.buildCreatePayload = genericCreateApi.buildCreatePayload;
    genericScope3.extractInputsForCalcEngine = genericCreateApi.extractInputsForCalcEngine;
    genericScope3.buildDynamicFieldValues = genericCreateApi.buildDynamicFieldValues;
    genericScope3.buildDecisionContext = genericCreateApi.buildDecisionContext;
  }

  // Attach Scope 1 edit-flow business logic to all Scope 1 modules
  // (Stationary Combustion, Mobile Combustion, Fugitive Emissions, generic).
  // The generic Scope 1 module also handles biogenic-scope1 edits as fallback.
  const { createScope1EditApi } = require('./categories/shared/Scope1Edit');
  const { createScope1CreateApi } = require('./categories/shared/Scope1Create');
  const SCOPE1_MODULE_IDS = [
    'stationary_combustion',
    'mobile_combustion',
    'fugitive_emissions',
  ];
  SCOPE1_MODULE_IDS.forEach((id) => {
    const mod = categoryRegistry.get(id);
    if (!mod) return;
    mod.capabilities = mod.capabilities || [];
    mod.hasCapability = mod.hasCapability || ((cap) => mod.capabilities.includes(cap));
    const editApi = createScope1EditApi(mod);
    mod.validateEditSubmission = editApi.validateEditSubmission;
    mod.buildEditPayload = editApi.buildEditPayload;
    const createApi = createScope1CreateApi(mod);
    mod.validateCreateSubmission = createApi.validateCreateSubmission;
    mod.buildCreatePayload = createApi.buildCreatePayload;
    mod.extractInputsForCalcEngine = createApi.extractInputsForCalcEngine;
    mod.buildDynamicFieldValues = createApi.buildDynamicFieldValues;
    mod.buildDecisionContext = createApi.buildDecisionContext;
  });

  // Generic Scope 1 fallback (handles unmatched Scope 1 categories AND biogenic-scope1)
  const genericScope1 = categoryRegistry.getGenericModule('scope1');
  if (genericScope1) {
    genericScope1.capabilities = genericScope1.capabilities || [];
    genericScope1.hasCapability =
      genericScope1.hasCapability || ((cap) => genericScope1.capabilities.includes(cap));
    const genericS1EditApi = createScope1EditApi(genericScope1);
    genericScope1.validateEditSubmission = genericS1EditApi.validateEditSubmission;
    genericScope1.buildEditPayload = genericS1EditApi.buildEditPayload;
    const genericS1CreateApi = createScope1CreateApi(genericScope1);
    genericScope1.validateCreateSubmission = genericS1CreateApi.validateCreateSubmission;
    genericScope1.buildCreatePayload = genericS1CreateApi.buildCreatePayload;
    genericScope1.extractInputsForCalcEngine = genericS1CreateApi.extractInputsForCalcEngine;
    genericScope1.buildDynamicFieldValues = genericS1CreateApi.buildDynamicFieldValues;
    genericScope1.buildDecisionContext = genericS1CreateApi.buildDecisionContext;
  }

  // Generic Scope 2 — same payload shape and validation as Scope 1, so we
  // attach the SAME shared `Scope1Edit` / `Scope1Create` helpers. The helpers
  // already gate `scope1 || scope2` for override-justification semantics.
  const genericScope2 = categoryRegistry.getGenericModule('scope2');
  if (genericScope2) {
    genericScope2.capabilities = genericScope2.capabilities || [];
    genericScope2.hasCapability =
      genericScope2.hasCapability || ((cap) => genericScope2.capabilities.includes(cap));
    const genericS2EditApi = createScope1EditApi(genericScope2);
    genericScope2.validateEditSubmission = genericS2EditApi.validateEditSubmission;
    genericScope2.buildEditPayload = genericS2EditApi.buildEditPayload;
    const genericS2CreateApi = createScope1CreateApi(genericScope2);
    genericScope2.validateCreateSubmission = genericS2CreateApi.validateCreateSubmission;
    genericScope2.buildCreatePayload = genericS2CreateApi.buildCreatePayload;
    genericScope2.extractInputsForCalcEngine = genericS2CreateApi.extractInputsForCalcEngine;
    genericScope2.buildDynamicFieldValues = genericS2CreateApi.buildDynamicFieldValues;
    genericScope2.buildDecisionContext = genericS2CreateApi.buildDecisionContext;
  }

  // Attach Step3Renderer to Scope 1/2 + generic fallback modules too.
  // Same default component — modules may override per-category later.
  SCOPE1_MODULE_IDS.forEach((id) => attachStep3(categoryRegistry.get(id)));
  attachStep3(genericScope1);
  attachStep3(genericScope2);
  attachStep3(genericScope3);

   
  console.log(`[Emissions] Category modules initialized: ${categoryRegistry.size} entries`);

  // Run module contract verification (warn-only — never breaks runtime)
  const { verifyModuleContracts } = require('./core/verifyModuleContracts');
  verifyModuleContracts(categoryRegistry);

  return categoryRegistry.size;
}

/**
 * Module version for debugging
 */
export const MODULE_VERSION = '1.1.0';
