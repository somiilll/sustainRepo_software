import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Building2, TrendingUp, Gauge, Filter, Flame, Factory, Calendar, ArrowUpDown } from 'lucide-react';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLORS = ['#1A4D2E', '#4F6F52', '#E85C0D', '#F5A623', '#8D6F64', '#3B82F6', '#8B5CF6', '#EC4899'];
const CATEGORY_COLORS = {
  'Stationary Combustion': '#1A4D2E',
  'Mobile Combustion': '#4F6F52',
  'Fugitive Emissions': '#E85C0D',
  'Process Emissions': '#F5A623',
  'Purchased Electricity': '#3B82F6',
  'Unknown': '#8D6F64'
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

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/dashboard/stats`, {
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
        emissions_trend: []
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
  const filteredData = useMemo(() => {
    if (!stats) return { trend: [], facilities: [], totals: { scope1: 0, scope2: 0, biogenic: 0, total: 0 } };

    // Filter trend data by date range
    let filteredTrend = stats.emissions_trend;
    
    if (dateRange.from || dateRange.to) {
      filteredTrend = filteredTrend.filter(t => {
        const periodDate = new Date(t.period + '-01'); // Convert YYYY-MM to date
        if (dateRange.from && dateRange.to) {
          return periodDate >= dateRange.from && periodDate <= dateRange.to;
        } else if (dateRange.from) {
          return periodDate >= dateRange.from;
        } else if (dateRange.to) {
          return periodDate <= dateRange.to;
        }
        return true;
      });
    }

    // Filter facility data
    let filteredFacilities = stats.emissions_by_facility;
    if (selectedFacility !== 'all') {
      filteredFacilities = filteredFacilities.filter(f => f.facility_id === selectedFacility);
    }

    // Calculate totals from filtered facilities
    const totals = {
      scope1: filteredFacilities.reduce((sum, f) => sum + (f.scope1_emissions || 0), 0),
      scope2: filteredFacilities.reduce((sum, f) => sum + (f.scope2_emissions || 0), 0),
      biogenic: filteredFacilities.reduce((sum, f) => sum + (f.biogenic_emissions || 0), 0),
      total: 0
    };

    // If date filter is applied, use trend totals instead
    if ((dateRange.from || dateRange.to) && selectedFacility === 'all') {
      totals.scope1 = filteredTrend.reduce((sum, t) => sum + (t.scope1 || 0), 0);
      totals.scope2 = filteredTrend.reduce((sum, t) => sum + (t.scope2 || 0), 0);
      totals.biogenic = filteredTrend.reduce((sum, t) => sum + (t.biogenic || 0), 0);
    }

    totals.total = totals.scope1 + totals.scope2 + totals.biogenic;

    return { trend: filteredTrend, facilities: filteredFacilities, totals };
  }, [stats, selectedFacility, dateRange]);

  // Prepare scope data for pie chart
  const scopeData = useMemo(() => {
    return [
      { name: 'Scope 1', value: filteredData.totals.scope1, color: '#1A4D2E' },
      { name: 'Scope 2', value: filteredData.totals.scope2, color: '#4F6F52' },
      { name: 'Biogenic', value: filteredData.totals.biogenic, color: '#E85C0D' }
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
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {scopeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value.toFixed(2)} kg CO₂e`} />
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
                <Tooltip formatter={(value) => `${value.toFixed(2)} kg CO₂e`} />
                <Legend />
                <Line type="monotone" dataKey="scope1" stroke="#1A4D2E" strokeWidth={2} name="Scope 1" />
                <Line type="monotone" dataKey="scope2" stroke="#4F6F52" strokeWidth={2} name="Scope 2" />
                <Line type="monotone" dataKey="biogenic" stroke="#E85C0D" strokeWidth={2} name="Biogenic" />
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
              <Tooltip formatter={(value) => `${value.toFixed(2)} kg CO₂e`} />
              <Legend />
              <Bar dataKey="scope1_emissions" fill="#1A4D2E" name="Scope 1" />
              <Bar dataKey="scope2_emissions" fill="#4F6F52" name="Scope 2" />
              <Bar dataKey="biogenic_emissions" fill="#E85C0D" name="Biogenic" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-text-muted">
            No facility data available
          </div>
        )}
      </Card>
    </div>
  );
}
