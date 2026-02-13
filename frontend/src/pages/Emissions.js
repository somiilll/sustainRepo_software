import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { FileUpload } from '../components/ui/file-upload';
import { Plus, Trash2, Activity, History, Filter, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Emissions() {
  const [emissions, setEmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [standardFactors, setStandardFactors] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedEmissionHistory, setSelectedEmissionHistory] = useState([]);
  const [activeScope, setActiveScope] = useState('scope1');
  const [filterFacility, setFilterFacility] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { getAuthHeader } = useAuth();

  const [formData, setFormData] = useState({
    facility_id: '',
    reporting_period: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    fuel_type: '',
    quantity: '',
    emission_factor: '',
    unit: '',
    calorific_value: '',
    source_of_information: '',
    justification: '',
    notes: '',
    responsible_person: '',
    evidence_url: '',
    is_custom_factor: false
  });

  const [uploadedEvidence, setUploadedEvidence] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [emissionsRes, facilitiesRes, factorsRes] = await Promise.all([
        axios.get(`${API}/emissions`, { headers: getAuthHeader() }),
        axios.get(`${API}/facilities`, { headers: getAuthHeader() }),
        axios.get(`${API}/emission-factors/standard`)
      ]);
      setEmissions(emissionsRes.data);
      setFacilities(facilitiesRes.data);
      setStandardFactors(factorsRes.data);
    } catch (error) {
      // Don't show error toast - just log and show empty state
      console.error('Emissions fetch error:', error);
      setEmissions([]);
      setFacilities([]);
      setStandardFactors({});
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (emissionId) => {
    try {
      const response = await axios.get(`${API}/emissions/${emissionId}/history`, {
        headers: getAuthHeader()
      });
      setSelectedEmissionHistory(response.data);
      setHistoryDialogOpen(true);
    } catch (error) {
      toast.error('Failed to load version history');
    }
  };

  const handleCategoryChange = (category, subcategory) => {
    const factor = standardFactors[formData.scope]?.[category]?.[subcategory];
    if (factor) {
      setFormData(prev => ({
        ...prev,
        category,
        sub_category: subcategory,
        emission_factor: factor.factor,
        unit: factor.unit,
        source_of_information: factor.source || 'GHG Protocol',
        is_custom_factor: false
      }));
    }
  };

  const handleFileUpload = async (file) => {
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const response = await axios.post(`${API}/upload/evidence`, formDataUpload, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setUploadedEvidence({
        file_id: response.data.file_id,
        filename: response.data.filename,
        size: response.data.size,
        url: response.data.url,
        content_type: file.type
      });
      
      setFormData(prev => ({
        ...prev,
        evidence_url: response.data.url
      }));
      
      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(error.response?.data?.detail || 'Failed to upload file');
    }
  };

  const handleRemoveEvidence = async () => {
    if (uploadedEvidence?.file_id) {
      try {
        await axios.delete(`${API}/files/${uploadedEvidence.file_id}`, {
          headers: getAuthHeader()
        });
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
    setUploadedEvidence(null);
    setFormData(prev => ({ ...prev, evidence_url: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate custom factor requirements
    if (formData.is_custom_factor) {
      if (!formData.source_of_information) {
        toast.error('Source of information is required for custom factors');
        return;
      }
      if (!formData.justification) {
        toast.error('Justification is required for custom factors');
        return;
      }
    }
    
    try {
      const payload = {
        ...formData,
        quantity: parseFloat(formData.quantity),
        emission_factor: parseFloat(formData.emission_factor),
        calorific_value: formData.calorific_value ? parseFloat(formData.calorific_value) : null
      };
      
      await axios.post(`${API}/emissions`, payload, {
        headers: getAuthHeader()
      });
      toast.success('Emission record created successfully');
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this emission record?')) return;
    
    try {
      await axios.delete(`${API}/emissions/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Emission record deleted successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
  };

  const resetForm = () => {
    setFormData({
      facility_id: '',
      reporting_period: '',
      scope: activeScope,
      category: '',
      sub_category: '',
      fuel_type: '',
      quantity: '',
      emission_factor: '',
      unit: '',
      calorific_value: '',
      source_of_information: '',
      justification: '',
      notes: '',
      responsible_person: '',
      evidence_url: '',
      is_custom_factor: false
    });
    setUploadedEvidence(null);
  };

  const handleDialogChange = (open) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const scope1Categories = standardFactors.scope1 || {};
  const scope2Categories = standardFactors.scope2 || {};
  const biogenicCategories = standardFactors.biogenic || {};

  const getCategories = () => {
    if (formData.scope === 'scope1') return scope1Categories;
    if (formData.scope === 'scope2') return scope2Categories;
    return biogenicCategories;
  };

  // Apply filters
  const filteredEmissions = emissions.filter(e => {
    if (e.scope !== activeScope) return false;
    if (filterFacility && e.facility_id !== filterFacility) return false;
    if (filterPeriod && e.reporting_period !== filterPeriod) return false;
    if (filterCategory && e.category !== filterCategory) return false;
    return true;
  });

  // Get unique periods and categories for filters
  const uniquePeriods = [...new Set(emissions.map(e => e.reporting_period))].sort().reverse();
  const uniqueCategories = [...new Set(emissions.filter(e => e.scope === activeScope).map(e => e.category))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="emissions-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">Emissions</h1>
          <p className="text-text-secondary">Track and manage GHG emissions</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setShowFilters(!showFilters)}
            variant="outline"
            className="rounded-full"
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
          <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-emission-button">
                <Plus className="w-4 h-4 mr-2" />
                Add Emission
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Emission Record</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="emission-form">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="facility">Facility *</Label>
                    <select
                      id="facility"
                      value={formData.facility_id}
                      onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
                      required
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      data-testid="emission-facility-select"
                    >
                      <option value="">Select Facility</option>
                      {facilities.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reporting_period">Reporting Period *</Label>
                    <Input
                      id="reporting_period"
                      type="month"
                      value={formData.reporting_period}
                      onChange={(e) => setFormData({ ...formData, reporting_period: e.target.value })}
                      required
                      data-testid="emission-period-input"
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Scope *</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="scope1"
                        checked={formData.scope === 'scope1'}
                        onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                        className="text-primary"
                      />
                      Scope 1
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="scope2"
                        checked={formData.scope === 'scope2'}
                        onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                        className="text-primary"
                      />
                      Scope 2
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        value="biogenic"
                        checked={formData.scope === 'biogenic'}
                        onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                        className="text-primary"
                      />
                      Biogenic
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <select
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value, sub_category: '' })}
                      required
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      data-testid="emission-category-select"
                    >
                      <option value="">Select Category</option>
                      {Object.keys(getCategories()).map(cat => (
                        <option key={cat} value={cat}>{cat.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub_category">Sub-category *</Label>
                    <select
                      id="sub_category"
                      value={formData.sub_category}
                      onChange={(e) => handleCategoryChange(formData.category, e.target.value)}
                      required
                      disabled={!formData.category}
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 disabled:opacity-50"
                      data-testid="emission-subcategory-select"
                    >
                      <option value="">Select Sub-category</option>
                      {formData.category && Object.keys(getCategories()[formData.category] || {}).map(sub => (
                        <option key={sub} value={sub}>{sub.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      required
                      data-testid="emission-quantity-input"
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emission_factor">Emission Factor *</Label>
                    <Input
                      id="emission_factor"
                      type="number"
                      step="0.0001"
                      value={formData.emission_factor}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        emission_factor: e.target.value, 
                        is_custom_factor: true,
                        source_of_information: '' // Clear source when factor is changed
                      })}
                      required
                      data-testid="emission-factor-input"
                      className="bg-stone-50"
                    />
                    {formData.is_custom_factor && (
                      <p className="text-xs text-amber-600">Custom factor - source and justification required</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="kg CO2e/unit"
                      data-testid="emission-unit-input"
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="calorific_value">Calorific Value (if available)</Label>
                    <Input
                      id="calorific_value"
                      type="number"
                      step="0.01"
                      value={formData.calorific_value}
                      onChange={(e) => setFormData({ ...formData, calorific_value: e.target.value })}
                      placeholder="MJ/kg or MJ/m³"
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible_person">Responsible Person</Label>
                    <Input
                      id="responsible_person"
                      value={formData.responsible_person}
                      onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                {formData.quantity && formData.emission_factor && (
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="text-sm font-medium text-text-secondary mb-1">Calculated Emissions:</p>
                    <p className="text-2xl font-heading font-bold text-primary">
                      {(parseFloat(formData.quantity) * parseFloat(formData.emission_factor)).toFixed(2)} kg CO₂e
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="source">Source of Information {formData.is_custom_factor && '*'}</Label>
                  <Input
                    id="source"
                    value={formData.source_of_information}
                    onChange={(e) => setFormData({ ...formData, source_of_information: e.target.value })}
                    required={formData.is_custom_factor}
                    placeholder="e.g., GHG Protocol, Company measurements"
                    data-testid="emission-source-input"
                    className="bg-stone-50"
                  />
                </div>

                {formData.is_custom_factor && (
                  <div className="space-y-2">
                    <Label htmlFor="justification">Justification for Custom Factor *</Label>
                    <textarea
                      id="justification"
                      value={formData.justification}
                      onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                      required
                      rows={2}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                      placeholder="Explain why a custom emission factor is being used"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <FileUpload
                    label="Evidence Document"
                    onUpload={handleFileUpload}
                    onRemove={handleRemoveEvidence}
                    uploadedFile={uploadedEvidence}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                    data-testid="emission-notes-input"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => handleDialogChange(false)} data-testid="cancel-button">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/90 text-white" data-testid="submit-emission-button">
                    Add Emission
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {showFilters && (
        <Card className="p-4 border border-stone-200 rounded-xl bg-white">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Facility</Label>
              <select
                value={filterFacility}
                onChange={(e) => setFilterFacility(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="">All Facilities</option>
                {facilities.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="">All Periods</option>
                {uniquePeriods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
              >
                <option value="">All Categories</option>
                {uniqueCategories.map(c => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  setFilterFacility('');
                  setFilterPeriod('');
                  setFilterCategory('');
                }}
                variant="outline"
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Tabs value={activeScope} onValueChange={setActiveScope} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="scope1" data-testid="scope1-tab">Scope 1</TabsTrigger>
          <TabsTrigger value="scope2" data-testid="scope2-tab">Scope 2</TabsTrigger>
          <TabsTrigger value="biogenic" data-testid="biogenic-tab">Biogenic</TabsTrigger>
        </TabsList>

        <TabsContent value={activeScope} className="mt-6">
          <div className="space-y-4">
            {filteredEmissions.map((emission) => {
              const facility = facilities.find(f => f.id === emission.facility_id);
              return (
                <Card key={emission.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow" data-testid={`emission-card-${emission.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="bg-primary/10 p-2 rounded-lg">
                          <Activity className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-heading font-bold text-text-primary">{facility?.name || 'Unknown Facility'}</h3>
                          <p className="text-sm text-text-muted">{emission.reporting_period}</p>
                        </div>
                        {emission.is_custom_factor && (
                          <span className="px-3 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full">
                            Custom Factor
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-text-muted mb-1">Category</p>
                          <p className="text-sm font-medium text-text-primary capitalize">{emission.category.replace('_', ' ')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Sub-category</p>
                          <p className="text-sm font-medium text-text-primary capitalize">{emission.sub_category.replace('_', ' ')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Quantity</p>
                          <p className="text-sm font-medium text-text-primary">{emission.quantity}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Total Emissions</p>
                          <p className="text-lg font-heading font-bold text-primary">{emission.total_emissions.toFixed(2)} kg CO₂e</p>
                        </div>
                      </div>
                      {emission.justification && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-lg">
                          <p className="text-xs font-medium text-amber-800 mb-1">Justification:</p>
                          <p className="text-sm text-amber-900">{emission.justification}</p>
                        </div>
                      )}
                      {emission.source_of_information && (
                        <div className="mt-2">
                          <p className="text-xs text-text-muted">Source: <span className="text-text-primary font-medium">{emission.source_of_information}</span></p>
                        </div>
                      )}
                      {emission.evidence_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <a 
                            href={`${BACKEND_URL}${emission.evidence_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                            data-testid={`evidence-link-${emission.id}`}
                          >
                            <Download className="w-3 h-3" />
                            View Evidence Document
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => fetchHistory(emission.id)}
                        title="View History"
                      >
                        <History className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(emission.id)}
                        className="text-accent hover:text-accent"
                        data-testid={`delete-emission-${emission.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}

            {filteredEmissions.length === 0 && (
              <div className="text-center py-12">
                <Activity className="w-16 h-16 mx-auto text-text-muted mb-4" />
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">No {activeScope.replace('scope', 'Scope ').replace('biogenic', 'Biogenic')} emissions yet</h3>
                <p className="text-text-secondary mb-4">{showFilters && (filterFacility || filterPeriod || filterCategory) ? 'Try adjusting your filters' : 'Get started by adding your first emission record'}</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Version History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedEmissionHistory.length > 0 ? (
              selectedEmissionHistory.map((history, idx) => (
                <Card key={history.id} className="p-4 border border-stone-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <History className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary mb-1">
                        Change #{selectedEmissionHistory.length - idx}
                      </p>
                      <p className="text-xs text-text-muted mb-2">
                        {new Date(history.changed_at).toLocaleString()}
                      </p>
                      <div className="text-xs text-text-secondary">
                        <p className="font-medium mb-1">Changed by: {history.changed_by}</p>
                        {history.changes && (
                          <div className="mt-2 p-2 bg-stone-50 rounded">
                            <p className="font-medium mb-1">Changes made:</p>
                            <p className="text-xs">Old quantity: {history.changes.old_values?.quantity}</p>
                            <p className="text-xs">New quantity: {history.changes.new_values?.quantity}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-text-muted">
                <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No version history available</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}