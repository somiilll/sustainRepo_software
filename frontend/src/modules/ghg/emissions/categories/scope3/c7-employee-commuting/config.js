/**
 * C7 - Employee Commuting
 * Category Module Configuration
 * 
 * C7 is the most complex Scope 3 category with:
 * - Multi-employee support
 * - Monthly and yearly entry modes
 * - Activity type filtering (air_travel, rail_travel, road_travel, etc.)
 * - Supplier-based, activity-based calculation methods
 * - Per-employee and per-month calculations
 */

export const config = {
  code: 'c7',
  name: 'C7 - Employee Commuting',
  scope: 'scope3',
  
  // UI features
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: true,  // Requires activity type selection
  
  // Entry modes
  supportsMonthly: true,
  supportsYearly: true,
  
  // Special features - C7 specific
  multiEmployee: true,  // Uses multi-employee input
  
  // Available calculation methods
  methods: ['activity_basis', 'supplier_basis'],
  
  // Activity types for C7
  activityTypes: [
    { value: 'air_travel', label: 'Air Travel' },
    { value: 'rail_travel', label: 'Rail Travel' },
    { value: 'road_travel', label: 'Road Travel' },
    { value: 'bus_travel', label: 'Bus Travel' },
    { value: 'car_travel', label: 'Car Travel' },
    { value: 'bike_travel', label: 'Bike/Motorcycle Travel' },
    { value: 'ferry_travel', label: 'Ferry Travel' },
  ],
  
  // Description for UI
  description: 'Emissions from employee commuting between home and work',
  
  // Help text
  helpText: {
    activity_basis: 'Use average emission factors based on transport mode, distance, and number of commute days',
    supplier_basis: 'Enter supplier-specific emission factors when you have actual commuting data from employees',
  },
  
  // API endpoints
  endpoints: {
    monthly: '/api/emissions/c7/month',
    yearly: '/api/emissions/c7/yearly',
  },
  
  // Employee input fields configuration
  employeeFields: {
    activity_basis: [
      { variable: 'km_travelled', label: 'Distance Travelled', type: 'number', unit: 'km', required: true },
      { variable: 'no_of_days', label: 'No. of Days Travelled', type: 'number', unit: 'days', required: true },
    ],
    supplier_basis: [
      { variable: 'activity_value_supplier_based', label: 'Activity Value', type: 'number', unit: '', required: true },
      { variable: 'emission_factor_supplier_based', label: 'Emission Factor', type: 'number', unit: 'kgCO2e/unit', required: true, isOverridable: true },
    ],
  },
};

// Month definitions for C7
export const C7_MONTHS = [
  { key: 'jan', label: 'January', short: 'Jan' },
  { key: 'feb', label: 'February', short: 'Feb' },
  { key: 'mar', label: 'March', short: 'Mar' },
  { key: 'apr', label: 'April', short: 'Apr' },
  { key: 'may', label: 'May', short: 'May' },
  { key: 'jun', label: 'June', short: 'Jun' },
  { key: 'jul', label: 'July', short: 'Jul' },
  { key: 'aug', label: 'August', short: 'Aug' },
  { key: 'sep', label: 'September', short: 'Sep' },
  { key: 'oct', label: 'October', short: 'Oct' },
  { key: 'nov', label: 'November', short: 'Nov' },
  { key: 'dec', label: 'December', short: 'Dec' },
];

// Get employee input fields based on calculation method
export const getEmployeeFields = (calculationMethod) => {
  if (calculationMethod === 'supplier_basis' || calculationMethod === 'supplier_based') {
    return config.employeeFields.supplier_basis;
  }
  return config.employeeFields.activity_basis;
};

export default config;
