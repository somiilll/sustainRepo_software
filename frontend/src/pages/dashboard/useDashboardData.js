/**
 * useDashboardData — single source of truth for Dashboard data + filters.
 *
 * Owns:
 *   - facilities, organization, base-year-emissions, dashboard-stats fetching
 *   - filter state (date range, selected facilities, panel visibility)
 *   - derived memoized data (filteredData, scopeData, baseYearComparison)
 *   - hasScope3Access flag (used by parent router to pick variant)
 *
 * Returned shape is consumed by:
 *   - /pages/Dashboard.js (router)
 *   - /pages/dashboard/DashboardScope12.jsx
 *   - /pages/dashboard/DashboardScope123.jsx
 *   - shared components in /pages/dashboard/components/
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { SCOPE_COLORS } from './dashboardConstants';
import { useDashboardLiveStream } from './useDashboardLiveStream';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const getCurrentFinancialYear = () => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: new Date(`${year}-04-01`), to: new Date(`${year + 1}-03-01`) };
};

const getPreviousFinancialYear = () => {
  const now = new Date();
  const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const prevFYStart = currentFYStart - 1;
  return { from: new Date(`${prevFYStart}-04-01`), to: new Date(`${prevFYStart + 1}-03-01`) };
};

export function useDashboardData() {
  const { getAuthHeader, token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showFacilityDropdown, setShowFacilityDropdown] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [baseYearData, setBaseYearData] = useState({ direct: null, indirect: null });
  const [isLive, setIsLive] = useState(false);
  const [lastLiveUpdateAt, setLastLiveUpdateAt] = useState(null);
  const facilityDropdownRef = useRef(null);

  const hasScope3Access = organization?.enabled_access?.includes('scope1_2_3') || false;

  // Live cockpit: re-fetch dashboard stats on backend emission/audit events.
  useDashboardLiveStream({
    token,
    enabled: !!token,
    onRefresh: () => {
      setIsLive(true);
      setLastLiveUpdateAt(new Date());
      if (dateRange.from && dateRange.to) fetchStats();
      // Also refresh base year data + facility list (rare, but cheap).
      fetchBaseYearData();
    },
  });

  // Close facility dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (facilityDropdownRef.current && !facilityDropdownRef.current.contains(event.target)) {
        setShowFacilityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchFacilities();
    fetchOrganization();
    fetchBaseYearData();
    fetchLatestReportingPeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dateRange.from && dateRange.to) fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFacilities, dateRange]);

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
      setOrganization(response.data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    }
  };

  const fetchBaseYearData = async () => {
    try {
      const response = await axios.get(`${API}/base-year-emissions`, { headers: getAuthHeader() });
      const records = response.data || [];
      let directRecord = null;
      let indirectRecord = null;
      for (const record of records) {
        const scopeGroup = record.scope_group || 'scope12';
        const isOrgLevel = !record.facility_id;
        if (scopeGroup === 'scope12' && !directRecord && isOrgLevel) directRecord = record;
        if (scopeGroup === 'scope3' && !indirectRecord && isOrgLevel) indirectRecord = record;
      }
      if (!directRecord || !indirectRecord) {
        for (const record of records) {
          const scopeGroup = record.scope_group || 'scope12';
          if (scopeGroup === 'scope12' && !directRecord) directRecord = record;
          if (scopeGroup === 'scope3' && !indirectRecord) indirectRecord = record;
        }
      }
      setBaseYearData({ direct: directRecord, indirect: indirectRecord });
    } catch (error) {
      console.error('Failed to fetch base year data:', error);
    }
  };

  const fetchLatestReportingPeriod = async () => {
    try {
      const response = await axios.get(`${API}/emissions`, { headers: getAuthHeader() });
      const emissions = response.data || [];
      if (emissions.length > 0) {
        const monthlyPeriods = emissions
          .map(e => e.reporting_period)
          .filter(p => p && /^\d{4}-\d{2}$/.test(p))
          .sort();
        const latestPeriod = monthlyPeriods[monthlyPeriods.length - 1];
        if (latestPeriod) {
          const latestYear = parseInt(latestPeriod.split('-')[0]);
          const latestMonth = parseInt(latestPeriod.split('-')[1]);
          const dataFYYear = latestMonth >= 4 ? latestYear : latestYear - 1;
          const currentFYStart = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
          const fyYear = dataFYYear >= currentFYStart ? currentFYStart : dataFYYear;
          setDateRange({ from: new Date(`${fyYear}-04-01`), to: new Date(`${fyYear + 1}-03-01`) });
        } else {
          setDateRange(getCurrentFinancialYear());
        }
      } else {
        setDateRange(getCurrentFinancialYear());
      }
    } catch (error) {
      console.error('Error fetching latest period:', error);
      setDateRange(getCurrentFinancialYear());
    }
  };

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFacilities.length > 0) selectedFacilities.forEach(fid => params.append('facility_id', fid));
      if (dateRange.from) params.append('start_period', format(dateRange.from, 'yyyy-MM'));
      if (dateRange.to) params.append('end_period', format(dateRange.to, 'yyyy-MM'));
      const queryString = params.toString();
      const url = queryString ? `${API}/dashboard/stats?${queryString}` : `${API}/dashboard/stats`;
      const response = await axios.get(url, { headers: getAuthHeader() });
      setStats(response.data);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      setStats({
        total_facilities: 0, total_emissions: 0, scope1_emissions: 0, scope2_emissions: 0,
        biogenic_emissions: 0, recent_records: [], emissions_by_facility: [], emissions_trend: [],
        emissions_by_category: [], emissions_by_fuel: [], yearly_fuel_analysis: [],
        yearly_facility_analysis: [], monthly_comparison: [], sinks_total: 0, sinks_by_facility: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, { headers: getAuthHeader() });
      setFacilities(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  // Derived: filteredData (totals + sinks)
  const filteredData = useMemo(() => {
    if (!stats) {
      return {
        trend: [], facilities: [],
        totals: { scope1: 0, scope2: 0, scope3: 0, biogenic: 0, biogenicDirect: 0, biogenicIndirect: 0, total: 0 },
        filteredSinks: 0,
      };
    }
    const filteredTrend = stats.emissions_trend || [];
    const filteredFacilities = stats.emissions_by_facility || [];
    const totals = {
      scope1: stats.scope1_emissions || filteredFacilities.reduce((s, f) => s + (f.scope1_emissions || 0), 0),
      scope2: stats.scope2_emissions || filteredFacilities.reduce((s, f) => s + (f.scope2_emissions || 0), 0),
      scope3: stats.scope3_emissions || filteredFacilities.reduce((s, f) => s + (f.scope3_emissions || 0), 0),
      biogenic: stats.biogenic_emissions || filteredFacilities.reduce((s, f) => s + (f.biogenic_emissions || 0), 0),
      biogenicDirect: stats.biogenic_direct || 0,
      biogenicIndirect: stats.biogenic_indirect || 0,
      total: 0,
    };
    totals.total = totals.scope1 + totals.scope2 + totals.biogenic + (hasScope3Access ? totals.scope3 : 0);
    const filteredSinks = stats.sinks_total || 0;
    return { trend: filteredTrend, facilities: filteredFacilities, totals, filteredSinks };
  }, [stats, hasScope3Access]);

  // Derived: baseYearComparison
  const baseYearComparison = useMemo(() => {
    if (!stats) return null;
    const currentTotals = filteredData.totals;
    const directData = baseYearData?.direct;
    const indirectData = baseYearData?.indirect;
    if (!directData && !indirectData) return null;

    const aggregateByScope = (emissionsArray) => {
      const result = { scope1: 0, scope2: 0, scope3: 0, biogenic: 0 };
      if (Array.isArray(emissionsArray)) {
        emissionsArray.forEach(entry => {
          const scope = (entry.scope || '').toLowerCase();
          const value = parseFloat(entry.tco2e) || 0;
          if (scope === 'scope1' || scope === 'scope 1') result.scope1 += value;
          else if (scope === 'scope2' || scope === 'scope 2') result.scope2 += value;
          else if (scope === 'scope3' || scope === 'scope 3') result.scope3 += value;
          else if (scope === 'biogenic') result.biogenic += value;
        });
      }
      return result;
    };

    const directBaseEmissions = directData ? aggregateByScope(directData.emissions_data) : { scope1: 0, scope2: 0, biogenic: 0 };
    const directBaseYear = directData?.base_year || null;
    const directConfigured = !!directData;
    const indirectBaseEmissions = indirectData ? aggregateByScope(indirectData.emissions_data) : { scope3: 0, biogenic: 0 };
    const indirectBaseYear = indirectData?.base_year || null;
    const indirectConfigured = !!indirectData;

    const directComparison = [
      { scope: 'Scope 1', base: directBaseEmissions.scope1, current: currentTotals.scope1, color: SCOPE_COLORS.scope1 },
      { scope: 'Scope 2', base: directBaseEmissions.scope2, current: currentTotals.scope2, color: SCOPE_COLORS.scope2 },
      { scope: 'Biogenic', base: directBaseEmissions.biogenic, current: currentTotals.biogenicDirect, color: SCOPE_COLORS.biogenic },
    ];

    const indirectComparison = [];
    if (hasScope3Access) {
      indirectComparison.push({ scope: 'Scope 3', base: indirectBaseEmissions.scope3, current: currentTotals.scope3, color: SCOPE_COLORS.scope3 });
    }
    indirectComparison.push({ scope: 'Biogenic', base: indirectBaseEmissions.biogenic, current: currentTotals.biogenicIndirect, color: SCOPE_COLORS.biogenic });

    const directBaseTotal = directBaseEmissions.scope1 + directBaseEmissions.scope2 + directBaseEmissions.biogenic;
    const directCurrentTotal = currentTotals.scope1 + currentTotals.scope2 + currentTotals.biogenicDirect;
    const directChangePercent = directBaseTotal > 0 ? ((directCurrentTotal - directBaseTotal) / directBaseTotal) * 100 : 0;
    const indirectBaseTotal = indirectBaseEmissions.biogenic + (hasScope3Access ? indirectBaseEmissions.scope3 : 0);
    const indirectCurrentTotal = currentTotals.biogenicIndirect + (hasScope3Access ? currentTotals.scope3 : 0);
    const indirectChangePercent = indirectBaseTotal > 0 ? ((indirectCurrentTotal - indirectBaseTotal) / indirectBaseTotal) * 100 : 0;
    const baseTotal = directBaseTotal + indirectBaseTotal;
    const currentTotal = directCurrentTotal + indirectCurrentTotal;
    const changePercent = baseTotal > 0 ? ((currentTotal - baseTotal) / baseTotal) * 100 : 0;

    return {
      directBaseYear, directConfigured, directComparison, directBaseTotal, directCurrentTotal, directChangePercent,
      indirectBaseYear, indirectConfigured, indirectComparison, indirectBaseTotal, indirectCurrentTotal, indirectChangePercent,
      baseTotal, currentTotal, changePercent,
    };
  }, [baseYearData, stats, filteredData.totals, hasScope3Access]);

  return {
    // raw
    stats, loading, organization, hasScope3Access,
    // filter state
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown,
    facilityDropdownRef,
    // derived
    filteredData, baseYearComparison,
    // live cockpit
    isLive, lastLiveUpdateAt,
    // helpers
    getCurrentFinancialYear,
  };
}
