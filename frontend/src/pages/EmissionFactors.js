import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Edit, Trash2, Flame, Search, Filter, Globe, Database, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Predefined categories and subcategories based on GHG Protocol
const EMISSION_CATEGORIES = {
  scope1: {
    'Stationary Combustion': ['Natural Gas', 'Diesel', 'Coal', 'LPG', 'Fuel Oil', 'Propane', 'Biomass'],
    'Mobile Combustion': ['Gasoline/Petrol', 'Diesel', 'CNG', 'LPG', 'Aviation Fuel', 'Marine Fuel'],
    'Fugitive Emissions': ['Refrigerants', 'SF6', 'Fire Suppressants', 'Natural Gas Leaks'],
    'Process Emissions': ['Chemical Processing', 'Metal Production', 'Cement Production']
  },
  scope2: {
    'Purchased Electricity': ['Grid Electricity', 'Renewable Electricity'],
    'Purchased Heat': ['District Heating', 'Steam'],
    'Purchased Cooling': ['District Cooling']
  },
  biogenic: {
    'Biofuels': ['Biodiesel', 'Bioethanol', 'Biogas'],
    'Biomass': ['Wood', 'Agricultural Residues', 'Organic Waste']
  }
};

// Common units for emission factors
const EMISSION_UNITS = [
  'kg CO2e/kWh',
  'kg CO2e/L',
  'kg CO2e/m³',
  'kg CO2e/kg',
  'kg CO2e/ton',
  'kg CO2e/GJ',
  'kg CO2e/MWh',
  'kg CO2e/gallon',
  'kg CO2e/unit'
];

