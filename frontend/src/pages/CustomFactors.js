import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Edit, Trash2, Fuel, Search, Database, Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Predefined categories and subcategories based on GHG Protocol
const EMISSION_CATEGORIES = {
  scope1: {
    'Stationary Combustion': ['Natural Gas', 'Diesel', 'Coal', 'LPG', 'Fuel Oil', 'Propane', 'Biomass', 'Kerosene', 'Petroleum Coke'],
    'Mobile Combustion': ['Gasoline/Petrol', 'Diesel', 'CNG', 'LNG', 'Aviation Fuel', 'Marine Fuel', 'Ethanol', 'Biodiesel'],
    'Fugitive Emissions': ['Refrigerants (HFC)', 'SF6', 'Fire Suppressants', 'Methane', 'Nitrous Oxide'],
    'Process Emissions': ['Cement Production', 'Lime Production', 'Iron & Steel', 'Aluminum', 'Ammonia', 'Glass']
  },
  scope2: {
    'Purchased Electricity': ['Grid Electricity', 'Renewable Electricity', 'Nuclear'],
    'Purchased Heat/Steam': ['Steam from Natural Gas', 'Steam from Coal', 'District Heating'],
    'Purchased Cooling': ['District Cooling']
  },
  biogenic: {
    'Biofuels': ['Biodiesel', 'Bioethanol', 'Biogas', 'Bio-LPG'],
    'Biomass Combustion': ['Wood/Wood Waste', 'Agricultural Residues', 'Animal Waste', 'Food Waste']
  }
};

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

