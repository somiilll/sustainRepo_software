/**
 * Org Config — SuperAdmin UI for Organization-Specific Configuration
 *
 * Tabs: Modules | KPI Overrides | Target Overrides | Custom Categories | Features
 * All tab contents live in /components/sustainability-config/
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Building2, ChevronRight, Settings2 } from 'lucide-react';
import {
  OrgOverview,
  ModulesTab,
  KPIOverridesTab,
  TargetOverridesTab,
  CustomCategoriesTab,
  FeaturesTab,
  AIQueryAliasesTab,
  GhgCapabilitiesTab,
} from '../components/sustainability-config';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SustainabilityConfig() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [orgConfig, setOrgConfig] = useState(null);
  const [allDefaultModules, setAllDefaultModules] = useState({ environment: [], social: [], governance: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch org list
  useEffect(() => {
    if (!token) return;
    axios.get(`${API}/sustainability-config/organizations`, { headers })
      .then(r => setOrganizations(r.data || []))
      .catch(() => toast.error('Failed to load organizations'));
  }, [token]);

  // Fetch org config + default modules for all sections
  const fetchConfig = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [cfgRes, envRes, socRes, govRes] = await Promise.all([
        axios.get(`${API}/sustainability-config/org-config?org_id=${selectedOrgId}`, { headers }),
        axios.get(`${API}/sustainability-config/default-modules/environment`, { headers }),
        axios.get(`${API}/sustainability-config/default-modules/social`, { headers }),
        axios.get(`${API}/sustainability-config/default-modules/governance`, { headers }),
      ]);
      setOrgConfig(cfgRes.data);
      setAllDefaultModules({ environment: envRes.data || [], social: socRes.data || [], governance: govRes.data || [] });
    } catch { toast.error('Failed to load config'); }
    setLoading(false);
  }, [selectedOrgId, token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = async (updates) => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      await axios.put(`${API}/sustainability-config/org-config?org_id=${selectedOrgId}`, updates, { headers });
      toast.success('Configuration saved');
      await fetchConfig();
      axios.get(`${API}/sustainability-config/organizations`, { headers }).then(r => setOrganizations(r.data || []));
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    setSaving(false);
  };

  const deleteConfig = async (orgId) => {
    if (!window.confirm('Delete this organization config? The org will revert to global defaults.')) return;
    try {
      await axios.delete(`${API}/sustainability-config/org-config?org_id=${orgId}`, { headers });
      toast.success('Config deleted');
      if (orgId === selectedOrgId) { setOrgConfig(null); setSelectedOrgId(''); }
      axios.get(`${API}/sustainability-config/organizations`, { headers }).then(r => setOrganizations(r.data || []));
    } catch { toast.error('Failed to delete'); }
  };

  const selectedOrgName = organizations.find(o => o.id === selectedOrgId)?.name || '';

  return (
    <div className="space-y-6 p-1" data-testid="org-config-page">
      <div>
        <h1 className="text-2xl font-bold text-stone-900" data-testid="config-page-title">Org Config</h1>
        <p className="text-sm text-stone-500 mt-1">Configure organization-specific sustainability modules, KPI overrides, and features.</p>
      </div>

      {/* Overview: org list + selector */}
      {!selectedOrgId && (
        <OrgOverview organizations={organizations} onSelectOrg={setSelectedOrgId} onDeleteConfig={deleteConfig} />
      )}

      {/* Config editor (when org selected) */}
      {selectedOrgId && !loading && orgConfig && (
        <>
          <Card className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <span className="font-semibold">{selectedOrgName}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedOrgId('')}>
              <ChevronRight className="h-4 w-4 mr-1 rotate-180" /> Back to Overview
            </Button>
          </Card>

          <Tabs defaultValue="modules">
            <TabsList className="flex-wrap">
              <TabsTrigger value="modules">Modules</TabsTrigger>
              <TabsTrigger value="kpi-overrides">KPI Overrides</TabsTrigger>
              <TabsTrigger value="target-overrides" data-testid="target-overrides-tab-trigger">Target Overrides</TabsTrigger>
              <TabsTrigger value="custom-categories">Custom Categories</TabsTrigger>
              <TabsTrigger value="features" data-testid="features-tab-trigger">Features</TabsTrigger>
              <TabsTrigger value="ai-query-aliases" data-testid="ai-query-aliases-tab-trigger">AI Query Aliases</TabsTrigger>
              <TabsTrigger value="ghg-capabilities" data-testid="ghg-capabilities-tab-trigger">GHG Capabilities</TabsTrigger>
            </TabsList>

            <TabsContent value="modules" className="mt-4">
              <ModulesTab orgConfig={orgConfig} defaultModules={allDefaultModules.environment} onSave={saveConfig} saving={saving} />
            </TabsContent>
            <TabsContent value="kpi-overrides" className="mt-4">
              <KPIOverridesTab orgConfig={orgConfig} allDefaultModules={allDefaultModules} onSave={saveConfig} saving={saving} />
            </TabsContent>
            <TabsContent value="target-overrides" className="mt-4">
              <TargetOverridesTab orgConfig={orgConfig} allDefaultModules={allDefaultModules} onSave={saveConfig} saving={saving} />
            </TabsContent>
            <TabsContent value="custom-categories" className="mt-4">
              <CustomCategoriesTab orgConfig={orgConfig} onSave={saveConfig} saving={saving} />
            </TabsContent>
            <TabsContent value="features" className="mt-4">
              <FeaturesTab orgConfig={orgConfig} onSave={saveConfig} saving={saving} />
            </TabsContent>
            <TabsContent value="ai-query-aliases" className="mt-4">
              <AIQueryAliasesTab orgConfig={orgConfig} allDefaultModules={allDefaultModules} onSave={saveConfig} saving={saving} />
            </TabsContent>
            <TabsContent value="ghg-capabilities" className="mt-4">
              <GhgCapabilitiesTab orgConfig={orgConfig} onSave={saveConfig} saving={saving} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {selectedOrgId && loading && (
        <div className="flex justify-center py-12"><Settings2 className="h-8 w-8 animate-spin text-stone-400" /></div>
      )}
    </div>
  );
}
