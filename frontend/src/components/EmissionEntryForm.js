import React, { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Plus, Trash2, Upload, X, Check, ChevronRight, ChevronLeft, Info, Eye, Download, FileText, Loader2, Search, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';
import MultiEmployeeInput from './MultiEmployeeInput';

// Import Step components for modular form rendering
import { Step1BasicSelection } from '../modules/ghg/emissions/shared/components/steps/Step1BasicSelection';
import { Step2ProcessResponsibility } from '../modules/ghg/emissions/shared/components/steps/Step2ProcessResponsibility';
import { Step3YearMonthlyData } from '../modules/ghg/emissions/shared/components/steps/Step3YearMonthlyData';
import { Step4Notes } from '../modules/ghg/emissions/shared/components/steps/Step4Notes';
import { categoryRegistry } from '../modules/emissions';
import {
  MONTHS,
  CALENDAR_YEAR_MONTHS,
  FINANCIAL_YEAR_MONTHS,
} from '../modules/ghg/emissions/shared/constants/emission-form-constants';
import useEmissionFormState from '../modules/ghg/emissions/shared/hooks/useEmissionFormState';
import useEmissionFormEffects from '../modules/ghg/emissions/shared/hooks/useEmissionFormEffects';
import useEmissionSubmit from '../modules/ghg/emissions/shared/hooks/useEmissionSubmit';
import { canProceedToStep as canProceedToStepUtil } from '../modules/ghg/emissions/shared/utils/validation';
import {
  DynamicFieldRenderer,
  getFieldUnits as getFieldUnitsShared,
} from '../modules/ghg/emissions/shared/components/DynamicFieldRenderer';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to check if unit is volume-based (from centralized units)
const isVolumeUnit = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => u.symbol?.toLowerCase() === unit?.toLowerCase());
  return unitDef?.unit_type === 'volume';
};

// Density dimension-mismatch helpers (canonical source: shared/utils/unitHelpers.js)
import {
  isDensityRequiredForQtyBasis,
  isDensityRequiredForHeatBasis,
  isDensityRequiredForCarbonComposition,
} from '../modules/ghg/emissions/shared/utils/unitHelpers';

// Helper to check if a month/year combination is in the future
const isFutureMonth = (monthKey, year, yearType = 'calendar') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  
  let selectedYear = parseInt(year);
  const selectedMonth = parseInt(monthKey);
  
  // For financial year: Jan-Mar belong to next calendar year
  if (yearType === 'financial' && selectedMonth >= 1 && selectedMonth <= 3) {
    selectedYear = selectedYear + 1;
  }
  
  if (selectedYear > currentYear) return true;
  if (selectedYear === currentYear && selectedMonth > currentMonth) return true;
  return false;
};

