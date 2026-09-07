/** Resolve the exact unit that a monthly selector displays and persists. */
export const resolveMonthlySelectableUnit = ({
  storedUnit = '',
  configuredUnit = '',
  allowedUnits = [],
}) => {
  const findAllowedUnit = (candidateUnit) => allowedUnits.find(
    (unit) => unit.toLowerCase() === candidateUnit.toLowerCase(),
  );
  const configuredMatch = findAllowedUnit(configuredUnit);
  const storedMatch = findAllowedUnit(storedUnit);
  return storedMatch || configuredMatch || allowedUnits[0] || storedUnit || configuredUnit;
};

export default resolveMonthlySelectableUnit;