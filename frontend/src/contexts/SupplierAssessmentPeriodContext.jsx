import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const SupplierAssessmentPeriodContext = createContext(null);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const storageKey = 'supplier-assessment-reporting-period';
const fallbackPeriod = `CY ${new Date().getFullYear()}`;

export const SupplierAssessmentPeriodProvider = ({ children }) => {
  const { getAuthHeader } = useAuth();
  const [reportingPeriod, setReportingPeriodState] = useState(() => localStorage.getItem(storageKey) || fallbackPeriod);
  const [periods, setPeriods] = useState([fallbackPeriod]);

  useEffect(() => {
    axios.get(`${API}/supplier-assessment/reporting-periods`, { headers: getAuthHeader() })
      .then((response) => {
        const data = response.data || {};
        const configuredType = data.reporting_year_type === 'calendar_year' ? 'CY' : 'FY';
        const savedPeriod = localStorage.getItem(storageKey);
        const selectedPeriod = savedPeriod?.startsWith(configuredType) ? savedPeriod : data.default_period;
        const availablePeriods = [...new Set([...(data.periods || []), selectedPeriod].filter(Boolean))];
        setPeriods(availablePeriods);
        if (selectedPeriod) {
          setReportingPeriodState(selectedPeriod);
          localStorage.setItem(storageKey, selectedPeriod);
        }
      })
      .catch(() => undefined);
  }, [getAuthHeader]);

  const setReportingPeriod = useCallback((period) => {
    setReportingPeriodState(period);
    localStorage.setItem(storageKey, period);
    setPeriods((current) => [...new Set([...current, period])].sort().reverse());
  }, []);

  const value = useMemo(() => ({ reportingPeriod, periods, setReportingPeriod }), [reportingPeriod, periods, setReportingPeriod]);
  return <SupplierAssessmentPeriodContext.Provider value={value}>{children}</SupplierAssessmentPeriodContext.Provider>;
};

export const useSupplierAssessmentPeriod = () => {
  const context = useContext(SupplierAssessmentPeriodContext);
  if (!context) return { reportingPeriod: fallbackPeriod, periods: [fallbackPeriod], setReportingPeriod: () => {} };
  return context;
};