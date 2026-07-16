/**
 * DashboardEnvironment — Premium Environment Performance Dashboard
 *
 * Row 1: 7 KPI Cards (Emissions, Net Emissions, Energy, Water, Water Recycled%, Waste, Waste Recovered%)
 * Row 2: Scope Contribution (stacked horizontal bar) + Emission Hotspots (Treemap)
 * Row 3: Scope Explorer (tabs: Scope 1/2/3 with horizontal bars)
 * Row 4: Energy (Stacked Column + Renewable% Line + Intensity Line)
 * Row 5: Water (Balance Flow + Sources Bar + Recycling% Line)
 * Row 6: Waste (Overview + Hazardous + Non-Hazardous stacked bars)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Treemap, Cell, Legend, ComposedChart, Area,
} from 'recharts';

import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import { useIntensityData, useIntensityCalculations, usePrevYearIntensity } from './hooks/useIntensityData';
import {
  Leaf, Zap, Droplets, Trash2, FlameKindling, CloudSun,
  Recycle, RefreshCw, RadioTower,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ── colour palette ────────────────────────────── */
const SCOPE_COLORS = { scope1: '#059669', scope2: '#0ea5e9', scope3: '#f59e0b' };
const S1_COLORS = ['#059669', '#34d399', '#6ee7b7', '#a7f3d0'];
const S2_COLORS = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'];
const S3_COLORS = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#d97706', '#b45309', '#92400e'];
const TREEMAP_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const ENERGY_COLORS = { renewable: '#059669', nonRenewable: '#f59e0b' };
const WATER_COLORS = { withdrawn: '#0ea5e9', consumed: '#6366f1', discharged: '#f97316', recycled: '#059669' };
const WASTE_COLORS = { generated: '#78716c', recovered: '#059669', disposed: '#ef4444' };

/* ── shared tooltip ────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white/95 backdrop-blur-md p-2.5 shadow-xl text-xs min-w-[140px]">
      <p className="font-semibold text-stone-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-stone-900">{Number(p.value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        </div>
      ))}
    </div>
  );
};

/* ── treemap custom content ────────────────────── */
const TreemapContent = ({ x, y, width, height, name, value, index }) => {
  if (width < 30 || height < 20) return null;
  const color = TREEMAP_COLORS[index % TREEMAP_COLORS.length];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={color} fillOpacity={0.85}
        stroke="#fff" strokeWidth={2} className="transition-all duration-200 hover:fill-opacity-100" />
      {width > 50 && height > 35 && (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fontWeight={600} fill="#fff">{name}</text>
          <text x={x + 6} y={y + 30} fontSize={10} fill="rgba(255,255,255,0.8)">
            {Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} tCO₂e
          </text>
        </>
      )}
    </g>
  );
};