// Common regions/countries
const REGIONS = [
  'Global (All Regions)',
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

export default function EmissionFactors() {
  const [factors, setFactors] = useState([]);
  const [defaultFactors, setDefaultFactors] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFactor, setEditingFactor] = useState(null);
  const [loading, setLoading] = useState(true);
  const { getAuthHeader } = useAuth();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterScope, setFilterScope] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterType, setFilterType] = useState('all'); // 'all', 'standard', 'default'

  const [formData, setFormData] = useState({
    name: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    factor: '',
    unit: '',
    source: '',
    references: '',
    region: 'Global (All Regions)'
  });

  const [customCategory, setCustomCategory] = useState('');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [showCustomSubCategory, setShowCustomSubCategory] = useState(false);
  const [showCustomUnit, setShowCustomUnit] = useState(false);

  useEffect(() => {
    fetchFactors();
  }, []);

  const fetchFactors = async () => {
    try {
      const [standardRes, defaultRes] = await Promise.all([
        axios.get(`${API}/emission-factors`, { headers: getAuthHeader() }),
        axios.get(`${API}/emission-factors/standard`)
      ]);
      setFactors(standardRes.data);
      setDefaultFactors(defaultRes.data);
    } catch (error) {
      console.error('Error fetching emission factors:', error);
      setFactors([]);
      setDefaultFactors({});
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.source) {
      toast.error('Source is required for emission factors');
      return;
    }
    
    if (!formData.references) {
      toast.error('References are required for emission factors');
      return;
    }

    // Use custom values if entered
    const finalCategory = showCustomCategory ? customCategory : formData.category;
    const finalSubCategory = showCustomSubCategory ? customSubCategory : formData.sub_category;
    const finalUnit = showCustomUnit ? customUnit : formData.unit;
    
    try {
      const payload = {
        ...formData,
        category: finalCategory,
        sub_category: finalSubCategory,
        unit: finalUnit,
        factor: parseFloat(formData.factor)
        // Note: is_custom is set by backend - Super Admin factors are always Standard (is_custom: false)
      };

      if (editingFactor) {
        await axios.put(
          `${API}/super-admin/emission-factors/${editingFactor.id}`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Standard emission factor updated');
      } else {
        await axios.post(
          `${API}/super-admin/emission-factors`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Standard emission factor created');
      }
      setDialogOpen(false);
      resetForm();
      fetchFactors();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this emission factor?')) return;
    try {
      await axios.delete(`${API}/super-admin/emission-factors/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Emission factor deleted');
      fetchFactors();
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const openEditDialog = (factor) => {
    setEditingFactor(factor);
    setShowCustomCategory(false);
    setShowCustomSubCategory(false);
    setShowCustomUnit(false);
    setCustomCategory('');
    setCustomSubCategory('');
    setCustomUnit('');
    setFormData({
      name: factor.name,
      scope: factor.scope,
      category: factor.category,
      sub_category: factor.sub_category,
      factor: factor.factor.toString(),
      unit: factor.unit,
      source: factor.source || '',
      references: factor.references || '',
      region: factor.region || 'Global (All Regions)'
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingFactor(null);
    setShowCustomCategory(false);
    setShowCustomSubCategory(false);
    setShowCustomUnit(false);
    setCustomCategory('');
    setCustomSubCategory('');
    setCustomUnit('');
    setFormData({
      name: '',
      scope: 'scope1',
      category: '',
      sub_category: '',
      factor: '',
      unit: '',
      source: '',
      references: '',
      region: 'Global (All Regions)'
    });
  };

  // Get categories for selected scope
  const availableCategories = useMemo(() => {
    return Object.keys(EMISSION_CATEGORIES[formData.scope] || {});
  }, [formData.scope]);

  // Get subcategories for selected category
  const availableSubcategories = useMemo(() => {
    return EMISSION_CATEGORIES[formData.scope]?.[formData.category] || [];
  }, [formData.scope, formData.category]);

  // Convert default factors to list format
  const defaultFactorsList = useMemo(() => {
    const allDefault = [];
    Object.entries(defaultFactors).forEach(([scope, categories]) => {
      Object.entries(categories).forEach(([category, subcategories]) => {
        Object.entries(subcategories).forEach(([subcat, data]) => {
          allDefault.push({
            id: `default-${scope}-${category}-${subcat}`,
            scope,
            category,
            sub_category: subcat,
            name: subcat,
            ...data,
            isDefault: true
          });
        });
      });
    });
    return allDefault;
  }, [defaultFactors]);

  // Combined list of all factors (standard from DB + default hardcoded)
  const allFactorsCombined = useMemo(() => {
    const standardFactors = factors.map(f => ({ ...f, isDefault: false }));
    return [...standardFactors, ...defaultFactorsList];
  }, [factors, defaultFactorsList]);

  // Filter combined factors
  const filteredFactors = useMemo(() => {
    return allFactorsCombined.filter(f => {
      const matchesSearch = !searchTerm || 
        f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.sub_category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.source?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesScope = filterScope === 'all' || f.scope === filterScope;
      const matchesCategory = filterCategory === 'all' || 
        f.category?.toLowerCase().replace(/_/g, ' ') === filterCategory.toLowerCase().replace(/_/g, ' ');
      const matchesRegion = filterRegion === 'all' || f.region === filterRegion || 
        (!f.region) || f.region === 'Global (All Regions)';
      const matchesType = filterType === 'all' || 
        (filterType === 'standard' && !f.isDefault) ||
        (filterType === 'default' && f.isDefault);
      return matchesSearch && matchesScope && matchesCategory && matchesRegion && matchesType;
    });
  }, [allFactorsCombined, searchTerm, filterScope, filterCategory, filterRegion, filterType]);

  // Get unique categories from current factors for filter dropdown
  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    factors.forEach(f => f.category && cats.add(f.category));
    defaultFactorsList.forEach(f => f.category && cats.add(f.category));
    return Array.from(cats).sort();
  }, [factors, defaultFactorsList]);

  // Get unique regions from custom factors
  const uniqueRegions = useMemo(() => {
    const regions = new Set(['Global (All Regions)']);
    factors.forEach(f => f.region && regions.add(f.region));
    return Array.from(regions).sort();
  }, [factors]);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Emission Factors</h1>
          <p className="text-text-secondary">Manage emission factors ({factors.length} standard, {defaultFactorsList.length} default)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-factor-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Standard Factor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingFactor ? 'Edit' : 'Add'} Standard Emission Factor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input 
                    value={formData.name} 
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                    required 
                    className="bg-stone-50"
                    data-testid="factor-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scope *</Label>
                  <select 
                    value={formData.scope} 
                    onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })} 
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3" 
                    required
                    data-testid="factor-scope-select"
                  >
                    <option value="scope1">Scope 1</option>
                    <option value="scope2">Scope 2</option>
                    <option value="biogenic">Biogenic</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <select 
                    value={showCustomCategory ? '__custom__' : formData.category} 
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setShowCustomCategory(true);
                        setFormData({ ...formData, category: '', sub_category: '' });
                      } else {
                        setShowCustomCategory(false);
                        setCustomCategory('');
                        setFormData({ ...formData, category: e.target.value, sub_category: '' });
                      }
                    }} 
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3" 
                    required={!showCustomCategory}
                    data-testid="factor-category-select"
                  >
                    <option value="">Select Category</option>
                    {availableCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__custom__">+ Custom Category</option>
                  </select>
                  {showCustomCategory && (
                    <Input 
                      placeholder="Enter custom category"
                      value={customCategory}
                      onChange={(e) => {
                        setCustomCategory(e.target.value);
                        setShowCustomCategory(true);
                      }}
                      className="bg-stone-50 mt-2"
                      required
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Sub-category *</Label>
                  <select 
                    value={showCustomSubCategory ? '__custom__' : formData.sub_category} 
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setShowCustomSubCategory(true);
                      } else {
                        setShowCustomSubCategory(false);
                        setFormData({ ...formData, sub_category: e.target.value });
                      }
                    }} 
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3" 
                    required={!showCustomSubCategory}
                    data-testid="factor-subcategory-select"
                  >
                    <option value="">Select Sub-category</option>
                    {availableSubcategories.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                    <option value="__custom__">+ Custom Sub-category</option>
                  </select>
                  {showCustomSubCategory && (
                    <Input 
                      placeholder="Enter custom sub-category"
                      value={customSubCategory}
                      onChange={(e) => setCustomSubCategory(e.target.value)}
                      className="bg-stone-50 mt-2"
                      required
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Factor Value *</Label>
                  <Input 
                    type="number" 
                    step="0.0001" 
                    value={formData.factor} 
                    onChange={(e) => setFormData({ ...formData, factor: e.target.value })} 
                    required 
                    className="bg-stone-50"
                    data-testid="factor-value-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit *</Label>
                  <select 
                    value={showCustomUnit ? '__custom__' : formData.unit} 
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setShowCustomUnit(true);
                      } else {
                        setShowCustomUnit(false);
                        setFormData({ ...formData, unit: e.target.value });
                      }
                    }} 
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3" 
                    required={!showCustomUnit}
                    data-testid="factor-unit-select"
                  >
                    <option value="">Select Unit</option>
                    {EMISSION_UNITS.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                    <option value="__custom__">+ Custom Unit</option>
                  </select>
                  {showCustomUnit && (
                    <Input 
                      placeholder="Enter custom unit (e.g., kg CO2e/unit)"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className="bg-stone-50 mt-2"
                      required
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Region/Country</Label>
                <select 
                  value={formData.region} 
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })} 
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  data-testid="factor-region-select"
                >
                  {REGIONS.map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
                <p className="text-xs text-text-muted">Select "Global (All Regions)" to apply this factor to all facilities</p>
              </div>

              <div className="space-y-2">
                <Label>Source * (Required for custom factors)</Label>
                <Input 
                  value={formData.source} 
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })} 
                  required 
                  placeholder="e.g., GHG Protocol, IPCC, Company study" 
                  className="bg-stone-50"
                  data-testid="factor-source-input"
                />
              </div>

              <div className="space-y-2">
                <Label>References *</Label>
                <textarea 
                  value={formData.references} 
                  onChange={(e) => setFormData({ ...formData, references: e.target.value })} 
                  rows={2} 
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2" 
                  placeholder="Links or detailed references (required)"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="submit-factor-btn">
                  {editingFactor ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-stone-200">
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'standard' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-text-muted hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('standard')}
          data-testid="tab-standard"
        >
          Standard Factors ({factors.length})
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'default' 
              ? 'text-primary border-b-2 border-primary' 
              : 'text-text-muted hover:text-text-primary'
          }`}
          onClick={() => setActiveTab('default')}
          data-testid="tab-default"
        >
          Default Factors ({defaultFactorsList.length})
        </button>
      </div>

      {/* Filters */}
      <Card className="p-4 border border-stone-200 rounded-xl bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              placeholder="Search factors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-stone-50"
              data-testid="filter-search"
            />
          </div>
          <select
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid="filter-scope"
          >
            <option value="all">All Scopes</option>
            <option value="scope1">Scope 1</option>
            <option value="scope2">Scope 2</option>
            <option value="biogenic">Biogenic</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid="filter-category"
          >
            <option value="all">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          {activeTab === 'standard' && (
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              data-testid="filter-region"
            >
              <option value="all">All Regions</option>
              {uniqueRegions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          )}
        </div>
      </Card>

      {/* Standard Factors (Super Admin Created) */}
      {activeTab === 'standard' && (
        <div className="space-y-4">
          {filteredStandardFactors.map((factor) => (
            <Card key={factor.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`standard-factor-${factor.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div className="bg-primary/10 p-2 rounded-lg"><Flame className="w-5 h-5 text-primary" /></div>
                    <h3 className="text-lg font-heading font-bold text-text-primary">{factor.name}</h3>
                    <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">Standard</span>
                    <span className="px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full capitalize">{factor.scope}</span>
                    {factor.region && factor.region !== 'Global (All Regions)' && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {factor.region}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                    <div><p className="text-xs text-text-muted mb-1">Category</p><p className="text-sm font-medium text-text-primary">{factor.category}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Sub-category</p><p className="text-sm font-medium text-text-primary">{factor.sub_category}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Factor</p><p className="text-sm font-medium text-text-primary">{factor.factor}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Unit</p><p className="text-sm font-medium text-text-primary">{factor.unit}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Source</p><p className="text-sm font-medium text-text-primary">{factor.source || 'N/A'}</p></div>
                  </div>
                  {factor.references && (
                    <div className="mt-2">
                      <p className="text-xs text-text-muted mb-1">References</p>
                      <p className="text-sm text-text-secondary">{factor.references}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openEditDialog(factor)} data-testid={`edit-factor-${factor.id}`}><Edit className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(factor.id)} className="text-accent" data-testid={`delete-factor-${factor.id}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
          {filteredStandardFactors.length === 0 && factors.length > 0 && (
            <div className="text-center py-8 bg-stone-50 rounded-lg">
              <Search className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-muted">No standard factors match your filters</p>
            </div>
          )}
          {factors.length === 0 && (
            <div className="text-center py-8 bg-stone-50 rounded-lg">
              <Flame className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-muted">No standard emission factors yet. Click "Add Standard Factor" to create one.</p>
            </div>
          )}
        </div>
      )}

      {/* Default Factors (Hardcoded from GHG Protocol) */}
      {activeTab === 'default' && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p className="font-medium">Note:</p>
            <p>Default factors are from GHG Protocol, IPCC, and other authoritative sources. To modify these, create a new Standard Factor with the same category/sub-category.</p>
          </div>
          {filteredDefaultFactors.map((factor) => (
            <Card key={factor.id} className="p-6 border border-stone-200 rounded-xl bg-white" data-testid={`default-factor-${factor.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div className="bg-stone-100 p-2 rounded-lg"><Flame className="w-5 h-5 text-stone-500" /></div>
                    <h3 className="text-lg font-heading font-bold text-text-primary capitalize">{factor.sub_category.replace(/_/g, ' ')}</h3>
                    <span className="px-3 py-1 bg-stone-100 text-stone-600 text-xs font-medium rounded-full">Default</span>
                    <span className="px-3 py-1 bg-secondary/10 text-secondary text-xs font-medium rounded-full capitalize">{factor.scope}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                    <div><p className="text-xs text-text-muted mb-1">Category</p><p className="text-sm font-medium text-text-primary capitalize">{factor.category.replace(/_/g, ' ')}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Sub-category</p><p className="text-sm font-medium text-text-primary capitalize">{factor.sub_category.replace(/_/g, ' ')}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Factor</p><p className="text-sm font-medium text-text-primary">{factor.factor}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Unit</p><p className="text-sm font-medium text-text-primary">{factor.unit}</p></div>
                    <div><p className="text-xs text-text-muted mb-1">Source</p><p className="text-sm font-medium text-text-primary">{factor.source}</p></div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {filteredDefaultFactors.length === 0 && defaultFactorsList.length > 0 && (
            <div className="text-center py-8 bg-stone-50 rounded-lg">
              <Search className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-muted">No default factors match your filters</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
