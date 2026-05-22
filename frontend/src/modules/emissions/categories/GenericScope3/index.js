/**
 * Generic Scope 3 Module
 * 
 * Fallback module for Scope 3 categories that don't have specific implementations.
 * Provides basic functionality using dynamic form config from the backend.
 */

import { z } from 'zod';
import { createCategoryModule, categoryRegistry } from '../../core/CategoryRegistry';

/**
 * Module Configuration
 */
const config = {
  id: 'generic_scope3',
  name: 'Scope 3 Emission',
  scope: 'scope3',
  description: 'Generic Scope 3 emission entry',
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  activityTypes: [],
  requiresSubcategory: false,
  supportsMultiEmployee: false,
  supportsMonthly: true,
  supportsYearly: true,
};

/**
 * Base fields - method selection only, rest comes from backend form config
 */
const fields = [
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
  {
    key: 'activity_id',
    label: 'Activity',
    type: 'select',
    required: true,
    visibilityCondition: (formData, ctx) => {
      return formData.calculation_method !== 'supplier_basis' && 
             ctx.filteredActivities?.length > 0;
    },
  },
  {
    key: 'custom_activity',
    label: 'Activity Name',
    type: 'text',
    required: true,
    placeholder: 'Enter activity name',
    visibilityCondition: (formData) => formData.calculation_method === 'supplier_basis',
  },
];

/**
 * Basic validation schema
 */
const validationSchema = z.object({
  calculation_method: z.string().min(1, 'Calculation method is required'),
  activity_id: z.string().optional(),
  custom_activity: z.string().optional(),
});

/**
 * Default values
 */
const getDefaultValues = () => ({
  calculation_method: '',
  activity_id: '',
  custom_activity: '',
});

/**
 * Build API Payload
 */
const buildPayload = (formData, context) => {
  const {
    facilityId,
    category,
    reportingPeriod,
    frequencyType,
    responsiblePerson,
    responsiblePersonDesignation,
    responsiblePersonContact,
    processNames,
    notes,
    dynamicFieldValues,
    calcEngineResult,
  } = context;
  
  return {
    facility_id: facilityId,
    scope: 'scope3',
    category: category,
    reporting_period: reportingPeriod,
    frequency_type: frequencyType,
    calculation_method_scope3: formData.calculation_method,
    scope3_ef_id: formData.activity_id || null,
    scope3_activity: formData.custom_activity || null,
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation,
    responsible_person_contact: responsiblePersonContact,
    process_names: processNames?.filter(p => p.name).map(p => p.name) || [],
    process_descriptions: processNames?.filter(p => p.name) || [],
    notes: notes,
    dynamic_field_values: dynamicFieldValues,
    calc_engine_result: calcEngineResult,
  };
};

/**
 * Normalize API Response
 */
const normalizeData = (apiData) => {
  const dfv = apiData.dynamic_field_values || {};
  
  return {
    calculation_method: apiData.calculation_method_scope3 || '',
    activity_id: apiData.scope3_ef_id || '',
    custom_activity: apiData.scope3_activity || '',
    // Dynamic fields will be populated from dfv by the form
    ...Object.fromEntries(
      Object.entries(dfv).map(([key, value]) => [
        key,
        typeof value === 'object' && value?.value !== undefined ? value.value : value
      ])
    ),
  };
};

/**
 * Create module
 */
const GenericScope3Module = createCategoryModule({
  ...config,
  fields,
  validationSchema,
  getDefaultValues,
  buildPayload,
  normalizeData,
  autoRegister: false, // Don't auto-register, we register manually as fallback
});

// Register as generic fallback for scope3
categoryRegistry.registerGeneric('scope3', GenericScope3Module);

export default GenericScope3Module;
