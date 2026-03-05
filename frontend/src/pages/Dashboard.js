import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Building2, TrendingUp, Gauge, Filter, Flame, Factory, Calendar, ArrowUpDown, TreeDeciduous, Minus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';

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

// Custom label renderer to prevent overlapping
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, value }) => {
  if (percent < 0.05) return null; // Don't show labels for < 5%
  
  const RADIAN = Math.PI / 180;
  const radius = outerRadius * 1.2;
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
    >
      {`${name}: ${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const { getAuthHeader } = useAuth();

  useEffect(() => {
    fetchStats();
    fetchFacilities();
  }, []);

  // Re-fetch stats when filters change
  useEffect(() => {
    fetchStats();
  }, [selectedFacility, dateRange]);

  const fetchStats = async () => {
    try {
      // Build query params for filtering
      const params = new URLSearchParams();
      if (selectedFacility && selectedFacility !== 'all') {
        params.append('facility_id', selectedFacility);
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
    return [
      { name: 'Scope 1', value: filteredData.totals.scope1, color: SCOPE_COLORS.scope1 },
      { name: 'Scope 2', value: filteredData.totals.scope2, color: SCOPE_COLORS.scope2 },
      { name: 'Biogenic', value: filteredData.totals.biogenic, color: SCOPE_COLORS.biogenic }
    ].filter(d => d.value > 0);
  }, [filteredData.totals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) return null;

  const facilityCount = selectedFacility === 'all' ? stats.total_facilities : 1;

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
              <div className="flex gap-2">
                <input
                  type="month"
                  value={dateRange.from ? format(dateRange.from, 'yyyy-MM') : ''}
                  onChange={(e) => {
                    const newFrom = e.target.value ? new Date(e.target.value + '-01') : null;
                    setDateRange(prev => ({ 
                      ...prev, 
                      from: newFrom,
                      // Clear 'to' if it's before new 'from'
                      to: prev.to && newFrom && prev.to < newFrom ? null : prev.to
                    }));
                  }}
                  className="flex-1 h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                  placeholder="Start month"
                />
                <input
                  type="month"
                  value={dateRange.to ? format(dateRange.to, 'yyyy-MM') : ''}
                  onChange={(e) => setDateRange(prev => ({ 
                    ...prev, 
                    to: e.target.value ? new Date(e.target.value + '-01') : null 
                  }))}
                  min={dateRange.from ? format(dateRange.from, 'yyyy-MM') : undefined}
                  className="flex-1 h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                  placeholder="End month"
                />
              </div>
              {(dateRange.from || dateRange.to) && (
                <button 
                  onClick={() => setDateRange({ from: null, to: null })}
                  className="text-xs text-primary hover:underline"
                >
                  Clear date range
                </button>
              )}
            </div>

            {/* Facility Filter */}
            <div className="space-y-2">
              <Label>Filter by Facility</Label>
              <select
                value={selectedFacility}
                onChange={(e) => setSelectedFacility(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                data-testid="facility-filter"
              >
                <option value="all">All Facilities</option>
                {facilities.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <Button
                onClick={() => {
                  setSelectedFacility('all');
                  setDateRange({ from: null, to: null });
                }}
                variant="outline"
                className="w-full"
                data-testid="clear-filters-btn"
              >
                Clear All Filters
              </Button>
            </div>
          </div>
          {(selectedFacility !== 'all' || dateRange.from || dateRange.to) && (
            <div className="mt-3 p-2 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Filters applied: 
                {dateRange.from && ` From: ${format(dateRange.from, 'MMM yyyy')}`}
                {dateRange.to && ` To: ${format(dateRange.to, 'MMM yyyy')}`}
                {selectedFacility !== 'all' && ` Facility: ${facilities.find(f => f.id === selectedFacility)?.name}`}
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
              <p className="text-text-muted text-sm font-medium mb-3">Scope Breakdown</p>
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
      {(filteredData.filteredSinks > 0 || (selectedFacility === 'all' && stats?.sinks_total > 0)) && (
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
                <p className="text-text-muted text-sm font-medium mb-3">Sinks by Facility</p>
                <div className="space-y-2 max-h-24 overflow-y-auto">
                  {(selectedFacility === 'all' 
                    ? stats?.sinks_by_facility 
                    : stats?.sinks_by_facility?.filter(s => s.facility_id === selectedFacility)
                  )?.slice(0, 4).map((sink, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-text-secondary truncate mr-2">{sink.facility_name}</span>
                      <span className="text-sm font-medium text-green-600">-{sink.total_reduced.toFixed(2)} t</span>
                    </div>
                  ))}
                  {(!stats?.sinks_by_facility?.length || 
                    (selectedFacility !== 'all' && !stats?.sinks_by_facility?.some(s => s.facility_id === selectedFacility))) && (
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
          {scopeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={scopeData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={renderCustomLabel}
                  outerRadius={100}
                  innerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                  paddingAngle={2}
                >
                  {scopeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => `${value.toFixed(2)} kg CO₂e`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value, entry) => {
                    const item = scopeData.find(d => d.name === value);
                    const percent = item ? ((item.value / filteredData.totals.total) * 100).toFixed(1) : 0;
                    return `${value} (${percent}%)`;
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
                <YAxis stroke="#71717A" />
                <Tooltip 
                  formatter={(value) => `${value.toFixed(2)} kg CO₂e`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend />
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
            <BarChart data={filteredData.facilities}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="facility_name" stroke="#71717A" />
              <YAxis stroke="#71717A" />
              <Tooltip 
                formatter={(value) => `${value.toFixed(2)} tCO₂e`}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
              <Legend />
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
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.emissions_by_category}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(1)}%` : ''}
                  outerRadius={100}
                  innerRadius={60}
                  fill="#8884d8"
                  dataKey="total_emissions"
                  nameKey="category"
                  paddingAngle={2}
                >
                  {stats.emissions_by_category.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || COLORS[index % COLORS.length]} stroke={CATEGORY_COLORS[entry.category] || COLORS[index % COLORS.length]} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => `${value.toFixed(2)} tCO₂e`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-text-muted">
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
              <BarChart data={stats.emissions_by_fuel.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#71717A" />
                <YAxis dataKey="fuel_type" type="category" stroke="#71717A" width={100} />
                <Tooltip 
                  formatter={(value) => `${value.toFixed(2)} tCO₂e`}
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
                <Tooltip 
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
            <h3 className="text-lg font-heading font-bold text-text-primary">Year-wise Scope Breakdown</h3>
          </div>
          <p className="text-sm text-text-muted mb-4">Annual Scope 1 vs Scope 2 emissions</p>
          {stats?.yearly_facility_analysis?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.yearly_facility_analysis}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="year" stroke="#71717A" />
                <YAxis stroke="#71717A" />
                <Tooltip 
                  formatter={(value) => `${Number(value).toFixed(2)} tCO₂e`}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                />
                <Legend />
                <Bar dataKey="scope1" fill={SCOPE_COLORS.scope1} name="Scope 1 (Direct)" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="scope2" fill={SCOPE_COLORS.scope2} name="Scope 2 (Indirect)" stackId="a" radius={[4, 4, 0, 0]} />
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
        </div>
        <p className="text-sm text-text-muted mb-4">Track emissions changes between consecutive months</p>
        {stats?.monthly_comparison?.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={stats.monthly_comparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="period" stroke="#71717A" />
              <YAxis yAxisId="left" stroke="#71717A" />
              <YAxis yAxisId="right" orientation="right" stroke="#EF4444" unit="%" />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'change_percent' ? `${value.toFixed(1)}%` : `${value.toFixed(2)} tCO₂e`,
                  name === 'change_percent' ? 'Change %' : name === 'total' ? 'Current' : 'Previous'
                ]}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="total" fill="#10B981" name="Current Month" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="previous_total" fill="#94A3B8" name="Previous Month" radius={[4, 4, 0, 0]} />
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
