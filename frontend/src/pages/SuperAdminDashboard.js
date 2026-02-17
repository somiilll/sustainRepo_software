import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Building, Building2, Users, UserCog } from 'lucide-react';

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
        total_admins: 0,
        total_users: 0,
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Admins</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{stats.total_admins || 0}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <UserCog className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-text-muted text-sm font-medium mb-1">Total Users</p>
              <p className="text-3xl font-heading font-bold text-text-primary">{stats.total_users || 0}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <h3 className="text-lg font-heading font-bold text-text-primary">Organization Details</h3>
        {stats.organization_stats.length > 0 ? (
          stats.organization_stats.map((org) => (
            <Card key={org.organization_id} className={`p-6 border rounded-xl hover:shadow-lg transition-shadow ${org.is_active ? 'border-stone-200 bg-white' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-xl font-heading font-bold text-text-primary">{org.organization_name}</h4>
                    {!org.is_active && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Inactive</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div>
                      <p className="text-xs text-text-muted mb-1">Facilities</p>
                      <p className="text-lg font-medium text-text-primary">
                        {org.total_facilities} <span className="text-xs text-text-muted">/ {org.max_facilities}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Admins</p>
                      <p className="text-lg font-medium text-blue-600">
                        {org.total_admins} <span className="text-xs text-text-muted">/ {org.max_admins}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Users</p>
                      <p className="text-lg font-medium text-green-600">
                        {org.total_users} <span className="text-xs text-text-muted">/ {org.max_users}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Facility Limit</p>
                      <div className="w-full bg-stone-200 rounded-full h-2 mt-1">
                        <div 
                          className="bg-primary h-2 rounded-full" 
                          style={{ width: `${Math.min((org.total_facilities / org.max_facilities) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Admin Limit</p>
                      <div className="w-full bg-stone-200 rounded-full h-2 mt-1">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ width: `${Math.min((org.total_admins / org.max_admins) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">User Limit</p>
                      <div className="w-full bg-stone-200 rounded-full h-2 mt-1">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${Math.min((org.total_users / org.max_users) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <div className="text-center py-12 text-text-muted">
            No organizations found
          </div>
        )}
      </div>
    </div>
  );
}