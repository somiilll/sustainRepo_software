import React, { useCallback } from 'react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { MonthYearPicker } from './ui/month-year-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { FileUpload } from './ui/file-upload';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import MultiEmployeeInput from './MultiEmployeeInput';
import {
  FacilityScopeSection,
  BiogenicScopeSection,
  SubmitButtonSection,
} from '../pages/emissions/EditFormSections';
import { EditOptionalFields } from '../pages/emissions/EditOptionalFields';
import CustomFuelMonthFields from '../modules/ghg/emissions/shared/components/CustomFuelMonthFields';
import { resolveGhgUiState } from '../modules/ghg/config/resolveGhgUiState';
import {
  getStandardActivityTypeLabel,
  GHG_FIELD_OPTION_KEYS,
  STANDARD_TYPE_OF_PRODUCT_OPTIONS,
} from '../modules/ghg/config/standardGhgFormConfig';
import FlightDetailsSection from './FlightDetailsSection';
import { ColourfulEmissionSummary } from './ColourfulEmissionSummary';
import { CustomFuelLiveCalculation } from './CustomFuelLiveCalculation';
import {
  Trash2,
  Calendar as CalendarIcon,
  Eye,
  Download,
  Search,
  AlertTriangle,
  X,
  Info,
  FileText,
  Car,
  Factory,
  Wind,
  Flame,
  Plane,
  Truck,
  Zap,
  Droplet,
  Calculator,
  Leaf,
  ListFilter,
  MapPin,
} from 'lucide-react';
import { isVolumeUnit as isVolumeUnitShared } from '../pages/emissions/utils/units';
import {
  getUnitDenominator,
  isQuantityField,
  resolveDensityRequirement,
} from '../modules/ghg/emissions/shared/utils/unitHelpers';
import { getCategoryFuelAllowedUnits } from '../modules/ghg/emissions/shared/utils/fuelUnits';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Static help text shown next to specific dynamic field labels in the Edit
// dialog. Keyed by `field.variable` so it matches regardless of label
// phrasing across categories.
const FIELD_HELP = {
  inflation_rate:
    'Adjusts values to match the EF publication year. If left empty, system defaults will apply. Enter 1 to turn off inflation adjustment.',
  ppp:
    'Accounts for country-specific purchasing power differences. If left empty, system defaults will be used. To disable this adjustment, input the USD/INR exchange rate for the reporting period.',
};

// Helper function to download files (kept byte-identical to the legacy
// inline helper in Emissions.js).
const downloadFileHelper = (url, filename) => {
  window.location.href = url;
};

// Local alias used in the JSX below (matches the legacy inline reference).
const isVolumeUnit = isVolumeUnitShared;

const isCvField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /(^|_)(cv|calorific|ncv)(_|$)/i.test(identity)
    || /calorific|\bcv\b|\bncv\b/i.test(field.label || '');
};

const isEfField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /(^|_)(ef|emission_factor)(_|$)/i.test(identity)
    || /emission factor|\bef\b/i.test(field.label || '');
};

const isCarbonContentField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /carbon.*content|composition.*carbon/i.test(identity)
    || /carbon.*content|composition.*carbon/i.test(field.label || '');
};

const hasNumericValue = (value) => (
  value !== undefined
  && value !== null
  && value !== ''
  && Number.isFinite(Number.parseFloat(value))
);

const getCategoryIcon = (category = '') => {
  const normalized = category.toLowerCase();
  if (normalized.includes('mobile')) return Car;
  if (normalized.includes('stationary') || normalized.includes('process')) return Factory;
  if (normalized.includes('fugitive')) return Wind;
  if (normalized.includes('flaring')) return Flame;
  if (normalized.includes('electric') || normalized.includes('energy')) return Zap;
  if (normalized.includes('flight') || normalized.includes('travel')) return Plane;
  if (normalized.includes('transport') || normalized.includes('distribution')) return Truck;
  return Leaf;
};

/**
 * EmissionEditForm — pure view/rendering component for the Edit Emission
 * dialog. All state, refs, effects, memos, and handlers continue to live in
 * the parent (`pages/Emissions.js`) and are passed in via `props`.
 *
 * Phase 3A of the `Emissions.js` refactor: extract the giant edit-form JSX
 * (~1638 lines) out of `Emissions.js` without touching any logic. State
 * migration happens in Phase 3B.
 */
