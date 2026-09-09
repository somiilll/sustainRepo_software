/**
 * BaseExecutiveDashboard — the layout engine used by both DashboardScope12
 * and DashboardScope123 variants. All section composition lives here; the
 * variants only flip the `hasScope3` flag and trim the rows accordingly.
 *
 * Data contract: takes the output of `useDashboardData` AS-IS plus a
 * `targets` array from the targets API. No API calls happen here.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Loader2, RadioTower } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';
import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import KpiCard from './components/kpi/KpiCard';
import GaugeCard from './components/kpi/GaugeCard';
import ScopeTrendChart from './components/charts/ScopeTrendChart';
import EmissionsByScopeDonut from './components/charts/EmissionsByScopeDonut';
import FacilityChart from './components/charts/FacilityChart';
import Scope3Hotspots from './components/charts/Scope3Hotspots';
import EmissionCategoriesChart from './components/charts/EmissionCategoriesChart';
import GeoHeatmap from './components/charts/GeoHeatmap';
import BaseYearComparisonChart from './components/charts/BaseYearChart';
import DashboardDataState from './components/shared/DashboardDataState';
import { DashboardExportButton } from './pdf-export';
import {
  buildSparklineSeries,
  buildEmissionsByScope,
  buildFacilitySeries,
  buildScope3Hotspots,
  buildCategoryBreakdown,
  buildHeatPoints,
  buildBaseYearChartData,
} from './services/dataTransformers';
import usePreviousYearData from './services/fetchPreviousYearData';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function BaseExecutiveDashboard({ data, hasScope3 }) {
  const { getAuthHeader } = useAuth();
  const {
    stats, loading, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    filteredData, baseYearComparison,
    isLive, lastLiveUpdateAt, getCurrentFinancialYear,
    dataState, resetDashboardFilters, retryDashboardStats,
  } = data;

  const [heatmapView, setHeatmapView] = useState('india');
  // Targets — fetched once on mount. Errors swallowed (gauge has empty state).
  const [targets, setTargets] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch GHG targets from esg_targets where category is "GHG Emissions"
        const res = await axios.get(`${API}/esg-targets/with-progress?section=environment&category=GHG Emissions&status=active`, { headers: getAuthHeader() });
        if (!cancelled) {
          // Transform esg_targets format to match expected target format for gauge card
          const ghgTargets = (res.data || []).map(t => {
            return {
              id: t.id,
              name: t.target_name || t.name || t.kpi_name || t.subcategory || 'Untitled target',
              kpi_id: t.kpi_id,
              category: t.category,
              subcategory: t.subcategory,
              _progressPct: t.progress_percentage,
              actualValue: t.actual_value,
              targetValue: t.target_value,
              goalType: t.goal_type,
              unit: t.unit,
              reportingPeriod: t.reporting_period,
              facilityId: t.facility_id || t.target_facility_id || null,
              facilityIds: Array.isArray(t.facility_ids) ? t.facility_ids : [],
              targetScope: t.target_scope || t.applies_to || t.entity_type || null,
            };
          });
          setTargets(ghgTargets);
        }
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
  }, [getAuthHeader]);

  const previousYearData = usePreviousYearData({
    dateRange,
    selectedFacilities,
    getAuthHeader,
  });
  const previousYearTotals = previousYearData.totals;
  // --- derived chart data ---
  const totals = filteredData.totals;
  // const trendDeltas = useMemo(() => deriveTrendDeltas(filteredData.trend), [filteredData.trend]);
  const totalSparkData = useMemo(() => buildSparklineSeries(filteredData.trend, 'total'), [filteredData.trend]);
  const donutData = useMemo(() => buildEmissionsByScope(totals, hasScope3), [totals, hasScope3]);
  const facilitySeries = useMemo(() => buildFacilitySeries(filteredData.facilities), [filteredData.facilities]);
  const scope3Hotspots = useMemo(() => buildScope3Hotspots(stats?.emissions_by_category), [stats]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(stats?.emissions_by_category), [stats]);
  const baseYearChart = useMemo(() => buildBaseYearChartData(baseYearComparison, totals, hasScope3), [baseYearComparison, totals, hasScope3]);
  const heatPoints = useMemo(() => buildHeatPoints(facilities, filteredData.facilities), [facilities, filteredData.facilities]);
  const trendDeltas = useMemo(() => {
      const computePct = (current = 0, previous = 0) => {
        if (!previous || previous === 0) return null;

        return ((current - previous) / previous) * 100;
      };

      // current year
      const currentNetEmissions =
        (totals.total || 0) - (filteredData.filteredSinks || 0);

      // previous year
      const previousNetEmissions =
        (previousYearTotals?.totalEmissions || 0) -
        (previousYearTotals?.totalSinks || 0);

      const hasComparablePriorPeriod = previousYearData.status === 'available';
      return {
        totalDelta: computePct(
          totals.total,
          hasComparablePriorPeriod ? previousYearTotals?.totalEmissions : 0
        ),

        sinksDelta: computePct(
          filteredData.filteredSinks || 0,
          hasComparablePriorPeriod ? previousYearTotals?.totalSinks : 0
        ),

        netDelta: computePct(
          currentNetEmissions,
          hasComparablePriorPeriod ? previousNetEmissions : 0
        ),
      };
  }, [totals, filteredData, previousYearData.status, previousYearTotals]);

  const sinksTotal = filteredData.filteredSinks || 0;
  const netEmissions = (totals.total || 0) - sinksTotal;

  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const selectedTarget =
    targets.find((t) => t.id === selectedTargetId) ||
    targets?.[0];
  const targetProgressPct = selectedTarget?._progressPct;

  const dateRangeLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  const previousWindowLabel = previousYearData.window
    ? `${format(previousYearData.window.from, 'MMM yyyy')} – ${format(previousYearData.window.to, 'MMM yyyy')}`
    : null;
  const comparisonLabel = previousWindowLabel
    ? previousYearData.status === 'available'
      ? `Compared with ${previousWindowLabel}`
      : `Prior reporting period: ${previousWindowLabel} (no reported data)`
    : null;
  const facilityNameById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility.name])), [facilities]);
  const targetApplicabilityLabel = useMemo(() => {
    if (!selectedTarget) return null;
    const ids = [...new Set([selectedTarget.facilityId, ...selectedTarget.facilityIds].filter(Boolean))];
    if (!ids.length && /facility/i.test(String(selectedTarget.targetScope || ''))) return 'Facility target';
    if (!ids.length) return null;
    const names = ids.map((id) => facilityNameById.get(id) || 'selected facility');
    return names.length === 1 ? `Facility: ${names[0]}` : `${names.length} facilities`;
  }, [facilityNameById, selectedTarget]);
  const canShowAnalysis = dataState === 'data';

  const filterProps = {
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    getCurrentFinancialYear,
  };

  const liveBadge = isLive ? (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 border border-emerald-200 rounded-full px-2 py-0.5"
      title={lastLiveUpdateAt ? `Updated ${format(lastLiveUpdateAt, 'HH:mm:ss')}` : ''}
    >
      <RadioTower className="w-3 h-3" />
      Live
    </span>
  ) : null;

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden pb-0" data-testid="executive-dashboard">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · GHG Dashboard` : 'GHG Dashboard'}
        subtitle={`Reporting window: ${dateRangeLabel}`}
        liveBadge={liveBadge}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={filterProps}
        dashboardType={data.dashboardType}
        setDashboardType={data.setDashboardType}
        esgSection={data.esgSection}
        setEsgSection={data.setEsgSection}
        showDashboardToggle={data.showDashboardToggle}
        showExport
        exportButton={
          <DashboardExportButton
            dashboardType="ghg"
            data={{
              emissions: {
                scope1: totals.scope1,
                scope2: totals.scope2,
                scope3: hasScope3 ? totals.scope3 : 0,
                biogenic: totals.biogenic,
              },
              analytics: stats,
              trends: filteredData.trend,
              previousYear: previousYearTotals,
              targets,
              baseYear: baseYearChart,
            }}
            organization={organization}
            dateRange={dateRange}
            facilities={facilities}
          />
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          <DashboardDataState
            state={dataState}
            recordCount={stats?.record_count}
            windowLabel={dateRangeLabel}
            onReset={resetDashboardFilters}
            onRetry={retryDashboardStats}
          />
          <div className="space-y-0">
          {(dataState === 'data' || dataState === 'confirmed-zero') && <>
          <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4" data-testid="ghg-kpi-row">
            <KpiCard
              title="Net Emissions"
              value={netEmissions}
              deltaPct={trendDeltas.netDelta}
              sparkData={totalSparkData}
              sparkColor="#059669"
              comparisonLabel={comparisonLabel}
              featured
            />
            <KpiCard
              title="Total Emissions"
              value={totals.total}
              deltaPct={trendDeltas.totalDelta}
              sparkData={totalSparkData}
              sparkColor="#10B981"
              comparisonLabel={comparisonLabel}
            />
            <KpiCard
              title="Total Sinks"
              value={sinksTotal}
              deltaPct={trendDeltas.sinksDelta}
              sparkData={[]}
              sparkColor="#0EA5E9"
              invertedColor
              comparisonLabel={comparisonLabel}
            />
            <GaugeCard
              targets={targets}
              selectedTarget={selectedTarget}
              selectedTargetId={selectedTargetId}
              setSelectedTargetId={setSelectedTargetId}
              progressPercentage={targetProgressPct}
              applicabilityLabel={targetApplicabilityLabel}
              reportingPeriodLabel={selectedTarget?.reportingPeriod}
            />
          </div>
          {canShowAnalysis && <>
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
             <SectionCard
              className="lg:col-span-3"
              title={hasScope3 ? 'Scope 1, 2 & 3 Emissions Trend' : 'Scope 1 & 2 Emissions Trend'}
              subtitle={filteredData.annualRecordsAllocated ? 'Annual records are evenly allocated across covered months' : 'Emissions over reporting period'}
              accent="#10B981"
              testId="section-scope-trend"
            >
              <ScopeTrendChart data={filteredData.trend} hasScope3={hasScope3} height={240} />
            </SectionCard>

            <SectionCard
              title="Emissions by Scope"
              subtitle="Share of total"
              accent="#3B82F6"
              testId="section-emissions-by-scope"
            >
              <EmissionsByScopeDonut data={donutData} height={180} />
            </SectionCard>
          </div>

          <div className={`mt-6 grid grid-cols-1 gap-4 ${hasScope3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            <SectionCard title="Facility-wise Emissions" subtitle="Ranked by emissions and share" accent="#34D399" testId="section-facility">
              <FacilityChart facilities={facilitySeries} />
            </SectionCard>

            {hasScope3 && (
              <SectionCard title="Scope 3 Emission Hotspots" subtitle="Ranked category contribution" accent="#8B5CF6" testId="section-scope3-hotspots">
                <Scope3Hotspots data={scope3Hotspots} />
              </SectionCard>
            )}

            <SectionCard title="Emission Categories" subtitle="Ranked by emissions and share" accent="#F59E0B" testId="section-categories">
              <EmissionCategoriesChart data={categoryBreakdown} />
            </SectionCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <SectionCard
              className="lg:col-span-3"
              title="Base year vs selected window"
              subtitle={`Selected reporting window: ${dateRangeLabel}`}
              accent="#0F766E"
              testId="section-base-comparison"
            >
              <BaseYearComparisonChart data={baseYearChart.rows} />
            </SectionCard>

            <SectionCard
              className="lg:col-span-2"
              accent="#EF4444"
              testId="section-heatmap"
              header={
                <div className="flex items-start justify-between w-full">
                  <div>
                    <h3 className="font-heading text-base font-bold text-stone-900">
                      Geographic Heatmap
                    </h3>

                    <p className="mt-1 text-xs font-medium text-stone-500">
                      Facility emission concentration
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHeatmapView('india')}
                      className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                        heatmapView === 'india'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                      data-testid="heatmap-toggle-india"
                    >
                      India
                    </button>

                    <button
                      onClick={() => setHeatmapView('global')}
                      className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                        heatmapView === 'global'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                      data-testid="heatmap-toggle-global"
                    >
                      Global
                    </button>
                  </div>
                </div>
              }
            >
              <GeoHeatmap
                points={heatPoints}
                view={heatmapView}
                height={280}
              />
            </SectionCard>

          </div>
          </>}
          </>}
          </div>
        </>
      )}
    </div>
  );
}
