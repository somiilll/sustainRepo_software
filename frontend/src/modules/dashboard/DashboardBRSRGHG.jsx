/**
 * DashboardBRSRGHG — Premium Enterprise BRSR + GHG Dashboard
 * 
 * Continuous ESG Monitoring & Operational Intelligence Platform
 * 
 * Sections:
 * 1. Top KPI Row - Net Emissions, Energy, Water, Waste, Safety
 * 2. Emissions Trend + Scope Donut
 * 3. Targets & Reduction Progress + Incident Trends
 * 4. Water Management + Waste Management
 * 5. Water & Waste Trends
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell
} from 'recharts';

// Layout & Shared Components
import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import AnimatedNumber from './components/shared/AnimatedNumber';
import GlowSparkline from './components/shared/GlowSparkline';

// Existing Charts
import ScopeTrendChart from './components/charts/ScopeTrendChart';
import EmissionsByScopeDonut from './components/charts/EmissionsByScopeDonut';

// Icons
import { 
  Leaf, Droplets, Trash2, AlertTriangle, Zap, Target, TrendingUp, TrendingDown,
  Minus, ArrowUpRight, ArrowDownRight, Download, Bell, RefreshCw, Factory,
  Recycle, Shield, Users, AlertCircle, CheckCircle2, XCircle, Activity,
  BarChart3, Waves, Flame, Building2
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// =============================================================================
// Premium KPI Card Component
// =============================================================================
function PremiumKpiCard({
  title,
  value,
  unit,
  intensityValue,
  intensityUnit,
  showIntensity = false,
  yoyChange,
  targetValue,
  baseYearReduction,
  sparkData = [],
  icon: Icon,
  accentColor = '#10B981',
  loading = false,
  invertedTrend = true, // For most ESG metrics, decrease is good
}) {
  const displayValue = showIntensity && intensityValue != null ? intensityValue : value;
  const displayUnit = showIntensity && intensityUnit ? intensityUnit : unit;

  // Trend calculation
  const trend = yoyChange == null ? 'flat' : Math.abs(yoyChange) < 0.5 ? 'flat' : yoyChange > 0 ? 'up' : 'down';
  const isPositiveTrend = invertedTrend ? trend === 'down' : trend === 'up';
  const trendColor = trend === 'flat' ? 'text-stone-500' : isPositiveTrend ? 'text-emerald-600' : 'text-rose-600';
  const TrendIcon = trend === 'flat' ? Minus : trend === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <Card 
      className="relative overflow-hidden p-5 bg-white border border-stone-200/60 rounded-2xl hover:shadow-lg transition-all duration-300 group"
      data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Accent top border */}
      <div className="absolute inset-x-0 top-0 h-1 opacity-80" style={{ background: accentColor }} />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="p-2.5 rounded-xl transition-transform group-hover:scale-105"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Icon className="w-5 h-5" style={{ color: accentColor }} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</p>
        </div>
        {/* Trend indicator */}
        {yoyChange != null && trend !== 'flat' && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
            <TrendIcon className="w-4 h-4" />
            <span>{Math.abs(yoyChange).toFixed(1)}%</span>
          </div>
        )}
      </div>

      {/* Main Value */}
      <div className="mb-3">
        {loading ? (
          <div className="h-9 w-28 bg-stone-100 rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-stone-900 tabular-nums tracking-tight">
              <AnimatedNumber value={displayValue || 0} decimals={displayValue >= 100 ? 0 : 2} />
            </span>
            <span className="text-sm text-stone-500 font-medium">{displayUnit}</span>
          </div>
        )}
      </div>

      {/* Target vs Actual */}
      {targetValue != null && (
        <div className="flex items-center gap-2 text-xs mb-2">
          <Target className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-stone-500">Target:</span>
          <span className="font-semibold text-stone-700">{targetValue.toLocaleString()} {unit}</span>
        </div>
      )}

      {/* Base Year Reduction */}
      {baseYearReduction != null && (
        <div className="flex items-center gap-2 text-xs mb-2">
          <Activity className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-stone-500">vs Base Year:</span>
          <span className={`font-semibold ${baseYearReduction <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {baseYearReduction > 0 ? '+' : ''}{baseYearReduction.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <div className="mt-3 -mx-2">
          <GlowSparkline data={sparkData} width={180} height={32} stroke={accentColor} />
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Intensity Toggle Component
// =============================================================================
function IntensityToggle({ mode, setMode }) {
  return (
    <div className="inline-flex items-center bg-stone-100 rounded-lg p-0.5 text-xs" data-testid="intensity-toggle">
      <button
        onClick={() => setMode('revenue')}
        className={`px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'revenue' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        By Revenue
      </button>
      <button
        onClick={() => setMode('production')}
        className={`px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'production' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        By Production
      </button>
    </div>
  );
}

// =============================================================================
// Progress Bar Component for Targets
// =============================================================================
function TargetProgressBar({ label, current, target, targetYear, unit = '%', color = '#10B981' }) {
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const achieved = progress >= 100;

  return (
    <div className="mb-4" data-testid={`target-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500">Target: {targetYear}</span>
          {achieved && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        </div>
      </div>
      <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-stone-500">{current.toFixed(1)}{unit} achieved</span>
        <span className="text-xs font-medium" style={{ color }}>{progress.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// =============================================================================
// Incident Trend Chart Component
// =============================================================================
function IncidentTrendChart({ data = [], category = 'safety', height = 260 }) {
  const categoryConfig = {
    safety: {
      title: 'Safety Incidents',
      keys: ['injury', 'fatality', 'ill_health', 'near_miss'],
      colors: ['#F43F5E', '#DC2626', '#F97316', '#FBBF24'],
      labels: ['Injury', 'Fatality', 'Ill-health', 'Near Miss']
    },
    complaints: {
      title: 'Complaints',
      keys: ['workplace', 'harassment', 'discrimination', 'human_rights', 'consumer'],
      colors: ['#8B5CF6', '#A855F7', '#C084FC', '#D8B4FE', '#E9D5FF'],
      labels: ['Workplace', 'Harassment', 'Discrimination', 'Human Rights', 'Consumer']
    },
    breaches: {
      title: 'Data Breaches',
      keys: ['unauthorized', 'phishing', 'ransomware', 'insider'],
      colors: ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD'],
      labels: ['Unauthorized', 'Phishing', 'Ransomware', 'Insider']
    }
  };

  const config = categoryConfig[category] || categoryConfig.safety;

  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-stone-400">
        No incident data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
        <XAxis dataKey="period" stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: '1px solid #E7E5E4',
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        {config.keys.map((key, idx) => (
          <Line 
            key={key}
            type="monotone" 
            dataKey={key} 
            name={config.labels[idx]}
            stroke={config.colors[idx]} 
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// Water Management Section
// =============================================================================
function WaterManagementSection({ data = {}, loading = false }) {
  const waterSources = [
    { key: 'groundwater', label: 'Groundwater', color: '#0EA5E9' },
    { key: 'surface', label: 'Surface Water', color: '#38BDF8' },
    { key: 'municipal', label: 'Municipal', color: '#7DD3FC' },
    { key: 'rainwater', label: 'Rainwater', color: '#BAE6FD' },
    { key: 'recycled', label: 'Recycled', color: '#10B981' },
  ];

  const sourceData = waterSources.map(s => ({
    name: s.label,
    value: data[s.key] || 0,
    color: s.color
  })).filter(s => s.value > 0);

  const totalWithdrawn = data.withdrawn || 0;
  const totalConsumed = data.consumed || 0;
  const totalDischarged = data.discharged || 0;
  const recycledPct = data.recycled_pct || 0;

  return (
    <div className="space-y-4">
      {/* Mini KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <Droplets className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">Withdrawn</span>
          </div>
          <p className="text-xl font-bold text-blue-900">{totalWithdrawn.toLocaleString()}<span className="text-sm font-normal ml-1">KL</span></p>
        </div>
        <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-100">
          <div className="flex items-center gap-2 mb-1">
            <Waves className="w-4 h-4 text-cyan-600" />
            <span className="text-xs font-medium text-cyan-700">Consumed</span>
          </div>
          <p className="text-xl font-bold text-cyan-900">{totalConsumed.toLocaleString()}<span className="text-sm font-normal ml-1">KL</span></p>
        </div>
        <div className="p-3 bg-sky-50 rounded-xl border border-sky-100">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownRight className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-medium text-sky-700">Discharged</span>
          </div>
          <p className="text-xl font-bold text-sky-900">{totalDischarged.toLocaleString()}<span className="text-sm font-normal ml-1">KL</span></p>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <Recycle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">Recycled</span>
          </div>
          <p className="text-xl font-bold text-emerald-900">{recycledPct.toFixed(1)}<span className="text-sm font-normal ml-1">%</span></p>
        </div>
      </div>

      {/* Source Breakdown */}
      {sourceData.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-stone-500 uppercase mb-3">Water Sources</p>
          <div className="space-y-2">
            {sourceData.map((source) => (
              <div key={source.name} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: source.color }} />
                <span className="text-sm text-stone-600 flex-1">{source.name}</span>
                <span className="text-sm font-medium text-stone-900">{source.value.toLocaleString()} KL</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Treated vs Untreated */}
      <div className="mt-4 p-3 bg-stone-50 rounded-xl">
        <p className="text-xs font-semibold text-stone-500 uppercase mb-2">Treatment Status</p>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-stone-500">Treated</span>
              <span className="font-medium text-emerald-600">{data.treated_pct || 85}%</span>
            </div>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.treated_pct || 85}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Waste Management Section
// =============================================================================
function WasteManagementSection({ data = {}, loading = false }) {
  const wasteCategories = [
    { key: 'plastic', label: 'Plastic', color: '#F43F5E' },
    { key: 'ewaste', label: 'E-waste', color: '#8B5CF6' },
    { key: 'hazardous', label: 'Hazardous', color: '#DC2626' },
    { key: 'metal', label: 'Metal Scrap', color: '#F59E0B' },
    { key: 'paper', label: 'Paper', color: '#10B981' },
    { key: 'organic', label: 'Organic', color: '#84CC16' },
  ];

  const categoryData = wasteCategories.map(c => ({
    name: c.label,
    value: data[c.key] || 0,
    color: c.color
  })).filter(c => c.value > 0);

  const totalGenerated = data.generated || 0;
  const totalRecovered = data.recovered || 0;
  const totalDisposed = data.disposed || 0;
  const recoveryPct = totalGenerated > 0 ? (totalRecovered / totalGenerated) * 100 : 0;
  const hazardousPct = data.hazardous_pct || 0;

  return (
    <div className="space-y-4">
      {/* Mini KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
          <div className="flex items-center gap-2 mb-1">
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-medium text-rose-700">Generated</span>
          </div>
          <p className="text-lg font-bold text-rose-900">{totalGenerated.toLocaleString()}<span className="text-xs font-normal ml-1">MT</span></p>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <Recycle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700">Recovered</span>
          </div>
          <p className="text-lg font-bold text-emerald-900">{totalRecovered.toLocaleString()}<span className="text-xs font-normal ml-1">MT</span></p>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
          <div className="flex items-center gap-2 mb-1">
            <Factory className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-700">Disposed</span>
          </div>
          <p className="text-lg font-bold text-amber-900">{totalDisposed.toLocaleString()}<span className="text-xs font-normal ml-1">MT</span></p>
        </div>
      </div>

      {/* Recovery Rate */}
      <div className="p-3 bg-stone-50 rounded-xl">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-stone-500 uppercase">Recovery Rate</span>
          <span className="text-sm font-bold text-emerald-600">{recoveryPct.toFixed(1)}%</span>
        </div>
        <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${recoveryPct}%` }} />
        </div>
      </div>

      {/* Hazardous vs Non-Hazardous */}
      <div className="flex gap-3">
        <div className="flex-1 p-3 bg-red-50 rounded-xl border border-red-100 text-center">
          <p className="text-xs text-red-600 font-medium mb-1">Hazardous</p>
          <p className="text-lg font-bold text-red-700">{hazardousPct.toFixed(1)}%</p>
        </div>
        <div className="flex-1 p-3 bg-green-50 rounded-xl border border-green-100 text-center">
          <p className="text-xs text-green-600 font-medium mb-1">Non-Hazardous</p>
          <p className="text-lg font-bold text-green-700">{(100 - hazardousPct).toFixed(1)}%</p>
        </div>
      </div>

      {/* Category Breakdown */}
      {categoryData.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-stone-500 uppercase mb-3">By Category</p>
          <div className="space-y-2">
            {categoryData.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="text-sm text-stone-600 flex-1">{cat.name}</span>
                <span className="text-sm font-medium text-stone-900">{cat.value.toLocaleString()} MT</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Water/Waste Trend Chart
// =============================================================================
function ResourceTrendChart({ data = [], type = 'water', height = 220 }) {
  const config = type === 'water' ? {
    keys: ['withdrawn', 'consumed', 'discharged', 'recycled'],
    colors: ['#0EA5E9', '#06B6D4', '#38BDF8', '#10B981'],
    labels: ['Withdrawn', 'Consumed', 'Discharged', 'Recycled']
  } : {
    keys: ['generated', 'recovered', 'disposed'],
    colors: ['#F43F5E', '#10B981', '#F59E0B'],
    labels: ['Generated', 'Recovered', 'Disposed']
  };

  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[220px] text-sm text-stone-400">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          {config.keys.map((key, idx) => (
            <linearGradient key={key} id={`grad-${type}-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={config.colors[idx]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={config.colors[idx]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
        <XAxis dataKey="period" stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: '1px solid #E7E5E4',
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        {config.keys.map((key, idx) => (
          <Area 
            key={key}
            type="monotone" 
            dataKey={key} 
            name={config.labels[idx]}
            stroke={config.colors[idx]} 
            fill={`url(#grad-${type}-${key})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// Alert Center Component
// =============================================================================
function AlertCenter({ alerts = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-stone-100 transition-colors"
        data-testid="alert-center-btn"
      >
        <Bell className="w-5 h-5 text-stone-600" />
        {(criticalCount + warningCount) > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
            criticalCount > 0 ? 'bg-rose-500' : 'bg-amber-500'
          }`}>
            {criticalCount + warningCount}
          </span>
        )}
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-stone-200 z-50 overflow-hidden">
            <div className="p-3 border-b border-stone-100 bg-stone-50">
              <h4 className="font-semibold text-stone-900 text-sm">Alert Center</h4>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-4 text-center text-stone-500 text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  All metrics within targets
                </div>
              ) : (
                alerts.map((alert, idx) => (
                  <div key={idx} className="p-3 border-b border-stone-50 hover:bg-stone-50 transition-colors">
                    <div className="flex items-start gap-2">
                      {alert.severity === 'critical' ? (
                        <XCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-stone-900">{alert.title}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{alert.message}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Main Dashboard Component
// =============================================================================
export default function DashboardBRSRGHG({ data }) {
  const { getAuthHeader } = useAuth();
  const {
    stats, loading, organization, facilities,
    selectedFacilities, setSelectedFacilities,
    dateRange, setDateRange,
    showFilters, setShowFilters,
    showFacilityDropdown, setShowFacilityDropdown, facilityDropdownRef,
    filteredData, baseYearComparison,
    isLive, lastLiveUpdateAt,
  } = data;

  const [intensityMode, setIntensityMode] = useState('revenue');
  const [incidentCategory, setIncidentCategory] = useState('safety');
  const [esgMetrics, setEsgMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);
  const [targets, setTargets] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // Fetch BRSR/ESG-specific metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setEsgLoading(true);
      try {
        const [metricsRes, targetsRes] = await Promise.all([
          axios.get(`${API}/esg-records/dashboard-metrics`, {
            headers: getAuthHeader(),
            params: {
              start_date: dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined,
              end_date: dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined,
              facility_ids: selectedFacilities.length > 0 ? selectedFacilities.join(',') : undefined,
            }
          }).catch(() => ({ data: null })),
          axios.get(`${API}/targets`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        ]);
        
        setEsgMetrics(metricsRes.data);
        setTargets(targetsRes.data || []);
        generateAlerts(metricsRes.data, targetsRes.data || []);
      } catch (error) {
        console.error('Metrics fetch error:', error);
      } finally {
        setEsgLoading(false);
      }
    };

    if (dateRange.from && dateRange.to) {
      fetchMetrics();
    }
  }, [dateRange, selectedFacilities, getAuthHeader]);

  // Generate alerts
  const generateAlerts = (metrics, targets) => {
    const newAlerts = [];
    if (metrics?.safety_incidents > 0) {
      newAlerts.push({
        severity: 'critical',
        title: 'Safety Incidents',
        message: `${metrics.safety_incidents} incidents recorded`,
      });
    }
    if (metrics?.data_breaches > 0) {
      newAlerts.push({
        severity: 'critical',
        title: 'Data Breaches',
        message: `${metrics.data_breaches} security incidents`,
      });
    }
    setAlerts(newAlerts);
  };

  // Intensity calculations
  const turnover = organization?.turnover_value || null;
  const productionQty = organization?.production_quantity || null;
  const hasIntensityData = turnover || productionQty;

  const totals = filteredData?.totals || {};
  const netEmissions = (totals.total || 0) - (filteredData?.filteredSinks || 0);
  const netEnergy = esgMetrics?.total_energy || 0;

  const emissionIntensityRevenue = turnover ? netEmissions / turnover : null;
  const emissionIntensityProd = productionQty ? netEmissions / productionQty : null;
  const energyIntensityRevenue = turnover ? netEnergy / turnover : null;
  const energyIntensityProd = productionQty ? netEnergy / productionQty : null;

  // Build sparkline data
  const buildSparkData = useCallback((trendData, key) => {
    if (!trendData || !Array.isArray(trendData)) return [];
    return trendData.map((d, i) => ({ x: i, y: d[key] || 0 }));
  }, []);

  const emissionsSparkData = useMemo(() => buildSparkData(filteredData?.trend, 'total'), [filteredData?.trend, buildSparkData]);

  // Build donut data for emissions split
  const donutData = useMemo(() => {
    const t = totals;
    const total = t.total || 0;
    if (!total) return [];
    return [
      { id: 'scope1', name: 'Scope 1', value: t.scope1 || 0, pct: total ? ((t.scope1 || 0) / total) * 100 : 0 },
      { id: 'scope2', name: 'Scope 2', value: t.scope2 || 0, pct: total ? ((t.scope2 || 0) / total) * 100 : 0 },
      { id: 'scope3', name: 'Scope 3', value: t.scope3 || 0, pct: total ? ((t.scope3 || 0) / total) * 100 : 0 },
      { id: 'biogenic', name: 'Biogenic', value: t.biogenic || 0, pct: total ? ((t.biogenic || 0) / total) * 100 : 0 },
    ].filter(d => d.value > 0);
  }, [totals]);

  // Filter props
  const filterProps = {
    dateRange,
    setDateRange,
    facilities,
    selectedFacilities,
    setSelectedFacilities,
    showFacilityDropdown,
    setShowFacilityDropdown,
    facilityDropdownRef,
  };

  // Live badge
  const liveBadge = isLive ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      LIVE
    </span>
  ) : null;

  // Mock incident trend data
  const incidentTrendData = useMemo(() => {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map(m => ({
      period: m,
      injury: Math.floor(Math.random() * 3),
      fatality: Math.random() > 0.95 ? 1 : 0,
      ill_health: Math.floor(Math.random() * 2),
      near_miss: Math.floor(Math.random() * 5),
      workplace: Math.floor(Math.random() * 2),
      harassment: Math.floor(Math.random() * 1),
      discrimination: 0,
      human_rights: 0,
      consumer: Math.floor(Math.random() * 3),
      unauthorized: Math.floor(Math.random() * 1),
      phishing: Math.floor(Math.random() * 2),
      ransomware: 0,
      insider: 0,
    }));
  }, []);

  // Mock water/waste trend data
  const waterTrendData = useMemo(() => {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map(m => ({
      period: m,
      withdrawn: 800 + Math.random() * 200,
      consumed: 600 + Math.random() * 150,
      discharged: 150 + Math.random() * 50,
      recycled: 100 + Math.random() * 80,
    }));
  }, []);

  const wasteTrendData = useMemo(() => {
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    return months.map(m => ({
      period: m,
      generated: 50 + Math.random() * 20,
      recovered: 30 + Math.random() * 15,
      disposed: 15 + Math.random() * 10,
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-stone-500 text-sm">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-brsr-ghg">
      {/* Sticky Filter Bar */}
      <StickyFilterBar
        title="BRSR Dashboard"
        subtitle={organization?.name || 'Enterprise ESG Operating System'}
        liveBadge={liveBadge}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filterProps={filterProps}
      />

      {/* Top Action Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {hasIntensityData && (
            <IntensityToggle mode={intensityMode} setMode={setIntensityMode} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <AlertCenter alerts={alerts} />
          <Button variant="outline" size="sm" className="text-xs" data-testid="export-btn">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* ROW 1: TOP KPI CARDS */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="top-kpi-row">
        <PremiumKpiCard
          title={hasIntensityData ? "Emission Intensity" : "Net Emissions"}
          value={netEmissions}
          unit="tCO₂e"
          intensityValue={intensityMode === 'revenue' ? emissionIntensityRevenue : emissionIntensityProd}
          intensityUnit={intensityMode === 'revenue' ? 'tCO₂e/Cr' : 'tCO₂e/unit'}
          showIntensity={hasIntensityData && (intensityMode === 'revenue' ? emissionIntensityRevenue != null : emissionIntensityProd != null)}
          yoyChange={data.trendDeltas?.totalDelta}
          sparkData={emissionsSparkData}
          icon={Leaf}
          accentColor="#10B981"
          loading={loading}
        />
        <PremiumKpiCard
          title={hasIntensityData ? "Energy Intensity" : "Net Energy"}
          value={netEnergy}
          unit="MWh"
          intensityValue={intensityMode === 'revenue' ? energyIntensityRevenue : energyIntensityProd}
          intensityUnit={intensityMode === 'revenue' ? 'MWh/Cr' : 'MWh/unit'}
          showIntensity={hasIntensityData && (intensityMode === 'revenue' ? energyIntensityRevenue != null : energyIntensityProd != null)}
          icon={Zap}
          accentColor="#F59E0B"
          loading={esgLoading}
        />
        <PremiumKpiCard
          title="Water Disposed"
          value={esgMetrics?.water_discharged || 0}
          unit="KL"
          yoyChange={esgMetrics?.water_yoy_change}
          icon={Droplets}
          accentColor="#0EA5E9"
          loading={esgLoading}
        />
        <PremiumKpiCard
          title="Waste Generated"
          value={esgMetrics?.waste_generated || 0}
          unit="MT"
          yoyChange={esgMetrics?.waste_yoy_change}
          icon={Trash2}
          accentColor="#F43F5E"
          loading={esgLoading}
        />
        <PremiumKpiCard
          title="Safety Incidents"
          value={esgMetrics?.safety_incidents || 0}
          unit="incidents"
          icon={AlertTriangle}
          accentColor="#DC2626"
          loading={esgLoading}
        />
      </div>

      {/* ================================================================== */}
      {/* ROW 2: EMISSIONS TREND + SCOPE DONUT */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard
          title="Emissions Trend"
          subtitle="Monthly emissions over selected period"
          accent="#10B981"
          testId="emissions-trend-section"
          className="lg:col-span-2"
        >
          <div className="h-72">
            <ScopeTrendChart data={filteredData?.trend || []} hasScope3={data.hasScope3Access} height={280} />
          </div>
        </SectionCard>

        <SectionCard
          title="Emissions Split"
          subtitle="By scope category"
          accent="#3B82F6"
          testId="emissions-split-section"
        >
          <EmissionsByScopeDonut data={donutData} height={220} />
        </SectionCard>
      </div>

      {/* ================================================================== */}
      {/* ROW 3: TARGETS & REDUCTION + INCIDENT TRENDS */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Targets & Reduction Progress"
          subtitle="Progress towards sustainability goals"
          accent="#8B5CF6"
          testId="targets-section"
        >
          <div className="space-y-1">
            <TargetProgressBar 
              label="Net Zero Target" 
              current={35} 
              target={100} 
              targetYear="2050" 
              color="#10B981"
            />
            <TargetProgressBar 
              label="Emission Reduction" 
              current={22} 
              target={50} 
              targetYear="2030" 
              color="#3B82F6"
            />
            <TargetProgressBar 
              label="Energy Reduction" 
              current={18} 
              target={30} 
              targetYear="2030" 
              color="#F59E0B"
            />
            <TargetProgressBar 
              label="Water Reduction" 
              current={12} 
              target={25} 
              targetYear="2030" 
              color="#0EA5E9"
            />
            <TargetProgressBar 
              label="Waste Recovery" 
              current={65} 
              target={80} 
              targetYear="2030" 
              color="#F43F5E"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Incident Trends"
          accent="#F43F5E"
          testId="incident-trends-section"
          header={
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-800">Incident Trends</h3>
                <p className="text-xs text-stone-500 mt-0.5">Monthly tracking by category</p>
              </div>
              <div className="flex gap-1">
                {['safety', 'complaints', 'breaches'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setIncidentCategory(cat)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      incidentCategory === cat 
                        ? 'bg-stone-900 text-white' 
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {cat === 'safety' ? 'Safety' : cat === 'complaints' ? 'Complaints' : 'Breaches'}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <IncidentTrendChart data={incidentTrendData} category={incidentCategory} />
        </SectionCard>
      </div>

      {/* ================================================================== */}
      {/* ROW 4: WATER + WASTE MANAGEMENT */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Water Management"
          subtitle="Withdrawal, consumption & recycling"
          accent="#0EA5E9"
          testId="water-management-section"
        >
          <WaterManagementSection 
            data={{
              withdrawn: esgMetrics?.water_withdrawn || 12500,
              consumed: esgMetrics?.water_consumed || 9800,
              discharged: esgMetrics?.water_discharged || 2200,
              recycled_pct: esgMetrics?.water_recycling_pct || 28,
              groundwater: 4500,
              surface: 3200,
              municipal: 3800,
              rainwater: 500,
              recycled: 500,
              treated_pct: 88,
            }} 
            loading={esgLoading}
          />
        </SectionCard>

        <SectionCard
          title="Waste Management"
          subtitle="Generation, recovery & disposal"
          accent="#F43F5E"
          testId="waste-management-section"
        >
          <WasteManagementSection 
            data={{
              generated: esgMetrics?.waste_generated || 850,
              recovered: esgMetrics?.waste_recovered || 520,
              disposed: esgMetrics?.waste_disposed || 330,
              hazardous_pct: 18,
              plastic: 120,
              ewaste: 45,
              hazardous: 85,
              metal: 180,
              paper: 95,
              organic: 325,
            }}
            loading={esgLoading}
          />
        </SectionCard>
      </div>

      {/* ================================================================== */}
      {/* ROW 5: WATER & WASTE TRENDS */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Water Trend"
          subtitle="Monthly water metrics"
          accent="#0EA5E9"
          testId="water-trend-section"
        >
          <ResourceTrendChart data={waterTrendData} type="water" />
        </SectionCard>

        <SectionCard
          title="Waste Trend"
          subtitle="Monthly waste metrics"
          accent="#F43F5E"
          testId="waste-trend-section"
        >
          <ResourceTrendChart data={wasteTrendData} type="waste" />
        </SectionCard>
      </div>
    </div>
  );
}
