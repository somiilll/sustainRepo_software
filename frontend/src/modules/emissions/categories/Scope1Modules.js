/**
 * Scope 1 Category Modules
 * 
 * Modules for Scope 1 emission categories:
 * - Stationary Combustion
 * - Mobile Combustion
 * - Fugitive Emissions
 * - Process Emissions
 */

import { z } from 'zod';
import { createCategoryModule, categoryRegistry } from '../core/CategoryRegistry';

/**
 * Stationary Combustion Module
 */
const StationaryCombustionModule = createCategoryModule({
  id: 'stationary_combustion',
  name: 'Stationary Combustion',
  scope: 'scope1',
  description: 'Emissions from burning fuels in stationary equipment',
  methods: [],
  requiresSubcategory: false,
  requiresAssetName: false,
  supportsMonthly: true,
  supportsYearly: true,
  
  fields: [
    {
      key: 'fuel_id',
      label: 'Fuel Type',
      type: 'select',
      required: true,
    },
    {
      key: 'qty',
      label: 'Quantity',
      type: 'number',
      required: true,
      unitSource: 'fuel',
    },
    {
      key: 'cv',
      label: 'Calorific Value',
      type: 'override',
      required: false,
      unit: 'MJ/kg',
      isOverride: true,
    },
    {
      key: 'density',
      label: 'Density',
      type: 'override',
      required: false,
      unit: 'kg/L',
      isOverride: true,
      visibilityCondition: (formData, ctx) => ctx.isVolumeUnit,
    },
  ],
  
  validationSchema: z.object({
    fuel_id: z.string().min(1, 'Fuel type is required'),
    qty: z.number().positive('Quantity must be positive'),
    qty_unit: z.string().optional(),
    cv: z.number().optional(),
    density: z.number().optional(),
  }),
  
  getDefaultValues: () => ({
    fuel_id: '',
    qty: '',
    qty_unit: 'kg',
    cv: '',
    cv_unit: 'MJ/kg',
    density: '',
    override_cv: false,
    override_density: false,
  }),
  
  buildPayload: (formData, context) => {
    const {
      facilityId,
      category,
      reportingPeriod,
      frequencyType,
      responsiblePerson,
      processNames,
      notes,
      fuelData,
      calcEngineResult,
    } = context;
    
    const dynamicFieldValues = {
      qty: {
        value: parseFloat(formData.qty) || 0,
        unit: formData.qty_unit || 'kg',
      },
    };
    
    if (formData.override_cv && formData.cv) {
      dynamicFieldValues.cv = {
        value: parseFloat(formData.cv),
        unit: formData.cv_unit || 'MJ/kg',
        is_override: true,
        justification: formData.cv_justification || '',
      };
    }
    
    if (formData.override_density && formData.density) {
      dynamicFieldValues.density = {
        value: parseFloat(formData.density),
        unit: 'kg/L',
        is_override: true,
        justification: formData.density_justification || '',
      };
    }
    
    return {
      facility_id: facilityId,
      scope: 'scope1',
      category: category || 'Stationary Combustion',
      reporting_period: reportingPeriod,
      frequency_type: frequencyType,
      fuel_database_id: formData.fuel_id,
      fuel_type: fuelData?.fuel_name || '',
      responsible_person: responsiblePerson,
      process_names: processNames?.filter(p => p.name).map(p => p.name) || [],
      process_descriptions: processNames?.filter(p => p.name) || [],
      notes: notes,
      dynamic_field_values: dynamicFieldValues,
      calc_engine_result: calcEngineResult,
    };
  },
  
  normalizeData: (apiData) => {
    const dfv = apiData.dynamic_field_values || {};
    
    return {
      fuel_id: apiData.fuel_database_id || '',
      qty: dfv.qty?.value?.toString() || '',
      qty_unit: dfv.qty?.unit || 'kg',
      cv: dfv.cv?.value?.toString() || '',
      cv_unit: dfv.cv?.unit || 'MJ/kg',
      cv_justification: dfv.cv?.justification || '',
      override_cv: dfv.cv?.is_override || false,
      density: dfv.density?.value?.toString() || '',
      density_justification: dfv.density?.justification || '',
      override_density: dfv.density?.is_override || false,
    };
  },
  
  autoRegister: true,
});

// Register alternative names
categoryRegistry.register('scope1_stationary', StationaryCombustionModule);

/**
 * Mobile Combustion Module
 */
