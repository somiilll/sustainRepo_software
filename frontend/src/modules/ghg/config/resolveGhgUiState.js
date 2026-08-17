/** Shared conditional-visibility policy consumed by active Create and Edit UI. */
export const resolveGhgUiState = ({
  capabilities = {},
  scope,
  biogenicScopeSelection,
  processType,
  scope3ActivityType,
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

  return {
    showProcessType: hasCategory && isDirectScope && capabilities.processType,
    showCalculationMethodology: hasCategory
      && isDirectScope
      && capabilities.calculationMethodology
      && (!capabilities.processType || processType === 'venting'),
    showFuelSelection: hasCategory && isFuelScope && capabilities.requiresFuel,
    showCustomFuel: hasCategory && isFuelScope && capabilities.requiresFuel && capabilities.customFuel,
    showManualFactorOverrides: isDirectScope && capabilities.manualFactorOverrides,
    showEmployeeFields: scope === 'scope3' && capabilities.multiEmployee,
    showFlightDetails,
    showMonthlyFlightDetails: showFlightDetails && frequencyType === 'monthly',
    showYearlyFlightDetails: showFlightDetails && frequencyType === 'yearly',
  };
};

export default resolveGhgUiState;
