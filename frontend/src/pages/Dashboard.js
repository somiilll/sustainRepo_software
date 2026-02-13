import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Building2, TrendingUp, Gauge, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLORS = ['#1A4D2E', '#4F6F52', '#E85C0D', '#F5A623', '#8D6F64'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState([]);
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedFacility, setSelectedFacility] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
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
      toast.error('Failed to load dashboard data');
      console.error(error);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) return null;

  // Extract unique years from emissions trend
  const uniqueYears = [...new Set(stats.emissions_trend.map(t => t.period.split('-')[0]))].sort().reverse();

  // Filter data based on selections
  const filteredTrend = stats.emissions_trend.filter(t => {
    const year = t.period.split('-')[0];
    return (selectedYear === 'all' || year === selectedYear);
  });

  const filteredFacilities = stats.emissions_by_facility.filter(f => 
    selectedFacility === 'all' || f.facility_id === selectedFacility
  );

  const filteredTotals = {
    scope1: filteredTrend.reduce((sum, t) => sum + t.scope1, 0),
    scope2: filteredTrend.reduce((sum, t) => sum + t.scope2, 0),
    biogenic: filteredTrend.reduce((sum, t) => sum + t.biogenic, 0),
    total: filteredTrend.reduce((sum, t) => sum + t.total, 0)
  };

  const scopeData = [
    { name: 'Scope 1', value: filteredTotals.scope1, color: '#1A4D2E' },
    { name: 'Scope 2', value: filteredTotals.scope2, color: '#4F6F52' },
    { name: 'Biogenic', value: filteredTotals.biogenic, color: '#E85C0D' }
  ].filter(d => d.value > 0);

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
        >
          <Filter className="w-4 h-4 mr-2" />
          {showFilters ? 'Hide' : 'Show'} Filters
        </Button>
      </div>

      {showFilters && (
        <Card className="p-4 border border-stone-200 rounded-xl bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Filter by Year</Label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="all">All Years</option>
                {uniqueYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Filter by Facility</Label>
              <select
                value={selectedFacility}
                onChange={(e) => setSelectedFacility(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="all">All Facilities</option>
                {facilities.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  setSelectedYear('all');
                  setSelectedFacility('all');
                }}
                variant="outline"
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid="total-facilities-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Facilities</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{selectedFacility === 'all' ? stats.total_facilities : 1}</p>
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
              <p className="text-3xl font-heading font-bold text-text-primary">{filteredTotals.total.toFixed(2)}</p>
              <p className="text-xs text-text-muted mt-1">kg CO₂e</p>
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
                  <span className="text-sm font-medium text-primary">{filteredTotals.scope1.toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Scope 2</span>
                  <span className="text-sm font-medium text-secondary">{filteredTotals.scope2.toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Biogenic</span>
                  <span className="text-sm font-medium text-accent">{filteredTotals.biogenic.toFixed(2)} kg</span>
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
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {scopeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value.toFixed(2)} kg CO₂e`} />
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
          {filteredTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredTrend}>
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
        {filteredFacilities.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={filteredFacilities}>
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

      {stats.recent_records.length > 0 && (
        <Card className="p-6 border border-stone-200 rounded-xl bg-white" data-testid="recent-records">
          <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Recent Emission Records</h3>
          <div className="space-y-3">
            {stats.recent_records.slice(0, 5).map((record) => (
              <div key={record.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">{record.category}</p>
                  <p className="text-sm text-text-muted">{record.reporting_period} • {record.scope.toUpperCase().replace('SCOPE', 'Scope ').replace('BIOGENIC', 'Biogenic')}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-text-primary">{record.total_emissions.toFixed(2)} kg</p>
                  <p className="text-xs text-text-muted">CO₂e</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}