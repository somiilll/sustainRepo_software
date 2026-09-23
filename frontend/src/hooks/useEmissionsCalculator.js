import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getUserFriendlyError } from '../lib/userFriendlyError';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Custom hook for emissions calculation via calc-engine.
 * Handles debouncing, API calls, and result formatting.
 * 
 * @param {Function} getAuthHeader - Auth header getter from useAuth()
 * @returns {Object} Calculation state and functions
 */
export function useEmissionsCalculator(getAuthHeader) {
  const [backendCalcResult, setBackendCalcResult] = useState(null);
  const [calcEngineUsed, setCalcEngineUsed] = useState(false);
  const [isCalculatingNetwork, setIsCalculatingNetwork] = useState(false);
  const [calculationError, setCalculationError] = useState('');
  const calcTriggerRef = useRef(null);
  const requestRevisionRef = useRef(0);

  const calculate = (payload, debounceMs = 400) => {
    const requestRevision = ++requestRevisionRef.current;
    // Clear previous timeout
    if (calcTriggerRef.current) {
      clearTimeout(calcTriggerRef.current);
    }

    setIsCalculatingNetwork(true);
    setCalculationError('');

    // Debounce the actual API call
    calcTriggerRef.current = setTimeout(async () => {
      try {
        const response = await axios.post(
          `${API}/calc-engine/execute-by-category`,
          payload,
          { headers: getAuthHeader() }
        );
        if (requestRevision !== requestRevisionRef.current) return;

        if (response.data?.ok) {
          const outputs = response.data.outputs || {};
          setBackendCalcResult({
            co2Emissions: outputs.co2?.value || response.data.co2_emissions || 0,
            ch4Emissions: outputs.ch4?.value || response.data.ch4_emissions || 0,
            n2oEmissions: outputs.n2o?.value || response.data.n2o_emissions || 0,
            co2eEmissions: outputs.co2e?.value || response.data.co2e_emissions || 0,
            appliedFormulaName: response.data.resolved_formula?.name || 'Dynamic Calc Engine',
            formulaId: response.data.resolved_formula?.id || response.data.formula_id || null,
            formulaVersionId: response.data.resolved_formula?.version_id || response.data.formula_version_id || null,
            decisionTreeVersionId: response.data.resolved_decision_tree?.version_id || null,
            auditLog: response.data.audit_log || [],
            calculationSteps: response.data.audit?.execution_log || {},
            fromBackend: true
          });
          setCalcEngineUsed(true);
        } else {
          setBackendCalcResult(null);
          setCalcEngineUsed(false);
          setCalculationError('Calculation unavailable. Please review the entered data and try again.');
        }
      } catch (error) {
        if (requestRevision !== requestRevisionRef.current) return;
        console.error('[CalcEngine] Backend calculation error:', error);
        setBackendCalcResult(null);
        setCalcEngineUsed(false);
        setCalculationError(getUserFriendlyError(error, "We couldn't complete this calculation. Please review the entered data and try again."));
      } finally {
        if (requestRevision === requestRevisionRef.current) {
          setIsCalculatingNetwork(false);
        }
      }
    }, debounceMs);
  };

  const clearResult = useCallback(() => {
    requestRevisionRef.current += 1;
    if (calcTriggerRef.current) {
      clearTimeout(calcTriggerRef.current);
    }
    setBackendCalcResult(null);
    setCalcEngineUsed(false);
    setIsCalculatingNetwork(false);
    setCalculationError('');
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (calcTriggerRef.current) {
        clearTimeout(calcTriggerRef.current);
      }
    };
  }, []);

  return {
    backendCalcResult,
    setBackendCalcResult,
    calcEngineUsed,
    setCalcEngineUsed,
    isCalculatingNetwork,
    calculationError,
    setCalculationError,
    calculate,
    clearResult
  };
}

export default useEmissionsCalculator;
