/**
 * Waste Dashboard — Premium KPI cards + 7 charts
 * Reuses esg-analytics + environment-detail APIs.
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
import {
  Trash2, Recycle, FlameKindling, AlertTriangle, PackageOpen, RefreshCw,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ── colours ───────────────────────────────── */
const STONE  = { 500: '#78716c', 400: '#a8a29e' };
const GREEN  = { 500: '#059669', 400: '#34d399' };
const RED    = { 500: '#ef4444', 400: '#f87171' };
const AMBER  = { 500: '#f59e0b', 400: '#fbbf24' };
const ORANGE = { 500: '#f97316' };
const BLUE   = { 500: '#3b82f6' };
const PURPLE = { 500: '#8b5cf6' };
const TEAL   = { 500: '#14b8a6' };
const ROSE   = { 500: '#f43f5e' };

const COMP_COLORS = [RED[500], AMBER[500], BLUE[500], TEAL[500], PURPLE[500]];

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
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[parseInt(parts[1], 10) - 1] || period;
  }
  return period;
}

/* ── Recovery Gauge ────────────────────────── */
function RecoveryGauge({ percentage, target = 30 }) {
  const pct = Math.min(Math.max(percentage || 0, 0), 100);
  const deg = (pct / 100) * 360;
  const color = pct >= target ? '#059669' : pct >= target * 0.8 ? '#f59e0b' : '#ef4444';
  const label = pct >= target ? 'On Track' : pct >= target * 0.8 ? 'Near Target' : 'Needs Improvement';

  return (
    <div className="flex flex-col items-center gap-4 py-4" data-testid="recovery-gauge">
      <div className="relative w-40 h-40">
        <div className="absolute inset-0 rounded-full border-[14px] border-stone-100" />
        <div
          className="absolute inset-0 rounded-full transition-all duration-1000"
          style={{
            background: `conic-gradient(${color} ${deg}deg, transparent ${deg}deg)`,
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 14px), #000 calc(100% - 14px))',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 14px), #000 calc(100% - 14px))',
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>{pct.toFixed(1)}</span>
          <span className="text-[11px] text-stone-500 -mt-0.5">% Recovered</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <span className="text-[10px] text-stone-400 ml-1">Target: {target}%</span>
      </div>
    </div>
  );
}

/* ── Waste Flow Card ───────────────────────── */
function WasteFlowCard({ hazardous, nonHazardous }) {
  const hazG = hazardous?.generated || 0;
  const hazR = hazardous?.recovered || 0;
  const hazD = hazardous?.disposed || 0;
  const nhazG = nonHazardous?.generated || 0;
  const nhazR = nonHazardous?.recovered || 0;
  const nhazD = nonHazardous?.disposed || 0;
  const totalG = hazG + nhazG;
  if (totalG <= 0) return <EmptyChart message="No waste flow data" />;

  const bars = [
    { label: 'Total Generated', value: totalG, color: STONE[500], pct: 100 },
    { label: 'Hazardous', value: hazG, color: RED[500], pct: (hazG / totalG) * 100 },
    { label: 'Non-Hazardous', value: nhazG, color: AMBER[500], pct: (nhazG / totalG) * 100 },
    { label: 'Recovered', value: hazR + nhazR, color: GREEN[500], pct: ((hazR + nhazR) / totalG) * 100 },
    { label: 'Disposed', value: hazD + nhazD, color: RED[400], pct: ((hazD + nhazD) / totalG) * 100 },
  ];

  return (
    <div className="space-y-3.5 py-2" data-testid="waste-flow">
      {bars.map((b, i) => (
        <div key={b.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-stone-700 flex items-center gap-1.5">
              {i > 0 && <span className="text-stone-300">{i <= 2 ? '↓' : '→'}</span>}
              {b.label}
            </span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: b.color }}>
              {b.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} MT
            </span>
          </div>
          <div className="h-3.5 rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(b.pct, 0.5)}%`, backgroundColor: b.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════ */
export default function DashboardWaste({ data }) {
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

  /* ── derived ─────────────────────────────── */
  const waste = esgAnalytics?.waste || [];
  const haz = envDetail?.hazardous_waste || {};
  const nhaz = envDetail?.non_hazardous_waste || {};
  const wasteMonthly = envDetail?.waste_monthly || [];

  const totals = useMemo(() => {
    const generated = (haz.generated || 0) + (nhaz.generated || 0);
    const recovered = (haz.recovered || 0) + (nhaz.recovered || 0);
    const disposed = (haz.disposed || 0) + (nhaz.disposed || 0);
    const recoveryRate = generated > 0 ? Math.min((recovered / generated) * 100, 100) : 0;
    return { generated, recovered, disposed, recoveryRate };
  }, [haz, nhaz]);

  const monthlyData = useMemo(() =>
    waste.map(w => ({
      label: shortMonth(w.period),
      generated: Math.round((w.generated || 0) * 100) / 100,
      recovered: Math.round((w.recovered || 0) * 100) / 100,
      disposed: Math.round((w.disposed || 0) * 100) / 100,
    })),
  [waste]);

  const compositionData = useMemo(() => {
    const items = [];
    if (haz.generated > 0) items.push({ name: 'Hazardous', value: Math.round(haz.generated) });
    if (nhaz.generated > 0) items.push({ name: 'Non-Hazardous', value: Math.round(nhaz.generated) });
    return items;
  }, [haz, nhaz]);

  const hazNhazMonthly = useMemo(() =>
    wasteMonthly.map(m => ({
      label: shortMonth(m.period),
      hazardous: Math.round((m.haz_generated || 0) * 100) / 100,
      nonHazardous: Math.round((m.nhaz_generated || 0) * 100) / 100,
    })),
  [wasteMonthly]);

  const recoveryTrend = useMemo(() =>
    wasteMonthly.map(m => ({
      label: shortMonth(m.period),
      hazRecovered: Math.round((m.haz_recovered || 0) * 100) / 100,
      nhazRecovered: Math.round((m.nhaz_recovered || 0) * 100) / 100,
    })),
  [wasteMonthly]);

  const disposalTrend = useMemo(() =>
    wasteMonthly.map(m => ({
      label: shortMonth(m.period),
      hazDisposed: Math.round((m.haz_disposed || 0) * 100) / 100,
      nhazDisposed: Math.round((m.nhaz_disposed || 0) * 100) / 100,
    })),
  [wasteMonthly]);

  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  if (!dateRange.from || !dateRange.to) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-stone-500 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Waste Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8" data-testid="waste-dashboard">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Waste` : 'Waste Dashboard'}
        subtitle={`Reporting: ${dateRangeLabel}`}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={{
          facilities, selectedFacilities, setSelectedFacilities,
          dateRange, setDateRange,
          showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
        }}
        showExport={false}
        dashboardType={data.dashboardType}
        setDashboardType={data.setDashboardType}
        esgSection={data.esgSection}
        setEsgSection={data.setEsgSection}
        showDashboardToggle={data.showDashboardToggle}
      />

      {/* ── KPI Row ────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="waste-kpi-row">
        <PremiumKpiCard title="Total Generated" value={Math.round(totals.generated)} unit="MT"
          icon={Trash2} accentColor="#78716c" testId="kpi-waste-generated" />
        <PremiumKpiCard title="Total Recovered" value={Math.round(totals.recovered)} unit="MT"
          icon={Recycle} accentColor="#059669" testId="kpi-waste-recovered" />
        <PremiumKpiCard title="Total Disposed" value={Math.round(totals.disposed)} unit="MT"
          icon={FlameKindling} accentColor="#ef4444" testId="kpi-waste-disposed" />
        <PremiumKpiCard title="Hazardous" value={Math.round(haz.generated || 0)} unit="MT"
          icon={AlertTriangle} accentColor="#f59e0b" testId="kpi-haz-generated" />
        <PremiumKpiCard title="Non-Hazardous" value={Math.round(nhaz.generated || 0)} unit="MT"
          icon={PackageOpen} accentColor="#3b82f6" testId="kpi-nhaz-generated" />
        <PremiumKpiCard title="Recovery Rate" value={Math.round(totals.recoveryRate * 10) / 10} unit="%"
          icon={Recycle} accentColor="#059669" testId="kpi-recovery-rate" />
      </div>

      {/* ── Row 1: Monthly Trend (large) ───── */}
      <SectionCard title="Monthly Waste Trend" subtitle="Generated, Recovered & Disposed" accent={STONE[500]} testId="section-waste-trend">
        {monthlyData.some(d => d.generated > 0 || d.recovered > 0 || d.disposed > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradWasteGen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={STONE[500]} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={STONE[500]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="generated" name="Generated" stroke={STONE[500]} strokeWidth={2.5} fill="url(#gradWasteGen)" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="recovered" name="Recovered" stroke={GREEN[500]} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="disposed" name="Disposed" stroke={RED[500]} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyChart message="No monthly waste data" />}
      </SectionCard>

      {/* ── Row 2: Composition Donut + Haz vs Non-Haz Stacked ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Waste Composition" subtitle="Hazardous vs Non-Hazardous (MT)" accent={AMBER[500]} testId="section-waste-composition">
          {compositionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={compositionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3} strokeWidth={2} stroke="#fff">
                  {compositionData.map((_, i) => <Cell key={i} fill={COMP_COLORS[i % COMP_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No composition data" />}
        </SectionCard>

        <SectionCard title="Hazardous vs Non-Hazardous Trend" subtitle="Monthly generation comparison" accent={RED[500]} testId="section-haz-nhaz-trend">
          {hazNhazMonthly.length > 0 && hazNhazMonthly.some(d => d.hazardous > 0 || d.nonHazardous > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hazNhazMonthly} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="hazardous" name="Hazardous" stackId="a" fill={RED[500]} barSize={24} />
                <Bar dataKey="nonHazardous" name="Non-Hazardous" stackId="a" fill={AMBER[500]} radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No monthly hazardous/non-hazardous data" />}
        </SectionCard>
      </div>

      {/* ── Row 3: Recovery Trend + Disposal Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Waste Recovery Trend" subtitle="Monthly recovered by waste type" accent={GREEN[500]} testId="section-recovery-trend">
          {recoveryTrend.length > 0 && recoveryTrend.some(d => d.hazRecovered > 0 || d.nhazRecovered > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={recoveryTrend} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="hazRecovered" name="Hazardous Recovered" stroke={RED[400]} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="nhazRecovered" name="Non-Haz Recovered" stroke={GREEN[500]} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No recovery trend data" />}
        </SectionCard>

        <SectionCard title="Waste Disposal Trend" subtitle="Monthly disposed by waste type" accent={RED[500]} testId="section-disposal-trend">
          {disposalTrend.length > 0 && disposalTrend.some(d => d.hazDisposed > 0 || d.nhazDisposed > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={disposalTrend} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="hazDisposed" name="Hazardous Disposed" stroke={RED[500]} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="nhazDisposed" name="Non-Haz Disposed" stroke={ORANGE[500]} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No disposal trend data" />}
        </SectionCard>
      </div>

      {/* ── Row 4: Waste Flow + Recovery Gauge ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Waste Flow Overview" subtitle="Generated → Type → Recovery / Disposal" accent={STONE[400]} testId="section-waste-flow">
          <WasteFlowCard hazardous={haz} nonHazardous={nhaz} />
        </SectionCard>

        <SectionCard title="Waste Recovery Performance" subtitle="Recovered vs Target" accent={GREEN[500]} testId="section-recovery-gauge">
          <RecoveryGauge percentage={totals.recoveryRate} target={30} />
        </SectionCard>
      </div>
    </div>
  );
}
