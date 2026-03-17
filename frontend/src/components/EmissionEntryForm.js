import React, { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Plus, Trash2, Upload, X, Check, ChevronRight, ChevronLeft, Info, Eye, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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

  // Process Emissions state
  const [selectedSubIndustry, setSelectedSubIndustry] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateInputValues, setTemplateInputValues] = useState({});

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

  // Get categories for selected scope
  const categoriesForScope = useMemo(() => {
    const filtered = fuelDatabase.filter(f => f.scope === scope);
    const cats = new Set();
    filtered.forEach(f => {
      // Support both categories array and legacy category field
      if (f.categories?.length > 0) {
        f.categories.forEach(c => cats.add(c));
      } else if (f.category) {
        cats.add(f.category);
      }
    });
    const result = Array.from(cats).sort();
    // Add "Process Emissions" category for Scope 1 if there are process templates
    if (scope === 'scope1' && processTemplates.length > 0) {
      result.push('Process Emissions');
    }
    return result;
  }, [fuelDatabase, scope, processTemplates]);

  // Check if Process Emissions category is selected
  const isProcessEmissions = category === 'Process Emissions';

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

  // Get fuels for selected category and scope
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
    
    return filtered;
  }, [fuelDatabase, scope, category, selectedFacility]);

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
          // Get from selected fuel
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
    const inputMappings = formula.input_mappings || [];
    
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
        steps.push(`${comp.parameter_name} = ${value}`);
      } else {
        switch (comp.operation) {
          case 'multiply':
            result = result * value;
            steps.push(`× ${comp.parameter_name} (${value}) = ${result}`);
            break;
          case 'divide':
            result = value !== 0 ? result / value : result;
            steps.push(`÷ ${comp.parameter_name} (${value}) = ${result}`);
            break;
          case 'add':
            result = result + value;
            steps.push(`+ ${comp.parameter_name} (${value}) = ${result}`);
            break;
          case 'subtract':
            result = result - value;
            steps.push(`- ${comp.parameter_name} (${value}) = ${result}`);
            break;
          default:
            result = result * value;
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
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/upload/evidence`, formData, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data?.url) {
        const currentEvidences = monthlyData[monthKey]?.evidences || [];
        updateMonthData(monthKey, 'evidences', [...currentEvidences, {
          url: response.data.url,
          filename: file.name,
          uploaded_at: new Date().toISOString()
        }]);
        toast.success(`Evidence uploaded for ${MONTHS.find(m => m.key === monthKey)?.name}`);
      }
    } catch (error) {
      console.error('Evidence upload failed:', error);
      toast.error('Failed to upload evidence');
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
    // For regular emissions, check quantity
    return Object.values(monthlyData).filter(m => m?.quantity && parseFloat(m.quantity) > 0).length;
  }, [monthlyData, isProcessEmissions, selectedTemplate]);

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
        
        // Regular fuel emissions validation
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
        if (!isProcessEmissions) {
          for (const [monthKey, data] of Object.entries(monthlyData)) {
            if (data.quantity && data.useCustomEmissionFactor && !data.customEmissionFactorSource?.trim()) {
              const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
              return { valid: false, message: `Please enter source/justification for custom emission factor in ${monthName}` };
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
      // For regular emissions, filter months with quantity
      let monthsWithData;
      if (isProcessEmissions && selectedTemplate) {
        const inputFields = selectedTemplate.input_fields || [];
        monthsWithData = Object.entries(monthlyData).filter(([_, data]) => {
          return inputFields.some(field => data?.[field.key] && parseFloat(data[field.key]) > 0);
        });
      } else {
        monthsWithData = Object.entries(monthlyData).filter(([_, data]) => 
          data?.quantity && parseFloat(data.quantity) > 0
        );
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
        const rawQuantity = parseFloat(data.quantity);
        const unit = data.unit || defaultUnit;
        
        // Get fuel parameters (with potential overrides)
        const calorificValue = data.overrideCalorificValue 
          ? parseFloat(data.calorificValue) 
          : parseFloat(selectedFuel?.calorific_value) || 0;
        const density = data.overrideDensity 
          ? parseFloat(data.density) 
          : parseFloat(selectedFuel?.density) || 0;
        const emissionFactorCO2 = useCustomFuel 
          ? parseFloat(customEmissionFactor) 
          : (scope === 'scope2' && data.useCustomEmissionFactor)
            ? parseFloat(data.customEmissionFactor) || 0
            : parseFloat(selectedFuel?.emission_factor_co2) || 0;
        const emissionFactorCH4 = useCustomFuel ? 0 : parseFloat(selectedFuel?.emission_factor_ch4) || 0;
        const emissionFactorN2O = useCustomFuel ? 0 : parseFloat(selectedFuel?.emission_factor_n2o) || 0;
        
        // Get unit conversion factor from SuperAdmin-configured formula parameters
        const unitConversionFactor = scope === 'scope2' 
          ? getConversionFactor('electricity_quantity', unit)
          : getConversionFactor('quantity_fuel', unit);
        
        // Convert quantity using SuperAdmin-defined conversion factors
        const convertedQuantity = rawQuantity * unitConversionFactor;
        
        // Calculate emissions
        let calculatedCO2 = 0;
        let calculatedCH4 = 0;
        let calculatedN2O = 0;
        let calculatedCO2e = 0;
        
        // CUSTOM FUEL CALCULATION: Simple Quantity × Emission Factor
        // Custom fuels don't use the formula engine, just direct multiplication
        // Also applies to Scope 2 with "Use Custom Emission Factor" checkbox
        const isScope2CustomEF = scope === 'scope2' && data.useCustomEmissionFactor;
        
        if (useCustomFuel || isScope2CustomEF) {
          // For custom fuels or Scope 2 custom EF: CO2e = Quantity × Custom EF
          // Use the appropriate custom EF value
          const customEF = useCustomFuel 
            ? (parseFloat(customEmissionFactor) || 0)
            : (parseFloat(data.customEmissionFactor) || 0);
          
          // For Scope 2 with kWh, convert to MWh if needed
          let effectiveQuantity = rawQuantity;
          if (isScope2CustomEF && unit?.toLowerCase() === 'kwh') {
            effectiveQuantity = rawQuantity * 0.001; // kWh to MWh
          }
          
          calculatedCO2 = effectiveQuantity * customEF;
          calculatedCH4 = 0;
          calculatedN2O = 0;
          calculatedCO2e = calculatedCO2; // For custom EF, CO2e equals CO2 (simple case)
        } else {
          // STANDARD FUEL CALCULATION: Use SuperAdmin-configured formulas
          
          // Prepare parameters for formula execution
          const formulaParams = {
            quantity: convertedQuantity,
            quantity_fuel: convertedQuantity,
            raw_quantity: rawQuantity,
            unit: unit,
            emission_factor_co2: emissionFactorCO2,
            emission_factor_ch4: emissionFactorCH4,
            emission_factor_n2o: emissionFactorN2O,
            calorific_value: calorificValue,
            cv: calorificValue,
            ncv: calorificValue,
            density: density,
            ef: emissionFactorCO2,
            gwp_fugitives: selectedFuel?.gwp_fugitives ? parseFloat(selectedFuel.gwp_fugitives) : 0
          };
          
          // Use SuperAdmin-configured formulas
          // For Scope 2 (electricity), look for electricity formula
          const isScope2 = scope === 'scope2';
          const co2Formula = isScope2 
            ? findFormulaForScope(scope, category, 'electricity')
            : findFormulaForScope(scope, category, 'co2');
          const ch4Formula = isScope2 ? null : findFormulaForScope(scope, category, 'ch4');
          const n2oFormula = isScope2 ? null : findFormulaForScope(scope, category, 'n2o');
          
          if (co2Formula) {
            let params = formulaParams;
            
            // For Scope 2, ensure electricity parameters are available
            if (isScope2) {
              const efBasisQty = selectedFuel?.emission_factor_basis_quantity;
              params = {
                ...formulaParams,
                electricity_quantity: convertedQuantity,
                co2_electricity: efBasisQty ? parseFloat(efBasisQty) : 0,
                // Also add alternative parameter names
                quantity_of_electricity: convertedQuantity,
                emission_factor_of_electricity: efBasisQty ? parseFloat(efBasisQty) : 0
              };
            }
            
            const co2Result = executeFormula(co2Formula, selectedFuel, params);
            if (co2Result) calculatedCO2 = co2Result.result;
          }
          
          if (ch4Formula) {
            const ch4Result = executeFormula(ch4Formula, selectedFuel, formulaParams);
            if (ch4Result) calculatedCH4 = ch4Result.result;
          }
          
          if (n2oFormula) {
            const n2oResult = executeFormula(n2oFormula, selectedFuel, formulaParams);
            if (n2oResult) calculatedN2O = n2oResult.result;
          }
          
          // Calculate CO2e using GWP values from GWP Config (SuperAdmin configured)
          // Formula: CO2×GWP(CO2) + CH4×GWP(CH4) + N2O×GWP(N2O)
          // For Scope 1 & 2: Use GWP CH4 (Fossil)
          // For Biogenic: Use GWP CH4 (Non-fossil)
          
          if (!gwpConfig) {
            toast.error('GWP Configuration not found. Please contact SuperAdmin to configure GWP values.');
            return;
          }
          
          const gwpCo2 = gwpConfig.co2_gwp;
          const gwpCh4Fossil = gwpConfig.ch4_fossil_gwp;
          const gwpCh4NonFossil = gwpConfig.ch4_non_fossil_gwp;
          const gwpN2o = gwpConfig.n2o_gwp;
          
          // Validate all GWP values are configured
          if (gwpCo2 === undefined || gwpCh4Fossil === undefined || gwpCh4NonFossil === undefined || gwpN2o === undefined) {
            toast.error('Incomplete GWP Configuration. Please contact SuperAdmin to configure all GWP values.');
            return;
          }
          
          // Use fossil CH4 GWP for Scope 1 and Scope 2, non-fossil for Biogenic
          const isBiogenic = scope === 'biogenic';
          const gwpCh4 = isBiogenic ? gwpCh4NonFossil : gwpCh4Fossil;
          
          // Calculate CO2e using GWP values from GWP Config
          calculatedCO2e = (calculatedCO2 * gwpCo2) + (calculatedCH4 * gwpCh4) + (calculatedN2O * gwpN2o);
        }
        
        const payload = {
          facility_id: facilityId,
          reporting_period: reportingPeriod,
          scope: scope,
          category: category, // Always use the selected category, even for custom fuels
          sub_category: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          fuel_type: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          quantity: rawQuantity, // Store the original input value, not the converted one
          quantity_unit: useCustomFuel ? getQuantityUnitFromEFUnit(customEmissionFactorUnit) : unit,
          unit: useCustomFuel ? getQuantityUnitFromEFUnit(customEmissionFactorUnit) : unit, // Required by backend
          emission_factor: emissionFactorCO2,
          emission_factor_ch4: emissionFactorCH4 || null,
          emission_factor_n2o: emissionFactorN2O || null,
          emission_factor_unit: useCustomFuel ? customEmissionFactorUnit : null, // Store the EF unit for custom fuels
          calorific_value: calorificValue || null,
          calorific_value_unit: selectedFuel?.calorific_value_unit || 'MJ/kg',
          calorific_value_justification: data.overrideCalorificValue ? data.calorificValueJustification : null,
          density: density || null,
          density_unit: selectedFuel?.density_unit || '',
          density_justification: data.overrideDensity ? data.densityJustification : null,
          override_calorific_value: data.overrideCalorificValue || false,
          override_density: data.overrideDensity || false,
          is_custom_factor: useCustomFuel || (scope === 'scope2' && data.useCustomEmissionFactor),
          emission_factor_basis_quantity: scope === 'scope2' 
            ? (data.useCustomEmissionFactor ? parseFloat(data.customEmissionFactor) : parseFloat(selectedFuel?.emission_factor_basis_quantity))
            : null,
          emission_factor_basis_unit: scope === 'scope2' ? (selectedFuel?.emission_factor_basis_unit || 'tCO2/MWh') : null,
          source_of_information: useCustomFuel ? customSource : selectedFuel?.source || '',
          notes: notes,
          responsible_person: responsiblePerson,
          process_names: validProcesses.map(p => p.name),
          process_descriptions: validProcesses.map(p => ({ name: p.name, description: p.description || '' })),
          evidence_url: data.evidences?.map(e => e.url).join(',') || '',
          fuel_database_id: useCustomFuel ? null : fuelId,
          justification: useCustomFuel ? `Custom fuel type: ${customFuelName}` : null,
          // Pre-calculated values
          calculated_co2: calculatedCO2,
          calculated_ch4: calculatedCH4,
          calculated_n2o: calculatedN2O,
          calculated_co2e: calculatedCO2e,
          co2_unit: 'tCO2',
          ch4_unit: 'tCH4',
          n2o_unit: 'tN2O',
          co2e_unit: 'tCO2e'
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
              <div className="flex gap-4 h-10 items-center">
                {['scope1', 'scope2', 'biogenic'].map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value={s}
                      checked={scope === s}
                      onChange={() => {
                        setScope(s);
                        setCategory('');
                        setFuelId('');
                        if (s === 'scope2') setUseCustomFuel(false);
                      }}
                      className="text-primary"
                    />
                    <span className="text-sm">
                      {s === 'biogenic' ? 'Biogenic' : `Scope ${s.slice(-1)}`}
                    </span>
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

          {/* Fuel Type - Only show for non-process emissions */}
          {category && !isProcessEmissions && (
            <div className="space-y-3">
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
                <select
                  value={fuelId}
                  onChange={(e) => setFuelId(e.target.value)}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="emission-fuel-select"
                >
                  <option value="">Select Fuel Type</option>
                  {fuelsForCategory.map(fuel => (
                    <option key={fuel.id} value={fuel.id}>
                      {fuel.fuel_name}
                    </option>
                  ))}
                </select>
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
                        step="0.0001"
                        value={customEmissionFactor}
                        onChange={(e) => setCustomEmissionFactor(e.target.value)}
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
                        ) : (
                          /* Regular Emissions: Show Quantity and Unit */
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Quantity</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Enter quantity"
                                value={data.quantity || ''}
                                onChange={(e) => updateMonthData(monthKey, 'quantity', e.target.value)}
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
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleEvidenceUpload(monthKey, e.target.files[0]);
                                  e.target.value = '';
                                }
                              }}
                              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
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
                                          onClick={async (e) => {
                                            e.preventDefault();
                                            try {
                                              const response = await fetch(downloadUrl, {
                                                headers: getAuthHeader()
                                              });
                                              const blob = await response.blob();
                                              const url = window.URL.createObjectURL(blob);
                                              const a = document.createElement('a');
                                              a.href = url;
                                              a.download = evidence.filename || 'evidence';
                                              document.body.appendChild(a);
                                              a.click();
                                              window.URL.revokeObjectURL(url);
                                              a.remove();
                                            } catch (err) {
                                              toast.error('Failed to download file');
                                            }
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

                        {/* Override Options - Scope 1 (not for Fugitive Emissions) */}
                        {scope === 'scope1' && !useCustomFuel && selectedFuel && !category?.toLowerCase()?.includes('fugitive') && (
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
                                  step="0.001"
                                  placeholder="Enter Calorific Value"
                                  value={data.calorificValue || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'calorificValue', e.target.value)}
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

                            {/* Only show Density option if volume unit is selected (density needed for volume-to-mass conversion) */}
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
                                      step="0.001"
                                      placeholder="Enter Density Value"
                                      value={data.density || ''}
                                      onChange={(e) => updateMonthData(monthKey, 'density', e.target.value)}
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
                          </div>
                        )}

                        {/* Override Options - Scope 2 */}
                        {scope === 'scope2' && !useCustomFuel && (
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
                                      step="0.0001"
                                      placeholder="e.g., 0.5"
                                      value={data.customEmissionFactor || ''}
                                      onChange={(e) => updateMonthData(monthKey, 'customEmissionFactor', e.target.value)}
                                      className="bg-white"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs text-blue-700">Source / Justification *</label>
                                    <Input
                                      placeholder="Source / Justification (required)"
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
