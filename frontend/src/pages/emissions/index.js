/**
 * Emissions Module Components - Index
 * 
 * Modular components extracted from the main Emissions.js page.
 */

// Components
export { default as EmissionFilters } from './EmissionFilters';
export { default as EmissionTable } from './EmissionTable';
export { default as EmissionEditDialog } from './EmissionEditDialog';

// Edit Form Sections
export {
  FacilityScopeSection,
  BiogenicScopeSection,
  CategorySection,
  Scope3MethodSection,
  ResponsiblePersonSection,
  ProcessNamesSection,
  NotesSection,
  OverrideSection,
  SubmitButtonSection,
} from './EditFormSections';

// Hooks
export { useEmissionsData } from './useEmissionsData';
export { useEmissionEdit } from './useEmissionEdit';

// Future extractions:
// export { default as EmissionHistoryDialog } from './EmissionHistoryDialog';
// export { default as DeleteConfirmDialog } from './DeleteConfirmDialog';
