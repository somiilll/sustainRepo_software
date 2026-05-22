/**
 * Emission Form Hooks
 * 
 * Custom hooks for emission entry forms that encapsulate:
 * - Category detection logic
 * - Form state management
 * - Calculation logic
 * 
 * These hooks allow gradual migration of EmissionEntryForm.js
 * by replacing inline logic with hook calls.
 */

import { useMemo, useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../../config/api';
import {
  isC7Category,
  isC6Category,
  getCategoryCode,
  requiresSubcategory as checkRequiresSubcategory,
  requiresAssetName as checkRequiresAssetName,
  requiresLocation as checkRequiresLocation,
  hasActivityType as checkHasActivityType,
  SUBCATEGORY_OPTIONS,
} from '../../constants/categories';
import { 
  isSupplierBased, 
  isSpendBased,
  getMethodLabel 
} from '../../constants/calculation-methods';
import { CALENDAR_YEAR_MONTHS, FINANCIAL_YEAR_MONTHS } from '../../constants/months';
import logger from '../../utils/logger';

// ============================================================================
// useCategoryDetection - Replaces all category detection if/else chains
// ============================================================================

/**
 * Hook for category detection logic
 * Replaces scattered if/else chains with centralized, memoized checks
 * 
 * @param {string} scope - Current scope (scope1, scope2, scope3, biogenic)
 * @param {string} category - Current category name
 * @param {string} biogenicScopeSelection - Biogenic scope selection
 * @returns {Object} Category detection flags
 * 
 * @example
 * const { isC7, isC6, requiresSubcategory, requiresAssetName } = useCategoryDetection(scope, category);
 */
export function useCategoryDetection(scope, category, biogenicScopeSelection = '') {
  const categoryCode = useMemo(() => getCategoryCode(category), [category]);
  
  const isScope3 = scope === 'scope3';
  const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const isScope3Like = isScope3 || isBiogenicScope3;
  const effectiveScope = isScope3Like ? 'scope3' : scope;
  
  // Category type checks
  const isC7 = useMemo(() => {
    return isC7Category(category) && isScope3;
  }, [category, isScope3]);
  
  const isC6 = useMemo(() => {
    return isC6Category(category) && isScope3;
  }, [category, isScope3]);
  
  // Feature requirements
  const requiresSubcategory = useMemo(() => {
    if (!isScope3 || isBiogenicScope3 || !category) return false;
    return checkRequiresSubcategory(category);
  }, [isScope3, isBiogenicScope3, category]);
  
  const requiresAssetName = useMemo(() => {
    if (!isScope3 || !category) return false;
    return checkRequiresAssetName(category);
  }, [isScope3, category]);
  
  const requiresLocation = useMemo(() => {
    if (!isScope3 || !category) return false;
    return checkRequiresLocation(category);
  }, [isScope3, category]);
  
  const hasActivityType = useMemo(() => {
    if (!isScope3 || !category) return false;
    return checkHasActivityType(category);
  }, [isScope3, category]);
  
  // Subcategory options based on category
  const subcategoryOptions = useMemo(() => {
    if (!requiresSubcategory) return [];
    return SUBCATEGORY_OPTIONS[categoryCode] || [];
  }, [requiresSubcategory, categoryCode]);
  
  return {
    // Category identification
    categoryCode,
    isScope3,
    isBiogenicScope3,
    isScope3Like,
    effectiveScope,
    
    // Specific category checks
    isC7,
    isC6,
    isC7EmployeeCommuting: isC7, // Alias for compatibility
    
    // Feature requirements
    requiresSubcategory,
    requiresAssetName,
    requiresLocation,
    showsLocationFields: requiresLocation, // Alias for compatibility
    hasActivityType,
    hasActivityTypeSelection: hasActivityType, // Alias for compatibility
    
    // Options
    subcategoryOptions,
  };
}

// ============================================================================
// useReportingPeriod - Handles reporting period logic
// ============================================================================

/**
 * Hook for reporting period management
 * Handles calendar vs financial year logic
 * 
 * @param {Object} organization - Organization data
 * @returns {Object} Reporting period state and helpers
 */
export function useReportingPeriod(organization = null) {
  const orgReportingYearType = organization?.reporting_year_type;
  const defaultYearType = orgReportingYearType === 'financial_year' ? 'financial' : 'calendar';
  
  const [yearType, setYearType] = useState(defaultYearType);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [frequency, setFrequency] = useState('monthly');
  
  // Get months based on year type
  const months = useMemo(() => {
    return yearType === 'financial' ? FINANCIAL_YEAR_MONTHS : CALENDAR_YEAR_MONTHS;
  }, [yearType]);
  
  // Check if org has preference
  const hasOrgPreference = orgReportingYearType === 'financial_year' || orgReportingYearType === 'calendar_year';
  
  // Get display year for a month (handles financial year Jan-Mar)
  const getDisplayYear = useCallback((monthKey) => {
    if (yearType === 'calendar') return year;
    const month = parseInt(monthKey);
    if (month >= 1 && month <= 3) {
      return (parseInt(year) + 1).toString();
    }
    return year;
  }, [yearType, year]);
  
  // Check if month is in future
  const isMonthFuture = useCallback((monthKey) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    let selectedYear = parseInt(year);
    const selectedMonth = parseInt(monthKey);
    
    if (yearType === 'financial' && selectedMonth >= 1 && selectedMonth <= 3) {
      selectedYear = selectedYear + 1;
    }
    
    if (selectedYear > currentYear) return true;
    if (selectedYear === currentYear && selectedMonth > currentMonth) return true;
    return false;
  }, [year, yearType]);
  
  // Build reporting period string
  const buildPeriodString = useCallback((monthKey = null) => {
    if (frequency === 'yearly') {
      return yearType === 'financial' ? `FY${year}` : year;
    }
    if (monthKey) {
      return yearType === 'financial' ? `FY${year}-${monthKey}` : `${year}-${monthKey}`;
    }
    return yearType === 'financial' ? `FY${year}` : year;
  }, [year, yearType, frequency]);
  
  return {
    // State
    yearType,
    setYearType,
    year,
    setYear,
    frequency,
    setFrequency,
    
    // Derived
    months,
    hasOrgPreference,
    
    // Helpers
    getDisplayYear,
    isMonthFuture,
    buildPeriodString,
  };
}

