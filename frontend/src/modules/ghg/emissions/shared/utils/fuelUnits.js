export const getCategoryFuelAllowedUnits = ({
  fuelDatabase = [],
  scope = '',
  categoryName = '',
}) => {
  const normalizedScope = String(scope).toLowerCase();
  const normalizedCategory = String(categoryName).toLowerCase();
  if (!normalizedScope || !normalizedCategory) return [];

  return Array.from(new Set(
    fuelDatabase
      .filter((fuel) => {
        const categories = Array.isArray(fuel.categories) && fuel.categories.length > 0
          ? fuel.categories
          : [fuel.category];
        return String(fuel.scope).toLowerCase() === normalizedScope
          && categories.some((fuelCategory) => (
            String(fuelCategory || '').toLowerCase() === normalizedCategory
          ));
      })
      .flatMap((fuel) => fuel.allowed_units || [])
      .filter(Boolean),
  ));
};