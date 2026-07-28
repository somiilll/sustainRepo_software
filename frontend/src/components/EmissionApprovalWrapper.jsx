/**
 * EmissionApprovalWrapper - Wraps the existing EmissionEditForm for approval workflow
 * 
 * Reuses all existing emission edit infrastructure:
 * - useEmissionsCoreData for fetching fuel database, units, categories
 * - useEmissionEdit for managing form state
 * - EmissionEditForm for the actual form rendering
 * 
 * Adds approval-specific functionality:
 * - Approve/Reject actions
 * - Modification tracking
 * - Audit trail generation
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useEmissionsCoreData } from '../hooks/useEmissionsCoreData';
import useEmissionEdit from '../pages/emissions/useEmissionEdit';
import useCalcEngine from '../hooks/useCalcEngine';
import EmissionEditForm from './EmissionEditForm';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  User,
  Clock,
  AlertTriangle,
  FileText,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function EmissionApprovalWrapper({ 
  item, 
  onClose, 
  onApproved 
}) {
  const { getAuthHeader, user } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState('');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  
  // Get snapshot data from approval request (safe defaults even if item is invalid)
  const snapshot = item?.entity_snapshot || {};
  const requestType = item?.request_type || snapshot.edit_type || 'create';
  const isUpdate = requestType === 'update';
  
  // Fetch core emission data (fuels, units, categories, etc.)
  const coreData = useEmissionsCoreData(getAuthHeader);
  
  // Use the emission edit hook for form state management
  const editHook = useEmissionEdit(getAuthHeader, () => {});
  
  // Calculation engine hook
  const calcEngine = useCalcEngine(getAuthHeader);
  
  // Store original values for modification tracking
  const [originalValues, setOriginalValues] = useState(null);
  
  // State for form configuration (needed for dynamic input fields)
  const [editFormConfig, setEditFormConfig] = useState(null);
  const [editFormConfigLoading, setEditFormConfigLoading] = useState(false);
  
  // Fetch form config when we have category info
  useEffect(() => {
    const fetchFormConfig = async () => {
      if (!snapshot.category || !snapshot.scope || coreData.loading) return;
      
      const dynamicCategories = coreData.dynamicCategories || [];
      
      // Find category ID
      const categoryObj = dynamicCategories.find(
        c => c.name === snapshot.category && c.scope_code === snapshot.scope
      );
      
      if (!categoryObj?.id) {
        // Try without scope matching for flexibility
        const fallbackCat = dynamicCategories.find(c => c.name === snapshot.category);
        if (!fallbackCat?.id) return;
        
        setEditFormConfigLoading(true);
        try {
          const response = await axios.get(
            `${API}/api/calc-engine/form-config/${fallbackCat.id}?scope=${snapshot.scope}`,
            { headers: getAuthHeader() }
          );
          setEditFormConfig(response.data);
        } catch (err) {
          console.error('Failed to fetch form config:', err);
        } finally {
          setEditFormConfigLoading(false);
        }
        return;
      }
      
      setEditFormConfigLoading(true);
      try {
        const response = await axios.get(
          `${API}/api/calc-engine/form-config/${categoryObj.id}?scope=${snapshot.scope}`,
          { headers: getAuthHeader() }
        );
        setEditFormConfig(response.data);
      } catch (err) {
        console.error('Failed to fetch form config:', err);
      } finally {
        setEditFormConfigLoading(false);
      }
    };
    
    fetchFormConfig();
  }, [snapshot.category, snapshot.scope, coreData.loading, coreData.dynamicCategories, getAuthHeader]);
  
  // Compute dynamic input fields from form config
  const dynamicInputFields = useMemo(() => {
    if (!editFormConfig?.input_field_mappings?.length) return [];
    
    // Find matching formula (use first one or match by saved formula_id)
    let matchedFormula = editFormConfig.formulas?.[0];
    if (snapshot.formula_id && editFormConfig.formulas?.length) {
      const saved = editFormConfig.formulas.find(f => f.id === snapshot.formula_id);
      if (saved) matchedFormula = saved;
    }
    
    const requiredVars = matchedFormula?.input_variables || [];
    
    return editFormConfig.input_field_mappings
      .filter(mapping => requiredVars.includes(mapping.variable))
      .map(mapping => ({
        variable: mapping.variable,
        label: mapping.label || mapping.variable,
        type: mapping.field_type || 'number',
        expectedUnit: mapping.expected_unit,
        allowedUnits: mapping.allowed_units || [],
        isOverride: mapping.is_override || false,
        options: mapping.options || [],
        placeholder: mapping.placeholder,
        tooltip: mapping.tooltip,
      }));
  }, [editFormConfig, snapshot.formula_id]);
  
  // Compute categories for selected scope
  const getCategoriesForScope = useMemo(() => {
    const scope = snapshot.scope;
    const dynamicCategories = coreData.dynamicCategories || [];
    const fuelDb = coreData.fuelDatabase || [];
    const dynamicScopesData = coreData.dynamicScopes || [];
    
    if (scope === 'scope3') {
      const scope3 = dynamicScopesData.find(s => s.code === 'scope3');
      if (scope3) {
        return dynamicCategories
          .filter(c => c.scope_id === scope3.id)
          .map(c => c.name)
          .sort((a, b) => {
            const numA = parseInt(a.match(/C(\d+)/)?.[1] || '999');
            const numB = parseInt(b.match(/C(\d+)/)?.[1] || '999');
            return numA - numB;
          });
      }
    }
    
    // For scope1/scope2, use fuel database categories
    const fuelsForScope = fuelDb.filter(f => f.scope === scope);
    const cats = new Set();
    fuelsForScope.forEach(f => {
      if (f.categories?.length > 0) {
        f.categories.forEach(c => cats.add(c));
      } else if (f.category) {
        cats.add(f.category);
      }
    });
    return Array.from(cats).sort();
  }, [snapshot.scope, coreData.dynamicCategories, coreData.fuelDatabase, coreData.dynamicScopes]);
  
  // Compute fuels for selected category
  const getFuelsForCategory = useMemo(() => {
    const category = snapshot.category;
    const fuelDb = coreData.fuelDatabase || [];
    
    if (!category) return [];
    
    let fuels = fuelDb.filter(f => {
      const fuelCategories = f.categories?.length > 0 ? f.categories : (f.category ? [f.category] : []);
      return fuelCategories.includes(category) && f.scope === snapshot.scope;
    });
    
    // Ensure saved fuel is included
    if (snapshot.fuel_database_id && !fuels.some(f => f.id === snapshot.fuel_database_id)) {
      const savedFuel = fuelDb.find(f => f.id === snapshot.fuel_database_id);
      if (savedFuel) fuels = [savedFuel, ...fuels];
    }
    
    return fuels;
  }, [snapshot.category, snapshot.scope, snapshot.fuel_database_id, coreData.fuelDatabase]);
  
  // Selected fuel object
  const selectedFuel = useMemo(() => {
    const fuelDb = coreData.fuelDatabase || [];
    return fuelDb.find(f => f.id === snapshot.fuel_database_id) || null;
  }, [snapshot.fuel_database_id, coreData.fuelDatabase]);
  
  // Initialize form with snapshot data once core data AND form config are loaded
  useEffect(() => {
    if (!coreData.loading && !editFormConfigLoading && editFormConfig && !initialDataLoaded && snapshot && Object.keys(snapshot).length > 0) {
      // Get dynamic field values from snapshot
      const dfv = snapshot.inputs || snapshot.dynamic_field_values || {};
      
      // Directly set form data instead of using handleEdit (which opens dialog)
      editHook.setFormData({
        facility_id: snapshot.facility_id || '',
        scope: snapshot.scope || 'scope1',
        category: snapshot.category || '',
        sub_category: snapshot.sub_category || snapshot.fuel_type || '',
        fuel_id: snapshot.fuel_database_id || '',
        fuel_type: snapshot.fuel_type || '',
        quantity: dfv.qty?.value?.toString() || snapshot.quantity?.toString() || '',
        quantity_unit: dfv.qty?.unit || snapshot.quantity_unit || 'kg',
        source_of_information: snapshot.source_of_information || '',
        record_source: snapshot.record_source || '',
        notes: snapshot.notes || '',
        justification: snapshot.justification || '',
        evidence_url: snapshot.evidence_url || '',
        responsible_person: snapshot.responsible_person || '',
        responsible_person_designation: snapshot.responsible_person_designation || '',
        responsible_person_contact: snapshot.responsible_person_contact || '',
        calorific_value: dfv.cv?.value?.toString() || '',
        calorific_value_unit: dfv.cv?.unit || 'MJ/kg',
        calorific_value_justification: dfv.cv?.justification || '',
        density: dfv.density?.value?.toString() || '',
        density_justification: dfv.density?.justification || '',
        process_names: snapshot.process_descriptions?.length > 0 
          ? snapshot.process_descriptions 
          : [{ name: snapshot.process_names?.[0] || '', description: '' }],
        supplier_name: snapshot.supplier_name || dfv.supplier_name?.value || '',
        supplier_code: snapshot.supplier_code || dfv.supplier_code?.value || '',
        employee_name: snapshot.employee_name || dfv.employee_name?.value || '',
        employee_id: snapshot.employee_id || dfv.employee_id?.value || '',
        asset_name: snapshot.asset_name || dfv.asset_name?.value || '',
        from_location: snapshot.from_location || dfv.from_location?.value || '',
        to_location: snapshot.to_location || dfv.to_location?.value || '',
      });
      
      // Set the editing emission reference
      editHook.setEditingEmission({
        id: item.entity_id,
        ...snapshot
      });
      
      // Set dynamic field values directly
      editHook.setDynamicFieldValues(dfv);
      
      // Set Scope 3 state if applicable
      if (snapshot.scope === 'scope3' || (snapshot.scope === 'biogenic' && dfv.biogenic_scope_selection?.value === 'scope3')) {
        editHook.setScope3Method(snapshot.calculation_method_scope3 || dfv.calculation_method_scope3?.value || '');
        editHook.setScope3ActivityType(dfv.scope3_activity_type?.value || '');
        editHook.setScope3ActivityId(snapshot.scope3_ef_id || dfv.scope3_ef_id?.value || '');
        editHook.setScope3Subcategory(dfv.scope3_subcategory?.value || '');
        editHook.setTypeOfProduct(snapshot.type_of_product || dfv.type_of_product?.value || '');
        editHook.setScope3CustomActivity(snapshot.scope3_activity || dfv.scope3_activity?.value || '');
        editHook.setUseCustomActivity(dfv.use_custom_activity?.value || false);
      }
      
      // Set biogenic state if applicable
      if (snapshot.scope === 'biogenic') {
        editHook.setBiogenicScopeSelection(snapshot.biogenic_scope_selection || dfv.biogenic_scope_selection?.value || 'scope1');
      }
      
      // Set override states
      editHook.setOverrideCalorificValue(dfv.cv?.is_override || snapshot.has_custom_ef || false);
      editHook.setOverrideDensity(dfv.density?.is_override || false);
      
      // Set calculated emissions from existing outputs
      if (snapshot.outputs) {
        editHook.setCalculatedEmissions({
          co2Emissions: snapshot.outputs.co2?.value || 0,
          ch4Emissions: snapshot.outputs.ch4?.value || 0,
          n2oEmissions: snapshot.outputs.n2o?.value || 0,
          co2eEmissions: snapshot.outputs.co2e?.value || 0,
        });
      }
      
      // Store original values for comparison
      setOriginalValues({
        dynamicFieldValues: dfv,
        quantity: snapshot.quantity,
        has_custom_ef: snapshot.has_custom_ef,
        emission_factor: snapshot.emission_factor_used,
      });
      
      setInitialDataLoaded(true);
    }
  }, [coreData.loading, editFormConfigLoading, editFormConfig, initialDataLoaded, snapshot, item.entity_id]);
  
  // Track modifications
  const hasModifications = useMemo(() => {
    if (!originalValues || !initialDataLoaded) return false;
    
    // Compare dynamic field values
    const currentDFV = editHook.dynamicFieldValues || {};
    const origDFV = originalValues.dynamicFieldValues || {};
    
    for (const key of Object.keys(currentDFV)) {
      if (currentDFV[key]?.value !== origDFV[key]?.value) {
        return true;
      }
    }
    
    // Compare quantity
    if (editHook.formData?.quantity !== originalValues.quantity) {
      return true;
    }
    
    // Compare override state
    if (editHook.overrideCalorificValue !== (originalValues.has_custom_ef || false)) {
      return true;
    }
    
    return false;
  }, [editHook.dynamicFieldValues, editHook.formData, editHook.overrideCalorificValue, originalValues, initialDataLoaded]);
  
  // Build modification audit trail
  const getModificationAudit = useCallback(() => {
    if (!originalValues) return [];
    
    const modifications = [];
    const currentDFV = editHook.dynamicFieldValues || {};
    const origDFV = originalValues.dynamicFieldValues || {};
    
    for (const key of Object.keys(currentDFV)) {
      const oldVal = origDFV[key]?.value;
      const newVal = currentDFV[key]?.value;
      if (oldVal !== newVal) {
        modifications.push({
          field: key,
          old_value: oldVal,
          new_value: newVal,
          unit: currentDFV[key]?.unit
        });
      }
    }
    
    return modifications;
  }, [editHook.dynamicFieldValues, originalValues]);
  
  // Handle approve
  const handleApprove = async () => {
    setProcessing(true);
    try {
      const updatedData = hasModifications ? {
        inputs: editHook.dynamicFieldValues,
        emission_factor_override: editHook.overrideCalorificValue ? {
          enabled: true,
          value: editHook.formData?.calorific_value
        } : { enabled: false },
        calculated_emissions: {
          co2: editHook.effectiveCalculatedEmissions?.co2 || 0,
          ch4: editHook.effectiveCalculatedEmissions?.ch4 || 0,
          n2o: editHook.effectiveCalculatedEmissions?.n2o || 0,
          total: editHook.effectiveCalculatedEmissions?.total || 0,
        },
        approver_modifications: getModificationAudit()
      } : null;
      
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        { 
          action: 'approve', 
          comment: comment || (hasModifications ? 'Approved with modifications' : 'Approved'),
          updated_data: updatedData
        },
        { headers: getAuthHeader() }
      );
      
      toast.success(hasModifications ? 'Approved with modifications' : 'Approved');
      onApproved?.();
      onClose?.();
    } catch (e) {
      console.error('Approve error:', e);
      toast.error(e.response?.data?.detail || 'Failed to approve');
    }
    setProcessing(false);
  };
  
  // Handle reject
  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setProcessing(true);
    try {
      await axios.post(
        `${API}/api/approval-workflows/requests/${item._approval_request_id}/decide`,
        { action: 'reject', comment },
        { headers: getAuthHeader() }
      );
      toast.success('Rejected');
      onApproved?.();
      onClose?.();
    } catch (e) {
      console.error('Reject error:', e);
      toast.error(e.response?.data?.detail || 'Failed to reject');
    }
    setProcessing(false);
  };
  
  // Loading state - wait for core data AND form config
  if (coreData.loading || editFormConfigLoading || !initialDataLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">Loading form data...</span>
      </div>
    );
  }
  
  // Safety check: Ensure this component only handles emission_record entities
  // This check is placed after hooks to comply with React rules
  if (!item || item.entity_type !== 'emission_record') {
    return (
      <div className="p-6 text-center">
        <div className="text-amber-600 font-medium mb-2">Invalid Record Type</div>
        <p className="text-stone-500 text-sm mb-4">
          This component can only display emission records. 
          Received: {item?.entity_type || 'unknown'}
        </p>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    );
  }
  
  // Extract core data with defaults (hook spreads data at top level, not under .data)
  const facilities = coreData.facilities || [];
  const dynamicScopes = coreData.dynamicScopes || [];
  const centralizedUnits = coreData.centralizedUnits || [];
  const fuelDatabase = coreData.fuelDatabase || [];
  
  // Evidence files
  const evidenceFiles = snapshot.evidence_files || [];
  
  return (
    <div className="space-y-4" data-testid="emission-approval-wrapper">
      {/* Header */}
      <div className="bg-stone-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">
            {isUpdate ? 'Update Request' : 'New Submission'} - {snapshot.scope?.toUpperCase()}
          </h3>
          <div className="flex items-center gap-2">
            {hasModifications && (
              <Badge className="bg-violet-100 text-violet-700">Modified</Badge>
            )}
            <Badge variant={isUpdate ? 'secondary' : 'default'}>
              {requestType.toUpperCase()}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-stone-600">
          <span className="flex items-center gap-1">
            <User className="w-4 h-4" />
            {item.submitted_by_name || item.submitted_by_email}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {item.submitted_at && new Date(item.submitted_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      {/* Edit Form - Reusing the exact same form as emissions page */}
      <div className="border rounded-lg p-4 max-h-[500px] overflow-y-auto">
        <EmissionEditForm
          // Form state
          formData={editHook.formData}
          editingEmission={editHook.editingEmission}
          editFrequencyType={editHook.editFrequencyType}
          biogenicScopeSelection={editHook.biogenicScopeSelection}
          selectedCategory={editHook.selectedCategory}
          scope3Method={editHook.scope3Method}
          scope3ActivityType={editHook.scope3ActivityType}
          scope3Subcategory={editHook.scope3Subcategory}
          scope3ActivityId={editHook.scope3ActivityId}
          scope3CustomActivity={editHook.scope3CustomActivity}
          useCustomActivity={editHook.useCustomActivity}
          typeOfProduct={editHook.typeOfProduct}
          activitySearchTerm={editHook.activitySearchTerm}
          loadingScope3EF={false}
          loadingBiogenicCategories={false}
          editEmployees={editHook.editEmployees}
          editEmployeeMonthlyTotals={editHook.editEmployeeMonthlyTotals}
          editEmployeeYearlyTotal={editHook.editEmployeeYearlyTotal}
          isCalculatingEditEmployee={editHook.isCalculatingEmployee}
          isEditLoading={editHook.isEditLoading}
          editFormConfigLoading={editFormConfigLoading}
          dynamicInputFields={dynamicInputFields}
          dynamicFieldValues={editHook.dynamicFieldValues}
          existingEvidences={editHook.existingEvidences}
          overrideCalorificValue={editHook.overrideCalorificValue}
          overrideDensity={editHook.overrideDensity}
          overrideEmissionFactorHeat={editHook.overrideEmissionFactorHeat}
          overrideJustification={editHook.overrideJustification}
          effectiveCalculatedEmissions={editHook.effectiveCalculatedEmissions || calcEngine.outputs}
          isCalculating={calcEngine.isCalculating}
          isSaving={processing}
          
          // Setters
          setFormData={editHook.setFormData}
          setBiogenicScopeSelection={editHook.setBiogenicScopeSelection}
          setScope3Method={editHook.setScope3Method}
          setScope3ActivityType={editHook.setScope3ActivityType}
          setScope3ActivityId={editHook.setScope3ActivityId}
          setScope3Subcategory={editHook.setScope3Subcategory}
          setScope3CustomActivity={editHook.setScope3CustomActivity}
          setUseCustomActivity={editHook.setUseCustomActivity}
          setTypeOfProduct={editHook.setTypeOfProduct}
          setActivitySearchTerm={editHook.setActivitySearchTerm}
          setDynamicFieldValues={editHook.setDynamicFieldValues}
          setEditEmployees={editHook.setEditEmployees}
          setOverrideCalorificValue={editHook.setOverrideCalorificValue}
          setOverrideDensity={editHook.setOverrideDensity}
          setOverrideJustification={editHook.setOverrideJustification}
          
          // Core data - use extracted variables with defaults
          facilities={facilities}
          dynamicScopes={dynamicScopes}
          hasScope3Access={true}
          centralizedUnits={centralizedUnits}
          fuelDatabase={fuelDatabase}
          
          // Computed/derived - populated from coreData
          selectedFuel={selectedFuel}
          activeCategoryModule={null}
          isEditC7EmployeeCommuting={false}
          editActiveMonths={[]}
          ModuleDynamicFieldsRenderer={null}
          getCategoriesForScope={getCategoriesForScope}
          getFuelsForCategory={getFuelsForCategory}
          availableScope3Methods={[]}
          availableScope3ActivityTypes={[]}
          requiresSubcategory={false}
          availableSubcategories={[]}
          filteredScope3Activities={[]}
          availableQuantityUnits={selectedFuel?.allowed_units || centralizedUnits.map(u => u.symbol) || []}
          
          // Handlers - use no-ops for display-only fields
          handleSubmit={() => {}}
          handleFuelSelect={() => {}}
          handleCategorySelect={() => {}}
          markFormDirty={() => editHook.setIsFormDirty(true)}
          updateDynamicFieldValue={calcEngine.updateDynamicFieldValue || (() => {})}
          getMethodLabel={(m) => m}
          handleCalculateEditEmployeeMonth={() => {}}
          handleFileUpload={() => {}}
          handleRemoveEvidence={() => {}}
          handleDeleteExistingEvidence={() => {}}
          handleDeleteAllEvidences={() => {}}
          handleDialogChange={() => {}}
          getQuantityUnitFromEFUnit={() => ''}
          
          // Hide the submit button in the form (we have our own)
          hideSubmitButton={true}
          isApprovalMode={true}
        />
      </div>
      
      {/* Evidence Files */}
      {evidenceFiles.length > 0 && (
        <div className="border rounded-lg p-4">
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Evidence Files ({evidenceFiles.length})
          </h4>
          <div className="space-y-2">
            {evidenceFiles.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-stone-50 rounded">
                <span className="text-sm">{file.name || file.filename || `File ${idx + 1}`}</span>
                <a 
                  href={file.url || file.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Modification Summary */}
      {hasModifications && (
        <Alert className="bg-violet-50 border-violet-200">
          <AlertTriangle className="w-4 h-4 text-violet-600" />
          <AlertDescription>
            <div className="text-sm font-medium text-violet-800 mb-1">
              Your Modifications (will be recorded)
            </div>
            <div className="space-y-1">
              {getModificationAudit().map((mod, idx) => (
                <div key={idx} className="text-sm text-violet-700">
                  • <span className="capitalize">{mod.field.replace(/_/g, ' ')}</span>: {mod.old_value} → <span className="font-medium">{mod.new_value}</span> {mod.unit || ''}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Comment */}
      <div>
        <label className="text-sm font-medium">
          Comment {hasModifications ? '(describe your modifications)' : '(required for rejection)'}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={hasModifications ? "Explain your modifications..." : "Add a comment..."}
          className="mt-1 w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          data-testid="approval-comment"
        />
      </div>
      
      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={handleReject}
          disabled={processing}
          data-testid="reject-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
          Reject
        </Button>
        <Button
          onClick={handleApprove}
          disabled={processing}
          className={hasModifications ? "bg-violet-600 hover:bg-violet-700" : "bg-green-600 hover:bg-green-700"}
          data-testid="approve-btn"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {hasModifications ? 'Approve with Modifications' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
