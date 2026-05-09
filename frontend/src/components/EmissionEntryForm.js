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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MONTHS = [
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
  { key: '12', name: 'December', short: 'Dec' }
];

// Calendar year months (Jan-Dec)
const CALENDAR_YEAR_MONTHS = MONTHS;

// Financial year months (Apr-Mar)
const FINANCIAL_YEAR_MONTHS = [
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
  { key: '03', name: 'March', short: 'Mar' }
];

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
  configLabels = null // Centralized label configuration
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
  // Form step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4; // Keep 4 steps: Scope/Category, Subcategory/Activity, Year+Frequency+Data, Notes

  // Step 1: Basic Selection
  const [facilityId, setFacilityId] = useState('');
  const [scope, setScope] = useState('scope1');
  const [category, setCategory] = useState('');
  const [fuelId, setFuelId] = useState('');
  const [useCustomFuel, setUseCustomFuel] = useState(false);
  const [customFuelName, setCustomFuelName] = useState('');
  const [customEmissionFactor, setCustomEmissionFactor] = useState('');
  const [customEmissionFactorUnit, setCustomEmissionFactorUnit] = useState('tCO2/kg'); // Default unit
  const [customSource, setCustomSource] = useState('');
  const [isSaving, setIsSaving] = useState(false); // Prevent duplicate submissions
  const [fuelSearchTerm, setFuelSearchTerm] = useState(''); // Search filter for fuel types

  // Scope 3 specific state
  const [scope3Method, setScope3Method] = useState(''); // spend_basis or activity_basis
  const [scope3EFData, setScope3EFData] = useState([]); // Scope 3 EF table data
  const [scope3ActivityId, setScope3ActivityId] = useState(''); // Selected activity from Scope 3 EF
  const [scope3ActivityType, setScope3ActivityType] = useState(''); // Activity type filter for C6/C7
  const [scope3Subcategory, setScope3Subcategory] = useState(''); // Subcategory for C8/C10/C11/C13/C14
  const [scope3CustomActivity, setScope3CustomActivity] = useState(''); // Custom activity name for supplier_basis
  const [useCustomActivity, setUseCustomActivity] = useState(false); // Toggle for custom activity in supplier_basis
  const [fugitiveEmissionsData, setFugitiveEmissionsData] = useState([]); // Fugitive emissions from gwp_fugitives
  const [loadingScope3EF, setLoadingScope3EF] = useState(false);
  
  // Biogenic-specific state
  const [biogenicScopeSelection, setBiogenicScopeSelection] = useState(''); // 'scope1' or 'scope3' when biogenic is active
  const [biogenicCategories, setBiogenicCategories] = useState([]); // Categories that have biogenic entries
  const [loadingBiogenicCategories, setLoadingBiogenicCategories] = useState(false);
  
  // Multi-Employee state (for C7 Employee Commuting)
  // C7 always uses multi-employee mode - no toggle needed
  const [employees, setEmployees] = useState([]);
  const [employeeMonthlyTotals, setEmployeeMonthlyTotals] = useState({});
  const [employeeYearlyTotal, setEmployeeYearlyTotal] = useState({});
  const [isCalculatingEmployee, setIsCalculatingEmployee] = useState(false);
  const [c7FormulaId, setC7FormulaId] = useState(null);  // Track formula used for C7 calculations
  const [c7FormulaName, setC7FormulaName] = useState('');  // Track formula name
  
  // Decision tree field values - tracks all decision field selections dynamically
  const [decisionFieldValues, setDecisionFieldValues] = useState({});

  // Process Emissions state
  const [selectedSubIndustry, setSelectedSubIndustry] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateInputValues, setTemplateInputValues] = useState({});

  // ============================================================================
  // Dynamic Form Config from Backend (Phase 3 - Calc Engine Integration)
  // ============================================================================
  const [formConfig, setFormConfig] = useState(null);
  const [loadingFormConfig, setLoadingFormConfig] = useState(false);
  const [calcEngineResult, setCalcEngineResult] = useState(null);
  const [isCalcEngineCalculating, setIsCalcEngineCalculating] = useState(false);
  const [matchedFormulaId, setMatchedFormulaId] = useState(null); // Store the matched formula ID for saving

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

  // Sync decision field values with scope3Method, scope3ActivityType, and scope3Subcategory
  // This keeps backwards compatibility while enabling dynamic decision fields
  useEffect(() => {
    setDecisionFieldValues(prev => {
      const updated = { ...prev };
      if (scope3Method) {
        updated['calculation_method_scope3'] = scope3Method;
      }
      if (scope3ActivityType) {
        updated['activity_type'] = scope3ActivityType;
      }
      if (scope3Subcategory) {
        updated['subcategory_selection'] = scope3Subcategory;
      }
      return updated;
    });
  }, [scope3Method, scope3ActivityType, scope3Subcategory]);

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
      
      // For stationary_combustion, mobile_combustion, and electricity, filter from scope3_ef
      if (scope3Subcategory === 'stationary_combustion' || 
          scope3Subcategory === 'mobile_combustion' || 
          scope3Subcategory === 'electricity') {
        filtered = filtered.filter(ef => 
          ef.category?.toLowerCase() === catLower
        );
        
        // Filter by subcategory field if it exists on the entry
        // For electricity: ONLY show entries with exact match (no fallback to null/empty)
        // For stationary/mobile: If entry has no subcategory defined, show in both
        filtered = filtered.filter(ef => {
          if (scope3Subcategory === 'electricity') {
            // Strict matching - only show entries explicitly marked as electricity
            if (Array.isArray(ef.subcategory)) {
              return ef.subcategory.includes(scope3Subcategory);
            }
            return ef.subcategory === scope3Subcategory;
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
    if (scope !== 'scope3' || !scope3EFData.length || !category) return [];
    
    // Only show activity type filter for C6 and C7
    const isC6orC7 = category.toLowerCase().includes('c6') || 
                     category.toLowerCase().includes('c7') ||
                     category.toLowerCase().includes('business travel') ||
                     category.toLowerCase().includes('employee commuting');
    
    if (!isC6orC7) return [];
    
    const activityTypes = new Set();
    
    scope3EFData.forEach(ef => {
      if (ef.category?.toLowerCase() === category.toLowerCase() && ef.activity_type) {
        // Also filter by method if selected
        if (!scope3Method || scope3Method === 'supplier_basis' || ef.method === scope3Method) {
          activityTypes.add(ef.activity_type);
        }
      }
    });
    
    return Array.from(activityTypes).sort();
  }, [scope, scope3EFData, category, scope3Method]);

  // Categories that require subcategory selection (C8, C10, C11, C13, C14)
  const subcategoryCategories = ['c8', 'c10', 'c11', 'c13', 'c14'];
  
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

  // Get available subcategories for C8/C10/C11/C13/C14
  const availableSubcategories = useMemo(() => {
    if (!requiresSubcategory || !scope3Method) return [];
    
    // Define available subcategories based on method
    const subcategories = [
      { value: 'stationary_combustion', label: 'Stationary Combustion' },
      { value: 'mobile_combustion', label: 'Mobile Combustion' },
      { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
      { value: 'electricity', label: 'Electricity' }
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

  // Step 2: Process & Responsibility
  const [processNames, setProcessNames] = useState([{ name: '', description: '' }]);
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [responsiblePersonDesignation, setResponsiblePersonDesignation] = useState('');
  const [responsiblePersonContact, setResponsiblePersonContact] = useState('');

  // Step 3: Year & Monthly Data
  const [reportingYearType, setReportingYearType] = useState('calendar'); // 'calendar' or 'financial'
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear().toString());
  const [frequencyType, setFrequencyType] = useState('monthly'); // 'monthly' or 'yearly' - NEW for yearly support
  const [monthlyData, setMonthlyData] = useState({});
  const [yearlyData, setYearlyData] = useState({}); // NEW: Single entry for yearly mode
  const [yearlyCalcResult, setYearlyCalcResult] = useState(null); // NEW: Store yearly calculation result
  const [isCalculatingYearly, setIsCalculatingYearly] = useState(false); // NEW: Loading state for yearly calc
  const [expandedMonths, setExpandedMonths] = useState([]);
  
  // Load frequencyType from editingEmission when editing
  useEffect(() => {
    if (editingEmission) {
      const freq = editingEmission.frequency_type || 'monthly';
      setFrequencyType(freq);
      
      // If editing yearly record, populate yearlyData from the record's inputs
      if (freq === 'yearly' && editingEmission.inputs) {
        setYearlyData(editingEmission.inputs);
      }
    }
  }, [editingEmission]);

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

  // Step 4: Notes
  const [notes, setNotes] = useState('');
  
  // Track form dirty state for unsaved changes protection (#19)
  useEffect(() => {
    // Only trigger after user interaction (not initial load)
    if (currentStep > 1 || facilityId || category || fuelId || notes) {
      if (typeof onFormChange === 'function') {
        onFormChange();
      }
    }
  }, [currentStep, facilityId, category, fuelId, notes, scope3Method, scope3ActivityType, employees.length, onFormChange]);
  
  // Scope 3 specific optional fields
  const [supplierName, setSupplierName] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');

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
    
    // Add "Process Emissions" category for Scope 1 if there are process templates
    if (effectiveScopeForCategories === 'scope1' && processTemplates.length > 0 && !result.includes('Process Emissions')) {
      result.push('Process Emissions');
    }
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
      // For regular Scope 1/2, try decision tree first
      else if (formConfig.decision_tree && formConfig.has_decision_tree) {
        // For Scope 1/2, the decision tree might use fuel type or other criteria
        matchedFormula = formConfig.formulas.find(f => 
          f.name?.toLowerCase().includes('quantity') || 
          f.name?.toLowerCase().includes('activity')
        );
        
        if (!matchedFormula && formConfig.formulas.length === 1) {
          matchedFormula = formConfig.formulas[0];
        }
      } else if (formConfig.formulas.length > 0) {
        // No decision tree - prefer "Quantity Based" or first formula
        matchedFormula = formConfig.formulas.find(f => 
          f.name?.toLowerCase().includes('quantity') || 
          f.name?.toLowerCase().includes('activity')
        ) || formConfig.formulas[0];
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
          // Override fields should only show if in formula properties
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
  useEffect(() => {
    if (dynamicInputFields.length === 0 || activeMonths.length === 0) return;
    
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
  }, [dynamicInputFields, selectedFuel, activeMonths, centralizedUnits, scope3ActivityId, filteredScope3Activities, scope, biogenicScopeSelection, requiresSubcategory]);

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
      
      const context = {
        fuel_name: fuelNameForContext,
        fuel_id: fuelId || '',
        scope: effectiveScope, // Use effective scope for context
        category: category,
        facility_id: facilityId,
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
          dry_run: true
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
      
      const context = {
        fuel_name: fuelNameForContext,
        fuel_id: fuelId || '',
        scope: effectiveScope,
        category: category,
        facility_id: facilityId,
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
          dry_run: true
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
  }, [formConfig, frequencyType, selectedFuel, fuelId, dynamicCategories, category, scope, facilityId, dynamicInputFields, yearlyData, buildDecisionInputs, getAuthHeader, scope3Method, scope3ActivityId, filteredScope3Activities, useCustomActivity, scope3CustomActivity, requiresSubcategory, scope3Subcategory, biogenicScopeSelection]);

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
    
    return prioritizedFuels;
  }, [fuelDatabase, scope, category, selectedFacility, reportingYear]);

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
      // Filter out 'm3' - use 'm³' instead (proper superscript notation)
      return selectedFuel.allowed_units.filter(unit => unit !== 'm3');
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
    const showUnitSelector = fieldUnits.length > 0 && !isSupplierBasisField;
    
    // Show free text unit input for supplier basis fields
    const showSupplierUnitInput = isSupplierBasisField && !field.variable?.endsWith('_unit');
    
    return (
      <div key={field.id || field.variable} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="font-medium">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          
          {field.isOverride && (
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
            disabled={field.isOverride && !data[`override_${field.variable}`]}
            className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${field.isOverride && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          <div className={showUnitSelector || showSupplierUnitInput ? "grid grid-cols-3 gap-2" : ""}>
            <Input
              type={field.fieldType === 'text' ? 'text' : 'number'}
              step={field.fieldType === 'number' ? 'any' : undefined}
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
              disabled={field.isOverride && !data[`override_${field.variable}`]}
              className={`bg-stone-50 ${showUnitSelector || showSupplierUnitInput ? 'col-span-2' : ''} ${field.isOverride && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                disabled={field.isOverride && !data[`override_${field.variable}`]}
                className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${field.isOverride && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid={`unit-${field.fieldKey}-${monthKey}`}
              >
                {fieldUnits.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            )}
            
            {/* Free text unit input for supplier basis fields */}
            {showSupplierUnitInput && (
              <Input
                type="text"
                placeholder="Unit"
                value={data[`${field.variable}_unit`] || ''}
                onChange={(e) => updateMonthData(monthKey, `${field.variable}_unit`, e.target.value)}
                disabled={field.isOverride && !data[`override_${field.variable}`]}
                className={`bg-stone-50 ${field.isOverride && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid={`unit-text-${field.fieldKey}-${monthKey}`}
              />
            )}
          </div>
        )}
        
        {/* Show fuel default value for override fields */}
        {field.isOverride && selectedFuel && (
          <p className="text-xs text-stone-500">
            Fuel default: {
              selectedFuel[field.variable] || 
              selectedFuel[field.fieldKey] ||
              selectedFuel.calorific_value ||
              'from database'
            } {field.expectedUnit}
          </p>
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
    
    // For regular emissions, check quantity
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
        return { valid: true };
      case 4:
        // For C7 Employee Commuting, check if at least one employee has calculated data
        if (isC7EmployeeCommuting) {
          if (employees.length === 0) {
            return { valid: false, message: 'Please add at least one employee' };
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

      // Find the matched activity from scope3 EF data (#6 - Fix: use scope3ActivityId first, then fallback to activity_type)
      const activityType = scope3ActivityType;
      
      // Priority: 1) Selected scope3ActivityId, 2) First match for activity_type
      let matchedActivity = null;
      if (scope3ActivityId) {
        matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      }
      
      // Fallback to activity_type match if no specific activity selected
      if (!matchedActivity) {
        matchedActivity = filteredScope3Activities.find(a => 
          a.activity_type === activityType
        );
      }

      if (!matchedActivity) {
        toast.error(`Activity "${activityType}" not found. Please select a valid activity.`);
        setIsCalculatingEmployee(false);
        return;
      }
      
      // Use the matched activity's emission factor
      const efFromActivity = matchedActivity.emission_factor;
      const efUnitFromActivity = matchedActivity.ef_unit;

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

      // Build context for additional data
      const calcContext = {
        calculation_method_scope3: scope3Method,
        activity_type: activityType,
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
        scope3_ef_id: matchedActivity.id,
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
  }, [scope3Method, scope3ActivityType, filteredScope3Activities, dynamicCategories, category, dynamicInputFields, getAuthHeader]);

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
    
    try {
      const validProcesses = processNames.filter(p => p.name && p.name.trim() !== '');
      
      // C7 EMPLOYEE COMMUTING HANDLING
      if (isC7EmployeeCommuting && employees.length > 0) {
        // Validate employee names are required
        const employeesWithoutNames = employees.filter(emp => !emp.name || emp.name.trim() === '');
        if (employeesWithoutNames.length > 0) {
          toast.error(`Employee Name is required for all employees. ${employeesWithoutNames.length} employee(s) missing name.`);
          setIsSaving(false);
          return;
        }
        
        // ===========================================
        // C7 YEARLY MODE
        // ===========================================
        if (frequencyType === 'yearly') {
          // Validate each employee has yearly data
          const employeesWithoutData = employees.filter(emp => {
            const hasYearlyData = Object.values(emp.yearly_data?.inputs || {}).some(v => 
              v !== '' && v !== null && v !== undefined && v !== 0
            );
            return !hasYearlyData;
          });
          
          if (employeesWithoutData.length > 0) {
            toast.error(`Please enter annual data for: ${employeesWithoutData.map(e => e.name || 'Unnamed').join(', ')}`);
            setIsSaving(false);
            return;
          }
          
          // Validate that at least one employee has calculated emissions
          const hasCalculatedData = employees.some(emp => 
            emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined
          );
          
          if (!hasCalculatedData) {
            toast.error('Please calculate emissions for at least one employee');
            setIsSaving(false);
            return;
          }
          
          try {
            // Build yearly reporting period
            const yearlyReportingPeriod = reportingYearType === 'financial' 
              ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
              : `CY${reportingYear}`;
            
            // Build employees array for yearly endpoint
            const yearlyEmployees = employees
              .filter(emp => emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined)
              .map(emp => ({
                id: emp.id,
                name: emp.name,
                employee_id: emp.employee_id,
                department: emp.department,
                activity_type: emp.activity_type || scope3ActivityType,
                inputs: emp.yearly_data?.inputs || {},
                emissions: emp.yearly_data?.emissions || {},
                calculation_details: emp.yearly_data?.calculation_details || null,
              }));
            
            const payload = {
              facility_id: facilityId,
              reporting_year: yearlyReportingPeriod,
              calculation_method: scope3Method,
              activity_type: scope3ActivityType,
              activity_id: scope3ActivityId,
              activity_name: filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || scope3CustomActivity,
              formula_id: yearlyEmployees[0]?.calculation_details?.formula_id || null,
              formula_name: yearlyEmployees[0]?.calculation_details?.formula_name || null,
              employees: yearlyEmployees,
              notes: notes,
              responsible_person: responsiblePerson,
              responsible_person_designation: responsiblePersonDesignation,
              responsible_person_contact: responsiblePersonContact,
              process_names: validProcesses.map(p => p.name),
              process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
            };
            
            await axios.post(`${API}/emissions/c7/yearly`, payload, {
              headers: getAuthHeader()
            });
            
            toast.success(`Created yearly C7 Employee Commuting record for ${yearlyReportingPeriod}`);
            onSuccess?.();
          } catch (error) {
            console.error('Error saving yearly C7 emission:', error);
            const detail = error.response?.data?.detail;
            const errorMsg = Array.isArray(detail) 
              ? detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ')
              : (typeof detail === 'string' ? detail : 'Failed to save yearly C7 emission');
            toast.error(errorMsg);
          } finally {
            setIsSaving(false);
          }
          return;
        }
        
        // ===========================================
        // C7 MONTHLY MODE (Existing behavior)
        // ===========================================
        // Validate each employee has at least one month with data
        const employeesWithoutData = employees.filter(emp => {
          const hasAnyMonthData = Object.values(emp.monthly_data || {}).some(monthData => {
            if (!monthData?.inputs) return false;
            return Object.values(monthData.inputs).some(v => 
              v !== '' && v !== null && v !== undefined && v !== 0
            );
          });
          return !hasAnyMonthData;
        });
        
        if (employeesWithoutData.length > 0) {
          toast.error(`Please enter data for at least one month for: ${employeesWithoutData.map(e => e.name || 'Unnamed').join(', ')}`);
          setIsSaving(false);
          return;
        }
        
        // Validate that at least one employee has calculated emissions
        const hasCalculatedData = employees.some(emp => 
          Object.values(emp.monthly_data || {}).some(m => m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined)
        );
        
        if (!hasCalculatedData) {
          toast.error('Please calculate emissions for at least one employee');
          setIsSaving(false);
          return;
        }
        
        // Monthly Entry Model (Fix #10)
        // Each month gets saved as a separate entry via /api/emissions/c7/month
        // Group employees by month (each month becomes a separate entry)
        const monthlyEmployeeGroups = {};
        employees.forEach(emp => {
          const monthlyData = emp.monthly_data || {};
          Object.entries(monthlyData).forEach(([monthKey, monthData]) => {
            // Only include months with calculated emissions
            if (monthData?.emissions?.co2e !== null && monthData?.emissions?.co2e !== undefined) {
              if (!monthlyEmployeeGroups[monthKey]) {
                monthlyEmployeeGroups[monthKey] = [];
              }
              monthlyEmployeeGroups[monthKey].push({
                id: emp.id,
                name: emp.name,
                employee_id: emp.employee_id,
                department: emp.department,
                activity_type: emp.activity_type || scope3ActivityType,
                inputs: monthData.inputs || {},
                emissions: monthData.emissions || {},
                calculation_details: monthData.calculation_details || null, // Include for formula_id extraction
              });
            }
          });
        });
        
        const monthsToSave = Object.keys(monthlyEmployeeGroups);
        if (monthsToSave.length === 0) {
          toast.error('No valid monthly data to save');
          setIsSaving(false);
          return;
        }
        
        // Get the reporting year from the first active month
        const monthlyReportingYear = getActualYearForMonth(monthsToSave[0]);
        
        // Save each month as a separate C7 entry using the new API
        let successCount = 0;
        let totalCo2e = 0;
        const errors = [];
        
        for (const monthKey of monthsToSave) {
          const monthEmployees = monthlyEmployeeGroups[monthKey];
          const monthCo2e = monthEmployees.reduce((sum, emp) => sum + (emp.emissions?.co2e || 0), 0);
          totalCo2e += monthCo2e;
          
          // For custom activity (supplier_basis), use the custom activity name
          // For standard activities, use the selected activity from the list
          let activityId = null;
          let activityName = scope3ActivityType;
          
          if (useCustomActivity && scope3CustomActivity?.trim()) {
            // Custom activity - no ID, just the custom name
            activityId = null;
            activityName = scope3CustomActivity.trim();
          } else if (scope3ActivityId) {
            // Standard activity from the list
            const selectedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            activityId = selectedActivity?.id || null;
            activityName = selectedActivity?.activity || scope3ActivityType;
          }
          
          // Extract formula_id from any employee's calculation_details (they all use the same formula)
          // This is more reliable than using React state which might not have updated yet
          let formulaId = null;
          let formulaName = '';
          for (const emp of monthEmployees) {
            if (emp.calculation_details?.formula_id) {
              formulaId = emp.calculation_details.formula_id;
              formulaName = emp.calculation_details.formula_name || '';
              break;
            }
          }
          
          const payload = {
            facility_id: facilityId,
            reporting_year: monthlyReportingYear,
            reporting_month: monthKey, // jan, feb, mar, etc.
            calculation_method: scope3Method,
            activity_type: scope3ActivityType,
            activity_id: activityId,
            activity_name: activityName,
            formula_id: formulaId,  // Extract from employee calculation_details
            formula_name: formulaName,
            employees: monthEmployees,
            notes: notes || '',
            responsible_person: responsiblePerson,
            responsible_person_designation: responsiblePersonDesignation,
            responsible_person_contact: responsiblePersonContact,
            process_names: processNames.filter(p => p.name?.trim()).map(p => p.name),
            process_descriptions: processNames.filter(p => p.name?.trim()).map(p => ({ name: p.name, description: p.description || '' })),
          };
          
          try {
            await axios.post(`${API}/emissions/c7/month`, payload, {
              headers: getAuthHeader()
            });
            successCount++;
          } catch (err) {
            console.error(`[C7] Failed to save ${monthKey}:`, err);
            errors.push(monthKey);
          }
        }
        
        if (successCount > 0) {
          if (errors.length > 0) {
            toast.warning(`Saved ${successCount}/${monthsToSave.length} months. Failed: ${errors.join(', ')}`);
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
            // Dynamic fields yearly
            dynamicInputFields.forEach(field => {
              const value = yearlyData[field.variable] || yearlyData[field.fieldKey];
              if (value === undefined || value === null || value === '') return;
              
              const numValue = parseFloat(value);
              if (!Number.isFinite(numValue)) return;
              
              let unit = yearlyData[`${field.variable}_unit`] || field.expectedUnit || '';
              
              if (!field.isOverride && primaryQuantity === 0) {
                primaryQuantity = numValue;
                primaryUnit = unit;
              }
              
              if (field.isOverride) {
                const overrideKey = `override_${field.variable}`;
                if (yearlyData[overrideKey]) {
                  userOverrides[field.variable] = { value: numValue, unit: unit };
                }
              } else {
                inputs[field.variable] = { value: numValue, unit: unit };
              }
            });
            
            const decisionInputs = buildDecisionInputs(yearlyData);
            const matchedEFForContext = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            
            const context = {
              fuel_name: selectedFuel?.fuel_name,
              fuel_id: fuelId || '',
              scope: effectiveScope,
              category: category,
              facility_id: facilityId,
              ...(isScope3Like && {
                calculation_method_scope3: scope3Method,
                scope3_ef_id: scope3ActivityId,
                scope3_ef_default_unit: matchedEFForContext?.default_unit || '',
                activity: matchedEFForContext?.activity || scope3CustomActivity,
              }),
            };
            
            // Get category ID for calc-engine
            const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope);
            if (!categoryObj?.id) {
              toast.error('Category configuration not found');
              setIsSaving(false);
              return;
            }
            
            // Execute calc engine
            const calcResponse = await axios.post(`${API}/calc-engine/execute-by-category`, {
              category_id: categoryObj.id,
              inputs,
              context,
              decision_inputs: decisionInputs,
              dry_run: false,
              user_overrides: userOverrides,
            }, { headers: getAuthHeader() });
            
            const calcResult = calcResponse.data;
            const outputs = calcResult.outputs || {};
            const calculatedCO2e = outputs.co2e?.value || outputs.total_co2e?.value || 0;
            
            const payload = {
              facility_id: facilityId,
              reporting_period: yearlyReportingPeriod,
              frequency_type: 'yearly',
              scope: scope,
              category: category,
              sub_category: scope3Subcategory || '',
              fuel_type: selectedFuel?.fuel_name || scope3ActivityType || '',
              quantity: primaryQuantity,
              quantity_unit: primaryUnit,
              unit: primaryUnit,
              dynamic_field_values: inputs,
              outputs: outputs,
              formula_used: calcResult.formula_used,
              emission_factor_used: calcResult.emission_factor_used,
              calculated_co2e: calculatedCO2e,
              co2e_emissions: calculatedCO2e,
              biogenic_scope_selection: scope === 'biogenic' ? biogenicScopeSelection : null,
              notes: notes,
              responsible_person: responsiblePerson,
              responsible_person_designation: responsiblePersonDesignation,
              responsible_person_contact: responsiblePersonContact,
              process_names: validProcesses.map(p => p.name),
              process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
              ...(isScope3Like && {
                supplier_name: supplierName || null,
                supplier_code: supplierCode || null,
                calculation_method_scope3: scope3Method,
                scope3_activity_type: scope3ActivityType || '',
                scope3_activity: matchedEFForContext?.activity || scope3CustomActivity || '',
                scope3_ef_id: scope3ActivityId,
              }),
            };
            
            await axios.post(`${API}/emissions`, payload, { headers: getAuthHeader() });
            toast.success(`Created yearly emission record for ${yearlyReportingPeriod}`);
            onSuccess?.();
          } else {
            // Legacy simple mode yearly
            const payload = {
              facility_id: facilityId,
              reporting_period: yearlyReportingPeriod,
              frequency_type: 'yearly',
              scope: scope,
              category: category,
              sub_category: scope3Subcategory || '',
              quantity: parseFloat(yearlyData.quantity) || 0,
              quantity_unit: yearlyData.unit || defaultUnit,
              unit: yearlyData.unit || defaultUnit,
              notes: notes,
              responsible_person: responsiblePerson,
            };
            
            await axios.post(`${API}/emissions`, payload, { headers: getAuthHeader() });
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

      // REGULAR FUEL EMISSIONS HANDLING
      // Create emission record for each month with data
      let successCount = 0;
      const errors = [];
      
      for (const [monthKey, data] of monthsWithData) {
        const actualYear = getActualYearForMonth(monthKey);
        const reportingPeriod = `${actualYear}-${monthKey}`;
        
        // ============================================================================
        // BUILD INPUTS DYNAMICALLY FROM dynamicInputFields
        // No hardcoded field names - loop through the mappings
        // ============================================================================
        const inputs = {};
        const userOverrides = {};
        let primaryQuantity = 0;
        let primaryUnit = defaultUnit;
        
        // Define isScope3Like early since it's used in the loop below
        const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
        const effectiveScope = isScope3Like ? 'scope3' : scope;
        
        dynamicInputFields.forEach(field => {
          const value = data[field.variable] || data[field.fieldKey];
          if (value === undefined || value === null || value === '') return;
          
          const numValue = parseFloat(value);
          if (!Number.isFinite(numValue)) return;
          
          // Determine unit based on unit_source from the mapping - MUST match dropdown display logic
          let unit;
          let fieldUnits = [];
          
          if (field.unitSource === 'fuel') {
            // Get unit from fuel's allowed_units
            // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
            if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
              const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
              fieldUnits = matchedActivity?.allowed_units || [];
            } else {
              fieldUnits = selectedFuel?.allowed_units || [];
            }
            unit = data[`${field.variable}_unit`] || data.unit || fieldUnits[0] || field.expectedUnit;
          } else if (field.unitSource === 'all_units') {
            // All centralized units (simple + compound)
            fieldUnits = centralizedUnits.map(u => u.symbol);
            unit = data[`${field.variable}_unit`] || fieldUnits[0] || field.expectedUnit || '';
          } else if (field.unitSource === 'scope3_ef') {
            // For scope3_ef: Priority 1: scope3_ef.allowed_units, Priority 2: field mapping, Priority 3: formula expected_unit
            const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            if (matchedEF?.allowed_units?.length > 0) {
              fieldUnits = matchedEF.allowed_units;
            } else if (field.allowedUnits?.length > 0) {
              fieldUnits = field.allowedUnits;
            } else if (field.expectedUnit) {
              fieldUnits = [field.expectedUnit];
            } else {
              fieldUnits = [];
            }
            unit = data[`${field.variable}_unit`] || fieldUnits[0] || field.expectedUnit || '';
          } else {
            // Static units from field mapping
            fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
            unit = data[`${field.variable}_unit`] || fieldUnits[0] || field.expectedUnit || '';
          }
          
          // Track primary quantity (first non-override field, typically qty or qty_energy)
          if (!field.isOverride && primaryQuantity === 0) {
            primaryQuantity = numValue;
            primaryUnit = unit;
          }
          
          // Build inputs object for calc engine
          if (field.isOverride) {
            // Override fields go to userOverrides if the override checkbox is checked
            const overrideKey = `override_${field.variable}`;
            if (data[overrideKey]) {
              userOverrides[field.variable] = { value: numValue, unit: unit };
            }
          } else {
            // Regular inputs
            inputs[field.variable] = { value: numValue, unit: unit };
          }
        });
        
        // ============================================================================
        // BUILD DECISION CONTEXT FROM maps_to_context IN MAPPINGS
        // The decision tree will use this to select the correct formula
        // ============================================================================
        const decisionInputs = buildDecisionInputs(data);
        
        // Add fuel context
        const matchedEFForContext = filteredScope3Activities.find(a => a.id === scope3ActivityId);
        
        // For Scope 3 subcategory categories (C8, C10, C11, C13, C14) with fugitive emissions,
        // use the activity name as fuel_name since the activity IS the fuel (e.g., "HFC-32")
        // Skip this for supplier_basis as it uses a basic formula without fuel_database lookup
        
        // Determine if this is a scope3-like flow (regular scope3 or biogenic scope3)
        // isScope3Like and effectiveScope already defined above
        
        let fuelNameForContext = selectedFuel?.fuel_name;
        if (isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForContext?.activity) {
          fuelNameForContext = matchedEFForContext.activity;
        }
        
        const context = {
          fuel_name: fuelNameForContext,
          fuel_id: fuelId,
          scope: effectiveScope, // Use effective scope for context
          category: category,
          facility_id: facilityId,
          // Scope 3 specific context (also applies to biogenic scope3)
          ...(isScope3Like && {
            calculation_method_scope3: scope3Method,
            scope3_ef_id: scope3ActivityId,
            // For supplier_basis with custom activity, use the custom activity name
            activity: (scope3Method === 'supplier_basis' && useCustomActivity) 
              ? scope3CustomActivity 
              : matchedEFForContext?.activity,
            // Pass default_unit for auto-conversion (falls back to formula's expected_unit if not set)
            scope3_ef_default_unit: matchedEFForContext?.default_unit || '',
          }),
        };
        
        // ============================================================================
        // CALL BACKEND CALC ENGINE
        // The backend will traverse decision tree and apply correct formula
        // ============================================================================
        const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === effectiveScope);
        
        let calculatedCO2 = 0;
        let calculatedCH4 = 0;
        let calculatedN2O = 0;
        let calculatedCO2e = 0;
        
        if (categoryObj?.id && !useCustomFuel) {
          try {
            const calcResponse = await axios.post(
              `${API}/calc-engine/execute-by-category`,
              {
                category_id: categoryObj.id,
                decision_inputs: decisionInputs,
                inputs: inputs,
                context: context,
                user_overrides: userOverrides,
                dry_run: false
              },
              { headers: getAuthHeader() }
            );
            
            if (calcResponse.data.ok) {
              const result = calcResponse.data;
              // Extract calculated values from result
              calculatedCO2 = result.outputs?.co2?.value || result.co2_emissions || 0;
              calculatedCH4 = result.outputs?.ch4?.value || result.ch4_emissions || 0;
              calculatedN2O = result.outputs?.n2o?.value || result.n2o_emissions || 0;
              calculatedCO2e = result.outputs?.co2e?.value || result.co2e_emissions || 0;
            }
          } catch (calcErr) {
            // Fall through to use 0 values - will be saved but may need recalculation
          }
        } else if (useCustomFuel) {
          // Custom fuel: simple Quantity × Emission Factor
          const customEF = parseFloat(customEmissionFactor) || 0;
          calculatedCO2 = primaryQuantity * customEF;
          calculatedCO2e = calculatedCO2;
        }
        
        // ============================================================================
        // BUILD NEW DYNAMIC PAYLOAD STRUCTURE
        // ============================================================================
        
        // Build dynamic_field_values from all form inputs
        const dynamicFieldValues = {};
        dynamicInputFields.forEach(field => {
          const value = data[field.variable] || data[field.fieldKey];
          // Use the same unit resolution as the dropdown display
          let fieldUnits = [];
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
            // For scope3_ef: Priority 1: scope3_ef.allowed_units, Priority 2: field mapping, Priority 3: formula expected_unit
            const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
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
            // static - use allowed_units from mapping
            fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
          }
          const unit = data[`${field.variable}_unit`] || fieldUnits[0] || field.expectedUnit || '';
          
          if (field.isOverride) {
            const isOverridden = data[`override_${field.variable}`] || false;
            dynamicFieldValues[field.variable] = {
              value: isOverridden && value !== undefined && value !== '' ? parseFloat(value) : null,
              unit: unit,
              is_override: isOverridden,
              justification: data[`${field.variable}_justification`] || ''
            };
          } else {
            dynamicFieldValues[field.variable] = {
              value: value !== undefined && value !== '' ? parseFloat(value) : null,
              unit: unit
            };
          }
        });
        
        // Build outputs from calculation results
        const outputs = {
          co2: { value: calculatedCO2 || 0, unit: 'tCO2' },
          ch4: { value: calculatedCH4 || 0, unit: 'tCH4' },
          n2o: { value: calculatedN2O || 0, unit: 'tN2O' },
          co2e: { value: calculatedCO2e || 0, unit: 'tCO2e' }
        };
        
        const payload = {
          facility_id: facilityId,
          reporting_period: reportingPeriod,
          scope: scope, // Keep original scope for record (biogenic stays biogenic)
          category: category,
          sub_category: isScope3Like 
            ? (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '')
            : (useCustomFuel ? customFuelName : selectedFuel?.fuel_name || ''),
          fuel_type: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          fuel_database_id: isScope3Like ? null : (useCustomFuel ? null : fuelId),
          
          // Biogenic-specific fields
          ...(scope === 'biogenic' && {
            biogenic_scope_selection: biogenicScopeSelection, // 'scope1' or 'scope3'
          }),
          
          // Scope 3 specific fields (also applies to biogenic scope3)
          ...(isScope3Like && {
            calculation_method_scope3: scope3Method,
            scope3_ef_id: scope3Method === 'supplier_basis' ? null : scope3ActivityId,
            scope3_activity: (scope3Method === 'supplier_basis' && useCustomActivity)
              ? scope3CustomActivity 
              : (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || ''),
            scope3_activity_type: scope3ActivityType || '',
            scope3_subcategory: scope3Subcategory || '',
            formula_id: matchedFormulaId,  // Store the matched formula ID
          }),
          
          // New dynamic structure
          dynamic_field_values: {
            ...dynamicFieldValues,
            // Also store Scope 3 fields in dynamic_field_values as proper dict structure
            ...(isScope3Like && {
              calculation_method_scope3: { value: scope3Method, unit: '' },
              scope3_ef_id: { value: (scope3Method === 'supplier_basis' && useCustomActivity) ? '' : scope3ActivityId, unit: '' },
              scope3_activity: { 
                value: (scope3Method === 'supplier_basis' && useCustomActivity)
                  ? scope3CustomActivity 
                  : (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || ''), 
                unit: '' 
              },
              scope3_activity_type: { value: scope3ActivityType || '', unit: '' },
              scope3_subcategory: { value: scope3Subcategory || '', unit: '' },
            }),
            // Store biogenic selection in dynamic_field_values
            ...(scope === 'biogenic' && {
              biogenic_scope_selection: { value: biogenicScopeSelection, unit: '' },
            }),
          },
          outputs: outputs,
          
          // Metadata
          source_of_information: useCustomFuel ? customSource : selectedFuel?.source || '',
          notes: notes,
          justification: useCustomFuel ? `Custom fuel type: ${customFuelName}` : null,
          evidence_url: data.evidences?.map(e => e.url).join(',') || '',
          responsible_person: responsiblePerson,
          responsible_person_designation: responsiblePersonDesignation,
          responsible_person_contact: responsiblePersonContact,
          process_names: validProcesses.map(p => p.name),
          process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
          
          // Scope 3 optional supplier/employee fields (also for biogenic scope3)
          ...(isScope3Like && {
            supplier_name: supplierName || null,
            supplier_code: supplierCode || null,
            ...(category === 'Employee Commuting' && {
              employee_name: employeeName || null,
              employee_id: employeeId || null,
            }),
          }),
        };

        try {
          const saveResponse = await axios.post(`${API}/emissions`, payload, {
            headers: getAuthHeader()
          });
          successCount++;
        } catch (err) {
          errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: Save failed`);
        }
      }

      if (successCount > 0) {
        toast.success(`Created ${successCount} emission record(s) successfully`);
      }
      if (errors.length > 0) {
        toast.error(`Failed to save some records. Please try again.`);
      }
      if (successCount > 0) {
        onSuccess?.();
      }
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

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> Each emission entry record is for <strong>1 year only</strong>. 
          Monthly data entered below will be aggregated for the selected reporting year.
        </p>
      </div>

      {/* Step 1: Basic Selection */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Facility */}
            <div className="space-y-2">
              <Label>Facility *</Label>
              <select
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="emission-facility-select"
              >
                <option value="">Select Facility</option>
                {facilities.filter(f => f.is_active !== false).map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.country ? `(${f.country})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <Label>Scope *</Label>
              <div className="flex gap-4 h-10 items-center flex-wrap">
                {(dynamicScopes.length > 0 ? dynamicScopes : [
                  { code: 'scope1', name: 'Scope 1' },
                  { code: 'scope2', name: 'Scope 2' },
                  { code: 'biogenic', name: 'Biogenic' },
                ])
                  // Filter out Scope 3 if org doesn't have access
                  .filter(s => s.code !== 'scope3' || hasScope3Access)
                  .map(s => (
                    <label key={s.code} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value={s.code}
                        checked={scope === s.code}
                        onChange={() => {
                          setScope(s.code);
                          setCategory('');
                          setFuelId('');
                          setScope3Method('');
                          setScope3ActivityType('');
                          setScope3ActivityId('');
                          if (s.code === 'scope2') setUseCustomFuel(false);
                          // Reset biogenic scope selection when changing away from biogenic
                          if (s.code !== 'biogenic') {
                            setBiogenicScopeSelection('');
                          }
                        }}
                        className="text-primary"
                        data-testid={`entry-scope-${s.code}`}
                      />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
              </div>
            </div>
            
            {/* Biogenic Scope Selection - Show when biogenic is selected */}
            {scope === 'biogenic' && (
              <div className="col-span-2 space-y-2 p-4 bg-green-50 rounded-lg border border-green-200">
                <Label className="text-green-800">Select Biogenic Emission Type *</Label>
                <div className="flex gap-6 h-10 items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="scope1"
                      checked={biogenicScopeSelection === 'scope1'}
                      onChange={(e) => {
                        setBiogenicScopeSelection(e.target.value);
                        setCategory('');
                        setFuelId('');
                        setScope3Method('');
                        setScope3ActivityId('');
                      }}
                      className="text-green-600"
                      data-testid="biogenic-scope-radio-scope1"
                    />
                    <span className="text-green-800">Scope 1 (Direct Biogenic)</span>
                  </label>
                  <label className={`flex items-center gap-2 ${!hasScope3Access ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      value="scope3"
                      checked={biogenicScopeSelection === 'scope3'}
                      disabled={!hasScope3Access}
                      onChange={(e) => {
                        setBiogenicScopeSelection(e.target.value);
                        setCategory('');
                        setFuelId('');
                        setScope3Method('');
                        setScope3ActivityId('');
                      }}
                      className="text-green-600"
                      data-testid="biogenic-scope-radio-scope3"
                    />
                    <span className="text-green-800">Scope 3 (Indirect Biogenic)</span>
                    {!hasScope3Access && (
                      <span className="px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-semibold rounded whitespace-nowrap">
                        Not Available
                      </span>
                    )}
                  </label>
                </div>
                {loadingBiogenicCategories && (
                  <p className="text-xs text-green-600">Loading biogenic categories...</p>
                )}
              </div>
            )}
          </div>

          {/* Category - Show prompt if biogenic selected but no sub-scope chosen */}
          {scope === 'biogenic' && !biogenicScopeSelection ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-800 text-sm">
                <strong>Please select a biogenic emission type above</strong> (Scope 1 or Scope 3) to continue.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Category *</Label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setFuelId('');
                  // Reset Scope 3 fields when category changes
                  setScope3Method('');
                  setScope3ActivityType('');
                  setScope3Subcategory('');
                  setScope3ActivityId('');
                  // Reset process emission fields when category changes
                  setSelectedSubIndustry('');
                  setSelectedTemplate(null);
                  setTemplateInputValues({});
                }}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="emission-category-select"
              >
                <option value="">Select Category</option>
                {categoriesForScope.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}

          {/* Process Emissions - Sub-industry Selection */}
          {isProcessEmissions && (
            <div className="space-y-2">
              <Label>Sub-Industry *</Label>
              <select
                value={selectedSubIndustry}
                onChange={(e) => {
                  setSelectedSubIndustry(e.target.value);
                  setSelectedTemplate(null);
                  setTemplateInputValues({});
                }}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="emission-subindustry-select"
              >
                <option value="">Select Sub-Industry</option>
                {availableSubIndustries.map(si => (
                  <option key={si} value={si}>{si}</option>
                ))}
              </select>
            </div>
          )}

          {/* Process Emissions - Approach/Template Selection */}
          {isProcessEmissions && selectedSubIndustry && (
            <div className="space-y-2">
              <Label>Approach Used *</Label>
              <select
                value={selectedTemplate?.id || ''}
                onChange={(e) => {
                  const template = templatesForSubIndustry.find(t => t.id === e.target.value);
                  setSelectedTemplate(template || null);
                  // Initialize template input values with predefined values only
                  if (template) {
                    const initialValues = {};
                    template.predefined_inputs?.forEach(f => {
                      initialValues[f.key] = f.value || '';
                    });
                    setTemplateInputValues(initialValues);
                  } else {
                    setTemplateInputValues({});
                  }
                }}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="emission-template-select"
              >
                <option value="">Select Approach</option>
                {templatesForSubIndustry.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {selectedTemplate?.description && (
                <p className="text-xs text-text-muted mt-1">{selectedTemplate.description}</p>
              )}
              {/* Show formula info */}
              {selectedTemplate && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg mt-2">
                  <p className="text-xs text-text-muted mb-1">Calculation Formula</p>
                  <code className="text-sm font-mono text-emerald-700">{selectedTemplate.formula}</code>
                </div>
              )}
            </div>
          )}

          {/* Scope 3: Method and Activity Selection */}
          {category && !isProcessEmissions && scope === 'scope3' && (
            <div className="space-y-4 mt-4 pb-6 border-b border-stone-200">
              {/* Method Selection (spend_basis or activity_basis) */}
              <div className="space-y-2">
                <Label>Calculation Method *</Label>
                <select
                  value={scope3Method}
                  onChange={(e) => {
                    setScope3Method(e.target.value);
                    setScope3ActivityType(''); // Reset activity type when method changes
                    setScope3Subcategory(''); // Reset subcategory when method changes
                    setScope3ActivityId(''); // Reset activity when method changes
                  }}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="scope3-method-select"
                >
                  <option value="">Select Method</option>
                  {availableScope3Methods.map(method => (
                    <option key={method} value={method}>
                      {getMethodLabel(method)}
                    </option>
                  ))}
                </select>
                {availableScope3Methods.length === 0 && category && (
                  <p className="text-xs text-amber-600">No methods available for this category in Scope 3 EF table</p>
                )}
              </div>

              {/* Activity Type Filter (only for C6/C7) */}
              {scope3Method && availableScope3ActivityTypes.length > 0 && (
                <div className="space-y-2">
                  <Label>Activity Type *</Label>
                  <select
                    value={scope3ActivityType}
                    onChange={(e) => {
                      setScope3ActivityType(e.target.value);
                      setScope3ActivityId(''); // Reset activity when type changes
                    }}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    data-testid="scope3-activity-type-filter"
                  >
                    <option value="">Select activity type...</option>
                    {availableScope3ActivityTypes.map(type => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Subcategory Selection (for C8/C10/C11/C13/C14) */}
              {scope3Method && requiresSubcategory && availableSubcategories.length > 0 && (
                <div className="space-y-2">
                  <Label>Sub-category *</Label>
                  <select
                    value={scope3Subcategory}
                    onChange={(e) => {
                      setScope3Subcategory(e.target.value);
                      setScope3ActivityId(''); // Reset activity when subcategory changes
                    }}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    data-testid="scope3-subcategory-select"
                  >
                    <option value="">Select sub-category...</option>
                    {availableSubcategories.map(sub => (
                      <option key={sub.value} value={sub.value}>
                        {sub.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Activity Selection (from Scope 3 EF) */}
              {scope3Method && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Activity *</Label>
                    {/* Toggle for custom activity - available for supplier_basis (Scope 3 and Biogenic Scope 3) */}
                    {scope3Method === 'supplier_basis' && (scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3')) && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useCustomActivity}
                          onChange={(e) => {
                            setUseCustomActivity(e.target.checked);
                            if (e.target.checked) {
                              setScope3ActivityId('');
                            } else {
                              setScope3CustomActivity('');
                            }
                          }}
                          className="rounded border-stone-300"
                        />
                        <span className="text-text-secondary">Use Custom Activity</span>
                      </label>
                    )}
                  </div>
                  
                  {/* For supplier_basis with custom activity toggle ON: Show text field */}
                  {scope3Method === 'supplier_basis' && useCustomActivity && (scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                    <div className="space-y-2">
                      <Input
                        type="text"
                        value={scope3CustomActivity}
                        onChange={(e) => setScope3CustomActivity(e.target.value)}
                        placeholder="Enter custom activity name..."
                        className="bg-stone-50 h-10"
                        data-testid="scope3-custom-activity-input"
                      />
                      <p className="text-xs text-text-muted">
                        Enter a custom activity name describing the emission source
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Activity search input */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <Input
                          type="text"
                          value={fuelSearchTerm}
                          onChange={(e) => setFuelSearchTerm(e.target.value)}
                          placeholder="Search activities..."
                          className="pl-9 bg-stone-50 h-10"
                          data-testid="activity-search-input"
                          disabled={(availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)}
                        />
                        {fuelSearchTerm && (
                          <button
                            type="button"
                            onClick={() => setFuelSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {/* Activity selection dropdown */}
                      <select
                        value={scope3ActivityId}
                        onChange={(e) => {
                          setScope3ActivityId(e.target.value);
                          setFuelSearchTerm('');
                        }}
                        className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${((availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        data-testid="scope3-activity-select"
                        disabled={(availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)}
                      >
                        <option value="">
                          {(availableScope3ActivityTypes.length > 0 && !scope3ActivityType) 
                            ? 'Select activity type first' 
                            : (requiresSubcategory && !scope3Subcategory)
                            ? 'Select sub-category first'
                            : `Select Activity (${filteredScope3Activities.filter(a => 
                                !fuelSearchTerm || a.activity?.toLowerCase().includes(fuelSearchTerm.toLowerCase())
                              ).length} available)`}
                        </option>
                        {filteredScope3Activities
                          .filter(a => !fuelSearchTerm || a.activity?.toLowerCase().includes(fuelSearchTerm.toLowerCase()))
                          .map(ef => (
                            <option key={ef.id} value={ef.id}>
                              {ef.activity}
                            </option>
                          ))}
                      </select>
                      {/* Activity loading indicator only - no error message shown to users */}
                      {loadingScope3EF && (
                        <p className="text-xs text-blue-600">Loading activities...</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Biogenic Scope 3: Method and Activity Selection */}
          {category && scope === 'biogenic' && biogenicScopeSelection === 'scope3' && (
            <div className="space-y-4 mt-4 pb-6 border-b border-green-200 bg-green-50/50 p-4 rounded-lg">
              {/* Method Selection */}
              <div className="space-y-2">
                <Label className="text-green-800">Calculation Method *</Label>
                <select
                  value={scope3Method}
                  onChange={(e) => {
                    setScope3Method(e.target.value);
                    setScope3ActivityId('');
                  }}
                  className="w-full h-10 bg-white border border-green-200 rounded-lg px-3"
                  data-testid="biogenic-scope3-method-select"
                >
                  <option value="">Select Method</option>
                  {availableScope3Methods.map(method => (
                    <option key={method} value={method}>
                      {getMethodLabel(method)}
                    </option>
                  ))}
                </select>
                {availableScope3Methods.length === 0 && category && (
                  <p className="text-xs text-amber-600">No methods available for this biogenic category</p>
                )}
              </div>

              {/* Activity Selection */}
              {scope3Method && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-green-800">Biogenic Activity *</Label>
                    {/* Toggle for custom activity - available for supplier_basis in Biogenic Scope 3 */}
                    {scope3Method === 'supplier_basis' && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useCustomActivity}
                          onChange={(e) => {
                            setUseCustomActivity(e.target.checked);
                            if (e.target.checked) {
                              setScope3ActivityId('');
                            } else {
                              setScope3CustomActivity('');
                            }
                          }}
                          className="rounded border-green-300"
                          data-testid="biogenic-scope3-custom-activity-toggle"
                        />
                        <span className="text-green-700">Use Custom Activity</span>
                      </label>
                    )}
                  </div>
                  
                  {/* For supplier_basis with custom activity toggle ON: Show text field */}
                  {scope3Method === 'supplier_basis' && useCustomActivity ? (
                    <div className="space-y-2">
                      <Input
                        type="text"
                        value={scope3CustomActivity}
                        onChange={(e) => setScope3CustomActivity(e.target.value)}
                        placeholder="Enter custom activity name..."
                        className="bg-white border-green-200 h-10"
                        data-testid="biogenic-scope3-custom-activity-input"
                      />
                      <p className="text-xs text-green-600">
                        Enter a custom activity name describing the biogenic emission source
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Activity search input */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                        <Input
                          type="text"
                          value={fuelSearchTerm}
                          onChange={(e) => setFuelSearchTerm(e.target.value)}
                          placeholder="Search biogenic activities..."
                          className="pl-9 bg-white border-green-200 h-10"
                          data-testid="biogenic-activity-search-input"
                        />
                        {fuelSearchTerm && (
                          <button
                            type="button"
                            onClick={() => setFuelSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 hover:text-green-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <select
                        value={scope3ActivityId}
                        onChange={(e) => {
                          setScope3ActivityId(e.target.value);
                          setFuelSearchTerm('');
                        }}
                        className="w-full h-10 bg-white border border-green-200 rounded-lg px-3"
                        data-testid="biogenic-scope3-activity-select"
                      >
                        <option value="">
                          Select Biogenic Activity ({filteredScope3Activities.filter(a => 
                            !fuelSearchTerm || a.activity?.toLowerCase().includes(fuelSearchTerm.toLowerCase())
                          ).length} available)
                        </option>
                        {filteredScope3Activities
                          .filter(a => !fuelSearchTerm || a.activity?.toLowerCase().includes(fuelSearchTerm.toLowerCase()))
                          .map(ef => (
                            <option key={ef.id} value={ef.id}>
                              {ef.activity}
                            </option>
                          ))}
                      </select>
                      {filteredScope3Activities.length === 0 && scope3Method && (
                        <p className="text-xs text-amber-600">
                          No biogenic activities found for this category and method
                        </p>
                      )}
                      {loadingScope3EF && (
                        <p className="text-xs text-green-600">Loading biogenic activities...</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Fuel Type - Only show for non-Scope 3, non-biogenic-scope3, and non-process emissions */}
          {category && !isProcessEmissions && scope !== 'scope3' && !(scope === 'biogenic' && biogenicScopeSelection === 'scope3') && (
            <div className="space-y-3 mt-4 pb-6 border-b border-stone-200">
              <div className="flex items-center justify-between">
                <Label>Fuel Type *</Label>
                {/* Custom Fuel Type option hidden for now
                {scope !== 'scope2' && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomFuel}
                      onChange={(e) => {
                        setUseCustomFuel(e.target.checked);
                        if (e.target.checked) setFuelId('');
                      }}
                    />
                    Use Custom Fuel Type
                  </label>
                )}
                */}
              </div>

              {!useCustomFuel ? (
                <div className="space-y-2">
                  {/* Fuel search input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <Input
                      type="text"
                      value={fuelSearchTerm}
                      onChange={(e) => setFuelSearchTerm(e.target.value)}
                      placeholder="Search fuel types..."
                      className="pl-9 bg-stone-50 h-10"
                      data-testid="fuel-search-input"
                    />
                    {fuelSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setFuelSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {/* Fuel selection dropdown */}
                  <select
                    value={fuelId}
                    onChange={(e) => {
                      setFuelId(e.target.value);
                      setFuelSearchTerm(''); // Clear search after selection
                    }}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    data-testid="emission-fuel-select"
                  >
                    <option value="">Select Fuel Type ({filteredFuelsForCategory.length} available)</option>
                    {filteredFuelsForCategory.map(fuel => (
                      <option key={fuel.id} value={fuel.id}>
                        {fuel.fuel_name}
                      </option>
                    ))}
                  </select>
                  {fuelSearchTerm && filteredFuelsForCategory.length === 0 && (
                    <p className="text-xs text-amber-600">No fuel types match "{fuelSearchTerm}"</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="space-y-2">
                    <Label>Custom Fuel Name *</Label>
                    <Input
                      value={customFuelName}
                      onChange={(e) => setCustomFuelName(e.target.value)}
                      placeholder="Enter fuel name"
                      className="bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Emission Factor *</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={customEmissionFactor}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || parseFloat(val) >= 0) {
                            setCustomEmissionFactor(val);
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                        placeholder="e.g., 2.5"
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>EF Unit *</Label>
                      <select
                        value={customEmissionFactorUnit}
                        onChange={(e) => setCustomEmissionFactorUnit(e.target.value)}
                        className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                      >
                        {getAvailableEFUnits(scope).map(unit => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-amber-700">
                        Quantity unit will be: <strong>{getQuantityUnitFromEFUnit(customEmissionFactorUnit)}</strong>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Source *</Label>
                      <Input
                        value={customSource}
                        onChange={(e) => setCustomSource(e.target.value)}
                        placeholder="Source of info"
                        className="bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Show selected fuel info */}
              {selectedFuel && !useCustomFuel && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <p><strong>Selected:</strong> {selectedFuel.fuel_name}</p>
                </div>
              )}
            </div>
          )}

          {/* Scope 3 Supplier Information (optional) - shown for all Scope 3 categories */}
          {scope === 'scope3' && category && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium mb-3 text-blue-800">Supplier Information (Optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier Name</Label>
                  <Input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Enter supplier name..."
                    className="bg-white"
                    data-testid="supplier-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supplier Code</Label>
                  <Input
                    value={supplierCode}
                    onChange={(e) => setSupplierCode(e.target.value)}
                    placeholder="Enter supplier code..."
                    className="bg-white"
                    data-testid="supplier-code-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Employee Commuting specific fields (optional) */}
          {scope === 'scope3' && category === 'Employee Commuting' && (
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="font-medium mb-3 text-purple-800">Employee Information (Optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employee Name</Label>
                  <Input
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Enter employee name..."
                    className="bg-white"
                    data-testid="employee-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Employee ID</Label>
                  <Input
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="Enter employee ID..."
                    className="bg-white"
                    data-testid="employee-id-input"
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Step 2: Process & Responsibility */}
      {currentStep === 2 && (
        <div className="space-y-4">
          {/* For Process Emissions: Show Person Responsible and Override Default Values */}
          {isProcessEmissions && selectedTemplate ? (
            <>
              {/* Person Responsible */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Person Responsible *</Label>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                        <p>Person responsible for maintaining data accuracy</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  value={responsiblePerson}
                  onChange={(e) => setResponsiblePerson(e.target.value)}
                  placeholder="Name of person responsible"
                  className="bg-stone-50"
                  data-testid="responsible-person-input"
                />
              </div>
              
              {/* Designation */}
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input
                  value={responsiblePersonDesignation}
                  onChange={(e) => setResponsiblePersonDesignation(e.target.value)}
                  placeholder="e.g., Environmental Manager"
                  className="bg-stone-50"
                  data-testid="responsible-person-designation"
                />
              </div>
              
              {/* Contact Details */}
              <div className="space-y-2">
                <Label>Contact Details</Label>
                <Input
                  value={responsiblePersonContact}
                  onChange={(e) => setResponsiblePersonContact(e.target.value)}
                  placeholder="Email or phone number"
                  className="bg-stone-50"
                  data-testid="responsible-person-contact"
                />
              </div>

              {/* Modify Values - Only show predefined inputs that can be overridden */}
              {selectedTemplate.predefined_inputs?.filter(f => f.can_override).length > 0 && (
                <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Label className="text-amber-800 font-medium">Modify Values (if available)</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedTemplate.predefined_inputs.filter(f => f.can_override).map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label className="text-sm">
                          {field.label}
                          {field.unit && <span className="text-text-muted ml-1">({field.unit})</span>}
                        </Label>
                        <Input
                          type={field.data_type === 'number' ? 'number' : 'text'}
                          step={field.data_type === 'number' ? 'any' : undefined}
                          value={templateInputValues[field.key] || ''}
                          onChange={(e) => setTemplateInputValues(prev => ({
                            ...prev,
                            [field.key]: e.target.value
                          }))}
                          placeholder={`Default: ${field.value}`}
                          className="bg-white"
                          data-testid={`override-${field.key}`}
                        />
                        <p className="text-xs text-amber-600">Default: {field.value} {field.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Show locked predefined values (non-overridable) for info */}
              {selectedTemplate.predefined_inputs?.filter(f => !f.can_override).length > 0 && (
                <div className="space-y-3 p-4 bg-stone-50 border border-stone-200 rounded-lg">
                  <Label className="text-stone-600 font-medium">Fixed Values (Cannot be changed)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedTemplate.predefined_inputs.filter(f => !f.can_override).map((field) => (
                      <div key={field.key} className="flex justify-between items-center p-2 bg-white rounded border">
                        <span className="text-sm text-stone-600">{field.label}</span>
                        <span className="text-sm font-medium">{field.value} {field.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Regular emissions: Show Process Names and Person Responsible */
            <>
              {/* Process Names */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label>Name of Process(es) *</Label>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                          <p>Process in which the fuel is being used</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addProcessName}
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Process
                  </Button>
                </div>
                {processNames.map((process, idx) => (
                  <div key={idx} className="border border-stone-200 rounded-lg p-3 space-y-2 bg-stone-50">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={process.name}
                          onChange={(e) => updateProcessName(idx, 'name', e.target.value)}
                          placeholder={`Process Name ${idx + 1}`}
                          className="bg-white"
                        />
                        <div className="space-y-1">
                          <label className="text-xs text-stone-500">
                            Description {process.name && process.name.trim() && <span className="text-red-500">*</span>}
                          </label>
                          <textarea
                            value={process.description}
                            onChange={(e) => updateProcessName(idx, 'description', e.target.value)}
                            placeholder="Process Description (required if name is provided)"
                            className={`w-full px-3 py-2 text-sm bg-white border rounded-lg resize-none ${
                              process.name && process.name.trim() && (!process.description || !process.description.trim())
                                ? 'border-red-300 focus:border-red-500'
                                : 'border-stone-200'
                            }`}
                            rows={2}
                          />
                        </div>
                      </div>
                      {processNames.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeProcessName(idx)}
                          className="text-red-500 mt-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Person Responsible for Regular Emissions */}
              <div className="space-y-2 my-6">
                <div className="flex items-center gap-2">
                  <Label>Person Responsible *</Label>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                        <p>Person who is maintaining this data</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  value={responsiblePerson}
                  onChange={(e) => setResponsiblePerson(e.target.value)}
                  placeholder="Enter name of responsible person"
                  className="bg-stone-50"
                />
              </div>
              
              {/* Designation */}
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input
                  value={responsiblePersonDesignation}
                  onChange={(e) => setResponsiblePersonDesignation(e.target.value)}
                  placeholder="e.g., Environmental Manager"
                  className="bg-stone-50"
                />
              </div>
              
              {/* Contact Details */}
              <div className="space-y-2">
                <Label>Contact Details</Label>
                <Input
                  value={responsiblePersonContact}
                  onChange={(e) => setResponsiblePersonContact(e.target.value)}
                  placeholder="Email or phone number"
                  className="bg-stone-50"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Year & Monthly Data */}
      {currentStep === 3 && (
        <div className="space-y-4">
          {/* Reporting Year Type Selection */}
          <div className="space-y-2">
            <Label>Reporting Year Type *</Label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                reportingYearType === 'calendar' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-stone-200 hover:border-stone-300'
              }`}>
                <input
                  type="radio"
                  name="yearType"
                  value="calendar"
                  checked={reportingYearType === 'calendar'}
                  onChange={(e) => {
                    setReportingYearType(e.target.value);
                    setMonthlyData({}); // Reset monthly data when type changes
                  }}
                  className="text-primary"
                />
                <div>
                  <span className="font-medium">Calendar Year</span>
                  <p className="text-xs text-stone-500">January to December</p>
                </div>
              </label>
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                reportingYearType === 'financial' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-stone-200 hover:border-stone-300'
              }`}>
                <input
                  type="radio"
                  name="yearType"
                  value="financial"
                  checked={reportingYearType === 'financial'}
                  onChange={(e) => {
                    setReportingYearType(e.target.value);
                    setMonthlyData({}); // Reset monthly data when type changes
                  }}
                  className="text-primary"
                />
                <div>
                  <span className="font-medium">Financial Year</span>
                  <p className="text-xs text-stone-500">April to March</p>
                </div>
              </label>
            </div>
          </div>

          {/* Year Selection */}
          <div className="space-y-2">
            <Label>
              {reportingYearType === 'financial' ? 'Financial Year (FY) *' : 'Reporting Year *'}
            </Label>
            <select
              value={reportingYear}
              onChange={(e) => {
                setReportingYear(e.target.value);
                setMonthlyData({}); // Reset monthly data when year changes
              }}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            >
              {Array.from({ length: 6 }, (_, i) => {
                // Only show current year and 5 previous years (no future years)
                const year = new Date().getFullYear() - i;
                return (
                  <option key={year} value={year}>
                    {reportingYearType === 'financial' 
                      ? `FY ${year}-${(year + 1).toString().slice(-2)}` 
                      : year}
                  </option>
                );
              })}
            </select>
            {reportingYearType === 'financial' && (
              <p className="text-xs text-stone-500">
                FY {reportingYear}-{(parseInt(reportingYear) + 1).toString().slice(-2)}: April {reportingYear} to March {parseInt(reportingYear) + 1}
              </p>
            )}
          </div>

          {/* Data Entry Frequency Selection - NEW */}
          <div className="space-y-2">
            <Label>Data Entry Frequency *</Label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                frequencyType === 'monthly' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-stone-200 hover:border-stone-300'
              }`}>
                <input
                  type="radio"
                  name="frequencyType"
                  value="monthly"
                  checked={frequencyType === 'monthly'}
                  onChange={(e) => {
                    setFrequencyType(e.target.value);
                    setYearlyData({}); // Reset yearly data when switching to monthly
                  }}
                  className="text-primary"
                  disabled={!!editingEmission} // Locked if editing
                />
                <div>
                  <span className="font-medium">Monthly</span>
                  <p className="text-xs text-stone-500">Enter data for each month</p>
                </div>
              </label>
              <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                frequencyType === 'yearly' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-stone-200 hover:border-stone-300'
              } ${editingEmission ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  type="radio"
                  name="frequencyType"
                  value="yearly"
                  checked={frequencyType === 'yearly'}
                  onChange={(e) => {
                    setFrequencyType(e.target.value);
                    setMonthlyData({}); // Reset monthly data when switching to yearly
                    setExpandedMonths([]);
                  }}
                  className="text-primary"
                  disabled={!!editingEmission} // Locked if editing
                />
                <div>
                  <span className="font-medium">Yearly</span>
                  <p className="text-xs text-stone-500">Enter annual total data</p>
                </div>
              </label>
            </div>
            {editingEmission && (
              <p className="text-xs text-amber-600">
                Frequency type cannot be changed when editing. Delete and recreate if needed.
              </p>
            )}
          </div>

          {/* Show badge indicating frequency type */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              frequencyType === 'yearly' 
                ? 'bg-purple-100 text-purple-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {frequencyType === 'yearly' ? 'Annual Entry' : 'Monthly Entry'}
            </span>
            <span className="text-sm text-stone-600">
              {reportingYearType === 'financial' 
                ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}`
                : `CY${reportingYear}`}
            </span>
          </div>

          {/* Multi-Employee Input for C7 Employee Commuting */}
          {isC7EmployeeCommuting && (
            <MultiEmployeeInput
              entityLabel="Employee"
              fields={dynamicInputFields.map(f => ({
                variable: f.variable,
                label: f.label,
                type: f.fieldType,
                unit: f.expectedUnit || f.unit || '',
                required: f.required,
                placeholder: f.placeholder,
              }))}
              selectedActivityType={scope3ActivityType}
              calculationMethod={scope3Method}
              employees={employees}
              onEmployeesChange={setEmployees}
              activeMonths={activeMonths.map(m => {
                // Convert month number (1-12) to month key (jan-dec)
                const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                const monthNum = parseInt(m.key);
                return monthKeys[monthNum - 1] || m.key;
              })}
              onCalculateEmployee={handleCalculateEmployeeMonth}
              monthlyTotals={employeeMonthlyTotals}
              yearlyTotal={employeeYearlyTotal}
              isCalculating={isCalculatingEmployee}
              disabled={!scope3Method || !scope3ActivityType}
              reportingYear={reportingYear}
              reportingYearType={reportingYearType}
              frequencyType={frequencyType}
              emissionFactorInfo={(() => {
                // Build emission factor info for C7 (#7 - Show EF + Formula live preview)
                const matchedActivity = scope3ActivityId 
                  ? filteredScope3Activities.find(a => a.id === scope3ActivityId)
                  : filteredScope3Activities[0];
                
                if (!matchedActivity && !scope3ActivityType) return null;
                
                // Build dynamic formula based on input fields and calculation method
                let formula = '';
                const activityLabel = matchedActivity?.activity || scope3ActivityType?.replace(/_/g, ' ') || 'Activity';
                
                if (scope3Method === 'supplier_basis') {
                  formula = `CO₂e = ${dynamicInputFields.map(f => f.label || f.variable).join(' × ')} × Supplier EF`;
                } else if (scope3Method === 'activity_basis') {
                  // Check what input fields we have
                  const inputLabels = dynamicInputFields
                    .filter(f => !f.isOverride && f.required !== false)
                    .map(f => f.label || f.variable);
                  
                  if (inputLabels.length > 0) {
                    formula = `CO₂e = ${inputLabels.join(' × ')} × EF`;
                  } else {
                    formula = `CO₂e = Distance × Working Days × EF`;
                  }
                } else {
                  formula = 'CO₂e = Activity × Emission Factor';
                }
                
                return {
                  emissionFactor: matchedActivity?.emission_factor,
                  efUnit: matchedActivity?.ef_unit,
                  source: matchedActivity?.source || 'DEFRA 2023',
                  formula: formula,
                  activityType: activityLabel,
                };
              })()}
              showEmissionFactorCard={false}
            />
          )}

          {/* Monthly Data Entry - Hidden when C7 Employee Commuting */}
          {/* Monthly or Yearly Data Entry (non-C7) */}
          {!isC7EmployeeCommuting && frequencyType === 'monthly' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">
                Monthly Data for {reportingYearType === 'financial' 
                  ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}` 
                  : reportingYear}
              </Label>
              <span className="text-sm text-stone-500">
                {filledMonthsCount} / 12 months filled
              </span>
            </div>

            <Accordion type="multiple" value={expandedMonths} onValueChange={setExpandedMonths}>
              {activeMonths.map(month => {
                const monthKey = month.key;
                const status = getMonthStatus(monthKey);
                const data = monthlyData[monthKey] || {};
                const isDisabled = isFutureMonth(monthKey, reportingYear, reportingYearType);
                const displayYear = getActualYearForMonth(monthKey);

                return (
                  <AccordionItem 
                    key={monthKey} 
                    value={monthKey} 
                    className={`border rounded-lg mb-2 ${isDisabled ? 'opacity-50' : ''}`}
                    disabled={isDisabled}
                  >
                    <AccordionTrigger 
                      className={`px-4 py-3 hover:no-underline ${isDisabled ? 'cursor-not-allowed' : ''}`}
                      disabled={isDisabled}
                    >
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${
                            isDisabled ? 'bg-stone-200' :
                            status === 'filled' ? 'bg-green-500' : 'bg-stone-300'
                          }`} />
                          <span className={`font-medium ${isDisabled ? 'text-stone-400' : ''}`}>
                            {month.name} {displayYear}
                            {isDisabled && <span className="ml-2 text-xs text-stone-400">(Future)</span>}
                          </span>
                        </div>
                        {status === 'filled' && !isDisabled && (
                          <span className="text-sm text-green-600 flex items-center gap-1">
                            <Check className="w-4 h-4" />
                            {isProcessEmissions && selectedTemplate ? (
                              // Show template input field value for process emissions
                              <>
                                {selectedTemplate.input_fields?.map(f => data[f.key]).filter(Boolean).join(', ')} {selectedTemplate.input_fields?.[0]?.unit || ''}
                              </>
                            ) : (
                              // Show quantity for regular emissions
                              <>{data.quantity} {data.unit || defaultUnit}</>
                            )}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    {!isDisabled && (
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4">
                        {/* For Process Emissions: Show template required input field with fixed unit */}
                        {isProcessEmissions && selectedTemplate ? (
                          <div className="space-y-4">
                            {selectedTemplate.input_fields?.map((field) => (
                              <div key={field.key} className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>{field.label} {!field.is_optional && '*'}</Label>
                                  <Input
                                    type={field.data_type === 'number' ? 'number' : 'text'}
                                    step={field.data_type === 'number' ? 'any' : undefined}
                                    min="0"
                                    placeholder={`Enter ${field.label.toLowerCase()}`}
                                    value={data[field.key] || ''}
                                    onChange={(e) => updateMonthData(monthKey, field.key, e.target.value)}
                                    className="bg-stone-50"
                                    data-testid={`month-${monthKey}-${field.key}`}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Unit <span className="text-xs text-emerald-600">(fixed)</span></Label>
                                  <div className="flex items-center h-10 bg-emerald-50 border border-emerald-200 rounded-lg px-3 text-emerald-700">
                                    <span>{field.unit || 'unit'}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : formConfig && dynamicInputFields.length > 0 ? (
                          /* Dynamic Fields from ce_input_field_mappings */
                          <div className="space-y-8">
                            {/* Required Inputs Section */}
                            {dynamicInputFields.filter(f => f.required && !f.isOverride).length > 0 && (
                              <div className="space-y-5 pb-6 border-b border-stone-200">
                                <h4 className="text-sm font-semibold text-stone-700 flex items-center gap-2 pb-2">
                                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                  Required Inputs
                                </h4>
                                <div className="space-y-5">
                                  {dynamicInputFields.filter(f => f.required && !f.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                                </div>
                              </div>
                            )}
                            
                            {/* Override Properties Section */}
                            {dynamicInputFields.filter(f => f.isOverride).length > 0 && (
                              <div className="space-y-5 pb-6 border-b border-stone-200 bg-amber-50/30 -mx-4 px-4 py-4 rounded-lg">
                                <h4 className="text-sm font-semibold text-amber-700 flex items-center gap-2 pb-2">
                                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                  Override Properties
                                  <span className="text-xs font-normal text-amber-600 ml-2">(Optional - Use to customize default values)</span>
                                </h4>
                                <div className="space-y-5">
                                  {dynamicInputFields.filter(f => f.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                                </div>
                              </div>
                            )}
                            
                            {/* Optional Inputs Section */}
                            {dynamicInputFields.filter(f => !f.required && !f.isOverride).length > 0 && (
                              <div className="space-y-5 pt-2">
                                <h4 className="text-sm font-semibold text-stone-500 flex items-center gap-2 pb-2">
                                  <span className="w-2 h-2 rounded-full bg-stone-400"></span>
                                  Optional Inputs
                                </h4>
                                <div className="space-y-5">
                                  {dynamicInputFields.filter(f => !f.required && !f.isOverride).map(field => renderDynamicField(field, monthKey, data))}
                                </div>
                              </div>
                            )}
                            
                            {/* Loading indicator */}
                            {loadingFormConfig && (
                              <div className="flex items-center gap-2 text-sm text-stone-500 p-3 bg-stone-100 rounded-lg">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading form fields...
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Fallback: Simple Quantity and Unit (legacy) */
                          <div className="grid grid-cols-2 gap-4 items-end">
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                placeholder="Enter quantity"
                                value={data.quantity || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseFloat(val) >= 0) {
                                    updateMonthData(monthKey, 'quantity', val);
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                className="bg-stone-50"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Unit {useCustomFuel && <span className="text-xs text-amber-600">(locked)</span>}</Label>
                              {useCustomFuel ? (
                                <div className="flex items-center h-10 bg-stone-100 border border-stone-200 rounded-lg px-3 text-stone-600">
                                  <span>{getQuantityUnitFromEFUnit(customEmissionFactorUnit)}</span>
                                  <span className="ml-auto text-xs text-amber-600">Based on EF unit</span>
                                </div>
                              ) : (
                                <select
                                  value={data.unit || defaultUnit}
                                  onChange={(e) => updateMonthData(monthKey, 'unit', e.target.value)}
                                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                                >
                                  {allowedUnits.map(unit => (
                                    <option key={unit} value={unit}>{unit}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Evidence Upload */}
                        <div className="space-y-2">
                          <Label>Evidence(s)</Label>
                          <div className="border-2 border-dashed border-stone-200 rounded-lg p-4">
                            <input
                              type="file"
                              id={`evidence-${monthKey}`}
                              className="hidden"
                              multiple
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                // Upload files sequentially to ensure state updates properly
                                for (let i = 0; i < files.length; i++) {
                                  await handleEvidenceUpload(monthKey, files[i]);
                                }
                                e.target.value = '';
                              }}
                              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx,.gif,.webp"
                            />
                            <label
                              htmlFor={`evidence-${monthKey}`}
                              className="flex flex-col items-center gap-2 cursor-pointer"
                            >
                              <Upload className="w-8 h-8 text-stone-400" />
                              <span className="text-sm text-stone-500">Click to upload evidence</span>
                              <span className="text-xs text-stone-400">PDF, Images, Excel, Word</span>
                            </label>
                          </div>

                          {/* Uploaded Evidences List */}
                          {data.evidences && data.evidences.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {data.evidences.map((evidence, idx) => {
                                // Construct view/download URLs
                                const fileIdMatch = evidence.url?.match(/\/api\/files\/([a-f0-9-]+)/i);
                                const fileId = fileIdMatch ? fileIdMatch[1] : null;
                                const viewUrl = fileId ? `${BACKEND_URL}/api/files/${fileId}/view` : evidence.url;
                                const downloadUrl = fileId ? `${BACKEND_URL}/api/files/${fileId}/download` : evidence.url;
                                
                                return (
                                  <div key={idx} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                                    <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                                    <span className="text-sm text-green-700 truncate flex-1" title={evidence.filename}>
                                      {evidence.filename}
                                    </span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <a
                                        href={viewUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 px-2 py-1"
                                        title="View file"
                                      >
                                        <Eye className="w-3 h-3" />
                                        View
                                      </a>
                                      {fileId && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            // Open download URL directly - browser handles the R2 redirect
                                            window.open(downloadUrl, '_blank');
                                          }}
                                          className="text-xs text-green-600 hover:text-green-800 hover:underline flex items-center gap-1 px-2 py-1"
                                          title="Download file"
                                        >
                                          <Download className="w-3 h-3" />
                                          Download
                                        </button>
                                      )}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeEvidence(monthKey, idx)}
                                        className="text-red-500 hover:text-red-700 p-1 h-auto"
                                        title="Remove file"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Override Options - Scope 1 and Biogenic (not for Fugitive Emissions) */}
                        {/* Only show if formConfig is not available (legacy mode) */}
                        {!formConfig && (scope === 'scope1' || scope === 'biogenic') && !useCustomFuel && selectedFuel && !category?.toLowerCase()?.includes('fugitive') && (
                          <div className="space-y-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`override-cv-${monthKey}`}
                                checked={data.overrideCalorificValue || false}
                                onChange={(e) => updateMonthData(monthKey, 'overrideCalorificValue', e.target.checked)}
                              />
                              <label htmlFor={`override-cv-${monthKey}`} className="text-sm">
                                Calorific Value (if available) <span className="text-gray-500">({selectedFuel?.calorific_value_unit})</span>
                              </label>
                            </div>

                            {data.overrideCalorificValue && (
                              <div className="grid grid-cols-2 gap-2 ml-6">
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder="Enter value"
                                  value={data.calorificValue || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || parseFloat(val) >= 0) {
                                      updateMonthData(monthKey, 'calorificValue', val);
                                    }
                                  }}
                                  onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                  className="bg-white"
                                  required
                                />
                                <Input
                                  placeholder="Justifications/Comments *"
                                  value={data.calorificValueJustification || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'calorificValueJustification', e.target.value)}
                                  className="bg-white"
                                  required
                                />
                              </div>
                            )}

                            {/* Only show Density option if volume unit is selected */}
                            {isVolumeUnit(data.unit || defaultUnit, centralizedUnits) && (
                              <>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`override-density-${monthKey}`}
                                    checked={data.overrideDensity || false}
                                    onChange={(e) => updateMonthData(monthKey, 'overrideDensity', e.target.checked)}
                                  />
                                  <label htmlFor={`override-density-${monthKey}`} className="text-sm">
                                    Density Value (if available) <span className="text-gray-500">({selectedFuel?.density_unit})</span>
                                  </label>
                                </div>

                                {data.overrideDensity && (
                                  <div className="grid grid-cols-2 gap-2 ml-6">
                                    <Input
                                      type="number"
                                      step="any"
                                      min="0"
                                      placeholder="Enter value"
                                      value={data.density || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || parseFloat(val) >= 0) {
                                          updateMonthData(monthKey, 'density', val);
                                        }
                                      }}
                                      onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                      className="bg-white"
                                      required
                                    />
                                    <Input
                                      placeholder="Justifications/Comments *"
                                      value={data.densityJustification || ''}
                                      onChange={(e) => updateMonthData(monthKey, 'densityJustification', e.target.value)}
                                      className="bg-white"
                                      required
                                    />
                                  </div>
                                )}
                              </>
                            )}

                            {/* Override Custom CO2 Emission Factor (Heat Basis) - HIDDEN per user request */}
                            {/* Functionality preserved for existing data but UI hidden for new entries */}
                          </div>
                        )}

                        {/* Override Options - Scope 2 */}
                        {/* Only show if formConfig is not available (legacy mode) */}
                        {!formConfig && scope === 'scope2' && !useCustomFuel && (
                          <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`custom-ef-${monthKey}`}
                                checked={data.useCustomEmissionFactor || false}
                                onChange={(e) => updateMonthData(monthKey, 'useCustomEmissionFactor', e.target.checked)}
                              />
                              <label htmlFor={`custom-ef-${monthKey}`} className="text-sm text-blue-800 font-medium">
                                Use Custom Emission Factor
                              </label>
                              <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                                Unit: tCO₂/MWh
                              </span>
                            </div>

                            {data.useCustomEmissionFactor && (
                              <div className="space-y-2 ml-6">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-xs text-blue-700">Custom EF (tCO₂/MWh)</label>
                                    <Input
                                      type="number"
                                      step="any"
                                      placeholder="e.g., 0.5"
                                      value={data.customEmissionFactor || ''}
                                      onChange={(e) => updateMonthData(monthKey, 'customEmissionFactor', e.target.value)}
                                      className="bg-white"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs text-blue-700">Justification/Comments *</label>
                                    <Input
                                      placeholder="Justification/Comments"
                                      value={data.customEmissionFactorSource || ''}
                                      onChange={(e) => updateMonthData(monthKey, 'customEmissionFactorSource', e.target.value)}
                                      className="bg-white"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                    )}
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
          )}

          {/* YEARLY Data Entry (non-C7) */}
          {!isC7EmployeeCommuting && frequencyType === 'yearly' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">
                Annual Data for {reportingYearType === 'financial' 
                  ? `FY ${reportingYear}-${(parseInt(reportingYear) + 1).toString().slice(-2)}` 
                  : `CY${reportingYear}`}
              </Label>
            </div>

            <div className="p-4 border rounded-lg bg-stone-50 space-y-4">
              {/* For Process Emissions: Show template required input field with fixed unit */}
              {isProcessEmissions && selectedTemplate ? (
                <div className="space-y-4">
                  {selectedTemplate.input_fields?.map((field) => (
                    <div key={field.key} className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{field.label} (Annual Total) {!field.is_optional && '*'}</Label>
                        <Input
                          type={field.data_type === 'number' ? 'number' : 'text'}
                          step={field.data_type === 'number' ? 'any' : undefined}
                          min="0"
                          placeholder={`Enter annual ${field.label.toLowerCase()}`}
                          value={yearlyData[field.key] || ''}
                          onChange={(e) => setYearlyData(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="bg-white"
                          data-testid={`yearly-${field.key}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit <span className="text-xs text-emerald-600">(fixed)</span></Label>
                        <div className="flex items-center h-10 bg-emerald-50 border border-emerald-200 rounded-lg px-3 text-emerald-700">
                          <span>{field.unit || 'unit'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : formConfig && dynamicInputFields.length > 0 ? (
                /* Dynamic Fields from ce_input_field_mappings for yearly */
                <div className="space-y-6">
                  {/* Required Inputs Section */}
                  {dynamicInputFields.filter(f => f.required && !f.isOverride).length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        Required Inputs (Annual Total)
                      </h4>
                      <div className="space-y-4">
                        {dynamicInputFields.filter(f => f.required && !f.isOverride).map(field => {
                          const fieldUnits = getFieldUnitsForYearly(field);
                          const isSupplierBasisField = scope3Method === 'supplier_basis' && 
                            (field.variable?.includes('supplier') || field.variable?.includes('Supplier'));
                          const showUnitSelector = fieldUnits.length > 0 && !isSupplierBasisField;
                          const showSupplierUnitInput = isSupplierBasisField && !field.variable?.endsWith('_unit');
                          
                          return (
                          <div key={field.variable} className="space-y-2">
                            <Label className="flex items-center gap-2">
                              {field.label} *
                              {field.tooltip && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Info className="w-4 h-4 text-stone-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>{field.tooltip}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </Label>
                            {field.fieldType === 'select' && field.options ? (
                              <select
                                value={yearlyData[field.variable] || ''}
                                onChange={(e) => setYearlyData(prev => ({ ...prev, [field.variable]: e.target.value }))}
                                className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                              >
                                <option value="">Select {field.label}</option>
                                {field.options.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            ) : (
                              <div className={showUnitSelector || showSupplierUnitInput ? "grid grid-cols-3 gap-2" : ""}>
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder={field.placeholder || `Enter annual ${field.label.toLowerCase()}`}
                                  value={yearlyData[field.variable] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || parseFloat(val) >= 0) {
                                      setYearlyData(prev => ({ ...prev, [field.variable]: val }));
                                    }
                                  }}
                                  className={showUnitSelector || showSupplierUnitInput ? "col-span-2 bg-white" : "bg-white"}
                                />
                                {showUnitSelector && (
                                  <select
                                    value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                                    onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                                    className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                                  >
                                    {fieldUnits.map(u => (
                                      <option key={u} value={u}>{u}</option>
                                    ))}
                                  </select>
                                )}
                                {showSupplierUnitInput && (
                                  <Input
                                    type="text"
                                    placeholder="Unit"
                                    value={yearlyData[`${field.variable}_unit`] || ''}
                                    onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                                    className="bg-white"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  )}

                  {/* Optional Inputs Section */}
                  {dynamicInputFields.filter(f => !f.required && !f.isOverride).length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Optional Inputs
                      </h4>
                      <div className="space-y-4">
                        {dynamicInputFields.filter(f => !f.required && !f.isOverride).map(field => {
                          const fieldUnits = getFieldUnitsForYearly(field);
                          const isSupplierBasisField = scope3Method === 'supplier_basis' && 
                            (field.variable?.includes('supplier') || field.variable?.includes('Supplier'));
                          const showUnitSelector = fieldUnits.length > 0 && !isSupplierBasisField;
                          const showSupplierUnitInput = isSupplierBasisField && !field.variable?.endsWith('_unit');
                          
                          return (
                          <div key={field.variable} className="space-y-2">
                            <Label className="flex items-center gap-2">
                              {field.label}
                              {field.tooltip && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Info className="w-4 h-4 text-stone-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>{field.tooltip}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </Label>
                            <div className={showUnitSelector || showSupplierUnitInput ? "grid grid-cols-3 gap-2" : ""}>
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                                value={yearlyData[field.variable] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseFloat(val) >= 0) {
                                    setYearlyData(prev => ({ ...prev, [field.variable]: val }));
                                  }
                                }}
                                className={showUnitSelector || showSupplierUnitInput ? "col-span-2 bg-white" : "bg-white"}
                              />
                              {showUnitSelector && (
                                <select
                                  value={yearlyData[`${field.variable}_unit`] || fieldUnits[0] || ''}
                                  onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                                  className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                                >
                                  {fieldUnits.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              )}
                              {showSupplierUnitInput && (
                                <Input
                                  type="text"
                                  placeholder="Unit"
                                  value={yearlyData[`${field.variable}_unit`] || ''}
                                  onChange={(e) => setYearlyData(prev => ({ ...prev, [`${field.variable}_unit`]: e.target.value }))}
                                  className="bg-white"
                                />
                              )}
                            </div>
                          </div>
                        )})}
                      </div>
                    </div>
                  )}
                  
                  {/* Calculate Button and Results for Yearly Mode */}
                  <div className="mt-6 space-y-4">
                    <Button
                      type="button"
                      onClick={executeYearlyCalcEngine}
                      disabled={isCalculatingYearly}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      data-testid="yearly-calculate-btn"
                    >
                      {isCalculatingYearly ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Calculating...
                        </>
                      ) : (
                        <>
                          <Calculator className="w-4 h-4 mr-2" />
                          Calculate Annual Emissions
                        </>
                      )}
                    </Button>
                    
                    {/* Yearly Calculation Result */}
                    {yearlyCalcResult && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <h4 className="font-medium text-emerald-800 mb-3 flex items-center gap-2">
                          <Check className="w-4 h-4" />
                          Calculated Annual Emissions
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-emerald-600">Total CO2e:</span>
                            <span className="ml-2 font-semibold text-emerald-800">
                              {yearlyCalcResult.outputs?.co2e?.value?.toFixed(4) || '0'} {yearlyCalcResult.outputs?.co2e?.unit || 'tCO2e'}
                            </span>
                          </div>
                          {yearlyCalcResult.outputs?.co2 && (
                            <div>
                              <span className="text-emerald-600">CO2:</span>
                              <span className="ml-2 font-medium">
                                {yearlyCalcResult.outputs.co2.value?.toFixed(4) || '0'} {yearlyCalcResult.outputs.co2.unit}
                              </span>
                            </div>
                          )}
                          {yearlyCalcResult.outputs?.ch4 && (
                            <div>
                              <span className="text-emerald-600">CH4:</span>
                              <span className="ml-2 font-medium">
                                {yearlyCalcResult.outputs.ch4.value?.toFixed(6) || '0'} {yearlyCalcResult.outputs.ch4.unit}
                              </span>
                            </div>
                          )}
                          {yearlyCalcResult.outputs?.n2o && (
                            <div>
                              <span className="text-emerald-600">N2O:</span>
                              <span className="ml-2 font-medium">
                                {yearlyCalcResult.outputs.n2o.value?.toFixed(6) || '0'} {yearlyCalcResult.outputs.n2o.unit}
                              </span>
                            </div>
                          )}
                        </div>
                        {yearlyCalcResult.formula_used && (
                          <div className="mt-3 pt-3 border-t border-emerald-200 text-xs text-emerald-600">
                            Formula: {yearlyCalcResult.formula_used}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Legacy mode: Simple quantity/unit input for yearly */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Annual Quantity *</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Enter annual total"
                        value={yearlyData.quantity || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || parseFloat(val) >= 0) {
                            setYearlyData(prev => ({ ...prev, quantity: val }));
                          }
                        }}
                        className="bg-white"
                        data-testid="yearly-quantity"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <select
                        value={yearlyData.unit || defaultUnit}
                        onChange={(e) => setYearlyData(prev => ({ ...prev, unit: e.target.value }))}
                        className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                        data-testid="yearly-unit"
                      >
                        {centralizedUnits.map(u => (
                          <option key={u.id || u.symbol} value={u.symbol}>{u.symbol} ({u.name})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Show density input if volume unit */}
                  {isVolumeUnit(yearlyData.unit || defaultUnit, centralizedUnits) && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Density (kg/L) *</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="Enter density"
                          value={yearlyData.density || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || parseFloat(val) >= 0) {
                              setYearlyData(prev => ({ ...prev, density: val }));
                            }
                          }}
                          className="bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Density Justification</Label>
                        <Input
                          placeholder="Source/justification for density value"
                          value={yearlyData.densityJustification || ''}
                          onChange={(e) => setYearlyData(prev => ({ ...prev, densityJustification: e.target.value }))}
                          className="bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Step 4: Notes */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-medium">Additional Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any additional notes or comments..."
              className="w-full h-32 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Summary */}
          <div className="p-5 bg-stone-50 rounded-lg border border-stone-200">
            <h4 className="font-semibold text-base mb-4 pb-3 border-b border-stone-200">Review Summary</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <p><strong className="text-stone-600">Facility:</strong> <span className="text-stone-800">{selectedFacility?.name || '-'}</span></p>
              <p><strong className="text-stone-600">Scope:</strong> <span className="text-stone-800">{scope === 'biogenic' ? 'Biogenic' : `Scope ${scope.slice(-1)}`}</span></p>
              <p><strong className="text-stone-600">Category:</strong> <span className="text-stone-800">{category || '-'}</span></p>
              
              {/* Scope 3 specific info */}
              {(scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                <>
                  <p><strong className="text-stone-600">Method:</strong> <span className="text-stone-800">{
                    getMethodLabel(scope3Method)
                  }</span></p>
                  <p><strong className="text-stone-600">Activity:</strong> <span className="text-stone-800">{
                    useCustomActivity && scope3CustomActivity ? scope3CustomActivity :
                    filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '-'
                  }</span></p>
                  {requiresSubcategory && scope3Subcategory && (
                    <p><strong className="text-stone-600">Subcategory:</strong> <span className="text-stone-800">{
                      scope3Subcategory === 'stationary_combustion' ? 'Stationary Combustion' :
                      scope3Subcategory === 'mobile_combustion' ? 'Mobile Combustion' :
                      scope3Subcategory === 'electricity' ? 'Electricity' :
                      scope3Subcategory === 'fugitive_emissions' ? 'Fugitive Emissions' :
                      scope3Subcategory
                    }</span></p>
                  )}
                  {/* Show Fuel Used for subcategory categories */}
                  {requiresSubcategory && (scope3Subcategory === 'stationary_combustion' || scope3Subcategory === 'mobile_combustion') && (
                    <p><strong className="text-stone-600">Fuel Used:</strong> <span className="text-stone-800">{
                      filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '-'
                    }</span></p>
                  )}
                </>
              ) : (
                <p><strong className="text-stone-600">Fuel:</strong> <span className="text-stone-800">{useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '-'}</span></p>
              )}
              
              <p><strong className="text-stone-600">Year:</strong> <span className="text-stone-800">{reportingYear}</span></p>
              <p><strong className="text-stone-600">{frequencyType === 'yearly' ? 'Annual data:' : 'Months with data:'}</strong> <span className="text-stone-800">{frequencyType === 'yearly' ? (filledMonthsCount > 0 ? 'Complete' : 'Incomplete') : filledMonthsCount}</span></p>
              <p><strong className="text-stone-600">Person Responsible:</strong> <span className="text-stone-800">{responsiblePerson || '-'}</span></p>
              {responsiblePersonDesignation && <p><strong className="text-stone-600">Designation:</strong> <span className="text-stone-800">{responsiblePersonDesignation}</span></p>}
              {responsiblePersonContact && <p><strong className="text-stone-600">Contact:</strong> <span className="text-stone-800">{responsiblePersonContact}</span></p>}
              <p className="col-span-2"><strong className="text-stone-600">Processes:</strong> <span className="text-stone-800">{processNames.filter(p => p.name && p.name.trim()).map(p => p.name).join(', ') || '-'}</span></p>
            </div>
          </div>
        </div>
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
