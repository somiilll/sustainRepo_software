/**
 * Scope 3 Category Definitions
 * 
 * Central configuration for all Scope 3 categories.
 * Used to generate category modules automatically.
 */

import { z } from 'zod';

/**
 * Activity types for travel categories (C6, C7)
 */
export const TRAVEL_ACTIVITY_TYPES = [
  { value: 'car_travel', label: 'Car Travel' },
  { value: 'bus_travel', label: 'Bus Travel' },
  { value: 'rail_travel', label: 'Rail Travel' },
  { value: 'air_travel', label: 'Air Travel' },
  { value: 'taxi_travel', label: 'Taxi Travel' },
  { value: 'bike_travel', label: 'Bike Travel' },
  { value: 'water_travel', label: 'Water Travel' },
  { value: 'hotel_stay', label: 'Hotel Stay' },
  { value: 'others', label: 'Others' },
];

/**
 * Subcategory options for applicable categories
 */
export const SUBCATEGORY_OPTIONS = {
  c8: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c10: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c11: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c13: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c14: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
};

/**
 * Category Configurations
 * Each category defines its specific requirements and behavior
 */
export const CATEGORY_CONFIGS = {
  c1: {
    id: 'c1',
    name: 'C1 - Purchased Goods and Services',
    description: 'Emissions from production of goods and services purchased by the organization',
    methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c2: {
    id: 'c2',
    name: 'C2 - Capital Goods',
    description: 'Emissions from production of capital goods purchased by the organization',
    methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c3: {
    id: 'c3',
    name: 'C3 - Fuel and Energy Related Activities',
    description: 'Emissions from production of fuels and energy purchased and consumed',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c4: {
    id: 'c4',
    name: 'C4 - Upstream Transportation and Distribution',
    description: 'Emissions from transportation and distribution of purchased products',
    methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: true,
    supportsMultiEmployee: false,
  },
  c5: {
    id: 'c5',
    name: 'C5 - Waste Generated in Operations',
    description: 'Emissions from disposal and treatment of waste generated in operations',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c6: {
    id: 'c6',
    name: 'C6 - Business Travel',
    description: 'Emissions from transportation of employees for business-related activities',
    methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
    activityTypes: TRAVEL_ACTIVITY_TYPES,
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: true,
    supportsMultiEmployee: false,
  },
  c8: {
    id: 'c8',
    name: 'C8 - Upstream Leased Assets',
    description: 'Emissions from operation of assets leased by the organization',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: true,
    subcategoryOptions: SUBCATEGORY_OPTIONS.c8,
    requiresAssetName: true,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c9: {
    id: 'c9',
    name: 'C9 - Downstream Transportation and Distribution',
    description: 'Emissions from transportation and distribution of sold products',
    methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: true,
    supportsMultiEmployee: false,
  },
  c10: {
    id: 'c10',
    name: 'C10 - Processing of Sold Products',
    description: 'Emissions from processing of intermediate products sold by the organization',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: true,
    subcategoryOptions: SUBCATEGORY_OPTIONS.c10,
    requiresAssetName: false,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c11: {
    id: 'c11',
    name: 'C11 - Use of Sold Products',
    description: 'Emissions from the use of goods and services sold by the organization',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: true,
    subcategoryOptions: SUBCATEGORY_OPTIONS.c11,
    requiresAssetName: false,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c12: {
    id: 'c12',
    name: 'C12 - End-of-Life Treatment of Sold Products',
    description: 'Emissions from waste disposal and treatment of products sold',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: false,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c13: {
    id: 'c13',
    name: 'C13 - Downstream Leased Assets',
    description: 'Emissions from operation of assets owned and leased to other entities',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: true,
    subcategoryOptions: SUBCATEGORY_OPTIONS.c13,
    requiresAssetName: true,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c14: {
    id: 'c14',
    name: 'C14 - Franchises',
    description: 'Emissions from operation of franchises not included in scope 1 or 2',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: true,
    subcategoryOptions: SUBCATEGORY_OPTIONS.c14,
    requiresAssetName: true,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
  c15: {
    id: 'c15',
    name: 'C15 - Investments',
    description: 'Emissions from investments not included in scope 1 or 2',
    methods: ['activity_basis', 'supplier_basis'],
    requiresSubcategory: false,
    requiresAssetName: true,
    requiresLocation: false,
    supportsMultiEmployee: false,
  },
};

/**
 * Base fields for all Scope 3 categories
 */
export const getBaseFields = (config) => {
  const fields = [
    // Calculation method - always required
    {
      key: 'calculation_method',
      label: 'Calculation Method',
      type: 'select',
      required: true,
      options: config.methods.map(m => ({
        value: m,
        label: m === 'activity_basis' ? 'Average Data Based' :
               m === 'spend_basis' ? 'Spend Based' : 'Supplier Based'
      })),
    },
  ];
  
  // Activity type for travel categories
  if (config.activityTypes) {
    fields.push({
      key: 'activity_type',
      label: 'Activity Type',
      type: 'select',
      required: true,
      options: config.activityTypes,
      visibilityCondition: (formData) => !!formData.calculation_method,
    });
  }
  
  // Subcategory for applicable categories
  if (config.requiresSubcategory) {
    fields.push({
      key: 'subcategory',
      label: 'Subcategory',
      type: 'select',
      required: true,
      options: config.subcategoryOptions || [],
      visibilityCondition: (formData) => !!formData.calculation_method,
    });
  }
  
  // Activity selection for non-supplier basis
  fields.push({
    key: 'activity_id',
    label: 'Activity',
    type: 'select',
    required: true,
    visibilityCondition: (formData, ctx) => {
      return formData.calculation_method && 
             formData.calculation_method !== 'supplier_basis' &&
             ctx.filteredActivities?.length > 0;
    },
  });
  
  // Custom activity for supplier basis
  fields.push({
    key: 'custom_activity',
    label: 'Activity Name',
    type: 'text',
    required: true,
    placeholder: 'Enter activity name',
    visibilityCondition: (formData) => formData.calculation_method === 'supplier_basis',
  });
  
  // Asset name for applicable categories
  if (config.requiresAssetName) {
    fields.push({
      key: 'asset_name',
      label: 'Asset Name',
      type: 'text',
      required: true,
      placeholder: 'Enter asset name',
    });
  }
  
  // Location fields for transportation categories
  if (config.requiresLocation) {
    fields.push(
      {
        key: 'from_location',
        label: 'From Location',
        type: 'text',
        required: false,
        placeholder: 'Origin location',
      },
      {
        key: 'to_location',
        label: 'To Location',
        type: 'text',
        required: false,
        placeholder: 'Destination location',
      }
    );
  }
  
  // Supplier basis fields
  fields.push(
    {
      key: 'activity_value_supplier_based',
      label: 'Quantity Used',
      type: 'number',
      required: true,
      visibilityCondition: (formData) => formData.calculation_method === 'supplier_basis',
    },
    {
      key: 'emission_factor_supplier_based',
      label: 'Emission Factor',
      type: 'number',
      required: true,
      visibilityCondition: (formData) => formData.calculation_method === 'supplier_basis',
    }
  );
  
  // Spend basis field
  if (config.methods.includes('spend_basis')) {
    fields.push({
      key: 'spend_amount',
      label: 'Spend Amount',
      type: 'number',
      required: true,
      allowedUnits: ['USD', 'EUR', 'GBP', 'INR'],
      visibilityCondition: (formData) => formData.calculation_method === 'spend_basis',
    });
  }
  
  return fields;
};

/**
 * Base validation schema for Scope 3 categories
 */
export const getBaseValidationSchema = (config) => {
  const schema = {
    calculation_method: z.string().min(1, 'Calculation method is required'),
    activity_id: z.string().optional(),
    custom_activity: z.string().optional(),
  };
  
  if (config.activityTypes) {
    schema.activity_type = z.string().optional();
  }
  
  if (config.requiresSubcategory) {
    schema.subcategory = z.string().optional();
  }
  
  if (config.requiresAssetName) {
    schema.asset_name = z.string().optional();
  }
  
  if (config.requiresLocation) {
    schema.from_location = z.string().optional();
    schema.to_location = z.string().optional();
  }
  
  return z.object(schema);
};

/**
 * Get default values for a category
 */
export const getDefaultValues = (config) => {
  const defaults = {
    calculation_method: '',
    activity_id: '',
    custom_activity: '',
    activity_value_supplier_based: '',
    activity_value_supplier_based_unit: '',
    emission_factor_supplier_based: '',
    emission_factor_supplier_based_unit: 'tCO2e/kg',
  };
  
  if (config.activityTypes) {
    defaults.activity_type = '';
  }
  
  if (config.requiresSubcategory) {
    defaults.subcategory = '';
  }
  
  if (config.requiresAssetName) {
    defaults.asset_name = '';
  }
  
  if (config.requiresLocation) {
    defaults.from_location = '';
    defaults.to_location = '';
  }
  
  if (config.methods.includes('spend_basis')) {
    defaults.spend_amount = '';
    defaults.spend_amount_unit = 'USD';
  }
  
  return defaults;
};

export default CATEGORY_CONFIGS;
