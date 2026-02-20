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
import { Plus, Trash2, Activity, History, Filter, FileText, Download, Edit, Calendar as CalendarIcon, User, Eye, Info, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Quantity unit options with conversion factors to kg
const QUANTITY_UNITS = [
  { value: 'kg', label: 'Kilograms (kg)', toKg: 1 },
  { value: 'g', label: 'Grams (g)', toKg: 0.001 },
  { value: 'tonne', label: 'Tonnes (t)', toKg: 1000 },
  { value: 'lb', label: 'Pounds (lb)', toKg: 0.453592 },
  { value: 'L', label: 'Litres (L)', toKg: null, requiresDensity: true },
  { value: 'kL', label: 'Kilolitres (kL)', toKg: null, requiresDensity: true, densityMultiplier: 1000 },
  { value: 'm3', label: 'Cubic Metres (m³)', toKg: null, requiresDensity: true, densityMultiplier: 1000 },
  { value: 'gal', label: 'Gallons (US)', toKg: null, requiresDensity: true, densityMultiplier: 3.78541 },
];

// GWP Values (IPCC AR5) - used for CO2e calculation
const GWP = { CO2: 1, CH4: 28, N2O: 273 };

export default function Emissions() {
  const [emissions, setEmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [fuelDatabase, setFuelDatabase] = useState([]);
  const [formulaDefinitions, setFormulaDefinitions] = useState([]); // Super Admin defined formulas
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
  const [useCustomFuelType, setUseCustomFuelType] = useState(false);
  const [overrideCalorificValue, setOverrideCalorificValue] = useState(false);
  const [overrideDensity, setOverrideDensity] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(''); // Category selection before fuel
  const { getAuthHeader, user } = useAuth();

  const [formData, setFormData] = useState({
    facility_id: '',
    reporting_period_start: '',
    reporting_period_end: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    fuel_id: '',  // ID of selected fuel from database
    fuel_type: '',
    custom_fuel_type: '',
    custom_emission_factor: '',
    quantity: '',
    quantity_unit: 'kg', // Default to kg
    emission_factor_co2: '',
    emission_factor_ch4: '',
    emission_factor_n2o: '',
    calorific_value: '',
    calorific_value_unit: '',
    density: '',
    density_unit: '',
    conversion_factor: '1',
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
      const [emissionsRes, facilitiesRes, fuelDbRes, formulasRes] = await Promise.all([
        axios.get(`${API}/emissions`, { headers: getAuthHeader() }),
        axios.get(`${API}/facilities`, { headers: getAuthHeader() }),
        axios.get(`${API}/fuel-database`, { headers: getAuthHeader() }),
        axios.get(`${API}/formula-definitions`, { headers: getAuthHeader() }).catch(() => ({ data: [] }))
      ]);
      setEmissions(emissionsRes.data);
      setFacilities(facilitiesRes.data);
      setFuelDatabase(fuelDbRes.data || []);
      setFormulaDefinitions(formulasRes.data || []);
    } catch (error) {
      console.error('Emissions fetch error:', error);
      setEmissions([]);
      setFacilities([]);
      setFuelDatabase([]);
      setFormulaDefinitions([]);
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

  // Handle fuel selection from database
  const handleFuelSelect = (fuelId) => {
    if (!fuelId) {
      setFormData(prev => ({
        ...prev,
        fuel_id: '',
        fuel_type: '',
        category: '',
        sub_category: '',
        emission_factor_co2: '',
        emission_factor_ch4: '',
        emission_factor_n2o: '',
        calorific_value: '',
        calorific_value_unit: '',
        density: '',
        density_unit: '',
        conversion_factor: '1',
        source_of_information: '',
        is_custom_factor: false
      }));
      setOverrideCalorificValue(false);
      setOverrideDensity(false);
      return;
    }

    const fuel = fuelDatabase.find(f => f.id === fuelId);
    if (fuel) {
      setFormData(prev => ({
        ...prev,
        fuel_id: fuelId,
        fuel_type: fuel.fuel_name,
        category: fuel.category,
        sub_category: fuel.fuel_name,
        emission_factor_co2: fuel.emission_factor_co2?.toString() || '',
        emission_factor_ch4: fuel.emission_factor_ch4?.toString() || '',
        emission_factor_n2o: fuel.emission_factor_n2o?.toString() || '',
        calorific_value: fuel.calorific_value?.toString() || '',
        calorific_value_unit: fuel.calorific_value_unit || '',
        density: fuel.density?.toString() || '',
        density_unit: fuel.density_unit || '',
        conversion_factor: fuel.conversion_factor?.toString() || '1',
        source_of_information: fuel.source || '',
        is_custom_factor: false
      }));
      setOverrideCalorificValue(false);
      setOverrideDensity(false);
    }
  };

  // Handle category selection (step 1)
  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    // Reset fuel selection when category changes
    setFormData(prev => ({
      ...prev,
      fuel_id: '',
      fuel_type: '',
      category: category,
      sub_category: '',
      emission_factor_co2: '',
      emission_factor_ch4: '',
      emission_factor_n2o: '',
      calorific_value: '',
      calorific_value_unit: '',
      density: '',
      density_unit: '',
      source_of_information: ''
    }));
  };

  // Get fuels filtered by scope
  const getFuelsForScope = useMemo(() => {
    return fuelDatabase.filter(f => f.scope === formData.scope);
  }, [fuelDatabase, formData.scope]);

  // Get unique categories for the scope
  const getCategoriesForScope = useMemo(() => {
    const categories = [...new Set(getFuelsForScope.map(f => f.category))];
    return categories.sort();
  }, [getFuelsForScope]);

  // Get fuels for selected category
  const getFuelsForCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return getFuelsForScope.filter(f => f.category === selectedCategory);
  }, [getFuelsForScope, selectedCategory]);

  // Group fuels by category for better organization (keeping for filter dropdown)
  const getFuelsByCategory = useMemo(() => {
    const grouped = {};
    getFuelsForScope.forEach(fuel => {
      if (!grouped[fuel.category]) {
        grouped[fuel.category] = [];
      }
      grouped[fuel.category].push(fuel);
    });
    return grouped;
  }, [getFuelsForScope]);

  // Find applicable formula for current selection
  const getApplicableFormula = useMemo(() => {
    if (formulaDefinitions.length === 0) return null;
    
    // Find formula that matches the category (or is generic)
    const formula = formulaDefinitions.find(f => 
      f.is_active && 
      (!f.applicable_categories || f.applicable_categories.length === 0 || f.applicable_categories.includes(selectedCategory))
    );
    return formula;
  }, [formulaDefinitions, selectedCategory]);

  // Convert quantity to kg based on selected unit
  const getQuantityInKg = useMemo(() => {
    const quantity = parseFloat(formData.quantity) || 0;
    const unit = QUANTITY_UNITS.find(u => u.value === formData.quantity_unit);
    
    if (!unit) return quantity; // Default to assuming kg
    
    if (unit.requiresDensity) {
      const density = parseFloat(formData.density) || 1;
      const multiplier = unit.densityMultiplier || 1;
      return quantity * multiplier * density;
    }
    
    return quantity * (unit.toKg || 1);
  }, [formData.quantity, formData.quantity_unit, formData.density]);

  // Calculate emissions using Super Admin defined formulas (or fallback)
  const calculatedEmissions = useMemo(() => {
    const quantity = parseFloat(formData.quantity) || 0;
    const calorificValue = parseFloat(formData.calorific_value) || 0;
    const ncvUnit = formData.calorific_value_unit || 'TJ/Gg';
    const co2EF = parseFloat(formData.emission_factor_co2) || 0;
    const ch4EF = parseFloat(formData.emission_factor_ch4) || 0;
    const n2oEF = parseFloat(formData.emission_factor_n2o) || 0;
    
    if (!quantity || !calorificValue || !co2EF) return null;

    // Step 1: Convert quantity to kg using selected unit
    const quantityKg = getQuantityInKg;
    
    // Step 2: Convert NCV to TJ/kg based on unit
    let ncvTjPerKg = calorificValue;
    if (ncvUnit === 'TJ/Gg') {
      ncvTjPerKg = calorificValue * 0.001;
    } else if (ncvUnit === 'MJ/kg') {
      ncvTjPerKg = calorificValue * 0.000001;
    } else if (ncvUnit === 'GJ/t') {
      ncvTjPerKg = calorificValue * 0.001;
    }

    // Check if we have Super Admin defined formulas
    const formula = getApplicableFormula;
    let co2Emissions = 0;
    let ch4Emissions = 0;
    let n2oEmissions = 0;
    let appliedFormulaName = null;

    if (formula && formula.components && formula.components.length > 0) {
      // Use Super Admin formula
      appliedFormulaName = formula.formula_name;
      
      // Apply the formula based on components and operations
      // For now, we use the standard emission calculation but mark which formula is being used
      // The formula expression shows what calculation is being performed
      co2Emissions = quantityKg * ncvTjPerKg * co2EF;
      ch4Emissions = ch4EF ? quantityKg * ncvTjPerKg * ch4EF : 0;
      n2oEmissions = n2oEF ? quantityKg * ncvTjPerKg * n2oEF : 0;
    } else {
      // No formula defined - only calculate CO2 (the basic emission)
      // CH4 and N2O should NOT be calculated without explicit formulas
      appliedFormulaName = 'Basic CO₂ Calculation (No formula defined)';
      co2Emissions = quantityKg * ncvTjPerKg * co2EF;
      ch4Emissions = 0; // Don't calculate without formula
      n2oEmissions = 0; // Don't calculate without formula
    }
    
    // CO₂e = CO₂ + (CH₄ × GWP_CH4) + (N₂O × GWP_N2O)
    const co2eEmissions = co2Emissions + (ch4Emissions * GWP.CH4) + (n2oEmissions * GWP.N2O);
    
    return {
      co2Emissions,
      ch4Emissions,
      n2oEmissions,
      co2eEmissions,
      ncvTjPerKg,
      quantityKg,
      appliedFormulaName
    };
  }, [formData.quantity, formData.quantity_unit, formData.calorific_value, formData.calorific_value_unit,
      formData.emission_factor_co2, formData.emission_factor_ch4, formData.emission_factor_n2o, 
      formData.density, getQuantityInKg, getApplicableFormula]);

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
    
    // Justification required only for custom fuel types
    if (useCustomFuelType) {
      if (!formData.source_of_information) {
        toast.error('Source of information is required for custom fuel types');
        return;
      }
      if (!formData.justification) {
        toast.error('Justification is required for custom fuel types');
        return;
      }
    }

    // Validate required fields
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    if (!useCustomFuelType && !formData.fuel_id) {
      toast.error('Please select a fuel from the database');
      return;
    }

    // Validate custom fuel type fields
    if (useCustomFuelType) {
      if (!formData.custom_fuel_type) {
        toast.error('Custom fuel type name is required');
        return;
      }
      if (!formData.custom_emission_factor) {
        toast.error('CO2 emission factor is required for custom fuel type');
        return;
      }
    }

    // Calculate total emissions
    const calc = calculatedEmissions;
    if (!calc && !useCustomFuelType) {
      toast.error('Unable to calculate emissions. Please check all values.');
      return;
    }
    
    try {
      // Combine start and end periods
      const reportingPeriod = formData.reporting_period_start === formData.reporting_period_end
        ? formData.reporting_period_start
        : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;

      // Prepare payload with emission data
      const payload = {
        facility_id: formData.facility_id,
        reporting_period: reportingPeriod,
        scope: formData.scope,
        category: useCustomFuelType ? 'Custom' : formData.category,
        sub_category: useCustomFuelType ? formData.custom_fuel_type : formData.sub_category,
        fuel_type: useCustomFuelType ? formData.custom_fuel_type : formData.fuel_type,
        quantity: parseFloat(formData.quantity),
        emission_factor: useCustomFuelType 
          ? parseFloat(formData.custom_emission_factor) 
          : parseFloat(formData.emission_factor_co2) || 0,
        unit: useCustomFuelType ? 'kg CO2e/unit' : formData.calorific_value_unit || 'unit',
        calorific_value: useCustomFuelType ? null : parseFloat(formData.calorific_value) || null,
        source_of_information: formData.source_of_information,
        notes: formData.notes,
        justification: formData.justification,
        evidence_url: formData.evidence_url,
        responsible_person: formData.responsible_person,
        is_custom_factor: useCustomFuelType,
        // Fuel database reference
        fuel_database_id: useCustomFuelType ? null : formData.fuel_id,
        emission_factor_ch4: useCustomFuelType ? null : parseFloat(formData.emission_factor_ch4) || null,
        emission_factor_n2o: useCustomFuelType ? null : parseFloat(formData.emission_factor_n2o) || null,
        density: useCustomFuelType ? null : parseFloat(formData.density) || null,
        conversion_factor: 1  // Not used in the new formula, kept for compatibility
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
    
    // Check if this emission was created with a fuel from database
    const fuelFromDb = emission.fuel_database_id 
      ? fuelDatabase.find(f => f.id === emission.fuel_database_id)
      : null;
    
    setFormData({
      facility_id: emission.facility_id,
      reporting_period_start: startPeriod,
      reporting_period_end: endPeriod,
      scope: emission.scope,
      category: emission.category,
      sub_category: emission.sub_category,
      fuel_id: emission.fuel_database_id || '',
      fuel_type: emission.fuel_type || '',
      custom_fuel_type: '',
      custom_emission_factor: '',
      quantity: emission.quantity.toString(),
      quantity_unit: emission.unit || '',
      emission_factor_co2: emission.emission_factor?.toString() || '',
      emission_factor_ch4: emission.emission_factor_ch4?.toString() || '',
      emission_factor_n2o: emission.emission_factor_n2o?.toString() || '',
      calorific_value: emission.calorific_value?.toString() || fuelFromDb?.calorific_value?.toString() || '',
      calorific_value_unit: fuelFromDb?.calorific_value_unit || '',
      density: emission.density?.toString() || fuelFromDb?.density?.toString() || '',
      density_unit: fuelFromDb?.density_unit || '',
      conversion_factor: emission.conversion_factor?.toString() || '1',
      source_of_information: emission.source_of_information || '',
      justification: emission.justification || '',
      notes: emission.notes || '',
      responsible_person: emission.responsible_person || '',
      evidence_url: emission.evidence_url || '',
      is_custom_factor: emission.is_custom_factor || false
    });
    
    setUseCustomFuelType(emission.is_custom_factor || false);
    setOverrideCalorificValue(false);
    setOverrideDensity(false);
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
    setSelectedCategory(''); // Reset category selection
    setFormData({
      facility_id: '',
      reporting_period_start: '',
      reporting_period_end: '',
      scope: activeScope,
      category: '',
      sub_category: '',
      fuel_id: '',
      fuel_type: '',
      custom_fuel_type: '',
      custom_emission_factor: '',
      quantity: '',
      quantity_unit: 'kg', // Default to kg
      emission_factor_co2: '',
      emission_factor_ch4: '',
      emission_factor_n2o: '',
      calorific_value: '',
      calorific_value_unit: '',
      density: '',
      density_unit: '',
      conversion_factor: '1',
      source_of_information: '',
      justification: '',
      notes: '',
      responsible_person: '',
      evidence_url: '',
      is_custom_factor: false
    });
    setUploadedEvidence(null);
    setUseCustomFuelType(false);
    setOverrideCalorificValue(false);
    setOverrideDensity(false);
  };

  const handleDialogChange = (open) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  // Get unique categories from emissions for filtering
  const getCategories = useMemo(() => {
    const categories = {};
    fuelDatabase
      .filter(f => f.scope === formData.scope)
      .forEach(f => {
        if (!categories[f.category]) {
          categories[f.category] = {};
        }
        categories[f.category][f.fuel_name] = f;
      });
    return categories;
  }, [formData.scope, fuelDatabase]);

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

  const handleViewEvidence = (evidenceUrl, e) => {
    e.preventDefault();
    if (!evidenceUrl) {
      toast.error('No evidence file available');
      return;
    }
    
    // Extract file ID and open view URL
    const fileIdMatch = evidenceUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      window.open(`${BACKEND_URL}/api/files/${fileId}/view`, '_blank');
      return;
    }
    
    // For external or other URLs
    if (evidenceUrl.startsWith('http')) {
      window.open(evidenceUrl, '_blank');
    } else if (evidenceUrl.startsWith('/api')) {
      window.open(`${BACKEND_URL}${evidenceUrl}`, '_blank');
    } else {
      window.open(`${API}${evidenceUrl}`, '_blank');
    }
  };

  const handleDownloadEvidence = async (evidenceUrl, e) => {
    e.preventDefault();
    try {
      if (!evidenceUrl) {
        toast.error('No evidence file available');
        return;
      }
      
      toast.info('Starting download...');
      
      // Extract file ID and trigger download using fetch + blob
      const fileIdMatch = evidenceUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        const downloadUrl = `${BACKEND_URL}/api/files/${fileId}/download`;
        
        // Use fetch to get the file as blob
        const response = await fetch(downloadUrl, {
          method: 'GET',
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        
        // Get filename from Content-Disposition header if available
        let filename = 'evidence_file';
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
          }
        }
        
        // Add file extension based on content-type if missing
        const contentType = response.headers.get('content-type');
        if (contentType && !filename.includes('.')) {
          if (contentType.includes('pdf')) filename += '.pdf';
          else if (contentType.includes('image/png')) filename += '.png';
          else if (contentType.includes('image/jpeg')) filename += '.jpg';
          else if (contentType.includes('excel') || contentType.includes('spreadsheet')) filename += '.xlsx';
          else if (contentType.includes('word') || contentType.includes('document')) filename += '.docx';
        }
        
        // Create blob and download
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        // Create invisible link and click it
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
        toast.success('Download complete');
        return;
      }
      
      // For external URLs, open in new tab
      if (evidenceUrl.startsWith('http')) {
        window.open(evidenceUrl, '_blank');
      } else if (evidenceUrl.startsWith('/api')) {
        window.open(`${BACKEND_URL}${evidenceUrl}`, '_blank');
      } else {
        window.open(`${API}${evidenceUrl}`, '_blank');
      }
      
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
                      onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
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
                            onChange={(e) => {
                              setFormData({ ...formData, scope: e.target.value, fuel_id: '', category: '', sub_category: '' });
                              handleFuelSelect('');
                            }}
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

                {/* Fuel Selection - Step 1: Category, Step 2: Fuel */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Select Fuel from Database *</Label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={useCustomFuelType}
                        onChange={(e) => {
                          setUseCustomFuelType(e.target.checked);
                          setSelectedCategory('');
                          if (e.target.checked) {
                            handleFuelSelect('');
                            setFormData(prev => ({ ...prev, is_custom_factor: true }));
                          } else {
                            setFormData(prev => ({ ...prev, is_custom_factor: false, custom_fuel_type: '', custom_emission_factor: '' }));
                          }
                        }}
                        className="text-primary"
                      />
                      Use Custom Fuel Type
                    </label>
                  </div>
                  
                  {!useCustomFuelType ? (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Step 1: Category Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="category_select">Step 1: Select Category *</Label>
                        <select
                          id="category_select"
                          value={selectedCategory}
                          onChange={(e) => handleCategorySelect(e.target.value)}
                          required={!useCustomFuelType}
                          className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                          data-testid="category-select"
                        >
                          <option value="">Select category...</option>
                          {getCategoriesForScope.map(category => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Step 2: Fuel Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="fuel_select">Step 2: Select Fuel Type *</Label>
                        <select
                          id="fuel_select"
                          value={formData.fuel_id}
                          onChange={(e) => handleFuelSelect(e.target.value)}
                          required={!useCustomFuelType}
                          disabled={!selectedCategory}
                          className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${!selectedCategory ? 'opacity-50 cursor-not-allowed' : ''}`}
                          data-testid="fuel-select"
                        >
                          <option value="">{selectedCategory ? 'Select fuel...' : 'Select category first'}</option>
                          {getFuelsForCategory.map(fuel => (
                            <option key={fuel.id} value={fuel.id}>
                              {fuel.fuel_name} ({fuel.region})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 space-y-4">
                      <p className="text-sm text-amber-800">
                        <strong>Custom Fuel Type:</strong> Enter details for a fuel not in the database. Justification required.
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="custom_fuel_type">Fuel Type Name *</Label>
                          <Input
                            id="custom_fuel_type"
                            value={formData.custom_fuel_type}
                            onChange={(e) => setFormData({ ...formData, custom_fuel_type: e.target.value })}
                            required={useCustomFuelType}
                            placeholder="e.g., Bio-LPG, Custom Diesel Blend"
                            className="bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custom_emission_factor">Emission Factor (kg CO2e/unit) *</Label>
                          <Input
                            id="custom_emission_factor"
                            type="number"
                            step="0.0001"
                            value={formData.custom_emission_factor}
                            onChange={(e) => setFormData({ ...formData, custom_emission_factor: e.target.value })}
                            required={useCustomFuelType}
                            placeholder="e.g., 2.68"
                            className="bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Show selected fuel info */}
                  {formData.fuel_id && !useCustomFuelType && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-blue-800">Selected Fuel Parameters</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-blue-700">
                        <div>
                          <span className="text-xs text-blue-500">Category</span>
                          <p className="font-medium">{formData.category}</p>
                        </div>
                        <div>
                          <span className="text-xs text-blue-500">Calorific Value</span>
                          <p className="font-medium">{formData.calorific_value} {formData.calorific_value_unit}</p>
                        </div>
                        <div>
                          <span className="text-xs text-blue-500">CO2 EF</span>
                          <p className="font-medium">{formData.emission_factor_co2} kg/TJ</p>
                        </div>
                        <div>
                          <span className="text-xs text-blue-500">Source</span>
                          <p className="font-medium">{formData.source_of_information || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quantity Input */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="quantity"
                        type="number"
                        step="0.01"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        required
                        placeholder="Enter amount"
                        className="bg-stone-50 flex-1"
                        data-testid="quantity-input"
                      />
                      <select
                        value={formData.quantity_unit}
                        onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                        className="bg-stone-50 border border-stone-200 rounded-lg px-3 w-40"
                        data-testid="quantity-unit-select"
                      >
                        {QUANTITY_UNITS.map(unit => (
                          <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Show if density is required for volume units */}
                    {QUANTITY_UNITS.find(u => u.value === formData.quantity_unit)?.requiresDensity && !formData.density && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ Density required for volume-to-mass conversion. Please ensure density is set.
                      </p>
                    )}
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

                {/* Override Options for Calorific Value and Density */}
                {!useCustomFuelType && formData.fuel_id && (
                  <div className="p-4 bg-stone-50 rounded-lg border border-stone-200 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                      <Info className="w-4 h-4" />
                      Override Default Values (Optional)
                    </div>
                    
                    {/* Calorific Value Override */}
                    <div className="flex items-start gap-4">
                      <label className="flex items-center gap-2 min-w-[180px]">
                        <input
                          type="checkbox"
                          checked={overrideCalorificValue}
                          onChange={(e) => {
                            setOverrideCalorificValue(e.target.checked);
                            if (!e.target.checked) {
                              // Reset to fuel database value
                              const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                              if (fuel) {
                                setFormData(prev => ({
                                  ...prev,
                                  calorific_value: fuel.calorific_value?.toString() || ''
                                }));
                              }
                            }
                          }}
                          className="text-primary"
                        />
                        <span className="text-sm">Override Calorific Value</span>
                      </label>
                      {overrideCalorificValue && (
                        <div className="flex gap-2 flex-1">
                          <Input
                            type="number"
                            step="0.001"
                            value={formData.calorific_value}
                            onChange={(e) => setFormData({ ...formData, calorific_value: e.target.value })}
                            placeholder="Calorific Value"
                            className="bg-white flex-1"
                          />
                          <span className="flex items-center text-sm text-text-muted w-20">
                            {formData.calorific_value_unit}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Density Override */}
                    <div className="flex items-start gap-4">
                      <label className="flex items-center gap-2 min-w-[180px]">
                        <input
                          type="checkbox"
                          checked={overrideDensity}
                          onChange={(e) => {
                            setOverrideDensity(e.target.checked);
                            if (!e.target.checked) {
                              // Reset to fuel database value
                              const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                              if (fuel) {
                                setFormData(prev => ({
                                  ...prev,
                                  density: fuel.density?.toString() || ''
                                }));
                              }
                            }
                          }}
                          className="text-primary"
                        />
                        <span className="text-sm">Override Density</span>
                      </label>
                      {overrideDensity && (
                        <div className="flex gap-2 flex-1">
                          <Input
                            type="number"
                            step="0.001"
                            value={formData.density}
                            onChange={(e) => setFormData({ ...formData, density: e.target.value })}
                            placeholder="Density"
                            className="bg-white flex-1"
                          />
                          <span className="flex items-center text-sm text-text-muted w-20">
                            {formData.density_unit}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Calculated Emissions Display - Shows only final values */}
                {calculatedEmissions && !useCustomFuelType && (
                  <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                    <p className="text-sm font-medium text-text-secondary mb-3">Calculated Emissions</p>
                    
                    <div className="grid grid-cols-4 gap-3">
                      {/* CO2 Emissions */}
                      <div className="bg-white/70 p-3 rounded-lg border border-red-100">
                        <p className="text-xs text-red-600 font-medium mb-1">CO₂ Emissions</p>
                        <p className="text-lg font-bold text-red-700">
                          {calculatedEmissions.co2Emissions.toFixed(2)}
                        </p>
                      </div>
                      
                      {/* CH4 Emissions */}
                      <div className="bg-white/70 p-3 rounded-lg border border-orange-100">
                        <p className="text-xs text-orange-600 font-medium mb-1">CH₄ Emissions</p>
                        <p className="text-lg font-bold text-orange-700">
                          {calculatedEmissions.ch4Emissions.toFixed(2)}
                        </p>
                      </div>
                      
                      {/* N2O Emissions */}
                      <div className="bg-white/70 p-3 rounded-lg border border-purple-100">
                        <p className="text-xs text-purple-600 font-medium mb-1">N₂O Emissions</p>
                        <p className="text-lg font-bold text-purple-700">
                          {calculatedEmissions.n2oEmissions.toFixed(2)}
                        </p>
                      </div>
                      
                      {/* CO2e Total */}
                      <div className="bg-primary/10 p-3 rounded-lg border border-primary/30">
                        <p className="text-xs text-primary font-medium mb-1">CO₂e Total</p>
                        <p className="text-lg font-bold text-primary">
                          {calculatedEmissions.co2eEmissions.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Show calculation breakdown for Admin only (temporary) */}
                    {user?.role === 'admin' && calculatedEmissions && (
                      <div className="mt-4 pt-4 border-t border-primary/20">
                        <p className="text-xs font-medium text-text-muted mb-2">Calculation Details (Admin View)</p>
                        <div className="bg-white/50 p-3 rounded text-xs font-mono space-y-1 text-text-secondary">
                          <p className="font-bold">Canonical Formula:</p>
                          <p>Emissions (kg gas) = Quantity_kg × NCV_TJ/kg × EF_kg/TJ</p>
                          <p className="mt-2 text-primary">
                            Step 1: NCV = {formData.calorific_value} {formData.calorific_value_unit} → {calculatedEmissions.ncvTjPerKg?.toFixed(8)} TJ/kg
                          </p>
                          <p className="mt-1">Step 2: CO₂ = {calculatedEmissions.quantityKg} × {calculatedEmissions.ncvTjPerKg?.toFixed(8)} × {formData.emission_factor_co2} = {calculatedEmissions.co2Emissions?.toFixed(2)} kg</p>
                          <p>Step 2: CH₄ = {calculatedEmissions.quantityKg} × {calculatedEmissions.ncvTjPerKg?.toFixed(8)} × {formData.emission_factor_ch4 || 0} = {calculatedEmissions.ch4Emissions?.toFixed(2)} kg</p>
                          <p>Step 2: N₂O = {calculatedEmissions.quantityKg} × {calculatedEmissions.ncvTjPerKg?.toFixed(8)} × {formData.emission_factor_n2o || 0} = {calculatedEmissions.n2oEmissions?.toFixed(2)} kg</p>
                          <p className="mt-2 text-primary font-medium">Step 3: CO₂e = CO₂ + (CH₄ × 28) + (N₂O × 273) = {calculatedEmissions.co2eEmissions?.toFixed(2)} kg</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Simple calculation for custom fuel types */}
                {useCustomFuelType && formData.quantity && formData.custom_emission_factor && (
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm font-medium text-amber-800 mb-1">Calculated Emissions (Custom):</p>
                    <p className="text-2xl font-heading font-bold text-amber-900">
                      {(parseFloat(formData.quantity) * parseFloat(formData.custom_emission_factor)).toFixed(2)} kg CO₂e
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      = {formData.quantity} × {formData.custom_emission_factor} kg CO2e/unit
                    </p>
                  </div>
                )}

                {/* Justification for custom fuel types */}
                {useCustomFuelType && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="source">Source of Information *</Label>
                      <Input
                        id="source"
                        value={formData.source_of_information}
                        onChange={(e) => setFormData({ ...formData, source_of_information: e.target.value })}
                        required
                        placeholder="GHG Protocol, IPCC, etc."
                        className="bg-stone-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="justification">Justification for Custom Fuel Type *</Label>
                      <textarea
                        id="justification"
                        value={formData.justification}
                        onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                        required
                        rows={2}
                        placeholder="Explain why this custom fuel type is needed..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                      />
                    </div>
                  </>
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
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
                      </div>
                      
                      {/* Gas-wise Emission Breakdown */}
                      <div className="grid grid-cols-4 gap-3 mt-4 p-3 bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg">
                        <div className="text-center">
                          <p className="text-xs text-red-600 font-medium mb-1">CO₂</p>
                          <p className="text-sm font-bold text-red-700">
                            {emission.co2_emissions ? emission.co2_emissions.toFixed(2) : (emission.total_emissions || 0).toFixed(2)} kg
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-orange-600 font-medium mb-1">CH₄</p>
                          <p className="text-sm font-bold text-orange-700">
                            {(emission.ch4_emissions || 0).toFixed(2)} kg
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-purple-600 font-medium mb-1">N₂O</p>
                          <p className="text-sm font-bold text-purple-700">
                            {(emission.n2o_emissions || 0).toFixed(2)} kg
                          </p>
                        </div>
                        <div className="text-center bg-primary/10 rounded-lg py-1">
                          <p className="text-xs text-primary font-medium mb-1">Total CO₂e</p>
                          <p className="text-lg font-heading font-bold text-primary">
                            {(emission.co2e_emissions || emission.total_emissions || 0).toFixed(2)} kg
                          </p>
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
                        <div className="mt-2 flex items-center gap-3">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <button
                            onClick={(e) => handleViewEvidence(emission.evidence_url, e)}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                          {/* Only show Download for uploaded files, not external links */}
                          {emission.evidence_url.includes('/api/files/') && (
                            <button
                              onClick={(e) => handleDownloadEvidence(emission.evidence_url, e)}
                              className="text-sm text-green-600 hover:text-green-800 hover:underline flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </button>
                          )}
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
