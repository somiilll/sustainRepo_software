import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Edit, Trash2, Database, Search, Filter, Fuel, Flame, Droplet, Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to extract error message from API response
const getErrorMessage = (error, fallbackMessage = 'An error occurred') => {
  const errorDetail = error.response?.data?.detail;
  
  if (typeof errorDetail === 'string') {
    return errorDetail;
  } else if (Array.isArray(errorDetail)) {
    // Pydantic validation errors are arrays of {type, loc, msg, input, url}
    return errorDetail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
  } else if (errorDetail && typeof errorDetail === 'object') {
    return errorDetail.msg || errorDetail.message || JSON.stringify(errorDetail);
  }
  
  return fallbackMessage;
};

// Scopes and Categories are now managed dynamically by SuperAdmin
// (fetched from /api/scopes and /api/categories).

// Note: Industry sectors are now fetched from the API (managed by SuperAdmin in Sectors module)

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

// Emission factor basis units (energy)
// Note: Emission factor basis units now come from centralized Energy units module

// Density units
const DENSITY_UNITS = [
  'kg/L',
  'kg/m³',
  'lb/gal',
  't/m³'
];

// Note: Energy units are now managed centrally in the Units module

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
  const [availableUnits, setAvailableUnits] = useState({ mass: [], volume: [], energy: [] });
  const [allUnits, setAllUnits] = useState([]); // All units from ce_units + ce_compound_units
  const [industrySectors, setIndustrySectors] = useState([]); // Fetched from API
  const [dynamicScopes, setDynamicScopes] = useState([]);        // Fetched from API (active only)
  const [dynamicCategories, setDynamicCategories] = useState([]); // Fetched from API (active only)
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('');
  const [filterScope, setFilterScope] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const { getAuthHeader, user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);

  const [formData, setFormData] = useState({
    fuel_name: '',
    categories: [],  // Multiple categories
    industry_sectors: [],  // Multiple industries
    scope: '',
    calorific_value: '',
    calorific_value_unit: 'MJ/kg',
    emission_factor_co2: '',
    emission_factor_co2_unit: 'kgCO2/TJ',
    emission_factor_ch4: '',
    emission_factor_ch4_unit: 'kgCH4/TJ',
    emission_factor_n2o: '',
    emission_factor_n2o_unit: 'kgN2O/TJ',
    emission_factor_basis_quantity: '',
    emission_factor_basis_unit: '',
    gwp_fugitives: '',
    density: '',
    density_unit: 'kg/L',
    conversion_factor: '1',
    conversion_unit: '',
    source: '',
    references: '',
    region: 'Global',
    notes: '',
    allowed_units: ['kg'], // Default to kg
    year_applicable: ''  // Optional year field
  });

  useEffect(() => {
    fetchFuels();
    fetchUnits();
    fetchSectors();
    fetchScopesAndCategories();
  }, []);

  const fetchScopesAndCategories = async () => {
    try {
      const [s, c] = await Promise.all([
        axios.get(`${API}/scopes`, { headers: getAuthHeader() }),
        axios.get(`${API}/categories`, { headers: getAuthHeader() }),
      ]);
      setDynamicScopes(s.data || []);
      setDynamicCategories(c.data || []);
    } catch (err) {
      console.error('Error fetching scopes/categories:', err);
    }
  };

  const fetchSectors = async () => {
    try {
      const response = await axios.get(`${API}/sectors`, {
        headers: getAuthHeader()
      });
      // Extract sector names for the industry_sectors selection
      const sectorNames = (response.data || []).map(s => s.name);
      setIndustrySectors(sectorNames);
    } catch (error) {
      console.error('Error fetching sectors:', error);
      // Fallback to common sectors if API fails
      setIndustrySectors([
        'Manufacturing', 'Transportation', 'Energy', 'Agriculture',
        'Construction', 'Retail', 'Healthcare', 'Technology', 'Finance', 'Other'
      ]);
    }
  };

  const fetchUnits = async () => {
    try {
      // Fetch both old-style units and calc-engine units
      const [oldUnitsRes, calcUnitsRes] = await Promise.all([
        axios.get(`${API}/units`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() }).catch(() => ({ data: { simple: [], compound: [] } })),
      ]);
      
      const units = oldUnitsRes.data || [];
      setAvailableUnits({
        mass: units.filter(u => u.unit_type === 'mass'),
        volume: units.filter(u => u.unit_type === 'volume'),
        energy: units.filter(u => u.unit_type === 'energy')
      });
      
      // Combine simple and compound units for emission factor unit dropdowns
      const calcUnits = [
        ...(calcUnitsRes.data.simple || []),
        ...(calcUnitsRes.data.compound || []),
      ];
      setAllUnits(calcUnits);
    } catch (error) {
      console.error('Error fetching units:', error);
      // Fallback to default units if API fails
      setAvailableUnits({
        mass: [
          { symbol: 'kg', name: 'Kilogram' },
          { symbol: 'g', name: 'Gram' },
          { symbol: 't', name: 'Tonne' },
          { symbol: 'lb', name: 'Pound' }
        ],
        volume: [
          { symbol: 'L', name: 'Litre' },
          { symbol: 'mL', name: 'Millilitre' },
          { symbol: 'kL', name: 'Kilolitre' },
          { symbol: 'm³', name: 'Cubic Metre' },
          { symbol: 'gal', name: 'Gallon' }
        ],
        energy: [
          { symbol: 'kWh', name: 'Kilowatt-hour' },
          { symbol: 'MWh', name: 'Megawatt-hour' },
          { symbol: 'GWh', name: 'Gigawatt-hour' }
        ]
      });
    }
  };

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
      categories: [],
      industry_sectors: [],
      scope: '',
      calorific_value: '',
      calorific_value_unit: 'MJ/kg',
      emission_factor_co2: '',
      emission_factor_co2_unit: 'kgCO2/TJ',
      emission_factor_ch4: '',
      emission_factor_ch4_unit: 'kgCH4/TJ',
      emission_factor_n2o: '',
      emission_factor_n2o_unit: 'kgN2O/TJ',
      emission_factor_basis_quantity: '',
      emission_factor_basis_unit: '',
      gwp_fugitives: '',
      density: '',
      density_unit: 'kg/L',
      conversion_factor: '1',
      conversion_unit: '',
      source: '',
      references: '',
      region: 'Global',
      notes: '',
      allowed_units: ['kg'],
      year_applicable: ''
    });
    setEditingFuel(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.scope) {
      toast.error('Please select a scope first');
      return;
    }
    if (!formData.fuel_name || formData.categories.length === 0 || formData.industry_sectors.length === 0) {
      toast.error('Please fill in Fuel Name and select at least one Category and Industry');
      return;
    }

    try {
      const payload = {
        ...formData,
        // Keep legacy single fields for backward compatibility
        category: formData.categories[0] || '',
        industry_sector: formData.industry_sectors[0] || '',
        calorific_value: formData.calorific_value ? parseFloat(formData.calorific_value) : null,
        emission_factor_co2: formData.emission_factor_co2 ? parseFloat(formData.emission_factor_co2) : null,
        emission_factor_co2_unit: formData.emission_factor_co2_unit || 'kgCO2/TJ',
        emission_factor_ch4: formData.emission_factor_ch4 ? parseFloat(formData.emission_factor_ch4) : null,
        emission_factor_ch4_unit: formData.emission_factor_ch4_unit || 'kgCH4/TJ',
        emission_factor_n2o: formData.emission_factor_n2o ? parseFloat(formData.emission_factor_n2o) : null,
        emission_factor_n2o_unit: formData.emission_factor_n2o_unit || 'kgN2O/TJ',
        emission_factor_basis_quantity: formData.emission_factor_basis_quantity ? parseFloat(formData.emission_factor_basis_quantity) : null,
        emission_factor_basis_unit: formData.emission_factor_basis_unit || null,
        gwp_fugitives: formData.gwp_fugitives ? parseFloat(formData.gwp_fugitives) : null,
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
      toast.error(getErrorMessage(error, 'Operation failed'));
    }
  };

  const handleEdit = (fuel) => {
    setEditingFuel(fuel);
    setFormData({
      fuel_name: fuel.fuel_name,
      categories: fuel.categories || (fuel.category ? [fuel.category] : []),
      industry_sectors: fuel.industry_sectors || (fuel.industry_sector ? [fuel.industry_sector] : []),
      scope: fuel.scope,
      calorific_value: fuel.calorific_value?.toString() || '',
      calorific_value_unit: fuel.calorific_value_unit || 'MJ/kg',
      emission_factor_co2: fuel.emission_factor_co2?.toString() || '',
      emission_factor_co2_unit: fuel.emission_factor_co2_unit || 'kgCO2/TJ',
      emission_factor_ch4: fuel.emission_factor_ch4?.toString() || '',
      emission_factor_ch4_unit: fuel.emission_factor_ch4_unit || 'kgCH4/TJ',
      emission_factor_n2o: fuel.emission_factor_n2o?.toString() || '',
      emission_factor_n2o_unit: fuel.emission_factor_n2o_unit || 'kgN2O/TJ',
      emission_factor_basis_quantity: fuel.emission_factor_basis_quantity?.toString() || '',
      emission_factor_basis_unit: fuel.emission_factor_basis_unit || 'kWh',
      gwp_fugitives: fuel.gwp_fugitives?.toString() || '',
      density: fuel.density?.toString() || '',
      density_unit: fuel.density_unit || 'kg/L',
      conversion_factor: fuel.conversion_factor?.toString() || '1',
      conversion_unit: fuel.conversion_unit || '',
      source: fuel.source || '',
      references: fuel.references || '',
      region: fuel.region || 'Global',
      notes: fuel.notes || '',
      allowed_units: fuel.allowed_units || ['kg'],
      year_applicable: fuel.year_applicable?.toString() || ''
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
      toast.error(getErrorMessage(error, 'Delete failed'));
    }
  };

  const filteredFuels = useMemo(() => {
    return fuels.filter(fuel => {
      const fuelCategories = fuel.categories?.length > 0 ? fuel.categories : (fuel.category ? [fuel.category] : []);
      const matchesSearch = !searchTerm || 
        fuel.fuel_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fuelCategories.some(c => c?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        fuel.industry_sector?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fuel.industry_sectors?.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = !filterCategory || fuelCategories.includes(filterCategory);
      // Check both industry_sector (single) and industry_sectors (array) - case insensitive
      const matchesIndustry = !filterIndustry || 
        fuel.industry_sector?.toLowerCase() === filterIndustry.toLowerCase() || 
        fuel.industry_sectors?.some(s => s.toLowerCase() === filterIndustry.toLowerCase());
      const matchesScope = !filterScope || fuel.scope === filterScope;
      const matchesRegion = !filterRegion || fuel.region === filterRegion;
      return matchesSearch && matchesCategory && matchesIndustry && matchesScope && matchesRegion;
    });
  }, [fuels, searchTerm, filterCategory, filterIndustry, filterScope, filterRegion]);

  // Get unique categories and industries from data
  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    fuels.forEach(f => {
      // Support both categories array and legacy category field
      if (f.categories?.length > 0) {
        f.categories.forEach(c => cats.add(c));
      } else if (f.category) {
        cats.add(f.category);
      }
    });
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
          <div className="flex gap-3">
            {isSuperAdmin && (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  setImportDialogOpen(true);
                  setImportPreview(null);
                  setImportLoading(true);
                  try {
                    const res = await axios.post(
                      `${API}/super-admin/calc-engine/import-from-fuel-db?dry_run=true`,
                      null,
                      { headers: getAuthHeader() },
                    );
                    setImportPreview(res.data);
                  } catch (err) {
                    toast.error(getErrorMessage(err, 'Failed to preview import'));
                    setImportDialogOpen(false);
                  } finally {
                    setImportLoading(false);
                  }
                }}
                className="rounded-full px-5"
                data-testid="import-to-calc-engine-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                Sync to Calc Engine
              </Button>
            )}
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-fuel-btn">
                <Plus className="w-4 h-4 mr-2" />
                Add Fuel
              </Button>
            </DialogTrigger>
          </div>
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

                {/* Scope must be selected first - drives which categories are shown */}
                <div className="space-y-2">
                  <Label htmlFor="scope">Scope *</Label>
                  <select
                    id="scope"
                    value={formData.scope}
                    onChange={(e) => setFormData({
                      ...formData,
                      scope: e.target.value,
                      categories: [], // reset — category list changes with scope
                    })}
                    className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 max-w-md"
                    data-testid="fuel-scope-select"
                    required
                  >
                    <option value="">Select a scope first</option>
                    {dynamicScopes.map(s => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-text-muted">
                    Categories below are driven by the selected scope (configured in Scopes &amp; Categories).
                  </p>
                </div>

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
                    <Label htmlFor="categories">Categories *</Label>
                    <div id="categories" className="w-full">
                      {!formData.scope ? (
                        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          Select a scope first to see categories.
                        </p>
                      ) : (() => {
                        const scopeCats = dynamicCategories.filter(
                          c => c.scope_code === formData.scope && c.is_active !== false,
                        );
                        if (scopeCats.length === 0) {
                          return (
                            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              No categories configured under this scope. Add some in "Scopes &amp; Categories".
                            </p>
                          );
                        }
                        return (
                          <>
                            <p className="text-sm text-text-muted mb-2">Select one or more categories:</p>
                            <div className="flex flex-wrap gap-2">
                              {scopeCats.map(catObj => {
                                const cat = catObj.name;
                                return (
                                  <label key={catObj.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                                    formData.categories.includes(cat)
                                      ? 'bg-primary/10 border-primary text-primary'
                                      : 'bg-stone-50 border-stone-200 hover:border-primary/50'
                                  }`}
                                  data-testid={`fuel-category-${catObj.code}`}>
                                    <input
                                      type="checkbox"
                                      checked={formData.categories.includes(cat)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setFormData(prev => ({ ...prev, categories: [...prev.categories, cat] }));
                                        } else {
                                          setFormData(prev => ({ ...prev, categories: prev.categories.filter(c => c !== cat) }));
                                        }
                                      }}
                                      className="sr-only"
                                    />
                                    <span className="text-sm">{cat}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry_sectors">Industry/Sector(s) *</Label>
                    <div
                      id="industry_sectors"
                      className="w-full"
                    >
                      <p className="text-sm text-text-muted mb-2">Select one or more industries:</p>
                      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                        {industrySectors.length === 0 ? (
                          <p className="text-sm text-amber-600">No sectors defined. Go to Sectors module to add industries.</p>
                        ) : (
                          industrySectors.map(ind => (
                            <label key={ind} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                              formData.industry_sectors.includes(ind) 
                                ? 'bg-blue-100 border-blue-400 text-blue-700' 
                                : 'bg-stone-50 border-stone-200 hover:border-blue-300'
                            }`}>
                              <input
                                type="checkbox"
                                checked={formData.industry_sectors.includes(ind)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData(prev => ({ ...prev, industry_sectors: [...prev.industry_sectors, ind] }));
                                  } else {
                                    setFormData(prev => ({ ...prev, industry_sectors: prev.industry_sectors.filter(i => i !== ind) }));
                                  }
                                }}
                                className="sr-only"
                              />
                              <span className="text-sm">{ind}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="year_applicable">Year Applicable (Optional)</Label>
                    <Input
                      id="year_applicable"
                      type="number"
                      min="1990"
                      max="2100"
                      value={formData.year_applicable}
                      onChange={(e) => setFormData({ ...formData, year_applicable: e.target.value })}
                      placeholder="e.g., 2024"
                      className="bg-stone-50"
                    />
                  </div>
                </div>
              </div>

              {/* Calorific Value & Density */}
              <div className="space-y-4">
                <h3 className="font-medium text-text-primary border-b pb-2">Physical Properties</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="calorific_value">Calorific Value (NCV) - Optional</Label>
                    <div className="flex gap-2">
                      <Input
                        id="calorific_value"
                        type="number"
                        step="0.001"
                        value={formData.calorific_value}
                        onChange={(e) => setFormData({ ...formData, calorific_value: e.target.value })}
                        placeholder="e.g., 43.0 (optional)"
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
                <p className="text-xs text-text-muted">Emission factors are optional</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emission_factor_co2" className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                      CO2 Emission Factor
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="emission_factor_co2"
                        type="number"
                        step="0.001"
                        value={formData.emission_factor_co2}
                        onChange={(e) => setFormData({ ...formData, emission_factor_co2: e.target.value })}
                        placeholder="Value"
                        className="bg-stone-50 flex-1"
                      />
                      <Select value={formData.emission_factor_co2_unit} onValueChange={(v) => setFormData({ ...formData, emission_factor_co2_unit: v })}>
                        <SelectTrigger className="w-32 bg-stone-50">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUnits.map((u) => <SelectItem key={u.key} value={u.key}>{u.key}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emission_factor_ch4" className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                      CH4 Emission Factor
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="emission_factor_ch4"
                        type="number"
                        step="0.001"
                        value={formData.emission_factor_ch4}
                        onChange={(e) => setFormData({ ...formData, emission_factor_ch4: e.target.value })}
                        placeholder="Value"
                        className="bg-stone-50 flex-1"
                      />
                      <Select value={formData.emission_factor_ch4_unit} onValueChange={(v) => setFormData({ ...formData, emission_factor_ch4_unit: v })}>
                        <SelectTrigger className="w-32 bg-stone-50">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUnits.map((u) => <SelectItem key={u.key} value={u.key}>{u.key}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-text-muted">GWP: 28</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emission_factor_n2o" className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                      N2O Emission Factor
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="emission_factor_n2o"
                        type="number"
                        step="0.001"
                        value={formData.emission_factor_n2o}
                        onChange={(e) => setFormData({ ...formData, emission_factor_n2o: e.target.value })}
                        placeholder="Value"
                        className="bg-stone-50 flex-1"
                      />
                      <Select value={formData.emission_factor_n2o_unit} onValueChange={(v) => setFormData({ ...formData, emission_factor_n2o_unit: v })}>
                        <SelectTrigger className="w-32 bg-stone-50">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUnits.map((u) => <SelectItem key={u.key} value={u.key}>{u.key}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-text-muted">GWP: 265</p>
                  </div>
                </div>
                
                {/* Emission Factor Basis Quantity */}
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <h4 className="font-medium text-amber-800 mb-3">Emission Factor (Quantity Basis)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emission_factor_basis_quantity">Basis Quantity</Label>
                      <Input
                        id="emission_factor_basis_quantity"
                        type="number"
                        step="0.001"
                        value={formData.emission_factor_basis_quantity}
                        onChange={(e) => setFormData({ ...formData, emission_factor_basis_quantity: e.target.value })}
                        placeholder="e.g., 1"
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emission_factor_basis_unit">Basis Unit</Label>
                      <Input
                        id="emission_factor_basis_unit"
                        value={formData.emission_factor_basis_unit}
                        onChange={(e) => setFormData({ ...formData, emission_factor_basis_unit: e.target.value })}
                        placeholder="e.g., tCO2/mW, kgCO2/kWh, MWh"
                        className="bg-white"
                      />
                      <p className="text-xs text-amber-600">Enter any unit (e.g., tCO2/mW, kgCO2/kWh, MWh)</p>
                    </div>
                  </div>
                </div>

                {/* GWP Fugitives */}
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-3">GWP for Fugitive Emissions</h4>
                  <div className="space-y-2">
                    <Label htmlFor="gwp_fugitives">GWP Fugitives</Label>
                    <Input
                      id="gwp_fugitives"
                      type="number"
                      step="0.001"
                      value={formData.gwp_fugitives}
                      onChange={(e) => setFormData({ ...formData, gwp_fugitives: e.target.value })}
                      placeholder="Global Warming Potential for fugitive emissions"
                      className="bg-white"
                    />
                    <p className="text-xs text-blue-600">Used for calculating fugitive emissions CO2e</p>
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
                      {availableUnits.mass.length === 0 ? (
                        <p className="text-xs text-text-muted">No mass units defined. Go to Units module to add units.</p>
                      ) : (
                        availableUnits.mass.map(unit => (
                          <label key={unit.symbol} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.allowed_units?.includes(unit.symbol) || false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const symbol = unit.symbol;
                                setFormData(prev => ({
                                  ...prev,
                                  allowed_units: checked
                                    ? [...(prev.allowed_units || []), symbol]
                                    : (prev.allowed_units || []).filter(u => u !== symbol)
                                }));
                              }}
                              className="rounded text-primary"
                            />
                            <span className="text-sm">{unit.name} ({unit.symbol})</span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-blue-600">Mass units don't require density multiplication</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-green-600">Volume Units</Label>
                    <div className="space-y-2 p-3 bg-green-50 rounded-lg border border-green-200">
                      {availableUnits.volume.length === 0 ? (
                        <p className="text-xs text-text-muted">No volume units defined. Go to Units module to add units.</p>
                      ) : (
                        availableUnits.volume.map(unit => (
                          <label key={unit.symbol} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.allowed_units?.includes(unit.symbol) || false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const symbol = unit.symbol;
                                setFormData(prev => ({
                                  ...prev,
                                  allowed_units: checked
                                    ? [...(prev.allowed_units || []), symbol]
                                    : (prev.allowed_units || []).filter(u => u !== symbol)
                                }));
                              }}
                              className="rounded text-primary"
                            />
                            <span className="text-sm">{unit.name} ({unit.symbol})</span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-green-600">Volume units require density for conversion</p>
                  </div>
                </div>
                
                {/* Energy Units */}
                <div className="space-y-2">
                  <Label className="text-amber-600">Energy Units</Label>
                  <div className="space-y-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    {availableUnits.energy.length === 0 ? (
                      <p className="text-xs text-text-muted">No energy units defined. Go to Units module to add energy units like kWh, MWh, GWh.</p>
                    ) : (
                      availableUnits.energy.map(unit => (
                        <label key={unit.symbol} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.allowed_units?.includes(unit.symbol) || false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const symbol = unit.symbol;
                              setFormData(prev => ({
                                ...prev,
                                allowed_units: checked
                                  ? [...(prev.allowed_units || []), symbol]
                                  : (prev.allowed_units || []).filter(u => u !== symbol)
                              }));
                            }}
                            className="rounded text-amber-600"
                          />
                          <span className="text-sm">{unit.name} ({unit.symbol})</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-amber-600">Energy units for electricity or energy-based fuels</p>
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
                data-testid="fuel-search"
              />
            </div>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid="filter-category"
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
            data-testid="filter-industry"
          >
            <option value="">All Industries</option>
            {industrySectors.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
          <select
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid="filter-scope"
          >
            <option value="">All Scopes</option>
            {dynamicScopes.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
            data-testid="filter-region"
          >
            <option value="">All Regions</option>
            {REGIONS.map(region => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
          {(filterCategory || filterIndustry || filterScope || filterRegion || searchTerm) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setFilterCategory('');
                setFilterIndustry('');
                setFilterScope('');
                setFilterRegion('');
                setSearchTerm('');
              }}
              className="text-text-muted hover:text-text-primary"
            >
              Clear Filters
            </Button>
          )}
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
                    {fuel.year_applicable && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                        Year: {fuel.year_applicable}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-text-muted mb-3">
                    <span><strong>Categories:</strong> {fuel.categories?.length > 0 ? fuel.categories.join(', ') : fuel.category || '-'}</span>
                    <span><strong>Industries:</strong> {fuel.industry_sectors?.length > 0 ? fuel.industry_sectors.join(', ') : fuel.industry_sector || '-'}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-4 text-sm">
                    <div className="bg-stone-50 p-2 rounded">
                      <p className="text-text-muted text-xs">Calorific Value</p>
                      <p className="font-medium">{fuel.calorific_value ? `${fuel.calorific_value} ${fuel.calorific_value_unit}` : '-'}</p>
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
                  {fuel.emission_factor_basis_quantity && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-lg border border-amber-200">
                      <span className="text-xs text-amber-700">
                        <strong>EF Basis:</strong> {fuel.emission_factor_basis_quantity} {fuel.emission_factor_basis_unit}
                      </span>
                    </div>
                  )}
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

      {/* Sync to Calc Engine dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              Sync Fuel Database → Calc Engine Properties
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              This imports <span className="font-medium text-text-primary">CV</span>,{' '}
              <span className="font-medium text-text-primary">density</span>, and{' '}
              <span className="font-medium text-text-primary">emission factors</span> from each fuel
              row into the new Calc Engine's <code className="px-1 bg-stone-100 rounded">property_values</code>{' '}
              store. Runs once, idempotent — existing values are skipped unless "overwrite" is on.
            </p>

            {importLoading && (
              <div className="flex items-center gap-2 text-text-muted py-8 justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
                Scanning fuels…
              </div>
            )}

            {!importLoading && importPreview && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                    <p className="text-xs text-text-muted">Fuels scanned</p>
                    <p className="text-2xl font-heading font-bold text-text-primary">
                      {importPreview.fuels_scanned}
                    </p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-xs text-emerald-700">Property values to write</p>
                    <p className="text-2xl font-heading font-bold text-emerald-700">
                      {importPreview.total_operations}
                    </p>
                  </div>
                </div>

                <div className="border border-stone-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-left text-text-muted">
                      <tr>
                        <th className="px-3 py-2">Property</th>
                        <th className="px-3 py-2 text-right">Insert</th>
                        <th className="px-3 py-2 text-right">Update</th>
                        <th className="px-3 py-2 text-right">Skip (exists)</th>
                        <th className="px-3 py-2 text-right">Skip (no value)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(importPreview.per_property).map(([key, v]) => (
                        <tr key={key} className="border-t border-stone-100" data-testid={`import-row-${key}`}>
                          <td className="px-3 py-2 font-mono">{key}</td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-700">{v.inserted}</td>
                          <td className="px-3 py-2 text-right text-amber-700">{v.updated}</td>
                          <td className="px-3 py-2 text-right text-text-muted">{v.skipped_existing}</td>
                          <td className="px-3 py-2 text-right text-text-muted">{v.skipped_no_value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importOverwrite}
                    onChange={(e) => setImportOverwrite(e.target.checked)}
                    data-testid="import-overwrite-toggle"
                  />
                  Overwrite existing property values (re-sync after fuel DB edits)
                </label>

                <div className="flex gap-3 justify-end pt-2 border-t border-stone-100">
                  <Button
                    variant="outline"
                    onClick={() => setImportDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      setImportLoading(true);
                      try {
                        const res = await axios.post(
                          `${API}/super-admin/calc-engine/import-from-fuel-db?dry_run=false&overwrite=${importOverwrite}`,
                          null,
                          { headers: getAuthHeader() },
                        );
                        toast.success(
                          `Imported ${res.data.total_operations} property values from ${res.data.fuels_scanned} fuels`,
                        );
                        setImportDialogOpen(false);
                      } catch (err) {
                        toast.error(getErrorMessage(err, 'Import failed'));
                      } finally {
                        setImportLoading(false);
                      }
                    }}
                    className="bg-primary hover:bg-primary/90 text-white"
                    data-testid="confirm-import-btn"
                    disabled={importPreview.total_operations === 0}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Confirm Import
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
