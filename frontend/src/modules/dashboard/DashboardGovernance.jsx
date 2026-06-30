/**
 * DashboardGovernance — Governance-focused ESG Dashboard
 * 
 * KPIs:
 * 1. Safety Incidents
 * 2. Data Breaches
 * 3. Fatality
 * 4. Regulatory Escalations
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

// Layout & Shared Components
import SectionCard from './components/layout/SectionCard';
import StickyFilterBar from './components/filters/StickyFilterBar';

// BRSR Components
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import TrendArrow from './components/shared/TrendArrow';

// Hooks
import { useIntensityData } from './hooks/useIntensityData';

// Icons
import { ShieldAlert, Database, Skull, Scale, RadioTower, Users } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DashboardGovernance({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    organization,
    facilities,
    dateRange,
    setDateRange,
    selectedFacilities,
    setSelectedFacilities,
    showFilters,
    setShowFilters,
    showFacilityDropdown,
    setShowFacilityDropdown,
    facilityDropdownRef,
    isLive,
  } = data;

  const [esgMetrics, setEsgMetrics] = useState(null);
  const [prevYearMetrics, setPrevYearMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);

  // Calculate previous year date range
  const prevYearDateRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return { from: null, to: null };
    const prevFrom = new Date(dateRange.from);
    const prevTo = new Date(dateRange.to);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    prevTo.setFullYear(prevTo.getFullYear() - 1);
    return { from: prevFrom, to: prevTo };
  }, [dateRange]);

  // Fetch ESG metrics (current + previous year)
  useEffect(() => {
    const fetchMetrics = async () => {
      setEsgLoading(true);
      try {
        const requests = [
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined,
              end_date: dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: prevYearDateRange.from ? format(prevYearDateRange.from, 'yyyy-MM') : undefined,
              end_date: prevYearDateRange.to ? format(prevYearDateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
        ];

        const responses = await Promise.all(requests);
        const [metricsRes, prevMetricsRes] = responses;
        
        setEsgMetrics(metricsRes.data);
        setPrevYearMetrics(prevMetricsRes.data);
      } catch (error) {
        console.error('Metrics fetch error:', error);
      } finally {
        setEsgLoading(false);
      }
    };

    if (dateRange.from && dateRange.to) {
      fetchMetrics();
    }
  }, [dateRange, prevYearDateRange, selectedFacilities, getAuthHeader]);

  // Extract governance metrics (now at top level)
  const incidentAnalytics = esgMetrics?.incident_analytics || {};
  const breachAnalytics = esgMetrics?.breach_analytics || {};
  const prevIncidentAnalytics = prevYearMetrics?.incident_analytics || {};

  // KPI values
  const safetyIncidents = esgMetrics?.safety_incidents || 0;
  const dataBreaches = esgMetrics?.data_breaches || 0;
  const fatalities = esgMetrics?.fatalities || 0;
  const regulatoryEscalations = esgMetrics?.regulatory_escalations || 0;

  // Previous year values
  const prevSafetyIncidents = prevYearMetrics?.safety_incidents || 0;
  const prevDataBreaches = prevYearMetrics?.data_breaches || 0;
  const prevFatalities = prevYearMetrics?.fatalities || 0;
  const prevRegulatoryEscalations = prevYearMetrics?.regulatory_escalations || 0;

  // Calculate YoY trend deltas
  const trendDeltas = useMemo(() => {
    const computePct = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };

    return {
      safetyDelta: computePct(safetyIncidents, prevSafetyIncidents),
      breachesDelta: computePct(dataBreaches, prevDataBreaches),
      fatalityDelta: computePct(fatalities, prevFatalities),
      regulatoryDelta: computePct(regulatoryEscalations, prevRegulatoryEscalations),
    };
  }, [safetyIncidents, dataBreaches, fatalities, regulatoryEscalations, prevSafetyIncidents, prevDataBreaches, prevFatalities, prevRegulatoryEscalations]);

  // Date range label
  const dateRangeLabel = dateRange.from && dateRange.to
    ? `${format(dateRange.from, 'MMM yyyy')} – ${format(dateRange.to, 'MMM yyyy')}`
    : 'All time';

  // Live badge
  const liveBadge = isLive ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 border border-emerald-200 rounded-full px-2 py-0.5">
      <RadioTower className="w-3 h-3" />
      Live
    </span>
  ) : null;

  // Filter props
  const filterProps = {
    facilities,
    selectedFacilities,
    setSelectedFacilities,
    dateRange,
    setDateRange,
    showFacilityDropdown,
    setShowFacilityDropdown,
    facilityDropdownRef,
  };

  return (
    <div className="space-y-6">
      {/* Sticky Filter Bar */}
      <StickyFilterBar
        title={organization?.name ? `${organization.name} · Executive Dashboard` : 'Executive Dashboard'}
        subtitle={`Reporting window: ${dateRangeLabel}`}
        liveBadge={liveBadge}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={filterProps}
        onExport={() => console.log('Export triggered')}
        showExport={true}
        dashboardType={data.dashboardType}
        setDashboardType={data.setDashboardType}
        esgSection={data.esgSection}
        setEsgSection={data.setEsgSection}
        showDashboardToggle={data.showDashboardToggle}
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Safety Incidents */}
        <PremiumKpiCard
          title="SAFETY INCIDENTS"
          value={safetyIncidents}
          unit="incidents"
          icon={ShieldAlert}
          accentColor="amber"
          footer={
            trendDeltas.safetyDelta !== null && (
              <TrendArrow delta={trendDeltas.safetyDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Data Breaches */}
        <PremiumKpiCard
          title="DATA BREACHES"
          value={dataBreaches}
          unit="breaches"
          icon={Database}
          accentColor="rose"
          footer={
            trendDeltas.breachesDelta !== null && (
              <TrendArrow delta={trendDeltas.breachesDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Fatality */}
        <PremiumKpiCard
          title="FATALITY"
          value={fatalities}
          unit="cases"
          icon={Skull}
          accentColor="red"
          footer={
            trendDeltas.fatalityDelta !== null && (
              <TrendArrow delta={trendDeltas.fatalityDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Regulatory Escalations */}
        <PremiumKpiCard
          title="REGULATORY ESCALATIONS"
          value={regulatoryEscalations}
          unit="cases"
          icon={Scale}
          accentColor="purple"
          footer={
            trendDeltas.regulatoryDelta !== null && (
              <TrendArrow delta={trendDeltas.regulatoryDelta} suffix="vs prev period" />
            )
          }
        />
      </div>

      {/* ROW 1: Safety Incident Analytics */}
      <SectionCard title="Safety Incident Analytics" subtitle="Incident distribution and rehabilitation tracking">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
          {/* LEFT: Incident Type Distribution */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Incident Type Distribution</h4>
            <IncidentTypeChart byType={incidentAnalytics.by_type || {}} />
          </div>

          {/* CENTER: Who Was Affected */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Who Was Affected</h4>
            <AffectedDonut byAffected={incidentAnalytics.by_affected || {}} />
          </div>

          {/* RIGHT: Rehabilitation & Corrective Actions */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Rehabilitation & Corrective Actions</h4>
            <RehabilitationStatus rehabilitation={incidentAnalytics.rehabilitation || {}} />
          </div>
        </div>
      </SectionCard>

      {/* ROW 2: Data Breach Analytics */}
      <SectionCard title="Data Breach Analytics" subtitle="Breach types, risk assessment, and resolution tracking">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
          {/* LEFT: Data Breach Types - Treemap */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Data Breach Types</h4>
            <BreachTypesTreemap byType={breachAnalytics.by_type || {}} />
          </div>

          {/* CENTER: Risk Assessment */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Risk Assessment</h4>
            <RiskAssessmentCards risk={breachAnalytics.risk || {}} total={breachAnalytics.total || 0} />
          </div>

          {/* RIGHT: Resolution Monitoring */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Resolution Monitoring</h4>
            <ResolutionMonitoring resolution={breachAnalytics.resolution || {}} />
          </div>
        </div>
      </SectionCard>

      {/* Summary Section */}
      <SectionCard title="Governance Overview" subtitle="Risk and compliance status">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
          {/* Safety Card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Safety</h4>
            </div>
            <div className="text-3xl font-bold text-amber-600 mb-1">{safetyIncidents}</div>
            <p className="text-xs text-stone-500">Total incidents reported</p>
          </div>

          {/* Data Security Card */}
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-5 border border-rose-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-rose-100 rounded-lg">
                <Database className="w-5 h-5 text-rose-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Data Security</h4>
            </div>
            <div className="text-3xl font-bold text-rose-600 mb-1">{dataBreaches}</div>
            <p className="text-xs text-stone-500">Cyber incidents / breaches</p>
          </div>

          {/* Critical Events Card */}
          <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-5 border border-red-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Skull className="w-5 h-5 text-red-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Fatalities</h4>
            </div>
            <div className="text-3xl font-bold text-red-600 mb-1">{fatalities}</div>
            <p className="text-xs text-stone-500">Fatal incidents</p>
          </div>

          {/* Regulatory Card */}
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-5 border border-purple-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Scale className="w-5 h-5 text-purple-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Regulatory</h4>
            </div>
            <div className="text-3xl font-bold text-purple-600 mb-1">{regulatoryEscalations}</div>
            <p className="text-xs text-stone-500">Compliance escalations</p>
          </div>
        </div>

        {/* Period Info */}
        <div className="px-4 pb-4">
          <div className="bg-stone-50 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-stone-600">Reporting Period: <strong>{dateRangeLabel}</strong></span>
            {liveBadge}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// Incident Type Distribution - Stacked Horizontal Bars (Dynamic)
function IncidentTypeChart({ byType }) {
  const COLORS = ['bg-amber-500', 'bg-red-600', 'bg-orange-500', 'bg-purple-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-stone-400'];
  
  const types = Object.entries(byType).map(([type, count], idx) => ({
    type,
    count,
    color: COLORS[idx % COLORS.length]
  })).sort((a, b) => b.count - a.count);

  const total = types.reduce((sum, t) => sum + t.count, 0);

  if (total === 0) {
    return (
      <div className="text-center py-8 text-stone-400">
        <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No incident data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="h-10 flex rounded-lg overflow-hidden bg-stone-100">
        {types.map((item) => {
          const pct = (item.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={item.type}
              className={`${item.color} transition-all duration-500 flex items-center justify-center`}
              style={{ width: `${pct}%` }}
              title={`${item.type}: ${item.count}`}
            >
              {pct > 12 && <span className="text-xs text-white font-medium">{item.count}</span>}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {types.map((item) => (
          <div key={item.type} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded ${item.color}`} />
            <span className="text-xs text-stone-600 truncate" title={item.type}>{item.type}: {item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Who Was Affected - Vertical Bar Chart
function AffectedDonut({ byAffected }) {
  const CATEGORIES = [
    { key: 'Board of Directors', color: '#8B5CF6', label: 'Board' },
    { key: 'Key Management Personnel', color: '#6366F1', label: 'KMP' },
    { key: 'Employee', color: '#3B82F6', label: 'Employee' },
    { key: 'Worker', color: '#0EA5E9', label: 'Worker' },
    { key: 'Contractor', color: '#14B8A6', label: 'Contractor' },
  ];

  const total = Object.values(byAffected).reduce((sum, v) => sum + v, 0);
  const maxValue = Math.max(...Object.values(byAffected), 1);

  if (total === 0) {
    return (
      <div className="text-center py-8 text-stone-400">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No affected data</p>
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between gap-2 h-[180px] pt-4">
      {CATEGORIES.map((cat) => {
        const value = byAffected[cat.key] || 0;
        const heightPct = maxValue > 0 ? (value / maxValue) * 100 : 0;
        return (
          <div key={cat.key} className="flex flex-col items-center flex-1">
            <span className="text-xs font-semibold text-stone-700 mb-1">{value}</span>
            <div className="w-full flex-1 flex items-end">
              <div
                className="w-full rounded-t-md transition-all duration-500"
                style={{ backgroundColor: cat.color, height: `${Math.max(heightPct, 4)}%` }}
              />
            </div>
            <span className="text-[10px] text-stone-500 mt-2 text-center">{cat.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Rehabilitation & Corrective Actions Status
function RehabilitationStatus({ rehabilitation }) {
  const { done = 0, pending = 0, total = 0, done_pct = 0 } = rehabilitation;

  return (
    <div className="space-y-4">
      {/* Rehabilitation Done Progress */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-stone-600">Rehabilitation Done</span>
          <span className="text-sm font-bold text-emerald-600">{done_pct}%</span>
        </div>
        <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
            style={{ width: `${done_pct}%` }}
          />
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">✅</span>
            <span className="text-xs text-stone-500">Completed</span>
          </div>
          <p className="text-xl font-bold text-emerald-600">{done}</p>
        </div>

        <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">⏳</span>
            <span className="text-xs text-stone-500">Pending</span>
          </div>
          <p className="text-xl font-bold text-amber-600">{pending}</p>
        </div>
      </div>

      {/* Total */}
      <div className="bg-stone-50 rounded-lg p-3 text-center">
        <span className="text-xs text-stone-500">Total Incidents</span>
        <p className="text-lg font-bold text-stone-700">{total}</p>
      </div>
    </div>
  );
}

// Data Breach Types Treemap
function BreachTypesTreemap({ byType }) {
  const BREACH_COLORS = {
    'Ransomware attack': 'bg-red-600',
    'Malware infection': 'bg-rose-500',
    'Spyware attack': 'bg-orange-500',
    'Trojan attack': 'bg-amber-500',
    'Virus outbreak': 'bg-purple-500',
    'Cryptojacking': 'bg-indigo-500',
  };

  const types = Object.entries(byType).map(([type, count]) => ({
    type,
    count,
    color: BREACH_COLORS[type] || 'bg-stone-400'
  })).sort((a, b) => b.count - a.count);

  const total = types.reduce((sum, t) => sum + t.count, 0);

  if (total === 0) {
    return (
      <div className="text-center py-8 text-stone-400">
        <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No breach data</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 h-[180px]">
      {types.slice(0, 6).map((item) => {
        const pct = (item.count / total) * 100;
        const sizeClass = pct > 40 ? 'col-span-2' : '';
        return (
          <div
            key={item.type}
            className={`${item.color} ${sizeClass} rounded-lg p-3 flex flex-col justify-between transition-transform hover:scale-105`}
            title={`${item.type}: ${item.count}`}
          >
            <span className="text-[10px] text-white/90 font-medium truncate">{item.type}</span>
            <span className="text-xl font-bold text-white">{item.count}</span>
          </div>
        );
      })}
    </div>
  );
}

// Risk Assessment Cards
function RiskAssessmentCards({ risk, total }) {
  const { personal_affected = 0, sensitive_affected = 0 } = risk;

  const cards = [
    { label: 'Personal Data Affected', value: personal_affected, icon: '👤', color: 'rose' },
    { label: 'Sensitive Data Affected', value: sensitive_affected, icon: '🔐', color: 'red' },
    { label: 'Total Breaches', value: total, icon: '⚠️', color: 'amber' },
  ];

  return (
    <div className="space-y-3">
      {cards.map((card) => (
        <div key={card.label} className={`bg-${card.color}-50 rounded-lg p-3 border border-${card.color}-100 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{card.icon}</span>
            <span className="text-xs text-stone-600">{card.label}</span>
          </div>
          <span className={`text-xl font-bold text-${card.color}-600`}>{card.value}</span>
        </div>
      ))}
    </div>
  );
}

// Resolution Monitoring
function ResolutionMonitoring({ resolution }) {
  const { open = 0, closed = 0, escalated = 0, regulatory_reported = 0 } = resolution;
  const total = open + closed;
  const closedPct = total > 0 ? ((closed / total) * 100).toFixed(0) : 0;

  return (
    <div className="space-y-4">
      {/* Resolution Progress */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-stone-600">Resolution Rate</span>
          <span className="text-sm font-bold text-emerald-600">{closedPct}%</span>
        </div>
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${closedPct}%` }}
          />
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-amber-50 rounded-lg p-2 border border-amber-100 text-center">
          <span className="text-[10px] text-stone-500">Open</span>
          <p className="text-lg font-bold text-amber-600">{open}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100 text-center">
          <span className="text-[10px] text-stone-500">Closed</span>
          <p className="text-lg font-bold text-emerald-600">{closed}</p>
        </div>
        <div className="bg-rose-50 rounded-lg p-2 border border-rose-100 text-center">
          <span className="text-[10px] text-stone-500">Escalated</span>
          <p className="text-lg font-bold text-rose-600">{escalated}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 border border-blue-100 text-center">
          <span className="text-[10px] text-stone-500">Reported</span>
          <p className="text-lg font-bold text-blue-600">{regulatory_reported}</p>
        </div>
      </div>
    </div>
  );
}
