import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { MonthYearPicker } from '../components/ui/month-year-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { FileUpload } from '../components/ui/file-upload';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Plus, Trash2, Activity, History, Filter, FileText, Download, Edit, Calendar as CalendarIcon, User, Eye, Info, Calculator, Upload, X, Check, ChevronRight, ChevronLeft, Loader2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { validateFileSize, getUploadErrorMessage } from '../lib/uploadUtils';
import EmissionEntryForm from '../components/EmissionEntryForm';
import MultiEmployeeInput from '../components/MultiEmployeeInput';
import { useCalcEngine } from '../hooks/useCalcEngine';
import { useAutoSave, AutoSaveStatus } from '../hooks/useAutoSave';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper function to download files
const downloadFileHelper = (url, filename) => {
  window.location.href = url;
};

export default function Emissions() {
  const [emissions, setEmissions] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [fuelDatabase, setFuelDatabase] = useState([]);
  const [formulaDefinitions, setFormulaDefinitions] = useState([]); // Super Admin defined formulas
  const [formulaParameters, setFormulaParameters] = useState([]); // Super Admin defined parameters with conversions
  const [emissionConfigurations, setEmissionConfigurations] = useState([]); // Scope-to-formula mappings
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false); // Track save operation state
  const [formulaDataReady, setFormulaDataReady] = useState(false); // Track when formula data is loaded
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedEmissionHistory, setSelectedEmissionHistory] = useState([]);
  const [activeScope, setActiveScope] = useState('scope1');
  const [filterFacility, setFilterFacility] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFrequency, setFilterFrequency] = useState(''); // 'monthly', 'yearly', or '' for all
  const [filterDateRange, setFilterDateRange] = useState({ from: null, to: null });
  const [searchQuery, setSearchQuery] = useState(''); // Search query for emissions
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // Sort options: date, facility, fuel, emissions
  const [sortOrder, setSortOrder] = useState('desc'); // asc or desc
  const [editingEmission, setEditingEmission] = useState(null);
  const [overrideCalorificValue, setOverrideCalorificValue] = useState(false);
  const [overrideDensity, setOverrideDensity] = useState(false);
  const [overrideEmissionFactorHeat, setOverrideEmissionFactorHeat] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState(''); // #17: Override justification
  const [isCalculating, setIsCalculating] = useState(false); // Track calculation state for save button
  
  // Centralized Label Configuration (fetched from backend)
  const [configLabels, setConfigLabels] = useState({
    calculation_methods: {
      activity_basis: 'Average Data Based',
      spend_basis: 'Spend Based',
      supplier_basis: 'Supplier Based'
    },
    calculation_methods_short: {
      activity_basis: 'Average',
      spend_basis: 'Spend',
      supplier_basis: 'Supplier'
    }
  });
  
  // Modal Protection State (#19 - Prevent accidental close)
  const [isFormDirty, setIsFormDirty] = useState(false); // Track if form has unsaved changes
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false); // Confirmation dialog
  const [pendingCloseAction, setPendingCloseAction] = useState(null); // Store pending close action
  
  const [selectedCategory, setSelectedCategory] = useState(''); // Category selection before fuel
  const { getAuthHeader, user } = useAuth();
  
  // Scope 3 specific state for inline edit form
  const [scope3EFData, setScope3EFData] = useState([]);
  const [scope3Method, setScope3Method] = useState('');
  const [scope3ActivityId, setScope3ActivityId] = useState('');
  const [scope3ActivityType, setScope3ActivityType] = useState(''); // Activity type filter for C6/C7
  const [scope3Subcategory, setScope3Subcategory] = useState(''); // Subcategory filter for C8/C10/C11/C13/C14
  const [scope3CustomActivity, setScope3CustomActivity] = useState(''); // Custom activity name for supplier_basis
  const [useCustomActivity, setUseCustomActivity] = useState(false); // Toggle for custom activity
  const [fugitiveEmissionsData, setFugitiveEmissionsData] = useState([]); // Fugitive emissions from fuel_database
  const [loadingScope3EF, setLoadingScope3EF] = useState(false);
  const [activitySearchTerm, setActivitySearchTerm] = useState(''); // Search filter for activities in edit dialog
  
  // Biogenic-specific state
  const [biogenicScopeSelection, setBiogenicScopeSelection] = useState(''); // 'scope1' or 'scope3' when biogenic tab is active
  const [biogenicCategories, setBiogenicCategories] = useState([]); // Categories that have biogenic entries
  const [loadingBiogenicCategories, setLoadingBiogenicCategories] = useState(false);
  
  // Multi-Employee state (for C7 Employee Commuting edit)
  // C7 always uses multi-employee mode - no toggle needed
  const [editEmployees, setEditEmployees] = useState([]);
  const [editEmployeeMonthlyTotals, setEditEmployeeMonthlyTotals] = useState({});
  const [editEmployeeYearlyTotal, setEditEmployeeYearlyTotal] = useState({});
  const [isCalculatingEditEmployee, setIsCalculatingEditEmployee] = useState(false);
  const [editC7Month, setEditC7Month] = useState(null); // Single month for new C7 monthly model
  
  // Frequency type state for edit mode (monthly vs yearly)
  // This is locked once a record is saved and cannot be changed
  const [editFrequencyType, setEditFrequencyType] = useState('monthly');
  
  // Backend calc engine hook
  const { 
    executeCalculation: executeBackendCalc, 
    isCalculating: isBackendCalculating, 
    error: calcEngineError 
  } = useCalcEngine(getAuthHeader);
  
  // Track if backend calc engine was used (for future display/logging)
  const [calcEngineUsed, setCalcEngineUsed] = useState(false);
  
  // ============================================================================
  // DYNAMIC FORM CONFIG - Loaded from ce_input_field_mappings via form-config API
  // This replaces hardcoded fields with database-driven configuration
  // ============================================================================
  const [editFormConfig, setEditFormConfig] = useState(null);
  const [editFormConfigLoading, setEditFormConfigLoading] = useState(false);
  
  // Loading state for edit dialog - prevents showing partial/stale data
  const [isEditLoading, setIsEditLoading] = useState(false);
  
  // Dynamic input field values for the edit form (keyed by field.field_key)
  const [dynamicFieldValues, setDynamicFieldValues] = useState({});
  
  // Store the emission ID being edited (for fetching audit log)
  const [editingEmissionId, setEditingEmissionId] = useState(null);
  
  // Store the fetched audit log for the emission
  const [emissionAuditLog, setEmissionAuditLog] = useState([]);

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
    emission_factor_heat: '', // Override Custom CO2 Emission Factor (Heat Basis) - kg CO₂/TJ
    emission_factor_heat_justification: '', // Justification when overriding EF heat basis
    conversion_factor: '1',
    source_of_information: '',
    justification: '',
    notes: '',
    responsible_person: '',
    responsible_person_designation: '',
    responsible_person_contact: '',
    evidence_url: '',
    process_names: [{ name: '', description: '' }], // Array for multiple process names with descriptions
    process_descriptions: [], // For backward compatibility
    // Scope 3 optional fields
    supplier_name: '',
    supplier_code: '',
    employee_name: '',
    employee_id: '',
    asset_name: '', // Asset Name for C8/C13/C14/C15
    from_location: '', // From Location for C4/C6/C7/C9
    to_location: '', // To Location for C4/C6/C7/C9
  });

  // CRITICAL: Use refs to always have fresh values in event handlers
  // This fixes stale closure issues with React state in async handlers
  const overrideCalorificValueRef = useRef(overrideCalorificValue);
  const overrideDensityRef = useRef(overrideDensity);
  const overrideEmissionFactorHeatRef = useRef(overrideEmissionFactorHeat);
  const formDataRef = useRef(formData);
  
  // Keep refs in sync with state
  useEffect(() => {
    overrideCalorificValueRef.current = overrideCalorificValue;
  }, [overrideCalorificValue]);
  
  useEffect(() => {
    overrideDensityRef.current = overrideDensity;
  }, [overrideDensity]);
  
  useEffect(() => {
    overrideEmissionFactorHeatRef.current = overrideEmissionFactorHeat;
  }, [overrideEmissionFactorHeat]);
  
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const [uploadedEvidence, setUploadedEvidence] = useState(null);
  const [existingEvidences, setExistingEvidences] = useState([]); // Track existing evidences when editing
  const [centralizedUnits, setCentralizedUnits] = useState([]);
  const [gwpConfig, setGwpConfig] = useState(null); // GWP Configuration from SuperAdmin
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [emissionToDelete, setEmissionToDelete] = useState(null);
  const [processTemplates, setProcessTemplates] = useState([]); // Process templates from SuperAdmin
  const [dynamicScopes, setDynamicScopes] = useState([]);
  const [dynamicCategories, setDynamicCategories] = useState([]);

  // Helper functions for centralized labels
  const getMethodLabel = useCallback((method, short = false) => {
    if (!method) return '-';
    const labels = short ? configLabels.calculation_methods_short : configLabels.calculation_methods;
    return labels?.[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [configLabels]);

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch Scope 3 EF data when scope changes to scope3
  useEffect(() => {
    const fetchScope3EF = async () => {
      if (formData.scope !== 'scope3') {
        setScope3EFData([]);
        setFugitiveEmissionsData([]);
        return;
      }
      
      setLoadingScope3EF(true);
      try {
        // Fetch all scope3 EF data (bypass pagination for emission entry)
        const response = await axios.get(`${API}/scope3-ef?limit=10000`, {
          headers: getAuthHeader()
        });
        // Handle both paginated response (response.data.data) and direct array response
        const efData = response.data?.data || response.data || [];
        setScope3EFData(Array.isArray(efData) ? efData : []);
        
        // Also fetch fugitive emissions from fuel_database for C8/C10/C11/C13/C14
        const fuelResponse = await axios.get(`${API}/fuel-database`, {
          headers: getAuthHeader()
        });
        const fuelData = fuelResponse.data || [];
        // Filter for fugitive emissions only
        const fugitives = fuelData.filter(f => 
          f.category === 'Fugitive Emissions' && f.gwp_fugitives
        ).map(f => ({
          id: f.id,
          activity: f.fuel_name,
          fuel_name: f.fuel_name,
          emission_factor: f.gwp_fugitives,
          unit: 'kgCO2e/kg',
          source: f.source || 'Fugitive Emissions',
          allowed_units: f.allowed_units || ['kg', 'g', 't'],
          default_unit: f.default_unit || 'kg',
          gwp_fugitives: f.gwp_fugitives
        }));
        setFugitiveEmissionsData(fugitives);
      } catch (error) {
        console.error('[Scope3 EF] Error fetching:', error);
        setScope3EFData([]);
        setFugitiveEmissionsData([]);
      } finally {
        setLoadingScope3EF(false);
      }
    };
    
    fetchScope3EF();
  }, [formData.scope, getAuthHeader]);

  // Fetch biogenic categories when biogenic tab is active and scope3 is selected
  useEffect(() => {
    const fetchBiogenicCategories = async () => {
      if (activeScope !== 'biogenic' || biogenicScopeSelection !== 'scope3') {
        return;
      }
      
      setLoadingBiogenicCategories(true);
      try {
        const response = await axios.get(`${API}/scope3-ef/categories-by-sub-scope?sub_scope=biogenic`, {
          headers: getAuthHeader()
        });
        setBiogenicCategories(response.data?.categories || []);
      } catch (error) {
        console.error('[Biogenic] Error fetching categories:', error);
        setBiogenicCategories([]);
      } finally {
        setLoadingBiogenicCategories(false);
      }
    };
    
    fetchBiogenicCategories();
  }, [activeScope, biogenicScopeSelection, getAuthHeader]);

  // Fetch biogenic scope3_ef data when biogenic tab + scope3 + category is selected
  useEffect(() => {
    const fetchBiogenicScope3EF = async () => {
      if (activeScope !== 'biogenic' || biogenicScopeSelection !== 'scope3') {
        return;
      }
      
      setLoadingScope3EF(true);
      try {
        // Fetch scope3_ef with sub_scope=biogenic filter
        const response = await axios.get(`${API}/scope3-ef?sub_scope=biogenic&limit=10000`, {
          headers: getAuthHeader()
        });
        const efData = response.data?.data || response.data || [];
        setScope3EFData(Array.isArray(efData) ? efData : []);
      } catch (error) {
        console.error('[Biogenic Scope3 EF] Error fetching:', error);
        setScope3EFData([]);
      } finally {
        setLoadingScope3EF(false);
      }
    };
    
    fetchBiogenicScope3EF();
  }, [activeScope, biogenicScopeSelection, getAuthHeader]);

  const fetchData = async () => {
    setFormulaDataReady(false); // Reset formula data ready state
    try {
      const [emissionsRes, facilitiesRes, fuelDbRes, formulasRes, paramsRes, unitsRes, configsRes, gwpRes, templatesRes, orgRes, scopesRes, catsRes, labelsRes] = await Promise.all([
        axios.get(`${API}/emissions`, { headers: getAuthHeader() }),
        axios.get(`${API}/facilities`, { headers: getAuthHeader() }),
        axios.get(`${API}/fuel-database`, { headers: getAuthHeader() }),
        axios.get(`${API}/formula-definitions`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/formula-parameters`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/calc-engine/units`, { headers: getAuthHeader() }).catch(() => ({ data: { simple: [], compound: [] } })),
        axios.get(`${API}/emission-configurations`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/gwp-config`, { headers: getAuthHeader() }).catch(() => ({ data: null })),
        axios.get(`${API}/process-templates`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/organizations/my`, { headers: getAuthHeader() }).catch(() => ({ data: null })),
        axios.get(`${API}/scopes`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/categories`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${API}/config/labels`, { headers: getAuthHeader() }).catch(() => ({ data: null }))
      ]);
      setEmissions(emissionsRes.data);
      setFacilities(facilitiesRes.data);
      setFuelDatabase(fuelDbRes.data || []);
      setFormulaDefinitions(formulasRes.data || []);
      setFormulaParameters(paramsRes.data || []);
      // Combine simple and compound units for centralizedUnits
      const allUnits = [...(unitsRes.data?.simple || []), ...(unitsRes.data?.compound || [])];
      setCentralizedUnits(allUnits);
      setEmissionConfigurations(configsRes.data || []);
      setGwpConfig(gwpRes.data || null);
      setProcessTemplates(templatesRes.data || []);
      setOrganization(orgRes.data);
      setDynamicScopes(scopesRes.data || []);
      setDynamicCategories(catsRes.data || []);
      // Set config labels if fetched
      if (labelsRes.data) {
        setConfigLabels(labelsRes.data);
      }
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
      setDynamicScopes([]);
      setDynamicCategories([]);
      setFormulaDataReady(true); // Still mark as ready even on error to prevent indefinite loading
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // FETCH FORM CONFIG when category+scope changes in edit dialog
  // This loads dynamic input field mappings from the backend
  // ============================================================================
  useEffect(() => {
    const fetchFormConfig = async () => {
      if (!dialogOpen || !formData.category || !formData.scope) {
        setEditFormConfig(null);
        return;
      }
      
      // Determine effective scope for category lookup
      // - Biogenic Scope 3: look for scope_code === 'scope3'
      // - Regular scopes: use formData.scope directly
      const isBiogenicScope3 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
      const effectiveScope = isBiogenicScope3 ? 'scope3' : formData.scope;
      
      // Find category ID
      const categoryObj = dynamicCategories.find(
        c => c.name === formData.category && c.scope_code === effectiveScope
      );
      if (!categoryObj?.id) {
        setEditFormConfig(null);
        return;
      }
      
      setEditFormConfigLoading(true);
      try {
        // Include method and activity in the request for better formula matching
        let url = `${API}/calc-engine/form-config/${categoryObj.id}?scope=${effectiveScope}`;
        if (scope3Method) url += `&method=${scope3Method}`;
        if (scope3ActivityType) url += `&activity_type=${scope3ActivityType}`;
        
        console.log('[EDIT FORM CONFIG] Fetching form config...', {
          url,
          category: formData.category,
          scope: effectiveScope,
          method: scope3Method,
          activityType: scope3ActivityType,
          activityId: scope3ActivityId
        });
        
        const response = await axios.get(url, { headers: getAuthHeader() });
        console.log('[EDIT FORM CONFIG] Received:', {
          hasFormulas: response.data?.formulas?.length || 0,
          hasInputMappings: response.data?.input_field_mappings?.length || 0,
          formulas: response.data?.formulas?.map(f => ({ id: f.id, name: f.name, inputs: f.inputs?.map(i => i.variable) })),
          inputMappings: response.data?.input_field_mappings?.map(m => ({ variable: m.maps_to_variable, label: m.field_label })),
        });
        setEditFormConfig(response.data);
      } catch (err) {
        console.error('[EDIT FORM CONFIG] Failed to fetch form config:', err);
        setEditFormConfig(null);
      } finally {
        setEditFormConfigLoading(false);
      }
    };
    
    console.log('[EDIT FORM CONFIG] useEffect triggered', {
      dialogOpen,
      category: formData.category,
      scope: formData.scope,
      scope3Method,
      scope3ActivityType,
      scope3ActivityId,
      scope3Subcategory,
    });
    
    fetchFormConfig();
  }, [dialogOpen, formData.category, formData.scope, dynamicCategories, getAuthHeader, biogenicScopeSelection, scope3Method, scope3ActivityType, scope3ActivityId]);
  
  // ============================================================================
  // DYNAMIC INPUT FIELDS - Derived from form config
  // Maps ce_input_field_mappings to renderable field objects
  // ============================================================================
  const dynamicInputFields = useMemo(() => {
    console.log('[DYNAMIC INPUT FIELDS] useMemo running...', {
      hasEditFormConfig: !!editFormConfig,
      inputMappingsCount: editFormConfig?.input_field_mappings?.length || 0,
      formulasCount: editFormConfig?.formulas?.length || 0,
      scope3Method,
      scope3ActivityType,
      scope3ActivityId,
      scope3Subcategory,
      formDataScope: formData.scope,
      selectedCategory,
    });
    
    if (!editFormConfig?.input_field_mappings?.length) {
      console.log('[DYNAMIC INPUT FIELDS] No input mappings, returning empty');
      return [];
    }
    
    // Determine if this is a scope3-like flow
    const isBiogenicScope3 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    const isBiogenicScope1 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope1';
    const isScope3Like = formData.scope === 'scope3' || isBiogenicScope3;
    
    // For Scope 3 (or biogenic scope3), find the formula that matches the selected decision path
    let requiredInputVars = null;
    let matchedFormula = null;  // Moved outside the if block for proper scoping
    if (isScope3Like && scope3Method && editFormConfig?.formulas?.length) {
      
      // Map activity_type values to formula name patterns
      const activityTypeToFormulaMap = {
        'hotel_stay': ['hotel'],
        'air_travel': ['passenger', 'distance'],
        'water_travel': ['passenger', 'distance'],
        'taxi_travel': ['passenger', 'distance'],
        'bus_travel': ['passenger', 'distance'],
        'rail_travel': ['passenger', 'distance'],
        'car_travel': ['km travelled', 'km_travelled'],
        'bike_travel': ['km travelled', 'km_travelled'],
        'wfh': ['wfh', 'work from home']
      };
      
      // Map subcategory_selection to formula name patterns (for C8/C10/C11/C13/C14)
      const subcategoryToFormulaMap = {
        'fugitive_emissions': ['fugitive'],
        'stationary_combustion': ['stationary'],
        'mobile_combustion': ['mobile'],
        'electricity': ['electricity'],
        'process_emissions': ['process']
      };
      
      // Map method to formula name patterns for matching
      const methodToFormulaMap = {
        'spend_basis': ['spend', 'Spent'],
        'spend_based': ['spend', 'Spent'],  // Handle legacy 'spend_based' value
        'activity_basis': ['activity', 'Activity'],
        'supplier_basis': ['supplier', 'Supplier']
      };
      
      // Helper to check if a formula matches the current method
      const formulaMatchesMethod = (formula) => {
        if (!formula?.name) return false;
        const formulaName = formula.name.toLowerCase();
        const searchTerms = methodToFormulaMap[scope3Method] || [];
        return searchTerms.some(term => formulaName.includes(term.toLowerCase()));
      };
      
      // PRIORITY 0: For subcategory categories (C8/C10/C11/C13/C14), match formula based on subcategory
      // This takes precedence because fugitive_emissions formula is specific
      if (scope3Method === 'activity_basis' && scope3Subcategory && subcategoryToFormulaMap[scope3Subcategory]) {
        const searchTerms = subcategoryToFormulaMap[scope3Subcategory];
        matchedFormula = editFormConfig.formulas.find(f => {
          const formulaName = f.name?.toLowerCase() || '';
          return searchTerms.some(term => formulaName.includes(term.toLowerCase()));
        });
        console.log('[DYNAMIC INPUT FIELDS] Subcategory formula match:', { scope3Subcategory, matchedFormula: matchedFormula?.name });
      }
      
      // PRIORITY 1: For activity_type (C6/C7), match formula based on activity type
      if (!matchedFormula && scope3Method === 'activity_basis' && scope3ActivityType && activityTypeToFormulaMap[scope3ActivityType]) {
        const searchTerms = activityTypeToFormulaMap[scope3ActivityType];
        matchedFormula = editFormConfig.formulas.find(f => {
          const formulaName = f.name?.toLowerCase() || '';
          return searchTerms.some(term => formulaName.includes(term.toLowerCase()));
        });
      }
      
      // PRIORITY 2: Use formula_id from emission record ONLY if method hasn't changed
      // This prevents stale formula matching when user switches methods during editing
      if (!matchedFormula && editingEmission?.formula_id) {
        const savedFormula = editFormConfig.formulas.find(f => f.id === editingEmission.formula_id);
        // Only use saved formula if it matches the CURRENT method OR subcategory
        const matchesSubcategory = scope3Subcategory && subcategoryToFormulaMap[scope3Subcategory] && 
          subcategoryToFormulaMap[scope3Subcategory].some(term => 
            savedFormula?.name?.toLowerCase().includes(term.toLowerCase())
          );
        if (savedFormula && (formulaMatchesMethod(savedFormula) || matchesSubcategory)) {
          matchedFormula = savedFormula;
        }
      }
      
      // PRIORITY 3: Fall back to method-based matching
      if (!matchedFormula) {
        const searchTerms = methodToFormulaMap[scope3Method] || [];
        matchedFormula = editFormConfig.formulas.find(f => {
          const formulaName = f.name?.toLowerCase() || '';
          return searchTerms.some(term => formulaName.includes(term.toLowerCase()));
        });
      }
      
      if (matchedFormula?.inputs?.length) {
        // Get the list of required input variables for this formula
        requiredInputVars = matchedFormula.inputs.map(inp => inp.variable);
      }
    }
    // For Biogenic Scope 1, Scope 1, or Scope 2 - match formula to filter fields correctly
    else if ((isBiogenicScope1 || formData.scope === 'scope1' || formData.scope === 'scope2') && editFormConfig?.formulas?.length) {
      // For Biogenic Scope 1, prioritize formulas with "Biogenic" in the name
      if (isBiogenicScope1) {
        // First try formula_id from emission record
        if (editingEmission?.formula_id) {
          matchedFormula = editFormConfig.formulas.find(f => f.id === editingEmission.formula_id);
        }
        // Fallback: find a formula with "Biogenic" in the name
        if (!matchedFormula) {
          matchedFormula = editFormConfig.formulas.find(f => 
            f.name?.toLowerCase().includes('biogenic')
          );
        }
        // Last fallback to first formula
        if (!matchedFormula && editFormConfig.formulas.length > 0) {
          matchedFormula = editFormConfig.formulas[0];
        }
      }
      // For regular Scope 1/2
      else {
        // First try formula_id from emission record
        if (editingEmission?.formula_id) {
          matchedFormula = editFormConfig.formulas.find(f => f.id === editingEmission.formula_id);
        }
        // Fallback: find formula by name pattern
        if (!matchedFormula) {
          matchedFormula = editFormConfig.formulas.find(f => 
            f.name?.toLowerCase().includes('quantity') || 
            f.name?.toLowerCase().includes('activity')
          ) || editFormConfig.formulas[0];
        }
      }
      
      if (matchedFormula?.inputs?.length) {
        requiredInputVars = matchedFormula.inputs.map(inp => inp.variable);
      }
    }
    
    // Filter and sort by display_order
    const mappings = [...editFormConfig.input_field_mappings]
      .filter(m => {
        if (m.is_active === false) return false;
        
        // HARDCODED FIX: Always show cv and density for Scope 1/2 Stationary/Mobile Combustion
        const currentCategoryName = (formData.category || selectedCategory || '').toLowerCase();
        const isStationaryOrMobile = currentCategoryName.includes('stationary') || currentCategoryName.includes('mobile');
        if ((formData.scope === 'scope1' || formData.scope === 'scope2') && isStationaryOrMobile && m.is_override) {
          if (m.maps_to_variable === 'cv' || m.maps_to_variable === 'density') {
            return true; // Always show cv/density for Stationary/Mobile
          }
        }
        
        // For Scope 3 with a selected method, strictly filter by formula inputs/properties
        if (isScope3Like && requiredInputVars && matchedFormula) {
          if (m.is_override) {
            // Override fields (like PPP, inflation_rate) should only show if they are 
            // explicitly listed in the matched formula's properties array
            const formulaProperties = matchedFormula.properties || [];
            const isPropertyOfFormula = formulaProperties.some(
              prop => prop.variable === m.maps_to_variable || prop.key === m.maps_to_variable
            );
            if (!isPropertyOfFormula) return false;
          } else {
            // Regular input fields must be in the formula's inputs
            const isRequiredForFormula = requiredInputVars.includes(m.maps_to_variable);
            if (!isRequiredForFormula) return false;
          }
        }
        // For Scope 1/2/Biogenic Scope 1: only filter override fields by formula properties
        // Non-override fields use scope/category filtering only
        else if ((isBiogenicScope1 || formData.scope === 'scope1' || formData.scope === 'scope2') && matchedFormula) {
          if (m.is_override) {
            // Override fields should only show if in formula properties
            const formulaProperties = matchedFormula.properties || [];
            const isPropertyOfFormula = formulaProperties.some(
              prop => prop.variable === m.maps_to_variable || prop.key === m.maps_to_variable
            );
            if (!isPropertyOfFormula) return false;
          }
          // Non-override fields: rely on scope/category filtering (no formula input check)
        }
        
        return true;
      })
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    
    return mappings.map(m => ({
      id: m.id,
      variable: m.maps_to_variable,
      fieldKey: m.field_key,
      label: m.field_label,
      expectedUnit: m.default_unit,
      required: m.is_required === true,  // Explicitly check for true
      isOverride: m.is_override === true, // Explicitly check for true (null/undefined/false all become false)
      isOverrideExplicitlyFalse: m.is_override === false, // Track if explicitly set to false (required input)
      fieldType: m.field_type || 'number',
      allowedUnits: m.allowed_units || [],
      unitSource: m.unit_source || 'static',
      placeholder: m.placeholder || `Enter ${m.field_label}`,
      helpText: m.help_text || '',
      mapsToContext: m.maps_to_context,
      mapsToContextValueWhenFilled: m.maps_to_context_value_when_filled || 'true',
      mapsToContextValueWhenEmpty: m.maps_to_context_value_when_empty || 'false',
      options: m.options || [],
    }));
  }, [editFormConfig, formData.scope, scope3Method, scope3ActivityType, scope3Subcategory, editingEmission?.formula_id, biogenicScopeSelection]);
  
  // Build decision context from dynamic field values
  const buildEditDecisionInputs = useCallback(() => {
    const decisionInputs = {};
    
    // Fields that should NOT be in decision_inputs (they are formula properties/overrides, not decision tree inputs)
    const excludeFromDecisionInputs = ['ppp', 'inflation_rate', 'cv', 'density', 'co2_gwp_fugitives'];
    
    dynamicInputFields.forEach(field => {
      if (field.mapsToContext && !excludeFromDecisionInputs.includes(field.mapsToContext)) {
        const value = dynamicFieldValues[field.variable];
        const hasValue = value !== undefined && value !== null && value !== '';
        
        // For optional non-override fields (like ef_quantity), check if checkbox is enabled
        // This ensures unchecking the checkbox sets mapsToContext to "false" even if value exists
        const isOptionalField = !field.required && !field.isOverride;
        const isCheckboxEnabled = isOptionalField 
          ? (dynamicFieldValues[`override_${field.variable}`] || false)
          : true; // Non-optional fields don't have checkboxes, always "enabled"
        
        // Field is considered "active" only if it has a value AND (for optional fields) checkbox is enabled
        const isFieldActive = hasValue && isCheckboxEnabled;
        
        decisionInputs[field.mapsToContext] = isFieldActive 
          ? field.mapsToContextValueWhenFilled 
          : field.mapsToContextValueWhenEmpty;
      }
    });
    
    // Determine if this is a scope3-like flow
    const isBiogenicScope3 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    const isScope3Like = formData.scope === 'scope3' || isBiogenicScope3;
    
    // For Scope 3 (or biogenic scope3), add calculation_method_scope3 from the selected method
    if (isScope3Like && scope3Method) {
      decisionInputs['calculation_method_scope3'] = scope3Method;
    }
    
    // For Scope 3 with activity_type (C6/C7), add activity_type to decision inputs
    if (isScope3Like && scope3ActivityType) {
      decisionInputs['activity_type'] = scope3ActivityType;
    }
    
    // For Scope 3 with subcategory (C8/C10/C11/C13/C14), add subcategory_selection to decision inputs
    if (isScope3Like && scope3Subcategory) {
      decisionInputs['subcategory_selection'] = scope3Subcategory;
    }
    
    // For biogenic scope3 with subcategory categories (C8/C10/C11/C13/C14),
    // pass 'biogenic' as subcategory_selection to satisfy the decision tree
    // (biogenic skips subcategory UI but backend decision tree still expects it)
    if (isBiogenicScope3 && !decisionInputs['subcategory_selection']) {
      const catLower = (formData.category || selectedCategory)?.toLowerCase() || '';
      const isSubcategoryCategory = ['c8', 'c10', 'c11', 'c13', 'c14'].some(c => catLower.includes(c));
      if (isSubcategoryCategory) {
        decisionInputs['subcategory_selection'] = 'biogenic';
      }
    }
    
    return decisionInputs;
  }, [dynamicInputFields, dynamicFieldValues, formData.scope, formData.category, scope3Method, scope3ActivityType, scope3Subcategory, biogenicScopeSelection, selectedCategory]);

  // Helper to update dynamic field values
  const updateDynamicFieldValue = useCallback((key, value) => {
    setDynamicFieldValues(prev => ({ ...prev, [key]: value }));
    setIsFormDirty(true); // Mark form as dirty when dynamic fields change
  }, []);

  // ============================================================================
  // FETCH AUDIT LOG AND POPULATE DYNAMIC FIELDS
  // When editing, fetch the audit log from ce_calculation_audit_logs table
  // and populate dynamic field values based on what was actually used
  // ============================================================================
  useEffect(() => {
    const populateDynamicFields = async () => {
      // Skip if not editing or no emission ID
      if (!dialogOpen || !editingEmissionId || !editingEmission) {
        return;
      }
      
      // Wait for dynamicInputFields to be loaded
      if (dynamicInputFields.length === 0) {
        return;
      }
      
      // PRIMARY: Read from emission.dynamic_field_values (new structure)
      const savedDynamicValues = editingEmission.dynamic_field_values || {};
      
      // Helper to get the correct unit for a field
      // When editing, we primarily use the saved unit from dynamic_field_values
      // The fallback is only needed for fields without saved units
      const getFieldUnit = (field, savedUnit) => {
        if (savedUnit) return savedUnit;
        // If unitSource is 'fuel', use fuel's allowed_units
        const selectedFuelForUnit = fuelDatabase.find(f => f.id === formData.fuel_id);
        if (field.unitSource === 'fuel' && selectedFuelForUnit?.allowed_units?.length > 0) {
          return selectedFuelForUnit.allowed_units[0];
        }
        // Fallback: use field's allowed units or expected unit
        const fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
        return fieldUnits[0] || field.expectedUnit || '';
      };
      
      if (Object.keys(savedDynamicValues).length > 0) {
        // New structure - populate directly from saved dynamic_field_values
        const values = {};
        
        // Map legacy/alternate field names to formula variable names
        // This handles backwards compatibility for older bulk upload records
        const legacyFieldMap = {
          // Legacy spend_basis records might have used 'spend_amount' instead of 'spent_value'
          'spend_amount': 'spent_value',
          // Legacy transport records might have used these names
          'distance_travelled': 'km_travelled',
          'quantity_of_goods': 'qty_travelled',
          'passengers': 'qty_passenger',
          'number_of_rooms': 'qty_room',
          'number_of_nights': 'qty_nights',
          'working_hours': 'working_hour_per_day',
        };
        
        dynamicInputFields.forEach(field => {
          const variable = field.variable;
          let savedField = savedDynamicValues[variable];
          
          // If field not found, check if there's a legacy field name
          if (!savedField) {
            // Check if any legacy key maps to this variable
            for (const [legacyKey, currentVar] of Object.entries(legacyFieldMap)) {
              if (currentVar === variable && savedDynamicValues[legacyKey]) {
                savedField = savedDynamicValues[legacyKey];
                break;
              }
            }
          }
          
          if (savedField) {
            values[variable] = savedField.value !== null && savedField.value !== undefined 
              ? savedField.value.toString() 
              : '';
            // Always use the saved unit if it exists - it will be added to dropdown options if needed
            values[`${variable}_unit`] = savedField.unit || getFieldUnit(field, null);
            
            // For override fields OR optional fields (not required, not override), restore checkbox state
            const isOptionalField = !field.required && !field.isOverride;
            if (field.isOverride || isOptionalField) {
              // Check is_override flag, or fallback to checking if value exists for override fields
              // This handles both new records (with is_override flag) and older records (without flag)
              const isOverrideActive = savedField.is_override === true || 
                (savedField.value !== null && savedField.value !== undefined && savedField.value !== '' && savedField.value !== 0);
              values[`override_${variable}`] = isOverrideActive;
              if (field.isOverride) {
                values[`${variable}_justification`] = savedField.justification || '';
              }
            }
          } else {
            // Field not in saved data - initialize with correct unit
            values[variable] = '';
            values[`${variable}_unit`] = getFieldUnit(field, null);
            // For override fields OR optional fields, initialize checkbox to false
            const isOptionalField = !field.required && !field.isOverride;
            if (field.isOverride || isOptionalField) {
              values[`override_${variable}`] = false;
            }
          }
        });
        
        setDynamicFieldValues(values);
        
        // Also try to fetch audit log for display purposes
        try {
          const response = await axios.get(
            `${API}/user/calc-engine/audit-log/${editingEmissionId}`,
            { headers: getAuthHeader() }
          );
          setEmissionAuditLog(response.data?.audit_log || []);
        } catch (error) {
          console.warn('Could not fetch audit log:', error);
          setEmissionAuditLog([]);
        }
        
        return;
      }
      
      // FALLBACK: Try to populate from audit log (for records created before this change)
      try {
        const response = await axios.get(
          `${API}/user/calc-engine/audit-log/${editingEmissionId}`,
          { headers: getAuthHeader() }
        );
        
        const auditLog = response.data?.audit_log || [];
        setEmissionAuditLog(auditLog);
        
        if (!response.data?.found || auditLog.length === 0) {
          // No audit log - initialize fields with correct units
          const emptyValues = {};
          dynamicInputFields.forEach(field => {
            emptyValues[field.variable] = '';
            emptyValues[`${field.variable}_unit`] = getFieldUnit(field, null);
            // For override fields OR optional fields, initialize checkbox to false
            const isOptionalField = !field.required && !field.isOverride;
            if (field.isOverride || isOptionalField) {
              emptyValues[`override_${field.variable}`] = false;
            }
          });
          setDynamicFieldValues(emptyValues);
          return;
        }
        
        // Populate from audit log - ALL fields including DB-sourced values
        const inputMap = {};
        const propertyMap = {};
        const contextMap = {};
        
        auditLog.forEach(e => {
          if (e.step === 'input') {
            inputMap[e.variable] = e;
          }
          if (e.step === 'resolve_property') {
            propertyMap[e.property] = e;
          }
        });
        
        // Also check the context from the response
        const context = response.data?.context || {};
        Object.entries(context).forEach(([key, val]) => {
          if (typeof val === 'object' && val !== null && 'value' in val) {
            contextMap[key] = val;
          }
        });
        
        const values = {};
        
        dynamicInputFields.forEach(field => {
          const variable = field.variable;
          
          const inputEntry = inputMap[variable];
          const propertyEntry = propertyMap[variable];
          const contextEntry = contextMap[variable];
          
          if (inputEntry) {
            // User input - always populate
            values[variable] = inputEntry.value?.toString() || '';
            values[`${variable}_unit`] = getFieldUnit(field, inputEntry.unit);
          } else if (propertyEntry) {
            // Property resolved during calculation
            if (propertyEntry.source === 'user_override') {
              // User overrode this property
              values[variable] = propertyEntry.value?.toString() || '';
              values[`${variable}_unit`] = getFieldUnit(field, propertyEntry.unit);
              values[`override_${variable}`] = true;
            } else if (field.isOverride) {
              // DB-sourced property for an override field - show value but don't check override
              values[variable] = propertyEntry.value?.toString() || '';
              values[`${variable}_unit`] = getFieldUnit(field, propertyEntry.unit);
              values[`override_${variable}`] = false;
            } else if (!field.required) {
              // Optional field with DB value
              values[variable] = propertyEntry.value?.toString() || '';
              values[`${variable}_unit`] = getFieldUnit(field, propertyEntry.unit);
              values[`override_${variable}`] = false;
            } else {
              // Regular required field with DB value
              values[variable] = propertyEntry.value?.toString() || '';
              values[`${variable}_unit`] = getFieldUnit(field, propertyEntry.unit);
            }
          } else if (contextEntry) {
            // Value from context (execution result)
            values[variable] = contextEntry.value?.toString() || '';
            values[`${variable}_unit`] = getFieldUnit(field, contextEntry.unit);
            // For override fields OR optional fields, initialize checkbox to false
            const isOptionalField = !field.required && !field.isOverride;
            if (field.isOverride || isOptionalField) {
              values[`override_${variable}`] = false;
            }
          } else {
            // Field not found - initialize with correct unit
            values[variable] = '';
            values[`${variable}_unit`] = getFieldUnit(field, null);
            // For override fields OR optional fields, initialize checkbox to false
            const isOptionalField = !field.required && !field.isOverride;
            if (field.isOverride || isOptionalField) {
              values[`override_${variable}`] = false;
            }
          }
        });
        
        setDynamicFieldValues(values);
        
      } catch (error) {
        console.error('Failed to fetch audit log:', error);
        setDynamicFieldValues({});
      }
    };
    
    populateDynamicFields();
  }, [dialogOpen, editingEmissionId, editingEmission, dynamicInputFields, getAuthHeader]);

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
    // Clear dynamic field values when fuel changes to reset units and values
    setDynamicFieldValues({});
    
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
        source_of_information: ''
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
        quantity_unit: defaultUnit  // Set default unit based on fuel type
      }));
      setOverrideCalorificValue(false);
      setOverrideDensity(false);
    }
  };

  // Handle category selection (step 1)
  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    // Clear dynamic field values when category changes to reset inputs
    setDynamicFieldValues({});
    // Reset fuel selection and Scope 3 fields when category changes
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
    // Reset Scope 3 specific fields
    setScope3Method('');
    setScope3ActivityId('');
    setScope3ActivityType('');
    setScope3Subcategory('');
    setScope3CustomActivity('');
    setUseCustomActivity(false);
    setActivitySearchTerm(''); // Clear activity search
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

  // Extract reporting year from reporting period for year-based filtering
  const reportingYearFromPeriod = useMemo(() => {
    // Parse year from reporting_period_start (format: "YYYY-MM" or "2025-04")
    if (formData.reporting_period_start) {
      const yearMatch = formData.reporting_period_start.match(/^(\d{4})/);
      if (yearMatch) {
        return parseInt(yearMatch[1], 10);
      }
    }
    return new Date().getFullYear();
  }, [formData.reporting_period_start]);

  // Check if editing a C7 (Employee Commuting) category
  const isEditC7EmployeeCommuting = useMemo(() => {
    if (formData.scope !== 'scope3') return false;
    const cat = formData.category?.toLowerCase() || '';
    return cat.includes('c7') || cat.includes('employee commuting');
  }, [formData.scope, formData.category]);

  // Clear employee calculations when activity changes for C7 edit
  // This forces users to recalculate with the new activity's emission factor
  useEffect(() => {
    if (isEditC7EmployeeCommuting && editEmployees.length > 0 && dialogOpen) {
      // Clear calculated emissions from all employees while preserving input data
      setEditEmployees(prevEmployees => prevEmployees.map(emp => ({
        ...emp,
        // Clear direct emissions on employee
        emissions: null,
        calculation_details: null,
        // Clear monthly calculations
        monthly_data: Object.fromEntries(
          Object.entries(emp.monthly_data || {}).map(([month, data]) => [
            month,
            {
              ...data,
              emissions: null,
              calculation_details: null,
            }
          ])
        ),
        // Clear yearly calculations
        yearly_data: emp.yearly_data ? {
          ...emp.yearly_data,
          emissions: null,
          calculation_details: null,
        } : null,
      })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope3ActivityId, scope3ActivityType]); // Reset when activity changes in edit mode

  // Active months for C7 Employee Commuting edit (based on reporting period)
  const editActiveMonths = useMemo(() => {
    // For C7 records, extract months from the employees data
    if (!editingEmission || !isEditC7EmployeeCommuting) return [];
    
    // For new monthly model, only show the single month being edited
    if (editC7Month) {
      return [editC7Month];
    }
    
    // Try to determine months from the employees data (old model with monthly_data)
    const monthsWithData = new Set();
    editEmployees.forEach(emp => {
      Object.keys(emp.monthly_data || {}).forEach(monthKey => {
        monthsWithData.add(monthKey);
      });
    });
    
    if (monthsWithData.size > 0) {
      const monthOrder = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      return Array.from(monthsWithData).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
    }
    
    // Fallback to all 12 months
    return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  }, [editingEmission, isEditC7EmployeeCommuting, editEmployees, editC7Month]);

  /**
   * Helper function to apply region + year priority fallback
   * Priority order:
   * 1. Region-specific + exact year match
   * 2. Region-specific + most recent year before reporting year
   * 3. Region-specific + null year
   * 4. Global + exact year match
   * 5. Global + most recent year before reporting year  
   * 6. Global + null year
   * 7. Any available fallback
   */
  const selectBestFuelMatch = useCallback((fuels, facilityCountry, targetYear) => {
    if (!fuels || fuels.length === 0) return null;
    
    // Separate fuels by region
    const regionSpecific = facilityCountry 
      ? fuels.filter(f => f.region && f.region.toLowerCase() === facilityCountry.toLowerCase())
      : [];
    const globalFuels = fuels.filter(f => f.region?.toLowerCase() === 'global' || !f.region);
    const otherFuels = fuels.filter(f => 
      f.region && f.region.toLowerCase() !== 'global' && 
      (!facilityCountry || f.region.toLowerCase() !== facilityCountry.toLowerCase())
    );
    
    // Helper to find best year match within a fuel group
    const findBestYearMatch = (fuelGroup) => {
      if (fuelGroup.length === 0) return null;
      
      // 1. Exact year match
      const exactYear = fuelGroup.find(f => f.year_applicable === targetYear);
      if (exactYear) return exactYear;
      
      // 2. Most recent year before target year
      const earlierYears = fuelGroup
        .filter(f => f.year_applicable && f.year_applicable < targetYear)
        .sort((a, b) => b.year_applicable - a.year_applicable);
      if (earlierYears.length > 0) return earlierYears[0];
      
      // 3. Null year (timeless data)
      const nullYear = fuelGroup.find(f => !f.year_applicable || f.year_applicable === null);
      if (nullYear) return nullYear;
      
      // 4. Any year (future years as last resort)
      const anyYear = fuelGroup.sort((a, b) => 
        (a.year_applicable || 9999) - (b.year_applicable || 9999)
      );
      return anyYear[0] || null;
    };
    
    // Apply priority: Region-specific > Global > Other
    let bestMatch = findBestYearMatch(regionSpecific);
    if (bestMatch) return bestMatch;
    
    bestMatch = findBestYearMatch(globalFuels);
    if (bestMatch) return bestMatch;
    
    bestMatch = findBestYearMatch(otherFuels);
    if (bestMatch) return bestMatch;
    
    // Absolute fallback
    return fuels[0];
  }, []);

  // Get fuels filtered by scope, industry, category, region, and year (with priority fallback)
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
    
    // Group fuels by unique identifier (name + category) to handle region/year variants
    const fuelsByKey = {};
    filtered.forEach(fuel => {
      const key = `${fuel.fuel_name}_${fuel.category}`;
      if (!fuelsByKey[key]) {
        fuelsByKey[key] = [];
      }
      fuelsByKey[key].push(fuel);
    });
    
    // For each fuel name+category, select the best match based on region and year priority
    const prioritizedFuels = [];
    Object.values(fuelsByKey).forEach(fuels => {
      const bestMatch = selectBestFuelMatch(fuels, selectedFacilityCountry, reportingYearFromPeriod);
      if (bestMatch) {
        prioritizedFuels.push(bestMatch);
      }
    });
    
    return prioritizedFuels;
  }, [fuelDatabase, formData.scope, selectedFacilitySector, selectedFacilityCountry, reportingYearFromPeriod, selectBestFuelMatch]);

  // ============================================================================
  // SCOPE 3 SPECIFIC COMPUTED PROPERTIES FOR INLINE EDIT FORM
  // ============================================================================
  
  // Get available methods for selected category from Scope 3 EF
  const availableScope3Methods = useMemo(() => {
    // Handle both regular scope3 and biogenic with scope3 selection
    const isScope3 = formData.scope === 'scope3';
    const isBiogenicScope3 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    
    // Return empty if not scope3/biogenic-scope3 or no category selected
    if ((!isScope3 && !isBiogenicScope3) || !selectedCategory) return [];
    
    const methods = new Set();
    
    // For biogenic, filter by sub_scope='biogenic' first
    let relevantData = scope3EFData;
    if (isBiogenicScope3) {
      relevantData = scope3EFData.filter(ef => ef.sub_scope === 'biogenic');
    }
    
    // Add methods from EF data
    relevantData.forEach(ef => {
      if (ef.category?.toLowerCase() === selectedCategory.toLowerCase() && ef.method) {
        methods.add(ef.method);
      }
    });
    
    // Always add supplier_basis for all Scope 3 categories (regular and biogenic)
    // supplier_basis with custom activity doesn't require pre-existing EF records
    methods.add('supplier_basis');
    
    // Return in preferred order: spend_basis, activity_basis, supplier_basis
    const orderedMethods = [];
    if (methods.has('spend_basis')) orderedMethods.push('spend_basis');
    if (methods.has('activity_basis')) orderedMethods.push('activity_basis');
    if (methods.has('supplier_basis')) orderedMethods.push('supplier_basis');
    
    // Add any other methods that might exist
    methods.forEach(m => {
      if (!orderedMethods.includes(m)) orderedMethods.push(m);
    });
    
    return orderedMethods;
  }, [formData.scope, scope3EFData, selectedCategory, biogenicScopeSelection]);

  // Get available activity types for C6/C7 categories
  const availableScope3ActivityTypes = useMemo(() => {
    if (formData.scope !== 'scope3' || !scope3EFData.length || !selectedCategory) return [];
    
    // Only show activity type filter for C6 and C7
    const isC6orC7 = selectedCategory.toLowerCase().includes('c6') || 
                     selectedCategory.toLowerCase().includes('c7') ||
                     selectedCategory.toLowerCase().includes('business travel') ||
                     selectedCategory.toLowerCase().includes('employee commuting');
    
    if (!isC6orC7) return [];
    
    const activityTypes = new Set();
    
    scope3EFData.forEach(ef => {
      if (ef.category?.toLowerCase() === selectedCategory.toLowerCase() && ef.activity_type) {
        // Also filter by method if selected
        if (!scope3Method || scope3Method === 'supplier_basis' || ef.method === scope3Method) {
          activityTypes.add(ef.activity_type);
        }
      }
    });
    
    return Array.from(activityTypes).sort();
  }, [formData.scope, scope3EFData, selectedCategory, scope3Method]);

  // Check if current category requires subcategory selection (C8, C10, C11, C13, C14)
  const subcategoryCategories = ['c8', 'c10', 'c11', 'c13', 'c14'];
  
  const requiresSubcategory = useMemo(() => {
    // Handle both regular scope3 and biogenic with scope3 selection
    const isScope3 = formData.scope === 'scope3';
    const isBiogenicScope3 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    
    if ((!isScope3 && !isBiogenicScope3) || !selectedCategory) return false;
    
    // For biogenic, subcategory is not required (biogenic fuels are categorized by sub_scope, not subcategory)
    if (isBiogenicScope3) return false;
    
    const catLower = selectedCategory.toLowerCase();
    return subcategoryCategories.some(c => catLower.includes(c));
  }, [formData.scope, selectedCategory, biogenicScopeSelection]);

  // Get available subcategories for C8/C10/C11/C13/C14
  const availableSubcategories = useMemo(() => {
    if (!requiresSubcategory || !scope3Method) return [];
    
    const subcategories = [
      { value: 'stationary_combustion', label: 'Stationary Combustion' },
      { value: 'mobile_combustion', label: 'Mobile Combustion' },
      { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
      { value: 'electricity', label: 'Electricity' }
    ];
    
    // For supplier_basis, include process_emissions
    if (scope3Method === 'supplier_basis') {
      subcategories.push({ value: 'process_emissions', label: 'Process Emissions' });
    }
    
    return subcategories;
  }, [requiresSubcategory, scope3Method]);

  // Filter Scope 3 activities based on category, method, activity_type, subcategory, industry sector
  const filteredScope3Activities = useMemo(() => {
    // Handle both regular scope3 and biogenic with scope3 selection
    const isScope3 = formData.scope === 'scope3';
    const isBiogenicScope3 = activeScope === 'biogenic' && biogenicScopeSelection === 'scope3';
    
    if (!isScope3 && !isBiogenicScope3) return [];
    if (!scope3EFData.length) return [];
    
    // For biogenic, filter by sub_scope='biogenic'
    let baseData = scope3EFData;
    if (isBiogenicScope3) {
      baseData = scope3EFData.filter(ef => ef.sub_scope === 'biogenic');
    }
    
    // Get facility for sector filtering
    const facility = facilities.find(f => f.id === formData.facility_id);
    const catLower = selectedCategory?.toLowerCase() || '';
    const isSubcategoryCategory = subcategoryCategories.some(c => catLower.includes(c));
    
    // For BIOGENIC scope3, skip subcategory handling - just filter by category directly
    // Biogenic C8/C10/C11/C13/C14 should work like C3 (direct activity selection)
    if (isBiogenicScope3 && isSubcategoryCategory) {
      // Filter biogenic activities by category
      let filtered = baseData.filter(ef => 
        ef.category?.toLowerCase() === catLower
      );
      
      // Filter by method
      if (scope3Method && scope3Method !== 'supplier_basis') {
        filtered = filtered.filter(ef => ef.method === scope3Method);
      }
      
      // Get unique activities
      const uniqueActivities = [];
      const seenActivities = new Set();
      filtered.forEach(ef => {
        if (ef.activity && !seenActivities.has(ef.activity.toLowerCase())) {
          seenActivities.add(ef.activity.toLowerCase());
          uniqueActivities.push(ef);
        }
      });
      return uniqueActivities;
    }
    
    // For REGULAR scope3 with subcategory-based categories (C8, C10, C11, C13, C14), handle specially
    if (isSubcategoryCategory && scope3Subcategory) {
      // For fugitive_emissions, return data from fugitiveEmissionsData instead
      if (scope3Subcategory === 'fugitive_emissions') {
        console.log('[FUGITIVE DEBUG - filteredScope3Activities] Returning fugitiveEmissionsData:', {
          fugitiveEmissionsDataCount: fugitiveEmissionsData.length,
          scope3Method,
          selectedCategory,
          sampleData: fugitiveEmissionsData.slice(0, 3).map(f => ({ id: f.id, activity: f.activity, fuel_name: f.fuel_name }))
        });
        return fugitiveEmissionsData.map(f => ({
          ...f,
          method: scope3Method,
          category: selectedCategory
        }));
      }
      
      // For stationary_combustion, mobile_combustion, and electricity, filter from scope3_ef
      if (scope3Subcategory === 'stationary_combustion' || 
          scope3Subcategory === 'mobile_combustion' || 
          scope3Subcategory === 'electricity') {
        let filtered = baseData.filter(ef => 
          ef.category?.toLowerCase() === catLower
        );
        
        // Filter by subcategory field if it exists on the entry
        // For electricity: ONLY show entries with exact match (no fallback to null/empty)
        // For stationary/mobile: If entry has no subcategory defined, show in both
        filtered = filtered.filter(ef => {
          if (scope3Subcategory === 'electricity') {
            // Strict matching - only show entries explicitly marked as electricity
            if (Array.isArray(ef.subcategory)) {
              return ef.subcategory.includes(scope3Subcategory);
            }
            return ef.subcategory === scope3Subcategory;
          }
          
          // For stationary/mobile: fallback to null/empty subcategory
          if (!ef.subcategory || ef.subcategory.length === 0) {
            return true;
          }
          if (Array.isArray(ef.subcategory)) {
            return ef.subcategory.includes(scope3Subcategory);
          }
          return ef.subcategory === scope3Subcategory;
        });
        
        // Filter by method
        if (scope3Method && scope3Method !== 'supplier_basis') {
          filtered = filtered.filter(ef => ef.method === scope3Method);
        }
        
        // Get unique activities
        const uniqueActivities = [];
        const seenActivities = new Set();
        filtered.forEach(ef => {
          if (ef.activity && !seenActivities.has(ef.activity.toLowerCase())) {
            seenActivities.add(ef.activity.toLowerCase());
            uniqueActivities.push(ef);
          }
        });
        return uniqueActivities;
      }
      
      // For process_emissions, return empty for now
      if (scope3Subcategory === 'process_emissions') {
        return [];
      }
    }
    
    // Standard filtering for non-subcategory categories
    let filtered = [...baseData];
    
    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(ef => 
        ef.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }
    
    // Filter by method - for supplier_basis, show ALL activities for the category
    // For spend_basis/activity_basis, filter by specific method
    if (scope3Method && scope3Method !== 'supplier_basis') {
      filtered = filtered.filter(ef => ef.method === scope3Method);
    }
    
    // Filter by activity_type (for C6/C7)
    if (scope3ActivityType) {
      filtered = filtered.filter(ef => ef.activity_type === scope3ActivityType);
    }
    
    // Filter by industry sector (if facility has one)
    if (facility?.sector) {
      filtered = filtered.filter(ef => {
        if (ef.industry_sectors && ef.industry_sectors.length > 0) {
          return ef.industry_sectors.some(s => 
            s.toLowerCase() === facility.sector.toLowerCase()
          );
        }
        return true;
      });
    }
    
    // Get unique activities (avoid duplicates)
    const uniqueActivities = [];
    const seenActivities = new Set();
    filtered.forEach(ef => {
      if (ef.activity && !seenActivities.has(ef.activity.toLowerCase())) {
        seenActivities.add(ef.activity.toLowerCase());
        uniqueActivities.push(ef);
      }
    });
    
    return uniqueActivities;
  }, [formData.scope, formData.facility_id, scope3EFData, selectedCategory, scope3Method, scope3ActivityType, scope3Subcategory, fugitiveEmissionsData, facilities, activeScope, biogenicScopeSelection]);

  // Get unique categories for the scope
  const getCategoriesForScope = useMemo(() => {
    // For biogenic with scope3 selected, return only biogenic categories
    if (activeScope === 'biogenic' && biogenicScopeSelection === 'scope3') {
      return biogenicCategories.sort((a, b) => {
        const numA = parseInt(a.match(/C(\d+)/)?.[1] || '999');
        const numB = parseInt(b.match(/C(\d+)/)?.[1] || '999');
        return numA - numB;
      });
    }
    
    // For Scope 3, get categories from dynamicCategories that belong to Scope 3
    if (formData.scope === 'scope3') {
      const scope3 = dynamicScopes.find(s => s.code === 'scope3');
      if (scope3) {
        const scope3Cats = dynamicCategories
          .filter(c => c.scope_id === scope3.id)
          .map(c => c.name);
        // Sort by category number (C1, C2, ... C15)
        return scope3Cats.sort((a, b) => {
          const numA = parseInt(a.match(/C(\d+)/)?.[1] || '999');
          const numB = parseInt(b.match(/C(\d+)/)?.[1] || '999');
          return numA - numB;
        });
      }
      // Fallback: get unique categories from Scope 3 EF data
      const cats = new Set();
      scope3EFData.forEach(ef => {
        if (ef.category) cats.add(ef.category);
      });
      // Sort by category number (C1, C2, ... C15)
      return Array.from(cats).sort((a, b) => {
        const numA = parseInt(a.match(/C(\d+)/)?.[1] || '999');
        const numB = parseInt(b.match(/C(\d+)/)?.[1] || '999');
        return numA - numB;
      });
    }
    
    // For other scopes, use fuel database categories
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
  }, [formData.scope, getFuelsForScope, dynamicScopes, dynamicCategories, scope3EFData, activeScope, biogenicScopeSelection, biogenicCategories]);

  // Get fuels for selected category
  const getFuelsForCategory = useMemo(() => {
    if (!selectedCategory) return [];
    let fuels = getFuelsForScope.filter(f => {
      const fuelCategories = f.categories?.length > 0 ? f.categories : (f.category ? [f.category] : []);
      return fuelCategories.includes(selectedCategory);
    });
    
    // IMPORTANT: When editing, ensure the saved fuel is always included in the list
    // The fuel prioritization logic may select a different variant (region/year), 
    // but we need to show the originally saved fuel so it appears selected
    if (formData.fuel_id && !fuels.some(f => f.id === formData.fuel_id)) {
      const savedFuel = fuelDatabase.find(f => f.id === formData.fuel_id);
      if (savedFuel) {
        fuels = [savedFuel, ...fuels];
      }
    }
    
    return fuels;
  }, [getFuelsForScope, selectedCategory, formData.fuel_id, fuelDatabase]);

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
        const isEmissionFactorCO2Param = sourceField === 'emission_factor_co2' || paramKey === 'emission_factor_co2' || 
                                          paramKey.includes('emission_factor_co2') || paramKey.includes('ef_co2') ||
                                          paramKey === 'co2_emission_factor' || paramKey === 'ef';
        
        // Check for Custom CO2 Emission Factor (Heat Basis) override FIRST
        if (isEmissionFactorCO2Param && overrideEmissionFactorHeat && formData.emission_factor_heat) {
          return parseFloat(formData.emission_factor_heat) || 0;
        }
        
        if (isCalorificParam && overrideCalorificValue) {
          return parseFloat(formData.calorific_value) || 0;
        }
        if (isDensityParam && overrideDensity) {
          return parseFloat(formData.density) || 1;
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
    if (paramKey.includes('emission_factor_co2') || paramKey === 'co2_emission_factor' || paramKey === 'ef_co2' || paramKey === 'ef') {
      // Use overridden EF Heat Basis if enabled, otherwise use standard emission_factor_co2
      if (overrideEmissionFactorHeat && formData.emission_factor_heat) {
        return parseFloat(formData.emission_factor_heat) || 0;
      }
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
  }, [formData, selectedFuel, formulaParameters, getConversionFactor, overrideCalorificValue, overrideDensity, overrideEmissionFactorHeat]);

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
        // Format value to 6 decimal places max to avoid floating point display issues
        const displayValue = Number.isInteger(value) ? value : parseFloat(value.toFixed(6));
        steps.push(`${comp.parameter_name}${conversionNote}${conditionNote} = ${displayValue}`);
      } else {
        // Apply operation
        const conditionNote = condition !== 'always' ? ` [${condition}]` : '';
        // Format value and result to 6 decimal places max
        const displayValue = Number.isInteger(value) ? value : parseFloat(value.toFixed(6));
        switch (comp.operation) {
          case 'multiply':
            result = result * value;
            const displayResultMul = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`× ${comp.parameter_name}${conditionNote} (${displayValue}) = ${displayResultMul}`);
            break;
          case 'divide':
            result = value !== 0 ? result / value : result;
            const displayResultDiv = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`÷ ${comp.parameter_name}${conditionNote} (${displayValue}) = ${displayResultDiv}`);
            break;
          case 'add':
            result = result + value;
            const displayResultAdd = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`+ ${comp.parameter_name}${conditionNote} (${displayValue}) = ${displayResultAdd}`);
            break;
          case 'subtract':
            result = result - value;
            const displayResultSub = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`- ${comp.parameter_name}${conditionNote} (${displayValue}) = ${displayResultSub}`);
            break;
          default:
            result = result * value;
            const displayResultDef = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
            steps.push(`× ${comp.parameter_name}${conditionNote} (${displayValue}) = ${displayResultDef}`);
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

  // Legacy calculation removed - using backend calc engine exclusively
  const calculatedEmissions = null;

  // ============================================================================
  // Backend Calculation Engine Integration (Phase 3) - NOW ACTIVE
  // Decision trees are configured for all categories, using backend as primary
  // ============================================================================
  
  // Track calculation state when backend calc engine is used
  const calcTriggerRef = useRef(null);
  const [backendCalcResult, setBackendCalcResult] = useState(null);
  const [useBackendCalc, setUseBackendCalc] = useState(true);
  
  // Effect to trigger backend calculations when inputs change
  // Uses dynamic input fields from calculation engine configuration
  useEffect(() => {
    // Skip if dialog not open
    if (!dialogOpen) {
      setBackendCalcResult(null);
      return;
    }
    
    // Determine if this is a scope3-like flow (regular scope3 or biogenic scope3)
    const isBiogenicScope3Edit = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    const isScope3LikeEdit = formData.scope === 'scope3' || isBiogenicScope3Edit;
    
    // For Scope 3 (or biogenic scope3), we need method and activity selected instead of fuel
    // For supplier_basis with custom activity, we need the custom activity name
    // For other scopes, we need fuel selected
    if (isScope3LikeEdit) {
      if (!scope3Method) {
        setBackendCalcResult(null);
        return;
      }
      // For supplier_basis with custom activity, check custom activity name
      // For supplier_basis without custom activity or other methods, check activity ID
      if (scope3Method === 'supplier_basis' && useCustomActivity) {
        if (!scope3CustomActivity?.trim()) {
          setBackendCalcResult(null);
          return;
        }
      } else if (!scope3ActivityId) {
        setBackendCalcResult(null);
        return;
      }
    } else {
      if (!selectedFuel) {
        setBackendCalcResult(null);
        return;
      }
    }
    
    // Check if we have dynamic input fields - if so, use them for calculation
    if (dynamicInputFields.length > 0) {
      // Ensure dynamicFieldValues is populated (not just initialized)
      const hasAnyValues = Object.keys(dynamicFieldValues).some(key => {
        const val = dynamicFieldValues[key];
        return val !== undefined && val !== null && val !== '';
      });
      
      if (!hasAnyValues) {
        // Values not yet initialized, wait for them
        return;
      }
      
      // Build inputs from dynamicFieldValues
      const inputs = {};
      let hasValidInput = false;
      
      dynamicInputFields.forEach(field => {
        const value = dynamicFieldValues[field.variable];
        if (value === undefined || value === null || value === '') return;
        
        const numValue = parseFloat(value);
        if (!Number.isFinite(numValue)) return;
        
        // For optional non-override fields, check if the checkbox is enabled before including
        // This ensures unchecked optional fields (like ef_quantity) are not used in calculations
        const isOptionalField = !field.required && !field.isOverride;
        if (isOptionalField) {
          const overrideKey = `override_${field.variable}`;
          const isEnabled = dynamicFieldValues[overrideKey] || false;
          if (!isEnabled) return; // Skip this field if checkbox is not enabled
        }
        
        // Determine if this is a scope3-like flow
        const isBiogenicScope3 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
        const isScope3Like = formData.scope === 'scope3' || isBiogenicScope3;
        
        // Get unit based on unit_source
        let unit;
        if (field.unitSource === 'fuel') {
          // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
          if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
            const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            unit = dynamicFieldValues[`${field.variable}_unit`] || matchedActivity?.allowed_units?.[0] || field.expectedUnit;
          } else {
            unit = dynamicFieldValues[`${field.variable}_unit`] || selectedFuel?.allowed_units?.[0] || field.expectedUnit;
          }
        } else {
          unit = dynamicFieldValues[`${field.variable}_unit`] || field.expectedUnit || '';
        }
        
        // Track if we have any non-override field with a positive value
        // This replaces the hardcoded qty/activity_value check
        if (!field.isOverride && numValue > 0) {
          hasValidInput = true;
        }
        
        inputs[field.variable] = { value: numValue, unit: unit };
      });
      
      // Determine if this is a scope3-like flow for calculation checks
      const isBiogenicScope3Calc = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
      const isScope3LikeCalc = formData.scope === 'scope3' || isBiogenicScope3Calc;
      
      // For Scope 3 (or biogenic scope3), require method and activity selection (or custom activity for supplier_basis)
      // For other scopes, require at least one valid input
      const canCalculate = isScope3LikeCalc 
        ? (scope3Method && (
            (scope3Method === 'supplier_basis' && useCustomActivity && scope3CustomActivity?.trim() && hasValidInput) ||
            (scope3Method === 'supplier_basis' && !useCustomActivity && scope3ActivityId && hasValidInput) ||
            (scope3Method !== 'supplier_basis' && scope3ActivityId && hasValidInput)
          ))
        : hasValidInput;
      
      if (!canCalculate) {
        // Don't reset to null here - keep previous result visible
        return;
      }
      
      // Build user overrides from override fields
      const userOverrides = {};
      dynamicInputFields.filter(f => f.isOverride).forEach(field => {
        const overrideKey = `override_${field.variable}`;
        if (dynamicFieldValues[overrideKey]) {
          const value = dynamicFieldValues[field.variable];
          if (value !== undefined && value !== null && value !== '') {
            const unit = dynamicFieldValues[`${field.variable}_unit`] || field.expectedUnit || '';
            userOverrides[field.variable] = { value: parseFloat(value), unit: unit };
          }
        }
      });
      
      // Build decision inputs from maps_to_context
      const decisionInputs = buildEditDecisionInputs();
      
      // Clear previous timeout
      if (calcTriggerRef.current) {
        clearTimeout(calcTriggerRef.current);
      }
      
      // Debounce backend calls
      calcTriggerRef.current = setTimeout(async () => {
        try {
          // Determine effective scope for category lookup
          const isBiogenicScope3 = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
          const effectiveScope = isBiogenicScope3 ? 'scope3' : formData.scope;
          const isScope3Like = formData.scope === 'scope3' || isBiogenicScope3;
          
          // Find category ID
          const categoryObj = dynamicCategories.find(
            c => c.name === (formData.category || selectedCategory) && c.scope_code === effectiveScope
          );
          
          if (!categoryObj?.id) {
            setBackendCalcResult(null);
            return;
          }
          
          // Build scope3 context with default_unit for auto-conversion
          const matchedEFForPreview = filteredScope3Activities.find(a => a.id === scope3ActivityId);
          
          // DEBUG: Log fugitive emissions context building
          console.log('[FUGITIVE DEBUG - Live Calc] Context Building:', {
            isScope3Like,
            requiresSubcategory,
            scope3Method,
            scope3Subcategory,
            scope3ActivityId,
            filteredScope3ActivitiesCount: filteredScope3Activities.length,
            filteredScope3ActivitiesFirst3: filteredScope3Activities.slice(0, 3).map(a => ({ id: a.id, activity: a.activity, fuel_name: a.fuel_name })),
            matchedEFForPreview: matchedEFForPreview ? { id: matchedEFForPreview.id, activity: matchedEFForPreview.activity, fuel_name: matchedEFForPreview.fuel_name } : null,
            selectedFuel: selectedFuel ? { id: selectedFuel.id, fuel_name: selectedFuel.fuel_name } : null,
          });
          
          const scope3ContextPreview = isScope3Like ? {
            calculation_method_scope3: scope3Method,
            scope3_ef_id: scope3ActivityId,
            // For supplier_basis with custom activity, use the custom activity name
            activity: (scope3Method === 'supplier_basis' && useCustomActivity) 
              ? scope3CustomActivity 
              : matchedEFForPreview?.activity,
            scope3_ef_default_unit: matchedEFForPreview?.default_unit || '',
          } : {};
          
          // For Scope 3 subcategory categories (C8, C10, C11, C13, C14) with fugitive emissions,
          // use the activity name as fuel_name since the activity IS the fuel (e.g., "HFC-32")
          // Skip this for supplier_basis as it uses a basic formula without fuel_database lookup
          let fuelNameForContext = selectedFuel?.fuel_name;
          
          // DEBUG: Log the condition check
          console.log('[FUGITIVE DEBUG - Live Calc] Fuel Name Condition Check:', {
            condition1_isScope3Like: isScope3Like,
            condition2_requiresSubcategory: requiresSubcategory,
            condition3_notSupplierBasis: scope3Method !== 'supplier_basis',
            condition4_isFugitiveEmissions: scope3Subcategory === 'fugitive_emissions',
            condition5_hasMatchedActivity: !!matchedEFForPreview?.activity,
            allConditionsMet: isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForPreview?.activity,
            fuelNameBefore: fuelNameForContext,
          });
          
          if (isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForPreview?.activity) {
            fuelNameForContext = matchedEFForPreview.activity;
          }
          
          console.log('[FUGITIVE DEBUG - Live Calc] Final fuelNameForContext:', fuelNameForContext);
          
          // Call backend calc engine with dynamic inputs
          const payload = {
            category_id: categoryObj.id,
            decision_inputs: decisionInputs,
            inputs: inputs,
            context: {
              fuel_name: fuelNameForContext,
              fuel_id: selectedFuel?.id,
              scope: effectiveScope, // Use effective scope for context
              category: formData.category || selectedCategory,
              reporting_period: formData.reporting_period_start, // For currency conversion year lookup
              // Scope 3 specific context
              ...scope3ContextPreview,
            },
            user_overrides: userOverrides,
            dry_run: true,
            // Pass scope3_ef_id at top level for backend to lookup fuel_database (fugitive emissions)
            ...(isScope3Like && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
          };
          
          console.log('[FUGITIVE DEBUG - Live Calc] Full Payload:', JSON.stringify(payload, null, 2));
          
          const response = await axios.post(
            `${API}/calc-engine/execute-by-category`,
            payload,
            { headers: getAuthHeader() }
          );
          
          console.log('[YEARLY CALC DEBUG] Backend response:', {
            ok: response.data?.ok,
            hasOutputs: !!response.data?.outputs,
            outputs: response.data?.outputs,
            error: response.data?.error,
            fullResponse: response.data
          });
          
          if (response.data?.ok) {
            // Transform response to match expected format
            const outputs = response.data.outputs || {};
            const result = {
              co2Emissions: outputs.co2?.value || response.data.co2_emissions || 0,
              ch4Emissions: outputs.ch4?.value || response.data.ch4_emissions || 0,
              n2oEmissions: outputs.n2o?.value || response.data.n2o_emissions || 0,
              co2eEmissions: outputs.co2e?.value || response.data.co2e_emissions || 0,
              appliedFormulaName: response.data.resolved_formula?.name || 'Dynamic Calc Engine',
              formulaId: response.data.resolved_formula?.id || response.data.formula_id || null, // Capture formula_id from calc-engine
              auditLog: response.data.audit_log || [],  // New format with labels
              calculationSteps: response.data.audit?.execution_log || {},  // Legacy support
              fromBackend: true
            };
            setBackendCalcResult(result);
            setCalcEngineUsed(true);
          } else {
            setBackendCalcResult(null);
            setCalcEngineUsed(false);
          }
        } catch (error) {
          console.error('[CalcEngine] Backend calculation error:', error);
          setBackendCalcResult(null);
          setCalcEngineUsed(false);
        }
      }, 400);
      
      return () => {
        if (calcTriggerRef.current) {
          clearTimeout(calcTriggerRef.current);
        }
      };
    }
    
    // FALLBACK: Legacy behavior when no dynamic fields loaded
    const quantity = parseFloat(formData.quantity);
    if (!quantity || quantity <= 0) {
      setBackendCalcResult(null);
      return;
    }
    
    // Clear previous timeout
    if (calcTriggerRef.current) {
      clearTimeout(calcTriggerRef.current);
    }
    
    // Debounce backend calls
    calcTriggerRef.current = setTimeout(async () => {
      try {
        // Build overrides object - pass custom values when override is enabled
        const overrides = {
          override_calorific_value: overrideCalorificValue,
          calorific_value: overrideCalorificValue ? formData.calorific_value : null,
          override_density: overrideDensity,
          density: overrideDensity ? formData.density : null,
          override_emission_factor_heat: overrideEmissionFactorHeat,
          emission_factor_heat: overrideEmissionFactorHeat ? formData.emission_factor_heat : null
        };
        
        // Call the backend calc engine
        const result = await executeBackendCalc({
          scope: formData.scope,
          category: formData.category || selectedCategory,
          fuel: selectedFuel,
          quantity: quantity,
          unit: formData.quantity_unit || 'kg',
          overrides: overrides,
          gwpConfig: gwpConfig,
          dryRun: true
        });
        
        if (result) {
          setBackendCalcResult(result);
          setCalcEngineUsed(true);
        } else {
          setBackendCalcResult(null);
          setCalcEngineUsed(false);
        }
      } catch (error) {
        console.error('[CalcEngine] Backend calculation error:', error);
        setBackendCalcResult(null);
        setCalcEngineUsed(false);
      }
    }, 400);
    
    return () => {
      if (calcTriggerRef.current) {
        clearTimeout(calcTriggerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dialogOpen, selectedFuel?.id, formData.quantity, formData.quantity_unit,
    formData.scope, formData.category, selectedCategory, formData.calorific_value,
    formData.density, formData.emission_factor_heat, overrideCalorificValue,
    overrideDensity, overrideEmissionFactorHeat, dynamicInputFields, dynamicFieldValues,
    dynamicCategories, buildEditDecisionInputs, getAuthHeader,
    scope3Method, scope3ActivityId, filteredScope3Activities,
    useCustomActivity, scope3CustomActivity, scope3Subcategory, biogenicScopeSelection
  ]);
  
  // Use backend calculation engine result exclusively
  const effectiveCalculatedEmissions = useMemo(() => {
    // Use backend result if available
    if (backendCalcResult && useBackendCalc) {
      return {
        ...backendCalcResult,
        auditLog: backendCalcResult.auditLog || emissionAuditLog
      };
    }
    
    // If editing and we have a saved audit log but no backend calc result yet,
    // show partial result with the audit log
    if (editingEmission && emissionAuditLog.length > 0) {
      return {
        auditLog: emissionAuditLog
      };
    }
    
    return null;
  }, [backendCalcResult, useBackendCalc, emissionAuditLog, editingEmission]);

  // Track calculation state - set isCalculating true when inputs change, false after a short delay
  // This ensures the Save button is disabled while calculations are updating
  useEffect(() => {
    // Only track when edit dialog is open
    if (!editingEmission) return;
    
    setIsCalculating(true);
    const timer = setTimeout(() => {
      setIsCalculating(false);
    }, 300); // 300ms debounce to allow useMemo to complete
    
    return () => clearTimeout(timer);
  }, [formData.quantity, formData.calorific_value, formData.density, formData.emission_factor_heat,
      formData.calorific_value, overrideCalorificValue, overrideDensity, overrideEmissionFactorHeat,
      editingEmission]);

  const handleFileUpload = async (file) => {
    const sizeErr = validateFileSize(file);
    if (sizeErr) {
      throw new Error(sizeErr);
    }
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const response = await axios.post(`${API}/upload/evidence?bucket_type=emission_evidence`, formDataUpload, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Don't set uploadedEvidence for multi-file uploads - it blocks the upload zone
      // Instead, we track files in existingEvidences which are displayed separately
      
      // Append new evidence URL to existing ones (don't replace)
      setFormData(prev => {
        const existingUrls = prev.evidence_url ? prev.evidence_url.split(',').filter(u => u.trim()) : [];
        const newUrls = [...existingUrls, response.data.url];
        return {
          ...prev,
          evidence_url: newUrls.join(',')
        };
      });
      
      // Add to existingEvidences for immediate display - use original filename from server response
      setExistingEvidences(prev => [...prev, {
        url: response.data.url,
        filename: response.data.filename || file.name,  // Use original filename
        file_id: response.data.file_id
      }]);
      
      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(getUploadErrorMessage(error, file));
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
    
    // C7 EMPLOYEE COMMUTING - Always uses multi-employee mode
    if (isEditC7EmployeeCommuting) {
      // Validate that at least one employee exists
      if (editEmployees.length === 0) {
        toast.error('Please add at least one employee');
        return;
      }
      
      // Check if this is yearly or monthly mode
      const isYearlyMode = editingEmission?.frequency_type === 'yearly';
      
      // Validate employee data (name required, at least one month/year with data)
      const employeeErrors = [];
      editEmployees.forEach((emp, index) => {
        // Check employee name is required
        if (!emp.name || emp.name.trim() === '') {
          employeeErrors.push(`Employee ${index + 1}: Employee Name is required.`);
        }
        
        if (isYearlyMode) {
          // For yearly mode: check yearly_data OR direct inputs
          const hasYearlyData = Object.values(emp.yearly_data?.inputs || {}).some(v => 
            v !== '' && v !== null && v !== undefined && v !== 0
          );
          const hasDirectInputs = emp.inputs && Object.values(emp.inputs).some(v =>
            v !== '' && v !== null && v !== undefined && v !== 0
          );
          
          if (!hasYearlyData && !hasDirectInputs) {
            employeeErrors.push(`${emp.name || `Employee ${index + 1}`}: Please enter annual data or remove the employee.`);
          }
        } else {
          // For monthly mode: check at least one month has data
          const hasAnyMonthData = Object.values(emp.monthly_data || {}).some(monthData => {
            if (!monthData?.inputs) return false;
            return Object.values(monthData.inputs).some(v => 
              v !== '' && v !== null && v !== undefined && v !== 0
            );
          });
          
          if (!hasAnyMonthData) {
            employeeErrors.push(`${emp.name || `Employee ${index + 1}`}: Please enter data for at least one month or remove the employee.`);
          }
        }
      });
      
      if (employeeErrors.length > 0) {
        // Show first error as toast, log all
        toast.error(employeeErrors[0]);
        console.warn('Employee validation errors:', employeeErrors);
        return;
      }
      
      // Validate that at least one employee has calculated emissions
      const hasCalculatedData = editEmployees.some(emp => {
        if (isYearlyMode) {
          // Check yearly_data emissions OR direct emissions
          const hasYearlyEmissions = emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined;
          const hasDirectEmissions = emp.emissions?.co2e !== null && emp.emissions?.co2e !== undefined;
          return hasYearlyEmissions || hasDirectEmissions;
        } else {
          // Check monthly_data emissions
          return Object.values(emp.monthly_data || {}).some(m => m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined);
        }
      });
      
      if (!hasCalculatedData) {
        toast.error('Please calculate emissions for at least one employee');
        return;
      }
      
      // Calculate total emissions
      const totalCo2e = editEmployees.reduce((sum, emp) => {
        if (isYearlyMode) {
          // Sum from yearly_data or direct emissions
          return sum + (emp.yearly_data?.emissions?.co2e || emp.emissions?.co2e || 0);
        } else {
          // Sum from monthly_data
          return sum + Object.values(emp.monthly_data || {}).reduce((empSum, m) => {
            return empSum + (m?.emissions?.co2e || 0);
          }, 0);
        }
      }, 0);
      
      // Extract formula_id from the first employee's calculated data
      // (all employees use the same formula for the same activity type)
      let extractedFormulaId = editingEmission?.formula_id || null;
      if (isYearlyMode) {
        // Check yearly_data or direct calculation_details
        for (const emp of editEmployees) {
          const formulaId = emp.yearly_data?.calculation_details?.formula_id || emp.calculation_details?.formula_id;
          if (formulaId) {
            extractedFormulaId = formulaId;
            break;
          }
        }
      } else {
        for (const emp of editEmployees) {
          for (const monthKey of Object.keys(emp.monthly_data || {})) {
            const monthData = emp.monthly_data[monthKey];
            if (monthData?.calculation_details?.formula_id) {
              extractedFormulaId = monthData.calculation_details.formula_id;
              break;
            }
          }
          if (extractedFormulaId && extractedFormulaId !== editingEmission?.formula_id) break;
        }
      }
      
      // Look up the activity label from scope3_ef_id
      const matchedActivityForSave = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      const activityLabel = matchedActivityForSave?.activity || matchedActivityForSave?.fuel_name || scope3ActivityType;
      
      // Construct reporting_period from formData fields
      const c7ReportingPeriod = formData.reporting_period_start && formData.reporting_period_end
        ? (formData.reporting_period_start === formData.reporting_period_end
            ? formData.reporting_period_start
            : `${formData.reporting_period_start} to ${formData.reporting_period_end}`)
        : editingEmission?.reporting_period || `${new Date().getFullYear()}-01 to ${new Date().getFullYear()}-12`;
      
      // Validate process names for C7
      const validProcessNames = formData.process_names.filter(p => p.name && p.name.trim() !== '');
      if (validProcessNames.length === 0) {
        toast.error('At least one Name of Process is required');
        return;
      }
      
      const payload = {
        facility_id: formData.facility_id,
        reporting_period: c7ReportingPeriod,
        frequency_type: editingEmission?.frequency_type || 'monthly', // Preserve frequency_type on edit
        scope: 'scope3',
        category: formData.category,
        sub_category: formData.sub_category || '',
        calculation_method_scope3: scope3Method,
        activity_type: scope3ActivityType, // Send activity_type for backend to update
        scope3_activity_type: scope3ActivityType, // Also send scope3_activity_type
        scope3_activity: activityLabel, // Save the display label, not internal key
        scope3_ef_id: scope3ActivityId || filteredScope3Activities[0]?.id || null,
        formula_id: extractedFormulaId,
        
        // Multi-employee specific data - structure depends on yearly vs monthly
        employees: editEmployees.map(emp => {
          const baseEmployee = {
            id: emp.id,
            name: emp.name,
            employee_id: emp.employee_id,
            department: emp.department,
            activity_type: scope3ActivityType || emp.activity_type,
          };
          
          if (isYearlyMode) {
            // For yearly mode: use flat inputs/emissions at employee level
            return {
              ...baseEmployee,
              inputs: emp.yearly_data?.inputs || emp.inputs || {},
              emissions: emp.yearly_data?.emissions || emp.emissions || {},
              calculation_details: emp.yearly_data?.calculation_details || emp.calculation_details,
            };
          } else {
            // For monthly mode: use monthly_data structure
            return {
              ...baseEmployee,
              monthly_data: emp.monthly_data,
            };
          }
        }),
        monthly_totals: isYearlyMode ? null : editEmployeeMonthlyTotals,
        yearly_total: editEmployeeYearlyTotal,
        
        // Aggregated outputs
        outputs: {
          co2e: { value: totalCo2e, unit: 'tCO2e' },
        },
        
        // Metadata
        process_names: validProcessNames.map(p => p.name),
        process_descriptions: validProcessNames.map(p => ({ name: p.name, description: p.description || '' })),
        notes: formData.notes || '',
        source_of_information: `Multi-employee commuting data for ${editEmployees.length} employee(s)`,
        justification: null,
        responsible_person: formData.responsible_person,
        responsible_person_designation: formData.responsible_person_designation || '',
        responsible_person_contact: formData.responsible_person_contact || '',
      };
      
      try {
        setIsSaving(true);
        const response = await axios.put(`${API}/emissions/${editingEmission.id}`, payload, {
          headers: getAuthHeader()
        });
        
        if (response.data) {
          toast.success(`Updated ${editEmployees.length} employee commuting records (${totalCo2e.toFixed(4)} tCO2e total)`);
          setDialogOpen(false);
          resetForm();
          fetchData(); // Refresh the emissions list
        }
      } catch (error) {
        toast.error('Failed to update emissions. Please try again.');
      } finally {
        setIsSaving(false);
      }
      return;
    }
    
    // FIRST: Read actual values from DOM before any validation
    const cvCheckbox = document.querySelector('[data-testid="override-calorific-checkbox"]');
    const densityCheckbox = document.querySelector('[data-testid="override-density-checkbox"]');
    const cvInput = document.querySelector('[data-testid="calorific-value-input"]');
    const densityInput = document.querySelector('[data-testid="density-input"]');
    
    const isOverrideCV = cvCheckbox?.checked || false;
    const isOverrideDensity = densityCheckbox?.checked || false;
    const cvValue = cvInput?.value || '';
    const densityValue = densityInput?.value || '';
    
    // Validate override justifications - USE DOM VALUES, not state
    if (isOverrideCV && !formData.calorific_value_justification?.trim()) {
      toast.error('Justification is required when overriding Calorific Value');
      return;
    }
    if (isOverrideDensity && !formData.density_justification?.trim()) {
      toast.error('Justification is required when overriding Density');
      return;
    }
    
    // #17: Validate main override justification for Scope 1/2 when ANY override is enabled
    const hasAnyOverride = isOverrideCV || isOverrideDensity || overrideEmissionFactorHeat;
    if (hasAnyOverride && (formData.scope === 'scope1' || formData.scope === 'scope2')) {
      if (!overrideJustification?.trim() || overrideJustification.trim().length < 20) {
        toast.error('Override justification must be at least 20 characters when overriding default values');
        return;
      }
    }

    // Validate required fields - only check fields where is_override is explicitly false (required inputs)
    // Fields with is_override=true or is_override=null/undefined are optional (can come from DB)
    if (dynamicInputFields.length > 0) {
      for (const field of dynamicInputFields) {
        // Only validate fields where isOverride is explicitly false (required user inputs)
        // Skip fields that are: override fields (isOverride=true), or optional fields (isOverride=null/undefined)
        if (!field.isOverrideExplicitlyFalse) {
          continue;
        }
        
        // Check numeric fields
        if (field.fieldType === 'number' || !field.fieldType) {
          const value = dynamicFieldValues[field.variable];
          const numValue = parseFloat(value);
          
          if (!value || isNaN(numValue) || numValue <= 0) {
            toast.error(`${field.label || field.variable} must be greater than 0`);
            return;
          }
        }
      }
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

    // Validate fuel/activity selection based on scope
    // For biogenic scope3, treat it like scope3 (uses activities instead of fuels)
    const isBiogenicScope3Save = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
    const isScope3LikeSave = formData.scope === 'scope3' || isBiogenicScope3Save;
    
    if (isScope3LikeSave) {
      if (!scope3Method) {
        toast.error('Please select a calculation method');
        return;
      }
      // For supplier_basis with custom activity, check custom activity instead of activityId
      if (scope3Method === 'supplier_basis' && useCustomActivity) {
        if (!scope3CustomActivity?.trim()) {
          toast.error('Please enter a custom activity name');
          return;
        }
      } else {
        if (!scope3ActivityId) {
          toast.error('Please select an activity type');
          return;
        }
      }
      
      // For supplier_basis, validate that units are provided for input fields
      if (scope3Method === 'supplier_basis') {
        const supplierFields = dynamicInputFields.filter(f => 
          f.variable?.includes('supplier') || f.variable?.includes('Supplier')
        );
        for (const field of supplierFields) {
          const value = dynamicFieldValues[field.variable];
          const unit = dynamicFieldValues[`${field.variable}_unit`];
          // If value is provided but unit is empty, show error
          if (value !== undefined && value !== '' && (!unit || unit.trim() === '')) {
            toast.error(`Please enter a unit for ${field.label}`);
            return;
          }
        }
      }
    } else {
      if (!formData.fuel_id) {
        toast.error('Please select a fuel from the database');
        return;
      }
    }

    // Calculate total emissions using backend calc engine
    const calc = effectiveCalculatedEmissions;
    if (!calc) {
      toast.error('Unable to calculate emissions. Please check all values.');
      return;
    }
    
    // Validate override values are valid when enabled
    if (overrideCalorificValue && calc) {
      const overrideCV = parseFloat(formData.calorific_value);
      if (!overrideCV || overrideCV <= 0) {
        toast.error('Please enter a valid Calorific Value when override is enabled');
        return;
      }
    }
    if (overrideDensity && calc) {
      const overrideD = parseFloat(formData.density);
      if (!overrideD || overrideD <= 0) {
        toast.error('Please enter a valid Density when override is enabled');
        return;
      }
    }
    if (overrideEmissionFactorHeat && calc) {
      const overrideEFH = parseFloat(formData.emission_factor_heat);
      if (!overrideEFH || overrideEFH <= 0) {
        toast.error('Please enter a valid Custom CO₂ Emission Factor (Heat Basis) when override is enabled');
        return;
      }
    }
    
    // Validate dynamic override and optional fields - if checkbox is checked, value must be entered
    const overrideAndOptionalFields = dynamicInputFields.filter(f => f.isOverride || (!f.required && !f.isOverride));
    for (const field of overrideAndOptionalFields) {
      const isCheckboxChecked = dynamicFieldValues[`override_${field.variable}`];
      const value = dynamicFieldValues[field.variable];
      const hasValue = value !== '' && value !== null && value !== undefined && parseFloat(value) > 0;
      
      if (isCheckboxChecked && !hasValue) {
        const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
        toast.error(`Please enter a value for "${fieldLabel}" or uncheck the Override Default checkbox`);
        return;
      }
    }
    
    try {
      // Combine start and end periods
      const reportingPeriod = formData.reporting_period_start === formData.reporting_period_end
        ? formData.reporting_period_start
        : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;

      // ============================================================================
      // BUILD DYNAMIC FIELD VALUES - All inputs keyed by variable name
      // ============================================================================
      const dynamicValues = {};
      
      // Helper to get the correct unit for a field (same logic as dropdown display)
      const getFieldUnitForSave = (field) => {
        const storedUnit = dynamicFieldValues[`${field.variable}_unit`];
        if (storedUnit) return storedUnit;
        // Get fieldUnits the same way the dropdown does
        let fieldUnits = [];
        if (field.unitSource === 'fuel') {
          // For Scope 3 (or biogenic scope3) activities, fallback to filteredScope3Activities
          if (isScope3LikeSave && !selectedFuel && scope3ActivityId) {
            const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            fieldUnits = matchedActivity?.allowed_units || [];
          } else {
            fieldUnits = selectedFuel?.allowed_units || [];
          }
        } else if (field.unitSource === 'all_units') {
          // For all_units, use all centralized units (simple + compound)
          fieldUnits = centralizedUnits.map(u => u.symbol);
        } else if (field.unitSource === 'scope3_ef') {
          // For scope3_ef: Priority 1: scope3_ef.allowed_units, Priority 2: field mapping, Priority 3: formula expected_unit
          const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
          if (matchedEF?.allowed_units?.length > 0) {
            fieldUnits = matchedEF.allowed_units;
          } else if (field.allowedUnits?.length > 0) {
            fieldUnits = field.allowedUnits;
          } else if (field.expectedUnit) {
            fieldUnits = [field.expectedUnit];
          } else {
            fieldUnits = [];
          }
        } else {
          // static - use allowed_units from mapping
          fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
        }
        return fieldUnits[0] || field.expectedUnit || '';
      };
      
      if (dynamicInputFields.length > 0) {
        dynamicInputFields.forEach(field => {
          const variable = field.variable;
          const value = dynamicFieldValues[variable];
          const unit = getFieldUnitForSave(field);
          
          if (field.isOverride) {
            // Override field - include is_override flag and justification
            const isOverridden = dynamicFieldValues[`override_${variable}`] || false;
            dynamicValues[variable] = {
              value: isOverridden && value !== undefined && value !== '' ? parseFloat(value) : null,
              unit: unit,
              is_override: isOverridden,
              justification: dynamicFieldValues[`${variable}_justification`] || ''
            };
          } else if (!field.required) {
            // For optional fields (not required, not override), check if checkbox is enabled
            const isOptionalOverridden = dynamicFieldValues[`override_${variable}`] || false;
            const parsedValue = value !== undefined && value !== '' ? parseFloat(value) : null;
            dynamicValues[variable] = {
              value: isOptionalOverridden ? parsedValue : null,
              unit: unit,
              ...(isOptionalOverridden && parsedValue !== null && { is_override: true })
            };
          } else {
            // Required field - always save value
            const parsedValue = value !== undefined && value !== '' ? parseFloat(value) : null;
            dynamicValues[variable] = {
              value: parsedValue,
              unit: unit
            };
          }
        });
      }
      
      // Build outputs from calculation results
      const outputs = {};
      if (effectiveCalculatedEmissions) {
        outputs.co2 = { value: effectiveCalculatedEmissions.co2Emissions || 0, unit: 'tCO2' };
        outputs.ch4 = { value: effectiveCalculatedEmissions.ch4Emissions || 0, unit: 'tCH4' };
        outputs.n2o = { value: effectiveCalculatedEmissions.n2oEmissions || 0, unit: 'tN2O' };
        outputs.co2e = { value: effectiveCalculatedEmissions.co2eEmissions || 0, unit: 'tCO2e' };
      }

      // Prepare payload with new dynamic structure
      const payload = {
        facility_id: formData.facility_id,
        reporting_period: reportingPeriod,
        frequency_type: editingEmission?.frequency_type || 'monthly', // Preserve frequency_type on edit
        scope: formData.scope,
        category: formData.category,
        sub_category: formData.sub_category,
        fuel_type: formData.fuel_type,
        fuel_database_id: isScope3LikeSave ? null : formData.fuel_id,
        
        // Store formula_id: prefer recalculated value from calc-engine, fallback to existing
        formula_id: effectiveCalculatedEmissions?.formulaId || editingEmission?.formula_id || null,
        
        // Biogenic-specific fields
        ...(formData.scope === 'biogenic' && {
          biogenic_scope_selection: biogenicScopeSelection,
        }),
        
        // Scope 3 specific fields (also applies to biogenic scope3)
        ...(isScope3LikeSave && {
          // For supplier_basis: use scope3ActivityId if available, null otherwise
          // For other methods: always use scope3ActivityId
          scope3_ef_id: scope3Method === 'supplier_basis' 
            ? (useCustomActivity ? null : (scope3ActivityId || null))
            : scope3ActivityId,
          calculation_method_scope3: scope3Method,
          scope3_activity: scope3Method === 'supplier_basis'
            ? (useCustomActivity 
                ? scope3CustomActivity 
                : (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || scope3CustomActivity || ''))
            : (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || ''),
        }),
        
        // Dynamic field values - all inputs keyed by variable name
        dynamic_field_values: {
          ...dynamicValues,
          // Include Scope 3 method and activity in dynamic values for persistence (as proper dict structure)
          ...(isScope3LikeSave && {
            calculation_method_scope3: { value: scope3Method, unit: '' },
            scope3_ef_id: { 
              value: scope3Method === 'supplier_basis' 
                ? (useCustomActivity ? '' : (scope3ActivityId || ''))
                : (scope3ActivityId || ''), 
              unit: '' 
            },
            scope3_activity: { 
              value: scope3Method === 'supplier_basis'
                ? (useCustomActivity 
                    ? scope3CustomActivity 
                    : (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || scope3CustomActivity || ''))
                : (filteredScope3Activities.find(a => a.id === scope3ActivityId)?.activity || ''), 
              unit: '' 
            },
            scope3_activity_type: { value: scope3ActivityType || '', unit: '' },
            scope3_subcategory: { value: scope3Subcategory || '', unit: '' },
          }),
          // Store biogenic selection in dynamic_field_values
          ...(formData.scope === 'biogenic' && {
            biogenic_scope_selection: { value: biogenicScopeSelection, unit: '' },
          }),
        },
        
        // Calculated outputs
        outputs: outputs,
        
        // Metadata
        source_of_information: formData.source_of_information,
        notes: formData.notes,
        justification: formData.justification,
        evidence_url: formData.evidence_url,
        responsible_person: formData.responsible_person,
        responsible_person_designation: formData.responsible_person_designation,
        responsible_person_contact: formData.responsible_person_contact,
        
        // Process names
        process_names: formData.process_names.filter(p => p.name && p.name.trim() !== '').map(p => p.name),
        process_descriptions: formData.process_names.filter(p => p.name && p.name.trim() !== '').map(p => ({
          name: p.name,
          description: p.description || ''
        })),
        
        // #17: Override justification (Scope 1/2 only when any override is enabled)
        ...((formData.scope === 'scope1' || formData.scope === 'scope2') && (isOverrideCV || isOverrideDensity || overrideEmissionFactorHeat) && {
          override_justification: overrideJustification,
        }),
        
        // Scope 3 optional supplier/employee fields (also for biogenic scope3)
        ...(isScope3LikeSave && {
          supplier_name: formData.supplier_name || null,
          supplier_code: formData.supplier_code || null,
          ...(formData.category === 'Employee Commuting' ? {
            employee_name: formData.employee_name || null,
            employee_id: formData.employee_id || null,
          } : {}),
          // Asset Name for C8/C13/C14/C15
          ...(['c8', 'c13', 'c14', 'c15'].some(c => formData.category?.toLowerCase()?.includes(c)) ? {
            asset_name: formData.asset_name || null,
          } : {}),
          // From/To Location for C4/C6/C7/C9 (transportation/travel/commuting)
          ...(['c4', 'c6', 'c7', 'c9'].some(c => formData.category?.toLowerCase()?.includes(c)) ? {
            from_location: formData.from_location || null,
            to_location: formData.to_location || null,
          } : {}),
        }),
      };
      
      // Debug: Log asset_name in save payload
      // Debug: Log what we're saving
      let emissionId = editingEmission?.id;
      
      if (editingEmission) {
        // Check if there are any actual changes before updating
        const hasChanges = (() => {
          const oldDfv = editingEmission.dynamic_field_values || {};
          const oldOutputs = editingEmission.outputs || {};
          
          // Compare dynamic field values
          for (const key of Object.keys(dynamicValues)) {
            const newVal = dynamicValues[key];
            const oldVal = oldDfv[key];
            
            if (!oldVal) {
              if (newVal?.value !== null && newVal?.value !== undefined) return true;
              continue;
            }
            
            if (newVal?.value !== oldVal?.value) return true;
            if (newVal?.unit !== oldVal?.unit) return true;
            if (newVal?.is_override !== oldVal?.is_override) return true;
          }
          
          // Compare outputs
          for (const key of Object.keys(outputs)) {
            const newVal = outputs[key];
            const oldVal = oldOutputs[key];
            
            if (!oldVal) {
              if (newVal?.value !== null && newVal?.value !== undefined && newVal?.value !== 0) return true;
              continue;
            }
            
            // Allow small floating point differences
            if (Math.abs((newVal?.value || 0) - (oldVal?.value || 0)) > 0.0001) return true;
          }
          
          // Compare metadata fields
          if (formData.source_of_information !== (editingEmission.source_of_information || '')) return true;
          if (formData.notes !== (editingEmission.notes || '')) return true;
          if (formData.justification !== (editingEmission.justification || '')) return true;
          if (formData.evidence_url !== (editingEmission.evidence_url || '')) return true;
          if (formData.responsible_person !== (editingEmission.responsible_person || '')) return true;
          if (formData.responsible_person_designation !== (editingEmission.responsible_person_designation || '')) return true;
          if (formData.responsible_person_contact !== (editingEmission.responsible_person_contact || '')) return true;
          
          // Compare supplier fields
          if (formData.supplier_name !== (editingEmission.supplier_name || '')) return true;
          if (formData.supplier_code !== (editingEmission.supplier_code || '')) return true;
          
          // Compare asset name (for C8/C13/C14/C15)
          if (formData.asset_name !== (editingEmission.asset_name || '')) return true;
          
          // Compare location fields (for C4/C6/C7/C9)
          if (formData.from_location !== (editingEmission.from_location || '')) return true;
          if (formData.to_location !== (editingEmission.to_location || '')) return true;
          
          // Compare reporting period
          const newReportingPeriod = formData.reporting_period_start === formData.reporting_period_end
            ? formData.reporting_period_start
            : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;
          if (newReportingPeriod !== (editingEmission.reporting_period || '')) return true;
          
          // Compare process names
          const oldProcessNames = editingEmission.process_names || [];
          const newProcessNames = payload.process_names || [];
          if (JSON.stringify(oldProcessNames) !== JSON.stringify(newProcessNames)) return true;
          
          // Compare scope3 activity (custom activity changes)
          const oldScope3Activity = editingEmission.scope3_activity || '';
          const newScope3Activity = payload.scope3_activity || '';
          if (oldScope3Activity !== newScope3Activity) return true;
          
          // Compare scope3_ef_id (activity selection changes)
          const oldScope3EfId = editingEmission.scope3_ef_id || '';
          const newScope3EfId = payload.scope3_ef_id || '';
          if (oldScope3EfId !== newScope3EfId) return true;
          
          // Compare calculation method
          const oldMethod = editingEmission.calculation_method_scope3 || '';
          const newMethod = payload.calculation_method_scope3 || '';
          if (oldMethod !== newMethod) return true;
          
          return false;
        })();
        
        if (!hasChanges) {
          toast.info('No changes detected');
          setIsFormDirty(false); // Reset dirty flag since there are no actual changes
          return;
        }
        
        // DEBUG: Log the save payload for fugitive emissions
        console.log('[FUGITIVE DEBUG - handleSubmit] Saving emission:', {
          isEdit: !!editingEmission,
          emission_id: editingEmission?.id,
          scope3Method,
          scope3Subcategory,
          scope3ActivityId,
          payloadCategory: payload.category,
          payloadScope3EfId: payload.scope3_ef_id,
          payloadDynamicFieldValues: payload.dynamic_field_values,
          payloadOutputs: payload.outputs,
        });
        
        await axios.put(`${API}/emissions/${editingEmission.id}`, payload, {
          headers: getAuthHeader()
        });
        toast.success('Emission record updated successfully');
      } else {
        const createResponse = await axios.post(`${API}/emissions`, payload, {
          headers: getAuthHeader()
        });
        emissionId = createResponse.data?.id;
        toast.success('Emission record created successfully');
      }
      
      // After saving, also persist the calculation audit log
      // This ensures override sources are saved for re-edit
      if (emissionId && dynamicInputFields.length > 0) {
        try {
          const categoryObj = dynamicCategories.find(
            c => c.name === (formData.category || selectedCategory) && c.scope_code === formData.scope
          );
          
          if (categoryObj?.id) {
            // Build inputs from dynamic fields
            const inputs = {};
            dynamicInputFields.filter(f => !f.isOverride).forEach(field => {
              const value = dynamicFieldValues[field.variable];
              if (value !== undefined && value !== '' && value !== null) {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                  const unit = dynamicFieldValues[`${field.variable}_unit`] || field.expectedUnit || '';
                  inputs[field.variable] = { value: numValue, unit: unit };
                }
              }
            });
            
            // Build user overrides from override fields
            const userOverrides = {};
            dynamicInputFields.filter(f => f.isOverride).forEach(field => {
              const overrideKey = `override_${field.variable}`;
              if (dynamicFieldValues[overrideKey]) {
                const value = dynamicFieldValues[field.variable];
                if (value !== undefined && value !== null && value !== '') {
                  const unit = dynamicFieldValues[`${field.variable}_unit`] || field.expectedUnit || '';
                  userOverrides[field.variable] = { value: parseFloat(value), unit: unit };
                }
              }
            });
            
            // Build decision inputs
            const decisionInputs = buildEditDecisionInputs();
            
            // Build the scope3 context with default_unit for auto-conversion
            const matchedEFForSave = filteredScope3Activities.find(a => a.id === scope3ActivityId);
            const scope3Context = formData.scope === 'scope3' ? {
              calculation_method_scope3: scope3Method,
              scope3_ef_id: scope3ActivityId,
              // For supplier_basis with custom activity, use the custom activity name
              activity: (scope3Method === 'supplier_basis' && useCustomActivity) 
                ? scope3CustomActivity 
                : matchedEFForSave?.activity,
              scope3_ef_default_unit: matchedEFForSave?.default_unit || '',
            } : {};
            
            // For Scope 3 subcategory categories (C8, C10, C11, C13, C14) with fugitive emissions,
            // use the activity name as fuel_name since the activity IS the fuel (e.g., "HFC-32")
            // Skip this for supplier_basis as it uses a basic formula without fuel_database lookup
            let fuelNameForContext = selectedFuel?.fuel_name;
            if (formData.scope === 'scope3' && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForSave?.activity) {
              fuelNameForContext = matchedEFForSave.activity;
            }
            
            // DEBUG: Log the calc engine call for audit persistence
            const calcPayload = {
              category_id: categoryObj.id,
              decision_inputs: decisionInputs,
              inputs: inputs,
              context: {
                fuel_name: fuelNameForContext,
                fuel_id: selectedFuel?.id,
                scope: formData.scope,
                category: formData.category || selectedCategory,
                reporting_period: formData.reporting_period_start, // For currency conversion year lookup
                // Scope 3 specific context
                ...scope3Context,
              },
              user_overrides: userOverrides,
              dry_run: false,
              emission_record_id: emissionId,
              // Pass scope3_ef_id at top level for backend to lookup fuel_database (fugitive emissions)
              ...(formData.scope === 'scope3' && scope3ActivityId && { scope3_ef_id: scope3ActivityId }),
            };
            
            console.log('[FUGITIVE DEBUG - Audit Save] Calc Engine Payload:', JSON.stringify(calcPayload, null, 2));
            
            // Call calc engine with dry_run: false to persist audit log
            await axios.post(
              `${API}/calc-engine/execute-by-category`,
              calcPayload,
              { headers: getAuthHeader() }
            );
          }
        } catch (auditError) {
          console.warn('Failed to persist audit log:', auditError);
          // Don't fail the whole save if audit log fails
        }
      }
      
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleEdit = async (emission) => {
    // CRITICAL: Clear stale employee state IMMEDIATELY before any hydration
    // This prevents previous edit session data from bleeding through
    setEditEmployees([]);
    setEditEmployeeMonthlyTotals({});
    setEditEmployeeYearlyTotal({});
    
    // Parse reporting_period - could be "February 2025" or "2025-02" or "February 2025 to March 2025"
    const parseReportingPeriod = (periodStr) => {
      if (!periodStr) return '';
      
      // If already in YYYY-MM format
      if (/^\d{4}-\d{2}$/.test(periodStr)) {
        return periodStr;
      }
      
      // Try to parse "Month Year" format (e.g., "February 2025")
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const match = periodStr.match(/^(\w+)\s+(\d{4})$/);
      if (match) {
        const monthIndex = monthNames.indexOf(match[1]);
        if (monthIndex >= 0) {
          return `${match[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
        }
      }
      
      return periodStr; // Return as-is if can't parse
    };
    
    const [startPeriodRaw, endPeriodRaw] = emission.reporting_period?.includes(' to ')
      ? emission.reporting_period.split(' to ')
      : [emission.reporting_period, emission.reporting_period];
    
    const startPeriod = parseReportingPeriod(startPeriodRaw);
    const endPeriod = parseReportingPeriod(endPeriodRaw);

    setEditingEmission(emission);
    
    // Set frequency type from the emission (locked once saved, defaults to 'monthly' for legacy records)
    const freqType = emission.frequency_type || 'monthly';
    setEditFrequencyType(freqType);
    
    // Check if this emission was created with a fuel from database
    // First try by ID, then by fuel_type name (for yearly records that may not have fuel_database_id)
    let fuelFromDb = emission.fuel_database_id 
      ? fuelDatabase.find(f => f.id === emission.fuel_database_id)
      : null;
    
    // If no fuel found by ID but we have fuel_type, try to find by name
    if (!fuelFromDb && emission.fuel_type) {
      fuelFromDb = fuelDatabase.find(f => f.fuel_name === emission.fuel_type);
    }
    
    // Set the category state for UI display
    setSelectedCategory(emission.category || '');
    
    // Handle biogenic emissions - restore biogenicScopeSelection
    if (emission.scope === 'biogenic') {
      const dynamicValues = emission.dynamic_field_values || {};
      const biogenicSelection = emission.biogenic_scope_selection || 
        (typeof dynamicValues.biogenic_scope_selection === 'object' 
          ? dynamicValues.biogenic_scope_selection.value 
          : dynamicValues.biogenic_scope_selection) || '';
      setBiogenicScopeSelection(biogenicSelection);
      
      // If biogenic scope3, also load scope3 fields
      if (biogenicSelection === 'scope3') {
        const method = emission.calculation_method_scope3 || dynamicValues.calculation_method_scope3 || '';
        
        let activityId = emission.scope3_ef_id || dynamicValues.scope3_ef_id || '';
        if (typeof activityId === 'object' && activityId.value) {
          activityId = activityId.value;
        }
        
        let activityType = emission.scope3_activity_type || '';
        if (!activityType && dynamicValues.scope3_activity_type) {
          activityType = typeof dynamicValues.scope3_activity_type === 'object' 
            ? dynamicValues.scope3_activity_type.value 
            : dynamicValues.scope3_activity_type;
        }
        
        let customActivity = '';
        let isCustomActivity = false;
        if (method === 'supplier_basis') {
          const scope3Activity = dynamicValues.scope3_activity;
          customActivity = typeof scope3Activity === 'object'
            ? scope3Activity.value
            : (emission.scope3_activity || scope3Activity || '');
          
          const topLevelEfId = emission.scope3_ef_id;
          const dynamicEfId = dynamicValues.scope3_ef_id;
          const dynamicEfIdValue = typeof dynamicEfId === 'object' ? dynamicEfId.value : dynamicEfId;
          
          if (dynamicEfIdValue && dynamicEfIdValue !== '') {
            activityId = dynamicEfIdValue;
            isCustomActivity = false;
          } else if (topLevelEfId && topLevelEfId !== '') {
            activityId = topLevelEfId;
            isCustomActivity = false;
          } else if (customActivity && customActivity.trim() !== '') {
            isCustomActivity = true;
            activityId = '';
          }
        }
        
        setScope3Method(method);
        setScope3ActivityType(activityType);
        setScope3Subcategory(''); // Biogenic doesn't use subcategory
        setScope3ActivityId(activityId);
        setScope3CustomActivity(customActivity);
        setUseCustomActivity(isCustomActivity);
      }
    }
    // Set Scope 3 specific fields if applicable
    else if (emission.scope === 'scope3') {
      // Extract method and activity from top-level fields or dynamic_field_values
      const dynamicValues = emission.dynamic_field_values || {};
      const method = emission.calculation_method_scope3 || dynamicValues.calculation_method_scope3 || '';
      
      // Handle activityId which may be stored as string or object {value, unit}
      let activityId = emission.scope3_ef_id || dynamicValues.scope3_ef_id || '';
      if (typeof activityId === 'object' && activityId.value) {
        activityId = activityId.value;
      }
      
      // Get activity type from stored field first, then fall back to lookup
      let activityType = emission.scope3_activity_type || emission.activity_type || '';
      if (!activityType && dynamicValues.scope3_activity_type) {
        activityType = typeof dynamicValues.scope3_activity_type === 'object' 
          ? dynamicValues.scope3_activity_type.value 
          : dynamicValues.scope3_activity_type;
      }
      
      // For C7 records, check employees array for activity_type if not found at top level
      const isC7 = emission.category?.toLowerCase().includes('c7') || emission.category?.toLowerCase().includes('employee commuting');
      if (!activityType && isC7 && emission.employees?.length > 0) {
        activityType = emission.employees[0].activity_type || '';
      }
      
      // If still no activity type, try to look it up from scope3EFData (for legacy records)
      if (!activityType && activityId && scope3EFData.length > 0) {
        const matchedEF = scope3EFData.find(ef => ef.id === activityId);
        activityType = matchedEF?.activity_type || '';
      }
      
      // Normalize activity type to match dropdown values (e.g., 'Work From Home' -> 'wfh', 'Water Travel' -> 'water_travel')
      // The dropdown uses lowercase underscore format from scope3_ef.activity_type
      if (activityType && isC7) {
        // Check if it's already in the correct format (lowercase with underscores)
        const normalizedType = activityType.toLowerCase().replace(/\s+/g, '_');
        // Map display names back to internal values
        const displayToInternalMap = {
          'work_from_home': 'wfh',
          'car_travel': 'car_travel',
          'bus_travel': 'bus_travel', 
          'rail_travel': 'rail_travel',
          'air_travel': 'air_travel',
          'taxi_travel': 'taxi_travel',
          'bike_travel': 'bike_travel',
          'water_travel': 'water_travel',
          'hotel_stay': 'hotel_stay',
        };
        activityType = displayToInternalMap[normalizedType] || normalizedType;
      }
      
      // Get subcategory from stored field (for C8/C10/C11/C13/C14)
      let subcategory = '';
      if (dynamicValues.scope3_subcategory) {
        subcategory = typeof dynamicValues.scope3_subcategory === 'object'
          ? dynamicValues.scope3_subcategory.value
          : dynamicValues.scope3_subcategory;
      }
      
      // DEBUG: Log extracted scope3 values from emission record
      console.log('[FUGITIVE DEBUG - handleEdit] Extracted Scope3 values:', {
        emission_id: emission.id,
        emission_category: emission.category,
        method,
        activityId,
        activityType,
        subcategory,
        dynamicValues_scope3_subcategory: dynamicValues.scope3_subcategory,
        dynamicValues_scope3_ef_id: dynamicValues.scope3_ef_id,
        emission_scope3_ef_id: emission.scope3_ef_id,
        fugitiveEmissionsDataCount: fugitiveEmissionsData.length,
      });
      
      // Get custom activity for supplier_basis
      let customActivity = '';
      let isCustomActivity = false;
      if (method === 'supplier_basis') {
        // For supplier_basis, the activity name is stored in scope3_activity
        const scope3Activity = dynamicValues.scope3_activity;
        customActivity = typeof scope3Activity === 'object'
          ? scope3Activity.value
          : (emission.scope3_activity || scope3Activity || '');
        
        // Determine if this is a custom activity entry
        // Check BOTH top-level scope3_ef_id AND dynamic_field_values.scope3_ef_id
        // It's a custom activity ONLY if BOTH are null/empty
        const topLevelEfId = emission.scope3_ef_id;
        const dynamicEfId = dynamicValues.scope3_ef_id;
        const dynamicEfIdValue = typeof dynamicEfId === 'object' ? dynamicEfId.value : dynamicEfId;
        
        // Use dynamic value as source of truth for activityId (it's more reliably stored)
        if (dynamicEfIdValue && dynamicEfIdValue !== '') {
          activityId = dynamicEfIdValue;
          isCustomActivity = false;
        } else if (topLevelEfId && topLevelEfId !== '') {
          activityId = topLevelEfId;
          isCustomActivity = false;
        } else if (customActivity && customActivity.trim() !== '') {
          // No activity ID anywhere but has a custom activity name
          isCustomActivity = true;
          activityId = '';
        }
      }
      
      // If subcategory is fugitive_emissions and activityId exists, check if it's from fugitiveEmissionsData
      // This handles the case where the activity came from fuel_database
      if (subcategory === 'fugitive_emissions' && activityId && fugitiveEmissionsData.length > 0) {
        const matchedFugitive = fugitiveEmissionsData.find(f => f.id === activityId);
        // Fugitive emission validation happens silently
      }
      
      setScope3Method(method);
      setScope3ActivityType(activityType);
      setScope3Subcategory(subcategory);
      setScope3ActivityId(activityId);
      setScope3CustomActivity(customActivity);
      setUseCustomActivity(isCustomActivity);
      
      // Check if this is a C7 record - always load employee data (reuse isC7 from above)
      if (isC7) {
        // Check if this is a new monthly model record (has reporting_period like "2026-01")
        const isMonthlyModel = emission.reporting_period && /^\d{4}-\d{2}$/.test(emission.reporting_period);
        
        if (isMonthlyModel) {
          // Extract month from reporting_period (e.g., "2026-01" -> "jan")
          const monthNum = parseInt(emission.reporting_period.split('-')[1], 10);
          const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
          const monthKey = monthKeys[monthNum - 1];
          
          // Transform employees to have monthly_data structure for MultiEmployeeInput compatibility
          // Check if employee already has monthly_data (new save format) vs flat structure (old format)
          const transformedEmployees = (emission.employees || []).map(emp => {
            // ALWAYS ensure monthly_data[monthKey].emissions is populated
            // The DB might have emissions at root level (emp.emissions) or inside monthly_data
            const existingMonthData = emp.monthly_data?.[monthKey] || {};
            const monthEmissions = existingMonthData.emissions || emp.emissions || {};
            const monthInputs = existingMonthData.inputs || emp.inputs || {};
            const monthCalcDetails = existingMonthData.calculation_details || emp.calculation_details || null;
            
            return {
              ...emp,
              monthly_data: {
                ...emp.monthly_data,
                [monthKey]: {
                  inputs: monthInputs,
                  emissions: monthEmissions,
                  calculation_details: monthCalcDetails,
                }
              }
            };
          });
          setEditEmployees(transformedEmployees);
          
          // Store the editing month for reference
          setEditC7Month(monthKey);
        } else if (freqType === 'yearly') {
          // YEARLY MODE: Transform employees to have yearly_data structure
          const transformedEmployees = (emission.employees || []).map(emp => {
            // ALWAYS ensure yearly_data.emissions is populated
            // The DB might have emissions at root level (emp.emissions) or inside yearly_data
            const existingYearlyData = emp.yearly_data || {};
            const yearlyEmissions = existingYearlyData.emissions || emp.emissions || {};
            const yearlyInputs = existingYearlyData.inputs || emp.inputs || {};
            const yearlyCalcDetails = existingYearlyData.calculation_details || emp.calculation_details || null;
            
            return {
              ...emp,
              yearly_data: {
                inputs: yearlyInputs,
                emissions: yearlyEmissions,
                calculation_details: yearlyCalcDetails,
              }
            };
          });
          setEditEmployees(transformedEmployees);
          setEditC7Month(null);
        } else {
          // Old model - employees already have monthly_data structure
          setEditEmployees(emission.employees || []);
          setEditC7Month(null);
        }
        setEditEmployeeMonthlyTotals(emission.monthly_totals || {});
        setEditEmployeeYearlyTotal(emission.yearly_total || {});
      } else {
        // Not a monthly model - reset to yearly totals
        setEditEmployees([]);
        setEditEmployeeMonthlyTotals({});
        setEditEmployeeYearlyTotal({});
        setEditC7Month(null);
      }
    } else {
      // Non-C7 category - only reset C7-specific employee data, NOT scope3 fields
      // The scope3 fields (method, subcategory, activityId, etc.) were already set above
      // and should be preserved for C8, C10, C11, C13, C14 categories
      setEditEmployees([]);
      setEditEmployeeMonthlyTotals({});
      setEditEmployeeYearlyTotal({});
      setEditC7Month(null);
    }
    
    // Reset legacy override flags (not used with new dynamic structure)
    setOverrideCalorificValue(false);
    setOverrideDensity(false);
    setOverrideEmissionFactorHeat(false);
    // Load override justification if exists (#17)
    setOverrideJustification(emission.override_justification || '');
    
    setFormData({
      facility_id: emission.facility_id,
      reporting_period_start: startPeriod,
      reporting_period_end: endPeriod,
      scope: emission.scope,
      category: emission.category === 'Custom' ? '' : (emission.category || ''),
      sub_category: emission.sub_category || '',
      fuel_id: emission.fuel_database_id || fuelFromDb?.id || '',
      fuel_type: emission.fuel_type || '',
      quantity: '', // Will be populated from dynamic_field_values
      quantity_unit: '',
      emission_factor_co2: '',
      emission_factor_ch4: '',
      emission_factor_n2o: '',
      emission_factor_basis_quantity: fuelFromDb?.emission_factor_basis_quantity?.toString() || '',
      emission_factor_basis_unit: fuelFromDb?.emission_factor_basis_unit || 'tCO2/MWh',
      calorific_value: '',
      calorific_value_unit: fuelFromDb?.calorific_value_unit || '',
      calorific_value_justification: '',
      density: '',
      density_unit: fuelFromDb?.density_unit || '',
      density_justification: '',
      emission_factor_heat: '',
      emission_factor_heat_justification: '',
      conversion_factor: '1',
      source_of_information: emission.source_of_information || '',
      justification: emission.justification || '',
      notes: emission.notes || '',
      responsible_person: emission.responsible_person || '',
      responsible_person_designation: emission.responsible_person_designation || '',
      responsible_person_contact: emission.responsible_person_contact || '',
      evidence_url: emission.evidence_url || '',
      // Scope 3 optional fields
      supplier_name: emission.supplier_name || '',
      supplier_code: emission.supplier_code || '',
      employee_name: emission.employee_name || '',
      employee_id: emission.employee_id || '',
      asset_name: emission.asset_name || '', // Asset Name for C8/C13/C14/C15
      from_location: emission.from_location || '', // From Location for C4/C6/C7/C9
      to_location: emission.to_location || '', // To Location for C4/C6/C7/C9
      // Load process names with descriptions
      process_names: (() => {
        if (emission.process_descriptions?.length > 0) {
          return emission.process_descriptions.map(pd => ({
            name: pd.name || '',
            description: pd.description || ''
          }));
        }
        if (emission.process_names?.length > 0) {
          return emission.process_names.map(name => ({
            name: typeof name === 'string' ? name : (name.name || ''),
            description: typeof name === 'object' ? (name.description || '') : ''
          }));
        }
        return [{ name: '', description: '' }];
      })(),
    });
    
    // Parse existing evidences from evidence_url (comma-separated)
    if (emission.evidence_url) {
      const existingUrls = emission.evidence_url.split(',').filter(url => url.trim());
      
      // Fetch actual filenames for each file
      const evidencesWithFilenames = await Promise.all(
        existingUrls.map(async (url, idx) => {
          const trimmedUrl = url.trim();
          const fileIdMatch = trimmedUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
          if (fileIdMatch) {
            try {
              const response = await axios.get(`${API}/files/${fileIdMatch[1]}/info`);
              return {
                url: trimmedUrl,
                filename: response.data.filename || `Evidence ${idx + 1}`,
                file_id: fileIdMatch[1]
              };
            } catch (error) {
              console.error('Failed to fetch file info:', error);
              return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };
            }
          }
          return { url: trimmedUrl, filename: `Evidence ${idx + 1}` };
        })
      );
      
      setExistingEvidences(evidencesWithFilenames);
    } else {
      setExistingEvidences([]);
    }
    
    // Dynamic field values will be populated from audit_log after form config loads
    // Set initial empty state - the useEffect will populate once dynamicInputFields is available
    setDynamicFieldValues({});
    
    // Clear previous audit log to prevent stale data showing
    setEmissionAuditLog([]);
    
    // Store the emission ID for fetching audit log
    setEditingEmissionId(emission.id);
    
    // Open dialog AFTER all data is set (original working flow)
    // Brief loading state to prevent initial render flash
    setIsEditLoading(true);
    setDialogOpen(true);
    
    // Small delay then clear loading - data is already set
    await new Promise(resolve => setTimeout(resolve, 50));
    setIsEditLoading(false);
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
    setDynamicFieldValues({}); // Clear dynamic field values
    setEditFormConfig(null); // Clear form config
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
      responsible_person_designation: '',
      responsible_person_contact: '',
      evidence_url: '',
      process_names: [{ name: '', description: '' }],
      // Reset Scope 3 optional fields
      supplier_name: '',
      supplier_code: '',
      employee_name: '',
      employee_id: '',
      asset_name: '', // Asset Name for C8/C13/C14/C15
      from_location: '', // From Location for C4/C6/C7/C9
      to_location: '', // To Location for C4/C6/C7/C9
    });
    setUploadedEvidence(null);
    setExistingEvidences([]); // Clear existing evidences
    setOverrideCalorificValue(false);
    setOverrideDensity(false);
    setOverrideJustification(''); // Reset override justification (#17)
    // Reset frequency type for edit mode
    setEditFrequencyType('monthly');
    // Reset C7 employee data
    setEditEmployees([]);
    setEditEmployeeMonthlyTotals({});
    setEditEmployeeYearlyTotal({});
    setEditC7Month(null); // Reset C7 month for new monthly model
  };

  // Handle dialog change with unsaved changes protection (#19)
  const handleDialogChange = (open) => {
    if (!open && isFormDirty) {
      // User is trying to close with unsaved changes - show confirmation
      setShowUnsavedChangesDialog(true);
      setPendingCloseAction('close');
      return;
    }
    setDialogOpen(open);
    if (!open) {
      resetForm();
      setIsFormDirty(false);
      setIsEditLoading(false); // Reset edit loading state when dialog closes
    }
  };
  
  // Handle outside click on modal - prevent closing (#19)
  const handleInteractOutside = (e) => {
    e.preventDefault(); // Prevent closing on outside click
  };
  
  // Handle ESC key - show confirmation if dirty (#19)
  const handleEscapeKeyDown = (e) => {
    if (isFormDirty) {
      e.preventDefault();
      setShowUnsavedChangesDialog(true);
      setPendingCloseAction('close');
    }
  };
  
  // Confirm discard changes (#19)
  const handleDiscardChanges = () => {
    setShowUnsavedChangesDialog(false);
    setIsFormDirty(false);
    setIsEditLoading(false); // Reset edit loading state
    setDialogOpen(false);
    resetForm();
  };
  
  // Continue editing (#19)
  const handleContinueEditing = () => {
    setShowUnsavedChangesDialog(false);
    setPendingCloseAction(null);
  };
  
  // Mark form as dirty when any input changes
  const markFormDirty = useCallback(() => {
    if (!isFormDirty) {
      setIsFormDirty(true);
    }
  }, [isFormDirty]);

  // Wrapper to update form data and mark as dirty
  const updateFormData = useCallback((updates) => {
    setFormData(prev => ({ ...prev, ...updates }));
    markFormDirty();
  }, [markFormDirty]);

  // Handler for calculating emissions for a specific employee and month in edit mode
  const handleCalculateEditEmployeeMonth = useCallback(async (employeeId, monthKey, employee) => {
    setIsCalculatingEditEmployee(true);
    try {
      // Check if this is yearly mode (monthKey === 'yearly')
      const isYearlyMode = monthKey === 'yearly';
      
      // Get input data based on mode - yearly uses yearly_data, monthly uses monthly_data
      const inputData = isYearlyMode 
        ? employee.yearly_data 
        : employee.monthly_data?.[monthKey];
      
      if (!inputData?.inputs || Object.keys(inputData.inputs).length === 0) {
        toast.error('Please enter input values first');
        setIsCalculatingEditEmployee(false);
        return;
      }

      // Check if all inputs have values
      const hasValidInputs = Object.values(inputData.inputs).some(v => v !== '' && v !== null && v !== undefined);
      if (!hasValidInputs) {
        toast.error('Please enter at least one input value');
        setIsCalculatingEditEmployee(false);
        return;
      }

      // Validate required fields
      if (!scope3Method) {
        toast.error('Please select a calculation method first');
        setIsCalculatingEditEmployee(false);
        return;
      }

      if (!scope3ActivityType) {
        toast.error('Please select an activity type first');
        setIsCalculatingEditEmployee(false);
        return;
      }

      // Find the matched activity from scope3 EF data (#6 - Fix: use scope3ActivityId first, then fallback to activity_type)
      const activityType = scope3ActivityType;
      
      // Normalize activity type for matching (handle both 'wfh' and 'Work From Home' formats)
      const normalizeActivityType = (type) => {
        if (!type) return '';
        return type.toLowerCase().replace(/\s+/g, '_');
      };
      const normalizedActivityType = normalizeActivityType(activityType);
      
      // Priority: 1) Selected scope3ActivityId, 2) First match for activity_type
      let matchedActivity = null;
      if (scope3ActivityId) {
        matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      }
      
      // Fallback to activity_type match if no specific activity selected
      if (!matchedActivity) {
        matchedActivity = filteredScope3Activities.find(a => 
          a.activity_type === activityType || 
          normalizeActivityType(a.activity_type) === normalizedActivityType
        );
      }

      if (!matchedActivity) {
        toast.error(`Activity "${activityType}" not found. Please select a valid activity.`);
        setIsCalculatingEditEmployee(false);
        return;
      }
      
      // Use the matched activity's emission factor for supplier_basis if no custom EF provided
      const efFromActivity = matchedActivity.emission_factor;
      const efUnitFromActivity = matchedActivity.ef_unit;

      // Build decision_inputs for decision tree traversal
      const decisionInputs = {
        calculation_method_scope3: scope3Method,
        activity_type: normalizedActivityType || activityType,
      };

      // Build inputs for formula execution (use inputData which handles both yearly and monthly)
      const formulaInputs = {};
      Object.entries(inputData.inputs).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          const fieldConfig = dynamicInputFields.find(f => f.variable === key);
          formulaInputs[key] = {
            value: parseFloat(value),
            unit: fieldConfig?.expectedUnit || fieldConfig?.unit || ''
          };
        }
      });

      // Get category object
      const categoryObj = dynamicCategories.find(c => 
        c.name === formData.category && c.scope_code === 'scope3'
      );

      if (!categoryObj) {
        toast.error('Category not found');
        setIsCalculatingEditEmployee(false);
        return;
      }

      const payload = {
        category_id: categoryObj.id,
        decision_inputs: decisionInputs,
        inputs: formulaInputs,
        context: {
          ...decisionInputs,
          reporting_period: formData.reporting_period_start, // For currency conversion year lookup
          activity: matchedActivity.activity, // For emission factor lookup
          fuel_name: matchedActivity.activity, // Alias for property source mapping
        },
        scope3_ef_id: matchedActivity.id,
      };

      // Call calc engine
      const response = await axios.post(
        `${API}/calc-engine/execute-by-category`,
        payload,
        { headers: getAuthHeader() }
      );

      if (response.data?.outputs) {
        const co2e = response.data.outputs.co2e?.value || 0;
        
        // Store audit log for calculation ledger display
        const auditLog = response.data.audit_log || [];
        const appliedFactors = response.data.applied_factors || {};
        
        // Build emissions and calculation_details objects
        const emissionsData = {
          co2: response.data.outputs.co2?.value || 0,
          ch4: response.data.outputs.ch4?.value || 0,
          n2o: response.data.outputs.n2o?.value || 0,
          co2e: co2e,
        };
        const calculationDetails = {
          audit_log: auditLog,
          applied_factors: appliedFactors,
          formula_id: response.data.resolved_formula?.id || null,
          formula_name: response.data.resolved_formula?.name || '',
          outputs: response.data.outputs,
        };
        
        // Update employee with calculated emissions and audit data
        setEditEmployees(prevEmployees => {
          const updatedEmployees = prevEmployees.map(emp => {
            if (emp.id === employeeId) {
              // Handle yearly mode vs monthly mode
              if (isYearlyMode) {
                const existingYearlyData = emp.yearly_data || { inputs: {} };
                return {
                  ...emp,
                  yearly_data: {
                    ...existingYearlyData,
                    emissions: emissionsData,
                    calculation_details: calculationDetails,
                  },
                };
              } else {
                // Monthly mode
                const existingMonthData = emp.monthly_data?.[monthKey] || { inputs: {} };
                return {
                  ...emp,
                  monthly_data: {
                    ...emp.monthly_data,
                    [monthKey]: {
                      ...existingMonthData,
                      emissions: emissionsData,
                      calculation_details: calculationDetails,
                    },
                  },
                };
              }
            }
            return emp;
          });
          
          // Recalculate totals based on mode
          if (isYearlyMode) {
            // For yearly mode, sum all employee yearly emissions
            let yearlyTotalValue = 0;
            updatedEmployees.forEach(emp => {
              yearlyTotalValue += emp.yearly_data?.emissions?.co2e || 0;
            });
            setEditEmployeeYearlyTotal({ co2e: yearlyTotalValue });
            setEditEmployeeMonthlyTotals({});
          } else {
            // For monthly mode, calculate monthly and yearly totals
            const newMonthlyTotals = {};
            const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            monthKeys.forEach(mk => {
              let total = 0;
              updatedEmployees.forEach(emp => {
                total += emp.monthly_data?.[mk]?.emissions?.co2e || 0;
              });
              if (total > 0) {
                newMonthlyTotals[mk] = { co2e: total };
              }
            });
            setEditEmployeeMonthlyTotals(newMonthlyTotals);
            
            // Calculate yearly total from monthly
            const yearlyTotalValue = Object.values(newMonthlyTotals).reduce((sum, m) => sum + (m.co2e || 0), 0);
            setEditEmployeeYearlyTotal({ co2e: yearlyTotalValue });
          }
          
          return updatedEmployees;
        });
        
        toast.success(`Calculated: ${co2e.toFixed(4)} tCO2e`);
      } else {
        toast.error('No calculation results returned');
      }
    } catch (error) {
      console.error('[Edit MultiEmployee Calc] Error:', error);
      console.error('[Edit MultiEmployee Calc] Error response:', error.response?.data);
      toast.error(error.response?.data?.detail || 'Failed to calculate emissions');
    } finally {
      setIsCalculatingEditEmployee(false);
    }
  }, [scope3Method, scope3ActivityType, filteredScope3Activities, dynamicCategories, formData.category, dynamicInputFields, getAuthHeader]);

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
      
      // Date range filter - handle different date formats with overlap logic
      if (filterDateRange.from || filterDateRange.to) {
        const period = e.reporting_period || '';
        
        // Helper to check if two date ranges overlap
        // Ranges overlap if: range1_start <= range2_end AND range1_end >= range2_start
        const rangesOverlap = (start1, end1, start2, end2) => {
          return start1 <= end2 && end1 >= start2;
        };
        
        // Get filter range as [year, month] tuples
        const filterStart = filterDateRange.from 
          ? [filterDateRange.from.getFullYear(), filterDateRange.from.getMonth() + 1]
          : [0, 1];
        const filterEnd = filterDateRange.to 
          ? [filterDateRange.to.getFullYear(), filterDateRange.to.getMonth() + 1]
          : [9999, 12];
        
        // Convert [year, month] to comparable number (YYYYMM)
        const toComparable = ([y, m]) => y * 100 + m;
        const filterStartNum = toComparable(filterStart);
        const filterEndNum = toComparable(filterEnd);
        
        // Handle FY format (e.g., "FY 2025-2026" = April 2025 to March 2026)
        if (period.startsWith('FY ')) {
          const fyMatch = period.match(/FY\s*(\d{4})/);
          if (fyMatch) {
            const fyStartYear = parseInt(fyMatch[1]);
            const fyEndYear = fyStartYear + 1;
            // FY runs from April of start year to March of end year
            const fyStartNum = toComparable([fyStartYear, 4]);  // April
            const fyEndNum = toComparable([fyEndYear, 3]);      // March
            if (!rangesOverlap(fyStartNum, fyEndNum, filterStartNum, filterEndNum)) {
              return false;
            }
          }
        }
        // Handle CY format (e.g., "CY2025" = January to December 2025)
        else if (period.startsWith('CY')) {
          const cyMatch = period.match(/CY(\d{4})/);
          if (cyMatch) {
            const cyYear = parseInt(cyMatch[1]);
            // CY runs from January to December of that year
            const cyStartNum = toComparable([cyYear, 1]);   // January
            const cyEndNum = toComparable([cyYear, 12]);    // December
            if (!rangesOverlap(cyStartNum, cyEndNum, filterStartNum, filterEndNum)) {
              return false;
            }
          }
        }
        // Handle monthly format (e.g., "2025-04" or "2025-04 to 2025-06")
        else if (period.match(/^\d{4}-\d{2}/)) {
          const monthMatch = period.match(/^(\d{4})-(\d{2})/);
          if (monthMatch) {
            const monthYear = parseInt(monthMatch[1]);
            const monthNum = parseInt(monthMatch[2]);
            const periodNum = toComparable([monthYear, monthNum]);
            // Monthly entry is a single point, check if it falls within filter range
            if (periodNum < filterStartNum || periodNum > filterEndNum) {
              return false;
            }
          }
        }
        // Unknown format - exclude if filter is set
        else if (period) {
          // Try to parse as date
          const dateToCompare = new Date(period.split(' to ')[0] + '-01');
          if (!isNaN(dateToCompare.getTime())) {
            if (filterDateRange.from && dateToCompare < filterDateRange.from) return false;
            if (filterDateRange.to && dateToCompare > filterDateRange.to) return false;
          }
        }
      }
      
      if (filterCategory && e.category !== filterCategory) return false;
      
      // Frequency filter (monthly vs yearly)
      if (filterFrequency) {
        const emissionFrequency = e.frequency_type || 'monthly'; // Legacy records default to monthly
        if (filterFrequency !== emissionFrequency) return false;
      }
      
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const facilityName = facilities.find(f => f.id === e.facility_id)?.name?.toLowerCase() || '';
        const categoryName = e.category?.toLowerCase() || '';
        const fuelType = (e.sub_category || e.fuel_type || '')?.toLowerCase() || '';
        const activity = e.scope3_activity?.toLowerCase() || '';
        const reportingPeriod = e.reporting_period?.toLowerCase() || '';
        
        // Search in facility name, category, fuel/activity type, reporting period
        const matchesSearch = facilityName.includes(query) || 
                              categoryName.includes(query) || 
                              fuelType.includes(query) ||
                              activity.includes(query) ||
                              reportingPeriod.includes(query);
        if (!matchesSearch) return false;
      }
      
      return true;
    });
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          // Sort by reporting period start date
          const dateA = new Date((a.reporting_period || '').split(' to ')[0] + '-01');
          const dateB = new Date((b.reporting_period || '').split(' to ')[0] + '-01');
          comparison = dateA - dateB;
          break;
        case 'created_at':
          // Sort by created_at timestamp
          const createdA = new Date(a.created_at || 0);
          const createdB = new Date(b.created_at || 0);
          comparison = createdA - createdB;
          break;
        case 'updated_at':
          // Sort by updated_at timestamp (or created_at if not available)
          const updatedA = new Date(a.updated_at || a.created_at || 0);
          const updatedB = new Date(b.updated_at || b.created_at || 0);
          comparison = updatedA - updatedB;
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
  }, [emissions, activeScope, filterFacility, filterCategory, filterFrequency, filterDateRange, activeFacilityIds, sortBy, sortOrder, facilities, searchQuery]);

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

  const handleDownloadEvidence = async (evidenceUrl, e, filename) => {
    e.preventDefault();
    if (!evidenceUrl) {
      toast.error('No evidence file available');
      return;
    }
    
    // Extract file ID and use fetch + blob for download
    const fileIdMatch = evidenceUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const downloadUrl = `${BACKEND_URL}/api/files/${fileId}/download`;
      await downloadFileHelper(downloadUrl, filename || 'evidence-file');
      return;
    }
    
    // For external URLs, open in new tab (can't use fetch due to CORS)
    if (evidenceUrl.startsWith('http')) {
      window.open(evidenceUrl, '_blank');
    } else if (evidenceUrl.startsWith('/api')) {
      await downloadFileHelper(`${BACKEND_URL}${evidenceUrl}`, filename || 'file');
    } else {
      await downloadFileHelper(`${API}${evidenceUrl}`, filename || 'file');
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

  // Check if organization has scope 3 access
  const hasScope3Access = enabledAccess?.includes('scope1_2_3') || false;

  return (
    <div className="space-y-6" data-testid="emissions-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">GHG Emissions</h1>
          <p className="text-text-secondary">Track and manage GHG emissions</p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search emissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-64 bg-stone-50 border border-stone-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              data-testid="emissions-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
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
              <DialogContent 
                key={editingEmission?.id || 'new'}
                className="max-w-4xl max-h-[90vh] overflow-y-auto"
                onInteractOutside={handleInteractOutside}
                onEscapeKeyDown={handleEscapeKeyDown}
                hideCloseButton={true}
              >
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle>{editingEmission ? 'Update' : 'Add'} Emission Record</DialogTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDialogChange(false)}
                      className="h-8 w-8 p-0 rounded-sm opacity-70 hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
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
                  dynamicScopes={dynamicScopes}
                  dynamicCategories={dynamicCategories}
                  hasScope3Access={hasScope3Access}
                  getAuthHeader={getAuthHeader}
                  configLabels={configLabels}
                  organization={organization}
                  onFormChange={markFormDirty}
                  onSuccess={() => {
                    setDialogOpen(false);
                    setIsFormDirty(false);
                    fetchData();
                    toast.success('Emissions saved successfully');
                  }}
                  onCancel={() => handleDialogChange(false)}
                />
              ) : (
                /* Edit form with loading gate - prevents showing stale/partial data */
                (() => {
                  // Data-based loading gate for C7 Employee Commuting (has deeply nested employee data)
                  const isC7Category = formData.category?.toLowerCase()?.includes('c7') || 
                                       formData.category?.toLowerCase()?.includes('employee commuting');
                  
                  // For C7, check that employees are populated with valid data
                  const isC7DataReady = !isC7Category || 
                                        (editEmployees.length > 0 && editEmployees[0]?.id);
                  
                  // Show loading if explicitly loading OR if C7 data isn't ready yet
                  if (isEditLoading || !isC7DataReady) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-gray-500">Loading emission data...</p>
                      </div>
                    );
                  }
                  
                  return (
                <form onSubmit={handleSubmit} className="space-y-5" data-testid="emission-form">
                {/* Facility and Scope Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="facility">Facility *</Label>
                    <select
                      id="facility"
                      value={formData.facility_id}
                      onChange={(e) => { setFormData({ ...formData, facility_id: e.target.value }); markFormDirty(); }}
                      required
                      className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                      data-testid="emission-facility-select"
                    >
                      <option value="">Select Facility</option>
                      {facilities.filter(f => f.is_active !== false).map(f => (
                        <option key={f.id} value={f.id}>{f.name} {f.country ? `(${f.country})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Scope *</Label>
                    <div className="flex gap-4 h-10 items-center flex-wrap">
                      {dynamicScopes.map(scope => {
                        // Scope 3 requires organization access, biogenic is always enabled
                        const isScope3 = scope.code === 'scope3';
                        const isDisabled = isScope3 && !hasScope3Access;
                        return (
                          <label key={scope.code} className={`flex items-center gap-2 relative ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                            <input
                              type="radio"
                              value={scope.code}
                              checked={formData.scope === scope.code}
                              disabled={isDisabled}
                              onChange={(e) => {
                                setFormData({ ...formData, scope: e.target.value, fuel_id: '', category: '', sub_category: '' });
                                handleFuelSelect('');
                                // Reset biogenic scope selection when changing primary scope
                                if (e.target.value !== 'biogenic') {
                                  setBiogenicScopeSelection('');
                                }
                              }}
                              className="text-primary"
                              data-testid={`scope-radio-${scope.code}`}
                            />
                            <span>{scope.name}</span>
                            {isDisabled && (
                              <span className="px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-semibold rounded whitespace-nowrap">
                                Not Available
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                  
                {/* Biogenic Scope Selection - Show when biogenic is selected */}
                {formData.scope === 'biogenic' && (
                  <div className="space-y-1.5 p-3 bg-green-50 rounded-lg border border-green-200">
                    <Label className="text-green-800">Select Biogenic Emission Type *</Label>
                    <div className="flex gap-4 h-10 items-center">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          value="scope1"
                          checked={biogenicScopeSelection === 'scope1'}
                          onChange={(e) => {
                            setBiogenicScopeSelection(e.target.value);
                            setFormData(prev => ({ ...prev, category: '', fuel_id: '' }));
                            handleFuelSelect('');
                          }}
                          className="text-green-600"
                          data-testid="biogenic-scope-radio-scope1"
                        />
                        <span className="text-green-800">Direct Biogenic</span>
                      </label>
                      <label className={`flex items-center gap-2 ${!hasScope3Access ? 'opacity-60 cursor-not-allowed' : ''}`}>
                        <input
                          type="radio"
                          value="scope3"
                          checked={biogenicScopeSelection === 'scope3'}
                          disabled={!hasScope3Access}
                          onChange={(e) => {
                            setBiogenicScopeSelection(e.target.value);
                            setFormData(prev => ({ ...prev, category: '', fuel_id: '' }));
                            handleFuelSelect('');
                          }}
                          className="text-green-600"
                          data-testid="biogenic-scope-radio-scope3"
                        />
                        <span className="text-green-800">Indirect Biogenic</span>
                        {!hasScope3Access && (
                          <span className="px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-semibold rounded whitespace-nowrap">
                            Not Available
                          </span>
                        )}
                      </label>
                    </div>
                    {loadingBiogenicCategories && (
                      <p className="text-xs text-green-600">Loading biogenic categories...</p>
                    )}
                  </div>
                )}

                {/* Reporting Period - Handle both Monthly and Yearly records for editing */}
                {editingEmission ? (
                  <div className="space-y-2">
                    {/* Frequency Type Badge */}
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        editFrequencyType === 'yearly' 
                          ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                          : 'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}>
                        {editFrequencyType === 'yearly' ? 'Annual Entry' : 'Monthly Entry'}
                      </span>
                    </div>
                    
                    {/* Yearly Record - Show read-only year display */}
                    {editFrequencyType === 'yearly' ? (
                      <div className="space-y-1.5">
                        <Label>
                          <CalendarIcon className="w-4 h-4 inline mr-1" />
                          Reporting Year
                        </Label>
                        <div className="flex items-center h-10 bg-purple-50 border border-purple-200 rounded-lg px-3 text-purple-700 font-medium">
                          {editingEmission.reporting_period || 'N/A'}
                        </div>
                        <p className="text-xs text-purple-600">
                          Annual entry - reporting period cannot be changed
                        </p>
                      </div>
                    ) : (
                      /* Monthly Record - Show month/year picker */
                      <div className="space-y-1.5">
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
                    )}
                  </div>
                ) : (
                  /* For new emissions, show period type selection */
                  <div className="space-y-3">
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
                        <div className="space-y-1.5 col-span-2">
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
                        <div className="space-y-1.5">
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
                        <div className="space-y-1.5">
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

                {/* Fuel Selection - Step 1: Category, Step 2: Fuel */}
                <div className="space-y-3">
                  {/* Show prompt for facility selection */}
                  {!formData.facility_id ? (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">
                        <strong>Please select a facility first</strong> to see available fuel categories and types.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Category and Fuel Selection - Always visible */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Step 1: Category Selection */}
                        <div className="space-y-1.5">
                          <Label htmlFor="category_select">Step 1: Select Category *</Label>
                          <select
                            id="category_select"
                            value={selectedCategory}
                            onChange={(e) => handleCategorySelect(e.target.value)}
                            required
                            className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                            data-testid="category-select"
                          >
                            <option value="">Select category...</option>
                            {getCategoriesForScope.map(category => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </div>
                        
                        {/* Step 2: For Scope 3 - Method and Activity; For others - Fuel Type */}
                        {/* Also handle Biogenic with Scope 3 selection */}
                        {(formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                          <>
                            {/* Scope 3: Calculation Method */}
                            <div className="space-y-1.5">
                              <Label htmlFor="scope3_method_select">Step 2: Calculation Method *</Label>
                              <select
                                id="scope3_method_select"
                                value={scope3Method}
                                onChange={(e) => {
                                  const newMethod = e.target.value;
                                  console.log('[EDIT DIALOG] Method changed:', {
                                    oldMethod: scope3Method,
                                    newMethod: newMethod
                                  });
                                  setScope3Method(newMethod);
                                  setScope3ActivityType(''); // Reset activity type when method changes
                                  setScope3ActivityId('');
                                  setDynamicFieldValues({}); // Fix #9: Clear stale inputs when method changes
                                  markFormDirty(); // Mark form as dirty when method changes
                                  console.log('[EDIT DIALOG] Cleared dynamicFieldValues and reset activity type');
                                }}
                                required
                                disabled={!selectedCategory}
                                className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${!selectedCategory ? 'opacity-50 cursor-not-allowed' : ''}`}
                                data-testid="scope3-method-select"
                              >
                                <option value="">{selectedCategory ? 'Select method...' : 'Select category first'}</option>
                                {availableScope3Methods.map(method => (
                                  <option key={method} value={method}>
                                    {getMethodLabel(method)}
                                  </option>
                                ))}
                              </select>
                              {selectedCategory && availableScope3Methods.length === 0 && !loadingScope3EF && (
                                <p className="text-xs text-amber-600">No methods available for this category</p>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1.5">
                            <Label htmlFor="fuel_select">Step 2: Select Fuel Type *</Label>
                            <select
                              id="fuel_select"
                              value={formData.fuel_id}
                              onChange={(e) => handleFuelSelect(e.target.value)}
                              required
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
                        )}
                      </div>
                      
                      {/* Scope 3: Activity (Step 3) - Also handle Biogenic Scope 3 */}
                      {(formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) && scope3Method && (
                        <div className="space-y-3">
                          {/* Activity Type Filter (only for C6/C7) */}
                          {availableScope3ActivityTypes.length > 0 && (
                            <div className="space-y-1.5">
                              <Label htmlFor="scope3_activity_type_filter">Step 3: Activity Type *</Label>
                              <select
                                id="scope3_activity_type_filter"
                                value={scope3ActivityType}
                                onChange={(e) => {
                                  const newActivityType = e.target.value;
                                  console.log('[EDIT DIALOG] Activity Type changed:', {
                                    oldActivityType: scope3ActivityType,
                                    newActivityType: newActivityType
                                  });
                                  setScope3ActivityType(newActivityType);
                                  setScope3ActivityId(''); // Reset activity when type changes
                                  setActivitySearchTerm(''); // Clear activity search
                                  setDynamicFieldValues({}); // Fix #9: Clear stale inputs when activity type changes
                                  console.log('[EDIT DIALOG] Cleared dynamicFieldValues and reset activityId');
                                }}
                                required
                                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                                data-testid="scope3-activity-type-filter"
                              >
                                <option value="">Select activity type...</option>
                                {(() => {
                                  // Ensure saved activity type is included in options
                                  const allTypes = new Set(availableScope3ActivityTypes);
                                  if (scope3ActivityType && !allTypes.has(scope3ActivityType)) {
                                    allTypes.add(scope3ActivityType);
                                  }
                                  return Array.from(allTypes).sort();
                                })().map(type => {
                                  // Display friendly labels for activity types (#9)
                                  const activityTypeLabels = {
                                    'car_travel': 'Car Travel',
                                    'bus_travel': 'Bus Travel',
                                    'rail_travel': 'Rail Travel',
                                    'air_travel': 'Air Travel',
                                    'taxi_travel': 'Taxi Travel',
                                    'bike_travel': 'Bike Travel',
                                    'wfh': 'Work From Home',
                                    'hotel_stay': 'Hotel Stay',
                                    'water_travel': 'Water Travel',
                                  };
                                  return (
                                    <option key={type} value={type}>
                                      {activityTypeLabels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}
                          
                          {/* Subcategory Filter (for C8/C10/C11/C13/C14) */}
                          {requiresSubcategory && availableSubcategories.length > 0 && (
                            <div className="space-y-1.5">
                              <Label htmlFor="scope3_subcategory_filter">Step 3: Subcategory *</Label>
                              <select
                                id="scope3_subcategory_filter"
                                value={scope3Subcategory}
                                onChange={(e) => {
                                  setScope3Subcategory(e.target.value);
                                  setScope3ActivityId(''); // Reset activity when subcategory changes
                                  setActivitySearchTerm(''); // Clear activity search
                                }}
                                required
                                className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                                data-testid="scope3-subcategory-filter"
                              >
                                <option value="">Select subcategory...</option>
                                {availableSubcategories.map(sub => (
                                  <option key={sub.value} value={sub.value}>
                                    {sub.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          
                          {/* Activity Selection */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="scope3_activity_select">
                                {(availableScope3ActivityTypes.length > 0 || requiresSubcategory) ? 'Step 4: Activity *' : 'Step 3: Activity *'}
                              </Label>
                              {/* Toggle for custom activity - available for supplier_basis (Scope 3 and Biogenic Scope 3) */}
                              {scope3Method === 'supplier_basis' && (formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) && (
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={useCustomActivity}
                                    onChange={(e) => {
                                      setUseCustomActivity(e.target.checked);
                                      setActivitySearchTerm(''); // Clear activity search
                                      if (e.target.checked) {
                                        setScope3ActivityId('');
                                      } else {
                                        setScope3CustomActivity('');
                                      }
                                    }}
                                    className="rounded border-stone-300"
                                  />
                                  <span className="text-text-secondary">Use Custom Activity</span>
                                </label>
                              )}
                            </div>
                          
                            {/* For supplier_basis with custom activity toggle ON: Show text field */}
                            {scope3Method === 'supplier_basis' && useCustomActivity && (formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                              <div className="space-y-1.5">
                                <Input
                                  type="text"
                                  value={scope3CustomActivity}
                                  onChange={(e) => setScope3CustomActivity(e.target.value)}
                                  placeholder="Enter custom activity name..."
                                  className="bg-stone-50 h-10"
                                  data-testid="scope3-custom-activity-input"
                                />
                                <p className="text-xs text-text-muted">
                                  Enter a custom activity name describing the emission source
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {/* Activity search input */}
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                                  <Input
                                    type="text"
                                    value={activitySearchTerm}
                                    onChange={(e) => setActivitySearchTerm(e.target.value)}
                                    placeholder="Search activities..."
                                    className="pl-9 bg-stone-50 h-10"
                                    data-testid="edit-activity-search-input"
                                    disabled={!scope3Method || (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)}
                                  />
                                  {activitySearchTerm && (
                                    <button
                                      type="button"
                                      onClick={() => setActivitySearchTerm('')}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                                
                                {/* Activity selection dropdown */}
                                <select
                                  id="scope3_activity_select"
                                  value={scope3ActivityId}
                                  onChange={(e) => { 
                                    setScope3ActivityId(e.target.value); 
                                    setActivitySearchTerm(''); // Clear search after selection
                                    markFormDirty(); 
                                  }}
                                  required
                                  disabled={!scope3Method || (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)}
                                  className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${(!scope3Method || (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) || (requiresSubcategory && !scope3Subcategory)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  data-testid="scope3-activity-select"
                                >
                                  <option value="">
                                    {!scope3Method ? 'Select method first' : 
                                     (availableScope3ActivityTypes.length > 0 && !scope3ActivityType) ? 'Select activity type first' :
                                     (requiresSubcategory && !scope3Subcategory) ? 'Select subcategory first' :
                                     `Select activity (${filteredScope3Activities.filter(a => 
                                       !activitySearchTerm || a.activity?.toLowerCase().includes(activitySearchTerm.toLowerCase())
                                     ).length} available)...`}
                                  </option>
                                  {filteredScope3Activities
                                    .filter(a => !activitySearchTerm || a.activity?.toLowerCase().includes(activitySearchTerm.toLowerCase()))
                                    .map(ef => (
                                      <option key={ef.id} value={ef.id}>
                                        {ef.activity}
                                      </option>
                                    ))}
                                </select>
                                {/* No match indicator */}
                                {activitySearchTerm && filteredScope3Activities.filter(a => a.activity?.toLowerCase().includes(activitySearchTerm.toLowerCase())).length === 0 && (
                                  <p className="text-xs text-amber-600">No activities match "{activitySearchTerm}"</p>
                                )}
                              </div>
                            )}
                            {/* Activity loading indicator only - no error message shown to users */}
                            {loadingScope3EF && (
                              <p className="text-xs text-blue-600 mt-1">Loading activities...</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Scope 3 Supplier Information (optional) - shown for all Scope 3 categories */}
                      {formData.scope === 'scope3' && selectedCategory && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <h4 className="font-medium mb-2 text-blue-800 text-sm">{selectedCategory?.toLowerCase()?.includes('c9') ? 'Customer' : 'Supplier'} Information (Optional)</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label htmlFor="supplier_name" className="text-xs">{selectedCategory?.toLowerCase()?.includes('c9') ? 'Customer Name' : 'Supplier Name'}</Label>
                              <Input
                                id="supplier_name"
                                value={formData.supplier_name}
                                onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                placeholder={selectedCategory?.toLowerCase()?.includes('c9') ? 'Enter customer name...' : 'Enter supplier name...'}
                                className="bg-white h-9"
                                data-testid="edit-supplier-name-input"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="supplier_code" className="text-xs">{selectedCategory?.toLowerCase()?.includes('c9') ? 'Customer Code' : 'Supplier Code'}</Label>
                              <Input
                                id="supplier_code"
                                value={formData.supplier_code}
                                onChange={(e) => setFormData({ ...formData, supplier_code: e.target.value })}
                                placeholder={selectedCategory?.toLowerCase()?.includes('c9') ? 'Enter customer code...' : 'Enter supplier code...'}
                                className="bg-white h-9"
                                data-testid="edit-supplier-code-input"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Employee Commuting specific fields (optional) */}
                      {formData.scope === 'scope3' && formData.category === 'Employee Commuting' && (
                        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <h4 className="font-medium mb-2 text-purple-800 text-sm">Employee Information (Optional)</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="employee_name">Employee Name</Label>
                              <Input
                                id="employee_name"
                                value={formData.employee_name}
                                onChange={(e) => setFormData({ ...formData, employee_name: e.target.value })}
                                placeholder="Enter employee name..."
                                className="bg-white"
                                data-testid="edit-employee-name-input"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="employee_id">Employee ID</Label>
                              <Input
                                id="employee_id"
                                value={formData.employee_id}
                                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                                placeholder="Enter employee ID..."
                                className="bg-white"
                                data-testid="edit-employee-id-input"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Asset Name for C8/C13/C14/C15 (Leased Assets, Franchises, Investments) */}
                      {formData.scope === 'scope3' && selectedCategory && ['c8', 'c13', 'c14', 'c15'].some(c => selectedCategory.toLowerCase().includes(c)) && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <h4 className="font-medium mb-2 text-amber-800 text-sm">Asset Information</h4>
                          <div className="space-y-1.5">
                            <Label htmlFor="asset_name" className="text-xs">Asset Name *</Label>
                            <Input
                              id="asset_name"
                              value={formData.asset_name}
                              onChange={(e) => setFormData({ ...formData, asset_name: e.target.value })}
                              placeholder="Enter asset name or identifier..."
                              className="bg-white h-9"
                              data-testid="edit-asset-name-input"
                            />
                            <p className="text-xs text-amber-600">Name or identifier of the leased asset, franchise, or investment</p>
                          </div>
                        </div>
                      )}

                      {/* From/To Location for C4/C6/C9 (Transportation/Travel categories) */}
                      {formData.scope === 'scope3' && selectedCategory && ['c4', 'c6', 'c9'].some(c => selectedCategory.toLowerCase().includes(c)) && !isEditC7EmployeeCommuting && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <h4 className="font-medium mb-2 text-blue-800 text-sm">Journey Details (Optional)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="from_location" className="text-xs">From Location</Label>
                              <Input
                                id="from_location"
                                value={formData.from_location}
                                onChange={(e) => setFormData({ ...formData, from_location: e.target.value })}
                                placeholder="E.g., City A, Warehouse"
                                className="bg-white h-9"
                                data-testid="edit-from-location-input"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="to_location" className="text-xs">To Location</Label>
                              <Input
                                id="to_location"
                                value={formData.to_location}
                                onChange={(e) => setFormData({ ...formData, to_location: e.target.value })}
                                placeholder="E.g., City B, Distribution Center"
                                className="bg-white h-9"
                                data-testid="edit-to-location-input"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                  
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
                  <div className="space-y-2">
                    {formData.process_names.map((process, index) => (
                      <div key={index} className="border border-stone-200 rounded-lg p-3 space-y-2 bg-stone-50">
                        <div className="flex gap-2 items-start">
                          <div className="flex-1 space-y-1.5">
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
                              className="bg-white h-9"
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

                {/* Quantity Input and Person Responsible - Same Row */}
                {/* DYNAMIC INPUT FIELDS - When form config is loaded */}
                
                {/* Multi-Employee Input for C7 Employee Commuting Edit */}
                {isEditC7EmployeeCommuting && editingEmission && (
                  <div className="space-y-4 border-t pt-4">
                    <MultiEmployeeInput
                      key={`employees-${editingEmission?.id}-${editEmployees.map(e => e.id).join('-')}`}
                      entityLabel="Employee"
                      fields={dynamicInputFields.length > 0 ? dynamicInputFields.map(f => ({
                        variable: f.variable,
                        label: f.label,
                        type: f.fieldType,
                        unit: f.expectedUnit || f.unit || '',
                        required: f.required,
                        placeholder: f.placeholder,
                      })) : [
                        // Fallback fields when dynamicInputFields is empty
                        { variable: 'km_travelled', label: 'Distance Travelled', type: 'number', unit: 'km', required: true },
                      ]}
                      selectedActivityType={scope3ActivityType}
                      calculationMethod={scope3Method}
                      employees={editEmployees}
                      onEmployeesChange={setEditEmployees}
                      activeMonths={editActiveMonths}
                      onCalculateEmployee={handleCalculateEditEmployeeMonth}
                      monthlyTotals={editEmployeeMonthlyTotals}
                      yearlyTotal={editEmployeeYearlyTotal}
                      isCalculating={isCalculatingEditEmployee}
                      disabled={false}
                      isEditMode={true}
                      frequencyType={editFrequencyType}
                    />
                  </div>
                )}
                
                {/* Regular Input Fields - Hide for C7 Employee Commuting */}
                {!isEditC7EmployeeCommuting && editFormConfigLoading ? (
                  /* Show loading state while fetching form config - prevents legacy form flash */
                  <div className="flex items-center justify-center p-8">
                    <div className="flex items-center gap-3 text-stone-500">
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Loading form configuration...</span>
                    </div>
                  </div>
                ) : !isEditC7EmployeeCommuting && dynamicInputFields.length > 0 && true ? (
                  <div className="space-y-4">
                    <div className="text-sm text-stone-500 mb-2 flex items-center gap-2">
                      Input Fields (from calculation engine configuration)
                    </div>
                    
                    {/* Supplier Method Disclaimer */}
                    {scope3Method === 'supplier_basis' && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          <span className="font-semibold">Note:</span> For the Supplier Method, the emission factor numerator must be in tCO2e, and the denominator must correspond to the same unit used in the "Quantity Used" field.
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      {dynamicInputFields.map(field => {
                        const isQtyField = field.variable === 'qty' || field.variable === 'qty_energy';
                        
                        // Get the currently saved unit for this field
                        const savedUnit = dynamicFieldValues[`${field.variable}_unit`] || '';
                        
                        // Determine field units based on unit_source
                        let fieldUnits = [];
                        if (field.unitSource === 'fuel') {
                          // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
                          if (formData.scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
                            const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                            fieldUnits = matchedActivity?.allowed_units || [];
                          } else {
                            fieldUnits = selectedFuel?.allowed_units || [];
                          }
                        } else if (field.unitSource === 'all_units') {
                          // Show all units from centralized units list
                          fieldUnits = centralizedUnits.map(u => u.symbol);
                          
                          // For emission_factor_supplier_based with supplier_basis method,
                          // only show units with tCO2e or tCO2 in numerator
                          if (field.variable === 'emission_factor_supplier_based' && scope3Method === 'supplier_basis') {
                            fieldUnits = fieldUnits.filter(u => {
                              const upperUnit = u.toUpperCase();
                              // Check if the unit starts with tCO2e or tCO2 (in numerator)
                              return upperUnit.startsWith('TCO2E') || upperUnit.startsWith('TCO2');
                            });
                          }
                        } else if (field.unitSource === 'scope3_ef') {
                          // For scope3_ef: Priority 1: scope3_ef.allowed_units, Priority 2: field mapping, Priority 3: formula expected_unit
                          const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                          if (matchedEF?.allowed_units?.length > 0) {
                            fieldUnits = matchedEF.allowed_units;
                          } else if (field.allowedUnits?.length > 0) {
                            fieldUnits = field.allowedUnits;
                          } else if (field.expectedUnit) {
                            fieldUnits = [field.expectedUnit];
                          } else {
                            fieldUnits = [];
                          }
                        } else {
                          // static - use allowed_units from mapping
                          fieldUnits = field.allowedUnits.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
                        }
                        
                        // Ensure the saved unit is included in fieldUnits (for edit mode)
                        if (savedUnit && !fieldUnits.includes(savedUnit)) {
                          fieldUnits = [savedUnit, ...fieldUnits];
                        }
                        
                        // Unitless count fields - should never show unit selector (C6 Business Travel fields)
                        const isUnitlessCountField = ['qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms', 'number_of_passengers', 'number_of_nights', 'number_of_rooms', 'qty_days_travelled', 'working_days'].includes(field.variable);
                        
                        const showUnitSelector = fieldUnits.length > 0 && !isUnitlessCountField;
                        
                        // For supplier_basis method with supplier-based fields, use text input for units
                        const isSupplierBasisUnitField = scope3Method === 'supplier_basis' && 
                          (field.variable?.includes('supplier_based') || field.variable?.includes('supplier'));
                        
                        // Show checkbox for override fields OR optional fields (not required and not override)
                        const showOverrideCheckbox = field.isOverride || (!field.required && !field.isOverride);
                        
                        return (
                          <div key={field.id || field.variable} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="font-medium">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                                {!showUnitSelector && !isSupplierBasisUnitField && field.expectedUnit && (
                                  <span className="text-muted-foreground ml-1 text-xs font-normal">({field.expectedUnit})</span>
                                )}
                              </Label>
                              
                              {showOverrideCheckbox && (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`edit-override-${field.variable}`}
                                    checked={dynamicFieldValues[`override_${field.variable}`] || false}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      updateDynamicFieldValue(`override_${field.variable}`, isChecked);
                                      
                                      // When enabling override, initialize the unit to the first allowed unit
                                      // This ensures the displayed unit matches what will be sent to backend
                                      if (isChecked && !dynamicFieldValues[`${field.variable}_unit`]) {
                                        let overrideUnits = [];
                                        if (field.unitSource === 'fuel') {
                                          // For Scope 3 subcategory categories (C8, C10, C11, C13, C14), fallback to filteredScope3Activities
                                          if (formData.scope === 'scope3' && requiresSubcategory && !selectedFuel && scope3ActivityId) {
                                            const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
                                            overrideUnits = matchedActivity?.allowed_units || [];
                                          } else {
                                            overrideUnits = selectedFuel?.allowed_units || [];
                                          }
                                        } else if (field.unitSource === 'all_units') {
                                          overrideUnits = centralizedUnits.map(u => u.symbol);
                                        } else {
                                          overrideUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
                                        }
                                        if (overrideUnits.length > 0) {
                                          updateDynamicFieldValue(`${field.variable}_unit`, overrideUnits[0]);
                                        }
                                      }
                                    }}
                                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                  />
                                  <label 
                                    htmlFor={`edit-override-${field.variable}`} 
                                    className="text-xs text-amber-600 font-medium"
                                  >
                                    Override Default
                                  </label>
                                </div>
                              )}
                            </div>
                            
                            {/* Render based on field_type */}
                            {field.fieldType === 'select' && field.options?.length > 0 ? (
                              <select
                                value={dynamicFieldValues[field.variable] || ''}
                                onChange={(e) => updateDynamicFieldValue(field.variable, e.target.value)}
                                disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                                className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                                data-testid={`edit-select-${field.fieldKey}`}
                              >
                                <option value="">Select {field.label}</option>
                                {field.options.map(opt => (
                                  <option key={opt.value || opt} value={opt.value || opt}>
                                    {opt.label || opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className={showUnitSelector ? "flex gap-2" : ""}>
                                <Input
                                  type={field.fieldType === 'text' ? 'text' : 'number'}
                                  step={field.fieldType === 'number' ? 'any' : undefined}
                                  min={field.fieldType === 'number' ? '0' : undefined}
                                  placeholder={field.placeholder}
                                  value={dynamicFieldValues[field.variable] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (field.fieldType === 'text' || val === '' || parseFloat(val) >= 0) {
                                      updateDynamicFieldValue(field.variable, val);
                                      // Also sync to formData for legacy compatibility
                                      if (isQtyField) {
                                        setFormData(prev => ({ ...prev, quantity: val }));
                                      }
                                    }
                                  }}
                                  onKeyDown={(e) => { if (field.fieldType === 'number' && e.key === '-') e.preventDefault(); }}
                                  disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                                  className={`bg-stone-50 ${showUnitSelector ? 'flex-1' : ''} ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                                  data-testid={`edit-input-${field.fieldKey}`}
                                />
                                
                                {/* Supplier basis - use text input for units */}
                                {isSupplierBasisUnitField && (
                                  <Input
                                    type="text"
                                    value={dynamicFieldValues[`${field.variable}_unit`] || ''}
                                    onChange={(e) => updateDynamicFieldValue(`${field.variable}_unit`, e.target.value)}
                                    disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                                    className={`bg-stone-50 border border-stone-200 rounded-lg w-32 h-10 ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                                    placeholder="Unit (e.g., L, tCO2/L)"
                                    data-testid={`edit-unit-${field.fieldKey}`}
                                  />
                                )}
                                
                                {/* Non-supplier basis - use dropdown for units */}
                                {!isSupplierBasisUnitField && showUnitSelector && (
                                  <select
                                    value={dynamicFieldValues[`${field.variable}_unit`] || fieldUnits[0] || ''}
                                    onChange={(e) => {
                                      updateDynamicFieldValue(`${field.variable}_unit`, e.target.value);
                                      if (isQtyField) {
                                        setFormData(prev => ({ ...prev, quantity_unit: e.target.value }));
                                      }
                                    }}
                                    disabled={showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`]}
                                    className={`bg-stone-50 border border-stone-200 rounded-lg px-3 w-32 h-10 ${showOverrideCheckbox && !dynamicFieldValues[`override_${field.variable}`] ? 'opacity-50' : ''}`}
                                    data-testid={`edit-unit-${field.fieldKey}`}
                                  >
                                    {(() => {
                                      // Include saved unit in options if not already present
                                      const savedUnit = dynamicFieldValues[`${field.variable}_unit`];
                                      const allUnits = savedUnit && !fieldUnits.includes(savedUnit)
                                        ? [savedUnit, ...fieldUnits]
                                        : fieldUnits;
                                      return allUnits.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                      ));
                                    })()}
                                  </select>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Person Responsible fields below dynamic inputs */}
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="responsible_person">Person Responsible</Label>
                        <Input
                          id="responsible_person"
                          value={formData.responsible_person}
                          onChange={(e) => { setFormData({ ...formData, responsible_person: e.target.value }); markFormDirty(); }}
                          className="bg-stone-50 h-10"
                          placeholder="Name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="responsible_person_designation">Designation</Label>
                        <Input
                          id="responsible_person_designation"
                          value={formData.responsible_person_designation}
                          onChange={(e) => setFormData({ ...formData, responsible_person_designation: e.target.value })}
                          className="bg-stone-50 h-10"
                          placeholder="e.g., Environmental Manager"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="responsible_person_contact">Contact</Label>
                        <Input
                          id="responsible_person_contact"
                          value={formData.responsible_person_contact}
                          onChange={(e) => setFormData({ ...formData, responsible_person_contact: e.target.value })}
                          className="bg-stone-50 h-10"
                          placeholder="Email / Phone"
                        />
                      </div>
                    </div>
                  </div>
                ) : !isEditC7EmployeeCommuting ? (
                  /* LEGACY: Hardcoded fields when no dynamic config */
                  <div className="grid grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">
                      Quantity * {false && <span className="text-xs text-amber-600">(unit locked)</span>}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="quantity"
                        type="number"
                        step="any"
                        min="0"
                        value={formData.quantity}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || parseFloat(val) >= 0) {
                            setFormData({ ...formData, quantity: val });
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                        required
                        placeholder="Enter amount"
                        className="bg-stone-50 flex-1"
                        data-testid="quantity-input"
                      />
                      {false ? (
                        <div className="flex items-center h-10 bg-stone-100 border border-stone-200 rounded-lg px-3 w-40 text-stone-600">
                          <span>{getQuantityUnitFromEFUnit(formData.emission_factor_unit)}</span>
                        </div>
                      ) : (
                        <select
                          value={formData.quantity_unit}
                          onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                          className="bg-stone-50 border border-stone-200 rounded-lg px-3 w-40 h-10"
                          data-testid="quantity-unit-select"
                        >
                          {availableQuantityUnits.map(unit => (
                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
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
                      className="bg-stone-50 h-10"
                      placeholder="Name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible_person_designation">Designation</Label>
                    <Input
                      id="responsible_person_designation"
                      value={formData.responsible_person_designation}
                      onChange={(e) => setFormData({ ...formData, responsible_person_designation: e.target.value })}
                      className="bg-stone-50 h-10"
                      placeholder="e.g., Environmental Manager"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible_person_contact">Contact Details</Label>
                    <Input
                      id="responsible_person_contact"
                      value={formData.responsible_person_contact}
                      onChange={(e) => setFormData({ ...formData, responsible_person_contact: e.target.value })}
                      className="bg-stone-50 h-10"
                      placeholder="Email or phone number"
                    />
                  </div>
                </div>
                ) : null}

                {/* Override Options for Calorific Value and Density - Scope 1 and Biogenic, not for Fugitive Emissions */}
                {/* HIDDEN when using dynamic input fields (overrides are handled there) or loading */}
                {!editFormConfigLoading && dynamicInputFields.length === 0 && true && formData.fuel_id && formData.scope !== 'scope2' && !formData.category?.toLowerCase()?.includes('fugitive') && (
                  <div className="p-4 bg-stone-50 rounded-lg border border-stone-200 space-y-4">
                    {/* Calorific Value Override */}
                    <div>
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
                              step="any"
                              min="0"
                              data-testid="calorific-value-input"
                              value={formData.calorific_value}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || parseFloat(val) >= 0) {
                                  setFormData({ ...formData, calorific_value: val });
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                              placeholder="Enter value"
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
                        <div className="ml-[216px] mt-2">
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
                      <div className="mt-4">
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
                                step="any"
                                min="0"
                                data-testid="density-input"
                                value={formData.density}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseFloat(val) >= 0) {
                                    setFormData({ ...formData, density: val });
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === '-') e.preventDefault(); }}
                                placeholder="Enter value"
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
                          <div className="ml-[216px] mt-2">
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

                    {/* Custom CO2 Emission Factor (Heat Basis) Override - HIDDEN per user request */}
                    {/* This field is hidden but functionality preserved for existing data */}
                    
                    {/* Override Justification - Mandatory when ANY override is enabled (#17) */}
                    {(overrideCalorificValue || overrideDensity || overrideEmissionFactorHeat) && (
                      <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <Label className="text-amber-800 font-medium flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4" />
                          Override Justification *
                        </Label>
                        <p className="text-xs text-amber-700 mb-2">
                          Explain why the default property/emission factor was overridden. This is required for audit compliance.
                        </p>
                        <Textarea
                          value={overrideJustification}
                          onChange={(e) => setOverrideJustification(e.target.value)}
                          placeholder="Enter justification for overriding default values (minimum 20 characters)..."
                          className="bg-white min-h-[80px]"
                          required
                          data-testid="override-justification-textarea"
                        />
                        {overrideJustification.length > 0 && overrideJustification.length < 20 && (
                          <p className="text-xs text-red-600 mt-1">
                            Justification must be at least 20 characters ({20 - overrideJustification.length} more needed)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Calculated Emissions Display - Shows only final values */}
                {effectiveCalculatedEmissions && true && (
                  <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-text-secondary">Calculated Emissions</span>
                      {isCalculating && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Updating...
                        </span>
                      )}
                      <span className="text-xs text-stone-400 ml-auto">(Values rounded to 4 decimal places)</span>
                    </div>
                    
                    {/* For Scope 3 and Biogenic Scope 3, show full-width CO2e Summary Banner (#18) */}
                    {(formData.scope === 'scope3' || (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3')) ? (
                      <div className="w-full p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          {/* Main Emission Value */}
                          <div className="flex items-center gap-6">
                            <div>
                              <p className="text-xs font-medium text-primary/70 uppercase tracking-wide mb-1">Total CO₂e Emissions</p>
                              <p className="text-3xl font-bold text-primary">
                                {(effectiveCalculatedEmissions.co2eEmissions ?? 0).toFixed(4)}
                                <span className="text-lg font-normal ml-2 text-primary/80">
                                  {effectiveCalculatedEmissions.co2eOutputUnit || 'tCO₂e'}
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3">
                        {/* CO2 Emissions */}
                        <div className="bg-white/70 p-3 rounded-lg border border-red-100">
                          <p className="text-xs text-red-600 font-medium mb-1">CO₂ Emissions</p>
                          <p className="text-lg font-bold text-red-700">
                            {(effectiveCalculatedEmissions.co2Emissions ?? 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-red-500">{effectiveCalculatedEmissions.co2OutputUnit || 'tCO2'}</p>
                        </div>
                        
                        {/* CH4 Emissions */}
                        <div className="bg-white/70 p-3 rounded-lg border border-orange-100">
                          <p className="text-xs text-orange-600 font-medium mb-1">CH₄ Emissions</p>
                          <p className="text-lg font-bold text-orange-700">
                            {(effectiveCalculatedEmissions.ch4Emissions ?? 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-orange-500">{effectiveCalculatedEmissions.ch4OutputUnit || 'tCH4'}</p>
                        </div>
                        
                        {/* N2O Emissions */}
                        <div className="bg-white/70 p-3 rounded-lg border border-amber-100">
                          <p className="text-xs text-amber-600 font-medium mb-1">N₂O Emissions</p>
                          <p className="text-lg font-bold text-amber-700">
                            {(effectiveCalculatedEmissions.n2oEmissions ?? 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-amber-500">{effectiveCalculatedEmissions.n2oOutputUnit || 'tN2O'}</p>
                        </div>
                        
                        {/* CO2e Total */}
                        <div className="p-3 rounded-lg border bg-primary/10 border-primary/30">
                          <p className="text-xs font-medium mb-1 text-primary">CO₂e Total</p>
                          <p className="text-lg font-bold text-primary">
                            {(effectiveCalculatedEmissions.co2eEmissions ?? 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-primary/70">{effectiveCalculatedEmissions.co2eOutputUnit || 'tCO2e'}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Detailed Formula Breakdown */}
                    {effectiveCalculatedEmissions && (
                      <div className="mt-4 pt-4 border-t border-primary/20">
                        <p className="text-xs font-medium text-text-muted mb-2">Calculation Details</p>
                        
                        {/* Backend Calc Engine Audit Log (new format with labels) */}
                        {effectiveCalculatedEmissions.auditLog && effectiveCalculatedEmissions.auditLog.length > 0 ? (
                          <div className="bg-white/50 p-3 rounded text-xs space-y-2">
                            {effectiveCalculatedEmissions.auditLog.map((entry, i) => {
                              if (entry.step === 'input') {
                                // Only show conversion for quantity fields (qty, qty_energy), not for emission factors
                                const isQuantityInput = entry.variable === 'qty' || entry.variable === 'qty_energy';
                                let hasTransformation = false;
                                let finalConvert = null;
                                
                                if (isQuantityInput) {
                                  // Find the final converted value - look for the last convert step that outputs to kg
                                  const convertEntries = effectiveCalculatedEmissions.auditLog.filter(e => e.step === 'convert');
                                  // Find the convert step that has the final mass value (in kg)
                                  finalConvert = convertEntries.find(e => 
                                    e.output?.unit === 'kg' && e.output?.value !== entry.value
                                  );
                                  hasTransformation = finalConvert && 
                                    (finalConvert.output.value !== entry.value || finalConvert.output.unit !== entry.unit);
                                }
                                
                                return (
                                  <div key={i} className="p-2 bg-stone-50 rounded border border-stone-200">
                                    <span className="font-medium text-stone-700">Input:</span>{' '}
                                    <span className="text-blue-700">{entry.variable_label || entry.variable}</span>
                                    {' = '}{entry.value} {entry.unit}
                                    {hasTransformation && finalConvert && (
                                      <span className="text-emerald-600 ml-2">
                                        → {finalConvert.output.value.toFixed(2)} {finalConvert.output.unit}
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              if (entry.step === 'resolve_property') {
                                // Hide unit "1" for unitless properties (like GWP)
                                const displayUnit = entry.unit === '1' ? '' : entry.unit;
                                const sourceName = entry.source_name || entry.source || '';
                                return (
                                  <div key={i} className="p-2 bg-amber-50 rounded border border-amber-200">
                                    <span className="text-amber-800 font-medium">{entry.property_label || entry.property}</span>
                                    {' = '}{typeof entry.value === 'number' ? entry.value.toFixed(6) : entry.value}{displayUnit && ` ${displayUnit}`}
                                    {sourceName && (
                                      <span className="text-amber-600 text-xs ml-2">(Source - {sourceName})</span>
                                    )}
                                  </div>
                                );
                              }
                              // Skip transformation.apply, convert, and validate_formula steps - they're internal details
                              if (entry.step === 'transformation.apply' || entry.step === 'convert' || entry.step === 'validate_formula') {
                                return null;
                              }
                              if (entry.step === 'formula_step') {
                                const isOutput = ['co2', 'ch4', 'n2o', 'co2e'].includes(entry.name?.toLowerCase());
                                return (
                                  <div key={i} className={`p-2 rounded border ${isOutput ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
                                    <span className={`font-medium ${isOutput ? 'text-emerald-700' : 'text-blue-700'}`}>
                                      {entry.name?.toUpperCase()}:
                                    </span>{' '}
                                    <span className={isOutput ? 'text-emerald-800' : 'text-blue-800'}>
                                      {entry.expression_readable || entry.expression}
                                    </span>
                                    <div className={`font-semibold mt-1 ${isOutput ? 'text-emerald-700' : 'text-blue-700'}`}>
                                      = {typeof entry.output === 'number' ? entry.output.toFixed(6) : entry.output}
                                    </div>
                                  </div>
                                );
                              }
                              if (entry.step === 'outputs') {
                                return (
                                  <div key={i} className="p-2 bg-emerald-100 rounded border border-emerald-300">
                                    <span className="font-bold text-emerald-800">Final Outputs:</span>
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                      {Object.entries(entry.outputs || {}).map(([key, val]) => (
                                        <div key={key} className="text-emerald-700">
                                          <span className="font-medium">{key.toUpperCase()}:</span>{' '}
                                          {val.value?.toFixed(6)} {val.unit}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence Management Section */}
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
                                    // Use fetch + blob for proper download
                                    await downloadFileHelper(`${BACKEND_URL}/api/files/${fileId}/download`, evidence.filename || `Evidence-${idx + 1}`);
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
                    multiple={true}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => { setFormData({ ...formData, notes: e.target.value }); markFormDirty(); }}
                    rows={2}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-primary hover:bg-primary/90 text-white"
                    disabled={isCalculating}
                  >
                    {isCalculating ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Calculating...
                      </>
                    ) : (
                      `${editingEmission ? 'Update' : 'Add'} Emission`
                    )}
                  </Button>
                </div>
              </form>
                  );
                })()
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
            {/* First row: Facility, Category, and Entry Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div className="space-y-2">
                <Label>Entry Type</Label>
                <select
                  value={filterFrequency}
                  onChange={(e) => setFilterFrequency(e.target.value)}
                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 text-sm"
                  data-testid="filter-frequency-select"
                >
                  <option value="">All Entries</option>
                  <option value="monthly">Monthly Only</option>
                  <option value="yearly">Yearly Only</option>
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
                  <option value="updated_at">Last Updated</option>
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
                    setFilterFrequency('');
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

      <Tabs value={activeScope} onValueChange={(value) => { 
        // Only allow scope3 tab if org has access
        const isScope3 = value === 'scope3';
        if (isScope3 && !hasScope3Access) return;
        setActiveScope(value);
        // Reset category filter when changing scopes to prevent showing no emissions
        setFilterCategory('');
        // Reset biogenic state when changing tabs
        if (value !== 'biogenic') {
          setBiogenicScopeSelection('');
        }
      }} className="w-full">
        <TabsList className="grid w-full max-w-2xl" style={{ gridTemplateColumns: `repeat(${Math.max(dynamicScopes.length, 1)}, minmax(0, 1fr))` }}>
          {dynamicScopes.map(s => {
            const isScope3 = s.code === 'scope3';
            const isDisabled = isScope3 && !hasScope3Access;
            return (
              <TabsTrigger
                key={s.code}
                value={s.code}
                disabled={isDisabled}
                className={isDisabled ? 'relative cursor-not-allowed opacity-60 text-stone-400' : ''}
                data-testid={`scope-tab-${s.code}`}
              >
                {s.name}
                {isDisabled && (
                  <span className="absolute -top-2 -right-2 z-10 px-1.5 py-0.5 bg-stone-200 text-stone-600 text-[9px] font-semibold rounded whitespace-nowrap">
                    Not Available
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeScope} className="mt-6">
          {/* Enterprise Data Grid Layout */}
          <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
            {/* Fixed Header Row */}
            <div className="bg-stone-50 border-b border-stone-200 px-4 py-3 sticky top-0 z-10">
              <div className="flex items-center gap-3 text-xs font-semibold text-stone-600 uppercase tracking-wider">
                {/* Scope 3 Headers */}
                {activeScope === 'scope3' && (
                  <>
                    <div className="w-36 flex-shrink-0">Facility</div>
                    <div className="w-24 flex-shrink-0">Period</div>
                    <div className="w-52 flex-shrink-0">Category</div>
                    <div className="flex-1 min-w-[120px] pl-2">Activity</div>
                    <div className="w-20 flex-shrink-0 text-center">Method</div>
                    <div className="w-28 flex-shrink-0 text-right normal-case">tCO₂e</div>
                    <div className="w-28 flex-shrink-0 text-center">Actions</div>
                  </>
                )}
                {/* Scope 1 & 2 Headers */}
                {(activeScope === 'scope1' || activeScope === 'scope2') && (
                  <>
                    <div className="w-36 flex-shrink-0">Facility</div>
                    <div className="w-24 flex-shrink-0">Period</div>
                    <div className="w-44 flex-shrink-0">Category</div>
                    <div className="flex-1 min-w-[140px]">Sub-category</div>
                    <div className="w-32 flex-shrink-0 text-right">Quantity</div>
                    <div className="w-28 flex-shrink-0 text-right normal-case">tCO₂e</div>
                    <div className="w-28 flex-shrink-0 text-center">Actions</div>
                  </>
                )}
                {/* Biogenic Headers */}
                {activeScope === 'biogenic' && (
                  <>
                    <div className="w-36 flex-shrink-0">Facility</div>
                    <div className="w-24 flex-shrink-0">Period</div>
                    <div className="w-20 flex-shrink-0">Type</div>
                    <div className="w-36 flex-shrink-0">Category</div>
                    <div className="flex-1 min-w-[120px]">Activity / Fuel</div>
                    <div className="w-20 flex-shrink-0 text-center">Method</div>
                    <div className="w-28 flex-shrink-0 text-right normal-case">tCO₂e</div>
                    <div className="w-28 flex-shrink-0 text-center">Actions</div>
                  </>
                )}
              </div>
            </div>
            
            {/* Data Rows */}
            <div className="divide-y divide-stone-100">
              {filteredEmissions.map((emission) => {
                const facility = facilities.find(f => f.id === emission.facility_id);
                const dfv = emission.dynamic_field_values || {};
                const hasOverride = Object.values(dfv).some(field => field?.is_override === true);
                const calcMethod = emission.calculation_method_scope3 || dfv.calculation_method_scope3;
                const totalEmissions = emission.outputs?.co2e?.value || emission.co2e_emissions || emission.total_emissions || 0;
                
                // Get activity/sub-category display
                // For Scope 3 OR Biogenic Scope 3, look up the activity label using scope3_ef_id
                let activityDisplay = '-';
                const isBiogenicScope3 = emission.scope === 'biogenic' && 
                  (emission.biogenic_scope_selection === 'scope3' || dfv.biogenic_scope_selection?.value === 'scope3');
                
                if (emission.scope === 'scope3' || isBiogenicScope3) {
                  // First try to find the label by scope3_ef_id
                  if (emission.scope3_ef_id) {
                    const matchedEf = filteredScope3Activities.find(a => a.id === emission.scope3_ef_id);
                    if (matchedEf) {
                      activityDisplay = matchedEf.activity || matchedEf.fuel_name || emission.scope3_activity || '-';
                    } else {
                      // Fallback to stored scope3_activity if no match found
                      activityDisplay = emission.scope3_activity || dfv.scope3_activity || emission.sub_category || '-';
                    }
                  } else {
                    // No scope3_ef_id - use scope3_activity (common for supplier_basis with custom activity)
                    activityDisplay = emission.scope3_activity || dfv.scope3_activity || emission.sub_category || '-';
                  }
                } else {
                  activityDisplay = emission.sub_category || emission.fuel_type || '-';
                }
                
                // Get calculation method display using centralized labels
                const methodDisplay = getMethodLabel(calcMethod, true);
                
                // Get quantity display for Scope 1/2
                const getQuantityDisplay = () => {
                  let qtyField = dfv.qty || dfv.qty_energy;
                  if (qtyField?.value !== null && qtyField?.value !== undefined) {
                    return `${qtyField.value} ${qtyField.unit || 'kg'}`;
                  }
                  return `${emission.quantity || 0} ${emission.quantity_unit || 'kg'}`;
                };
                
                // Extract year from reporting period
                const reportingYear = emission.reporting_period?.match(/\d{4}/)?.[0] || emission.reporting_year || '-';
                
                // Biogenic scope type
                const biogenicScope = emission.biogenic_scope_selection || 
                  (dfv.biogenic_scope_selection?.value) || 
                  (emission.scope === 'biogenic' ? 'Direct' : '-');
                
                return (
                  <div 
                    key={emission.id}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-green-50/50 transition-colors cursor-pointer group"
                    data-testid={`emission-row-${emission.id}`}
                  >
                    {/* Scope 3 Row */}
                    {activeScope === 'scope3' && (
                      <>
                        <div className="w-36 flex-shrink-0">
                          <p className="text-sm font-medium text-text-primary truncate" title={facility?.name}>
                            {facility?.name || 'Unknown'}
                          </p>
                        </div>
                        <div className="w-24 flex-shrink-0 text-sm text-text-secondary truncate flex items-center gap-1" title={emission.reporting_period}>
                          {emission.reporting_period || reportingYear}
                        </div>
                        <div className="w-52 flex-shrink-0">
                          <p className="text-sm text-text-primary truncate" title={emission.category}>
                            {emission.category}
                          </p>
                        </div>
                        <div className="flex-1 min-w-[120px] pl-2 flex items-center gap-2">
                          <p className="text-sm text-text-primary truncate" title={activityDisplay}>
                            {activityDisplay}
                          </p>
                          {hasOverride && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                              Custom
                            </span>
                          )}
                          {emission.evidence_url && (
                            <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                          )}
                        </div>
                        <div className="w-20 flex-shrink-0 text-center">
                          <span className="inline-flex px-2 py-0.5 bg-stone-100 text-stone-700 text-xs font-medium rounded">
                            {methodDisplay}
                          </span>
                        </div>
                        <div className="w-28 flex-shrink-0 text-right">
                          <span className="text-sm font-semibold text-primary">
                            {totalEmissions.toFixed(4)}
                          </span>
                        </div>
                      </>
                    )}
                    
                    {/* Scope 1 & 2 Row */}
                    {(activeScope === 'scope1' || activeScope === 'scope2') && (
                      <>
                        <div className="w-36 flex-shrink-0">
                          <p className="text-sm font-medium text-text-primary truncate" title={facility?.name}>
                            {facility?.name || 'Unknown'}
                          </p>
                        </div>
                        <div className="w-24 flex-shrink-0 text-sm text-text-secondary truncate flex items-center gap-1" title={emission.reporting_period}>
                          {emission.reporting_period || reportingYear}
                        </div>
                        <div className="w-44 flex-shrink-0">
                          <p className="text-sm text-text-primary truncate" title={emission.category}>
                            {emission.category}
                          </p>
                        </div>
                        <div className="flex-1 min-w-[140px] flex items-center gap-2">
                          <p className="text-sm text-text-primary truncate" title={activityDisplay}>
                            {activityDisplay}
                          </p>
                          {hasOverride && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                              Custom
                            </span>
                          )}
                          {emission.evidence_url && (
                            <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                          )}
                        </div>
                        <div className="w-32 flex-shrink-0 text-right text-sm text-text-secondary">
                          {getQuantityDisplay()}
                        </div>
                        <div className="w-28 flex-shrink-0 text-right">
                          <span className="text-sm font-semibold text-primary">
                            {totalEmissions.toFixed(4)}
                          </span>
                        </div>
                      </>
                    )}
                    
                    {/* Biogenic Row */}
                    {activeScope === 'biogenic' && (
                      <>
                        <div className="w-36 flex-shrink-0">
                          <p className="text-sm font-medium text-text-primary truncate" title={facility?.name}>
                            {facility?.name || 'Unknown'}
                          </p>
                        </div>
                        <div className="w-24 flex-shrink-0 text-sm text-text-secondary truncate flex items-center gap-1" title={emission.reporting_period}>
                          {emission.reporting_period || reportingYear}
                        </div>
                        <div className="w-20 flex-shrink-0">
                          <span className="inline-flex px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                            {biogenicScope === 'scope1' ? 'Direct' : biogenicScope === 'scope3' ? 'Indirect' : biogenicScope}
                          </span>
                        </div>
                        <div className="w-36 flex-shrink-0">
                          <p className="text-sm text-text-primary truncate" title={emission.category}>
                            {emission.category}
                          </p>
                        </div>
                        <div className="flex-1 min-w-[120px] flex items-center gap-2">
                          <p className="text-sm text-text-primary truncate" title={
                            biogenicScope === 'scope3' 
                              ? activityDisplay 
                              : (emission.fuel_type || emission.sub_category || activityDisplay || '-')
                          }>
                            {biogenicScope === 'scope3' 
                              ? activityDisplay 
                              : (emission.fuel_type || emission.sub_category || activityDisplay || '-')}
                          </p>
                          {hasOverride && (
                            <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 text-[9px] font-semibold rounded flex-shrink-0">
                              Custom
                            </span>
                          )}
                          {emission.evidence_url && (
                            <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Has Evidence" />
                          )}
                        </div>
                        <div className="w-20 flex-shrink-0 text-center">
                          {biogenicScope === 'scope3' ? (
                            <span className="inline-flex px-2 py-0.5 bg-stone-100 text-stone-700 text-xs font-medium rounded">
                              {methodDisplay}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">-</span>
                          )}
                        </div>
                        <div className="w-28 flex-shrink-0 text-right">
                          <span className="text-sm font-semibold text-primary">
                            {totalEmissions.toFixed(4)}
                          </span>
                        </div>
                      </>
                    )}
                    
                    {/* Action Buttons - Common for all scopes */}
                    <div className="w-28 flex-shrink-0 flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); handleEdit(emission); }}
                        title="Edit"
                        className="h-7 w-7 p-0"
                        data-testid={`edit-emission-${emission.id}`}
                      >
                        <Edit className="w-3.5 h-3.5 text-stone-600" />
                      </Button>
                      {!isRegularUser && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); fetchHistory(emission.id); }}
                          title="History"
                          className="h-7 w-7 p-0"
                          data-testid={`history-emission-${emission.id}`}
                        >
                          <History className="w-3.5 h-3.5 text-stone-600" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); openDeleteConfirm(emission); }}
                        title="Delete"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        data-testid={`delete-emission-${emission.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Empty State */}
            {filteredEmissions.length === 0 && (
              <div className="text-center py-12 border-t border-stone-100">
                <Activity className="w-16 h-16 mx-auto text-text-muted mb-4" />
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  No {activeScope === 'biogenic' ? 'Biogenic' : `Scope ${activeScope.slice(-1)}`} emissions
                </h3>
                <p className="text-text-secondary mb-4">
                  {showFilters && (filterFacility || filterDateRange.from || filterDateRange.to || filterCategory || filterFrequency) 
                    ? 'Try adjusting your filters' 
                    : 'Add your first emission record'}
                </p>
              </div>
            )}
          </div>

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
                  
                  // Field label mapping for better display
                  const fieldLabelMap = {
                    'quantity': 'Quantity',
                    'quantity_unit': 'Unit',
                    'category': 'Category',
                    'sub_category': 'Activity',
                    'subcategory': 'Sub Category',
                    'activity_name': 'Activity',
                    'fuel_type': 'Fuel Type',
                    'fuel_name': 'Fuel Name',
                    'scope': 'Scope',
                    'reporting_period': 'Reporting Period',
                    'reporting_year': 'Reporting Year',
                    'responsible_person': 'Person Responsible',
                    'process_names': 'Process Names',
                    'notes': 'Notes',
                    'total_emissions': 'Total Emissions (tCO₂e)',
                    'co2_emissions': 'CO₂ Emissions',
                    'ch4_emissions': 'CH₄ Emissions',
                    'n2o_emissions': 'N₂O Emissions',
                    'co2e_emissions': 'CO₂e Emissions',
                    'activity': 'Activity',
                    'scope3_activity': 'Scope 3 Activity',
                    'scope3_activity_type': 'Activity Type',
                    'calculation_method_scope3': 'Calculation Method',
                    'emission_factor': 'Emission Factor',
                    'ef_unit': 'EF Unit',
                    'ef_source': 'EF Source',
                    'supplier_name': 'Supplier Name',
                    'supplier_code': 'Supplier Code',
                    'distance_travelled': 'Distance Travelled',
                    'employees': 'Employees',
                    'monthly_totals': 'Monthly Totals',
                    'monthly_total': 'Monthly Total',
                    'yearly_total': 'Yearly Total',
                    'dynamic_field_values': 'Input Values',
                    'input_values': 'Input Values',
                    'inputs': 'Inputs',
                    'outputs': 'Outputs',
                    'evidence': 'Evidence',
                    'evidence_url': 'Evidence',
                    // Location fields
                    'from_location': 'From Location',
                    'to_location': 'To Location',
                    // Customer fields (C9)
                    'customer_name': 'Customer Name',
                    'customer_code': 'Customer Code',
                    // Asset fields
                    'asset_name': 'Asset Name',
                    // Employee-specific fields (C6/C7)
                    'employee_name': 'Employee Name',
                    'employee_id': 'Employee ID',
                    'employee_code': 'Employee Code',
                    'employee_added': 'Employee Added',
                    'employee_removed': 'Employee Removed',
                    'employee_department': 'Employee Department',
                    'employee_activity_type': 'Employee Activity Type',
                    'employee_from_location': 'Employee From Location',
                    'employee_to_location': 'Employee To Location',
                    'employee_distance': 'Employee Distance',
                    'employee_working_days': 'Employee Working Days',
                    'employee_working_hours': 'Employee Working Hours',
                    'employee_days_travelled': 'Employee Days Travelled',
                    'employee_nights_stayed': 'Employee Nights Stayed',
                    'employee_rooms_taken': 'Employee Rooms Taken',
                    'employee_no_of_employees': 'Employee Count',
                    // Travel fields
                    'nights_stayed': 'Nights Stayed',
                    'rooms_taken': 'Rooms Taken',
                  };
                  
                  // Helper to format value for display - with proper nested object expansion
                  const formatValue = (val, depth = 0) => {
                    if (val === null || val === undefined) return '(empty)';
                    if (typeof val === 'number') return val.toFixed(4);
                    if (typeof val === 'string') return val || '(empty)';
                    if (Array.isArray(val)) {
                      if (val.length === 0) return '(empty)';
                      // For arrays of primitives, join them
                      if (val.every(v => typeof v !== 'object' || v === null)) {
                        return val.filter(v => v !== null && v !== undefined).join(', ');
                      }
                      // For arrays of objects (like employees), show count
                      return `${val.length} item(s)`;
                    }
                    if (typeof val === 'object') {
                      // Skip internal fields
                      const skipKeys = [
                        'scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                        'co2', 'ch4', 'n2o', 'ppp', 'inflation_rate', 'scope3_subcategory', 'scope3_activity_type',
                        'scope3_activity', 'biogenic_scope_selection'
                      ];
                      const keys = Object.keys(val).filter(k => !skipKeys.includes(k));
                      if (keys.length === 0) return '(empty)';
                      
                      // For nested objects, expand key-value pairs nicely
                      const entries = keys
                        .filter(k => val[k] !== null && val[k] !== undefined && val[k] !== '')
                        .map(k => {
                          const v = val[k];
                          // Handle nested objects (like {value: 100, unit: 'kg'})
                          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                            if (v.value !== undefined && v.unit !== undefined) {
                              return `${k}: ${v.value} ${v.unit}`;
                            }
                            return `${k}: ${JSON.stringify(v)}`;
                          }
                          if (typeof v === 'number') return `${k}: ${v.toFixed ? v.toFixed(4) : v}`;
                          return `${k}: ${v}`;
                        });
                      
                      return entries.join(', ') || '(empty)';
                    }
                    return String(val) || '(empty)';
                  };
                  
                  // Render complex value with expandable view
                  const renderValue = (val, label, field) => {
                    if (val === null || val === undefined) return <span className="text-stone-400">(empty)</span>;
                    
                    // Handle evidence field specially
                    if (field === 'evidence') {
                      return <span className="font-medium">{val}</span>;
                    }
                    
                    // Handle calculation_method_scope3 - show readable name instead of NaN
                    if (field === 'calculation_method_scope3') {
                      const methodNames = {
                        'spend_based': 'Spend Based',
                        'average_data': 'Average Data',
                        'supplier_basis': 'Supplier Basis',
                        'distance_based': 'Distance Based',
                        'fuel_based': 'Fuel Based',
                        'asset_based': 'Asset Based',
                        'lessor_based': 'Lessor Based',
                        'lessee_based': 'Lessee Based',
                        'investment_based': 'Investment Based',
                        'equity_based': 'Equity Based'
                      };
                      const displayVal = methodNames[val] || val || '(not set)';
                      return <span className="font-medium">{displayVal}</span>;
                    }
                    
                    // Handle sub_category for Scope 3 (shows activity name)
                    if (field === 'sub_category' || field === 'scope3_activity') {
                      return <span className="font-medium">{val || '(not set)'}</span>;
                    }
                    
                    // For Outputs, only show co2e (not individual gases for Scope 3)
                    if (label === 'Outputs' && typeof val === 'object') {
                      const co2eVal = val.co2e;
                      if (co2eVal) {
                        const displayVal = typeof co2eVal === 'object' && co2eVal.value !== undefined
                          ? `${Number(co2eVal.value).toFixed(6)} ${co2eVal.unit || 'tCO₂e'}`
                          : `${Number(co2eVal).toFixed(6)} tCO₂e`;
                        return <span className="font-medium">{displayVal}</span>;
                      }
                    }
                    
                    // Handle input_values (dynamic_field_values with only changed fields)
                    if (field === 'input_values' && typeof val === 'object') {
                      const keys = Object.keys(val).filter(k => 
                        val[k]?.value !== null && val[k]?.value !== undefined && val[k]?.value !== ''
                      );
                      if (keys.length === 0) return <span className="text-stone-400">(empty)</span>;
                      
                      const fieldLabelMap = {
                        'qty': 'Quantity',
                        'cv': 'Calorific Value',
                        'density': 'Density',
                        'ef': 'Emission Factor',
                        'ef_heat': 'EF (Heat Basis)',
                        'activity_value': 'Activity Value',
                        'spent_value': 'Spent Value',
                        'calculation_method_scope3': 'Calculation Method'
                      };
                      
                      return (
                        <div className="text-xs space-y-0.5">
                          {keys.map(k => {
                            const v = val[k];
                            if (!v || v.value === null || v.value === undefined) return null;
                            
                            // Format with full precision (up to 10 decimal places, trimmed)
                            const numVal = Number(v.value);
                            const displayVal = !isNaN(numVal) 
                              ? `${numVal.toFixed(10).replace(/\.?0+$/, '')}${v.unit ? ' ' + v.unit : ''}`
                              : String(v.value);
                            
                            return (
                              <div key={k} className="flex gap-1">
                                <span className="text-stone-500 capitalize">{fieldLabelMap[k] || k.replace(/_/g, ' ')}:</span>
                                <span className="font-medium">{displayVal}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    
                    // Check if it's a complex object that needs special rendering
                    if (typeof val === 'object' && !Array.isArray(val)) {
                      // Fields to skip in version history display (internal IDs and redundant fields)
                      const skipKeys = [
                        'scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                        'co2', 'ch4', 'n2o', 'ppp', 'inflation_rate', 'scope3_subcategory', 'scope3_activity_type',
                        'scope3_activity', 'biogenic_scope_selection'
                      ];
                      
                      const keys = Object.keys(val).filter(k => !skipKeys.includes(k) && !k.startsWith('override_'));
                      if (keys.length > 0) {
                        return (
                          <div className="text-xs space-y-0.5">
                            {keys.slice(0, 8).map(k => {
                              const v = val[k];
                              if (v === null || v === undefined || v === '') return null;
                              
                              // Format value based on type - use full precision
                              let displayVal = v;
                              if (typeof v === 'object' && v !== null) {
                                if (v.value !== undefined) {
                                  const numVal = Number(v.value);
                                  displayVal = !isNaN(numVal)
                                    ? `${numVal.toFixed(10).replace(/\.?0+$/, '')}${v.unit ? ' ' + v.unit : ''}`
                                    : String(v.value);
                                } else {
                                  displayVal = JSON.stringify(v);
                                }
                              } else if (typeof v === 'number') {
                                displayVal = v.toFixed(10).replace(/\.?0+$/, '');
                              }
                              
                              return (
                                <div key={k} className="flex gap-1">
                                  <span className="text-stone-500 capitalize">{k.replace(/_/g, ' ')}:</span>
                                  <span className="font-medium">{displayVal}</span>
                                </div>
                              );
                            })}
                            {keys.length > 8 && (
                              <span className="text-stone-400">+{keys.length - 8} more...</span>
                            )}
                          </div>
                        );
                      }
                      return <span className="text-stone-400">(empty)</span>;
                    }
                    
                    // For simple values - use full precision for numbers
                    if (typeof val === 'number') {
                      return <span>{val.toFixed(10).replace(/\.?0+$/, '')}</span>;
                    }
                    return <span>{formatValue(val)}</span>;
                  };
                  
                  // Use field_changes from backend if available (new format), otherwise compute manually
                  let changedFields = [];
                  
                  // Fields to skip in version history (internal IDs, metadata, individual gases for Scope 3)
                  const skipFields = [
                    'scope3_ef_id', 'ef_id', 'formula_id', 'id', '_id', 'matched_formula_id',
                    'scope3_subcategory', 'scope3_activity_type', 'ppp', 'inflation_rate',
                    'scope3_activity', 'biogenic_scope_selection',
                    // Skip CO₂e emissions for Scope 3 (redundant with total_emissions)
                    'co2e_emissions'
                  ];
                  
                  if (history.field_changes && history.field_changes.length > 0) {
                    // New format: backend provides field_changes array
                    changedFields = history.field_changes
                      .filter(fc => !skipFields.includes(fc.field))
                      .map(fc => ({
                        label: fieldLabelMap[fc.field] || fc.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        oldValue: fc.old_value,
                        newValue: fc.new_value,
                        field: fc.field,
                        isComplex: typeof fc.old_value === 'object' || typeof fc.new_value === 'object'
                      }));
                  } else if (!isCreation && oldValues && newValues) {
                    // Fallback: Legacy format - compute from old_values/new_values
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
                      { key: 'calculation_method_scope3', label: 'Calculation Method' },
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
                      
                      if ((oldVal === null || oldVal === undefined) && (newVal === null || newVal === undefined)) {
                        return;
                      }
                      
                      const oldStr = formatValue(oldVal);
                      const newStr = formatValue(newVal);
                      
                      if (oldStr === newStr) return;
                      
                      // Store raw values for proper rendering
                      changedFields.push({ 
                        label, 
                        oldValue: oldVal, 
                        newValue: newVal, 
                        field: key,
                        isComplex: typeof oldVal === 'object' || typeof newVal === 'object'
                      });
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
                              idx === 0 ? 'bg-blue-100 text-blue-700' : 
                              idx === selectedEmissionHistory.length - 1 ? 'bg-green-100 text-green-700' : 'bg-stone-100'
                            }`}>
                              {idx === 0 ? 'Latest' : idx === selectedEmissionHistory.length - 1 ? 'Initial' : ''}
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
                                        <span className="text-xs text-red-600 font-medium block mb-1">Old Value</span>
                                        <div className="text-red-800 break-words">
                                          {renderValue(field.oldValue, field.label, field.field)}
                                        </div>
                                      </div>
                                      <div className="bg-green-50 p-2 rounded border border-green-100">
                                        <span className="text-xs text-green-600 font-medium block mb-1">New Value</span>
                                        <div className="text-green-800 break-words">
                                          {renderValue(field.newValue, field.label, field.field)}
                                        </div>
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
      
      {/* Unsaved Changes Confirmation Dialog (#19) */}
      <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleContinueEditing}>
              Continue Editing
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDiscardChanges}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
