import React, { useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Plus, Trash2, Upload, X, Check, ChevronRight, ChevronLeft, Info, Eye, Download, FileText } from 'lucide-react';
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

// Helper to check if unit is volume-based (from centralized units)
const isVolumeUnit = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => u.symbol?.toLowerCase() === unit?.toLowerCase());
  return unitDef?.unit_type === 'volume';
};

export default function EmissionEntryForm({
  facilities,
  fuelDatabase,
  centralizedUnits,
  formulaDefinitions = [],
  formulaParameters = [],
  emissionConfigurations = [],
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
  const [customSource, setCustomSource] = useState('');

  // Step 2: Process & Responsibility
  const [processNames, setProcessNames] = useState(['']);
  const [responsiblePerson, setResponsiblePerson] = useState('');

  // Step 3: Year & Monthly Data
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear().toString());
  const [monthlyData, setMonthlyData] = useState({});
  const [expandedMonths, setExpandedMonths] = useState([]);

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
    const cats = [...new Set(filtered.map(f => f.category))];
    return cats.sort();
  }, [fuelDatabase, scope]);

  // Get fuels for selected category and scope
  const fuelsForCategory = useMemo(() => {
    let filtered = fuelDatabase.filter(f => f.scope === scope && f.category === category);
    
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
      return selectedFuel.allowed_units;
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
      if (gasType === 'co2' && keyLower.includes('co2') && !keyLower.includes('co2e')) return formula;
      if (gasType === 'ch4' && keyLower.includes('ch4')) return formula;
      if (gasType === 'n2o' && keyLower.includes('n2o')) return formula;
      if (gasType === 'co2e' && keyLower.includes('co2e')) return formula;
      if (gasType === 'electricity' && (keyLower.includes('elec') || keyLower.includes('scope2'))) return formula;
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
    setProcessNames([...processNames, '']);
  };

  const removeProcessName = (index) => {
    if (processNames.length > 1) {
      setProcessNames(processNames.filter((_, i) => i !== index));
    }
  };

  const updateProcessName = (index, value) => {
    const updated = [...processNames];
    updated[index] = value;
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
    if (!data || !data.quantity || parseFloat(data.quantity) <= 0) return 'empty';
    return 'filled';
  };

  // Count filled months
  const filledMonthsCount = useMemo(() => {
    return Object.values(monthlyData).filter(m => m?.quantity && parseFloat(m.quantity) > 0).length;
  }, [monthlyData]);

  // Validation for each step
  const canProceedToStep = (step) => {
    switch (step) {
      case 2:
        if (!facilityId) return { valid: false, message: 'Please select a facility' };
        if (!scope) return { valid: false, message: 'Please select a scope' };
        if (!category) return { valid: false, message: 'Please select a category' };
        if (!useCustomFuel && !fuelId) return { valid: false, message: 'Please select a fuel type' };
        if (useCustomFuel && !customFuelName) return { valid: false, message: 'Please enter custom fuel name' };
        if (useCustomFuel && !customEmissionFactor) return { valid: false, message: 'Please enter emission factor' };
        return { valid: true };
      case 3:
        const validProcesses = processNames.filter(p => p.trim() !== '');
        if (validProcesses.length === 0) return { valid: false, message: 'Please enter at least one process name' };
        if (!responsiblePerson.trim()) return { valid: false, message: 'Please enter person responsible' };
        return { valid: true };
      case 4:
        if (filledMonthsCount === 0) return { valid: false, message: 'Please enter data for at least one month' };
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
    const validation = canProceedToStep(5); // Final validation
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    try {
      const validProcesses = processNames.filter(p => p.trim() !== '');
      const monthsWithData = Object.entries(monthlyData).filter(([_, data]) => 
        data?.quantity && parseFloat(data.quantity) > 0
      );

      if (monthsWithData.length === 0) {
        toast.error('Please enter data for at least one month');
        return;
      }

      // Create emission record for each month with data
      let successCount = 0;
      const errors = [];
      
      for (const [monthKey, data] of monthsWithData) {
        const reportingPeriod = `${reportingYear}-${monthKey}`;
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
          : parseFloat(selectedFuel?.emission_factor_co2) || 0;
        const emissionFactorCH4 = useCustomFuel ? 0 : parseFloat(selectedFuel?.emission_factor_ch4) || 0;
        const emissionFactorN2O = useCustomFuel ? 0 : parseFloat(selectedFuel?.emission_factor_n2o) || 0;
        
        // Get unit conversion factor from SuperAdmin-configured formula parameters
        const unitConversionFactor = scope === 'scope2' 
          ? getConversionFactor('electricity_quantity', unit)
          : getConversionFactor('quantity_fuel', unit);
        
        // Convert quantity using SuperAdmin-defined conversion factors
        const convertedQuantity = rawQuantity * unitConversionFactor;
        
        // Calculate emissions using SuperAdmin-configured formulas
        let calculatedCO2 = 0;
        let calculatedCH4 = 0;
        let calculatedN2O = 0;
        
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
          ef: emissionFactorCO2
        };
        
        // Use SuperAdmin-configured formulas
        const co2Formula = findFormulaForScope(scope, category, 'co2');
        const ch4Formula = findFormulaForScope(scope, category, 'ch4');
        const n2oFormula = findFormulaForScope(scope, category, 'n2o');
        
        if (co2Formula) {
          const co2Result = executeFormula(co2Formula, selectedFuel, formulaParams);
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
        
        // Calculate CO2e using GWP values from formula parameters (SuperAdmin configured)
        const gwpCH4 = formulaParameters.find(p => p.parameter_key === 'gwp_ch4')?.default_value || 28;
        const gwpN2O = formulaParameters.find(p => p.parameter_key === 'gwp_n2o')?.default_value || 265;
        const calculatedCO2e = calculatedCO2 + (calculatedCH4 * gwpCH4) + (calculatedN2O * gwpN2O);
        
        const payload = {
          facility_id: facilityId,
          reporting_period: reportingPeriod,
          scope: scope,
          category: useCustomFuel ? 'Custom' : category,
          sub_category: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          fuel_type: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
          quantity: rawQuantity, // Store the original input value, not the converted one
          quantity_unit: unit,
          unit: unit, // Required by backend
          emission_factor: emissionFactorCO2,
          emission_factor_ch4: emissionFactorCH4 || null,
          emission_factor_n2o: emissionFactorN2O || null,
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
          process_names: validProcesses,
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

          {/* Fuel Type */}
          {category && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Fuel Type *</Label>
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Emission Factor (CO₂) *</Label>
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
                      <Label>Source *</Label>
                      <Input
                        value={customSource}
                        onChange={(e) => setCustomSource(e.target.value)}
                        placeholder="Source of information"
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
                  <p className="text-stone-600">
                    EF CO₂: {selectedFuel.emission_factor_co2} | 
                    CV: {selectedFuel.calorific_value} {selectedFuel.calorific_value_unit}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Process & Responsibility */}
      {currentStep === 2 && (
        <div className="space-y-4">
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
            {processNames.map((name, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => updateProcessName(idx, e.target.value)}
                  placeholder={`Process ${idx + 1}`}
                  className="bg-stone-50"
                />
                {processNames.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProcessName(idx)}
                    className="text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

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
        </div>
      )}

      {/* Step 3: Year & Monthly Data */}
      {currentStep === 3 && (
        <div className="space-y-4">
          {/* Year Selection */}
          <div className="space-y-2">
            <Label>Reporting Year *</Label>
            <select
              value={reportingYear}
              onChange={(e) => setReportingYear(e.target.value)}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            >
              {Array.from({ length: 10 }, (_, i) => {
                const year = new Date().getFullYear() - 5 + i;
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          </div>

          {/* Monthly Data Entry */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Monthly Data for {reportingYear}</Label>
              <span className="text-sm text-stone-500">
                {filledMonthsCount} / 12 months filled
              </span>
            </div>

            <Accordion type="multiple" value={expandedMonths} onValueChange={setExpandedMonths}>
              {MONTHS.map(month => {
                const monthKey = month.key;
                const status = getMonthStatus(monthKey);
                const data = monthlyData[monthKey] || {};

                return (
                  <AccordionItem key={monthKey} value={monthKey} className="border rounded-lg mb-2">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          <span className={`w-2 h-2 rounded-full ${
                            status === 'filled' ? 'bg-green-500' : 'bg-stone-300'
                          }`} />
                          <span className="font-medium">{month.name} {reportingYear}</span>
                        </div>
                        {status === 'filled' && (
                          <span className="text-sm text-green-600 flex items-center gap-1">
                            <Check className="w-4 h-4" />
                            {data.quantity} {data.unit || defaultUnit}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4">
                        {/* Quantity and Unit */}
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
                            <Label>Unit</Label>
                            <select
                              value={data.unit || defaultUnit}
                              onChange={(e) => updateMonthData(monthKey, 'unit', e.target.value)}
                              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                            >
                              {allowedUnits.map(unit => (
                                <option key={unit} value={unit}>{unit}</option>
                              ))}
                            </select>
                          </div>
                        </div>

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

                        {/* Override Options - Scope 1 */}
                        {scope === 'scope1' && !useCustomFuel && selectedFuel && (
                          <div className="space-y-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <p className="text-sm font-medium text-amber-800">Override Default Values (Optional)</p>

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`override-cv-${monthKey}`}
                                checked={data.overrideCalorificValue || false}
                                onChange={(e) => updateMonthData(monthKey, 'overrideCalorificValue', e.target.checked)}
                              />
                              <label htmlFor={`override-cv-${monthKey}`} className="text-sm">
                                Override Calorific Value (Default: {selectedFuel?.calorific_value} {selectedFuel?.calorific_value_unit})
                              </label>
                            </div>

                            {data.overrideCalorificValue && (
                              <div className="grid grid-cols-2 gap-2 ml-6">
                                <Input
                                  type="number"
                                  step="0.001"
                                  placeholder="New Calorific Value"
                                  value={data.calorificValue || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'calorificValue', e.target.value)}
                                  className="bg-white"
                                />
                                <Input
                                  placeholder="Justification *"
                                  value={data.calorificValueJustification || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'calorificValueJustification', e.target.value)}
                                  className="bg-white"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`override-density-${monthKey}`}
                                checked={data.overrideDensity || false}
                                onChange={(e) => updateMonthData(monthKey, 'overrideDensity', e.target.checked)}
                              />
                              <label htmlFor={`override-density-${monthKey}`} className="text-sm">
                                Override Density (Default: {selectedFuel?.density} {selectedFuel?.density_unit})
                              </label>
                            </div>

                            {data.overrideDensity && (
                              <div className="grid grid-cols-2 gap-2 ml-6">
                                <Input
                                  type="number"
                                  step="0.001"
                                  placeholder="New Density"
                                  value={data.density || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'density', e.target.value)}
                                  className="bg-white"
                                />
                                <Input
                                  placeholder="Justification *"
                                  value={data.densityJustification || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'densityJustification', e.target.value)}
                                  className="bg-white"
                                />
                              </div>
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
                            </div>

                            {data.useCustomEmissionFactor && (
                              <div className="grid grid-cols-2 gap-2 ml-6">
                                <Input
                                  type="number"
                                  step="0.0001"
                                  placeholder="Custom EF (e.g., 0.5)"
                                  value={data.customEmissionFactor || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'customEmissionFactor', e.target.value)}
                                  className="bg-white"
                                />
                                <Input
                                  placeholder="Source / Justification"
                                  value={data.customEmissionFactorSource || ''}
                                  onChange={(e) => updateMonthData(monthKey, 'customEmissionFactorSource', e.target.value)}
                                  className="bg-white"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
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
              <p><strong>Processes:</strong> {processNames.filter(p => p.trim()).join(', ') || '-'}</p>
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
          <Button type="button" onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
            <Check className="w-4 h-4 mr-1" />
            Save Emissions ({filledMonthsCount} months)
          </Button>
        )}
      </div>
    </div>
  );
}
