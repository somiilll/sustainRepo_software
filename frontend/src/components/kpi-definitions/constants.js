/**
 * KPI Definition Constants
 * Centralized enums, labels, and configuration for the KPI Definition module.
 */

export const SOURCE_TYPES = {
  records: { label: 'ESG Records', description: 'Pull from ESG Records data' },
  framework_question: { label: 'Framework Question', description: 'Link to questionnaire response' },
  manual: { label: 'Manual Input', description: 'User enters value directly' },
  calculated: { label: 'Calculated', description: 'Derived from other KPIs' },
  external_api: { label: 'External API', description: 'Fetch from external source' },
};

export const AGGREGATION_TYPES = {
  sum: { label: 'Sum', description: 'Total of all values' },
  count: { label: 'Count', description: 'Number of records' },
  avg: { label: 'Average', description: 'Mean value' },
  min: { label: 'Minimum', description: 'Lowest value' },
  max: { label: 'Maximum', description: 'Highest value' },
  formula: { label: 'Formula', description: 'Custom calculation' },
};

export const OUTPUT_TYPES = {
  number: { label: 'Number', icon: 'hash' },
  percentage: { label: 'Percentage', icon: 'percent' },
  currency: { label: 'Currency', icon: 'dollar-sign' },
  boolean: { label: 'Yes/No', icon: 'toggle-left' },
  text: { label: 'Text', icon: 'type' },
  rating: { label: 'Rating', icon: 'star' },
};

export const FILTER_OPERATORS = {
  '=': 'Equals',
  '!=': 'Not Equals',
  '>': 'Greater Than',
  '<': 'Less Than',
  '>=': 'Greater or Equal',
  '<=': 'Less or Equal',
  'in': 'In List',
  'not_in': 'Not In List',
  'between': 'Between',
  'contains': 'Contains',
  'starts_with': 'Starts With',
};

export const KPI_STATUSES = {
  draft: { label: 'Draft', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  active: { label: 'Active', color: 'bg-green-100 text-green-800 border-green-300' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-600 border-gray-300' },
  deprecated: { label: 'Deprecated', color: 'bg-red-100 text-red-800 border-red-300' },
};

export const ESG_SECTIONS = {
  environment: { label: 'Environment', color: 'bg-emerald-500', prefix: 'ENV' },
  social: { label: 'Social', color: 'bg-blue-500', prefix: 'SOC' },
  governance: { label: 'Governance', color: 'bg-purple-500', prefix: 'GOV' },
};

export const WIZARD_STEPS = [
  { id: 'identity', label: 'Identity', description: 'Name, code, and description' },
  { id: 'source', label: 'Data Source', description: 'Where data comes from' },
  { id: 'query', label: 'Query Builder', description: 'Filters, dimensions, aggregation' },
  { id: 'units', label: 'Units', description: 'Measurement and display settings' },
  { id: 'settings', label: 'Settings', description: 'Visibility and status' },
];

export const DEFAULT_VISIBILITY = {
  dashboard_enabled: true,
  reports_enabled: true,
  tracking_enabled: true,
  target_enabled: true,
  analytics_enabled: true,
};

export const DEFAULT_DISPLAY_CONFIG = {
  decimal_places: 2,
  display_order: 0,
  category_order: 0,
};

// Common dimension options
export const DIMENSION_OPTIONS = [
  { value: 'organization', label: 'Organization' },
  { value: 'facility', label: 'Facility' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'category', label: 'Category' },
  { value: 'subcategory', label: 'Subcategory' },
  { value: 'gender', label: 'Gender' },
  { value: 'region', label: 'Region' },
  { value: 'department', label: 'Department' },
];

// Common unit presets
export const UNIT_PRESETS = {
  emissions: ['tCO2e', 'kgCO2e', 'MtCO2e'],
  energy: ['kWh', 'MWh', 'GWh', 'TJ', 'GJ'],
  mass: ['kg', 'tonnes', 'g'],
  volume: ['L', 'kL', 'm³'],
  area: ['m²', 'hectares', 'km²'],
  currency: ['USD', 'EUR', 'INR'],
  count: ['count', 'number', 'units'],
  percentage: ['%'],
  intensity: ['tCO2e/unit', 'kgCO2e/unit', 'tCO2e/revenue'],
};
