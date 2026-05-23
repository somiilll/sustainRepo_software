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
import BaseYearSankey from './components/charts/BaseYearSankey';
import GeoHeatmap from './components/charts/GeoHeatmap';
import {
  buildSparklineSeries,
  deriveTrendDeltas,
  buildEmissionsByScope,
  buildFacilitySeries,
  buildScope3Hotspots,
  buildCategoryBreakdown,
  buildSankeyData,
  buildHeatPoints,
} from './services/dataTransformers';

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

  // Targets — fetched once on mount. Errors swallowed (gauge has empty state).
  const [targets, setTargets] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/targets`, { headers: getAuthHeader() });
        if (!cancelled) setTargets(res.data || []);
      } catch { /* leave empty */ }
    })();
    return () => { cancelled = true; };
  }, [getAuthHeader]);

  // --- derived chart data ---
  const totals = filteredData.totals;
  const trendDeltas = useMemo(() => deriveTrendDeltas(filteredData.trend), [filteredData.trend]);
  const totalSparkData = useMemo(() => buildSparklineSeries(filteredData.trend, 'total'), [filteredData.trend]);
  const scope1Spark = useMemo(() => buildSparklineSeries(filteredData.trend, 'scope1'), [filteredData.trend]);
  const scope2Spark = useMemo(() => buildSparklineSeries(filteredData.trend, 'scope2'), [filteredData.trend]);
  const donutData = useMemo(() => buildEmissionsByScope(totals, hasScope3), [totals, hasScope3]);
  const facilitySeries = useMemo(() => buildFacilitySeries(filteredData.facilities), [filteredData.facilities]);
  const scope3Hotspots = useMemo(() => buildScope3Hotspots(stats?.emissions_by_category), [stats]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(stats?.emissions_by_category), [stats]);
  const sankey = useMemo(() => buildSankeyData(baseYearComparison, hasScope3), [baseYearComparison, hasScope3]);
  const heatPoints = useMemo(() => buildHeatPoints(facilities, filteredData.facilities), [facilities, filteredData.facilities]);

  const sinksTotal = filteredData.filteredSinks || 0;
  const netEmissions = (totals.total || 0) - sinksTotal;

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
    <div className="space-y-10 pb-10" data-testid="executive-dashboard">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Executive Dashboard` : 'Executive Dashboard'}
        subtitle={`Reporting window: ${dateRangeLabel}`}
        liveBadge={liveBadge}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={filterProps}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
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
              deltaPct={null}
              sparkData={[]}
              sparkColor="#0EA5E9"
              invertedColor
            />
            <KpiCard
              title="Net Emissions"
              value={netEmissions}
              deltaPct={trendDeltas.totalDelta}
              sparkData={totalSparkData}
              sparkColor="#F59E0B"
            />
            <GaugeCard
              targets={targets}
              baseYearTotal={baseYearComparison?.baseTotal || 0}
              currentTotal={baseYearComparison?.currentTotal || totals.total || 0}
            />
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
            <SectionCard title="Facility-wise Emissions" subtitle="Top contributors" accent="#34D399" testId="section-facility">
              <FacilityChart facilities={facilitySeries} />
            </SectionCard>

            {hasScope3 && (
              <SectionCard title="Scope 3 Emission Hotspots" subtitle="By category" accent="#8B5CF6" testId="section-scope3-hotspots">
                <Scope3Hotspots data={scope3Hotspots} />
              </SectionCard>
            )}

            <SectionCard title="Emission Categories" subtitle="Top categories across scopes" accent="#F59E0B" testId="section-categories">
              <EmissionCategoriesChart data={categoryBreakdown} />
            </SectionCard>
          </div>

          {/* ROW 4: Sankey + Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <SectionCard className="lg:col-span-3" title="Base Year vs Current Year" subtitle="Emissions flow comparison" accent="#0F766E" testId="section-sankey">
              <SankeyWithLabels sankey={sankey} />
            </SectionCard>
            <SectionCard className="lg:col-span-2" title="Geographic Heatmap" subtitle="Facility emission concentration" accent="#EF4444" testId="section-heatmap">
              <GeoHeatmap points={heatPoints} />
            </SectionCard>
          </div>

          {/* Footer freshness */}
          <div className="text-[11px] text-stone-400 flex items-center gap-1.5">
            <Activity className="w-3 h-3" />
            Data refreshed live as new emissions are submitted.
          </div>
        </>
      )}
    </div>
  );
}

// ---- Helpers ----

const SANKEY_SCOPE_COLOR = {
  'Scope 1': '#10B981',
  'Scope 2': '#3B82F6',
  'Scope 3': '#8B5CF6',
  'Biogenic': '#F59E0B',
};

function SideLabelList({ rows = [], align = 'left' }) {
  if (!rows.length) return <div className="h-full" />;
  return (
    <div className={`flex flex-col justify-around h-full gap-2 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      {rows.map((r) => (
        <div key={`${align}-${r.scope}`} className="flex flex-col" data-testid={`sankey-label-${align}-${r.scope.toLowerCase().replace(/\s+/g, '')}`}>
          <div className="flex items-center gap-1.5">
            {align === 'left' && <span className="w-2 h-2 rounded-full" style={{ background: SANKEY_SCOPE_COLOR[r.scope] || '#78716C' }} />}
            <span className="text-[11px] font-semibold text-stone-700">{r.scope}</span>
            {align === 'right' && <span className="w-2 h-2 rounded-full" style={{ background: SANKEY_SCOPE_COLOR[r.scope] || '#78716C' }} />}
          </div>
          <span className="text-[10px] text-stone-500">{r.year}</span>
          <span className="text-xs font-bold text-stone-900 tabular-nums">{r.value.toFixed(2)} <span className="text-[9px] font-normal text-stone-400">tCO₂e</span></span>
        </div>
      ))}
    </div>
  );
}

function SankeyWithLabels({ sankey }) {
  const empty = !sankey?.nodes?.length || !sankey?.links?.length;
  return (
    <div className="grid grid-cols-12 gap-2 items-stretch" style={{ minHeight: 280 }}>
      <div className="col-span-2">
        <SideLabelList rows={sankey?.baseRows || []} align="left" />
      </div>
      <div className="col-span-8">
        <BaseYearSankey nodes={sankey.nodes} links={sankey.links} height={empty ? 260 : 280} />
      </div>
      <div className="col-span-2">
        <SideLabelList rows={sankey?.currentRows || []} align="right" />
      </div>
    </div>
  );
}
