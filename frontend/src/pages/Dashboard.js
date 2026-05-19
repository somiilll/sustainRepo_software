import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { MonthYearPicker } from '../components/ui/month-year-picker';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Building2, TrendingUp, Gauge, Filter, Flame, Factory, TreeDeciduous, Minus, Check, Layers, Target, Zap, Sparkles, AlertTriangle, Leaf, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Premium color palette
const SCOPE_COLORS = {
  scope1: '#10B981',
  scope2: '#3B82F6',
  scope3: '#8B5CF6',
  biogenic: '#F59E0B',
};

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];

// Animated counter component
const AnimatedCounter = ({ value, decimals = 2, suffix = '', className = '' }) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(current);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className={className}>
      {displayValue.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
};

// Premium glass card wrapper
const GlassCard = ({ children, className = '', glowColor = null, delay = 0, ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    className={`
      relative overflow-hidden
      backdrop-blur-xl bg-white/60 
      border border-white/30
      shadow-[0_8px_32px_rgba(0,0,0,0.08)]
      hover:shadow-[0_16px_48px_rgba(0,0,0,0.12)]
      hover:bg-white/70
      rounded-3xl
      transition-all duration-300
      ${className}
    `}
    style={glowColor ? {
      boxShadow: `0 8px 32px rgba(0,0,0,0.08), 0 0 60px ${glowColor}15, inset 0 1px 0 rgba(255,255,255,0.5)`
    } : {}}
    {...props}
  >
    {glowColor && (
      <div 
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20"
        style={{ background: glowColor }}
      />
    )}
    <div className="relative z-10">{children}</div>
  </motion.div>
);

// AI Insight chip
const AIInsightChip = ({ icon: Icon, text, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.4, delay }}
    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/40 backdrop-blur-sm border border-white/30 hover:bg-white/60 transition-all cursor-default"
  >
    <div className={`w-6 h-6 rounded-full flex items-center justify-center`} style={{ background: `${color}20` }}>
      <Icon className="w-3.5 h-3.5" style={{ color }} />
    </div>
    <span className="text-xs font-medium text-slate-700">{text}</span>
  </motion.div>
);

