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
  
  // Initialize form with snapshot data once core data is loaded
  useEffect(() => {
    if (!coreData.loading && !initialDataLoaded && snapshot) {
      // Build emission object from snapshot
      const emissionData = {
        id: item.entity_id,
        facility_id: snapshot.facility_id,
        scope: snapshot.scope,
        category: snapshot.category,
        sub_category: snapshot.sub_category,
        fuel_type: snapshot.fuel_type,
        reporting_period: snapshot.reporting_period,
        frequency_type: snapshot.frequency_type,
        quantity: snapshot.quantity,
        quantity_unit: snapshot.quantity_unit,
        notes: snapshot.notes,
        evidence_files: snapshot.evidence_files || [],
        dynamic_field_values: snapshot.inputs || snapshot.dynamic_field_values,
        outputs: snapshot.outputs,
        total_emissions: snapshot.total_emissions,
        co2_emissions: snapshot.co2_emissions,
        ch4_emissions: snapshot.ch4_emissions,
        n2o_emissions: snapshot.n2o_emissions,
        co2e_emissions: snapshot.co2e_emissions,
        is_custom_factor: snapshot.has_custom_ef,
        emission_factor: snapshot.emission_factor_used,
        category_id: snapshot.category_id,
        calculation_method_scope3: snapshot.calculation_method_scope3,
        scope3_activity: snapshot.scope3_activity,
        biogenic_scope_selection: snapshot.biogenic_scope_selection,
      };
      
      // Trigger the edit handler to populate form
      editHook.handleEdit(emissionData);
      
      // Store original values for comparison
      setOriginalValues({
        dynamicFieldValues: snapshot.inputs || snapshot.dynamic_field_values || {},
        quantity: snapshot.quantity,
        has_custom_ef: snapshot.has_custom_ef,
        emission_factor: snapshot.emission_factor_used,
      });
      
      setInitialDataLoaded(true);
    }
  }, [coreData.loading, initialDataLoaded, snapshot, item.entity_id, editHook]);
  
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
  
  // Loading state
  if (coreData.loading || !initialDataLoaded) {
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
          editFormConfigLoading={false}
          dynamicInputFields={calcEngine.dynamicInputFields || []}
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
          
          // Computed/derived - use defaults
          selectedFuel={null}
          activeCategoryModule={null}
          isEditC7EmployeeCommuting={false}
          editActiveMonths={[]}
          ModuleDynamicFieldsRenderer={null}
          getCategoriesForScope={() => []}
          getFuelsForCategory={() => []}
          availableScope3Methods={[]}
          availableScope3ActivityTypes={[]}
          requiresSubcategory={false}
          availableSubcategories={[]}
          filteredScope3Activities={[]}
          availableQuantityUnits={[]}
          
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
