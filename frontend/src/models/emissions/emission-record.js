/**
 * Emission Record Model
 * Defines the structure of emission records
 * 
 * This serves as documentation and reference for:
 * - API response structure
 * - Form data structure
 * - Database schema alignment
 */

/**
 * Base emission record fields (common to all scopes)
 * @typedef {Object} BaseEmissionRecord
 * @property {string} id - Unique identifier
 * @property {string} facility_id - Facility reference
 * @property {string} organization_id - Organization reference
 * @property {string} scope - Scope identifier (scope1, scope2, scope3)
 * @property {string} category - Category name
 * @property {string} sub_category - Subcategory/activity name
 * @property {string} reporting_period - Reporting period (YYYY-MM or FY format)
 * @property {number} quantity - Activity quantity
 * @property {string} unit - Unit of measurement
 * @property {number} emission_factor - Emission factor used
 * @property {string} ef_unit - Emission factor unit
 * @property {string} ef_source - Emission factor source
 * @property {number} co2_emissions - CO2 emissions (tonnes)
 * @property {number} ch4_emissions - CH4 emissions (tonnes CO2e)
 * @property {number} n2o_emissions - N2O emissions (tonnes CO2e)
 * @property {number} co2e_emissions - Total CO2e emissions
 * @property {number} total_emissions - Total emissions (same as co2e_emissions)
 * @property {string} notes - User notes
 * @property {string} responsible_person - Responsible person name
 * @property {string} responsible_person_designation - Designation
 * @property {string} responsible_person_contact - Contact info
 * @property {string} evidence_url - Evidence file URL
 * @property {string} evidence_file_name - Evidence file name
 * @property {Object} dynamic_field_values - Dynamic input values
 * @property {number} version - Record version
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 * @property {string} created_by - Created by user ID
 * @property {string} updated_by - Updated by user ID
 */

/**
 * Scope 3 specific fields
 * @typedef {Object} Scope3EmissionFields
 * @property {string} calculation_method_scope3 - Calculation method
 * @property {string} scope3_ef_id - Scope 3 EF reference
 * @property {string} scope3_activity - Activity name
 * @property {string} scope3_activity_type - Activity type (for C6/C7)
 */

/**
 * C7 Employee Commuting specific fields
 * @typedef {Object} C7EmissionFields
 * @property {Array} employees - Employee data array
 * @property {Object} monthly_totals - Monthly emission totals
 * @property {Object} yearly_total - Yearly emission total
 * @property {string} activity_type - Activity type
 * @property {string} formula_id - Formula used
 * @property {string} formula_name - Formula name
 */

/**
 * Dynamic field value structure
 * @typedef {Object} DynamicFieldValue
 * @property {*} value - Field value
 * @property {string} unit - Unit of measurement
 * @property {boolean} [is_override] - Whether this is a user override
 */

// Field keys for validation and processing
export const BASE_FIELDS = [
  'id',
  'facility_id',
  'organization_id',
  'scope',
  'category',
  'sub_category',
  'reporting_period',
  'quantity',
  'unit',
  'emission_factor',
  'ef_unit',
  'ef_source',
  'co2_emissions',
  'ch4_emissions',
  'n2o_emissions',
  'co2e_emissions',
  'total_emissions',
  'notes',
  'responsible_person',
  'responsible_person_designation',
  'responsible_person_contact',
  'evidence_url',
  'evidence_file_name',
  'dynamic_field_values',
  'version',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
];

export const SCOPE3_FIELDS = [
  'calculation_method_scope3',
  'scope3_ef_id',
  'scope3_activity',
  'scope3_activity_type',
];

export const C7_FIELDS = [
  'employees',
  'monthly_totals',
  'yearly_total',
  'activity_type',
  'formula_id',
  'formula_name',
];

/**
 * Default emission record values
 */
export const defaultEmissionRecord = {
  facility_id: '',
  scope: 'scope1',
  category: '',
  sub_category: '',
  reporting_period: '',
  quantity: null,
  unit: '',
  emission_factor: null,
  ef_unit: '',
  ef_source: '',
  co2_emissions: 0,
  ch4_emissions: 0,
  n2o_emissions: 0,
  co2e_emissions: 0,
  total_emissions: 0,
  notes: '',
  responsible_person: '',
  responsible_person_designation: '',
  responsible_person_contact: '',
  evidence_url: '',
  evidence_file_name: '',
  dynamic_field_values: {},
  version: 0,
};

/**
 * Create a new emission record with defaults
 * @param {Object} overrides - Field overrides
 * @returns {Object} Emission record
 */
export const createEmissionRecord = (overrides = {}) => ({
  ...defaultEmissionRecord,
  ...overrides,
});

export default {
  BASE_FIELDS,
  SCOPE3_FIELDS,
  C7_FIELDS,
  defaultEmissionRecord,
  createEmissionRecord,
};
