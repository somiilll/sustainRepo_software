/**
 * useCalcEngine Hook
 * 
 * Provides a unified interface to call the new backend calculation engine API.
 * This replaces the legacy frontend formula execution with server-side calculations.
 * 
 * Features:
 * - Calls POST /api/super-admin/calc-engine/execute-by-category for category-driven calculations
 * - Properly handles user overrides (calorific value, density, emission factor heat)
 * - Provides loading states and error handling
 * - Returns structured calculation results with audit trail
 */

import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Hook for executing calculations via the backend calc engine
 * @param {Function} getAuthHeader - Function to get authentication headers
 * @returns {Object} - { executeCalculation, isCalculating, error, lookupCategoryId }
 */
export function useCalcEngine(getAuthHeader) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState(null);
  
  // Cache for category name -> ID mappings
  const categoryCache = useRef({});

  /**
   * Look up category ID from category name
   * The backend calc engine uses category UUIDs, but the frontend uses names
   */
  const lookupCategoryId = useCallback(async (categoryName, scopeCode = null) => {
    if (!categoryName) return null;
    
    // Check cache first
    const cacheKey = `${scopeCode || 'any'}_${categoryName}`;
    if (categoryCache.current[cacheKey]) {
      return categoryCache.current[cacheKey];
    }

    try {
      // Fetch categories from API
      const response = await axios.get(`${API}/categories`, {
        headers: getAuthHeader()
      });
      
      const categories = response.data || [];
      
      // Find matching category
      // Priority: exact name match with scope, then exact name match without scope
      let match = null;
      
      if (scopeCode) {
        match = categories.find(c => 
          c.name?.toLowerCase() === categoryName.toLowerCase() && 
          c.scope_code === scopeCode
        );
      }
      
      if (!match) {
        match = categories.find(c => 
          c.name?.toLowerCase() === categoryName.toLowerCase()
        );
      }
      
      if (match) {
        categoryCache.current[cacheKey] = match.id;
        return match.id;
      }
      
      return null;
    } catch (err) {
      console.error('Failed to lookup category ID:', err);
      return null;
    }
  }, [getAuthHeader]);

  /**
   * Execute a calculation using the backend calc engine
   * 
   * @param {Object} params - Calculation parameters
   * @param {string} params.scope - Emission scope (scope1, scope2, biogenic)
   * @param {string} params.category - Emission category name
   * @param {string} params.categoryId - Optional: Emission category ID (UUID) if already known
   * @param {Object} params.fuel - Selected fuel object from fuel_database
   * @param {number} params.quantity - Quantity value (raw, not converted)
   * @param {string} params.unit - Quantity unit
   * @param {Object} params.overrides - User overrides { calorific_value, density, emission_factor_heat }
   * @param {Object} params.gwpConfig - GWP configuration object
   * @param {boolean} params.dryRun - Whether this is a dry run (default: true)
   * @returns {Object|null} - Calculation result or null on error
   */
  const executeCalculation = useCallback(async ({
    scope,
    category,
    categoryId,
    fuel,
    quantity,
    unit,
    overrides = {},
    gwpConfig,
    dryRun = true,
    calculationMethodology,
  }) => {
    if (!quantity || !fuel || !category) {
      return null;
    }

    setIsCalculating(true);
    setError(null);

    try {
      // Resolve category ID if not provided
      let resolvedCategoryId = categoryId;
      if (!resolvedCategoryId) {
        resolvedCategoryId = await lookupCategoryId(category, scope);
      }
      
      if (!resolvedCategoryId) {
        console.warn(`Category '${category}' not found in emission_categories. Falling back to legacy calculation.`);
        setError(`Category '${category}' has no decision tree configured.`);
        return null;
      }

      // Build inputs object for the calc engine
      // Different formulas may expect different input variable names
      const isScope2 = scope === 'scope2';
      const isElectricity = category?.toLowerCase()?.includes('electricity') || 
                            category?.toLowerCase()?.includes('purchased');
      
      // Determine the correct input variable name based on formula requirements
      // Scope 2 Electricity formulas typically use qty_energy
      // Scope 1/Biogenic combustion formulas use qty
      const inputVarName = isScope2 || isElectricity ? 'qty_energy' : 'qty';
      
      const inputs = {
        [inputVarName]: {
          value: parseFloat(quantity),
          unit: unit || (isElectricity ? 'kWh' : 'kg')
        }
      };
      
      // Also add qty as fallback for formulas that expect it
      if (inputVarName !== 'qty') {
        inputs.qty = {
          value: parseFloat(quantity),
          unit: unit || 'kWh'
        };
      }

      // Build context from fuel data
      const context = {
        fuel_name: fuel.fuel_name,
        fuel_type: fuel.fuel_name,
        fuel_id: fuel.id,
        scope: scope,
        category: category,
        region: fuel.region || 'Global'
      };

      // Build user_overrides - these take priority over database values
      // IMPORTANT: This fixes the P0 bug where custom values weren't being used
      const userOverrides = {};
      
      // Calorific value override
      if (overrides.override_calorific_value && overrides.calorific_value) {
        const cvValue = parseFloat(overrides.calorific_value);
        userOverrides.ncv = { 
          value: cvValue, 
          unit: fuel.calorific_value_unit || 'MJ/kg' 
        };
        userOverrides.calorific_value = { value: cvValue, unit: fuel.calorific_value_unit || 'MJ/kg' };
        userOverrides.cv = { value: cvValue, unit: fuel.calorific_value_unit || 'MJ/kg' };
        userOverrides.net_calorific_value = { value: cvValue, unit: fuel.calorific_value_unit || 'MJ/kg' };
      }

      // Density override
      if (overrides.override_density && overrides.density) {
        const densityValue = parseFloat(overrides.density);
        userOverrides.density = { 
          value: densityValue, 
          unit: fuel.density_unit || 'kg/L' 
        };
      }

      // Emission factor heat override
      if (overrides.override_emission_factor_heat && overrides.emission_factor_heat) {
        const efValue = parseFloat(overrides.emission_factor_heat);
        userOverrides.ef_q_co2 = { value: efValue, unit: 'kgCO2/TJ' };
        userOverrides.emission_factor_co2 = { value: efValue, unit: 'kgCO2/TJ' };
        userOverrides.ef = { value: efValue, unit: 'kgCO2/TJ' };
        userOverrides.ef_heat = { value: efValue, unit: 'kgCO2/TJ' };
      }

      // Determine decision inputs for the tree traversal
      // The decision tree may branch on "calculation_methodology" then "ef_quantity_provided"
      const decisionInputs = {
        scope: scope,
        fuel_type: fuel.fuel_name,
        category: category,
        // Default to using_ncv for backward compatibility
        calculation_methodology: calculationMethodology || 'using_ncv',
        // Default to heat-based calculation (ef_quantity_provided = false) unless we're forcing quantity-based
        ef_quantity_provided: 'false'
      };

      // Call the backend calc engine execute-by-category endpoint
      // Uses the user-accessible endpoint (not super-admin restricted)
      const response = await axios.post(
        `${API}/calc-engine/execute-by-category`,
        {
          category_id: resolvedCategoryId,
          decision_inputs: decisionInputs,
          inputs: inputs,
          context: context,
          user_overrides: userOverrides,
          dry_run: dryRun
        },
        { headers: getAuthHeader() }
      );

      if (response.data.ok) {
        const outputs = response.data.outputs || {};
        const auditLog = response.data.audit_log || [];

        // Calculate CO2e using GWP values if we have individual gas outputs
        let co2eEmissions = outputs.co2e?.value || 0;
        
        // If no co2e output but we have individual gases, calculate it
        if (!co2eEmissions && gwpConfig && (outputs.co2 || outputs.ch4 || outputs.n2o)) {
          const co2 = outputs.co2?.value || 0;
          const ch4 = outputs.ch4?.value || 0;
          const n2o = outputs.n2o?.value || 0;
          
          const isBiogenic = scope === 'biogenic';
          const gwpCh4 = isBiogenic ? gwpConfig.ch4_non_fossil_gwp : gwpConfig.ch4_fossil_gwp;
          
          co2eEmissions = (co2 * gwpConfig.co2_gwp) + (ch4 * gwpCh4) + (n2o * gwpConfig.n2o_gwp);
        }

        // Build calculation steps from audit log
        const calculationSteps = buildCalculationSteps(auditLog, outputs, response.data.resolved_formula);

        return {
          co2Emissions: outputs.co2?.value || 0,
          ch4Emissions: outputs.ch4?.value || 0,
          n2oEmissions: outputs.n2o?.value || 0,
          co2eEmissions: co2eEmissions,
          appliedFormulaName: response.data.resolved_formula?.name || 'Backend Calc Engine',
          calculationSteps: calculationSteps,
          co2OutputUnit: outputs.co2?.unit || 'tCO₂',
          ch4OutputUnit: outputs.ch4?.unit || 'tCH₄',
          n2oOutputUnit: outputs.n2o?.unit || 'tN₂O',
          co2eOutputUnit: outputs.co2e?.unit || 'tCO₂e',
          hasCo2Formula: !!outputs.co2,
          hasCh4Formula: !!outputs.ch4,
          hasN2oFormula: !!outputs.n2o,
          hasCo2eFormula: true,
          auditLog: auditLog,
          decisionPath: response.data.decision_path,
          rawResponse: response.data
        };
      }

      return null;
    } catch (err) {
      console.error('Calc engine error:', err);
      
      // Check if it's a 404 (no decision tree) - return null to trigger fallback
      if (err.response?.status === 404) {
        setError(`No decision tree configured for category. Using fallback.`);
        return null;
      }
      
      setError(err.response?.data?.detail || 'Calculation failed');
      return null;
    } finally {
      setIsCalculating(false);
    }
  }, [getAuthHeader, lookupCategoryId]);

  /**
   * Execute calculation directly by formula ID
   * Used when you already know which formula to use
   */
  const executeByFormula = useCallback(async ({
    formulaId,
    inputs,
    context,
    userOverrides,
    dryRun = true
  }) => {
    setIsCalculating(true);
    setError(null);

    try {
      const response = await axios.post(
        `${API}/super-admin/calc-engine/execute`,
        {
          formula_id: formulaId,
          inputs: inputs,
          context: context,
          user_overrides: userOverrides,
          dry_run: dryRun
        },
        { headers: getAuthHeader() }
      );

      return response.data;
    } catch (err) {
      console.error('Calc engine error:', err);
      setError(err.response?.data?.detail || 'Calculation failed');
      return null;
    } finally {
      setIsCalculating(false);
    }
  }, [getAuthHeader]);

  /**
   * Clear category cache (useful when categories are modified)
   */
  const clearCache = useCallback(() => {
    categoryCache.current = {};
  }, []);

  return {
    executeCalculation,
    executeByFormula,
    lookupCategoryId,
    clearCache,
    isCalculating,
    error
  };
}

