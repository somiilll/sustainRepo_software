/**
 * DashboardScope12 — variant for orgs with Scope 1 & 2 only.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import DashboardHeader from './components/DashboardHeader';
import DashboardFilters from './components/DashboardFilters';
import KpiCards from './components/KpiCards';
import ESGKpiCards from './components/ESGKpiCards';
import EmissionsByScopeCard from './components/EmissionsByScopeCard';
import BaseYearComparisonCard from './components/BaseYearComparisonCard';
import CategoryAndFuelAnalysis from './components/CategoryAndFuelAnalysis';
import { GHGTrendChart, ScopeDonutChart } from './components/EnvironmentalCharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardScope12({ data }) {
  const { token } = useAuth();
  const {
    loading, stats,
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown,
    facilityDropdownRef,
    filteredData, baseYearComparison,
    isLive, lastLiveUpdateAt,
    getPreviousFinancialYear,
  } = data;

  const [esgSummary, setEsgSummary] = useState(null);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/dashboard/esg-summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setEsgSummary(r.data))
      .catch(() => null);
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="space-y-6" data-testid="dashboard-scope12">
      <DashboardHeader
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        isLive={isLive}
        lastLiveUpdateAt={lastLiveUpdateAt}
      />

      {showFilters && (
        <DashboardFilters
          facilities={facilities}
          selectedFacilities={selectedFacilities}
          setSelectedFacilities={setSelectedFacilities}
          dateRange={dateRange}
          setDateRange={setDateRange}
          showFacilityDropdown={showFacilityDropdown}
          setShowFacilityDropdown={setShowFacilityDropdown}
          facilityDropdownRef={facilityDropdownRef}
          getPreviousFinancialYear={getPreviousFinancialYear}
        />
      )}

      <ESGKpiCards kpis={esgSummary?.kpis} />

      <div className="grid grid-cols-12 gap-4">
        <GHGTrendChart monthlyTrend={esgSummary?.monthly_trend} />
        <ScopeDonutChart scopeBreakdown={esgSummary?.scope_breakdown} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <EmissionsByScopeCard filteredData={filteredData} hasScope3Access={false} />
        <KpiCards filteredData={filteredData} />
      </div>

      <BaseYearComparisonCard baseYearComparison={baseYearComparison} hasScope3Access={false} />
      <CategoryAndFuelAnalysis stats={stats} />
    </div>
  );
}
