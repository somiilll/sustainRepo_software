/**
 * Water Dashboard — Premium KPI cards + 6 charts
 * Reuses esg-analytics + environment-detail APIs (same pattern as Energy/Environment).
 */
import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell,
} from 'recharts';

import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import { DashboardExportButton } from './pdf-export';
import {
  Droplets, ArrowDownToLine, ArrowUpFromLine, Recycle, RefreshCw, Waves,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ── colours ───────────────────────────────── */
const WATER    = { 500: '#0ea5e9', 400: '#38bdf8', 300: '#7dd3fc' };
const BLUE     = { 500: '#3b82f6', 400: '#60a5fa' };
const INDIGO   = { 500: '#6366f1', 400: '#818cf8' };
const ORANGE   = { 500: '#f97316', 400: '#fb923c' };
const GREEN    = { 500: '#059669', 400: '#34d399' };
const TEAL     = { 500: '#14b8a6', 400: '#2dd4bf' };
const PURPLE   = { 500: '#8b5cf6' };
const ROSE     = { 500: '#f43f5e' };
const SLATE    = { 500: '#64748b' };

const SOURCE_COLORS = [WATER[500], BLUE[500], TEAL[500], GREEN[500], ORANGE[500], PURPLE[500], INDIGO[500], ROSE[500]];

/* ── shared tooltip ────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white/95 backdrop-blur-md p-2.5 shadow-xl text-xs min-w-[140px]">
      {label && <p className="font-semibold text-stone-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="font-semibold text-stone-900">
            {Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
};

function EmptyChart({ message = 'No data available' }) {
  return <div className="flex items-center justify-center h-48 text-xs text-stone-400">{message}</div>;
}

function shortMonth(period) {
  if (!period) return '';
  const parts = period.split('-');
  if (parts.length >= 2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(parts[1], 10) - 1] || period;
  }
  return period;
}

/* ── Water Balance Flow (visual) ───────────── */
function WaterFlowCard({ withdrawn, consumed, discharged, recycled }) {
  const total = withdrawn || 1;
  const bars = [
    { label: 'Withdrawn', value: withdrawn, color: WATER[500], pct: 100 },
    { label: 'Consumed', value: consumed, color: INDIGO[500], pct: (consumed / total) * 100 },
    { label: 'Discharged', value: discharged, color: ORANGE[500], pct: (discharged / total) * 100 },
    { label: 'Recycled', value: recycled, color: GREEN[500], pct: (recycled / total) * 100 },
  ];
  const hasData = withdrawn > 0;

  if (!hasData) return <EmptyChart message="No water flow data" />;

  return (
    <div className="space-y-4 py-2" data-testid="water-flow">
      {bars.map((b, i) => (
        <div key={b.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
              {i > 0 && <span className="text-stone-300">↓</span>}
              {b.label}
            </span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: b.color }}>
              {b.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} KL
            </span>
          </div>
          <div className="h-4 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(b.pct, 0.5)}%`, backgroundColor: b.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Recycling Gauge ───────────────────────── */
function RecyclingGauge({ percentage, target = 50 }) {
  const clampedPct = Math.min(Math.max(percentage || 0, 0), 100);
  const clampedTarget = Math.min(Math.max(target, 0), 100);
  const statusColor = clampedPct >= clampedTarget ? '#059669' : clampedPct >= clampedTarget * 0.8 ? '#f59e0b' : '#ef4444';
  const statusLabel = clampedPct >= clampedTarget ? 'On Track' : clampedPct >= clampedTarget * 0.8 ? 'Near Target' : 'Needs Improvement';
  const deg = (clampedPct / 100) * 360;

  return (
    <div className="flex flex-col items-center gap-4 py-4" data-testid="recycling-gauge">
      <div className="relative w-40 h-40">
        {/* Background circle */}
        <div className="absolute inset-0 rounded-full border-[14px] border-stone-100" />
        {/* Progress arc via conic gradient */}
        <div
          className="absolute inset-0 rounded-full transition-all duration-1000"
          style={{
            background: `conic-gradient(${statusColor} ${deg}deg, transparent ${deg}deg)`,
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 14px), #000 calc(100% - 14px))',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 14px), #000 calc(100% - 14px))',
          }}
        />
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color: statusColor }}>
            {clampedPct.toFixed(1)}
          </span>
          <span className="text-[11px] text-stone-500 -mt-0.5">% Recycled</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
        <span className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
        <span className="text-[10px] text-stone-400 ml-1">Target: {clampedTarget}%</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
export default function DashboardWater({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    dateRange, setDateRange, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
  } = data;

  const [esgAnalytics, setEsgAnalytics] = useState(null);
  const [envDetail, setEnvDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dateRange.from || !dateRange.to) return;
    const start = format(dateRange.from, 'yyyy-MM');
    const end = format(dateRange.to, 'yyyy-MM');
    const facParam = selectedFacilities.length > 0 ? `&facility_ids=${selectedFacilities.join(',')}` : '';
    const headers = getAuthHeader();

    setLoading(true);
    Promise.all([
      axios.get(`${API}/dashboard/esg-analytics?start_date=${start}&end_date=${end}${facParam}`, { headers })
        .then(r => r.data).catch(() => null),
      axios.get(`${API}/dashboard/environment-detail?start_date=${start}&end_date=${end}${facParam}`, { headers })
        .then(r => r.data).catch(() => null),
    ]).then(([analytics, detail]) => {
      setEsgAnalytics(analytics);
      setEnvDetail(detail);
    }).finally(() => setLoading(false));
  }, [dateRange, selectedFacilities, getAuthHeader]);

  /* ── derived data ────────────────────────── */
  const water = esgAnalytics?.water || [];

  const totals = useMemo(() => {
    const withdrawn = water.reduce((s, w) => s + (w.withdrawn || 0), 0);
    const consumed = water.reduce((s, w) => s + (w.consumed || 0), 0);
    const discharged = water.reduce((s, w) => s + (w.discharged || 0), 0);
    const recycled = water.reduce((s, w) => s + (w.recycled || 0), 0);
    const recycledPct = withdrawn > 0 ? Math.min((recycled / withdrawn) * 100, 100) : 0;
    return { withdrawn, consumed, discharged, recycled, recycledPct };
  }, [water]);

  const monthlyData = useMemo(() =>
    water.map(w => ({
      label: shortMonth(w.period),
      withdrawn: Math.round((w.withdrawn || 0) * 100) / 100,
      consumed: Math.round((w.consumed || 0) * 100) / 100,
      discharged: Math.round((w.discharged || 0) * 100) / 100,
      recycled: Math.round((w.recycled || 0) * 100) / 100,
    })),
  [water]);

  const sources = envDetail?.water_sources || [];
  const dischargeSources = envDetail?.water_discharge_sources || [];
  const monthlySourceData = useMemo(() => {
    const raw = envDetail?.water_monthly_sources || [];
    return raw.map(entry => ({ ...entry, label: shortMonth(entry.period) }));
  }, [envDetail]);
  const sourceNames = useMemo(() => {
    if (!monthlySourceData.length) return [];
    const keys = new Set();
    monthlySourceData.forEach(d => Object.keys(d).forEach(k => { if (k !== 'period' && k !== 'label') keys.add(k); }));
    return [...keys];
  }, [monthlySourceData]);

  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  if (!dateRange.from || !dateRange.to) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Water Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8" data-testid="water-dashboard">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Water` : 'Water Dashboard'}
        subtitle={`Reporting: ${dateRangeLabel}`}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={{
          facilities, selectedFacilities, setSelectedFacilities,
          dateRange, setDateRange,
          showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
        }}
        showExport={true}
        exportButton={
          <DashboardExportButton
            dashboardType="water"
            data={{
              water: {
                withdrawn: totals.withdrawn,
                consumed: totals.consumed,
                discharged: totals.discharged,
                recycled: totals.recycled,
              },
              analytics: esgAnalytics,
            }}
            organization={organization}
            dateRange={dateRange}
            facilities={facilities}
          />
        }
        dashboardType={data.dashboardType}
        setDashboardType={data.setDashboardType}
        esgSection={data.esgSection}
        setEsgSection={data.setEsgSection}
        showDashboardToggle={data.showDashboardToggle}
      />

      {/* ── KPI Row ────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="water-kpi-row">
        <PremiumKpiCard
          title="Total Water Withdrawal"
          value={Math.round(totals.withdrawn * 100) / 100}
          unit="KL"
          icon={ArrowDownToLine}
          accentColor="#0ea5e9"
          testId="kpi-water-withdrawal"
        />
        <PremiumKpiCard
          title="Total Water Consumed"
          value={Math.round(totals.consumed * 100) / 100}
          unit="KL"
          icon={Droplets}
          accentColor="#6366f1"
          testId="kpi-water-consumed"
        />
        <PremiumKpiCard
          title="Total Water Discharged"
          value={Math.round(totals.discharged * 100) / 100}
          unit="KL"
          icon={ArrowUpFromLine}
          accentColor="#f97316"
          testId="kpi-water-discharged"
        />
        <PremiumKpiCard
          title="Water Recycled %"
          value={Math.round(totals.recycledPct * 10) / 10}
          unit="%"
          icon={Recycle}
          accentColor="#059669"
          testId="kpi-water-recycled"
        />
      </div>

      {/* ── Row 1: Monthly Trend (large) ───── */}
      <SectionCard title="Monthly Water Trend" subtitle="Withdrawal, Consumption, Discharge & Recycled" accent={WATER[500]} testId="section-water-trend">
        {monthlyData.some(d => d.withdrawn > 0 || d.consumed > 0 || d.discharged > 0 || d.recycled > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradWithdrawn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={WATER[500]} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={WATER[500]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="withdrawn" name="Withdrawn" stroke={WATER[500]} strokeWidth={2.5} fill="url(#gradWithdrawn)" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="consumed" name="Consumed" stroke={INDIGO[500]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="discharged" name="Discharged" stroke={ORANGE[500]} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
              <Line type="monotone" dataKey="recycled" name="Recycled" stroke={GREEN[500]} strokeWidth={2} dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyChart message="No monthly water data recorded" />}
      </SectionCard>

      {/* ── Row 2: Source Donut + Source Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Water Withdrawal by Source" subtitle="Volume by source type (KL)" accent={BLUE[500]} testId="section-water-sources">
          {sources.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={sources} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2} strokeWidth={2} stroke="#fff">
                  {sources.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No water source data recorded" />}
        </SectionCard>

        <SectionCard title="Withdrawal Source Trend" subtitle="Monthly withdrawal by source" accent={TEAL[500]} testId="section-water-source-trend">
          {monthlySourceData.length > 0 && sourceNames.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlySourceData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sourceNames.map((name, i) => (
                  <Area key={name} type="monotone" dataKey={name} name={name} stackId="1"
                    stroke={SOURCE_COLORS[i % SOURCE_COLORS.length]}
                    fill={SOURCE_COLORS[i % SOURCE_COLORS.length]}
                    fillOpacity={0.6} strokeWidth={1.5} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No monthly source breakdown" />}
        </SectionCard>
      </div>

      {/* ── Row 3: Water Flow + Discharge Destinations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Water Flow Overview" subtitle="Withdrawal → Consumption → Discharge → Recycle" accent={WATER[400]} testId="section-water-flow">
          <WaterFlowCard
            withdrawn={totals.withdrawn}
            consumed={totals.consumed}
            discharged={totals.discharged}
            recycled={totals.recycled}
          />
        </SectionCard>

        <SectionCard title="Discharge Destinations" subtitle="Where water is discharged (KL)" accent={ORANGE[500]} testId="section-discharge-dest">
          {dischargeSources.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dischargeSources} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716c' }} width={110} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Discharged (KL)" fill={ORANGE[500]} radius={[0, 4, 4, 0]} barSize={20}>
                  {dischargeSources.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No discharge destination data" />}
        </SectionCard>
      </div>

      {/* ── Row 4: Recycling Gauge + Treated vs Untreated ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Water Recycling Performance" subtitle="Recycled vs Target" accent={GREEN[500]} testId="section-recycling-gauge">
          <RecyclingGauge percentage={totals.recycledPct} target={50} />
        </SectionCard>

        <SectionCard title="Monthly Recycled Volume" subtitle="Water recycled each month (KL)" accent={GREEN[400]} testId="section-monthly-recycled">
          {monthlyData.some(d => d.recycled > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="recycled" name="Recycled (KL)" fill={GREEN[500]} radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No recycling data recorded" />}
        </SectionCard>
      </div>
    </div>
  );
}
