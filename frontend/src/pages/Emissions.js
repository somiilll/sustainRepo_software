import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { FileUpload } from '../components/ui/file-upload';
import { Plus, Trash2, Activity, History, Filter, FileText, Download, Edit, Calendar as CalendarIcon, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Emissions() {
  const [emissions, setEmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [standardFactors, setStandardFactors] = useState({});
  const [customFactors, setCustomFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedEmissionHistory, setSelectedEmissionHistory] = useState([]);
  const [activeScope, setActiveScope] = useState('scope1');
  const [filterFacility, setFilterFacility] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateRange, setFilterDateRange] = useState({ from: null, to: null });
  const [showFilters, setShowFilters] = useState(false);
  const [editingEmission, setEditingEmission] = useState(null);
  const { getAuthHeader, user } = useAuth();

  const [formData, setFormData] = useState({
    facility_id: '',
    reporting_period_start: '',
    reporting_period_end: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    fuel_type: '',
    quantity: '',
    quantity_unit: '',
    emission_factor: '',
    unit: '',
    calorific_value: '',
    source_of_information: '',
    justification: '',
    notes: '',
    responsible_person: '',
    evidence_url: '',
    is_custom_factor: false,
    is_super_admin_factor: false
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
        axios.get(`${API}/emission-factors`, { headers: getAuthHeader() })
      ]);
      setEmissions(emissionsRes.data);
      setFacilities(facilitiesRes.data);
      // All factors now come from DB (both standard and custom)
      setCustomFactors(factorsRes.data || []);
      // No more hardcoded standardFactors - set empty object
      setStandardFactors({});
    } catch (error) {
      console.error('Emissions fetch error:', error);
      setEmissions([]);
      setFacilities([]);
      setStandardFactors({});
      setCustomFactors([]);
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
    // Get the selected facility's country for country-specific factor matching
    const selectedFacility = facilities.find(f => f.id === formData.facility_id);
    const facilityCountry = selectedFacility?.country;
    
    // All factors now come from database - check customFactors array
    // Priority: 1. Country-specific factor, 2. Global/Generic factor
    let factor = null;
    
    if (facilityCountry) {
      // First try to find a country-specific factor
      factor = customFactors.find(
        f => f.scope === formData.scope && 
             f.category === category && 
             f.sub_category === subcategory &&
             (f.region === facilityCountry || f.region?.toLowerCase() === facilityCountry.toLowerCase())
      );
    }
    
    // If no country-specific factor found, fall back to global/generic factor
    if (!factor) {
      factor = customFactors.find(
        f => f.scope === formData.scope && 
             f.category === category && 
             f.sub_category === subcategory &&
             (!f.region || f.region === 'Global (All Regions)' || f.region.toLowerCase().includes('global'))
      );
    }
    
    // If still no factor, try any matching factor (for backwards compatibility)
    if (!factor) {
      factor = customFactors.find(
        f => f.scope === formData.scope && f.category === category && f.sub_category === subcategory
      );
    }
    
    if (factor) {
      const isCountrySpecific = facilityCountry && factor.region && 
        (factor.region === facilityCountry || factor.region?.toLowerCase() === facilityCountry.toLowerCase());
      
      setFormData(prev => ({
        ...prev,
        category,
        sub_category: subcategory,
        emission_factor: factor.factor,
        unit: factor.unit,
        source_of_information: factor.source || `Emission Factor${isCountrySpecific ? ` (${factor.region})` : ''}`,
        is_custom_factor: factor.is_custom === true, // Custom factor needs justification
        is_super_admin_factor: factor.is_custom === false // Standard factor created by Super Admin
      }));
    } else {
      // No factor found - clear values
      setFormData(prev => ({
        ...prev,
        category,
        sub_category: subcategory,
        emission_factor: '',
        unit: '',
        source_of_information: '',
        is_custom_factor: false,
        is_super_admin_factor: false
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
    
    // Justification required only for manually entered custom factors by Admin/User
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
      // Combine start and end periods
      const reportingPeriod = formData.reporting_period_start === formData.reporting_period_end
        ? formData.reporting_period_start
        : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;

      const payload = {
        facility_id: formData.facility_id,
        reporting_period: reportingPeriod,
        scope: formData.scope,
        category: formData.category,
        sub_category: formData.sub_category,
        fuel_type: formData.fuel_type,
        quantity: parseFloat(formData.quantity),
        emission_factor: parseFloat(formData.emission_factor),
        unit: formData.unit,
        calorific_value: formData.calorific_value ? parseFloat(formData.calorific_value) : null,
        source_of_information: formData.source_of_information,
        notes: formData.notes,
        justification: formData.justification,
        evidence_url: formData.evidence_url,
        responsible_person: formData.responsible_person,
        is_custom_factor: formData.is_custom_factor
      };
      
      if (editingEmission) {
        await axios.put(`${API}/emissions/${editingEmission.id}`, payload, {
          headers: getAuthHeader()
        });
        toast.success('Emission record updated successfully');
      } else {
        await axios.post(`${API}/emissions`, payload, {
          headers: getAuthHeader()
        });
        toast.success('Emission record created successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEdit = (emission) => {
    const [startPeriod, endPeriod] = emission.reporting_period.includes(' to ')
      ? emission.reporting_period.split(' to ')
      : [emission.reporting_period, emission.reporting_period];

    setEditingEmission(emission);
    setFormData({
      facility_id: emission.facility_id,
      reporting_period_start: startPeriod,
      reporting_period_end: endPeriod,
      scope: emission.scope,
      category: emission.category,
      sub_category: emission.sub_category,
      fuel_type: emission.fuel_type || '',
      quantity: emission.quantity.toString(),
      quantity_unit: emission.unit || '',
      emission_factor: emission.emission_factor.toString(),
      unit: emission.unit || '',
      calorific_value: emission.calorific_value?.toString() || '',
      source_of_information: emission.source_of_information || '',
      justification: emission.justification || '',
      notes: emission.notes || '',
      responsible_person: emission.responsible_person || '',
      evidence_url: emission.evidence_url || '',
      is_custom_factor: emission.is_custom_factor || false
    });
    setDialogOpen(true);
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
    setEditingEmission(null);
    setFormData({
      facility_id: '',
      reporting_period_start: '',
      reporting_period_end: '',
      scope: activeScope,
      category: '',
      sub_category: '',
      fuel_type: '',
      quantity: '',
      quantity_unit: '',
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

  // Get all categories from the factors in the database
  const getCategories = useMemo(() => {
    // Build categories from database factors (both standard and custom)
    const categories = {};
    customFactors
      .filter(f => f.scope === formData.scope)
      .forEach(f => {
        if (!categories[f.category]) {
          categories[f.category] = {};
        }
        categories[f.category][f.sub_category] = { 
          factor: f.factor, 
          unit: f.unit, 
          source: f.source,
          is_custom: f.is_custom
        };
      });

    return categories;
  }, [formData.scope, customFactors]);

  // Apply filters
  const filteredEmissions = useMemo(() => {
    return emissions.filter(e => {
      if (e.scope !== activeScope) return false;
      if (filterFacility && e.facility_id !== filterFacility) return false;
      
      // Date range filter
      if (filterDateRange.from || filterDateRange.to) {
        const periodDate = new Date(e.reporting_period.split(' to ')[0] + '-01');
        if (filterDateRange.from && periodDate < filterDateRange.from) return false;
        if (filterDateRange.to && periodDate > filterDateRange.to) return false;
      }
      
      if (filterCategory && e.category !== filterCategory) return false;
      return true;
    });
  }, [emissions, activeScope, filterFacility, filterCategory, filterDateRange]);

  const uniqueCategories = useMemo(() => {
    return [...new Set(emissions.filter(e => e.scope === activeScope).map(e => e.category))];
  }, [emissions, activeScope]);

  // Check if user is regular user (not admin or super_admin)
  const isRegularUser = user?.role === 'user';

  const handleDownloadEvidence = async (evidenceUrl, e) => {
    e.preventDefault();
    try {
      // Handle different types of evidence URLs:
      // 1. External URLs (http:// or https://) - open in new tab
      // 2. Full backend URLs (containing the backend domain) - download with auth
      // 3. API file URLs (/api/files/...) - download with auth
      // 4. Other relative paths - append to API
      
      // Check if it's an external URL (not our backend)
      if (evidenceUrl.startsWith('http://') || evidenceUrl.startsWith('https://')) {
        // Check if it's our backend URL
        if (!evidenceUrl.includes(BACKEND_URL.replace('https://', '').replace('http://', ''))) {
          // External URL - open in new tab
          window.open(evidenceUrl, '_blank');
          return;
        }
      }
      
      // Construct download URL
      let downloadUrl;
      if (evidenceUrl.startsWith('http://') || evidenceUrl.startsWith('https://')) {
        // Full URL - use as is
        downloadUrl = evidenceUrl;
      } else if (evidenceUrl.startsWith('/api')) {
        downloadUrl = `${BACKEND_URL}${evidenceUrl}`;
      } else {
        downloadUrl = `${API}${evidenceUrl}`;
      }
      
      const response = await axios.get(downloadUrl, {
        headers: getAuthHeader(),
        responseType: 'blob'
      });
      
      // Get filename from Content-Disposition header or extract from URL
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'evidence_document';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      } else {
        // Extract filename from URL
        const urlParts = evidenceUrl.split('/');
        filename = urlParts[urlParts.length - 1] || 'evidence_document';
      }
      
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('File downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download evidence file');
    }
  };

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
                <DialogTitle>{editingEmission ? 'Update' : 'Add'} Emission Record</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="emission-form">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="facility">Facility *</Label>
                    <select
                      id="facility"
                      value={formData.facility_id}
                      onChange={(e) => {
                        const newFacilityId = e.target.value;
                        const newFacility = facilities.find(f => f.id === newFacilityId);
                        // Show notification if country-specific factors might apply
                        if (newFacility?.country && formData.category && formData.sub_category) {
                          // Re-trigger category change to apply country-specific factor
                          setFormData({ ...formData, facility_id: newFacilityId });
                          // After state update, trigger category change
                          setTimeout(() => {
                            handleCategoryChange(formData.category, formData.sub_category);
                          }, 0);
                        } else {
                          setFormData({ ...formData, facility_id: newFacilityId });
                        }
                      }}
                      required
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      data-testid="emission-facility-select"
                    >
                      <option value="">Select Facility</option>
                      {facilities.map(f => (
                        <option key={f.id} value={f.id}>{f.name} {f.country ? `(${f.country})` : ''}</option>
                      ))}
                    </select>
                    {formData.facility_id && (
                      <p className="text-xs text-text-muted">
                        Country: {facilities.find(f => f.id === formData.facility_id)?.country || 'Not specified'}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Scope *</Label>
                    <div className="flex gap-4 h-10 items-center">
                      {['scope1', 'scope2', 'biogenic'].map(scope => (
                        <label key={scope} className="flex items-center gap-2">
                          <input
                            type="radio"
                            value={scope}
                            checked={formData.scope === scope}
                            onChange={(e) => setFormData({ ...formData, scope: e.target.value, category: '', sub_category: '' })}
                            className="text-primary"
                          />
                          {scope === 'biogenic' ? 'Biogenic' : `Scope ${scope.slice(-1)}`}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Reporting Period with Start and End */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reporting_period_start">
                      <CalendarIcon className="w-4 h-4 inline mr-1" />
                      Reporting Period Start *
                    </Label>
                    <Input
                      id="reporting_period_start"
                      type="month"
                      value={formData.reporting_period_start}
                      onChange={(e) => setFormData({ ...formData, reporting_period_start: e.target.value })}
                      required
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reporting_period_end">
                      <CalendarIcon className="w-4 h-4 inline mr-1" />
                      Reporting Period End *
                    </Label>
                    <Input
                      id="reporting_period_end"
                      type="month"
                      value={formData.reporting_period_end}
                      onChange={(e) => setFormData({ ...formData, reporting_period_end: e.target.value })}
                      required
                      min={formData.reporting_period_start}
                      className="bg-stone-50"
                    />
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
                    >
                      <option value="">Select Category</option>
                      {Object.keys(getCategories).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub_category">Sub-category / Fuel Type *</Label>
                    <select
                      id="sub_category"
                      value={formData.sub_category}
                      onChange={(e) => handleCategoryChange(formData.category, e.target.value)}
                      required
                      disabled={!formData.category}
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 disabled:opacity-50"
                    >
                      <option value="">Select Sub-category</option>
                      {formData.category && Object.keys(getCategories[formData.category] || {}).map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quantity with Unit */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="quantity"
                        type="number"
                        step="0.01"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        required
                        className="bg-stone-50 flex-1"
                      />
                      <Input
                        placeholder="Unit (L, kg, m³...)"
                        value={formData.quantity_unit}
                        onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                        className="bg-stone-50 w-32"
                      />
                    </div>
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
                        is_custom_factor: true, // User manually entered - requires justification
                        is_super_admin_factor: false,
                        source_of_information: ''
                      })}
                      required
                      className="bg-stone-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Factor Unit</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="kg CO2e/L"
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                {formData.is_custom_factor && (
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <p className="text-xs text-amber-700">Custom factor detected - source and justification required</p>
                  </div>
                )}

                {formData.quantity && formData.emission_factor && (
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="text-sm font-medium text-text-secondary mb-1">Calculated Emissions:</p>
                    <p className="text-2xl font-heading font-bold text-primary">
                      {(parseFloat(formData.quantity) * parseFloat(formData.emission_factor)).toFixed(2)} kg CO₂e
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="source">Source of Information {formData.is_custom_factor && '*'}</Label>
                    <Input
                      id="source"
                      value={formData.source_of_information}
                      onChange={(e) => setFormData({ ...formData, source_of_information: e.target.value })}
                      required={formData.is_custom_factor}
                      placeholder="GHG Protocol, IPCC, etc."
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
                    />
                  </div>
                )}

                <FileUpload
                  label="Evidence Document"
                  onUpload={handleFileUpload}
                  onRemove={handleRemoveEvidence}
                  uploadedFile={uploadedEvidence}
                />

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                    {editingEmission ? 'Update' : 'Add'} Emission
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {showFilters && (
        <Card className="p-4 border border-stone-200 rounded-xl bg-white">
          <div className="flex flex-col gap-4">
            {/* First row: Facility and Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Facility</Label>
                <select
                  value={filterFacility}
                  onChange={(e) => setFilterFacility(e.target.value)}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                >
                  <option value="">All Facilities</option>
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                >
                  <option value="">All Categories</option>
                  {uniqueCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Second row: Date Range and Clear button */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex gap-2">
                  <Input
                    type="month"
                    value={filterDateRange.from ? format(filterDateRange.from, 'yyyy-MM') : ''}
                    onChange={(e) => setFilterDateRange(prev => ({ 
                      ...prev, 
                      from: e.target.value ? new Date(e.target.value) : null 
                    }))}
                    className="flex-1 h-10 bg-stone-50 text-sm"
                    placeholder="From"
                  />
                  <Input
                    type="month"
                    value={filterDateRange.to ? format(filterDateRange.to, 'yyyy-MM') : ''}
                    onChange={(e) => setFilterDateRange(prev => ({ 
                      ...prev, 
                      to: e.target.value ? new Date(e.target.value) : null 
                    }))}
                    className="flex-1 h-10 bg-stone-50 text-sm"
                    placeholder="To"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => {
                    setFilterFacility('');
                    setFilterCategory('');
                    setFilterDateRange({ from: null, to: null });
                  }}
                  variant="outline"
                  className="w-full h-10"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Tabs value={activeScope} onValueChange={setActiveScope} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="scope1">Scope 1</TabsTrigger>
          <TabsTrigger value="scope2">Scope 2</TabsTrigger>
          <TabsTrigger value="biogenic">Biogenic</TabsTrigger>
        </TabsList>

        <TabsContent value={activeScope} className="mt-6">
          <div className="space-y-4">
            {filteredEmissions.map((emission) => {
              const facility = facilities.find(f => f.id === emission.facility_id);
              return (
                <Card key={emission.id} className="p-6 border border-stone-200 rounded-xl bg-white hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <div className="bg-primary/10 p-2 rounded-lg">
                          <Activity className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-heading font-bold text-text-primary">{facility?.name || 'Unknown'}</h3>
                          <p className="text-sm text-text-muted">{emission.reporting_period}</p>
                        </div>
                        {emission.is_custom_factor && (
                          <span className="px-3 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full">
                            Custom Factor
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-text-muted mb-1">Category</p>
                          <p className="text-sm font-medium text-text-primary">{emission.category}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Sub-category</p>
                          <p className="text-sm font-medium text-text-primary">{emission.sub_category}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Quantity</p>
                          <p className="text-sm font-medium text-text-primary">
                            {emission.quantity} {emission.unit && <span className="text-text-muted">({emission.unit.split('/')[1] || 'units'})</span>}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Emission Factor</p>
                          <p className="text-sm font-medium text-text-primary">{emission.emission_factor} {emission.unit}</p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Total Emissions</p>
                          <p className="text-lg font-heading font-bold text-primary">{emission.total_emissions.toFixed(2)} kg CO₂e</p>
                        </div>
                      </div>

                      {/* Created/Updated Info */}
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
                        {emission.created_by_email && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Created by: {emission.created_by_email}
                          </span>
                        )}
                        {emission.created_at && (
                          <span>Created: {new Date(emission.created_at).toLocaleDateString()}</span>
                        )}
                        {emission.updated_by_email && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Updated by: {emission.updated_by_email}
                          </span>
                        )}
                        {emission.updated_at && (
                          <span>Updated: {new Date(emission.updated_at).toLocaleDateString()}</span>
                        )}
                      </div>

                      {emission.evidence_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <button
                            onClick={(e) => handleDownloadEvidence(emission.evidence_url, e)}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            Download Evidence
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(emission)}
                        title="Edit Emission"
                        data-testid={`edit-emission-${emission.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {!isRegularUser && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => fetchHistory(emission.id)}
                          title="View History"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(emission.id)}
                        className="text-accent hover:text-accent"
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
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  No {activeScope === 'biogenic' ? 'Biogenic' : `Scope ${activeScope.slice(-1)}`} emissions
                </h3>
                <p className="text-text-secondary mb-4">
                  {showFilters && (filterFacility || filterDateRange.from || filterDateRange.to || filterCategory) 
                    ? 'Try adjusting your filters' 
                    : 'Add your first emission record'}
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Version History Dialog - Simplified view */}
      {!isRegularUser && (
        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedEmissionHistory.length > 0 ? (
                selectedEmissionHistory.map((history, idx) => {
                  const action = history.changes?.action || (idx === 0 ? 'created' : 'updated');
                  const isCreation = action === 'created';
                  return (
                    <Card key={history.id} className="p-4 border border-stone-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${isCreation ? 'bg-green-100' : 'bg-primary/10'}`}>
                          <History className={`w-4 h-4 ${isCreation ? 'text-green-600' : 'text-primary'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-text-primary">
                              {isCreation ? 'Created' : 'Updated'}
                            </p>
                            <span className={`text-xs px-2 py-1 rounded ${
                              idx === 0 ? 'bg-green-100 text-green-700' : 
                              idx === selectedEmissionHistory.length - 1 ? 'bg-blue-100 text-blue-700' : 'bg-stone-100'
                            }`}>
                              {idx === 0 ? 'Initial' : idx === selectedEmissionHistory.length - 1 ? 'Latest' : ''}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm text-text-primary flex items-center gap-2">
                              <CalendarIcon className="w-4 h-4 text-text-muted" />
                              {new Date(history.changed_at).toLocaleString()}
                            </p>
                            <p className="text-sm text-text-secondary flex items-center gap-2">
                              <User className="w-4 h-4 text-text-muted" />
                              {history.changed_by_email || 'Unknown User'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-8 text-text-muted">
                  <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No version history available</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
