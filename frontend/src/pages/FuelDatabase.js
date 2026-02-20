import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Plus, Edit, Trash2, Database, Search, Filter, Fuel, Flame, Droplet } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Predefined categories
const CATEGORIES = [
  'Stationary Combustion',
  'Mobile Combustion',
  'Fugitive Emissions',
  'Process Emissions',
  'Purchased Electricity',
  'Purchased Heat/Steam',
  'Biofuels',
  'Other'
];

// Predefined industry sectors
const INDUSTRY_SECTORS = [
  'Manufacturing',
  'Transportation',
  'Energy',
  'Agriculture',
  'Construction',
  'Mining',
  'Commercial',
  'Residential',
  'Waste Management',
  'Other'
];

// Calorific value units
const CALORIFIC_UNITS = [
  'TJ/Gg',
  'TJ/kg',
  'MJ/kg',
  'MJ/L',
  'MJ/m³',
  'GJ/t',
  'kJ/kg',
  'BTU/lb',
  'BTU/gal'
];

// Density units
const DENSITY_UNITS = [
  'kg/L',
  'kg/m³',
  'lb/gal',
  't/m³'
];

// Quantity units available for fuels (Super Admin selects which are allowed per fuel)
const QUANTITY_UNIT_OPTIONS = [
  { value: 'kg', label: 'Kilograms (kg)', type: 'mass' },
  { value: 'g', label: 'Grams (g)', type: 'mass' },
  { value: 'tonne', label: 'Tonnes (t)', type: 'mass' },
  { value: 'lb', label: 'Pounds (lb)', type: 'mass' },
  { value: 'L', label: 'Litres (L)', type: 'volume' },
  { value: 'mL', label: 'Millilitres (mL)', type: 'volume' },
  { value: 'kL', label: 'Kilolitres (kL)', type: 'volume' },
  { value: 'm3', label: 'Cubic Metres (m³)', type: 'volume' },
  { value: 'gal', label: 'Gallons (gal)', type: 'volume' },
  { value: 'ft3', label: 'Cubic Feet (ft³)', type: 'volume' }
];

// Regions
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

