/**
 * Emission Categories Index
 * 
 * Central export point for all category modules.
 * Import modules here to register them with the category registry.
 */

// Registry exports
export * from './registry';
export { default as categoryRegistry } from './registry';

// Shared/Base exports
export * from './shared/base-category';

// =====================================================
// Scope 3 Categories - Auto-register with registry
// =====================================================
import './scope3/c1-purchased-goods';
import './scope3/c2-capital-goods';
import './scope3/c3-fuel-energy';
import './scope3/c4-transportation';
import './scope3/c5-waste';
import './scope3/c6-business-travel';
import './scope3/c7-employee-commuting';  // Most complex - multi-employee support
import './scope3/c8-upstream-leased';
import './scope3/c9-downstream-transport';
import './scope3/c10-processing';
import './scope3/c11-use-of-products';
import './scope3/c12-end-of-life';
import './scope3/c13-downstream-leased';
import './scope3/c14-franchises';
import './scope3/c15-investments';

// =====================================================
// Re-export specific category modules for direct access
// =====================================================
export { default as c1Module } from './scope3/c1-purchased-goods';
export { default as c2Module } from './scope3/c2-capital-goods';
export { default as c3Module } from './scope3/c3-fuel-energy';
export { default as c4Module } from './scope3/c4-transportation';
export { default as c5Module } from './scope3/c5-waste';
export { default as c6Module } from './scope3/c6-business-travel';
export { default as c7Module } from './scope3/c7-employee-commuting';
export { default as c8Module } from './scope3/c8-upstream-leased';
export { default as c9Module } from './scope3/c9-downstream-transport';
export { default as c10Module } from './scope3/c10-processing';
export { default as c11Module } from './scope3/c11-use-of-products';
export { default as c12Module } from './scope3/c12-end-of-life';
export { default as c13Module } from './scope3/c13-downstream-leased';
export { default as c14Module } from './scope3/c14-franchises';
export { default as c15Module } from './scope3/c15-investments';

// =====================================================
// Scope 1 Categories (to be created)
// =====================================================
// import './scope1/stationary-combustion';
// import './scope1/mobile-combustion';
// import './scope1/fugitive-emissions';
// import './scope1/process-emissions';

// =====================================================
// Scope 2 Categories (to be created)
// =====================================================
// import './scope2/purchased-electricity';
// import './scope2/purchased-energy';
