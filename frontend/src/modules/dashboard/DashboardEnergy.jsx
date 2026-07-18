/**
 * Energy Dashboard — Premium KPI cards + 5 charts
 * Follows the same design language as Social/Environment dashboards.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell,
  ComposedChart,
} from 'recharts';

import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import {
  Zap, Flame, Droplets, Leaf, TrendingUp, Factory, Sun, BarChart3,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ── colours ───────────────────────────────── */
const AMBER = { 500: '#f59e0b', 400: '#fbbf24', 300: '#fcd34d', 200: '#fde68a' };
const GREEN = { 500: '#059669', 400: '#34d399', 300: '#6ee7b7', 200: '#a7f3d0' };
const BLUE  = { 500: '#3b82f6', 400: '#60a5fa', 300: '#93c5fd' };
const RED   = { 500: '#ef4444', 400: '#f87171' };
const PURPLE = { 500: '#8b5cf6', 400: '#a78bfa' };
const TEAL  = { 500: '#14b8a6', 400: '#2dd4bf' };

const SOURCE_COLORS = [AMBER[500], BLUE[500], RED[500], TEAL[500], PURPLE[500], GREEN[500]];

/* ── shared tooltip ────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-xl">
      {label && <p className="text-[11px] font-semibold text-stone-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-[11px]" style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-semibold">{Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </p>
      ))}
    </div>
  );
};

function EmptyChart({ message = 'No data available' }) {
  return <div className="flex items-center justify-center h-48 text-xs text-stone-400">{message}</div>;
}

/* ── skeleton ──────────────────────────────── */
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" data-testid="energy-dashboard-loading">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-stone-100" />)}
      </div>
      <div className="h-72 rounded-xl bg-stone-100" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-64 rounded-xl bg-stone-100" />)}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
export default function DashboardEnergy({ data }) {
  const {
    token, dateRange, setDateRange, reportingYear,
    selectedFacilities, setSelectedFacilities, facilities, organization
  } = data;

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!dateRange.from || !dateRange.to) return;
    const params = new URLSearchParams({
      start_date: dateRange.from.toISOString(),
      end_date: dateRange.to.toISOString(),
    });
    if (selectedFacilities?.length) params.set('facility_ids', selectedFacilities.join(','));

    setLoading(true);
    axios.get(`${API}/dashboard/energy-detail?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setDetail(res.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [token, dateRange, selectedFacilities]);

  if (!dateRange.from || !dateRange.to) return null;

  const kpi = detail?.kpi || {};
  const monthly = detail?.monthly_trend || [];
  const sources = detail?.source_breakdown || [];
  const facilityBars = detail?.facility_consumption || [];
  const intensity = detail?.intensity_trend || [];

  return (
    <div className="space-y-6 pb-8" data-testid="energy-dashboard">
      <StickyFilterBar
        dateRange={dateRange} setDateRange={setDateRange}
        selectedFacilities={selectedFacilities} setSelectedFacilities={setSelectedFacilities}
        facilities={facilities} reportingYear={reportingYear}
        showFilters={showFilters} setShowFilters={setShowFilters}
        // title="Energy" subtitle="Consumption, sources & intensity"
        title={organization?.name ? `${organization.name} · Energy` : 'Energy Dashboard'}
      />

      {loading ? <DashboardSkeleton /> : (
        <>
          {/* ── KPI Row ────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="energy-kpi-row">
            <PremiumKpiCard
              title="Total Energy Consumed"
              value={kpi.total_energy}
              unit="MWh"
              icon={Zap}
              color="amber"
              testId="kpi-total-energy"
            />
            <PremiumKpiCard
              title="Energy Intensity (Revenue)"
              value={kpi.intensity_revenue}
              unit={kpi.intensity_revenue != null ? `MWh/${kpi.currency || 'INR'}` : undefined}
              icon={TrendingUp}
              color="blue"
              placeholder={kpi.intensity_revenue == null ? 'Revenue unavailable' : undefined}
              testId="kpi-intensity-revenue"
            />
            <PremiumKpiCard
              title="Energy Intensity (Production)"
              value={kpi.intensity_production}
              unit={kpi.intensity_production != null ? `MWh/${kpi.production_unit || 'MT'}` : undefined}
              icon={Factory}
              color="purple"
              placeholder={kpi.intensity_production == null ? 'Production data unavailable' : undefined}
              testId="kpi-intensity-production"
            />
            <PremiumKpiCard
              title="Renewable Energy %"
              value={kpi.renewable_pct}
              unit="%"
              icon={Leaf}
              color="green"
              testId="kpi-renewable-pct"
            />
          </div>

          {/* ── Row 1: Monthly Trend (large) ───── */}
          <SectionCard title="Monthly Energy Consumption Trend" subtitle="Total, Renewable & Non-Renewable" accent={AMBER[500]} testId="section-energy-trend">
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthly} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AMBER[500]} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={AMBER[500]} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradRenew" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GREEN[500]} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={GREEN[500]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="total" name="Total Energy" stroke={AMBER[500]} strokeWidth={2.5} fill="url(#gradTotal)" dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="renewable" name="Renewable" stroke={GREEN[500]} strokeWidth={2} fill="url(#gradRenew)" dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="non_renewable" name="Non-Renewable" stroke={RED[400]} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart message="No monthly energy data" />}
          </SectionCard>

          {/* ── Row 2: Source Breakdown + Renewable vs Non ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Energy Source Breakdown" subtitle="By source type" accent={BLUE[500]} testId="section-source-breakdown">
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
              ) : <EmptyChart message="No source data" />}
            </SectionCard>

            <SectionCard title="Renewable vs Non-Renewable" subtitle="Monthly comparison" accent={GREEN[500]} testId="section-renew-vs-nonrenew">
              {monthly.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthly} barGap={2}>
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
            <SectionCard title="Facility-wise Energy Consumption" subtitle="Ranked by total consumption" accent={PURPLE[500]} testId="section-facility-consumption">
              {facilityBars.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(180, facilityBars.length * 44)}>
                  <BarChart data={facilityBars} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716c' }} width={100} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload, label }) => {
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
              {intensity.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={intensity} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
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
        </>
      )}
    </div>
  );
}
