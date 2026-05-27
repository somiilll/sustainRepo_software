import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import EmissionFilters from './emissions/EmissionFilters';
import { FacilityScopeSection, BiogenicScopeSection, CategorySection, Scope3MethodSection, ResponsiblePersonSection, ProcessNamesSection, NotesSection, SubmitButtonSection } from './emissions/EditFormSections';
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
import {
  unitsMatch as unitsMatchShared,
  isVolumeUnit as isVolumeUnitShared,
  getConversionFactor as getConversionFactorShared,
  hasConversionDefined as hasConversionDefinedShared,
} from './emissions/utils/units';
import useEvidenceManagement from './emissions/useEvidenceManagement';
import { persistCalcAuditLog as persistCalcAuditLogShared } from './emissions/utils/persistCalcAuditLog';
import { editEmissionDispatch as editEmissionDispatchShared } from './emissions/utils/editEmissionDispatch';
import { categoryRegistry } from '../modules/emissions';
import EmissionHistoryDialog from './emissions/components/EmissionHistoryDialog';
import EmissionDataGrid from './emissions/components/EmissionDataGrid';
import {CALCULATION_METHODS_LABELS} from '../constants/calculation-methods'

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Static help text shown next to specific dynamic field labels in the Edit
// dialog. Keyed by `field.variable` so it matches regardless of label
// phrasing across categories.
const FIELD_HELP = {
  inflation_rate:
    'Adjusts values to match the EF publication year. If left empty, system defaults will apply. Enter 1 to turn off inflation adjustment.',
  ppp:
    'Accounts for country-specific purchasing power differences. If left empty, system defaults will be used. To disable this adjustment, input the USD/INR exchange rate for the reporting period.',
};

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
  // Drive the active scope from the route so /ghg/scope1, /ghg/scope2, etc.
  // each show only their own scope. Clicking a tab still works (in-page nav).
  const location = useLocation();
  const navigate = useNavigate();
  const pathScope = (location.pathname.match(/\/ghg\/(scope[123]|biogenic)/) || [])[1] || null;
  const [activeScope, setActiveScope] = useState(pathScope || 'scope1');
  useEffect(() => {
    if (pathScope && pathScope !== activeScope) setActiveScope(pathScope);
  }, [pathScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filterFacility, setFilterFacility] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFrequency, setFilterFrequency] = useState(''); // 'monthly', 'yearly', or '' for all
  const [filterCalculationMethod, setFilterCalculationMethod] = useState(''); // 'activity_basis', 'spend_basis', 'supplier_basis', or '' for all
  const [filterDateRange, setFilterDateRange] = useState({ from: null, to: null });
  const [searchQuery, setSearchQuery] = useState(''); // Search query for emissions
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('created_at'); // Sort options: date, facility, fuel, emissions
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
  const [typeOfProduct, setTypeOfProduct] = useState(''); // C11 only — continuous_usage / one_time_use
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
        
        const response = await axios.get(url, { headers: getAuthHeader() });
        setEditFormConfig(response.data);
      } catch (err) {
        console.error('[EDIT FORM CONFIG] Failed to fetch form config:', err);
        setEditFormConfig(null);
      } finally {
        setEditFormConfigLoading(false);
      }
    };
    
    fetchFormConfig();
  }, [dialogOpen, formData.category, formData.scope, dynamicCategories, getAuthHeader, biogenicScopeSelection, scope3Method, scope3ActivityType, scope3ActivityId]);
  
  // ============================================================================
  // DYNAMIC INPUT FIELDS - Derived from form config
  // Maps ce_input_field_mappings to renderable field objects
  // ============================================================================
  const dynamicInputFields = useMemo(() => {
    
    if (!editFormConfig?.input_field_mappings?.length) {
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
        'energy': ['energy', 'electricity'],  // Support both new and legacy
        'electricity': ['energy', 'electricity'],  // Legacy support
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
      
      // Helper function to traverse decision tree and find formula_id.
      // Mirrors the logic used in EmissionEntryForm so create + edit pick
      // the same formula for the same selections.
      const traverseDecisionTreeEdit = (node, fieldValues) => {
        if (!node) return null;
        if (node.formula_id) return node.formula_id;
        const fieldName = node.field_name;
        if (!fieldName) return null;
        const selectedValue = fieldValues[fieldName];
        if (!selectedValue) return null;
        const options = node.options || {};
        const selectedOption = options[selectedValue];
        if (!selectedOption) return null;
        if (selectedOption.formula_id) return selectedOption.formula_id;
        if (selectedOption.next) return traverseDecisionTreeEdit(selectedOption.next, fieldValues);
        return null;
      };

      // PRIORITY 0: Decision tree traversal — uses all the selections the
      // user made (method, activity_type, subcategory_selection, type_of_product).
      if (editFormConfig.decision_tree) {
        const decisionValues = {
          calculation_method_scope3: scope3Method,
          activity_type: scope3ActivityType || undefined,
          subcategory_selection: scope3Subcategory || undefined,
          type_of_product: typeOfProduct || undefined,
        };
        const formulaId = traverseDecisionTreeEdit(editFormConfig.decision_tree, decisionValues);
        if (formulaId) {
          matchedFormula = editFormConfig.formulas.find(f => f.id === formulaId);
        }
      }

      // PRIORITY 0b: For subcategory categories (C8/C10/C11/C13/C14), match formula based on subcategory
      // This takes precedence because fugitive_emissions formula is specific
      if (!matchedFormula && scope3Method === 'activity_basis' && scope3Subcategory && subcategoryToFormulaMap[scope3Subcategory]) {
        const searchTerms = subcategoryToFormulaMap[scope3Subcategory];
        matchedFormula = editFormConfig.formulas.find(f => {
          const formulaName = f.name?.toLowerCase() || '';
          return searchTerms.some(term => formulaName.includes(term.toLowerCase()));
        });
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
      compoundWithVariable: m.compound_with_variable || null,
      placeholder: m.placeholder || `Enter ${m.field_label}`,
      helpText: m.help_text || '',
      mapsToContext: m.maps_to_context,
      mapsToContextValueWhenFilled: m.maps_to_context_value_when_filled || 'true',
      mapsToContextValueWhenEmpty: m.maps_to_context_value_when_empty || 'false',
      options: m.options || [],
    }));
  }, [editFormConfig, formData.scope, scope3Method, scope3ActivityType, scope3Subcategory, typeOfProduct, editingEmission?.formula_id, biogenicScopeSelection]);
  
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

    // C11 only — type_of_product is a downstream decision-tree node.
    if (isScope3Like && typeOfProduct) {
      decisionInputs['type_of_product'] = typeOfProduct;
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
  }, [dynamicInputFields, dynamicFieldValues, formData.scope, formData.category, scope3Method, scope3ActivityType, scope3Subcategory, typeOfProduct, biogenicScopeSelection, selectedCategory]);

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
  // E1: Pure unit-matching utility (delegates to shared util)
  const unitsMatch = (unit1, unit2) => unitsMatchShared(unit1, unit2, centralizedUnits);

  // E1: Pure volume-unit check (delegates to shared util)
  const isVolumeUnit = (unitStr) => isVolumeUnitShared(unitStr, centralizedUnits);

  // E2: Evidence + history handlers extracted to useEvidenceManagement hook.
  const {
    handleFileUpload,
    handleDeleteExistingEvidence,
    handleDeleteAllEvidences,
    handleRemoveEvidence,
    handleViewEvidence,
    handleDownloadEvidence,
  } = useEvidenceManagement({
    existingEvidences,
    uploadedEvidence,
    setFormData,
    setExistingEvidences,
    setUploadedEvidence,
    getAuthHeader,
  });

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
    setTypeOfProduct('');
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

  // Pluggable category renderer + edit-flow lookup. The page delegates
  // the dynamic-fields portion of the Scope 3 edit dialog to the module
  // returned (via `module.DynamicFieldsRenderer`), and the save flow to
  // `module.buildEditPayload`.
  //
  // Resolution:
  //   - Scope 3 explicit            → match by category code (c1..c15)
  //   - Biogenic + scope3 selection → generic Scope 3 module
  //   - Scope 1                     → match by category name
  //                                   (Stationary/Mobile/Fugitive Combustion)
  //                                   or generic Scope 1 fallback
  //   - Biogenic + scope1 selection → generic Scope 1 module
  //   - All other scopes/states     → legacy inline path (returns null)
  const activeCategoryModule = useMemo(() => {
    const cat = (formData.category || '').toLowerCase();

    // 1. Plain Scope 3 → match by category code; if no match, stay on legacy
    if (formData.scope === 'scope3') {
      const codeMatch = cat.match(/^(c\d+)/);
      if (!codeMatch) return null;
      return categoryRegistry.get(codeMatch[1]) || null;
    }

    // 2. Biogenic + scope3 selection → generic Scope 3 (same payload shape)
    if (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3') {
      return categoryRegistry.getGenericModule?.('scope3') || null;
    }

    // 3. Scope 1 → match by category name
    if (formData.scope === 'scope1') {
      if (cat.includes('stationary')) return categoryRegistry.get('stationary_combustion');
      if (cat.includes('mobile')) return categoryRegistry.get('mobile_combustion');
      if (cat.includes('fugitive')) return categoryRegistry.get('fugitive_emissions');
      return categoryRegistry.getGenericModule?.('scope1') || null;
    }

    // 4. Scope 2 → single generic module (purchased electricity/steam/heating/cooling)
    if (formData.scope === 'scope2') {
      return categoryRegistry.getGenericModule?.('scope2') || null;
    }

    // 5. Biogenic + scope1 selection → generic Scope 1
    if (formData.scope === 'biogenic' && biogenicScopeSelection === 'scope1') {
      return categoryRegistry.getGenericModule?.('scope1') || null;
    }

    // 6. Unknown → legacy path (safety fallback)
    return null;
  }, [formData.scope, formData.category, biogenicScopeSelection]);

  const ModuleDynamicFieldsRenderer = activeCategoryModule?.DynamicFieldsRenderer || null;

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
    if (formData.scope !== 'scope3' || !selectedCategory) return [];
    
    // Only show activity type filter for C6 and C7
    const isC6 = selectedCategory.toLowerCase().includes('c6') || 
                 selectedCategory.toLowerCase().includes('business travel');
    const isC7 = selectedCategory.toLowerCase().includes('c7') ||
                 selectedCategory.toLowerCase().includes('employee commuting');
    
    if (!isC6 && !isC7) return [];
    
    const activityTypes = new Set();
    
    // Add activity types from scope3_ef data
    if (scope3EFData.length) {
      scope3EFData.forEach(ef => {
        if (ef.category?.toLowerCase() === selectedCategory.toLowerCase() && ef.activity_type) {
          // Also filter by method if selected
          if (!scope3Method || scope3Method === 'supplier_basis' || ef.method === scope3Method) {
            activityTypes.add(ef.activity_type);
          }
        }
      });
    }
    
    // Add "Others" option for supplier_basis method - only for C6 (not C7)
    if (scope3Method === 'supplier_basis' && isC6) {
      activityTypes.add('others');
    }
    
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
      { value: 'energy', label: 'Energy' }
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
        return fugitiveEmissionsData.map(f => ({
          ...f,
          method: scope3Method,
          category: selectedCategory
        }));
      }
      
      // For stationary_combustion, mobile_combustion, and energy, filter from scope3_ef
      if (scope3Subcategory === 'stationary_combustion' || 
          scope3Subcategory === 'mobile_combustion' || 
          scope3Subcategory === 'energy' ||
          scope3Subcategory === 'electricity') {  // Support legacy 'electricity' value
        let filtered = baseData.filter(ef => 
          ef.category?.toLowerCase() === catLower
        );
        
        // Filter by subcategory field if it exists on the entry
        // For energy: ONLY show entries with exact match (no fallback to null/empty)
        // For stationary/mobile: If entry has no subcategory defined, show in both
        const energySubcategory = scope3Subcategory === 'electricity' ? 'energy' : scope3Subcategory;
        filtered = filtered.filter(ef => {
          if (energySubcategory === 'energy') {
            // Strict matching - only show entries explicitly marked as energy
            // Also support legacy 'electricity' entries
            if (Array.isArray(ef.subcategory)) {
              return ef.subcategory.includes('energy') || ef.subcategory.includes('electricity');
            }
            return ef.subcategory === 'energy' || ef.subcategory === 'electricity';
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
  // E1: Conversion factor lookup (delegates to shared util)
  const getConversionFactor = (paramKey, selectedUnit) =>
    getConversionFactorShared(paramKey, selectedUnit, formulaParameters);

  // E1: Conversion-defined check (delegates to shared util)
  const hasConversionDefined = (paramKey, selectedUnit) =>
    hasConversionDefinedShared(paramKey, selectedUnit, formulaParameters);

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

  // E5: Dead-code block removed (getParameterValueDynamic, getParameterValue,
  // findFormulaForScope, executeFormula) — these were never called from production
  // paths after migration to backend calc engine. Saved ~304 lines.


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
          
          if (isScope3Like && requiresSubcategory && scope3Method !== 'supplier_basis' && scope3Subcategory === 'fugitive_emissions' && matchedEFForPreview?.activity) {
            fuelNameForContext = matchedEFForPreview.activity;
          }
          
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
          
          const response = await axios.post(
            `${API}/calc-engine/execute-by-category`,
            payload,
            { headers: getAuthHeader() }
          );
        
          
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

  // E2: handleFileUpload, handleDeleteExistingEvidence, handleDeleteAllEvidences,
  // handleRemoveEvidence — moved to useEvidenceManagement hook.

  const handleSubmit = async (e) => {
    e.preventDefault();

    // E3: persistCalcAuditLog moved to ./emissions/utils/persistCalcAuditLog.
    // Thin wrapper binds local state for the dispatch branches below.
    const persistCalcAuditLogLocal = (emissionId) => persistCalcAuditLogShared(emissionId, {
      formData,
      biogenicScopeSelection,
      dynamicCategories,
      selectedCategory,
      dynamicInputFields,
      dynamicFieldValues,
      buildEditDecisionInputs,
      filteredScope3Activities,
      scope3ActivityId,
      scope3Method,
      scope3Subcategory,
      useCustomActivity,
      scope3CustomActivity,
      requiresSubcategory,
      selectedFuel,
      getAuthHeader,
    });
    
    // C7 EMPLOYEE COMMUTING - Always uses multi-employee mode
    // Business logic (validation + payload construction) lives in the C7 category module.
    // UI rendering stays in Emissions.js via MultiEmployeeInput.
    if (isEditC7EmployeeCommuting) {
      const c7Module = categoryRegistry.get('c7');
      if (!c7Module || !c7Module.validateEditSubmission || !c7Module.buildEditPayload) {
        toast.error('C7 module not initialised. Please reload the page.');
        return;
      }

      // 1. Validate via module
      const validation = c7Module.validateEditSubmission({
        editEmployees,
        editingEmission,
        processNames: formData.process_names,
      });
      if (!validation.valid) {
        toast.error(validation.errorMessage);
        return;
      }

      // 2. Build payload via module
      const builtPayload = c7Module.buildEditPayload({
        formData,
        editingEmission,
        editEmployees,
        scope3Method,
        scope3ActivityId,
        scope3ActivityType,
        scope3CustomActivity,
        useCustomActivity,
        filteredScope3Activities,
        editEmployeeMonthlyTotals,
        editEmployeeYearlyTotal,
        validProcessNames: validation.validProcessNames,
      });
      const totalCo2e = builtPayload.__totalCo2e;
      // Strip orchestration-only field before sending
      const payload = { ...builtPayload };
      delete payload.__totalCo2e;

      try {
        setIsSaving(true);
        const response = await axios.put(`${API}/emissions/${editingEmission.id}`, payload, {
          headers: getAuthHeader()
        });
        
        if (response.data) {
          toast.success(`Updated ${editEmployees.length} employee commuting records (${totalCo2e.toFixed(4)} tCO2e total)`);
          // NOTE: Audit log persistence (POST /calc-engine/execute-by-category)
          // is intentionally skipped for C7. The calc-engine endpoint expects
          // aggregated `dynamicFieldValues`-based inputs; C7's per-employee
          // per-month inputs don't match that contract and return HTTP 400.
          // The legacy code also did NOT persist the audit log for C7.
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
    
    // FLAT-FIELD SCOPE 3 + SCOPE 1 CATEGORIES — module-owned validation +
    // payload (config-driven path). Applies to any module exposing
    // `buildEditPayload` EXCEPT C7 (which has its own multi-employee
    // branch above). Scope 2 still uses the legacy path until migrated.
    if (
      activeCategoryModule?.buildEditPayload &&
      activeCategoryModule?.id !== 'c7'
    ) {
      // Read override DOM flags for Scope 1 (no-op for Scope 3 paths)
      const cvCheckbox = document.querySelector('[data-testid="override-calorific-checkbox"]');
      const densityCheckbox = document.querySelector('[data-testid="override-density-checkbox"]');
      const isOverrideCV = cvCheckbox?.checked || false;
      const isOverrideDensity = densityCheckbox?.checked || false;

      const validation = activeCategoryModule.validateEditSubmission({
        // Scope 3 props
        scope3Method,
        scope3ActivityId,
        scope3CustomActivity,
        useCustomActivity,
        // Common props
        dynamicInputFields,
        dynamicFieldValues,
        processNames: formData.process_names,
        effectiveCalculatedEmissions,
        formData,
        // Scope 1 props
        isOverrideCV,
        isOverrideDensity,
        overrideCalorificValue,
        overrideDensity,
        overrideEmissionFactorHeat,
        overrideJustification,
      });
      if (!validation.valid) {
        toast.error(validation.errorMessage);
        return;
      }

      try {
        const payload = activeCategoryModule.buildEditPayload({
          // Scope 3 props
          scope3Method,
          scope3ActivityId,
          scope3ActivityType,
          scope3Subcategory,
          typeOfProduct,
          scope3CustomActivity,
          useCustomActivity,
          // Common
          formData,
          editingEmission,
          biogenicScopeSelection,
          dynamicInputFields,
          dynamicFieldValues,
          effectiveCalculatedEmissions,
          selectedFuel,
          filteredScope3Activities,
          centralizedUnits,
          // Scope 1 override flags
          isOverrideCV,
          isOverrideDensity,
          overrideEmissionFactorHeat,
          overrideJustification,
        });

        setIsSaving(true);
        const response = await axios.put(`${API}/emissions/${editingEmission.id}`, payload, {
          headers: getAuthHeader()
        });
        if (response.data) {
          toast.success('Emission updated successfully');
          // Persist calc audit log so override sources reload correctly on re-edit
          await persistCalcAuditLogLocal(editingEmission.id);
          setDialogOpen(false);
          resetForm();
          fetchData();
        }
      } catch (error) {
        toast.error('Failed to update emissions. Please try again.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // No module matched — defensive fallback.
    // With Scope 1/2/3 + biogenic all routed through module dispatch above,
    // this branch should be unreachable for any valid emission record.
    // If it fires, it indicates an unregistered category or a stale dialog.
    toast.error('No category module matched for this emission. Cannot save.');
    console.error('[Emissions.handleSubmit] No active category module for', {
      scope: formData.scope,
      category: formData.category,
      biogenicScopeSelection,
    });
  };

  // E4: handleEdit body extracted to ./emissions/utils/editEmissionDispatch.js.
  const handleEdit = (emission) => editEmissionDispatchShared(emission, {
    // State reads
    scope3EFData, fugitiveEmissionsData, fuelDatabase,
    // Setters
    setEditEmployees, setEditEmployeeMonthlyTotals, setEditEmployeeYearlyTotal,
    setDynamicFieldValues, setExistingEvidences, setEditingEmissionId,
    setEmissionAuditLog, setIsEditLoading, setDialogOpen,
    setScope3Method, setScope3ActivityId, setScope3ActivityType,
    setScope3Subcategory, setTypeOfProduct, setScope3CustomActivity, setUseCustomActivity,
    setBiogenicScopeSelection, setEditFrequencyType, setEditingEmission,
    setOverrideCalorificValue, setOverrideDensity, setOverrideEmissionFactorHeat,
    setOverrideJustification, setSelectedCategory, setFormData, setEditC7Month,
    // Helpers
    getAuthHeader,
  });

  // Deep-link from /ghg/approvals: open the edit dialog for ?edit=<id> once
  // the emissions list is loaded. Strips the param after firing so a refresh
  // doesn't re-trigger. If the record isn't in the loaded list (e.g. admin
  // view filters out pending records), falls back to fetching it directly.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editId = params.get('edit');
    if (!editId) return;
    if (loading) return;

    const target = (emissions || []).find((e) => e.id === editId);
    const stripParam = () => {
      params.delete('edit');
      navigate(
        { pathname: location.pathname, search: params.toString() },
        { replace: true }
      );
    };

    if (target) {
      handleEdit(target);
      stripParam();
      return;
    }

    // Fallback: fetch single record directly (covers admin opening pending
    // records from the Approvals page, which are excluded from /api/emissions).
    let cancelled = false;
    (async () => {
      try {
        const resp = await axios.get(`${API}/emissions/${editId}`, {
          headers: getAuthHeader(),
        });
        if (cancelled) return;
        if (resp?.data) {
          handleEdit(resp.data);
          stripParam();
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.detail || 'Failed to load record');
          stripParam();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.search, emissions, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/emissions/${id}`, {
        headers: getAuthHeader()
      });
      toast.success('Emission record deleted successfully');
      setDeleteConfirmOpen(false);
      setEmissionToDelete(null);      fetchData();
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
      
      // For supplier_basis with custom activity, skip activity ID requirement
      if (!useCustomActivity && !scope3ActivityId) {
        // Priority: 1) Selected scope3ActivityId, 2) First match for activity_type
        let matchedActivity = filteredScope3Activities.find(a => 
          a.activity_type === activityType || 
          normalizeActivityType(a.activity_type) === normalizedActivityType
        );
        
        if (!matchedActivity) {
          toast.error('Please select a specific activity from the dropdown or use custom activity');
          setIsCalculatingEditEmployee(false);
          return;
        }
      }
      
      // Find matched activity (may be null for custom activity)
      let matchedActivity = null;
      if (!useCustomActivity) {
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
      }
      
      // Use the matched activity's emission factor for supplier_basis if no custom EF provided (or null for custom activity)
      const efFromActivity = matchedActivity?.emission_factor || null;
      const efUnitFromActivity = matchedActivity?.ef_unit || null;

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
          activity: matchedActivity?.activity || scope3CustomActivity || 'Custom Activity', // For emission factor lookup
          fuel_name: matchedActivity?.activity || scope3CustomActivity || 'Custom Activity', // Alias for property source mapping
          scope3_ef_id: matchedActivity?.id || null,
          use_custom_activity: useCustomActivity,
        },
        scope3_ef_id: matchedActivity?.id || null,
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
  }, [scope3Method, scope3ActivityType, scope3ActivityId, filteredScope3Activities, dynamicCategories, formData.category, dynamicInputFields, getAuthHeader, useCustomActivity, scope3CustomActivity]);

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

  // Check if organization has scope 3 access - needed for filtering biogenic scope3 records
  const hasScope3Access = useMemo(() => {
    const enabledAccess = organization?.enabled_access;
    return enabledAccess?.includes('scope1_2_3') || false;
  }, [organization]);

  // Apply filters
  // Get active facilities only for filtering emissions
  const activeFacilityIds = useMemo(() => {
    return facilities.filter(f => f.is_active !== false).map(f => f.id);
  }, [facilities]);

  const filteredEmissions = useMemo(() => {
    let filtered = emissions.filter(e => {
      // Hide emissions from deactivated facilities
      if (!activeFacilityIds.includes(e.facility_id)) return false;
      
      // Filter out biogenic records with biogenic_scope_selection='scope3' for orgs without scope3 access
      // This is a client-side backup in case the backend filter was bypassed
      if (!hasScope3Access && e.scope === 'biogenic' && e.biogenic_scope_selection === 'scope3') {
        return false;
      }
      
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
      
      // Calculation method filter (only for Scope 3)
      if (filterCalculationMethod && activeScope === 'scope3') {
        const emissionMethod = e.calculation_method_scope3 || '';
        if (filterCalculationMethod !== emissionMethod) return false;
      }
      
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
  }, [emissions, activeScope, filterFacility, filterCategory, filterFrequency, filterCalculationMethod, filterDateRange, activeFacilityIds, sortBy, sortOrder, facilities, searchQuery, hasScope3Access]);

  const uniqueCategories = useMemo(() => {
    return [...new Set(emissions.filter(e => e.scope === activeScope).map(e => e.category))];
  }, [emissions, activeScope]);

  // Get unique calculation methods for Scope 3 emissions (for filter dropdown)
  const uniqueCalculationMethods = useMemo(() => {
    if (activeScope !== 'scope3') return [];
    const methods = emissions
      .filter(e => e.scope === 'scope3' && e.calculation_method_scope3)
      .map(e => e.calculation_method_scope3);
    const unique = [...new Set(methods)].sort();

    return unique.map(method => ({
      value: method,
      label: CALCULATION_METHODS_LABELS[method] || method, 
    }));
    // return [...new Set(methods)].sort();
  }, [emissions, activeScope]);

  // Check if user is regular user (not admin or super_admin)
  const isRegularUser = user?.role === 'user';

  // E2: handleViewEvidence + handleDownloadEvidence — moved to useEvidenceManagement hook.

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

  // hasScope3Access is computed earlier in the component (via useMemo) for use in filteredEmissions

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
                {/* Facility and Scope Selection - Extracted Component */}
                <FacilityScopeSection
                  formData={formData}
                  setFormData={setFormData}
                  facilities={facilities}
                  dynamicScopes={dynamicScopes}
                  hasScope3Access={hasScope3Access}
                  handleFuelSelect={handleFuelSelect}
                  setBiogenicScopeSelection={setBiogenicScopeSelection}
                  markFormDirty={markFormDirty}
                />
                
                {/* Biogenic Scope Selection - Extracted Component */}
                <BiogenicScopeSection
                  formData={formData}
                  setFormData={setFormData}
                  biogenicScopeSelection={biogenicScopeSelection}
                  setBiogenicScopeSelection={setBiogenicScopeSelection}
                  hasScope3Access={hasScope3Access}
                  handleFuelSelect={handleFuelSelect}
                  loadingBiogenicCategories={loadingBiogenicCategories}
                />

                
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
                                  setScope3Method(newMethod);
                                  setScope3ActivityType(''); // Reset activity type when method changes
                                  setScope3Subcategory('');
                                  setTypeOfProduct('');
                                  setScope3ActivityId('');
                                  setDynamicFieldValues({}); // Fix #9: Clear stale inputs when method changes
                                  markFormDirty(); // Mark form as dirty when method changes
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
                                  setScope3ActivityType(newActivityType);
                                  setScope3ActivityId(''); // Reset activity when type changes
                                  setActivitySearchTerm(''); // Clear activity search
                                  setDynamicFieldValues({}); // Fix #9: Clear stale inputs when activity type changes
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
                                    'others': 'Others',
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
                                  setTypeOfProduct(''); // Reset C11 type_of_product
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

                          {/* C11 Type of Product (only for activity_basis) */}
                          {(() => {
                            const catLower = (formData.category || '').toLowerCase();
                            const isC11 = catLower.includes('c11');
                            const showTypeOfProduct = isC11
                              && scope3Method === 'activity_basis'
                              && requiresSubcategory
                              && !!scope3Subcategory;
                            if (!showTypeOfProduct) return null;
                            return (
                              <div className="space-y-1.5">
                                <Label htmlFor="scope3_type_of_product_filter">Step 4: Type of Product *</Label>
                                <select
                                  id="scope3_type_of_product_filter"
                                  value={typeOfProduct || ''}
                                  onChange={(e) => {
                                    setTypeOfProduct(e.target.value);
                                    setScope3ActivityId('');
                                    setActivitySearchTerm('');
                                  }}
                                  required
                                  className="w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3"
                                  data-testid="scope3-type-of-product-filter"
                                >
                                  <option value="">Select type of product...</option>
                                  <option value="continuous_usage">Energy-consuming product over lifetime</option>
                                  <option value="one_time_use">One-time combustion</option>
                                </select>
                              </div>
                            );
                          })()}
                          
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
                      {/* Asset Name section — driven by module capability 'asset-name' (C8/C13/C14/C15) */}
                      {formData.scope === 'scope3' && activeCategoryModule?.hasCapability?.('asset-name') && (
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
                      {/* Journey Details — driven by module capability 'journey-locations' (C4/C6/C9) */}
                      {formData.scope === 'scope3' && activeCategoryModule?.hasCapability?.('journey-locations') && !isEditC7EmployeeCommuting && (
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
                  /* Pluggable category renderer (PoC: C1 routes through registry). */
                  ModuleDynamicFieldsRenderer ? (
                    <ModuleDynamicFieldsRenderer
                      dynamicInputFields={dynamicInputFields}
                      dynamicFieldValues={dynamicFieldValues}
                      updateDynamicFieldValue={updateDynamicFieldValue}
                      formData={formData}
                      setFormData={setFormData}
                      scope3Method={scope3Method}
                      selectedFuel={selectedFuel}
                      requiresSubcategory={requiresSubcategory}
                      scope3ActivityId={scope3ActivityId}
                      filteredScope3Activities={filteredScope3Activities}
                      centralizedUnits={centralizedUnits}
                      markFormDirty={markFormDirty}
                    />
                  ) : (
                  <div className="space-y-4">
                    <div className="text-sm text-stone-500 mb-2 flex items-center gap-2">
                      Input Fields (from calculation engine configuration)
                    </div>
                    
                    {/* Supplier Method Disclaimer - Only for Scope 3 with supplier_basis */}
                    {formData.scope === 'scope3' && scope3Method === 'supplier_basis' && (
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

                        // Compound unit: suffix every option with "/<linked unit>".
                        // Read the linked field's `_unit` from dynamicFieldValues
                        // (text-input units are stored as `<var>_unit`).
                        if (field.compoundWithVariable) {
                          const linkedUnitRaw = dynamicFieldValues[`${field.compoundWithVariable}_unit`];
                          const linkedUnit = (typeof linkedUnitRaw === 'object' ? linkedUnitRaw?.value : linkedUnitRaw) || '';
                          if (linkedUnit && typeof linkedUnit === 'string' && linkedUnit.trim()) {
                            const suffix = linkedUnit.trim();
                            fieldUnits = fieldUnits.map(u => u.includes('/') ? u : `${u}/${suffix}`);
                          }
                        }

                        // Unitless count fields - admin-driven via unit_source === 'none'.
                        const isUnitlessCountField = field.unitSource === 'none';

                        const showUnitSelector = !isUnitlessCountField && field.unitSource !== 'text' && fieldUnits.length > 0;
                        
                        // For supplier_basis method with supplier-based fields, use text input for units
                        const isSupplierBasisUnitField = scope3Method === 'supplier_basis' && 
                          (field.variable?.includes('supplier_based') || field.variable?.includes('supplier'));
                        
                        // Show checkbox for override fields OR optional fields (not required and not override)
                        const showOverrideCheckbox = field.isOverride || (!field.required && !field.isOverride);
                        
                        return (
                          <div key={field.id || field.variable} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="font-medium flex items-center gap-1.5">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                                {!showUnitSelector && !isSupplierBasisUnitField && field.expectedUnit && (
                                  <span className="text-muted-foreground ml-1 text-xs font-normal">({field.expectedUnit})</span>
                                )}
                                {FIELD_HELP[field.variable] && (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          aria-label={`${field.label} info`}
                                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-stone-400 hover:text-emerald-600 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                          data-testid={`field-help-${field.variable}`}
                                        >
                                          <Info className="w-3.5 h-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" align="start" className="max-w-xs text-xs leading-relaxed">
                                        {FIELD_HELP[field.variable]}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
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
                  )
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
                                  <div key={i} className="p-2 bg-amber-50 rounded border border-amber-200 flex justify-between items-center">
                                    <span>
                                      <span className="text-amber-800 font-medium">{entry.property_label || entry.property}</span>
                                      {' = '}{typeof entry.value === 'number' ? entry.value.toFixed(6) : entry.value}{displayUnit && ` ${displayUnit}`}
                                    </span>
                                    {sourceName && (
                                      <span className="text-amber-600 text-xs ml-4 whitespace-nowrap">(Source - {sourceName})</span>
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

                {/* Notes - Extracted Component */}
                <NotesSection
                  formData={formData}
                  setFormData={(newData) => { setFormData(newData); markFormDirty(); }}
                />

                {/* Submit Buttons - Extracted Component */}
                <SubmitButtonSection
                  editingEmission={editingEmission}
                  isSaving={isSaving}
                  isCalculating={isCalculating}
                  handleDialogChange={handleDialogChange}
                />
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
        <EmissionFilters
          filterFacility={filterFacility}
          setFilterFacility={setFilterFacility}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterFrequency={filterFrequency}
          setFilterFrequency={setFilterFrequency}
          filterCalculationMethod={filterCalculationMethod}
          setFilterCalculationMethod={setFilterCalculationMethod}
          filterDateRange={filterDateRange}
          setFilterDateRange={setFilterDateRange}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          facilities={facilities}
          uniqueCategories={uniqueCategories}
          uniqueCalculationMethods={uniqueCalculationMethods}
          isScope3={activeScope === 'scope3'}
        />
      )}

      <Tabs value={activeScope} onValueChange={(value) => { 
        // Only allow scope3 tab if org has access
        const isScope3 = value === 'scope3';
        if (isScope3 && !hasScope3Access) return;
        setActiveScope(value);
        // Keep the URL in sync when used inside the GHG workspace.
        if (location.pathname.startsWith('/ghg/')) {
          navigate(`/ghg/${value}`, { replace: true });
        }
        // Reset category filter when changing scopes to prevent showing no emissions
        setFilterCategory('');
        // Reset calculation method filter when leaving Scope 3
        if (value !== 'scope3') {
          setFilterCalculationMethod('');
        }
        // Reset biogenic state when changing tabs
        if (value !== 'biogenic') {
          setBiogenicScopeSelection('');
        }
      }} className="w-full">
        {!location.pathname.startsWith('/ghg/') && (
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
        )}

        <TabsContent value={activeScope} className={location.pathname.startsWith('/ghg/') ? 'mt-0' : 'mt-6'}>
          {/* Enterprise Data Grid Layout */}
          <EmissionDataGrid
            activeScope={activeScope}
            filteredEmissions={filteredEmissions}
            facilities={facilities}
            filteredScope3Activities={filteredScope3Activities}
            getMethodLabel={getMethodLabel}
            isRegularUser={isRegularUser}
            handleEdit={handleEdit}
            fetchHistory={fetchHistory}
            openDeleteConfirm={openDeleteConfirm}
            showFilters={showFilters}
            filterFacility={filterFacility}
            filterDateRange={filterDateRange}
            filterCategory={filterCategory}
            filterFrequency={filterFrequency}
          />

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
        <EmissionHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          history={selectedEmissionHistory}
        />
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
