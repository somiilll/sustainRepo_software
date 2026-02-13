import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Building, TrendingUp, Building2 } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { getAuthHeader } = useAuth();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/super-admin/dashboard`, {
        headers: getAuthHeader()
      });
      setStats(response.data);
    } catch (error) {
      // Only show error for actual failures, not empty data
      if (error.response?.status !== 404) {
        console.error('Dashboard fetch error:', error);
      }
      // Set empty stats instead of showing error
      setStats({
        total_organizations: 0,
        total_facilities: 0,
        organization_stats: []
      });
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

  return (
    <div className="space-y-6" data-testid="super-admin-dashboard">
      <div>
        <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Super Admin Dashboard</h1>
        <p className="text-text-secondary">Global overview of all organizations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Organizations</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{stats.total_organizations}</p>
            </div>
            <div className="bg-primary/10 p-3 rounded-lg">
              <Building className="w-6 h-6 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Facilities</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{stats.total_facilities}</p>
            </div>
            <div className="bg-secondary/10 p-3 rounded-lg">
              <Building2 className="w-6 h-6 text-secondary" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 border border-stone-200 rounded-xl bg-white">
        <h3 className="text-lg font-heading font-bold text-text-primary mb-4">Emissions by Organization</h3>
        {stats.organization_stats.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={stats.organization_stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="organization_name" stroke="#71717A" />
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
            No organization data available
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4">
        <h3 className="text-lg font-heading font-bold text-text-primary">Organization Details</h3>
        {stats.organization_stats.map((org) => (
          <Card key={org.organization_id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-xl font-heading font-bold text-text-primary mb-2">{org.organization_name}</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <p className="text-xs text-text-muted mb-1">Facilities</p>
                    <p className="text-lg font-medium text-text-primary">{org.total_facilities}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Total Emissions</p>
                    <p className="text-lg font-medium text-text-primary">{org.total_emissions} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Scope 1</p>
                    <p className="text-lg font-medium text-primary">{org.scope1_emissions} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Scope 2</p>
                    <p className="text-lg font-medium text-secondary">{org.scope2_emissions} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Biogenic</p>
                    <p className="text-lg font-medium text-accent">{org.biogenic_emissions} kg</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}