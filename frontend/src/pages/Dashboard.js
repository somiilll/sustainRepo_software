import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { MonthYearPicker } from '../components/ui/month-year-picker';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, LabelList } from 'recharts';
import { Building2, TrendingUp, Gauge, Filter, Flame, Factory, Calendar, ArrowUpDown, TreeDeciduous, Minus, Info, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Beautiful modern color palette for charts
const COLORS = [
  '#10B981', // Emerald green
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#84CC16', // Lime
];

const SCOPE_COLORS = {
  scope1: '#10B981',    // Emerald - Direct emissions
  scope2: '#3B82F6',    // Blue - Indirect emissions  
  biogenic: '#F59E0B',  // Amber - Biogenic
};

const CATEGORY_COLORS = {
  'Stationary Combustion': '#10B981',
  'Mobile Combustion': '#3B82F6',
  'Fugitive Emissions': '#8B5CF6',
  'Process Emissions': '#F59E0B',
  'Purchased Electricity': '#06B6D4',
  'Purchased Heat/Steam': '#EC4899',
  'Biofuels': '#84CC16',
  'Other': '#EF4444',
  'Unknown': '#6B7280'
};

// Custom label renderer for pie charts - shows all labels (data already filtered for > 0)
const renderCustomLabel = ({ cx, cy, midAngle, outerRadius, percent }) => {
  if (percent <= 0) return null;
  
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 20;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  
  return (
    <text 
      x={x} 
      y={y} 
      fill="#374151"
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]); // Multiple facilities
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showFacilityDropdown, setShowFacilityDropdown] = useState(false);
  const facilityDropdownRef = useRef(null);
  const { getAuthHeader } = useAuth();

  // Close facility dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (facilityDropdownRef.current && !facilityDropdownRef.current.contains(event.target)) {
        setShowFacilityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get current financial year (April to March)
  const getCurrentFinancialYear = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      from: new Date(`${year}-04-01`),
      to: new Date(`${year + 1}-03-01`)
    };
  };

  useEffect(() => {
    fetchFacilities();
    // Fetch emissions to determine latest reporting year
    fetchLatestReportingPeriod();
  }, []);

  const fetchLatestReportingPeriod = async () => {
    try {
      const response = await axios.get(`${API}/emissions`, {
        headers: getAuthHeader()
      });
      const emissions = response.data || [];
      
      if (emissions.length > 0) {
        // Find the latest reporting period
        const periods = emissions.map(e => e.reporting_period).filter(Boolean).sort();
        const latestPeriod = periods[periods.length - 1];
        
        if (latestPeriod) {
          // Extract year from latest period (format: YYYY-MM)
          const latestYear = parseInt(latestPeriod.split('-')[0]);
          const latestMonth = parseInt(latestPeriod.split('-')[1]);
          
          // Determine financial year based on latest data
          const fyYear = latestMonth >= 4 ? latestYear : latestYear - 1;
          setDateRange({
            from: new Date(`${fyYear}-04-01`),
            to: new Date(`${fyYear + 1}-03-01`)
          });
        } else {
          // Fallback to current FY
          setDateRange(getCurrentFinancialYear());
        }
      } else {
        // No emissions, use current FY
        setDateRange(getCurrentFinancialYear());
      }
    } catch (error) {
      console.error('Error fetching latest period:', error);
      // Fallback to current FY
      setDateRange(getCurrentFinancialYear());
    }
  };

  // Re-fetch stats when filters change
  useEffect(() => {
    if (dateRange.from && dateRange.to) {
      fetchStats();
    }
  }, [selectedFacilities, dateRange]);

  const fetchStats = async () => {
    try {
      // Build query params for filtering
      const params = new URLSearchParams();
      
      // Handle multiple facilities
      if (selectedFacilities.length > 0) {
        selectedFacilities.forEach(fid => params.append('facility_id', fid));
      }
      
      if (dateRange.from) {
        const startPeriod = format(dateRange.from, 'yyyy-MM');
        params.append('start_period', startPeriod);
      }
      if (dateRange.to) {
        const endPeriod = format(dateRange.to, 'yyyy-MM');
        params.append('end_period', endPeriod);
      }
      
      const queryString = params.toString();
      const url = queryString ? `${API}/dashboard/stats?${queryString}` : `${API}/dashboard/stats`;
      
      const response = await axios.get(url, {
        headers: getAuthHeader()
      });
      setStats(response.data);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      setStats({
        total_facilities: 0,
        total_emissions: 0,
        scope1_emissions: 0,
        scope2_emissions: 0,
        biogenic_emissions: 0,
        recent_records: [],
        emissions_by_facility: [],
        emissions_trend: [],
        emissions_by_category: [],
        emissions_by_fuel: [],
        yearly_fuel_analysis: [],
        yearly_facility_analysis: [],
        monthly_comparison: [],
        sinks_total: 0,
        sinks_by_facility: []
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFacilities = async () => {
    try {
      const response = await axios.get(`${API}/facilities`, {
        headers: getAuthHeader()
      });
      setFacilities(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  // Filter and calculate data based on selections
  // Note: Most filtering is now done server-side, this handles display calculations
  const filteredData = useMemo(() => {
    if (!stats) return { trend: [], facilities: [], totals: { scope1: 0, scope2: 0, biogenic: 0, total: 0 }, filteredSinks: 0 };

    // Use the data as-is since backend already filtered
    const filteredTrend = stats.emissions_trend || [];
    const filteredFacilities = stats.emissions_by_facility || [];

    // Calculate totals from facilities
    const totals = {
      scope1: filteredFacilities.reduce((sum, f) => sum + (f.scope1_emissions || 0), 0),
      scope2: filteredFacilities.reduce((sum, f) => sum + (f.scope2_emissions || 0), 0),
      biogenic: filteredFacilities.reduce((sum, f) => sum + (f.biogenic_emissions || 0), 0),
      total: 0
    };

    totals.total = totals.scope1 + totals.scope2 + totals.biogenic;
    
    // Sinks are already filtered by backend when facility is selected
    const filteredSinks = stats.sinks_total || 0;

    return { trend: filteredTrend, facilities: filteredFacilities, totals, filteredSinks };
  }, [stats]);

  // Prepare scope data for pie chart
  const scopeData = useMemo(() => {
    // Define in explicit order: Scope 1, Scope 2, Biogenic
    return [
      { name: 'Scope 1', value: filteredData.totals.scope1, color: SCOPE_COLORS.scope1, order: 1 },
      { name: 'Scope 2', value: filteredData.totals.scope2, color: SCOPE_COLORS.scope2, order: 2 },
      { name: 'Biogenic', value: filteredData.totals.biogenic, color: SCOPE_COLORS.biogenic, order: 3 }
    ];
  }, [filteredData.totals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) return null;

  const facilityCount = selectedFacilities.length === 0 ? stats.total_facilities : selectedFacilities.length;

  return (
    <div className="space-y-6" data-testid="dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Dashboard</h1>
          <p className="text-text-secondary">Overview of your GHG emissions data</p>
        </div>
        <Button
          onClick={() => setShowFilters(!showFilters)}
          variant="outline"
          className="rounded-full"
          data-testid="toggle-filters-btn"
        >
          <Filter className="w-4 h-4 mr-2" />
          {showFilters ? 'Hide' : 'Show'} Filters
        </Button>
      </div>

      {showFilters && (
        <Card className="p-4 border border-stone-200 rounded-xl bg-white" data-testid="filter-panel">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Month/Year Range Picker */}
            <div className="space-y-2">
              <Label>Filter by Month Range</Label>
              <div className="flex gap-2 items-center">
                <MonthYearPicker
                  value={dateRange.from ? format(dateRange.from, 'yyyy-MM') : ''}
                  onChange={(val) => {
                    const newFrom = val ? new Date(val + '-01') : null;
                    setDateRange(prev => ({ 
                      ...prev, 
                      from: newFrom,
                      // Clear 'to' if it's before new 'from'
                      to: prev.to && newFrom && prev.to < newFrom ? null : prev.to
                    }));
                  }}
                  maxDate={dateRange.to ? format(dateRange.to, 'yyyy-MM') : undefined}
                  disableFuture={true}
                  placeholder="From"
                  className="flex-1 bg-stone-50"
                />
                <span className="text-stone-400">to</span>
                <MonthYearPicker
                  value={dateRange.to ? format(dateRange.to, 'yyyy-MM') : ''}
                  onChange={(val) => setDateRange(prev => ({ 
                    ...prev, 
                    to: val ? new Date(val + '-01') : null 
                  }))}
                  minDate={dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined}
                  disableFuture={true}
                  placeholder="To"
                  className="flex-1 bg-stone-50"
                />
              </div>
              {/* Quick year selection buttons */}
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => {
                    const currentYear = new Date().getFullYear();
                    const currentMonth = new Date().getMonth() + 1;
                    // If before April, FY started previous year
                    const fyStartYear = currentMonth < 4 ? currentYear - 1 : currentYear;
                    setDateRange({
                      from: new Date(`${fyStartYear}-04-01`),
                      to: new Date(`${fyStartYear + 1}-03-01`)
                    });
                  }}
                  className="px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
                >
                  Current FY
                </button>
                <button
                  onClick={() => {
                    const currentYear = new Date().getFullYear();
                    const currentMonth = new Date().getMonth() + 1;
                    const fyStartYear = currentMonth < 4 ? currentYear - 2 : currentYear - 1;
                    setDateRange({
                      from: new Date(`${fyStartYear}-04-01`),
                      to: new Date(`${fyStartYear + 1}-03-01`)
                    });
                  }}
                  className="px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 rounded transition-colors"
                >
                  Previous FY
                </button>
              </div>
            </div>

            {/* Facility Filter - Multiple Selection */}
            <div className="space-y-2 relative" ref={facilityDropdownRef}>
              <Label>Filter by Facility</Label>
              <div 
                className="w-full min-h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 cursor-pointer flex flex-wrap gap-1 items-center"
                onClick={() => setShowFacilityDropdown(!showFacilityDropdown)}
                data-testid="facility-filter"
              >
                {selectedFacilities.length === 0 ? (
                  <span className="text-stone-500">All Facilities</span>
                ) : (
                  selectedFacilities.map(fid => {
                    const facility = facilities.find(f => f.id === fid);
                    return (
                      <span key={fid} className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm flex items-center gap-1">
                        {facility?.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFacilities(prev => prev.filter(id => id !== fid));
                          }}
                          className="hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })
                )}
              </div>
              {showFacilityDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div
                    className="px-3 py-2 hover:bg-stone-50 cursor-pointer flex items-center gap-2"
                    onClick={() => {
                      setSelectedFacilities([]);
                      setShowFacilityDropdown(false);
                    }}
                  >
                    {selectedFacilities.length === 0 && <Check className="w-4 h-4 text-primary" />}
                    <span>All Facilities</span>
                  </div>
                  {facilities.map(f => (
                    <div
                      key={f.id}
                      className="px-3 py-2 hover:bg-stone-50 cursor-pointer flex items-center gap-2"
                      onClick={() => {
                        setSelectedFacilities(prev => 
                          prev.includes(f.id) 
                            ? prev.filter(id => id !== f.id)
                            : [...prev, f.id]
                        );
                      }}
                    >
                      {selectedFacilities.includes(f.id) && <Check className="w-4 h-4 text-primary" />}
                      <span className={selectedFacilities.includes(f.id) ? 'font-medium' : ''}>{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <Button
                onClick={() => {
                  setSelectedFacilities([]);
                  setDateRange(getCurrentFinancialYear());
                  setShowFacilityDropdown(false);
                }}
                variant="outline"
                className="w-full"
                data-testid="clear-filters-btn"
              >
                Reset to Default
              </Button>
            </div>
          </div>
          {(selectedFacilities.length > 0 || dateRange.from || dateRange.to) && (
            <div className="mt-3 p-2 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Filters applied: 
                {dateRange.from && ` From: ${format(dateRange.from, 'MMM yyyy')}`}
                {dateRange.to && ` To: ${format(dateRange.to, 'MMM yyyy')}`}
                {selectedFacilities.length > 0 && ` Facilities: ${selectedFacilities.map(fid => facilities.find(f => f.id === fid)?.name).join(', ')}`}
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid="total-facilities-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Facilities</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{facilityCount}</p>
            </div>
            <div className="bg-primary/10 p-3 rounded-lg">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid="total-emissions-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Emissions</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{filteredData.totals.total.toFixed(2)}</p>
              <p className="text-xs text-text-muted mt-1">tCO₂e</p>
            </div>
            <div className="bg-secondary/10 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-secondary" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid="scope-breakdown-card">
          <div className="flex items-start justify-between">
            <div className="w-full">
              <p className="text-text-muted text-sm font-medium mb-3">Emission By Scope</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Scope 1</span>
                  <span className="text-sm font-medium text-primary">{filteredData.totals.scope1.toFixed(2)} t</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Scope 2</span>
                  <span className="text-sm font-medium text-secondary">{filteredData.totals.scope2.toFixed(2)} t</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Biogenic</span>
                  <span className="text-sm font-medium text-accent">{filteredData.totals.biogenic.toFixed(2)} t</span>
                </div>
              </div>
            </div>
            <div className="bg-accent/10 p-3 rounded-lg">
              <Gauge className="w-6 h-6 text-accent" />
            </div>
          </div>
        </Card>
      </div>

      {/* Sinks and Net Emissions Row */}
      {(filteredData.filteredSinks > 0 || (selectedFacilities.length === 0 && stats?.sinks_total > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 border-2 border-green-200 rounded-xl bg-gradient-to-br from-green-50 to-white hover:shadow-lg transition-shadow" data-testid="sinks-total-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-green-700 text-sm font-medium mb-1">Carbon Sinks</p>
                <p className="text-3xl font-heading font-bold text-green-600">-{(filteredData.filteredSinks || 0).toFixed(2)}</p>
                <p className="text-xs text-green-600 mt-1">tCO₂e reduced/captured</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <TreeDeciduous className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-2 border-blue-200 rounded-xl bg-gradient-to-br from-blue-50 to-white hover:shadow-lg transition-shadow" data-testid="net-emissions-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-blue-700 text-sm font-medium mb-1">Net Emissions</p>
                <p className="text-3xl font-heading font-bold text-blue-600">
                  {(filteredData.totals.total - (filteredData.filteredSinks || 0)).toFixed(2)}
                </p>
                <p className="text-xs text-blue-600 mt-1">tCO₂e (Total - Sinks)</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Minus className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid="sinks-breakdown-card">
            <div className="flex items-start justify-between">
              <div className="w-full">
                <p className="text-text-muted text-sm font-medium mb-3">Top Sinks By Facility</p>
                <div className="space-y-2 max-h-24 overflow-y-auto">
                  {(selectedFacilities.length === 0 
                    ? stats?.sinks_by_facility 
                    : stats?.sinks_by_facility?.filter(s => selectedFacilities.includes(s.facility_id))
                  )?.sort((a, b) => b.total_reduced - a.total_reduced)?.slice(0, 4).map((sink, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-text-secondary truncate mr-2">{sink.facility_name}</span>
                      <span className="text-sm font-medium text-green-600">-{sink.total_reduced.toFixed(2)} t</span>
                    </div>
                  ))}
                  {(!stats?.sinks_by_facility?.length || 
                    (selectedFacilities.length > 0 && !stats?.sinks_by_facility?.some(s => selectedFacilities.includes(s.facility_id)))) && (
                    <p className="text-sm text-text-muted">No sink records</p>
                  )}
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <TreeDeciduous className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="scope-chart">
          <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Emissions by Scope</h3>
          {scopeData.filter(d => d.value > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={scopeData.filter(d => d.value > 0).sort((a, b) => a.order - b.order)}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  innerRadius={55}
                  fill="#8884d8"
                  dataKey="value"
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {scopeData.filter(d => d.value > 0).sort((a, b) => a.order - b.order).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} strokeWidth={2} />
                  ))}
                  <LabelList dataKey="value" position="outside" fontSize={12} fontWeight={600} fill="#374151" formatter={(val) => {
                    const total = scopeData.reduce((s, d) => s + d.value, 0);
                    return total > 0 ? `${((val / total) * 100).toFixed(1)}%` : '';
                  }} />
                </Pie>
                <RechartsTooltip 
                  formatter={(value) => `${value.toFixed(2)} tCO₂e`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  content={() => {
                    const total = scopeData.reduce((s, d) => s + d.value, 0);
                    const orderedItems = [
                      { name: 'Scope 1', color: SCOPE_COLORS.scope1, value: scopeData.find(d => d.name === 'Scope 1')?.value || 0 },
                      { name: 'Scope 2', color: SCOPE_COLORS.scope2, value: scopeData.find(d => d.name === 'Scope 2')?.value || 0 },
                      { name: 'Biogenic', color: SCOPE_COLORS.biogenic, value: scopeData.find(d => d.name === 'Biogenic')?.value || 0 }
                    ].filter(item => item.value > 0);
                    
                    return (
                      <div className="flex justify-center gap-4 mt-2">
                        {orderedItems.map((item) => (
                          <div key={item.name} className="flex items-center gap-1">
                            <div className="w-3 h-3" style={{ backgroundColor: item.color }}></div>
                            <span className="text-sm text-gray-600">
                              {item.name} ({total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-text-muted">
              No emission data available
            </div>
          )}
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="emissions-trend-chart">
          <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Emissions Trend</h3>
          {filteredData.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredData.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="period" stroke="#71717A" />
                <YAxis stroke="#71717A" domain={[0, 'auto']} allowDataOverflow={false} />
                <RechartsTooltip 
                  formatter={(value, name) => [`${value.toFixed(2)} tCO₂e`, name]}
                  itemSorter={(item) => {
                    const order = { 'Scope 1': 1, 'Scope 2': 2, 'Biogenic': 3 };
                    return order[item.name] || 4;
                  }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend 
                  content={({ payload }) => (
                    <div className="flex justify-center gap-4 mt-2">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-0.5" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></div>
                        <span className="text-sm text-gray-600">Scope 1</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-0.5" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></div>
                        <span className="text-sm text-gray-600">Scope 2</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-0.5" style={{ backgroundColor: SCOPE_COLORS.biogenic }}></div>
                        <span className="text-sm text-gray-600">Biogenic</span>
                      </div>
                    </div>
                  )}
                />
                <Line type="monotone" dataKey="scope1" stroke={SCOPE_COLORS.scope1} strokeWidth={3} name="Scope 1" dot={{ fill: SCOPE_COLORS.scope1, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="scope2" stroke={SCOPE_COLORS.scope2} strokeWidth={3} name="Scope 2" dot={{ fill: SCOPE_COLORS.scope2, strokeWidth: 2 }} />
                <Line type="monotone" dataKey="biogenic" stroke={SCOPE_COLORS.biogenic} strokeWidth={3} name="Biogenic" dot={{ fill: SCOPE_COLORS.biogenic, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-text-muted">
              No trend data available
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="facility-emissions-chart">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Emissions by Facility</h3>
        {filteredData.facilities.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={filteredData.facilities} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="facility_name" 
                stroke="#71717A" 
                interval={0}
                angle={-25}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis stroke="#71717A" />
              <RechartsTooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const scope1 = payload.find(p => p.dataKey === 'scope1_emissions')?.value || 0;
                    const scope2 = payload.find(p => p.dataKey === 'scope2_emissions')?.value || 0;
                    const biogenic = payload.find(p => p.dataKey === 'biogenic_emissions')?.value || 0;
                    const total = scope1 + scope2 + biogenic;
                    return (
                      <div className="bg-white border border-stone-200 rounded-lg p-3 shadow-lg">
                        <p className="font-semibold text-stone-800 mb-2">{label}</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></div>
                            <span className="text-stone-600">Scope 1:</span>
                            <span className="font-medium">{scope1.toFixed(2)} tCO₂e</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></div>
                            <span className="text-stone-600">Scope 2:</span>
                            <span className="font-medium">{scope2.toFixed(2)} tCO₂e</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.biogenic }}></div>
                            <span className="text-stone-600">Biogenic:</span>
                            <span className="font-medium">{biogenic.toFixed(2)} tCO₂e</span>
                          </div>
                          <div className="border-t border-stone-200 pt-1 mt-1 flex items-center gap-2">
                            <div className="w-3 h-3"></div>
                            <span className="text-stone-800 font-semibold">Total:</span>
                            <span className="font-bold text-stone-900">{total.toFixed(2)} tCO₂e</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                content={({ payload }) => (
                  <div className="flex justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></div>
                      <span className="text-sm text-gray-600">Scope 1</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></div>
                      <span className="text-sm text-gray-600">Scope 2</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.biogenic }}></div>
                      <span className="text-sm text-gray-600">Biogenic</span>
                    </div>
                  </div>
                )}
              />
              <Bar dataKey="scope1_emissions" fill={SCOPE_COLORS.scope1} name="Scope 1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="scope2_emissions" fill={SCOPE_COLORS.scope2} name="Scope 2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="biogenic_emissions" fill={SCOPE_COLORS.biogenic} name="Biogenic" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-text-muted">
            No facility data available
          </div>
        )}
      </Card>

      {/* Category Analysis - Stationary vs Mobile vs Fugitive vs Process */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="category-analysis-chart">
          <div className="flex items-center gap-2 mb-4">
            <Factory className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-heading font-bold text-text-primary">Emissions by Category</h3>
          </div>
          <p className="text-sm text-text-muted mb-4">Stationary Combustion vs Mobile Combustion vs Fugitive vs Process Emissions</p>
          {stats?.emissions_by_category?.length > 0 ? (
            (() => {
              const filteredCategories = stats.emissions_by_category.filter(c => c.total_emissions > 0);
              const catTotal = filteredCategories.reduce((s, d) => s + d.total_emissions, 0);
              return filteredCategories.length > 0 ? (
                <ResponsiveContainer width="100%" height={380}>
                  <PieChart>
                    <Pie
                      data={filteredCategories}
                      cx="50%"
                      cy="45%"
                      outerRadius={85}
                      innerRadius={50}
                      fill="#8884d8"
                      dataKey="total_emissions"
                      nameKey="category"
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {filteredCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || COLORS[index % COLORS.length]} stroke={CATEGORY_COLORS[entry.category] || COLORS[index % COLORS.length]} strokeWidth={2} />
                      ))}
                      <LabelList dataKey="total_emissions" position="outside" fontSize={12} fontWeight={600} fill="#374151" formatter={(val) => {
                        return catTotal > 0 ? `${((val / catTotal) * 100).toFixed(1)}%` : '';
                      }} />
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value) => `${value.toFixed(2)} tCO₂e`}
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[380px] flex items-center justify-center text-text-muted">
                  No category data available
                </div>
              );
            })()
          ) : (
            <div className="h-[380px] flex items-center justify-center text-text-muted">
              No category data available
            </div>
          )}
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="fuel-analysis-chart">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-heading font-bold text-text-primary">Emissions by Fuel Type</h3>
          </div>
          <p className="text-sm text-text-muted mb-4">Breakdown of emissions by fuel source</p>
          {stats?.emissions_by_fuel?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.emissions_by_fuel.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#71717A" />
                <YAxis 
                  dataKey="fuel_type" 
                  type="category" 
                  stroke="#71717A" 
                  width={140}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => value.length > 20 ? value.substring(0, 18) + '...' : value}
                />
                <RechartsTooltip 
                  formatter={(value, name, props) => [`${value.toFixed(2)} tCO₂e`, props.payload.fuel_type]}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="total_emissions" fill="#8B5CF6" name="Emissions" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-text-muted">
              No fuel data available
            </div>
          )}
        </Card>
      </div>

      {/* Year-wise Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="yearly-fuel-chart">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-secondary" />
            <h3 className="text-lg font-heading font-bold text-text-primary">Year-wise Emissions</h3>
          </div>
          <p className="text-sm text-text-muted mb-4">Total emissions per year</p>
          {stats?.yearly_fuel_analysis?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.yearly_fuel_analysis}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" stroke="#71717A" />
                <YAxis stroke="#71717A" />
                <RechartsTooltip 
                  formatter={(value) => `${Number(value).toFixed(2)} tCO₂e`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                <Bar dataKey="total_emissions" fill="#06B6D4" name="Total Emissions" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-text-muted">
              No yearly data available
            </div>
          )}
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="yearly-facility-chart">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-heading font-bold text-text-primary">Year-wise Emission By Scope</h3>
          </div>
          <p className="text-sm text-text-muted mb-4">Annual Scope 1, Scope 2, and Biogenic emissions</p>
          {stats?.yearly_facility_analysis?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.yearly_facility_analysis}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" stroke="#71717A" />
                <YAxis stroke="#71717A" />
                <RechartsTooltip 
                  formatter={(value) => `${Number(value).toFixed(2)} tCO₂e`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend 
                  content={({ payload }) => (
                    <div className="flex justify-center gap-4 mt-2">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.scope1 }}></div>
                        <span className="text-sm text-gray-600">Scope 1</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.scope2 }}></div>
                        <span className="text-sm text-gray-600">Scope 2</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCOPE_COLORS.biogenic }}></div>
                        <span className="text-sm text-gray-600">Biogenic</span>
                      </div>
                    </div>
                  )}
                />
                <Bar dataKey="scope1" fill={SCOPE_COLORS.scope1} name="Scope 1" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="scope2" fill={SCOPE_COLORS.scope2} name="Scope 2" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="biogenic" fill={SCOPE_COLORS.biogenic} name="Biogenic" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-text-muted">
              No yearly facility data available
            </div>
          )}
        </Card>
      </div>

      {/* Monthly Comparison */}
      <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="monthly-comparison-chart">
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpDown className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-heading font-bold text-text-primary">Month-over-Month Comparison</h3>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                <p className="font-medium mb-2">Change % Formula:</p>
                <p className="font-mono text-xs bg-stone-700 p-2 rounded">
                  [(Current Month - Previous Month) / Previous Month] × 100
                </p>
                <p className="mt-2 text-xs text-stone-300">
                  Note: The chart shows absolute values and not based on Equity Share.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-text-muted mb-4">
          Track emissions changes between consecutive months
          {stats?.monthly_comparison?.length > 24 && (
            <span className="ml-2 text-xs text-primary">(Showing last 24 months of {stats.monthly_comparison.length} total)</span>
          )}
        </p>
        {stats?.monthly_comparison?.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={stats.monthly_comparison.slice(-24)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="period" 
                stroke="#71717A" 
                interval={stats.monthly_comparison.slice(-24).length > 12 ? 1 : 0}
                angle={stats.monthly_comparison.slice(-24).length > 12 ? -45 : 0}
                textAnchor={stats.monthly_comparison.slice(-24).length > 12 ? "end" : "middle"}
                height={stats.monthly_comparison.slice(-24).length > 12 ? 60 : 30}
                tick={{ fontSize: 11 }}
              />
              <YAxis yAxisId="left" stroke="#71717A" domain={[0, 'auto']} allowDataOverflow={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#EF4444" unit="%" domain={['dataMin', 'auto']} />
              <RechartsTooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-stone-200 rounded-lg shadow-lg p-3">
                        <p className="font-medium text-stone-800 mb-2">{label}</p>
                        <p className="text-sm text-emerald-600">
                          Monthly Emissions: <span className="font-medium">{data?.total?.toFixed(2)} tCO₂e</span>
                        </p>
                        <p className="text-sm text-red-500">
                          Change: <span className="font-medium">{data?.change_percent?.toFixed(1)}%</span>
                        </p>
                        {data?.previous_total !== undefined && data?.previous_total > 0 && (
                          <p className="text-xs text-stone-500 mt-2 border-t pt-2">
                            Previous: {data.previous_total?.toFixed(2)} tCO₂e
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="total" fill="#10B981" name="Monthly Emissions" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="change_percent" stroke="#EF4444" strokeWidth={3} name="Change %" dot={{ fill: '#EF4444', strokeWidth: 2, r: 5 }} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[350px] flex items-center justify-center text-text-muted">
            No comparison data available
          </div>
        )}
      </Card>
    </div>
  );
}
