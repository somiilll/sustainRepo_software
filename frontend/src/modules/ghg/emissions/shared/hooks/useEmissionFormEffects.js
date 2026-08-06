/**
 * useEmissionFormEffects - Data fetching effects for EmissionEntryForm
 * 
 * This hook manages all useEffect hooks that fetch data from the backend.
 */

import { useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Data fetching effects for emission form
 * @param {Object} params - Parameters for the effects
 */
export function useEmissionFormEffects({
  // State values needed for effects
  scope,
  category,
  biogenicScopeSelection,
  dynamicCategories,
  useCustomFuel,
  getAuthHeader,
  
  // State setters
  setFormConfig,
  setLoadingFormConfig,
  setCalcEngineResult,
  setScope3EFData,
  setLoadingScope3EF,
  setBiogenicCategories,
  setLoadingBiogenicCategories,
  setFugitiveEmissionsData,
}) {
  // ============================================================================
  // Fetch form config when scope + category changes
  // ============================================================================
  useEffect(() => {
    const fetchFormConfig = async () => {
      let effectiveScope = scope;
      if (scope === 'biogenic') {
        if (biogenicScopeSelection === 'scope3') {
          effectiveScope = 'scope3';
        } else if (biogenicScopeSelection === 'scope1') {
          effectiveScope = 'biogenic';
        }
      }

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

    const isProcess = category === 'Process Emissions';
    const biogenicReady = scope !== 'biogenic' || biogenicScopeSelection;

    // Fetch formConfig even for custom fuel - needed for methodology-based dynamic fields
    if (scope && category && !isProcess && biogenicReady) {
      fetchFormConfig();
    } else {
      setFormConfig(null);
    }
  }, [scope, category, dynamicCategories, getAuthHeader, biogenicScopeSelection, setFormConfig, setLoadingFormConfig, setCalcEngineResult]);

  // ============================================================================
  // Fetch fugitive emissions data from fuel_database
  // ============================================================================
  useEffect(() => {
    const fetchFugitiveEmissions = async () => {
      try {
        const response = await axios.get(`${API}/fuel-database`, {
          headers: getAuthHeader()
        });
        const allFuels = response.data || [];

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
  }, [getAuthHeader, setFugitiveEmissionsData]);

  // ============================================================================
  // Fetch Scope 3 EF data when scope is scope3
  // ============================================================================
  useEffect(() => {
    const fetchScope3EF = async () => {
      if (scope !== 'scope3') {
        setScope3EFData([]);
        return;
      }

      setLoadingScope3EF(true);
      try {
        const response = await axios.get(`${API}/scope3-ef?limit=10000`, {
          headers: getAuthHeader()
        });
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
  }, [scope, getAuthHeader, setScope3EFData, setLoadingScope3EF]);

  // ============================================================================
  // Fetch biogenic categories when biogenic tab is active and scope3 is selected
  // ============================================================================
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
  }, [scope, biogenicScopeSelection, getAuthHeader, setBiogenicCategories, setLoadingBiogenicCategories]);

  // ============================================================================
  // Fetch biogenic scope3_ef data when biogenic + scope3 is selected
  // ============================================================================
  useEffect(() => {
    const fetchBiogenicScope3EF = async () => {
      if (scope !== 'biogenic' || biogenicScopeSelection !== 'scope3') {
        return;
      }

      setLoadingScope3EF(true);
      try {
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
  }, [scope, biogenicScopeSelection, getAuthHeader, setScope3EFData, setLoadingScope3EF]);
}

export default useEmissionFormEffects;
