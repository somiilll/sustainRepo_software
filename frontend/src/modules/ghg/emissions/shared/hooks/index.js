/**
 * Emission Form Hooks - Index
 * 
 * Modular hooks for the EmissionEntryForm component.
 * These hooks help reduce the main component file size while maintaining
 * the same functionality and business logic.
 */

// State management hook
export { useEmissionFormState } from './useEmissionFormState';

// Data fetching effects
export { useEmissionFormEffects } from './useEmissionFormEffects';

// Re-export for convenience
export { default as useEmissionFormStateDefault } from './useEmissionFormState';
export { default as useEmissionFormEffectsDefault } from './useEmissionFormEffects';
