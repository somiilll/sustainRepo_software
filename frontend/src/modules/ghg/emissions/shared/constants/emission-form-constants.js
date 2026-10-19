/**
 * Emission Form Constants
 * 
 * Constants used across the EmissionEntryForm and related components
 */
import {
  SUBCATEGORY_CATEGORIES,
  ASSET_NAME_CATEGORIES,
  LOCATION_CATEGORIES,
} from '../../../../../constants/categories';

// Calendar months (Jan-Dec). Canonical ordering used everywhere unless an
// explicit financial-year layout is requested.
export const MONTHS = [
  { key: '01', name: 'January', short: 'Jan' },
  { key: '02', name: 'February', short: 'Feb' },
  { key: '03', name: 'March', short: 'Mar' },
  { key: '04', name: 'April', short: 'Apr' },
  { key: '05', name: 'May', short: 'May' },
  { key: '06', name: 'June', short: 'Jun' },
  { key: '07', name: 'July', short: 'Jul' },
  { key: '08', name: 'August', short: 'Aug' },
  { key: '09', name: 'September', short: 'Sep' },
  { key: '10', name: 'October', short: 'Oct' },
  { key: '11', name: 'November', short: 'Nov' },
  { key: '12', name: 'December', short: 'Dec' },
];

// Calendar year months (Jan-Dec) — alias for clarity in financial/calendar
// year selection.
export const CALENDAR_YEAR_MONTHS = MONTHS;

// Financial year months (Apr-Mar).
export const FINANCIAL_YEAR_MONTHS = [
  { key: '04', name: 'April', short: 'Apr' },
  { key: '05', name: 'May', short: 'May' },
  { key: '06', name: 'June', short: 'Jun' },
  { key: '07', name: 'July', short: 'Jul' },
  { key: '08', name: 'August', short: 'Aug' },
  { key: '09', name: 'September', short: 'Sep' },
  { key: '10', name: 'October', short: 'Oct' },
  { key: '11', name: 'November', short: 'Nov' },
  { key: '12', name: 'December', short: 'Dec' },
  { key: '01', name: 'January', short: 'Jan' },
  { key: '02', name: 'February', short: 'Feb' },
  { key: '03', name: 'March', short: 'Mar' },
];

// Emission factor unit to quantity unit mapping
export const EMISSION_FACTOR_UNITS = [
  { value: 'tCO2/kg', label: 'tCO₂/kg', quantityUnit: 'kg', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/L', label: 'tCO₂/L', quantityUnit: 'L', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/m3', label: 'tCO₂/m³', quantityUnit: 'm³', forScope: ['scope1', 'biogenic'] },
  { value: 'tCO2/kWh', label: 'tCO₂/kWh', quantityUnit: 'kWh', forScope: ['scope2'] },
  { value: 'tCO2/MWh', label: 'tCO₂/MWh', quantityUnit: 'MWh', forScope: ['scope2'] },
];

export { SUBCATEGORY_CATEGORIES, ASSET_NAME_CATEGORIES, LOCATION_CATEGORIES };

// Fields that must be whole numbers (integers)
export const INTEGER_ONLY_FIELDS = [
  'qty_days_travelled', 'working_days', 'qty_passengers', 'qty_passenger',
  'number_of_passengers', 'qty_nights', 'number_of_nights', 'qty_rooms',
  'qty_room', 'number_of_rooms', 'no_of_employees', 'passengers_travelled'
];

// Activity type display labels for C6/C7
export const ACTIVITY_TYPE_LABELS = {
  'car_travel': 'Car Travel',
  'bus_travel': 'Bus Travel',
  'rail_travel': 'Rail Travel',
  'air_travel': 'Air Travel',
  'taxi_travel': 'Taxi Travel',
  'bike_travel': 'Bike Travel',
  'wfh': 'Work From Home',
  'water_travel': 'Water Travel',
  'hotel_stay': 'Hotel Stay',
  'others': 'Others',
};

/**
 * Get available EF units based on scope
 */
export const getAvailableEFUnits = (currentScope) => {
  return EMISSION_FACTOR_UNITS.filter(u => u.forScope.includes(currentScope));
};

/**
 * Get quantity unit based on emission factor unit for custom fuels
 */
export const getQuantityUnitFromEFUnit = (efUnit) => {
  const mapping = EMISSION_FACTOR_UNITS.find(u => u.value === efUnit);
  return mapping?.quantityUnit || 'kg';
};

/**
 * Check if a category requires subcategory selection
 */
export const requiresSubcategoryCheck = (category) => {
  if (!category) return false;
  const catLower = category.toLowerCase();
  return SUBCATEGORY_CATEGORIES.some(c => catLower.includes(c));
};

/**
 * Check if a category requires asset name
 */
export const requiresAssetNameCheck = (category) => {
  if (!category) return false;
  const catLower = category.toLowerCase();
  return ASSET_NAME_CATEGORIES.some(c => catLower.includes(c));
};

/**
 * Check if a category shows location fields
 */
export const showsLocationFieldsCheck = (category) => {
  if (!category) return false;
  const catLower = category.toLowerCase();
  return LOCATION_CATEGORIES.some(c => catLower.includes(c));
};

/**
 * Check if a category is C7 (Employee Commuting)
 */
export const isC7Check = (category) => {
  if (!category) return false;
  return category.toLowerCase().includes('c7') || 
         category.toLowerCase().includes('employee commuting');
};

/**
 * Validate if a field value should be an integer
 */
export const validateIntegerField = (fieldName, value) => {
  if (!INTEGER_ONLY_FIELDS.includes(fieldName)) return true;
  if (value === '' || value === null || value === undefined) return true;
  const numValue = parseFloat(value);
  return Number.isInteger(numValue);
};

/**
 * Format field name for display in error messages
 */
export const formatFieldName = (fieldName) => {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
};
