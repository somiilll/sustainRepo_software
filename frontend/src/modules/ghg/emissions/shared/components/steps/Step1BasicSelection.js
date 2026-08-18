/**
 * Step 1: Basic Selection Component
 * Handles Facility, Scope, Category, Fuel/Activity selection
 * This is a large step component (~700 lines extracted from EmissionEntryForm.js)
 */

import { useMemo } from 'react';
import { Label } from '../../../../../../components/ui/label';
import { Input } from '../../../../../../components/ui/input';
import { Search, X } from 'lucide-react';
import { resolveGhgUiState } from '../../../../config/resolveGhgUiState';
import {
  getStandardActivityTypeLabel,
  STANDARD_PROCESS_TYPE_OPTIONS,
  STANDARD_TYPE_OF_PRODUCT_OPTIONS,
} from '../../../../config/standardGhgFormConfig';

const escapeOptionHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

/**
 * Step 1 Basic Selection Component
 * @param {Object} props - All required state and setter props from parent
 */
export const Step1BasicSelection = ({
  // Facility props
  facilityId,
  setFacilityId,
  facilities,
  
  // Scope props
  scope,
  setScope,
  dynamicScopes,
  disabledScopes = [],
  hasScope3Access,
  setCategory,
  setFuelId,
  setScope3Method,
  setScope3ActivityType,
  setScope3ActivityId,
  setUseCustomFuel,
  setBiogenicScopeSelection,
  setScope3Subcategory,
  
  // Biogenic props
  biogenicScopeSelection,
  loadingBiogenicCategories,
  
  // Category props
  category,
  categoriesForScope,
  capabilities = {},
  
  // Scope 3 Method props
  scope3Method,
  availableScope3Methods,
  getMethodLabel,
  
  // Activity Type props
  scope3ActivityType,
  availableScope3ActivityTypes,
  
  // Subcategory props
  requiresSubcategory,
  availableSubcategories,
  scope3Subcategory,

  // C11: Type of Product (decision-tree branch)
  typeOfProduct,
  setTypeOfProduct,
  
  // Activity props
  scope3ActivityId,
  filteredScope3Activities,
  useCustomActivity,
  setUseCustomActivity,
  scope3CustomActivity,
  setScope3CustomActivity,
  fuelSearchTerm,
  setFuelSearchTerm,
  loadingScope3EF,
  
  // Fuel props (non-Scope3)
  fuelId,
  useCustomFuel,
  customFuelName,
  setCustomFuelName,
  customEmissionFactor,
  setCustomEmissionFactor,
  customEmissionFactorUnit,
  setCustomEmissionFactorUnit,
  customSource,
  setCustomSource,
  selectedFuel,
  filteredFuelsForCategory,
  getAvailableEFUnits,
  getQuantityUnitFromEFUnit,
  
  // KPI Access Control props
  kpiCanAccessScope = null,
  kpiAllowedScopes = null,
  filterFacilitiesByScope = null,
  hasFullKPIAccess = true,
  
  // Decision field values (for calculation_methodology)
  decisionFieldValues = {},
  setDecisionFieldValues,
}) => {
  const ghgUiState = resolveGhgUiState({
    capabilities,
    scope,
    biogenicScopeSelection,
    processType: decisionFieldValues.process_type,
    scope3ActivityType,
    scope3Method,
    requiresSubcategory,
    scope3Subcategory,
    hasCategory: Boolean(category),
  });

  // Filter facilities based on selected scope (if KPI access is restricted)
  const filteredFacilities = useMemo(() => {
    let result = facilities.filter(f => f.is_active !== false);
    
    // Apply KPI-based facility filtering if not full access
    if (!hasFullKPIAccess && filterFacilitiesByScope && scope) {
      result = filterFacilitiesByScope(result, scope);
    }
    
    return result;
  }, [facilities, scope, hasFullKPIAccess, filterFacilitiesByScope]);

  // Filter scopes based on KPI access
  const filteredScopes = useMemo(() => {
    const defaultScopes = dynamicScopes.length > 0 ? dynamicScopes : [
      { code: 'scope1', name: 'Scope 1' },
      { code: 'scope2', name: 'Scope 2' },
      { code: 'biogenic', name: 'Biogenic' },
    ];
    
    let result = defaultScopes
      .filter(s => s.code !== 'scope3' || hasScope3Access)
      .filter(s => !disabledScopes.includes(s.code));
    
    // Apply KPI-based scope filtering if not full access
    if (!hasFullKPIAccess && kpiAllowedScopes && kpiAllowedScopes.length > 0) {
      result = result.filter(s => kpiAllowedScopes.includes(s.code));
    }
    
    return result;
  }, [dynamicScopes, disabledScopes, hasScope3Access, hasFullKPIAccess, kpiAllowedScopes]);

  const facilityOptionsHtml = useMemo(() => {
    const options = filteredFacilities.length === 0
      ? '<option value="_no_facilities" disabled>No facilities available for this scope</option>'
      : filteredFacilities.map((facility) => (
        `<option value="${escapeOptionHtml(facility.id)}">${escapeOptionHtml(facility.name)}${facility.country ? ` (${escapeOptionHtml(facility.country)})` : ''}</option>`
      )).join('');
    return `<option value="">Select Facility</option>${options}`;
  }, [filteredFacilities]);

  const categoryOptionsHtml = useMemo(() => {
    const options = categoriesForScope.length === 0
      ? '<option value="_no_categories" disabled>No categories available for this scope</option>'
      : categoriesForScope.map((option) => `<option value="${escapeOptionHtml(option)}">${escapeOptionHtml(option)}</option>`).join('');
    return `<option value="">Select Category</option>${options}`;
  }, [categoriesForScope]);

  const scope3MethodOptionsHtml = useMemo(() => (
    `<option value="">Select Method</option>${availableScope3Methods.map((method) => (
      `<option value="${escapeOptionHtml(method)}">${escapeOptionHtml(getMethodLabel(method))}</option>`
    )).join('')}`
  ), [availableScope3Methods, getMethodLabel]);

  const biogenicActivityOptionsHtml = useMemo(() => (
    `<option value="">Select Biogenic Activity (${filteredScope3Activities.length} available)</option>${filteredScope3Activities.map((activity) => (
      `<option value="${escapeOptionHtml(activity.id)}">${escapeOptionHtml(activity.activity)}</option>`
    )).join('')}`
  ), [filteredScope3Activities]);

  const activityTypeOptionsHtml = useMemo(() => (
    `<option value="">Select activity type...</option>${availableScope3ActivityTypes.map((type) => (
      `<option value="${escapeOptionHtml(type)}">${escapeOptionHtml(getStandardActivityTypeLabel(type))}</option>`
    )).join('')}`
  ), [availableScope3ActivityTypes]);

  const subcategoryOptionsHtml = useMemo(() => (
    `<option value="">Select sub-category...</option>${availableSubcategories.map((subcategory) => (
      `<option value="${escapeOptionHtml(subcategory.value)}">${escapeOptionHtml(subcategory.label)}</option>`
    )).join('')}`
  ), [availableSubcategories]);

  const typeOfProductOptionsHtml = useMemo(() => (
    `<option value="">Select type of product...</option>${STANDARD_TYPE_OF_PRODUCT_OPTIONS.map((option) => (
      `<option value="${escapeOptionHtml(option.value)}">${escapeOptionHtml(option.label)}</option>`
    )).join('')}`
  ), []);

  const activityOptionsHtml = useMemo(() => {
    const isActivityTypeMissing = availableScope3ActivityTypes.length > 0 && !scope3ActivityType;
    const isSubcategoryMissing = requiresSubcategory && !scope3Subcategory;
    const isProductTypeMissing = ghgUiState.requiresTypeOfProduct && !typeOfProduct;
    const placeholder = isActivityTypeMissing
      ? 'Select activity type first'
      : isSubcategoryMissing
        ? 'Select sub-category first'
        : isProductTypeMissing
          ? 'Select type of product first'
          : `Select Activity (${filteredScope3Activities.filter((activity) => !fuelSearchTerm || activity.activity?.toLowerCase().includes(fuelSearchTerm.toLowerCase())).length} available)`;
    const options = filteredScope3Activities
      .filter((activity) => !fuelSearchTerm || activity.activity?.toLowerCase().includes(fuelSearchTerm.toLowerCase()))
      .map((activity) => `<option value="${escapeOptionHtml(activity.id)}">${escapeOptionHtml(activity.activity)}</option>`)
      .join('');
    return `<option value="">${escapeOptionHtml(placeholder)}</option>${options}`;
  }, [availableScope3ActivityTypes, scope3ActivityType, requiresSubcategory, scope3Subcategory, ghgUiState.requiresTypeOfProduct, typeOfProduct, filteredScope3Activities, fuelSearchTerm]);

  const processTypeOptionsHtml = useMemo(() => (
    `<option value="">Select process type</option>${STANDARD_PROCESS_TYPE_OPTIONS.map((option) => (
      `<option value="${escapeOptionHtml(option.value)}">${escapeOptionHtml(option.label)}</option>`
    )).join('')}`
  ), []);

  const fuelOptionsHtml = useMemo(() => (
    `<option value="">Select Fuel Type (${filteredFuelsForCategory.length} available)</option>${filteredFuelsForCategory.map((fuel) => (
      `<option value="${escapeOptionHtml(fuel.id)}">${escapeOptionHtml(fuel.fuel_name)}</option>`
    )).join('')}`
  ), [filteredFuelsForCategory]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Facility */}
        <div className="space-y-2">
          <Label htmlFor="emission-facility-select">Facility <span className="text-red-500">*</span></Label>
          <select
            id="emission-facility-select"
            value={facilityId}
            onChange={(event) => setFacilityId(event.target.value)}
            className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            data-testid="emission-facility-select"
            dangerouslySetInnerHTML={{ __html: facilityOptionsHtml }}
          />
          {!hasFullKPIAccess && filteredFacilities.length === 0 && scope && (
            <p className="text-xs text-amber-600">
              You don&apos;t have access to any facilities for {scope}. Contact your admin.
            </p>
          )}
        </div>

        {/* Scope */}
        <div className="space-y-2">
          <Label>Scope <span className="text-red-500">*</span></Label>
          <div className="flex gap-4 h-10 items-center flex-wrap">
            {filteredScopes.map(s => (
                <label key={s.code} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={s.code}
                    checked={scope === s.code}
                    onChange={() => {
                      setScope(s.code);
                      setCategory('');
                      setFuelId('');
                      setScope3Method('');
                      setScope3ActivityType('');
                      setScope3ActivityId('');
                      if (s.code === 'scope2') setUseCustomFuel(false);
                      if (s.code !== 'biogenic') {
                        setBiogenicScopeSelection('');
                      }
                      // Reset facility when scope changes (KPI access may differ)
                      if (!hasFullKPIAccess) {
                        setFacilityId('');
                      }
                    }}
                    className="text-primary"
                    data-testid={`entry-scope-${s.code}`}
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
          </div>
          {!hasFullKPIAccess && filteredScopes.length === 0 && (
            <p className="text-xs text-amber-600">
              You don&apos;t have access to any scopes. Contact your admin.
            </p>
          )}
        </div>
        
        {/* Biogenic Scope Selection */}
        {scope === 'biogenic' && (
          <div className="col-span-2 mt-4 space-y-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <Label className="text-green-800">Select Biogenic Emission Type <span className="text-red-500">*</span></Label>
            <div className="flex gap-6 h-10 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="scope1"
                  checked={biogenicScopeSelection === 'scope1'}
                  onChange={(e) => {
                    setBiogenicScopeSelection(e.target.value);
                    setCategory('');
                    setFuelId('');
                    setScope3Method('');
                    setScope3ActivityId('');
                  }}
                  className="text-green-600"
                  data-testid="biogenic-scope-radio-scope1"
                />
                <span className="text-green-800">Direct Biogenic</span>
              </label>
              <label className={`flex items-center gap-2 ${!hasScope3Access ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="radio"
                  value="scope3"
                  checked={biogenicScopeSelection === 'scope3'}
                  disabled={!hasScope3Access}
                  onChange={(e) => {
                    setBiogenicScopeSelection(e.target.value);
                    setCategory('');
                    setFuelId('');
                    setScope3Method('');
                    setScope3ActivityId('');
                  }}
                  className="text-green-600"
                  data-testid="biogenic-scope-radio-scope3"
                />
                <span className="text-green-800">Indirect Biogenic</span>
                {!hasScope3Access && (
                  <span className="px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-semibold rounded whitespace-nowrap">
                    Not Available
                  </span>
                )}
              </label>
            </div>
            {loadingBiogenicCategories && (
              <p className="text-xs text-green-600">Loading biogenic categories...</p>
            )}
          </div>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="emission-category-select">Category <span className="text-red-500">*</span></Label>
        <select
          id="emission-category-select"
          value={category}
          onChange={(event) => {
            const value = event.target.value;
            setCategory(value);
            setFuelId('');
            setScope3Method('');
            setScope3ActivityType('');
            setScope3Subcategory('');
            setTypeOfProduct?.('');
            setScope3ActivityId('');
          }}
          className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          data-testid="emission-category-select"
          dangerouslySetInnerHTML={{ __html: categoryOptionsHtml }}
        />
      </div>

      {/* Biogenic Indirect: Calculation Method */}
      {scope === 'biogenic' && biogenicScopeSelection === 'scope3' && category && (
        <div className="space-y-2">
          <Label>Calculation Method <span className="text-red-500">*</span></Label>
          <select
            value={scope3Method}
            onChange={(e) => {
              setScope3Method(e.target.value);
              setScope3ActivityId('');
            }}
            className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid="biogenic-scope3-method-select"
            dangerouslySetInnerHTML={{ __html: scope3MethodOptionsHtml }}
          />
          {availableScope3Methods.length === 0 && (
            <p className="text-xs text-amber-600">No methods available for this category</p>
          )}
        </div>
      )}

      {/* Biogenic Indirect: Biogenic Activity */}
      {scope === 'biogenic' && biogenicScopeSelection === 'scope3' && scope3Method && (
        <div className="space-y-2 mt-4 mb-2">
          <div className="flex items-center justify-between">
            <Label>Biogenic Activity <span className="text-red-500">*</span></Label>
            {scope3Method === 'supplier_basis' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomActivity}
                  onChange={(e) => {
                    setUseCustomActivity(e.target.checked);
                    if (e.target.checked) {
                      setScope3ActivityId('');
                    } else {
                      setScope3CustomActivity('');
                    }
                  }}
                  className="rounded border-stone-300"
                  data-testid="biogenic-scope3-custom-activity-toggle"
                />
                <span className="text-text-secondary">Use Custom Activity</span>
              </label>
            )}
          </div>
          {scope3Method === 'supplier_basis' && useCustomActivity ? (
            <div className="space-y-1.5">
              <Input
                type="text"
                value={scope3CustomActivity}
                onChange={(e) => setScope3CustomActivity(e.target.value)}
                placeholder="Enter custom activity name..."
                className="bg-stone-50 h-10"
                data-testid="biogenic-scope3-custom-activity-input"
              />
              <p className="text-xs text-text-muted">
                Enter a custom activity name describing the biogenic emission source
              </p>
            </div>
          ) : (
            <select
              value={scope3ActivityId}
              onChange={(e) => setScope3ActivityId(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              data-testid="biogenic-scope3-activity-select"
              dangerouslySetInnerHTML={{ __html: biogenicActivityOptionsHtml }}
            />
          )}
          {filteredScope3Activities.length === 0 && !useCustomActivity && (
            <p className="text-xs text-amber-600">
              No biogenic activities found for this category and method
            </p>
          )}
        </div>
      )}

      {/* Scope 3: Method and Activity Selection */}
      {category && scope === 'scope3' && (
        <div className="space-y-4 mt-4 pb-6 border-b border-stone-200">
          {/* Method Selection */}
          <div className="space-y-2">
            <Label>Calculation Method <span className="text-red-500">*</span></Label>
            <select
              value={scope3Method}
              onChange={(e) => {
                setScope3Method(e.target.value);
                setScope3ActivityType('');
                setScope3Subcategory('');
                setTypeOfProduct?.('');
                setScope3ActivityId('');
              }}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              data-testid="scope3-method-select"
              dangerouslySetInnerHTML={{ __html: scope3MethodOptionsHtml }}
            />
            {availableScope3Methods.length === 0 && category && (
              <p className="text-xs text-amber-600">No methods available for this category in Scope 3 EF table</p>
            )}
          </div>

          {/* Activity Type Filter (only for C6/C7) */}
          {scope3Method && availableScope3ActivityTypes.length > 0 && (
            <div className="space-y-2">
              <Label>Activity Type <span className="text-red-500">*</span></Label>
              <select
                value={scope3ActivityType}
                onChange={(e) => {
                  setScope3ActivityType(e.target.value);
                  setScope3ActivityId('');
                }}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="scope3-activity-type-filter"
                dangerouslySetInnerHTML={{ __html: activityTypeOptionsHtml }}
              />
            </div>
          )}

          {/* Subcategory Selection (for C8/C10/C11/C13/C14) */}
          {scope3Method && requiresSubcategory && availableSubcategories.length > 0 && (
            <div className="space-y-2">
              <Label>Sub-category <span className="text-red-500">*</span></Label>
              <select
                value={scope3Subcategory}
                onChange={(e) => {
                  setScope3Subcategory(e.target.value);
                  setScope3ActivityId('');
                  // Resetting subcategory invalidates the type_of_product
                  // path through the decision tree — clear it.
                  setTypeOfProduct?.('');
                }}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="scope3-subcategory-select"
                dangerouslySetInnerHTML={{ __html: subcategoryOptionsHtml }}
              />
            </div>
          )}

          {/* C11 Type of Product (decision-tree branch — activity_basis only).
              Categories C11 needs this to pick between continuous_usage and
              one_time_use formulas. Shown after subcategory selection. */}
          {(() => {
            if (!ghgUiState.showTypeOfProduct) return null;
            return (
              <div className="space-y-2">
                <Label>Type of Product <span className="text-red-500">*</span></Label>
                <select
                  value={typeOfProduct || ''}
                  onChange={(e) => {
                    setTypeOfProduct?.(e.target.value);
                    setScope3ActivityId('');
                  }}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="scope3-type-of-product-select"
                  dangerouslySetInnerHTML={{ __html: typeOfProductOptionsHtml }}
                />
              </div>
            );
          })()}

          {/* Activity Selection (from Scope 3 EF) */}
          {scope3Method && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Activity <span className="text-red-500">*</span></Label>
                {scope3Method === 'supplier_basis' && scope3ActivityType !== 'others' && (scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3')) && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomActivity}
                      onChange={(e) => {
                        setUseCustomActivity(e.target.checked);
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
              
              {scope3Method === 'supplier_basis' && (useCustomActivity || scope3ActivityType === 'others') && (scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={scope3CustomActivity}
                    onChange={(e) => setScope3CustomActivity(e.target.value)}
                    placeholder={scope3ActivityType === 'others' ? "Enter activity name (e.g., Electric Scooter, Carpooling)..." : "Enter custom activity name..."}
                    className="bg-stone-50 h-10"
                    data-testid="scope3-custom-activity-input"
                  />
                  <p className="text-xs text-text-muted">
                    {scope3ActivityType === 'others' 
                      ? 'Enter a descriptive name for this activity type'
                      : 'Enter a custom activity name describing the emission source'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Activity search input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <Input
                      type="text"
                      value={fuelSearchTerm}
                      onChange={(e) => setFuelSearchTerm(e.target.value)}
                      placeholder="Search activities..."
                      className="pl-9 bg-stone-50 h-10"
                      data-testid="activity-search-input"
                      disabled={(availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)}
                    />
                    {fuelSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setFuelSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {/* Activity selection dropdown */}
                  <select
                    value={scope3ActivityId}
                    onChange={(e) => {
                      setScope3ActivityId(e.target.value);
                      setFuelSearchTerm('');
                    }}
                    className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${((availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory) || (ghgUiState.requiresTypeOfProduct && !typeOfProduct)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    data-testid="scope3-activity-select"
                    disabled={(availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory) || (ghgUiState.requiresTypeOfProduct && !typeOfProduct)}
                    dangerouslySetInnerHTML={{ __html: activityOptionsHtml }}
                  />
                  {loadingScope3EF && (
                    <p className="text-xs text-blue-600">Loading activities...</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Process Type - Only for Process Emissions (Scope 1) */}
      {ghgUiState.showProcessType && (
        <div className="space-y-2 mt-4 pb-6 border-b border-stone-200" data-testid="process-type-section">
          <Label>Process Type <span className="text-red-500">*</span></Label>
          <select
            value={decisionFieldValues.process_type || ''}
            onChange={(event) => setDecisionFieldValues(prev => ({ ...prev, process_type: event.target.value, calculation_methodology: '' }))}
            className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            data-testid="process-type-select"
            dangerouslySetInnerHTML={{ __html: processTypeOptionsHtml }}
          />
        </div>
      )}

      {/* Calculation Methodology - For Stationary/Mobile/Flaring OR Process Emissions with venting */}
      {ghgUiState.showCalculationMethodology && (
        <div className="space-y-2 mt-4 pb-6 border-b border-stone-200" data-testid="calculation-methodology-section">
          <Label>Calculation Methodology</Label>
          <select
            value={decisionFieldValues.calculation_methodology || 'using_heat_basis_ncv'}
            onChange={(event) => setDecisionFieldValues(prev => ({ ...prev, calculation_methodology: event.target.value }))}
            className="h-10 w-full border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            data-testid="calculation-methodology-select"
          >
            <option value="using_heat_basis_ncv">Using Heat Basis (NCV)</option>
            <option value="using_qty_basis_ef">Using Qty Basis EF</option>
            <option value="using_carbon_composition">Using Composition of Carbon</option>
          </select>
        </div>
      )}

      {/* Fuel Type - Only show for non-Scope 3, non-biogenic-scope3, non-Process Emissions */}
      {ghgUiState.showFuelSelection && (
        <div className="space-y-3 mt-4 pb-6 border-b border-stone-200">
          <div className="flex items-center justify-between">
            <Label>Fuel Type <span className="text-red-500">*</span></Label>
            {/* Custom Fuel toggle - only for Stationary, Mobile, Fugitive, Flaring */}
            {ghgUiState.showCustomFuel && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomFuel}
                  onChange={(e) => {
                    setUseCustomFuel(e.target.checked);
                    if (e.target.checked) {
                      setFuelId('');
                      setFuelSearchTerm('');
                    } else {
                      setCustomFuelName('');
                      setCustomEmissionFactor('');
                      setCustomSource('');
                    }
                  }}
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  data-testid="use-custom-fuel-toggle"
                />
                <span className="text-sm text-amber-700 font-medium">Use Custom Fuel</span>
              </label>
            )}
          </div>

          {!useCustomFuel ? (
            <div className="space-y-2">
              {/* Fuel search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input
                  type="text"
                  value={fuelSearchTerm}
                  onChange={(e) => setFuelSearchTerm(e.target.value)}
                  placeholder="Search fuel types..."
                  className="pl-9 bg-stone-50 h-10"
                  data-testid="fuel-search-input"
                />
                {fuelSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setFuelSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {/* Fuel selection dropdown */}
              <select
                value={fuelId}
                onChange={(e) => {
                  setFuelId(e.target.value);
                  setFuelSearchTerm('');
                }}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="emission-fuel-select"
                dangerouslySetInnerHTML={{ __html: fuelOptionsHtml }}
              />
              {fuelSearchTerm && filteredFuelsForCategory.length === 0 && (
                <p className="text-xs text-amber-600">No fuel types match &quot;{fuelSearchTerm}&quot;</p>
              )}
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="space-y-2">
                <Label>Custom Fuel Name <span className="text-red-500">*</span></Label>
                <Input
                  value={customFuelName}
                  onChange={(e) => setCustomFuelName(e.target.value)}
                  placeholder="Enter fuel name"
                  className="bg-white"
                  data-testid="custom-fuel-name-input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Source</Label>
                <Input value={customSource} onChange={(e) => setCustomSource(e.target.value)} placeholder="Source of information" className="bg-white" />
              </div>
            </div>
          )}

          {/* Show selected fuel info */}
          {selectedFuel && !useCustomFuel && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <p><strong>Selected:</strong> {selectedFuel.fuel_name}</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default Step1BasicSelection;
