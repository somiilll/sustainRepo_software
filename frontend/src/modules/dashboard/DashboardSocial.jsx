/**
 * DashboardSocial — Premium Social Performance Dashboard
 *
 * Row 1: KPI Cards (Employees, Trainings, Board, Return-to-Work, Retention, Complaints, Incidents)
 * Row 2: Workforce Composition (Stacked Bar) + Employee Movement (Combo Bar+Line)
 * Row 3: Employee Diversity (Nested Donut) + Board Diversity (Horizontal Bar)
 * Row 4: Training by Attendee (Horizontal Bar) + Training Trend (Line)
 * Row 5: Complaint Status (Stacked Bar) + Filed Against (Horizontal Bar) + Categories (Grouped Bar)
 * Row 6: Health & Safety Incident Trend (Line)
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, ComposedChart,
} from 'recharts';

import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import {
  Users, User, GraduationCap, UserCheck, RotateCcw, ShieldAlert,
  MessageSquareWarning, Scale, HeartPulse, RadioTower, RefreshCw,
  UserPlus, UserMinus, Crown,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ── colours ───────────────────────────────── */
const PURPLE = { 500: '#8b5cf6', 400: '#a78bfa', 300: '#c4b5fd', 200: '#ddd6fe' };
const TEAL   = { 500: '#14b8a6', 400: '#2dd4bf', 300: '#5eead4', 200: '#99f6e4' };
const BLUE   = { 500: '#3b82f6', 400: '#60a5fa', 300: '#93c5fd', 200: '#bfdbfe' };
const ORANGE = { 500: '#f97316', 400: '#fb923c', 300: '#fdba74', 200: '#fed7aa' };
const RED    = { 500: '#ef4444', 400: '#f87171', 300: '#fca5a5' };
const GREEN  = { 500: '#059669', 400: '#34d399' };

const WORKFORCE_COLORS = [PURPLE[500], PURPLE[400], PURPLE[300], PURPLE[200]];
const DIVERSITY_COLORS = [BLUE[500], '#ec4899', TEAL[500], ORANGE[500]];
const COMPLAINT_COLORS = [RED[500], GREEN[500], ORANGE[500]];

/* ── shared tooltip ────────────────────────── */
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

