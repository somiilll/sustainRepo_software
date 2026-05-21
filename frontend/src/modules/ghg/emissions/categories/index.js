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

// Scope 3 Categories
// Note: Import modules to auto-register them with the registry
import './scope3/c1-purchased-goods';
import './scope3/c2-capital-goods';
// Future categories will be imported here as they are created:
// import './scope3/c3-fuel-energy';
// import './scope3/c4-transportation';
// import './scope3/c5-waste';
// import './scope3/c6-business-travel';
// import './scope3/c7-employee-commuting';
// etc.

// Re-export specific category modules for direct access
export { default as c1Module } from './scope3/c1-purchased-goods';
export { default as c2Module } from './scope3/c2-capital-goods';

// Scope 1 Categories (to be created)
// import './scope1/stationary-combustion';
// import './scope1/mobile-combustion';
// import './scope1/fugitive-emissions';
// import './scope1/process-emissions';

// Scope 2 Categories (to be created)
// import './scope2/purchased-electricity';
// import './scope2/purchased-energy';
