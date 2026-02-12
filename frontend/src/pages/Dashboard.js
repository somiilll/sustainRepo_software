import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Building2, TrendingUp, Gauge } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLORS = ['#1A4D2E', '#4F6F52', '#E85C0D', '#F5A623', '#8D6F64'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { getAuthHeader } = useAuth();

  useEffect(() => {
    fetchStats();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!stats) return null;

  const scopeData = [
    { name: 'Scope 1', value: stats.scope1_emissions, color: '#1A4D2E' },
    { name: 'Scope 2', value: stats.scope2_emissions, color: '#4F6F52' }
  ];

  return (
    <div className="space-y-6" data-testid="dashboard">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Dashboard</h1>
        <p className="text-text-secondary">Overview of your GHG emissions data</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid="total-facilities-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Facilities</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{stats.total_facilities}</p>
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
              <p className="text-3xl font-heading font-bold text-text-primary">{stats.total_emissions.toFixed(2)}</p>
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
                  <span className="text-sm font-medium text-primary">{stats.scope1_emissions.toFixed(2)} kg</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Scope 2</span>
                  <span className="text-sm font-medium text-secondary">{stats.scope2_emissions.toFixed(2)} kg</span>
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
          <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Scope 1 vs Scope 2 Emissions</h3>
          {scopeData.some(d => d.value > 0) ? (
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
          {stats.emissions_trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.emissions_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="period" stroke="#71717A" />
                <YAxis stroke="#71717A" />
                <Tooltip formatter={(value) => `${value.toFixed(2)} kg CO₂e`} />
                <Legend />
                <Line type="monotone" dataKey="scope1" stroke="#1A4D2E" strokeWidth={2} name="Scope 1" />
                <Line type="monotone" dataKey="scope2" stroke="#4F6F52" strokeWidth={2} name="Scope 2" />
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
        {stats.emissions_by_facility.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={stats.emissions_by_facility}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="facility_name" stroke="#71717A" />
              <YAxis stroke="#71717A" />
              <Tooltip formatter={(value) => `${value.toFixed(2)} kg CO₂e`} />
              <Legend />
              <Bar dataKey="scope1_emissions" fill="#1A4D2E" name="Scope 1" />
              <Bar dataKey="scope2_emissions" fill="#4F6F52" name="Scope 2" />
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
            {stats.recent_records.map((record) => (
              <div key={record.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">{record.category}</p>
                  <p className="text-sm text-text-muted">{record.reporting_period} • {record.scope.toUpperCase().replace('SCOPE', 'Scope ')}</p>
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