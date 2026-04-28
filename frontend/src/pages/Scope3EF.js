import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Edit, Trash2, Search, Filter, Loader2, FileSpreadsheet } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Regions (same as Fuel Database)
const REGIONS = [
  'Global',
  'United States',
  'United Kingdom',
  'European Union',
  'India',
  'China',
  'Australia',
  'Canada',
  'Japan',
  'Brazil',
  'Germany',
  'France',
  'Other'
];

// Method options
const METHODS = [
  { value: 'spend', label: 'Spend-based' },
  { value: 'activity', label: 'Activity-based' }
];

// Scope 3 categories
const SCOPE3_CATEGORIES = [
  { scope: 'Scope 3.1', label: 'Purchased Goods and Services' },
  { scope: 'Scope 3.2', label: 'Capital Goods' },
  { scope: 'Scope 3.3', label: 'Fuel and Energy Related Activities' },
  { scope: 'Scope 3.4', label: 'Upstream Transportation and Distribution' },
  { scope: 'Scope 3.5', label: 'Waste Generated in Operations' },
  { scope: 'Scope 3.6', label: 'Business Travel' },
  { scope: 'Scope 3.7', label: 'Employee Commuting' },
  { scope: 'Scope 3.8', label: 'Upstream Leased Assets' },
  { scope: 'Scope 3.9', label: 'Downstream Transportation and Distribution' },
  { scope: 'Scope 3.10', label: 'Processing of Sold Products' },
  { scope: 'Scope 3.11', label: 'Use of Sold Products' },
  { scope: 'Scope 3.12', label: 'End-of-Life Treatment of Sold Products' },
  { scope: 'Scope 3.13', label: 'Downstream Leased Assets' },
  { scope: 'Scope 3.14', label: 'Franchises' },
  { scope: 'Scope 3.15', label: 'Investments' }
];

// Common emission factor units
const EF_UNITS = [
  'kgCO2e/USD',
  'kgCO2e/EUR',
  'kgCO2e/INR',
  'kgCO2e/unit',
  'kgCO2e/kg',
  'kgCO2e/tonne',
  'kgCO2e/km',
  'kgCO2e/passenger-km',
  'kgCO2e/tonne-km',
  'kgCO2e/kWh',
  'kgCO2e/MJ',
  'kgCO2e/m3',
  'kgCO2e/L',
  'tCO2e/unit',
  'tCO2e/tonne',
  'gCO2e/km'
];

