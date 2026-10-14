import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { isFutureSupplierAssessmentPeriod } from '../modules/supplier-assessment/utils/supplierAssessmentPeriods';

const SupplierAssessmentPeriodContext = createContext(null);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const storageKey = 'supplier-assessment-reporting-period';
const fallbackPeriod = `CY ${new Date().getFullYear()}`;
const canonicalSupplierAssessmentPeriod = (period) => {
  const match = String(period || '').trim().match(/^FY\s*(\d{4})\s*-\s*(\d{2}|\d{4})$/i);
  return match ? `FY ${match[1]}-${Number(match[1]) + 1}` : period;
};

export const SupplierAssessmentPeriodProvider = ({ children }) => {
  const { getAuthHeader } = useAuth();
  const [reportingPeriod, setReportingPeriodState] = useState(() => localStorage.getItem(storageKey) || fallbackPeriod);
  const [periods, setPeriods] = useState([fallbackPeriod]);

  useEffect(() => {
    axios.get(`${API}/supplier-assessment/reporting-periods`, { headers: getAuthHeader() })
      .then((response) => {
        const data = response.data || {};
        const configuredType = data.reporting_year_type === 'calendar_year' ? 'CY' : 'FY';
        const defaultPeriod = canonicalSupplierAssessmentPeriod(data.default_period);
        const savedPeriod = canonicalSupplierAssessmentPeriod(localStorage.getItem(storageKey));
        const selectedPeriod = savedPeriod?.startsWith(configuredType) && !isFutureSupplierAssessmentPeriod(savedPeriod, defaultPeriod, data.reporting_year_type)
          ? savedPeriod
          : defaultPeriod;
        const availablePeriods = [...new Set([...(data.periods || []).map(canonicalSupplierAssessmentPeriod), selectedPeriod]
          .filter((period) => period && !isFutureSupplierAssessmentPeriod(period, defaultPeriod, data.reporting_year_type)))];
        setPeriods(availablePeriods);
        if (selectedPeriod) {
          setReportingPeriodState(selectedPeriod);
          localStorage.setItem(storageKey, selectedPeriod);
        }
      })
      .catch(() => undefined);
  }, [getAuthHeader]);

  const setReportingPeriod = useCallback((period) => {
    const canonicalPeriod = canonicalSupplierAssessmentPeriod(period);
    setReportingPeriodState(canonicalPeriod);
    localStorage.setItem(storageKey, canonicalPeriod);
    setPeriods((current) => [...new Set([...current.map(canonicalSupplierAssessmentPeriod), canonicalPeriod])].sort().reverse());
  }, []);

  const value = useMemo(() => ({ reportingPeriod, periods, setReportingPeriod }), [reportingPeriod, periods, setReportingPeriod]);
  return <SupplierAssessmentPeriodContext.Provider value={value}>{children}</SupplierAssessmentPeriodContext.Provider>;
};

export const useSupplierAssessmentPeriod = () => {
  const context = useContext(SupplierAssessmentPeriodContext);
  if (!context) return { reportingPeriod: fallbackPeriod, periods: [fallbackPeriod], setReportingPeriod: () => {} };
  return context;
};