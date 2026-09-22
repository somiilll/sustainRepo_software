import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const useSpendCurrencyDefaults = ({
  enabled,
  sourceCurrency,
  conversionMethod,
  reportingYearType,
  reportingYear,
  frequencyType,
  activeMonths,
  getAuthHeader,
}) => {
  const [defaults, setDefaults] = useState({});
  const reportingPeriods = useMemo(() => {
    if (!enabled || !reportingYear) return [];
    if (frequencyType === 'yearly') {
      return [reportingYearType === 'financial'
        ? `FY ${reportingYear}-${String(Number(reportingYear) + 1).slice(-2)}`
        : `CY${reportingYear}`];
    }
    return activeMonths.map((month) => {
      const monthKey = month.key || month;
      const actualYear = reportingYearType === 'financial' && Number(monthKey) <= 3
        ? Number(reportingYear) + 1
        : reportingYear;
      return `${actualYear}-${monthKey}`;
    });
  }, [activeMonths, enabled, frequencyType, reportingYear, reportingYearType]);
  const periodsKey = reportingPeriods.join(',');

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !sourceCurrency || !periodsKey) {
      setDefaults({});
      return undefined;
    }

    axios.get(`${API}/currency-conversion/resolved`, {
      headers: getAuthHeader(),
      params: {
        source_currency: sourceCurrency,
        reporting_periods: periodsKey,
        conversion_method: conversionMethod,
        reporting_year_type: reportingYearType,
      },
    }).then((response) => {
      if (!cancelled) setDefaults(response.data?.defaults || {});
    }).catch(() => {
      if (!cancelled) setDefaults({});
    });

    return () => {
      cancelled = true;
    };
  }, [conversionMethod, enabled, getAuthHeader, periodsKey, reportingYearType, sourceCurrency]);

  return defaults;
};

export default useSpendCurrencyDefaults;