/**
 * Build calculation steps object from audit log for display
 */
function buildCalculationSteps(auditLog, outputs, resolvedFormula) {
  const steps = {
    co2: null,
    ch4: null,
    n2o: null,
    co2e: null
  };

  // Extract steps from audit log
  const formulaSteps = auditLog.filter(entry => entry.step === 'formula_step');
  const inputSteps = auditLog.filter(entry => entry.step === 'input');
  const propertySteps = auditLog.filter(entry => entry.step === 'resolve_property');
  const conversionSteps = auditLog.filter(entry => entry.step === 'convert' || entry.conversion);

  // Build step arrays for display
  const allSteps = [];
  
  // Count-based variables that should not display units
  const unitlessCountVariables = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 
    'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days',
    'units_produced', 'products_expected_usage', 'no_of_employees'];
  
  inputSteps.forEach(s => {
    const convertInfo = s.conversion ? ` (converted from ${s.original_value} ${s.original_unit})` : '';
    const displayUnit = unitlessCountVariables.includes(s.variable) ? '' : (s.unit || '');
    allSteps.push(`Input: ${s.variable} = ${s.value} ${displayUnit}${convertInfo}`);
  });
  
  conversionSteps.forEach(s => {
    if (s.from_unit && s.to_unit) {
      allSteps.push(`Convert: ${s.value} ${s.from_unit} → ${s.converted_value} ${s.to_unit}`);
    }
  });
  
  propertySteps.forEach(s => {
    const source = s.source ? ` [from ${s.source}]` : '';
    allSteps.push(`Property: ${s.property_key || s.variable} = ${s.value} ${s.unit || ''}${source}`);
  });
  
  formulaSteps.forEach(s => {
    const expr = s.expression ? ` (${s.expression})` : '';
    allSteps.push(`Step: ${s.name}${expr} = ${typeof s.output === 'number' ? s.output.toFixed(6) : s.output}`);
  });

  const formulaName = resolvedFormula?.name || 'Backend Calc Engine';

  // Map to output gases
  if (outputs.co2) {
    steps.co2 = {
      formula_name: formulaName,
      formula_expression: 'See audit log for details',
      output_unit: outputs.co2.unit,
      steps: allSteps
    };
  }

  if (outputs.ch4) {
    steps.ch4 = {
      formula_name: formulaName,
      output_unit: outputs.ch4.unit,
      steps: []
    };
  }

  if (outputs.n2o) {
    steps.n2o = {
      formula_name: formulaName,
      output_unit: outputs.n2o.unit,
      steps: []
    };
  }

  if (outputs.co2e) {
    steps.co2e = {
      formula_name: 'CO₂e Total',
      output_unit: outputs.co2e.unit || 'tCO₂e',
      steps: [`Total CO₂e = ${outputs.co2e.value?.toFixed(4) || 0} ${outputs.co2e.unit || 'tCO₂e'}`]
    };
  }

  return steps;
}

export default useCalcEngine;
