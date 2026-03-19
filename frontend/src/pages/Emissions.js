import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { MonthYearPicker } from '../components/ui/month-year-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { FileUpload } from '../components/ui/file-upload';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Plus, Trash2, Activity, History, Filter, FileText, Download, Edit, Calendar as CalendarIcon, User, Eye, Info, Calculator, Upload, X, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import EmissionEntryForm from '../components/EmissionEntryForm';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Emissions() {
  const [emissions, setEmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [fuelDatabase, setFuelDatabase] = useState([]);
  const [formulaDefinitions, setFormulaDefinitions] = useState([]); // Super Admin defined formulas
  const [formulaParameters, setFormulaParameters] = useState([]); // Super Admin defined parameters with conversions
  const [emissionConfigurations, setEmissionConfigurations] = useState([]); // Scope-to-formula mappings
  const [loading, setLoading] = useState(true);
  const [formulaDataReady, setFormulaDataReady] = useState(false); // Track when formula data is loaded
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedEmissionHistory, setSelectedEmissionHistory] = useState([]);
  const [activeScope, setActiveScope] = useState('scope1');
  const [filterFacility, setFilterFacility] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateRange, setFilterDateRange] = useState({ from: null, to: null });
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // Sort options: date, facility, fuel, emissions
  const [sortOrder, setSortOrder] = useState('desc'); // asc or desc
  const [editingEmission, setEditingEmission] = useState(null);
  const [useCustomFuelType, setUseCustomFuelType] = useState(false);
  const [overrideCalorificValue, setOverrideCalorificValue] = useState(false);
  const [overrideDensity, setOverrideDensity] = useState(false);
  
  const [selectedCategory, setSelectedCategory] = useState(''); // Category selection before fuel
  const { getAuthHeader, user } = useAuth();

  // Emission factor unit options for custom fuels
  const EMISSION_FACTOR_UNITS = [
    { value: 'tCO2/kg', label: 'tCO₂/kg', quantityUnit: 'kg', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/L', label: 'tCO₂/L', quantityUnit: 'L', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/m3', label: 'tCO₂/m³', quantityUnit: 'm³', forScope: ['scope1', 'biogenic'] },
    { value: 'tCO2/kWh', label: 'tCO₂/kWh', quantityUnit: 'kWh', forScope: ['scope2'] },
    { value: 'tCO2/MWh', label: 'tCO₂/MWh', quantityUnit: 'MWh', forScope: ['scope2'] },
  ];

  // Get available EF units based on scope
  const getAvailableEFUnits = (currentScope) => {
    return EMISSION_FACTOR_UNITS.filter(u => u.forScope.includes(currentScope));
  };

  // Get quantity unit based on emission factor unit for custom fuels
  const getQuantityUnitFromEFUnit = (efUnit) => {
    const mapping = EMISSION_FACTOR_UNITS.find(u => u.value === efUnit);
    return mapping?.quantityUnit || 'kg';
  };

  // New: Monthly data structure for year-based entry
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear().toString());
  const [monthlyData, setMonthlyData] = useState({});
  const [formStep, setFormStep] = useState(1); // Step-based form

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
    emission_factor_unit: 'tCO2/kg', // EF unit for custom fuels
    quantity: '',
    quantity_unit: 'kg', // Default to kg
    emission_factor_co2: '',
    emission_factor_ch4: '',
    emission_factor_n2o: '',
    emission_factor_basis_quantity: '', // For Scope 2 electricity
    emission_factor_basis_unit: '', // For Scope 2 electricity
    calorific_value: '',
    calorific_value_unit: '',
    calorific_value_justification: '', // Justification when overriding calorific value
    density: '',
    density_unit: '',
    density_justification: '', // Justification when overriding density
    conversion_factor: '1',
    source_of_information: '',
    justification: '',
    notes: '',
    responsible_person: '',
    evidence_url: '',
    is_custom_factor: false,
    process_names: [{ name: '', description: '' }], // Array for multiple process names with descriptions
    process_descriptions: [], // For backward compatibility
    // Process Emissions fields
    template_id: '',
    template_inputs: {},
    calculated_co2e: ''
  });

  // CRITICAL: Use refs to always have fresh values in event handlers
  // This fixes stale closure issues with React state in async handlers
  const overrideCalorificValueRef = useRef(overrideCalorificValue);
  const overrideDensityRef = useRef(overrideDensity);
  const formDataRef = useRef(formData);
  
  // Keep refs in sync with state
  useEffect(() => {
    overrideCalorificValueRef.current = overrideCalorificValue;
  }, [overrideCalorificValue]);
  
  useEffect(() => {
    overrideDensityRef.current = overrideDensity;
  }, [overrideDensity]);
  
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Check if we're editing a process emission
  const isEditingProcessEmission = editingEmission && editingEmission.category === 'Process Emissions';

  const [uploadedEvidence, setUploadedEvidence] = useState(null);
  const [existingEvidences, setExistingEvidences] = useState([]); // Track existing evidences when editing
  const [centralizedUnits, setCentralizedUnits] = useState([]);
  const [gwpConfig, setGwpConfig] = useState(null); // GWP Configuration from SuperAdmin
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [emissionToDelete, setEmissionToDelete] = useState(null);
  const [processTemplates, setProcessTemplates] = useState([]); // Process templates from SuperAdmin

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setFormulaDataReady(false); // Reset formula data ready state
    try {
      const [emissionsRes, facilitiesRes, fuelDbRes, formulasRes, paramsRes, unitsRes, configsRes, gwpRes, templatesRes, orgRes] = await Promise.all([
        axios.get(`${API}/emissions`, { headers: getAuthHeader() }),
        axios.get(`${API}/facilities`, { headers: getAuthHeader() }),
        axios.get(`${API}/fuel-database`, { headers: getAuthHeader() }),
        axios.get(`${API}/formula-definitions`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/formula-parameters`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/units`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/emission-configurations`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/gwp-config`, { headers: getAuthHeader() }).catch(() => ({ data: null })),
        axios.get(`${API}/process-templates`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/organizations/my`, { headers: getAuthHeader() }).catch(() => ({ data: null }))
      ]);
      setEmissions(emissionsRes.data);
      setFacilities(facilitiesRes.data);
      setFuelDatabase(fuelDbRes.data || []);
      setFormulaDefinitions(formulasRes.data || []);
      setFormulaParameters(paramsRes.data || []);
      setCentralizedUnits(unitsRes.data || []);
      setEmissionConfigurations(configsRes.data || []);
      setGwpConfig(gwpRes.data || null);
      setProcessTemplates(templatesRes.data || []);
      setOrganization(orgRes.data);
      // Mark formula data as ready AFTER all state updates
      setFormulaDataReady(true);
    } catch (error) {
      console.error('Emissions fetch error:', error);
      setEmissions([]);
      setFacilities([]);
      setFuelDatabase([]);
      setFormulaDefinitions([]);
      setFormulaParameters([]);
      setCentralizedUnits([]);
      setEmissionConfigurations([]);
      setGwpConfig(null);
      setProcessTemplates([]);
      setOrganization(null);
      setFormulaDataReady(true); // Still mark as ready even on error to prevent indefinite loading
    } finally {
      setLoading(false);
    }
  };

  // Check if two unit strings match using centralized unit aliases
  const unitsMatch = (unit1, unit2) => {
    if (!unit1 || !unit2) return false;
    const u1 = unit1.toLowerCase().trim();
    const u2 = unit2.toLowerCase().trim();
    
    // Direct match
    if (u1 === u2) return true;
    
    // Check if both belong to the same unit (via aliases from centralized units)
    for (const unit of centralizedUnits) {
      const allNames = [
        unit.symbol.toLowerCase(),
        unit.name.toLowerCase(),
        ...(unit.aliases || []).map(a => a.toLowerCase())
      ];
      const hasU1 = allNames.includes(u1);
      const hasU2 = allNames.includes(u2);
      if (hasU1 && hasU2) return true;
    }
    
    return false;
  };

  // Check if a unit is a volume unit
  const isVolumeUnit = (unitStr) => {
    if (!unitStr) return false;
    const u = unitStr.toLowerCase().trim();
    
    for (const unit of centralizedUnits) {
      if (unit.unit_type === 'volume') {
        const allNames = [
          unit.symbol.toLowerCase(),
          unit.name.toLowerCase(),
          ...(unit.aliases || []).map(a => a.toLowerCase())
        ];
        if (allNames.includes(u)) return true;
      }
    }
    return false;
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
      // Determine default quantity unit based on fuel's allowed units
      // For energy fuels (like electricity), use energy units by default
      let defaultUnit = 'kg'; // Default mass unit
      if (fuel.allowed_units && fuel.allowed_units.length > 0) {
        // Use centralized units to detect energy units dynamically
        const energyUnitsFromDb = centralizedUnits
          .filter(u => u.unit_type?.toLowerCase() === 'energy')
          .map(u => u.symbol.toLowerCase());
        
        // Also check aliases
        const energyAliases = centralizedUnits
          .filter(u => u.unit_type?.toLowerCase() === 'energy')
          .flatMap(u => (u.aliases || []).map(a => a.toLowerCase()));
        
        const allEnergyUnits = [...energyUnitsFromDb, ...energyAliases];
        
        // Fallback to common energy units if none in database
        const fallbackEnergyUnits = ['kwh', 'mwh', 'gwh', 'tj', 'gj', 'mj'];
        const energyUnitCheck = allEnergyUnits.length > 0 ? allEnergyUnits : fallbackEnergyUnits;
        
        const hasEnergyUnit = fuel.allowed_units.some(u => 
          energyUnitCheck.includes(u.toLowerCase())
        );
        
        if (hasEnergyUnit) {
          // Use the first energy unit as default
          defaultUnit = fuel.allowed_units.find(u => 
            energyUnitCheck.includes(u.toLowerCase())
          ) || fuel.allowed_units[0];
        } else {
          // Use first allowed unit
          defaultUnit = fuel.allowed_units[0];
        }
      }
      
      setFormData(prev => ({
        ...prev,
        fuel_id: fuelId,
        fuel_type: fuel.fuel_name,
        category: fuel.category,
        sub_category: fuel.fuel_name,
        emission_factor_co2: fuel.emission_factor_co2?.toString() || '',
        emission_factor_ch4: fuel.emission_factor_ch4?.toString() || '',
        emission_factor_n2o: fuel.emission_factor_n2o?.toString() || '',
        emission_factor_basis_quantity: fuel.emission_factor_basis_quantity?.toString() || '',
        emission_factor_basis_unit: fuel.emission_factor_basis_unit || '',
        calorific_value: fuel.calorific_value?.toString() || '',
        calorific_value_unit: fuel.calorific_value_unit || '',
        density: fuel.density?.toString() || '',
        density_unit: fuel.density_unit || '',
        conversion_factor: fuel.conversion_factor?.toString() || '1',
        source_of_information: fuel.source || '',
        is_custom_factor: false,
        quantity_unit: defaultUnit  // Set default unit based on fuel type
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
      emission_factor_basis_quantity: '',
      emission_factor_basis_unit: '',
      calorific_value: '',
      calorific_value_unit: '',
      density: '',
      density_unit: '',
      source_of_information: ''
    }));
  };

  // Get the selected facility's sector and country for filtering fuels
  const selectedFacilitySector = useMemo(() => {
    const facility = facilities.find(f => f.id === formData.facility_id);
    return facility?.sector || '';
  }, [facilities, formData.facility_id]);

  const selectedFacilityCountry = useMemo(() => {
    const facility = facilities.find(f => f.id === formData.facility_id);
    return facility?.country || '';
  }, [facilities, formData.facility_id]);

  // Get fuels filtered by scope, industry, category, and region (with priority)
  const getFuelsForScope = useMemo(() => {
    let filtered = fuelDatabase.filter(f => f.scope === formData.scope);
    
    // If a facility is selected and has a sector, filter fuels by industry
    if (selectedFacilitySector) {
      filtered = filtered.filter(fuel => {
        // Check if fuel has industry_sectors array (new format)
        if (fuel.industry_sectors && fuel.industry_sectors.length > 0) {
          return fuel.industry_sectors.some(sector => 
            sector.toLowerCase() === selectedFacilitySector.toLowerCase()
          );
        }
        // Fall back to legacy industry_sector field
        if (fuel.industry_sector) {
          return fuel.industry_sector.toLowerCase() === selectedFacilitySector.toLowerCase();
        }
        // If no industry filter on fuel, show it (backwards compatibility)
        return true;
      });
    }
    
    // Apply region priority: Region-specific > Global
    // Group fuels by name to handle region priority
    const fuelsByName = {};
    filtered.forEach(fuel => {
      const key = `${fuel.fuel_name}_${fuel.category}`;
      if (!fuelsByName[key]) {
        fuelsByName[key] = [];
      }
      fuelsByName[key].push(fuel);
    });
    
    // For each fuel name, prioritize region-specific over Global
    const prioritizedFuels = [];
    Object.values(fuelsByName).forEach(fuels => {
      if (selectedFacilityCountry) {
        // Check if there's a region-specific fuel matching facility's country
        const regionSpecific = fuels.find(f => 
          f.region && f.region.toLowerCase() === selectedFacilityCountry.toLowerCase()
        );
        if (regionSpecific) {
          prioritizedFuels.push(regionSpecific);
          return;
        }
      }
      // Fall back to Global or the first available
      const globalFuel = fuels.find(f => f.region === 'Global' || !f.region);
      if (globalFuel) {
        prioritizedFuels.push(globalFuel);
      } else if (fuels.length > 0) {
        prioritizedFuels.push(fuels[0]);
      }
    });
    
    return prioritizedFuels;
  }, [fuelDatabase, formData.scope, selectedFacilitySector, selectedFacilityCountry]);

  // Get unique categories for the scope
  const getCategoriesForScope = useMemo(() => {
    const cats = new Set();
    getFuelsForScope.forEach(f => {
      // Support both categories array and legacy category field
      if (f.categories?.length > 0) {
        f.categories.forEach(c => cats.add(c));
      } else if (f.category) {
        cats.add(f.category);
      }
    });
    return Array.from(cats).sort();
  }, [getFuelsForScope]);

  // Get fuels for selected category
  const getFuelsForCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return getFuelsForScope.filter(f => {
      const fuelCategories = f.categories?.length > 0 ? f.categories : (f.category ? [f.category] : []);
      return fuelCategories.includes(selectedCategory);
    });
  }, [getFuelsForScope, selectedCategory]);

  // Group fuels by category for better organization (keeping for filter dropdown)
  const getFuelsByCategory = useMemo(() => {
    const grouped = {};
    getFuelsForScope.forEach(fuel => {
      const fuelCategories = fuel.categories?.length > 0 ? fuel.categories : (fuel.category ? [fuel.category] : []);
      fuelCategories.forEach(cat => {
        if (!grouped[cat]) {
          grouped[cat] = [];
        }
        grouped[cat].push(fuel);
      });
    });
    return grouped;
  }, [getFuelsForScope]);

  // Get available quantity units from centralized units module, filtered by fuel's allowed units
  const availableQuantityUnits = useMemo(() => {
    // Get selected fuel's allowed units
    const selectedFuel = fuelDatabase.find(f => f.id === formData.fuel_id);
    // Filter out 'm3' from allowed units - use 'm³' instead (proper superscript notation)
    const fuelAllowedUnits = selectedFuel?.allowed_units?.filter(u => u !== 'm3') || null;
    
    // Build units list from centralized units
    let units = [];
    
    if (centralizedUnits.length > 0) {
      // Use centralized units
      centralizedUnits.forEach(unit => {
        units.push({
          value: unit.symbol,
          label: `${unit.name} (${unit.symbol})`,
          type: unit.unit_type,
          requiresDensity: unit.unit_type === 'volume',
          conversionToBase: unit.conversion_to_base,
          isBaseUnit: unit.is_base_unit,
          aliases: unit.aliases || []
        });
      });
    } else {
      // Fallback: use kg as default
      units = [{ value: 'kg', label: 'Kilograms (kg)', type: 'mass' }];
    }
    
    // If fuel has allowed_units, filter to only show those
    if (fuelAllowedUnits && fuelAllowedUnits.length > 0) {
      units = units.filter(u => 
        fuelAllowedUnits.some(allowed => unitsMatch(allowed, u.value))
      );
      // Ensure at least kg is available if nothing matches
      if (units.length === 0) {
        const kgUnit = centralizedUnits.find(u => u.symbol === 'kg');
        units = [{ 
          value: 'kg', 
          label: kgUnit ? `${kgUnit.name} (kg)` : 'Kilograms (kg)', 
          type: 'mass' 
        }];
      }
    }
    
    return units;
  }, [centralizedUnits, fuelDatabase, formData.fuel_id]);

  // Determine if current quantity unit is a mass or volume unit
  const currentUnitType = useMemo(() => {
    const unit = availableQuantityUnits.find(u => 
      u.value.toLowerCase() === formData.quantity_unit.toLowerCase()
    );
    return unit?.type || 'mass';
  }, [availableQuantityUnits, formData.quantity_unit]);

  // Get the conversion factor for a parameter based on the selected unit
  // The Super Admin defines conversions as: "X from_unit = 1 to_unit" (e.g., 1000 g = 1 kg)
  // So the multiplier represents how many from_units make 1 to_unit
  // To convert: divide the value by the multiplier (e.g., 1000g / 1000 = 1kg)
  const getConversionFactor = (paramKey, selectedUnit) => {
    if (!selectedUnit) return 1;
    
    // Find the parameter definition from Super Admin with exact or related key matching
    // Order matters: first check exact match, then related keys
    let param = formulaParameters.find(p => p.parameter_key === paramKey);
    
    // If no exact match, try common variations
    if (!param) {
      param = formulaParameters.find(p => 
        p.parameter_key === paramKey.replace('_fuel', '') ||
        p.parameter_key === paramKey.replace('quantity', 'quantity_fuel')
      );
    }
    
    // For electricity_quantity specifically, also check if paramKey references it
    if (!param && (paramKey === 'electricity_quantity' || paramKey.includes('electricity'))) {
      param = formulaParameters.find(p => p.parameter_key === 'electricity_quantity');
    }
    
    if (!param || !param.unit_conversions || param.unit_conversions.length === 0) {
      return 1; // No conversion defined, use as-is
    }
    
    // Find the conversion rule for the selected unit
    const conversion = param.unit_conversions.find(c => 
      c.from_unit.toLowerCase() === selectedUnit.toLowerCase()
    );
    
    if (conversion && conversion.multiplier !== 0) {
      // The multiplier represents "how many from_unit = 1 to_unit"
      // So to convert from from_unit to to_unit, we DIVIDE by multiplier
      // Example: 1000 g with multiplier 1000 → 1000/1000 = 1 kg
      return 1 / conversion.multiplier;
    }
    
    // Check if selected unit is the target unit (base unit - no conversion needed)
    const isBaseUnit = param.unit_conversions.some(c => 
      c.to_unit.toLowerCase() === selectedUnit.toLowerCase()
    );
    
    if (isBaseUnit) {
      return 1; // Already in base unit
    }
    
    return 1; // Default: no conversion (but this means config is missing)
  };

  // Check if a conversion is defined for a unit (separate from the factor value)
  const hasConversionDefined = (paramKey, selectedUnit) => {
    if (!selectedUnit) return false;
    
    // Find the parameter with exact or related key matching
    let param = formulaParameters.find(p => p.parameter_key === paramKey);
    
    // If no exact match, try common variations
    if (!param) {
      param = formulaParameters.find(p => 
        p.parameter_key === paramKey.replace('_fuel', '') ||
        p.parameter_key === paramKey.replace('quantity', 'quantity_fuel')
      );
    }
    
    // For electricity_quantity specifically
    if (!param && (paramKey === 'electricity_quantity' || paramKey.includes('electricity'))) {
      param = formulaParameters.find(p => p.parameter_key === 'electricity_quantity');
    }
    
    if (!param || !param.unit_conversions || param.unit_conversions.length === 0) {
      return false;
    }
    
    // Check if conversion exists for this unit OR if it's the target unit (base unit)
    const hasDirectConversion = param.unit_conversions.some(c => 
      c.from_unit.toLowerCase() === selectedUnit.toLowerCase()
    );
    
    // Also check if selected unit is the target unit (base unit needs no conversion)
    const isBaseUnit = param.unit_conversions.some(c => 
      c.to_unit.toLowerCase() === selectedUnit.toLowerCase()
    );
    
    return hasDirectConversion || isBaseUnit;
  };

  // Convert quantity to kg based on selected unit (now uses dynamic units)
  const getQuantityInKg = useMemo(() => {
    const quantity = parseFloat(formData.quantity) || 0;
    const unit = availableQuantityUnits.find(u => u.value.toLowerCase() === formData.quantity_unit.toLowerCase());
    
    if (!unit) return quantity; // Default to assuming kg
    
    if (unit.requiresDensity) {
      const density = parseFloat(formData.density) || 1;
      // Use the conversion factor from Super Admin
      const convFactor = getConversionFactor('quantity_fuel', formData.quantity_unit);
      return quantity * convFactor * density;
    }
    
    // Use the conversion factor from Super Admin
    const convFactor = getConversionFactor('quantity_fuel', formData.quantity_unit);
    return quantity * convFactor;
  }, [formData.quantity, formData.quantity_unit, formData.density, availableQuantityUnits]);

  // Get the selected fuel data for dynamic mappings
  const selectedFuel = useMemo(() => {
    if (!formData.fuel_id) return null;
    return fuelDatabase.find(f => f.id === formData.fuel_id);
  }, [formData.fuel_id, fuelDatabase]);

  // Dynamic parameter value resolver using formula's input_mappings
  // If no mappings defined, falls back to intelligent defaults
  const getParameterValueDynamic = useCallback((paramKey, formula, customParams = {}) => {
    // First, check if customParams has an override
    if (customParams[paramKey] !== undefined) {
      return customParams[paramKey];
    }

    // Check formula's input_mappings
    const inputMappings = formula?.input_mappings || [];
    const mapping = inputMappings.find(m => m.parameter_key === paramKey);
    
    if (mapping) {
      const sourceType = mapping.source_type;
      const sourceField = mapping.source_field;
      
      if (sourceType === 'user_input') {
        // Get value from formData
        const rawValue = parseFloat(formData[sourceField]) || 0;
        // Apply conversion if this is a quantity field
        if (sourceField === 'quantity') {
          const conversion = getConversionFactor(paramKey, formData.quantity_unit);
          return rawValue * conversion;
        }
        return rawValue;
      } else if (sourceType === 'fuel_database') {
        // Check if Admin has enabled override for this field
        // When override is enabled, use formData value instead of fuel database value
        // Handle both source_field variations (calorific_value) and param_key variations (ncv)
        const isCalorificParam = sourceField === 'calorific_value' || paramKey === 'ncv' || paramKey === 'net_calorific_value' || paramKey.includes('calorific');
        const isDensityParam = sourceField === 'density' || paramKey === 'density' || paramKey.includes('density');
        
        // DEBUG: Log override check
        if (isCalorificParam) {
          console.log('getParameterValueDynamic - Calorific check:', {
            paramKey,
            sourceField,
            overrideCalorificValue,
            formDataCalorificValue: formData.calorific_value,
            willUseOverride: isCalorificParam && overrideCalorificValue
          });
        }
        
        if (isCalorificParam && overrideCalorificValue) {
          const overrideValue = parseFloat(formData.calorific_value) || 0;
          console.log('Using OVERRIDE calorific value:', overrideValue);
          return overrideValue;
        }
        if (isDensityParam && overrideDensity) {
          const overrideValue = parseFloat(formData.density) || 1;
          console.log('Using OVERRIDE density value:', overrideValue);
          return overrideValue;
        }
        // Get value from selected fuel
        if (selectedFuel && selectedFuel[sourceField] !== undefined) {
          return parseFloat(selectedFuel[sourceField]) || 0;
        }
        // Fallback to formData if fuel not selected
        return parseFloat(formData[sourceField]) || 0;
      } else if (sourceType === 'formula_parameter') {
        // Get value from formula parameters (e.g., GWP values)
        const param = formulaParameters.find(p => p.parameter_key === sourceField);
        if (param && param.default_value !== null && param.default_value !== undefined) {
          return parseFloat(param.default_value);
        }
        return 0;
      } else if (sourceType === 'constant') {
        // Use the constant value defined in mapping
        return parseFloat(mapping.default_value) || 0;
      }
    }
    
    // Fallback: intelligent defaults based on parameter key patterns
    // This ensures backward compatibility when no mappings are configured
    const rawQuantity = parseFloat(formData.quantity) || 0;
    const selectedUnit = formData.quantity_unit || 'kg';
    const quantityConversion = getConversionFactor(paramKey, selectedUnit);
    
    // Match common parameter patterns
    if (paramKey.includes('quantity') || paramKey === 'quantity_fuel' || paramKey === 'electricity_quantity') {
      return rawQuantity * quantityConversion;
    }
    // Check calorific value - respect override flag
    if (paramKey.includes('calorific') || paramKey === 'ncv' || paramKey === 'net_calorific_value') {
      // When override is enabled, use formData value (user-entered)
      // When override is disabled, also use formData because it's populated from selected fuel
      return parseFloat(formData.calorific_value) || 0;
    }
    // Check density - respect override flag
    if (paramKey.includes('density')) {
      // When override is enabled, use formData value (user-entered)
      // When override is disabled, also use formData because it's populated from selected fuel
      return parseFloat(formData.density) || 1;
    }
    if (paramKey.includes('emission_factor_co2') || paramKey === 'co2_emission_factor') {
      return parseFloat(formData.emission_factor_co2) || 0;
    }
    if (paramKey.includes('emission_factor_ch4') || paramKey === 'ch4_emission_factor') {
      return parseFloat(formData.emission_factor_ch4) || 0;
    }
    if (paramKey.includes('emission_factor_n2o') || paramKey === 'n2o_emission_factor') {
      return parseFloat(formData.emission_factor_n2o) || 0;
    }
    if (paramKey === 'co2_electricity' || paramKey.includes('emission_factor_basis')) {
      return parseFloat(formData.emission_factor_basis_quantity) || 0;
    }
    if (paramKey === 'conversion_factor' || paramKey === 'kg_tonne_conversion') {
      return parseFloat(formData.conversion_factor) || 1;
    }
    // GWP Fugitives - get from selected fuel
    if (paramKey === 'gwp_fugitives' || paramKey.includes('gwp_fugitive')) {
      return selectedFuel?.gwp_fugitives ? parseFloat(selectedFuel.gwp_fugitives) : 0;
    }
    
    // Check formula parameters for default values (e.g., GWP)
    const superAdminParam = formulaParameters.find(p => p.parameter_key === paramKey);
    if (superAdminParam && superAdminParam.default_value !== null && superAdminParam.default_value !== undefined) {
      return parseFloat(superAdminParam.default_value);
    }
    
    return 1; // Default fallback
  }, [formData, selectedFuel, formulaParameters, getConversionFactor, overrideCalorificValue, overrideDensity]);

  // Legacy getParameterValue for backward compatibility (uses default formula context)
  const getParameterValue = (paramKey) => {
    return getParameterValueDynamic(paramKey, null, {});
  };

  // Find the best matching formula for a given scope and category using emission configurations
  // Returns the formula with highest priority that matches the scope and optionally the category
  const findFormulaForScope = useCallback((scope, category = null, gasType = null) => {
    // ONLY use emission configurations (SuperAdmin-defined mappings)
    // No fallback - if no configuration exists, return null
    
    // Filter configurations by scope
    let matchingConfigs = emissionConfigurations.filter(c => 
      c.is_active && c.scope === scope
    );
    
    // If category specified, prefer configs that match the category
    if (category) {
      const categoryMatches = matchingConfigs.filter(c => {
        // Support both old (single category) and new (multiple categories) format
        const configCategories = c.categories || (c.category ? [c.category] : []);
        if (configCategories.length === 0) return true; // Config applies to all categories
        return configCategories.some(cat => cat.toLowerCase() === category.toLowerCase());
      });
      
      if (categoryMatches.length > 0) {
        // Sort by specificity - prefer configs with fewer categories (more specific)
        // A config with just ['Fugitive Emissions'] should rank higher than one with multiple categories
        categoryMatches.sort((a, b) => {
          const aCats = a.categories || (a.category ? [a.category] : []);
          const bCats = b.categories || (b.category ? [b.category] : []);
          // Fewer categories = more specific = higher priority
          if (aCats.length !== bCats.length) {
            return aCats.length - bCats.length;
          }
          // Same number of categories, use priority
          return (b.priority || 0) - (a.priority || 0);
        });
        matchingConfigs = categoryMatches;
      }
    } else {
      // Sort by priority (highest first)
      matchingConfigs.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
    
    // Iterate through ALL matching configs to find one whose formula matches the gasType
    for (const config of matchingConfigs) {
      const formula = formulaDefinitions.find(f => f.id === config.formula_id);
      
      if (!formula) continue;
      
      // If no gasType specified, return the first found formula
      if (!gasType) {
        return formula;
      }
      
      // Check if formula matches the requested gas type
      const keyLower = (formula.formula_key || '').toLowerCase();
      
      if (gasType === 'co2' && keyLower.includes('co2') && !keyLower.includes('co2e')) {
        return formula;
      }
      if (gasType === 'ch4' && keyLower.includes('ch4')) {
        return formula;
      }
      if (gasType === 'n2o' && keyLower.includes('n2o')) {
        return formula;
      }
      if (gasType === 'co2e' && (keyLower.includes('co2e') || keyLower.includes('total'))) {
        return formula;
      }
      if (gasType === 'electricity' && keyLower.includes('electricity')) {
        return formula;
      }
      // For fugitive emissions, also check for 'fugitive' in the key
      if (gasType === 'co2' && keyLower.includes('fugitive')) {
        return formula;
      }
    }
    
    // No matching configuration/formula found
    return null;
  }, [emissionConfigurations, formulaDefinitions]);

  // Execute a formula by processing its components with their operations
  // Supports conditional components that only apply for certain unit types
  // customParams allows passing custom parameter values (e.g., for electricity formula)
  const executeFormula = (formula, customParams = {}) => {
    if (!formula || !formula.components || formula.components.length === 0) {
      return null;
    }
    
    // Determine if current unit is mass or volume using centralized units
    const selectedUnit = formData.quantity_unit || 'kg';
    const selectedUnitIsVolume = isVolumeUnit(selectedUnit);
    const selectedUnitIsMass = !selectedUnitIsVolume;
    
    let result = null;
    const steps = [];
    const skippedComponents = [];
    
    for (let i = 0; i < formula.components.length; i++) {
      const comp = formula.components[i];
      const condition = comp.condition || 'always';
      
      // Check if this component should be applied based on condition
      let shouldApply = true;
      if (condition === 'volume_units' && !selectedUnitIsVolume) {
        shouldApply = false;
        skippedComponents.push(`${comp.parameter_name} (skipped - mass unit selected)`);
      } else if (condition === 'mass_units' && !selectedUnitIsMass) {
        shouldApply = false;
        skippedComponents.push(`${comp.parameter_name} (skipped - volume unit selected)`);
      }
      
      if (!shouldApply) {
        continue; // Skip this component
      }
      
      // Use dynamic parameter resolver with formula context
      // customParams takes priority, then formula's input_mappings, then intelligent defaults
      const value = customParams[comp.parameter_key] !== undefined 
        ? customParams[comp.parameter_key] 
        : getParameterValueDynamic(comp.parameter_key, formula, customParams);
      
      if (result === null || comp.operation === 'base') {
        // First applicable component is the base value
        result = value;
        const conditionNote = condition !== 'always' ? ` [${condition}]` : '';
        // Add "(Unit Conversion Applied)" for quantity parameters
        const isQuantityParam = comp.parameter_key?.includes('quantity') || comp.parameter_name?.toLowerCase().includes('quantity');
        const conversionNote = isQuantityParam ? ' (Unit Conversion Applied)' : '';
        steps.push(`${comp.parameter_name}${conversionNote}${conditionNote} = ${value}`);
      } else {
        // Apply operation
        const conditionNote = condition !== 'always' ? ` [${condition}]` : '';
        switch (comp.operation) {
          case 'multiply':
            result = result * value;
            steps.push(`× ${comp.parameter_name}${conditionNote} (${value}) = ${result}`);
            break;
          case 'divide':
            result = value !== 0 ? result / value : result;
            steps.push(`÷ ${comp.parameter_name}${conditionNote} (${value}) = ${result}`);
            break;
          case 'add':
            result = result + value;
            steps.push(`+ ${comp.parameter_name}${conditionNote} (${value}) = ${result}`);
            break;
          case 'subtract':
            result = result - value;
            steps.push(`- ${comp.parameter_name}${conditionNote} (${value}) = ${result}`);
            break;
          default:
            result = result * value;
            steps.push(`× ${comp.parameter_name}${conditionNote} (${value}) = ${result}`);
        }
      }
    }
    
    // If all components were skipped, return null
    if (result === null) {
      return null;
    }
    
    return { 
      result, 
      steps, 
      skippedComponents,
      formula_name: formula.formula_name, 
      formula_expression: formula.formula_expression,
      output_unit: formula.output_unit || '',
      unitType: selectedUnitIsVolume ? 'volume' : 'mass'
    };
  };

  // Calculate emissions using Super Admin defined formulas ONLY
  const calculatedEmissions = useMemo(() => {
    // CRITICAL: Wait until formula parameters are loaded to ensure conversion factors are available
    // This prevents the race condition where calculations run before unit conversions are loaded
    if (!formulaDataReady) {
      return null;
    }
    
    const quantity = parseFloat(formData.quantity) || 0;
    const calorificValue = parseFloat(formData.calorific_value) || 0;
    const co2EF = parseFloat(formData.emission_factor_co2) || 0;
    const emissionFactorBasis = parseFloat(formData.emission_factor_basis_quantity) || 0;
    const isScope2 = formData.scope === 'scope2';
    
    // Custom emission factor calculation - two cases:
    // 1. Using custom fuel type (no fuel_id, full custom)
    // 2. Overriding emission factor for a selected fuel (has fuel_id but is_custom_factor is true)
    if (formData.is_custom_factor && formData.custom_emission_factor) {
      const customEF = parseFloat(formData.custom_emission_factor) || 0;
      if (quantity && customEF) {
        const isOverride = !!formData.fuel_id; // True if overriding existing fuel's EF
        const selectedFuelData = isOverride ? fuelDatabase.find(f => f.id === formData.fuel_id) : null;
        const efUnit = selectedFuelData?.emission_factor_basis_unit || formData.emission_factor_basis_unit || 'kg CO₂e/unit';
        
        // Apply unit conversion - same logic as default calculation
        // For electricity (Scope 2), convert kWh to MWh if needed
        const conversionFactor = getConversionFactor('electricity_quantity', formData.quantity_unit);
        const hasConversion = hasConversionDefined('electricity_quantity', formData.quantity_unit);
        const convertedQuantity = quantity * conversionFactor;
        
        // Debug log for unit conversion (especially for GWh issues)
        if (formData.quantity_unit?.toLowerCase() === 'gwh') {
          console.log('=== GWh CONVERSION DEBUG ===', {
            rawQuantity: quantity,
            unit: formData.quantity_unit,
            conversionFactor,
            hasConversion,
            convertedQuantity,
            customEF,
            expectedResult: convertedQuantity * customEF
          });
        }
        
        // Calculate using converted quantity
        const co2eResult = convertedQuantity * customEF;
        
        return {
          co2Emissions: co2eResult,
          ch4Emissions: 0,
          n2oEmissions: 0,
          co2eEmissions: co2eResult,
          appliedFormulaName: isOverride ? 'Overridden Emission Factor' : 'Custom Emission Factor',
          calculationSteps: {
            co2: {
              formula_name: isOverride ? 'Overridden Emission Factor' : 'Custom Emission Factor',
              formula_expression: 'Quantity × Custom EF',
              output_unit: efUnit,
              steps: [
                `Quantity (Unit Conversion Applied) = ${convertedQuantity.toFixed(4)}`,
                `× Custom EF = ${customEF}`,
                `= ${co2eResult.toFixed(4)} ${efUnit}`
              ]
            },
            co2e: {
              formula_name: 'Total CO₂e',
              output_unit: efUnit,
              steps: [`Total = ${co2eResult.toFixed(4)} ${efUnit}`]
            }
          },
          co2OutputUnit: efUnit,
          ch4OutputUnit: 'kg CH₄',
          n2oOutputUnit: 'kg N₂O',
          co2eOutputUnit: efUnit,
          conversionInfo: { 
            rawQuantity: quantity, 
            selectedUnit: formData.quantity_unit,
            conversionFactor: conversionFactor,
            convertedQuantity: convertedQuantity,
            hasConversion: hasConversion
          },
          hasCo2Formula: true,
          hasCh4Formula: false,
          hasN2oFormula: false,
          hasCo2eFormula: true
        };
      }
    }
    
    // DYNAMIC FORMULA SELECTION: Use emission configurations to find the right formulas
    // This replaces hardcoded formula key matching
    const scope = formData.scope || 'scope1';
    const category = formData.category || selectedCategory;
    
    // DYNAMIC FORMULA SELECTION: Use ONLY emission configurations (SuperAdmin-defined mappings)
    // No fallback to hardcoded formula key matching - if no configuration exists, formula is null
    // Note: CO2e is auto-calculated, no formula needed
    const co2Formula = findFormulaForScope(scope, category, 'co2');
    const ch4Formula = findFormulaForScope(scope, category, 'ch4');
    const n2oFormula = findFormulaForScope(scope, category, 'n2o');
    
    // Find Electricity formula for Scope 2 (using emission configurations ONLY)
    const electricityFormula = findFormulaForScope('scope2', category || 'Purchased Electricity', 'electricity');
    
    // For Scope 2, handle electricity calculations
    if (isScope2 && quantity) {
      // Get the emission factor - priority: custom > basis_quantity > co2EF
      const effectiveEF = formData.is_custom_factor 
        ? parseFloat(formData.custom_emission_factor) || 0
        : emissionFactorBasis || co2EF;
      
      if (effectiveEF) {
        // Use SuperAdmin-defined unit conversions for electricity
        const conversionFactor = getConversionFactor('electricity_quantity', formData.quantity_unit);
        const hasConversion = hasConversionDefined('electricity_quantity', formData.quantity_unit);
        
        if (!hasConversion && formData.quantity_unit?.toLowerCase() !== 'mwh') {
          // No conversion defined and not already in MWh - warn but continue
          console.warn(`No unit conversion defined for electricity unit: ${formData.quantity_unit}`);
        }
        
        const convertedQuantity = quantity * conversionFactor;
        
        // If we have a formula from Super Admin, use it
        if (electricityFormula && emissionFactorBasis) {
          const result = executeFormula(electricityFormula, {
            electricity_quantity: convertedQuantity,
            co2_electricity: effectiveEF
          });
          
          if (result) {
            return {
              co2Emissions: result.result,
              ch4Emissions: 0,
              n2oEmissions: 0,
              co2eEmissions: result.result,
              appliedFormulaName: electricityFormula.formula_name,
              calculationSteps: {
                co2: {
                  formula_name: electricityFormula.formula_name,
                  formula_expression: electricityFormula.formula_expression,
                  output_unit: electricityFormula.output_unit || formData.emission_factor_basis_unit || 'tCO₂',
                  steps: result.steps
                },
                co2e: {
                  formula_name: 'Total CO₂e',
                  output_unit: electricityFormula.output_unit || formData.emission_factor_basis_unit || 'tCO₂e',
                  steps: [`Total = ${result.result.toFixed(4)} ${electricityFormula.output_unit || formData.emission_factor_basis_unit || 'tCO₂e'}`]
                }
              },
              co2OutputUnit: electricityFormula.output_unit || formData.emission_factor_basis_unit || 'tCO₂',
              ch4OutputUnit: 'kg CH₄',
              n2oOutputUnit: 'kg N₂O',
              co2eOutputUnit: electricityFormula.output_unit || formData.emission_factor_basis_unit || 'tCO₂e',
              conversionInfo: { 
                rawQuantity: quantity, 
                selectedUnit: formData.quantity_unit,
                conversionFactor: conversionFactor,
                convertedQuantity: convertedQuantity,
                targetUnit: 'MWh',
                hasConversion: hasConversion
              },
              hasCo2Formula: true,
              hasCh4Formula: false,
              hasN2oFormula: false,
              hasCo2eFormula: true
            };
          }
        }
        
        // Fallback: Simple calculation for Scope 2 (Quantity × EF)
        const co2eResult = convertedQuantity * effectiveEF;
        const efUnit = formData.emission_factor_basis_unit || 'tCO2/MWh';
        
        return {
          co2Emissions: co2eResult,
          ch4Emissions: 0,
          n2oEmissions: 0,
          co2eEmissions: co2eResult,
          appliedFormulaName: formData.is_custom_factor ? 'Custom Emission Factor' : 'Scope 2 Electricity Calculation',
          calculationSteps: {
            co2: {
              formula_name: formData.is_custom_factor ? 'Custom Emission Factor' : 'Scope 2 Electricity',
              formula_expression: 'Quantity × Emission Factor',
              output_unit: 'tCO₂e',
              steps: [
                `Quantity (Unit Conversion Applied) = ${convertedQuantity.toFixed(4)}`,
                `× Emission Factor = ${effectiveEF} ${efUnit}`,
                `= ${co2eResult.toFixed(4)} tCO₂e`
              ]
            },
            co2e: {
              formula_name: 'Total CO₂e',
              output_unit: 'tCO₂e',
              steps: [`Total = ${co2eResult.toFixed(4)} tCO₂e`]
            }
          },
          co2OutputUnit: 'tCO₂e',
          ch4OutputUnit: 'kg CH₄',
          n2oOutputUnit: 'kg N₂O',
          co2eOutputUnit: 'tCO₂e',
          conversionInfo: { 
            rawQuantity: quantity, 
            selectedUnit: formData.quantity_unit,
            conversionFactor: conversionFactor,
            convertedQuantity: convertedQuantity,
            targetUnit: 'MWh',
            hasConversion: hasConversion
          },
          hasCo2Formula: true,
          hasCh4Formula: false,
          hasN2oFormula: false,
          hasCo2eFormula: true
        };
      }
    }
    
    // Standard calculation using Super Admin formulas - requires appropriate data
    if (!quantity) return null;
    
    // Check if this is a fugitive emissions calculation
    const isFugitiveCategory = category?.toLowerCase()?.includes('fugitive');
    
    // For Scope 1/Biogenic, require calorific value and CO2 EF
    // BUT: Skip this check for fugitive emissions which use gwp_fugitives instead
    if (!isScope2 && !isFugitiveCategory && (!calorificValue || !co2EF)) return null;

    let co2Emissions = 0;
    let ch4Emissions = 0;
    let n2oEmissions = 0;
    let co2eEmissions = 0;
    let appliedFormulas = [];
    let calculationSteps = {};

    // Execute CO2 formula ONLY if defined by Super Admin
    if (co2Formula) {
      const result = executeFormula(co2Formula);
      if (result) {
        co2Emissions = result.result;
        appliedFormulas.push(result.formula_name);
        calculationSteps.co2 = result;
      }
    }

    // Execute CH4 formula ONLY if defined by Super Admin
    if (ch4Formula) {
      const result = executeFormula(ch4Formula);
      if (result) {
        ch4Emissions = result.result;
        appliedFormulas.push(result.formula_name);
        calculationSteps.ch4 = result;
      }
    }

    // Execute N2O formula ONLY if defined
    if (n2oFormula) {
      const result = executeFormula(n2oFormula);
      if (result) {
        n2oEmissions = result.result;
        appliedFormulas.push(result.formula_name);
        calculationSteps.n2o = result;
      }
    }
    
    // CO2e: Built-in calculation using GWP values from GWP Config (SuperAdmin configured)
    // Formula: CO2×GWP(CO2) + CH4×GWP(CH4) + N2O×GWP(N2O)
    // For Scope 1 & 2: Use GWP CH4 (Fossil)
    // For Biogenic: Use GWP CH4 (Non-fossil)
    
    // Require GWP Config - no fallbacks
    if (!gwpConfig) {
      return {
        co2Emissions: 0,
        ch4Emissions: 0,
        n2oEmissions: 0,
        co2eEmissions: 0,
        appliedFormulaName: 'Error: GWP Configuration not found',
        calculationSteps: {
          error: {
            message: 'GWP Configuration not found. Please contact SuperAdmin to configure GWP values.'
          }
        }
      };
    }
    
    const gwpCo2 = gwpConfig.co2_gwp;
    const gwpCh4Fossil = gwpConfig.ch4_fossil_gwp;
    const gwpCh4NonFossil = gwpConfig.ch4_non_fossil_gwp;
    const gwpN2o = gwpConfig.n2o_gwp;
    
    // Validate all GWP values are configured
    if (gwpCo2 === undefined || gwpCh4Fossil === undefined || gwpCh4NonFossil === undefined || gwpN2o === undefined) {
      return {
        co2Emissions: 0,
        ch4Emissions: 0,
        n2oEmissions: 0,
        co2eEmissions: 0,
        appliedFormulaName: 'Error: Incomplete GWP Configuration',
        calculationSteps: {
          error: {
            message: 'Incomplete GWP Configuration. Please contact SuperAdmin to configure all GWP values (CO2, CH4 Fossil, CH4 Non-fossil, N2O).'
          }
        }
      };
    }
    
    // Use fossil CH4 GWP for Scope 1 and Scope 2, non-fossil for Biogenic
    const isBiogenic = formData.scope === 'biogenic';
    const gwpCh4 = isBiogenic ? gwpCh4NonFossil : gwpCh4Fossil;
    const ch4Label = isBiogenic ? 'Non-fossil' : 'Fossil';
    
    // Calculate CO2e using GWP values from GWP Config
    co2eEmissions = (co2Emissions * gwpCo2) + (ch4Emissions * gwpCh4) + (n2oEmissions * gwpN2o);
    
    let co2eOutputUnit = co2Formula?.output_unit?.replace('CO₂', 'CO₂e') || 'kg CO₂e';
    
    // Add CO2e calculation steps for display
    calculationSteps.co2e = {
      formula_name: `CO₂e Total (GWP Config - ${gwpConfig.source_name || 'SuperAdmin'})`,
      output_unit: co2eOutputUnit,
      gwp_co2: gwpCo2,
      gwp_ch4: gwpCh4,
      gwp_ch4_type: ch4Label,
      gwp_n2o: gwpN2o,
      steps: [
        `CO₂ × GWP(${gwpCo2}) = ${co2Emissions.toFixed(4)} × ${gwpCo2} = ${(co2Emissions * gwpCo2).toFixed(4)}`,
        `+ CH₄ × GWP_CH₄(${ch4Label}: ${gwpCh4}) = ${ch4Emissions.toFixed(4)} × ${gwpCh4} = ${(ch4Emissions * gwpCh4).toFixed(4)}`,
        `+ N₂O × GWP(${gwpN2o}) = ${n2oEmissions.toFixed(4)} × ${gwpN2o} = ${(n2oEmissions * gwpN2o).toFixed(4)}`,
        `= ${co2eEmissions.toFixed(4)} ${co2eOutputUnit}`
      ]
    };
    
    // Build applied formula name string
    const appliedFormulaName = appliedFormulas.length > 0 
      ? appliedFormulas.join(', ')
      : 'No formulas defined';
    
    // Get the conversion info for display
    const selectedUnit = formData.quantity_unit || 'kg';
    const conversionFactor = getConversionFactor('quantity_fuel', selectedUnit);
    const rawQuantity = parseFloat(formData.quantity) || 0;
    const convertedQuantity = rawQuantity * conversionFactor;
    const hasConversion = hasConversionDefined('quantity_fuel', selectedUnit);
    
    return {
      co2Emissions,
      ch4Emissions,
      n2oEmissions,
      co2eEmissions,
      appliedFormulaName,
      calculationSteps,
      // Output units from formula definitions
      co2OutputUnit: co2Formula?.output_unit || 'kg CO₂',
      ch4OutputUnit: ch4Formula?.output_unit || 'kg CH₄',
      n2oOutputUnit: n2oFormula?.output_unit || 'kg N₂O',
      co2eOutputUnit: co2eOutputUnit,
      // Conversion info for display
      conversionInfo: {
        rawQuantity,
        selectedUnit,
        conversionFactor,
        convertedQuantity,
        targetUnit: 'kg',
        hasConversion
      },
      // Flag which gases have formulas defined
      hasCo2Formula: !!co2Formula,
      hasCh4Formula: !!ch4Formula,
      hasN2oFormula: !!n2oFormula,
      hasCo2eFormula: true // CO2e is always calculated using GWP Config values
    };
  }, [formData.quantity, formData.quantity_unit, formData.calorific_value, formData.calorific_value_unit,
      formData.emission_factor_co2, formData.emission_factor_ch4, formData.emission_factor_n2o, 
      formData.emission_factor_basis_quantity, formData.scope, formData.is_custom_factor, formData.custom_emission_factor,
      formData.density, formData.fuel_id, formData.category, selectedCategory, formulaDefinitions, formulaParameters, 
      formulaDataReady, emissionConfigurations, findFormulaForScope, getParameterValueDynamic,
      overrideCalorificValue, overrideDensity, gwpConfig]);

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
      
      // Append new evidence URL to existing ones (don't replace)
      setFormData(prev => {
        const existingUrls = prev.evidence_url ? prev.evidence_url.split(',').filter(u => u.trim()) : [];
        const newUrls = [...existingUrls, response.data.url];
        return {
          ...prev,
          evidence_url: newUrls.join(',')
        };
      });
      
      // Also add to existingEvidences for immediate display
      setExistingEvidences(prev => [...prev, {
        url: response.data.url,
        filename: response.data.filename || `Evidence ${prev.length + 1}`,
        file_id: response.data.file_id
      }]);
      
      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(error.response?.data?.detail || 'Failed to upload file');
    }
  };

  // Delete a single existing evidence
  const handleDeleteExistingEvidence = async (index) => {
    const evidenceToDelete = existingEvidences[index];
    
    // Try to delete from server if it's an uploaded file
    if (evidenceToDelete.url.includes('/api/files/')) {
      const fileIdMatch = evidenceToDelete.url.match(/\/api\/files\/([a-f0-9-]+)/i);
      if (fileIdMatch) {
        try {
          await axios.delete(`${API}/files/${fileIdMatch[1]}`, {
            headers: getAuthHeader()
          });
        } catch (error) {
          console.error('Failed to delete file from server:', error);
        }
      }
    }
    
    // Remove from existingEvidences state
    const newEvidences = existingEvidences.filter((_, i) => i !== index);
    setExistingEvidences(newEvidences);
    
    // Update evidence_url in formData
    setFormData(prev => ({
      ...prev,
      evidence_url: newEvidences.map(e => e.url).join(',')
    }));
    
    toast.success('Evidence removed');
  };

  // Delete all evidences
  const handleDeleteAllEvidences = async () => {
    // Try to delete all uploaded files from server
    for (const evidence of existingEvidences) {
      if (evidence.url.includes('/api/files/')) {
        const fileIdMatch = evidence.url.match(/\/api\/files\/([a-f0-9-]+)/i);
        if (fileIdMatch) {
          try {
            await axios.delete(`${API}/files/${fileIdMatch[1]}`, {
              headers: getAuthHeader()
            });
          } catch (error) {
            console.error('Failed to delete file from server:', error);
          }
        }
      }
    }
    
    setExistingEvidences([]);
    setFormData(prev => ({ ...prev, evidence_url: '' }));
    toast.success('All evidences removed');
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
    
    // FIRST: Read actual values from DOM before any validation
    const cvCheckbox = document.querySelector('[data-testid="override-calorific-checkbox"]');
    const densityCheckbox = document.querySelector('[data-testid="override-density-checkbox"]');
    const cvInput = document.querySelector('[data-testid="calorific-value-input"]');
    const densityInput = document.querySelector('[data-testid="density-input"]');
    
    const isOverrideCV = cvCheckbox?.checked || false;
    const isOverrideDensity = densityCheckbox?.checked || false;
    const cvValue = cvInput?.value || '';
    const densityValue = densityInput?.value || '';
    
    console.log('=== handleSubmit - READING FROM DOM FIRST ===');
    console.log('DOM Checkbox override CV:', isOverrideCV);
    console.log('DOM Input CV value:', cvValue);
    console.log('DOM Checkbox override Density:', isOverrideDensity);
    console.log('DOM Input Density value:', densityValue);
    console.log('State overrideCalorificValue (may be stale):', overrideCalorificValue);
    console.log('State formData.calorific_value (may be stale):', formData.calorific_value);
    
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

    // Validate override justifications - USE DOM VALUES, not state
    if (isOverrideCV && !formData.calorific_value_justification?.trim()) {
      toast.error('Justification is required when overriding Calorific Value');
      return;
    }
    if (isOverrideDensity && !formData.density_justification?.trim()) {
      toast.error('Justification is required when overriding Density');
      return;
    }

    // Validate required fields
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    // Validate at least one process name is provided
    const validProcessNames = formData.process_names.filter(p => p.name && p.name.trim() !== '');
    if (validProcessNames.length === 0) {
      toast.error('At least one Name of Process is required');
      return;
    }
    
    // Validate that all processes with names have descriptions
    const processesWithoutDescription = validProcessNames.filter(p => !p.description || p.description.trim() === '');
    if (processesWithoutDescription.length > 0) {
      toast.error(`Please add description for process: "${processesWithoutDescription[0].name}"`);
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

    // Compute emissions using the formula engine (calculatedEmissions useMemo)
    // No separate hardcoded calculation needed
    
    // Calculate total emissions
    const calc = calculatedEmissions;
    if (!calc && !useCustomFuelType) {
      toast.error('Unable to calculate emissions. Please check all values.');
      return;
    }
    
    // CRITICAL: Validate that if override is enabled, calculated values should reflect override
    // This catches any potential stale calculation issues
    if (overrideCalorificValue && calc) {
      const overrideCV = parseFloat(formData.calorific_value);
      if (!overrideCV || overrideCV <= 0) {
        toast.error('Please enter a valid Calorific Value when override is enabled');
        return;
      }
      
      // Verify the calculation used the override value by extracting the NCV from calculation steps
      const calcSteps = calc.calculationSteps?.co2?.steps || [];
      const calcStepsStr = calcSteps.join(' ');
      console.log('Verification - Calculation steps:', calcStepsStr);
      console.log('Verification - Override CV:', overrideCV);
      
      // Extract the NCV value from "Net Calorific value (X)" in the steps
      const ncvMatch = calcStepsStr.match(/Net Calorific value \(([^)]+)\)/);
      if (ncvMatch) {
        const usedCV = parseFloat(ncvMatch[1]);
        if (Math.abs(usedCV - overrideCV) / Math.max(Math.abs(overrideCV), 1e-15) > 0.01) {
          console.warn('WARNING: Calculation used CV:', usedCV, 'but override is:', overrideCV);
          toast.error('Please wait a moment and try saving again - calculation is updating');
          return;
        }
      }
    }
    if (overrideDensity && calc) {
      const overrideD = parseFloat(formData.density);
      if (!overrideD || overrideD <= 0) {
        toast.error('Please enter a valid Density when override is enabled');
        return;
      }
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
        category: formData.category, // Always use the selected category, even for custom fuels
        sub_category: useCustomFuelType ? formData.custom_fuel_type : formData.sub_category,
        fuel_type: useCustomFuelType ? formData.custom_fuel_type : formData.fuel_type,
        quantity: parseFloat(formData.quantity),
        quantity_unit: useCustomFuelType ? getQuantityUnitFromEFUnit(formData.emission_factor_unit) : (formData.quantity_unit || 'kg'),
        emission_factor: useCustomFuelType 
          ? parseFloat(formData.custom_emission_factor) 
          : (formData.is_custom_factor && formData.scope === 'scope2')
            ? parseFloat(formData.custom_emission_factor)
            : parseFloat(formData.emission_factor_co2) || 0,
        emission_factor_unit: useCustomFuelType ? formData.emission_factor_unit : null, // Save EF unit for custom fuels
        // For Scope 2, save the quantity basis emission factor (both custom and default from database)
        emission_factor_basis_quantity: formData.scope === 'scope2'
          ? (formData.is_custom_factor || useCustomFuelType)
            ? parseFloat(formData.custom_emission_factor) 
            : parseFloat(formData.emission_factor_basis_quantity) || parseFloat(formData.emission_factor_co2) || null
          : null,
        emission_factor_basis_unit: formData.scope === 'scope2' 
          ? (formData.emission_factor_basis_unit || 'tCO2/MWh')
          : null,
        unit: useCustomFuelType 
          ? (formData.scope === 'scope2' ? 'tCO2/MWh' : 'kg CO2e/unit')
          : formData.calorific_value_unit || 'unit',
        // CRITICAL: When override is enabled, use the user-entered value explicitly
        // Use REFS for current values to avoid stale closures
        calorific_value: useCustomFuelType 
          ? null 
          : (overrideCalorificValueRef.current && formDataRef.current.calorific_value) 
            ? parseFloat(formDataRef.current.calorific_value) 
            : parseFloat(formDataRef.current.calorific_value) || null,
        source_of_information: formData.source_of_information,
        notes: formData.notes,
        justification: formData.justification,
        evidence_url: formData.evidence_url,
        responsible_person: formData.responsible_person,
        is_custom_factor: useCustomFuelType || (formData.scope === 'scope2' && formData.is_custom_factor),
        // Fuel database reference
        fuel_database_id: useCustomFuelType ? null : formData.fuel_id,
        emission_factor_ch4: useCustomFuelType ? null : parseFloat(formData.emission_factor_ch4) || null,
        emission_factor_n2o: useCustomFuelType ? null : parseFloat(formData.emission_factor_n2o) || null,
        // CRITICAL: When override is enabled, use the user-entered value explicitly
        // Use refs for current values
        density: useCustomFuelType 
          ? null 
          : (overrideDensityRef.current && formDataRef.current.density) 
            ? parseFloat(formDataRef.current.density) 
            : parseFloat(formDataRef.current.density) || null,
        conversion_factor: 1,  // Not used in the new formula, kept for compatibility
      };
      
      // Use calculatedEmissions from the formula engine (no hardcoded calculations)
      payload.override_calorific_value = overrideCalorificValue;
      payload.override_density = overrideDensity;
      payload.calorific_value = useCustomFuelType ? null : parseFloat(formDataRef.current.calorific_value) || null;
      payload.density = useCustomFuelType ? null : parseFloat(formDataRef.current.density) || null;
      payload.calculated_co2 = calc?.co2Emissions || 0;
      payload.calculated_ch4 = calc?.ch4Emissions || 0;
      payload.calculated_n2o = calc?.n2oEmissions || 0;
      payload.calculated_co2e = calc?.co2eEmissions || 0;
      payload.calorific_value_justification = overrideCalorificValue ? formData.calorific_value_justification : null;
      payload.density_justification = overrideDensity ? formData.density_justification : null;
      
      // Add output units - always include all units
      payload.co2_unit = 'tCO₂';
      payload.ch4_unit = 'tCH₄';
      payload.n2o_unit = 'tN₂O';
      payload.co2e_unit = 'tCO₂e';
      
      // Emission factors - only if formula exists
      if (!calc?.hasCh4Formula) {
        payload.emission_factor_ch4 = null;
      }
      if (!calc?.hasN2oFormula) {
        payload.emission_factor_n2o = null;
      }
      
      // Process names
      payload.process_names = formData.process_names.filter(p => p.name && p.name.trim() !== '').map(p => p.name);
      payload.process_descriptions = formData.process_names.filter(p => p.name && p.name.trim() !== '').map(p => ({
        name: p.name,
        description: p.description || ''
      }));
      
      // Debug: Log what we're saving - DETAILED
      console.log('=== SAVING EMISSION - DETAILED DEBUG ===');
      console.log('Override flags:', {
        overrideCalorificValue,
        overrideDensity
      });
      console.log('FormData values:', {
        calorific_value: formData.calorific_value,
        density: formData.density,
        calorific_value_justification: formData.calorific_value_justification
      });
      console.log('Payload override values:', {
        override_calorific_value: payload.override_calorific_value,
        override_density: payload.override_density,
        calorific_value: payload.calorific_value,
        density: payload.density
      });
      console.log('Calculated emissions:', {
        co2: payload.calculated_co2,
        ch4: payload.calculated_ch4,
        n2o: payload.calculated_n2o,
        co2e: payload.calculated_co2e,
        fromCalcObject: calculatedEmissions
      });
      
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
    
    // Set the category state for UI display
    setSelectedCategory(emission.category || '');
    
    // Restore override flags from saved emission
    setOverrideCalorificValue(emission.override_calorific_value || false);
    setOverrideDensity(emission.override_density || false);
    
    // For Scope 2, use the emission factor value properly
    let customEmissionFactor = '';
    if (emission.is_custom_factor) {
      if (emission.scope === 'scope2') {
        // For Scope 2, use emission_factor_basis_quantity or emission_factor
        customEmissionFactor = emission.emission_factor_basis_quantity?.toString() || 
                               emission.emission_factor?.toString() || '';
      } else {
        customEmissionFactor = emission.emission_factor?.toString() || '';
      }
    }
    
    setFormData({
      facility_id: emission.facility_id,
      reporting_period_start: startPeriod,
      reporting_period_end: endPeriod,
      scope: emission.scope,
      // If category is "Custom" (old format), reset to empty so user can select proper category
      category: emission.category === 'Custom' ? '' : (emission.category || ''),
      sub_category: emission.sub_category || '',
      fuel_id: emission.fuel_database_id || '',
      fuel_type: emission.fuel_type || '',
      custom_fuel_type: emission.is_custom_factor ? emission.fuel_type : '',
      custom_emission_factor: customEmissionFactor,
      emission_factor_unit: emission.emission_factor_unit || 'tCO2/kg', // Load saved EF unit
      quantity: emission.quantity?.toString() || '',
      quantity_unit: emission.quantity_unit || emission.unit || '',
      emission_factor_co2: emission.emission_factor?.toString() || '',
      emission_factor_ch4: emission.emission_factor_ch4?.toString() || '',
      emission_factor_n2o: emission.emission_factor_n2o?.toString() || '',
      emission_factor_basis_quantity: emission.emission_factor_basis_quantity?.toString() || fuelFromDb?.emission_factor_basis_quantity?.toString() || '',
      emission_factor_basis_unit: emission.emission_factor_basis_unit || fuelFromDb?.emission_factor_basis_unit || 'tCO2/MWh',
      // For calorific_value and density: if override is enabled, use the stored value even if it's 0
      // Otherwise fall back to fuel database value
      calorific_value: (emission.override_calorific_value && emission.calorific_value !== null && emission.calorific_value !== undefined)
        ? emission.calorific_value.toString()
        : (emission.calorific_value?.toString() || fuelFromDb?.calorific_value?.toString() || ''),
      calorific_value_unit: fuelFromDb?.calorific_value_unit || '',
      calorific_value_justification: emission.calorific_value_justification || '',
      // For density: if override is enabled, use the stored value even if it's 0
      density: (emission.override_density && emission.density !== null && emission.density !== undefined)
        ? emission.density.toString()
        : (emission.density?.toString() || fuelFromDb?.density?.toString() || ''),
      density_unit: fuelFromDb?.density_unit || '',
      density_justification: emission.density_justification || '',
      conversion_factor: emission.conversion_factor?.toString() || '1',
      source_of_information: emission.source_of_information || '',
      justification: emission.justification || '',
      notes: emission.notes || '',
      responsible_person: emission.responsible_person || '',
      evidence_url: emission.evidence_url || '',
      is_custom_factor: emission.is_custom_factor || false,
      // Load process names with descriptions
      process_names: (() => {
        // If we have process_descriptions (new format), use that
        if (emission.process_descriptions?.length > 0) {
          return emission.process_descriptions.map(pd => ({
            name: pd.name || '',
            description: pd.description || ''
          }));
        }
        // Fallback to old format (array of strings)
        if (emission.process_names?.length > 0) {
          return emission.process_names.map(name => ({
            name: typeof name === 'string' ? name : (name.name || ''),
            description: typeof name === 'object' ? (name.description || '') : ''
          }));
        }
        return [{ name: '', description: '' }];
      })(),
      // Process Emissions fields
      template_id: emission.template_id || '',
      template_inputs: emission.template_inputs || {},
      calculated_co2e: emission.calculated_co2e?.toString() || emission.calculated_emissions?.co2e?.toString() || ''
    });
    
    // Parse existing evidences from evidence_url (comma-separated)
    if (emission.evidence_url) {
      const existingUrls = emission.evidence_url.split(',').filter(url => url.trim());
      setExistingEvidences(existingUrls.map((url, idx) => ({
        url: url.trim(),
        filename: `Evidence ${idx + 1}`
      })));
    } else {
      setExistingEvidences([]);
    }
    
    // useCustomFuelType is only true when using a completely custom fuel (no database reference)
    // is_custom_factor with fuel_database_id means it's an override of existing fuel's EF
    // Never allow custom fuel type for scope2
    setUseCustomFuelType(emission.scope !== 'scope2' && emission.is_custom_factor && !emission.fuel_database_id);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/emissions/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Emission record deleted successfully');
      setDeleteConfirmOpen(false);
      setEmissionToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Delete failed');
    }
  };

  const openDeleteConfirm = (emission) => {
    setEmissionToDelete(emission);
    setDeleteConfirmOpen(true);
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
      calorific_value_justification: '',
      density: '',
      density_unit: '',
      density_justification: '',
      conversion_factor: '1',
      source_of_information: '',
      justification: '',
      notes: '',
      responsible_person: '',
      evidence_url: '',
      is_custom_factor: false,
      process_names: [{ name: '', description: '' }]
    });
    setUploadedEvidence(null);
    setExistingEvidences([]); // Clear existing evidences
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
  // Get active facilities only for filtering emissions
  const activeFacilityIds = useMemo(() => {
    return facilities.filter(f => f.is_active !== false).map(f => f.id);
  }, [facilities]);

  const filteredEmissions = useMemo(() => {
    let filtered = emissions.filter(e => {
      // Hide emissions from deactivated facilities
      if (!activeFacilityIds.includes(e.facility_id)) return false;
      
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
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          // Sort by reporting period start date
          const dateA = new Date(a.reporting_period.split(' to ')[0] + '-01');
          const dateB = new Date(b.reporting_period.split(' to ')[0] + '-01');
          comparison = dateA - dateB;
          break;
        case 'created_at':
          // Sort by created_at timestamp
          const createdA = new Date(a.created_at || 0);
          const createdB = new Date(b.created_at || 0);
          comparison = createdA - createdB;
          break;
        case 'facility':
          // Sort by facility name
          const facilityA = facilities.find(f => f.id === a.facility_id)?.name || '';
          const facilityB = facilities.find(f => f.id === b.facility_id)?.name || '';
          comparison = facilityA.localeCompare(facilityB);
          break;
        case 'fuel':
          // Sort by fuel type/sub_category
          comparison = (a.sub_category || a.fuel_type || '').localeCompare(b.sub_category || b.fuel_type || '');
          break;
        case 'emissions':
          // Sort by total CO2e emissions
          comparison = (a.calculated_co2e || 0) - (b.calculated_co2e || 0);
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [emissions, activeScope, filterFacility, filterCategory, filterDateRange, activeFacilityIds, sortBy, sortOrder, facilities]);

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
      
      // Get auth token
      const authHeader = getAuthHeader();
      const token = authHeader?.Authorization?.replace('Bearer ', '');
      
      // Extract file ID and trigger download using fetch + blob
      const fileIdMatch = evidenceUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        const downloadUrl = `${BACKEND_URL}/api/files/${fileId}/download`;
        
        // Use fetch to get the file as blob with auth header
        const response = await fetch(downloadUrl, {
          method: 'GET',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
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

  // Check if organization has emission access
  // If enabled_access is null/undefined, default to scope1_2. If it's an empty array, no access.
  const enabledAccess = organization?.enabled_access;
  const hasEmissionAccess = enabledAccess === null || enabledAccess === undefined 
    ? true  // Default access if not set
    : enabledAccess.some(access => ['scope1_2', 'scope1_2_3'].includes(access));

  return (
    <div className="space-y-6" data-testid="emissions-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">GHG Emissions</h1>
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
          {hasEmissionAccess ? (
            <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="add-emission-button">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Emission
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingEmission ? 'Update' : 'Add'} Emission Record</DialogTitle>
                </DialogHeader>
              {!editingEmission ? (
                <EmissionEntryForm
                  facilities={facilities}
                  fuelDatabase={fuelDatabase}
                  centralizedUnits={centralizedUnits}
                  formulaDefinitions={formulaDefinitions}
                  formulaParameters={formulaParameters}
                  emissionConfigurations={emissionConfigurations}
                  gwpConfig={gwpConfig}
                  processTemplates={processTemplates}
                  getAuthHeader={getAuthHeader}
                  onSuccess={() => {
                    setDialogOpen(false);
                    fetchData();
                    toast.success('Emissions saved successfully');
                  }}
                  onCancel={() => setDialogOpen(false)}
                />
              ) : (
                /* Keep existing edit form for backward compatibility */
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
                      {facilities.filter(f => f.is_active !== false).map(f => (
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
                              setFormData({ ...formData, scope: e.target.value, fuel_id: '', category: '', sub_category: '', is_custom_factor: false, custom_fuel_type: '', custom_emission_factor: '' });
                              handleFuelSelect('');
                              if (e.target.value === 'scope2') setUseCustomFuelType(false);
                            }}
                            className="text-primary"
                          />
                          {scope === 'biogenic' ? 'Biogenic' : `Scope ${scope.slice(-1)}`}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Reporting Period - For editing, only show the single month input */}
                {editingEmission ? (
                  <div className="space-y-2">
                    <Label htmlFor="reporting_period_start">
                      <CalendarIcon className="w-4 h-4 inline mr-1" />
                      Reporting Month *
                    </Label>
                    <MonthYearPicker
                      id="reporting_period_start"
                      value={formData.reporting_period_start}
                      disableFuture={true}
                      onChange={(val) => {
                        setFormData(prev => ({ 
                          ...prev, 
                          reporting_period_start: val,
                          reporting_period_end: val
                        }));
                      }}
                      placeholder="Select month"
                      className="bg-stone-50"
                    />
                    <p className="text-xs text-text-muted">Each emission entry record is for a single month</p>
                  </div>
                ) : (
                  /* For new emissions, show period type selection */
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Label>Reporting Period Type *</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="period_type"
                            checked={formData.reporting_period_start === formData.reporting_period_end || !formData.reporting_period_end}
                            onChange={() => {
                              setFormData(prev => ({
                                ...prev,
                                reporting_period_end: prev.reporting_period_start
                              }));
                            }}
                            className="text-primary"
                          />
                          Single Month
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="period_type"
                            checked={formData.reporting_period_start !== formData.reporting_period_end && !!formData.reporting_period_end}
                            onChange={() => {
                              // Set to full year (12 months) starting from current start month or current month
                              const currentDate = new Date();
                              const startMonth = formData.reporting_period_start || `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                              const [year, month] = startMonth.split('-').map(Number);
                              // Calculate end month (11 months later = 12 month period)
                              let endYear = year;
                              let endMonth = month + 11;
                              if (endMonth > 12) {
                                endYear += 1;
                                endMonth -= 12;
                              }
                              setFormData(prev => ({
                                ...prev,
                                reporting_period_start: startMonth,
                                reporting_period_end: `${endYear}-${String(endMonth).padStart(2, '0')}`
                              }));
                            }}
                            className="text-primary"
                          />
                          Full Year (12 months)
                        </label>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {formData.reporting_period_start === formData.reporting_period_end || !formData.reporting_period_end ? (
                        /* Single Month Mode */
                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="reporting_period_start">
                            <CalendarIcon className="w-4 h-4 inline mr-1" />
                            Reporting Month *
                          </Label>
                          <MonthYearPicker
                            id="reporting_period_start"
                            value={formData.reporting_period_start}
                            disableFuture={true}
                            onChange={(val) => {
                              setFormData(prev => ({ 
                                ...prev, 
                                reporting_period_start: val,
                                reporting_period_end: val // Keep them synced in single month mode
                              }));
                            }}
                            placeholder="Select month"
                            className="bg-stone-50"
                          />
                        </div>
                      ) : (
                      /* Full Year Mode - Select starting month */
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="year_start_month">
                            <CalendarIcon className="w-4 h-4 inline mr-1" />
                            Starting Month *
                          </Label>
                          <MonthYearPicker
                            id="year_start_month"
                            value={formData.reporting_period_start}
                            disableFuture={true}
                            onChange={(val) => {
                              const startMonth = val;
                              const [year, month] = startMonth.split('-').map(Number);
                              // Calculate end month (11 months later = 12 month period)
                              let endYear = year;
                              let endMonth = month + 11;
                              if (endMonth > 12) {
                                endYear += 1;
                                endMonth -= 12;
                              }
                              setFormData(prev => ({
                                ...prev,
                                reporting_period_start: startMonth,
                                reporting_period_end: `${endYear}-${String(endMonth).padStart(2, '0')}`
                              }));
                            }}
                            placeholder="Select starting month"
                            className="bg-stone-50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-text-muted">Period (12 months)</Label>
                          <p className="text-sm text-text-secondary h-10 flex items-center bg-stone-100 px-3 rounded-md">
                            {formData.reporting_period_start && formData.reporting_period_end 
                              ? `${formData.reporting_period_start} to ${formData.reporting_period_end}`
                              : 'Select a starting month'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                )}

                {/* Process Emissions Edit View */}
                {isEditingProcessEmission ? (
                  <div className="space-y-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-5 h-5 text-emerald-600" />
                      <h3 className="font-medium text-emerald-800">Process Emission Details</h3>
                    </div>
                    
                    {/* Category and Sub-Industry - Read Only */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <div className="h-10 px-3 py-2 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-800 flex items-center">
                          Process Emissions
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Sub-Industry</Label>
                        <div className="h-10 px-3 py-2 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-800 flex items-center">
                          {formData.sub_category || editingEmission?.sub_category || 'N/A'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Approach/Template Used - Read Only */}
                    <div className="space-y-2">
                      <Label>Approach Used (Template)</Label>
                      <div className="h-10 px-3 py-2 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-800 flex items-center">
                        {formData.fuel_type || editingEmission?.fuel_type || 'N/A'}
                      </div>
                    </div>
                    
                    {/* Template Input Values - Read Only */}
                    {(formData.template_inputs || editingEmission?.template_inputs) && Object.keys(formData.template_inputs || editingEmission?.template_inputs || {}).length > 0 && (
                      <div className="space-y-2">
                        <Label>Template Input Values</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(formData.template_inputs || editingEmission?.template_inputs || {}).map(([key, value]) => (
                            <div key={key} className="p-2 bg-white rounded border border-emerald-200">
                              <span className="text-xs text-stone-500 capitalize">{key.replace(/_/g, ' ')}</span>
                              <p className="font-medium">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Activity Data (Quantity) - Editable */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Activity Data (Quantity)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.quantity}
                          onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                          className="bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Unit <span className="text-xs text-emerald-600">(fixed)</span></Label>
                        <div className="h-10 px-3 py-2 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-700 flex items-center">
                          {formData.quantity_unit || editingEmission?.quantity_unit || editingEmission?.unit || 'unit'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Calculated Emissions */}
                    <div className="p-3 bg-white rounded-lg border border-emerald-300">
                      <Label className="text-emerald-700 mb-2 block">Calculated Emissions</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs text-stone-500">CO₂e</span>
                          <p className="text-lg font-bold text-emerald-700">
                            {editingEmission?.calculated_co2e?.toFixed(4) || editingEmission?.calculated_emissions?.co2e?.toFixed(4) || '0'} tCO₂e
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-stone-500">CO₂</span>
                          <p className="text-lg font-bold text-stone-600">
                            {editingEmission?.calculated_co2?.toFixed(4) || editingEmission?.calculated_emissions?.co2?.toFixed(4) || '0'} tCO₂
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Person Responsible - Editable */}
                    <div className="space-y-2">
                      <Label>Person Responsible</Label>
                      <Input
                        value={formData.responsible_person}
                        onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                        placeholder="Name of person responsible"
                        className="bg-white"
                      />
                    </div>
                    
                    {/* Notes - Editable */}
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Input
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Additional notes..."
                        className="bg-white"
                      />
                    </div>
                  </div>
                ) : (
                /* Regular Fuel Emissions Edit View */
                <>
                {/* Fuel Selection - Step 1: Category, Step 2: Fuel */}
                <div className="space-y-4">
                  {!formData.facility_id ? (
                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">
                        <strong>Please select a facility first</strong> to see available fuel categories and types.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <Label>Select Fuel from Database *</Label>
                        <div className="flex gap-4">
                          {/* Custom Emission Factor Override Option - only for Scope 2 */}
                          {formData.fuel_id && !useCustomFuelType && formData.scope === 'scope2' && (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={formData.is_custom_factor}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    // Pre-fill with current emission factor so user can modify it
                                    // Clear source_of_information so user can enter it manually for custom EF
                                    const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      is_custom_factor: true,
                                      custom_emission_factor: fuel?.emission_factor_basis_quantity?.toString() || prev.emission_factor_co2 || '',
                                      source_of_information: '' // Issue 1: Clear source field for custom EF
                                    }));
                                  } else {
                                    // Restore original emission factor from selected fuel
                                    const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      is_custom_factor: false, 
                                      custom_emission_factor: '',
                                      emission_factor_co2: fuel?.emission_factor_co2?.toString() || prev.emission_factor_co2,
                                      justification: '',
                                      source_of_information: fuel?.source || '' // Restore fuel source when unchecking
                                    }));
                                  }
                                }}
                                className="text-amber-600"
                              />
                              <span className="text-amber-700">Use Custom Emission Factor</span>
                            </label>
                          )}
                        </div>
                      </div>
                      
                      {/* Custom Emission Factor Override Section - shows when fuel selected and override enabled (Scope 2 only) */}
                      {formData.fuel_id && formData.is_custom_factor && !useCustomFuelType && formData.scope === 'scope2' && (
                        <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 space-y-4">
                          <p className="text-sm text-amber-800">
                            <strong>Override Emission Factor:</strong> You are overriding the default emission factor for this fuel. Justification is required.
                          </p>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="custom_ef_override">Custom Emission Factor *</Label>
                              <div className="flex gap-2">
                                <Input
                                  id="custom_ef_override"
                                  type="number"
                                  step="0.0001"
                                  value={formData.custom_emission_factor}
                                  onChange={(e) => setFormData(prev => ({ ...prev, custom_emission_factor: e.target.value }))}
                                  required
                                  placeholder="Enter custom value"
                                  className="bg-white flex-1"
                                />
                                <div className="h-10 px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg text-stone-500 text-sm whitespace-nowrap">
                                  {formData.emission_factor_basis_unit || 'kg CO₂/unit'}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="ef_override_justification" className="text-red-600">Justification * (Required)</Label>
                              <Input
                                id="ef_override_justification"
                                value={formData.justification}
                                onChange={(e) => setFormData(prev => ({ ...prev, justification: e.target.value }))}
                                required
                                placeholder="Why are you overriding?"
                                className="bg-white border-red-200"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="ef_override_source">Source of Custom Value</Label>
                            <Input
                              id="ef_override_source"
                              value={formData.source_of_information}
                              onChange={(e) => setFormData(prev => ({ ...prev, source_of_information: e.target.value }))}
                              placeholder="e.g., Grid operator data, Regional emission factor database"
                              className="bg-white"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Show category/fuel selection - always visible unless using custom fuel type */}
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
                              {fuel.fuel_name}
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
                      
                      {/* Category Selection for Custom Fuel */}
                      <div className="space-y-2">
                        <Label htmlFor="custom_category">Category *</Label>
                        <select
                          id="custom_category"
                          value={formData.category}
                          onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                          required={useCustomFuelType}
                          className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                        >
                          <option value="">Select Category</option>
                          {formData.scope === 'scope1' && (
                            <>
                              <option value="Stationary Combustion">Stationary Combustion</option>
                              <option value="Mobile Combustion">Mobile Combustion</option>
                              <option value="Fugitive Emissions">Fugitive Emissions</option>
                              <option value="Process Emissions">Process Emissions</option>
                            </>
                          )}
                          {formData.scope === 'scope2' && (
                            <>
                              <option value="Purchased Electricity">Purchased Electricity</option>
                              <option value="Purchased Steam">Purchased Steam</option>
                              <option value="Purchased Heating">Purchased Heating</option>
                              <option value="Purchased Cooling">Purchased Cooling</option>
                            </>
                          )}
                          {formData.scope === 'biogenic' && (
                            <>
                              <option value="Stationary Combustion">Stationary Combustion</option>
                              <option value="Mobile Combustion">Mobile Combustion</option>
                              <option value="Biogenic Emissions">Biogenic Emissions</option>
                            </>
                          )}
                        </select>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
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
                          <Label htmlFor="custom_emission_factor">Emission Factor *</Label>
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
                        <div className="space-y-2">
                          <Label htmlFor="emission_factor_unit">EF Unit *</Label>
                          <select
                            id="emission_factor_unit"
                            value={formData.emission_factor_unit || 'tCO2/kg'}
                            onChange={(e) => {
                              const newEFUnit = e.target.value;
                              const newQuantityUnit = getQuantityUnitFromEFUnit(newEFUnit);
                              setFormData(prev => ({ 
                                ...prev, 
                                emission_factor_unit: newEFUnit,
                                quantity_unit: newQuantityUnit // Auto-update quantity unit
                              }));
                            }}
                            className="w-full h-10 bg-white border border-stone-200 rounded-lg px-3"
                          >
                            {getAvailableEFUnits(formData.scope).map(unit => (
                              <option key={unit.value} value={unit.value}>{unit.label}</option>
                            ))}
                          </select>
                          <p className="text-xs text-amber-700">
                            Quantity unit: <strong>{getQuantityUnitFromEFUnit(formData.emission_factor_unit)}</strong>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Show selected fuel info */}
                    </>
                  )}
                </div>

                {/* Process Names - Multiple entries with + button (comes after fuel selection) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Name of Process(es) *</Label>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                          <p>Process in which the fuel is being used</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="space-y-3">
                    {formData.process_names.map((process, index) => (
                      <div key={index} className="border border-stone-200 rounded-lg p-3 space-y-2 bg-stone-50">
                        <div className="flex gap-2 items-start">
                          <div className="flex-1 space-y-2">
                            <Input
                              value={typeof process === 'string' ? process : (process.name || '')}
                              onChange={(e) => {
                                const newProcessNames = [...formData.process_names];
                                if (typeof newProcessNames[index] === 'string') {
                                  newProcessNames[index] = { name: e.target.value, description: '' };
                                } else {
                                  newProcessNames[index] = { ...newProcessNames[index], name: e.target.value };
                                }
                                setFormData(prev => ({ ...prev, process_names: newProcessNames }));
                              }}
                              placeholder={`Process name ${index + 1}`}
                              className="bg-white"
                            />
                            <div className="space-y-1">
                              <label className="text-xs text-stone-500">
                                Description {(typeof process === 'string' ? process : process.name)?.trim() && <span className="text-red-500">*</span>}
                              </label>
                              <textarea
                                value={typeof process === 'string' ? '' : (process.description || '')}
                                onChange={(e) => {
                                  const newProcessNames = [...formData.process_names];
                                  if (typeof newProcessNames[index] === 'string') {
                                    newProcessNames[index] = { name: newProcessNames[index], description: e.target.value };
                                  } else {
                                    newProcessNames[index] = { ...newProcessNames[index], description: e.target.value };
                                  }
                                  setFormData(prev => ({ ...prev, process_names: newProcessNames }));
                                }}
                                placeholder="Process Description (required if name is provided)"
                                className={`w-full px-3 py-2 text-sm bg-white border rounded-lg resize-none ${
                                  (typeof process === 'string' ? process : process.name)?.trim() && 
                                  !(typeof process === 'string' ? '' : process.description)?.trim()
                                    ? 'border-red-300 focus:border-red-500'
                                    : 'border-stone-200'
                                }`}
                                rows={2}
                              />
                            </div>
                          </div>
                          {formData.process_names.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newProcessNames = formData.process_names.filter((_, i) => i !== index);
                                setFormData(prev => ({ ...prev, process_names: newProcessNames }));
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, process_names: [...prev.process_names, { name: '', description: '' }] }))}
                      className="mt-2"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Process
                    </Button>
                  </div>
                </div>

                {/* Quantity Input */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">
                      Quantity * {useCustomFuelType && <span className="text-xs text-amber-600">(unit locked)</span>}
                    </Label>
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
                      {useCustomFuelType ? (
                        <div className="flex items-center h-10 bg-stone-100 border border-stone-200 rounded-lg px-3 w-40 text-stone-600">
                          <span>{getQuantityUnitFromEFUnit(formData.emission_factor_unit)}</span>
                        </div>
                      ) : (
                        <select
                          value={formData.quantity_unit}
                          onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                          className="bg-stone-50 border border-stone-200 rounded-lg px-3 w-40"
                          data-testid="quantity-unit-select"
                        >
                          {availableQuantityUnits.map(unit => (
                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {/* Show if density is required for volume units */}
                    {!useCustomFuelType && availableQuantityUnits.find(u => u.value.toLowerCase() === formData.quantity_unit.toLowerCase())?.requiresDensity && !formData.density && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ Density required for volume-to-mass conversion. Please ensure density is set.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="responsible_person">Person Responsible</Label>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              <Info className="w-4 h-4 text-text-muted hover:text-primary transition-colors" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs bg-stone-800 text-white p-3 text-sm">
                            <p>Person who is maintaining this data</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="responsible_person"
                      value={formData.responsible_person}
                      onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                      className="bg-stone-50"
                    />
                  </div>
                </div>

                {/* Override Options for Calorific Value and Density - Scope 1 and Biogenic, not for Fugitive Emissions */}
                {!useCustomFuelType && formData.fuel_id && formData.scope !== 'scope2' && !formData.category?.toLowerCase()?.includes('fugitive') && (
                  <div className="p-4 bg-stone-50 rounded-lg border border-stone-200 space-y-4">
                    {/* Calorific Value Override */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-4">
                        <label className="flex items-center gap-2 min-w-[200px]">
                          <input
                            type="checkbox"
                            data-testid="override-calorific-checkbox"
                            checked={overrideCalorificValue}
                            onChange={(e) => {
                              setOverrideCalorificValue(e.target.checked);
                              if (e.target.checked) {
                                // Clear the value when override is enabled - user enters fresh value
                                setFormData(prev => ({
                                  ...prev,
                                  calorific_value: '',
                                  calorific_value_justification: ''
                                }));
                              } else {
                                // Reset to fuel database value when unchecked
                                const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                                if (fuel) {
                                  setFormData(prev => ({
                                    ...prev,
                                    calorific_value: fuel.calorific_value?.toString() || '',
                                    calorific_value_justification: ''
                                  }));
                                }
                              }
                            }}
                            className="text-primary"
                          />
                          <span className="text-sm">Calorific Value (if available)</span>
                        </label>
                        {overrideCalorificValue && (
                          <div className="flex gap-2 flex-1 items-center">
                            <Input
                              type="number"
                              step="0.001"
                              data-testid="calorific-value-input"
                              value={formData.calorific_value}
                              onChange={(e) => setFormData({ ...formData, calorific_value: e.target.value })}
                              placeholder="Enter custom value"
                              className="bg-white flex-1"
                              required={overrideCalorificValue}
                            />
                            <span className="flex items-center text-sm text-text-muted px-2 py-1 bg-stone-100 rounded">
                              {formData.calorific_value_unit || 'MJ/kg'}
                            </span>
                          </div>
                        )}
                      </div>
                      {overrideCalorificValue && (
                        <div className="ml-[216px]">
                          <Input
                            type="text"
                            value={formData.calorific_value_justification || ''}
                            onChange={(e) => setFormData({ ...formData, calorific_value_justification: e.target.value })}
                            placeholder="Justifications/Comments *"
                            className="bg-white"
                            required={overrideCalorificValue}
                          />
                        </div>
                      )}
                    </div>

                    {/* Density Override - Only show for volume units */}
                    {isVolumeUnit(formData.quantity_unit, centralizedUnits) && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-4">
                          <label className="flex items-center gap-2 min-w-[200px]">
                            <input
                              type="checkbox"
                              data-testid="override-density-checkbox"
                              checked={overrideDensity}
                              onChange={(e) => {
                                setOverrideDensity(e.target.checked);
                                if (e.target.checked) {
                                  // Clear the value when override is enabled - user enters fresh value
                                  setFormData(prev => ({
                                    ...prev,
                                    density: '',
                                    density_justification: ''
                                  }));
                                } else {
                                  // Reset to fuel database value when unchecked
                                  const fuel = fuelDatabase.find(f => f.id === formData.fuel_id);
                                  if (fuel) {
                                    setFormData(prev => ({
                                      ...prev,
                                      density: fuel.density?.toString() || '',
                                      density_justification: ''
                                    }));
                                  }
                                }
                              }}
                              className="text-primary"
                            />
                            <span className="text-sm">Density Value (if available)</span>
                          </label>
                          {overrideDensity && (
                            <div className="flex gap-2 flex-1 items-center">
                              <Input
                                type="number"
                                step="0.001"
                                data-testid="density-input"
                                value={formData.density}
                                onChange={(e) => setFormData({ ...formData, density: e.target.value })}
                                placeholder="Enter custom value"
                                className="bg-white flex-1"
                                required={overrideDensity}
                              />
                              <span className="flex items-center text-sm text-text-muted px-2 py-1 bg-stone-100 rounded">
                                {formData.density_unit || 'kg/L'}
                              </span>
                            </div>
                          )}
                        </div>
                        {overrideDensity && (
                          <div className="ml-[216px]">
                            <Input
                              type="text"
                              value={formData.density_justification || ''}
                              onChange={(e) => setFormData({ ...formData, density_justification: e.target.value })}
                              placeholder="Justifications/Comments *"
                              className="bg-white"
                              required={overrideDensity}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Calculated Emissions Display - Shows only final values */}
                {calculatedEmissions && !useCustomFuelType && (
                  <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                    {/* Formula Name Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-text-secondary">Calculated Emissions</span>
                      <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        {calculatedEmissions.appliedFormulaName || 'Default Formula'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-3">
                      {/* CO2 Emissions */}
                      <div className="bg-white/70 p-3 rounded-lg border border-red-100">
                        <p className="text-xs text-red-600 font-medium mb-1">CO₂ Emissions</p>
                        <p className="text-lg font-bold text-red-700">
                          {calculatedEmissions.co2Emissions.toFixed(2)}
                        </p>
                        <p className="text-xs text-red-500">{calculatedEmissions.co2OutputUnit}</p>
                      </div>
                      
                      {/* CH4 Emissions */}
                      <div className={`bg-white/70 p-3 rounded-lg border ${calculatedEmissions.hasCh4Formula ? 'border-orange-100' : 'border-stone-200 bg-stone-50'}`}>
                        <p className="text-xs text-orange-600 font-medium mb-1">CH₄ Emissions</p>
                        <p className={`text-lg font-bold ${calculatedEmissions.hasCh4Formula ? 'text-orange-700' : 'text-stone-400'}`}>
                          {calculatedEmissions.ch4Emissions.toFixed(2)}
                        </p>
                        {calculatedEmissions.hasCh4Formula ? (
                          <p className="text-xs text-orange-500">{calculatedEmissions.ch4OutputUnit}</p>
                        ) : (
                          <p className="text-xs text-stone-500 mt-1">No CH₄ formula defined</p>
                        )}
                      </div>
                      
                      {/* N2O Emissions */}
                      <div className={`bg-white/70 p-3 rounded-lg border ${calculatedEmissions.hasN2oFormula ? 'border-purple-100' : 'border-stone-200 bg-stone-50'}`}>
                        <p className="text-xs text-purple-600 font-medium mb-1">N₂O Emissions</p>
                        <p className={`text-lg font-bold ${calculatedEmissions.hasN2oFormula ? 'text-purple-700' : 'text-stone-400'}`}>
                          {calculatedEmissions.n2oEmissions.toFixed(2)}
                        </p>
                        {calculatedEmissions.hasN2oFormula ? (
                          <p className="text-xs text-purple-500">{calculatedEmissions.n2oOutputUnit}</p>
                        ) : (
                          <p className="text-xs text-stone-500 mt-1">No N₂O formula defined</p>
                        )}
                      </div>
                      
                      {/* CO2e Total */}
                      <div className={`p-3 rounded-lg border ${calculatedEmissions.hasCo2eFormula ? 'bg-primary/10 border-primary/30' : 'bg-stone-50 border-stone-200'}`}>
                        <p className={`text-xs font-medium mb-1 ${calculatedEmissions.hasCo2eFormula ? 'text-primary' : 'text-stone-500'}`}>CO₂e Total</p>
                        <p className={`text-lg font-bold ${calculatedEmissions.hasCo2eFormula ? 'text-primary' : 'text-stone-400'}`}>
                          {calculatedEmissions.co2eEmissions.toFixed(2)}
                        </p>
                        {calculatedEmissions.hasCo2eFormula ? (
                          <p className="text-xs text-primary/70">{calculatedEmissions.co2eOutputUnit}</p>
                        ) : (
                          <p className="text-xs text-stone-500 mt-1">No CO₂e formula defined</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Detailed Formula Breakdown */}
                    {calculatedEmissions && calculatedEmissions.calculationSteps && (
                      <div className="mt-4 pt-4 border-t border-primary/20">
                        <p className="text-xs font-medium text-text-muted mb-2">Calculation Details</p>
                        <div className="bg-white/50 p-3 rounded text-xs font-mono space-y-3 text-text-secondary">
                          
                          {/* Unit Conversion Info - Hidden in edit dialog */}
                          
                          {/* CO2 Formula Steps */}
                          {calculatedEmissions.calculationSteps.co2 && (
                            <div className="p-2 bg-red-50 rounded">
                              <p className="font-bold text-red-700">CO₂ Formula: {calculatedEmissions.calculationSteps.co2.formula_name}</p>
                              <p className="text-red-600 text-xs mb-1">{calculatedEmissions.calculationSteps.co2.formula_expression}</p>
                              {calculatedEmissions.calculationSteps.co2.steps.map((step, i) => (
                                <p key={i} className="text-red-800">{step}</p>
                              ))}
                              <p className="font-bold text-red-700 mt-1">Result: {calculatedEmissions.co2Emissions.toFixed(2)} {calculatedEmissions.calculationSteps.co2.output_unit || 'kg CO₂'}</p>
                            </div>
                          )}
                          
                          {/* CH4 Formula Steps */}
                          {calculatedEmissions.calculationSteps.ch4 ? (
                            <div className="p-2 bg-orange-50 rounded">
                              <p className="font-bold text-orange-700">CH₄ Formula: {calculatedEmissions.calculationSteps.ch4.formula_name}</p>
                              <p className="text-orange-600 text-xs mb-1">{calculatedEmissions.calculationSteps.ch4.formula_expression}</p>
                              {calculatedEmissions.calculationSteps.ch4.steps.map((step, i) => (
                                <p key={i} className="text-orange-800">{step}</p>
                              ))}
                              <p className="font-bold text-orange-700 mt-1">Result: {calculatedEmissions.ch4Emissions.toFixed(2)} {calculatedEmissions.calculationSteps.ch4.output_unit || 'kg CH₄'}</p>
                            </div>
                          ) : (
                            <div className="p-2 bg-stone-100 rounded">
                              <p className="text-stone-500">CH₄: No formula defined</p>
                            </div>
                          )}
                          
                          {/* N2O Formula Steps */}
                          {calculatedEmissions.calculationSteps.n2o ? (
                            <div className="p-2 bg-purple-50 rounded">
                              <p className="font-bold text-purple-700">N₂O Formula: {calculatedEmissions.calculationSteps.n2o.formula_name}</p>
                              <p className="text-purple-600 text-xs mb-1">{calculatedEmissions.calculationSteps.n2o.formula_expression}</p>
                              {calculatedEmissions.calculationSteps.n2o.steps.map((step, i) => (
                                <p key={i} className="text-purple-800">{step}</p>
                              ))}
                              <p className="font-bold text-purple-700 mt-1">Result: {calculatedEmissions.n2oEmissions.toFixed(2)} {calculatedEmissions.calculationSteps.n2o.output_unit || 'kg N₂O'}</p>
                            </div>
                          ) : (
                            <div className="p-2 bg-stone-100 rounded">
                              <p className="text-stone-500">N₂O: No formula defined</p>
                            </div>
                          )}
                          
                          {/* CO2e Formula Steps */}
                          {calculatedEmissions.calculationSteps.co2e ? (
                            <div className="p-2 bg-primary/10 rounded">
                              <p className="font-bold text-primary">CO₂e Formula: {calculatedEmissions.calculationSteps.co2e.formula_name}</p>
                              {calculatedEmissions.calculationSteps.co2e.steps.map((step, i) => (
                                <p key={i} className="text-primary">{step}</p>
                              ))}
                            </div>
                          ) : (
                            <div className="p-2 bg-stone-100 rounded">
                              <p className="text-stone-500">CO₂e: No formula defined</p>
                            </div>
                          )}
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
                      {(parseFloat(formData.quantity) * parseFloat(formData.custom_emission_factor)).toFixed(4)} tCO₂e
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      = {formData.quantity} {getQuantityUnitFromEFUnit(formData.emission_factor_unit)} × {formData.custom_emission_factor} {formData.emission_factor_unit || 'tCO2/kg'}
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
                </>
                )}

                {/* Evidence Management Section - Shared by both Process and Regular Emissions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Evidence Documents</Label>
                    {existingEvidences.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteAllEvidences}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete All
                      </Button>
                    )}
                  </div>
                  
                  {/* Existing Evidences List */}
                  {existingEvidences.length > 0 && (
                    <div className="space-y-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
                      <p className="text-xs text-stone-500 font-medium mb-2">
                        {existingEvidences.length} evidence file(s) attached
                      </p>
                      {existingEvidences.map((evidence, idx) => {
                        const fileIdMatch = evidence.url?.match(/\/api\/files\/([a-f0-9-]+)/i);
                        const fileId = fileIdMatch ? fileIdMatch[1] : null;
                        const viewUrl = fileId ? `${BACKEND_URL}/api/files/${fileId}/view` : evidence.url;
                        
                        return (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-md border border-stone-200">
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-sm text-stone-700 truncate flex-1">
                              {evidence.filename || `Evidence ${idx + 1}`}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={viewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 px-2 py-1"
                                title="View file"
                              >
                                <Eye className="w-3 h-3" />
                                View
                              </a>
                              {fileId && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    try {
                                      const downloadUrl = `${BACKEND_URL}/api/files/${fileId}/download`;
                                      const response = await fetch(downloadUrl, {
                                        headers: getAuthHeader()
                                      });
                                      const blob = await response.blob();
                                      const url = window.URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = evidence.filename || 'evidence';
                                      document.body.appendChild(a);
                                      a.click();
                                      window.URL.revokeObjectURL(url);
                                      a.remove();
                                    } catch (err) {
                                      toast.error('Failed to download file');
                                    }
                                  }}
                                  className="text-xs text-green-600 hover:text-green-800 hover:underline flex items-center gap-1 px-2 py-1"
                                  title="Download file"
                                >
                                  <Download className="w-3 h-3" />
                                  Download
                                </button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExistingEvidence(idx)}
                                className="text-red-500 hover:text-red-700 p-1 h-auto"
                                title="Delete this evidence"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Upload New Evidence */}
                  <FileUpload
                    label={existingEvidences.length > 0 ? "Add More Evidence" : "Upload Evidence"}
                    onUpload={handleFileUpload}
                    onRemove={handleRemoveEvidence}
                    uploadedFile={uploadedEvidence}
                  />
                </div>

                {/* Notes - Only show for regular emissions (process emissions have it in their view) */}
                {!isEditingProcessEmission && (
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
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/90 text-white">
                    {editingEmission ? 'Update' : 'Add'} Emission
                  </Button>
                </div>
              </form>
              )}
            </DialogContent>
          </Dialog>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button 
                      className="bg-stone-300 text-stone-500 rounded-full px-6 cursor-not-allowed" 
                      disabled
                      data-testid="add-emission-button-disabled"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Emission
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Your organization does not have emission access. Contact your administrator.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
            
            {/* Second row: Date Range, Sort, and Clear button */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Start Period</Label>
                <MonthYearPicker
                  value={filterDateRange.from ? format(filterDateRange.from, 'yyyy-MM') : ''}
                  maxDate={filterDateRange.to ? format(filterDateRange.to, 'yyyy-MM') : undefined}
                  disableFuture={true}
                  onChange={(val) => setFilterDateRange(prev => ({ 
                    ...prev, 
                    from: val ? new Date(val) : null 
                  }))}
                  placeholder="From"
                  className="w-full bg-stone-50"
                />
              </div>
              <div className="space-y-2">
                <Label>End Period</Label>
                <MonthYearPicker
                  value={filterDateRange.to ? format(filterDateRange.to, 'yyyy-MM') : ''}
                  minDate={filterDateRange.from ? format(filterDateRange.from, 'yyyy-MM') : undefined}
                  disableFuture={true}
                  onChange={(val) => setFilterDateRange(prev => ({ 
                    ...prev, 
                    to: val ? new Date(val) : null 
                  }))}
                  placeholder="To"
                  className="w-full bg-stone-50"
                />
              </div>
              <div className="space-y-2">
                <Label>Sort By</Label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                  data-testid="sort-by-select"
                >
                  <option value="date">Date</option>
                  <option value="created_at">Created At</option>
                  <option value="facility">Facility</option>
                  <option value="fuel">Fuel Type</option>
                  <option value="emissions">Emissions (CO₂e)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Order</Label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                  data-testid="sort-order-select"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => {
                    setFilterFacility('');
                    setFilterCategory('');
                    setFilterDateRange({ from: null, to: null });
                    setSortBy('date');
                    setSortOrder('desc');
                  }}
                  variant="outline"
                  className="w-full h-10"
                >
                  Clear All
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Tabs value={activeScope} onValueChange={(value) => { if (value !== 'scope3') setActiveScope(value); }} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="scope1">Scope 1</TabsTrigger>
          <TabsTrigger value="scope2">Scope 2</TabsTrigger>
          <TabsTrigger value="biogenic">Biogenic</TabsTrigger>
          <TabsTrigger value="scope3" disabled className="relative cursor-not-allowed opacity-60 text-stone-400">
            Scope 3
            <span className="absolute -top-2 -right-2 z-10 px-1.5 py-0.5 bg-yellow-400/70 text-yellow-900 text-[9px] font-semibold rounded whitespace-nowrap">
              Coming Soon
            </span>
          </TabsTrigger>
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
                            {emission.quantity} {emission.quantity_unit || 'kg'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Gas-wise Emission Breakdown */}
                      <div className="grid grid-cols-4 gap-3 mt-4 p-3 bg-gradient-to-br from-stone-50 to-stone-100 rounded-lg">
                        <div className="text-center">
                          <p className="text-xs text-red-600 font-medium mb-1">CO₂</p>
                          <p className="text-sm font-bold text-red-700">
                            {(emission.calculated_co2 || emission.co2_emissions || emission.total_emissions || 0).toFixed(4)} {emission.co2_unit || 'tCO₂'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-orange-600 font-medium mb-1">CH₄</p>
                          <p className="text-sm font-bold text-orange-700">
                            {(emission.calculated_ch4 || emission.ch4_emissions || 0).toFixed(4)} {emission.ch4_unit || 'tCH₄'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-purple-600 font-medium mb-1">N₂O</p>
                          <p className="text-sm font-bold text-purple-700">
                            {(emission.calculated_n2o || emission.n2o_emissions || 0).toFixed(4)} {emission.n2o_unit || 'tN₂O'}
                          </p>
                        </div>
                        <div className="text-center bg-primary/10 rounded-lg py-1">
                          <p className="text-xs text-primary font-medium mb-1">Total CO₂e</p>
                          <p className="text-lg font-heading font-bold text-primary">
                            {(emission.calculated_co2e || emission.co2e_emissions || emission.total_emissions || 0).toFixed(4)} {emission.co2e_unit || 'tCO₂e'}
                          </p>
                        </div>
                      </div>

                      {/* Created/Updated Info */}
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
                        {(emission.created_by_name || emission.created_by_email) && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Created by: {emission.created_by_name || emission.created_by_email}
                          </span>
                        )}
                        {emission.created_at && (
                          <span>Created: {new Date(emission.created_at).toLocaleDateString()}</span>
                        )}
                        {(emission.updated_by_name || emission.updated_by_email) && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Updated by: {emission.updated_by_name || emission.updated_by_email}
                          </span>
                        )}
                        {emission.updated_at && (
                          <span>Updated: {new Date(emission.updated_at).toLocaleDateString()}</span>
                        )}
                      </div>

                      {emission.evidence_url && (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-stone-600">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="font-medium">Evidence Files:</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {emission.evidence_url.split(',').filter(url => url.trim()).map((url, idx) => {
                              const trimmedUrl = url.trim();
                              const fileIdMatch = trimmedUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
                              const fileId = fileIdMatch ? fileIdMatch[1] : null;
                              const isUploadedFile = trimmedUrl.includes('/api/files/');
                              
                              return (
                                <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-stone-50 rounded-md border border-stone-200">
                                  <span className="text-xs text-stone-600">File {idx + 1}</span>
                                  <button
                                    onClick={(e) => handleViewEvidence(trimmedUrl, e)}
                                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3" />
                                    View
                                  </button>
                                  {isUploadedFile && (
                                    <button
                                      onClick={(e) => handleDownloadEvidence(trimmedUrl, e)}
                                      className="text-xs text-green-600 hover:text-green-800 hover:underline flex items-center gap-1"
                                    >
                                      <Download className="w-3 h-3" />
                                      Download
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
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
                        onClick={() => openDeleteConfirm(emission)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        data-testid={`delete-emission-${emission.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Emission Record</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div>
                      <span>Are you sure you want to delete this emission record? This action cannot be undone.</span>
                      {emissionToDelete && (
                        <div className="mt-2 p-2 bg-stone-50 rounded text-sm">
                          <strong>Facility:</strong> {facilities.find(f => f.id === emissionToDelete.facility_id)?.name || 'Unknown'}<br/>
                          <strong>Category:</strong> {emissionToDelete.category}<br/>
                          <strong>Quantity:</strong> {emissionToDelete.quantity} {emissionToDelete.quantity_unit}
                        </div>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setEmissionToDelete(null)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => emissionToDelete && handleDelete(emissionToDelete.id)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

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

      {/* Version History Dialog - With field-level changes */}
      {!isRegularUser && (
        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedEmissionHistory.length > 0 ? (
                selectedEmissionHistory.map((history, idx) => {
                  // Determine if this is a creation or update based on old_values
                  const hasOldValues = history.changes?.old_values && Object.keys(history.changes.old_values).length > 0;
                  const action = history.changes?.action || (hasOldValues ? 'updated' : 'created');
                  const isCreation = action === 'created' || !hasOldValues;
                  const oldValues = history.changes?.old_values || {};
                  const newValues = history.changes?.new_values || {};
                  
                  // Find changed fields (for updates only)
                  const changedFields = [];
                  if (!isCreation && oldValues && newValues) {
                    // Helper to get emission value with fallback for backward compatibility
                    // Old history records use calculated_* fields, new ones use *_emissions fields
                    const getEmissionValue = (obj, primaryKey, fallbackKey) => {
                      return obj[primaryKey] ?? obj[fallbackKey] ?? null;
                    };
                    
                    const fieldsToCompare = [
                      { key: 'quantity', label: 'Quantity' },
                      { key: 'quantity_unit', label: 'Unit' },
                      { key: 'category', label: 'Category' },
                      { key: 'sub_category', label: 'Sub Category' },
                      { key: 'fuel_type', label: 'Fuel Type' },
                      { key: 'scope', label: 'Scope' },
                      { key: 'reporting_period', label: 'Reporting Period' },
                      { key: 'responsible_person', label: 'Person Responsible' },
                      { key: 'process_names', label: 'Process Names' },
                      { key: 'notes', label: 'Notes' },
                      { key: 'total_emissions', label: 'Total Emissions (tCO₂e)', fallback: 'calculated_co2e' },
                      { key: 'co2_emissions', label: 'CO₂ Emissions', fallback: 'calculated_co2' },
                      { key: 'ch4_emissions', label: 'CH₄ Emissions', fallback: 'calculated_ch4' },
                      { key: 'n2o_emissions', label: 'N₂O Emissions', fallback: 'calculated_n2o' },
                    ];
                    
                    fieldsToCompare.forEach(({ key, label, fallback }) => {
                      let oldVal = fallback ? getEmissionValue(oldValues, key, fallback) : oldValues[key];
                      let newVal = fallback ? getEmissionValue(newValues, key, fallback) : newValues[key];
                      
                      // Handle arrays
                      if (Array.isArray(oldVal)) oldVal = oldVal.filter(v => v).join(', ');
                      if (Array.isArray(newVal)) newVal = newVal.filter(v => v).join(', ');
                      
                      // Format numbers
                      if (typeof oldVal === 'number') oldVal = oldVal.toFixed(4);
                      if (typeof newVal === 'number') newVal = newVal.toFixed(4);
                      
                      // Compare as strings
                      const oldStr = String(oldVal || '');
                      const newStr = String(newVal || '');
                      
                      if (oldStr !== newStr) {
                        changedFields.push({ label, oldValue: oldStr || '(empty)', newValue: newStr || '(empty)' });
                      }
                    });
                  }
                  
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
                              {history.changed_by_name || history.changed_by_email || 'Unknown User'}
                            </p>
                          </div>
                          
                          {/* Show initial values for creation entries */}
                          {isCreation && newValues && Object.keys(newValues).length > 0 && (
                            <div className="mt-4 pt-4 border-t border-stone-200">
                              <p className="text-xs font-semibold text-text-muted uppercase mb-3">Initial Values</p>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                {[
                                  { key: 'quantity', label: 'Quantity', format: (v, nv) => `${v} ${nv.quantity_unit || ''}` },
                                  { key: 'fuel_type', label: 'Fuel Type' },
                                  { key: 'scope', label: 'Scope' },
                                  { key: 'category', label: 'Category' },
                                  { key: 'co2_emissions', label: 'CO₂ Emissions', fallback: 'calculated_co2', format: (v) => v ? `${Number(v).toFixed(4)} tCO₂` : 'NA' },
                                  { key: 'ch4_emissions', label: 'CH₄ Emissions', fallback: 'calculated_ch4', format: (v) => v ? `${Number(v).toFixed(6)} tCH₄` : 'NA' },
                                  { key: 'n2o_emissions', label: 'N₂O Emissions', fallback: 'calculated_n2o', format: (v) => v ? `${Number(v).toFixed(6)} tN₂O` : 'NA' },
                                  { key: 'total_emissions', label: 'Total CO₂e', fallback: 'calculated_co2e', format: (v) => v ? `${Number(v).toFixed(4)} tCO₂e` : 'NA' },
                                ].map(({ key, label, fallback, format }) => {
                                  const value = newValues[key] ?? (fallback ? newValues[fallback] : null);
                                  const displayValue = format ? format(value, newValues) : (value || 'NA');
                                  return (
                                    <div key={key} className="bg-stone-50 p-2 rounded">
                                      <span className="text-xs text-text-muted">{label}</span>
                                      <p className="text-text-primary font-medium">{displayValue}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          
                          {/* Show changed fields for updates only */}
                          {!isCreation && changedFields.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-stone-200">
                              <p className="text-xs font-semibold text-text-muted uppercase mb-3">Changes Made</p>
                              <div className="space-y-2">
                                {changedFields.map((field, fieldIdx) => (
                                  <div key={fieldIdx} className="bg-stone-50 rounded-lg p-3">
                                    <p className="text-xs font-medium text-text-primary mb-2">{field.label}</p>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div className="bg-red-50 p-2 rounded border border-red-100">
                                        <span className="text-xs text-red-600 font-medium">Old Value</span>
                                        <p className="text-red-800 break-words">{field.oldValue}</p>
                                      </div>
                                      <div className="bg-green-50 p-2 rounded border border-green-100">
                                        <span className="text-xs text-green-600 font-medium">New Value</span>
                                        <p className="text-green-800 break-words">{field.newValue}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
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
