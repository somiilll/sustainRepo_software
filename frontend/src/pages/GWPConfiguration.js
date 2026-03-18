import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Settings, Check, Trash2, Edit2, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Predefined GWP sources
const GWP_SOURCES = [
  { name: 'IPCC AR6', year: 2021, ch4_fossil: 29.8, ch4_non_fossil: 27.0, n2o: 273 },
  { name: 'IPCC AR5', year: 2014, ch4_fossil: 30, ch4_non_fossil: 28, n2o: 265 },
  { name: 'IPCC AR4', year: 2007, ch4_fossil: 25, ch4_non_fossil: 25, n2o: 298 },
  { name: 'Custom', year: null, ch4_fossil: null, ch4_non_fossil: null, n2o: null }
];

export default function GWPConfiguration() {
  const [configs, setConfigs] = useState([]);
  const [activeConfig, setActiveConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState(null);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    source_name: 'IPCC AR6',
    source_year: 2021,
    time_horizon: '100-year',
    co2_gwp: 1,
    ch4_fossil_gwp: 29.8,
    ch4_non_fossil_gwp: 27.0,
    n2o_gwp: 273,
    notes: '',
    is_active: false
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const [configsRes, activeRes] = await Promise.all([
        axios.get(`${API}/super-admin/gwp-configs`, { headers: getAuthHeader() }),
        axios.get(`${API}/gwp-config`, { headers: getAuthHeader() })
      ]);
      setConfigs(configsRes.data);
      setActiveConfig(activeRes.data);
    } catch (error) {
      console.error('Error fetching GWP configs:', error);
      toast.error('Failed to load GWP configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = (sourceName) => {
    const source = GWP_SOURCES.find(s => s.name === sourceName);
    if (source && source.name !== 'Custom') {
      setFormData({
        ...formData,
        source_name: source.name,
        source_year: source.year,
        ch4_fossil_gwp: source.ch4_fossil,
        ch4_non_fossil_gwp: source.ch4_non_fossil,
        n2o_gwp: source.n2o
      });
    } else {
      setFormData({
        ...formData,
        source_name: 'Custom',
        source_year: new Date().getFullYear()
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingConfig) {
        await axios.put(
          `${API}/super-admin/gwp-config/${editingConfig.id}`,
          formData,
          { headers: getAuthHeader() }
        );
        toast.success('GWP configuration updated successfully');
      } else {
        await axios.post(
          `${API}/super-admin/gwp-config`,
          formData,
          { headers: getAuthHeader() }
        );
        toast.success('GWP configuration created successfully');
      }
      
      setDialogOpen(false);
      resetForm();
      fetchConfigs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleActivate = async (configId) => {
    try {
      await axios.post(
        `${API}/super-admin/gwp-config/${configId}/activate`,
        {},
        { headers: getAuthHeader() }
      );
      toast.success('GWP configuration activated');
      fetchConfigs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to activate configuration');
    }
  };

  const handleDelete = async () => {
    if (!configToDelete) return;
    
    try {
      await axios.delete(
        `${API}/super-admin/gwp-config/${configToDelete.id}`,
        { headers: getAuthHeader() }
      );
      toast.success('GWP configuration deleted');
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
      fetchConfigs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete configuration');
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const response = await axios.post(
        `${API}/super-admin/seed-gwp-configs`,
        {},
        { headers: getAuthHeader() }
      );
      toast.success(response.data.message);
      fetchConfigs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to seed configurations');
    }
  };

  const openEditDialog = (config) => {
    setEditingConfig(config);
    setFormData({
      source_name: config.source_name,
      source_year: config.source_year || new Date().getFullYear(),
      time_horizon: config.time_horizon || '100-year',
      co2_gwp: config.co2_gwp || 1,
      ch4_fossil_gwp: config.ch4_fossil_gwp || config.ch4_gwp || 29.8,
      ch4_non_fossil_gwp: config.ch4_non_fossil_gwp || config.ch4_gwp || 27.0,
      n2o_gwp: config.n2o_gwp,
      notes: config.notes || '',
      is_active: config.is_active
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      source_name: 'IPCC AR6',
      source_year: 2021,
      time_horizon: '100-year',
      co2_gwp: 1,
      ch4_fossil_gwp: 29.8,
      ch4_non_fossil_gwp: 27.0,
      n2o_gwp: 273,
      notes: '',
      is_active: false
    });
    setEditingConfig(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="gwp-configuration-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">GWP Configuration</h1>
          <p className="text-text-secondary">
            Configure Global Warming Potential (GWP) values for CO₂e calculations
          </p>
        </div>
        <div className="flex gap-2">
          {configs.length === 0 && (
            <Button variant="outline" onClick={handleSeedDefaults} data-testid="seed-defaults-btn">
              <Settings className="w-4 h-4 mr-2" />
              Seed Defaults
            </Button>
          )}
          <Button 
            className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" 
            onClick={() => { resetForm(); setDialogOpen(true); }}
            data-testid="add-gwp-config-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Configuration
          </Button>
        </div>
      </div>

      {/* Active Configuration Card */}
      {activeConfig && (
        <Card className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-primary uppercase tracking-wide">Active Configuration</span>
              </div>
              <h2 className="text-2xl font-bold text-text-primary mb-1">
                {activeConfig.source_name} {activeConfig.source_year ? `(${activeConfig.source_year})` : ''}
              </h2>
              <p className="text-text-secondary mb-4">{activeConfig.time_horizon} time horizon</p>
              
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-white/80 rounded-lg p-4 text-center">
                  <p className="text-xs text-text-muted uppercase mb-1">CO₂ GWP</p>
                  <p className="text-3xl font-bold text-text-primary">{activeConfig.co2_gwp}</p>
                </div>
                <div className="bg-white/80 rounded-lg p-4 text-center">
                  <p className="text-xs text-text-muted uppercase mb-1">CH₄ GWP (Fossil)</p>
                  <p className="text-3xl font-bold text-text-primary">{activeConfig.ch4_fossil_gwp || activeConfig.ch4_gwp || '-'}</p>
                </div>
                <div className="bg-white/80 rounded-lg p-4 text-center">
                  <p className="text-xs text-text-muted uppercase mb-1">CH₄ GWP (Non-fossil)</p>
                  <p className="text-3xl font-bold text-text-primary">{activeConfig.ch4_non_fossil_gwp || activeConfig.ch4_gwp || '-'}</p>
                </div>
                <div className="bg-white/80 rounded-lg p-4 text-center">
                  <p className="text-xs text-text-muted uppercase mb-1">N₂O GWP</p>
                  <p className="text-3xl font-bold text-text-primary">{activeConfig.n2o_gwp}</p>
                </div>
              </div>
              
              {activeConfig.notes && (
                <p className="mt-4 text-sm text-text-muted italic">{activeConfig.notes}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Info Box */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800 font-medium mb-1">About GWP Values</p>
            <p className="text-sm text-blue-700">
              Global Warming Potential (GWP) values are used to convert emissions of different greenhouse gases 
              into CO₂ equivalents (CO₂e). The formula is: <strong>CO₂e = CO₂ + (CH₄ × GWP_CH₄) + (N₂O × GWP_N₂O)</strong>. 
              IPCC updates these values periodically in their Assessment Reports (AR5, AR6, etc.).
            </p>
          </div>
        </div>
      </Card>

      {/* All Configurations */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">All Configurations</h3>
        
        {configs.length === 0 ? (
          <Card className="p-8 text-center">
            <Settings className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-muted mb-4">No GWP configurations found</p>
            <Button onClick={handleSeedDefaults}>
              Seed Default Configurations (AR5 & AR6)
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {configs.map((config) => (
              <Card 
                key={config.id} 
                className={`p-4 border ${config.is_active ? 'border-primary bg-primary/5' : 'border-stone-200'}`}
                data-testid={`gwp-config-${config.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-text-primary">
                      {config.source_name}
                      {config.source_year && <span className="text-text-muted ml-1">({config.source_year})</span>}
                    </h4>
                    <p className="text-xs text-text-muted">{config.time_horizon}</p>
                  </div>
                  {config.is_active && (
                    <span className="text-xs px-2 py-1 rounded bg-primary text-white">Active</span>
                  )}
                </div>
                
                <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                  <div className="bg-stone-50 rounded p-2">
                    <p className="text-xs text-text-muted">CO₂</p>
                    <p className="font-bold">{config.co2_gwp}</p>
                  </div>
                  <div className="bg-stone-50 rounded p-2">
                    <p className="text-xs text-text-muted">CH₄ (F)</p>
                    <p className="font-bold">{config.ch4_fossil_gwp || config.ch4_gwp || '-'}</p>
                  </div>
                  <div className="bg-stone-50 rounded p-2">
                    <p className="text-xs text-text-muted">CH₄ (NF)</p>
                    <p className="font-bold">{config.ch4_non_fossil_gwp || config.ch4_gwp || '-'}</p>
                  </div>
                  <div className="bg-stone-50 rounded p-2">
                    <p className="text-xs text-text-muted">N₂O</p>
                    <p className="font-bold">{config.n2o_gwp}</p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {!config.is_active && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleActivate(config.id)}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Activate
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEditDialog(config)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  {!config.is_active && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-red-600"
                      onClick={() => { setConfigToDelete(config); setDeleteDialogOpen(true); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingConfig ? 'Edit' : 'Add'} GWP Configuration</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Source *</Label>
              <Select
                value={formData.source_name}
                onValueChange={handleSourceChange}
              >
                <SelectTrigger className="bg-stone-50">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {GWP_SOURCES.map((source) => (
                    <SelectItem key={source.name} value={source.name}>
                      {source.name} {source.year && `(${source.year})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Year</Label>
                <Input
                  type="number"
                  value={formData.source_year}
                  onChange={(e) => setFormData({ ...formData, source_year: parseInt(e.target.value) })}
                  className="bg-stone-50"
                  min="1990"
                  max="2100"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Time Horizon *</Label>
                <Select
                  value={formData.time_horizon}
                  onValueChange={(value) => setFormData({ ...formData, time_horizon: value })}
                >
                  <SelectTrigger className="bg-stone-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20-year">20-year</SelectItem>
                    <SelectItem value="100-year">100-year</SelectItem>
                    <SelectItem value="500-year">500-year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>CO₂ GWP</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.co2_gwp}
                  onChange={(e) => setFormData({ ...formData, co2_gwp: parseFloat(e.target.value) })}
                  className="bg-stone-50"
                  disabled
                />
                <p className="text-xs text-text-muted">Always 1</p>
              </div>
              
              <div className="space-y-2">
                <Label>CH₄ GWP (Fossil) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.ch4_fossil_gwp}
                  onChange={(e) => setFormData({ ...formData, ch4_fossil_gwp: parseFloat(e.target.value) })}
                  className="bg-stone-50"
                  required
                />
                <p className="text-xs text-text-muted">From fossil fuel sources</p>
              </div>
              
              <div className="space-y-2">
                <Label>CH₄ GWP (Non-fossil) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.ch4_non_fossil_gwp}
                  onChange={(e) => setFormData({ ...formData, ch4_non_fossil_gwp: parseFloat(e.target.value) })}
                  className="bg-stone-50"
                  required
                />
                <p className="text-xs text-text-muted">From biogenic/non-fossil sources</p>
              </div>
              
              <div className="space-y-2">
                <Label>N₂O GWP *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.n2o_gwp}
                  onChange={(e) => setFormData({ ...formData, n2o_gwp: parseFloat(e.target.value) })}
                  className="bg-stone-50"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-stone-50"
                placeholder="Optional notes about this configuration"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is_active" className="cursor-pointer">Set as active configuration</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                {editingConfig ? 'Update' : 'Create'} Configuration
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete GWP Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{configToDelete?.source_name}" configuration? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