const MobileCombustionModule = createCategoryModule({
  id: 'mobile_combustion',
  name: 'Mobile Combustion',
  scope: 'scope1',
  description: 'Emissions from burning fuels in mobile sources (vehicles)',
  methods: [],
  requiresSubcategory: false,
  requiresAssetName: false,
  supportsMonthly: true,
  supportsYearly: true,
  
  fields: [
    {
      key: 'fuel_id',
      label: 'Fuel Type',
      type: 'select',
      required: true,
    },
    {
      key: 'qty',
      label: 'Quantity',
      type: 'number',
      required: true,
      unitSource: 'fuel',
    },
    {
      key: 'cv',
      label: 'Calorific Value',
      type: 'override',
      required: false,
      unit: 'MJ/kg',
      isOverride: true,
    },
    {
      key: 'density',
      label: 'Density',
      type: 'override',
      required: false,
      unit: 'kg/L',
      isOverride: true,
      visibilityCondition: (formData, ctx) => ctx.isVolumeUnit,
    },
  ],
  
  validationSchema: z.object({
    fuel_id: z.string().min(1, 'Fuel type is required'),
    qty: z.number().positive('Quantity must be positive'),
  }),
  
  getDefaultValues: () => ({
    fuel_id: '',
    qty: '',
    qty_unit: 'L',
    cv: '',
    cv_unit: 'MJ/kg',
    density: '',
    override_cv: false,
    override_density: false,
  }),
  
  buildPayload: (formData, context) => {
    // Similar to StationaryCombustion
    return StationaryCombustionModule.buildPayload(formData, {
      ...context,
      category: context.category || 'Mobile Combustion',
    });
  },
  
  normalizeData: StationaryCombustionModule.normalizeData,
  autoRegister: true,
});

categoryRegistry.register('scope1_mobile', MobileCombustionModule);

/**
 * Fugitive Emissions Module
 */
const FugitiveEmissionsModule = createCategoryModule({
  id: 'fugitive_emissions',
  name: 'Fugitive Emissions',
  scope: 'scope1',
  description: 'Emissions from leaks and other non-combustion releases',
  methods: [],
  requiresSubcategory: false,
  requiresAssetName: false,
  supportsMonthly: true,
  supportsYearly: true,
  
  fields: [
    {
      key: 'activity_id',
      label: 'Emission Source',
      type: 'select',
      required: true,
    },
    {
      key: 'qty',
      label: 'Quantity',
      type: 'number',
      required: true,
      allowedUnits: ['kg', 'g', 't'],
    },
  ],
  
  validationSchema: z.object({
    activity_id: z.string().min(1, 'Emission source is required'),
    qty: z.number().positive('Quantity must be positive'),
  }),
  
  getDefaultValues: () => ({
    activity_id: '',
    qty: '',
    qty_unit: 'kg',
  }),
  
  buildPayload: (formData, context) => {
    const {
      facilityId,
      category,
      reportingPeriod,
      frequencyType,
      responsiblePerson,
      processNames,
      notes,
      activityData,
      calcEngineResult,
    } = context;
    
    return {
      facility_id: facilityId,
      scope: 'scope1',
      category: category || 'Fugitive Emissions',
      reporting_period: reportingPeriod,
      frequency_type: frequencyType,
      fugitive_ef_id: formData.activity_id,
      fugitive_source: activityData?.activity || activityData?.fuel_name || '',
      responsible_person: responsiblePerson,
      process_names: processNames?.filter(p => p.name).map(p => p.name) || [],
      process_descriptions: processNames?.filter(p => p.name) || [],
      notes: notes,
      dynamic_field_values: {
        qty: {
          value: parseFloat(formData.qty) || 0,
          unit: formData.qty_unit || 'kg',
        },
      },
      calc_engine_result: calcEngineResult,
    };
  },
  
  normalizeData: (apiData) => {
    const dfv = apiData.dynamic_field_values || {};
    
    return {
      activity_id: apiData.fugitive_ef_id || '',
      qty: dfv.qty?.value?.toString() || '',
      qty_unit: dfv.qty?.unit || 'kg',
    };
  },
  
  autoRegister: true,
});

categoryRegistry.register('scope1_fugitive', FugitiveEmissionsModule);

/**
 * Generic Scope 1 Fallback Module
 */
const GenericScope1Module = createCategoryModule({
  id: 'generic_scope1',
  name: 'Scope 1 Emission',
  scope: 'scope1',
  description: 'Generic Scope 1 emission entry',
  methods: [],
  supportsMonthly: true,
  supportsYearly: true,
  
  fields: [
    {
      key: 'fuel_id',
      label: 'Fuel Type',
      type: 'select',
      required: true,
    },
    {
      key: 'qty',
      label: 'Quantity',
      type: 'number',
      required: true,
      unitSource: 'fuel',
    },
  ],
  
  validationSchema: z.object({
    fuel_id: z.string().min(1, 'Fuel type is required'),
    qty: z.number().positive('Quantity must be positive'),
  }),
  
  getDefaultValues: () => ({
    fuel_id: '',
    qty: '',
    qty_unit: 'kg',
  }),
  
  buildPayload: StationaryCombustionModule.buildPayload,
  normalizeData: StationaryCombustionModule.normalizeData,
  
  autoRegister: false,
});

// Register as generic fallback
categoryRegistry.registerGeneric('scope1', GenericScope1Module);

export {
  StationaryCombustionModule,
  MobileCombustionModule,
  FugitiveEmissionsModule,
  GenericScope1Module,
};

export default {
  StationaryCombustionModule,
  MobileCombustionModule,
  FugitiveEmissionsModule,
  GenericScope1Module,
};
