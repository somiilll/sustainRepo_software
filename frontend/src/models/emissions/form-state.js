/**
 * Emission Form State Model
 * Defines form state structure for emission entry
 */

/**
 * Form state for emission entry
 * This is the internal state structure used by EmissionEntryForm
 */

/**
 * Default form state
 */
export const defaultFormState = {
  // Step tracking
  currentStep: 1,
  
  // Basic selection
  facilityId: '',
  scope: 'scope1',
  category: '',
  
  // Fuel/activity selection
  fuelId: '',
  useCustomFuel: false,
  customFuelName: '',
  customEmissionFactor: '',
  customEmissionFactorUnit: 'tCO2/kg',
  customSource: '',
  
  // Scope 3 specific
  scope3Method: '',
  scope3ActivityId: '',
  scope3ActivityType: '',
  scope3Subcategory: '',
  scope3CustomActivity: '',
  useCustomActivity: false,
  
  // Biogenic specific
  biogenicScopeSelection: '',
  
  // Location fields (C4, C6, C9)
  fromLocation: '',
  toLocation: '',
  
  // Asset name (C8, C13, C14, C15)
  assetName: '',
  
  // Reporting period
  reportingYear: new Date().getFullYear(),
  frequency: 'yearly',
  yearType: 'calendar',
  
  // Data entry
  yearlyData: {},
  monthlyData: {},
  
  // C7 specific
  employees: [],
  employeeMonthlyTotals: {},
  employeeYearlyTotal: {},
  
  // Notes and responsible person
  notes: '',
  responsiblePerson: '',
  responsiblePersonDesignation: '',
  responsiblePersonContact: '',
  
  // Evidence
  evidenceFile: null,
  evidenceUrl: '',
  evidenceFileName: '',
  
  // Process templates (Process Emissions)
  selectedProcesses: [],
  processTemplateInputs: {},
  
  // UI state
  isSaving: false,
  isCalculating: false,
  isDirty: false,
  
  // Dynamic form config
  formConfig: null,
  matchedFormula: null,
  inputFields: [],
  
  // Calculation results
  calculationResult: null,
};

/**
 * Create form state with defaults
 * @param {Object} overrides - State overrides
 * @returns {Object} Form state
 */
export const createFormState = (overrides = {}) => ({
  ...defaultFormState,
  ...overrides,
});

/**
 * Reset form state to defaults
 * @param {Object} currentState - Current state
 * @param {Array} fieldsToKeep - Fields to preserve
 * @returns {Object} Reset state
 */
export const resetFormState = (currentState = {}, fieldsToKeep = []) => {
  const preserved = {};
  for (const field of fieldsToKeep) {
    if (currentState[field] !== undefined) {
      preserved[field] = currentState[field];
    }
  }
  return {
    ...defaultFormState,
    ...preserved,
  };
};

/**
 * Check if form has required data for submission
 * @param {Object} state - Form state
 * @returns {boolean}
 */
export const isFormComplete = (state) => {
  // Basic required fields
  if (!state.facilityId || !state.scope || !state.category) {
    return false;
  }
  
  // Reporting period required
  if (!state.reportingYear) {
    return false;
  }
  
  // Data must be entered
  if (state.frequency === 'yearly') {
    const hasYearlyData = Object.values(state.yearlyData || {})
      .some(v => v !== '' && v !== null && v !== undefined);
    return hasYearlyData;
  } else {
    const hasMonthlyData = Object.values(state.monthlyData || {})
      .some(monthData => 
        Object.values(monthData || {}).some(v => v !== '' && v !== null && v !== undefined)
      );
    return hasMonthlyData;
  }
};

export default {
  defaultFormState,
  createFormState,
  resetFormState,
  isFormComplete,
};
