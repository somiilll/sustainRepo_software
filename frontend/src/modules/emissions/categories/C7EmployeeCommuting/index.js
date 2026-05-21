/**
 * C7 Employee Commuting Module
 * 
 * Reference implementation of a category module.
 * Demonstrates the plugin-style architecture with complete isolation.
 */

import { z } from 'zod';
import { createCategoryModule, categoryRegistry } from '../../core/CategoryRegistry';

/**
 * Module Configuration
 */
const config = {
  id: 'c7',
  name: 'C7 - Employee Commuting',
  scope: 'scope3',
  description: 'Emissions from employees commuting to and from work',
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  activityTypes: [
    'car_travel',
    'bus_travel',
    'rail_travel',
    'air_travel',
    'taxi_travel',
    'bike_travel',
    'wfh',
    'water_travel',
    'hotel_stay',
    'others',
  ],
  requiresSubcategory: false,
  supportsMultiEmployee: true,
  supportsMonthly: true,
  supportsYearly: true,
};

/**
 * Activity Type Labels
 */
export const activityTypeLabels = {
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
 * Field Definitions
 */
const fields = [
  // Method selection
  {
    key: 'calculation_method',
    label: 'Calculation Method',
    type: 'select',
    required: true,
    options: [
      { value: 'activity_basis', label: 'Average Data Based' },
      { value: 'spend_basis', label: 'Spend Based' },
      { value: 'supplier_basis', label: 'Supplier Based' },
    ],
  },
  
  // Activity type selection
  {
    key: 'activity_type',
    label: 'Activity Type',
    type: 'select',
    required: true,
    options: Object.entries(activityTypeLabels).map(([value, label]) => ({ value, label })),
    visibilityCondition: (formData) => !!formData.calculation_method,
  },
  
  // Activity selection (from scope3_ef database)
  {
    key: 'activity_id',
    label: 'Activity',
    type: 'select',
    required: true,
    visibilityCondition: (formData, ctx) => {
      return !!formData.activity_type && 
             formData.calculation_method !== 'supplier_basis' &&
             ctx.filteredActivities?.length > 0;
    },
  },
  
  // Custom activity name (for supplier_basis or others)
  {
    key: 'custom_activity',
    label: 'Activity Name',
    type: 'text',
    required: true,
    placeholder: 'Enter activity name',
    visibilityCondition: (formData) => {
      return formData.calculation_method === 'supplier_basis' ||
             formData.activity_type === 'others';
    },
  },
  
  // Distance field (for activity_basis car/bus/rail)
  {
    key: 'distance',
    label: 'Distance',
    type: 'number',
    required: true,
    allowedUnits: ['km', 'mi'],
    visibilityCondition: (formData) => {
      const distanceTypes = ['car_travel', 'bus_travel', 'rail_travel', 'taxi_travel', 'bike_travel'];
      return formData.calculation_method === 'activity_basis' && 
             distanceTypes.includes(formData.activity_type);
    },
  },
  
  // Working days field
  {
    key: 'working_days',
    label: 'Working Days',
    type: 'number',
    required: true,
    helpText: 'Number of working days in the period',
    visibilityCondition: (formData) => {
      return formData.calculation_method === 'activity_basis' &&
             ['car_travel', 'bus_travel', 'rail_travel'].includes(formData.activity_type);
    },
  },
  
  // Quantity for supplier basis
  {
    key: 'activity_value_supplier_based',
    label: 'Quantity Used',
    type: 'number',
    required: true,
    visibilityCondition: (formData) => formData.calculation_method === 'supplier_basis',
  },
  
  // Emission factor for supplier basis
  {
    key: 'emission_factor_supplier_based',
    label: 'Emission Factor',
    type: 'number',
    required: true,
    visibilityCondition: (formData) => formData.calculation_method === 'supplier_basis',
  },
  
  // Spend amount for spend basis
  {
    key: 'spend_amount',
    label: 'Spend Amount',
    type: 'number',
    required: true,
    allowedUnits: ['USD', 'EUR', 'GBP', 'INR'],
    visibilityCondition: (formData) => formData.calculation_method === 'spend_basis',
  },
];

/**
 * Employee-level field definitions
 */
export const employeeFields = [
  { key: 'name', label: 'Employee Name', type: 'text', required: true },
  { key: 'employee_id', label: 'Employee ID', type: 'text', required: false },
  { key: 'department', label: 'Department', type: 'text', required: false },
  { key: 'from_location', label: 'From Location', type: 'text', required: false },
  { key: 'to_location', label: 'To Location', type: 'text', required: false },
  { key: 'activity_type', label: 'Travel Mode', type: 'select', required: true },
];

/**
 * Validation Schema
 */
const validationSchema = z.object({
  calculation_method: z.string().min(1, 'Calculation method is required'),
  activity_type: z.string().min(1, 'Activity type is required'),
  activity_id: z.string().optional(),
  custom_activity: z.string().optional(),
  distance: z.number().positive().optional(),
  working_days: z.number().int().positive().optional(),
  activity_value_supplier_based: z.number().positive().optional(),
  emission_factor_supplier_based: z.number().positive().optional(),
  spend_amount: z.number().positive().optional(),
}).refine((data) => {
  // Validate supplier basis has all required fields
  if (data.calculation_method === 'supplier_basis') {
    return !!data.custom_activity && 
           !!data.activity_value_supplier_based && 
           !!data.emission_factor_supplier_based;
  }
  return true;
}, {
  message: 'Supplier basis requires activity name, quantity, and emission factor',
});

/**
 * Default Values
 */
const getDefaultValues = () => ({
  calculation_method: '',
  activity_type: '',
  activity_id: '',
  custom_activity: '',
  distance: '',
  distance_unit: 'km',
  working_days: '',
  activity_value_supplier_based: '',
  activity_value_supplier_based_unit: '',
  emission_factor_supplier_based: '',
  emission_factor_supplier_based_unit: 'tCO2e/kg',
  spend_amount: '',
  spend_amount_unit: 'USD',
});

/**
 * Build API Payload
 */
const buildPayload = (formData, context) => {
  const {
    facilityId,
    reportingPeriod,
    frequencyType,
    responsiblePerson,
    responsiblePersonDesignation,
    responsiblePersonContact,
    processNames,
    notes,
    employees,
  } = context;
  
  // Build base payload
  const basePayload = {
    facility_id: facilityId,
    scope: 'scope3',
    category: 'C7 - Employee Commuting',
    reporting_period: reportingPeriod,
    frequency_type: frequencyType,
    calculation_method_scope3: formData.calculation_method,
    scope3_activity_type: formData.activity_type,
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation,
    responsible_person_contact: responsiblePersonContact,
    process_names: processNames?.filter(p => p.name).map(p => p.name) || [],
    process_descriptions: processNames?.filter(p => p.name) || [],
    notes: notes,
  };
  
  // Handle multi-employee mode
  if (employees && employees.length > 0) {
    return {
      ...basePayload,
      is_multi_employee: true,
      employees: employees.map(emp => ({
        id: emp.id,
        name: emp.name,
        employee_id: emp.employee_id,
        department: emp.department,
        from_location: emp.from_location,
        to_location: emp.to_location,
        activity_type: emp.activity_type || formData.activity_type,
        inputs: emp.inputs || {},
        emissions: emp.emissions || {},
        calculation_details: emp.calculation_details || null,
      })),
    };
  }
  
  // Single entry mode
  if (formData.calculation_method === 'supplier_basis') {
    return {
      ...basePayload,
      scope3_activity: formData.custom_activity,
      dynamic_field_values: {
        activity_value_supplier_based: {
          value: parseFloat(formData.activity_value_supplier_based),
          unit: formData.activity_value_supplier_based_unit,
        },
        emission_factor_supplier_based: {
          value: parseFloat(formData.emission_factor_supplier_based),
          unit: formData.emission_factor_supplier_based_unit,
        },
      },
    };
  }
  
  return {
    ...basePayload,
    scope3_ef_id: formData.activity_id,
    dynamic_field_values: {
      distance: formData.distance ? {
        value: parseFloat(formData.distance),
        unit: formData.distance_unit,
      } : undefined,
      working_days: formData.working_days ? {
        value: parseInt(formData.working_days),
      } : undefined,
    },
  };
};

/**
 * Normalize API Response to Form Data
 */
const normalizeData = (apiData) => {
  const dfv = apiData.dynamic_field_values || {};
  
  return {
    calculation_method: apiData.calculation_method_scope3 || '',
    activity_type: dfv.scope3_activity_type?.value || apiData.scope3_activity_type || '',
    activity_id: apiData.scope3_ef_id || '',
    custom_activity: apiData.scope3_activity || '',
    distance: dfv.distance?.value?.toString() || '',
    distance_unit: dfv.distance?.unit || 'km',
    working_days: dfv.working_days?.value?.toString() || '',
    activity_value_supplier_based: dfv.activity_value_supplier_based?.value?.toString() || '',
    activity_value_supplier_based_unit: dfv.activity_value_supplier_based?.unit || '',
    emission_factor_supplier_based: dfv.emission_factor_supplier_based?.value?.toString() || '',
    emission_factor_supplier_based_unit: dfv.emission_factor_supplier_based?.unit || 'tCO2e/kg',
    spend_amount: dfv.spend_amount?.value?.toString() || '',
    spend_amount_unit: dfv.spend_amount?.unit || 'USD',
  };
};

/**
 * Table Column Definitions
 */
const tableColumns = [
  { key: 'reporting_period', label: 'Period', width: '100px' },
  { key: 'activity_type', label: 'Activity Type', width: '150px', 
    render: (value) => activityTypeLabels[value] || value },
  { key: 'employee_count', label: 'Employees', width: '80px', align: 'center' },
  { key: 'co2e_emissions', label: 'tCO₂e', width: '100px', align: 'right',
    render: (value) => value?.toFixed(4) || '0.0000' },
];

/**
 * Transform for Chart Display
 */
const transformForChart = (emission) => {
  const dfv = emission.dynamic_field_values || {};
  const activityType = dfv.scope3_activity_type?.value || emission.scope3_activity_type || '';
  
  return {
    label: activityTypeLabels[activityType] || 'Employee Commuting',
    value: emission.outputs?.co2e?.value || emission.co2e_emissions || 0,
    category: 'C7 - Employee Commuting',
    activityType: activityType,
    period: emission.reporting_period,
    employeeCount: emission.employees?.length || 1,
  };
};

/**
 * Upload Configuration
 */
const uploadConfig = {
  templateColumns: [
    'Employee Name',
    'Employee ID',
    'Department',
    'Activity Type',
    'From Location',
    'To Location',
    'Distance (km)',
    'Working Days',
  ],
  parseRow: (row) => ({
    name: row['Employee Name'],
    employee_id: row['Employee ID'],
    department: row['Department'],
    activity_type: row['Activity Type']?.toLowerCase().replace(/\s+/g, '_'),
    from_location: row['From Location'],
    to_location: row['To Location'],
    distance: parseFloat(row['Distance (km)']) || null,
    working_days: parseInt(row['Working Days']) || null,
  }),
  validateRow: (row, index) => {
    const errors = [];
    if (!row.name) errors.push(`Row ${index + 1}: Employee Name is required`);
    if (!row.activity_type) errors.push(`Row ${index + 1}: Activity Type is required`);
    return { valid: errors.length === 0, errors };
  },
};

/**
 * Create and export the module
 */
const C7EmployeeCommutingModule = createCategoryModule({
  ...config,
  fields,
  validationSchema,
  getDefaultValues,
  buildPayload,
  normalizeData,
  tableColumns,
  transformForChart,
  uploadConfig,
});

// Also register with alternative names
categoryRegistry.register('employee_commuting', C7EmployeeCommutingModule);
categoryRegistry.register('c7_employee_commuting', C7EmployeeCommutingModule);

export default C7EmployeeCommutingModule;
export { config, fields, employeeFields, validationSchema };
