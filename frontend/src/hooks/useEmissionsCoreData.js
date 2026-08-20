import { useState, useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Custom hook for fetching all core emissions data.
 * Consolidates 13+ API calls into a single hook with unified loading state.
 * 
 * @param {Function} getAuthHeader - Auth header getter from useAuth()
 * @returns {Object} All core data + loading state + refresh function
 */
export function useEmissionsCoreData(getAuthHeader) {
  const [data, setData] = useState({
    emissions: [],
    facilities: [],
    organization: null,
    fuelDatabase: [],
    formulaDefinitions: [],
    formulaParameters: [],
    emissionConfigurations: [],
    centralizedUnits: [],
    gwpConfig: null,
    processTemplates: [],
    dynamicScopes: [],
    dynamicCategories: [],
    scope3EFData: [],
    fugitiveEmissionsData: [],
    organizationGhgOverrides: null,
    configLabels: {
      calculation_methods: {},
      calculation_methods_short: {},
      subcategories: {},
      product_types: {},
      scopes: {}
    }
  });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { headers: getAuthHeader() };
      const [
        emissionsRes, facilitiesRes, fuelDbRes, formulasRes, 
        paramsRes, unitsRes, configsRes, gwpRes, 
        templatesRes, orgRes, scopesRes, catsRes, labelsRes,
        scope3EfRes, resolvedConfigRes
      ] = await Promise.all([
        axios.get(`${API}/emissions`, headers),
        axios.get(`${API}/facilities`, headers),
        axios.get(`${API}/fuel-database`, headers),
        axios.get(`${API}/formula-definitions`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/formula-parameters`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/calc-engine/units`, headers).catch(() => ({ data: { simple: [], compound: [] } })),
        axios.get(`${API}/emission-configurations`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/gwp-config`, headers).catch(() => ({ data: null })),
        axios.get(`${API}/process-templates`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/organizations/my`, headers).catch(() => ({ data: null })),
        axios.get(`${API}/scopes`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/categories`, headers).catch(() => ({ data: [] })),
        axios.get(`${API}/config/labels`, headers).catch(() => ({ data: null })),
        axios.get(`${API}/scope3-ef?limit=10000`, headers).catch(() => ({ data: { data: [] } })),
        axios.get(`${API}/sustainability-config/resolved`, headers).catch(() => ({ data: {} }))
      ]);

      // Derive fugitive emissions from fuel_database (needed for Scope 3 C8/C10/C11/C13/C14)
      const fuelData = fuelDbRes.data || [];
      const fugitiveEmissionsData = fuelData
        .filter(f => f.category === 'Fugitive Emissions' && f.gwp_fugitives)
        .map(f => ({
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

      const scope3EfPayload = scope3EfRes.data;
      const scope3EFData = Array.isArray(scope3EfPayload?.data)
        ? scope3EfPayload.data
        : (Array.isArray(scope3EfPayload) ? scope3EfPayload : []);

      setData({
        emissions: emissionsRes.data,
        facilities: facilitiesRes.data,
        fuelDatabase: fuelData,
        formulaDefinitions: formulasRes.data || [],
        formulaParameters: paramsRes.data || [],
        centralizedUnits: [...(unitsRes.data?.simple || []), ...(unitsRes.data?.compound || [])],
        emissionConfigurations: configsRes.data || [],
        gwpConfig: gwpRes.data || null,
        processTemplates: templatesRes.data || [],
        organization: orgRes.data,
        dynamicScopes: scopesRes.data || [],
        dynamicCategories: catsRes.data || [],
        scope3EFData,
        fugitiveEmissionsData,
        organizationGhgOverrides: resolvedConfigRes.data?.ghg_overrides || null,
        configLabels: labelsRes.data || data.configLabels,
      });
    } catch (error) {
      console.error('Error fetching core emissions data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { ...data, loading, refresh: fetchData };
}

export default useEmissionsCoreData;
