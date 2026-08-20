/**
 * Shared edit-form domain model.
 *
 * This model intentionally contains only values a user can enter or that are
 * persisted with an emission. Loading, dialog, search, dirty, and calculation
 * presentation state remain outside the draft.
 */

/**
 * @typedef {Object} EmissionDraft
 * @property {Object} values Record-shaped common form values.
 * @property {'monthly'|'yearly'} frequencyType
 * @property {string} selectedCategory
 * @property {string} biogenicScopeSelection
 * @property {string} scope3Method
 * @property {string} scope3ActivityId
 * @property {string} scope3ActivityType
 * @property {string} scope3Subcategory
 * @property {string} typeOfProduct
 * @property {string} scope3CustomActivity
 * @property {boolean} useCustomActivity
 * @property {string} calculationMethodology
 * @property {string} processType
 * @property {boolean} useCustomFuel
 * @property {string} customFuelName
 * @property {Object.<string, *>} dynamicFieldValues
 * @property {boolean} overrideCalorificValue
 * @property {boolean} overrideDensity
 * @property {boolean} overrideEmissionFactorHeat
 * @property {string} overrideJustification
 * @property {Array<Object>} employees
 * @property {Object} employeeMonthlyTotals
 * @property {Object} employeeYearlyTotal
 * @property {string|null} c7Month
 * @property {Array<Object>} existingEvidences
 */

export const createEmptyEmissionValues = (scope = 'scope1') => ({
  facility_id: '',
  reporting_period_start: '',
  reporting_period_end: '',
  scope,
  category: '',
  sub_category: '',
  fuel_id: '',
  fuel_type: '',
  custom_fuel_type: '',
  custom_emission_factor: '',
  quantity: '',
  quantity_unit: 'kg',
  emission_factor_co2: '',
  emission_factor_ch4: '',
  emission_factor_n2o: '',
  emission_factor_basis_quantity: '',
  emission_factor_basis_unit: '',
  calorific_value: '',
  calorific_value_unit: '',
  calorific_value_justification: '',
  density: '',
  density_unit: '',
  density_justification: '',
  emission_factor_heat: '',
  emission_factor_heat_justification: '',
  conversion_factor: '1',
  source_of_information: '',
  record_source: '',
  justification: '',
  notes: '',
  responsible_person: '',
  responsible_person_designation: '',
  responsible_person_contact: '',
  evidence_url: '',
  process_names: [{ name: '', description: '' }],
  process_descriptions: [],
  supplier_name: '',
  supplier_code: '',
  employee_name: '',
  employee_id: '',
  asset_name: '',
  from_location: '',
  to_location: '',
});

/** @returns {EmissionDraft} */
export const createEmptyEmissionDraft = (scope = 'scope1') => ({
  values: createEmptyEmissionValues(scope),
  frequencyType: 'monthly',
  selectedCategory: '',
  biogenicScopeSelection: '',
  scope3Method: '',
  scope3ActivityId: '',
  scope3ActivityType: '',
  scope3Subcategory: '',
  typeOfProduct: '',
  scope3CustomActivity: '',
  useCustomActivity: false,
  calculationMethodology: 'using_heat_basis_ncv',
  processType: '',
  useCustomFuel: false,
  customFuelName: '',
  dynamicFieldValues: {},
  overrideCalorificValue: false,
  overrideDensity: false,
  overrideEmissionFactorHeat: false,
  overrideJustification: '',
  employees: [],
  employeeMonthlyTotals: {},
  employeeYearlyTotal: {},
  c7Month: null,
  existingEvidences: [],
});

/**
 * Applies the legacy `setFormData` calling convention to the draft's form
 * values. This is a compatibility boundary while the edit renderer moves to
 * the shared draft; it does not create a second source of truth.
 */
export const updateDraftValues = (draft, nextValuesOrUpdater) => {
  const nextValues = typeof nextValuesOrUpdater === 'function'
    ? nextValuesOrUpdater(draft.values)
    : nextValuesOrUpdater;
  return { ...draft, values: nextValues };
};

export const updateDraftField = (draft, field, nextValueOrUpdater) => {
  const nextValue = typeof nextValueOrUpdater === 'function'
    ? nextValueOrUpdater(draft[field])
    : nextValueOrUpdater;
  return { ...draft, [field]: nextValue };
};
