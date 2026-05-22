/**
 * Shared Emissions Components
 * Reusable components for emission entry forms
 */

// Step and Navigation
export { StepIndicator, DEFAULT_EMISSION_STEPS } from './components/StepIndicator';
export { FormNavigation } from './components/FormNavigation';

// Selectors
export { ScopeSelector, ScopeSelectorDropdown } from './components/ScopeSelector';
export { CategorySelector, CategorySelectorDropdown } from './components/CategorySelector';
export { MethodSelector, MethodSelectorDropdown, MethodSelectorWithDescriptions } from './components/MethodSelector';
export { FacilitySelector } from './components/FacilitySelector';
export { ReportingPeriodSelector, getMonthsByYearType } from './components/ReportingPeriodSelector';
export { ActivityTypeSelector, ActivityTypeButtonGroup, DEFAULT_ACTIVITY_TYPES } from './components/ActivityTypeSelector';

// Form inputs
export { DynamicFieldInput, DynamicFieldGroup } from './components/DynamicFieldInput';
export { NotesSection } from './components/NotesSection';

// Summary/Display
export { EmissionsSummaryCard, MonthlyEmissionsSummary } from './components/EmissionsSummaryCard';