// Premium tooltip for charts
const PremiumTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="backdrop-blur-xl bg-slate-900/90 border border-white/10 rounded-2xl p-4 shadow-2xl">
      <p className="text-white/60 text-xs mb-2">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-white text-sm font-semibold">{entry.name}: {Number(entry.value).toFixed(2)} tCO₂e</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showFacilityDropdown, setShowFacilityDropdown] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [baseYearData, setBaseYearData] = useState({ direct: null, indirect: null });
  const facilityDropdownRef = useRef(null);
  const { getAuthHeader } = useAuth();

  const hasScope3Access = organization?.enabled_access?.includes('scope1_2_3') || false;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (facilityDropdownRef.current && !facilityDropdownRef.current.contains(event.target)) {
        setShowFacilityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCurrentFinancialYear = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return { from: new Date(`${year}-04-01`), to: new Date(`${year + 1}-03-01`) };
  };

  const getPreviousFinancialYear = () => {
    const now = new Date();
    const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const prevFYStart = currentFYStart - 1;
    return { from: new Date(`${prevFYStart}-04-01`), to: new Date(`${prevFYStart + 1}-03-01`) };
  };

  useEffect(() => {
    fetchFacilities();
    fetchOrganization();
    fetchBaseYearData();
    fetchLatestReportingPeriod();
  }, []);

  const fetchOrganization = async () => {
    try {
      const response = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
      setOrganization(response.data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    }
  };

  const fetchBaseYearData = async () => {
    try {
      const response = await axios.get(`${API}/base-year-emissions`, { headers: getAuthHeader() });
      const records = response.data || [];
      let directRecord = null, indirectRecord = null;
      for (const record of records) {
        const scopeGroup = record.scope_group || 'scope12';
        const isOrgLevel = !record.facility_id;
        if (scopeGroup === 'scope12' && !directRecord && isOrgLevel) directRecord = record;
        if (scopeGroup === 'scope3' && !indirectRecord && isOrgLevel) indirectRecord = record;
      }
      if (!directRecord || !indirectRecord) {
        for (const record of records) {
          const scopeGroup = record.scope_group || 'scope12';
          if (scopeGroup === 'scope12' && !directRecord) directRecord = record;
          if (scopeGroup === 'scope3' && !indirectRecord) indirectRecord = record;
        }
      }
      setBaseYearData({ direct: directRecord, indirect: indirectRecord });
    } catch (error) {
      console.error('Failed to fetch base year data:', error);
    }
  };

  const fetchLatestReportingPeriod = async () => {
    try {
      const response = await axios.get(`${API}/emissions`, { headers: getAuthHeader() });
      const emissions = response.data || [];
      if (emissions.length > 0) {
        const monthlyPeriods = emissions.map(e => e.reporting_period).filter(p => p && /^\d{4}-\d{2}$/.test(p)).sort();
        const latestPeriod = monthlyPeriods[monthlyPeriods.length - 1];
        if (latestPeriod) {
          const latestYear = parseInt(latestPeriod.split('-')[0]);
          const latestMonth = parseInt(latestPeriod.split('-')[1]);
          const dataFYYear = latestMonth >= 4 ? latestYear : latestYear - 1;
          const currentFYStart = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
          const fyYear = dataFYYear >= currentFYStart ? currentFYStart - 1 : dataFYYear;
          setDateRange({ from: new Date(`${fyYear}-04-01`), to: new Date(`${fyYear + 1}-03-01`) });
        } else {
          setDateRange(getPreviousFinancialYear());
        }
      } else {
        setDateRange(getPreviousFinancialYear());
      }
    } catch (error) {
      setDateRange(getPreviousFinancialYear());
    }
  };

  useEffect(() => {
    if (dateRange.from && dateRange.to) fetchStats();
  }, [selectedFacilities, dateRange]);

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFacilities.length > 0) selectedFacilities.forEach(fid => params.append('facility_id', fid));
      if (dateRange.from) params.append('start_period', format(dateRange.from, 'yyyy-MM'));
      if (dateRange.to) params.append('end_period', format(dateRange.to, 'yyyy-MM'));
      const queryString = params.toString();
      const url = queryString ? `${API}/dashboard/stats?${queryString}` : `${API}/dashboard/stats`;
      const response = await axios.get(url, { headers: getAuthHeader() });
      setStats(response.data);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      setStats({ total_facilities: 0, total_emissions: 0, scope1_emissions: 0, scope2_emissions: 0, biogenic_emissions: 0 });
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, { headers: getAuthHeader() });
      setFacilities(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const filteredData = useMemo(() => {
    if (!stats) return { trend: [], facilities: [], totals: { scope1: 0, scope2: 0, scope3: 0, biogenic: 0, total: 0 }, filteredSinks: 0 };
    const filteredTrend = stats.emissions_trend || [];
    const filteredFacilities = stats.emissions_by_facility || [];
    const totals = {
      scope1: stats.scope1_emissions || 0,
      scope2: stats.scope2_emissions || 0,
      scope3: stats.scope3_emissions || 0,
      biogenic: stats.biogenic_emissions || 0,
      biogenicDirect: stats.biogenic_direct || 0,
      biogenicIndirect: stats.biogenic_indirect || 0,
      total: 0
    };
    totals.total = totals.scope1 + totals.scope2 + totals.biogenic + (hasScope3Access ? totals.scope3 : 0);
    const filteredSinks = stats.sinks_total || 0;
    return { trend: filteredTrend, facilities: filteredFacilities, totals, filteredSinks };
  }, [stats, hasScope3Access]);

  const scopeData = useMemo(() => {
    const data = [
      { name: 'Scope 1', value: filteredData.totals.scope1, color: SCOPE_COLORS.scope1 },
      { name: 'Scope 2', value: filteredData.totals.scope2, color: SCOPE_COLORS.scope2 },
    ];
    if (hasScope3Access) data.push({ name: 'Scope 3', value: filteredData.totals.scope3, color: SCOPE_COLORS.scope3 });
    data.push({ name: 'Biogenic', value: filteredData.totals.biogenic, color: SCOPE_COLORS.biogenic });
    return data.filter(d => d.value > 0);
  }, [filteredData.totals, hasScope3Access]);

  // AI Insights generation
  const aiInsights = useMemo(() => {
    const insights = [];
    if (filteredData.totals.scope2 > filteredData.totals.scope1) {
      insights.push({ icon: Zap, text: 'Scope 2 (indirect) exceeds Scope 1 emissions', color: '#3B82F6' });
    }
    if (filteredData.filteredSinks > 0) {
      const offsetPercent = ((filteredData.filteredSinks / filteredData.totals.total) * 100).toFixed(1);
      insights.push({ icon: Leaf, text: `Carbon sinks offset ${offsetPercent}% of total emissions`, color: '#10B981' });
    }
    if (hasScope3Access && stats?.scope3_by_category?.length > 0) {
      const topCategory = stats.scope3_by_category[0];
      if (topCategory?.percentage >= 50) {
        insights.push({ icon: AlertTriangle, text: `${topCategory.category} dominates Scope 3 at ${topCategory.percentage}%`, color: '#F59E0B' });
      }
    }
    if (insights.length === 0) {
      insights.push({ icon: Activity, text: 'Monitoring emissions across all scopes', color: '#8B5CF6' });
    }
    return insights;
  }, [filteredData, stats, hasScope3Access]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full"
        />
      </div>
    );
  }

  if (!stats) return null;

  const facilityCount = selectedFacilities.length === 0 ? stats.total_facilities : selectedFacilities.length;

  return (
    <div className="relative min-h-screen" data-testid="dashboard">
      {/* Ambient background gradients */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-br from-emerald-400/20 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-blue-400/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-tl from-violet-400/15 to-transparent rounded-full blur-3xl" />
        {/* Subtle grain texture */}
        <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />
      </div>

      <div className="relative z-10 space-y-6 pb-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent tracking-tight">
              Dashboard
            </h1>
            <p className="text-slate-500 mt-1">Climate Intelligence Overview</p>
          </div>
          <Button
            onClick={() => setShowFilters(!showFilters)}
            className="rounded-full bg-white/60 backdrop-blur-sm border border-white/30 text-slate-700 hover:bg-white/80 shadow-lg"
            data-testid="toggle-filters-btn"
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
        </motion.div>

        {/* AI Insights Strip */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-slate-900/5 via-white/40 to-slate-900/5 backdrop-blur-sm border border-white/30"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-200/50">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span className="text-xs font-semibold text-violet-700">AI Insights</span>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {aiInsights.map((insight, idx) => (
              <AIInsightChip key={idx} {...insight} delay={0.3 + idx * 0.1} />
            ))}
          </div>
        </motion.div>

        {/* Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard className="p-4" data-testid="filter-panel">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-600">Date Range</Label>
                    <div className="flex gap-2 items-center">
                      <MonthYearPicker
                        value={dateRange.from ? format(dateRange.from, 'yyyy-MM') : ''}
                        onChange={(val) => {
                          const newFrom = val ? new Date(val + '-01') : null;
                          setDateRange(prev => ({ ...prev, from: newFrom, to: prev.to && newFrom && prev.to < newFrom ? null : prev.to }));
                        }}
                        maxDate={dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined}
                        disableFuture={true}
                        placeholder="From"
                        className="flex-1 bg-white/50"
                      />
                      <span className="text-slate-400">→</span>
                      <MonthYearPicker
                        value={dateRange.to ? format(dateRange.to, 'yyyy-MM') : ''}
                        onChange={(val) => setDateRange(prev => ({ ...prev, to: val ? new Date(val + '-01') : null }))}
                        minDate={dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined}
                        disableFuture={true}
                        placeholder="To"
                        className="flex-1 bg-white/50"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDateRange(getCurrentFinancialYear())}
                        className="px-3 py-1 text-xs bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 rounded-full transition-colors font-medium"
                      >
                        Current FY
                      </button>
                      <button
                        onClick={() => setDateRange(getPreviousFinancialYear())}
                        className="px-3 py-1 text-xs bg-slate-500/10 text-slate-700 hover:bg-slate-500/20 rounded-full transition-colors font-medium"
                      >
                        Previous FY
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 relative" ref={facilityDropdownRef}>
                    <Label className="text-xs font-semibold text-slate-600">Facility</Label>
                    <div
                      className="w-full min-h-10 bg-white/50 border border-white/40 rounded-xl px-3 py-2 cursor-pointer flex flex-wrap gap-1 items-center hover:bg-white/70 transition-colors"
                      onClick={() => setShowFacilityDropdown(!showFacilityDropdown)}
                      data-testid="facility-filter"
                    >
                      {selectedFacilities.length === 0 ? (
                        <span className="text-slate-500 text-sm">All Facilities</span>
                      ) : (
                        selectedFacilities.map(fid => {
                          const facility = facilities.find(f => f.id === fid);
                          return (
                            <span key={fid} className="bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full text-xs flex items-center gap-1 font-medium">
                              {facility?.name}
                              <button onClick={(e) => { e.stopPropagation(); setSelectedFacilities(prev => prev.filter(id => id !== fid)); }} className="hover:text-red-500">×</button>
                            </span>
                          );
                        })
                      )}
                    </div>
                    {showFacilityDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute z-50 w-full mt-1 bg-white/95 backdrop-blur-xl border border-white/40 rounded-xl shadow-2xl max-h-48 overflow-y-auto"
                      >
                        <div className="px-3 py-2 hover:bg-emerald-50 cursor-pointer flex items-center gap-2 text-sm" onClick={() => { setSelectedFacilities([]); setShowFacilityDropdown(false); }}>
                          {selectedFacilities.length === 0 && <Check className="w-4 h-4 text-emerald-600" />}
                          <span>All Facilities</span>
                        </div>
                        {facilities.map(f => (
                          <div key={f.id} className="px-3 py-2 hover:bg-emerald-50 cursor-pointer flex items-center gap-2 text-sm" onClick={() => setSelectedFacilities(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id])}>
                            {selectedFacilities.includes(f.id) && <Check className="w-4 h-4 text-emerald-600" />}
                            <span className={selectedFacilities.includes(f.id) ? 'font-medium' : ''}>{f.name}</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </div>

                  <Button onClick={() => { setSelectedFacilities([]); setDateRange(getPreviousFinancialYear()); setShowFacilityDropdown(false); }} variant="outline" className="h-10 rounded-xl bg-white/50 hover:bg-white/70" data-testid="clear-filters-btn">
                    Reset Filters
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* KPI Cards Row 1 - Vertically stacked Facilities + Emissions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Facilities + Total Emissions - VERTICAL */}
          <GlassCard className="p-6" glowColor="#10B981" delay={0.1} data-testid="summary-card">
            <div className="space-y-6">
              {/* Facilities */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Facilities</p>
                  <p className="text-4xl font-bold text-slate-900 tracking-tight">
                    <AnimatedCounter value={facilityCount} decimals={0} />
                  </p>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

              {/* Total Emissions */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <TrendingUp className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Emissions</p>
                  <p className="text-3xl font-bold text-slate-900 tracking-tight">
                    <AnimatedCounter value={filteredData.totals.total} decimals={2} />
                    <span className="text-base font-normal text-slate-400 ml-1">tCO₂e</span>
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Scope Breakdown */}
          <GlassCard className="p-6 col-span-1 md:col-span-2" glowColor="#3B82F6" delay={0.2} data-testid="scope-breakdown-card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Emissions by Scope</h3>
                <p className="text-xs text-slate-500">GHG Protocol breakdown</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                <Gauge className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { name: 'Scope 1', value: filteredData.totals.scope1, color: '#10B981', gradient: 'from-emerald-500 to-teal-500' },
                { name: 'Scope 2', value: filteredData.totals.scope2, color: '#3B82F6', gradient: 'from-blue-500 to-indigo-500' },
                ...(hasScope3Access ? [{ name: 'Scope 3', value: filteredData.totals.scope3, color: '#8B5CF6', gradient: 'from-violet-500 to-purple-500' }] : []),
                { name: 'Biogenic', value: filteredData.totals.biogenic, color: '#F59E0B', gradient: 'from-amber-500 to-orange-500' },
              ].map((scope, idx) => (
                <motion.div
                  key={scope.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  className="p-4 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/30 hover:bg-white/60 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${scope.gradient}`} />
                    <span className="text-xs font-medium text-slate-600">{scope.name}</span>
                  </div>
                  <p className="text-xl font-bold tracking-tight" style={{ color: scope.color }}>
                    {scope.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </p>
                  <p className="text-[10px] text-slate-400">tCO₂e</p>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Scope 3 Analytics Row */}
        {hasScope3Access && stats?.scope3_by_category?.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard className="p-6" glowColor="#8B5CF6" delay={0.3} data-testid="scope3-categories-card">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                  <Layers className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Scope 3 Categories</p>
                  <p className="text-3xl font-bold text-violet-600 tracking-tight">
                    <AnimatedCounter value={stats?.scope3_categories_reported || 0} decimals={0} />
                    <span className="text-sm font-normal text-slate-400 ml-1">/ 15</span>
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6" glowColor="#10B981" delay={0.4} data-testid="sinks-total-card">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/25">
                  <TreeDeciduous className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Carbon Sinks</p>
                  <p className="text-3xl font-bold text-green-600 tracking-tight">
                    -<AnimatedCounter value={filteredData.filteredSinks || 0} decimals={2} />
                    <span className="text-sm font-normal text-slate-400 ml-1">tCO₂e</span>
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6" glowColor="#3B82F6" delay={0.5} data-testid="net-emissions-card">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <Minus className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Net Emissions</p>
                  <p className="text-3xl font-bold text-blue-600 tracking-tight">
                    <AnimatedCounter value={filteredData.totals.total - (filteredData.filteredSinks || 0)} decimals={2} />
                    <span className="text-sm font-normal text-slate-400 ml-1">tCO₂e</span>
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Charts Row */}
        {hasScope3Access && stats?.scope3_by_category?.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Emissions Trend Chart - PREMIUM */}
            <GlassCard className="p-6" delay={0.6} data-testid="scope-comparison-chart">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Emissions Trend</h3>
                  <p className="text-xs text-slate-500">Monthly comparison by scope</p>
                </div>
                <div className="flex gap-3">
                  {[{ name: 'Scope 1', color: '#10B981' }, { name: 'Scope 2', color: '#3B82F6' }, { name: 'Scope 3', color: '#8B5CF6' }].map(s => (
                    <div key={s.name} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}60` }} />
                      <span className="text-[10px] text-slate-500">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              {filteredData.trend.length > 0 ? (
                <div className="h-[300px] relative">
                  {/* Chart background gradient */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-slate-900/[0.02] to-slate-900/[0.05]" />
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={filteredData.trend} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                      <defs>
                        <linearGradient id="gradientScope1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradientScope2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradientScope3" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                        </linearGradient>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                      <XAxis
                        dataKey="period"
                        stroke="#94a3b8"
                        tick={{ fontSize: 9, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        angle={-45}
                        textAnchor="end"
                        height={50}
                        tickFormatter={(value) => {
                          const [year, month] = value.split('-');
                          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                          return `${months[parseInt(month) - 1]}'${year.slice(-2)}`;
                        }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fill: '#94a3b8' } }}
                      />
                      <RechartsTooltip content={<PremiumTooltip />} />
                      <Area type="monotone" dataKey="scope1" stroke="#10B981" strokeWidth={2.5} fill="url(#gradientScope1)" filter="url(#glow)" name="Scope 1" />
                      <Area type="monotone" dataKey="scope2" stroke="#3B82F6" strokeWidth={2.5} fill="url(#gradientScope2)" filter="url(#glow)" name="Scope 2" />
                      <Area type="monotone" dataKey="scope3" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#gradientScope3)" filter="url(#glow)" name="Scope 3" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400">No trend data available</div>
              )}
            </GlassCard>

            {/* Scope 3 Hotspots */}
            <GlassCard className="p-6" glowColor="#EF4444" delay={0.7} data-testid="scope3-category-chart">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Scope 3 Hotspots</h3>
                  <p className="text-xs text-slate-500">Top contributing categories</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-red-500" />
                </div>
              </div>
              {stats?.scope3_by_category?.length > 0 ? (
                <div className="space-y-3">
                  {stats.scope3_by_category.slice(0, 4).map((cat, index) => {
                    const maxEmission = stats.scope3_by_category[0]?.total_emissions || 1;
                    const ratio = cat.total_emissions / maxEmission;
                    const match = cat.category.match(/^(C\d+)/);
                    const categoryCode = match ? match[1] : `#${index + 1}`;
                    let barColor = ratio >= 0.7 ? '#EF4444' : ratio >= 0.4 ? '#F97316' : ratio >= 0.2 ? '#F59E0B' : '#10B981';
                    
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 + index * 0.1 }}
                        className="group"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${index === 0 ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                              #{index + 1}
                            </span>
                            <span className="text-xs font-medium text-slate-700">{categoryCode}</span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: barColor }}>{cat.percentage}%</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(cat.total_emissions / maxEmission) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.9 + index * 0.1 }}
                            className="h-full rounded-full"
                            style={{ background: `linear-gradient(90deg, ${barColor}, ${barColor}80)`, boxShadow: `0 0 12px ${barColor}40` }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-slate-400">No Scope 3 data</div>
              )}
            </GlassCard>
          </div>
        )}

        {/* Emissions by Scope Donut + Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut Chart */}
          <GlassCard className="p-6" delay={0.8} data-testid="scope-chart">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Scope Distribution</h3>
                <p className="text-xs text-slate-500">Total: {filteredData.totals.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} tCO₂e</p>
              </div>
            </div>
            {scopeData.length > 0 ? (
              <div className="flex items-center gap-8">
                <div className="relative">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <defs>
                        {scopeData.map((entry, idx) => (
                          <linearGradient key={idx} id={`gradient-${idx}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                            <stop offset="100%" stopColor={entry.color} stopOpacity={0.7} />
                          </linearGradient>
                        ))}
                        <filter id="donutGlow">
                          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                      </defs>
                      <Pie
                        data={scopeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                        filter="url(#donutGlow)"
                      >
                        {scopeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={`url(#gradient-${index})`} style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))' }} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">
                        {filteredData.totals.total >= 1000 ? `${(filteredData.totals.total / 1000).toFixed(0)}k` : filteredData.totals.total.toFixed(0)}
                      </p>
                      <p className="text-[10px] text-slate-400">tCO₂e</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {scopeData.map((scope, idx) => {
                    const percent = filteredData.totals.total > 0 ? ((scope.value / filteredData.totals.total) * 100).toFixed(1) : 0;
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.9 + idx * 0.1 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/40 hover:bg-white/60 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: scope.color, boxShadow: `0 0 8px ${scope.color}60` }} />
                          <span className="text-sm font-medium text-slate-700">{scope.name}</span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: scope.color }}>{percent}%</span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-400">No scope data</div>
            )}
          </GlassCard>

          {/* Emission Categories */}
          <GlassCard className="p-6" glowColor="#10B981" delay={0.9} data-testid="category-analysis-chart">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Emission Categories</h3>
                <p className="text-xs text-slate-500">Top 3 contributors</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center">
                <Factory className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            {(() => {
              const allCategories = stats?.emissions_by_category || [];
              const totalEmissions = allCategories.reduce((sum, c) => sum + (c.total_emissions || 0), 0);
              const sortedCategories = [...allCategories].filter(c => c.total_emissions > 0).map(c => ({ ...c, percentage: totalEmissions > 0 ? ((c.total_emissions / totalEmissions) * 100).toFixed(1) : 0 })).sort((a, b) => b.total_emissions - a.total_emissions);
              const topCategories = sortedCategories.slice(0, 3);
              const maxEmission = topCategories[0]?.total_emissions || 1;
              const categoryColors = { 'Stationary Combustion': '#059669', 'Mobile Combustion': '#2563EB', 'Fugitive Emissions': '#F59E0B', 'Purchased Electricity': '#8B5CF6', 'Others': '#9CA3AF' };

              return topCategories.length > 0 ? (
                <div className="space-y-4">
                  {topCategories.map((cat, index) => {
                    const widthPercent = (cat.total_emissions / maxEmission) * 100;
                    const barColor = categoryColors[cat.category] || COLORS[index % COLORS.length];
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1 + index * 0.1 }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>#{index + 1}</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[140px]">{cat.category}</span>
                          </div>
                          <span className="text-xs font-bold" style={{ color: barColor }}>{cat.percentage}%</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${widthPercent}%` }}
                            transition={{ duration: 0.8, delay: 1.1 + index * 0.1 }}
                            className="h-full rounded-full"
                            style={{ background: `linear-gradient(90deg, ${barColor}, ${barColor}80)`, boxShadow: `0 0 12px ${barColor}40` }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-[150px] flex items-center justify-center text-slate-400">No category data</div>
              );
            })()}
          </GlassCard>
        </div>

        {/* Base Year Comparison */}
        {baseYearData?.direct && (
          <GlassCard className="p-6" delay={1} data-testid="base-year-comparison-card">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Base Year Comparison</h3>
                  <p className="text-xs text-slate-500">Tracking progress against baseline</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-blue-50/50 border border-emerald-100/50">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Scope 1, 2 & Biogenic</h4>
                <div className="text-2xl font-bold text-emerald-600">
                  {(filteredData.totals.scope1 + filteredData.totals.scope2 + (filteredData.totals.biogenicDirect || 0)).toFixed(1)}
                  <span className="text-sm font-normal text-slate-400 ml-1">tCO₂e</span>
                </div>
              </div>
              {hasScope3Access && baseYearData?.indirect && (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-50/50 to-purple-50/50 border border-violet-100/50">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Scope 3 & Biogenic</h4>
                  <div className="text-2xl font-bold text-violet-600">
                    {(filteredData.totals.scope3 + (filteredData.totals.biogenicIndirect || 0)).toFixed(1)}
                    <span className="text-sm font-normal text-slate-400 ml-1">tCO₂e</span>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
