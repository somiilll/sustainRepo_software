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
import { Loader2, Activity, RadioTower } from 'lucide-react';

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
import {
  buildSparklineSeries,
  deriveTrendDeltas,
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
    isLive, lastLiveUpdateAt, getPreviousFinancialYear,
  } = data;

  const [heatmapView, setHeatmapView] = useState('india');
  // Targets — fetched once on mount. Errors swallowed (gauge has empty state).
  const [targets, setTargets] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch GHG targets from esg_targets where category is "GHG Emissions"
        const res = await axios.get(`${API}/esg-targets/with-progress?section=environment&category=GHG Emissions`, { headers: getAuthHeader() });
        if (!cancelled) {
          // Transform esg_targets format to match expected target format for gauge card
          const ghgTargets = (res.data || []).map(t => {
            const baseValue = parseFloat(t.baseline?.value) || 0;
            const targetValue = parseFloat(t.target_value) || 0;
            const currentValue = t.progress?.actual_value;
            
            // Calculate target reduction amount based on target type
            let reductionTarget = 0;
            if (t.target_type === 'percentage') {
              reductionTarget = (baseValue * targetValue) / 100;
            } else if (t.target_type === 'absolute') {
              reductionTarget = baseValue - targetValue;
            }
            
            return {
              id: t.id,
              name: t.name,
              target_mode: 'total', // Simplify to total mode
              target_configuration: {
                base_year: t.baseline?.period,
                base_value: baseValue,
                target_year: t.target_year,
                target_value: targetValue,
                current_value: currentValue,
                reduction_target: reductionTarget,
                progress_percentage: t.progress?.progress_percentage,
                target_type: t.target_type,
                value: t.target_type === 'percentage' ? targetValue : reductionTarget,
              },
              kpi_id: t.kpi_id,
              category: t.category,
              subcategory: t.subcategory,
              // Pre-computed values for easy access
              _baseValue: baseValue,
              _currentValue: currentValue,
              _reductionTarget: reductionTarget,
              _progressPct: t.progress?.progress_percentage,
            };
          });
          setTargets(ghgTargets);
        }
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
  }, [getAuthHeader]);

  const previousYearTotals = usePreviousYearData({
    dateRange,
    selectedFacilities,
    getAuthHeader,
  });
  // --- derived chart data ---
  const totals = filteredData.totals;
  // const trendDeltas = useMemo(() => deriveTrendDeltas(filteredData.trend), [filteredData.trend]);
  const totalSparkData = useMemo(() => buildSparklineSeries(filteredData.trend, 'total'), [filteredData.trend]);
  const scope1Spark = useMemo(() => buildSparklineSeries(filteredData.trend, 'scope1'), [filteredData.trend]);
  const scope2Spark = useMemo(() => buildSparklineSeries(filteredData.trend, 'scope2'), [filteredData.trend]);
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

      return {
        totalDelta: computePct(
          totals.total,
          previousYearTotals?.totalEmissions || 0
        ),

        sinksDelta: computePct(
          filteredData.filteredSinks || 0,
          previousYearTotals?.totalSinks || 0
        ),

        netDelta: computePct(
          currentNetEmissions,
          previousNetEmissions
        ),
      };
  }, [totals, filteredData, previousYearTotals]);

  const sinksTotal = filteredData.filteredSinks || 0;
  const netEmissions = (totals.total || 0) - sinksTotal;

  // target reduction calculation
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const selectedTarget =
    targets.find((t) => t.id === selectedTargetId) ||
    targets?.[0];
  
  // Use base year from selected target if available, otherwise from organization's base year comparison
  const targetBaseValue = selectedTarget?._baseValue;
  const hasTargetBaseYear = targetBaseValue != null && targetBaseValue > 0;
  const hasOrgBaseYear = baseYearComparison?.baseTotal != null && baseYearComparison?.baseTotal > 0;
  const hasBaseYear = hasTargetBaseYear || hasOrgBaseYear;
  
  // Prefer target's base value, fallback to org's base year
  const baseYearTotal = hasTargetBaseYear ? targetBaseValue : (hasOrgBaseYear ? baseYearComparison.baseTotal : null);
  
  // Use current value from target progress if available
  const currentYearTotal = selectedTarget?._currentValue ?? 
    baseYearComparison?.currentTotal ??
    totals.total ??
    0;

  const achievedReduction = hasBaseYear
    ? Math.max(baseYearTotal - currentYearTotal, 0)
    : 0;

  // Use pre-computed reduction target from ESG targets
  let targetReduction = hasBaseYear ? (selectedTarget?._reductionTarget || 0) : null;

  // Fallback to manual calculation for legacy targets
  if (!targetReduction && selectedTarget?.target_configuration) {
    const config = selectedTarget.target_configuration;
    if (config.target_type === 'percentage' || config.target_type === '%') {
      targetReduction = ((config.value || 0) * baseYearTotal) / 100;
    } else {
      targetReduction = config.value || 0;
    }
  }

    const reductionAchievedPct = hasBaseYear && targetReduction > 0
    ? (achievedReduction / targetReduction) * 100
    : null;

  const dateRangeLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  const filterProps = {
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    getPreviousFinancialYear,
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
    <div className="space-y-6 pb-0" data-testid="executive-dashboard">
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
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          <div className="space-y-4">
          {/* ROW 1: KPI cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard
              title="Total Emissions"
              value={totals.total}
              deltaPct={trendDeltas.totalDelta}
              sparkData={totalSparkData}
              sparkColor="#10B981"
            />
            <KpiCard
              title="Total Sinks"
              value={sinksTotal}
              deltaPct={trendDeltas.sinksDelta}
              sparkData={[]}
              sparkColor="#0EA5E9"
              invertedColor
            />
            <KpiCard
              title="Net Emissions"
              value={netEmissions}
              deltaPct={trendDeltas.netDelta}
              sparkData={totalSparkData}
              sparkColor="#F59E0B"
            />
           {!hasBaseYear ? (
              <div className="flex items-center justify-center h-full text-xs text-stone-500 border border-dashed border-stone-200 rounded-xl p-4">
                Define Base Year for organization to enable target tracking
              </div>
            ) : (
              <GaugeCard
                targets={targets}
                selectedTarget={selectedTarget}
                selectedTargetId={selectedTargetId}
                setSelectedTargetId={setSelectedTargetId}
                baseYearTotal={baseYearTotal}
                currentTotal={currentYearTotal}
                targetReduction={targetReduction}
                reductionAchievedPct={reductionAchievedPct}
              />
            )}
          </div>

          {/* ROW 2: Trend + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
             <SectionCard
              className="lg:col-span-3"
              title={hasScope3 ? 'Scope 1, 2 & 3 Emissions Trend' : 'Scope 1 & 2 Emissions Trend'}
              subtitle="Emissions over reporting period"
              accent="#10B981"
              testId="section-scope-trend"
            >
              <ScopeTrendChart data={filteredData.trend} hasScope3={hasScope3} />
            </SectionCard>

            <SectionCard
              title="Emissions by Scope"
              subtitle="Share of total"
              accent="#3B82F6"
              testId="section-emissions-by-scope"
            >
              <EmissionsByScopeDonut data={donutData} />
            </SectionCard>
          </div>

          {/* ROW 3: Operational hotspots */}
          <div className={`grid grid-cols-1 ${hasScope3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-3`}>
            <SectionCard title="Facility-wise Emissions" subtitle="Top contributors" accent="#34D399" testId="section-facility" contentClassName="pb-0">
              <FacilityChart facilities={facilitySeries} />
            </SectionCard>

            {hasScope3 && (
              <SectionCard title="Scope 3 Emission Hotspots" subtitle="By category" accent="#8B5CF6" testId="section-scope3-hotspots" contentClassName="pb-0">
                <Scope3Hotspots data={scope3Hotspots} />
              </SectionCard>
            )}

            <SectionCard title="Emission Categories" subtitle="Top categories across scopes" accent="#F59E0B" testId="section-categories" contentClassName="pr-2">
              <EmissionCategoriesChart data={categoryBreakdown} />
            </SectionCard>
          </div>

          {/* ROW 4: BaseYearChart + Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <SectionCard
              className="lg:col-span-3"
              title="Base Year vs Current Year"
              subtitle="Emissions comparison by scope"
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
                    <h3 className="text-sm font-semibold text-stone-900">
                      Geographic Heatmap
                    </h3>

                    <p className="text-xs text-stone-500 mt-0.5">
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
              />
            </SectionCard>

          </div>
          </div>
        </>
      )}
    </div>
  );
}