export default function CustomFactors() {
  const [customFactors, setCustomFactors] = useState([]);
  const [standardFactors, setStandardFactors] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFactor, setEditingFactor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterScope, setFilterScope] = useState('all');
  const [showStandard, setShowStandard] = useState(false);
  const { getAuthHeader, user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    factor: '',
    unit: '',
    source: '',
    references: '',
    region: 'Global (All Regions)',
    justification: ''
  });

  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [showCustomSubCategory, setShowCustomSubCategory] = useState(false);
  const [showCustomUnit, setShowCustomUnit] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [customUnit, setCustomUnit] = useState('');

  useEffect(() => {
    fetchFactors();
  }, []);

  const fetchFactors = async () => {
    try {
      const response = await axios.get(`${API}/emission-factors`, { headers: getAuthHeader() });
      const allFactors = response.data;
      // Separate custom and standard factors
      setCustomFactors(allFactors.filter(f => f.is_custom === true));
      setStandardFactors(allFactors.filter(f => f.is_custom === false));
    } catch (error) {
      console.error('Error fetching emission factors:', error);
      setCustomFactors([]);
      setStandardFactors([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.source) {
      toast.error('Source is required');
      return;
    }
    
    if (!formData.justification) {
      toast.error('Justification is required for custom emission factors');
      return;
    }

    const finalCategory = showCustomCategory ? customCategory : formData.category;
    const finalSubCategory = showCustomSubCategory ? customSubCategory : formData.sub_category;
    const finalUnit = showCustomUnit ? customUnit : formData.unit;
    
    try {
      const payload = {
        ...formData,
        category: finalCategory,
        sub_category: finalSubCategory,
        unit: finalUnit,
        factor: parseFloat(formData.factor),
        is_custom: true
      };

      if (editingFactor) {
        await axios.put(
          `${API}/custom-emission-factors/${editingFactor.id}`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Custom emission factor updated');
      } else {
        await axios.post(
          `${API}/custom-emission-factors`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Custom emission factor created');
      }
      setDialogOpen(false);
      resetForm();
      fetchFactors();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this custom emission factor?')) return;
    try {
      await axios.delete(`${API}/custom-emission-factors/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Custom emission factor deleted');
      fetchFactors();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
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
      region: factor.region || 'Global (All Regions)',
      justification: factor.justification || ''
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
      region: 'Global (All Regions)',
      justification: ''
    });
  };

  const availableCategories = useMemo(() => {
    return Object.keys(EMISSION_CATEGORIES[formData.scope] || {});
  }, [formData.scope]);

  const availableSubcategories = useMemo(() => {
    return EMISSION_CATEGORIES[formData.scope]?.[formData.category] || [];
  }, [formData.scope, formData.category]);

  const filteredCustomFactors = useMemo(() => {
    return customFactors.filter(f => {
      const matchesSearch = !searchTerm || 
        f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.sub_category?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesScope = filterScope === 'all' || f.scope === filterScope;
      return matchesSearch && matchesScope;
    });
  }, [customFactors, searchTerm, filterScope]);

  const filteredStandardFactors = useMemo(() => {
    return standardFactors.filter(f => {
      const matchesSearch = !searchTerm || 
        f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.sub_category?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesScope = filterScope === 'all' || f.scope === filterScope;
      return matchesSearch && matchesScope;
    });
  }, [standardFactors, searchTerm, filterScope]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="custom-factors-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Custom Emission Factors</h1>
          <p className="text-text-secondary">Add custom fuel types and emission factors for your organization</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-custom-factor-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Custom Factor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingFactor ? 'Edit' : 'Add'} Custom Emission Factor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="custom-factor-form">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Factor Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Custom Diesel Factor"
                    className="bg-stone-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scope">Scope *</Label>
                  <select
                    id="scope"
                    value={formData.scope}
                    onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  >
                    <option value="scope1">Scope 1</option>
                    <option value="scope2">Scope 2</option>
                    <option value="biogenic">Biogenic</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  {!showCustomCategory ? (
                    <div className="space-y-1">
                      <select
                        id="category"
                        value={formData.category}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setShowCustomCategory(true);
                            setFormData({ ...formData, category: '', sub_category: '' });
                          } else {
                            setFormData({ ...formData, category: e.target.value, sub_category: '' });
                          }
                        }}
                        required={!showCustomCategory}
                        className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      >
                        <option value="">Select Category</option>
                        {availableCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="__custom__">+ Custom Category</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="Enter custom category"
                        required
                        className="bg-stone-50"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => { setShowCustomCategory(false); setCustomCategory(''); }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sub_category">Sub-category / Fuel Type *</Label>
                  {!showCustomSubCategory ? (
                    <div className="space-y-1">
                      <select
                        id="sub_category"
                        value={formData.sub_category}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setShowCustomSubCategory(true);
                            setFormData({ ...formData, sub_category: '' });
                          } else {
                            setFormData({ ...formData, sub_category: e.target.value });
                          }
                        }}
                        required={!showCustomSubCategory}
                        disabled={!formData.category && !showCustomCategory}
                        className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 disabled:opacity-50"
                      >
                        <option value="">Select Sub-category</option>
                        {availableSubcategories.map(sub => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                        <option value="__custom__">+ Custom Fuel Type</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={customSubCategory}
                        onChange={(e) => setCustomSubCategory(e.target.value)}
                        placeholder="Enter custom fuel type"
                        required
                        className="bg-stone-50"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => { setShowCustomSubCategory(false); setCustomSubCategory(''); }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="factor">Emission Factor *</Label>
                  <Input
                    id="factor"
                    type="number"
                    step="0.0001"
                    value={formData.factor}
                    onChange={(e) => setFormData({ ...formData, factor: e.target.value })}
                    required
                    placeholder="e.g., 2.68"
                    className="bg-stone-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit *</Label>
                  {!showCustomUnit ? (
                    <select
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setShowCustomUnit(true);
                          setFormData({ ...formData, unit: '' });
                        } else {
                          setFormData({ ...formData, unit: e.target.value });
                        }
                      }}
                      required={!showCustomUnit}
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    >
                      <option value="">Select Unit</option>
                      {EMISSION_UNITS.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                      <option value="__custom__">+ Custom Unit</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="Custom unit"
                        required
                        className="bg-stone-50"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => { setShowCustomUnit(false); setCustomUnit(''); }}>
                        X
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">Region</Label>
                  <select
                    id="region"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                  >
                    {REGIONS.map(region => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Source *</Label>
                <Input
                  id="source"
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  required
                  placeholder="e.g., Internal measurements, Local authority data"
                  className="bg-stone-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="references">References</Label>
                <Input
                  id="references"
                  value={formData.references}
                  onChange={(e) => setFormData({ ...formData, references: e.target.value })}
                  placeholder="e.g., URL or document reference"
                  className="bg-stone-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="justification">Justification for Custom Factor *</Label>
                <textarea
                  id="justification"
                  value={formData.justification}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                  required
                  rows={3}
                  placeholder="Explain why you need a custom emission factor instead of using standard values..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Custom emission factors require justification and will be marked as "Custom" in reports. 
                  Use standard factors from the Super Admin when available.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                  {editingFactor ? 'Update' : 'Create'} Factor
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="p-4 border border-stone-200 rounded-xl bg-white">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                placeholder="Search factors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-stone-50"
              />
            </div>
          </div>
          <select
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
          >
            <option value="all">All Scopes</option>
            <option value="scope1">Scope 1</option>
            <option value="scope2">Scope 2</option>
            <option value="biogenic">Biogenic</option>
          </select>
          <Button
            variant={showStandard ? "default" : "outline"}
            onClick={() => setShowStandard(!showStandard)}
            className={showStandard ? "bg-primary text-white" : ""}
          >
            <Database className="w-4 h-4 mr-2" />
            {showStandard ? 'Hide' : 'Show'} Standard Factors
          </Button>
        </div>
      </Card>

      {/* Custom Factors List */}
      <div className="space-y-4">
        <h2 className="text-xl font-heading font-bold text-text-primary flex items-center gap-2">
          <Fuel className="w-5 h-5 text-primary" />
          Your Custom Factors ({filteredCustomFactors.length})
        </h2>
        
        {filteredCustomFactors.length === 0 ? (
          <Card className="p-8 border border-stone-200 rounded-xl bg-white text-center">
            <Fuel className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No custom factors yet</h3>
            <p className="text-text-muted mb-4">Create custom emission factors for fuel types not covered by standard factors</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomFactors.map((factor) => (
              <Card key={factor.id} className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`custom-factor-${factor.id}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-2 rounded-lg">
                      <Fuel className="w-4 h-4 text-amber-600" />
                    </div>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Custom</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEditDialog(factor)} data-testid={`edit-factor-${factor.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-accent" onClick={() => handleDelete(factor.id)} data-testid={`delete-factor-${factor.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-bold text-text-primary mb-1">{factor.name}</h3>
                <p className="text-sm text-text-muted mb-2">{factor.category} / {factor.sub_category}</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-xl font-bold text-primary">{factor.factor}</span>
                  <span className="text-sm text-text-muted">{factor.unit}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 bg-stone-100 rounded capitalize">{factor.scope.replace('scope', 'Scope ')}</span>
                  {factor.region && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">{factor.region}</span>}
                </div>
                {factor.justification && (
                  <p className="text-xs text-text-muted mt-2 line-clamp-2" title={factor.justification}>
                    Justification: {factor.justification}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Standard Factors Reference (Read-only) */}
      {showStandard && (
        <div className="space-y-4 mt-8">
          <h2 className="text-xl font-heading font-bold text-text-primary flex items-center gap-2">
            <Database className="w-5 h-5 text-green-600" />
            Standard Factors (Reference Only) ({filteredStandardFactors.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStandardFactors.map((factor) => (
              <Card key={factor.id} className="p-4 border border-stone-200 rounded-xl bg-stone-50" data-testid={`standard-factor-${factor.id}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <Globe className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Standard</span>
                </div>
                <h3 className="font-bold text-text-primary mb-1">{factor.name}</h3>
                <p className="text-sm text-text-muted mb-2">{factor.category} / {factor.sub_category}</p>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-xl font-bold text-green-600">{factor.factor}</span>
                  <span className="text-sm text-text-muted">{factor.unit}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 bg-stone-200 rounded capitalize">{factor.scope.replace('scope', 'Scope ')}</span>
                  {factor.region && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">{factor.region}</span>}
                </div>
                {factor.source && (
                  <p className="text-xs text-text-muted mt-2">Source: {factor.source}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