// ============================================================================
// useScope3Activities - Handles Scope 3 activity filtering
// ============================================================================

/**
 * Hook for Scope 3 activity type filtering
 * 
 * @param {string} scope - Current scope
 * @param {string} category - Current category
 * @param {Array} scope3EFData - Scope 3 emission factor data
 * @param {string} scope3Method - Selected calculation method
 * @returns {Object} Activity types and filtering
 */
export function useScope3Activities(scope, category, scope3EFData = [], scope3Method = '') {
  const { isC6, isC7, hasActivityType } = useCategoryDetection(scope, category);
  
  // Get available activity types
  const activityTypes = useMemo(() => {
    if (scope !== 'scope3' || !category || !hasActivityType) return [];
    
    const types = new Set();
    
    if (scope3EFData.length) {
      scope3EFData.forEach(ef => {
        if (ef.category?.toLowerCase() === category.toLowerCase() && ef.activity_type) {
          if (!scope3Method || scope3Method === 'supplier_basis' || ef.method === scope3Method) {
            types.add(ef.activity_type);
          }
        }
      });
    }
    
    // Add "Others" for supplier_basis (C6 only)
    if (scope3Method === 'supplier_basis' && isC6) {
      types.add('others');
    }
    
    return Array.from(types).sort();
  }, [scope, category, scope3EFData, scope3Method, hasActivityType, isC6]);
  
  // Get available calculation methods
  const availableMethods = useMemo(() => {
    if (scope !== 'scope3' || !category) return [];
    
    const methods = new Set();
    
    if (scope3EFData.length) {
      scope3EFData.forEach(ef => {
        if (ef.category?.toLowerCase() === category.toLowerCase() && ef.method) {
          methods.add(ef.method);
        }
      });
    }
    
    // Always add supplier_basis as option
    methods.add('supplier_basis');
    
    return Array.from(methods);
  }, [scope, category, scope3EFData]);
  
  return {
    activityTypes,
    availableMethods,
    showActivityTypeFilter: hasActivityType && activityTypes.length > 0,
  };
}

// ============================================================================
// useCalculationMethod - Handles calculation method logic
// ============================================================================

/**
 * Hook for calculation method management
 * 
 * @param {string} method - Current calculation method
 * @param {Object} configLabels - Centralized config labels
 * @returns {Object} Method helpers
 */
