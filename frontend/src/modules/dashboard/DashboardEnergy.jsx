/**
 * Energy Dashboard — Premium KPI cards + 5 charts
 * Reuses esg-analytics + environment-detail APIs (same as DashboardEnvironment).
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
  Zap, TrendingUp, Factory, Leaf, RefreshCw,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ── colours ───────────────────────────────── */
const AMBER  = { 500: '#f59e0b', 400: '#fbbf24' };
const GREEN  = { 500: '#059669', 400: '#34d399' };
const BLUE   = { 500: '#3b82f6' };
const RED    = { 400: '#f87171' };
const PURPLE = { 500: '#8b5cf6' };
const TEAL   = { 500: '#14b8a6' };

const SOURCE_COLORS = [AMBER[500], BLUE[500], RED[400], TEAL[500], PURPLE[500], GREEN[500]];

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

/* ── month label ───────────────────────────── */
function shortMonth(period) {
  if (!period) return '';
  const parts = period.split('-');
  if (parts.length >= 2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(parts[1], 10) - 1] || period;
  }
  return period;
}

/* ══════════════════════════════════════════════ */
export default function DashboardEnergy({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    dateRange, setDateRange, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    isLive,
  } = data;

  const [esgAnalytics, setEsgAnalytics] = useState(null);
  const [envDetail, setEnvDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ── fetch both APIs on filter change ────── */
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
  const energy = esgAnalytics?.energy || [];

  const kpi = useMemo(() => {
    const totalEnergy = energy.reduce((s, e) => s + (e.renewable || 0) + (e.nonRenewable || 0), 0);
    const totalRenewable = energy.reduce((s, e) => s + (e.renewable || 0), 0);
    const renewablePct = totalEnergy > 0 ? Math.min((totalRenewable / totalEnergy) * 100, 100) : 0;

    const revenue = organization?.revenue;
    const production = organization?.production;
    const intensityRevenue = revenue && revenue > 0 ? totalEnergy / revenue : null;
    const intensityProduction = production && production > 0 ? totalEnergy / production : null;

    return {
      total_energy: Math.round(totalEnergy * 100) / 100,
      renewable_pct: Math.round(renewablePct * 10) / 10,
      intensity_revenue: intensityRevenue != null ? Math.round(intensityRevenue * 10000) / 10000 : null,
      intensity_production: intensityProduction != null ? Math.round(intensityProduction * 10000) / 10000 : null,
      currency: organization?.currency || 'INR',
      production_unit: organization?.production_unit || 'MT',
    };
  }, [energy, organization]);

  const monthlyData = useMemo(() =>
    energy.map(e => ({
      label: shortMonth(e.period),
      total: Math.round(((e.renewable || 0) + (e.nonRenewable || 0)) * 100) / 100,
      renewable: Math.round((e.renewable || 0) * 100) / 100,
      non_renewable: Math.round((e.nonRenewable || 0) * 100) / 100,
    })),
  [energy]);

  const intensityTrend = useMemo(() => {
    const revenue = organization?.revenue;
    const production = organization?.production;
    if (!revenue && !production) return [];
    const monthlyRevenue = (revenue || 0) / 12;
    const monthlyProduction = (production || 0) / 12;
    return energy.map(e => {
      const total = (e.renewable || 0) + (e.nonRenewable || 0);
      return {
        label: shortMonth(e.period),
        intensity_revenue: monthlyRevenue > 0 ? Math.round((total / monthlyRevenue) * 10000) / 10000 : null,
        intensity_production: monthlyProduction > 0 ? Math.round((total / monthlyProduction) * 10000) / 10000 : null,
      };
    });
  }, [energy, organization]);

  const sources = envDetail?.energy_source_breakdown || [];
  const facilityBars = envDetail?.facility_energy || [];

  /* ── filter bar props ────────────────────── */
  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  if (!dateRange.from || !dateRange.to) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Energy Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8" data-testid="energy-dashboard">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Energy` : 'Energy Dashboard'}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="energy-kpi-row">
        <PremiumKpiCard
          title="Total Energy Consumed"
          value={kpi.total_energy}
          unit="MWh"
          icon={Zap}
          accentColor="#f59e0b"
          testId="kpi-total-energy"
        />
        <PremiumKpiCard
          title="Energy Intensity (Revenue)"
          value={kpi.intensity_revenue}
          unit={kpi.intensity_revenue != null ? `MWh/${kpi.currency}` : undefined}
          icon={TrendingUp}
          accentColor="#3b82f6"
          placeholder={kpi.intensity_revenue == null ? 'Revenue unavailable' : undefined}
          testId="kpi-intensity-revenue"
        />
        <PremiumKpiCard
          title="Energy Intensity (Production)"
          value={kpi.intensity_production}
          unit={kpi.intensity_production != null ? `MWh/${kpi.production_unit}` : undefined}
          icon={Factory}
          accentColor="#8b5cf6"
          placeholder={kpi.intensity_production == null ? 'Production data unavailable' : undefined}
          testId="kpi-intensity-production"
        />
        <PremiumKpiCard
          title="Renewable Energy %"
          value={kpi.renewable_pct}
          unit="%"
          icon={Leaf}
          accentColor="#059669"
          testId="kpi-renewable-pct"
        />
      </div>

      {/* ── Row 1: Monthly Trend (large) ───── */}
      <SectionCard title="Monthly Energy Consumption Trend" subtitle="Total, Renewable & Non-Renewable" accent={AMBER[500]} testId="section-energy-trend">
        {monthlyData.some(d => d.total > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTotalEnergy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AMBER[500]} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={AMBER[500]} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradRenewEnergy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN[500]} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={GREEN[500]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="total" name="Total Energy" stroke={AMBER[500]} strokeWidth={2.5} fill="url(#gradTotalEnergy)" dot={{ r: 3 }} />
              <Area type="monotone" dataKey="renewable" name="Renewable" stroke={GREEN[500]} strokeWidth={2} fill="url(#gradRenewEnergy)" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="non_renewable" name="Non-Renewable" stroke={RED[400]} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyChart message="No monthly energy data" />}
      </SectionCard>

      {/* ── Row 2: Source Breakdown + Renewable vs Non ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Energy Source Breakdown" subtitle="By source type (MWh)" accent={BLUE[500]} testId="section-source-breakdown">
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
          ) : <EmptyChart message="No source breakdown data" />}
        </SectionCard>

        <SectionCard title="Renewable vs Non-Renewable" subtitle="Monthly comparison" accent={GREEN[500]} testId="section-renew-vs-nonrenew">
          {monthlyData.some(d => d.total > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="renewable" name="Renewable" stackId="a" fill={GREEN[500]} radius={[0, 0, 0, 0]} barSize={24} />
                <Bar dataKey="non_renewable" name="Non-Renewable" stackId="a" fill={RED[400]} radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No monthly data" />}
        </SectionCard>
      </div>

      {/* ── Row 3: Facility Consumption + Intensity Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Facility-wise Energy Consumption" subtitle="Ranked by total consumption (MWh)" accent={PURPLE[500]} testId="section-facility-consumption">
          {facilityBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, facilityBars.length * 44)}>
              <BarChart data={facilityBars} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716c' }} width={100} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-xl">
                      <p className="text-[11px] font-semibold text-stone-700">{d?.name}</p>
                      <p className="text-[11px] text-amber-600">Energy: {d?.total?.toLocaleString()} MWh</p>
                      <p className="text-[11px] text-green-600">Renewable: {d?.renewable_pct}%</p>
                    </div>
                  );
                }} />
                <Bar dataKey="total" name="Total Energy (MWh)" fill={AMBER[500]} radius={[0, 4, 4, 0]} barSize={20}>
                  {facilityBars.map((d, i) => (
                    <Cell key={i} fill={d.renewable_pct > 50 ? GREEN[500] : d.renewable_pct > 20 ? AMBER[500] : RED[400]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No facility data" />}
        </SectionCard>

        <SectionCard title="Energy Intensity Trend" subtitle="Revenue & Production intensity" accent={TEAL[500]} testId="section-intensity-trend">
          {intensityTrend.length > 0 && intensityTrend.some(d => d.intensity_revenue || d.intensity_production) ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={intensityTrend} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="intensity_revenue" name="Revenue Intensity" stroke={BLUE[500]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="intensity_production" name="Production Intensity" stroke={TEAL[500]} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No intensity data — set revenue/production in organization settings" />}
        </SectionCard>
      </div>
    </div>
  );
}