export default function Scope3EF() {
  const { user, getAuthHeader } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterScope, setFilterScope] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    scope: '',
    category: '',
    activity: '',
    method: '',
    region: 'Global',
    year_applicable: '',
    emission_factor: '',
    unit: '',
    source: '',
    notes: '',
    references: ''
  });

  const isSuperAdmin = user?.role === 'superadmin';

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const endpoint = isSuperAdmin ? '/super-admin/scope3-ef' : '/scope3-ef';
      const response = await axios.get(`${API}${endpoint}`, {
        headers: getAuthHeader()
      });
      setEntries(response.data);
    } catch (error) {
      toast.error('Failed to fetch Scope 3 emission factors');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      scope: '',
      category: '',
      activity: '',
      method: '',
      region: 'Global',
      year_applicable: '',
      emission_factor: '',
      unit: '',
      source: '',
      notes: '',
      references: ''
    });
    setEditingEntry(null);
  };

  const handleOpenDialog = (entry = null) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        scope: entry.scope || '',
        category: entry.category || '',
        activity: entry.activity || '',
        method: entry.method || '',
        region: entry.region || 'Global',
        year_applicable: entry.year_applicable?.toString() || '',
        emission_factor: entry.emission_factor?.toString() || '',
        unit: entry.unit || '',
        source: entry.source || '',
        notes: entry.notes || '',
        references: entry.references || ''
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.activity.trim()) {
      toast.error('Activity is required');
      return;
    }
    if (!formData.scope) {
      toast.error('Scope is required');
      return;
    }
    if (!formData.method) {
      toast.error('Method is required');
      return;
    }
    if (!formData.emission_factor || parseFloat(formData.emission_factor) < 0) {
      toast.error('Emission factor must be a non-negative number');
      return;
    }
    if (!formData.unit) {
      toast.error('Unit is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        emission_factor: parseFloat(formData.emission_factor),
        year_applicable: formData.year_applicable ? parseInt(formData.year_applicable) : null,
        region: formData.region || 'Global'
      };

      if (editingEntry) {
        await axios.put(`${API}/super-admin/scope3-ef/${editingEntry.id}`, payload, {
          headers: getAuthHeader()
        });
        toast.success('Scope 3 EF entry updated successfully');
      } else {
        await axios.post(`${API}/super-admin/scope3-ef`, payload, {
          headers: getAuthHeader()
        });
        toast.success('Scope 3 EF entry created successfully');
      }
      
      setDialogOpen(false);
      resetForm();
      fetchEntries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entryToDelete) return;
    
    try {
      await axios.delete(`${API}/super-admin/scope3-ef/${entryToDelete.id}`, {
        headers: getAuthHeader()
      });
      toast.success('Entry deleted successfully');
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
      fetchEntries();
    } catch (error) {
      toast.error('Failed to delete entry');
    }
  };

  // Get category label for a scope
  const getCategoryLabel = (scope) => {
    const cat = SCOPE3_CATEGORIES.find(c => c.scope === scope);
    return cat?.label || scope;
  };

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const matchesSearch = !searchTerm || 
        entry.activity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.source?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesScope = !filterScope || entry.scope === filterScope;
      const matchesMethod = !filterMethod || entry.method === filterMethod;
      const matchesRegion = !filterRegion || entry.region === filterRegion;
      return matchesSearch && matchesScope && matchesMethod && matchesRegion;
    });
  }, [entries, searchTerm, filterScope, filterMethod, filterRegion]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="scope3-ef-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">Scope 3 Emission Factors</h1>
          <p className="text-text-secondary mt-1">Manage emission factors for Scope 3 categories</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => handleOpenDialog()} className="flex items-center gap-2" data-testid="add-scope3-ef-btn">
            <Plus className="w-4 h-4" /> Add Entry
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="p-4 border border-stone-200">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by activity, category, source..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="search-scope3-ef"
              />
            </div>
          </div>
          <Select value={filterScope || "all"} onValueChange={(val) => setFilterScope(val === "all" ? "" : val)}>
            <SelectTrigger className="w-[180px]" data-testid="filter-scope">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Scopes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              {SCOPE3_CATEGORIES.map(cat => (
                <SelectItem key={cat.scope} value={cat.scope}>{cat.scope}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMethod || "all"} onValueChange={(val) => setFilterMethod(val === "all" ? "" : val)}>
            <SelectTrigger className="w-[150px]" data-testid="filter-method">
              <SelectValue placeholder="All Methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              {METHODS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRegion || "all"} onValueChange={(val) => setFilterRegion(val === "all" ? "" : val)}>
            <SelectTrigger className="w-[150px]" data-testid="filter-region">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {REGIONS.map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Entries Table */}
      <Card className="border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left p-4 font-medium text-text-secondary">Scope</th>
                <th className="text-left p-4 font-medium text-text-secondary">Category</th>
                <th className="text-left p-4 font-medium text-text-secondary">Activity</th>
                <th className="text-left p-4 font-medium text-text-secondary">Method</th>
                <th className="text-left p-4 font-medium text-text-secondary">Region</th>
                <th className="text-left p-4 font-medium text-text-secondary">Year</th>
                <th className="text-right p-4 font-medium text-text-secondary">Emission Factor</th>
                <th className="text-left p-4 font-medium text-text-secondary">Unit</th>
                <th className="text-left p-4 font-medium text-text-secondary">Source</th>
                {isSuperAdmin && <th className="text-right p-4 font-medium text-text-secondary">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 10 : 9} className="p-8 text-center text-text-muted">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No emission factors found</p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`scope3-ef-row-${entry.id}`}>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm font-medium">
                        {entry.scope}
                      </span>
                    </td>
                    <td className="p-4 text-sm">{entry.category || getCategoryLabel(entry.scope)}</td>
                    <td className="p-4 font-medium">{entry.activity}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.method === 'spend' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {entry.method === 'spend' ? 'Spend' : 'Activity'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-secondary">{entry.region}</td>
                    <td className="p-4 text-sm text-text-secondary">{entry.year_applicable || '-'}</td>
                    <td className="p-4 text-right font-mono">{entry.emission_factor}</td>
                    <td className="p-4 text-sm text-text-secondary">{entry.unit}</td>
                    <td className="p-4 text-sm text-text-secondary max-w-[150px] truncate" title={entry.source}>
                      {entry.source || '-'}
                    </td>
                    {isSuperAdmin && (
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(entry)}
                            data-testid={`edit-scope3-ef-${entry.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEntryToDelete(entry);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`delete-scope3-ef-${entry.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-stone-200 bg-stone-50">
          <p className="text-sm text-text-secondary">
            Showing {filteredEntries.length} of {entries.length} entries
          </p>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Entry' : 'Add New Entry'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Scope */}
              <div className="space-y-2">
                <Label htmlFor="scope">Scope *</Label>
                <Select value={formData.scope} onValueChange={(val) => setFormData({...formData, scope: val, category: getCategoryLabel(val)})}>
                  <SelectTrigger data-testid="input-scope">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE3_CATEGORIES.map(cat => (
                      <SelectItem key={cat.scope} value={cat.scope}>{cat.scope} - {cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category (auto-filled based on scope) */}
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  placeholder="Category name"
                  data-testid="input-category"
                />
              </div>

              {/* Activity */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="activity">Activity *</Label>
                <Input
                  id="activity"
                  value={formData.activity}
                  onChange={(e) => setFormData({...formData, activity: e.target.value})}
                  placeholder="e.g., Air travel - short haul"
                  required
                  data-testid="input-activity"
                />
              </div>

              {/* Method */}
              <div className="space-y-2">
                <Label htmlFor="method">Method *</Label>
                <Select value={formData.method} onValueChange={(val) => setFormData({...formData, method: val})}>
                  <SelectTrigger data-testid="input-method">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Region */}
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Select value={formData.region} onValueChange={(val) => setFormData({...formData, region: val})}>
                  <SelectTrigger data-testid="input-region">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Year Applicable */}
              <div className="space-y-2">
                <Label htmlFor="year_applicable">Year Applicable</Label>
                <Input
                  id="year_applicable"
                  type="number"
                  min="1990"
                  max="2100"
                  value={formData.year_applicable}
                  onChange={(e) => setFormData({...formData, year_applicable: e.target.value})}
                  placeholder="e.g., 2024"
                  data-testid="input-year"
                />
              </div>

              {/* Emission Factor */}
              <div className="space-y-2">
                <Label htmlFor="emission_factor">Emission Factor *</Label>
                <Input
                  id="emission_factor"
                  type="number"
                  step="any"
                  min="0"
                  value={formData.emission_factor}
                  onChange={(e) => setFormData({...formData, emission_factor: e.target.value})}
                  placeholder="e.g., 0.255"
                  required
                  data-testid="input-ef"
                />
              </div>

              {/* Unit */}
              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <Select value={formData.unit} onValueChange={(val) => setFormData({...formData, unit: val})}>
                  <SelectTrigger data-testid="input-unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {EF_UNITS.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Source */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  value={formData.source}
                  onChange={(e) => setFormData({...formData, source: e.target.value})}
                  placeholder="e.g., DEFRA 2024, EPA"
                  data-testid="input-source"
                />
              </div>

              {/* Notes */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Additional notes"
                  data-testid="input-notes"
                />
              </div>

              {/* References */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="references">References</Label>
                <Input
                  id="references"
                  value={formData.references}
                  onChange={(e) => setFormData({...formData, references: e.target.value})}
                  placeholder="Reference links or citations"
                  data-testid="input-references"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} data-testid="submit-scope3-ef">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingEntry ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this emission factor entry for "{entryToDelete?.activity}"? This action cannot be undone.
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
