/**
 * KPI Definitions Page
 * Super Admin page for managing ESG KPI definitions
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { 
  KPIDefinitionWizard, 
  KPIDefinitionList,
  ESG_SECTIONS 
} from '../components/kpi-definitions';
import { toast } from 'sonner';
import { Plus, Settings, BarChart3 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const KPIDefinitions = () => {
  const [kpiDefinitions, setKpiDefinitions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    section: '',
    status: '',
  });

  // Fetch KPI definitions
  const fetchKpiDefinitions = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.section) params.append('section', filters.section);
      if (filters.status) params.append('status', filters.status);

      const response = await fetch(
        `${API_URL}/api/esg-kpi-definitions?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch KPI definitions');
      
      const data = await response.json();
      setKpiDefinitions(data);
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      toast.error('Failed to load KPI definitions');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchKpiDefinitions();
  }, [fetchKpiDefinitions]);

  // Create/Update KPI
  const handleSaveKpi = async (formData) => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const isEdit = !!editingKpi;
      const url = isEdit
        ? `${API_URL}/api/esg-kpi-definitions/${editingKpi.id}`
        : `${API_URL}/api/esg-kpi-definitions`;

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save KPI');
      }

      toast.success(isEdit ? 'KPI updated successfully' : 'KPI created successfully');
      setIsWizardOpen(false);
      setEditingKpi(null);
      fetchKpiDefinitions();
    } catch (error) {
      console.error('Error saving KPI:', error);
      toast.error(error.message || 'Failed to save KPI');
    } finally {
      setIsSaving(false);
    }
  };

  // Edit KPI
  const handleEdit = (kpi) => {
    setEditingKpi(kpi);
    setIsWizardOpen(true);
  };

  // Duplicate KPI
  const handleDuplicate = async (kpiId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/esg-kpi-definitions/${kpiId}/duplicate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error('Failed to duplicate KPI');

      toast.success('KPI duplicated successfully');
      fetchKpiDefinitions();
    } catch (error) {
      console.error('Error duplicating KPI:', error);
      toast.error('Failed to duplicate KPI');
    }
  };

  // Archive KPI
  const handleArchive = async (kpiId) => {
    if (!window.confirm('Are you sure you want to archive this KPI?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/esg-kpi-definitions/${kpiId}/archive`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to archive KPI');
      }

      toast.success('KPI archived successfully');
      fetchKpiDefinitions();
    } catch (error) {
      console.error('Error archiving KPI:', error);
      toast.error(error.message || 'Failed to archive KPI');
    }
  };

  // Delete KPI
  const handleDelete = async (kpiId) => {
    if (!window.confirm('Are you sure you want to permanently delete this KPI? This cannot be undone.')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_URL}/api/esg-kpi-definitions/${kpiId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete KPI');
      }

      toast.success('KPI deleted successfully');
      fetchKpiDefinitions();
    } catch (error) {
      console.error('Error deleting KPI:', error);
      toast.error(error.message || 'Failed to delete KPI');
    }
  };

  // Stats summary
  const stats = {
    total: kpiDefinitions.length,
    active: kpiDefinitions.filter(k => k.status === 'active').length,
    draft: kpiDefinitions.filter(k => k.status === 'draft').length,
    bySection: Object.keys(ESG_SECTIONS).reduce((acc, section) => {
      acc[section] = kpiDefinitions.filter(k => k.section === section).length;
      return acc;
    }, {}),
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-gray-600" />
            KPI Definitions
          </h1>
          <p className="text-gray-500 mt-1">
            Configure reusable ESG metrics for targets, dashboards, and reports
          </p>
        </div>
        <Button 
          onClick={() => {
            setEditingKpi(null);
            setIsWizardOpen(true);
          }}
          data-testid="kpi-create-btn"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create KPI
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total KPIs</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-gray-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Draft</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.draft}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              {Object.entries(ESG_SECTIONS).map(([key, { label, color }]) => (
                <div key={key}>
                  <p className="text-lg font-bold">{stats.bySection[key] || 0}</p>
                  <p className="text-xs text-gray-500">{label.slice(0, 3)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI List */}
      <Card>
        <CardHeader>
          <CardTitle>All KPI Definitions</CardTitle>
          <CardDescription>
            Manage metric definitions used across the ESG platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KPIDefinitionList
            kpiDefinitions={kpiDefinitions}
            isLoading={isLoading}
            filters={filters}
            setFilters={setFilters}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onRefresh={fetchKpiDefinitions}
          />
        </CardContent>
      </Card>

      {/* Wizard Dialog */}
      <KPIDefinitionWizard
        isOpen={isWizardOpen}
        onClose={() => {
          setIsWizardOpen(false);
          setEditingKpi(null);
        }}
        onSave={handleSaveKpi}
        editData={editingKpi}
        isLoading={isSaving}
      />
    </div>
  );
};

export default KPIDefinitions;
