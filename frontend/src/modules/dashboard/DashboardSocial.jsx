/**
 * DashboardSocial — Social-focused ESG Dashboard
 * 
 * KPIs:
 * 1. No. of Trainings
 * 2. Training Hours
 * 3. Complaints No.
 * 4. POSH Cases
 * 5. Consumer Complaints
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

// Layout & Shared Components
import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';

// BRSR Components
import PremiumKpiCard from './components/kpi/PremiumKpiCard';
import TrendArrow from './components/shared/TrendArrow';

// Hooks
import { useIntensityData, usePrevYearIntensity } from './hooks/useIntensityData';

// Icons
import { Users, Clock, AlertTriangle, Shield, MessageSquare, RadioTower } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

  const [esgMetrics, setEsgMetrics] = useState(null);
  const [prevYearMetrics, setPrevYearMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);

  // Fetch intensity data for FY year
  const { fyYear, isOrgLevel } = useIntensityData(dateRange, selectedFacilities);

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

  console.log("esgMetrics in social", esgMetrics)
  // Extract social metrics
  const trainingData = esgMetrics?.training || {};
  const complaintsData = esgMetrics?.complaints || {};
  const prevTraining = prevYearMetrics?.training || {};
  const prevComplaints = prevYearMetrics?.complaints || {};

  // KPI values
  const trainingsCount = trainingData.count || 0;
  const trainingHours = trainingData.hours || 0;
  const complaintsTotal = complaintsData.total || 0;
  const poshCases = complaintsData.posh || 0;
  const consumerComplaints = complaintsData.consumer || 0;
  const generalComplaints = complaintsData.general || 0;

  // Calculate YoY trend deltas
  const trendDeltas = useMemo(() => {
    const computePct = (curr, prev) => {
      if (!prev || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };

    return {
      trainingsCountDelta: computePct(trainingsCount, prevTraining.count),
      trainingHoursDelta: computePct(trainingHours, prevTraining.hours),
      complaintsDelta: computePct(complaintsTotal, prevComplaints.general),
      poshDelta: computePct(poshCases, prevComplaints.posh),
      consumerDelta: computePct(consumerComplaints, prevComplaints.consumer),
    };
  }, [trainingsCount, trainingHours, complaintsTotal, poshCases, consumerComplaints, prevTraining, prevComplaints]);

  // Filter props
  const filterProps = {
    facilities, selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
  };

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

  return (

   <div className="space-y-6" data-testid="dashboard-brsr-ghg">
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


    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* No. of Trainings */}
        <PremiumKpiCard
          title="NO. OF TRAININGS"
          value={trainingsCount}
          unit="sessions"
          icon={Users}
          accentColor="blue"
          footer={
            trendDeltas.trainingsCountDelta !== null && (
              <TrendArrow delta={trendDeltas.trainingsCountDelta} suffix="vs prev period" invertColors />
            )
          }
        />

        {/* Training Hours */}
        <PremiumKpiCard
          title="TRAINING HOURS"
          value={trainingHours.toFixed(1)}
          unit="hrs"
          icon={Clock}
          accentColor="indigo"
          footer={
            trendDeltas.trainingHoursDelta !== null && (
              <TrendArrow delta={trendDeltas.trainingHoursDelta} suffix="vs prev period" invertColors />
            )
          }
        />

        {/* Complaints No. */}
        <PremiumKpiCard
          title="TOTAL COMPLAINTS"
          value={complaintsTotal}
          unit="cases"
          icon={AlertTriangle}
          accentColor="amber"
          footer={
            trendDeltas.complaintsDelta !== null && (
              <TrendArrow delta={trendDeltas.complaintsDelta} suffix="vs prev period" />
            )
          }
        />

        {/* POSH Cases */}
        <PremiumKpiCard
          title="POSH CASES"
          value={poshCases}
          unit="cases"
          icon={Shield}
          accentColor="rose"
          footer={
            trendDeltas.poshDelta !== null && (
              <TrendArrow delta={trendDeltas.poshDelta} suffix="vs prev period" />
            )
          }
        />

        {/* Consumer Complaints */}
        <PremiumKpiCard
          title="CONSUMER COMPLAINTS"
          value={consumerComplaints}
          unit="cases"
          icon={MessageSquare}
          accentColor="orange"
          footer={
            trendDeltas.consumerDelta !== null && (
              <TrendArrow delta={trendDeltas.consumerDelta} suffix="vs prev period" />
            )
          }
        />
      </div>

      {/* ROW 1: Training Analytics */}
      <SectionCard title="Training Analytics" subtitle="Training distribution and coverage metrics">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
          {/* LEFT: Training by Type - Horizontal Bars */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Training by Type</h4>
            <TrainingByTypeChart byType={trainingData.by_type || {}} />
          </div>

          {/* RIGHT: Training Coverage */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Training Coverage</h4>
            <TrainingCoverageStats coverage={trainingData.coverage || {}} />
          </div>
        </div>
      </SectionCard>

      {/* ROW 2: Complaints Analytics */}
      <SectionCard title="Complaints Analytics" subtitle="Complaint distribution, topics, and compliance tracking">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4">
          {/* LEFT: Complaints by Type - Stacked Bars */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Complaints by Type</h4>
            <ComplaintsByTypeChart byType={complaintsData.by_type || {}} />
          </div>

          {/* CENTER: Complaint Topics - Treemap */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Complaint Topics</h4>
            <ComplaintTopicsTreemap byTopic={complaintsData.by_topic || {}} />
          </div>

          {/* RIGHT: Compliance & Escalation - Status Cards */}
          <div className="bg-white rounded-xl p-5 border border-stone-200">
            <h4 className="font-semibold text-stone-800 mb-4">Compliance & Escalation</h4>
            <ComplianceStatusCards compliance={complaintsData.compliance || {}} poshCases={poshCases} />
          </div>
        </div>
      </SectionCard>

      {/* Summary Section */}
      <SectionCard title="Social Performance Summary" subtitle="Key workforce and stakeholder metrics">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
          {/* Training Summary Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Training Overview</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Total Sessions</span>
                <span className="font-semibold text-stone-900">{trainingsCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Total Hours</span>
                <span className="font-semibold text-stone-900">{trainingHours.toFixed(1)} hrs</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Participants</span>
                <span className="font-semibold text-stone-900">{trainingData.participants || 0}</span>
              </div>
            </div>
          </div>

          {/* Complaints Summary Card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Complaints Breakdown</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">General Complaints</span>
                <span className="font-semibold text-stone-900">{generalComplaints}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">POSH Cases</span>
                <span className="font-semibold text-rose-600">{poshCases}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Consumer Complaints</span>
                <span className="font-semibold text-orange-600">{consumerComplaints}</span>
              </div>
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-stone-800">Period Summary</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Reporting Period</span>
                <span className="font-semibold text-stone-900 text-xs">{dateRangeLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Total Complaints</span>
                <span className="font-semibold text-stone-900">{complaintsData.total || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-stone-600">Status</span>
                {liveBadge || <span className="text-sm text-stone-500">Historical</span>}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  </div>
  );
}

// Training by Type Horizontal Bar Chart
function TrainingByTypeChart({ byType }) {
  const TRAINING_TYPES = [
    'Health', 'Safety', 'Environment', 'Human Right Issues', 'Organization Policy(ies)',
    'Skill Upgrade', 'Anti-corruption', 'Ethical Principles',
    'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'Others'
  ];

  const maxValue = Math.max(...Object.values(byType), 1);
  const hasData = Object.keys(byType).length > 0;

  // Filter to only show types with data or all if no data
  const displayTypes = hasData 
    ? TRAINING_TYPES.filter(type => byType[type] > 0)
    : TRAINING_TYPES.slice(0, 6);

  if (!hasData) {
    return (
      <div className="text-center py-8 text-stone-400">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No training data available</p>
      </div>
    );
  }


  return (
    <div className="space-y-5 max-h-[300px] overflow-y-auto pr-2">
    {displayTypes.map((type) => {
      const value = byType[type] || 0;
      const pct = (value / maxValue) * 100;

      return (
        <div key={type} className="flex items-center gap-3 mb-5">
          <span
            className="text-xs text-stone-600 w-32 truncate"
            title={type}
          >
            {type}
          </span>

          <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          <span className="text-xs font-semibold text-stone-700 w-8 text-right">
            {value}
          </span>
        </div>
      );
    })}
  </div>
  );
}

// Training Coverage Stats
function TrainingCoverageStats({ coverage }) {
  const { employees_trained = 0, workers_trained = 0, female_pct = 0, total_attendees = 0 } = coverage;

  const stats = [
    { label: 'Total Attendees', value: total_attendees, color: 'blue' },
    { label: 'Employees Trained', value: employees_trained, color: 'indigo' },
    { label: 'Workers Trained', value: workers_trained, color: 'violet' },
    { label: 'Female Attendees %', value: `${female_pct}%`, color: 'pink' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className={`bg-${stat.color}-50 rounded-lg p-4 border border-${stat.color}-100`}>
          <p className="text-xs text-stone-500 mb-1">{stat.label}</p>
          <p className={`text-2xl font-bold text-${stat.color}-600`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

// Complaints by Type - Stacked Horizontal Bars
function ComplaintsByTypeChart({ byType }) {
  const { General = 0, Principal = 0, Consumer = 0 } = byType;
  const total = General + Principal + Consumer;
  
  const types = [
    { label: 'General', value: General, color: 'bg-amber-500' },
    { label: 'Principal', value: Principal, color: 'bg-orange-500' },
    { label: 'Consumer', value: Consumer, color: 'bg-red-500' },
  ];

  if (total === 0) {
    return (
      <div className="text-center py-8 text-stone-400">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No complaints data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="h-8 flex rounded-lg overflow-hidden bg-stone-100">
        {types.map((type) => {
          const pct = (type.value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={type.label}
              className={`${type.color} transition-all duration-500 flex items-center justify-center`}
              style={{ width: `${pct}%` }}
              title={`${type.label}: ${type.value}`}
            >
              {pct > 15 && <span className="text-xs text-white font-medium">{type.value}</span>}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center">
        {types.map((type) => (
          <div key={type.label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded ${type.color}`} />
            <span className="text-xs text-stone-600">{type.label}: {type.value}</span>
          </div>
        ))}
      </div>
      <div className="text-center text-sm font-semibold text-stone-700">
        Total: {total}
      </div>
    </div>
  );
}

// Complaint Topics Treemap
function ComplaintTopicsTreemap({ byTopic }) {
  const TOPIC_COLORS = {
    'Working Conditions': 'bg-blue-500',
    'Safety': 'bg-emerald-500',
    'Health': 'bg-teal-500',
    'POSH': 'bg-rose-500',
    'Discrimination': 'bg-purple-500',
    'Wages': 'bg-amber-500',
    'Human Rights': 'bg-indigo-500',
    'Cybersecurity': 'bg-cyan-500',
    'Data Privacy': 'bg-violet-500',
  };

  const topics = Object.entries(byTopic).map(([topic, count]) => ({
    topic,
    count,
    color: TOPIC_COLORS[topic] || 'bg-stone-400'
  })).sort((a, b) => b.count - a.count);

  const total = topics.reduce((sum, t) => sum + t.count, 0);

  if (total === 0) {
    return (
      <div className="text-center py-8 text-stone-400">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No topic data available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 h-[200px]">
      {topics.slice(0, 9).map((item, idx) => {
        const pct = (item.count / total) * 100;
        // Vary sizes based on value
        const sizeClass = pct > 30 ? 'col-span-2 row-span-2' : pct > 15 ? 'col-span-1 row-span-2' : '';
        return (
          <div
            key={item.topic}
            className={`${item.color} ${sizeClass} rounded-lg p-2 flex flex-col justify-between transition-transform hover:scale-105 cursor-default`}
            title={`${item.topic}: ${item.count}`}
          >
            <span className="text-[10px] text-white/90 font-medium truncate">{item.topic}</span>
            <span className="text-lg font-bold text-white">{item.count}</span>
          </div>
        );
      })}
    </div>
  );
}

// Compliance & Escalation Status Cards
function ComplianceStatusCards({ compliance, poshCases }) {
  const { law_enforcement = 0, open = 0, closed = 0, total = 0 } = compliance;
  
  const stats = [
    { 
      label: 'Law Enforcement', 
      value: law_enforcement, 
      icon: '⚖️',
      color: law_enforcement > 0 ? 'bg-red-50 border-red-200' : 'bg-stone-50 border-stone-200',
      textColor: law_enforcement > 0 ? 'text-red-600' : 'text-stone-600'
    },
    { 
      label: 'POSH Cases', 
      value: poshCases, 
      icon: '🛡️',
      color: poshCases > 0 ? 'bg-rose-50 border-rose-200' : 'bg-stone-50 border-stone-200',
      textColor: poshCases > 0 ? 'text-rose-600' : 'text-stone-600'
    },
    { 
      label: 'Open', 
      value: open, 
      icon: '📂',
      color: open > 0 ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200',
      textColor: open > 0 ? 'text-amber-600' : 'text-stone-600'
    },
    { 
      label: 'Closed', 
      value: closed, 
      icon: '✅',
      color: 'bg-emerald-50 border-emerald-200',
      textColor: 'text-emerald-600'
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className={`${stat.color} rounded-lg p-3 border`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{stat.icon}</span>
            <span className="text-xs text-stone-500">{stat.label}</span>
          </div>
          <p className={`text-xl font-bold ${stat.textColor}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
