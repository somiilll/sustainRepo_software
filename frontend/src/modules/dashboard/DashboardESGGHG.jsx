/**
 * DashboardESGGHG — Premium Enterprise ESG Operating System Dashboard
 * 
 * Features:
 * - FY selector, Date range, Facility filters
 * - Premium KPI cards with intensity toggle (Revenue/Production)
 * - Trend analysis, target tracking, base year comparison
 * - Alert center, Export functionality
 * - Facility-level drilldown
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

// Layout & Shared
import StickyFilterBar from './components/filters/StickyFilterBar';
import SectionCard from './components/layout/SectionCard';
import AnimatedNumber from './components/shared/AnimatedNumber';
import GlowSparkline from './components/shared/GlowSparkline';

// Charts (reuse from GHG)
import ScopeTrendChart from './components/charts/ScopeTrendChart';
import FacilityChart from './components/charts/FacilityChart';
import BaseYearComparisonChart from './components/charts/BaseYearChart';

// Icons
import { 
  Leaf, Droplets, Trash2, Shield, AlertTriangle, GraduationCap,
  Zap, Recycle, Users, Bell, Download, ChevronDown, Target,
  TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight,
  Factory, Building2, FileText, CheckCircle2, XCircle, AlertCircle,
  BarChart3, PieChart, Activity, Sparkles, RefreshCw
} from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// =============================================================================
// ESG KPI Card Component - Premium Design
// =============================================================================
function ESGKpiCard({
  title,
  value,
  unit,
  intensityValue,
  intensityUnit,
  showIntensity = false,
  yoyChange,
  targetValue,
  targetLabel = 'Target',
  baseYearReduction,
  sparkData = [],
  status = 'neutral', // 'good' | 'warning' | 'critical' | 'neutral'
  icon: Icon,
  color = 'emerald',
  loading = false,
  invertedTrend = false, // For metrics where decrease is good
}) {
  const statusColors = {
    good: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-rose-500',
    neutral: 'bg-stone-400',
  };

  const colorMap = {
    emerald: { bg: 'from-emerald-500/10 to-emerald-500/5', border: 'border-emerald-200/50', icon: 'text-emerald-600', spark: '#10B981' },
    blue: { bg: 'from-blue-500/10 to-blue-500/5', border: 'border-blue-200/50', icon: 'text-blue-600', spark: '#3B82F6' },
    amber: { bg: 'from-amber-500/10 to-amber-500/5', border: 'border-amber-200/50', icon: 'text-amber-600', spark: '#F59E0B' },
    purple: { bg: 'from-purple-500/10 to-purple-500/5', border: 'border-purple-200/50', icon: 'text-purple-600', spark: '#8B5CF6' },
    rose: { bg: 'from-rose-500/10 to-rose-500/5', border: 'border-rose-200/50', icon: 'text-rose-600', spark: '#F43F5E' },
    cyan: { bg: 'from-cyan-500/10 to-cyan-500/5', border: 'border-cyan-200/50', icon: 'text-cyan-600', spark: '#06B6D4' },
    teal: { bg: 'from-teal-500/10 to-teal-500/5', border: 'border-teal-200/50', icon: 'text-teal-600', spark: '#14B8A6' },
    indigo: { bg: 'from-indigo-500/10 to-indigo-500/5', border: 'border-indigo-200/50', icon: 'text-indigo-600', spark: '#6366F1' },
  };

  const colors = colorMap[color] || colorMap.emerald;
  const displayValue = showIntensity && intensityValue != null ? intensityValue : value;
  const displayUnit = showIntensity && intensityUnit ? intensityUnit : unit;

  // Determine trend direction
  const trend = yoyChange == null ? 'flat' : Math.abs(yoyChange) < 0.5 ? 'flat' : yoyChange > 0 ? 'up' : 'down';
  const isPositiveTrend = invertedTrend ? trend === 'down' : trend === 'up';
  const trendColor = trend === 'flat' ? 'text-stone-500' : isPositiveTrend ? 'text-emerald-600' : 'text-rose-600';
  const TrendIcon = trend === 'flat' ? Minus : trend === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <Card 
      className={`relative overflow-hidden p-4 bg-gradient-to-br ${colors.bg} ${colors.border} border rounded-2xl hover:shadow-lg transition-all duration-300 group`}
      data-testid={`esg-kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Status indicator */}
      <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${statusColors[status]} shadow-sm`} />
      
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`p-2 rounded-xl bg-white/60 ${colors.icon} group-hover:scale-105 transition-transform`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 truncate">{title}</p>
        </div>
      </div>

      {/* Value */}
      <div className="mb-2">
        {loading ? (
          <div className="h-8 w-24 bg-stone-200 rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-stone-900 tabular-nums">
              <AnimatedNumber value={displayValue || 0} decimals={displayValue >= 1000 ? 0 : 2} />
            </span>
            <span className="text-xs text-stone-500">{displayUnit}</span>
          </div>
        )}
      </div>

      {/* YoY Change */}
      {yoyChange != null && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trendColor} mb-2`}>
          <TrendIcon className="w-3.5 h-3.5" />
          <span>{Math.abs(yoyChange).toFixed(1)}% YoY</span>
        </div>
      )}

      {/* Target vs Actual */}
      {targetValue != null && (
        <div className="flex items-center gap-2 text-xs mb-2">
          <Target className="w-3 h-3 text-stone-400" />
          <span className="text-stone-500">{targetLabel}:</span>
          <span className="font-medium text-stone-700">{targetValue.toLocaleString()}</span>
        </div>
      )}

      {/* Base Year Reduction */}
      {baseYearReduction != null && (
        <div className="flex items-center gap-2 text-xs mb-2">
          <Activity className="w-3 h-3 text-stone-400" />
          <span className="text-stone-500">vs Base Year:</span>
          <span className={`font-medium ${baseYearReduction >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {baseYearReduction >= 0 ? '+' : ''}{baseYearReduction.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Mini Sparkline */}
      {sparkData.length > 1 && (
        <div className="mt-2 -mx-1">
          <GlowSparkline data={sparkData} width={140} height={28} stroke={colors.spark} />
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
          mode === 'revenue' 
            ? 'bg-white text-stone-900 shadow-sm' 
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        By Revenue
      </button>
      <button
        onClick={() => setMode('production')}
        className={`px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'production' 
            ? 'bg-white text-stone-900 shadow-sm' 
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        By Production
      </button>
    </div>
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
      )}
    </div>
  );
}

