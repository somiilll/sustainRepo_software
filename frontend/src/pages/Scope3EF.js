import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Edit, Trash2, Search, Filter, Loader2, FileSpreadsheet, Eye, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Regions (same as Fuel Database)
const REGIONS = [
  'Global',
  'Australia',
  'Belgium',
  'Brazil',
  'Canada',
  'Chile',
  'China',
  'Colombia',
  'Costa Rica',
  'Egypt',
  'European Union',
  'France',
  'Germany',
  'Hong Kong, China',
  'India',
  'Indonesia',
  'Italy',
  'Japan',
  'Jordan',
  'Korea',
  'Malaysia',
  'Maldives',
  'Mexico',
  'Netherlands',
  'Oman',
  'Philippines',
  'Portugal',
  'Qatar',
  'Russian Federation',
  'Saudi Arabia',
  'Singapore',
  'South Africa',
  'Spain',
  'Switzerland',
  'Thailand',
  'Turkey',
  'UK (London)',
  'UK (non-London)',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Vietnam',
  'Other'
];

// Method options - display labels map to backend values
const METHODS = [
  { value: 'spend_basis', label: 'Spend Based' },
  { value: 'activity_basis', label: 'Activity Based' }
];

// Note: Industry sectors and units are fetched dynamically from the backend

// Helper to get method display label
const getMethodLabel = (value) => {
  const method = METHODS.find(m => m.value === value);
  return method ? method.label : value;
};

