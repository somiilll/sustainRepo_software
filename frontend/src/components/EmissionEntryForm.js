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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to check if unit is volume-based (from centralized units)
const isVolumeUnit = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => u.symbol?.toLowerCase() === unit?.toLowerCase());
  return unitDef?.unit_type === 'volume';
};

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
  organization = null // Organization data for reporting year type
}) {
  // Helper to get method labels from centralized config
  const getMethodLabel = useCallback((method, short = false) => {
    if (!method) return '-';
    const defaultLabels = {
      activity_basis: short ? 'Average' : 'Average Data Based',
      spend_basis: short ? 'Spend' : 'Spend Based',
      supplier_basis: short ? 'Supplier' : 'Supplier Based'
    };
    if (configLabels) {
      const labels = short ? configLabels.calculation_methods_short : configLabels.calculation_methods;
      return labels?.[method] || defaultLabels[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return defaultLabels[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    // Process Emissions
    selectedSubIndustry, setSelectedSubIndustry,
    selectedTemplate, setSelectedTemplate,
    templateInputValues, setTemplateInputValues,
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
    // Scope 3 optional fields
    supplierName, setSupplierName,
    supplierCode, setSupplierCode,
    employeeName, setEmployeeName,
    employeeId, setEmployeeId,
  } = _formState;


  // Fetch form config when scope + category changes
  useEffect(() => {
    const fetchFormConfig = async () => {
      // Determine the effective scope for category lookup
      // - Biogenic Scope 1: fuel_database has scope='biogenic', so look for scope_code === 'biogenic'
      // - Biogenic Scope 3: uses Scope 3 biogenic categories, so look for scope_code === 'scope3'
      let effectiveScope = scope;
      if (scope === 'biogenic') {
        if (biogenicScopeSelection === 'scope3') {
          effectiveScope = 'scope3';
        } else if (biogenicScopeSelection === 'scope1') {
          effectiveScope = 'biogenic'; // Biogenic Scope 1 uses biogenic categories from fuel_database
        }
      }
      
      // Find category ID from dynamicCategories
      const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope);
      
      if (!categoryObj?.id) {
        setFormConfig(null);
        return;
      }
      
      setLoadingFormConfig(true);
      try {
        const response = await axios.get(
          `${API}/calc-engine/form-config/${categoryObj.id}`,
          {
            params: { scope: effectiveScope },
            headers: getAuthHeader()
          }
        );
        setFormConfig(response.data);
        setCalcEngineResult(null);
      } catch (error) {
        setFormConfig(null);
      } finally {
        setLoadingFormConfig(false);
      }
    };
    
    // Check if it's a process emission (inline check to avoid initialization order issues)
    const isProcess = category === 'Process Emissions';
    
    // For biogenic, also need biogenicScopeSelection to be set
    const biogenicReady = scope !== 'biogenic' || biogenicScopeSelection;
    
    if (scope && category && !isProcess && !useCustomFuel && biogenicReady) {
      fetchFormConfig();
    } else {
      setFormConfig(null);
    }
  }, [scope, category, dynamicCategories, getAuthHeader, useCustomFuel, biogenicScopeSelection]);

  // Sync decisionFieldValues + custom-activity auto-enable now live inside
  // useEmissionFormState (F2 integration). The corresponding inline useEffects
  // were removed here.

  // Fetch fugitive emissions data from fuel_database (Scope 1 fugitive emissions)
  useEffect(() => {
    const fetchFugitiveEmissions = async () => {
      try {
        // Fetch all fuels and filter for fugitive emissions
        const response = await axios.get(`${API}/fuel-database`, {
          headers: getAuthHeader()
        });
        const allFuels = response.data || [];
        
        // Filter for Fugitive Emissions category and map to activity format
        const fugitiveActivities = allFuels
          .filter(f => f.category === 'Fugitive Emissions' || f.categories?.includes('Fugitive Emissions'))
          .filter(f => f.gwp_fugitives !== null && f.gwp_fugitives !== undefined)
          .map(f => ({
            id: f.id,
            activity: f.fuel_name,
            emission_factor: f.gwp_fugitives,
            unit: 'kgCO2e/kg',
            source: f.source || 'Fugitive Emissions',
            allowed_units: f.allowed_units || ['kg', 'g', 't'],
            default_unit: 'kg'
          }));
        
        setFugitiveEmissionsData(fugitiveActivities);
      } catch (error) {
        console.error('Failed to fetch fugitive emissions:', error);
        setFugitiveEmissionsData([]);
      }
    };
    fetchFugitiveEmissions();
  }, [getAuthHeader]);

  // Fetch Scope 3 EF data when scope is scope3
  useEffect(() => {
    const fetchScope3EF = async () => {
      if (scope !== 'scope3') {
        setScope3EFData([]);
        return;
      }
      
      setLoadingScope3EF(true);
      try {
        // Fetch all scope3 EF data (bypass pagination for emission entry)
        const response = await axios.get(`${API}/scope3-ef?limit=10000`, {
          headers: getAuthHeader()
        });
        // Handle both paginated response (response.data.data) and direct array response
        const efData = response.data?.data || response.data || [];
        setScope3EFData(Array.isArray(efData) ? efData : []);
      } catch (error) {
        console.error('[Scope3 EF] Error fetching:', error);
        setScope3EFData([]);
      } finally {
        setLoadingScope3EF(false);
      }
    };
    
    fetchScope3EF();
  }, [scope, getAuthHeader]);

  // Fetch biogenic categories when biogenic tab is active and scope3 is selected
  useEffect(() => {
    const fetchBiogenicCategories = async () => {
      if (scope !== 'biogenic' || biogenicScopeSelection !== 'scope3') {
        return;
      }
      
      setLoadingBiogenicCategories(true);
      try {
        const response = await axios.get(`${API}/scope3-ef/categories-by-sub-scope?sub_scope=biogenic`, {
          headers: getAuthHeader()
        });
        setBiogenicCategories(response.data?.categories || []);
      } catch (error) {
        console.error('[Biogenic] Error fetching categories:', error);
        setBiogenicCategories([]);
      } finally {
        setLoadingBiogenicCategories(false);
      }
    };
    
    fetchBiogenicCategories();
  }, [scope, biogenicScopeSelection, getAuthHeader]);

  // Fetch biogenic scope3_ef data when biogenic + scope3 is selected
  useEffect(() => {
    const fetchBiogenicScope3EF = async () => {
      if (scope !== 'biogenic' || biogenicScopeSelection !== 'scope3') {
        return;
      }
      
      setLoadingScope3EF(true);
      try {
        // Fetch scope3_ef with sub_scope=biogenic filter
        const response = await axios.get(`${API}/scope3-ef?sub_scope=biogenic&limit=10000`, {
          headers: getAuthHeader()
        });
        const efData = response.data?.data || response.data || [];
        setScope3EFData(Array.isArray(efData) ? efData : []);
      } catch (error) {
        console.error('[Biogenic Scope3 EF] Error fetching:', error);
        setScope3EFData([]);
      } finally {
        setLoadingScope3EF(false);
      }
    };
    
    fetchBiogenicScope3EF();
  }, [scope, biogenicScopeSelection, getAuthHeader]);

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
      
      // For process_emissions (supplier_basis only), return empty for now
      if (scope3Subcategory === 'process_emissions') {
        return [];
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
    
    // Define available subcategories based on method
    const subcategories = [
      { value: 'stationary_combustion', label: 'Stationary Combustion' },
      { value: 'mobile_combustion', label: 'Mobile Combustion' },
      { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
      { value: 'energy', label: 'Energy' }
    ];
    
    // For activity_basis, don't show process_emissions (no data)
    // For supplier_basis, include process_emissions
    if (scope3Method === 'supplier_basis') {
      subcategories.push({ value: 'process_emissions', label: 'Process Emissions' });
    }
    
    return subcategories;
  }, [requiresSubcategory, scope3Method]);

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
    { value: 'tCO2/L', label: 'tCO₂/L', quantityUnit: 'L', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/m3', label: 'tCO₂/m³', quantityUnit: 'm³', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/kWh', label: 'tCO₂/kWh', quantityUnit: 'kWh', forScope: ['scope2'] },
    { value: 'tCO2/MWh', label: 'tCO₂/MWh', quantityUnit: 'MWh', forScope: ['scope2'] },
  ];

  // Get available EF units based on scope
  const getAvailableEFUnits = (currentScope) => {
    return EMISSION_FACTOR_UNITS.filter(u => u.forScope.includes(currentScope));
  };

  // Get quantity unit based on emission factor unit for custom fuels
  const getQuantityUnitFromEFUnit = (efUnit) => {
    const mapping = EMISSION_FACTOR_UNITS.find(u => u.value === efUnit);
    return mapping?.quantityUnit || 'kg';
  };

  // Step 2 + Step 3 form state moved to useEmissionFormState (F2 integration).
  // The hook also owns the reporting-year-type org-pref sync useEffect and the
  // editingEmission frequency_type/yearlyData hydration useEffect.

  // Helper function to update yearly data with validation
  const updateYearlyData = useCallback((field, value) => {
    // Fields that must be whole numbers (integers)
    const integerOnlyFields = [
      'qty_days_travelled', 'working_days', 'qty_passengers', 'qty_passenger',
      'number_of_passengers', 'qty_nights', 'number_of_nights', 'qty_rooms',
      'qty_room', 'number_of_rooms', 'no_of_employees', 'passengers_travelled'
    ];
    
    // Validate integer-only fields
    if (integerOnlyFields.includes(field) && value !== '' && value !== null) {
      const numValue = parseFloat(value);
      if (!Number.isInteger(numValue)) {
        toast.error(`${field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} must be a whole number`);
        return;
      }
    }
    
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
    
    // NOTE: Process Emissions category is now managed through the dynamic category system
    // It should be added via the formula builder/category management, not hardcoded here
    // The old hardcoded injection has been removed to respect user's category configuration
    
    return result;
  }, [fuelDatabase, scope, processTemplates, dynamicCategories, biogenicScopeSelection, biogenicCategories]);

  // Check if Process Emissions category is selected
  const isProcessEmissions = category === 'Process Emissions';

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
    
    if (isScope3Like && scope3Method && formConfig?.formulas?.length) {
      
      // Helper function to traverse decision tree and find formula_id
      const traverseDecisionTree = (node, fieldValues) => {
        if (!node) return null;
        
        // If this node has a formula_id, return it
        if (node.formula_id) {
          return node.formula_id;
        }
        
        // Get the field name at this node
        const fieldName = node.field_name;
        if (!fieldName) return null;
        
        // Get the user's selection for this field
        const selectedValue = fieldValues[fieldName];
        if (!selectedValue) return null;
        
        // Find the option matching the user's selection
        const options = node.options || {};
        const selectedOption = options[selectedValue];
        
        if (!selectedOption) return null;
        
        // If the selected option has a formula_id, return it
        if (selectedOption.formula_id) {
          return selectedOption.formula_id;
        }
        
        // If the selected option has a "next" node, recurse into it
        if (selectedOption.next) {
          return traverseDecisionTree(selectedOption.next, fieldValues);
        }
        
        return null;
      };
      
      // Try to find formula using decision tree traversal
      if (formConfig.decision_tree) {
        const decisionValues = {
          calculation_method_scope3: scope3Method,
          activity_type: scope3ActivityType || undefined,
          subcategory_selection: scope3Subcategory || undefined,
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
    // For Scope 1, Scope 2, or Biogenic Scope 1 - match formula based on decision tree or name
    else if ((scope === 'scope1' || scope === 'scope2' || isBiogenicScope1) && formConfig?.formulas?.length) {
      // For Biogenic Scope 1, prioritize formulas with "Biogenic" in the name
      if (isBiogenicScope1) {
        // First try to find a formula with "Biogenic" in the name
        matchedFormula = formConfig.formulas.find(f => 
          f.name?.toLowerCase().includes('biogenic')
        );
        // Fallback to first formula if no biogenic-specific formula found
        if (!matchedFormula && formConfig.formulas.length > 0) {
          matchedFormula = formConfig.formulas[0];
        }
      }
      // For regular Scope 1/2 - prioritize formulas with properties (cv, density) for Stationary/Mobile Combustion
      else {
        // Check if category is Stationary or Mobile Combustion (needs property overrides like cv, density)
        // Use the category prop/variable which is the category name from dynamicCategories
        const currentCategoryName = (category || categoryObj?.name || '').toLowerCase();
        const isStationaryOrMobile = currentCategoryName.includes('stationary') || currentCategoryName.includes('mobile');
        
        // Priority 1: For Stationary/Mobile Combustion, prefer "Heat Basis" formulas (which have cv, density properties)
        if (isStationaryOrMobile) {
          matchedFormula = formConfig.formulas.find(f => 
            f.name?.toLowerCase().includes('heat basis') || f.name?.toLowerCase().includes('heat-basis')
          );
        }
        
        // Priority 2: If not found, prefer formula that has properties (for override fields)
        if (!matchedFormula) {
          matchedFormula = formConfig.formulas.find(f => 
            f.properties?.length > 0 && f.properties.some(p => 
              ['cv', 'density'].includes(p.variable?.toLowerCase() || p.key?.toLowerCase())
            )
          );
        }
        
        // Priority 3: For non-combustion categories or if no formula with cv/density, fallback to Quantity Based
        if (!matchedFormula) {
          matchedFormula = formConfig.formulas.find(f => 
            f.name?.toLowerCase().includes('quantity') || 
            f.name?.toLowerCase().includes('activity')
          );
        }
        
        // Priority 4: Fallback to first formula
        if (!matchedFormula && formConfig.formulas.length > 0) {
          matchedFormula = formConfig.formulas[0];
        }
      }
      
      if (matchedFormula?.inputs?.length) {
        requiredInputVars = matchedFormula.inputs.map(inp => inp.variable);
      }
    }
    
    // Store the matched formula ID for use in saving
    const formulaId = matchedFormula?.id || null;
    
    // Filter input field mappings that apply to this category and scope
    const applicableMappings = formConfig.input_field_mappings.filter(m => {
      const appliesToCategory = !m.applies_to_categories?.length || 
                                m.applies_to_categories.includes(categoryId);
      const appliesToScope = !m.applies_to_scopes?.length || 
                             m.applies_to_scopes.includes(scopeId);
      
      // HARDCODED FIX: Always show cv and density for Scope 1/2 Stationary/Mobile Combustion
      // This must come FIRST before any other filtering to bypass scope restrictions
      const currentCategoryName = (category || '').toLowerCase();
      const isStationaryOrMobile = currentCategoryName.includes('stationary') || currentCategoryName.includes('mobile');
      if ((scope === 'scope1' || scope === 'scope2') && isStationaryOrMobile && m.is_override) {
        if (m.maps_to_variable === 'cv' || m.maps_to_variable === 'density') {
          // Only check category match and is_active - SKIP scope check for cv/density
          return appliesToCategory && m.is_active !== false;
        }
      }
      
      // For Scope 3 with a selected method, strictly filter by formula inputs/properties
      if (isScope3Like && requiredInputVars && matchedFormula) {
        if (m.is_override) {
          // Override fields (like PPP, inflation_rate) should only show if they are 
          // explicitly listed in the matched formula's properties array
          const formulaProperties = matchedFormula.properties || [];
          const isPropertyOfFormula = formulaProperties.some(
            prop => prop.variable === m.maps_to_variable || prop.key === m.maps_to_variable
          );
          if (!isPropertyOfFormula) return false;
        } else {
          // Regular input fields must be in the formula's inputs
          const isRequiredForFormula = requiredInputVars.includes(m.maps_to_variable);
          if (!isRequiredForFormula) return false;
        }
      }
      // For Scope 1/2/Biogenic Scope 1: only filter override fields by formula properties
      // Non-override fields use scope/category filtering only
      else if ((isBiogenicScope1 || scope === 'scope1' || scope === 'scope2') && matchedFormula) {
        if (m.is_override) {
          // For other override fields (not cv/density), check formula properties
          const formulaProperties = matchedFormula.properties || [];
          const isPropertyOfFormula = formulaProperties.some(
            prop => prop.variable === m.maps_to_variable || prop.key === m.maps_to_variable
          );
          if (!isPropertyOfFormula) return false;
        }
        // Non-override fields: rely on scope/category filtering (no formula input check)
      }
      
      return appliesToCategory && appliesToScope && m.is_active !== false;
    });
    
    // Sort by display_order
    applicableMappings.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    // Map to field objects for rendering
    const fields = applicableMappings.map(m => ({
      id: m.id,
      variable: m.maps_to_variable,
      fieldKey: m.field_key,
      label: m.field_label,  // Use exact label from mapping
      expectedUnit: m.default_unit,
      required: m.is_required,
      isOverride: m.is_override || false,
      fieldType: m.field_type || 'number',
      allowedUnits: m.allowed_units || [],
      unitSource: m.unit_source || 'static',
      placeholder: m.placeholder || `Enter ${m.field_label}`,
      helpText: m.help_text || '',
      mapsToContext: m.maps_to_context,  // KEY: e.g., "ef_quantity_provided"
      mapsToContextValueWhenFilled: m.maps_to_context_value_when_filled || 'true',  // Flexible value when filled
      mapsToContextValueWhenEmpty: m.maps_to_context_value_when_empty || 'false',   // Flexible value when empty
      options: m.options || [],  // For select field_type
    }));
    
    // Return both fields and the matched formula ID
    return { fields, formulaId };
  }, [formConfig, dynamicCategories, category, scope, dynamicScopes, scope3Method, scope3ActivityType, scope3Subcategory, biogenicScopeSelection]);
  
  // Extract fields and formula ID from the memoized result
  const dynamicInputFields = dynamicInputFieldsResult?.fields || [];
  const currentFormulaId = dynamicInputFieldsResult?.formulaId || null;
  
  // Update matched formula ID when it changes
  useEffect(() => {
    if (currentFormulaId !== matchedFormulaId) {
      setMatchedFormulaId(currentFormulaId);
    }
  }, [currentFormulaId, matchedFormulaId]);

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
    
    return decisionInputs;
  }, [dynamicInputFields, scope, scope3Method, decisionFieldValues, biogenicScopeSelection, category]);

  // Execute calculation via backend calc engine
  const executeCalcEngine = useCallback(async (monthKey, monthData) => {
    if (!formConfig) {
      return null;
    }
    
    // Determine if this is a scope3-like flow (regular scope3 or biogenic scope3)
    const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
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
      if (!selectedFuel || !fuelId) {
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
      dynamicInputFields.forEach(field => {
        const value = monthData[field.variable] || monthData[field.fieldKey];
        if (value !== undefined && value !== null && value !== '') {
          // Determine unit
          let unit = field.expectedUnit;
          if (field.unitSource === 'fuel') {
            // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
            if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
              const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
              unit = monthData[`${field.variable}_unit`] || monthData.unit || matchedActivity?.allowed_units?.[0] || 'kg';
            } else if (selectedFuel?.allowed_units?.length) {
              unit = monthData[`${field.variable}_unit`] || monthData.unit || selectedFuel.allowed_units[0];
            }
          } else if (monthData[`${field.variable}_unit`]) {
            unit = monthData[`${field.variable}_unit`];
          }
          
          inputs[field.variable] = {
            value: parseFloat(value),
            unit: unit || 'kg'
          };
        }
      });
      
      // Build context
      const matchedEFEntry = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      
      // For Scope 3 subcategory categories (C8, C10, C11, C13, C14) with fugitive emissions,
      // use the activity name as fuel_name since the activity IS the fuel (e.g., "HFC-32")
      // Skip this for supplier_basis as it uses a basic formula without fuel_database lookup
      let fuelNameForContext = selectedFuel?.fuel_name || '';
      if (isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFEntry?.activity) {
        fuelNameForContext = matchedEFEntry.activity;
      }
      
      // Build reporting_period for currency conversion lookup
      const actualYear = getActualYearForMonth(monthKey);
      const monthReportingPeriod = `${actualYear}-${monthKey}`;
      
      const context = {
        fuel_name: fuelNameForContext,
        fuel_id: fuelId || '',
        scope: effectiveScope, // Use effective scope for context
        category: category,
        facility_id: facilityId,
        reporting_period: monthReportingPeriod, // For currency conversion year lookup
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
  }, [formConfig, selectedFuel, fuelId, dynamicCategories, category, scope, facilityId, dynamicInputFields, buildDecisionInputs, getAuthHeader, scope3Method, scope3ActivityId, filteredScope3Activities, useCustomActivity, scope3CustomActivity, requiresSubcategory, scope3Subcategory, biogenicScopeSelection]);

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
      if (!selectedFuel || !fuelId) return null;
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
      dynamicInputFields.forEach(field => {
        const value = yearlyData[field.variable];
        if (value !== undefined && value !== null && value !== '') {
          let unit = field.expectedUnit;
          if (field.unitSource === 'fuel') {
            if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
              const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
              unit = yearlyData[`${field.variable}_unit`] || matchedActivity?.allowed_units?.[0] || field.expectedUnit;
            } else {
              unit = yearlyData[`${field.variable}_unit`] || selectedFuel?.allowed_units?.[0] || field.expectedUnit;
            }
          } else {
            unit = yearlyData[`${field.variable}_unit`] || field.expectedUnit || '';
          }
          inputs[field.variable] = { value: parseFloat(value), unit: unit };
        }
      });
      
      // Build context
      const matchedEFForContext = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      
      // For Scope 3 subcategory categories (C8, C10, C11, C13, C14) with fugitive emissions,
      // use the activity name as fuel_name since the activity IS the fuel (e.g., "HFC-32")
      // Skip this for supplier_basis as it uses a basic formula without fuel_database lookup
      let fuelNameForContext = selectedFuel?.fuel_name || '';
      if (isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForContext?.activity) {
        fuelNameForContext = matchedEFForContext.activity;
      }
      
      // Build yearly reporting period for currency conversion lookup
      const yearlyReportingPeriodForCalc = reportingYearType === 'financial' 
        ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
        : `CY${reportingYear}`;
      
      const context = {
        fuel_name: fuelNameForContext,
        fuel_id: fuelId || '',
        scope: effectiveScope,
        category: category,
        facility_id: facilityId,
        reporting_period: yearlyReportingPeriodForCalc, // For currency conversion year lookup
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

  // Get unique sub-industries from process templates
  const availableSubIndustries = useMemo(() => {
    if (!isProcessEmissions) return [];
    const subIndustries = new Set();
    processTemplates.forEach(t => {
      if (t.sub_industry) {
        subIndustries.add(t.sub_industry);
      }
    });
    return Array.from(subIndustries).sort();
  }, [processTemplates, isProcessEmissions]);

  // Get templates for selected sub-industry
  const templatesForSubIndustry = useMemo(() => {
    if (!isProcessEmissions || !selectedSubIndustry) return [];
    return processTemplates.filter(t => t.sub_industry === selectedSubIndustry);
  }, [processTemplates, selectedSubIndustry, isProcessEmissions]);

  // Evaluate formula with given values (for process emissions)
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
        // Sort by specificity - prefer configs with fewer categories (more specific)
        // A config with just ['Fugitive Emissions'] should rank higher than one with multiple categories
        categoryMatches.sort((a, b) => {
          const aCats = a.categories || (a.category ? [a.category] : []);
          const bCats = b.categories || (b.category ? [b.category] : []);
          // Fewer categories = more specific = higher priority
          if (aCats.length !== bCats.length) {
            return aCats.length - bCats.length;
          }
          // Same number of categories, use priority
          return (b.priority || 0) - (a.priority || 0);
        });
        matchingConfigs = categoryMatches;
      }
    } else {
      // Sort by priority (highest first)
      matchingConfigs.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
    
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
      if (gasType === 'co2e' && keyLower.includes('co2e')) return formula;
      if (gasType === 'electricity' && (keyLower.includes('elec') || keyLower.includes('scope2'))) return formula;
      // For fugitive emissions, also check for 'fugitive' in the key
      if (gasType === 'co2' && keyLower.includes('fugitive')) return formula;
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
    // Fields that must be whole numbers (integers)
    const integerOnlyFields = [
      'qty_days_travelled', 'working_days', 'qty_passengers', 'qty_passenger',
      'number_of_passengers', 'qty_nights', 'number_of_nights', 'qty_rooms',
      'qty_room', 'number_of_rooms', 'no_of_employees', 'passengers_travelled'
    ];
    
    // Validate integer-only fields
    if (integerOnlyFields.includes(field) && value !== '' && value !== null) {
      const numValue = parseFloat(value);
      if (!Number.isInteger(numValue)) {
        toast.error(`${field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} must be a whole number`);
        return;
      }
    }
    
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
  const renderDynamicField = (field, monthKey, data) => {
    const isQtyField = field.variable === 'qty' || field.variable === 'qty_energy';
    
    // Determine field units based on unit_source
    let fieldUnits = [];
    if (field.unitSource === 'fuel') {
      if (scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
        const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
        fieldUnits = matchedActivity?.allowed_units || [];
      } else {
        fieldUnits = selectedFuel?.allowed_units || [];
      }
    } else if (field.unitSource === 'all_units') {
      fieldUnits = centralizedUnits.map(u => u.symbol);
      if (field.variable === 'emission_factor_supplier_based' && scope3Method === 'supplier_basis') {
        fieldUnits = fieldUnits.filter(u => {
          const upperUnit = u.toUpperCase();
          return upperUnit.startsWith('TCO2E') || upperUnit.startsWith('TCO2');
        });
      }
    } else if (field.unitSource === 'scope3_ef') {
      const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
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
    
    // For supplier-basis, ALL fields should use free text input for units (not dropdown)
    // This includes the main value fields like activity_value_supplier_based, emission_factor_supplier_based
    const isSupplierBasisField = scope3Method === 'supplier_basis' && 
      (field.variable?.includes('supplier') || field.variable?.includes('Supplier'));
    
    // Hide dropdown for supplier basis fields even if they have fieldUnits configured
    // For override fields, only show unit selector if field has an expected unit
    const showUnitSelector = fieldUnits.length > 0 && !isSupplierBasisField && 
      (!field.isOverride || (field.isOverride && field.expectedUnit));
    
    // For override fields with expected unit but only one option, show as fixed text
    const showFixedUnit = field.isOverride && field.expectedUnit && fieldUnits.length <= 1;
    
    // Show free text unit input for supplier basis fields
    const showSupplierUnitInput = isSupplierBasisField && !field.variable?.endsWith('_unit');
    
    // Show checkbox for override fields OR optional fields (not required and not override)
    const showOverrideCheckbox = field.isOverride || (!field.required && !field.isOverride);
    
    // Check if this field should only accept whole numbers
    const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days', 'passengers_travelled'].includes(field.variable);
    
    return (
      <div key={field.id || field.variable} className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="font-medium">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          
          {showOverrideCheckbox && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`override-${field.variable}-${monthKey}`}
                checked={data[`override_${field.variable}`] || false}
                onChange={(e) => {
                  updateMonthData(monthKey, `override_${field.variable}`, e.target.checked);
                  if (e.target.checked && !data[`${field.variable}_unit`]) {
                    let overrideUnits = [];
                    if (field.unitSource === 'fuel') {
                      if (scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
                        const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                        overrideUnits = matchedActivity?.allowed_units || [];
                      } else {
                        overrideUnits = selectedFuel?.allowed_units || [];
                      }
                    } else if (field.unitSource === 'all_units') {
                      overrideUnits = centralizedUnits.map(u => u.symbol);
                    } else {
                      overrideUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
                    }
                    if (overrideUnits.length > 0) {
                      updateMonthData(monthKey, `${field.variable}_unit`, overrideUnits[0]);
                    }
                  }
                }}
                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <label 
                htmlFor={`override-${field.variable}-${monthKey}`} 
                className="text-xs text-amber-600 font-medium"
              >
                Override Default
              </label>
            </div>
          )}
        </div>
        
        {/* Render based on field_type */}
        {field.fieldType === 'select' && field.options?.length > 0 ? (
          <select
            value={data[field.variable] || data[field.fieldKey] || ''}
            onChange={(e) => updateMonthData(monthKey, field.variable, e.target.value)}
            disabled={showOverrideCheckbox && !data[`override_${field.variable}`]}
            className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${showOverrideCheckbox && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid={`select-${field.fieldKey}-${monthKey}`}
          >
            <option value="">Select {field.label}</option>
            {field.options.map(opt => (
              <option key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </option>
            ))}
          </select>
        ) : (
          <div className={(showUnitSelector || showSupplierUnitInput || showFixedUnit) ? "grid grid-cols-3 gap-2" : ""}>
            <Input
              type={field.fieldType === 'text' ? 'text' : 'number'}
              step={field.fieldType === 'number' ? (isUnitlessCountField ? '1' : 'any') : undefined}
              min={field.fieldType === 'number' ? '0' : undefined}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              value={data[field.variable] || data[field.fieldKey] || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (field.fieldType === 'text' || val === '' || parseFloat(val) >= 0) {
                  updateMonthData(monthKey, field.variable, val);
                }
              }}
              onKeyDown={(e) => { if (field.fieldType === 'number' && e.key === '-') e.preventDefault(); }}
              disabled={showOverrideCheckbox && !data[`override_${field.variable}`]}
              className={`bg-stone-50 ${(showUnitSelector || showSupplierUnitInput || showFixedUnit) ? 'col-span-2' : ''} ${showOverrideCheckbox && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid={`input-${field.fieldKey}-${monthKey}`}
            />
            
            {/* Unit selector - dropdown for regular fields */}
            {showUnitSelector && (
              <select
                value={data[`${field.variable}_unit`] || data.unit || fieldUnits[0]}
                onChange={(e) => {
                  updateMonthData(monthKey, `${field.variable}_unit`, e.target.value);
                  if (isQtyField) {
                    updateMonthData(monthKey, 'unit', e.target.value);
                  }
                }}
                disabled={showOverrideCheckbox && !data[`override_${field.variable}`]}
                className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${showOverrideCheckbox && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid={`unit-${field.fieldKey}-${monthKey}`}
              >
                {fieldUnits.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}
            
            {/* Fixed unit display for override fields (not editable) */}
            {showFixedUnit && (
              <div className={`flex items-center h-10 bg-stone-100 border border-stone-200 rounded-lg px-3 text-stone-600 ${showOverrideCheckbox && !data[`override_${field.variable}`] ? 'opacity-50' : ''}`}>
                <span>{field.expectedUnit || fieldUnits[0]}</span>
              </div>
            )}
            
            {/* Free text unit input for supplier basis fields */}
            {showSupplierUnitInput && (
              <Input
                type="text"
                placeholder="Unit"
                value={data[`${field.variable}_unit`] || ''}
                onChange={(e) => updateMonthData(monthKey, `${field.variable}_unit`, e.target.value)}
                disabled={showOverrideCheckbox && !data[`override_${field.variable}`]}
                className={`bg-stone-50 ${showOverrideCheckbox && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid={`unit-text-${field.fieldKey}-${monthKey}`}
              />
            )}
          </div>
        )}
        
        {/* Help text */}
        {field.helpText && (
          <p className="text-xs text-stone-400">{field.helpText}</p>
        )}
      </div>
    );
  };

  // Helper function to compute field units (same logic as monthly, used for yearly mode)
  const getFieldUnitsForYearly = (field) => {
    let fieldUnits = [];
    if (field.unitSource === 'fuel') {
      if (scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
        const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
        fieldUnits = matchedActivity?.allowed_units || [];
      } else {
        fieldUnits = selectedFuel?.allowed_units || [];
      }
    } else if (field.unitSource === 'all_units') {
      fieldUnits = centralizedUnits.map(u => u.symbol);
      if (field.variable === 'emission_factor_supplier_based' && scope3Method === 'supplier_basis') {
        fieldUnits = fieldUnits.filter(u => {
          const upperUnit = u.toUpperCase();
          return upperUnit.startsWith('TCO2E') || upperUnit.startsWith('TCO2');
        });
      }
    } else if (field.unitSource === 'scope3_ef') {
      const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
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
    return fieldUnits;
  };


  // Check if month has data
  const getMonthStatus = (monthKey) => {
    const data = monthlyData[monthKey];
    if (!data) return 'empty';
    
    // For process emissions, check if template input fields have data
    if (isProcessEmissions && selectedTemplate) {
      const inputFields = selectedTemplate.input_fields || [];
      const hasData = inputFields.some(field => data[field.key] && parseFloat(data[field.key]) > 0);
      return hasData ? 'filled' : 'empty';
    }
    
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
    
    if (isProcessEmissions && selectedTemplate) {
      // For process emissions, count months that have any template input field filled
      const inputFields = selectedTemplate.input_fields || [];
      return Object.values(monthlyData).filter(m => {
        return inputFields.some(field => m?.[field.key] && parseFloat(m[field.key]) > 0);
      }).length;
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
  }, [monthlyData, yearlyData, frequencyType, isProcessEmissions, selectedTemplate, dynamicInputFields, isC7EmployeeCommuting, employees]);

  // Validation for each step
  const canProceedToStep = (step) => {
    switch (step) {
      case 2:
        if (!facilityId) return { valid: false, message: 'Please select a facility' };
        if (!scope) return { valid: false, message: 'Please select a scope' };
        if (!category) return { valid: false, message: 'Please select a category' };
        
        // Process Emissions validation for Step 1
        if (isProcessEmissions) {
          if (!selectedSubIndustry) return { valid: false, message: 'Please select a sub-industry' };
          if (!selectedTemplate) return { valid: false, message: 'Please select an approach/template' };
          return { valid: true };
        }
        
        // Scope 3 validation
        if (scope === 'scope3') {
          if (!scope3Method) return { valid: false, message: 'Please select a calculation method' };
          // For supplier_basis with custom activity toggle ON, check custom activity
          // Otherwise check selected activity from dropdown
          if (scope3Method === 'supplier_basis' && useCustomActivity) {
            if (!scope3CustomActivity?.trim()) return { valid: false, message: 'Please enter an activity name' };
          } else {
            if (!scope3ActivityId) return { valid: false, message: 'Please select an activity type' };
          }
          return { valid: true };
        }
        
        // Biogenic Scope 3 validation (uses activities like regular Scope 3)
        if (scope === 'biogenic' && biogenicScopeSelection === 'scope3') {
          if (!scope3Method) return { valid: false, message: 'Please select a calculation method' };
          // For supplier_basis with custom activity toggle ON, check custom activity
          if (scope3Method === 'supplier_basis' && useCustomActivity) {
            if (!scope3CustomActivity?.trim()) return { valid: false, message: 'Please enter an activity name' };
          } else {
            if (!scope3ActivityId) return { valid: false, message: 'Please select a biogenic activity' };
          }
          return { valid: true };
        }
        
        // Biogenic validation - must select scope1 or scope3
        if (scope === 'biogenic' && !biogenicScopeSelection) {
          return { valid: false, message: 'Please select a biogenic emission type (Scope 1 or Scope 3)' };
        }
        
        // Regular fuel emissions validation (Scope 1, 2, Biogenic Scope 1)
        if (!useCustomFuel && !fuelId) return { valid: false, message: 'Please select a fuel type' };
        if (useCustomFuel && !customFuelName) return { valid: false, message: 'Please enter custom fuel name' };
        if (useCustomFuel && !customEmissionFactor) return { valid: false, message: 'Please enter emission factor' };
        // Justification is mandatory for custom fuel type
        if (useCustomFuel && !customSource?.trim()) return { valid: false, message: 'Please enter source/justification for custom fuel type' };
        return { valid: true };
      case 3:
        // For process emissions, only validate responsible person (no process names needed)
        if (isProcessEmissions) {
          if (!responsiblePerson.trim()) return { valid: false, message: 'Please enter person responsible' };
          return { valid: true };
        }
        // For regular emissions, validate process names and responsible person
        const validProcesses = processNames.filter(p => p.name && p.name.trim() !== '');
        if (validProcesses.length === 0) return { valid: false, message: 'Please enter at least one process name' };
        
        // Check if all processes with names have descriptions
        const processesWithoutDescription = validProcesses.filter(p => !p.description || p.description.trim() === '');
        if (processesWithoutDescription.length > 0) {
          return { valid: false, message: `Please add description for process: "${processesWithoutDescription[0].name}"` };
        }
        
        if (!responsiblePerson.trim()) return { valid: false, message: 'Please enter person responsible' };
        
        // Asset Name validation for C8/C13/C14/C15
        if (requiresAssetName && !assetName?.trim()) {
          return { valid: false, message: 'Please enter asset name' };
        }
        
        return { valid: true };
      case 4:
        // For C7 Employee Commuting, check if at least one employee has calculated data
        if (isC7EmployeeCommuting) {
          if (employees.length === 0) {
            return { valid: false, message: 'Please add at least one employee' };
          }
          
          // For supplier_basis: validate units for all employees
          if (scope3Method === 'supplier_basis') {
            const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);
            
            if (frequencyType === 'yearly') {
              // Validate yearly data units for all employees
              for (const emp of employees) {
                const inputs = emp.yearly_data?.inputs || {};
                const hasYearlyData = Object.values(inputs).some(v => 
                  v !== '' && v !== null && v !== undefined && v !== 0
                );
                
                if (hasYearlyData) {
                  for (const field of requiredFields) {
                    const value = inputs[field.variable];
                    const unit = inputs[`${field.variable}_unit`];
                    if (value && value !== '' && value !== 0) {
                      if (!unit || unit.trim() === '') {
                        const empName = emp.name || 'Unnamed employee';
                        return { valid: false, message: `Please enter unit for "${field.label}" for ${empName}` };
                      }
                    }
                  }
                }
              }
            } else {
              // Validate monthly data units for all employees
              for (const emp of employees) {
                for (const [monthKey, monthData] of Object.entries(emp.monthly_data || {})) {
                  const inputs = monthData?.inputs || {};
                  const hasMonthData = Object.values(inputs).some(v => 
                    v !== '' && v !== null && v !== undefined && v !== 0
                  );
                  
                  if (hasMonthData) {
                    for (const field of requiredFields) {
                      const value = inputs[field.variable];
                      const unit = inputs[`${field.variable}_unit`];
                      if (value && value !== '' && value !== 0) {
                        if (!unit || unit.trim() === '') {
                          const empName = emp.name || 'Unnamed employee';
                          const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
                          return { valid: false, message: `Please enter unit for "${field.label}" for ${empName} in ${monthName}` };
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Check based on frequency type
          if (frequencyType === 'yearly') {
            // For yearly mode, check if at least one employee has yearly calculation
            const hasYearlyData = employees.some(emp => 
              emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined
            );
            if (!hasYearlyData) {
              return { valid: false, message: 'Please calculate emissions for at least one employee' };
            }
          } else {
            // For monthly mode, check monthly data
            const hasCalculatedData = employees.some(emp => 
              Object.values(emp.monthly_data || {}).some(m => m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined)
            );
            if (!hasCalculatedData) {
              return { valid: false, message: 'Please calculate emissions for at least one employee month' };
            }
          }
          return { valid: true };
        }
        
        // For yearly mode (non-C7), check yearlyData instead of monthly
        if (frequencyType === 'yearly') {
          // Check if yearly data has values
          const hasYearlyInput = Object.values(yearlyData || {}).some(v => v !== '' && v !== null && v !== undefined);
          if (!hasYearlyInput) {
            return { valid: false, message: 'Please enter annual data values' };
          }
          
          // For supplier_basis: Validate units are provided for Qty Used and Emission Factor
          if (scope3Method === 'supplier_basis') {
            // Check Qty Used unit
            const qtyValue = yearlyData?.activity_value_supplier_based;
            const qtyUnit = yearlyData?.activity_value_supplier_based_unit || yearlyData?.unit;
            if (qtyValue && (!qtyUnit || qtyUnit.trim() === '')) {
              return { valid: false, message: 'Please enter unit for "Quantity Used"' };
            }
            
            // Check Emission Factor unit
            const efValue = yearlyData?.emission_factor_supplier_based;
            const efUnit = yearlyData?.emission_factor_supplier_based_unit;
            if (efValue && (!efUnit || efUnit.trim() === '')) {
              return { valid: false, message: 'Please enter unit for "Emission Factor"' };
            }
          }
          
          // Validate override and optional fields - if checkbox is checked, value must be entered
          const overrideAndOptionalFields = dynamicInputFields.filter(f => f.isOverride || (!f.required && !f.isOverride));
          for (const field of overrideAndOptionalFields) {
            const overrideKey = `override_${field.variable}`;
            const isCheckboxChecked = yearlyData[overrideKey] === true || yearlyData[overrideKey] === 'true';
            const value = yearlyData[field.variable];
            const hasValue = value !== '' && value !== null && value !== undefined && value !== 0;
            
            if (isCheckboxChecked && !hasValue) {
              const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
              return { valid: false, message: `Please enter a value for "${fieldLabel}" or uncheck the Override Default checkbox` };
            }
          }
          
          return { valid: true };
        }
        
        if (filledMonthsCount === 0) return { valid: false, message: 'Please enter data for at least one month' };
        
        // Validate mandatory formula fields for each filled month
        // Only check REQUIRED (non-optional) inputs
        if (dynamicInputFields.length > 0) {
          const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);
          
          for (const [monthKey, data] of Object.entries(monthlyData)) {
            // Check if user has entered data in ANY of the required formula fields
            const hasAnyRequiredData = requiredFields.some(field => {
              const value = data[field.variable] || data[field.fieldKey];
              return value !== '' && value !== null && value !== undefined;
            });
            
            // If user started filling required fields, ALL required fields must be filled
            if (hasAnyRequiredData) {
              for (const field of requiredFields) {
                const value = data[field.variable] || data[field.fieldKey];
                if (value === '' || value === null || value === undefined) {
                  const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
                  const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
                  return { valid: false, message: `Please fill in "${fieldLabel}" for ${monthName}` };
                }
              }
              
              // For supplier_basis: Validate units are provided for Qty Used and Emission Factor
              if (scope3Method === 'supplier_basis') {
                const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
                
                // Check Qty Used unit
                const qtyField = requiredFields.find(f => 
                  f.variable === 'activity_value_supplier_based' || 
                  f.variable?.toLowerCase().includes('quantity') ||
                  f.label?.toLowerCase?.().includes('quantity')
                );
                if (qtyField) {
                  const qtyValue = data[qtyField.variable] || data[qtyField.fieldKey];
                  const qtyUnit = data[`${qtyField.variable}_unit`] || data.activity_value_supplier_based_unit;
                  if (qtyValue && (!qtyUnit || qtyUnit.trim() === '')) {
                    return { valid: false, message: `Please enter unit for "Quantity Used" in ${monthName}` };
                  }
                }
                
                // Check Emission Factor unit
                const efField = requiredFields.find(f => 
                  f.variable === 'emission_factor_supplier_based' || 
                  f.variable?.toLowerCase().includes('emission_factor') ||
                  f.label?.toLowerCase?.().includes('emission factor')
                );
                if (efField) {
                  const efValue = data[efField.variable] || data[efField.fieldKey];
                  const efUnit = data[`${efField.variable}_unit`] || data.emission_factor_supplier_based_unit;
                  if (efValue && (!efUnit || efUnit.trim() === '')) {
                    return { valid: false, message: `Please enter unit for "Emission Factor" in ${monthName}` };
                  }
                }
              }
            }
          }
        }
        
        // Validate override and optional fields - if checkbox is checked, value must be entered
        const overrideAndOptionalFields = dynamicInputFields.filter(f => f.isOverride || (!f.required && !f.isOverride));
        for (const [monthKey, data] of Object.entries(monthlyData)) {
          for (const field of overrideAndOptionalFields) {
            const isCheckboxChecked = data[`override_${field.variable}`];
            const value = data[field.variable] || data[field.fieldKey];
            const hasValue = value !== '' && value !== null && value !== undefined && value !== 0;
            
            if (isCheckboxChecked && !hasValue) {
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
              return { valid: false, message: `Please enter a value for "${fieldLabel}" in ${monthName} or uncheck the Override Default checkbox` };
            }
          }
        }
        
        // Validate that custom EF months have justification (only for regular emissions)
        // Also auto-unselect overrides if no value entered
        if (!isProcessEmissions) {
          for (const [monthKey, data] of Object.entries(monthlyData)) {
            // Auto-unselect custom EF if no value entered
            if (data.useCustomEmissionFactor && !data.customEmissionFactor) {
              updateMonthData(monthKey, 'useCustomEmissionFactor', false);
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Custom Emission Factor in ${monthName} was unselected because no value was entered. Please review and try again.` };
            }
            if (data.quantity && data.useCustomEmissionFactor && !data.customEmissionFactorSource?.trim()) {
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Please enter source/justification for custom emission factor in ${monthName}` };
            }
            // Auto-unselect calorific value override if no value entered
            if (data.overrideCalorificValue && !data.calorificValue) {
              updateMonthData(monthKey, 'overrideCalorificValue', false);
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Calorific Value override in ${monthName} was unselected because no value was entered. Please review and try again.` };
            }
            // Validate calorific value override justification
            if (data.quantity && data.overrideCalorificValue && data.calorificValue && !data.calorificValueJustification?.trim()) {
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Please enter justification for calorific value override in ${monthName}` };
            }
            // Auto-unselect density override if no value entered
            if (data.overrideDensity && !data.density) {
              updateMonthData(monthKey, 'overrideDensity', false);
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Density override in ${monthName} was unselected because no value was entered. Please review and try again.` };
            }
            // Validate density override justification
            if (data.quantity && data.overrideDensity && data.density && !data.densityJustification?.trim()) {
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Please enter justification for density override in ${monthName}` };
            }
            // Auto-unselect emission factor (heat basis) override if no value entered
            if (data.overrideEmissionFactorHeat && !data.emissionFactorHeat) {
              updateMonthData(monthKey, 'overrideEmissionFactorHeat', false);
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Custom CO2 Emission Factor (Heat Basis) override in ${monthName} was unselected because no value was entered. Please review and try again.` };
            }
            // Validate emission factor (heat basis) override justification
            if (data.quantity && data.overrideEmissionFactorHeat && data.emissionFactorHeat && !data.emissionFactorHeatJustification?.trim()) {
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Please enter justification for Custom CO2 Emission Factor (Heat Basis) override in ${monthName}` };
            }
          }
        }
        return { valid: true };
      default:
        return { valid: true };
    }
  };

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
  const handleSubmit = async () => {
    // Prevent duplicate submissions
    if (isSaving) return;
    
    const validation = canProceedToStep(5); // Final validation
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    setIsSaving(true); // Disable button immediately

    // Shared module-resolution helper (used by both monthly & yearly dispatch).
    // Returns the active category module (with `buildCreatePayload`) or null
    // if the scope/category combo is not yet wired through the registry.
    const resolveDispatchModule = () => {
      const cat = (category || '').toLowerCase();
      let mod = null;
      if (scope === 'scope3') {
        const codeMatch = cat.match(/^(c\d+)/);
        if (!codeMatch) return null;
        if (codeMatch[1] === 'c7') return null; // C7 has its own dedicated branch
        mod = categoryRegistry.get(codeMatch[1]);
      } else if (scope === 'scope1') {
        if (cat.includes('stationary')) mod = categoryRegistry.get('stationary_combustion');
        else if (cat.includes('mobile')) mod = categoryRegistry.get('mobile_combustion');
        else if (cat.includes('fugitive')) mod = categoryRegistry.get('fugitive_emissions');
        else mod = categoryRegistry.getGenericModule?.('scope1');
      } else if (scope === 'scope2') {
        mod = categoryRegistry.getGenericModule?.('scope2');
      } else if (scope === 'biogenic') {
        if (biogenicScopeSelection === 'scope3') {
          const codeMatch = cat.match(/^(c\d+)/);
          if (codeMatch && codeMatch[1] === 'c7') return null;
          mod = categoryRegistry.getGenericModule?.('scope3');
        } else if (biogenicScopeSelection === 'scope1') {
          mod = categoryRegistry.getGenericModule?.('scope1');
        }
      }
      return mod?.buildCreatePayload ? mod : null;
    };

    try {
      const validProcesses = processNames.filter(p => p.name && p.name.trim() !== '');
      
      // ===========================================
      // C7 EMPLOYEE COMMUTING HANDLING (Phase F: module dispatch)
      // ===========================================
      // Multi-employee yearly + monthly CREATE flow.
      // Logic lives in /modules/emissions/categories/C7EmployeeCommuting/create.js
      // Dedicated endpoints: /api/emissions/c7/yearly and /api/emissions/c7/month
      if (isC7EmployeeCommuting && employees.length > 0) {
        const c7Module = categoryRegistry.get('c7');
        if (!c7Module?.buildCreatePayload) {
          toast.error('C7 module not registered. Please reload the page.');
          setIsSaving(false);
          return;
        }

        const c7Ctx = {
          employees,
          frequencyType,
          facilityId,
          reportingYearType,
          reportingYear,
          scope3Method,
          scope3ActivityId,
          scope3ActivityType,
          scope3CustomActivity,
          useCustomActivity,
          filteredScope3Activities,
          notes,
          responsiblePerson,
          responsiblePersonDesignation,
          responsiblePersonContact,
          processNames,
          validProcesses,
          getActualYearForMonth,
        };

        // 1. Module-owned validation (employee names + per-mode data presence + calc check)
        const c7Validation = c7Module.validateCreateSubmission(c7Ctx);
        if (!c7Validation.valid) {
          toast.error(c7Validation.errorMessage);
          setIsSaving(false);
          return;
        }

        // 2. Module-owned payload construction (yearly: single payload, monthly: list of payloads)
        const c7Built = c7Module.buildCreatePayload(null, c7Ctx);

        // 3. POST + UI semantics (kept here — orchestration responsibility of the page/form)
        if (c7Built.mode === 'yearly') {
          try {
            await axios.post(`${API}${c7Built.endpoint}`, c7Built.payload, {
              headers: getAuthHeader(),
            });
            toast.success(`Created yearly C7 Employee Commuting record for ${c7Built.reportingPeriod}`);
            onSuccess?.();
          } catch (error) {
            console.error('Error saving yearly C7 emission:', error);
            const detail = error.response?.data?.detail;
            const errorMsg = Array.isArray(detail)
              ? detail.map((e) => e.msg || e.message || JSON.stringify(e)).join(', ')
              : (typeof detail === 'string' ? detail : 'Failed to save yearly C7 emission');
            toast.error(errorMsg);
          } finally {
            setIsSaving(false);
          }
          return;
        }

        // monthly: post each month-payload sequentially
        if (!c7Built.payloads || c7Built.payloads.length === 0) {
          toast.error('No valid monthly data to save');
          setIsSaving(false);
          return;
        }

        let successCount = 0;
        let totalCo2e = 0;
        const errors = [];
        for (const { monthKey, monthCo2e, payload } of c7Built.payloads) {
          totalCo2e += monthCo2e;
          try {
            await axios.post(`${API}${c7Built.endpoint}`, payload, {
              headers: getAuthHeader(),
            });
            successCount++;
          } catch (err) {
            console.error(`[C7] Failed to save ${monthKey}:`, err);
            errors.push(monthKey);
          }
        }

        if (successCount > 0) {
          if (errors.length > 0) {
            toast.warning(`Saved ${successCount}/${c7Built.payloads.length} months. Failed: ${errors.join(', ')}`);
          } else {
            toast.success(`Saved ${successCount} month(s) for ${employees.length} employee(s) (${totalCo2e.toFixed(4)} tCO₂e total)`);
          }
          if (typeof onSuccess === 'function') onSuccess();
        } else {
          toast.error('Failed to save C7 emissions. Please try again.');
        }

        setIsSaving(false);
        return;
      }
      
      // ===========================================
      // YEARLY FREQUENCY HANDLING (New)
      // ===========================================
      if (frequencyType === 'yearly') {
        // Build reporting period string for yearly
        const yearlyReportingPeriod = reportingYearType === 'financial' 
          ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
          : `CY${reportingYear}`;
        
        // Validate yearly data has at least one value
        let hasYearlyData = false;
        if (isProcessEmissions && selectedTemplate) {
          hasYearlyData = selectedTemplate.input_fields?.some(f => 
            yearlyData[f.key] && parseFloat(yearlyData[f.key]) > 0
          );
        } else if (dynamicInputFields.length > 0) {
          const requiredFields = dynamicInputFields.filter(f => !f.isOverride);
          hasYearlyData = requiredFields.some(f => {
            const value = yearlyData[f.variable] || yearlyData[f.fieldKey];
            return value && parseFloat(value) > 0;
          });
        } else {
          hasYearlyData = yearlyData.quantity && parseFloat(yearlyData.quantity) > 0;
        }
        
        if (!hasYearlyData) {
          toast.error('Please enter annual data');
          setIsSaving(false);
          return;
        }
        
        try {
          // Build the yearly payload similar to monthly but with yearly-specific fields
          const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
          const effectiveScope = isScope3Like ? 'scope3' : scope;
          
          // Build inputs from yearlyData
          const inputs = {};
          const userOverrides = {};
          let primaryQuantity = 0;
          let primaryUnit = '';
          
          if (isProcessEmissions && selectedTemplate) {
            // Process emissions yearly
            const formulaValues = {};
            selectedTemplate.input_fields?.forEach(field => {
              formulaValues[field.key] = parseFloat(yearlyData[field.key]) || 0;
              inputs[field.key] = { value: parseFloat(yearlyData[field.key]) || 0, unit: field.unit || '' };
            });
            selectedTemplate.predefined_inputs?.forEach(field => {
              formulaValues[field.key] = parseFloat(templateInputValues[field.key]) || parseFloat(field.value) || 0;
            });
            
            const calculatedEmission = evaluateFormula(selectedTemplate.formula, formulaValues);
            const primaryInputField = selectedTemplate.input_fields?.[0];
            primaryQuantity = primaryInputField ? (parseFloat(yearlyData[primaryInputField.key]) || 0) : 0;
            primaryUnit = primaryInputField?.unit || 'unit';
            
            const payload = {
              facility_id: facilityId,
              reporting_period: yearlyReportingPeriod,
              frequency_type: 'yearly',
              scope: 'scope1',
              category: 'Process Emissions',
              sub_category: selectedSubIndustry,
              fuel_type: selectedTemplate.name,
              quantity: primaryQuantity,
              quantity_unit: primaryUnit,
              unit: primaryUnit,
              calculated_co2e: calculatedEmission,
              notes: notes,
              responsible_person: responsiblePerson,
              responsible_person_designation: responsiblePersonDesignation,
              responsible_person_contact: responsiblePersonContact,
              process_names: [selectedSubIndustry, selectedTemplate.name],
            };
            
            await axios.post(`${API}/emissions`, payload, { headers: getAuthHeader() });
            toast.success(`Created yearly emission record for ${yearlyReportingPeriod}`);
            onSuccess?.();
          } else if (dynamicInputFields.length > 0) {
            // ============================================================
            // YEARLY DISPATCH (post-Phase F: module-driven, single record)
            // ============================================================
            // Mirrors the monthly dispatch but runs ONCE with `yearlyData`
            // as the row and `yearlyReportingPeriod` as the reporting period.
            // Module resolution follows the same scope/category/biogenic
            // logic; payload shape matches modular monthly + adds
            // `frequency_type: 'yearly'` for backend differentiation.
            const yearlyMod = resolveDispatchModule();

            if (!yearlyMod) {
              console.error('[EmissionEntryForm] No module dispatched for yearly', { scope, category, biogenicScopeSelection });
              toast.error('This category is not yet supported for yearly submission. Please reload the page or contact support.');
              setIsSaving(false);
              return;
            }

            // Module-owned validation (same context shape as monthly dispatch)
            const yModValidation = yearlyMod.validateCreateSubmission({
              formData: { asset_name: assetName },
              processNames,
              assetName,
              fuelId,
              useCustomFuel,
              customFuelName,
              isOverrideCV: false,
              isOverrideDensity: false,
              overrideEmissionFactorHeat: false,
              overrideJustification: '',
              scope,
            });
            if (!yModValidation.valid) {
              toast.error(yModValidation.errorMessage);
              setIsSaving(false);
              return;
            }

            const yBaseCtx = {
              scope, category, facilityId, fuelId, selectedFuel, useCustomFuel, customFuelName, customSource,
              biogenicScopeSelection,
              scope3Method, scope3ActivityId, scope3ActivityType, scope3Subcategory,
              scope3CustomActivity, useCustomActivity,
              supplierName, supplierCode, employeeName, employeeId,
              assetName, fromLocation, toLocation,
              notes, responsiblePerson, responsiblePersonDesignation, responsiblePersonContact,
              validProcesses,
              dynamicInputFields,
              filteredScope3Activities, requiresSubcategory, centralizedUnits,
              defaultUnit,
              buildDecisionInputs,
              // Per-row override flags read from yearlyData (yearly has a single row).
              isOverrideCV: !!yearlyData.overrideCalorificValue,
              isOverrideDensity: !!yearlyData.overrideDensity,
              overrideEmissionFactorHeat: !!yearlyData.overrideEmissionFactorHeat,
              overrideJustification: yearlyData.calorificValueJustification || yearlyData.densityJustification || yearlyData.emissionFactorHeatJustification || '',
              calculatedCO2: 0, calculatedCH4: 0, calculatedN2O: 0, calculatedCO2e: 0,
              resolvedFormulaId: null,
              reportingPeriod: yearlyReportingPeriod,
            };

            const { inputs: yInputs, userOverrides: yOverrides } = yearlyMod.extractInputsForCalcEngine(yearlyData, yBaseCtx);
            const { decisionInputs: yDecisionInputs, context: yContext, isScope3Like: yIsScope3Like } = yearlyMod.buildDecisionContext(yearlyData, yBaseCtx);

            let yCalcCO2 = 0, yCalcCH4 = 0, yCalcN2O = 0, yCalcCO2e = 0;
            let yResolvedFormulaId = null;

            const yEffectiveScope = yIsScope3Like ? 'scope3' : scope;
            const yCategoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === yEffectiveScope);

            if (yCategoryObj?.id && !useCustomFuel) {
              try {
                const calcResp = await axios.post(`${API}/calc-engine/execute-by-category`, {
                  category_id: yCategoryObj.id,
                  decision_inputs: yDecisionInputs,
                  inputs: yInputs,
                  context: yContext,
                  user_overrides: yOverrides,
                  dry_run: false,
                  ...(yIsScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
                }, { headers: getAuthHeader() });
                if (calcResp.data?.ok) {
                  const r = calcResp.data;
                  yCalcCO2 = r.outputs?.co2?.value || r.co2_emissions || 0;
                  yCalcCH4 = r.outputs?.ch4?.value || r.ch4_emissions || 0;
                  yCalcN2O = r.outputs?.n2o?.value || r.n2o_emissions || 0;
                  yCalcCO2e = r.outputs?.co2e?.value || r.co2e_emissions || 0;
                  yResolvedFormulaId = r.resolved_formula?.id || r.formula_id || null;
                }
              } catch (e) {
                // Fall through with zeros — record persisted, can be recalculated later
              }
            } else if (useCustomFuel) {
              const customEF = parseFloat(customEmissionFactor) || 0;
              const primaryQty = parseFloat(yearlyData[dynamicInputFields[0]?.variable] || 0);
              yCalcCO2 = primaryQty * customEF;
              yCalcCO2e = yCalcCO2;
            }

            const yPayload = {
              ...yearlyMod.buildCreatePayload(yearlyData, {
                ...yBaseCtx,
                calculatedCO2: yCalcCO2, calculatedCH4: yCalcCH4, calculatedN2O: yCalcN2O, calculatedCO2e: yCalcCO2e,
                resolvedFormulaId: yResolvedFormulaId,
              }),
              // Yearly-only marker (legacy parity)
              frequency_type: 'yearly',
            };

            await axios.post(`${API}/emissions`, yPayload, { headers: getAuthHeader() });
            toast.success(`Created yearly emission record for ${yearlyReportingPeriod}`);
            onSuccess?.();
          }
        } catch (error) {
          console.error('Error saving yearly emission:', error);
          const detail = error.response?.data?.detail;
          const errorMsg = Array.isArray(detail) 
            ? detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ')
            : (typeof detail === 'string' ? detail : 'Failed to save yearly emission');
          toast.error(errorMsg);
        } finally {
          setIsSaving(false);
        }
        return;
      }
      
      // ===========================================
      // MONTHLY FREQUENCY HANDLING (Existing)
      // ===========================================
      // For process emissions, filter months that have template input data
      // For regular emissions, filter months with dynamic field data
      let monthsWithData;
      if (isProcessEmissions && selectedTemplate) {
        const inputFields = selectedTemplate.input_fields || [];
        monthsWithData = Object.entries(monthlyData).filter(([_, data]) => {
          return inputFields.some(field => data?.[field.key] && parseFloat(data[field.key]) > 0);
        });
      } else if (dynamicInputFields.length > 0) {
        // For dynamic form config, check if any required field (non-override) has value
        const requiredFields = dynamicInputFields.filter(f => !f.isOverride);
        monthsWithData = Object.entries(monthlyData).filter(([_, data]) => {
          return requiredFields.some(field => {
            const value = data?.[field.variable] || data?.[field.fieldKey];
            return value && parseFloat(value) > 0;
          });
        });
      } else {
        // No dynamic fields - should not happen if form is loaded correctly
        monthsWithData = [];
      }

      if (monthsWithData.length === 0) {
        toast.error('Please enter data for at least one month');
        setIsSaving(false);
        return;
      }

      // PROCESS EMISSIONS HANDLING
      if (isProcessEmissions && selectedTemplate) {
        let successCount = 0;
        const errors = [];
        
        for (const [monthKey, data] of monthsWithData) {
          const actualYear = getActualYearForMonth(monthKey);
          const reportingPeriod = `${actualYear}-${monthKey}`;
          
          // Build formula values from monthly data (required inputs) and overridden predefined inputs
          const formulaValues = {};
          
          // Add required input values from monthly data
          selectedTemplate.input_fields?.forEach(field => {
            formulaValues[field.key] = parseFloat(data[field.key]) || 0;
          });
          
          // Add predefined values (use overridden values from templateInputValues)
          selectedTemplate.predefined_inputs?.forEach(field => {
            formulaValues[field.key] = parseFloat(templateInputValues[field.key]) || parseFloat(field.value) || 0;
          });
          
          // Calculate emissions using template formula
          const calculatedEmission = evaluateFormula(selectedTemplate.formula, formulaValues);
          
          // Get the primary input field info for display
          const primaryInputField = selectedTemplate.input_fields?.[0];
          const activityQuantity = primaryInputField ? (parseFloat(data[primaryInputField.key]) || 0) : 0;
          const activityUnit = primaryInputField?.unit || 'unit';
          
          const payload = {
            facility_id: facilityId,
            reporting_period: reportingPeriod,
            scope: 'scope1', // Process emissions are Scope 1
            category: 'Process Emissions',
            sub_category: selectedSubIndustry,
            fuel_type: selectedTemplate.name,
            quantity: activityQuantity,
            quantity_unit: activityUnit,
            unit: activityUnit,
            emission_factor: 1,
            emission_factor_ch4: null,
            emission_factor_n2o: null,
            is_custom_factor: false,
            source_of_information: `Template: ${selectedTemplate.name}`,
            notes: notes,
            responsible_person: responsiblePerson,
            responsible_person_designation: responsiblePersonDesignation,
            responsible_person_contact: responsiblePersonContact,
            process_names: [selectedSubIndustry, selectedTemplate.name],
            evidence_url: data.evidences?.map(e => e.url).join(',') || '',
            // Pre-calculated values
            calculated_co2: calculatedEmission,
            calculated_ch4: 0,
            calculated_n2o: 0,
            calculated_co2e: calculatedEmission,
            co2_unit: 'tCO2',
            ch4_unit: 'tCH4',
            n2o_unit: 'tN2O',
            co2e_unit: 'tCO2e',
            // Template metadata
            template_id: selectedTemplate.id,
            template_inputs: formulaValues
          };
          
          try {
            await axios.post(`${API}/emissions`, payload, {
              headers: getAuthHeader()
            });
            successCount++;
          } catch (err) {
            console.error(`Failed to save process emission for ${reportingPeriod}:`, err);
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: ${err.response?.data?.detail || 'Failed'}`);
          }
        }
        
        if (successCount > 0) {
          toast.success(`Created ${successCount} process emission record(s) successfully`);
        }
        if (errors.length > 0) {
          toast.error(`Failed to save: ${errors.join(', ')}`);
        }
        if (successCount > 0) {
          onSuccess?.();
        }
        setIsSaving(false);
        return;
      }

      // ===========================================
      // CREATE MIGRATION PHASES C/D/E/F — Module dispatch
      // ===========================================
      // Routes through module helpers when:
      //   - frequencyType === 'monthly'
      //   - scope is scope1/scope2/scope3 OR biogenic (Phase F)
      //   - active module exposes buildCreatePayload
      //   - category is NOT C7 (multi-employee — has its own dedicated branch)
      const dispatchActiveModule = frequencyType === 'monthly' ? resolveDispatchModule() : null;

      if (dispatchActiveModule) {
        // 1. Module-owned validation
        // Note: per-month override flags (CV/density/EFH) live in monthlyData[m]
        // and are validated inside the per-month loop below. Pass false at
        // submission gate; per-row gates re-check via data.* in the loop.
        const modValidation = dispatchActiveModule.validateCreateSubmission({
          formData: { asset_name: assetName },
          processNames,
          assetName,
          fuelId,
          useCustomFuel,
          customFuelName,
          isOverrideCV: false,
          isOverrideDensity: false,
          overrideEmissionFactorHeat: false,
          overrideJustification: '',
          scope,
        });
        if (!modValidation.valid) {
          toast.error(modValidation.errorMessage);
          setIsSaving(false);
          return;
        }

        let successCount = 0;
        const errors = [];
        for (const [monthKey, data] of monthsWithData) {
          const actualYear = getActualYearForMonth(monthKey);
          const reportingPeriod = `${actualYear}-${monthKey}`;

          const baseCtx = {
            scope, category, facilityId, fuelId, selectedFuel, useCustomFuel, customFuelName, customSource,
            biogenicScopeSelection,
            scope3Method, scope3ActivityId, scope3ActivityType, scope3Subcategory,
            scope3CustomActivity, useCustomActivity,
            supplierName, supplierCode, employeeName, employeeId,
            assetName, fromLocation, toLocation,
            notes, responsiblePerson, responsiblePersonDesignation, responsiblePersonContact,
            validProcesses,
            dynamicInputFields,
            filteredScope3Activities, requiresSubcategory, centralizedUnits,
            defaultUnit,
            buildDecisionInputs,
            // Per-month CV/density override flags read from `data` (the row).
            // Pass row-level flags so Scope1Create payload sets override_justification correctly.
            isOverrideCV: !!data.overrideCalorificValue,
            isOverrideDensity: !!data.overrideDensity,
            overrideEmissionFactorHeat: !!data.overrideEmissionFactorHeat,
            overrideJustification: data.calorificValueJustification || data.densityJustification || data.emissionFactorHeatJustification || '',
            calculatedCO2: 0, calculatedCH4: 0, calculatedN2O: 0, calculatedCO2e: 0,
            resolvedFormulaId: null,
            reportingPeriod,
          };

          const { inputs, userOverrides } = dispatchActiveModule.extractInputsForCalcEngine(data, baseCtx);
          const { decisionInputs, context, isScope3Like } = dispatchActiveModule.buildDecisionContext(data, baseCtx);

          let calculatedCO2 = 0, calculatedCH4 = 0, calculatedN2O = 0, calculatedCO2e = 0;
          let resolvedFormulaId = null;

          // Calc-engine lookup uses scope-specific category code
          const effectiveScopeForLookup = isScope3Like ? 'scope3' : scope;
          const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScopeForLookup);

          if (categoryObj?.id && !useCustomFuel) {
            try {
              const calcResp = await axios.post(`${API}/calc-engine/execute-by-category`, {
                category_id: categoryObj.id,
                decision_inputs: decisionInputs,
                inputs,
                context,
                user_overrides: userOverrides,
                dry_run: false,
                ...(isScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
              }, { headers: getAuthHeader() });
              if (calcResp.data?.ok) {
                const r = calcResp.data;
                calculatedCO2 = r.outputs?.co2?.value || r.co2_emissions || 0;
                calculatedCH4 = r.outputs?.ch4?.value || r.ch4_emissions || 0;
                calculatedN2O = r.outputs?.n2o?.value || r.n2o_emissions || 0;
                calculatedCO2e = r.outputs?.co2e?.value || r.co2e_emissions || 0;
                resolvedFormulaId = r.resolved_formula?.id || r.formula_id || null;
              }
            } catch (e) {
              // Fall through with zeros — record persisted, can be recalculated later
            }
          } else if (useCustomFuel) {
            const customEF = parseFloat(customEmissionFactor) || 0;
            const primaryQty = parseFloat(data[dynamicInputFields[0]?.variable] || 0);
            calculatedCO2 = primaryQty * customEF;
            calculatedCO2e = calculatedCO2;
          }

          const payload = dispatchActiveModule.buildCreatePayload(data, {
            ...baseCtx,
            calculatedCO2, calculatedCH4, calculatedN2O, calculatedCO2e,
            resolvedFormulaId,
          });

          try {
            await axios.post(`${API}/emissions`, payload, { headers: getAuthHeader() });
            successCount++;
          } catch (err) {
            errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: Save failed`);
          }
        }

        if (successCount > 0) toast.success(`Created ${successCount} emission record(s) successfully`);
        if (errors.length > 0) toast.error(`Failed to save some records. Please try again.`);
        if (successCount > 0) onSuccess?.();
        setIsSaving(false);
        return;
      }

      // ===========================================
      // DEFENSIVE FALLBACK (post-Phase F)
      // ===========================================
      // The dispatch block above covers every reachable monthly path:
      //   - Scope 1 (Stationary/Mobile/Fugitive + Generic), Scope 2 (Generic),
      //     Scope 3 flat (C1–C6, C8–C15), biogenic+scope1, biogenic+scope3.
      //   - C7 multi-employee returns early in its own dedicated branch above.
      // If we reach here, no module matched — surface a clear error so the
      // bug is observable instead of silently producing no record.
      console.error('[EmissionEntryForm] No module dispatched for', { scope, category, frequencyType, biogenicScopeSelection });
      toast.error('This category is not yet supported for direct submission. Please reload the page or contact support.');
    } catch (error) {
      toast.error('Failed to save emissions. Please try again.');
    } finally {
      setIsSaving(false); // Re-enable button after completion
    }
  };

  // Step indicators
  const steps = [
    { num: 1, title: 'Selection', desc: 'Facility, Scope, Category, Fuel' },
    { num: 2, title: 'Process', desc: 'Process names & Person responsible' },
    { num: 3, title: frequencyType === 'yearly' ? 'Annual Data' : 'Monthly Data', desc: frequencyType === 'yearly' ? 'Year & annual quantity' : 'Year & monthly quantities' },
    { num: 4, title: 'Notes', desc: 'Additional notes' }
  ];

  return (
    <div className="space-y-6">
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
          setSelectedSubIndustry={setSelectedSubIndustry}
          setSelectedTemplate={setSelectedTemplate}
          setTemplateInputValues={setTemplateInputValues}
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
          isProcessEmissions={isProcessEmissions}
          selectedSubIndustry={selectedSubIndustry}
          availableSubIndustries={availableSubIndustries}
          selectedTemplate={selectedTemplate}
          templatesForSubIndustry={templatesForSubIndustry}
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          supplierCode={supplierCode}
          setSupplierCode={setSupplierCode}
          employeeName={employeeName}
          setEmployeeName={setEmployeeName}
          employeeId={employeeId}
          setEmployeeId={setEmployeeId}
        />
      )}

      {/* Step 2: Process & Responsibility - Extracted to Step2ProcessResponsibility component */}
      {currentStep === 2 && (
        <Step2ProcessResponsibility
          isProcessEmissions={isProcessEmissions}
          selectedTemplate={selectedTemplate}
          responsiblePerson={responsiblePerson}
          setResponsiblePerson={setResponsiblePerson}
          responsiblePersonDesignation={responsiblePersonDesignation}
          setResponsiblePersonDesignation={setResponsiblePersonDesignation}
          responsiblePersonContact={responsiblePersonContact}
          setResponsiblePersonContact={setResponsiblePersonContact}
          templateInputValues={templateInputValues}
          setTemplateInputValues={setTemplateInputValues}
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
          isProcessEmissions={isProcessEmissions}
          selectedTemplate={selectedTemplate}
          scope={scope}
          biogenicScopeSelection={biogenicScopeSelection}
          useCustomFuel={useCustomFuel}
          selectedFuel={selectedFuel}
          centralizedUnits={centralizedUnits}
          defaultUnit={defaultUnit}
          allowedUnits={allowedUnits}
          customEmissionFactorUnit={customEmissionFactorUnit}
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
