/**
 * useIntensityData — Hook to fetch turnover and production data for intensity calculations
 * 
 * Logic:
 * - If ALL facilities selected (org-level): Fetch from /api/organization/yearly-data/{year}
 *   - Year format: "FY 2025-2026" (full FY format)
 *   - Returns both turnover and production_quantity
 * 
 * - If SPECIFIC facilities selected (facility-level): Fetch from /api/facilities/{id}/production/{year}
 *   - Year format: "FY 2025-2026" (full FY format)
 *   - Only production-based intensity available (no turnover at facility level)
 */
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useIntensityData(dateRange, selectedFacilities = []) {
  const { getAuthHeader } = useAuth();
  const [turnover, setTurnover] = useState(null);
  const [productionQty, setProductionQty] = useState(null);
  const [productionUnit, setProductionUnit] = useState(null);
  const [loading, setLoading] = useState(true);

  // Determine FY year from dateRange in format "FY 2025-2026"
  const fyYear = useMemo(() => {
    if (!dateRange?.from) return null;
    const fromDate = new Date(dateRange.from);
    const month = fromDate.getMonth();
    const year = fromDate.getFullYear();
    // FY starts in April (month 3)
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    // Format: "FY 2025-2026"
    return `FY ${startYear}-${endYear}`;
  }, [dateRange]);

  // Check if org-level (all facilities) or facility-level (specific selection)
  const isOrgLevel = selectedFacilities.length === 0;

  useEffect(() => {
    const fetchIntensityData = async () => {
      if (!fyYear) return;
      
      setLoading(true);
      
      try {
        if (isOrgLevel) {
          // Org-level: Fetch from organization/yearly-data endpoint
          // This pulls from organization_financials (turnover) and production_quantities tables
          const response = await axios.get(
            `${API}/organization/yearly-data/${fyYear}`,
            { headers: getAuthHeader() }
          );
          
          const data = response.data;
          
          // Turnover is stored as string, parse to number
          const turnoverValue = data?.turnover ? parseFloat(data.turnover) : null;
          setTurnover(turnoverValue && !isNaN(turnoverValue) ? turnoverValue : null);
          
          // Production quantity
          const prodQty = data?.production_quantity ? parseFloat(data.production_quantity) : null;
          setProductionQty(prodQty && !isNaN(prodQty) ? prodQty : null);
          setProductionUnit(data?.production_unit || null);
          
        } else {
          // Facility-level: Only production data available (no turnover)
          // Sum production from all selected facilities
          setTurnover(null); // Turnover not available at facility level
          
          let totalProduction = 0;
          let unit = null;
          
          for (const facilityId of selectedFacilities) {
            try {
              const response = await axios.get(
                `${API}/facilities/${facilityId}/production/${fyYear}`,
                { headers: getAuthHeader() }
              );
              
              const data = response.data;
              
              // Use yearly quantity if available
              if (data?.quantity) {
                totalProduction += parseFloat(data.quantity) || 0;
                unit = unit || data.unit;
              } else if (data?.monthly_data) {
                // Sum monthly data if yearly not available
                const monthlyTotal = Object.values(data.monthly_data).reduce((sum, val) => {
                  const num = parseFloat(val);
                  return sum + (isNaN(num) ? 0 : num);
                }, 0);
                totalProduction += monthlyTotal;
                unit = unit || data.unit;
              }
            } catch (err) {
              // Skip facilities with no production data
              console.warn(`No production data for facility ${facilityId}`);
            }
          }
          
          setProductionQty(totalProduction > 0 ? totalProduction : null);
          setProductionUnit(unit);
        }
        
      } catch (error) {
        console.error('Failed to fetch intensity data:', error);
        setTurnover(null);
        setProductionQty(null);
        setProductionUnit(null);
      } finally {
        setLoading(false);
      }
    };

    fetchIntensityData();
  }, [fyYear, isOrgLevel, selectedFacilities, getAuthHeader]);

  const hasIntensityData = turnover !== null || productionQty !== null;
  const hasTurnover = turnover !== null;
  const hasProduction = productionQty !== null;

  return {
    turnover,
    productionQty,
    productionUnit,
    hasIntensityData,
    hasTurnover,
    hasProduction,
    isOrgLevel,
    loading,
    fyYear,
  };
}

