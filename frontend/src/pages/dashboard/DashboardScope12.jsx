/**
 * DashboardScope12 — variant for organizations with **Scope 1 & 2 access only**.
 *
 * Layout (top to bottom):
 *   1. Header (title + filter toggle)
 *   2. Filters panel (when expanded)
 *   3. KPI cards + Emissions by Scope (NO Scope 3 segment)
 *   4. Base Year Comparison (Scope 1+2+Biogenic Direct only; indirect biogenic if configured)
 *   5. Category + Fuel analysis
 *
 * Excluded vs Scope123: NO Scope 3 trend area chart, NO Scope 3 hotspots chart.
 */
import React from 'react';
import DashboardHeader from './components/DashboardHeader';
import DashboardFilters from './components/DashboardFilters';
import KpiCards from './components/KpiCards';
import EmissionsByScopeCard from './components/EmissionsByScopeCard';
import BaseYearComparisonCard from './components/BaseYearComparisonCard';
import CategoryAndFuelAnalysis from './components/CategoryAndFuelAnalysis';

export default function DashboardScope12({ data }) {
  const {
    loading, stats, hasScope3Access,
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown,
    facilityDropdownRef,
    filteredData, baseYearComparison,
    getPreviousFinancialYear,
  } = data;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="space-y-8" data-testid="dashboard-scope12">
      <DashboardHeader showFilters={showFilters} onToggleFilters={() => setShowFilters(!showFilters)} />

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

      {/* KPIs + Emissions by Scope (no Scope 3) */}
      <div className="grid grid-cols-12 gap-4">
        <KpiCards filteredData={filteredData} />
        <EmissionsByScopeCard filteredData={filteredData} hasScope3Access={hasScope3Access} />
      </div>

      <BaseYearComparisonCard baseYearComparison={baseYearComparison} hasScope3Access={hasScope3Access} />

      <CategoryAndFuelAnalysis stats={stats} />
    </div>
  );
}
