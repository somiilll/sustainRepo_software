import { hydrateEmissionForm } from '../../../../../pages/emissions/utils/hydrateEmissionForm';
import { createEmptyEmissionDraft } from './emissionDraft';

/**
 * Converts the current stored-record shape into the shared form draft. The
 * legacy hydrator remains the compatibility oracle for historical records.
 * No record fields are altered during this conversion.
 */
export const emissionRecordToDraft = (emission, lookups = {}) => {
  const hydrated = hydrateEmissionForm(emission, lookups);
  const draft = createEmptyEmissionDraft(hydrated.formData.scope || 'scope1');

  return {
    ...draft,
    values: hydrated.formData,
    frequencyType: hydrated.frequencyType,
    selectedCategory: hydrated.selectedCategory,
    biogenicScopeSelection: hydrated.biogenicScopeSelection,
    scope3Method: hydrated.scope3Method,
    scope3ActivityId: hydrated.scope3ActivityId,
    scope3ActivityType: hydrated.scope3ActivityType,
    scope3Subcategory: hydrated.scope3Subcategory,
    typeOfProduct: hydrated.typeOfProduct,
    scope3CustomActivity: hydrated.scope3CustomActivity,
    useCustomActivity: hydrated.useCustomActivity,
    processType: hydrated.processType,
    useCustomFuel: Boolean(emission.is_custom_fuel),
    customFuelName: emission.is_custom_fuel
      ? (emission.custom_fuel_name || emission.fuel_type || '')
      : '',
    overrideCalorificValue: hydrated.overrideCalorificValue,
    overrideDensity: hydrated.overrideDensity,
    overrideEmissionFactorHeat: hydrated.overrideEmissionFactorHeat,
    overrideJustification: hydrated.overrideJustification,
    employees: hydrated.employees,
    employeeMonthlyTotals: hydrated.employeeMonthlyTotals,
    employeeYearlyTotal: hydrated.employeeYearlyTotal,
    c7Month: hydrated.editC7Month,
    existingEvidences: hydrated.existingEvidences,
  };
};

/**
 * Converts genuine draft values back to the existing record naming convention.
 * Category payload builders continue to own the final API payload and C7
 * serialization; this adapter deliberately does not invent or omit fields.
 */
export const emissionDraftToRecordValues = (draft) => ({
  ...draft.values,
  frequency_type: draft.frequencyType,
  calculation_method_scope3: draft.scope3Method,
  scope3_ef_id: draft.scope3ActivityId,
  scope3_activity_type: draft.scope3ActivityType,
  type_of_product: draft.typeOfProduct,
  scope3_activity: draft.scope3CustomActivity,
  biogenic_scope_selection: draft.biogenicScopeSelection || null,
  process_type: draft.processType || null,
  is_custom_fuel: draft.useCustomFuel,
  custom_fuel_name: draft.customFuelName,
  dynamic_field_values: draft.dynamicFieldValues,
  employees: draft.employees,
  monthly_totals: draft.employeeMonthlyTotals,
  yearly_total: draft.employeeYearlyTotal,
});
