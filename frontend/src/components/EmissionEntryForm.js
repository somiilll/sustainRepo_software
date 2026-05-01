import React, { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Plus, Trash2, Upload, X, Check, ChevronRight, ChevronLeft, Info, Eye, Download, FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// DEBUG: Log when this module loads
console.log('[DEBUG] EmissionEntryForm.js MODULE LOADED - checking if file is updated');

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
  editingEmission = null
}) {
  // Form step state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

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
  const [loadingScope3EF, setLoadingScope3EF] = useState(false);

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

  // Fetch form config when scope + category changes
  useEffect(() => {
    const fetchFormConfig = async () => {
      // Find category ID from dynamicCategories
      const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === scope);
      if (!categoryObj?.id) {
        setFormConfig(null);
        return;
      }
      
      setLoadingFormConfig(true);
      try {
        const response = await axios.get(
          `${API}/calc-engine/form-config/${categoryObj.id}`,
          {
            params: { scope: scope },
            headers: getAuthHeader()
          }
        );
        setFormConfig(response.data);
        setCalcEngineResult(null);
        
        console.log('[FormConfig] Loaded for', category, ':', response.data);
      } catch (error) {
        console.error('[FormConfig] Error:', error);
        setFormConfig(null);
      } finally {
        setLoadingFormConfig(false);
      }
    };
    
    // Check if it's a process emission (inline check to avoid initialization order issues)
    const isProcess = category === 'Process Emissions';
    
    if (scope && category && !isProcess && !useCustomFuel) {
      fetchFormConfig();
    } else {
      setFormConfig(null);
    }
  }, [scope, category, dynamicCategories, getAuthHeader, useCustomFuel]);

  // Fetch Scope 3 EF data when scope is scope3
  useEffect(() => {
    console.log('[DEBUG EmissionEntryForm] Scope3 EF useEffect triggered, scope:', scope);
    
    const fetchScope3EF = async () => {
      if (scope !== 'scope3') {
        console.log('[DEBUG EmissionEntryForm] Not scope3, skipping fetch');
        setScope3EFData([]);
        return;
      }
      
      console.log('[DEBUG EmissionEntryForm] Fetching scope3 EF data...');
      setLoadingScope3EF(true);
      try {
        const response = await axios.get(`${API}/scope3-ef`, {
          headers: getAuthHeader()
        });
        console.log('[DEBUG EmissionEntryForm] scope3EFData count:', response.data?.length);
        console.log('[DEBUG EmissionEntryForm] First item:', response.data?.[0]);
        console.log('[DEBUG EmissionEntryForm] Natural gas entry:', response.data?.find(e => e.activity === 'Natural gas'));
        setScope3EFData(response.data || []);
      } catch (error) {
        console.error('[Scope3 EF] Error fetching:', error);
        setScope3EFData([]);
      } finally {
        setLoadingScope3EF(false);
      }
    };
    
    fetchScope3EF();
  }, [scope, getAuthHeader]);

  // Filter Scope 3 activities based on category, method, industry sector, and year
  // Note: selectedFacility is defined below after fuelDatabase useMemo
  const filteredScope3Activities = useMemo(() => {
    if (scope !== 'scope3' || !scope3EFData.length) return [];
    
    // Get facility for sector filtering
    const facility = facilities.find(f => f.id === facilityId);
    
    let filtered = [...scope3EFData];
    
    // Filter by category
    if (category) {
      filtered = filtered.filter(ef => 
        ef.category?.toLowerCase() === category.toLowerCase()
      );
    }
    
    // Filter by method - for supplier_based, show ALL activities for the category
    // For spend_basis/activity_basis, filter by specific method
    if (scope3Method && scope3Method !== 'supplier_based') {
      filtered = filtered.filter(ef => ef.method === scope3Method);
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
  }, [scope, scope3EFData, category, scope3Method, facilities, facilityId]);

  // Get available methods for selected category from Scope 3 EF
  // Always include supplier_based as an option
  const availableScope3Methods = useMemo(() => {
    if (scope !== 'scope3' || !scope3EFData.length || !category) return [];
    
    const methods = new Set();
    
    // Add methods from EF data
    scope3EFData.forEach(ef => {
      if (ef.category?.toLowerCase() === category.toLowerCase() && ef.method) {
        methods.add(ef.method);
      }
    });
    
    // Always add supplier_based if there's any data for this category
    if (methods.size > 0) {
      methods.add('supplier_based');
    }
    
    // Return in preferred order: spend_basis, activity_basis, supplier_based
    const orderedMethods = [];
    if (methods.has('spend_basis')) orderedMethods.push('spend_basis');
    if (methods.has('activity_basis')) orderedMethods.push('activity_basis');
    if (methods.has('supplier_based')) orderedMethods.push('supplier_based');
    
    // Add any other methods that might exist
    methods.forEach(m => {
      if (!orderedMethods.includes(m)) orderedMethods.push(m);
    });
    
    return orderedMethods;
  }, [scope, scope3EFData, category]);

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
  const [monthlyData, setMonthlyData] = useState({});
  const [expandedMonths, setExpandedMonths] = useState([]);

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
    const cats = new Set();

    // Primary source: SuperAdmin dynamic categories
    (dynamicCategories || [])
      .filter(c => c.scope_code === scope && c.is_active !== false)
      .forEach(c => cats.add(c.name));

    // Fallback/union: categories already present in the fuel database
    const filtered = fuelDatabase.filter(f => f.scope === scope);
    filtered.forEach(f => {
      if (f.categories?.length > 0) {
        f.categories.forEach(c => cats.add(c));
      } else if (f.category) {
        cats.add(f.category);
      }
    });

    const result = Array.from(cats).sort();
    // Add "Process Emissions" category for Scope 1 if there are process templates
    if (scope === 'scope1' && processTemplates.length > 0 && !result.includes('Process Emissions')) {
      result.push('Process Emissions');
    }
    return result;
  }, [fuelDatabase, scope, processTemplates, dynamicCategories]);

  // Check if Process Emissions category is selected
  const isProcessEmissions = category === 'Process Emissions';

  // ============================================================================
  // Dynamic Form Config - Get input fields from ce_input_field_mappings
  // These are the ACTUAL fields to show, with proper labels
  // ============================================================================
  const dynamicInputFields = useMemo(() => {
    if (!formConfig?.input_field_mappings?.length) return [];
    
    // Get the category ID for filtering
    const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === scope);
    const categoryId = categoryObj?.id;
    const scopeObj = dynamicScopes.find(s => s.code === scope);
    const scopeId = scopeObj?.id;
    
    // Filter input field mappings that apply to this category and scope
    const applicableMappings = formConfig.input_field_mappings.filter(m => {
      const appliesToCategory = !m.applies_to_categories?.length || 
                                m.applies_to_categories.includes(categoryId);
      const appliesToScope = !m.applies_to_scopes?.length || 
                             m.applies_to_scopes.includes(scopeId);
      return appliesToCategory && appliesToScope && m.is_active !== false;
    });
    
    // Sort by display_order
    applicableMappings.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    // Map to field objects for rendering
    return applicableMappings.map(m => ({
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
  }, [formConfig, dynamicCategories, category, scope, dynamicScopes]);

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
            if (field.unitSource === 'fuel') {
              fieldUnits = selectedFuel?.allowed_units || [];
            } else if (field.unitSource === 'all_units') {
              // For all_units, use all centralized units (simple + compound)
              fieldUnits = centralizedUnits.map(u => u.symbol);
            } else if (field.unitSource === 'scope3_ef') {
              // For scope3_ef, get allowed_units from the matched EF entry
              if (scope3ActivityId) {
                const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                fieldUnits = matchedEF?.allowed_units?.length > 0 
                  ? matchedEF.allowed_units 
                  : (field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean));
              } else {
                // No activity selected yet, use fallback
                fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
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
  }, [dynamicInputFields, selectedFuel, activeMonths, centralizedUnits, scope3ActivityId, filteredScope3Activities]);

  // When scope3ActivityId changes, update the units for scope3_ef fields based on the new activity's allowed_units
  useEffect(() => {
    if (!scope3ActivityId || dynamicInputFields.length === 0 || activeMonths.length === 0) return;
    
    const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
    if (!matchedEF?.allowed_units?.length) return;
    
    setMonthlyData(prev => {
      const updated = { ...prev };
      
      activeMonths.forEach(monthKey => {
        const monthData = { ...(updated[monthKey] || {}) };
        let needsUpdate = false;
        
        dynamicInputFields.forEach(field => {
          if (field.unitSource === 'scope3_ef') {
            const unitKey = `${field.variable}_unit`;
            const currentUnit = monthData[unitKey];
            // Update if unit not set OR if current unit is not in the new allowed_units
            if (!currentUnit || !matchedEF.allowed_units.includes(currentUnit)) {
              monthData[unitKey] = matchedEF.allowed_units[0];
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
    
    // For Scope 3, add calculation_method_scope3 from the selected method
    if (scope === 'scope3' && scope3Method) {
      decisionInputs['calculation_method_scope3'] = scope3Method;
    }
    
    return decisionInputs;
  }, [dynamicInputFields, scope, scope3Method]);

  // Execute calculation via backend calc engine
  const executeCalcEngine = useCallback(async (monthKey, monthData) => {
    if (!formConfig) return null;
    
    // For Scope 3, we need method and activity instead of fuel
    if (scope === 'scope3') {
      if (!scope3Method || !scope3ActivityId) return null;
    } else {
      if (!selectedFuel || !fuelId) return null;
    }
    
    const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === scope);
    if (!categoryObj?.id) return null;
    
    setIsCalcEngineCalculating(true);
    try {
      // Build inputs from month data using the field mappings
      const inputs = {};
      dynamicInputFields.forEach(field => {
        const value = monthData[field.variable] || monthData[field.fieldKey];
        if (value !== undefined && value !== null && value !== '') {
          // Determine unit
          let unit = field.expectedUnit;
          if (field.unitSource === 'fuel' && selectedFuel?.allowed_units?.length) {
            unit = monthData[`${field.variable}_unit`] || monthData.unit || selectedFuel.allowed_units[0];
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
      // DEBUG: Log scope3 data
      console.log('[DEBUG EmissionEntryForm] scope3ActivityId:', scope3ActivityId);
      console.log('[DEBUG EmissionEntryForm] filteredScope3Activities:', filteredScope3Activities);
      const matchedEFEntry = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      console.log('[DEBUG EmissionEntryForm] matchedEFEntry:', matchedEFEntry);
      console.log('[DEBUG EmissionEntryForm] matchedEFEntry?.default_unit:', matchedEFEntry?.default_unit);
      
      const context = {
        fuel_name: selectedFuel?.fuel_name || '',
        fuel_id: fuelId || '',
        scope: scope,
        category: category,
        facility_id: facilityId,
        // Scope 3 specific context
        ...(scope === 'scope3' && {
          calculation_method_scope3: scope3Method,
          scope3_ef_id: scope3ActivityId,
          activity: matchedEFEntry?.activity,
          // Pass default_unit for auto-conversion (falls back to formula's expected_unit if not set)
          scope3_ef_default_unit: matchedEFEntry?.default_unit || '',
        }),
      };
      console.log('[DEBUG EmissionEntryForm] Final context:', context);
      
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
      
      console.log('[CalcEngine] Executing with:', {
        category_id: categoryObj.id,
        decision_inputs: decisionInputs,
        inputs,
        context,
        user_overrides: userOverrides
      });
      
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
      console.error('[CalcEngine] Error:', error);
      return null;
    } finally {
      setIsCalcEngineCalculating(false);
    }
  }, [formConfig, selectedFuel, fuelId, dynamicCategories, category, scope, facilityId, dynamicInputFields, buildDecisionInputs, getAuthHeader, scope3Method, scope3ActivityId, filteredScope3Activities]);

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

  // Get allowed units for selected fuel - STRICTLY use fuel's allowed_units only
  const allowedUnits = useMemo(() => {
    // ONLY show units from the selected fuel's allowed_units - NO FALLBACKS
    if (selectedFuel?.allowed_units?.length > 0) {
      // Filter out 'm3' - use 'm³' instead (proper superscript notation)
      return selectedFuel.allowed_units.filter(unit => unit !== 'm3');
    }
    // Return empty array if no fuel selected - user must select fuel first
    return [];
  }, [selectedFuel]);

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
    
    // For regular emissions, check quantity
    if (!data.quantity || parseFloat(data.quantity) <= 0) return 'empty';
    return 'filled';
  };

  // Count filled months
  const filledMonthsCount = useMemo(() => {
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
  }, [monthlyData, isProcessEmissions, selectedTemplate, dynamicInputFields]);

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
          if (!scope3ActivityId) return { valid: false, message: 'Please select an activity type' };
          return { valid: true };
        }
        
        // Regular fuel emissions validation (Scope 1, 2, Biogenic)
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
        if (filledMonthsCount === 0) return { valid: false, message: 'Please enter data for at least one month' };
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
            fieldUnits = selectedFuel?.allowed_units || [];
            unit = data[`${field.variable}_unit`] || data.unit || fieldUnits[0] || field.expectedUnit;
          } else if (field.unitSource === 'all_units') {
            // All centralized units (simple + compound)
            fieldUnits = centralizedUnits.map(u => u.symbol);
            unit = data[`${field.variable}_unit`] || fieldUnits[0] || field.expectedUnit || '';
          } else if (field.unitSource === 'scope3_ef') {
            // Get allowed_units from the matched Scope 3 EF entry
            const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            fieldUnits = matchedEF?.allowed_units?.length > 0 
              ? matchedEF.allowed_units 
              : (field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean));
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
        console.log('[DEBUG handleSubmit] matchedEFForContext:', matchedEFForContext);
        console.log('[DEBUG handleSubmit] matchedEFForContext?.default_unit:', matchedEFForContext?.default_unit);
        
        const context = {
          fuel_name: selectedFuel?.fuel_name,
          fuel_id: fuelId,
          scope: scope,
          category: category,
          facility_id: facilityId,
          // Scope 3 specific context
          ...(scope === 'scope3' && {
            calculation_method_scope3: scope3Method,
            scope3_ef_id: scope3ActivityId,
            activity: matchedEFForContext?.activity,
            // Pass default_unit for auto-conversion (falls back to formula's expected_unit if not set)
            scope3_ef_default_unit: matchedEFForContext?.default_unit || '',
          }),
        };
        console.log('[DEBUG handleSubmit] Final context:', context);
        
        // ============================================================================
        // CALL BACKEND CALC ENGINE
        // The backend will traverse decision tree and apply correct formula
        // ============================================================================
        const categoryObj = dynamicCategories.find(c => c.name === category && c.scope_code === scope);
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
            console.error('[CalcEngine] Calculation failed:', calcErr);
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
            fieldUnits = selectedFuel?.allowed_units || [];
          } else if (field.unitSource === 'all_units') {
            // For all_units, use all centralized units (simple + compound)
            fieldUnits = centralizedUnits.map(u => u.symbol);
          } else if (field.unitSource === 'scope3_ef') {
            // For scope3_ef, units come from the matched EF entry's allowed_units
            const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            fieldUnits = matchedEF?.allowed_units?.length > 0 
              ? matchedEF.allowed_units 
              : (field.allowedUnits.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean));
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
          scope: scope,
          category: category,
          sub_category: scope === 'scope3' 
            ? (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '')
            : (useCustomFuel ? customFuelName : selectedFuel?.fuel_name || ''),
          fuel_type: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          fuel_database_id: scope === 'scope3' ? null : (useCustomFuel ? null : fuelId),
          
          // Scope 3 specific fields
          ...(scope === 'scope3' && {
            calculation_method_scope3: scope3Method,
            scope3_ef_id: scope3ActivityId,
            scope3_activity: filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '',
          }),
          
          // New dynamic structure
          dynamic_field_values: {
            ...dynamicFieldValues,
            // Also store Scope 3 fields in dynamic_field_values as proper dict structure
            ...(scope === 'scope3' && {
              calculation_method_scope3: { value: scope3Method, unit: '' },
              scope3_ef_id: { value: scope3ActivityId, unit: '' },
              scope3_activity: { value: filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || '', unit: '' },
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
        };

        try {
          await axios.post(`${API}/emissions`, payload, {
            headers: getAuthHeader()
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to save emission for ${reportingPeriod}:`, err);
          errors.push(`${MONTHS.find(m => m.key === monthKey)?.name}: ${err.response?.data?.detail || 'Failed'}`);
        }
      }

      if (successCount > 0) {
        toast.success(`Created ${successCount} emission record(s) successfully`);
      }
      if (errors.length > 0) {
        toast.error(`Failed to save: ${errors.join(', ')}`);
      }
      if (successCount > 0) {
        onSuccess?.();
      }
    } catch (error) {
      console.error('Failed to save emissions:', error);
      toast.error(error.response?.data?.detail || 'Failed to save emissions');
    } finally {
      setIsSaving(false); // Re-enable button after completion
    }
  };

  // Step indicators
  const steps = [
    { num: 1, title: 'Selection', desc: 'Facility, Scope, Category, Fuel' },
    { num: 2, title: 'Process', desc: 'Process names & Person responsible' },
    { num: 3, title: 'Monthly Data', desc: 'Year & monthly quantities' },
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
                          setScope3ActivityId('');
                          if (s.code === 'scope2') setUseCustomFuel(false);
                        }}
                        className="text-primary"
                        data-testid={`entry-scope-${s.code}`}
                      />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setFuelId('');
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

          {/* Scope 3: Method and Activity Type Selection */}
          {category && !isProcessEmissions && scope === 'scope3' && (
            <div className="space-y-4 mt-4 pb-6 border-b border-stone-200">
              {/* Method Selection (spend_basis or activity_basis) */}
              <div className="space-y-2">
                <Label>Calculation Method *</Label>
                <select
                  value={scope3Method}
                  onChange={(e) => {
                    setScope3Method(e.target.value);
                    setScope3ActivityId(''); // Reset activity when method changes
                  }}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="scope3-method-select"
                >
                  <option value="">Select Method</option>
                  {availableScope3Methods.map(method => (
                    <option key={method} value={method}>
                      {method === 'spend_basis' ? 'Spend Based' : 
                       method === 'activity_basis' ? 'Activity Based' : 
                       method === 'supplier_based' ? 'Supplier Based' : method}
                    </option>
                  ))}
                </select>
                {availableScope3Methods.length === 0 && category && (
                  <p className="text-xs text-amber-600">No methods available for this category in Scope 3 EF table</p>
                )}
              </div>

              {/* Activity Type Selection (from Scope 3 EF) */}
              {scope3Method && (
                <div className="space-y-2">
                  <Label>Activity Type *</Label>
                  {/* Activity search input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <Input
                      type="text"
                      value={fuelSearchTerm}
                      onChange={(e) => setFuelSearchTerm(e.target.value)}
                      placeholder="Search activity types..."
                      className="pl-9 bg-stone-50 h-10"
                      data-testid="activity-search-input"
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
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    data-testid="scope3-activity-select"
                  >
                    <option value="">Select Activity Type ({filteredScope3Activities.filter(a => 
                      !fuelSearchTerm || a.activity?.toLowerCase().includes(fuelSearchTerm.toLowerCase())
                    ).length} available)</option>
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
                      No activities found for this category, method, and facility sector combination
                    </p>
                  )}
                  {loadingScope3EF && (
                    <p className="text-xs text-blue-600">Loading activities...</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Fuel Type - Only show for non-Scope 3 and non-process emissions */}
          {category && !isProcessEmissions && scope !== 'scope3' && (
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

          {/* Monthly Data Entry */}
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
                          <div className="space-y-4">
                            {/* Render each field from input_field_mappings */}
                            {dynamicInputFields.map(field => {
                              const isQtyField = field.variable === 'qty' || field.variable === 'qty_energy';
                              
                              // Determine field units based on unit_source
                              let fieldUnits = [];
                              if (field.unitSource === 'fuel') {
                                fieldUnits = selectedFuel?.allowed_units || [];
                              } else if (field.unitSource === 'all_units') {
                                // Show all units from centralized units list
                                fieldUnits = centralizedUnits.map(u => u.symbol);
                              } else if (field.unitSource === 'scope3_ef') {
                                // For scope3_ef, units come from the matched EF entry's allowed_units
                                const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                                fieldUnits = matchedEF?.allowed_units?.length > 0 
                                  ? matchedEF.allowed_units 
                                  : (field.allowedUnits.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean));
                              } else {
                                // static - use allowed_units from mapping
                                fieldUnits = field.allowedUnits.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
                              }
                              
                              // Skip rendering if this field is an override but not enabled
                              // (for override fields, we show them with a checkbox)
                              
                              return (
                                <div key={field.id || field.variable} className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="font-medium">
                                      {field.label}
                                      {field.required && <span className="text-red-500 ml-1">*</span>}
                                      {!isQtyField && field.fieldType !== 'select' && field.expectedUnit && (
                                        <span className="text-muted-foreground ml-1 text-xs font-normal">({field.expectedUnit})</span>
                                      )}
                                    </Label>
                                    
                                    {field.isOverride && (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          id={`override-${field.variable}-${monthKey}`}
                                          checked={data[`override_${field.variable}`] || false}
                                          onChange={(e) => {
                                            updateMonthData(monthKey, `override_${field.variable}`, e.target.checked);
                                            // When override is enabled, ensure unit is initialized
                                            if (e.target.checked && !data[`${field.variable}_unit`]) {
                                              let overrideUnits = [];
                                              if (field.unitSource === 'fuel') {
                                                overrideUnits = selectedFuel?.allowed_units || [];
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
                                    /* SELECT / DROPDOWN field */
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
                                    /* NUMBER / TEXT input field */
                                    (() => {
                                      // Show unit selector for ANY field that has allowed_units defined
                                      // This matches Sandbox behavior where all fields with units get dropdowns
                                      const showUnitSelector = fieldUnits.length > 0;
                                      
                                      return (
                                        <div className={showUnitSelector ? "grid grid-cols-3 gap-2" : ""}>
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
                                            className={`bg-stone-50 ${showUnitSelector ? 'col-span-2' : ''} ${field.isOverride && !data[`override_${field.variable}`] ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            data-testid={`input-${field.fieldKey}-${monthKey}`}
                                          />
                                          
                                          {/* Unit selector for quantity fields AND override fields with units */}
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
                                        </div>
                                      );
                                    })()
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
                            })}
                            
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
        </div>
      )}

      {/* Step 4: Notes */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any additional notes or comments..."
              className="w-full h-32 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 resize-none"
            />
          </div>

          {/* Summary */}
          <div className="p-4 bg-stone-50 rounded-lg border border-stone-200">
            <h4 className="font-medium mb-3">Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p><strong>Facility:</strong> {selectedFacility?.name || '-'}</p>
              <p><strong>Scope:</strong> {scope === 'biogenic' ? 'Biogenic' : `Scope ${scope.slice(-1)}`}</p>
              <p><strong>Category:</strong> {category || '-'}</p>
              <p><strong>Fuel:</strong> {useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '-'}</p>
              <p><strong>Year:</strong> {reportingYear}</p>
              <p><strong>Months with data:</strong> {filledMonthsCount}</p>
              <p><strong>Person Responsible:</strong> {responsiblePerson || '-'}</p>
              {responsiblePersonDesignation && <p><strong>Designation:</strong> {responsiblePersonDesignation}</p>}
              {responsiblePersonContact && <p><strong>Contact:</strong> {responsiblePersonContact}</p>}
              <p><strong>Processes:</strong> {processNames.filter(p => p.name && p.name.trim()).map(p => p.name).join(', ') || '-'}</p>
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
                Save Emissions ({filledMonthsCount} months)
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
