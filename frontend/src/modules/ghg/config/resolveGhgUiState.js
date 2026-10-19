/** Shared conditional-visibility policy consumed by active Create and Edit UI. */
import { STANDARD_PROCESS_TYPE_OPTIONS } from './standardGhgFormConfig';

export const resolveGhgUiState = ({
  capabilities = {},
  scope,
  biogenicScopeSelection,
  processType,
  scope3ActivityType,
  scope3Method,
  requiresSubcategory = false,
  scope3Subcategory,
  frequencyType,
  hasCategory = true,
} = {}) => {
  const isBiogenicScope1 = scope === 'biogenic' && biogenicScopeSelection === 'scope1';
  const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const isDirectScope = scope === 'scope1' || isBiogenicScope1;
  const isFuelScope = scope !== 'scope3' && !isBiogenicScope3;
  const isScope3Like = scope === 'scope3' || isBiogenicScope3;
  const showFlightDetails = isScope3Like
    && capabilities.flightDetails
    && scope3ActivityType === 'air_travel';

  const requiresTypeOfProduct = capabilities.typeOfProduct
    && scope3Method === 'activity_basis'
    && requiresSubcategory
    && Boolean(scope3Subcategory);
  const processTypeOptions = capabilities.processTypeOptions || [];
  const historicalProcessType = processType
    && !processTypeOptions.some((option) => option.value === processType)
    ? STANDARD_PROCESS_TYPE_OPTIONS.find((option) => option.value === processType)
      || { value: processType, label: String(processType).replace(/_/g, ' ') }
    : null;
  const renderableProcessTypeOptions = historicalProcessType
    ? [...processTypeOptions, { ...historicalProcessType, disabled: true }]
    : processTypeOptions;

  return {
    showProcessType: hasCategory && isDirectScope && capabilities.processType,
    showCalculationMethodology: hasCategory
      && isDirectScope
      && capabilities.calculationMethodology
      && (!capabilities.processType || processType === 'venting'),
    showFuelSelection: hasCategory && isFuelScope && capabilities.requiresFuel,
    showCustomFuel: hasCategory && isFuelScope && capabilities.requiresFuel && capabilities.customFuel,
    processTypeOptions,
    renderableProcessTypeOptions,
    showManualFactorOverrides: isDirectScope && capabilities.manualFactorOverrides,
    showEmployeeFields: scope === 'scope3' && capabilities.multiEmployee,
    showFlightDetails,
    showMonthlyFlightDetails: showFlightDetails && frequencyType === 'monthly',
    showYearlyFlightDetails: showFlightDetails && frequencyType === 'yearly',
    requiresTypeOfProduct,
    showTypeOfProduct: requiresTypeOfProduct,
  };
};

export default resolveGhgUiState;
