/**
 * DynamicEmissionForm Component
 * 
 * A fully dynamic emission entry form that:
 * 1. Fetches form configuration from backend based on scope + category
 * 2. Dynamically renders input fields based on formula requirements
 * 3. Shows only applicable fuels for the selected scope
 * 4. Handles decision tree traversal (if multiple formulas possible)
 * 5. Executes calculation via backend calc engine
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, Calculator, Info, Fuel, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function DynamicEmissionForm({
  scopes = [],
  categories = [],
  facilities = [],
  onSubmit,
  onCancel,
  initialData = null,
  mode = 'create' // 'create' or 'edit'
}) {
  const { getAuthHeader } = useAuth();
  
  // Form state
  const [selectedScope, setSelectedScope] = useState(initialData?.scope || '');
  const [selectedCategory, setSelectedCategory] = useState(initialData?.category_id || '');
  const [selectedFacility, setSelectedFacility] = useState(initialData?.facility_id || '');
  const [selectedFuel, setSelectedFuel] = useState(initialData?.fuel_id || '');
  
  // Dynamic form config from backend
  const [formConfig, setFormConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  // Decision tree inputs (for formulas with branches)
  const [decisionInputs, setDecisionInputs] = useState({});
  
  // Dynamic input values (keyed by variable name)
  const [inputValues, setInputValues] = useState({});
  const [overrideFlags, setOverrideFlags] = useState({});
  
  // Calculation state
  const [calculationResult, setCalculationResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState(null);
  
  // Filter categories by selected scope
  const filteredCategories = useMemo(() => {
    if (!selectedScope) return categories;
    return categories.filter(c => c.scope_code === selectedScope);
  }, [categories, selectedScope]);
  
  // Get fuels from form config, filtered by scope
  const applicableFuels = useMemo(() => {
    if (!formConfig?.applicable_fuels) return [];
    
    // Filter fuels by selected scope
    return formConfig.applicable_fuels.filter(f => {
      // If fuel has a scope field, match it
      if (f.scope && selectedScope) {
        return f.scope === selectedScope;
      }
      // If no scope restriction, include fuel
      return true;
    });
  }, [formConfig, selectedScope]);
  
  // Get selected fuel object
  const selectedFuelObj = useMemo(() => {
    return applicableFuels.find(f => f.id === selectedFuel);
  }, [applicableFuels, selectedFuel]);
  
  // Fetch form configuration when scope + category changes
  useEffect(() => {
    const fetchFormConfig = async () => {
      if (!selectedCategory) {
        setFormConfig(null);
        return;
      }
      
      setLoadingConfig(true);
      try {
        const response = await axios.get(
          `${API}/calc-engine/form-config/${selectedCategory}`,
          {
            params: { scope: selectedScope },
            headers: getAuthHeader()
          }
        );
        setFormConfig(response.data);
        
        // Initialize decision inputs with first option
        const newDecisionInputs = {};
        response.data.decision_fields?.forEach(field => {
          if (field.allowed_values?.length > 0) {
            newDecisionInputs[field.field_name] = field.allowed_values[0];
          }
        });
        setDecisionInputs(newDecisionInputs);
        
        // Reset input values when config changes
        setInputValues({});
        setOverrideFlags({});
        setCalculationResult(null);
        
      } catch (error) {
        console.error('Error fetching form config:', error);
        toast.error('Failed to load form configuration');
        setFormConfig(null);
      } finally {
        setLoadingConfig(false);
      }
    };
    
    fetchFormConfig();
  }, [selectedCategory, selectedScope, getAuthHeader]);
  
  // Pre-fill input values when fuel is selected
  useEffect(() => {
    if (!selectedFuelObj || !formConfig) return;
    
    // Auto-fill values from fuel data
    const newValues = { ...inputValues };
    
    // Map fuel properties to formula variables
    const fuelMappings = {
      calorific_value: selectedFuelObj.calorific_value,
      cv: selectedFuelObj.calorific_value,
      ncv: selectedFuelObj.calorific_value,
      density: selectedFuelObj.density,
      emission_factor_co2: selectedFuelObj.emission_factor_co2,
      ef_co2: selectedFuelObj.emission_factor_co2,
      emission_factor_ch4: selectedFuelObj.emission_factor_ch4,
      ef_ch4: selectedFuelObj.emission_factor_ch4,
      emission_factor_n2o: selectedFuelObj.emission_factor_n2o,
      ef_n2o: selectedFuelObj.emission_factor_n2o,
      gwp_fugitives: selectedFuelObj.gwp_fugitives,
      co2_gwp_fugitives: selectedFuelObj.gwp_fugitives,
    };
    
    // Only pre-fill values that are not overridden
    formConfig.required_input_variables?.forEach(varName => {
      if (!overrideFlags[varName] && fuelMappings[varName] !== undefined) {
        newValues[varName] = fuelMappings[varName];
      }
    });
    
    setInputValues(newValues);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFuelObj, formConfig]);
  
  // Determine which formula will be used based on decision inputs
  const activeFormula = useMemo(() => {
    if (!formConfig?.formulas?.length) return null;
    
    // If only one formula, use it
    if (formConfig.formulas.length === 1) {
      return formConfig.formulas[0];
    }
    
    // If decision tree, find matching formula based on decision inputs
    // For now, return first formula that matches the decision path
    // TODO: Implement proper tree traversal matching
    return formConfig.formulas[0];
  }, [formConfig, decisionInputs]);
  
  // Get the input fields that need to be rendered
  const requiredInputFields = useMemo(() => {
    if (!formConfig || !activeFormula) return [];
    
    const fields = [];
    const processedVars = new Set();
    
    // Get inputs from the active formula
    activeFormula.inputs?.forEach(input => {
      const varName = input.variable;
      if (processedVars.has(varName)) return;
      processedVars.add(varName);
      
      // Find the input field mapping for this variable
      const mapping = formConfig.input_field_mappings?.find(m => m.maps_to_variable === varName);
      
      // Find variable metadata
      const varMeta = formConfig.variables?.find(v => v.key === varName);
      
      fields.push({
        variable: varName,
        label: varMeta?.name || varName,
        expectedUnit: input.expected_unit || varMeta?.default_unit,
        required: input.required !== false,
        isOverride: mapping?.is_override || false,
        fieldType: mapping?.field_type || 'number',
        allowedUnits: mapping?.allowed_units || [],
        description: varMeta?.description || '',
        defaultValue: null, // Will be filled from fuel
      });
    });
    
    return fields;
  }, [formConfig, activeFormula]);
  
  // Execute calculation via backend
  const executeCalculation = useCallback(async () => {
    if (!selectedCategory || !selectedFuel) {
      toast.error('Please select a category and fuel');
      return;
    }
    
    setIsCalculating(true);
    setCalcError(null);
    
    try {
      // Build inputs object
      const inputs = {};
      requiredInputFields.forEach(field => {
        const value = inputValues[field.variable];
        if (value !== undefined && value !== null && value !== '') {
          // Determine unit from field or fuel
          let unit = field.expectedUnit;
          if (field.variable === 'qty' && selectedFuelObj?.allowed_units?.length) {
            unit = inputValues[`${field.variable}_unit`] || selectedFuelObj.allowed_units[0];
          }
          
          inputs[field.variable] = {
            value: parseFloat(value),
            unit: unit || 'kg'
          };
        }
      });
      
      // Build context
      const context = {
        fuel_name: selectedFuelObj?.fuel_name,
        fuel_id: selectedFuel,
        scope: selectedScope,
        category: selectedCategory,
        facility_id: selectedFacility,
      };
      
      // Build user overrides
      const userOverrides = {};
      requiredInputFields.forEach(field => {
        if (field.isOverride && overrideFlags[field.variable]) {
          const value = inputValues[field.variable];
          if (value !== undefined && value !== null) {
            userOverrides[field.variable] = {
              value: parseFloat(value),
              unit: field.expectedUnit || 'kg'
            };
          }
        }
      });
      
      const response = await axios.post(
        `${API}/calc-engine/execute-by-category`,
        {
          category_id: selectedCategory,
          decision_inputs: decisionInputs,
          inputs: inputs,
          context: context,
          user_overrides: userOverrides,
          dry_run: true
        },
        { headers: getAuthHeader() }
      );
      
      if (response.data.ok) {
        setCalculationResult(response.data);
        console.log('Calculation result:', response.data);
      } else {
        setCalcError('Calculation failed');
      }
    } catch (error) {
      console.error('Calculation error:', error);
      setCalcError(error.response?.data?.detail || 'Calculation failed');
    } finally {
      setIsCalculating(false);
    }
  }, [
    selectedCategory, selectedFuel, selectedScope, selectedFacility,
    requiredInputFields, inputValues, overrideFlags, decisionInputs,
    selectedFuelObj, getAuthHeader
  ]);
  
  // Handle input value change
  const handleInputChange = (varName, value) => {
    setInputValues(prev => ({ ...prev, [varName]: value }));
    setCalculationResult(null); // Reset calc when inputs change
  };
  
  // Handle override toggle
  const handleOverrideToggle = (varName, checked) => {
    setOverrideFlags(prev => ({ ...prev, [varName]: checked }));
    // If turning off override, restore fuel value
    if (!checked && selectedFuelObj) {
      const fuelValue = selectedFuelObj[varName] || selectedFuelObj[`emission_factor_${varName}`];
      if (fuelValue !== undefined) {
        setInputValues(prev => ({ ...prev, [varName]: fuelValue }));
      }
    }
  };
  
  // Handle decision input change
  const handleDecisionChange = (fieldName, value) => {
    setDecisionInputs(prev => ({ ...prev, [fieldName]: value }));
    setCalculationResult(null);
  };
  
  // Handle form submission
  const handleSubmit = () => {
    if (!calculationResult) {
      toast.error('Please calculate emissions first');
      return;
    }
    
    const emissionData = {
      scope: selectedScope,
      category: formConfig?.category?.name || selectedCategory,
      category_id: selectedCategory,
      facility_id: selectedFacility,
      fuel_id: selectedFuel,
      fuel_name: selectedFuelObj?.fuel_name,
      quantity: parseFloat(inputValues.qty || inputValues.qty_energy || 0),
      quantity_unit: inputValues.qty_unit || selectedFuelObj?.allowed_units?.[0] || 'kg',
      
      // Emission values from calculation
      co2_emissions: calculationResult.outputs?.co2?.value || 0,
      ch4_emissions: calculationResult.outputs?.ch4?.value || 0,
      n2o_emissions: calculationResult.outputs?.n2o?.value || 0,
      total_co2e: calculationResult.outputs?.co2e?.value || 0,
      
      // Metadata
      formula_used: calculationResult.resolved_formula?.name,
      decision_path: calculationResult.decision_path,
      calc_engine_audit: calculationResult.audit_log,
      
      // All input values (for audit)
      input_values: inputValues,
      user_overrides: overrideFlags,
    };
    
    onSubmit?.(emissionData);
  };
  
  return (
    <div className="space-y-6">
      {/* Step 1: Scope, Category, Facility Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Selection
          </CardTitle>
          <CardDescription>Select scope, category, and facility</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <Label>Scope</Label>
            <Select value={selectedScope} onValueChange={setSelectedScope}>
              <SelectTrigger data-testid="scope-select">
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                {scopes.map(s => (
                  <SelectItem key={s.id} value={s.code}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Category</Label>
            <Select 
              value={selectedCategory} 
              onValueChange={setSelectedCategory}
              disabled={!selectedScope}
            >
              <SelectTrigger data-testid="category-select">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Facility</Label>
            <Select value={selectedFacility} onValueChange={setSelectedFacility}>
              <SelectTrigger data-testid="facility-select">
                <SelectValue placeholder="Select facility" />
              </SelectTrigger>
              <SelectContent>
                {facilities.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Loading state */}
      {loadingConfig && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading form configuration...
        </div>
      )}
      
      {/* Step 2: Fuel Selection */}
      {formConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5" />
              Fuel Selection
            </CardTitle>
            <CardDescription>
              {applicableFuels.length} fuels available for {formConfig.category?.name || 'this category'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedFuel} onValueChange={setSelectedFuel}>
              <SelectTrigger data-testid="fuel-select">
                <SelectValue placeholder="Select a fuel" />
              </SelectTrigger>
              <SelectContent>
                {applicableFuels.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.fuel_name} ({f.allowed_units?.join(', ') || 'no units'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Show fuel details */}
            {selectedFuelObj && (
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Calorific Value:</span>
                  <span>{selectedFuelObj.calorific_value} {selectedFuelObj.calorific_value_unit}</span>
                  <span className="text-muted-foreground">Density:</span>
                  <span>{selectedFuelObj.density} {selectedFuelObj.density_unit}</span>
                  <span className="text-muted-foreground">CO2 EF:</span>
                  <span>{selectedFuelObj.emission_factor_co2} {selectedFuelObj.emission_factor_co2_unit}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Step 3: Decision Tree Questions (if any) */}
      {formConfig?.decision_fields?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Calculation Method
            </CardTitle>
            <CardDescription>Select the calculation approach</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {formConfig.decision_fields.map(field => (
              <div key={field.field_name}>
                <Label>{field.description || field.field_name}</Label>
                <Select 
                  value={decisionInputs[field.field_name] || ''} 
                  onValueChange={(v) => handleDecisionChange(field.field_name, v)}
                >
                  <SelectTrigger data-testid={`decision-${field.field_name}`}>
                    <SelectValue placeholder={`Select ${field.field_name}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.allowed_values.map(v => (
                      <SelectItem key={v} value={v}>
                        {v === 'true' ? 'Yes (Quantity-based)' : 
                         v === 'false' ? 'No (Heat-based)' : v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* Step 4: Dynamic Input Fields */}
      {formConfig && selectedFuel && requiredInputFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Input Values
            </CardTitle>
            <CardDescription>
              Formula: {activeFormula?.name || 'Auto-detected'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {requiredInputFields.map(field => (
              <div key={field.variable} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={field.variable}>
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                    {field.expectedUnit && (
                      <span className="text-muted-foreground ml-1">({field.expectedUnit})</span>
                    )}
                  </Label>
                  
                  {field.isOverride && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`override-${field.variable}`}
                        checked={overrideFlags[field.variable] || false}
                        onCheckedChange={(c) => handleOverrideToggle(field.variable, c)}
                      />
                      <Label htmlFor={`override-${field.variable}`} className="text-xs">
                        Override
                      </Label>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Input
                    id={field.variable}
                    type="number"
                    step="any"
                    value={inputValues[field.variable] || ''}
                    onChange={(e) => handleInputChange(field.variable, e.target.value)}
                    disabled={field.isOverride && !overrideFlags[field.variable]}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    data-testid={`input-${field.variable}`}
                    className={field.isOverride && !overrideFlags[field.variable] ? 'bg-muted' : ''}
                  />
                  
                  {/* Unit selector for quantity fields */}
                  {field.variable === 'qty' && selectedFuelObj?.allowed_units?.length > 0 && (
                    <Select 
                      value={inputValues.qty_unit || selectedFuelObj.allowed_units[0]}
                      onValueChange={(v) => handleInputChange('qty_unit', v)}
                    >
                      <SelectTrigger className="w-[100px]" data-testid="qty-unit-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedFuelObj.allowed_units.map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
              </div>
            ))}
            
            {/* Calculate Button */}
            <Button 
              onClick={executeCalculation} 
              disabled={isCalculating}
              className="w-full"
              data-testid="calculate-btn"
            >
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calculate Emissions
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Calculation Error */}
      {calcError && (
        <Alert variant="destructive">
          <AlertDescription>{calcError}</AlertDescription>
        </Alert>
      )}
      
      {/* Step 5: Calculation Results */}
      {calculationResult && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-700">Calculation Results</CardTitle>
            <CardDescription>
              Formula: {calculationResult.resolved_formula?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {calculationResult.outputs?.co2 && (
                <div className="text-center p-3 bg-white rounded-lg">
                  <div className="text-sm text-muted-foreground">CO₂</div>
                  <div className="text-xl font-bold">
                    {calculationResult.outputs.co2.value?.toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {calculationResult.outputs.co2.unit}
                  </div>
                </div>
              )}
              
              {calculationResult.outputs?.ch4 && (
                <div className="text-center p-3 bg-white rounded-lg">
                  <div className="text-sm text-muted-foreground">CH₄</div>
                  <div className="text-xl font-bold">
                    {calculationResult.outputs.ch4.value?.toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {calculationResult.outputs.ch4.unit}
                  </div>
                </div>
              )}
              
              {calculationResult.outputs?.n2o && (
                <div className="text-center p-3 bg-white rounded-lg">
                  <div className="text-sm text-muted-foreground">N₂O</div>
                  <div className="text-xl font-bold">
                    {calculationResult.outputs.n2o.value?.toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {calculationResult.outputs.n2o.unit}
                  </div>
                </div>
              )}
              
              {calculationResult.outputs?.co2e && (
                <div className="text-center p-3 bg-green-100 rounded-lg border-2 border-green-300">
                  <div className="text-sm text-green-700">Total CO₂e</div>
                  <div className="text-2xl font-bold text-green-800">
                    {calculationResult.outputs.co2e.value?.toFixed(4)}
                  </div>
                  <div className="text-xs text-green-600">
                    {calculationResult.outputs.co2e.unit}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Action Buttons */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          disabled={!calculationResult}
          data-testid="save-emission-btn"
        >
          {mode === 'edit' ? 'Update Emission' : 'Save Emission'}
        </Button>
      </div>
    </div>
  );
}