export default function Scope3EF() {
  const { user, getAuthHeader } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterScope, setFilterScope] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [pageSize] = useState(50);
  
  // Dynamic scopes and categories from backend
  const [scopes, setScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Dynamic sectors and compound units from backend
  const [industrySectors, setIndustrySectors] = useState([]);
  const [compoundUnits, setCompoundUnits] = useState([]);
  const [simpleUnits, setSimpleUnits] = useState({ mass: [], volume: [], energy: [], other: [] });

  const [formData, setFormData] = useState({
    scope: '',
    category: '',
    activity: '',
    activity_type: '',  // Activity type for C6/C7 (e.g., "hotel_stay", "air_travel")
    subcategory: '',  // Subcategory for C8/C10/C11/C13/C14 (e.g., "stationary_combustion", "mobile_combustion")
    sub_scope: '',  // Sub-scope for fuel type (e.g., "biogenic", "fossil")
    method: '',
    industry_sectors: [],
    region: 'Global',
    year_applicable: '',
    emission_factor: '',
    unit: '',
    allowed_units: [],
    default_unit: '',  // Default unit for activity value - auto-converts user input to this
    source: '',
    notes: '',
    references: ''
  });

  const isSuperAdmin = user?.role === 'superadmin' || user?.role === 'super_admin';

  useEffect(() => {
    fetchEntries();
    fetchScopesAndCategories();
    fetchSectorsAndUnits();
  }, []);

  const fetchSectorsAndUnits = async () => {
    try {
      // Fetch sectors from the Sectors module
      const sectorsRes = await axios.get(`${API}/sectors`, {
        headers: getAuthHeader()
      });
      setIndustrySectors((sectorsRes.data || []).map(s => s.name));
      
      // Fetch both simple and compound units from CalcEngine Units module
      const unitsRes = await axios.get(`${API}/calc-engine/units`, {
        headers: getAuthHeader()
      });
      // Combine simple units (e.g., kg, L, kWh) and compound units (e.g., kgCO2e/kg, kgCO2e/INR)
      const simpleUnitKeys = (unitsRes.data?.simple || []).map(u => u.key);
      const compoundUnitKeys = (unitsRes.data?.compound || []).map(u => u.key);
      setCompoundUnits([...compoundUnitKeys, ...simpleUnitKeys]);
      
      // Fetch simple units grouped by type for allowed_units selection
      const simpleUnitsRes = await axios.get(`${API}/units`, {
        headers: getAuthHeader()
      });
      const allSimpleUnits = simpleUnitsRes.data || [];
      setSimpleUnits({
        mass: allSimpleUnits.filter(u => u.unit_type === 'mass'),
        volume: allSimpleUnits.filter(u => u.unit_type === 'volume'),
        energy: allSimpleUnits.filter(u => u.unit_type === 'energy'),
        other: allSimpleUnits.filter(u => !['mass', 'volume', 'energy'].includes(u.unit_type))
      });
    } catch (error) {
      console.error('Failed to fetch sectors/units:', error);
    }
  };

  const fetchScopesAndCategories = async () => {
    try {
      // Fetch scopes
      const scopesRes = await axios.get(`${API}/scopes`, {
        headers: getAuthHeader()
      });
      setScopes(scopesRes.data || []);
      
      // Fetch categories
      const categoriesRes = await axios.get(`${API}/categories`, {
        headers: getAuthHeader()
      });
      setCategories(categoriesRes.data || []);
    } catch (error) {
      console.error('Failed to fetch scopes/categories:', error);
    }
  };

  const fetchEntries = async (page = 1) => {
    try {
      setLoading(true);
      const endpoint = isSuperAdmin ? '/super-admin/scope3-ef' : '/scope3-ef';
      
      // Build query params for server-side filtering
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', pageSize.toString());
      
      if (searchTerm) params.append('search', searchTerm);
      if (filterCategory) params.append('category', filterCategory);
      if (filterMethod) params.append('method', filterMethod);
      if (filterRegion) params.append('region', filterRegion);
      if (filterYear) params.append('year', filterYear);
      if (filterSource) params.append('source', filterSource);
      
      const response = await axios.get(`${API}${endpoint}?${params.toString()}`, {
        headers: getAuthHeader()
      });
      
      // Handle paginated response
      if (response.data.data) {
        setEntries(response.data.data);
        setTotalPages(response.data.total_pages);
        setTotalEntries(response.data.total);
        setCurrentPage(response.data.page);
      } else {
        // Fallback for non-paginated response
        setEntries(response.data);
        setTotalPages(1);
        setTotalEntries(response.data.length);
      }
    } catch (error) {
      toast.error('Failed to fetch Scope 3 emission factors');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  
  // Refetch when filters change
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchEntries(1); // Reset to page 1 when filters change
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm, filterCategory, filterMethod, filterRegion, filterYear, filterSource]);

  // Get categories for a specific scope
  const getCategoriesForScope = (scopeId) => {
    return categories.filter(cat => cat.scope_id === scopeId && cat.is_active !== false);
  };

  // Get scope name by code or id
  const getScopeName = (scopeCode) => {
    const scope = scopes.find(s => s.code === scopeCode || s.id === scopeCode || s.name === scopeCode);
    return scope?.name || scopeCode;
  };

  // Get scope by code or name
  const getScopeByCode = (codeOrName) => {
    if (!codeOrName) return null;
    return scopes.find(s => 
      s.code === codeOrName || 
      s.name === codeOrName || 
      s.id === codeOrName
    );
  };

  const resetForm = () => {
    setFormData({
      scope: '',
      category: '',
      activity: '',
      activity_type: '',
      subcategory: '',
      sub_scope: '',
      method: '',
      industry_sectors: [],
      region: 'Global',
      year_applicable: '',
      emission_factor: '',
      unit: '',
      allowed_units: [],
      default_unit: '',
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
        activity_type: entry.activity_type || '',
        subcategory: entry.subcategory || '',
        sub_scope: entry.sub_scope || '',
        method: entry.method || '',
        industry_sectors: entry.industry_sectors || [],
        region: entry.region || 'Global',
        year_applicable: entry.year_applicable?.toString() || '',
        emission_factor: entry.emission_factor?.toString() || '',
        unit: entry.unit || '',
        allowed_units: entry.allowed_units || [],
        default_unit: entry.default_unit || '',
        source: entry.source || '',
        notes: entry.notes || '',
        references: entry.references || ''
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleViewEntry = (entry) => {
    setViewEntry(entry);
    setViewDialogOpen(true);
  };

  const handleScopeChange = (scopeValue) => {
    // Find scope by name (since dropdown uses scope.name as value)
    const scope = scopes.find(s => s.name === scopeValue || s.code === scopeValue);
    if (!scope) {
      console.log('handleScopeChange: Scope not found for', scopeValue);
      setFormData({...formData, scope: scopeValue, category: ''});
      return;
    }
    
    // Get categories for this scope
    const scopeCategories = categories.filter(cat => 
      cat.scope_id === scope.id && cat.is_active !== false
    );
    console.log('handleScopeChange: Scope', scopeValue, 'has', scopeCategories.length, 'categories');
    
    // Auto-select first category if available
    setFormData({
      ...formData, 
      scope: scopeValue,
      category: scopeCategories.length > 0 ? scopeCategories[0].name : ''
    });
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
        region: formData.region || 'Global',
        industry_sectors: formData.industry_sectors || [],
        default_unit: formData.default_unit || null
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
      fetchEntries(currentPage); // Refresh current page
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
      fetchEntries(currentPage); // Refresh current page
    } catch (error) {
      toast.error('Failed to delete entry');
    }
  };

  // Toggle industry selection
  const toggleIndustry = (industry) => {
    setFormData(prev => ({
      ...prev,
      industry_sectors: prev.industry_sectors.includes(industry)
        ? prev.industry_sectors.filter(i => i !== industry)
        : [...prev.industry_sectors, industry]
    }));
  };

  // Get categories for the selected scope in form
  const formScopeCategories = useMemo(() => {
    if (!formData.scope || scopes.length === 0) return [];
    
    // Find scope by code, name, or id
    const scope = scopes.find(s => 
      s.code === formData.scope || 
      s.name === formData.scope || 
      s.id === formData.scope
    );
    if (!scope) {
      console.log('Scope not found for:', formData.scope, 'Available scopes:', scopes.map(s => s.name));
      return [];
    }
    
    // Get categories for this scope - check for is_active !== false (handles undefined/null)
    const scopeCategories = categories.filter(cat => 
      cat.scope_id === scope.id && cat.is_active !== false
    );
    console.log('Scope selected:', formData.scope, 'Found scope ID:', scope.id, 'Categories found:', scopeCategories.length);
    return scopeCategories;
  }, [formData.scope, scopes, categories]);

  // Filter entries
  // Since filtering is now done server-side, filteredEntries is just entries
  const filteredEntries = entries;

  // Get unique values for filter dropdowns - these need to be fetched separately or from initial load
  // For now, we'll keep them from current page (user can still type custom values)
  const uniqueCategories = useMemo(() => {
    const cats = [...new Set(entries.map(e => e.category).filter(Boolean))];
    return cats.sort();
  }, [entries]);

  const uniqueYears = useMemo(() => {
    const years = [...new Set(entries.map(e => e.year_applicable).filter(Boolean))];
    return years.sort((a, b) => b - a); // Sort descending
  }, [entries]);

  const uniqueSources = useMemo(() => {
    const sources = [...new Set(entries.map(e => e.source).filter(Boolean))];
    return sources.sort();
  }, [entries]);

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
                placeholder="Search by activity, category, source, industry..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="search-scope3-ef"
              />
            </div>
          </div>
          <Select value={filterScope || "all"} onValueChange={(val) => setFilterScope(val === "all" ? "" : val)}>
            <SelectTrigger className="w-[150px]" data-testid="filter-scope">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Scopes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scopes</SelectItem>
              {scopes.filter(s => s.is_active).map(scope => (
                <SelectItem key={scope.id} value={scope.name}>{scope.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCategory || "all"} onValueChange={(val) => setFilterCategory(val === "all" ? "" : val)}>
            <SelectTrigger className="w-[200px]" data-testid="filter-category">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
          <Select value={filterYear || "all"} onValueChange={(val) => setFilterYear(val === "all" ? "" : val)}>
            <SelectTrigger className="w-[130px]" data-testid="filter-year">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {uniqueYears.map(year => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSource || "all"} onValueChange={(val) => setFilterSource(val === "all" ? "" : val)}>
            <SelectTrigger className="w-[150px]" data-testid="filter-source">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {uniqueSources.map(source => (
                <SelectItem key={source} value={source}>{source}</SelectItem>
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
                <th className="text-left p-4 font-medium text-text-secondary">Activity Type</th>
                <th className="text-left p-4 font-medium text-text-secondary">Subcategory</th>
                <th className="text-left p-4 font-medium text-text-secondary">Sub Scope</th>
                <th className="text-left p-4 font-medium text-text-secondary">Industry</th>
                <th className="text-left p-4 font-medium text-text-secondary">Method</th>
                <th className="text-left p-4 font-medium text-text-secondary">Region</th>
                <th className="text-left p-4 font-medium text-text-secondary">Year</th>
                <th className="text-right p-4 font-medium text-text-secondary">EF</th>
                <th className="text-left p-4 font-medium text-text-secondary">Unit</th>
                <th className="text-right p-4 font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-text-muted">
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
                    <td className="p-4 text-sm max-w-[120px] truncate" title={entry.category}>{entry.category}</td>
                    <td className="p-4 font-medium max-w-[150px] truncate" title={entry.activity}>{entry.activity}</td>
                    <td className="p-4 text-sm text-text-secondary">{entry.activity_type || '-'}</td>
                    <td className="p-4 text-sm text-text-secondary">{entry.subcategory || '-'}</td>
                    <td className="p-4 text-sm text-text-secondary">{entry.sub_scope || '-'}</td>
                    <td className="p-4 text-sm">
                      {entry.industry_sectors?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {entry.industry_sectors.slice(0, 2).map((ind, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">
                              {ind}
                            </span>
                          ))}
                          {entry.industry_sectors.length > 2 && (
                            <span className="px-1.5 py-0.5 bg-stone-200 text-stone-600 rounded text-xs">
                              +{entry.industry_sectors.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.method === 'spend_basis' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {getMethodLabel(entry.method)}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-secondary">{entry.region}</td>
                    <td className="p-4 text-sm text-text-secondary">{entry.year_applicable || '-'}</td>
                    <td className="p-4 text-right font-mono">{entry.emission_factor}</td>
                    <td className="p-4 text-sm text-text-secondary">{entry.unit}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewEntry(entry)}
                          title="View details"
                          data-testid={`view-scope3-ef-${entry.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {isSuperAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDialog(entry)}
                              title="Edit"
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
                              title="Delete"
                              data-testid={`delete-scope3-ef-${entry.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            Showing {filteredEntries.length} of {totalEntries} entries
          </p>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchEntries(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
              >
                Previous
              </Button>
              <span className="text-sm text-text-secondary px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchEntries(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Entry Details</DialogTitle>
          </DialogHeader>
          {viewEntry && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-text-muted text-xs">Scope</Label>
                  <p className="font-medium">{viewEntry.scope}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Category</Label>
                  <p className="font-medium">{viewEntry.category}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-text-muted text-xs">Activity</Label>
                  <p className="font-medium">{viewEntry.activity}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Activity Type</Label>
                  <p className="font-medium">{viewEntry.activity_type || <span className="text-text-muted">-</span>}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Subcategory</Label>
                  <p className="font-medium">{viewEntry.subcategory || <span className="text-text-muted">-</span>}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Sub Scope</Label>
                  <p className="font-medium">{viewEntry.sub_scope || <span className="text-text-muted">-</span>}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Method</Label>
                  <p className="font-medium">{getMethodLabel(viewEntry.method)}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Region</Label>
                  <p className="font-medium">{viewEntry.region}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Year Applicable</Label>
                  <p className="font-medium">{viewEntry.year_applicable || '-'}</p>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Emission Factor</Label>
                  <p className="font-medium font-mono">{viewEntry.emission_factor} {viewEntry.unit}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-text-muted text-xs">Industry Sectors</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {viewEntry.industry_sectors?.length > 0 ? (
                      viewEntry.industry_sectors.map((ind, idx) => (
                        <span key={idx} className="px-2 py-1 bg-stone-100 text-stone-700 rounded text-sm">
                          {ind}
                        </span>
                      ))
                    ) : (
                      <span className="text-text-muted">None specified</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="text-text-muted text-xs">Allowed Input Units</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {viewEntry.allowed_units?.length > 0 ? (
                      viewEntry.allowed_units.map((u, idx) => (
                        <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                          {u}
                        </span>
                      ))
                    ) : (
                      <span className="text-text-muted">None specified</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-text-muted text-xs">Default Unit (Auto-convert to)</Label>
                  <p className="font-medium">{viewEntry.default_unit || <span className="text-text-muted">Not set</span>}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-text-muted text-xs">Source</Label>
                  <p className="font-medium">{viewEntry.source || '-'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-text-muted text-xs">Notes</Label>
                  <p className="font-medium">{viewEntry.notes || '-'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-text-muted text-xs">References</Label>
                  <p className="font-medium">{viewEntry.references || '-'}</p>
                </div>
              </div>
              <div className="pt-4 border-t text-xs text-text-muted">
                <p>Created: {viewEntry.created_at ? new Date(viewEntry.created_at).toLocaleString() : '-'}</p>
                {viewEntry.updated_at && <p>Updated: {new Date(viewEntry.updated_at).toLocaleString()}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Entry' : 'Add New Entry'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Scope - Dynamic from backend */}
              <div className="space-y-2">
                <Label htmlFor="scope">Scope *</Label>
                <Select value={formData.scope} onValueChange={handleScopeChange}>
                  <SelectTrigger data-testid="input-scope">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopes.filter(s => s.is_active).map(scope => (
                      <SelectItem key={scope.id} value={scope.name}>{scope.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category - Dynamic based on selected scope */}
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(val) => setFormData({...formData, category: val})}
                  disabled={!formData.scope}
                >
                  <SelectTrigger data-testid="input-category">
                    <SelectValue placeholder={formData.scope ? "Select category" : "Select scope first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {formScopeCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                    {formScopeCategories.length === 0 && formData.scope && (
                      <SelectItem value="__none" disabled>No categories defined for this scope</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {formScopeCategories.length === 0 && formData.scope && (
                  <p className="text-xs text-amber-600">No categories defined. You can type a custom category below.</p>
                )}
                {/* Allow custom category if none defined */}
                {formScopeCategories.length === 0 && formData.scope && (
                  <Input
                    placeholder="Enter custom category"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="mt-2"
                  />
                )}
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

              {/* Activity Type (Optional - for C6/C7) */}
              <div className="space-y-2">
                <Label htmlFor="activity_type">Activity Type <span className="text-text-muted text-xs">(Optional)</span></Label>
                <Input
                  id="activity_type"
                  value={formData.activity_type}
                  onChange={(e) => setFormData({...formData, activity_type: e.target.value})}
                  placeholder="e.g., hotel_stay, air_travel"
                  data-testid="input-activity-type"
                />
              </div>

              {/* Subcategory (Optional - for C8/C10/C11/C13/C14) */}
              <div className="space-y-2">
                <Label htmlFor="subcategory">Subcategory <span className="text-text-muted text-xs">(C8/C10/C11/C13/C14)</span></Label>
                <Select value={formData.subcategory} onValueChange={(val) => setFormData({...formData, subcategory: val === 'none' ? '' : val})}>
                  <SelectTrigger data-testid="input-subcategory">
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Stationary & Mobile only)</SelectItem>
                    <SelectItem value="stationary_combustion">Stationary Combustion</SelectItem>
                    <SelectItem value="mobile_combustion">Mobile Combustion</SelectItem>
                    <SelectItem value="energy">Energy</SelectItem>
                    <SelectItem value="process_emissions">Process Emissions</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-text-muted">Note: "None" applies to Stationary & Mobile Combustion only</p>
              </div>

              {/* Sub Scope (Fuel Type) */}
              <div className="space-y-2">
                <Label htmlFor="sub_scope">Sub Scope <span className="text-text-muted text-xs">(Fuel Type)</span></Label>
                <Select value={formData.sub_scope} onValueChange={(val) => setFormData({...formData, sub_scope: val === 'none' ? '' : val})}>
                  <SelectTrigger data-testid="input-sub-scope">
                    <SelectValue placeholder="Select sub scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="biogenic">Biogenic</SelectItem>
                    <SelectItem value="fossil">Fossil</SelectItem>
                  </SelectContent>
                </Select>
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

              {/* Industry Sectors (Multi-select) - Dynamic from Sectors module */}
              <div className="space-y-2 col-span-2">
                <Label>Industry Sectors</Label>
                <div className="border rounded-md p-3 max-h-[150px] overflow-y-auto">
                  {industrySectors.length === 0 ? (
                    <p className="text-sm text-text-muted">No sectors defined. Add sectors in the Sectors module.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {industrySectors.map((industry) => (
                        <button
                          key={industry}
                          type="button"
                          onClick={() => toggleIndustry(industry)}
                          className={`px-3 py-1 rounded-full text-sm transition-colors ${
                            formData.industry_sectors.includes(industry)
                              ? 'bg-primary text-white'
                              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                          }`}
                        >
                          {industry}
                          {formData.industry_sectors.includes(industry) && (
                            <X className="w-3 h-3 ml-1 inline" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {formData.industry_sectors.length > 0 && (
                  <p className="text-xs text-text-muted">
                    Selected: {formData.industry_sectors.join(', ')}
                  </p>
                )}
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

              {/* Unit - Dynamic from CalcEngine compound units */}
              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <Select value={formData.unit} onValueChange={(val) => setFormData({...formData, unit: val})}>
                  <SelectTrigger data-testid="input-unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {compoundUnits.length === 0 ? (
                      <SelectItem value="__none" disabled>No units defined. Add compound units in Calc Engine Units.</SelectItem>
                    ) : (
                      compoundUnits.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {compoundUnits.length === 0 && (
                  <p className="text-xs text-amber-600">Define compound units (e.g., kgCO2e/INR) in the Calc Engine Units module.</p>
                )}
              </div>

              {/* Allowed Units for Input */}
              <div className="space-y-2 col-span-2">
                <Label>Allowed Input Units</Label>
                <p className="text-xs text-text-muted">Select which units users can use when entering data for this activity</p>
                <div className="grid grid-cols-3 gap-3">
                  {/* Mass Units */}
                  <div className="space-y-2">
                    <Label className="text-xs text-blue-600">Mass Units</Label>
                    <div className="space-y-1 p-2 bg-blue-50 rounded border border-blue-200 max-h-32 overflow-y-auto">
                      {simpleUnits.mass.length === 0 ? (
                        <p className="text-xs text-text-muted">No mass units defined</p>
                      ) : (
                        simpleUnits.mass.map(unit => (
                          <label key={unit.symbol} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={formData.allowed_units?.includes(unit.symbol) || false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setFormData(prev => ({
                                  ...prev,
                                  allowed_units: checked
                                    ? [...(prev.allowed_units || []), unit.symbol]
                                    : (prev.allowed_units || []).filter(u => u !== unit.symbol)
                                }));
                              }}
                              className="rounded text-blue-600"
                            />
                            {unit.name} ({unit.symbol})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Volume Units */}
                  <div className="space-y-2">
                    <Label className="text-xs text-green-600">Volume Units</Label>
                    <div className="space-y-1 p-2 bg-green-50 rounded border border-green-200 max-h-32 overflow-y-auto">
                      {simpleUnits.volume.length === 0 ? (
                        <p className="text-xs text-text-muted">No volume units defined</p>
                      ) : (
                        simpleUnits.volume.map(unit => (
                          <label key={unit.symbol} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={formData.allowed_units?.includes(unit.symbol) || false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setFormData(prev => ({
                                  ...prev,
                                  allowed_units: checked
                                    ? [...(prev.allowed_units || []), unit.symbol]
                                    : (prev.allowed_units || []).filter(u => u !== unit.symbol)
                                }));
                              }}
                              className="rounded text-green-600"
                            />
                            {unit.name} ({unit.symbol})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Energy Units */}
                  <div className="space-y-2">
                    <Label className="text-xs text-amber-600">Energy Units</Label>
                    <div className="space-y-1 p-2 bg-amber-50 rounded border border-amber-200 max-h-32 overflow-y-auto">
                      {simpleUnits.energy.length === 0 ? (
                        <p className="text-xs text-text-muted">No energy units defined</p>
                      ) : (
                        simpleUnits.energy.map(unit => (
                          <label key={unit.symbol} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={formData.allowed_units?.includes(unit.symbol) || false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setFormData(prev => ({
                                  ...prev,
                                  allowed_units: checked
                                    ? [...(prev.allowed_units || []), unit.symbol]
                                    : (prev.allowed_units || []).filter(u => u !== unit.symbol)
                                }));
                              }}
                              className="rounded text-amber-600"
                            />
                            {unit.name} ({unit.symbol})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Other/Custom Unit Types */}
                {simpleUnits.other.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <Label className="text-xs text-purple-600">Other Units</Label>
                    <div className="flex flex-wrap gap-2 p-2 bg-purple-50 rounded border border-purple-200">
                      {simpleUnits.other.map(unit => (
                        <label key={unit.symbol} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={formData.allowed_units?.includes(unit.symbol) || false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormData(prev => ({
                                ...prev,
                                allowed_units: checked
                                  ? [...(prev.allowed_units || []), unit.symbol]
                                  : (prev.allowed_units || []).filter(u => u !== unit.symbol)
                              }));
                            }}
                            className="rounded text-purple-600"
                          />
                          {unit.name} ({unit.symbol})
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {formData.allowed_units?.length > 0 && (
                  <p className="text-xs text-green-600">
                    Selected: {formData.allowed_units.join(', ')}
                  </p>
                )}
              </div>

              {/* Default Unit - Auto-conversion target */}
              <div className="space-y-2 col-span-2">
                <Label>Default Unit (Auto-conversion Target)</Label>
                <p className="text-xs text-text-muted">
                  When a user enters activity data, it will be automatically converted to this unit during calculation. 
                  Leave empty to use the formula's expected unit.
                </p>
                {formData.allowed_units?.length > 0 ? (
                  <Select 
                    value={formData.default_unit || ''} 
                    onValueChange={(val) => setFormData({...formData, default_unit: val === '__none' ? '' : val})}
                  >
                    <SelectTrigger data-testid="input-default-unit">
                      <SelectValue placeholder="Select default unit (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None (use formula's expected unit)</SelectItem>
                      {formData.allowed_units.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-600 p-2 bg-amber-50 rounded border border-amber-200">
                    Select allowed units first to choose a default unit
                  </p>
                )}
                {formData.default_unit && (
                  <p className="text-xs text-blue-600">
                    User inputs will be converted to: <strong>{formData.default_unit}</strong>
                  </p>
                )}
              </div>

              {/* Source */}
              <div className="space-y-2">
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
