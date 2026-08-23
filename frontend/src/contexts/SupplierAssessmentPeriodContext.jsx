import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const SupplierAssessmentPeriodContext = createContext(null);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const storageKey = 'supplier-assessment-reporting-period';
const currentPeriod = `CY${new Date().getFullYear()}`;

export const SupplierAssessmentPeriodProvider = ({ children }) => {
  const { getAuthHeader } = useAuth();
  const [reportingPeriod, setReportingPeriodState] = useState(() => localStorage.getItem(storageKey) || currentPeriod);
  const [periods, setPeriods] = useState([`CY${new Date().getFullYear() - 1}`, currentPeriod, `CY${new Date().getFullYear() + 1}`]);

  useEffect(() => {
    axios.get(`${API}/supplier-assessment/reporting-periods`, { headers: getAuthHeader() })
      .then((response) => setPeriods((current) => [...new Set([...current, ...(response.data.periods || [])])].sort().reverse()))
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
  if (!context) return { reportingPeriod: currentPeriod, periods: [currentPeriod], setReportingPeriod: () => {} };
  return context;
};