export default function FuelDatabase() {
  const [fuels, setFuels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fuelToDelete, setFuelToDelete] = useState(null);
  const [editingFuel, setEditingFuel] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('');
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    fuel_name: '',
    category: '',
    industry_sector: '',
    scope: 'scope1',
    calorific_value: '',
    calorific_value_unit: 'MJ/kg',
    emission_factor_co2: '',
    emission_factor_ch4: '',
    emission_factor_n2o: '',
    density: '',
    density_unit: 'kg/L',
    conversion_factor: '1',
    conversion_unit: '',
    source: '',
    references: '',
    region: 'Global',
    notes: '',
    allowed_units: ['kg'] // Default to kg
  });

  useEffect(() => {
    fetchFuels();
  }, []);

  const fetchFuels = async () => {
    try {
      const response = await axios.get(`${API}/super-admin/fuel-database`, {
        headers: getAuthHeader()
      });
      setFuels(response.data || []);
    } catch (error) {
      console.error('Error fetching fuels:', error);
      // Only show error if it's not a 404 or empty response
      if (error.response?.status !== 404) {
        toast.error('Failed to load fuel database');
      }
      setFuels([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      fuel_name: '',
      category: '',
      industry_sector: '',
      scope: 'scope1',
      calorific_value: '',
      calorific_value_unit: 'TJ/Gg',
      emission_factor_co2: '',
      emission_factor_ch4: '',
      emission_factor_n2o: '',
      density: '',
      density_unit: 'kg/L',
      conversion_factor: '1',
      conversion_unit: '',
      source: '',
      references: '',
      region: 'Global',
      notes: '',
      allowed_units: ['kg']
    });
    setEditingFuel(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.fuel_name || !formData.category || !formData.industry_sector) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!formData.calorific_value || !formData.emission_factor_co2) {
      toast.error('Calorific Value and CO2 Emission Factor are required');
      return;
    }

    try {
      const payload = {
        ...formData,
        calorific_value: parseFloat(formData.calorific_value),
        emission_factor_co2: parseFloat(formData.emission_factor_co2),
        emission_factor_ch4: formData.emission_factor_ch4 ? parseFloat(formData.emission_factor_ch4) : null,
        emission_factor_n2o: formData.emission_factor_n2o ? parseFloat(formData.emission_factor_n2o) : null,
        density: formData.density ? parseFloat(formData.density) : null,
        conversion_factor: parseFloat(formData.conversion_factor) || 1
      };

      if (editingFuel) {
        await axios.put(
          `${API}/super-admin/fuel-database/${editingFuel.id}`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Fuel updated successfully');
      } else {
        await axios.post(
          `${API}/super-admin/fuel-database`,
          payload,
          { headers: getAuthHeader() }
        );
        toast.success('Fuel created successfully');
      }

      setDialogOpen(false);
      resetForm();
      fetchFuels();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEdit = (fuel) => {
    setEditingFuel(fuel);
    setFormData({
      fuel_name: fuel.fuel_name,
      category: fuel.category,
      industry_sector: fuel.industry_sector,
      scope: fuel.scope,
      calorific_value: fuel.calorific_value?.toString() || '',
      calorific_value_unit: fuel.calorific_value_unit || 'MJ/kg',
      emission_factor_co2: fuel.emission_factor_co2?.toString() || '',
      emission_factor_ch4: fuel.emission_factor_ch4?.toString() || '',
      emission_factor_n2o: fuel.emission_factor_n2o?.toString() || '',
      density: fuel.density?.toString() || '',
      density_unit: fuel.density_unit || 'kg/L',
      conversion_factor: fuel.conversion_factor?.toString() || '1',
      conversion_unit: fuel.conversion_unit || '',
      source: fuel.source || '',
      references: fuel.references || '',
      region: fuel.region || 'Global',
      notes: fuel.notes || '',
      allowed_units: fuel.allowed_units || ['kg']
    });
    setDialogOpen(true);
  };

  const confirmDelete = (fuel) => {
    setFuelToDelete(fuel);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!fuelToDelete) return;
    
    try {
      await axios.delete(`${API}/super-admin/fuel-database/${fuelToDelete.id}`, {
        headers: getAuthHeader()
      });
      toast.success('Fuel deleted successfully');
      setDeleteDialogOpen(false);
      setFuelToDelete(null);
      fetchFuels();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
  };

  const filteredFuels = useMemo(() => {
    return fuels.filter(fuel => {
      const matchesSearch = !searchTerm || 
        fuel.fuel_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fuel.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fuel.industry_sector?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !filterCategory || fuel.category === filterCategory;
      const matchesIndustry = !filterIndustry || fuel.industry_sector === filterIndustry;
      return matchesSearch && matchesCategory && matchesIndustry;
    });
  }, [fuels, searchTerm, filterCategory, filterIndustry]);

  // Get unique categories and industries from data
  const uniqueCategories = useMemo(() => {
    const cats = new Set(fuels.map(f => f.category));
    return Array.from(cats).sort();
  }, [fuels]);

  const uniqueIndustries = useMemo(() => {
    const industries = new Set(fuels.map(f => f.industry_sector));
    return Array.from(industries).sort();
  }, [fuels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="fuel-database-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Fuel Database</h1>
          <p className="text-text-secondary">Manage fuel parameters for emission calculations</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-fuel-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Fuel
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                {editingFuel ? 'Edit Fuel' : 'Add New Fuel'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6" data-testid="fuel-form">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Basic Information</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fuel_name">Fuel Name *</Label>
                    <Input
                      id="fuel_name"
                      value={formData.fuel_name}
                      onChange={(e) => setFormData({ ...formData, fuel_name: e.target.value })}
                      required
                      placeholder="e.g., Diesel, Natural Gas"
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <select
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    >
                      <option value="">Select Category</option>
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry_sector">Industry/Sector *</Label>
                    <select
                      id="industry_sector"
                      value={formData.industry_sector}
                      onChange={(e) => setFormData({ ...formData, industry_sector: e.target.value })}
                      required
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    >
                      <option value="">Select Industry</option>
                      {INDUSTRY_SECTORS.map(ind => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scope">Scope</Label>
                    <select
                      id="scope"
                      value={formData.scope}
                      onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                    >
                      <option value="scope1">Scope 1</option>
                      <option value="scope2">Scope 2</option>
                      <option value="biogenic">Biogenic</option>
                    </select>
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
              </div>

              {/* Calorific Value & Density */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Physical Properties</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="calorific_value">Calorific Value (NCV) *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="calorific_value"
                        type="number"
                        step="0.001"
                        value={formData.calorific_value}
                        onChange={(e) => setFormData({ ...formData, calorific_value: e.target.value })}
                        required
                        placeholder="e.g., 43.0"
                        className="bg-stone-50 flex-1"
                      />
                      <select
                        value={formData.calorific_value_unit}
                        onChange={(e) => setFormData({ ...formData, calorific_value_unit: e.target.value })}
                        className="w-28 h-10 bg-stone-50 border border-stone-200 rounded-lg px-2"
                      >
                        {CALORIFIC_UNITS.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="density">Density (Optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="density"
                        type="number"
                        step="0.001"
                        value={formData.density}
                        onChange={(e) => setFormData({ ...formData, density: e.target.value })}
                        placeholder="e.g., 0.85"
                        className="bg-stone-50 flex-1"
                      />
                      <select
                        value={formData.density_unit}
                        onChange={(e) => setFormData({ ...formData, density_unit: e.target.value })}
                        className="w-28 h-10 bg-stone-50 border border-stone-200 rounded-lg px-2"
                      >
                        {DENSITY_UNITS.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Emission Factors */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Emission Factors (basis heating value)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emission_factor_co2" className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                      CO2 Emission Factor *
                    </Label>
                    <Input
                      id="emission_factor_co2"
                      type="number"
                      step="0.001"
                      value={formData.emission_factor_co2}
                      onChange={(e) => setFormData({ ...formData, emission_factor_co2: e.target.value })}
                      required
                      placeholder="kg CO2/TJ"
                      className="bg-stone-50"
                    />
                    <p className="text-xs text-text-muted">kg CO2/TJ</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emission_factor_ch4" className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                      CH4 Emission Factor
                    </Label>
                    <Input
                      id="emission_factor_ch4"
                      type="number"
                      step="0.001"
                      value={formData.emission_factor_ch4}
                      onChange={(e) => setFormData({ ...formData, emission_factor_ch4: e.target.value })}
                      placeholder="kg CH4/TJ (optional)"
                      className="bg-stone-50"
                    />
                    <p className="text-xs text-text-muted">kg CH4/TJ (GWP: 28)</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emission_factor_n2o" className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                      N2O Emission Factor
                    </Label>
                    <Input
                      id="emission_factor_n2o"
                      type="number"
                      step="0.001"
                      value={formData.emission_factor_n2o}
                      onChange={(e) => setFormData({ ...formData, emission_factor_n2o: e.target.value })}
                      placeholder="kg N2O/TJ (optional)"
                      className="bg-stone-50"
                    />
                    <p className="text-xs text-text-muted">kg N2O/TJ (GWP: 265)</p>
                  </div>
                </div>
              </div>

              {/* Allowed Units */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Allowed Quantity Units</h3>
                <p className="text-sm text-text-muted">Select which units users can use when entering quantity for this fuel. At least one unit must be selected.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-blue-600">Mass Units</Label>
                    <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      {QUANTITY_UNIT_OPTIONS.filter(u => u.type === 'mass').map(unit => (
                        <label key={unit.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.allowed_units?.includes(unit.value) || false}
                            onChange={(e) => {
                              const newUnits = e.target.checked
                                ? [...(formData.allowed_units || []), unit.value]
                                : (formData.allowed_units || []).filter(u => u !== unit.value);
                              setFormData({ ...formData, allowed_units: newUnits });
                            }}
                            className="rounded text-primary"
                          />
                          <span className="text-sm">{unit.label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-blue-600">Mass units don't require density multiplication</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-green-600">Volume Units</Label>
                    <div className="space-y-2 p-3 bg-green-50 rounded-lg border border-green-200">
                      {QUANTITY_UNIT_OPTIONS.filter(u => u.type === 'volume').map(unit => (
                        <label key={unit.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.allowed_units?.includes(unit.value) || false}
                            onChange={(e) => {
                              const newUnits = e.target.checked
                                ? [...(formData.allowed_units || []), unit.value]
                                : (formData.allowed_units || []).filter(u => u !== unit.value);
                              setFormData({ ...formData, allowed_units: newUnits });
                            }}
                            className="rounded text-primary"
                          />
                          <span className="text-sm">{unit.label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-green-600">Volume units require density for conversion</p>
                  </div>
                </div>
                {(!formData.allowed_units || formData.allowed_units.length === 0) && (
                  <p className="text-xs text-red-500">Please select at least one unit</p>
                )}
              </div>

              {/* Source & Notes */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Source & Notes</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="source">Data Source</Label>
                    <Input
                      id="source"
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      placeholder="e.g., IPCC 2006, EPA, National Inventory"
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="references">References</Label>
                    <Input
                      id="references"
                      value={formData.references}
                      onChange={(e) => setFormData({ ...formData, references: e.target.value })}
                      placeholder="URL or document reference"
                      className="bg-stone-50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    placeholder="Additional notes or conditions for this fuel..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* GWP Info Box */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-800 mb-2">GWP Values (IPCC AR5 - Fixed)</h4>
                <div className="flex gap-6 text-sm text-blue-700">
                  <span>CO2: <strong>1</strong></span>
                  <span>CH4: <strong>28</strong></span>
                  <span>N2O: <strong>265</strong></span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                  {editingFuel ? 'Update Fuel' : 'Create Fuel'}
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
                placeholder="Search fuels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-stone-50"
              />
            </div>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={filterIndustry}
            onChange={(e) => setFilterIndustry(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
          >
            <option value="">All Industries</option>
            {uniqueIndustries.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 border border-stone-200 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{fuels.length}</p>
              <p className="text-sm text-text-muted">Total Fuels</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-stone-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Filter className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{uniqueCategories.length}</p>
              <p className="text-sm text-text-muted">Categories</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-stone-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg">
              <Fuel className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{uniqueIndustries.length}</p>
              <p className="text-sm text-text-muted">Industries</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border border-stone-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 p-2 rounded-lg">
              <Flame className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{filteredFuels.length}</p>
              <p className="text-sm text-text-muted">Filtered Results</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Fuel List */}
      {filteredFuels.length === 0 ? (
        <Card className="p-12 border border-stone-200 rounded-xl bg-white text-center">
          <Database className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <h3 className="text-xl font-medium text-text-primary mb-2">No fuels found</h3>
          <p className="text-text-muted mb-4">
            {fuels.length === 0 
              ? 'Start by adding fuels to the database' 
              : 'Try adjusting your search or filters'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredFuels.map((fuel) => (
            <Card key={fuel.id} className="p-4 border border-stone-200 rounded-xl bg-white hover:shadow-md transition-shadow" data-testid={`fuel-${fuel.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-text-primary">{fuel.fuel_name}</h3>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
                      {fuel.scope.replace('scope', 'Scope ')}
                    </span>
                    <span className="px-2 py-0.5 bg-stone-100 text-text-secondary text-xs rounded">
                      {fuel.region}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-text-muted mb-3">
                    <span><strong>Category:</strong> {fuel.category}</span>
                    <span><strong>Industry:</strong> {fuel.industry_sector}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-4 text-sm">
                    <div className="bg-stone-50 p-2 rounded">
                      <p className="text-text-muted text-xs">Calorific Value</p>
                      <p className="font-medium">{fuel.calorific_value} {fuel.calorific_value_unit}</p>
                    </div>
                    <div className="bg-red-50 p-2 rounded">
                      <p className="text-text-muted text-xs">CO2 EF</p>
                      <p className="font-medium text-red-700">{fuel.emission_factor_co2} kg/TJ</p>
                    </div>
                    <div className="bg-orange-50 p-2 rounded">
                      <p className="text-text-muted text-xs">CH4 EF</p>
                      <p className="font-medium text-orange-700">{fuel.emission_factor_ch4 || '-'} {fuel.emission_factor_ch4 ? 'kg/TJ' : ''}</p>
                    </div>
                    <div className="bg-purple-50 p-2 rounded">
                      <p className="text-text-muted text-xs">N2O EF</p>
                      <p className="font-medium text-purple-700">{fuel.emission_factor_n2o || '-'} {fuel.emission_factor_n2o ? 'kg/TJ' : ''}</p>
                    </div>
                    <div className="bg-blue-50 p-2 rounded">
                      <p className="text-text-muted text-xs">Density</p>
                      <p className="font-medium text-blue-700">{fuel.density || '-'} {fuel.density ? fuel.density_unit : ''}</p>
                    </div>
                  </div>
                  {fuel.source && (
                    <p className="text-xs text-text-muted mt-2">Source: {fuel.source}</p>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(fuel)} data-testid={`edit-fuel-${fuel.id}`}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-accent border-accent" onClick={() => confirmDelete(fuel)} data-testid={`delete-fuel-${fuel.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fuel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{fuelToDelete?.fuel_name}</strong>?
              <br /><br />
              This will remove the fuel from the database. Any emissions using this fuel will need to be recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); setFuelToDelete(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Fuel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
