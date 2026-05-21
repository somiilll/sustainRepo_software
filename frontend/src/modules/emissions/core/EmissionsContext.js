/**
 * Emissions Context
 * 
 * Provides emissions-related data and services throughout the app.
 * Reduces prop drilling by making common data available via context.
 */

import React, { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import { useEmissionsStore } from '../stores/emissionsStore';
import { createServices } from '../services/api.service';
import { categoryRegistry } from '../core/CategoryRegistry';

// Context
const EmissionsContext = createContext(null);

/**
 * Emissions Provider
 * Wraps the application with emissions context
 */
export function EmissionsProvider({ children, getAuthHeader }) {
  const store = useEmissionsStore();
  
  // Create API services
  const services = useMemo(() => createServices(getAuthHeader), [getAuthHeader]);
  
  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      store.setLoading(true);
      try {
        const data = await services.emissions.getInitialData();
        store.setInitialData(data);
      } catch (error) {
        console.error('Failed to load initial data:', error);
        store.setError(error.message);
      } finally {
        store.setLoading(false);
      }
    };
    
    loadData();
  }, [services]);
  
  // Memoized context value
  const value = useMemo(() => ({
    // Services
    services,
    
    // Store access
    store,
    
    // Registry access
    categoryRegistry,
    
    // Auth helper
    getAuthHeader,
    
    // Common getters
    getFacility: (id) => store.facilities.find(f => f.id === id),
    getFuel: (id) => store.fuelDatabase.find(f => f.id === id),
    getCategory: (name) => store.dynamicCategories.find(c => c.name === name),
    getScope3Activity: (id) => store.scope3EFData.find(a => a.id === id),
    
    // Computed values
    hasScope3Access: () => {
      const enabledAccess = store.organization?.enabled_access || [];
      return enabledAccess.includes('scope3') || enabledAccess.includes('all');
    },
    
    getCategoriesForScope: (scope) => {
      return store.dynamicCategories.filter(c => c.scope_code === scope);
    },
    
    // Refresh data
    refreshEmissions: async () => {
      try {
        const emissions = await services.emissions.getEmissions();
        store.setEmissions(emissions);
      } catch (error) {
        console.error('Failed to refresh emissions:', error);
      }
    },
  }), [services, store, getAuthHeader]);
  
  return (
    <EmissionsContext.Provider value={value}>
      {children}
    </EmissionsContext.Provider>
  );
}

/**
 * Hook to access emissions context
 */
export function useEmissions() {
  const context = useContext(EmissionsContext);
  if (!context) {
    throw new Error('useEmissions must be used within an EmissionsProvider');
  }
  return context;
}

/**
 * Hook to access specific category module
 */
export function useCategoryModule(categoryName) {
  const { categoryRegistry } = useEmissions();
  
  return useMemo(() => {
    if (!categoryName) return null;
    return categoryRegistry.get(categoryName);
  }, [categoryName, categoryRegistry]);
}

/**
 * Hook for emission form operations
 */
export function useEmissionForm() {
  const { services, store, refreshEmissions } = useEmissions();
  
  const createEmission = useCallback(async (payload) => {
    const result = await services.emissions.createEmission(payload);
    await refreshEmissions();
    return result;
  }, [services, refreshEmissions]);
  
  const updateEmission = useCallback(async (id, payload) => {
    const result = await services.emissions.updateEmission(id, payload);
    await refreshEmissions();
    return result;
  }, [services, refreshEmissions]);
  
  const deleteEmission = useCallback(async (id) => {
    const result = await services.emissions.deleteEmission(id);
    await refreshEmissions();
    return result;
  }, [services, refreshEmissions]);
  
  const calculateEmissions = useCallback(async (payload) => {
    return await services.emissions.calculateEmissions(payload);
  }, [services]);
  
  return {
    createEmission,
    updateEmission,
    deleteEmission,
    calculateEmissions,
    isLoading: store.isLoading,
  };
}

/**
 * Hook for emission filters
 */
export function useEmissionFilters() {
  const store = useEmissionsStore();
  
  return {
    filters: store.filters,
    setFilter: store.setFilter,
    setFilters: store.setFilters,
    clearFilters: store.clearFilters,
    
    // Filter options
    facilities: store.facilities,
    categories: store.getCategoriesForScope(),
  };
}

/**
 * Hook to get method label from config
 */
export function useMethodLabels() {
  const { store } = useEmissions();
  
  const labels = useMemo(() => ({
    calculation_methods: {
      activity_basis: 'Average Data Based',
      spend_basis: 'Spend Based',
      supplier_basis: 'Supplier Based',
    },
    calculation_methods_short: {
      activity_basis: 'Average',
      spend_basis: 'Spend',
      supplier_basis: 'Supplier',
    },
  }), []);
  
  const getMethodLabel = useCallback((method, short = false) => {
    if (!method) return '-';
    const labelSet = short ? labels.calculation_methods_short : labels.calculation_methods;
    return labelSet[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [labels]);
  
  return { labels, getMethodLabel };
}

export default EmissionsContext;