/* ── horizontal bar sub-component ──────────────── */
function HorizontalBarSection({ data, colors, unit = 'tCO₂e', maxValue }) {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((item, i) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <div key={item.name} data-testid={`hbar-${item.key || item.name}`}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-stone-700">{item.name}</span>
              <span className="text-xs font-semibold text-stone-900 tabular-nums">
                {Number(item.value).toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit}
              </span>
            </div>
            <div className="h-3 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: colors[i % colors.length] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Scope Contribution stacked bar ───────────── */
function ScopeContributionCard({ scope1, scope2, scope3 }) {
  const scopes = [
    { label: 'Scope 1', data: scope1, colors: S1_COLORS, color: SCOPE_COLORS.scope1 },
    { label: 'Scope 2', data: scope2, colors: S2_COLORS, color: SCOPE_COLORS.scope2 },
    { label: 'Scope 3 Upstream', data: scope3?.upstream || [], colors: S3_COLORS, color: SCOPE_COLORS.scope3 },
  ];
  const total = (d) => d.reduce((s, i) => s + i.value, 0);

  return (
    <div className="space-y-5" data-testid="scope-contribution">
      {scopes.map((scope) => {
        const t = total(scope.data);
        if (t <= 0) return null;
        return (
          <div key={scope.label}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stone-800">{scope.label}</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: scope.color }}>
                {t.toLocaleString(undefined, { maximumFractionDigits: 0 })} tCO₂e
              </span>
            </div>
            {/* Stacked horizontal bar */}
            <div className="h-6 rounded-full bg-stone-100 overflow-hidden flex">
              {scope.data.filter(d => d.value > 0).map((d, i) => {
                const pct = (d.value / t) * 100;
                return (
                  <div
                    key={d.name}
                    className="h-full relative group cursor-pointer transition-opacity hover:opacity-80"
                    style={{ width: `${pct}%`, backgroundColor: scope.colors[i % scope.colors.length] }}
                    title={`${d.name}: ${d.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} tCO₂e (${pct.toFixed(1)}%)`}
                  >
                    {pct > 12 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white truncate px-1">
                        {d.name.replace('Purchased ', '')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {scope.data.filter(d => d.value > 0).map((d, i) => (
                <span key={d.name} className="flex items-center gap-1 text-[10px] text-stone-500">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: scope.colors[i % scope.colors.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Scope Explorer with tabs ──────────────────── */
function ScopeExplorerCard({ scope1, scope2, scope3Upstream, scope3Downstream }) {
  const [tab, setTab] = useState('scope1');
  const tabs = [
    { key: 'scope1', label: 'Scope 1', color: SCOPE_COLORS.scope1 },
    { key: 'scope2', label: 'Scope 2', color: SCOPE_COLORS.scope2 },
    { key: 'scope3', label: 'Scope 3', color: SCOPE_COLORS.scope3 },
  ];

  const activeColors = tab === 'scope1' ? S1_COLORS : tab === 'scope2' ? S2_COLORS : S3_COLORS;
  const getData = () => {
    if (tab === 'scope1') return scope1;
    if (tab === 'scope2') return scope2;
    return null; // scope3 renders differently
  };

  return (
    <div data-testid="scope-explorer">
      <div className="flex items-center gap-1 mb-4 border-b border-stone-100 pb-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100'
            }`}
            style={tab === t.key ? { backgroundColor: t.color } : {}}
            data-testid={`scope-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'scope3' ? (
        <HorizontalBarSection data={getData() || []} colors={activeColors} />
      ) : (
        <div className="space-y-4">
          {scope3Upstream.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Upstream</h4>
              <HorizontalBarSection data={scope3Upstream} colors={S3_COLORS} />
            </div>
          )}
          {scope3Downstream.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Downstream</h4>
              <HorizontalBarSection data={scope3Downstream} colors={S3_COLORS.slice(3)} />
            </div>
          )}
          {scope3Upstream.length === 0 && scope3Downstream.length === 0 && (
            <p className="text-xs text-stone-400 text-center py-6">No Scope 3 data available</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Water Balance Flow ────────────────────────── */
function WaterBalanceCard({ data }) {
  const waterFlow = useMemo(() => {
    const months = data || [];
    const totals = {
      withdrawn: months.reduce((s, m) => s + (m.withdrawn || 0), 0),
      consumed: months.reduce((s, m) => s + (m.consumed || 0), 0),
      discharged: months.reduce((s, m) => s + (m.discharged || 0), 0),
      recycled: months.reduce((s, m) => s + (m.recycled || 0), 0),
    };
    return [
      { name: 'Withdrawn', value: totals.withdrawn, color: WATER_COLORS.withdrawn },
      { name: 'Consumed', value: totals.consumed, color: WATER_COLORS.consumed },
      { name: 'Discharged', value: totals.discharged, color: WATER_COLORS.discharged },
      { name: 'Recycled', value: totals.recycled, color: WATER_COLORS.recycled },
    ];
  }, [data]);

  const maxVal = Math.max(...waterFlow.map(d => d.value), 1);
  const hasData = waterFlow.some(d => d.value > 0);

  if (!hasData) {
    return <p className="text-xs text-stone-400 text-center py-10">No water data recorded yet</p>;
  }

  return (
    <div className="space-y-3" data-testid="water-balance">
      {waterFlow.map((item, i) => (
        <div key={item.name}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
              {i > 0 && <span className="text-stone-300">↓</span>}
              {item.name}
            </span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: item.color }}>
              {item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} KL
            </span>
          </div>
          <div className="h-4 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.value / maxVal) * 100}%`, backgroundColor: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Empty State ───────────────────────────────── */
function EmptyChart({ message = 'No data available' }) {
  return (
    <div className="flex items-center justify-center h-48 text-xs text-stone-400">
      {message}
    </div>
  );
}

/* ── Month label formatter ─────────────────────── */
function shortMonth(period) {
  if (!period) return '';
  const parts = period.split('-');
  if (parts.length >= 2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(parts[1], 10) - 1] || period;
  }
  return period;
}


/* ════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════ */
export default function DashboardEnvironment({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    stats, loading, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    filteredData, isLive,
  } = data;

  const [envDetail, setEnvDetail] = useState(null);
  const [envDetailLoading, setEnvDetailLoading] = useState(true);
  const [esgAnalytics, setEsgAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Fetch both APIs when date/facility changes
  useEffect(() => {
    if (!dateRange.from || !dateRange.to) return;
    const start = format(dateRange.from, 'yyyy-MM');
    const end = format(dateRange.to, 'yyyy-MM');
    const facParam = selectedFacilities.length > 0 ? `&facility_ids=${selectedFacilities.join(',')}` : '';
    const headers = getAuthHeader();

    setEnvDetailLoading(true);
    setAnalyticsLoading(true);

    axios.get(`${API}/dashboard/environment-detail?start_date=${start}&end_date=${end}${facParam}`, { headers })
      .then(r => setEnvDetail(r.data))
      .catch(() => setEnvDetail(null))
      .finally(() => setEnvDetailLoading(false));

    axios.get(`${API}/dashboard/esg-analytics?start_date=${start}&end_date=${end}${facParam}`, { headers })
      .then(r => setEsgAnalytics(r.data))
      .catch(() => setEsgAnalytics(null))
      .finally(() => setAnalyticsLoading(false));
  }, [dateRange, selectedFacilities, getAuthHeader]);

  // Derived data from esg-analytics
  const emissions = esgAnalytics?.emissions || [];
  const energy = esgAnalytics?.energy || [];
  const water = esgAnalytics?.water || [];
  const waste = esgAnalytics?.waste || [];

  // KPI totals
  const kpiTotals = useMemo(() => {
    const totalEmissions = emissions.reduce((s, e) => s + (e.scope1 || 0) + (e.scope2 || 0) + (e.scope3 || 0), 0);
    const prevTotal = emissions.reduce((s, e) => s + (e.previousTotal || 0), 0);
    const totalEnergy = energy.reduce((s, e) => s + (e.renewable || 0) + (e.nonRenewable || 0), 0);
    const totalRenewable = energy.reduce((s, e) => s + (e.renewable || 0), 0);
    const totalWaterWithdrawn = water.reduce((s, e) => s + (e.withdrawn || 0), 0);
    const totalWaterRecycled = water.reduce((s, e) => s + (e.recycled || 0), 0);
    const totalWaterConsumed = water.reduce((s, e) => s + (e.consumed || 0), 0);
    const totalWaterDischarged = water.reduce((s, e) => s + (e.discharged || 0), 0);
    const totalWasteGenerated = waste.reduce((s, e) => s + (e.generated || 0), 0);
    const totalWasteRecovered = waste.reduce((s, e) => s + (e.recovered || 0), 0);

    const pctChange = (curr, prev) => prev > 0 ? ((curr - prev) / prev) * 100 : null;
    const safePct = (num, den) => den > 0 ? Math.min((num / den) * 100, 100) : 0;

    return {
      totalEmissions,
      netEmissions: totalEmissions,
      prevTotal,
      emissionsChange: pctChange(totalEmissions, prevTotal),
      totalEnergy,
      renewablePct: totalEnergy > 0 ? Math.min((totalRenewable / totalEnergy) * 100, 100) : 0,
      totalWaterWithdrawn,
      totalWaterRecycled,
      waterRecycledPct: safePct(totalWaterRecycled, totalWaterWithdrawn),
      totalWasteGenerated,
      wasteRecoveredPct: safePct(totalWasteRecovered, totalWasteGenerated),
    };
  }, [emissions, energy, water, waste]);

  // Chart data formatters
  const energyChartData = useMemo(() =>
    energy.map(e => ({ period: shortMonth(e.period), renewable: e.renewable || 0, nonRenewable: e.nonRenewable || 0 })),
  [energy]);

  const renewablePctData = useMemo(() =>
    energy.map(e => {
      const total = (e.renewable || 0) + (e.nonRenewable || 0);
      return { period: shortMonth(e.period), pct: total > 0 ? ((e.renewable || 0) / total) * 100 : 0 };
    }),
  [energy]);

  const energyIntensityData = useMemo(() => {
    let cumulativeEnergy = 0;
    return energy.map((e, i) => {
      cumulativeEnergy += (e.renewable || 0) + (e.nonRenewable || 0);
      return { period: shortMonth(e.period), intensity: cumulativeEnergy / (i + 1) };
    });
  }, [energy]);

  const wasteChartData = useMemo(() =>
    waste.map(w => ({
      period: shortMonth(w.period),
      generated: w.generated || 0,
      recovered: w.recovered || 0,
      disposed: w.disposed || 0,
    })),
  [waste]);

  const waterRecyclePctData = useMemo(() =>
    water.map(w => {
      const wthdrn = w.withdrawn || 0;
      return { period: shortMonth(w.period), pct: wthdrn > 0 ? ((w.recycled || 0) / wthdrn) * 100 : 0 };
    }),
  [water]);

  // Filter props
  const filterProps = {
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
  };

  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  const liveBadge = isLive ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 border border-emerald-200 rounded-full px-2 py-0.5">
      <RadioTower className="w-3 h-3" /> Live
    </span>
  ) : null;

  const isLoading = loading || envDetailLoading || analyticsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Environment Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="dashboard-environment">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Environment` : 'Environment Dashboard'}
        subtitle={`Reporting: ${dateRangeLabel}`}
        liveBadge={liveBadge}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={filterProps}
        showExport={false}
        dashboardType={data.dashboardType}
        setDashboardType={data.setDashboardType}
        esgSection={data.esgSection}
        setEsgSection={data.setEsgSection}
        showDashboardToggle={data.showDashboardToggle}
      />

      {/* ── ROW 1: KPI CARDS ─────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="env-kpi-row">
        <PremiumKpiCard title="Total Emissions" value={kpiTotals.totalEmissions} unit="tCO₂e"
          yoyChange={kpiTotals.emissionsChange} icon={CloudSun} accentColor="#059669" loading={false} />
        <PremiumKpiCard title="Net Emissions" value={kpiTotals.netEmissions} unit="tCO₂e"
          icon={Leaf} accentColor="#10b981" loading={false} />
        <PremiumKpiCard title="Energy Consumed" value={kpiTotals.totalEnergy} unit="MWh"
          icon={Zap} accentColor="#f59e0b" loading={false} />
        <PremiumKpiCard title="Water Withdrawal" value={kpiTotals.totalWaterWithdrawn} unit="KL"
          icon={Droplets} accentColor="#0ea5e9" loading={false} />
        <PremiumKpiCard title="Water Recycled" value={kpiTotals.waterRecycledPct} unit="%"
          icon={Recycle} accentColor="#06b6d4" loading={false} invertedTrend={false} />
        <PremiumKpiCard title="Waste Generated" value={kpiTotals.totalWasteGenerated} unit="MT"
          icon={Trash2} accentColor="#78716c" loading={false} />
        <PremiumKpiCard title="Waste Recovered" value={kpiTotals.wasteRecoveredPct} unit="%"
          icon={FlameKindling} accentColor="#059669" loading={false} invertedTrend={false} />
      </div>

      {/* ── ROW 2: SCOPE CONTRIBUTION + HOTSPOTS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Scope Contribution" subtitle="Emission composition by scope" accent="#059669" testId="section-scope-contribution">
          <ScopeContributionCard
            scope1={envDetail?.scope1_breakdown || []}
            scope2={envDetail?.scope2_breakdown || []}
            scope3={{ upstream: envDetail?.scope3_upstream || [], downstream: envDetail?.scope3_downstream || [] }}
          />
        </SectionCard>

        <SectionCard title="Emission Hotspots" subtitle="Largest emission contributors" accent="#ef4444" testId="section-emission-hotspots">
          {(envDetail?.hotspots || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <Treemap
                data={envDetail.hotspots}
                dataKey="value"
                nameKey="name"
                content={<TreemapContent />}
              >
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-stone-200 bg-white/95 backdrop-blur-md p-2.5 shadow-xl text-xs">
                        <p className="font-semibold text-stone-800">{d.name}</p>
                        <p className="text-stone-600">{Number(d.value).toLocaleString(undefined, { maximumFractionDigits: 1 })} tCO₂e</p>
                      </div>
                    );
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No emission data for this period" />
          )}
        </SectionCard>
      </div>

      {/* ── ROW 3: SCOPE EXPLORER ─────────────────── */}
      <SectionCard title="Scope Explorer" subtitle="Drill into emission sources by scope" accent="#3b82f6" testId="section-scope-explorer">
        <ScopeExplorerCard
          scope1={envDetail?.scope1_breakdown || []}
          scope2={envDetail?.scope2_breakdown || []}
          scope3Upstream={envDetail?.scope3_upstream || []}
          scope3Downstream={envDetail?.scope3_downstream || []}
        />
      </SectionCard>

      {/* ── ROW 4: ENERGY ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Energy Consumption" subtitle="Monthly renewable vs non-renewable" accent="#f59e0b" testId="section-energy-consumption">
          {energyChartData.some(d => d.renewable > 0 || d.nonRenewable > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={energyChartData} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="renewable" name="Renewable" stackId="a" fill={ENERGY_COLORS.renewable} radius={[0, 0, 0, 0]} />
                <Bar dataKey="nonRenewable" name="Non-Renewable" stackId="a" fill={ENERGY_COLORS.nonRenewable} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No energy data recorded yet" />
          )}
        </SectionCard>

        <SectionCard title="Renewable Energy %" subtitle="Monthly renewable share" accent="#059669" testId="section-renewable-pct">
          {renewablePctData.some(d => d.pct > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={renewablePctData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={35} domain={[0, 100]} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <Area dataKey="pct" name="Renewable %" fill="#05966920" stroke="#059669" strokeWidth={2} dot={{ r: 3, fill: '#059669' }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No renewable energy data" />
          )}
        </SectionCard>

        <SectionCard title="Energy Intensity" subtitle="Avg MWh per month (rolling)" accent="#d97706" testId="section-energy-intensity">
          {energyIntensityData.some(d => d.intensity > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={energyIntensityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<ChartTooltip />} />
                <Line dataKey="intensity" name="Intensity (MWh)" stroke="#d97706" strokeWidth={2} dot={{ r: 3, fill: '#d97706' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No energy intensity data" />
          )}
        </SectionCard>
      </div>

      {/* ── ROW 5: WATER ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Water Balance" subtitle="Withdrawal → Consumption → Discharge → Recycle" accent="#0ea5e9" testId="section-water-balance">
          <WaterBalanceCard data={water} />
        </SectionCard>

        <SectionCard title="Water Withdrawal Sources" subtitle="Breakdown by source type" accent="#3b82f6" testId="section-water-sources">
          {(envDetail?.water_sources || []).length > 0 ? (
            <HorizontalBarSection
              data={envDetail.water_sources}
              colors={['#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7']}
              unit="KL"
            />
          ) : (
            <EmptyChart message="No water source data recorded" />
          )}
        </SectionCard>

        <SectionCard title="Water Recycling %" subtitle="Monthly recycling rate" accent="#06b6d4" testId="section-water-recycle-pct">
          {waterRecyclePctData.some(d => d.pct > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={waterRecyclePctData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={35} domain={[0, 100]} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <Area dataKey="pct" name="Recycling %" fill="#06b6d420" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: '#06b6d4' }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No water recycling data" />
          )}
        </SectionCard>
      </div>

      {/* ── ROW 6: WASTE ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Waste Overview" subtitle="Generated vs recovered vs disposed" accent="#78716c" testId="section-waste-overview">
          {wasteChartData.some(d => d.generated > 0 || d.recovered > 0 || d.disposed > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={wasteChartData} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="generated" name="Generated" stackId="w" fill={WASTE_COLORS.generated} />
                <Bar dataKey="recovered" name="Recovered" stackId="w" fill={WASTE_COLORS.recovered} />
                <Bar dataKey="disposed" name="Disposed" stackId="w" fill={WASTE_COLORS.disposed} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No waste data recorded yet" />
          )}
        </SectionCard>

        <SectionCard title="Hazardous Waste" subtitle="Generated / recovered / disposed" accent="#ef4444" testId="section-hazardous-waste">
          {(envDetail?.hazardous_waste?.generated || 0) > 0 ? (
            <HorizontalBarSection
              data={[
                { name: 'Generated', key: 'generated', value: envDetail.hazardous_waste.generated },
                { name: 'Recovered', key: 'recovered', value: envDetail.hazardous_waste.recovered },
                { name: 'Disposed', key: 'disposed', value: envDetail.hazardous_waste.disposed },
              ]}
              colors={['#78716c', '#059669', '#ef4444']}
              unit="MT"
            />
          ) : (
            <EmptyChart message="No hazardous waste data" />
          )}
        </SectionCard>

        <SectionCard title="Non-Hazardous Waste" subtitle="Generated / recovered / disposed" accent="#a3a3a3" testId="section-nonhaz-waste">
          {(envDetail?.non_hazardous_waste?.generated || 0) > 0 ? (
            <HorizontalBarSection
              data={[
                { name: 'Generated', key: 'generated', value: envDetail.non_hazardous_waste.generated },
                { name: 'Recovered', key: 'recovered', value: envDetail.non_hazardous_waste.recovered },
                { name: 'Disposed', key: 'disposed', value: envDetail.non_hazardous_waste.disposed },
              ]}
              colors={['#78716c', '#059669', '#ef4444']}
              unit="MT"
            />
          ) : (
            <EmptyChart message="No non-hazardous waste data" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