/**
 * usePrevYearIntensity — Hook to fetch previous year's turnover/production for YoY intensity comparisons
 */
export function usePrevYearIntensity(fyYear, isOrgLevel) {
  const { getAuthHeader } = useAuth();
  const [prevYearIntensity, setPrevYearIntensity] = useState({ turnover: null, productionQty: null });
  const [loading, setLoading] = useState(false);

  // Calculate previous FY year (e.g., "FY 2025-2026" -> "FY 2024-2025")
  const prevFyYear = useMemo(() => {
    if (!fyYear) return null;
    const match = fyYear.match(/FY (\d{4})-(\d{4})/);
    if (!match) return null;
    const startYear = parseInt(match[1], 10);
    return `FY ${startYear - 1}-${startYear}`;
  }, [fyYear]);

  useEffect(() => {
    const fetchPrevYearIntensity = async () => {
      if (!prevFyYear || !isOrgLevel) {
        setPrevYearIntensity({ turnover: null, productionQty: null });
        return;
      }

      setLoading(true);
      try {
        const response = await axios.get(
          `${API}/organization/yearly-data/${prevFyYear}`,
          { headers: getAuthHeader() }
        );
        const data = response.data;
        const prevTurnover = data?.turnover ? parseFloat(data.turnover) : null;
        const prevProdQty = data?.production_quantity ? parseFloat(data.production_quantity) : null;
        setPrevYearIntensity({
          turnover: prevTurnover && !isNaN(prevTurnover) ? prevTurnover : null,
          productionQty: prevProdQty && !isNaN(prevProdQty) ? prevProdQty : null,
        });
      } catch (error) {
        console.error('Failed to fetch prev year intensity:', error);
        setPrevYearIntensity({ turnover: null, productionQty: null });
      } finally {
        setLoading(false);
      }
    };

    fetchPrevYearIntensity();
  }, [prevFyYear, isOrgLevel, getAuthHeader]);

  return { prevYearIntensity, prevFyYear, loading };
}

/**
 * Calculate intensity values for emissions and energy
 */
export function useIntensityCalculations({ 
  netEmissions, 
  netEnergy, 
  turnover, 
  productionQty, 
  productionUnit = 'Unit',
  intensityMode = 'revenue',
  isOrgLevel = true,
}) {
  return useMemo(() => {
    // At facility level, only production intensity is available
    const effectiveMode = !isOrgLevel ? 'production' : intensityMode;
    
    const emissionIntensityRevenue = turnover ? netEmissions / turnover : null;
    const emissionIntensityProd = productionQty ? netEmissions / productionQty : null;
    const energyIntensityRevenue = turnover ? netEnergy / turnover : null;
    const energyIntensityProd = productionQty ? netEnergy / productionQty : null;

    return {
      emissionIntensity: effectiveMode === 'revenue' ? emissionIntensityRevenue : emissionIntensityProd,
      emissionIntensityUnit: effectiveMode === 'revenue' ? 'tCO₂e/Cr' : `tCO₂e/${productionUnit}`,
      energyIntensity: effectiveMode === 'revenue' ? energyIntensityRevenue : energyIntensityProd,
      energyIntensityUnit: effectiveMode === 'revenue' ? 'MWh/Cr' : `MWh/${productionUnit}`,
      hasEmissionIntensity: effectiveMode === 'revenue' ? emissionIntensityRevenue !== null : emissionIntensityProd !== null,
      hasEnergyIntensity: effectiveMode === 'revenue' ? energyIntensityRevenue !== null : energyIntensityProd !== null,
      effectiveMode,
    };
  }, [netEmissions, netEnergy, turnover, productionQty, intensityMode, isOrgLevel]);
}