export default function EmissionEntryForm({
  facilities,
  fuelDatabase,
  centralizedUnits,
  formulaDefinitions = [],
  formulaParameters = [],
  emissionConfigurations = [],
  gwpConfig = null,
  processTemplates = [],
  dynamicScopes = [],
  dynamicCategories = [],
  hasScope3Access = false,
  getAuthHeader,
  onSuccess,
  onCancel,
  onFormChange, // Callback when form becomes dirty (#19)
  editingEmission = null,
  configLabels = null, // Centralized label configuration
  organization = null, // Organization data for reporting year type
  // KPI Access Control props
  kpiAccessInfo = null,
  kpiCanAccessScope = null,
  kpiCanAccessPeriod = null,
  kpiGetPeriodRestrictions = null,
  kpiAllowedScopes = null,
  kpiPeriodRestrictions = null,
  filterFacilitiesByScope = null,
  hasFullKPIAccess = true,
  // Supplier context for supplier portal emissions
  supplierContext = null,
  // OCR Prefill Data - from AI Invoice Extractor workflow
  ocrPrefillData = null,
}) {
  // Helper to get method labels from centralized config (no hardcoded fallbacks)
  const getMethodLabel = useCallback((method, short = false) => {
    if (!method) return '-';
    if (configLabels) {
      const labels = short ? configLabels.calculation_methods_short : configLabels.calculation_methods;
      return labels?.[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [configLabels]);
  
  // Helper to get subcategory labels from centralized config
  const getSubcategoryLabel = useCallback((subcategory) => {
    if (!subcategory) return '-';
    if (configLabels?.subcategories) {
      return configLabels.subcategories[subcategory] || subcategory.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return subcategory.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [configLabels]);

  // ============================================================================
  // F2: Centralized form state — replaces ~60 inline useState calls.
  // The hook also owns 4 useEffects (org year-type sync, decisionFieldValues sync,
  // custom-activity auto-enable, editingEmission frequency_type/yearlyData load).
  // Those inline useEffects below this block were removed during F2 integration.
  // ============================================================================
  const _formState = useEmissionFormState({ organization, editingEmission });
  const {
    // Step navigation
    currentStep, setCurrentStep,
    totalSteps,
    // Step 1: Basic Selection
    facilityId, setFacilityId,
    scope, setScope,
    category, setCategory,
    fuelId, setFuelId,
    useCustomFuel, setUseCustomFuel,
    customFuelName, setCustomFuelName,
    customEmissionFactor, setCustomEmissionFactor,
    customEmissionFactorUnit, setCustomEmissionFactorUnit,
    customSource, setCustomSource,
    isSaving, setIsSaving,
    fuelSearchTerm, setFuelSearchTerm,
    // Scope 3
    scope3Method, setScope3Method,
    scope3EFData, setScope3EFData,
    scope3ActivityId, setScope3ActivityId,
    scope3ActivityType, setScope3ActivityType,
    scope3Subcategory, setScope3Subcategory,
    typeOfProduct, setTypeOfProduct,
    scope3CustomActivity, setScope3CustomActivity,
    useCustomActivity, setUseCustomActivity,
    fugitiveEmissionsData, setFugitiveEmissionsData,
    loadingScope3EF, setLoadingScope3EF,
    assetName, setAssetName,
    fromLocation, setFromLocation,
    toLocation, setToLocation,
    // Biogenic
    biogenicScopeSelection, setBiogenicScopeSelection,
    biogenicCategories, setBiogenicCategories,
    loadingBiogenicCategories, setLoadingBiogenicCategories,
    // Multi-Employee (C7)
    employees, setEmployees,
    employeeMonthlyTotals, setEmployeeMonthlyTotals,
    employeeYearlyTotal, setEmployeeYearlyTotal,
    isCalculatingEmployee, setIsCalculatingEmployee,
    c7FormulaId, setC7FormulaId,
    c7FormulaName, setC7FormulaName,
    // Decision tree
    decisionFieldValues, setDecisionFieldValues,
    // Dynamic Form Config (Calc Engine)
    formConfig, setFormConfig,
    loadingFormConfig, setLoadingFormConfig,
    calcEngineResult, setCalcEngineResult,
    isCalcEngineCalculating, setIsCalcEngineCalculating,
    matchedFormulaId, setMatchedFormulaId,
    // Step 2: Process & Responsibility
    processNames, setProcessNames,
    responsiblePerson, setResponsiblePerson,
    responsiblePersonDesignation, setResponsiblePersonDesignation,
    responsiblePersonContact, setResponsiblePersonContact,
    // Step 3: Year & Monthly Data
    reportingYearType, setReportingYearType,
    hasOrgYearTypePreference,
    reportingYear, setReportingYear,
    frequencyType, setFrequencyType,
    monthlyData, setMonthlyData,
    yearlyData, setYearlyData,
    yearlyCalcResult, setYearlyCalcResult,
    isCalculatingYearly, setIsCalculatingYearly,
    expandedMonths, setExpandedMonths,
    // Step 4: Notes
    notes, setNotes,
    // Step 2 (optional, common): Record Source
    recordSource, setRecordSource,
    // Scope 3 optional fields
    supplierName, setSupplierName,
    supplierCode, setSupplierCode,
    employeeName, setEmployeeName,
    employeeId, setEmployeeId,
  } = _formState;


  // ============================================================================
  // F3: Centralized data-fetching effects — replaces 5 inline useEffects
  // (form-config fetch, fugitive emissions fetch, scope3-ef fetch, biogenic
  // categories fetch, biogenic scope3-ef fetch). Logic byte-identical.
  // ============================================================================
  useEmissionFormEffects({
    scope,
    category,
    biogenicScopeSelection,
    dynamicCategories,
    useCustomFuel,
    getAuthHeader,
    setFormConfig,
    setLoadingFormConfig,
    setCalcEngineResult,
    setScope3EFData,
    setLoadingScope3EF,
    setBiogenicCategories,
    setLoadingBiogenicCategories,
    setFugitiveEmissionsData,
  });

  // ============================================================================
  // EDIT MODE HYDRATION
  // Auto-populate form fields from editingEmission when editing
  // Uses hydrateEmissionForm utility for comprehensive, consistent hydration
  // ============================================================================
  useEffect(() => {
    if (!editingEmission) return;
    
    // Import the hydration utility dynamically to avoid circular deps
    import('../pages/emissions/utils/hydrateEmissionForm').then(({ hydrateEmissionForm }) => {
      const hydrated = hydrateEmissionForm(editingEmission, {
        fuelDatabase,
        scope3EFData,
        fugitiveEmissionsData,
      });
      
      // Hydrate basic selection fields (Step 1)
      if (editingEmission.facility_id) {
        setFacilityId(editingEmission.facility_id);
      }
      if (editingEmission.scope) {
        setScope(editingEmission.scope);
      }
      if (editingEmission.category) {
        setCategory(editingEmission.category);
      }
      if (editingEmission.fuel_database_id) {
        setFuelId(editingEmission.fuel_database_id);
      } else if (editingEmission.fuel_type) {
        // Try to find matching fuel by name
        const matchingFuel = fuelDatabase.find(f => 
          f.fuel_name === editingEmission.fuel_type || 
          f.name === editingEmission.fuel_type
        );
        if (matchingFuel) {
          setFuelId(matchingFuel.id);
        }
      }
      
      // Hydrate frequency type
      if (hydrated.frequencyType) {
        setFrequencyType(hydrated.frequencyType);
      }
      
      // Hydrate reporting period
      if (editingEmission.reporting_period) {
        const rp = editingEmission.reporting_period;
        // Extract year from reporting period (e.g., "2024-01" or "FY2024")
        const yearMatch = rp.match(/(\d{4})/);
        if (yearMatch) {
          setReportingYear(yearMatch[1]);
        }
      }
      
      // Hydrate notes
      if (editingEmission.notes) {
        setNotes(editingEmission.notes);
      }
      
      // Hydrate responsible person info
      if (editingEmission.responsible_person) {
        setResponsiblePerson(editingEmission.responsible_person);
      }
      if (editingEmission.responsible_person_designation) {
        setResponsiblePersonDesignation(editingEmission.responsible_person_designation);
      }
      if (editingEmission.responsible_person_contact) {
        setResponsiblePersonContact(editingEmission.responsible_person_contact);
      }
      
      // Hydrate biogenic scope selection using hydrated values
      if (editingEmission.scope === 'biogenic') {
        setBiogenicScopeSelection(hydrated.biogenicScopeSelection);
      }
      
      // Hydrate Scope 3 fields using hydrated values
      if (editingEmission.scope === 'scope3' || 
          (editingEmission.scope === 'biogenic' && hydrated.biogenicScopeSelection === 'scope3')) {
        setScope3Method(hydrated.scope3Method);
        setScope3ActivityType(hydrated.scope3ActivityType);
        setScope3Subcategory(hydrated.scope3Subcategory);
        setTypeOfProduct(hydrated.typeOfProduct);
        setScope3ActivityId(hydrated.scope3ActivityId);
        setScope3CustomActivity(hydrated.scope3CustomActivity);
        setUseCustomActivity(hydrated.useCustomActivity);
        
        // Hydrate employee data for C7
        if (hydrated.employees?.length > 0) {
          setEmployees(hydrated.employees);
          setEmployeeMonthlyTotals(hydrated.employeeMonthlyTotals);
          setEmployeeYearlyTotal(hydrated.employeeYearlyTotal);
        }
      }
      
      // Hydrate calculation methodology from dynamic_field_values
      // If record has carbon_content/composition_of_carbon, it was carbon composition method
      // If record has ef_quantity, it was qty basis method
      const dfvKeys = Object.keys(editingEmission.dynamic_field_values || {});
      if (dfvKeys.includes('carbon_content') || dfvKeys.includes('composition_of_carbon')) {
        setDecisionFieldValues(prev => ({ ...prev, calculation_methodology: 'using_carbon_composition' }));
      } else if (dfvKeys.includes('ef_quantity')) {
        setDecisionFieldValues(prev => ({ ...prev, calculation_methodology: 'using_qty_basis_ef' }));
      }
      
      // Hydrate monthly data for monthly frequency
      if (editingEmission.frequency_type === 'monthly' || !editingEmission.frequency_type) {
        const dfv = editingEmission.dynamic_field_values || editingEmission.inputs || {};
        const monthKey = editingEmission.reporting_period?.split('-')[1]; // e.g., "01" from "2024-01"
        
        if (monthKey) {
          const monthData = {};
          Object.entries(dfv).forEach(([key, val]) => {
            if (val && typeof val === 'object' && 'value' in val) {
              monthData[key] = val.value;
              if (val.unit) {
                monthData[`${key}_unit`] = val.unit;
              }
            } else {
              monthData[key] = val;
            }
          });
          
          // Also include calculated values if they exist
          if (editingEmission.co2e_emissions !== undefined) {
            monthData.calculatedCO2e = editingEmission.co2e_emissions;
          }
          if (editingEmission.co2_emissions !== undefined) {
            monthData.calculatedCO2 = editingEmission.co2_emissions;
          }
          
          setMonthlyData(prev => ({
            ...prev,
            [monthKey]: monthData
          }));
        }
      }
      
      // Hydrate yearly data for yearly frequency
      if (editingEmission.frequency_type === 'yearly') {
        const dfv = editingEmission.dynamic_field_values || editingEmission.inputs || {};
        const yearData = {};
        Object.entries(dfv).forEach(([key, val]) => {
          if (val && typeof val === 'object' && 'value' in val) {
            yearData[key] = val.value;
            if (val.unit) {
              yearData[`${key}_unit`] = val.unit;
            }
          } else {
            yearData[key] = val;
          }
        });
        
        // Also include calculated values
        if (editingEmission.co2e_emissions !== undefined) {
          yearData.calculatedCO2e = editingEmission.co2e_emissions;
        }
        if (editingEmission.co2_emissions !== undefined) {
          yearData.calculatedCO2 = editingEmission.co2_emissions;
        }
        
        setYearlyData(prev => ({
          ...prev,
          ...yearData
        }));
      }
    }).catch(err => {
      console.error('Failed to load hydration utility:', err);
      // Fall back to basic hydration
      if (editingEmission.facility_id) setFacilityId(editingEmission.facility_id);
      if (editingEmission.scope) setScope(editingEmission.scope);
      if (editingEmission.category) setCategory(editingEmission.category);
    });
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEmission?.id, fuelDatabase]);

  // ============================================================================
  // OCR PREFILL HELPERS
  // Isolated helper functions for OCR quantity prefill logic.
  // Structured for easy replacement with a generic mapping engine in the future.
  // ============================================================================
  
  /**
   * Find the primary activity/quantity field from formConfig fields.
   * This is typically the main numeric input field (e.g., energy_consumed, quantity, consumption).
   * @param {Array} fields - Array of field configurations from dynamicInputFields
   * @returns {Object|null} - The primary field config or null if not found
   */
  const findPrimaryActivityField = useCallback((fields) => {
    console.log('[OCR Debug] findPrimaryActivityField called with fields:', fields);
    
    if (!fields || fields.length === 0) {
      console.log('[OCR Debug] No fields provided');
      return null;
    }
    
    // Patterns to EXCLUDE (emission factors, override fields)
    const excludePatterns = [
      'ef_', 'emission_factor', 'ef_quantity', 'co2_ef', 'ch4_ef', 'n2o_ef',
      'gwp', 'density', 'cv', 'calorific'
    ];
    
    // Filter out emission factor and override fields
    const quantityFields = fields.filter(f => {
      const key = f.fieldKey?.toLowerCase() || '';
      return !excludePatterns.some(pattern => key.includes(pattern));
    });
    
    console.log('[OCR Debug] Filtered quantity fields:', quantityFields.map(f => f.fieldKey));
    
    // Priority order for identifying the primary quantity field
    const primaryFieldPatterns = [
      'qty',              // Main quantity field for Scope 1 (Stationary/Mobile Combustion)
      'qty_energy',       // Energy consumed for Scope 2
      'energy_consumed',
      'quantity',
      'activity_value',   // Scope 3 activity quantity
      'consumption',
      'amount',
      'volume',
      'mass',
      'fuel_consumed',
      'electricity_consumed',
      'gas_consumed'
    ];
    
    // Log all field keys for debugging (using fieldKey - camelCase)
    console.log('[OCR Debug] Available field keys:', fields.map(f => f.fieldKey));
    
    // First, try to find by fieldKey matching known patterns (in filtered fields)
    for (const pattern of primaryFieldPatterns) {
      const match = quantityFields.find(f => 
        f.fieldKey?.toLowerCase() === pattern ||
        f.fieldKey?.toLowerCase().includes(pattern)
      );
      if (match) {
        console.log('[OCR Debug] Found primary field by pattern:', pattern, '→', match.fieldKey);
        return match;
      }
    }
    
    // Fallback: find the first numeric field that has an associated unit field (from filtered)
    const numericField = quantityFields.find(f => 
      f.fieldType === 'number' && 
      fields.some(uf => uf.fieldKey === `${f.fieldKey}_unit`)
    );
    if (numericField) {
      console.log('[OCR Debug] Found primary field by numeric+unit fallback:', numericField.fieldKey);
      return numericField;
    }
    
    // Last resort: first numeric field from filtered list
    const firstNumeric = quantityFields.find(f => f.fieldType === 'number');
    if (firstNumeric) {
      console.log('[OCR Debug] Found primary field by first numeric fallback:', firstNumeric.fieldKey);
      return firstNumeric;
    }
    
    console.log('[OCR Debug] No primary field found!');
    return null;
  }, []);

  /**
   * Apply OCR quantity to the primary activity field in monthlyData.
   * @param {string} monthKey - The month key (e.g., '01', '06', '12')
   * @param {number} quantity - The OCR extracted quantity
   * @param {string} unit - The OCR extracted unit
   * @param {Object} primaryField - The primary field config from findPrimaryActivityField
   * @param {Function} setMonthlyData - State setter for monthlyData
   */
  const applyOcrQuantityToField = useCallback((monthKey, quantity, unit, primaryField, setMonthlyDataFn, availableUnits = []) => {
    console.log('[OCR Debug] applyOcrQuantityToField called:', { monthKey, quantity, unit, primaryField, availableUnits });
    
    if (!primaryField?.fieldKey || !monthKey) {
      console.log('[OCR Debug] Missing primaryField.fieldKey or monthKey, aborting');
      return;
    }
    
    const fieldKey = primaryField.fieldKey;
    const unitFieldKey = `${fieldKey}_unit`;
    
    // Normalize unit: find case-insensitive match in available units
    let normalizedUnit = unit || '';
    if (unit && availableUnits.length > 0) {
      const matchedUnit = availableUnits.find(u => u.toLowerCase() === unit.toLowerCase());
      if (matchedUnit) {
        normalizedUnit = matchedUnit;
        console.log(`[OCR Prefill] Normalized unit from "${unit}" to "${normalizedUnit}"`);
      }
    }
    
    console.log(`[OCR Prefill] Applying quantity ${quantity} ${normalizedUnit} to field: ${fieldKey}, unit field: ${unitFieldKey}`);
    
    setMonthlyDataFn(prev => {
      const updated = {
        ...prev,
        [monthKey]: {
          ...prev[monthKey],
          [fieldKey]: quantity,
          [unitFieldKey]: normalizedUnit
        }
      };
      console.log('[OCR Debug] Updated monthlyData:', updated);
      return updated;
    });
  }, []);

  // ============================================================================
  // OCR PREFILL HYDRATION
  // Auto-populate form fields from OCR Invoice Extractor workflow
  // ============================================================================
  
  // Store OCR month/quantity info for deferred application after formConfig loads
  const [ocrPendingQuantity, setOcrPendingQuantity] = useState(null);
  
  // Phase 1: Set scope, category, fuel, and other metadata (runs immediately)
  useEffect(() => {
    if (!ocrPrefillData) return;
    
    console.log('[OCR Debug] Phase 1 - ocrPrefillData:', ocrPrefillData);
    console.log('[OCR Debug] Phase 1 - fuelDatabase length:', fuelDatabase?.length);
    
    // Set scope (scope1, scope2, scope3)
    if (ocrPrefillData.scope) {
      console.log('[OCR Debug] Setting scope:', ocrPrefillData.scope);
      setScope(ocrPrefillData.scope);
    }
    
    // Set category
    if (ocrPrefillData.category) {
      console.log('[OCR Debug] Setting category:', ocrPrefillData.category);
      setCategory(ocrPrefillData.category);
    }
    
    // Set fuel type by looking up fuelId from fuelDatabase
    // For Scope 2 electricity, look for subcategory match (e.g., "Non-Renewable Electricity")
    if (fuelDatabase?.length > 0) {
      const fuelNameLower = (ocrPrefillData.fuel_name || '').toLowerCase();
      const subcategoryLower = (ocrPrefillData.subcategory || '').toLowerCase();
      const categoryLower = (ocrPrefillData.category || '').toLowerCase();
      
      console.log('[OCR Debug] Looking for fuel match:', { fuelNameLower, subcategoryLower, categoryLower });
      // Log first 10 fuels to understand the structure
      console.log('[OCR Debug] Sample fuels (first 10):', fuelDatabase.slice(0, 10).map(f => ({ 
        id: f.id, 
        name: f.name, 
        activity: f.activity,
        fuel_name: f.fuel_name,
        category: f.category,
        subcategory: f.subcategory
      })));
      
      let matchedFuel = null;
      
      // Helper function to check if any field matches the search term
      const fuelMatches = (fuel, searchTerm) => {
        if (!searchTerm) return false;
        const searchLower = searchTerm.toLowerCase();
        
        // Check all possible name fields
        const fieldsToCheck = [
          fuel.name,
          fuel.activity,
          fuel.fuel_name,
          fuel.subcategory,
          fuel.label,
          fuel.display_name
        ];
        
        for (const field of fieldsToCheck) {
          if (!field) continue;
          const fieldLower = field.toLowerCase();
          // Exact match
          if (fieldLower === searchLower) return true;
          // Contains match
          if (fieldLower.includes(searchLower) || searchLower.includes(fieldLower)) return true;
        }
        return false;
      };
      
      // For Scope 2, try to match by subcategory first (e.g., "Non-Renewable Electricity")
      if (subcategoryLower) {
        matchedFuel = fuelDatabase.find(f => fuelMatches(f, subcategoryLower));
        if (matchedFuel) {
          console.log('[OCR Debug] Matched fuel by subcategory:', matchedFuel.name || matchedFuel.activity);
        }
      }
      
      // Try matching by fuel_name (e.g., "Electricity")
      if (!matchedFuel && fuelNameLower) {
        matchedFuel = fuelDatabase.find(f => fuelMatches(f, fuelNameLower));
        if (matchedFuel) {
          console.log('[OCR Debug] Matched fuel by fuel_name:', matchedFuel.name || matchedFuel.activity);
        }
      }
      
      // Try matching common variations for electricity
      if (!matchedFuel && (fuelNameLower.includes('electric') || subcategoryLower.includes('electric'))) {
        const electricityVariations = [
          'non-renewable electricity',
          'non renewable electricity', 
          'nonrenewable electricity',
          'grid electricity',
          'purchased electricity',
          'electricity - non-renewable',
          'electricity (non-renewable)',
          'electricity'
        ];
        
        for (const variation of electricityVariations) {
          matchedFuel = fuelDatabase.find(f => fuelMatches(f, variation));
          if (matchedFuel) {
            console.log('[OCR Debug] Matched fuel by electricity variation:', variation, '→', matchedFuel.name || matchedFuel.activity);
            break;
          }
        }
      }
      
      if (matchedFuel?.id) {
        console.log('[OCR Prefill] Setting fuelId:', matchedFuel.id, matchedFuel.name || matchedFuel.activity);
        setFuelId(matchedFuel.id);
      } else {
        console.log('[OCR Debug] No fuel match found. Available fuel names:', 
          fuelDatabase.slice(0, 20).map(f => f.name || f.activity || f.fuel_name).filter(Boolean)
        );
      }
    }
    
    // Set responsible person (current user from OCR accept)
    if (ocrPrefillData.responsible_person) {
      setResponsiblePerson(ocrPrefillData.responsible_person);
    }
    
    // Set record source (invoice info)
    if (ocrPrefillData.source_of_information) {
      setRecordSource(ocrPrefillData.source_of_information);
    }
    
    // Store quantity info for Phase 2 (after formConfig loads)
    if (ocrPrefillData.quantity && ocrPrefillData.billing_period?.start_date) {
      const startDate = new Date(ocrPrefillData.billing_period.start_date);
      const monthKey = String(startDate.getMonth() + 1).padStart(2, '0');
      const year = startDate.getFullYear();
      
      console.log('[OCR Debug] Phase 1 - Setting up pending quantity:', { monthKey, year, quantity: ocrPrefillData.quantity });
      
      // Set reporting year immediately
      setReportingYear(String(year));
      
      // Expand the month immediately
      setExpandedMonths(prev => {
        if (Array.isArray(prev) && !prev.includes(monthKey)) {
          return [...prev, monthKey];
        }
        return prev;
      });
      
      // Store for Phase 2
      setOcrPendingQuantity({
        monthKey,
        quantity: ocrPrefillData.quantity,
        unit: ocrPrefillData.unit || ''
      });
    }
    
    // Note: Facility is NOT auto-selected per spec
    // Note: Process Name and Description are left empty per spec
    
  }, [ocrPrefillData, fuelDatabase]);

  // Sync decisionFieldValues + custom-activity auto-enable now live inside
  // useEmissionFormState (F2 integration). The corresponding inline useEffects
  // were removed here.

  // Filter Scope 3 activities based on category, method, industry sector, and year
  // Note: selectedFacility is defined below after fuelDatabase useMemo
  const filteredScope3Activities = useMemo(() => {
    // Handle both regular scope3 and biogenic with scope3 selection
    const isScope3 = scope === 'scope3';
    const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    
    if (!isScope3 && !isBiogenicScope3) return [];
    if (!scope3EFData.length) return [];
    
    // Get facility for sector filtering
    const facility = facilities.find(f => f.id === facilityId);
    
    // For biogenic, filter by sub_scope='biogenic'
    // For regular scope3, EXCLUDE biogenic data
    let filtered = isBiogenicScope3 
      ? scope3EFData.filter(ef => ef.sub_scope === 'biogenic')
      : scope3EFData.filter(ef => ef.sub_scope !== 'biogenic'); // Exclude biogenic from regular scope3
    
    // For subcategory-based categories (C8, C10, C11, C13, C14), handle specially
    const catLower = category?.toLowerCase() || '';
    const isSubcategoryCategory = ['c8', 'c10', 'c11', 'c13', 'c14'].some(c => catLower.includes(c));
    
    // For BIOGENIC scope3, skip subcategory handling - just filter by category directly
    // Biogenic C8/C10/C11/C13/C14 should work like C3 (direct activity selection)
    if (isBiogenicScope3 && isSubcategoryCategory) {
      // Filter biogenic activities by category
      filtered = filtered.filter(ef => 
        ef.category?.toLowerCase() === catLower
      );
      // Continue to standard filtering below (method, etc.)
    }
    // For REGULAR scope3 with subcategory categories, require subcategory selection
    else if (isScope3 && isSubcategoryCategory && scope3Subcategory) {
      // For fugitive_emissions, return data from fugitiveEmissionsData instead
      if (scope3Subcategory === 'fugitive_emissions') {
        return fugitiveEmissionsData.map(f => ({
          id: f.id,
          activity: f.activity,
          emission_factor: f.emission_factor,
          unit: f.unit || 'kgCO2e/kg',
          source: f.source || 'Fugitive Emissions',
          method: scope3Method,
          category: category,
          allowed_units: f.allowed_units || ['kg', 'g', 't'],
          default_unit: f.default_unit || 'kg'
        }));
      }
      
      // For stationary_combustion, mobile_combustion, and energy, filter from scope3_ef
      if (scope3Subcategory === 'stationary_combustion' || 
          scope3Subcategory === 'mobile_combustion' || 
          scope3Subcategory === 'energy' ||
          scope3Subcategory === 'electricity') {  // Support legacy 'electricity' value
        filtered = filtered.filter(ef => 
          ef.category?.toLowerCase() === catLower
        );
        
        // Filter by subcategory field if it exists on the entry
        // For energy: ONLY show entries with exact match (no fallback to null/empty)
        // For stationary/mobile: If entry has no subcategory defined, show in both
        const energySubcategory = scope3Subcategory === 'electricity' ? 'energy' : scope3Subcategory;
        filtered = filtered.filter(ef => {
          if (energySubcategory === 'energy') {
            // Strict matching - only show entries explicitly marked as energy
            // Also support legacy 'electricity' entries
            if (Array.isArray(ef.subcategory)) {
              return ef.subcategory.includes('energy') || ef.subcategory.includes('electricity');
            }
            return ef.subcategory === 'energy' || ef.subcategory === 'electricity';
          }
          
          // For stationary/mobile: fallback to null/empty subcategory
          if (!ef.subcategory || ef.subcategory.length === 0) {
            // No subcategory defined - show in both stationary and mobile
            return true;
          }
          // Has subcategory defined - check if it matches
          if (Array.isArray(ef.subcategory)) {
            return ef.subcategory.includes(scope3Subcategory);
          }
          return ef.subcategory === scope3Subcategory;
        });
        
        // Filter by method
        if (scope3Method && scope3Method !== 'supplier_basis') {
          filtered = filtered.filter(ef => ef.method === scope3Method);
        }
        
        // Get unique activities
        const uniqueActivities = [];
        const seenActivities = new Set();
        filtered.forEach(ef => {
          if (ef.activity && !seenActivities.has(ef.activity.toLowerCase())) {
            seenActivities.add(ef.activity.toLowerCase());
            uniqueActivities.push(ef);
          }
        });
        return uniqueActivities;
      }
    }
    
    // Standard filtering for non-subcategory categories
    // Filter by category
    if (category) {
      filtered = filtered.filter(ef => 
        ef.category?.toLowerCase() === category.toLowerCase()
      );
    }
    
    // Filter by method - for supplier_basis, show ALL activities for the category
    // For spend_basis/activity_basis, filter by specific method
    if (scope3Method && scope3Method !== 'supplier_basis') {
      filtered = filtered.filter(ef => ef.method === scope3Method);
    }
    
    // Filter by activity_type (for C6/C7)
    if (scope3ActivityType) {
      filtered = filtered.filter(ef => ef.activity_type === scope3ActivityType);
    }
    
    // Filter by industry sector (if facility has one)
    if (facility?.sector) {
      filtered = filtered.filter(ef => {
        // Check if EF has industry_sectors array
        if (ef.industry_sectors && ef.industry_sectors.length > 0) {
          return ef.industry_sectors.some(s => 
            s.toLowerCase() === facility.sector.toLowerCase()
          );
        }
        // If no industry filter on EF, show it (backwards compatibility)
        return true;
      });
    }
    
    // Year filtering will be handled later when reporting year is selected (Step 3)
    // For now, we show all matching activities
    
    // Get unique activities (avoid duplicates like Steel appearing twice for spend/activity)
    const uniqueActivities = [];
    const seenActivities = new Set();
    filtered.forEach(ef => {
      if (ef.activity && !seenActivities.has(ef.activity.toLowerCase())) {
        seenActivities.add(ef.activity.toLowerCase());
        uniqueActivities.push(ef);
      }
    });
    
    return uniqueActivities;
  }, [scope, scope3EFData, category, scope3Method, scope3ActivityType, scope3Subcategory, fugitiveEmissionsData, facilities, facilityId, biogenicScopeSelection]);

  // Get available activity types for C6/C7 categories
  const availableScope3ActivityTypes = useMemo(() => {
    if (scope !== 'scope3' || !category) return [];
    
    // Only show activity type filter for C6 and C7
    const isC6 = category.toLowerCase().includes('c6') || 
                 category.toLowerCase().includes('business travel');
    const isC7 = category.toLowerCase().includes('c7') ||
                 category.toLowerCase().includes('employee commuting');
    
    if (!isC6 && !isC7) return [];
    
    const activityTypes = new Set();
    
    // Add activity types from scope3_ef data
    if (scope3EFData.length) {
      scope3EFData.forEach(ef => {
        if (ef.category?.toLowerCase() === category.toLowerCase() && ef.activity_type) {
          // Also filter by method if selected
          if (!scope3Method || scope3Method === 'supplier_basis' || ef.method === scope3Method) {
            activityTypes.add(ef.activity_type);
          }
        }
      });
    }
    
    // Add "Others" option for supplier_basis method - only for C6 (not C7)
    if (scope3Method === 'supplier_basis' && isC6) {
      activityTypes.add('others');
    }
    
    return Array.from(activityTypes).sort();
  }, [scope, scope3EFData, category, scope3Method]);

  // Categories that require subcategory selection (C8, C10, C11, C13, C14)
  const subcategoryCategories = ['c8', 'c10', 'c11', 'c13', 'c14'];
  
  // Categories that require Asset Name field (C8, C13, C14, C15)
  const assetNameCategories = ['c8', 'c13', 'c14', 'c15'];
  
  // Check if current category requires Asset Name
  const requiresAssetName = useMemo(() => {
    if (scope !== 'scope3' || !category) return false;
    const catLower = category.toLowerCase();
    return assetNameCategories.some(c => catLower.includes(c));
  }, [scope, category]);
  
  // Check if current category is C7 (Employee Commuting) - supports multi-employee input
  const isC7EmployeeCommuting = useMemo(() => {
    if (scope !== 'scope3' || !category) return false;
    const catLower = category.toLowerCase();
    return catLower.includes('c7') || catLower.includes('employee commuting');
  }, [scope, category]);
  
  // Check if current category requires subcategory
  // Note: Biogenic Scope 3 does NOT require subcategory - it uses direct activity selection like C3
  const requiresSubcategory = useMemo(() => {
    // Only regular Scope 3 requires subcategory for C8/C10/C11/C13/C14
    // Biogenic Scope 3 skips subcategory selection
    const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    if (scope !== 'scope3' || isBiogenicScope3 || !category) return false;
    const catLower = category.toLowerCase();
    return subcategoryCategories.some(c => catLower.includes(c));
  }, [scope, category, biogenicScopeSelection]);

  // Reset employee data when category changes away from C7
  useEffect(() => {
    if (!isC7EmployeeCommuting) {
      setEmployees([]);
      setEmployeeMonthlyTotals({});
      setEmployeeYearlyTotal({});
    }
  }, [isC7EmployeeCommuting]);

  // Clear employee calculations when activity changes for C7
  // This forces users to recalculate with the new activity's emission factor
  useEffect(() => {
    if (isC7EmployeeCommuting && employees.length > 0) {
      // Clear calculated emissions from all employees while preserving input data
      setEmployees(prevEmployees => prevEmployees.map(emp => ({
        ...emp,
        // Clear monthly calculations
        monthly_data: Object.fromEntries(
          Object.entries(emp.monthly_data || {}).map(([month, data]) => [
            month,
            {
              ...data,
              emissions: null, // Clear the emissions object
              calculation_details: null,
            }
          ])
        ),
        // Clear yearly calculations
        yearly_data: emp.yearly_data ? {
          ...emp.yearly_data,
          emissions: null, // Clear the emissions object
          calculation_details: null,
        } : null,
      })));
      setEmployeeMonthlyTotals({});
      setEmployeeYearlyTotal({});
      setC7FormulaId(null);
      setC7FormulaName('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope3ActivityId, scope3ActivityType]); // Reset when activity changes

  // Reset asset name when category changes away from C8/C13/C14/C15
  useEffect(() => {
    if (!requiresAssetName) {
      setAssetName('');
    }
  }, [requiresAssetName]);

  // Categories that show From/To Location fields (C4, C6, C9 - transportation/travel categories)
  const locationCategories = ['c4', 'c6', 'c9'];
  
  // Check if current category shows From/To Location fields
  const showsLocationFields = useMemo(() => {
    if (scope !== 'scope3' || !category) return false;
    const catLower = category.toLowerCase();
    return locationCategories.some(c => catLower.includes(c));
  }, [scope, category]);

  // Reset location fields when category changes away from C4/C6/C9
  useEffect(() => {
    if (!showsLocationFields) {
      setFromLocation('');
      setToLocation('');
    }
  }, [showsLocationFields]);

  // Get available subcategories for C8/C10/C11/C13/C14
  const availableSubcategories = useMemo(() => {
    if (!requiresSubcategory || !scope3Method) return [];
    
    // Get subcategory labels from configLabels (fetched from backend)
    const subcategoryLabelsMap = configLabels?.subcategories || {};
    
    // Define available subcategories based on method
    const subcategories = [
      { value: 'stationary_combustion', label: subcategoryLabelsMap['stationary_combustion'] || 'Stationary Combustion' },
      { value: 'mobile_combustion', label: subcategoryLabelsMap['mobile_combustion'] || 'Mobile Combustion' },
      { value: 'fugitive_emissions', label: subcategoryLabelsMap['fugitive_emissions'] || 'Fugitive Emissions' },
      { value: 'energy', label: subcategoryLabelsMap['energy'] || 'Energy' }
    ];
    
    return subcategories;
  }, [requiresSubcategory, scope3Method, configLabels?.subcategories]);

  // Get available methods for selected category from Scope 3 EF
  // Always include supplier_basis as an option (except for biogenic)
  const availableScope3Methods = useMemo(() => {
    // Handle both regular scope3 and biogenic with scope3 selection
    const isScope3 = scope === 'scope3';
    const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    
    // Return empty if not scope3/biogenic-scope3 or no category selected
    if ((!isScope3 && !isBiogenicScope3) || !category) return [];
    
    const methods = new Set();
    
    // For biogenic, filter by sub_scope='biogenic' first
    let relevantData = isBiogenicScope3 
      ? scope3EFData.filter(ef => ef.sub_scope === 'biogenic')
      : scope3EFData;
    
    // Add methods from EF data
    relevantData.forEach(ef => {
      if (ef.category?.toLowerCase() === category.toLowerCase() && ef.method) {
        methods.add(ef.method);
      }
    });
    
    // Always add supplier_basis for all Scope 3 categories (regular and biogenic)
    // supplier_basis with custom activity doesn't require pre-existing EF records
    methods.add('supplier_basis');
    
    // Return in preferred order: spend_basis, activity_basis, supplier_basis
    const orderedMethods = [];
    if (methods.has('spend_basis')) orderedMethods.push('spend_basis');
    if (methods.has('activity_basis')) orderedMethods.push('activity_basis');
    if (methods.has('supplier_basis')) orderedMethods.push('supplier_basis');
    
    // Add any other methods that might exist
    methods.forEach(m => {
      if (!orderedMethods.includes(m)) orderedMethods.push(m);
    });
    
    return orderedMethods;
  }, [scope, scope3EFData, category, biogenicScopeSelection]);

  // Emission factor unit to quantity unit mapping
  const EMISSION_FACTOR_UNITS = [
    { value: 'tCO2/kg', label: 'tCO₂/kg', quantityUnit: 'kg', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/g', label: 'tCO₂/g', quantityUnit: 'g', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/t', label: 'tCO₂/t', quantityUnit: 't', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/L', label: 'tCO₂/L', quantityUnit: 'L', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/m3', label: 'tCO₂/m³', quantityUnit: 'm³', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/kWh', label: 'tCO₂/kWh', quantityUnit: 'kWh', forScope: ['scope2'] },
    { value: 'tCO2/MWh', label: 'tCO₂/MWh', quantityUnit: 'MWh', forScope: ['scope2'] },
  ];
  
  // Custom fuel units - restricted to mass-based units (kg, g, t) per user requirement
  const CUSTOM_FUEL_UNITS = [
    { value: 'tCO2/kg', label: 'tCO₂/kg', quantityUnit: 'kg' },
    { value: 'tCO2/g', label: 'tCO₂/g', quantityUnit: 'g' },
    { value: 'tCO2/t', label: 'tCO₂/t', quantityUnit: 't' },
  ];

  // Get available EF units based on scope
  const getAvailableEFUnits = (currentScope, isCustomFuel = false) => {
    if (isCustomFuel) {
      return CUSTOM_FUEL_UNITS;
    }
    return EMISSION_FACTOR_UNITS.filter(u => u.forScope.includes(currentScope));
  };

  // Get quantity unit based on emission factor unit for custom fuels
  const getQuantityUnitFromEFUnit = (efUnit) => {
    // Check custom fuel units first
    const customMapping = CUSTOM_FUEL_UNITS.find(u => u.value === efUnit);
    if (customMapping) return customMapping.quantityUnit;
    // Fallback to standard units
    const mapping = EMISSION_FACTOR_UNITS.find(u => u.value === efUnit);
    return mapping?.quantityUnit || 'kg';
  };

  // Resolve the quantity unit for custom fuels based on selected methodology
  const customFuelQtyUnit = useMemo(() => {
    if (!useCustomFuel) return null;
    const calcMethod = decisionFieldValues.calculation_methodology || 'using_heat_basis_ncv';
    if (calcMethod === 'using_qty_basis_ef') {
      return getQuantityUnitFromEFUnit(customEmissionFactorUnit);
    }
    // Heat Basis and Carbon Composition: qty unit selected independently
    return decisionFieldValues._customQtyUnit || 'kg';
  }, [useCustomFuel, decisionFieldValues, customEmissionFactorUnit, getQuantityUnitFromEFUnit]);

  // Step 2 + Step 3 form state moved to useEmissionFormState (F2 integration).
  // The hook also owns the reporting-year-type org-pref sync useEffect and the
  // editingEmission frequency_type/yearlyData hydration useEffect.

  // Helper function to update yearly data with validation
  const updateYearlyData = useCallback((field, value) => {
    setYearlyData(prev => ({ ...prev, [field]: value }));
  }, [setYearlyData]);

  // Get active months based on reporting year type
  const activeMonths = useMemo(() => {
    return reportingYearType === 'financial' ? FINANCIAL_YEAR_MONTHS : CALENDAR_YEAR_MONTHS;
  }, [reportingYearType]);

  // Get the actual year for a month based on reporting type
  // For financial year: Apr-Dec use selected year, Jan-Mar use selected year + 1
  const getActualYearForMonth = (monthKey) => {
    if (reportingYearType === 'financial') {
      const monthNum = parseInt(monthKey);
      if (monthNum >= 1 && monthNum <= 3) {
        return (parseInt(reportingYear) + 1).toString();
      }
    }
    return reportingYear;
  };

  // Step 4: Notes — moved to useEmissionFormState (F2 integration).
  
  // Track form dirty state for unsaved changes protection (#19)
  useEffect(() => {
    // Only trigger after user interaction (not initial load)
    if (currentStep > 1 || facilityId || category || fuelId || notes) {
      if (typeof onFormChange === 'function') {
        onFormChange();
      }
    }
  }, [currentStep, facilityId, category, fuelId, notes, scope3Method, scope3ActivityType, employees.length, onFormChange]);
  
  // Scope 3 specific optional fields — moved to useEmissionFormState (F2 integration).


  // Get selected fuel data
  const selectedFuel = useMemo(() => {
    return fuelDatabase.find(f => f.id === fuelId);
  }, [fuelDatabase, fuelId]);

  // Get selected facility
  const selectedFacility = useMemo(() => {
    return facilities.find(f => f.id === facilityId);
  }, [facilities, facilityId]);

  // Get categories for selected scope — prefer SuperAdmin-managed categories,
  // fall back to those inferred from the fuel database for compatibility.
  const categoriesForScope = useMemo(() => {
    // For biogenic with scope3 selected, return biogenic categories
    if (scope === 'biogenic' && biogenicScopeSelection === 'scope3') {
      return biogenicCategories.sort((a, b) => {
        const numA = parseInt(a.match(/C(\d+)/)?.[1] || '999');
        const numB = parseInt(b.match(/C(\d+)/)?.[1] || '999');
        return numA - numB;
      });
    }
    
    // For biogenic with scope1 selected, use 'biogenic' scope from fuel_database
    // fuel_database has scope='biogenic' or 'Biogenic' for biogenic fuels
    const effectiveScopeForCategories = (scope === 'biogenic' && biogenicScopeSelection === 'scope1') 
      ? 'biogenic' 
      : scope;
    
    const cats = new Set();

    // Primary source: SuperAdmin dynamic categories
    (dynamicCategories || [])
      .filter(c => c.scope_code === effectiveScopeForCategories && c.is_active !== false)
      .forEach(c => cats.add(c.name));

    // Fallback/union: categories already present in the fuel database
    // Handle both 'biogenic' and 'Biogenic' case variations
    const filtered = fuelDatabase.filter(f => 
      f.scope === effectiveScopeForCategories || 
      f.scope?.toLowerCase() === effectiveScopeForCategories.toLowerCase()
    );
    filtered.forEach(f => {
      if (f.categories?.length > 0) {
        f.categories.forEach(c => cats.add(c));
      } else if (f.category) {
        cats.add(f.category);
      }
    });

    let result = Array.from(cats);
    
    // For Scope 3, sort by category number (C1, C2, ... C15)
    if (effectiveScopeForCategories === 'scope3') {
      result.sort((a, b) => {
        const numA = parseInt(a.match(/C(\d+)/)?.[1] || '999');
        const numB = parseInt(b.match(/C(\d+)/)?.[1] || '999');
        return numA - numB;
      });
    } else {
      result.sort();
    }
    
    return result;
  }, [fuelDatabase, scope, dynamicCategories, biogenicScopeSelection, biogenicCategories]);

  // ============================================================================
  // Dynamic Form Config - Get input fields from ce_input_field_mappings
  // These are the ACTUAL fields to show, with proper labels
  // For Scope 3, filter fields based on the selected calculation method (formula)
  // ============================================================================
  const dynamicInputFieldsResult = useMemo(() => {
    if (!formConfig?.input_field_mappings?.length) return { fields: [], formulaId: null };
    
    // Determine effective scope for lookups
    const isBiogenicScope1 = scope === 'biogenic' && biogenicScopeSelection === 'scope1';
    const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    const effectiveScope = isBiogenicScope3 ? 'scope3' : scope;
    const isScope3Like = effectiveScope === 'scope3';
    
    // Get the category ID for filtering
    const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope);
    const categoryId = categoryObj?.id;
    const scopeObj = dynamicScopes.find(s => s.code === effectiveScope);
    const scopeId = scopeObj?.id;
    
    // For Scope 3 (or biogenic scope3), find the formula that matches the selected decision path
    // For Scope 1/2/Biogenic Scope 1, also match formula to filter fields correctly
    let requiredInputVars = null;
    let matchedFormula = null;
    
    // Helper function to traverse decision tree and find formula_id
    const traverseDecisionTree = (node, fieldValues) => {
      if (!node) return null;
      if (node.formula_id) return node.formula_id;
      const fieldName = node.field_name;
      if (!fieldName) return null;
      const selectedValue = fieldValues[fieldName];
      if (!selectedValue) return null;
      const selectedOption = (node.options || {})[selectedValue];
      if (!selectedOption) return null;
      if (selectedOption.formula_id) return selectedOption.formula_id;
      if (selectedOption.next) return traverseDecisionTree(selectedOption.next, fieldValues);
      return null;
    };

    if (isScope3Like && scope3Method && formConfig?.formulas?.length) {
      // Try to find formula using decision tree traversal
      if (formConfig.decision_tree) {
        const decisionValues = {
          calculation_method_scope3: scope3Method,
          activity_type: scope3ActivityType || undefined,
          subcategory_selection: scope3Subcategory || undefined,
          type_of_product: typeOfProduct || undefined,
        };
        
        const formulaId = traverseDecisionTree(formConfig.decision_tree, decisionValues);
        
        if (formulaId) {
          matchedFormula = formConfig.formulas.find(f => f.id === formulaId);
        }
      }
      
      // Fallback: For categories with nested decision trees (like C6/C7), 
      // we need to match formula based on the full decision path
      if (!matchedFormula) {
        // Map activity_type values to formula name patterns
        // Note: scope3_ef uses singular (hotel_stay)
        const activityTypeToFormulaMap = {
          'hotel_stay': ['hotel'],
          'air_travel': ['passenger', 'distance'],
          'water_travel': ['passenger', 'distance'],
          'taxi_travel': ['passenger', 'distance'],
          'bus_travel': ['passenger', 'distance'],
          'rail_travel': ['passenger', 'distance'],
          'car_travel': ['km travelled', 'km_travelled'],
          'bike_travel': ['km travelled', 'km_travelled'],
          'wfh': ['wfh', 'work from home']
        };
        
        // If activity_type is selected (for C6/C7), find formula based on that
        if (scope3Method === 'activity_basis' && scope3ActivityType && activityTypeToFormulaMap[scope3ActivityType]) {
          const searchTerms = activityTypeToFormulaMap[scope3ActivityType];
          matchedFormula = formConfig.formulas.find(f => {
            const formulaName = f.name?.toLowerCase() || '';
            return searchTerms.some(term => formulaName.includes(term.toLowerCase()));
          });
        }
      }
      
      // If no activity_type match, fall back to method-based matching
      if (!matchedFormula) {
        const methodToFormulaMap = {
          'spend_basis': ['spend', 'Spent'],
          'activity_basis': ['activity'],
          'supplier_basis': ['supplier', 'Supplier']
        };
        
        const searchTerms = methodToFormulaMap[scope3Method] || [];
        matchedFormula = formConfig.formulas.find(f => {
          const formulaName = f.name?.toLowerCase() || '';
          return searchTerms.some(term => formulaName.includes(term.toLowerCase()));
        });
      }
      
      if (matchedFormula?.inputs?.length) {
        // Get the list of required input variables for this formula
        // Note: form-config API returns inputs at top level (extracted from definition.inputs)
        requiredInputVars = matchedFormula.inputs.map(inp => inp.variable);
      }
    }
    // For Scope 1, Scope 2, or Biogenic Scope 1 - match formula via decision tree first, then fallback to name
    else if ((scope === 'scope1' || scope === 'scope2' || isBiogenicScope1) && formConfig?.formulas?.length) {
      // Priority 0: Try decision tree traversal (handles calculation_methodology)
      if (formConfig.decision_tree) {
        const scope1DecisionValues = {
          calculation_methodology: decisionFieldValues.calculation_methodology || 'using_heat_basis_ncv',
          ...decisionFieldValues,
        };
        const formulaId = traverseDecisionTree(formConfig.decision_tree, scope1DecisionValues);
        if (formulaId) {
          matchedFormula = formConfig.formulas.find(f => f.id === formulaId);
        }
      }

      // Fallback: name-based matching if tree didn't resolve
      if (!matchedFormula) {
        if (isBiogenicScope1) {
          matchedFormula = formConfig.formulas.find(f => 
            f.name?.toLowerCase().includes('biogenic')
          );
          if (!matchedFormula && formConfig.formulas.length > 0) {
            matchedFormula = formConfig.formulas[0];
          }
        } else {
          const currentCategoryName = (category || categoryObj?.name || '').toLowerCase();
          const isStationaryOrMobile = currentCategoryName.includes('stationary') || currentCategoryName.includes('mobile') || currentCategoryName.includes('flaring');
          
          if (isStationaryOrMobile) {
            matchedFormula = formConfig.formulas.find(f => 
              f.name?.toLowerCase().includes('heat basis') || f.name?.toLowerCase().includes('heat-basis')
            );
          }
          if (!matchedFormula) {
            matchedFormula = formConfig.formulas.find(f => 
              f.properties?.length > 0 && f.properties.some(p => 
                ['cv', 'density'].includes(p.variable?.toLowerCase() || p.key?.toLowerCase())
              )
            );
          }
          if (!matchedFormula) {
            matchedFormula = formConfig.formulas.find(f => 
              f.name?.toLowerCase().includes('quantity') || 
              f.name?.toLowerCase().includes('activity')
            );
          }
          if (!matchedFormula && formConfig.formulas.length > 0) {
            matchedFormula = formConfig.formulas[0];
          }
        }
      }
      
      if (matchedFormula?.inputs?.length) {
        requiredInputVars = matchedFormula.inputs.map(inp => inp.variable);
      }
    }
    
    // Store the matched formula ID for use in saving
    const formulaId = matchedFormula?.id || null;
    
    // Filter input field mappings that apply to this category and scope
    // Uses formula-driven filtering: only show fields that the resolved formula needs.
    // Decision fields (maps_to_context in decision tree) always shown so users can toggle tree paths.
    const decisionFieldNames = (formConfig.decision_fields || []).map(d => d.field_name);
    const applicableMappings = formConfig.input_field_mappings.filter(m => {
      const appliesToCategory = !m.applies_to_categories?.length || 
                                m.applies_to_categories.includes(categoryId);
      const appliesToScope = !m.applies_to_scopes?.length || 
                             m.applies_to_scopes.includes(scopeId);
      if (!appliesToCategory || !appliesToScope || m.is_active === false) return false;
      
      // Custom fuel: suppress fields that CustomFuelMonthFields handles per-month.
      // Only keep 'qty' (quantity input) from standard fields.
      if (useCustomFuel) {
        const handledByCustomFuel = ['density', 'cv', 'ef_quantity', 'carbon_content', 'oxidation_factor'];
        if (handledByCustomFuel.includes(m.maps_to_variable)) return false;
      }
      
      // Formula-driven filtering when a formula is resolved
      if (matchedFormula && requiredInputVars?.length) {
        if (m.is_override) {
          // Override fields: show if declared as formula property
          const formulaProperties = matchedFormula.properties || [];
          if (formulaProperties.some(p => p.variable === m.maps_to_variable || p.key === m.maps_to_variable)) {
            return true;
          }
          // Density: show when formula supports dimension conversion,
          // OR when using Qty Basis EF and fuel's qty units could mismatch EF denominators
          if (m.maps_to_variable === 'density') {
            const calcMethod = decisionFieldValues.calculation_methodology;
            if (calcMethod === 'using_qty_basis_ef') {
              // Only show if the fuel's units are all one dimension but the EF mapping
              // has denominators of the other dimension (i.e. mismatch is possible)
              const efMapping = formConfig.input_field_mappings.find(fm => fm.maps_to_variable === 'ef_quantity');
              const efAllowedUnits = efMapping?.allowed_units || [];
              const qtyUnits = selectedFuel?.allowed_units || [];
              // Check if any EF unit denominator could mismatch fuel qty units
              return efAllowedUnits.some(eu => isDensityRequiredForQtyBasis(eu, qtyUnits));
            }
            return (matchedFormula.inputs || []).some(inp => inp.allow_dimension_conversion);
          }
          return false;
        }
        // Regular input fields: in formula inputs OR is a decision field in the tree
        if (requiredInputVars.includes(m.maps_to_variable)) return true;
        if (m.maps_to_context && decisionFieldNames.includes(m.maps_to_context)) return true;
        return false;
      }
      
      // Fallback: no formula resolved (e.g. no process_type selected yet) — hide all for Process
      const currentCategoryName = (category || '').toLowerCase();
      if ((scope === 'scope1' || scope === 'scope2') && currentCategoryName.includes('process')) {
        return false;
      }
      
      return true;
    });
    
    // Sort by display_order
    applicableMappings.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    // Map to field objects for rendering
    const isQtyBasis = decisionFieldValues.calculation_methodology === 'using_qty_basis_ef';
    const fuelQtyUnits = selectedFuel?.allowed_units || [];
    const fields = applicableMappings.map(m => {
      const field = {
        id: m.id,
        variable: m.maps_to_variable,
        fieldKey: m.field_key,
        label: m.field_label,
        expectedUnit: m.default_unit,
        required: m.is_required,
        isOverride: m.is_override || false,
        fieldType: m.field_type || 'number',
        allowedUnits: m.allowed_units || [],
        unitSource: m.unit_source || 'static',
        compoundWithVariable: m.compound_with_variable || null,
        placeholder: m.placeholder || `Enter ${m.field_label}`,
        helpText: m.help_text || '',
        mapsToContext: m.maps_to_context,
        mapsToContextValueWhenFilled: m.maps_to_context_value_when_filled || 'true',
        mapsToContextValueWhenEmpty: m.maps_to_context_value_when_empty || 'false',
        options: m.options || [],
        validationRules: m.validation_rules || {},
        defaultValue: m.default_value,
      };
      // For Qty Basis EF: attach fuel qty units on density so renderer can
      // dynamically check if density is required based on selected EF unit
      if (isQtyBasis && m.maps_to_variable === 'density') {
        field.densityQtyBasisCheck = true;
        field.fuelQtyUnits = fuelQtyUnits;
      }
      return field;
    });
    
    // Return both fields and the matched formula ID
    return { fields, formulaId };
  }, [formConfig, dynamicCategories, category, scope, dynamicScopes, scope3Method, scope3ActivityType, scope3Subcategory, typeOfProduct, biogenicScopeSelection, decisionFieldValues, useCustomFuel, selectedFuel]);
  
  // Extract fields and formula ID from the memoized result
  const dynamicInputFields = dynamicInputFieldsResult?.fields || [];
  const currentFormulaId = dynamicInputFieldsResult?.formulaId || null;
  
  // Update matched formula ID when it changes
  useEffect(() => {
    if (currentFormulaId !== matchedFormulaId) {
      setMatchedFormulaId(currentFormulaId);
    }
  }, [currentFormulaId, matchedFormulaId]);

  // ============================================================================
  // OCR PREFILL PHASE 2
  // Apply quantity to the correct field after formConfig/dynamicInputFields are available
  // ============================================================================
  useEffect(() => {
    console.log('[OCR Debug] Phase 2 effect triggered:', { 
      ocrPendingQuantity, 
      dynamicInputFieldsLength: dynamicInputFields?.length,
      dynamicInputFields: dynamicInputFields?.map(f => f.fieldKey)
    });
    
    if (!ocrPendingQuantity) {
      console.log('[OCR Debug] Phase 2 - No pending quantity, skipping');
      return;
    }
    if (!dynamicInputFields || dynamicInputFields.length === 0) {
      console.log('[OCR Debug] Phase 2 - No dynamicInputFields yet, waiting...');
      return;
    }
    
    console.log('[OCR Debug] Phase 2 - Finding primary field...');
    const primaryField = findPrimaryActivityField(dynamicInputFields);
    
    if (primaryField) {
      console.log('[OCR Prefill] Phase 2 - Found primary field:', primaryField.fieldKey);
      
      // Get available units for the primary field (for unit normalization)
      let availableUnits = [];
      const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
      if (primaryField.unitSource === 'fuel') {
        if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
          const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
          availableUnits = matchedActivity?.allowed_units || [];
        } else {
          availableUnits = selectedFuel?.allowed_units || [];
        }
      } else if (primaryField.unitSource === 'all_units') {
        availableUnits = centralizedUnits.map(u => u.symbol);
      } else if (primaryField.unitSource === 'scope3_ef') {
        const matchedEF = scope3ActivityId ? filteredScope3Activities.find(a => a.id === scope3ActivityId) : null;
        if (matchedEF?.allowed_units?.length > 0) {
          availableUnits = matchedEF.allowed_units;
        } else if (primaryField.allowedUnits?.length > 0) {
          availableUnits = primaryField.allowedUnits;
        } else if (primaryField.expectedUnit) {
          availableUnits = [primaryField.expectedUnit];
        }
      } else {
        availableUnits = primaryField.allowedUnits?.length > 0 ? primaryField.allowedUnits : [primaryField.expectedUnit].filter(Boolean);
      }
      
      applyOcrQuantityToField(
        ocrPendingQuantity.monthKey,
        ocrPendingQuantity.quantity,
        ocrPendingQuantity.unit,
        primaryField,
        setMonthlyData,
        availableUnits
      );
      // Clear pending after applying
      setOcrPendingQuantity(null);
    } else {
      console.log('[OCR Debug] Phase 2 - No primary field found!');
    }
  }, [ocrPendingQuantity, dynamicInputFields, findPrimaryActivityField, applyOcrQuantityToField, scope, biogenicScopeSelection, requiresSubcategory, selectedFuel, scope3ActivityId, filteredScope3Activities, centralizedUnits]);

  // Initialize unit values in monthlyData when dynamicInputFields or selectedFuel changes
  // This ensures that units are always explicitly set, not relying on dropdown display fallbacks
  // EXCEPTION: For supplier_basis method, units should remain blank so users explicitly enter them
  useEffect(() => {
    if (dynamicInputFields.length === 0 || activeMonths.length === 0) return;
    
    // For supplier_basis method, do NOT auto-initialize units - they must be entered by user
    if (scope3Method === 'supplier_basis') return;
    
    setMonthlyData(prev => {
      const updated = { ...prev };
      
      activeMonths.forEach(monthKey => {
        const monthData = updated[monthKey] || {};
        let needsUpdate = false;
        
        dynamicInputFields.forEach(field => {
          const unitKey = `${field.variable}_unit`;
          // Only initialize if not already set
          if (!monthData[unitKey]) {
            let fieldUnits = [];
            const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
            if (field.unitSource === 'fuel') {
              // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
              if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
                const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                fieldUnits = matchedActivity?.allowed_units || [];
              } else {
                fieldUnits = selectedFuel?.allowed_units || [];
              }
            } else if (field.unitSource === 'all_units') {
              // For all_units, use all centralized units (simple + compound)
              fieldUnits = centralizedUnits.map(u => u.symbol);
            } else if (field.unitSource === 'scope3_ef') {
              // For scope3_ef: Priority 1: scope3_ef.allowed_units, Priority 2: field mapping allowed_units, Priority 3: formula expected_unit
              const matchedEF = scope3ActivityId ? filteredScope3Activities.find(a => a.id === scope3ActivityId) : null;
              if (matchedEF?.allowed_units?.length > 0) {
                fieldUnits = matchedEF.allowed_units;
              } else if (field.allowedUnits?.length > 0) {
                fieldUnits = field.allowedUnits;
              } else if (field.expectedUnit) {
                fieldUnits = [field.expectedUnit];
              } else {
                fieldUnits = [];
              }
            } else {
              fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
            }
            
            if (fieldUnits.length > 0) {
              monthData[unitKey] = fieldUnits[0];
              needsUpdate = true;
            }
          }
        });
        
        if (needsUpdate) {
          updated[monthKey] = monthData;
        }
      });
      
      return updated;
    });
  }, [dynamicInputFields, selectedFuel, activeMonths, centralizedUnits, scope3ActivityId, filteredScope3Activities, scope, biogenicScopeSelection, requiresSubcategory, scope3Method]);

  // Initialize unit values in yearlyData when dynamicInputFields or selectedFuel changes
  // This ensures that units are always explicitly set for yearly mode, similar to monthly
  // EXCEPTION: For supplier_basis method, units should remain blank so users explicitly enter them
  useEffect(() => {
    if (frequencyType !== 'yearly' || dynamicInputFields.length === 0) return;
    
    // For supplier_basis method, do NOT auto-initialize units - they must be entered by user
    if (scope3Method === 'supplier_basis') return;
    
    setYearlyData(prev => {
      const updated = { ...prev };
      let needsUpdate = false;
      
      dynamicInputFields.forEach(field => {
        const unitKey = `${field.variable}_unit`;
        // Only initialize if not already set
        if (!updated[unitKey]) {
          let fieldUnits = [];
          const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
          if (field.unitSource === 'fuel') {
            // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
            if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
              const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
              fieldUnits = matchedActivity?.allowed_units || [];
            } else {
              fieldUnits = selectedFuel?.allowed_units || [];
            }
          } else if (field.unitSource === 'all_units') {
            fieldUnits = centralizedUnits.map(u => u.symbol);
          } else if (field.unitSource === 'scope3_ef') {
            const matchedEF = scope3ActivityId ? filteredScope3Activities.find(a => a.id === scope3ActivityId) : null;
            if (matchedEF?.allowed_units?.length > 0) {
              fieldUnits = matchedEF.allowed_units;
            } else if (field.allowedUnits?.length > 0) {
              fieldUnits = field.allowedUnits;
            } else if (field.expectedUnit) {
              fieldUnits = [field.expectedUnit];
            }
          } else {
            fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
          }
          
          if (fieldUnits.length > 0) {
            updated[unitKey] = fieldUnits[0];
            needsUpdate = true;
          }
        }
      });
      
      return needsUpdate ? updated : prev;
    });
  }, [frequencyType, dynamicInputFields, selectedFuel, centralizedUnits, scope3ActivityId, filteredScope3Activities, scope, biogenicScopeSelection, requiresSubcategory, scope3Method]);

  // When scope3ActivityId changes, update the units for scope3_ef fields based on the new activity's allowed_units
  useEffect(() => {
    if (!scope3ActivityId || dynamicInputFields.length === 0 || activeMonths.length === 0) return;
    
    const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
    
    setMonthlyData(prev => {
      const updated = { ...prev };
      
      activeMonths.forEach(monthKey => {
        const monthData = { ...(updated[monthKey] || {}) };
        let needsUpdate = false;
        
        dynamicInputFields.forEach(field => {
          if (field.unitSource === 'scope3_ef') {
            const unitKey = `${field.variable}_unit`;
            const currentUnit = monthData[unitKey];
            
            // Determine available units: Priority 1: scope3_ef, Priority 2: field mapping, Priority 3: formula expected_unit
            let availableUnits = [];
            if (matchedEF?.allowed_units?.length > 0) {
              availableUnits = matchedEF.allowed_units;
            } else if (field.allowedUnits?.length > 0) {
              availableUnits = field.allowedUnits;
            } else if (field.expectedUnit) {
              availableUnits = [field.expectedUnit];
            }
            
            // Update if unit not set OR if current unit is not in the available units
            if (availableUnits.length > 0 && (!currentUnit || !availableUnits.includes(currentUnit))) {
              monthData[unitKey] = availableUnits[0];
              needsUpdate = true;
            }
          }
        });
        
        if (needsUpdate) {
          updated[monthKey] = monthData;
        }
      });
      
      return updated;
    });
  }, [scope3ActivityId, filteredScope3Activities, dynamicInputFields, activeMonths]);

  // When fuelId changes, validate/update units for fuel-based fields
  // This fixes the Scope 2 → Scope 1 bug where unit defaults to "Kg" instead of fuel's allowed units
  useEffect(() => {
    if (!fuelId || !selectedFuel || dynamicInputFields.length === 0) return;
    
    const allowedUnits = selectedFuel?.allowed_units || [];
    if (allowedUnits.length === 0) return; // No units to validate against
    
    // Update monthly data units
    setMonthlyData(prev => {
      const updated = { ...prev };
      let hasChanges = false;
      
      activeMonths.forEach(monthKey => {
        const monthData = { ...(updated[monthKey] || {}) };
        
        dynamicInputFields.forEach(field => {
          if (field.unitSource === 'fuel') {
            const unitKey = `${field.variable}_unit`;
            const currentUnit = monthData[unitKey];
            
            // If current unit is not in allowed units, update to first valid unit
            if (!currentUnit || !allowedUnits.includes(currentUnit)) {
              monthData[unitKey] = allowedUnits[0];
              hasChanges = true;
            }
          }
        });
        
        if (hasChanges) {
          updated[monthKey] = monthData;
        }
      });
      
      return hasChanges ? updated : prev;
    });
    
    // Update yearly data units
    setYearlyData(prev => {
      const updated = { ...prev };
      let hasChanges = false;
      
      dynamicInputFields.forEach(field => {
        if (field.unitSource === 'fuel') {
          const unitKey = `${field.variable}_unit`;
          const currentUnit = updated[unitKey];
          
          // If current unit is not in allowed units, update to first valid unit
          if (!currentUnit || !allowedUnits.includes(currentUnit)) {
            updated[unitKey] = allowedUnits[0];
            hasChanges = true;
          }
        }
      });
      
      return hasChanges ? updated : prev;
    });
  }, [fuelId, selectedFuel, dynamicInputFields, activeMonths]);


  // Build decision inputs automatically based on which fields have values
  // Uses flexible maps_to_context_value_when_filled/empty from mapping config
  const buildDecisionInputs = useCallback((monthData) => {
    const decisionInputs = {};
    
    dynamicInputFields.forEach(field => {
      if (field.mapsToContext) {
        // If this field maps to a context variable, set it based on whether value is provided
        const value = monthData[field.variable] || monthData[field.fieldKey];
        const hasValue = value !== undefined && value !== null && value !== '';
        // Use configurable values instead of hardcoded 'true'/'false'
        decisionInputs[field.mapsToContext] = hasValue 
          ? field.mapsToContextValueWhenFilled 
          : field.mapsToContextValueWhenEmpty;
      }
    });
    
    // Add all decision field values (includes calculation_method_scope3, activity_type, etc.)
    Object.entries(decisionFieldValues).forEach(([key, value]) => {
      if (value) {
        decisionInputs[key] = value;
      }
    });
    
    // Check if this is biogenic scope3
    const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    
    // Backwards compatibility: also set from scope3Method if decisionFieldValues doesn't have it
    if ((scope === 'scope3' || isBiogenicScope3) && scope3Method && !decisionInputs['calculation_method_scope3']) {
      decisionInputs['calculation_method_scope3'] = scope3Method;
    }
    
    // For biogenic scope3 with subcategory categories (C8/C10/C11/C13/C14),
    // pass 'biogenic' as subcategory_selection to satisfy the decision tree
    // (biogenic skips subcategory UI but backend decision tree still expects it)
    if (isBiogenicScope3) {
      const catLower = category?.toLowerCase() || '';
      const isSubcategoryCategory = ['c8', 'c10', 'c11', 'c13', 'c14'].some(c => catLower.includes(c));
      if (isSubcategoryCategory && !decisionInputs['subcategory_selection']) {
        // Use 'biogenic' as subcategory - will be handled by decision tree
        decisionInputs['subcategory_selection'] = 'biogenic';
      }
    }
    
    // For Scope 1/Biogenic Scope 1 Stationary Combustion: default calculation_methodology
    const isBiogenicScope1 = scope === 'biogenic' && biogenicScopeSelection === 'scope1';
    if ((scope === 'scope1' || isBiogenicScope1) && !decisionInputs['calculation_methodology']) {
      decisionInputs['calculation_methodology'] = 'using_heat_basis_ncv';
    }

    return decisionInputs;
  }, [dynamicInputFields, scope, scope3Method, decisionFieldValues, biogenicScopeSelection, category]);

  // Execute calculation via backend calc engine
  const executeCalcEngine = useCallback(async (monthKey, monthData) => {
    if (!formConfig) {
      return null;
    }
    
    // Determine if this is a scope3-like flow (regular scope3 or biogenic scope3)
    const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
    const isProcessEmissions = category?.toLowerCase().includes('process');
    const effectiveScope = isScope3Like ? 'scope3' : scope;
    
    // For Scope 3 (or biogenic scope3), we need method and activity instead of fuel
    if (isScope3Like) {
      if (!scope3Method) {
        return null;
      }
      // For supplier_basis with custom activity, don't require scope3ActivityId
      // For other methods, require scope3ActivityId
      if (scope3Method === 'supplier_basis' && useCustomActivity) {
        if (!scope3CustomActivity?.trim()) return null;
      } else {
        if (!scope3ActivityId) return null;
      }
    } else {
      // Process Emissions resolves entirely through its decision tree and has no fuel.
      // Standard fuel categories still require a selected fuel unless custom fuel is used.
      if (!isProcessEmissions && !useCustomFuel && (!selectedFuel || !fuelId)) {
        return null;
      }
    }
    
    const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope);
    
    if (!categoryObj?.id) {
      return null;
    }
    
    setIsCalcEngineCalculating(true);
    try {
      // Build inputs from month data using the field mappings
      const inputs = {};
      const matchedActivity = scope3ActivityId ? filteredScope3Activities.find(a => a.id === scope3ActivityId) : null;
      
      dynamicInputFields.forEach(field => {
        const value = monthData[field.variable] || monthData[field.fieldKey];
        if (value !== undefined && value !== null && value !== '') {
          // Determine base unit
          let baseUnit = field.expectedUnit;
          
          if (field.unitSource === 'fuel') {
            // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
            if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
              baseUnit = monthData[`${field.variable}_unit`] || monthData.unit || matchedActivity?.allowed_units?.[0] || matchedActivity?.default_unit || 'kg';
            } else if (selectedFuel?.allowed_units?.length) {
              baseUnit = monthData[`${field.variable}_unit`] || monthData.unit || selectedFuel.allowed_units[0];
            }
          } else if (field.unitSource === 'scope3_ef') {
            // For scope3_ef: use monthData unit, or fallback to matched activity's default/allowed units
            baseUnit = monthData[`${field.variable}_unit`] || matchedActivity?.default_unit || matchedActivity?.allowed_units?.[0] || field.expectedUnit || 'kg';
          } else if (monthData[`${field.variable}_unit`]) {
            baseUnit = monthData[`${field.variable}_unit`];
          }
          
          // Count-based fields should not have units
          const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 
            'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days',
            'units_produced', 'products_expected_usage', 'no_of_employees'].includes(field.variable);
          
          // Apply compound suffix if field has compoundWithVariable
          let finalUnit = isUnitlessCountField ? '' : (baseUnit || 'kg');
          if (!isUnitlessCountField && field.compoundWithVariable) {
            const linkedUnit = monthData[`${field.compoundWithVariable}_unit`];
            if (linkedUnit && typeof linkedUnit === 'string' && linkedUnit.trim()) {
              // Only add suffix if baseUnit doesn't already contain it
              if (!finalUnit.includes('/')) {
                finalUnit = `${finalUnit}/${linkedUnit.trim()}`;
              }
            }
          }
          
          inputs[field.variable] = {
            value: parseFloat(value),
            unit: finalUnit
          };
        }
      });
      
      // Build context
      const matchedEFEntry = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      
      // For Scope 3 subcategory categories (C8, C10, C11, C13, C14) with fugitive emissions,
      // use the activity name as fuel_name since the activity IS the fuel (e.g., "HFC-32")
      // Skip this for supplier_basis as it uses a basic formula without fuel_database lookup
      let fuelNameForContext = useCustomFuel ? customFuelName : (selectedFuel?.fuel_name || '');
      if (isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFEntry?.activity) {
        fuelNameForContext = matchedEFEntry.activity;
      }
      
      // Build reporting_period for currency conversion lookup
      const actualYear = getActualYearForMonth(monthKey);
      const monthReportingPeriod = `${actualYear}-${monthKey}`;
      
      const context = {
        fuel_name: fuelNameForContext,
        fuel_id: useCustomFuel ? null : (fuelId || ''),
        scope: effectiveScope, // Use effective scope for context
        category: category,
        facility_id: facilityId,
        reporting_period: monthReportingPeriod, // For currency conversion year lookup
        is_custom_fuel: useCustomFuel || false,
        // Scope 3 specific context (also applies to biogenic scope3)
        ...(isScope3Like && {
          calculation_method_scope3: scope3Method,
          scope3_ef_id: scope3ActivityId,
          // For supplier_basis with custom activity, use the custom activity name
          activity: (scope3Method === 'supplier_basis' && useCustomActivity) 
            ? scope3CustomActivity 
            : matchedEFEntry?.activity,
          // Pass default_unit for auto-conversion (falls back to formula's expected_unit if not set)
          scope3_ef_default_unit: matchedEFEntry?.default_unit || '',
        }),
      };
      
      // Build user overrides (for fields marked as is_override)
      const userOverrides = {};
      dynamicInputFields.forEach(field => {
        if (field.isOverride && monthData[`override_${field.variable}`]) {
          const value = monthData[field.variable] || monthData[field.fieldKey];
          if (value !== undefined && value !== null) {
            userOverrides[field.variable] = {
              value: parseFloat(value),
              unit: field.expectedUnit || 'kg'
            };
          }
        }
      });
      
      // Build decision inputs AUTOMATICALLY based on what's filled
      const decisionInputs = buildDecisionInputs(monthData);
      
      const response = await axios.post(
        `${API}/calc-engine/execute-by-category`,
        {
          category_id: categoryObj.id,
          decision_inputs: decisionInputs,
          inputs: inputs,
          context: context,
          user_overrides: userOverrides,
          dry_run: true,
          // Pass scope3_ef_id at top level for backend to lookup fuel_database (fugitive emissions)
          ...(isScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
        },
        { headers: getAuthHeader() }
      );
      
      if (response.data.ok) {
        return response.data;
      }
      return null;
    } catch (error) {
      return null;
    } finally {
      setIsCalcEngineCalculating(false);
    }
  }, [formConfig, selectedFuel, fuelId, dynamicCategories, category, scope, facilityId, dynamicInputFields, buildDecisionInputs, getAuthHeader, scope3Method, scope3ActivityId, filteredScope3Activities, useCustomActivity, scope3CustomActivity, requiresSubcategory, scope3Subcategory, biogenicScopeSelection, useCustomFuel, customFuelName]);

  // Execute yearly calculation (dry_run) - similar to executeCalcEngine but for yearly data
  const executeYearlyCalcEngine = useCallback(async () => {
    if (!formConfig || frequencyType !== 'yearly') {
      return null;
    }
    
    const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
    const effectiveScope = isScope3Like ? 'scope3' : scope;
    
    if (isScope3Like) {
      if (!scope3Method) return null;
      if (scope3Method === 'supplier_basis' && useCustomActivity) {
        if (!scope3CustomActivity?.trim()) return null;
      } else {
        if (!scope3ActivityId) return null;
      }
    } else {
      if (!useCustomFuel && (!selectedFuel || !fuelId)) return null;
    }
    
    const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope);
    if (!categoryObj?.id) return null;
    
    // Check if we have any yearly data to calculate
    const hasYearlyData = Object.entries(yearlyData).some(([key, val]) => 
      !key.endsWith('_unit') && val !== '' && val !== null && val !== undefined
    );
    if (!hasYearlyData) return null;
    
    setIsCalculatingYearly(true);
    try {
      // Build inputs from yearly data
      const inputs = {};
      const matchedActivityForYearly = scope3ActivityId ? filteredScope3Activities.find(a => a.id === scope3ActivityId) : null;
      
      dynamicInputFields.forEach(field => {
        const value = yearlyData[field.variable];
        if (value !== undefined && value !== null && value !== '') {
          // Determine base unit
          let baseUnit = field.expectedUnit;
          
          if (field.unitSource === 'fuel') {
            if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
              baseUnit = yearlyData[`${field.variable}_unit`] || matchedActivityForYearly?.allowed_units?.[0] || matchedActivityForYearly?.default_unit || field.expectedUnit || 'kg';
            } else {
              baseUnit = yearlyData[`${field.variable}_unit`] || selectedFuel?.allowed_units?.[0] || field.expectedUnit;
            }
          } else if (field.unitSource === 'scope3_ef') {
            // For scope3_ef: use yearlyData unit, or fallback to matched activity's default/allowed units
            baseUnit = yearlyData[`${field.variable}_unit`] || matchedActivityForYearly?.default_unit || matchedActivityForYearly?.allowed_units?.[0] || field.expectedUnit || 'kg';
          } else {
            baseUnit = yearlyData[`${field.variable}_unit`] || field.expectedUnit || '';
          }
          
          // Count-based fields should not have units
          const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 
            'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days',
            'units_produced', 'products_expected_usage', 'no_of_employees'].includes(field.variable);
          
          // Apply compound suffix if field has compoundWithVariable
          let finalUnit = isUnitlessCountField ? '' : (baseUnit || 'kg');
          if (!isUnitlessCountField && field.compoundWithVariable) {
            const linkedUnit = yearlyData[`${field.compoundWithVariable}_unit`];
            if (linkedUnit && typeof linkedUnit === 'string' && linkedUnit.trim()) {
              // Only add suffix if baseUnit doesn't already contain it
              if (!finalUnit.includes('/')) {
                finalUnit = `${finalUnit}/${linkedUnit.trim()}`;
              }
            }
          }
          
          inputs[field.variable] = { value: parseFloat(value), unit: finalUnit };
        }
      });
      
      // Build context
      const matchedEFForContext = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      
      // For Scope 3 subcategory categories (C8, C10, C11, C13, C14) with fugitive emissions,
      // use the activity name as fuel_name since the activity IS the fuel (e.g., "HFC-32")
      // Skip this for supplier_basis as it uses a basic formula without fuel_database lookup
      let fuelNameForContext = useCustomFuel ? customFuelName : (selectedFuel?.fuel_name || '');
      if (isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForContext?.activity) {
        fuelNameForContext = matchedEFForContext.activity;
      }
      
      // Build yearly reporting period for currency conversion lookup
      const yearlyReportingPeriodForCalc = reportingYearType === 'financial' 
        ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
        : `CY${reportingYear}`;
      
      const context = {
        fuel_name: fuelNameForContext,
        fuel_id: useCustomFuel ? null : (fuelId || ''),
        scope: effectiveScope,
        category: category,
        facility_id: facilityId,
        reporting_period: yearlyReportingPeriodForCalc, // For currency conversion year lookup
        is_custom_fuel: useCustomFuel || false,
        ...(isScope3Like && {
          calculation_method_scope3: scope3Method,
          scope3_ef_id: scope3ActivityId,
          scope3_ef_default_unit: matchedEFForContext?.default_unit || '',
          // For supplier_basis with custom activity, use the custom activity name
          activity: (scope3Method === 'supplier_basis' && useCustomActivity) 
            ? scope3CustomActivity 
            : matchedEFForContext?.activity,
        }),
      };
      
      // Build user overrides (for fields marked as is_override)
      const userOverrides = {};
      dynamicInputFields.forEach(field => {
        if (field.isOverride && yearlyData[`override_${field.variable}`]) {
          const value = yearlyData[field.variable] || yearlyData[field.fieldKey];
          if (value !== undefined && value !== null) {
            userOverrides[field.variable] = {
              value: parseFloat(value),
              unit: yearlyData[`${field.variable}_unit`] || field.expectedUnit || 'kg'
            };
          }
        }
      });
      
      // Build decision inputs AUTOMATICALLY based on what's filled
      const decisionInputs = buildDecisionInputs(yearlyData);
      
      const response = await axios.post(
        `${API}/calc-engine/execute-by-category`,
        {
          category_id: categoryObj.id,
          decision_inputs: decisionInputs,
          inputs: inputs,
          context: context,
          user_overrides: userOverrides,
          dry_run: true,
          // Pass scope3_ef_id at top level for backend to lookup fuel_database (fugitive emissions)
          ...(isScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
        },
        { headers: getAuthHeader() }
      );
      
      if (response.data.ok) {
        setYearlyCalcResult(response.data);
        return response.data;
      }
      setYearlyCalcResult(null);
      return null;
    } catch (error) {
      console.error('Yearly calc engine error:', error);
      setYearlyCalcResult(null);
      return null;
    } finally {
      setIsCalculatingYearly(false);
    }
  }, [formConfig, frequencyType, selectedFuel, fuelId, dynamicCategories, category, scope, facilityId, dynamicInputFields, yearlyData, buildDecisionInputs, getAuthHeader, scope3Method, scope3ActivityId, filteredScope3Activities, useCustomActivity, scope3CustomActivity, requiresSubcategory, scope3Subcategory, biogenicScopeSelection, reportingYearType, reportingYear]);

  // Evaluate formula with given values
  const evaluateFormula = useCallback((formula, values) => {
    try {
      // Replace variable names with values
      let expression = formula;
      Object.keys(values).forEach(key => {
        const value = parseFloat(values[key]) || 0;
        // Replace both exact matches and parenthesized matches
        expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), value);
      });
      // Handle special characters in formula
      expression = expression.replace(/×/g, '*').replace(/x/g, '*').replace(/–/g, '-');
      // Safely evaluate the expression
      const result = Function('"use strict"; return (' + expression + ')')();
      return isNaN(result) ? 0 : result;
    } catch (e) {
      console.error('Formula evaluation error:', e);
      return 0;
    }
  }, []);

  // Get fuels for selected category and scope with region + year priority
  const fuelsForCategory = useMemo(() => {
    let filtered = fuelDatabase.filter(f => {
      // Check scope
      if (f.scope !== scope) return false;
      // Check if fuel's categories include the selected category
      const fuelCategories = f.categories?.length > 0 ? f.categories : (f.category ? [f.category] : []);
      return fuelCategories.includes(category);
    });
    
    // Filter by facility sector if available
    if (selectedFacility?.sector) {
      filtered = filtered.filter(fuel => {
        if (fuel.industry_sectors && fuel.industry_sectors.length > 0) {
          return fuel.industry_sectors.some(s => 
            s.toLowerCase() === selectedFacility.sector.toLowerCase()
          );
        }
        return true;
      });
    }
    
    // Get facility country for region filtering
    const facilityCountry = selectedFacility?.country || '';
    
    // Get target year from reporting year
    const targetYear = parseInt(reportingYear, 10) || new Date().getFullYear();
    
    // Group fuels by name+category to handle region/year variants
    const fuelsByKey = {};
    filtered.forEach(fuel => {
      const key = `${fuel.fuel_name}_${fuel.category}`;
      if (!fuelsByKey[key]) {
        fuelsByKey[key] = [];
      }
      fuelsByKey[key].push(fuel);
    });
    
    /**
     * Select best fuel match based on region + year priority:
     * 1. Region-specific + exact year
     * 2. Region-specific + most recent year before target
     * 3. Region-specific + null year
     * 4. Global + exact year
     * 5. Global + most recent year before target
     * 6. Global + null year
     * 7. Any fallback
     */
    const selectBestMatch = (fuels) => {
      if (!fuels || fuels.length === 0) return null;
      
      const regionSpecific = facilityCountry 
        ? fuels.filter(f => f.region && f.region.toLowerCase() === facilityCountry.toLowerCase())
        : [];
      const globalFuels = fuels.filter(f => f.region?.toLowerCase() === 'global' || !f.region);
      const otherFuels = fuels.filter(f => 
        f.region && f.region.toLowerCase() !== 'global' && 
        (!facilityCountry || f.region.toLowerCase() !== facilityCountry.toLowerCase())
      );
      
      const findBestYearMatch = (fuelGroup) => {
        if (fuelGroup.length === 0) return null;
        
        // Exact year match
        const exactYear = fuelGroup.find(f => f.year_applicable === targetYear);
        if (exactYear) return exactYear;
        
        // Most recent year before target
        const earlierYears = fuelGroup
          .filter(f => f.year_applicable && f.year_applicable < targetYear)
          .sort((a, b) => b.year_applicable - a.year_applicable);
        if (earlierYears.length > 0) return earlierYears[0];
        
        // Null year (timeless)
        const nullYear = fuelGroup.find(f => !f.year_applicable);
        if (nullYear) return nullYear;
        
        // Any year as last resort
        return fuelGroup[0];
      };
      
      let bestMatch = findBestYearMatch(regionSpecific);
      if (bestMatch) return bestMatch;
      
      bestMatch = findBestYearMatch(globalFuels);
      if (bestMatch) return bestMatch;
      
      bestMatch = findBestYearMatch(otherFuels);
      if (bestMatch) return bestMatch;
      
      return fuels[0];
    };
    
    // Select best match for each fuel name+category
    const prioritizedFuels = [];
    Object.values(fuelsByKey).forEach(fuels => {
      const bestMatch = selectBestMatch(fuels);
      if (bestMatch) {
        prioritizedFuels.push(bestMatch);
      }
    });
    
    // IMPORTANT: When editing, ensure the saved fuel is always included in the list
    // The fuel prioritization logic may select a different variant (region/year), 
    // but we need to show the originally saved fuel so it appears selected
    if (fuelId && !prioritizedFuels.some(f => f.id === fuelId)) {
      const savedFuel = fuelDatabase.find(f => f.id === fuelId);
      if (savedFuel) {
        prioritizedFuels.unshift(savedFuel);
      }
    }
    
    return prioritizedFuels;
  }, [fuelDatabase, scope, category, selectedFacility, reportingYear, fuelId]);

  // Filtered fuels based on search term
  const filteredFuelsForCategory = useMemo(() => {
    if (!fuelSearchTerm.trim()) return fuelsForCategory;
    const searchLower = fuelSearchTerm.toLowerCase().trim();
    return fuelsForCategory.filter(fuel => 
      fuel.fuel_name?.toLowerCase().includes(searchLower)
    );
  }, [fuelsForCategory, fuelSearchTerm]);

  // Get allowed units for selected fuel OR scope3 activity
  const allowedUnits = useMemo(() => {
    // Priority 1: Scope 1/2 - use fuel's allowed_units
    if (selectedFuel?.allowed_units?.length > 0) {
      return selectedFuel.allowed_units;
    }
    
    // Priority 2: Scope 3 - use selected activity's allowed_units from scope3_ef
    if (scope === 'scope3' && scope3ActivityId) {
      const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      if (matchedEF?.allowed_units?.length > 0) {
        return matchedEF.allowed_units;
      }
    }
    
    // Return empty array if nothing available
    return [];
  }, [selectedFuel, scope, scope3ActivityId, filteredScope3Activities]);

  const defaultUnit = allowedUnits[0] || '';

  // Get conversion factor from formula parameters (SuperAdmin configured)
  const getConversionFactor = useCallback((paramKey, selectedUnit) => {
    // Find the parameter definition from SuperAdmin
    let param = formulaParameters.find(p => p.parameter_key === paramKey);
    
    // Try common variations if no exact match
    if (!param) {
      param = formulaParameters.find(p => 
        p.parameter_key === paramKey.replace('_fuel', '') ||
        p.parameter_key === paramKey.replace('quantity', 'quantity_fuel')
      );
    }
    
    if (!param || !param.unit_conversions || param.unit_conversions.length === 0) {
      return 1; // No conversion defined
    }
    
    // Find the conversion rule for the selected unit
    const conversion = param.unit_conversions.find(c => 
      c.from_unit?.toLowerCase() === selectedUnit?.toLowerCase()
    );
    
    if (conversion && conversion.multiplier !== 0) {
      // multiplier represents "how many from_unit = 1 to_unit"
      // To convert from from_unit to to_unit, we DIVIDE by multiplier
      return 1 / conversion.multiplier;
    }
    
    return 1;
  }, [formulaParameters]);

  // Find formula for scope using SuperAdmin-configured emission configurations
  const findFormulaForScope = useCallback((targetScope, targetCategory = null, gasType = null) => {
    // Use emission configurations (SuperAdmin-defined mappings)
    let matchingConfigs = emissionConfigurations.filter(c => 
      c.is_active && c.scope === targetScope
    );
    
    // If category specified, prefer configs that match the category
    if (targetCategory) {
      const categoryMatches = matchingConfigs.filter(c => {
        const configCategories = c.categories || (c.category ? [c.category] : []);
        if (configCategories.length === 0) return true; // Config applies to all categories
        return configCategories.some(cat => cat.toLowerCase() === targetCategory.toLowerCase());
      });
      
      if (categoryMatches.length > 0) {
        matchingConfigs = categoryMatches;
      }
    }
    
    // Sort by priority (highest first)
    matchingConfigs.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Find formula matching the gas type
    for (const config of matchingConfigs) {
      const formula = formulaDefinitions.find(f => f.id === config.formula_id);
      if (!formula) continue;
      
      if (!gasType) return formula;
      
      const keyLower = (formula.formula_key || '').toLowerCase();
      // Check for specific gas type formulas
      if (gasType === 'co2' && keyLower.includes('co2') && !keyLower.includes('co2e')) return formula;
      if (gasType === 'ch4' && keyLower.includes('ch4')) return formula;
      if (gasType === 'n2o' && keyLower.includes('n2o')) return formula;
      if (gasType === 'co2e' && (keyLower.includes('co2e') || keyLower.includes('total'))) return formula;
      if (gasType === 'electricity' && keyLower.includes('electricity')) return formula;
    }
    
    return null;
  }, [emissionConfigurations, formulaDefinitions]);

  // Get parameter value dynamically from input_mappings (SuperAdmin configured)
  const getParameterValue = useCallback((paramKey, fuel, customParams = {}, inputMappings = []) => {
    // PRIORITY 1: Check for override values in customParams FIRST
    // These are explicitly set when user enables override checkboxes
    // This mirrors the logic in Emissions.js getParameterValueDynamic
    
    // Check for CO2 emission factor override (Custom CO2 Emission Factor Heat Basis)
    // Must check for ALL possible parameter keys used in formulas
    const isEmissionFactorCO2 = paramKey.includes('emission_factor_co2') || 
                                 paramKey.includes('emission_factor_heat') ||
                                 paramKey.includes('ef_co2') ||
                                 paramKey.includes('ef_heat') ||
                                 paramKey === 'co2_emission_factor' ||
                                 paramKey === 'co2_emission_factor_heat' ||
                                 paramKey === 'ef' ||
                                 paramKey.toLowerCase().includes('co2') && paramKey.toLowerCase().includes('emission') && paramKey.toLowerCase().includes('heat');
    
    if (isEmissionFactorCO2) {
      if (customParams.emission_factor_co2 !== undefined && customParams.emission_factor_co2 !== null) {
        return customParams.emission_factor_co2;
      }
    }
    
    // Check for calorific value override
    if (paramKey.includes('calorific') || paramKey === 'ncv' || paramKey === 'cv') {
      if (customParams.calorific_value !== undefined && customParams.calorific_value !== null) {
        return customParams.calorific_value;
      }
      if (customParams.ncv !== undefined && customParams.ncv !== null) {
        return customParams.ncv;
      }
      if (customParams.cv !== undefined && customParams.cv !== null) {
        return customParams.cv;
      }
    }
    
    // Check for density override
    if (paramKey.includes('density')) {
      if (customParams.density !== undefined && customParams.density !== null) {
        return customParams.density;
      }
    }
    
    // Find the input mapping for this parameter
    const mapping = inputMappings.find(m => m.parameter_key === paramKey);
    
    if (mapping) {
      const sourceType = mapping.source_type;
      const sourceField = mapping.source_field;
      
      switch (sourceType) {
        case 'user_input':
          // Get from user-entered values (customParams)
          if (customParams[sourceField] !== undefined && customParams[sourceField] !== null) {
            return customParams[sourceField];
          }
          if (customParams[paramKey] !== undefined && customParams[paramKey] !== null) {
            return customParams[paramKey];
          }
          break;
          
        case 'fuel_database':
          // Get from selected fuel, BUT check customParams first for overrides
          if (customParams[sourceField] !== undefined && customParams[sourceField] !== null) {
            return customParams[sourceField];
          }
          if (customParams[paramKey] !== undefined && customParams[paramKey] !== null) {
            return customParams[paramKey];
          }
          // Fallback to fuel database value
          if (fuel && fuel[sourceField] !== undefined && fuel[sourceField] !== null) {
            return fuel[sourceField];
          }
          break;
          
        case 'formula_parameter':
          // Get from formula parameters (SuperAdmin configured)
          const formulaParam = formulaParameters.find(p => p.parameter_key === sourceField || p.parameter_key === paramKey);
          if (formulaParam?.default_value !== undefined && formulaParam.default_value !== null) {
            return formulaParam.default_value;
          }
          break;
          
        case 'constant':
          // Use the default_value from the mapping as a constant
          if (mapping.default_value !== undefined && mapping.default_value !== null && mapping.default_value !== '') {
            return parseFloat(mapping.default_value) || mapping.default_value;
          }
          break;
      }
      
      // Fallback to default_value if source not found
      if (mapping.default_value !== undefined && mapping.default_value !== null && mapping.default_value !== '') {
        return parseFloat(mapping.default_value) || mapping.default_value;
      }
    }
    
    // Legacy fallback: Check formula parameters directly (for parameters not in input_mappings)
    const formulaParam = formulaParameters.find(p => p.parameter_key === paramKey);
    if (formulaParam?.default_value !== undefined && formulaParam.default_value !== null) {
      return formulaParam.default_value;
    }
    
    // Legacy fallback: Check customParams directly
    if (customParams[paramKey] !== undefined && customParams[paramKey] !== null) {
      return customParams[paramKey];
    }
    
    // Legacy fallback: Check fuel data directly
    if (fuel && fuel[paramKey] !== undefined && fuel[paramKey] !== null) {
      return fuel[paramKey];
    }
    
    return 0;
  }, [formulaParameters]);

  // Execute formula using SuperAdmin-configured components and input_mappings
  const executeFormula = useCallback((formula, fuel, customParams = {}) => {
    if (!formula || !formula.components || formula.components.length === 0) {
      return null;
    }
    
    const selectedUnit = customParams.unit || '';
    const selectedUnitIsVolume = isVolumeUnit(selectedUnit, centralizedUnits);
    
    // Get input_mappings from the formula (SuperAdmin configured)
    const inputMappings = formula.input_mappings || {};
    
    let result = null;
    const steps = [];
    
    for (const comp of formula.components) {
      const condition = comp.condition || 'always';
      
      // Check condition
      let shouldApply = true;
      if (condition === 'volume_units' && !selectedUnitIsVolume) shouldApply = false;
      if (condition === 'mass_units' && selectedUnitIsVolume) shouldApply = false;
      
      if (!shouldApply) continue;
      
      // Use input_mappings to get the value dynamically
      const value = getParameterValue(comp.parameter_key, fuel, customParams, inputMappings);
      
      if (result === null || comp.operation === 'base') {
        result = value;
        // For quantity parameters, add "(Unit Conversion Applied)" to the label
        const isQuantityParam = comp.parameter_key?.includes('quantity') || comp.parameter_name?.toLowerCase().includes('quantity');
        const conversionNote = isQuantityParam ? ' (Unit Conversion Applied)' : '';
        // Format value to 6 decimal places max
        const displayValue = Number.isInteger(value) ? value : parseFloat(value.toFixed(6));
        steps.push(`${comp.parameter_name}${conversionNote} = ${displayValue}`);
      } else {
        // Format value and result to 6 decimal places max
        const displayValue = Number.isInteger(value) ? value : parseFloat(value.toFixed(6));
        switch (comp.operation) {
          case 'multiply':
            result = result * value;
            const displayResultMul = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`× ${comp.parameter_name} (${displayValue}) = ${displayResultMul}`);
            break;
          case 'divide':
            result = value !== 0 ? result / value : result;
            const displayResultDiv = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`÷ ${comp.parameter_name} (${displayValue}) = ${displayResultDiv}`);
            break;
          case 'add':
            result = result + value;
            const displayResultAdd = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`+ ${comp.parameter_name} (${displayValue}) = ${displayResultAdd}`);
            break;
          case 'subtract':
            result = result - value;
            const displayResultSub = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`- ${comp.parameter_name} (${displayValue}) = ${displayResultSub}`);
            break;
          default:
            result = result * value;
            const displayResultDef = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`× ${comp.parameter_name} (${displayValue}) = ${displayResultDef}`);
        }
      }
    }
    
    return result !== null ? { result, steps, formula_name: formula.formula_name } : null;
  }, [centralizedUnits, getParameterValue]);

  // Handle process names
  const addProcessName = () => {
    setProcessNames([...processNames, { name: '', description: '' }]);
  };

  const removeProcessName = (index) => {
    if (processNames.length > 1) {
      setProcessNames(processNames.filter((_, i) => i !== index));
    }
  };

  const updateProcessName = (index, field, value) => {
    const updated = [...processNames];
    updated[index] = { ...updated[index], [field]: value };
    setProcessNames(updated);
  };

  // Handle monthly data
  const updateMonthData = (monthKey, field, value) => {
    setMonthlyData(prev => ({
      ...prev,
      [monthKey]: {
        ...(prev[monthKey] || {}),
        [field]: value
      }
    }));
  };

  // Handle evidence upload for a month
  const handleEvidenceUpload = async (monthKey, file) => {
    if (!file) return;

    const sizeErr = validateFileSize(file);
    if (sizeErr) {
      toast.error(sizeErr);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/upload/evidence?bucket_type=emission_evidence`, formData, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data?.url) {
        // Use functional update to ensure we always read the latest state
        setMonthlyData(prev => {
          const currentEvidences = prev[monthKey]?.evidences || [];
          return {
            ...prev,
            [monthKey]: {
              ...(prev[monthKey] || {}),
              evidences: [...currentEvidences, {
                url: response.data.url,
                filename: file.name,
                uploaded_at: new Date().toISOString()
              }]
            }
          };
        });
        toast.success(`Evidence uploaded for ${MONTHS.find(m => m.key === monthKey)?.name}`);
      }
    } catch (error) {
      console.error('Evidence upload failed:', error);
      toast.error(getUploadErrorMessage(error, file));
    }
  };

  const removeEvidence = (monthKey, evidenceIndex) => {
    const currentEvidences = monthlyData[monthKey]?.evidences || [];
    updateMonthData(monthKey, 'evidences', 
      currentEvidences.filter((_, idx) => idx !== evidenceIndex)
    );
  };


  // Helper function to render a dynamic field (for cleaner grouping in Step 3)
  // F5: Swap inline renderDynamicField/getFieldUnitsForYearly for shared
  // <DynamicFieldRenderer /> component + getFieldUnits util. This also picks up
  // biogenic+scope3 unit-source handling that was missing from the inline path.
  const computeCompoundSuffix = (field, data) => {
    if (!field?.compoundWithVariable) return '';
    const linked = field.compoundWithVariable;
    const linkedUnit = data?.[`${linked}_unit`];
    return (typeof linkedUnit === 'string' && linkedUnit.trim()) ? linkedUnit.trim() : '';
  };

  const renderDynamicField = (field, monthKey, data) => (
    <DynamicFieldRenderer
      field={field}
      monthKey={monthKey}
      data={data}
      updateMonthData={updateMonthData}
      scope={scope}
      scope3Method={scope3Method}
      scope3ActivityId={scope3ActivityId}
      requiresSubcategory={requiresSubcategory}
      selectedFuel={selectedFuel}
      filteredScope3Activities={filteredScope3Activities}
      centralizedUnits={centralizedUnits}
      biogenicScopeSelection={biogenicScopeSelection}
      useCustomFuel={useCustomFuel}
      compoundSuffix={computeCompoundSuffix(field, data)}
    />
  );

  // Helper function to compute field units (same logic as monthly, used for yearly mode)
  const getFieldUnitsForYearly = (field) => {
    const base = getFieldUnitsShared({
      field,
      scope,
      scope3Method,
      scope3ActivityId,
      requiresSubcategory,
      selectedFuel,
      filteredScope3Activities,
      centralizedUnits,
      biogenicScopeSelection,
      useCustomFuel,
    });
    const suffix = computeCompoundSuffix(field, yearlyData);
    if (!suffix) return base;
    return base.map(u => `${u}/${suffix}`);
  };


  // Check if month has data
  const getMonthStatus = (monthKey) => {
    const data = monthlyData[monthKey];
    if (!data) return 'empty';
    
    // For Scope 3 with dynamic fields, check if required fields have values
    if ((scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3')) && dynamicInputFields.length > 0) {
      const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);
      const hasRequiredData = requiredFields.some(field => {
        const value = data[field.variable] || data[field.fieldKey];
        return value !== '' && value !== null && value !== undefined && value !== '0' && parseFloat(value) > 0;
      });
      return hasRequiredData ? 'filled' : 'empty';
    }
    
    // For Scope 1, Scope 2, Biogenic Direct with dynamic fields, check if required fields have values
    if ((scope === 'scope1' || scope === 'scope2' || (scope === 'biogenic' && biogenicScopeSelection !== 'scope3')) && dynamicInputFields.length > 0) {
      const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);
      const hasRequiredData = requiredFields.some(field => {
        const value = data[field.variable] || data[field.fieldKey];
        return value !== '' && value !== null && value !== undefined && value !== '0' && parseFloat(value) > 0;
      });
      return hasRequiredData ? 'filled' : 'empty';
    }
    
    // For regular emissions without dynamic fields, check quantity
    if (!data.quantity || parseFloat(data.quantity) <= 0) return 'empty';
    return 'filled';
  };

  // Count filled months
  const filledMonthsCount = useMemo(() => {
    // For yearly mode, return 1 if there's yearly data, 0 otherwise
    if (frequencyType === 'yearly') {
      // For C7 Employee Commuting yearly mode
      if (isC7EmployeeCommuting && employees.length > 0) {
        const hasYearlyData = employees.some(emp => 
          emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined
        );
        return hasYearlyData ? 1 : 0;
      }
      
      // For other categories yearly mode, check yearlyData
      const hasYearlyInput = Object.values(yearlyData || {}).some(v => v !== '' && v !== null && v !== undefined);
      return hasYearlyInput ? 1 : 0;
    }
    
    // For C7 Employee Commuting monthly mode, count employees with calculated emissions
    if (isC7EmployeeCommuting && employees.length > 0) {
      // Count unique months that have at least one employee with calculated emissions
      const monthsWithData = new Set();
      employees.forEach(emp => {
        Object.entries(emp.monthly_data || {}).forEach(([monthKey, data]) => {
          if (data?.emissions?.co2e !== null && data?.emissions?.co2e !== undefined) {
            monthsWithData.add(monthKey);
          }
        });
      });
      return monthsWithData.size;
    }
    
    // For dynamic form config, check if any required field (non-override) has value
    if (dynamicInputFields.length > 0) {
      const requiredFields = dynamicInputFields.filter(f => !f.isOverride);
      return Object.values(monthlyData).filter(m => {
        return requiredFields.some(field => {
          const value = m?.[field.variable] || m?.[field.fieldKey];
          return value && parseFloat(value) > 0;
        });
      }).length;
    }
    
    // No dynamic fields loaded yet - return 0
    return 0;
  }, [monthlyData, yearlyData, frequencyType, dynamicInputFields, isC7EmployeeCommuting, employees]);

  // F4: Validation dispatcher delegates to extracted utils.
  // The util `canProceedToStep` covers cases 2/3/4 (legacy case 5 default-true preserved).
  const canProceedToStep = (step) => canProceedToStepUtil(step, {
    // Step 1 params
    facilityId, scope, category,
    scope3Method, scope3ActivityId, useCustomActivity, scope3CustomActivity,
    biogenicScopeSelection,
    useCustomFuel, fuelId, customFuelName, customEmissionFactor, customSource,
    // Step 2 params
    processNames, responsiblePerson, requiresAssetName, assetName,
    // Step 3 params
    isC7EmployeeCommuting, employees, dynamicInputFields,
    frequencyType, yearlyData, monthlyData, filledMonthsCount,
    updateMonthData,
  });


  const handleNext = () => {
    const validation = canProceedToStep(currentStep + 1);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }
    setCurrentStep(Math.min(currentStep + 1, totalSteps));
  };

  const handlePrev = () => {
    setCurrentStep(Math.max(currentStep - 1, 1));
  };

  // Handler for calculating emissions for a specific employee and month
  const handleCalculateEmployeeMonth = useCallback(async (employeeId, monthKey, employee) => {
    setIsCalculatingEmployee(true);
    try {
      // Check if this is yearly mode
      const isYearly = monthKey === 'yearly';
      
      // Get input data based on mode
      const inputData = isYearly ? employee.yearly_data : employee.monthly_data?.[monthKey];
      
      if (!inputData?.inputs || Object.keys(inputData.inputs).length === 0) {
        toast.error('Please enter input values first');
        setIsCalculatingEmployee(false);
        return;
      }

      // Check if all inputs have values
      const hasValidInputs = Object.values(inputData.inputs).some(v => v !== '' && v !== null && v !== undefined);
      if (!hasValidInputs) {
        toast.error('Please enter at least one input value');
        setIsCalculatingEmployee(false);
        return;
      }

      // Validate required fields
      if (!scope3Method) {
        toast.error('Please select a calculation method first');
        setIsCalculatingEmployee(false);
        return;
      }

      if (!scope3ActivityType) {
        toast.error('Please select an activity type first');
        setIsCalculatingEmployee(false);
        return;
      }

      // Find the matched activity from scope3 EF data - MUST use scope3ActivityId
      const activityType = scope3ActivityType;
      
      // For supplier_basis with custom activity (including "others"), skip activity ID requirement
      // Otherwise require specific activity selection - no fallback to avoid picking wrong EF
      if (!useCustomActivity && !scope3ActivityId) {
        toast.error('Please select a specific activity from the dropdown');
        setIsCalculatingEmployee(false);
        return;
      }
      
      // For custom activity, we don't need a matched activity from the dropdown
      let matchedActivity = null;
      if (!useCustomActivity) {
        matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);

        if (!matchedActivity) {
          toast.error(`Activity not found. Please select a valid activity from the dropdown.`);
          setIsCalculatingEmployee(false);
          return;
        }
      }
      
      // Use the matched activity's emission factor (or null for custom activity - EF comes from user input)
      const efFromActivity = matchedActivity?.emission_factor || null;
      const efUnitFromActivity = matchedActivity?.ef_unit || null;

      // Build decision_inputs for decision tree traversal
      const decisionInputs = {
        calculation_method_scope3: scope3Method,
        activity_type: activityType,
      };

      // Build inputs for formula execution - format: { variable: { value, unit } }
      const formulaInputs = {};
      Object.entries(inputData.inputs).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          // Find the field config to get the unit
          const fieldConfig = dynamicInputFields.find(f => f.variable === key);
          formulaInputs[key] = {
            value: parseFloat(value),
            unit: fieldConfig?.expectedUnit || fieldConfig?.unit || ''
          };
        }
      });

      // Build reporting period for currency conversion lookup (C7 Employee Commuting)
      let c7ReportingPeriod;
      if (isYearly) {
        c7ReportingPeriod = reportingYearType === 'financial' 
          ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
          : `CY${reportingYear}`;
      } else {
        const actualYear = getActualYearForMonth(monthKey);
        c7ReportingPeriod = `${actualYear}-${monthKey}`;
      }

      // Build context for additional data
      const calcContext = {
        calculation_method_scope3: scope3Method,
        activity_type: activityType,
        reporting_period: c7ReportingPeriod, // For currency conversion year lookup
        activity: matchedActivity?.activity || scope3CustomActivity || 'Custom Activity', // For emission factor lookup
        fuel_name: matchedActivity?.activity || scope3CustomActivity || 'Custom Activity', // Alias for property source mapping
        scope3_ef_id: matchedActivity?.id || null,
        use_custom_activity: useCustomActivity,
      };

      // Get category ID
      const categoryObj = dynamicCategories.find(c => 
        c.name === category && c.scope_code === 'scope3'
      );

      if (!categoryObj) {
        toast.error('Category not found');
        setIsCalculatingEmployee(false);
        return;
      }

      const payload = {
        category_id: categoryObj.id,
        decision_inputs: decisionInputs,
        inputs: formulaInputs,
        context: calcContext,
        scope3_ef_id: matchedActivity?.id || null,
      };

      // Call calc engine
      const response = await axios.post(
        `${API}/calc-engine/execute-by-category`,
        payload,
        { headers: getAuthHeader() }
      );

      if (response.data?.outputs) {
        const co2e = response.data.outputs.co2e?.value || 0;
        
        // Capture formula_id from calculation response
        if (response.data.resolved_formula?.id) {
          setC7FormulaId(response.data.resolved_formula.id);
          setC7FormulaName(response.data.resolved_formula.name || '');
        }
        
        // Store audit log for calculation ledger display
        const auditLog = response.data.audit_log || [];
        const appliedFactors = response.data.applied_factors || {};
        
        // Update employee with calculated emissions and audit data
        setEmployees(prevEmployees => {
          const updatedEmployees = prevEmployees.map(emp => {
            if (emp.id === employeeId) {
              if (isYearly) {
                // YEARLY MODE: Update yearly_data
                return {
                  ...emp,
                  yearly_data: {
                    ...emp.yearly_data,
                    emissions: {
                      co2: response.data.outputs.co2?.value || 0,
                      ch4: response.data.outputs.ch4?.value || 0,
                      n2o: response.data.outputs.n2o?.value || 0,
                      co2e: co2e,
                    },
                    calculation_details: {
                      audit_log: auditLog,
                      applied_factors: appliedFactors,
                      formula_id: response.data.resolved_formula?.id || null,
                      formula_name: response.data.resolved_formula?.name || '',
                      emission_factor: `${efFromActivity} ${efUnitFromActivity}`,
                      outputs: response.data.outputs,
                    },
                  },
                };
              } else {
                // MONTHLY MODE: Update monthly_data
                return {
                  ...emp,
                  monthly_data: {
                    ...emp.monthly_data,
                    [monthKey]: {
                      ...emp.monthly_data[monthKey],
                      emissions: {
                        co2: response.data.outputs.co2?.value || 0,
                        ch4: response.data.outputs.ch4?.value || 0,
                        n2o: response.data.outputs.n2o?.value || 0,
                        co2e: co2e,
                      },
                      // Store calculation details for ledger display AND formula_id for save
                      calculation_details: {
                        audit_log: auditLog,
                        applied_factors: appliedFactors,
                        formula_id: response.data.resolved_formula?.id || null,
                        formula_name: response.data.resolved_formula?.name || '',
                        outputs: response.data.outputs,
                      },
                    },
                  },
                };
              }
            }
            return emp;
          });
          
          if (isYearly) {
            // For yearly mode, calculate total from all employees' yearly_data
            let yearlyTotalValue = 0;
            updatedEmployees.forEach(emp => {
              yearlyTotalValue += emp.yearly_data?.emissions?.co2e || 0;
            });
            setEmployeeYearlyTotal({ co2e: yearlyTotalValue });
          } else {
            // Recalculate monthly totals
            const newMonthlyTotals = {};
            const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            monthKeys.forEach(mk => {
              let total = 0;
              updatedEmployees.forEach(emp => {
                total += emp.monthly_data?.[mk]?.emissions?.co2e || 0;
              });
              if (total > 0) {
                newMonthlyTotals[mk] = { co2e: total };
              }
            });
            setEmployeeMonthlyTotals(newMonthlyTotals);
            
            // Calculate yearly total from monthly
            const yearlyTotalValue = Object.values(newMonthlyTotals).reduce((sum, m) => sum + (m.co2e || 0), 0);
            setEmployeeYearlyTotal({ co2e: yearlyTotalValue });
          }
          
          return updatedEmployees;
        });
        
        toast.success(`Calculated: ${co2e.toFixed(4)} tCO2e`);
      } else {
        toast.error('No calculation results returned');
      }
    } catch (error) {
      console.error('[MultiEmployee Calc] Error:', error);
      console.error('[MultiEmployee Calc] Error response:', error.response?.data);
      toast.error(error.response?.data?.detail || 'Failed to calculate emissions');
    } finally {
      setIsCalculatingEmployee(false);
    }
  }, [scope3Method, scope3ActivityType, scope3ActivityId, filteredScope3Activities, dynamicCategories, category, dynamicInputFields, getAuthHeader, useCustomActivity, scope3CustomActivity]);

  // Submit handler - creates emissions for each month with data
  // F6 (Option B): handleSubmit body lifted to useEmissionSubmit hook.
  // Form just assembles the ctx and calls submit().
  const { submit: handleSubmit } = useEmissionSubmit({
    // State
    facilityId, scope, category, fuelId, useCustomFuel, customFuelName,
    customEmissionFactor, customSource, isSaving, scope3Method, scope3ActivityId,
    scope3ActivityType, scope3Subcategory, typeOfProduct, scope3CustomActivity, useCustomActivity,
    biogenicScopeSelection, employees, frequencyType, reportingYearType, reportingYear,
    monthlyData, yearlyData, processNames, responsiblePerson,
    responsiblePersonDesignation, responsiblePersonContact, notes, recordSource, supplierName,
    supplierCode, employeeName, employeeId, assetName, fromLocation, toLocation,
    dynamicCategories,
    // Setters
    setIsSaving,
    // Computed
    isC7EmployeeCommuting, requiresSubcategory, selectedFuel,
    filteredScope3Activities, dynamicInputFields, centralizedUnits, defaultUnit,
    // Helpers
    canProceedToStep, getAuthHeader, onSuccess, getActualYearForMonth,
    evaluateFormula, buildDecisionInputs,
    // Editing
    editingEmission,
    // Supplier context (optional)
    supplierContext,
    // OCR context (for finalize-import after save)
    ocrPrefillData,
  });

  // Step indicators
  const steps = [
    { num: 1, title: 'Selection', desc: 'Facility, Scope, Category, Fuel' },
    { num: 2, title: 'Process', desc: 'Process names & Person responsible' },
    { num: 3, title: frequencyType === 'yearly' ? 'Annual Data' : 'Monthly Data', desc: frequencyType === 'yearly' ? 'Year & annual quantity' : 'Year & monthly quantities' },
    { num: 4, title: 'Notes', desc: 'Additional notes' }
  ];

  return (
    <div className="space-y-6">
      {/* OCR Import Notice Banner */}
      {ocrPrefillData && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              AI-Assisted Entry from Invoice
            </p>
            <p className="text-sm text-blue-600 mt-1">
              This form has been pre-filled from your uploaded invoice
              {ocrPrefillData.invoice_filename && (
                <span className="font-medium"> ({ocrPrefillData.invoice_filename})</span>
              )}. 
              The invoice will be automatically attached as evidence when you save.
            </p>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-6">
        {steps.map((step, idx) => (
          <div key={step.num} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
              currentStep >= step.num 
                ? 'bg-primary text-white' 
                : 'bg-stone-200 text-stone-500'
            }`}>
              {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
            </div>
            <div className="ml-2 hidden sm:block">
              <p className={`text-sm font-medium ${currentStep >= step.num ? 'text-primary' : 'text-stone-500'}`}>
                {step.title}
              </p>
              <p className="text-xs text-stone-400">{step.desc}</p>
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-12 h-0.5 mx-2 ${currentStep > step.num ? 'bg-primary' : 'bg-stone-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Selection - Extracted to Step1BasicSelection component */}
      {currentStep === 1 && (
        <Step1BasicSelection
          facilityId={facilityId}
          setFacilityId={setFacilityId}
          facilities={facilities}
          scope={scope}
          setScope={setScope}
          dynamicScopes={dynamicScopes}
          hasScope3Access={hasScope3Access}
          setCategory={setCategory}
          setFuelId={setFuelId}
          setScope3Method={setScope3Method}
          setScope3ActivityType={setScope3ActivityType}
          setScope3ActivityId={setScope3ActivityId}
          setUseCustomFuel={setUseCustomFuel}
          setBiogenicScopeSelection={setBiogenicScopeSelection}
          setScope3Subcategory={setScope3Subcategory}
          biogenicScopeSelection={biogenicScopeSelection}
          loadingBiogenicCategories={loadingBiogenicCategories}
          category={category}
          categoriesForScope={categoriesForScope}
          scope3Method={scope3Method}
          availableScope3Methods={availableScope3Methods}
          getMethodLabel={getMethodLabel}
          scope3ActivityType={scope3ActivityType}
          availableScope3ActivityTypes={availableScope3ActivityTypes}
          requiresSubcategory={requiresSubcategory}
          availableSubcategories={availableSubcategories}
          scope3Subcategory={scope3Subcategory}
          typeOfProduct={typeOfProduct}
          setTypeOfProduct={setTypeOfProduct}
          scope3ActivityId={scope3ActivityId}
          filteredScope3Activities={filteredScope3Activities}
          useCustomActivity={useCustomActivity}
          setUseCustomActivity={setUseCustomActivity}
          scope3CustomActivity={scope3CustomActivity}
          setScope3CustomActivity={setScope3CustomActivity}
          fuelSearchTerm={fuelSearchTerm}
          setFuelSearchTerm={setFuelSearchTerm}
          loadingScope3EF={loadingScope3EF}
          fuelId={fuelId}
          useCustomFuel={useCustomFuel}
          customFuelName={customFuelName}
          setCustomFuelName={setCustomFuelName}
          customEmissionFactor={customEmissionFactor}
          setCustomEmissionFactor={setCustomEmissionFactor}
          customEmissionFactorUnit={customEmissionFactorUnit}
          setCustomEmissionFactorUnit={setCustomEmissionFactorUnit}
          customSource={customSource}
          setCustomSource={setCustomSource}
          selectedFuel={selectedFuel}
          filteredFuelsForCategory={filteredFuelsForCategory}
          getAvailableEFUnits={getAvailableEFUnits}
          getQuantityUnitFromEFUnit={getQuantityUnitFromEFUnit}
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          supplierCode={supplierCode}
          setSupplierCode={setSupplierCode}
          employeeName={employeeName}
          setEmployeeName={setEmployeeName}
          employeeId={employeeId}
          setEmployeeId={setEmployeeId}
          // KPI Access Control
          kpiCanAccessScope={kpiCanAccessScope}
          kpiAllowedScopes={kpiAllowedScopes}
          filterFacilitiesByScope={filterFacilitiesByScope}
          hasFullKPIAccess={hasFullKPIAccess}
          // Decision field values (for calculation_methodology etc.)
          decisionFieldValues={decisionFieldValues}
          setDecisionFieldValues={setDecisionFieldValues}
        />
      )}

      {/* Step 2: Process & Responsibility - Extracted to Step2ProcessResponsibility component */}
      {currentStep === 2 && (
        <Step2ProcessResponsibility
          responsiblePerson={responsiblePerson}
          setResponsiblePerson={setResponsiblePerson}
          responsiblePersonDesignation={responsiblePersonDesignation}
          setResponsiblePersonDesignation={setResponsiblePersonDesignation}
          responsiblePersonContact={responsiblePersonContact}
          setResponsiblePersonContact={setResponsiblePersonContact}
          processNames={processNames}
          addProcessName={addProcessName}
          removeProcessName={removeProcessName}
          updateProcessName={updateProcessName}
          requiresAssetName={requiresAssetName}
          assetName={assetName}
          setAssetName={setAssetName}
          showsLocationFields={showsLocationFields}
          isC7EmployeeCommuting={isC7EmployeeCommuting}
          fromLocation={fromLocation}
          setFromLocation={setFromLocation}
          toLocation={toLocation}
          setToLocation={setToLocation}
          recordSource={recordSource}
          setRecordSource={setRecordSource}
        />
      )}

      {/* Step 3: Year & Monthly Data — delegated to category module via the
          registry. When a registered category exposes a `Step3Renderer`,
          the page renders that instead of the default `Step3YearMonthlyData`.
          The default is wired onto all categories during
          `initializeCategoryModules()`, so this is a no-op visually today
          but is the architectural hook for future per-category Step 3
          experiences (grid, matrix, wizard, multi-employee). */}
      {currentStep === 3 && (() => {
        // Resolve the active module the same way Emissions.js EDIT does.
        const catLower = (category || '').toLowerCase();
        let activeModule = null;
        if (scope === 'scope3') {
          const codeMatch = catLower.match(/^(c\d+)/);
          if (codeMatch) activeModule = categoryRegistry.get(codeMatch[1]);
          if (!activeModule) activeModule = categoryRegistry.getGenericModule?.('scope3');
        } else if (scope === 'scope1') {
          if (catLower.includes('stationary')) activeModule = categoryRegistry.get('stationary_combustion');
          else if (catLower.includes('mobile')) activeModule = categoryRegistry.get('mobile_combustion');
          else if (catLower.includes('fugitive')) activeModule = categoryRegistry.get('fugitive_emissions');
          activeModule = activeModule || categoryRegistry.getGenericModule?.('scope1');
        } else if (scope === 'scope2') {
          activeModule = categoryRegistry.getGenericModule?.('scope2');
        } else if (scope === 'biogenic') {
          activeModule = biogenicScopeSelection === 'scope3'
            ? categoryRegistry.getGenericModule?.('scope3')
            : categoryRegistry.getGenericModule?.('scope1');
        }
        const Step3 = activeModule?.Step3Renderer || Step3YearMonthlyData;
        return (
        <Step3
          reportingYearType={reportingYearType}
          setReportingYearType={setReportingYearType}
          hasOrgYearTypePreference={hasOrgYearTypePreference}
          reportingYear={reportingYear}
          setReportingYear={setReportingYear}
          frequencyType={frequencyType}
          setFrequencyType={setFrequencyType}
          editingEmission={editingEmission}
          setMonthlyData={setMonthlyData}
          setYearlyData={setYearlyData}
          setExpandedMonths={setExpandedMonths}
          activeMonths={activeMonths}
          monthlyData={monthlyData}
          expandedMonths={expandedMonths}
          yearlyData={yearlyData}
          dynamicInputFields={dynamicInputFields}
          formConfig={formConfig}
          loadingFormConfig={loadingFormConfig}
          getMonthStatus={getMonthStatus}
          filledMonthsCount={filledMonthsCount}
          updateMonthData={updateMonthData}
          getActualYearForMonth={getActualYearForMonth}
          isFutureMonth={isFutureMonth}
          getFieldUnitsForYearly={getFieldUnitsForYearly}
          renderDynamicField={renderDynamicField}
          isC7EmployeeCommuting={isC7EmployeeCommuting}
          scope3Method={scope3Method}
          scope3ActivityType={scope3ActivityType}
          scope3ActivityId={scope3ActivityId}
          employees={employees}
          setEmployees={setEmployees}
          employeeMonthlyTotals={employeeMonthlyTotals}
          employeeYearlyTotal={employeeYearlyTotal}
          isCalculatingEmployee={isCalculatingEmployee}
          handleCalculateEmployeeMonth={handleCalculateEmployeeMonth}
          filteredScope3Activities={filteredScope3Activities}
          useCustomActivity={useCustomActivity}
          scope3CustomActivity={scope3CustomActivity}
          scope={scope}
          biogenicScopeSelection={biogenicScopeSelection}
          useCustomFuel={useCustomFuel}
          selectedFuel={selectedFuel}
          centralizedUnits={centralizedUnits}
          defaultUnit={defaultUnit}
          allowedUnits={allowedUnits}
          customEmissionFactorUnit={customEmissionFactorUnit}
          customFuelQtyUnit={customFuelQtyUnit}
          calculationMethodology={decisionFieldValues.calculation_methodology || 'using_heat_basis_ncv'}
          getQuantityUnitFromEFUnit={getQuantityUnitFromEFUnit}
          handleEvidenceUpload={handleEvidenceUpload}
          removeEvidence={removeEvidence}
          BACKEND_URL={BACKEND_URL}
          category={category}
        />
        );
      })()}

      {/* Step 4: Notes - Extracted to Step4Notes component */}
      {currentStep === 4 && (
        <Step4Notes
          notes={notes}
          setNotes={setNotes}
          selectedFacility={selectedFacility}
          scope={scope}
          category={category}
          scope3Method={scope3Method}
          useCustomActivity={useCustomActivity}
          scope3CustomActivity={scope3CustomActivity}
          filteredScope3Activities={filteredScope3Activities}
          scope3ActivityId={scope3ActivityId}
          requiresSubcategory={requiresSubcategory}
          scope3Subcategory={scope3Subcategory}
          useCustomFuel={useCustomFuel}
          customFuelName={customFuelName}
          selectedFuel={selectedFuel}
          reportingYear={reportingYear}
          frequencyType={frequencyType}
          filledMonthsCount={filledMonthsCount}
          responsiblePerson={responsiblePerson}
          responsiblePersonDesignation={responsiblePersonDesignation}
          responsiblePersonContact={responsiblePersonContact}
          processNames={processNames}
          biogenicScopeSelection={biogenicScopeSelection}
          getMethodLabel={getMethodLabel}
        />
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={currentStep === 1 ? onCancel : handlePrev}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {currentStep === 1 ? 'Cancel' : 'Previous'}
        </Button>

        {currentStep < totalSteps ? (
          <Button type="button" onClick={handleNext}>
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button 
            type="button" 
            onClick={handleSubmit} 
            className="bg-green-600 hover:bg-green-700"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                {frequencyType === 'yearly' ? 'Save Annual Emissions' : `Save Emissions (${filledMonthsCount} months)`}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
