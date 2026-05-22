/**
 * DashboardScope123 — variant for organizations with **full Scope 1, 2 & 3 access**.
 *
 * Layout (top to bottom):
 *   1. Header (title + filter toggle)
 *   2. Filters panel (when expanded)
 *   3. KPI cards + Emissions by Scope (INCLUDES Scope 3 segment in donut + bars)
 *   4. **Scope 3 Visualizations** — trend area chart (S1/S2/S3) + Scope 3 hotspots
 *   5. Base Year Comparison (direct + indirect with Scope 3)
 *   6. Category + Fuel analysis
 *
 * Diff vs Scope12: adds the Scope3VisualizationsCard between the top section and base year card.
 */
import React from 'react';
import DashboardHeader from './components/DashboardHeader';
import DashboardFilters from './components/DashboardFilters';
import KpiCards from './components/KpiCards';
import EmissionsByScopeCard from './components/EmissionsByScopeCard';
import Scope3VisualizationsCard from './components/Scope3VisualizationsCard';
import BaseYearComparisonCard from './components/BaseYearComparisonCard';
import CategoryAndFuelAnalysis from './components/CategoryAndFuelAnalysis';

export default function DashboardScope123({ data }) {
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
    <div className="space-y-8" data-testid="dashboard-scope123">
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

      {/* KPIs + Emissions by Scope (with Scope 3) */}
      <div className="grid grid-cols-12 gap-4">
        <KpiCards filteredData={filteredData} />
        <EmissionsByScopeCard filteredData={filteredData} hasScope3Access={hasScope3Access} />
      </div>

      {/* Scope 3-specific visualizations */}
      <Scope3VisualizationsCard stats={stats} filteredData={filteredData} />

      <BaseYearComparisonCard baseYearComparison={baseYearComparison} hasScope3Access={hasScope3Access} />

      <CategoryAndFuelAnalysis stats={stats} />
    </div>
  );
}
