/**
 * useEmissionsData - Data fetching hook for Emissions page
 * 
 * Manages all the data fetching and state for emissions, facilities,
 * fuel database, formulas, categories, and other configuration data.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function useEmissionsData(getAuthHeader) {
  // Main data states
  const [emissions, setEmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [fuelDatabase, setFuelDatabase] = useState([]);
  const [formulaDefinitions, setFormulaDefinitions] = useState([]);
  const [formulaParameters, setFormulaParameters] = useState([]);
  const [emissionConfigurations, setEmissionConfigurations] = useState([]);
  const [centralizedUnits, setCentralizedUnits] = useState([]);
  const [gwpConfig, setGwpConfig] = useState(null);
  const [processTemplates, setProcessTemplates] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [dynamicScopes, setDynamicScopes] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);
  
  // Loading and ready states
  const [loading, setLoading] = useState(true);
  const [formulaDataReady, setFormulaDataReady] = useState(false);
  
  // Centralized Label Configuration
  const [configLabels, setConfigLabels] = useState({
    calculation_methods: {
      activity_basis: 'Average Data Based',
      spend_basis: 'Spend Based',
      supplier_basis: 'Supplier Based'
    },
    calculation_methods_short: {
      activity_basis: 'Average',
      spend_basis: 'Spend',
      supplier_basis: 'Supplier'
    }
  });

  // Scope 3 specific data
  const [scope3EFData, setScope3EFData] = useState([]);
  const [fugitiveEmissionsData, setFugitiveEmissionsData] = useState([]);
  const [loadingScope3EF, setLoadingScope3EF] = useState(false);
  
  // Biogenic data
  const [biogenicCategories, setBiogenicCategories] = useState([]);
  const [loadingBiogenicCategories, setLoadingBiogenicCategories] = useState(false);

  // Helper function for method labels
  const getMethodLabel = useCallback((method, short = false) => {
    if (!method) return '-';
    const labels = short ? configLabels.calculation_methods_short : configLabels.calculation_methods;
    return labels?.[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [configLabels]);

  // Main data fetch function
  const fetchData = useCallback(async () => {
    setFormulaDataReady(false);
    try {
      const [
        emissionsRes, 
        facilitiesRes, 
        fuelDbRes, 
        formulasRes, 
        paramsRes, 
        unitsRes, 
        configsRes, 
        gwpRes, 
        templatesRes, 
        orgRes, 
        scopesRes, 
        catsRes, 
        labelsRes
      ] = await Promise.all([
        axios.get(`${API}/emissions`, { headers: getAuthHeader() }),
        axios.get(`${API}/facilities`, { headers: getAuthHeader() }),
        axios.get(`${API}/fuel-database`, { headers: getAuthHeader() }),
        axios.get(`${API}/formula-definitions`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/formula-parameters`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() }).catch(() => ({ data: { simple: [], compound: [] } })),
        axios.get(`${API}/emission-configurations`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/gwp-config`, { headers: getAuthHeader() }).catch(() => ({ data: null })),
        axios.get(`${API}/process-templates`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/organizations/my`, { headers: getAuthHeader() }).catch(() => ({ data: null })),
        axios.get(`${API}/scopes`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/categories`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/config/labels`, { headers: getAuthHeader() }).catch(() => ({ data: null }))
      ]);
      
      setEmissions(emissionsRes.data);
      setFacilities(facilitiesRes.data);
      setFuelDatabase(fuelDbRes.data || []);
      setFormulaDefinitions(formulasRes.data || []);
      setFormulaParameters(paramsRes.data || []);
      
      // Combine simple and compound units
      const allUnits = [...(unitsRes.data?.simple || []), ...(unitsRes.data?.compound || [])];
      setCentralizedUnits(allUnits);
      
      setEmissionConfigurations(configsRes.data || []);
      setGwpConfig(gwpRes.data || null);
      setProcessTemplates(templatesRes.data || []);
      setOrganization(orgRes.data);
      setDynamicScopes(scopesRes.data || []);
      setDynamicCategories(catsRes.data || []);
      
      if (labelsRes.data) {
        setConfigLabels(labelsRes.data);
      }
      
      setFormulaDataReady(true);
    } catch (error) {
      console.error('Emissions fetch error:', error);
      setEmissions([]);
      setFacilities([]);
      setFuelDatabase([]);
      setFormulaDefinitions([]);
      setFormulaParameters([]);
      setCentralizedUnits([]);
      setEmissionConfigurations([]);
      setGwpConfig(null);
      setProcessTemplates([]);
      setOrganization(null);
      setDynamicScopes([]);
      setDynamicCategories([]);
      setFormulaDataReady(true);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  // Fetch Scope 3 EF data
  const fetchScope3EF = useCallback(async (scope) => {
    if (scope !== 'scope3') {
      setScope3EFData([]);
      setFugitiveEmissionsData([]);
      return;
    }
    
    setLoadingScope3EF(true);
    try {
      const response = await axios.get(`${API}/scope3-ef?limit=10000`, {
        headers: getAuthHeader()
      });
      const efData = response.data?.data || response.data || [];
      setScope3EFData(Array.isArray(efData) ? efData : []);
      
      // Fetch fugitive emissions from fuel_database
      const fuelResponse = await axios.get(`${API}/fuel-database`, {
        headers: getAuthHeader()
      });
      const fuelData = fuelResponse.data || [];
      const fugitives = fuelData.filter(f => 
        f.category === 'Fugitive Emissions' && f.gwp_fugitives
      ).map(f => ({
        id: f.id,
        activity: f.fuel_name,
        fuel_name: f.fuel_name,
        emission_factor: f.gwp_fugitives,
        unit: 'kgCO2e/kg',
        source: f.source || 'Fugitive Emissions',
        allowed_units: f.allowed_units || ['kg', 'g', 't'],
        default_unit: f.default_unit || 'kg',
        gwp_fugitives: f.gwp_fugitives
      }));
      setFugitiveEmissionsData(fugitives);
    } catch (error) {
      console.error('[Scope3 EF] Error fetching:', error);
      setScope3EFData([]);
      setFugitiveEmissionsData([]);
    } finally {
      setLoadingScope3EF(false);
    }
  }, [getAuthHeader]);

  // Fetch biogenic categories
  const fetchBiogenicCategories = useCallback(async (activeScope, biogenicScopeSelection) => {
    if (activeScope !== 'biogenic' || biogenicScopeSelection !== 'scope3') {
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
  }, [getAuthHeader]);

  // Fetch biogenic Scope3 EF data
  const fetchBiogenicScope3EF = useCallback(async (activeScope, biogenicScopeSelection) => {
    if (activeScope !== 'biogenic' || biogenicScopeSelection !== 'scope3') {
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
  }, [getAuthHeader]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    // Main data
    emissions,
    setEmissions,
    facilities,
    fuelDatabase,
    formulaDefinitions,
    formulaParameters,
    emissionConfigurations,
    centralizedUnits,
    gwpConfig,
    processTemplates,
    organization,
    dynamicScopes,
    dynamicCategories,
    configLabels,
    
    // Scope 3 data
    scope3EFData,
    setScope3EFData,
    fugitiveEmissionsData,
    loadingScope3EF,
    
    // Biogenic data
    biogenicCategories,
    loadingBiogenicCategories,
    
    // Loading states
    loading,
    formulaDataReady,
    
    // Functions
    fetchData,
    fetchScope3EF,
    fetchBiogenicCategories,
    fetchBiogenicScope3EF,
    getMethodLabel,
  };
}

export default useEmissionsData;