export default function EmissionEditForm(props) {
  const {
    // ---------- shared edit-domain boundary ----------
    draft,
    onDraftChange,
    editingEmission,
    activitySearchTerm,
    loadingScope3EF,
    loadingBiogenicCategories,
    isCalculatingEditEmployee,
    isEditLoading,
    editFormConfigLoading,
    dynamicInputFields,
    effectiveCalculatedEmissions,
    isCalculating,
    isSaving,

    setActivitySearchTerm,

    // ---------- core data ----------
    facilities,
    dynamicScopes,
    hasScope3Access,
    centralizedUnits,
    fuelDatabase,

    // ---------- computed/derived ----------
    selectedFuel,
    isEditC7EmployeeCommuting,
    editActiveMonths,
    ModuleDynamicFieldsRenderer,
    getCategoriesForScope,
    getFuelsForCategory,
    availableScope3Methods,
    availableScope3ActivityTypes,
    capabilities = {},
    fieldOptions = {},
    requiresSubcategory,
    availableSubcategories,
    filteredScope3Activities,
    availableQuantityUnits,

    // ---------- handlers ----------
    handleSubmit,
    handleFuelSelect,
    handleCategorySelect,
    markFormDirty,
    updateDynamicFieldValue,
    getMethodLabel,
    handleCalculateEditEmployeeMonth,
    handleFileUpload,
    handleRemoveEvidence,
    handleDeleteExistingEvidence,
    handleDeleteAllEvidences,
    handleDialogChange,

    // Optional props for approval mode
    hideSubmitButton = false,
    assignedReportingPeriod = null,
    showAssignedReportingPeriodMessage = true,
    readOnly = false,
    readOnlyEvidenceContent = null,
  } = props;

  const setDraftField = useCallback((field, valueOrUpdater) => {
    onDraftChange((currentDraft) => ({
      ...currentDraft,
      [field]: typeof valueOrUpdater === 'function'
        ? valueOrUpdater(currentDraft[field])
        : valueOrUpdater,
    }));
  }, [onDraftChange]);
  const setFormData = useCallback((valuesOrUpdater) => {
    onDraftChange((currentDraft) => ({
      ...currentDraft,
      values: typeof valuesOrUpdater === 'function'
        ? valuesOrUpdater(currentDraft.values)
        : valuesOrUpdater,
    }));
  }, [onDraftChange]);

  const formData = draft.values;
  const editFrequencyType = draft.frequencyType;
  const biogenicScopeSelection = draft.biogenicScopeSelection;
  const selectedCategory = draft.selectedCategory;
  const scope3Method = draft.scope3Method;
  const spendCurrencyConversionMethod = draft.spendCurrencyConversionMethod || 'ppp_inflation';
  const scope3ActivityType = draft.scope3ActivityType;
  const scope3Subcategory = draft.scope3Subcategory;
  const scope3ActivityId = draft.scope3ActivityId;
  const scope3CustomActivity = draft.scope3CustomActivity;
  const useCustomActivity = draft.useCustomActivity;
  const typeOfProduct = draft.typeOfProduct;
  const editCalcMethodology = draft.calculationMethodology;
  const editProcessType = draft.processType;
  const editUseCustomFuel = draft.useCustomFuel;
  const editCustomFuelName = draft.customFuelName;
  const editEmployees = draft.employees;
  const editEmployeeMonthlyTotals = draft.employeeMonthlyTotals;
  const editEmployeeYearlyTotal = draft.employeeYearlyTotal;
  const dynamicFieldValues = draft.dynamicFieldValues;
  const existingEvidences = draft.existingEvidences;
  const overrideCalorificValue = draft.overrideCalorificValue;
  const overrideDensity = draft.overrideDensity;
  const overrideEmissionFactorHeat = draft.overrideEmissionFactorHeat;
  const overrideJustification = draft.overrideJustification;
  const setBiogenicScopeSelection = (value) => setDraftField('biogenicScopeSelection', value);
  const setScope3Method = (value) => setDraftField('scope3Method', value);
  const setSpendCurrencyConversionMethod = (value) => setDraftField('spendCurrencyConversionMethod', value);
  const setScope3ActivityType = (value) => setDraftField('scope3ActivityType', value);
  const setScope3ActivityId = (value) => setDraftField('scope3ActivityId', value);
  const setScope3Subcategory = (value) => setDraftField('scope3Subcategory', value);
  const setScope3CustomActivity = (value) => setDraftField('scope3CustomActivity', value);
  const setUseCustomActivity = (value) => setDraftField('useCustomActivity', value);
  const setEditUseCustomFuel = (value) => setDraftField('useCustomFuel', value);
  const setEditCustomFuelName = (value) => setDraftField('customFuelName', value);
  const setTypeOfProduct = (value) => setDraftField('typeOfProduct', value);
  const setEditCalcMethodology = (value) => setDraftField('calculationMethodology', value);
  const setEditProcessType = (value) => setDraftField('processType', value);
  const setDynamicFieldValues = (value) => setDraftField('dynamicFieldValues', value);
  const setEditEmployees = (value) => setDraftField('employees', value);
  const setOverrideCalorificValue = (value) => setDraftField('overrideCalorificValue', value);
  const setOverrideDensity = (value) => setDraftField('overrideDensity', value);
  const setOverrideJustification = (value) => setDraftField('overrideJustification', value);

  const ghgUiState = resolveGhgUiState({
    capabilities,
    scope: formData.scope,
    biogenicScopeSelection,
    processType: editProcessType,
    scope3ActivityType,
    scope3Method,
    requiresSubcategory,
    scope3Subcategory,
    frequencyType: editFrequencyType,
    hasCategory: Boolean(selectedCategory || formData.category),
  });
  const CategoryIcon = getCategoryIcon(selectedCategory || formData.category);
  const isProcessEmission = Boolean(capabilities.processType)
    || (formData.category || selectedCategory || '').toLowerCase().includes('process');
  const hasConfiguredDensityField = dynamicInputFields.some((field) => field.variable === 'density');
  const virtualDensityQuantityField = dynamicInputFields.find(isQuantityField);
  const virtualDensityReferenceField = editCalcMethodology === 'using_heat_basis_ncv'
    ? dynamicInputFields.find(isCvField)
    : editCalcMethodology === 'using_qty_basis_ef'
      ? dynamicInputFields.find(isEfField)
      : dynamicInputFields.find(isCarbonContentField);
  const getSavedFieldValue = (field) => (
    dynamicFieldValues[field?.variable]
    ?? editingEmission?.dynamic_field_values?.[field?.variable]?.value
  );
  const getSavedFieldUnit = (field) => (
    dynamicFieldValues[`${field?.variable}_unit`]
    || editingEmission?.dynamic_field_values?.[field?.variable]?.unit
    || field?.expectedUnit
    || ''
  );
  const virtualDensityRequirement = resolveDensityRequirement({
    quantityUnit: getSavedFieldUnit(virtualDensityQuantityField),
    referenceUnit: editCalcMethodology === 'using_carbon_composition'
      ? 'kg'
      : getUnitDenominator(getSavedFieldUnit(virtualDensityReferenceField)),
    centralizedUnits,
  });
  // A configured Density field renders in the standard grid. For formulas
  // that resolve Carbon Composition from a volume quantity, expose the same
  // runtime conversion input for Process, Stationary, and Mobile Combustion.
  // Custom Fuel owns this input through CustomFuelMonthFields.
  const showVirtualProcessDensity = !editUseCustomFuel
    && (isProcessEmission || editCalcMethodology === 'using_carbon_composition')
    && !hasConfiguredDensityField
    && hasNumericValue(getSavedFieldValue(virtualDensityQuantityField))
    && hasNumericValue(getSavedFieldValue(virtualDensityReferenceField))
    && virtualDensityRequirement.required;
  const savedVirtualDensity = dynamicFieldValues.density
    ?? editingEmission?.dynamic_field_values?.density?.value
    ?? '';
  const customFuelQuantityUnits = fieldOptions[GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QUANTITY_UNIT] || [];
  const isFugitiveCustomFuel = editUseCustomFuel
    && (formData.category || selectedCategory || '').toLowerCase().includes('fugitive');
  const customFugitiveQuantityUnits = isFugitiveCustomFuel
    ? getCategoryFuelAllowedUnits({
      fuelDatabase,
      scope: formData.scope,
      categoryName: formData.category || selectedCategory,
    })
    : [];

  // ─────────────────────────────────────────────────────────────────────
  // Data-based loading gate for C7 Employee Commuting (has deeply nested
  // employee data). Lifted verbatim from the legacy inline IIFE in
  // pages/Emissions.js.
  // ─────────────────────────────────────────────────────────────────────
  // For C7, check that employees are populated with valid data
  const isC7DataReady =
    !isEditC7EmployeeCommuting || (editEmployees.length > 0 && editEmployees[0]?.id);

  // Show loading if explicitly loading OR if C7 data isn't ready yet
  if (isEditLoading || !isC7DataReady) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-gray-500">Loading emission data...</p>
      </div>
    );
  }

  return (
                <form onSubmit={readOnly ? (event) => event.preventDefault() : handleSubmit} className="space-y-5" data-testid="emission-form">
                {readOnly && <p className="sr-only" data-testid="emission-form-read-only-status">This emission record is read-only.</p>}
                <fieldset disabled={readOnly} className="min-w-0 space-y-5 disabled:opacity-100" data-testid={readOnly ? "emission-form-read-only-fields" : undefined}>
                <section className="space-y-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="edit-form-inputs-section">
                {/* Facility and Scope Selection - Extracted Component */}
                <FacilityScopeSection
                  formData={formData}
                  setFormData={setFormData}
                  facilities={facilities}
                  dynamicScopes={dynamicScopes}
                  hasScope3Access={hasScope3Access}
                  handleFuelSelect={handleFuelSelect}
                  setBiogenicScopeSelection={setBiogenicScopeSelection}
                  markFormDirty={markFormDirty}
                  readOnly={readOnly}
                  reportingPeriod={(
                    <div className="w-full min-w-[15rem] space-y-1.5" data-testid="edit-reporting-period-field">
                      {editFrequencyType === 'yearly' || assignedReportingPeriod ? (
                        <>
                          <Label>{editFrequencyType === 'yearly' ? 'Reporting Year' : 'Reporting Month'}</Label>
                          <div className="flex items-center h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-stone-800 font-medium" data-testid="edit-reporting-year-display">
                            <CalendarIcon className="mr-2 h-4 w-4 text-emerald-600" />
                            {editingEmission.reporting_period || 'N/A'}
                          </div>
                          {assignedReportingPeriod && showAssignedReportingPeriodMessage && <p className="text-xs text-emerald-700" data-testid="supplier-edit-assigned-reporting-period-message">Assigned by your customer: {assignedReportingPeriod.reporting_period}</p>}
                        </>
                      ) : (
                        <>
                          <Label htmlFor="reporting_period_start">Reporting Month *</Label>
                          <MonthYearPicker
                            id="reporting_period_start"
                            value={formData.reporting_period_start}
                            disableFuture={true}
                            onChange={(val) => {
                              setFormData((previous) => ({
                                ...previous,
                                reporting_period_start: val,
                                reporting_period_end: val,
                              }));
                            }}
                            placeholder="Select month"
                            className="bg-stone-50 [&>svg]:text-emerald-600"
                            data-testid="edit-reporting-month-picker"
                          />
                        </>
                      )}
                    </div>
                  )}
                />
                
                {/* Biogenic Scope Selection - Extracted Component */}
                <BiogenicScopeSection
                  formData={formData}
                  setFormData={setFormData}
                  biogenicScopeSelection={biogenicScopeSelection}
                  setBiogenicScopeSelection={setBiogenicScopeSelection}
                  hasScope3Access={hasScope3Access}
                  handleFuelSelect={handleFuelSelect}
                  loadingBiogenicCategories={loadingBiogenicCategories}
                />

                
                {/* Fuel Selection - Step 1: Category, Step 2: Fuel */}
                <div className="space-y-3">
                  {/* Show prompt for facility selection */}
                  {!formData.facility_id ? (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">
                        <strong>Please select a facility first</strong> to see available fuel categories and types.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Category and Fuel Selection */}
                      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {/* Step 1: Category Selection */}
                        <div className="space-y-1.5">
                          <Label htmlFor="category_select">Select Category *</Label>
                          <div className="relative">
                            <CategoryIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden="true" />
                            {readOnly ? <div role="textbox" aria-readonly="true" className="flex h-10 w-full items-center rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10 text-sm text-stone-800" data-testid="category-select">{selectedCategory || '—'}</div> : <select
                              id="category_select"
                              value={selectedCategory}
                              onChange={(e) => handleCategorySelect(e.target.value)}
                              required
                              className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10"
                              data-testid="category-select"
                            >
                              <option value="">Select category...</option>
                              {getCategoriesForScope.map(category => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>}
                          </div>
                        </div>
                        
                        {/* Step 2: For Scope 3 - Method and Activity; for Process Emissions no fuel is needed. */}
                        {/* Also handle Biogenic with Scope 3 selection */}
                        {(formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                          <>
                            {/* Scope 3: Calculation Method */}
                            <div className="space-y-1.5">
                              <Label htmlFor="scope3_method_select">Calculation Method *</Label>
                              <div className="relative">
                                <Calculator className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" aria-hidden="true" />
                                <select
                                  id="scope3_method_select"
                                  value={scope3Method}
                                  onChange={(e) => {
                                    const newMethod = e.target.value;
                                    setScope3Method(newMethod);
                                    setScope3ActivityType('');
                                    setScope3Subcategory('');
                                    setTypeOfProduct('');
                                    setScope3ActivityId('');
                                    setDynamicFieldValues({});
                                    markFormDirty();
                                  }}
                                  required
                                  disabled={!selectedCategory}
                                  className={`h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10 ${!selectedCategory ? 'cursor-not-allowed opacity-50' : ''}`}
                                  data-testid="scope3-method-select"
                                >
                                  <option value="">{selectedCategory ? 'Select method...' : 'Select category first'}</option>
                                  {availableScope3Methods.map(method => (
                                    <option key={method} value={method}>
                                      {getMethodLabel(method)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {selectedCategory && availableScope3Methods.length === 0 && !loadingScope3EF && (
                                <p className="text-xs text-amber-600">No methods available for this category</p>
                              )}
                            </div>
                            {scope3Method === 'spend_basis' && (
                              <div className="space-y-1.5" data-testid="edit-scope3-currency-conversion-method-section">
                                <Label htmlFor="edit-scope3-currency-conversion-method-select">Currency Conversion Method *</Label>
                                <select
                                  id="edit-scope3-currency-conversion-method-select"
                                  value={spendCurrencyConversionMethod}
                                  onChange={(event) => {
                                    setSpendCurrencyConversionMethod(event.target.value);
                                    setDynamicFieldValues({});
                                    markFormDirty();
                                  }}
                                  className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3"
                                  data-testid="edit-scope3-currency-conversion-method-select"
                                >
                                  <option value="standard">Standard Currency Conversion</option>
                                  <option value="ppp_inflation">PPP and Inflation Rate</option>
                                </select>
                              </div>
                            )}
                            {availableScope3ActivityTypes.length > 0 && (
                              <div className="space-y-1.5" data-testid="scope3-activity-type-section">
                                <Label htmlFor="scope3_activity_type_filter">Activity Type *</Label>
                                <div className="relative">
                                  <ListFilter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden="true" />
                                  <select
                                    id="scope3_activity_type_filter"
                                    value={scope3ActivityType}
                                    onChange={(e) => {
                                      const newActivityType = e.target.value;
                                      setScope3ActivityType(newActivityType);
                                      setScope3ActivityId('');
                                      setActivitySearchTerm('');
                                      setDynamicFieldValues({});
                                    }}
                                    required
                                    className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10"
                                    data-testid="scope3-activity-type-filter"
                                  >
                                    <option value="">Select activity type...</option>
                                    {(() => {
                                      const allTypes = new Set(availableScope3ActivityTypes);
                                      if (scope3ActivityType && !allTypes.has(scope3ActivityType)) allTypes.add(scope3ActivityType);
                                      return Array.from(allTypes).sort();
                                    })().map(type => <option key={type} value={type}>{getStandardActivityTypeLabel(type)}</option>)}
                                  </select>
                                </div>
                              </div>
                            )}
                          </>
                        ) : !ghgUiState.showFuelSelection ? null : (
                          <div className="relative space-y-1.5">
                            {/* Custom Fuel toggle - only for Stationary, Mobile, Fugitive, Flaring */}
                            <Label htmlFor="fuel_select" className="whitespace-nowrap">Select Fuel Type *</Label>
                            {ghgUiState.showCustomFuel && (
                              <label className="absolute right-0 top-0 flex items-center gap-1.5 cursor-pointer">
                                <Flame className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                                <input
                                  type="checkbox"
                                  checked={editUseCustomFuel}
                                  onChange={(e) => {
                                    setEditUseCustomFuel(e.target.checked);
                                    if (e.target.checked) {
                                      setFormData(prev => ({ ...prev, fuel_id: '' }));
                                    } else {
                                      setEditCustomFuelName('');
                                    }
                                    markFormDirty();
                                  }}
                                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                  data-testid="edit-use-custom-fuel-toggle"
                                />
                                <span className="text-xs text-amber-700 font-medium">Use Custom Fuel</span>
                              </label>
                            )}
                            
                            {!editUseCustomFuel ? (
                              <div className="relative mt-1.5">
                                <Droplet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" aria-hidden="true" />
                                {readOnly ? <div role="textbox" aria-readonly="true" className="flex h-10 w-full items-center rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10 text-sm text-stone-800" data-testid="fuel-select">{selectedFuel?.fuel_name || formData.fuel_type || '—'}</div> : <select
                                  id="fuel_select"
                                  value={formData.fuel_id}
                                  onChange={(e) => handleFuelSelect(e.target.value)}
                                  required
                                  disabled={!selectedCategory}
                                  className={`h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10 ${!selectedCategory ? 'cursor-not-allowed opacity-50' : ''}`}
                                  data-testid="fuel-select"
                                >
                                  <option value="">{selectedCategory ? 'Select fuel...' : 'Select category first'}</option>
                                  {getFuelsForCategory.map(fuel => (
                                    <option key={fuel.id} value={fuel.id}>
                                      {fuel.fuel_name}
                                    </option>
                                  ))}
                                </select>}
                              </div>
                            ) : (
                              <div className="space-y-2 border-l-2 border-amber-300 pl-3" data-testid="edit-custom-fuel-section">
                                <div className="flex items-center gap-2">
                                  <Flame className="h-4 w-4 text-amber-600" aria-hidden="true" />
                                  <Label htmlFor="edit-custom-fuel-name-input">Fuel Name <span className="text-red-500">*</span></Label>
                                  <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800" data-testid="edit-custom-fuel-badge">
                                    Custom fuel
                                  </span>
                                </div>
                                <div>
                                  <Input
                                    id="edit-custom-fuel-name-input"
                                    value={editCustomFuelName}
                                    onChange={(e) => {
                                      setEditCustomFuelName(e.target.value);
                                      markFormDirty();
                                    }}
                                    placeholder="Enter fuel name"
                                    className="bg-white"
                                    data-testid="edit-custom-fuel-name-input"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      {/* Process Type - For Process Emissions (Scope 1) */}
                      {ghgUiState.showProcessType && (
                        <div className="space-y-1.5" data-testid="edit-process-type-section">
                          <Label>Process Type <span className="text-red-500">*</span></Label>
                          <Select
                            value={editProcessType || ''}
                            onValueChange={(v) => {
                              setEditProcessType(v);
                              setEditCalcMethodology('using_heat_basis_ncv');
                              markFormDirty();
                            }}
                          >
                            <SelectTrigger className="bg-stone-50 h-10" data-testid="edit-process-type-select">
                              <SelectValue placeholder="Select process type" />
                            </SelectTrigger>
                            <SelectContent>
                              {ghgUiState.renderableProcessTypeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Calculation Methodology - For Stationary/Mobile/Flaring OR Process Emissions with venting */}
                      {ghgUiState.showCalculationMethodology && (
                        <div className="space-y-1.5" data-testid="edit-calculation-methodology-section">
                          <Label>Calculation Methodology</Label>
                          <Select
                            value={editCalcMethodology || 'using_heat_basis_ncv'}
                            onValueChange={(v) => {
                              setEditCalcMethodology(v);
                              markFormDirty();
                            }}
                          >
                            <div className="relative">
                              <Calculator className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-blue-600" aria-hidden="true" />
                              <SelectTrigger className="h-10 bg-stone-50 pl-10" data-testid="edit-calculation-methodology-select">
                                <SelectValue placeholder="Select methodology" />
                              </SelectTrigger>
                            </div>
                            <SelectContent>
                              <SelectItem value="using_heat_basis_ncv">Using Heat Basis (NCV)</SelectItem>
                              <SelectItem value="using_qty_basis_ef">Using Qty Basis EF</SelectItem>
                              <SelectItem value="using_carbon_composition">Using Composition of Carbon</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      </div>

                      {/* Scope 3: Activity (Step 3) - Also handle Biogenic Scope 3 */}
                      {(formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) && scope3Method && (
                        <div className="space-y-3">
                          {/* Subcategory Filter (for C8/C10/C11/C13/C14) */}
                          {requiresSubcategory && availableSubcategories.length > 0 && (
                            <div className="space-y-1.5">
                              <Label htmlFor="scope3_subcategory_filter">Subcategory *</Label>
                              <select
                                id="scope3_subcategory_filter"
                                value={scope3Subcategory}
                                onChange={(e) => {
                                  setScope3Subcategory(e.target.value);
                                  setScope3ActivityId(''); // Reset activity when subcategory changes
                                  setActivitySearchTerm(''); // Clear activity search
                                  setTypeOfProduct(''); // Reset C11 type_of_product
                                }}
                                required
                                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                                data-testid="scope3-subcategory-filter"
                              >
                                <option value="">Select subcategory...</option>
                                {availableSubcategories.map(sub => (
                                  <option key={sub.value} value={sub.value}>
                                    {sub.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* C11 Type of Product (only for activity_basis) */}
                          {(() => {
                            if (!ghgUiState.showTypeOfProduct) return null;
                            return (
                              <div className="space-y-1.5">
                                <Label htmlFor="scope3_type_of_product_filter">Type of Product *</Label>
                                <select
                                  id="scope3_type_of_product_filter"
                                  value={typeOfProduct || ''}
                                  onChange={(e) => {
                                    setTypeOfProduct(e.target.value);
                                    setScope3ActivityId('');
                                    setActivitySearchTerm('');
                                  }}
                                  required
                                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                                  data-testid="scope3-type-of-product-filter"
                                >
                                  <option value="">Select type of product...</option>
                                  {STANDARD_TYPE_OF_PRODUCT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()}
                          
                          {/* Activity Selection */}
                          <div className="space-y-1.5" data-testid="scope3-activity-section">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="scope3_activity_select">Activity *</Label>
                              {/* Toggle for custom activity - available for supplier_basis (Scope 3 and Biogenic Scope 3) */}
                              {scope3Method === 'supplier_basis' && (formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) && (
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={useCustomActivity}
                                    onChange={(e) => {
                                      setUseCustomActivity(e.target.checked);
                                      setActivitySearchTerm(''); // Clear activity search
                                      if (e.target.checked) {
                                        setScope3ActivityId('');
                                      } else {
                                        setScope3CustomActivity('');
                                      }
                                    }}
                                    className="rounded border-stone-300"
                                  />
                                  <span className="text-text-secondary">Use Custom Activity</span>
                                </label>
                              )}
                            </div>
                          
                            {/* For supplier_basis with custom activity toggle ON: Show text field */}
                            {scope3Method === 'supplier_basis' && useCustomActivity && (formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                              <div className="space-y-1.5">
                                <Input
                                  type="text"
                                  value={scope3CustomActivity}
                                  onChange={(e) => setScope3CustomActivity(e.target.value)}
                                  placeholder="Enter custom activity name..."
                                  className="bg-stone-50 h-10"
                                  data-testid="scope3-custom-activity-input"
                                />
                                <p className="text-xs text-text-muted">
                                  Enter a custom activity name describing the emission source
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {/* Activity search input */}
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                  <Input
                                    type="text"
                                    value={activitySearchTerm}
                                    onChange={(e) => setActivitySearchTerm(e.target.value)}
                                    placeholder="Search activities..."
                                    className="pl-9 bg-stone-50 h-10"
                                    data-testid="edit-activity-search-input"
                                    disabled={!scope3Method || (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)}
                                  />
                                  {activitySearchTerm && (
                                    <button
                                      type="button"
                                      onClick={() => setActivitySearchTerm('')}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                                
                                {/* Activity selection dropdown */}
                                <div className="relative">
                                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden="true" />
                                  <select
                                    id="scope3_activity_select"
                                    value={scope3ActivityId}
                                    onChange={(e) => { setScope3ActivityId(e.target.value); setActivitySearchTerm(''); markFormDirty(); }}
                                    required
                                    disabled={!scope3Method || (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)}
                                    className={`h-10 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 pl-10 ${(!scope3Method || (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)) ? 'cursor-not-allowed opacity-50' : ''}`}
                                    data-testid="scope3-activity-select"
                                  >
                                    <option value="">
                                      {!scope3Method ? 'Select method first' :
                                       (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) ? 'Select activity type first' :
                                       (requiresSubcategory && !scope3Subcategory) ? 'Select subcategory first' :
                                       `Select activity (${filteredScope3Activities.filter(a => !activitySearchTerm || a.activity?.toLowerCase().includes(activitySearchTerm.toLowerCase())).length} available)...`}
                                    </option>
                                    {filteredScope3Activities.filter(a => !activitySearchTerm || a.activity?.toLowerCase().includes(activitySearchTerm.toLowerCase())).map(ef => <option key={ef.id} value={ef.id}>{ef.activity}</option>)}
                                  </select>
                                </div>
                                {/* No match indicator */}
                                {activitySearchTerm && filteredScope3Activities.filter(a => a.activity?.toLowerCase().includes(activitySearchTerm.toLowerCase())).length === 0 && (
                                  <p className="text-xs text-amber-600">No activities match &quot;{activitySearchTerm}&quot;</p>
                                )}
                              </div>
                            )}
                            {/* Activity loading indicator only - no error message shown to users */}
                            {loadingScope3EF && (
                              <p className="text-xs text-blue-600 mt-1">Loading activities...</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Asset Name for C8/C13/C14/C15 (Leased Assets, Franchises, Investments) */}
                      {/* Asset Name section — driven by module capability 'asset-name' (C8/C13/C14/C15) */}
                      {formData.scope === 'scope3' && capabilities.assetName && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <h4 className="font-medium mb-2 text-amber-800 text-sm">Asset Information</h4>
                          <div className="space-y-1.5">
                            <Label htmlFor="asset_name" className="text-xs">Asset Name *</Label>
                            <Input
                              id="asset_name"
                              value={formData.asset_name}
                              onChange={(e) => setFormData({ ...formData, asset_name: e.target.value })}
                              placeholder="Enter asset name or identifier..."
                              className="bg-white h-9"
                              data-testid="edit-asset-name-input"
                            />
                            <p className="text-xs text-amber-600">Name or identifier of the leased asset, franchise, or investment</p>
                          </div>
                        </div>
                      )}

                      {ghgUiState.showFlightDetails && (
                        <FlightDetailsSection
                          monthKey={editFrequencyType === 'yearly' ? 'yearly' : (formData.reporting_period_start || 'edit')}
                          data={formData}
                          updateMonthData={(_, field, value) => {
                            setFormData((previous) => ({ ...previous, [field]: value }));
                            if (field === 'km_travelled') updateDynamicFieldValue('km_travelled', value);
                            markFormDirty?.();
                          }}
                        />
                      )}
                  
                    </>
                  )}
                </div>

                {/* Quantity Input and Person Responsible - Same Row */}
                {/* DYNAMIC INPUT FIELDS - When form config is loaded */}
                
                {/* Multi-Employee Input for C7 Employee Commuting Edit */}
                {isEditC7EmployeeCommuting && editingEmission && (
                  <div className="space-y-4 border-t pt-4">
                    <MultiEmployeeInput
                      key={`employees-${editingEmission?.id}-${editEmployees.map(e => e.id).join('-')}`}
                      entityLabel="Employee"
                      fields={dynamicInputFields.length > 0 ? dynamicInputFields.map(f => ({
                        variable: f.variable,
                        label: f.label,
                        type: f.fieldType,
                        unit: f.expectedUnit || f.unit || '',
                        required: f.required,
                        placeholder: f.placeholder,
                      })) : [
                        // Fallback fields when dynamicInputFields is empty
                        { variable: 'km_travelled', label: 'Distance Travelled', type: 'number', unit: 'km', required: true },
                      ]}
                      selectedActivityType={scope3ActivityType}
                      calculationMethod={scope3Method}
                      employees={editEmployees}
                      onEmployeesChange={setEditEmployees}
                      activeMonths={editActiveMonths}
                      onCalculateEmployee={handleCalculateEditEmployeeMonth}
                      monthlyTotals={editEmployeeMonthlyTotals}
                      yearlyTotal={editEmployeeYearlyTotal}
                      isCalculating={isCalculatingEditEmployee}
                      disabled={false}
                      isEditMode={true}
                      frequencyType={editFrequencyType}
                    />
                  </div>
                )}
                
                {/* Regular Input Fields - Hide for C7 Employee Commuting */}
                {!isEditC7EmployeeCommuting && editFormConfigLoading ? (
                  /* Show loading state while fetching form config - prevents legacy form flash */
                  <div className="flex items-center justify-center p-8">
                    <div className="flex items-center gap-3 text-stone-500">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Loading form configuration...</span>
                    </div>
                  </div>
                ) : !isEditC7EmployeeCommuting && dynamicInputFields.length > 0 ? (
                  /* Pluggable category renderer (PoC: C1 routes through registry). */
                  ModuleDynamicFieldsRenderer ? (
                    <ModuleDynamicFieldsRenderer
                      dynamicInputFields={dynamicInputFields}
                      dynamicFieldValues={dynamicFieldValues}
                      updateDynamicFieldValue={updateDynamicFieldValue}
                      formData={formData}
                      setFormData={setFormData}
                      scope3Method={scope3Method}
                      selectedFuel={selectedFuel}
                      requiresSubcategory={requiresSubcategory}
                      scope3ActivityId={scope3ActivityId}
                      filteredScope3Activities={filteredScope3Activities}
                      centralizedUnits={centralizedUnits}
                      markFormDirty={markFormDirty}
                    />
                  ) : (
                  <div className="space-y-4">
                    {/* Supplier Method Disclaimer - Only for Scope 3 with supplier_basis */}
                    {formData.scope === 'scope3' && scope3Method === 'supplier_basis' && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the &quot;Quantity Used&quot; field.
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {dynamicInputFields.map(field => {
                        const isQtyField = isQuantityField(field);
                        const isFugitiveGwpField = isFugitiveCustomFuel && field.variable === 'co2_gwp_fugitives';
                        const showCustomFuelQuantityUnit = editUseCustomFuel && isQtyField;
                        const hideStandardQuantityUnit = false;
                        
                        // Get the currently saved unit for this field
                        const savedUnit = (showCustomFuelQuantityUnit && dynamicFieldValues.custom_qty_unit)
                          || dynamicFieldValues[`${field.variable}_unit`]
                          || (field.variable === 'density' ? formData.density_unit : '')
                          || '';
                        const savedDensityValue = field.variable === 'density'
                          ? dynamicFieldValues.density ?? formData.density ?? editingEmission?.dynamic_field_values?.density?.value
                          : undefined;
                        const overrideKey = `override_${field.variable}`;
                        const isOverrideEnabled = isFugitiveGwpField
                          || dynamicFieldValues[overrideKey] === true
                          || (
                            !readOnly
                            &&
                            field.variable === 'density'
                            && dynamicFieldValues[overrideKey] === undefined
                            && savedDensityValue !== undefined
                            && savedDensityValue !== null
                            && savedDensityValue !== ''
                          );
                        
                        // Determine field units based on unit_source
                        let fieldUnits = [];
                        if (field.unitSource === 'fuel') {
                          // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
                          if (formData.scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
                            const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                            fieldUnits = matchedActivity?.allowed_units || [];
                          } else {
                            fieldUnits = selectedFuel?.allowed_units || [];
                          }
                        } else if (field.unitSource === 'all_units') {
                          // Show all units from centralized units list
                          fieldUnits = centralizedUnits.map(u => u.symbol);
                          
                          // For emission_factor_supplier_based with supplier_basis method,
                          // only show units with tCO2e or tCO2 in numerator
                          if (field.variable === 'emission_factor_supplier_based' && scope3Method === 'supplier_basis') {
                            fieldUnits = fieldUnits.filter(u => {
                              const upperUnit = u.toUpperCase();
                              // Check if the unit starts with tCO2e or tCO2 (in numerator)
                              return upperUnit.startsWith('TCO2E') || upperUnit.startsWith('TCO2');
                            });
                          }
                        } else if (field.unitSource === 'scope3_ef') {
                          // For scope3_ef: Priority 1: scope3_ef.allowed_units, Priority 2: field mapping, Priority 3: formula expected_unit
                          const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                          if (matchedEF?.allowed_units?.length > 0) {
                            fieldUnits = matchedEF.allowed_units;
                          } else if (field.allowedUnits?.length > 0) {
                            fieldUnits = field.allowedUnits;
                          } else if (field.expectedUnit) {
                            fieldUnits = [field.expectedUnit];
                          } else {
                            fieldUnits = [];
                          }
                        } else {
                          // static - use allowed_units from mapping
                          fieldUnits = field.allowedUnits.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
                        }

                        // Compound unit: suffix every option with "/<linked unit>".
                        // Read the linked field's `_unit` from dynamicFieldValues first
                        // (live edits), then fall back to the saved record so the
                        // suffix is applied even before the loader hydrates form state.
                        if (field.compoundWithVariable) {
                          const linkedVar = field.compoundWithVariable;
                          let linkedUnitRaw = dynamicFieldValues[`${linkedVar}_unit`];
                          if (!linkedUnitRaw && editingEmission?.dynamic_field_values?.[linkedVar]) {
                            linkedUnitRaw = editingEmission.dynamic_field_values[linkedVar]?.unit;
                          }
                          const linkedUnit = (typeof linkedUnitRaw === 'object' ? linkedUnitRaw?.value : linkedUnitRaw) || '';
                          if (linkedUnit && typeof linkedUnit === 'string' && linkedUnit.trim()) {
                            const suffix = linkedUnit.trim();
                            fieldUnits = fieldUnits.map(u => u.includes('/') ? u : `${u}/${suffix}`);
                          }
                        }
                        
                        // Ensure the saved unit is included in fieldUnits (for edit mode)
                        // NOTE: This must happen AFTER compound suffix is applied to avoid duplicates
                        if (savedUnit && !fieldUnits.includes(savedUnit)) {
                          fieldUnits = [savedUnit, ...fieldUnits];
                        }

                        // Unitless count fields - admin-driven via unit_source === 'none'.
                        const isUnitlessCountField = field.unitSource === 'none';

                        const unitSelectorOptions = showCustomFuelQuantityUnit
                          ? (isFugitiveCustomFuel && customFugitiveQuantityUnits.length > 0
                            ? customFugitiveQuantityUnits
                            : customFuelQuantityUnits)
                          : fieldUnits;
                        const showUnitSelector = !isUnitlessCountField
                          && field.unitSource !== 'text'
                          && unitSelectorOptions.length > 0;
                        // Freeform text unit input — admin set unit_source = 'text'
                        const showUnitTextInput = !hideStandardQuantityUnit && !isUnitlessCountField && field.unitSource === 'text' && !field.variable?.endsWith('_unit');
                        
                        // For supplier_basis method with supplier-based fields, use text input for units
                        const isSupplierBasisUnitField = scope3Method === 'supplier_basis' && 
                          (field.variable?.includes('supplier_based') || field.variable?.includes('supplier'));
                        
                        // Show checkbox for override fields OR optional fields (not required and not override)
                        const showOverrideCheckbox = !readOnly && !isFugitiveGwpField
                          && (field.isOverride || (!field.required && !field.isOverride));

                        return (
                          <div key={field.id || field.variable} className="space-y-2">
                            <div className="flex min-h-10 items-start justify-between gap-2">
                              <Label className="flex min-h-10 items-start gap-1.5 pt-0.5 font-medium leading-5">
                                {field.label}
                                {(field.required || isFugitiveGwpField) && <span className="text-red-500 ml-1">*</span>}
                                {!hideStandardQuantityUnit && !showUnitSelector && !isSupplierBasisUnitField && field.expectedUnit && (
                                  <span className="text-muted-foreground ml-1 text-xs font-normal">({field.expectedUnit})</span>
                                )}
                                {FIELD_HELP[field.variable] && (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          aria-label={`${field.label} info`}
                                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-stone-400 hover:text-emerald-600 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                          data-testid={`field-help-${field.variable}`}
                                        >
                                          <Info className="w-3.5 h-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
                                        {FIELD_HELP[field.variable]}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </Label>
                              
                              {showOverrideCheckbox && (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`edit-override-${field.variable}`}
                                    checked={isOverrideEnabled}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      updateDynamicFieldValue(`override_${field.variable}`, isChecked);
                                      
                                      // When enabling override, initialize the unit to the first allowed unit
                                      // This ensures the displayed unit matches what will be sent to backend
                                      if (isChecked && !dynamicFieldValues[`${field.variable}_unit`]) {
                                        let overrideUnits = [];
                                        if (field.unitSource === 'fuel') {
                                          // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
                                          if (formData.scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
                                            const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                                            overrideUnits = matchedActivity?.allowed_units || [];
                                          } else {
                                            overrideUnits = selectedFuel?.allowed_units || [];
                                          }
                                        } else if (field.unitSource === 'all_units') {
                                          overrideUnits = centralizedUnits.map(u => u.symbol);
                                        } else {
                                          overrideUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
                                        }
                                        if (overrideUnits.length > 0) {
                                          updateDynamicFieldValue(`${field.variable}_unit`, overrideUnits[0]);
                                        }
                                      }
                                    }}
                                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                  />
                                  <label 
                                    htmlFor={`edit-override-${field.variable}`} 
                                    className="text-xs text-amber-600 font-medium"
                                  >
                                    Override Default
                                  </label>
                                </div>
                              )}
                            </div>
                            
                            {/* Render based on field_type */}
                            {field.fieldType === 'select' && field.options?.length > 0 ? (
                              <select
                                value={field.variable === 'density' ? (savedDensityValue ?? '') : (dynamicFieldValues[field.variable] || '')}
                                onChange={(e) => updateDynamicFieldValue(field.variable, e.target.value)}
                                disabled={showOverrideCheckbox && !isOverrideEnabled}
                                className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${showOverrideCheckbox && !isOverrideEnabled ? 'opacity-50' : ''}`}
                                data-testid={`edit-select-${field.fieldKey}`}
                              >
                                <option value="">Select {field.label}</option>
                                {field.options.map(opt => (
                                  <option key={opt.value || opt} value={opt.value || opt}>
                                    {opt.label || opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className={(showUnitSelector || showUnitTextInput) ? "flex gap-2 min-w-0" : ""}>
                                <Input
                                  type={field.fieldType === 'text' ? 'text' : 'number'}
                                  step={field.fieldType === 'number' ? 'any' : undefined}
                                  min={field.fieldType === 'number' ? '0' : undefined}
                                  placeholder={field.placeholder}
                                  value={field.variable === 'density' ? (savedDensityValue ?? '') : (dynamicFieldValues[field.variable] || '')}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (field.fieldType === 'text' || val === '' || parseFloat(val) >= 0) {
                                      updateDynamicFieldValue(field.variable, val);
                                      // Also sync to formData for legacy compatibility
                                      if (isQtyField) {
                                        setFormData(prev => ({ ...prev, quantity: val }));
                                      }
                                    }
                                  }}
                                  onKeyDown={(e) => { if (field.fieldType === 'number' && e.key === '-') e.preventDefault(); }}
                                  disabled={showOverrideCheckbox && !isOverrideEnabled}
                                  className={`bg-stone-50 ${(showUnitSelector || showUnitTextInput) ? 'flex-1 min-w-0' : ''} ${showOverrideCheckbox && !isOverrideEnabled ? 'opacity-50' : ''}`}
                                  data-testid={`edit-input-${field.fieldKey}`}
                                />

                                {/* Freeform text unit input — admin config unit_source = 'text'. */}
                                {showUnitTextInput && (
                                  <Input
                                    type="text"
                                    value={dynamicFieldValues[`${field.variable}_unit`] || savedUnit}
                                    onChange={(e) => updateDynamicFieldValue(`${field.variable}_unit`, e.target.value)}
                                    disabled={showOverrideCheckbox && !isOverrideEnabled}
                                    className={`bg-stone-50 border border-stone-200 rounded-lg w-24 shrink-0 h-10 ${showOverrideCheckbox && !isOverrideEnabled ? 'opacity-50' : ''}`}
                                    placeholder="Unit"
                                    data-testid={`edit-unit-text-${field.fieldKey}`}
                                  />
                                )}
                                
                                {/* Supplier basis - use text input for units */}
                                {isSupplierBasisUnitField && (
                                  <Input
                                    type="text"
                                    value={dynamicFieldValues[`${field.variable}_unit`] || savedUnit}
                                    onChange={(e) => updateDynamicFieldValue(`${field.variable}_unit`, e.target.value)}
                                    disabled={showOverrideCheckbox && !isOverrideEnabled}
                                    className={`bg-stone-50 border border-stone-200 rounded-lg w-24 shrink-0 h-10 ${showOverrideCheckbox && !isOverrideEnabled ? 'opacity-50' : ''}`}
                                    placeholder="Unit (e.g., L, tCO2/L)"
                                    data-testid={`edit-unit-${field.fieldKey}`}
                                  />
                                )}
                                
                                {/* Non-supplier basis - use dropdown for units */}
                                {!isSupplierBasisUnitField && showUnitSelector && (
                                  readOnly ? <div role="textbox" aria-readonly="true" className="flex h-10 w-24 shrink-0 items-center rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm text-stone-800" data-testid={showCustomFuelQuantityUnit ? 'edit-custom-fuel-quantity-unit' : `edit-unit-${field.fieldKey}`}>{showCustomFuelQuantityUnit ? (dynamicFieldValues.custom_qty_unit || savedUnit || field.expectedUnit || '—') : (dynamicFieldValues[`${field.variable}_unit`] || savedUnit || (isQtyField ? formData.quantity_unit : '') || field.expectedUnit || '—')}</div> : <select
                                    value={showCustomFuelQuantityUnit
                                      ? (dynamicFieldValues.custom_qty_unit || savedUnit || unitSelectorOptions[0] || '')
                                      : (dynamicFieldValues[`${field.variable}_unit`] || savedUnit || unitSelectorOptions[0] || '')}
                                    onChange={(e) => {
                                      if (showCustomFuelQuantityUnit) {
                                        updateDynamicFieldValue('custom_qty_unit', e.target.value);
                                      }
                                      updateDynamicFieldValue(`${field.variable}_unit`, e.target.value);
                                      if (isQtyField) {
                                        setFormData(prev => ({ ...prev, quantity_unit: e.target.value }));
                                      }
                                    }}
                                    disabled={showOverrideCheckbox && !isOverrideEnabled}
                                    className={`bg-stone-50 border border-stone-200 rounded-lg px-3 w-24 shrink-0 h-10 ${showOverrideCheckbox && !isOverrideEnabled ? 'opacity-50' : ''}`}
                                    data-testid={showCustomFuelQuantityUnit ? 'edit-custom-fuel-quantity-unit' : `edit-unit-${field.fieldKey}`}
                                  >
                                    {/* savedUnit already included in fieldUnits at line ~4084; no duplicate injection needed */}
                                    {unitSelectorOptions.map(u => (
                                      <option key={u} value={u}>{u}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {showVirtualProcessDensity && (
                      <div className="grid max-w-md grid-cols-[1fr_auto] items-end gap-2" data-testid="edit-process-density-field">
                        <div className="space-y-1">
                          <Label htmlFor="edit-process-density-input" className="text-sm font-medium">
                            Density <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="edit-process-density-input"
                            type="number"
                            step="any"
                            min="0"
                            required
                            value={savedVirtualDensity}
                            onChange={(event) => {
                              updateDynamicFieldValue('density', event.target.value);
                              updateDynamicFieldValue('density_unit', virtualDensityRequirement.densityUnit);
                              updateDynamicFieldValue('override_density', true);
                            }}
                            className="bg-stone-50"
                            data-testid="edit-process-density-input"
                          />
                        </div>
                        <span className="mb-2 text-sm text-stone-600" data-testid="edit-process-density-unit">
                          {virtualDensityRequirement.densityUnit}
                        </span>
                        <p className="col-span-2 text-xs text-amber-700" data-testid="edit-process-density-conversion-hint">
                          Conversion required: {getSavedFieldUnit(virtualDensityQuantityField)} → {editCalcMethodology === 'using_carbon_composition' ? 'kg' : getUnitDenominator(getSavedFieldUnit(virtualDensityReferenceField))}
                        </p>
                      </div>
                    )}
                    
                  </div>
                  )
                ) : !isEditC7EmployeeCommuting ? (
                  /* LEGACY: Hardcoded fields when no dynamic config */
                  <div className="grid grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">
                      Quantity *
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="quantity"
                        type="number"
                        step="any"
                        min="0"
                        value={formData.quantity}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || parseFloat(val) >= 0) {
                            setFormData({ ...formData, quantity: val });
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                        required
                        placeholder="Enter amount"
                        className="bg-stone-50 flex-1"
                        data-testid="quantity-input"
                      />
                      {!editUseCustomFuel ? (
                        <select
                          value={formData.quantity_unit}
                          onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                          className="bg-stone-50 border border-stone-200 rounded-lg px-3 w-40 h-10"
                          data-testid="quantity-unit-select"
                        >
                          {availableQuantityUnits.map(unit => (
                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </div>
                </div>
                ) : null}

                {/* Custom fuel per-month fields in edit mode */}
                {editUseCustomFuel && (
                  <CustomFuelMonthFields
                    monthKey="edit"
                    data={dynamicFieldValues}
                    updateMonthData={(_, field, value) => {
                      setDynamicFieldValues(prev => ({ ...prev, [field]: value }));
                      markFormDirty?.();
                    }}
                    calculationMethodology={editCalcMethodology || 'using_heat_basis_ncv'}
                    fieldOptions={fieldOptions}
                    centralizedUnits={centralizedUnits}
                    showMethodIndicator={false}
                    isFugitiveCustomFuel={isFugitiveCustomFuel}
                  />
                )}

                {/* Override Options for Calorific Value and Density - Scope 1 and Biogenic, not for Fugitive Emissions */}
                {/* HIDDEN when using dynamic input fields (overrides are handled there) or loading */}
                {!editFormConfigLoading && dynamicInputFields.length === 0 && formData.fuel_id && formData.scope !== 'scope2' && ghgUiState.showManualFactorOverrides && (
                  <div className="p-4 bg-stone-50 rounded-lg border border-stone-200 space-y-4">
                    {/* Calorific Value Override */}
                    <div>
                      <div className="flex items-start gap-4">
                        <label className="flex items-center gap-2 min-w-[200px]">
                          <input
                            type="checkbox"
                            data-testid="override-calorific-checkbox"
                            checked={overrideCalorificValue}
                            onChange={(e) => {
                              setOverrideCalorificValue(e.target.checked);
                              if (e.target.checked) {
                                // Clear the value when override is enabled - user enters fresh value
                                setFormData(prev => ({
                                  ...prev,
                                  calorific_value: '',
                                  calorific_value_justification: ''
                                }));
                              } else {
                                // Reset to fuel database value when unchecked
                                const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                                if (fuel) {
                                  setFormData(prev => ({
                                    ...prev,
                                    calorific_value: fuel.calorific_value?.toString() || '',
                                    calorific_value_justification: ''
                                  }));
                                }
                              }
                            }}
                            className="text-primary"
                          />
                          <span className="text-sm">Calorific Value (if available)</span>
                        </label>
                        {overrideCalorificValue && (
                          <div className="flex gap-2 flex-1 items-center">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              data-testid="calorific-value-input"
                              value={formData.calorific_value}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || parseFloat(val) >= 0) {
                                  setFormData({ ...formData, calorific_value: val });
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                              placeholder="Enter value"
                              className="bg-white flex-1"
                              required={overrideCalorificValue}
                            />
                            <span className="flex items-center text-sm text-text-muted px-2 py-1 bg-stone-100 rounded">
                              {formData.calorific_value_unit || 'MJ/kg'}
                            </span>
                          </div>
                        )}
                      </div>
                      {overrideCalorificValue && (
                        <div className="ml-[216px] mt-2">
                          <Input
                            type="text"
                            value={formData.calorific_value_justification || ''}
                            onChange={(e) => setFormData({ ...formData, calorific_value_justification: e.target.value })}
                            placeholder="Justifications/Comments *"
                            className="bg-white"
                            required={overrideCalorificValue}
                          />
                        </div>
                      )}
                    </div>

                    {/* Density Override - Only show for volume units */}
                    {isVolumeUnit(formData.quantity_unit, centralizedUnits) && (
                      <div className="mt-4">
                        <div className="flex items-start gap-4">
                          <label className="flex items-center gap-2 min-w-[200px]">
                            <input
                              type="checkbox"
                              data-testid="override-density-checkbox"
                              checked={overrideDensity}
                              onChange={(e) => {
                                setOverrideDensity(e.target.checked);
                                if (e.target.checked) {
                                  // Clear the value when override is enabled - user enters fresh value
                                  setFormData(prev => ({
                                    ...prev,
                                    density: '',
                                    density_justification: ''
                                  }));
                                } else {
                                  // Reset to fuel database value when unchecked
                                  const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                                  if (fuel) {
                                    setFormData(prev => ({
                                      ...prev,
                                      density: fuel.density?.toString() || '',
                                      density_justification: ''
                                    }));
                                  }
                                }
                              }}
                              className="text-primary"
                            />
                            <span className="text-sm">Density Value (if available)</span>
                          </label>
                          {overrideDensity && (
                            <div className="flex gap-2 flex-1 items-center">
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                data-testid="density-input"
                                value={formData.density}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseFloat(val) >= 0) {
                                    setFormData({ ...formData, density: val });
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                placeholder="Enter value"
                                className="bg-white flex-1"
                                required={overrideDensity}
                              />
                              <span className="flex items-center text-sm text-text-muted px-2 py-1 bg-stone-100 rounded">
                                {formData.density_unit || 'kg/L'}
                              </span>
                            </div>
                          )}
                        </div>
                        {overrideDensity && (
                          <div className="ml-[216px] mt-2">
                            <Input
                              type="text"
                              value={formData.density_justification || ''}
                              onChange={(e) => setFormData({ ...formData, density_justification: e.target.value })}
                              placeholder="Justifications/Comments *"
                              className="bg-white"
                              required={overrideDensity}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Custom CO2 Emission Factor (Heat Basis) Override - HIDDEN per user request */}
                    {/* This field is hidden but functionality preserved for existing data */}
                    
                    {/* Override Justification - Mandatory when ANY override is enabled (#17) */}
                    {(overrideCalorificValue || overrideDensity || overrideEmissionFactorHeat) && (
                      <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <Label className="text-amber-800 font-medium flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4" />
                          Override Justification *
                        </Label>
                        <p className="text-xs text-amber-700 mb-2">
                          Explain why the default property/emission factor was overridden. This is required for audit compliance.
                        </p>
                        <Textarea
                          value={overrideJustification}
                          onChange={(e) => setOverrideJustification(e.target.value)}
                          placeholder="Enter justification for overriding default values (minimum 20 characters)..."
                          className="bg-white min-h-[80px]"
                          required
                          data-testid="override-justification-textarea"
                        />
                        {overrideJustification.length > 0 && overrideJustification.length < 20 && (
                          <p className="text-xs text-red-600 mt-1">
                            Justification must be at least 20 characters ({20 - overrideJustification.length} more needed)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                </section>

                {effectiveCalculatedEmissions && (
                  editUseCustomFuel ? (
                    <CustomFuelLiveCalculation
                      result={effectiveCalculatedEmissions}
                      methodology={editCalcMethodology}
                      isCalculating={isCalculating}
                    />
                  ) : (
                    <ColourfulEmissionSummary
                      calculation={effectiveCalculatedEmissions}
                      isCalculating={isCalculating}
                      isScope3Like={formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')}
                    />
                  )
                )}

                </fieldset>

                <EditOptionalFields
                  formData={formData}
                  setFormData={setFormData}
                  markFormDirty={markFormDirty}
                  capabilities={capabilities}
                  selectedCategory={selectedCategory}
                  isEditC7EmployeeCommuting={isEditC7EmployeeCommuting}
                  readOnly={readOnly}
                />

                {/* Evidence Management Section */}
                {readOnly ? readOnlyEvidenceContent : <div className="space-y-4 rounded-lg border border-stone-200 bg-white p-4" data-testid="emission-edit-evidence-section">
                  <div className="flex items-center justify-between">
                    <Label>Evidence Documents</Label>
                    {existingEvidences.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteAllEvidences}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete All
                      </Button>
                    )}
                  </div>
                  
                  {/* Existing Evidences List */}
                  {existingEvidences.length > 0 ? (
                    <div className="space-y-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
                      <p className="text-xs text-stone-500 font-medium mb-2">
                        {existingEvidences.length} evidence file(s) attached
                      </p>
                      {existingEvidences.map((evidence, idx) => {
                        const fileIdMatch = evidence.url?.match(/\/api\/files\/([a-f0-9-]+)/i);
                        const fileId = fileIdMatch ? fileIdMatch[1] : null;
                        const viewUrl = fileId ? `${BACKEND_URL}/api/files/${fileId}/view` : evidence.url;
                        
                        return (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-md border border-stone-200">
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-sm text-stone-700 truncate flex-1">
                              {evidence.filename || `Evidence ${idx + 1}`}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={viewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 px-2 py-1"
                                title="View file"
                              >
                                <Eye className="w-3 h-3" />
                                View
                              </a>
                              {fileId && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    // Use fetch + blob for proper download
                                    await downloadFileHelper(`${BACKEND_URL}/api/files/${fileId}/download`, evidence.filename || `Evidence-${idx + 1}`);
                                  }}
                                  className="text-xs text-green-600 hover:text-green-800 hover:underline flex items-center gap-1 px-2 py-1"
                                  title="Download file"
                                >
                                  <Download className="w-3 h-3" />
                                  Download
                                </button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExistingEvidence(idx)}
                                className="text-red-500 hover:text-red-700 p-1 h-auto"
                                title="Delete this evidence"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-500" data-testid="emission-edit-no-evidence"><FileText className="h-4 w-4" />No Evidence</div>}
                  
                  {/* Upload New Evidence */}
                  <FileUpload
                    label={existingEvidences.length > 0 ? "Add More Evidence" : "Upload Evidence"}
                    onUpload={handleFileUpload}
                    onRemove={handleRemoveEvidence}
                    multiple={true}
                  />
                </div>}

                {/* Submit Buttons - Extracted Component */}
                {!hideSubmitButton && (
                  <SubmitButtonSection
                    editingEmission={editingEmission}
                    isSaving={isSaving}
                    isCalculating={isCalculating}
                    handleDialogChange={handleDialogChange}
                  />
                )}
              </form>
  );
}
