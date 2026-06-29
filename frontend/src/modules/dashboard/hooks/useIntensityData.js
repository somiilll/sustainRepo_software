/**
 * useIntensityData — Hook to fetch turnover and production data for intensity calculations
 */
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useIntensityData(dateRange) {
  const { getAuthHeader } = useAuth();
  const [turnover, setTurnover] = useState(null);
  const [productionQty, setProductionQty] = useState(null);
  const [loading, setLoading] = useState(true);

  // Determine FY year from dateRange
  const fyYear = useMemo(() => {
    if (!dateRange?.from) return null;
    const fromDate = new Date(dateRange.from);
    const month = fromDate.getMonth();
    const year = fromDate.getFullYear();
    // FY starts in April (month 3)
    return month >= 3 ? year : year - 1;
  }, [dateRange]);

  useEffect(() => {
    const fetchYearlyData = async () => {
      if (!fyYear) return;
      
      setLoading(true);
      console.log("fyYear", fyYear)
      try {
        // Fetch from organization/yearly-data endpoint which pulls from
        // organization_financials (turnover) and production_quantities tables
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
        
      } catch (error) {
        console.error('Failed to fetch yearly data for intensity:', error);
        setTurnover(null);
        setProductionQty(null);
      } finally {
        setLoading(false);
      }
    };

    fetchYearlyData();
  }, [fyYear, getAuthHeader]);

  const hasIntensityData = turnover !== null || productionQty !== null;

  return {
    turnover,
    productionQty,
    hasIntensityData,
    loading,
    fyYear,
  };
}

/**
 * Calculate intensity values for emissions and energy
 */
export function useIntensityCalculations({ 
  netEmissions, 
  netEnergy, 
  turnover, 
  productionQty, 
  intensityMode = 'revenue' 
}) {
  return useMemo(() => {
    const emissionIntensityRevenue = turnover ? netEmissions / turnover : null;
    const emissionIntensityProd = productionQty ? netEmissions / productionQty : null;
    const energyIntensityRevenue = turnover ? netEnergy / turnover : null;
    const energyIntensityProd = productionQty ? netEnergy / productionQty : null;

    return {
      emissionIntensity: intensityMode === 'revenue' ? emissionIntensityRevenue : emissionIntensityProd,
      emissionIntensityUnit: intensityMode === 'revenue' ? 'tCO₂e/Cr' : 'tCO₂e/unit',
      energyIntensity: intensityMode === 'revenue' ? energyIntensityRevenue : energyIntensityProd,
      energyIntensityUnit: intensityMode === 'revenue' ? 'MWh/Cr' : 'MWh/unit',
      hasEmissionIntensity: intensityMode === 'revenue' ? emissionIntensityRevenue !== null : emissionIntensityProd !== null,
      hasEnergyIntensity: intensityMode === 'revenue' ? energyIntensityRevenue !== null : energyIntensityProd !== null,
    };
  }, [netEmissions, netEnergy, turnover, productionQty, intensityMode]);
}