// =============================================================================
// Main Dashboard Component
// =============================================================================
export default function DashboardESGGHG({ data }) {
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
  const [esgMetrics, setEsgMetrics] = useState(null);
  const [esgLoading, setEsgLoading] = useState(true);
  const [targets, setTargets] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // Fetch ESG-specific metrics
  useEffect(() => {
    const fetchESGMetrics = async () => {
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
        
        // Generate alerts based on metrics
        generateAlerts(metricsRes.data, targetsRes.data || []);
      } catch (error) {
        console.error('ESG metrics fetch error:', error);
      } finally {
        setEsgLoading(false);
      }
    };

    if (dateRange.from && dateRange.to) {
      fetchESGMetrics();
    }
  }, [dateRange, selectedFacilities, getAuthHeader]);

  // Generate alerts based on metrics vs targets
  const generateAlerts = (metrics, targets) => {
    const newAlerts = [];
    
    // Example alert logic - can be extended based on real data
    if (metrics?.safety_incidents > 0) {
      newAlerts.push({
        severity: 'critical',
        title: 'Safety Incidents Reported',
        message: `${metrics.safety_incidents} safety incidents recorded this period`,
      });
    }
    if (metrics?.data_breaches > 0) {
      newAlerts.push({
        severity: 'critical',
        title: 'Data Breaches Detected',
        message: `${metrics.data_breaches} data security incidents`,
      });
    }
    if (metrics?.renewable_pct < 30) {
      newAlerts.push({
        severity: 'warning',
        title: 'Low Renewable Energy',
        message: `Renewable energy at ${metrics.renewable_pct?.toFixed(1)}%, below 30% target`,
      });
    }
    
    setAlerts(newAlerts);
  };

  // Compute intensity values
  const turnover = organization?.turnover_value || null;
  const productionQty = organization?.production_quantity || null;
  const hasIntensityData = turnover || productionQty;

  const totals = filteredData?.totals || {};
  const netEmissions = (totals.total || 0) - (filteredData?.filteredSinks || 0);
  const netEnergy = esgMetrics?.total_energy || 0;

  // Intensity calculations
  const emissionIntensityRevenue = turnover ? netEmissions / turnover : null;
  const emissionIntensityProd = productionQty ? netEmissions / productionQty : null;
  const energyIntensityRevenue = turnover ? netEnergy / turnover : null;
  const energyIntensityProd = productionQty ? netEnergy / productionQty : null;

  // Build sparkline data from trend
  const buildSparkData = useCallback((trendData, key) => {
    if (!trendData || !Array.isArray(trendData)) return [];
    return trendData.map((d, i) => ({ x: i, y: d[key] || 0 }));
  }, []);

  const emissionsSparkData = useMemo(() => buildSparkData(filteredData?.trend, 'total'), [filteredData?.trend, buildSparkData]);

  // KPI status determination
  const getStatus = (current, target, invertedBetter = false) => {
    if (!target) return 'neutral';
    const ratio = current / target;
    if (invertedBetter) {
      if (ratio <= 0.8) return 'good';
      if (ratio <= 1.0) return 'warning';
      return 'critical';
    }
    if (ratio >= 1.0) return 'good';
    if (ratio >= 0.8) return 'warning';
    return 'critical';
  };

  // Filter props for StickyFilterBar
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

  // Export handler
  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Export triggered');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-stone-500 text-sm">Loading ESG Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-esg-ghg">
      {/* Sticky Filter Bar */}
      <StickyFilterBar
        title="ESG Operating System"
        subtitle={organization?.name || 'Enterprise Dashboard'}
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="text-xs"
            data-testid="export-btn"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4" data-testid="kpi-overview-section">
        {/* Net Emissions / Intensity */}
        <ESGKpiCard
          title={hasIntensityData && intensityMode === 'revenue' && emissionIntensityRevenue != null 
            ? "Emission Intensity" 
            : hasIntensityData && intensityMode === 'production' && emissionIntensityProd != null
            ? "Emission Intensity"
            : "Net Emissions"}
          value={netEmissions}
          unit="tCO₂e"
          intensityValue={intensityMode === 'revenue' ? emissionIntensityRevenue : emissionIntensityProd}
          intensityUnit={intensityMode === 'revenue' ? 'tCO₂e / INR Cr' : 'tCO₂e / unit'}
          showIntensity={hasIntensityData && (intensityMode === 'revenue' ? emissionIntensityRevenue != null : emissionIntensityProd != null)}
          yoyChange={data.trendDeltas?.totalDelta}
          sparkData={emissionsSparkData}
          status={getStatus(netEmissions, targets.find(t => t.metric === 'emissions')?.target_value, true)}
          icon={Leaf}
          color="emerald"
          loading={loading}
          invertedTrend={true}
        />

        {/* Net Energy / Intensity */}
        <ESGKpiCard
          title={hasIntensityData ? "Energy Intensity" : "Net Energy"}
          value={netEnergy}
          unit="MWh"
          intensityValue={intensityMode === 'revenue' ? energyIntensityRevenue : energyIntensityProd}
          intensityUnit={intensityMode === 'revenue' ? 'MWh / INR Cr' : 'MWh / unit'}
          showIntensity={hasIntensityData && (intensityMode === 'revenue' ? energyIntensityRevenue != null : energyIntensityProd != null)}
          yoyChange={esgMetrics?.energy_yoy_change}
          sparkData={[]}
          status="neutral"
          icon={Zap}
          color="amber"
          loading={esgLoading}
          invertedTrend={true}
        />

        {/* Water Consumption */}
        <ESGKpiCard
          title="Water Consumption"
          value={esgMetrics?.water_consumption || 0}
          unit="KL"
          yoyChange={esgMetrics?.water_yoy_change}
          status={getStatus(esgMetrics?.water_consumption || 0, targets.find(t => t.metric === 'water')?.target_value, true)}
          icon={Droplets}
          color="blue"
          loading={esgLoading}
          invertedTrend={true}
        />

        {/* Waste Generated */}
        <ESGKpiCard
          title="Waste Generated"
          value={esgMetrics?.waste_generated || 0}
          unit="MT"
          yoyChange={esgMetrics?.waste_yoy_change}
          status={getStatus(esgMetrics?.waste_generated || 0, targets.find(t => t.metric === 'waste')?.target_value, true)}
          icon={Trash2}
          color="rose"
          loading={esgLoading}
          invertedTrend={true}
        />

        {/* Safety Incidents */}
        <ESGKpiCard
          title="Safety Incidents"
          value={esgMetrics?.safety_incidents || 0}
          unit="incidents"
          yoyChange={esgMetrics?.safety_yoy_change}
          status={esgMetrics?.safety_incidents > 0 ? 'critical' : 'good'}
          icon={AlertTriangle}
          color="rose"
          loading={esgLoading}
          invertedTrend={true}
        />

        {/* Complaints */}
        <ESGKpiCard
          title="Complaints"
          value={esgMetrics?.complaints || 0}
          unit="complaints"
          yoyChange={esgMetrics?.complaints_yoy_change}
          status={esgMetrics?.complaints > 5 ? 'warning' : 'good'}
          icon={Users}
          color="purple"
          loading={esgLoading}
          invertedTrend={true}
        />

        {/* Data Breaches */}
        <ESGKpiCard
          title="Data Breaches"
          value={esgMetrics?.data_breaches || 0}
          unit="breaches"
          status={esgMetrics?.data_breaches > 0 ? 'critical' : 'good'}
          icon={Shield}
          color="indigo"
          loading={esgLoading}
          invertedTrend={true}
        />

        {/* Training Hours */}
        <ESGKpiCard
          title="Training Hours"
          value={esgMetrics?.training_hours || 0}
          unit="hours"
          yoyChange={esgMetrics?.training_yoy_change}
          status={getStatus(esgMetrics?.training_hours || 0, targets.find(t => t.metric === 'training')?.target_value)}
          icon={GraduationCap}
          color="cyan"
          loading={esgLoading}
        />

        {/* Renewable Energy % */}
        <ESGKpiCard
          title="Renewable Energy"
          value={esgMetrics?.renewable_pct || 0}
          unit="%"
          targetValue={30}
          targetLabel="Target"
          status={getStatus(esgMetrics?.renewable_pct || 0, 30)}
          icon={Zap}
          color="teal"
          loading={esgLoading}
        />

        {/* Waste Recovery % */}
        <ESGKpiCard
          title="Waste Recovery"
          value={esgMetrics?.waste_recovery_pct || 0}
          unit="%"
          status={getStatus(esgMetrics?.waste_recovery_pct || 0, 50)}
          icon={Recycle}
          color="emerald"
          loading={esgLoading}
        />

        {/* Water Recycling % */}
        <ESGKpiCard
          title="Water Recycling"
          value={esgMetrics?.water_recycling_pct || 0}
          unit="%"
          status={getStatus(esgMetrics?.water_recycling_pct || 0, 40)}
          icon={Droplets}
          color="blue"
          loading={esgLoading}
        />

        {/* ESG Score / Audit Readiness */}
        <ESGKpiCard
          title="Audit Readiness"
          value={esgMetrics?.audit_readiness_score || 0}
          unit="%"
          status={esgMetrics?.audit_readiness_score >= 80 ? 'good' : esgMetrics?.audit_readiness_score >= 60 ? 'warning' : 'critical'}
          icon={FileText}
          color="indigo"
          loading={esgLoading}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Emissions Trend */}
        <SectionCard
          title="Emissions Trend"
          subtitle="Monthly emissions over selected period"
          accent="#10B981"
          testId="emissions-trend-section"
        >
          <div className="h-64">
            <ScopeTrendChart data={filteredData?.trend || []} hasScope3={data.hasScope3Access} />
          </div>
        </SectionCard>

        {/* Facility Comparison */}
        <SectionCard
          title="Facility Comparison"
          subtitle="Emissions by facility"
          accent="#3B82F6"
          testId="facility-comparison-section"
        >
          <div className="h-64">
            <FacilityChart facilities={filteredData?.facilities || []} />
          </div>
        </SectionCard>
      </div>

      {/* Base Year Comparison */}
      {baseYearComparison && (
        <SectionCard
          title="Base Year Comparison"
          subtitle="Progress against baseline"
          accent="#8B5CF6"
          testId="base-year-section"
        >
          <div className="h-64">
            <BaseYearComparisonChart 
              data={baseYearComparison} 
              currentTotals={totals} 
              hasScope3={data.hasScope3Access} 
            />
          </div>
        </SectionCard>
      )}

      {/* ESG Pillar Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SectionCard
          title="Environment"
          subtitle={`${esgMetrics?.environment_records || 0} records`}
          accent="#10B981"
          testId="env-summary-section"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">GHG Emissions</span>
              <span className="font-medium text-stone-900">{netEmissions.toLocaleString()} tCO₂e</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Energy</span>
              <span className="font-medium text-stone-900">{(netEnergy || 0).toLocaleString()} MWh</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Water</span>
              <span className="font-medium text-stone-900">{(esgMetrics?.water_consumption || 0).toLocaleString()} KL</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Waste</span>
              <span className="font-medium text-stone-900">{(esgMetrics?.waste_generated || 0).toLocaleString()} MT</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Social"
          subtitle={`${esgMetrics?.social_records || 0} records`}
          accent="#3B82F6"
          testId="social-summary-section"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Safety Incidents</span>
              <span className={`font-medium ${esgMetrics?.safety_incidents > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {esgMetrics?.safety_incidents || 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Training Hours</span>
              <span className="font-medium text-stone-900">{(esgMetrics?.training_hours || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Complaints</span>
              <span className="font-medium text-stone-900">{esgMetrics?.complaints || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Employee Count</span>
              <span className="font-medium text-stone-900">{(esgMetrics?.employee_count || 0).toLocaleString()}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Governance"
          subtitle={`${esgMetrics?.governance_records || 0} records`}
          accent="#8B5CF6"
          testId="governance-summary-section"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Data Breaches</span>
              <span className={`font-medium ${esgMetrics?.data_breaches > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {esgMetrics?.data_breaches || 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Policy Compliance</span>
              <span className="font-medium text-stone-900">{esgMetrics?.policy_compliance_pct || 0}%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Board Diversity</span>
              <span className="font-medium text-stone-900">{esgMetrics?.board_diversity_pct || 0}%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Audit Readiness</span>
              <span className="font-medium text-stone-900">{esgMetrics?.audit_readiness_score || 0}%</span>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
