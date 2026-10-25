import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const EMPTY_DEFAULTS = {};

export const useSpendCurrencyDefaults = ({
  enabled,
  sourceCurrency,
  currencyByPeriod,
  conversionMethod,
  reportingYearType,
  reportingYear,
  frequencyType,
  activeMonths,
  getAuthHeader,
}) => {
  const [defaults, setDefaults] = useState(EMPTY_DEFAULTS);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const currencyByPeriodRef = useRef(currencyByPeriod);
  currencyByPeriodRef.current = currencyByPeriod;
  const getAuthHeaderRef = useRef(getAuthHeader);
  getAuthHeaderRef.current = getAuthHeader;
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

  const currencyGroupsKey = useMemo(() => {
    if (!currencyByPeriod || Object.keys(currencyByPeriod).length === 0) return '';
    const grouped = {};
    Object.entries(currencyByPeriod).forEach(([period, cur]) => {
      const code = String(cur || '').trim().toUpperCase();
      if (!code) return;
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(period);
    });
    return Object.keys(grouped).sort().map((code) => `${code}:${[...grouped[code]].sort().join('|')}`).join(';');
  }, [currencyByPeriod]);

  const clearDefaultsIfNeeded = () => {
    if (Object.keys(defaultsRef.current || {}).length !== 0) {
      setDefaults(EMPTY_DEFAULTS);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      clearDefaultsIfNeeded();
      return undefined;
    }

    if (currencyGroupsKey) {
      const grouped = {};
      Object.entries(currencyByPeriodRef.current || {}).forEach(([period, cur]) => {
        const code = String(cur || '').trim().toUpperCase();
        if (!code) return;
        if (!grouped[code]) grouped[code] = [];
        grouped[code].push(period);
      });
      const entries = Object.entries(grouped);
      if (entries.length === 0) {
        clearDefaultsIfNeeded();
        return undefined;
      }
      Promise.all(entries.map(([code, periods]) => axios.get(`${API}/currency-conversion/resolved`, {
        headers: getAuthHeaderRef.current?.(),
        params: {
          source_currency: code,
          reporting_periods: periods.join(','),
          conversion_method: conversionMethod,
          reporting_year_type: reportingYearType,
        },
      }).then((response) => response.data?.defaults || {}).catch(() => ({})))).then((results) => {
        if (cancelled) return;
        const merged = {};
        results.forEach((groupDefaults) => {
          Object.assign(merged, groupDefaults);
        });
        setDefaults(merged);
      });

      return () => {
        cancelled = true;
      };
    }

    if (!sourceCurrency || !periodsKey) {
      clearDefaultsIfNeeded();
      return undefined;
    }

    axios.get(`${API}/currency-conversion/resolved`, {
      headers: getAuthHeaderRef.current?.(),
      params: {
        source_currency: sourceCurrency,
        reporting_periods: periodsKey,
        conversion_method: conversionMethod,
        reporting_year_type: reportingYearType,
      },
    }).then((response) => {
      if (!cancelled) setDefaults(response.data?.defaults || {});
    }).catch(() => {
      if (!cancelled) clearDefaultsIfNeeded();
    });

    return () => {
      cancelled = true;
    };
  }, [conversionMethod, currencyGroupsKey, enabled, periodsKey, reportingYearType, sourceCurrency]);

  return defaults;
};

export default useSpendCurrencyDefaults;
