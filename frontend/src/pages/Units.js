import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Plus, Edit, Trash2, Scale, Droplets, RefreshCw, X } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Units() {
  const { getAuthHeader } = useAuth();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [aliasInput, setAliasInput] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    unit_type: 'mass',
    aliases: [],
    is_base_unit: false,
    description: '',
    is_active: true
  });

  // Available unit types - SuperAdmin can select from these or add custom types
  const DEFAULT_UNIT_TYPES = [
    { value: 'mass', label: 'Mass', icon: Scale, color: 'blue' },
    { value: 'volume', label: 'Volume', icon: Droplets, color: 'green' },
    { value: 'energy', label: 'Energy', icon: RefreshCw, color: 'amber' }
  ];
  
  const [customUnitTypes, setCustomUnitTypes] = useState([]);
  const [newUnitTypeDialog, setNewUnitTypeDialog] = useState(false);
  const [newUnitType, setNewUnitType] = useState('');
  
  // Combine default and custom unit types
  const UNIT_TYPES = useMemo(() => {
    const customTypes = customUnitTypes.map(t => ({
      value: t,
      label: t.charAt(0).toUpperCase() + t.slice(1),
      icon: Scale,
      color: 'purple'
    }));
    return [...DEFAULT_UNIT_TYPES, ...customTypes];
  }, [customUnitTypes]);

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/api/units`, {
        headers: getAuthHeader()
      });
      const fetchedUnits = response.data;
      setUnits(fetchedUnits);
      
      // Extract custom unit types (any type not in defaults)
      const defaultTypeValues = ['mass', 'volume', 'energy'];
      const customTypes = [...new Set(
        fetchedUnits
          .map(u => u.unit_type)
          .filter(t => t && !defaultTypeValues.includes(t))
      )];
      setCustomUnitTypes(customTypes);
    } catch (error) {
      console.error('Error fetching units:', error);
    } finally {
      setLoading(false);
    }
  };

  const seedDefaultUnits = async () => {
    try {
      setSeeding(true);
      const response = await axios.post(`${API}/api/units/seed-defaults`, {}, {
        headers: getAuthHeader()
      });
      alert(`${response.data.message}: ${response.data.units.join(', ') || 'None (all already exist)'}`);
      fetchUnits();
    } catch (error) {
      console.error('Error seeding units:', error);
      alert('Error seeding units');
    } finally {
      setSeeding(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      symbol: '',
      unit_type: 'mass',
      aliases: [],
      is_base_unit: false,
      description: '',
      is_active: true
    });
    setAliasInput('');
    setEditingUnit(null);
  };

  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name,
      symbol: unit.symbol,
      unit_type: unit.unit_type,
      aliases: unit.aliases || [],
      is_base_unit: unit.is_base_unit || false,
      description: unit.description || '',
      is_active: unit.is_active !== false
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.symbol) {
      alert('Name and Symbol are required');
      return;
    }

    try {
      if (editingUnit) {
        await axios.put(`${API}/api/units/${editingUnit.id}`, formData, {
          headers: getAuthHeader()
        });
      } else {
        await axios.post(`${API}/api/units`, formData, {
          headers: getAuthHeader()
        });
      }
      setDialogOpen(false);
      resetForm();
      fetchUnits();
    } catch (error) {
      console.error('Error saving unit:', error);
      alert(error.response?.data?.detail || 'Error saving unit');
    }
  };

  const handleDelete = async () => {
    if (!unitToDelete) return;
    
    try {
      await axios.delete(`${API}/api/units/${unitToDelete.id}`, {
        headers: getAuthHeader()
      });
      setDeleteDialogOpen(false);
      setUnitToDelete(null);
      fetchUnits();
    } catch (error) {
      console.error('Error deleting unit:', error);
      alert('Error deleting unit');
    }
  };

  const addAlias = () => {
    if (aliasInput.trim() && !formData.aliases.includes(aliasInput.trim())) {
      setFormData({
        ...formData,
        aliases: [...formData.aliases, aliasInput.trim()]
      });
      setAliasInput('');
    }
  };

  const removeAlias = (alias) => {
    setFormData({
      ...formData,
      aliases: formData.aliases.filter(a => a !== alias)
    });
  };

  const addCustomUnitType = () => {
    const typeValue = newUnitType.trim().toLowerCase().replace(/\s+/g, '_');
    if (typeValue && !customUnitTypes.includes(typeValue) && !['mass', 'volume', 'energy'].includes(typeValue)) {
      setCustomUnitTypes([...customUnitTypes, typeValue]);
      setNewUnitType('');
      setNewUnitTypeDialog(false);
    }
  };

  const massUnits = units.filter(u => u.unit_type === 'mass');
  const volumeUnits = units.filter(u => u.unit_type === 'volume');
  const energyUnits = units.filter(u => u.unit_type === 'energy');
  
  // Get units for custom types
  const getUnitsForType = (type) => units.filter(u => u.unit_type === type);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Unit Management</h1>
          <p className="text-text-muted mt-1">
            Define standardized units for the entire system. These units will be used in Fuel Database, Formulas, and Emissions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setNewUnitTypeDialog(true)}
            data-testid="add-unit-type-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Unit Type
          </Button>
          <Button
            variant="outline"
            onClick={seedDefaultUnits}
            disabled={seeding}
            data-testid="seed-units-button"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${seeding ? 'animate-spin' : ''}`} />
            {seeding ? 'Seeding...' : 'Seed Defaults'}
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="add-unit-button">
            <Plus className="w-4 h-4 mr-2" />
            Add Unit
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Scale className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{massUnits.length}</p>
              <p className="text-sm text-text-muted">Mass Units</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Droplets className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{volumeUnits.length}</p>
              <p className="text-sm text-text-muted">Volume Units</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <RefreshCw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{energyUnits.length}</p>
              <p className="text-sm text-text-muted">Energy Units</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-stone-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-stone-100 rounded-lg">
              <Scale className="w-5 h-5 text-stone-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{units.length}</p>
              <p className="text-sm text-text-muted">Total Units</p>
            </div>
          </div>
        </div>
      </div>

      {/* Units Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Mass Units */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
            <h2 className="font-semibold text-blue-800 flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Mass Units
            </h2>
            <p className="text-xs text-blue-600 mt-1">Base unit: kg (Kilogram)</p>
          </div>
          <div className="divide-y divide-stone-100">
            {massUnits.length === 0 ? (
              <div className="p-8 text-center text-text-muted">
                No mass units defined. Click "Seed Defaults" to add standard units.
              </div>
            ) : (
              massUnits.map(unit => (
                <div key={unit.id} className="p-4 hover:bg-stone-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary">{unit.name}</span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-sm font-mono">
                          {unit.symbol}
                        </span>
                        {unit.is_base_unit && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs">
                            Base
                          </span>
                        )}
                      </div>
                      {unit.aliases && unit.aliases.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {unit.aliases.slice(0, 5).map((alias, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">
                              {alias}
                            </span>
                          ))}
                          {unit.aliases.length > 5 && (
                            <span className="text-xs text-text-muted">+{unit.aliases.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(unit)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => { setUnitToDelete(unit); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Volume Units */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-green-50 px-4 py-3 border-b border-green-200">
            <h2 className="font-semibold text-green-800 flex items-center gap-2">
              <Droplets className="w-4 h-4" />
              Volume Units
            </h2>
            <p className="text-xs text-green-600 mt-1">Base unit: L (Litre) • Requires density for mass conversion</p>
          </div>
          <div className="divide-y divide-stone-100">
            {volumeUnits.length === 0 ? (
              <div className="p-8 text-center text-text-muted">
                No volume units defined. Click "Seed Defaults" to add standard units.
              </div>
            ) : (
              volumeUnits.map(unit => (
                <div key={unit.id} className="p-4 hover:bg-stone-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary">{unit.name}</span>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-sm font-mono">
                          {unit.symbol}
                        </span>
                        {unit.is_base_unit && (
                          <span className="px-2 py-0.5 bg-green-600 text-white rounded text-xs">
                            Base
                          </span>
                        )}
                      </div>
                      {unit.aliases && unit.aliases.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {unit.aliases.slice(0, 5).map((alias, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">
                              {alias}
                            </span>
                          ))}
                          {unit.aliases.length > 5 && (
                            <span className="text-xs text-text-muted">+{unit.aliases.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(unit)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => { setUnitToDelete(unit); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Energy Units */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
            <h2 className="font-semibold text-amber-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Energy Units
            </h2>
            <p className="text-xs text-amber-600 mt-1">For electricity and energy-based fuels (kWh, MWh, GWh, etc.)</p>
          </div>
          <div className="divide-y divide-stone-100">
            {energyUnits.length === 0 ? (
              <div className="p-8 text-center text-text-muted">
                No energy units defined. Click "Add Unit" to create energy units like kWh, MWh, GWh.
              </div>
            ) : (
              energyUnits.map(unit => (
                <div key={unit.id} className="p-4 hover:bg-stone-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary">{unit.name}</span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-sm font-mono">
                          {unit.symbol}
                        </span>
                        {unit.is_base_unit && (
                          <span className="px-2 py-0.5 bg-amber-600 text-white rounded text-xs">
                            Base
                          </span>
                        )}
                      </div>
                      {unit.aliases && unit.aliases.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {unit.aliases.slice(0, 5).map((alias, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">
                              {alias}
                            </span>
                          ))}
                          {unit.aliases.length > 5 && (
                            <span className="text-xs text-text-muted">+{unit.aliases.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(unit)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-red-500 hover:text-red-700"
                        onClick={() => { setUnitToDelete(unit); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Custom Unit Types Section */}
      {customUnitTypes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-text-primary">Custom Unit Types</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {customUnitTypes.map((type) => {
              const typeUnits = getUnitsForType(type);
              const typeLabel = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
              return (
                <div key={type} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="bg-purple-50 px-4 py-3 border-b border-purple-200">
                    <h2 className="font-semibold text-purple-800 flex items-center gap-2">
                      <Scale className="w-4 h-4" />
                      {typeLabel} Units
                    </h2>
                    <p className="text-xs text-purple-600 mt-1">Custom unit type</p>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {typeUnits.length === 0 ? (
                      <div className="p-8 text-center text-text-muted">
                        No {typeLabel.toLowerCase()} units defined yet.
                      </div>
                    ) : (
                      typeUnits.map(unit => (
                        <div key={unit.id} className="p-4 hover:bg-stone-50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-text-primary">{unit.name}</span>
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-sm font-mono">
                                  {unit.symbol}
                                </span>
                                {unit.is_base_unit && (
                                  <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-xs">
                                    Base
                                  </span>
                                )}
                              </div>
                              {unit.aliases && unit.aliases.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {unit.aliases.slice(0, 5).map((alias, i) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">
                                      {alias}
                                    </span>
                                  ))}
                                  {unit.aliases.length > 5 && (
                                    <span className="text-xs text-text-muted">+{unit.aliases.length - 5} more</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(unit)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-red-500 hover:text-red-700"
                                onClick={() => { setUnitToDelete(unit); setDeleteDialogOpen(true); }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUnit ? 'Edit Unit' : 'Add New Unit'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Kilogram"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol *</Label>
                <Input
                  id="symbol"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                  placeholder="e.g., kg"
                  required
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit_type">Unit Type *</Label>
                <select
                  id="unit_type"
                  value={formData.unit_type}
                  onChange={(e) => setFormData({ ...formData, unit_type: e.target.value })}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                >
                  {UNIT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_base_unit}
                    onChange={(e) => setFormData({ ...formData, is_base_unit: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">This is the base unit for {formData.unit_type}</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Aliases (alternative names)</Label>
              <div className="flex gap-2">
                <Input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="e.g., kilogram, kilograms"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                />
                <Button type="button" variant="outline" onClick={addAlias}>Add</Button>
              </div>
              {formData.aliases.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.aliases.map((alias, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-stone-100 rounded text-sm">
                      {alias}
                      <button type="button" onClick={() => removeAlias(alias)} className="text-stone-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-text-muted">
                Add all possible variations of this unit name for matching (case-insensitive)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Additional notes about this unit"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingUnit ? 'Update Unit' : 'Create Unit'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{unitToDelete?.name}" ({unitToDelete?.symbol})? 
              This may affect existing data that uses this unit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUnitToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Unit Type Dialog */}
      <Dialog open={newUnitTypeDialog} onOpenChange={setNewUnitTypeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Unit Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="newUnitType">Unit Type Name *</Label>
              <Input
                id="newUnitType"
                value={newUnitType}
                onChange={(e) => setNewUnitType(e.target.value)}
                placeholder="e.g., currency, distance, time"
                data-testid="new-unit-type-input"
              />
              <p className="text-xs text-text-muted">
                Enter a name for the new unit type. This will be converted to lowercase and spaces replaced with underscores.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { setNewUnitTypeDialog(false); setNewUnitType(''); }}>
                Cancel
              </Button>
              <Button 
                onClick={addCustomUnitType}
                disabled={!newUnitType.trim()}
                data-testid="create-unit-type-button"
              >
                Create Unit Type
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