export function useCalculationMethod(method, configLabels = null) {
  const isSupplier = isSupplierBased(method);
  const isSpend = isSpendBased(method);
  const isActivity = !isSupplier && !isSpend;
  
  const label = useMemo(() => {
    if (!method) return '-';
    const defaultLabels = {
      activity_basis: 'Average Data Based',
      spend_basis: 'Spend Based',
      supplier_basis: 'Supplier Based'
    };
    if (configLabels?.calculation_methods) {
      return configLabels.calculation_methods[method] || defaultLabels[method] || method;
    }
    return defaultLabels[method] || getMethodLabel(method);
  }, [method, configLabels]);
  
  const shortLabel = useMemo(() => {
    if (!method) return '-';
    const defaultLabels = {
      activity_basis: 'Average',
      spend_basis: 'Spend',
      supplier_basis: 'Supplier'
    };
    if (configLabels?.calculation_methods_short) {
      return configLabels.calculation_methods_short[method] || defaultLabels[method] || method;
    }
    return defaultLabels[method] || getMethodLabel(method, true);
  }, [method, configLabels]);
  
  return {
    isSupplierBased: isSupplier,
    isSpendBased: isSpend,
    isActivityBased: isActivity,
    label,
    shortLabel,
    method,
  };
}

// ============================================================================
// useMonthlyData - Handles monthly data entry state
// ============================================================================

/**
 * Hook for monthly data entry management
 * 
 * @param {Array} months - Available months
 * @param {Array} fields - Input fields
 * @returns {Object} Monthly data state and helpers
 */
export function useMonthlyData(months = [], fields = []) {
  const [monthlyData, setMonthlyData] = useState({});
  const [expandedMonths, setExpandedMonths] = useState([]);
  
  // Update a field value for a month
  const updateMonthField = useCallback((monthKey, field, value) => {
    setMonthlyData(prev => ({
      ...prev,
      [monthKey]: {
        ...prev[monthKey],
        [field]: value,
      },
    }));
  }, []);
  
  // Update multiple fields for a month
  const updateMonthData = useCallback((monthKey, data) => {
    setMonthlyData(prev => ({
      ...prev,
      [monthKey]: {
        ...prev[monthKey],
        ...data,
      },
    }));
  }, []);
  
  // Check if month has data
  const monthHasData = useCallback((monthKey) => {
    const data = monthlyData[monthKey] || {};
    return Object.values(data).some(v => v !== '' && v !== null && v !== undefined);
  }, [monthlyData]);
  
  // Check if month has calculated result
  const monthHasResult = useCallback((monthKey) => {
    const data = monthlyData[monthKey] || {};
    return data.calcResult?.co2e != null;
  }, [monthlyData]);
  
  // Get summary of entered months
  const summary = useMemo(() => {
    const monthsWithData = months.filter(m => monthHasData(m.key));
    const monthsWithResults = months.filter(m => monthHasResult(m.key));
    const totalEmissions = months.reduce((sum, m) => {
      const result = monthlyData[m.key]?.calcResult;
      return sum + (result?.co2e || 0);
    }, 0);
    
    return {
      monthsWithData: monthsWithData.length,
      monthsWithResults: monthsWithResults.length,
      totalEmissions,
    };
  }, [months, monthlyData, monthHasData, monthHasResult]);
  
  // Reset all monthly data
  const resetMonthlyData = useCallback(() => {
    setMonthlyData({});
    setExpandedMonths([]);
  }, []);
  
  return {
    monthlyData,
    setMonthlyData,
    expandedMonths,
    setExpandedMonths,
    updateMonthField,
    updateMonthData,
    monthHasData,
    monthHasResult,
    summary,
    resetMonthlyData,
  };
}

// ============================================================================
// useYearlyData - Handles yearly data entry state
// ============================================================================

/**
 * Hook for yearly data entry management
 * 
 * @param {Array} fields - Input fields
 * @returns {Object} Yearly data state and helpers
 */
export function useYearlyData(fields = []) {
  const [yearlyData, setYearlyData] = useState({});
  const [calcResult, setCalcResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Update a field value
  const updateField = useCallback((field, value) => {
    setYearlyData(prev => ({
      ...prev,
      [field]: value,
    }));
    // Clear result when data changes
    setCalcResult(null);
  }, []);
  
  // Check if we have data
  const hasData = useMemo(() => {
    return Object.values(yearlyData).some(v => v !== '' && v !== null && v !== undefined);
  }, [yearlyData]);
  
  // Check if we have result
  const hasResult = calcResult?.co2e != null;
  
  // Reset
  const resetYearlyData = useCallback(() => {
    setYearlyData({});
    setCalcResult(null);
    setIsCalculating(false);
  }, []);
  
  return {
    yearlyData,
    setYearlyData,
    calcResult,
    setCalcResult,
    isCalculating,
    setIsCalculating,
    updateField,
    hasData,
    hasResult,
    resetYearlyData,
  };
}

// ============================================================================
// Default export - all hooks
// ============================================================================

export default {
  useCategoryDetection,
  useReportingPeriod,
  useScope3Activities,
  useCalculationMethod,
  useMonthlyData,
  useYearlyData,
};
