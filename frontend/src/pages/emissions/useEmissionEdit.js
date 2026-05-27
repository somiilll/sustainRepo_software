/**
 * useEmissionEdit - Hook for managing emission edit state
 * 
 * Manages all state related to editing an emission record including:
 * - Form data
 * - Override states (calorific value, density)
 * - Scope 3 specific state
 * - C7 Employee commuting state
 * - Evidence uploads
 * - Calculation results
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function useEmissionEdit(getAuthHeader, fetchData) {
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmission, setEditingEmission] = useState(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    facility_id: '',
    scope: 'scope1',
    category: '',
    sub_category: '',
    fuel_id: '',
    fuel_type: '',
    quantity: '',
    quantity_unit: '',
    source_of_information: '',
    notes: '',
    justification: '',
    evidence_url: '',
    responsible_person: '',
    responsible_person_designation: '',
    responsible_person_contact: '',
    calorific_value: '',
    calorific_value_unit: 'MJ/kg',
    calorific_value_justification: '',
    density: '',
    density_justification: '',
    process_names: [{ name: '', description: '' }],
    supplier_name: '',
    supplier_code: '',
    employee_name: '',
    employee_id: '',
    asset_name: '',
    from_location: '',
    to_location: '',
  });
  
  // Override states
  const [overrideCalorificValue, setOverrideCalorificValue] = useState(false);
  const [overrideDensity, setOverrideDensity] = useState(false);
  const [overrideEmissionFactorHeat, setOverrideEmissionFactorHeat] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState('');
  
  // Scope 3 state
  const [scope3Method, setScope3Method] = useState('');
  const [scope3ActivityType, setScope3ActivityType] = useState('');
  const [scope3ActivityId, setScope3ActivityId] = useState('');
  const [scope3Subcategory, setScope3Subcategory] = useState('');
  // C11 decision-tree branch (continuous_usage / one_time_use).
  const [typeOfProduct, setTypeOfProduct] = useState('');
  const [scope3CustomActivity, setScope3CustomActivity] = useState('');
  const [useCustomActivity, setUseCustomActivity] = useState(false);
  
  // Biogenic state
  const [biogenicScopeSelection, setBiogenicScopeSelection] = useState('');
  
  // Dynamic fields
  const [dynamicInputFields, setDynamicInputFields] = useState([]);
  const [dynamicFieldValues, setDynamicFieldValues] = useState({});
  const [editFormConfig, setEditFormConfig] = useState(null);
  const [editFormConfigLoading, setEditFormConfigLoading] = useState(false);
  
  // Process emissions state
  const [selectedSubIndustry, setSelectedSubIndustry] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateInputValues, setTemplateInputValues] = useState({});
  
  // Calculation results
  const [calculatedEmissions, setCalculatedEmissions] = useState(null);
  
  // C7 Employee state
  const [editEmployees, setEditEmployees] = useState([]);
  const [expandedEditEmployees, setExpandedEditEmployees] = useState([]);
  const [employeeMonthlyTotals, setEmployeeMonthlyTotals] = useState({});
  const [employeeYearlyTotal, setEmployeeYearlyTotal] = useState({});
  const [isCalculatingEmployee, setIsCalculatingEmployee] = useState(false);
  
  // Evidence state
  const [existingEvidences, setExistingEvidences] = useState([]);
  const [uploadedEvidence, setUploadedEvidence] = useState(null);
  
  // Mark form as dirty when changes are made
  const markFormDirty = useCallback(() => {
    setIsFormDirty(true);
  }, []);
  
  // Reset form state
  const resetFormState = useCallback(() => {
    setFormData({
      facility_id: '',
      scope: 'scope1',
      category: '',
      sub_category: '',
      fuel_id: '',
      fuel_type: '',
      quantity: '',
      quantity_unit: '',
      source_of_information: '',
      notes: '',
      justification: '',
      evidence_url: '',
      responsible_person: '',
      responsible_person_designation: '',
      responsible_person_contact: '',
      calorific_value: '',
      calorific_value_unit: 'MJ/kg',
      calorific_value_justification: '',
      density: '',
      density_justification: '',
      process_names: [{ name: '', description: '' }],
      supplier_name: '',
      supplier_code: '',
      employee_name: '',
      employee_id: '',
      asset_name: '',
      from_location: '',
      to_location: '',
    });
    setEditingEmission(null);
    setScope3Method('');
    setScope3ActivityType('');
    setScope3ActivityId('');
    setScope3Subcategory('');
    setTypeOfProduct('');
    setScope3CustomActivity('');
    setUseCustomActivity(false);
    setBiogenicScopeSelection('');
    setOverrideCalorificValue(false);
    setOverrideDensity(false);
    setOverrideEmissionFactorHeat(false);
    setOverrideJustification('');
    setDynamicInputFields([]);
    setDynamicFieldValues({});
    setCalculatedEmissions(null);
    setEditEmployees([]);
    setExpandedEditEmployees([]);
    setEmployeeMonthlyTotals({});
    setEmployeeYearlyTotal({});
    setExistingEvidences([]);
    setUploadedEvidence(null);
    setIsFormDirty(false);
    setSelectedSubIndustry('');
    setSelectedTemplate(null);
    setTemplateInputValues({});
  }, []);
  
  // Handle dialog open/close
  const handleDialogChange = useCallback((open) => {
    if (!open && isFormDirty) {
      const confirmClose = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) return;
    }
    
    setDialogOpen(open);
    if (!open) {
      resetFormState();
    }
  }, [isFormDirty, resetFormState]);
  
  // Handle interaction outside dialog
  const handleInteractOutside = useCallback((e) => {
    if (isFormDirty) {
      e.preventDefault();
    }
  }, [isFormDirty]);
  
  // Handle escape key
  const handleEscapeKeyDown = useCallback((e) => {
    if (isFormDirty) {
      e.preventDefault();
      const confirmClose = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (confirmClose) {
        handleDialogChange(false);
      }
    }
  }, [isFormDirty, handleDialogChange]);
  
  // Handle edit button click
  const handleEdit = useCallback(async (emission) => {
    setIsEditLoading(true);
    setEditingEmission(emission);
    setDialogOpen(true);
    
    try {
      // Populate form data from emission
      const dfv = emission.dynamic_field_values || {};
      
      setFormData({
        facility_id: emission.facility_id || '',
        scope: emission.scope || 'scope1',
        category: emission.category || '',
        sub_category: emission.sub_category || emission.fuel_type || '',
        fuel_id: emission.fuel_database_id || '',
        fuel_type: emission.fuel_type || '',
        quantity: dfv.qty?.value?.toString() || emission.quantity?.toString() || '',
        quantity_unit: dfv.qty?.unit || emission.quantity_unit || 'kg',
        source_of_information: emission.source_of_information || '',
        notes: emission.notes || '',
        justification: emission.justification || '',
        evidence_url: emission.evidence_url || '',
        responsible_person: emission.responsible_person || '',
        responsible_person_designation: emission.responsible_person_designation || '',
        responsible_person_contact: emission.responsible_person_contact || '',
        calorific_value: dfv.cv?.value?.toString() || '',
        calorific_value_unit: dfv.cv?.unit || 'MJ/kg',
        calorific_value_justification: dfv.cv?.justification || '',
        density: dfv.density?.value?.toString() || '',
        density_justification: dfv.density?.justification || '',
        process_names: emission.process_descriptions?.length > 0 
          ? emission.process_descriptions 
          : [{ name: emission.process_names?.[0] || '', description: '' }],
        supplier_name: emission.supplier_name || dfv.supplier_name?.value || '',
        supplier_code: emission.supplier_code || dfv.supplier_code?.value || '',
        employee_name: emission.employee_name || dfv.employee_name?.value || '',
        employee_id: emission.employee_id || dfv.employee_id?.value || '',
        asset_name: emission.asset_name || dfv.asset_name?.value || '',
        from_location: emission.from_location || dfv.from_location?.value || '',
        to_location: emission.to_location || dfv.to_location?.value || '',
      });
      
      // Set Scope 3 state
      if (emission.scope === 'scope3' || (emission.scope === 'biogenic' && dfv.biogenic_scope_selection?.value === 'scope3')) {
        setScope3Method(emission.calculation_method_scope3 || dfv.calculation_method_scope3?.value || '');
        setScope3ActivityType(dfv.scope3_activity_type?.value || '');
        setScope3ActivityId(emission.scope3_ef_id || dfv.scope3_ef_id?.value || '');
        setScope3Subcategory(dfv.scope3_subcategory?.value || '');
        setTypeOfProduct(emission.type_of_product || dfv.type_of_product?.value || '');
        setScope3CustomActivity(emission.scope3_activity || dfv.scope3_activity?.value || '');
        setUseCustomActivity(dfv.use_custom_activity?.value || false);
      }
      
      // Set biogenic state
      if (emission.scope === 'biogenic') {
        setBiogenicScopeSelection(emission.biogenic_scope_selection || dfv.biogenic_scope_selection?.value || 'scope1');
      }
      
      // Set override states
      setOverrideCalorificValue(dfv.cv?.is_override || false);
      setOverrideDensity(dfv.density?.is_override || false);
      
      // Set calculated emissions from existing data
      if (emission.outputs) {
        setCalculatedEmissions({
          co2Emissions: emission.outputs.co2?.value || 0,
          ch4Emissions: emission.outputs.ch4?.value || 0,
          n2oEmissions: emission.outputs.n2o?.value || 0,
          co2eEmissions: emission.outputs.co2e?.value || 0,
        });
      }
      
      // Parse existing evidences
      if (emission.evidence_url) {
        const urls = emission.evidence_url.split(',').filter(u => u.trim());
        setExistingEvidences(urls.map((url, idx) => ({
          url: url.trim(),
          filename: `Evidence ${idx + 1}`,
        })));
      }
      
    } catch (error) {
      console.error('Error loading emission for edit:', error);
      toast.error('Failed to load emission data');
    } finally {
      setIsEditLoading(false);
    }
  }, []);
  
  // Check if editing C7 Employee Commuting
  const isEditC7EmployeeCommuting = editingEmission?.category?.toLowerCase()?.includes('c7') || 
                                    editingEmission?.category?.toLowerCase()?.includes('employee commuting');
  
  return {
    // Dialog state
    dialogOpen,
    setDialogOpen,
    editingEmission,
    setEditingEmission,
    isEditLoading,
    setIsEditLoading,
    isSaving,
    setIsSaving,
    isCalculating,
    setIsCalculating,
    isFormDirty,
    setIsFormDirty,
    
    // Form data
    formData,
    setFormData,
    markFormDirty,
    resetFormState,
    
    // Override states
    overrideCalorificValue,
    setOverrideCalorificValue,
    overrideDensity,
    setOverrideDensity,
    overrideEmissionFactorHeat,
    setOverrideEmissionFactorHeat,
    overrideJustification,
    setOverrideJustification,
    
    // Scope 3 state
    scope3Method,
    setScope3Method,
    scope3ActivityType,
    setScope3ActivityType,
    scope3ActivityId,
    setScope3ActivityId,
    scope3Subcategory,
    setScope3Subcategory,
    typeOfProduct,
    setTypeOfProduct,
    scope3CustomActivity,
    setScope3CustomActivity,
    useCustomActivity,
    setUseCustomActivity,
    
    // Biogenic state
    biogenicScopeSelection,
    setBiogenicScopeSelection,
    
    // Dynamic fields
    dynamicInputFields,
    setDynamicInputFields,
    dynamicFieldValues,
    setDynamicFieldValues,
    editFormConfig,
    setEditFormConfig,
    editFormConfigLoading,
    setEditFormConfigLoading,
    
    // Process emissions state
    selectedSubIndustry,
    setSelectedSubIndustry,
    selectedTemplate,
    setSelectedTemplate,
    templateInputValues,
    setTemplateInputValues,
    
    // Calculation results
    calculatedEmissions,
    setCalculatedEmissions,
    
    // C7 Employee state
    editEmployees,
    setEditEmployees,
    expandedEditEmployees,
    setExpandedEditEmployees,
    employeeMonthlyTotals,
    setEmployeeMonthlyTotals,
    employeeYearlyTotal,
    setEmployeeYearlyTotal,
    isCalculatingEmployee,
    setIsCalculatingEmployee,
    isEditC7EmployeeCommuting,
    
    // Evidence state
    existingEvidences,
    setExistingEvidences,
    uploadedEvidence,
    setUploadedEvidence,
    
    // Handlers
    handleDialogChange,
    handleInteractOutside,
    handleEscapeKeyDown,
    handleEdit,
  };
}

export default useEmissionEdit;
