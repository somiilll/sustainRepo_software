/**
 * DashboardScope123 — variant for organizations with **full Scope 1, 2 & 3 access**.
 *
 * Layout:
 *   1. Header + Filters
 *   2. ESG KPI Cards (12 cards, 4-col grid)
 *   3. GHG Trend + Scope Donut (Row 1)
 *   4. Monthly Stacked Bar + existing scope charts
 *   5. Scope 3 Visualizations
 *   6. Base Year Comparison
 *   7. Category + Fuel analysis
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import DashboardHeader from './components/DashboardHeader';
import DashboardFilters from './components/DashboardFilters';
import KpiCards from './components/KpiCards';
import ESGKpiCards from './components/ESGKpiCards';
import EmissionsByScopeCard from './components/EmissionsByScopeCard';
import Scope3VisualizationsCard from './components/Scope3VisualizationsCard';
import BaseYearComparisonCard from './components/BaseYearComparisonCard';
import CategoryAndFuelAnalysis from './components/CategoryAndFuelAnalysis';
import { GHGTrendChart, ScopeDonutChart, MonthlyStackedBar } from './components/EnvironmentalCharts';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardScope123({ data }) {
  const { token } = useAuth();
  const {
    loading, stats, hasScope3Access,
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
    <div className="space-y-6" data-testid="dashboard-scope123">
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

      {/* ESG KPI Cards */}
      <ESGKpiCards kpis={esgSummary?.kpis} />

      {/* Row 1: GHG Trend + Scope Donut */}
      <div className="grid grid-cols-12 gap-4">
        <GHGTrendChart monthlyTrend={esgSummary?.monthly_trend} />
        <ScopeDonutChart scopeBreakdown={esgSummary?.scope_breakdown} />
      </div>

      {/* Row 2: Monthly Stacked + Existing Emissions by Scope */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4">
          <MonthlyStackedBar monthlyTrend={esgSummary?.monthly_trend} />
        </div>
        <div className="col-span-12 md:col-span-5">
          <EmissionsByScopeCard filteredData={filteredData} hasScope3Access={hasScope3Access} />
        </div>
        <div className="col-span-12 md:col-span-3">
          <KpiCards filteredData={filteredData} />
        </div>
      </div>

      {/* Scope 3 Visualizations */}
      <Scope3VisualizationsCard stats={stats} filteredData={filteredData} />

      <BaseYearComparisonCard baseYearComparison={baseYearComparison} hasScope3Access={hasScope3Access} />

      <CategoryAndFuelAnalysis stats={stats} />
    </div>
  );
}
