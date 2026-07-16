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
  LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart,
} from 'recharts';

import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import {
  Users, GraduationCap, UserCheck, RotateCcw, ShieldAlert,
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

/* ── Nested Donut for Diversity ────────────── */
function DiversityDonut({ diversity }) {
  const { male, female, minority, vulnerable } = diversity;
  const total = male + female;
  const outerData = [
    { name: 'Male', value: male },
    { name: 'Female', value: female },
  ].filter(d => d.value > 0);
  const innerData = [
    { name: 'Minority', value: minority },
    { name: 'Vulnerable', value: vulnerable },
    { name: 'Other', value: Math.max(total - minority - vulnerable, 0) },
  ].filter(d => d.value > 0);

  if (total === 0) return <EmptyChart message="No diversity data recorded" />;

  const OUTER = [BLUE[500], '#ec4899'];
  const INNER = [TEAL[500], ORANGE[500], '#a8a29e'];

  return (
    <div data-testid="diversity-donut">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={outerData} dataKey="value" cx="50%" cy="50%" outerRadius={95} innerRadius={65} paddingAngle={2}>
            {outerData.map((_, i) => <Cell key={i} fill={OUTER[i % OUTER.length]} />)}
          </Pie>
          <Pie data={innerData} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={30} paddingAngle={2}>
            {innerData.map((_, i) => <Cell key={i} fill={INNER[i % INNER.length]} />)}
          </Pie>
          <Tooltip content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0];
            return (
              <div className="rounded-lg border border-stone-200 bg-white/95 backdrop-blur-md p-2 shadow-xl text-xs">
                <span className="font-semibold">{d.name}:</span> {Number(d.value).toLocaleString()}
              </div>
            );
          }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 -mt-2">
        {[...outerData.map((d, i) => ({ ...d, color: OUTER[i] })), ...innerData.filter(d => d.name !== 'Other').map((d, i) => ({ ...d, color: INNER[i] }))].map(d => (
          <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-stone-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name} ({d.value})
          </span>
        ))}
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

  // Board diversity horizontal bar data
  const boardBarData = useMemo(() => [
    { name: 'Male Directors', value: boardDiv.male || 0 },
    { name: 'Female Directors', value: boardDiv.female || 0 },
    { name: 'Minority', value: boardDiv.minority || 0 },
    { name: 'Vulnerable Groups', value: boardDiv.vulnerable || 0 },
  ].filter(d => d.value > 0), [boardDiv]);

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
        <PremiumKpiCard title="Total Employees" value={kpis.total_employees || 0} unit="" icon={Users} accentColor={PURPLE[500]} loading={false} />
        <PremiumKpiCard title="Trainings" value={kpis.total_trainings || 0} unit="" icon={GraduationCap} accentColor={BLUE[500]} loading={false} />
        <PremiumKpiCard title="Board of Directors" value={kpis.total_board || 0} unit="" icon={Crown} accentColor={TEAL[500]} loading={false} />
        <PremiumKpiCard title="Return to Work" value={kpis.return_to_work || 0} unit="" icon={RotateCcw} accentColor={GREEN[500]} loading={false} />
        <PremiumKpiCard title="Retention Rate" value={kpis.retention_rate || 0} unit="%" icon={UserCheck} accentColor={GREEN[400]} loading={false} />
        <PremiumKpiCard title="Internal Complaints" value={kpis.internal_complaints || 0} unit="" icon={MessageSquareWarning} accentColor={ORANGE[500]} loading={false} />
        <PremiumKpiCard title="POSH Complaints" value={kpis.posh_complaints || 0} unit="" icon={Scale} accentColor={ORANGE[400]} loading={false} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <PremiumKpiCard title="Customer Complaints" value={kpis.customer_complaints || 0} unit="" icon={ShieldAlert} accentColor={RED[500]} loading={false} />
        <PremiumKpiCard title="H&S Incidents" value={kpis.total_incidents || 0} unit="" icon={HeartPulse} accentColor={RED[400]} loading={false} />
      </div>

      {/* ── ROW 2: WORKFORCE ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Workforce Composition" subtitle="Employee categories over time" accent={PURPLE[500]} testId="section-workforce-composition">
          {workforceComp.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={workforceComp} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="permanent" name="Permanent" stackId="a" fill={WORKFORCE_COLORS[0]} />
                <Bar dataKey="temporary" name="Temporary" stackId="a" fill={WORKFORCE_COLORS[1]} />
                <Bar dataKey="workers" name="Workers" stackId="a" fill={WORKFORCE_COLORS[2]} />
                <Bar dataKey="contract" name="Contract" stackId="a" fill={WORKFORCE_COLORS[3]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No workforce composition data yet" />
          )}
        </SectionCard>

        <SectionCard title="Employee Movement" subtitle="New hires, turnover & retention" accent={GREEN[500]} testId="section-employee-movement">
          {empMovement.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={empMovement}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={45} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} width={35} domain={[0, 100]} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="left" dataKey="new_hires" name="New Hires" fill={GREEN[500]} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="left" dataKey="turnover" name="Turnover" fill={RED[400]} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" dataKey="retention" name="Retention %" stroke={BLUE[500]} strokeWidth={2} dot={{ r: 3, fill: BLUE[500] }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No employee movement data yet" />
          )}
        </SectionCard>
      </div>

      {/* ── ROW 3: DIVERSITY ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Employee Diversity" subtitle="Gender, minority & vulnerable groups" accent={TEAL[500]} testId="section-employee-diversity">
          <DiversityDonut diversity={diversity} />
        </SectionCard>

        <SectionCard title="Board Diversity" subtitle="Board composition breakdown" accent={PURPLE[500]} testId="section-board-diversity">
          {boardBarData.length > 0 ? (
            <HBarSection data={boardBarData} colors={DIVERSITY_COLORS} />
          ) : (
            <EmptyChart message="No board diversity data" />
          )}
        </SectionCard>
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
