/** Presentation-only standard options for the active Create/Edit GHG forms. */
export const GHG_FIELD_OPTION_KEYS = Object.freeze({
  SUBCATEGORY: 'scope3_subcategory',
  EMISSION_FACTOR_UNIT: 'emission_factor_unit',
  CUSTOM_FUEL_EMISSION_FACTOR_UNIT: 'custom_fuel_emission_factor_unit',
  CUSTOM_FUEL_QUANTITY_UNIT: 'custom_fuel_quantity_unit',
  CUSTOM_FUEL_HEAT_EF_UNIT: 'custom_fuel_heat_ef_unit',
  CUSTOM_FUEL_HEAT_CV_UNIT: 'custom_fuel_heat_cv_unit',
  CUSTOM_FUEL_QTY_EF_UNIT: 'custom_fuel_qty_ef_unit',
});

export const STANDARD_SUBCATEGORY_OPTIONS = Object.freeze([
  { value: 'stationary_combustion', label: 'Stationary Combustion' },
  { value: 'mobile_combustion', label: 'Mobile Combustion' },
  { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
  { value: 'energy', label: 'Energy' },
]);

export const STANDARD_EMISSION_FACTOR_UNITS = Object.freeze([
  { value: 'tCO2/kg', label: 'tCO₂/kg', quantityUnit: 'kg', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/g', label: 'tCO₂/g', quantityUnit: 'g', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/t', label: 'tCO₂/t', quantityUnit: 't', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/L', label: 'tCO₂/L', quantityUnit: 'L', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/m3', label: 'tCO₂/m³', quantityUnit: 'm³', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/kWh', label: 'tCO₂/kWh', quantityUnit: 'kWh', forScope: ['scope2'] },
  { value: 'tCO2/MWh', label: 'tCO₂/MWh', quantityUnit: 'MWh', forScope: ['scope2'] },
]);

export const STANDARD_CUSTOM_FUEL_EMISSION_FACTOR_UNITS = Object.freeze([
  { value: 'tCO2/kg', label: 'tCO₂/kg', quantityUnit: 'kg' },
  { value: 'tCO2/g', label: 'tCO₂/g', quantityUnit: 'g' },
  { value: 'tCO2/t', label: 'tCO₂/t', quantityUnit: 't' },
]);

const CUSTOM_FUEL_QUANTITY_UNITS = Object.freeze(['kg', 'g', 't', 'L', 'kL', 'ml', 'm3', 'cm3']);
const CUSTOM_FUEL_ENERGY_UNITS = Object.freeze(['TJ', 'MJ']);

export const resolveStandardGhgFieldOptions = ({ scopeCode } = {}) => ({
  [GHG_FIELD_OPTION_KEYS.SUBCATEGORY]: STANDARD_SUBCATEGORY_OPTIONS,
  [GHG_FIELD_OPTION_KEYS.EMISSION_FACTOR_UNIT]: STANDARD_EMISSION_FACTOR_UNITS.filter(
    (option) => option.forScope.includes(scopeCode),
  ),
  [GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_EMISSION_FACTOR_UNIT]: STANDARD_CUSTOM_FUEL_EMISSION_FACTOR_UNITS,
  [GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QUANTITY_UNIT]: CUSTOM_FUEL_QUANTITY_UNITS,
  [GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_EF_UNIT]: CUSTOM_FUEL_ENERGY_UNITS.map((unit) => `tCO2/${unit}`),
  [GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_HEAT_CV_UNIT]: CUSTOM_FUEL_ENERGY_UNITS.flatMap((numerator) =>
    CUSTOM_FUEL_QUANTITY_UNITS.map((denominator) => `${numerator}/${denominator}`),
  ),
  [GHG_FIELD_OPTION_KEYS.CUSTOM_FUEL_QTY_EF_UNIT]: CUSTOM_FUEL_QUANTITY_UNITS.map((unit) => `kgCO2/${unit}`),
});
