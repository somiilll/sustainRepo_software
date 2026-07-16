/**
 * DashboardGovernance — Lightweight Governance Performance Dashboard
 *
 * Row 1: 5 KPI Cards (AP Days, Anti-Competitive, Data Breaches, Violations, Corruption)
 * Row 2: AP Days Trend + Data Breach Trend + Violations Trend (3 line charts)
 * Row 3: Anti-Competitive Cases + Corruption Cases (2 bar charts)
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from 'recharts';

import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import {
  CalendarClock, Swords, ShieldOff, Gavel, Landmark,
  RadioTower, RefreshCw,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ── palette ───────────────────────────────── */
const INDIGO = '#6366f1';
const ORANGE = '#f97316';
const RED    = '#ef4444';
const GREEN  = '#059669';
const SLATE  = '#64748b';

/* ── shared tooltip ────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white/95 backdrop-blur-md p-2.5 shadow-xl text-xs min-w-[130px]">
      <p className="font-semibold text-stone-700 mb-1">{label}</p>
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

/* ── empty chart ───────────────────────────── */
function EmptyChart({ message = 'No data available' }) {
  return <div className="flex items-center justify-center h-48 text-xs text-stone-400">{message}</div>;
}

/* ── reusable line trend card ──────────────── */
function TrendLineCard({ data, dataKey = 'value', name, color, unit = '' }) {
  if (!data?.length) return <EmptyChart message={`No ${name.toLowerCase()} data`} />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
        <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={45} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Line dataKey={dataKey} name={name} stroke={color} strokeWidth={2.5}
          dot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── reusable bar card ─────────────────────── */
function TrendBarCard({ data, dataKey = 'value', name, color }) {
  if (!data?.length) return <EmptyChart message={`No ${name.toLowerCase()} data`} />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
        <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={35} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} barSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}


/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */
export default function DashboardGovernance({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    loading, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    isLive,
  } = data;

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    if (!dateRange.from || !dateRange.to) return;
    const start = format(dateRange.from, 'yyyy-MM');
    const end = format(dateRange.to, 'yyyy-MM');
    const facParam = selectedFacilities.length > 0 ? `&facility_ids=${selectedFacilities.join(',')}` : '';
    const headers = getAuthHeader();

    setDetailLoading(true);
    axios.get(`${API}/dashboard/governance-detail?start_date=${start}&end_date=${end}${facParam}`, { headers })
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [dateRange, selectedFacilities, getAuthHeader]);

  const kpis = detail?.kpis || {};

  const filterProps = {
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
  };

  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  const liveBadge = isLive ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-100/70 border border-indigo-200 rounded-full px-2 py-0.5">
      <RadioTower className="w-3 h-3" /> Live
    </span>
  ) : null;

  if (loading || detailLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Governance Dashboard...</p>
        </div>
      </div>
    );
  }

  console.log("kpis", kpis)

  return (
    <div className="space-y-5" data-testid="dashboard-governance">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Governance` : 'Governance Dashboard'}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="governance-kpi-row">
        <PremiumKpiCard title="AP Days" value={kpis.ap_days || 0} unit="days" icon={CalendarClock} accentColor={INDIGO} loading={false} />
        <PremiumKpiCard title="Anti-Competitive Cases" value={kpis.anti_competitive_cases || 0} unit="" icon={Swords} accentColor={ORANGE} loading={false} />
        <PremiumKpiCard title="Data Breaches" value={kpis.data_breaches || 0} unit="" icon={ShieldOff} accentColor={RED} loading={false} />
        <PremiumKpiCard title="Compliance Violations" value={kpis.violations || 0} unit="" icon={Gavel} accentColor={RED} loading={false} />
        <PremiumKpiCard title="Corruption Cases" value={kpis.corruption_cases || 0} unit="" icon={Landmark} accentColor={SLATE} loading={false} />
      </div>

      {/* ── ROW 2: TREND LINES ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Accounts Payable Days Trend" subtitle="AP Days over time" accent={INDIGO} testId="section-ap-trend">
          <TrendLineCard data={detail?.ap_trend} name="AP Days" color={INDIGO} />
        </SectionCard>

        <SectionCard title="Data Breach Trend" subtitle="Number of breaches over time" accent={RED} testId="section-breach-trend">
          <TrendLineCard data={detail?.breach_trend} name="Breaches" color={RED} />
        </SectionCard>

        <SectionCard title="Compliance Violations Trend" subtitle="Violations over time" accent={ORANGE} testId="section-violation-trend">
          <TrendLineCard data={detail?.violation_trend} name="Violations" color={ORANGE} />
        </SectionCard>
      </div>

      {/* ── ROW 3: ETHICS & BUSINESS CONDUCT ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Anti-Competitive Cases" subtitle="Cases by reporting period" accent={ORANGE} testId="section-anti-competitive">
          <TrendBarCard data={detail?.anti_competitive_trend} name="Cases" color={ORANGE} />
        </SectionCard>

        <SectionCard title="Corruption Cases" subtitle="Cases by reporting period" accent={SLATE} testId="section-corruption">
          <TrendBarCard data={detail?.corruption_trend} name="Cases" color={SLATE} />
        </SectionCard>
      </div>
    </div>
  );
}
