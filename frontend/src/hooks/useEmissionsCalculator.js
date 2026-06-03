import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

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
  const calcTriggerRef = useRef(null);

  const calculate = (payload, debounceMs = 400) => {
    // Clear previous timeout
    if (calcTriggerRef.current) {
      clearTimeout(calcTriggerRef.current);
    }

    setIsCalculatingNetwork(true);

    // Debounce the actual API call
    calcTriggerRef.current = setTimeout(async () => {
      try {
        const response = await axios.post(
          `${API}/calc-engine/execute-by-category`,
          payload,
          { headers: getAuthHeader() }
        );

        if (response.data?.ok) {
          const outputs = response.data.outputs || {};
          setBackendCalcResult({
            co2Emissions: outputs.co2?.value || response.data.co2_emissions || 0,
            ch4Emissions: outputs.ch4?.value || response.data.ch4_emissions || 0,
            n2oEmissions: outputs.n2o?.value || response.data.n2o_emissions || 0,
            co2eEmissions: outputs.co2e?.value || response.data.co2e_emissions || 0,
            appliedFormulaName: response.data.resolved_formula?.name || 'Dynamic Calc Engine',
            formulaId: response.data.resolved_formula?.id || response.data.formula_id || null,
            auditLog: response.data.audit_log || [],
            calculationSteps: response.data.audit?.execution_log || {},
            fromBackend: true
          });
          setCalcEngineUsed(true);
        } else {
          setBackendCalcResult(null);
          setCalcEngineUsed(false);
        }
      } catch (error) {
        console.error('[CalcEngine] Backend calculation error:', error);
        setBackendCalcResult(null);
        setCalcEngineUsed(false);
      } finally {
        setIsCalculatingNetwork(false);
      }
    }, debounceMs);
  };

  const clearResult = () => {
    if (calcTriggerRef.current) {
      clearTimeout(calcTriggerRef.current);
    }
    setBackendCalcResult(null);
    setCalcEngineUsed(false);
    setIsCalculatingNetwork(false);
  };

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
    calculate,
    clearResult
  };
}

export default useEmissionsCalculator;