/* ── horizontal bar helper ─────────────────── */
function HBarSection({ data, colors, unit = '' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  if (!data.length) return <EmptyChart />;
  return (
    <div className="space-y-2.5">
      {data.map((item, i) => {
        const pct = (item.value / max) * 100;
        return (
          <div key={item.name} data-testid={`hbar-${item.name}`}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-stone-700">{item.name}</span>
              <span className="text-xs font-semibold text-stone-900 tabular-nums">
                {Number(item.value).toLocaleString()}{unit ? ` ${unit}` : ''}
              </span>
            </div>
            <div className="h-3 rounded-full bg-stone-100 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: colors[i % colors.length] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── empty chart ───────────────────────────── */
function EmptyChart({ message = 'No data available' }) {
  return <div className="flex items-center justify-center h-48 text-xs text-stone-400">{message}</div>;
}

/* ── Employee Diversity Bar ────────────────── */
function z({ male, female, total }) {
  const t = total || (male + female) || 1;
  const malePct = ((male / t) * 100).toFixed(1);
  const femalePct = ((female / t) * 100).toFixed(1);

  if (t <= 0 || (male === 0 && female === 0)) {
    return <EmptyChart message="No employee data recorded" />;
  }

  return (
    <div className="space-y-4" data-testid="diversity-bar">
      <div className="text-center">
        <p className="text-3xl font-bold text-stone-900">{t.toLocaleString()}</p>
        <p className="text-[11px] text-stone-500 mt-0.5">Total Employees</p>
      </div>
      <div className="h-5 rounded-full overflow-hidden flex bg-stone-100">
        {male > 0 && (
          <div className="h-full transition-all duration-700 flex items-center justify-center"
            style={{ width: `${malePct}%`, backgroundColor: BLUE[500] }}>
            {parseFloat(malePct) > 15 && <span className="text-[9px] font-bold text-white">{malePct}%</span>}
          </div>
        )}
        {female > 0 && (
          <div className="h-full transition-all duration-700 flex items-center justify-center"
            style={{ width: `${femalePct}%`, backgroundColor: '#ec4899' }}>
            {parseFloat(femalePct) > 15 && <span className="text-[9px] font-bold text-white">{femalePct}%</span>}
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BLUE[500] }} /> Male ({male})</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ec4899' }} /> Female ({female})</span>
      </div>
    </div>
  );
}

/* ── Employee Diversity Bar ────────────────── */
function EmployeeDiversityBar({ male, female, total }) {
  const t = total || (male + female) || 1;
  const malePct = ((male / t) * 100).toFixed(1);
  const femalePct = ((female / t) * 100).toFixed(1);

  if (t <= 0 || (male === 0 && female === 0)) {
    return <EmptyChart message="No employee data recorded" />;
  }

  return (
    <div className="space-y-4" data-testid="diversity-bar">
      <div className="text-center">
        <p className="text-3xl font-bold text-stone-900">{t.toLocaleString()}</p>
        <p className="text-[11px] text-stone-500 mt-0.5">Total Employees</p>
      </div>
      <div className="h-5 rounded-full overflow-hidden flex bg-stone-100">
        {male > 0 && (
          <div className="h-full transition-all duration-700 flex items-center justify-center"
            style={{ width: `${malePct}%`, backgroundColor: BLUE[500] }}>
            {parseFloat(malePct) > 15 && <span className="text-[9px] font-bold text-white">{malePct}%</span>}
          </div>
        )}
        {female > 0 && (
          <div className="h-full transition-all duration-700 flex items-center justify-center"
            style={{ width: `${femalePct}%`, backgroundColor: '#ec4899' }}>
            {parseFloat(femalePct) > 15 && <span className="text-[9px] font-bold text-white">{femalePct}%</span>}
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BLUE[500] }} /> Male ({male})</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ec4899' }} /> Female ({female})</span>
      </div>
    </div>
  );
}

/* ── Waffle Chart (4x5 person grid) ───────── */
function WaffleChart({ total, fatal }) {
  const GRID = 20;
  const fatalPct = total > 0 ? fatal / total : 0;
  const fatalIcons = Math.round(fatalPct * GRID);

  return (
    <div data-testid="waffle-chart">
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: GRID }).map((_, i) => {
          const isFatal = i < fatalIcons;
          return (
            <User
              key={i}
              className={`w-5 h-5 transition-colors duration-300 ${isFatal ? 'text-red-500 fill-red-500' : 'text-sky-300 fill-sky-300'}`}
            />
          );
        })}
      </div>
      <div className="flex justify-center gap-4 mt-2.5 text-[10px] text-stone-500">
        <span className="flex items-center gap-1"><User className="w-3 h-3 text-red-500 fill-red-500" /> Fatal</span>
        <span className="flex items-center gap-1"><User className="w-3 h-3 text-sky-300 fill-sky-300" /> Non-Fatal</span>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════ */
export default function DashboardSocial({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    stats, loading, organization, facilities,
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
    axios.get(`${API}/dashboard/social-detail?start_date=${start}&end_date=${end}${facParam}`, { headers })
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [dateRange, selectedFacilities, getAuthHeader]);

  const kpis = detail?.kpis || {};
  const diversity = detail?.diversity || { male: 0, female: 0, minority: 0, vulnerable: 0 };
  const boardDiv = detail?.board_diversity || {};
  const workforceComp = detail?.workforce_composition || [];
  const empMovement = detail?.employee_movement || [];
  const trainingByAtt = detail?.training_by_attendee || [];
  const trainingTrend = detail?.training_trend || [];
  const complaintStatus = detail?.complaint_status || [];
  const complaintFiled = detail?.complaint_filed_against || [];
  const complaintCats = detail?.complaint_categories || [];
  const safetyTrend = detail?.safety_trend || [];

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
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-purple-700 bg-purple-100/70 border border-purple-200 rounded-full px-2 py-0.5">
      <RadioTower className="w-3 h-3" /> Live
    </span>
  ) : null;

  const isLoading = loading || detailLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Social Dashboard...</p>
        </div>
      </div>
    );
  }

  const latestData = workforceComp[workforceComp.length - 1];
  const { permanent = 0, temporary = 0, workers = 0, contract = 0 } = latestData;
  const total = permanent + temporary + workers + contract;

  return (
    <div className="space-y-5" data-testid="dashboard-social">
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Social` : 'Social Dashboard'}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="social-kpi-row">
        {/* <PremiumKpiCard title="Total Employees" value={kpis.total_employees || 0} unit="" icon={Users} accentColor={PURPLE[500]} loading={false} /> */}
        <PremiumKpiCard title="Total Employees" value={total || 0} unit="" icon={Users} accentColor={PURPLE[500]} loading={false} />
        <PremiumKpiCard title="Trainings" value={kpis.total_trainings || 0} unit="" icon={GraduationCap} accentColor={BLUE[500]} loading={false} />
        <PremiumKpiCard title="Board of Directors" value={kpis.total_board || 0} unit="" icon={Crown} accentColor={TEAL[500]} loading={false} />
        <PremiumKpiCard title="Return to Work" value={kpis.return_to_work || 0} unit="" icon={RotateCcw} accentColor={GREEN[500]} loading={false} />
        <PremiumKpiCard title="Retention Rate" value={kpis.retention_rate || 0} unit="%" icon={UserCheck} accentColor={GREEN[400]} loading={false} />
        <PremiumKpiCard title="Internal Complaints" value={kpis.internal_complaints || 0} unit="" icon={MessageSquareWarning} accentColor={ORANGE[500]} loading={false} />
        <PremiumKpiCard title="POSH Complaints" value={kpis.posh_complaints || 0} unit="" icon={Scale} accentColor={ORANGE[400]} loading={false} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <PremiumKpiCard title="Customer Complaints" value={kpis.customer_complaints || 0} unit="" icon={ShieldAlert} accentColor={RED[500]} loading={false} />
        <PremiumKpiCard title="Health & Safety Incidents" value={kpis.total_incidents || 0} unit="" icon={HeartPulse} accentColor={RED[400]} loading={false} />
      </div>


      {/* ── ROW 3: DIVERSITY + BOARD + H&S WAFFLE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <SectionCard title="Employee Diversity" subtitle="Gender distribution" accent={TEAL[500]} testId="section-employee-diversity">
          <EmployeeDiversityBar male={diversity.male} female={diversity.female} total={kpis.total_employees || (diversity.male + diversity.female)} />
        </SectionCard>

        <SectionCard title="Board Diversity" subtitle="Board composition" accent={PURPLE[500]} testId="section-board-diversity">
          {(boardDiv.male || boardDiv.female) ? (
            <HBarSection data={[
              { name: 'Male', value: boardDiv.male || 0 },
              { name: 'Female', value: boardDiv.female || 0 },
              { name: 'Minority', value: boardDiv.minority || 0 },
              { name: 'Vulnerable', value: boardDiv.vulnerable || 0 },
            ].filter(d => d.value > 0)} colors={[BLUE[500], '#ec4899', TEAL[500], ORANGE[500]]} />
          ) : (
            <EmptyChart message="No board data" />
          )}
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Health & Safety — Fatality Impact" subtitle="Incidents causing fatality vs total incidents" accent={RED[500]} testId="section-hs-waffle">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="flex flex-col items-center justify-center">
                <p className="text-3xl font-bold text-stone-900">{kpis.total_incidents || 0}</p>
                <p className="text-[11px] text-stone-500 mt-1">Total Incidents</p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <p className="text-3xl font-bold text-red-600">{kpis.total_fatalities || 0}</p>
                <p className="text-[11px] text-stone-500 mt-1">Fatalities</p>
              </div>
              <div className="flex flex-col items-center justify-center">
                <WaffleChart total={kpis.total_incidents || 0} fatal={kpis.total_fatalities || 0} />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── ROW 4: TRAINING ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Training by Attendee Type" subtitle="Breakdown by participant category" accent={BLUE[500]} testId="section-training-attendee">
          {trainingByAtt.length > 0 ? (
            <HBarSection data={trainingByAtt} colors={[BLUE[500], BLUE[400], BLUE[300], PURPLE[500], PURPLE[400], TEAL[500]]} />
          ) : (
            <EmptyChart message="No training data recorded" />
          )}
        </SectionCard>

        <SectionCard title="Training Trend" subtitle="Number of trainings over time" accent={BLUE[400]} testId="section-training-trend">
          {trainingTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trainingTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line dataKey="value" name="Trainings" stroke={BLUE[500]} strokeWidth={2} dot={{ r: 3, fill: BLUE[500] }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No training trend data" />
          )}
        </SectionCard>
      </div>

      {/* ── ROW 5: COMPLAINTS ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Complaint Status" subtitle="Open, closed & pending" accent={ORANGE[500]} testId="section-complaint-status">
          {complaintStatus.length > 0 ? (
            <HBarSection data={complaintStatus} colors={COMPLAINT_COLORS} />
          ) : (
            <EmptyChart message="No complaint data" />
          )}
        </SectionCard>

        <SectionCard title="Complaints Filed Against" subtitle="By responsible party" accent={ORANGE[400]} testId="section-complaint-filed">
          {complaintFiled.length > 0 ? (
            <HBarSection data={complaintFiled} colors={[ORANGE[500], ORANGE[400], ORANGE[300], RED[500], PURPLE[500]]} />
          ) : (
            <EmptyChart message="No complaint data" />
          )}
        </SectionCard>

        <SectionCard title="Complaint Categories" subtitle="By complaint type" accent={RED[500]} testId="section-complaint-categories">
          {complaintCats.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={complaintCats} layout="vertical" barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Complaints" fill={ORANGE[500]} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No complaint categories" />
          )}
        </SectionCard>
      </div>

      {/* ── ROW 6: HEALTH & SAFETY ───────────────── */}
      <div className="grid grid-cols-1 gap-4">
        <SectionCard title="Health & Safety Incident Trend" subtitle="Total incidents over time" accent={RED[500]} testId="section-safety-trend">
          {safetyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={safetyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line dataKey="value" name="Incidents" stroke={RED[500]} strokeWidth={2.5} dot={{ r: 4, fill: RED[500], stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No safety incident data recorded" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
